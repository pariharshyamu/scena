# Scattering & LOD

`scatter()` turns "empty terrain" into "populated world" in one call, and it's built for scale: every placement of every variant renders through `InstancedMesh` — a few draw calls for thousands of props.

## Scatter in one call

```js
const forest = scatter({
  seed: 21,
  area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
  surface: terrain.heightAt,     // or a flat number
  density: 0.05,                 // props per square unit (or use count)
  minSpacing: 1.5,
  items: [
    { create: (rng) => createTree({ seed: rng.int(1, 1e9), palette }), weight: 4, variants: 6 },
    { create: (rng) => createRock({ seed: rng.int(1, 1e9), palette }) },
  ],
  mask: (x, z, y) => y < 3.6 && dryLand(x, z),
  keepOut: [...road.keepOut, ...village.keepOut],
});
scene.add(forest.group);
```

Placement logic, in order:

1. **Density noise** thins candidates into natural clumps and clearings (`clumpScale` sets the feature size) — no uniform confetti.
2. **Keep-out circles** reject anything on roads, in villages, around spawns.
3. **A spatial hash** enforces `minSpacing` between any two placements.
4. **Your mask** vetoes by position and ground height (shorelines, peaks).

Each item gets `variants` distinct look-alikes (visual variety, still instanced) and a per-instance `scale` range. The result reports `placements` (position/rotation/scale/item), world-space `obstacles` for steering, and `count`.

## LOD tiles

For big areas, opt into tile-based level-of-detail:

```js
const forest = scatter({
  // ...same as above...
  items: [{
    create: (rng) => createTree({ seed: rng.int(1, 1e9), palette }),
    createFar: (rng) => makeSingleCone(rng),   // cheap far stand-in
  }],
  lod: { distance: 30, tileSize: 16 },
});
game.onUpdate(() => forest.update(camera));
```

Placements bucket into `tileSize` squares; tiles beyond `distance` from the camera swap full-detail instances for each item's `createFar` variant, with 10% hysteresis so tiles never flicker at the boundary. Items without `createFar` stay full-detail everywhere; a `createFar` that returns an empty group makes props (like grass) simply vanish at range.

Placements are **identical** with or without `lod` — determinism and the seed-stability snapshots are unaffected.

## Billboard impostors for giant forests

Writing a `createFar` by hand is fine, but for trees there's a ready-made stand-in: `createImpostor` builds a single **camera-facing billboard** whose species silhouette is carved in the shader — no texture. `treeLOD(species, options)` pairs a full [`createTree`](props.md#tree-species) with its impostor as a drop-in scatter item, so a *dense forest of giants* — thousands of sequoias — keeps full geometry where you can walk up to it and collapses to a handful of billboard draw calls past the swap distance:

```js
import { scatter, treeLOD, createTerrain } from 'scena3d';

const forest = scatter({
  area: { min: { x: -140, z: -140 }, max: { x: 140, z: 140 } },
  surface: terrain.heightAt, density: 0.02, minSpacing: 6,
  items: [
    treeLOD('sequoia', { palette, weight: 2 }),   // towering redwoods
    treeLOD('pine', { palette, weight: 4 }),
    treeLOD('cypress', { palette, weight: 2 }),
  ],
  lod: { distance: 90, tileSize: 28 },
});
scene.add(forest.group);
game.onUpdate(() => forest.update(camera));
```

The impostor is one quad, expanded around the instance's world origin in the vertex shader using the camera's right axis and world up — cylindrical, so it always faces you but stays upright — and it honours each placement's scale. It's unlit `MeshBasicMaterial` with a baked vertical gradient and three's fog, so distant trees sit into the haze correctly. Six silhouette families cover the catalogue: `conifer` (sequoia, pine), `round` (oak, banyan), `column` (cypress), `umbrella` (acacia), `bottle` (baobab).

`createImpostor({ species, palette })` is usable on its own for a hand-placed far tree, and it carries the same **height-scaled `obstacleRadius`** as the species it imitates, so a near/far mixed wood presents an honest steering footprint to [GAMA](handshake.md) either way.

## Determinism contract

Same options, same seed → byte-identical placements, frozen by FNV snapshot tests in the repo. Changing generator output intentionally requires a minor version bump. Build gameplay on top of it: two clients scattering with the same manifest get the same forest, so obstacles agree across the network without syncing a single mesh.
