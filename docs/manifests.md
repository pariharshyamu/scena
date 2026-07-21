# Manifests & markers

Two ways to *declare* worlds instead of coding them: JSON manifests for procedural scenes, and naming-convention markers for levels authored in Blender or any DCC tool.

## buildScene: a world from JSON

```js
import { buildScene } from 'scena3d';

const world = buildScene({
  seed: 18,
  palette: 'autumn',
  terrain: { size: 90, amplitude: 5 },
  water: { level: 0.25 },
  fog: 'haze',
  dayCycle: { dayLength: 120, timeOfDay: 0.42 },
  paths: [{ points: roadPoints, width: 2.2, loop: true }],
  village: { radius: 9, houses: 5 },
  scatters: [
    { density: 0.05, maxHeight: 3.6,
      items: [{ type: 'tree', weight: 4 }, { type: 'rock' }, { type: 'bush' }],
      lod: { distance: 34 } },
    { density: 0.12, items: [{ type: 'grass' }] },
  ],
}, scene);

game.onUpdate((t) => world.update(t.delta));
```

A `SceneManifest` is **plain data** — every field survives `JSON.parse(JSON.stringify(...))`. Store it, diff it, send it over the network, generate it from a level editor. `buildScene` compiles it into a live world and applies all the cross-feature wiring you'd otherwise do by hand:

- scatters stay **ashore** (when there's water), **off paths** and **out of the village** — override per scatter with `avoidWater` / `avoidPaths`
- the **village avoids water and roads** automatically
- village lamps and windows **feed the day cycle**
- scatter items get **LOD far variants for free** (trees → cones, grass vanishes) when a scatter opts into `lod`
- wind sways all vegetation unless `wind: false`

Child seeds derive deterministically from the manifest `seed` — one number reproduces the whole world. The returned `BuiltScene` exposes everything by name (`terrain`, `water`, `cycle`, `paths`, `village`, `scatters`), plus combined `obstacles`, the ground-truth `heightAt`, and one `update(dt)` that advances water, wind and the cycle.

Scatter item vocabulary: `tree`, `rock`, `bush`, `grass`, `crate`, `fence`, `lamp`.

## Markers from Blender

For hand-authored levels, name empties (or any nodes) by convention and export to glTF:

| Name | Becomes |
|---|---|
| `spawn_player`, `spawn_boss` | `markers.spawns.player`, `.boss` (world-space `Vector3`) |
| `route_patrol_0`, `route_patrol_1`, … | `markers.routes.patrol` — ordered waypoint array |
| `obstacle_statue` (scale = radius) | a steering obstacle `{ center, radius }` |
| `keepout_plaza` (scale = radius) | a scatter keep-out circle |

```js
const gltf = await new GLTFLoader().loadAsync('level.glb');
scene.add(gltf.scene);

const markers = extractMarkers(gltf.scene);
player.position.copy(markers.spawns.player);
guard.addBehavior(new FollowPath(new Path(markers.routes.patrol, true), 1.5));
scatter({ ...options, keepOut: markers.keepOut });
```

Positions are world-space (parent transforms applied), and Blender's `.001` duplicate suffixes are stripped automatically. The same conventions work on procedural content too — `extractMarkers` takes any `Object3D` tree.
