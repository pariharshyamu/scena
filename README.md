# SCENA — SCenes & ENvironment Assets

**SCENA** is a 3D world-building library on top of [three.js](https://threejs.org): seeded procedural props, terrain, sky, lighting and scattering — with **gameplay metadata** (steering obstacles, exact height queries) that game libraries like [GAMA](https://github.com/pariharshyamu/gama) understand.

three.js renders. GAMA makes it a game. **SCENA gives it a world.**

## Principles

- **Seeded determinism.** Same seed, same tree — forests are reproducible, diffable and network-syncable. `Math.random` appears nowhere in the library.
- **Playable before assets exist.** Every generator produces a coherent flat-shaded low-poly visual out of the box; real models come later, if ever.
- **Props know their gameplay.** A tree isn't just a mesh — it reports its obstacle footprint. `scatter()` returns world-space obstacles that plug straight into GAMA's `ObstacleAvoidance`; the terrain exposes its exact height function for spawning, ground-clamping and navmesh baking.
- **A matched set.** One palette system (`meadow`, `autumn`, `dusk`) themes every prop, the terrain bands, the sky and the fog together.

## Install

```bash
npm install scena3d three
```

## A world in ten lines

```ts
import { createTerrain, createSky, createLightingRig, applyFog,
         createTree, createRock, scatter, PALETTES } from 'scena3d';

const terrain = createTerrain({ seed: 20, size: 90, amplitude: 5 });
scene.add(terrain.mesh, createSky().mesh, createLightingRig('golden-hour').group);
applyFog(scene, 'haze');

const forest = scatter({
  seed: 21,
  area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
  surface: terrain.heightAt,           // exact — never disagrees with the mesh
  density: 0.05,
  items: [
    { create: (rng) => createTree({ seed: rng.int(1, 1e9) }), weight: 4 },
    { create: (rng) => createRock({ seed: rng.int(1, 1e9) }) },
  ],
  mask: (_x, _z, y) => y < 3.6,        // keep the peaks bare
  keepOut: [{ center: { x: 0, z: 0 }, radius: 9 }],  // the camp clearing
});
scene.add(forest.group);               // InstancedMeshes — a few draw calls
```

## The GAMA handshake

```ts
import { MotionAgent, ObstacleAvoidance, FollowPath } from 'gama3d';

agent.addBehavior(new FollowPath(patrolPath, 1.5));
agent.addBehavior(new ObstacleAvoidance(() => forest.obstacles), 2.5); // ← SCENA metadata
game.onUpdate(() => {                                                  // ← SCENA ground truth
  agent.owner.position.y = terrain.heightAt(agent.position.x, agent.position.z);
});
```

Neither library imports the other — the obstacle shape (`{ center, radius }`) is structural. Run the full demo (`npm run dev` — gama3d comes from npm): a day-night cycle over terrain, lakes, a windblown forest, a seeded hamlet whose windows ignite at dusk, and a dirt road whose single authored curve is at once the visual ribbon, the scatter keep-out, and the wardens' patrol route. Append `?t=0.85` to freeze the time of day.

## A world as JSON

Everything above can also be declared instead of coded — a `SceneManifest` is plain data (store it, diff it, send it over the network), and `buildScene` applies all the cross-feature wiring automatically: scatters stay ashore, off roads and out of the village; the village avoids water and paths; its lamps and windows feed the day cycle.

```ts
const world = buildScene({
  seed: 18,
  palette: 'autumn',
  terrain: { size: 90, amplitude: 5 },
  water: { level: 0.25 },
  dayCycle: { dayLength: 120 },
  paths: [{ points: roadPoints, loop: true }],
  village: { radius: 9, houses: 5 },
  scatters: [{ density: 0.05, items: [{ type: 'tree', weight: 4 }, { type: 'rock' }],
               lod: { distance: 34 } }],   // far tiles collapse to cones
}, scene);
game.onUpdate((t) => world.update(t.delta));
```

Run it: `npm run dev:manifest`. For handcrafted interiors there are kits — `assembleKit(['####', '#.S#', '#..D', '####'])` turns an ASCII map into snapped walls, floors, doorways, torches, spawn points and obstacles. And for levels authored in Blender/glTF, `extractMarkers(gltf.scene)` reads `spawn_*` / `route_*_0` / `obstacle_*` / `keepout_*` empties into spawns, ordered patrol routes and steering/scatter metadata.

## API

| Area | Exports |
|---|---|
| Props | `createTree`, `createRock`, `createCrate`, `createFence`, `createLamp`, `createBush`, `createGrassTuft`, `createHouse`, `createTower`, `createWell`, `createRuin` — each returns `{ object, obstacleRadius }` |
| Environment | `createTerrain` (with `heightAt(x, z)` and `waterLevel` sand bands), `createSky`, `createLightingRig(...)`, `applyFog(...)`, `createWater` + `aboveWater` mask, `createDayCycle` (one `timeOfDay` drives sun/sky/fog/lamps), `applyWind` (vegetation sway), `createPath` (ribbon + patrol route + keep-out from one curve) |
| Scattering | `scatter({ seed, area, surface, density \| count, items, mask, minSpacing, keepOut })` → `{ group, placements, obstacles, count }` |
| Generators | `createVillage({ seed, center, radius, houses, surface, mask })` → `{ group, props, obstacles, lamps, keepOut }` — a hamlet whose windows and lamps hand straight to `createDayCycle`, buildings to `ObstacleAvoidance`, clearing to `scatter` |
| Kits | `KIT_UNIT`, `assembleKit(asciiRows)` → `{ group, obstacles, spawns, torches, floorAt }` — grid-snapped walls/floors/doorways as two InstancedMeshes |
| Scene assembly | `buildScene(manifest, scene?)` → a whole wired world from plain JSON; `extractMarkers(root)` → `{ spawns, routes, obstacles, keepOut }` from naming conventions |
| Core | `Rng` (seeded), `valueNoise2`/`fractalNoise2`, `PALETTES`, `collectObstacles` |

Scatter placement uses density noise for natural clumping and clearings, a spatial hash for minimum spacing, and per-item visual variants; rendering merges everything into `InstancedMesh`es (one draw call per prop part). Opt into `lod: { distance, tileSize }` and placements bucket into tiles that swap to each item's `createFar` variant beyond the distance (10% hysteresis; call `result.update(camera)` each frame).

## Roadmap

- [x] Seeded props with obstacle metadata (tree, rock, crate, fence, lamp)
- [x] Instanced `scatter()` with masks, keep-out, spacing and clumping
- [x] Noise terrain with exact `heightAt` and height/slope color bands
- [x] Sky dome, lighting rigs, fog presets, four theme palettes (incl. `winter`)
- [x] Water with shoreline masks; terrain sand bands
- [x] Day-night cycle: one `timeOfDay` drives sun, sky, fog and lamps igniting at dusk
- [x] Wind sway on scattered vegetation (per-instance phase)
- [x] Surface **wear states**: `wet` — water that fills from the bottom (joints and hollows first), darkens by porosity, and is driven by the rain via `precipitation.soak()`
- [x] Paths: one curve = visual ribbon + scatter keep-out + GAMA patrol route
- [x] Seed-stability snapshot tests (output frozen within a minor version)
- [x] Buildings (house, watchtower, well) and ruins; `createVillage` hamlet generator with the full gameplay handshake
- [x] Kits: ASCII maps → grid-snapped dungeon/compound pieces (`assembleKit`)
- [x] Declarative scene manifests (JSON → scene) and Blender marker conventions (`spawn_*`, `route_*`, `obstacle_*`, `keepout_*`)
- [x] LOD tiles for scatter (`createFar` variants, hysteresis)
- [ ] CC0 asset-pack adapters (Kenney/Quaternius) and a KTX2/Draco pipeline
- [x] Docs site with live playground (10 runnable examples, 7 guides)

## Development

```bash
npm install
npm test          # 62 vitest unit tests (determinism, metadata, scatter rules, snapshots)
npm run typecheck
npm run build     # tsup → dist (ESM + CJS + d.ts)
npm run dev       # the SCENA × GAMA living-forest demo
npm run dev:manifest  # the same kind of world, built from one JSON manifest
```

## License

MIT
