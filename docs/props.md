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

## Interaction slots

Props a character can *use* publish **`slots`** — `{ kind, anchor, pose, loop? }`, structurally identical to ANIMA's `InteractionSlot`, so they drop straight into `new Interaction(rig, loco).use(prop.slots[0])` with no cross-imports. Anchors are children of the prop (position the prop, the slot follows), at floor level, `+z` facing, pitched flat for lying poses. Today's slot carriers: **seats** (`sit` — benches seat two), **beds** (`sleep` — doubles and bunks sleep two), the **treadmill** (`run`: snap to the deck and drive `Locomotion` with `treadmill.speed`), the **toilet** (`sit`) and the **bathtub** (`soak`). Build your own with `createSlot(...)`.

The modern set (railing through planter) is themed by the [Tier-4 surfaces](surfaces.md#modern-machined) — brushed steel, powder-coat, teak, corten, concrete and `createGlass`. Window panes default to `nightGlow`, so a building listed in the day cycle's `lamps` lights its glazing at dusk; gate pillar lamps follow the same budget rule as street lamps.

The last seven are the **cottage furniture set** — meant for a [`createRoom` interior](settlement.md#interiors-createroom), though nothing stops a market square from having a bench. Candles follow the lamp rule (glow is free, real lights are a budget) and their flames flicker on their own; a chandelier's origin is its ceiling hook, so position it at ceiling height and it hangs.

Two prop behaviors worth knowing:

- **Lights are a budget.** Lamps and torches only create real `PointLight`s when asked (`light: true`, `torchLights: n`) — glowing emissive bulbs are free, real lights are not.
- **Houses plug into the day cycle.** Window materials are emissive at the intensity `createDayCycle` scans for, so passing a house in the cycle's `lamps` list makes its windows ignite at dusk. No extra API.

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
