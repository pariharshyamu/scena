# Luminous props & the light budget

Forward-rendered WebGL affords a handful of real dynamic lights before
mobile GPUs weep — and a street wants twenty lamps. This module is the
resolution: every luminous prop glows cheaply *always*, claims a real
light it may or may not be granted, and a small budget spends the real
ones where the camera is looking.

## The three faces of a fixture

Every fixture in the kit has a **body** (the mesh), a **glow** (an
emissive bulb plus an additive halo sprite — visible from across the
map, costs nothing), and a **claim**:

```ts
const lamp = createStreetLight({ style: 'modern' });
scene.add(lamp.object);
budget.register(lamp.claim);   // { anchor, color, intensity, radius, priority, isLit }
lamp.setLit(false);            // darkens the prop AND frees its budget slot
```

The claim's `isLit` closes over the fixture's own state, so dousing a
lamp needs no unregistering — the budget notices by itself. `setLit` is
deliberately the verb-shape a GAMA `linkMechanism` boolean drives: a
lever wired to a lamp is a lighting puzzle with no imports between the
libraries.

## createLightBudget

```ts
const budget = createLightBudget({ max: 6 });
scene.add(budget.group);
for (const f of fixtures) budget.register(f.claim);
// per frame:
budget.update(camera.position);
```

The budget owns a pool of `max` PointLights. Each update it scores every
lit claim — priority over distance to the viewpoint — and grants the
pool to the best. Granting is **hysteretic**: an incumbent keeps its
light until a challenger clearly outscores it (default ratio 1.35), and
a kept claim keeps the *same* PointLight instance, so panning the camera
never strobes lights between owners. Everything ungranted still glows —
bulb and halo — it just doesn't cast.

## The kit

- **`createStreetLight`** — `village` (dark post, lantern cage, warm
  mantle) or `modern` (slim pole craning a cool flat head over the road).
- **`createLanternLight`** — the small warm one; `hanging` puts the hook
  at the origin for porches, posts and stalls.
- **`createNeonSign(text)`** — the vector font's glyph strokes
  re-materialized as glowing tube runs over a dark backboard. One seeded
  letter *buzzes*, dipping and reigniting on its own nervous rhythm in
  `update(dt)` — every real neon sign has one.
- **`createStringLights`** — a sagging festoon of per-instance-colored
  bulbs strung between any two points; `update(dt)` makes them breathe
  out of phase.
- **`createRevolvingBeacon`** — the lighthouse move at any scale: two
  opposed additive beam cones sweeping with the head. The volumetric
  look is just geometry.

Fixtures with motion expose `update(dt)`; a doused fixture's motion
stops (a dark beacon does not turn).

## createPhotocell — why streets ripple alight

```ts
const cycle = createDayCycle({ sky, rig, scene });
const cell = createPhotocell(cycle, fixtures, { seed: 9, spread: 4 });
// per frame: cycle.update(dt); cell.update(dt);
```

Watches anything with a `sunElevation` (a `DayCycle`, structurally) and
flips each fixture's `setLit` at dusk and dawn — each after its own
seeded delay within `spread`, so the street ripples alight lamp by lamp
instead of blinking on as one. The thresholds are hysteretic: a sun
grazing the horizon can't make the street flap.

## The dusk playground

The `dusk` example puts thirteen claims against six real lights on a
main street at nightfall: the day cycle drops the sun, the photocell
trips, street lamps ripple on, the neon buzzes its bad letter, window
panes warm (bungalow `nightGlow` panes fed to the cycle), and the
budget's six lights follow the dollying camera — `duskDebug()` reports
`granted` pinned at 6 while `lit` climbs to 13.
