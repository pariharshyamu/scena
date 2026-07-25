# Props & palettes

Every prop generator returns the same shape:

```js
interface Prop {
  object: Group;          // the visual, origin at ground level
  obstacleRadius: number; // steering footprint (0 = walk-through)
}
```

All are seeded (same seed → identical prop), flat-shaded low-poly, and themed by the palette you pass. Position the `object`, and when you need steering data call `collectObstacles(props)` to get world-space `{ center, radius }` circles.

## The prop catalogue

| Generator | Notes |
|---|---|
| `createTree({ seed, species, height })` | six species — see [Tree species](#tree-species) |
| `createRock({ seed, size })` | welded-jitter icosahedron, flattened base |
| `createBush({ seed })` | low foliage clumps |
| `createGrassTuft({ seed })` | crossed blades; `obstacleRadius` 0 (walk-through) |
| `createCrate({ seed, size, weathering })` | panel box with edge framing |
| `createFence({ seed, length, postSpacing })` | posts + crooked rails along local +x |
| `createLamp({ seed, light })` | glowing bulb; `light: true` adds a real `PointLight` |
| `createHouse({ seed, width, depth })` | walls, gabled roof, chimney, **emissive windows** |
| `createTower({ seed, height })` | wooden watchtower with platform and roof |
| `createWell({ seed })` | stone ring, posts, roof, bucket |
| `createRuin({ seed, size })` | crumbling walls with seeded gaps, tumbled blocks |
| `createStall({ seed, goods })` | market stall: striped awning, counter, stocked by trade — `'produce'` / `'pottery'` / `'bakery'` / `'textiles'` |
| `createStatue({ seed, figure, material })` | pedestal + figure: `'obelisk'` / `'figure'` / `'orb'` / `'bust'` / `'beast'`, in `'stone'` or `'bronze'` |
| `createBanner({ seed, style, pattern })` | waving cloth on a pole: `'flag'` / `'banner'` / `'pennant'`, heraldic device baked in; **self-animating** (no update call needed) |
| `createBrazier({ seed, light })` | metal fire-bowl on legs: shader flame, embers, glowing coals, flickering `PointLight`; **self-animating** |
| `createCampfire({ seed, light })` | stone ring + charred logs, shader flame, embers, flickering `PointLight`; **self-animating** |
| `createBunting({ seed, span, flags })` | festive pennants on a catenary cord between two poles, fluttering on the flag cloth-wave; **self-animating** |
| `createFountain({ seed, figure })` | tiered stone basin with animated `createWater` pools, a spouting centre statue and falling water; **self-animating** |
| `createCart({ seed, style, cargo })` | spoked-wheel `'cart'` (with shafts) or `'wagon'`, loaded with `'crates'`/`'barrels'`/`'sacks'`/`'hay'` |
| `createTable({ seed, style })` | `'round'` pedestal / long `'trestle'` / small `'desk'` |
| `createSeat({ seed, style })` | slat-back `'chair'` / long `'bench'` / three-legged `'stool'` |
| `createBed({ seed, size })` | post bed with quilt & pillow: `'single'` / `'double'` / stacked `'bunk'` |
| `createShelf({ seed, stock })` | tall shelf lined with seeded `'books'` / `'pottery'` / `'food'` / `'empty'` |
| `createChest({ seed, open })` | banded storage chest; `open` tilts the lid |
| `createCandle({ seed, style, light })` | `'single'` / standing `'candelabra'` / hanging `'chandelier'`; flickering glow free, `light: true` adds the real `PointLight` |
| `createRug({ seed, shape })` | woven `'round'` / `'square'` / `'runner'`; walk-through (`obstacleRadius` 0) |
| `createForge({ seed, light })` | smith's coal forge + anvil on a stump + quench barrel; coals glow & flicker, **self-animating** |
| `createOven({ seed })` | baker's stone dome oven, ember-lit mouth, peel leaning on it; **self-animating** |
| `createLoom({ seed })` | weaver's upright loom: warp threads, palette-dyed cloth on the frame |
| `createCounter({ seed })` | taverner's bar: paneled base, foot rail, mugs & jug on top |
| `createRailing({ seed, style, length })` | modern railing run: vertical `'bars'` / horizontal `'cable'` / frameless `'glass'` / laser-cut `'panel'` |
| `createModernWindow({ seed, style, mullions })` | framed glazing, `'fixed'` grid or `'sliding'` leaves; exposes its `pane` for the day cycle |
| `createGate({ seed, style, open, sliding })` | driveway gate between concrete pillars: `'slat'` / `'bars'` / `'panel'`; `setOpen(0..1)` swings or slides it |
| `createCladding({ seed, style })` | facade accent: teak `'slats'`, angled `'louvers'`, or a `'stone'` feature panel |
| `createPergola({ seed })` | teak posts, doubled beams, rafter slats; walk-through |
| `createPlanter({ seed, length })` | corten trough with low greenery |
| `createTreadmill({ seed, speed })` | gym treadmill with a genuinely **marching belt**; `setSpeed` drives it, a `run` slot stands the runner on the deck |
| `createGuitar({ seed, color })` | acoustic guitar sized to ANIMA's `GRIPS.guitar` — play it (strum loop) or lean it as décor |
| `createToilet({ seed })` / `createSink` / `createBathtub` | the ceramic bathroom set; toilet has a `sit` slot, the tub a `soak` slot (the sleep pose, reclined) |

## Vehicles

`createCar`, `createBike`, `createTractor` and `createTruck` are props with **running gear**: `vehicle.update(dt, { speed, steer })` spins every wheel radius-correctly, yaws the front wheels, twirls the steering wheel, cranks the bike's pedals and leans it into turns. GAMA output plugs straight in — speed from `agent.velocity.length()`, steer from the heading change. Each publishes GRIPS-conformant `slots` (`driver`/`passenger` with the `drive`/`sit` poses; the bike's `rider` uses `cycle`), so an ANIMA character drops into the seat and their hands land on the wheel by construction. See the **vehicles** example for the running gear lapping a court.

