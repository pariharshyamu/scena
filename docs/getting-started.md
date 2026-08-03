# Getting started

**SCENA** (SCenes & ENvironment Assets) is a 3D world-building library on top of [three.js](https://threejs.org): seeded procedural props, terrain, sky, water, day-night cycles, villages, kits and scattering — with **gameplay metadata** (steering obstacles, exact height queries, patrol routes) that game libraries like [GAMA](https://github.com/pariharshyamu/gama) understand structurally.

three.js renders. GAMA makes it a game. **SCENA gives it a world.**

## Install

```
npm install scena3d three
```

three.js is a peer dependency — SCENA has zero dependencies of its own, and every object it creates is a plain three.js `Mesh`, `Group` or `Light` you can treat like any other.

## First world

```js
import { createTerrain, createSky, createLightingRig, applyFog,
         createTree, createRock, scatter, PALETTES } from 'scena3d';

const palette = PALETTES.meadow;

const terrain = createTerrain({ seed: 7, size: 90, amplitude: 6, palette });
scene.add(terrain.mesh);
scene.add(createSky({ palette }).mesh);
scene.add(createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);

const forest = scatter({
  seed: 21,
  area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
  surface: terrain.heightAt,
  density: 0.05,
  items: [
    { create: (rng) => createTree({ seed: rng.int(1, 1e9), palette }), weight: 4 },
    { create: (rng) => createRock({ seed: rng.int(1, 1e9), palette }) },
  ],
});
scene.add(forest.group);
```

That's a themed, lit, fogged, forested world — and `forest.obstacles` + `terrain.heightAt` are already everything an agent needs to walk through it.

## Principles

- **Seeded determinism.** Same seed, same tree. Forests are reproducible, diffable and network-syncable; `Math.random` appears nowhere in the library. Snapshot tests freeze generator output within a minor version.
- **Playable before assets exist.** Every generator produces a coherent flat-shaded low-poly visual out of the box. Real models come later, if ever.
- **Props know their gameplay.** A tree isn't just a mesh — it reports its obstacle footprint. Terrain exposes its exact height function. A road knows its patrol route.
- **A matched set.** One palette themes every prop, the terrain bands, the sky, fog, water and roofs together.

## Where next

- [Terrain, sky, water, weather](./environment.md) — the stage
- [Props & palettes](./props.md) — the cast
- [Scattering & LOD](./scatter.md) — forests at scale
- [Villages, buildings & kits](./settlement.md) — civilization
- [Manifests & markers](./manifests.md) — declare whole worlds as JSON
- [The GAMA handshake](./handshake.md) — make it a game
