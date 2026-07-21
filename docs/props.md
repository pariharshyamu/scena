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
| `createTree({ seed, style, height })` | `'pine'` cone-stacks or `'oak'` blob canopies |
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

Two prop behaviors worth knowing:

- **Lights are a budget.** Lamps and torches only create real `PointLight`s when asked (`light: true`, `torchLights: n`) — glowing emissive bulbs are free, real lights are not.
- **Houses plug into the day cycle.** Window materials are emissive at the intensity `createDayCycle` scans for, so passing a house in the cycle's `lamps` list makes its windows ignite at dusk. No extra API.

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
