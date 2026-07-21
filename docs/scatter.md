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

## Determinism contract

Same options, same seed → byte-identical placements, frozen by FNV snapshot tests in the repo. Changing generator output intentionally requires a minor version bump. Build gameplay on top of it: two clients scattering with the same manifest get the same forest, so obstacles agree across the network without syncing a single mesh.
