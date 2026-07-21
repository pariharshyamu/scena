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

Neither library imports the other — the obstacle shape (`{ center, radius }`) is structural. Run the full demo (`npm run dev` — gama3d comes from npm): a day-night cycle over terrain, lakes, a windblown forest, and a dirt road whose single authored curve is at once the visual ribbon, the scatter keep-out, and the wardens' patrol route. Append `?t=0.85` to freeze the time of day.

## API

| Area | Exports |
|---|---|
| Props | `createTree`, `createRock`, `createCrate`, `createFence`, `createLamp`, `createBush`, `createGrassTuft` — each returns `{ object, obstacleRadius }` |
| Environment | `createTerrain` (with `heightAt(x, z)` and `waterLevel` sand bands), `createSky`, `createLightingRig(...)`, `applyFog(...)`, `createWater` + `aboveWater` mask, `createDayCycle` (one `timeOfDay` drives sun/sky/fog/lamps), `applyWind` (vegetation sway), `createPath` (ribbon + patrol route + keep-out from one curve) |
| Scattering | `scatter({ seed, area, surface, density \| count, items, mask, minSpacing, keepOut })` → `{ group, placements, obstacles, count }` |
| Core | `Rng` (seeded), `valueNoise2`/`fractalNoise2`, `PALETTES`, `collectObstacles` |

Scatter placement uses density noise for natural clumping and clearings, a spatial hash for minimum spacing, and per-item visual variants; rendering merges everything into `InstancedMesh`es (one draw call per prop part).

## Roadmap

- [x] Seeded props with obstacle metadata (tree, rock, crate, fence, lamp)
- [x] Instanced `scatter()` with masks, keep-out, spacing and clumping
- [x] Noise terrain with exact `heightAt` and height/slope color bands
- [x] Sky dome, lighting rigs, fog presets, four theme palettes (incl. `winter`)
- [x] Water with shoreline masks; terrain sand bands
- [x] Day-night cycle: one `timeOfDay` drives sun, sky, fog and lamps igniting at dusk
- [x] Wind sway on scattered vegetation (per-instance phase)
- [x] Paths: one curve = visual ribbon + scatter keep-out + GAMA patrol route
- [x] Seed-stability snapshot tests (output frozen within a minor version)
- [ ] Kits: dungeon/village pieces with shared snap dimensions
- [ ] Declarative scene manifests (JSON → scene), Blender marker conventions (`spawn_*`, `route_*`, `nav_*`)
- [ ] Buildings/ruins generators; LOD tiers for scatter
- [ ] CC0 asset-pack adapters (Kenney/Quaternius) and a KTX2/Draco pipeline
- [ ] Docs site with live playground (reusing GAMA's runner)

## Development

```bash
npm install
npm test          # 39 vitest unit tests (determinism, metadata, scatter rules, snapshots)
npm run typecheck
npm run build     # tsup → dist (ESM + CJS + d.ts)
npm run dev       # the SCENA × GAMA living-forest demo
```

## License

MIT
