# Herds & grazing

Birds wheel overhead; the ground has its own life. `createHerd` gives you deer and sheep that walk the terrain, clump into a herd, and graze — head down, legs still — then move on and graze again.

```js
import { createTerrain, createHerd } from 'scena3d';

const terrain = createTerrain({ seed: 3 });
const deer = createHerd({ type: 'deer', center: [0, 0], ground: terrain.heightAt });
scene.add(terrain.mesh, deer.object);
```

## Boids on the ground

Under the hood is the same **boid** simulation that drives [flocks](flock.md) — separation, alignment, cohesion, plus a little wander — but steering on the **XZ plane** instead of in free air, with cohesion turned up so a herd *clumps* the way birds don't. The sim runs on the CPU and the whole herd draws as a **single InstancedMesh**: one mesh, one material, `count` animals.

The crucial difference is the ground. Pass **`ground`** — that's `terrain.heightAt`, the same analytic height function that built the mesh — and every animal's feet clamp to the terrain each frame, so they never float or sink. On a slope, the body **tips to follow the ground** (blend it with `slopeAlign`). It's the [terrain handshake](environment.md) doing double duty: the mesh you see and the animals standing on it agree exactly, because they read the same function.

## Grazing, then walking

Real herbivores don't cruise — they crop a patch, take a few steps, crop again. Each animal runs a **grazing rhythm**: it stands and grazes for a few seconds (head down, velocity braked to nothing), then walks for a few, then grazes again. `grazing` (0–1) sets how much of its time is spent head-down.

The **legs stride and the head dips in the vertex shader**, driven by the clock, a per-instance phase (so no two are in lockstep), and — critically — each animal's **real speed**. A walking deer strides; a grazing one stands still and nibbles. It's all one attribute set, no skeleton and no clips, and it **self-animates** from the render loop (`update(dt)` is there for deterministic runs).

## Deer and sheep

`type: 'deer'` are tall, lanky and antlered; `type: 'sheep'` are stout, woolly and flock tighter. They're the same boids with different bodies, gaits and steering — tune `speed`, `count`, `radius`, `grazing`, and the weights (`separation` / `alignment` / `cohesion`).

## Reading the herd

`positions` is the live array of animal positions, so **gameplay can read the herd**:

```js
// Spook the herd — send them bounding away from the player.
for (const p of herd.positions) {
  if (p.distanceTo(player.position) < 6) herd.setCenter(fleeX, fleeZ);
}
```

`setCenter(x, z)` slides the grazing ground, so the herd drifts to follow a moving pasture — or bolts from a threat.

*(Herds are ambient life — cheap, one draw call, no rig. For a rigged character that walks, runs and looks around, that's [ANIMA](https://github.com/pariharshyamu/anima); for steered agents with pathfinding, that's [GAMA](https://github.com/pariharshyamu/gama) — a herd's `positions` and `setCenter` are the seams to wire the leader to a real agent.)*