**Watercraft** ride the sea for real: `createBoat` (open motorboat, helm + passenger slots) and `createShip` (coastal ship — deckhouse, bridge, funnel, railed deck, a `drive`-posed helm) bind water with `craft.float(ocean.heightAt)`, then `update(dt)` samples bow/stern/beam and bobs, pitches and heels the hull on the Gerstner swell under it. See the **ocean** example — both craft ride the same waves the shader draws.

## Interaction slots

Props a character can *use* publish **`slots`** — `{ kind, anchor, pose, loop? }`, structurally identical to ANIMA's `InteractionSlot`, so they drop straight into `new Interaction(rig, loco).use(prop.slots[0])` with no cross-imports. Anchors are children of the prop (position the prop, the slot follows), at floor level, `+z` facing, pitched flat for lying poses. Today's slot carriers: **seats** (`sit` — benches seat two), **beds** (`sleep` — doubles and bunks sleep two), the **treadmill** (`run`: snap to the deck and drive `Locomotion` with `treadmill.speed`), the **toilet** (`sit`) and the **bathtub** (`soak`). Build your own with `createSlot(...)`.

The modern set (railing through planter) is themed by the [Tier-4 surfaces](surfaces.md#modern-machined) — brushed steel, powder-coat, teak, corten, concrete and `createGlass`. Window panes default to `nightGlow`, so a building listed in the day cycle's `lamps` lights its glazing at dusk; gate pillar lamps follow the same budget rule as street lamps.

The last seven are the **cottage furniture set** — meant for a [`createRoom` interior](settlement.md#interiors-createroom), though nothing stops a market square from having a bench. Candles follow the lamp rule (glow is free, real lights are a budget) and their flames flicker on their own; a chandelier's origin is its ceiling hook, so position it at ceiling height and it hangs.

Two prop behaviors worth knowing:

- **Lights are a budget.** Lamps and torches only create real `PointLight`s when asked (`light: true`, `torchLights: n`) — glowing emissive bulbs are free, real lights are not.
- **Houses plug into the day cycle.** Window materials are emissive at the intensity `createDayCycle` scans for, so passing a house in the cycle's `lamps` list makes its windows ignite at dusk. No extra API.

## Manipulables

Interaction slots let a character *use* a prop; **manipulables** let a prop *react*. `createDoor`, `createDrawer`, `createLever`, `createValve`, `createHatch` and `createPortcullis` carry a **state** you actuate, and animate a joint in response — swing, slide, throw, spin, hinge, rise:

```ts
const door = createDoor();               // a framed swing door (double: for a gateway)
door.toggle();                           // flip open ↔ closed
door.onChange = (open) => chime(open);   // fires when the target flips
game.onUpdate((t) => door.update(t.delta));  // eases the joint toward the target
```

`state` is the live eased position (0 = closed/rest, 1 = open/actuated); `open` is the boolean target; `set(0.5 | true | false)` drives it to a partial or full target. The shape is **structurally identical to GAMA's `Mechanism`**, so GAMA's `Interactable` (walk-up + press to operate, or an automatic door), `Trigger` (pressure plates) and `linkMechanism` (a lever that raises a portcullis) drive them with no cross-imports. The work stations — lever, valve, drawer, hatch — publish an `operate` slot (ANIMA's floor-level anchor) so a character stands at them; doors and portcullises are pass-through. Pair with ANIMA's `Gesture` + `createReachClip` so the hand and the mechanism move together. See the **manipulables** example: a keeper throws a lever, the linked portcullis rises, an automatic door opens on approach, and a chest is opened.

## Carryables

Manipulables react in place; **carryables** get picked up and hauled. `createCrate`, `createBarrel`, `createBasket`, `createSack` and `createLantern` return a `Carryable` — a `Prop` plus a `carry` style and a hold-point `grip` — structurally identical to ANIMA's `Holdable`, so they drop into `new Carry(rig, loco).pickUp(createBarrel())` with no cross-imports:

```ts
const carry = new Carry(rig, loco);
carry.pickUp(createCrate());   // hoisted to the chest, carried while walking
carry.putDown({ at: cart });   // set it down — or hand to GAMA's throwObject
```

Four **carry styles** map a thing to a pose: `crate` (hugged to the chest — crates, barrels), `tray` (out at the belly), `shoulder` (hoisted up — sacks), and `side` (hanging from one hand — baskets, lanterns; the free arm keeps swinging). Origins sit at the base so carryables also **place on the ground** like any prop; `grip` offsets the *hold point* into the body so the hands land right — the GRIPS idea again, no runtime IK. The lantern's glass is emissive (free glow; add a real light with the lamp budget). See the **carryables** example — a porter loads a crate onto a cart and hands off a sack.

## Work stations

Stations built to be *worked over time*, producing something. `createChoppingBlock`, `createOreVein`, `createCookpot` and `createSawhorse` are `WorkStation`s: a `work` slot, a held **tool**, a particle burst (chips / sparks+dust / steam / sawdust), a `progress` (0→1) and an `onYield` that fires once per cycle. Drive it each frame:

```ts
const block = createChoppingBlock();
attach(rig, 'handRight', block.tool);                            // ANIMA holds the axe
const swing = loco.overlay(createLoopClip(rig, block.action));   // the chop, layered over idle
block.onYield = () => stock.add('wood');                         // GAMA counts the logs
game.onUpdate((t) => block.update(t.delta, working));            // effects + progress + yield
```

`action` is the ANIMA loop the worker plays — `chop`, `mine`, `saw`, `stir` — layered over the **idle** stance so the loop owns the arms (don't fight it with a held pose). `update(dt, working)` only advances (and throws its burst, and yields) while `working`, so `progress` and the effects gate on the worker actually being there. Wire `onYield` into GAMA's `Stockpile` and a HUD to close the gathering loop. See the **work stations** example — one worker chops, mines, saws and stirs a full round.

## Gatherings

Work stations serve one worker. **Gatherings** serve several people at once — `createDiningTable`, `createPicnicTable`, `createLongBench`, `createGameTable` and `createCampCircle` return a `Gathering`: a `Prop` plus **`seats`** (its slots, in a stable order) and a **`focus`** (what the occupants attend to).

```ts
const table = createDiningTable({ seats: 6, style: 'round' });
const seating = new Occupancy(table.seats);       // GAMA decides who sits where
agent.moveTo(seat.approach ?? seat.anchor);       // walk to the spot BESIDE it
interaction.use(seat);                            // ANIMA stages the sit
gaze.target = table.focus;                        // …and the group has a centre
```

Three details carry more weight here than the geometry does:

- **`focus` is what makes a group a group.** Point every sitter's gaze at it — or hand it to ANIMA's `Conversation` — and a row of adjacent bodies becomes company. Without it they are strangers who happen to be near one another. It is the shared dish, the board, the fire, or (for a bench) the view.
- **Every seat has an `approach`.** A slot's `approach` anchor stands a pace off the seat, on the side that is *open*: behind a dining chair (the table blocks the front), in front of a park bench (the backrest blocks the rear). Characters walk *there*, then turn and lower — nobody materialises into a chair. `addApproach(slot, parent, distance, from)` adds one to slots of your own; get the side wrong and characters walk through the furniture to reach their seats.
- **Nothing is square.** Every chair is nudged off its ideal angle and pushed back a different amount, and the seat slot inherits that crookedness, so the sitters land crooked too. One seeded radian of it does more for a dining room than another thousand triangles — real chairs are never quite where they were left.

`createGameTable` takes `game: 'chess' | 'cards' | 'dice'` and always seats exactly two, facing each other across the board (the chess set is laid out mid-game, with losses). `createCampCircle` rings a fire pit with felled logs — gappy and uneven, because a ring of seats never closes — and its `focus` is already aimed where the flames go, so a `createCampfire` at the origin completes it. See the **gatherings** example.

## Tree species

`createTree` builds thirteen seeded species, each with its own silhouette, colour, wind response and steering footprint — all from the same low-poly primitives, so a mixed wood still batches cheaply.

| `species` | Silhouette | In the wind | `obstacleRadius` |
|---|---|---|---|
| `pine` | stacked cones | medium | 0.5 |
| `oak` | blob canopy on a forked trunk | medium | 0.6 |
| `cypress` | tall narrow flame, deep green | barely moves (stiff) | 0.35 |
| `birch` | slender, high crown, pale banded bark | light & whippy | 0.32 |
| `cedar` | broad flat horizontal tiers | stiff | 0.75 |
| `maple` | full rounded dome | medium | 0.65 |
| `sakura` | wide blossom umbrella | springy | 0.7 |
| `palm` | curved bare stem, drooping fronds | whippy fronds | 0.4 |
| `willow` | rounded crown, veil of swaying strands | very whippy | 0.7 |
| `sequoia` | colossal buttressed redwood + high conical crown | near-rigid | height × 0.06 |
| `banyan` | vast crown on a curtain of aerial prop-roots | stiff | height × 0.3 |
| `baobab` | fat bottle trunk, sparse high crown | stiff | height × 0.16 |
| `acacia` | thin trunk, broad flat umbrella | medium | 0.5 |

The four **giants** (`sequoia`, `banyan`, `baobab`, `acacia`) are big and few — a sequoia stands `22–32` units tall and towers over an ordinary wood — so their **`obstacleRadius` scales with height**, giving agent steering an honest footprint. Place them sparingly. For a *dense* stand of them, pair each with a [billboard impostor](scatter.md#billboard-impostors-for-giant-forests) via `treeLOD` — full geometry up close, a single camera-facing quad at range — so thousands of giants stay a few draw calls.

```js
import { createTree, TREE_SPECIES, PALETTES } from 'scena3d';

const avenue = createTree({ species: 'cypress', seed: 7 });     // for a formal row
const blaze  = createTree({ species: 'maple', palette: PALETTES.autumn }); // goes orange
const bloom  = createTree({ species: 'sakura', season: 'spring' });        // pink blossom
```

### Seasons

`season` dresses a **sakura**: `'spring'` blossoms pink, `'summer'` leafs green, `'autumn'` turns warm, and `'winter'` strips it bare to its branches. (Other species accept `season` and currently ignore it — the hook is there to grow.)

For falling **blossom or leaves**, the [precipitation](precipitation.md) system has a `'petal'` type — fluttering, spinning, blossom-pink points that reuse the whole GPU particle path. Drop one over a grove and the cherries shed:

```js
import { createPrecipitation } from 'scena3d';
scene.add(createPrecipitation({ type: 'petal', wind }).object);   // or tint it autumn-orange for leaf-fall
```

### Biomes

`treeBiome(name, options)` returns a **weighted species mix** ready to drop into `scatter({ items })`, so a whole wood takes on a character in one word:

```js
import { scatter, treeBiome } from 'scena3d';
scatter({ items: treeBiome('tropical', { palette }), area, density: 0.02 });
```

| `TreeBiome` | Mix |
|---|---|
| `temperate` | oak, pine, birch, maple |
| `boreal` | pine, cedar, birch |
| `mediterranean` | cypress, oak, pine |
| `tropical` | palm, banyan |
| `savanna` | acacia, baobab |
| `redwood` | sequoia towering over pine & cedar |
| `grove` | sakura |
| `wetland` | willow, birch |

`TREE_BIOMES` is the raw table (each biome's `{ species, weight }[]`), and `TREE_SPECIES` lists every species — either is a good base for a custom mix or a picker.

Three things make the species system safe to adopt:

- **Existing forests are untouched.** With no `species`, `createTree` still returns the familiar seeded pine/oak mix — new species are strictly opt-in. (The old `style` option is kept as an alias.)
- **Palettes still theme them.** Each species tints *from* the palette — a `cypress` is a deep version of the palette's green, a `maple` under `PALETTES.autumn` blazes orange — so a whole wood restyles by swapping one palette.
- **They mix in `scatter` and steer in GAMA.** Pass several species as `items` and a wood grows varied in one call; each carries its own `obstacleRadius`, so a narrow cypress and a broad cedar present honest footprints to agent steering.

`TREE_SPECIES` is the list of all species — handy for scattering the full set or building a picker. Only the canopy sways in the [wind](wind.md); the trunk stays planted, and a `cypress` holds nearly still while a `birch` whips — that's the per-species stiffness at work.

## Palettes

```js
import { PALETTES } from 'scena3d';
PALETTES.meadow   // greens, blue sky, terracotta roofs
PALETTES.autumn   // oranges, hazy warm light
PALETTES.dusk     // desaturated purples, sodium lamp glow
PALETTES.winter   // snow grass bands, pale sky
```

A `Palette` covers foliage, trunk, rock, wood, metal, lamp glow, grass/cliff/peak terrain bands, sky, fog, water, sand, path, wall and roof colors. Every generator takes `palette`; build a whole scene with one palette and it looks like a matched set. Define your own by satisfying the interface — the type is exported.

Seeding tip: inside `scatter` items you receive a forked `Rng`; use `rng.int(1, 1e9)` as the child seed so variants differ but stay deterministic.

## Ladders & tack

Two props that exist to be *met* by an ANIMA character.

**`createLadder`** publishes `bottom`, `top` and `rungSpacing` — structurally ANIMA's `Climbable`, so it drops into `new Climb(rig, loco).start(ladder)` with no cross-import. `rungSpacing` is the contract that matters: ANIMA drives the body up by exactly that much per half-cycle of the climb loop, so hands land on rungs instead of sliding past them. Three styles: `wooden` (slightly crooked rungs), `steel` (round rails on wall brackets) and `rope` (sagging, uneven).

**`createSaddle`** and **`createBridle`** are built to the fixtures `createQuadruped` already carries:

```js
const horse = createQuadruped({ coat: 'bay' });          // ANIMA
horse.saddle.add(createSaddle({ horseHeight: horse.height }).object);
horse.bones.Head.add(createBridle({ horseHeight: horse.height }).object);
```

The stirrups hang where the rider's foot goes and the reins run forward to the bit — so ANIMA's ride pose (heels down, hands forward) and the tack meet by construction rather than by fiddling. `english`, `western` (with the horn) and a `bareback` pad.

## Screens & electronics

An interior at night used to be black, because every light source in the kit was a fire. Screens fix that, and they are the thing that makes a room read as *now* rather than as a period set.

```ts
const tv = createTelevision({ diagonal: 1.4, mount: 'stand', mode: 'video' });
scene.add(tv.object);
const glow = createScreenLight(tv.screen);
game.onUpdate((t) => { tv.screen.update(t.delta); glow.update(); });
```

`createMonitor`, `createTelevision`, `createLaptop` (with a hinged `open` lid), `createSmartDisplay`, and `createTablet` — which is a `Carryable` that happens to have a screen, so pick-up, carry, put-down and hand-off already work on it with nothing added.

### The content is drawn, not fetched

`createScreenPanel(width, height, { mode })` builds the material. Nine modes — `off`, `standby`, `home`, `feed`, `video`, `map`, `chart`, `call`, `keypad` — drawn procedurally in the fragment shader from the panel's UVs, the same way `createSurface` draws brick.

Deliberately **not text**. A phone is a few pixels across at conversational distance; what you need is the *impression* of an interface — rows, tiles, a route line, a scrubbing bar — not readable content. Real glyphs would cost thousands of triangles for something illegible.

Content is written into emissive radiance rather than `material.emissive`, so the day/night cycle cannot dim a screen. A monitor at midnight is as bright as one at noon, which is the whole reason anyone notices screens at night. And `off` is not black: it is a dark mirror.

### Why the light is a spotlight

`createScreenLight` returns a **`SpotLight`**, wide and fully soft, aimed along the panel normal. This is not a detail.

A screen emits from its front face only. A `PointLight` — which is what this had first — radiates in every direction, so it lights the wall the television is standing against 1.4 m away five times harder than the person watching it 3.2 m away. The render came out as a bright halo behind the set with the viewer sitting in shadow: exactly backwards, and invisible to every numeric check, because the light *was* on and *was* the right colour.

Emission scales with panel **area**, not diagonal — a 55" set puts out roughly twenty times a tablet, where a diagonal-based figure makes it about twice.

Lights stay a budget, as everywhere else here: this is opt-in per panel. A room of monitors should light one or two faces and let the rest carry on their emissive alone.

### A television, not a blue lamp

`panel.glow` publishes the colour and level of what is being drawn *right now*, so a light that copies it flickers in time with the picture's own cuts.

The shot list is deliberately uneven — cuts run 0.55–4 s, because a fixed cut length reads as a strobe and the room lighting gives it away long before the picture does. The CPU pushes each shot's colour and level into the shader as uniforms rather than letting the shader pick its own, so the light and the picture cannot drift apart: they are the same event.

### Phones and watches

`createPhone` is portrait — about 19.5:9 the tall way, because a 16:9 landscape panel scaled down reads as a tiny television. `createSmartwatch` is the smallest thing the system draws, and a useful proof that one content shader covers a 55" set and a 40 mm watch face.

A phone is a `Carryable` with a `Screen`. Pick-up, carry, put-down and hand-off already work on it: handing someone your phone to show them a photo needs no new verb, it is `handTo`.

## Terminals

The first props here that a character cannot simply walk up to and use: somebody may already be at it. So besides the usual slot, `createTerminal` publishes a **line** — an anchor at the head of the queue, with the queue running back along its local -z.

```ts
const atm = createTerminal({ style: 'atm' });
const at = atm.line.localToWorld(new Vector3(0, 0, -queue.distanceOf(person)));
```

That pairing is the whole handshake: SCENA says where the line is, GAMA's `Queue` says who is where along it, neither imports the other. `atm`, `kiosk` and `vending`, each with a `Screen` (an ATM defaults to the keypad mode) and a stocked-by-seed cabinet in the vending case.

One thing worth stealing: the casing is **light grey**. It started near-black, which looked fine as a colour swatch and rendered outdoors as a featureless black slab — none of the hood, shelf or slots that say "cash machine" survived. Public machines are pale precisely so they read at a glance from across a concourse.
