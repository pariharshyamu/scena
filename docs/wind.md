# Wind & swaying flora

A still world reads as a diorama. One `WindField` is what makes it *breathe* — trees lean, grass bends, a wheat field ripples, banners fly, all from the **same gust**, so a single breeze crosses the whole scene in step.

```js
import { createWindField, applyWind, createTree } from 'scena3d';

const wind = createWindField({ direction: 40, strength: 0.35 });
applyWind(forest.group, { field: wind, height: 4, anchor: 1 }); // canopies bend
```

## How it works

The bend is a **vertex-shader** effect patched onto the material through `onBeforeCompile`, so — exactly like the surfaces — it stays a `MeshStandardMaterial` with full **PBR lighting, shadows and fog** intact, not a bespoke `ShaderMaterial`.

- **Displacement grows with height.** A vertex's sway scales with how far it is above the plant's `anchor`, raised to a `stiffness` curve — so trunks and stems stay planted while canopies and blade tips move.
- **The gust travels.** Rather than every plant oscillating on the same clock, the gust is a wave that moves *downwind* (`waveLength`, `waveSpeed`). Two plants a few metres apart are at different points in the wave, so a field **ripples** instead of pulsing, and nothing sways in lockstep.
- **World-space, folded back to local.** The lean is computed in world space (so the whole scene agrees on "downwind") and mapped back into the mesh's local frame, which means it works on a single prop or on a `scatter`'ed **InstancedMesh** of thousands.
- **It self-animates.** The shared clock is advanced from the render loop (`onBeforeRender`), so a windy scene needs no per-frame wiring — drop the props in and they move. (Call `wind.update(dt)` yourself if you'd rather drive it deterministically.)

## One field, many props

A `WindField` is a **handshake**, like `terrain.heightAt` or a `Prop`. Build one and share it:

```js
const wind = createWindField({ direction: 30, strength: 0.4, gust: 0.7, waveLength: 4 });
wind.sway(wheat.group, { height: 0.5, stiffness: 1.1 });   // a rippling field
wind.sway(forest.group, { height: 4, anchor: 1 });         // leaning canopies
createBush({ wind });                                      // straight from the generator
```

The flora generators take a `wind` option directly — `createTree({ wind })` sways only the canopy (the trunk material is left unbound), `createGrassTuft({ wind })` and `createBush({ wind })` sway the whole plant.

## Reading the wind on the CPU

`sample(x, z)` returns the wind vector at any world point — the *same* wind the shader uses — so gameplay can read it too: nudge a GAMA agent downwind, bob a boat, blow a particle, tilt a weathervane.

```js
const gust = wind.sample(agent.x, agent.z);   // a THREE.Vector2 in world XZ
agent.velocity.x += gust.x * dt;
```

`setDirection(deg)` and `setStrength(n)` re-aim or gust the whole field live — swing it up into a storm, drop it to a dead calm.

## Composing with surfaces

Wind is layered *on top of* whatever the material already does. Bind a wind field to a bark or thatch **surface** material and it both weathers and sways — the two patches compose into one program (a distinct cache key keeps `surface + wind` from colliding with either alone). The one assumption is uniform scale (plus rotation), which every scattered plant satisfies.
