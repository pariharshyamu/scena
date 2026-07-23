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

Two prop behaviors worth knowing:

- **Lights are a budget.** Lamps and torches only create real `PointLight`s when asked (`light: true`, `torchLights: n`) — glowing emissive bulbs are free, real lights are not.
- **Houses plug into the day cycle.** Window materials are emissive at the intensity `createDayCycle` scans for, so passing a house in the cycle's `lamps` list makes its windows ignite at dusk. No extra API.

## Tree species

`createTree` builds nine seeded species, each with its own silhouette, colour, wind response and steering footprint — all from the same low-poly primitives, so a mixed wood still batches cheaply.

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
