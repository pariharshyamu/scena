# SCENA — SCenes & ENvironment Assets

[![CI](https://github.com/pariharshyamu/scena/actions/workflows/ci.yml/badge.svg)](https://github.com/pariharshyamu/scena/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/scena3d.svg)](https://www.npmjs.com/package/scena3d)

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

Six sub-path entries — `scena3d/core`, `/materials`, `/text`, `/props`,
`/environment`, `/scene` — let an import say what it depends on. The root import
costs the same, which is the point: building them forced the published package
to have module boundaries, and one crate went from 20 kB gzipped to 11 kB for
everyone who changed nothing. [What an import costs →](docs/imports.md)

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
- [x] `applyEnvironment` — a procedural IBL painted from the sky's own gradient, sun included, so metals have something to reflect (they render black without one)
- [x] Surface **physical tier**: velvet (sheen), silk & brushed metal (anisotropy), nacre (iridescence), ice (transmission) — the only kinds that build a `MeshPhysicalMaterial`
- [x] Surface **industrial tier**: corrugated iron, asphalt, tread plate, galvanised spangle, copper patina, columnar basalt — parallel ribs, hard-edged aggregate, warped Voronoi cells, and a crust that takes the metalness with it
- [x] Surface **wear states**: `wet` — water that fills from the bottom (joints and hollows first), darkens by porosity, and is driven by the rain via `precipitation.soak()`
- [x] Paths: one curve = visual ribbon + scatter keep-out + GAMA patrol route
- [x] Game feel: `createEffects` burst pool (dust/sparks/debris/splash/confetti + rings, two draw calls), `createTrail` fading ribbon, `createMarks` skid/footprint/scorch decals (one instanced draw)
- [x] Pickups & markers: `createPickup` (7 kinds, collect/respawn state machine, live `{center,radius}` triggers), `createPickupField` (one draw call), checkpoint/zone/beacon/finish-gate markers
- [x] Hazards: moving/crumbling platforms (rider `delta`), bounce pad, pendulum blade (live tip hazard), spike trap, chevron conveyor, and the `MechanismSource` pressure plate (`linkMechanism(plate, door)`)
- [x] Destructibles: seeded pre-fractured breakables with `loot` markers, target dummy (damped-pendulum wobble, topple), flip-digit vector-font scoreboard, and stumps whose bails FLY
- [x] Breaking boards: `boardStrength()` derives what a board takes from the Wood Handbook, ASTM D245 and three-point bending — **3.62 kN against a 3.1 kN published measurement, with nothing fitted**. Two results the algebra gives that intuition does not: energy is **linear** in thickness (the `d³` is in the stiffness, which makes a beam fail *sooner*), and the spacers in a stack are a **force** argument — 4.10 kN six times against 147.7 kN at once. And, crossed with ANIMA's independently derived strike energies: **energy is not what limits board breaking, by a factor of sixty**
- [x] Luminous props & the light budget: `createLightBudget` (pooled real lights, hysteretic granting), street lights, lantern lights, buzzing neon from the vector font, festoon string lights, revolving beacon, and `createPhotocell` (seeded staggered dusk ignition)
- [x] The sky's drama: `createLightning` (two-pulse flash through structural targets, seeded forked bolts, thunder delayed by distance) and `createFireworks` (one-InstancedMesh rockets and drooping shells, oldest-recycled under a cap)
- [x] Atmosphere: `createLightShafts` — outdoor god rays (merged one-draw-call beam cards, drifting wrap-around dust motes, day-cycle-aware strength), pairing with the existing underwater `createCaustics` in the sunbeam-grove demo
- [x] Aviation: `createPlane` (prop trainer + airliner — blur-disc propellers, deflecting control surfaces, folding gear, nav-light claims, pilot slot) and the airfield kit (`createRunway` with reciprocal numbers, WindField-reading `createWindsock`, `createHangar`, `createHelipad`)
- [x] Helicopter: `createHelicopter` — spool-inertia rotors with parked-blade droop and blur discs, cyclic disc tilt, skids, and an aimable nose searchlight whose luminous claim outranks the street (the visible half of a GAMA Flashlight)
- [x] Fighter jet: `createFighterJet` — extruded delta with true elevons (pitch together, roll opposed), throttle-gated breathing afterburner, folding gear, and hardpoints whose `launchFrom()` hands GAMA `Missiles` a world-space pose (the missile the game flies is the missile the wing stops carrying)
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
npm test          # 1622 vitest unit tests (determinism, metadata, scatter rules, snapshots)
npm run typecheck
npm run build     # tsup → dist (ESM + CJS + d.ts)
npm run dev       # the SCENA × GAMA living-forest demo
npm run dev:manifest  # the same kind of world, built from one JSON manifest
```

And the parts a unit test cannot do — a prop that must LOOK right is not
verified by asserting its vertex count, and what a prop COSTS is invisible to
every other check:

```bash
npm run verify:playgrounds   # every example, headless, measured by pixels
npm run size                 # import cost against committed budgets
npm run geometry             # draw calls, buffers and materials, per prop
npm run entries:check        # the sub-path entries match the root barrel
```

`geometry` is the frame cost, where `size` is the load cost. It found a glass
railing building one material per bay, a car one rubber per wheel, and a stall
one material per loaf — see [docs/geometry.md](docs/geometry.md), including the
twenty false positives its own first version reported.

All of them run in CI on every push
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Release notes live in
[CHANGELOG.md](CHANGELOG.md).

## License

MIT
