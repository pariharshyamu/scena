# Flocks & schools

Nothing sells a *living* world like movement that isn't yours — birds wheeling over a tower, a school of fish sliding through the shallows. `createFlock` gives you both.

```js
import { createFlock } from 'scena3d';

const crows = createFlock({ type: 'birds', center: [0, 16, 0], circle: 14 });
scene.add(crows.object);
```

## Boids, then one draw call

Under the hood is a classic **boid** simulation — every creature steers by three rules plus a little wander:

- **separation** — veer away from crowding neighbours,
- **alignment** — match the heading of the flock around you,
- **cohesion** — drift toward the local centre of mass,

kept inside a soft **volume** (`center` + `bounds`) that gently turns strays back. The sim runs on the CPU (a small flock is a handful of microseconds a frame), and the whole flock draws as a **single InstancedMesh**: one mesh, one material, `count` creatures.

The wings **beat** (or, for fish, the tail **sways**) in the **vertex shader**, driven by the clock and a **per-instance phase**, so no two flap in lockstep — and it's free, no skeletons or clips. Each creature is oriented to face its own velocity. It patches a `MeshStandardMaterial`, so the birds catch the scene's light and fog like everything else, and it **self-animates** from the render loop (`update(dt)` is there for deterministic runs).

## Birds and fish

`type: 'birds'` fly and flap; `type: 'fish'` swim and sway. They're the same boids with different bodies and beat rates — tune `speed`, `count`, `bounds`, `beat`, and the steering weights (`separation` / `alignment` / `cohesion`).

Pass **`circle`** and the flock *wheels* around its centre at that radius — crows over a keep, gulls over a mast. Leave it off and they roam their volume.

## Reading the flock

`positions` is the live array of boid positions, so **gameplay can read the flock**:

```js
// Scatter the birds when someone gets close.
for (const p of flock.positions) {
  if (p.distanceTo(player.position) < 4) flock.setCenter(p.x, p.y + 8, p.z);
}
```

`setCenter(x, y, z)` slides the roaming volume, so the flock drifts to follow a moving landmark — a ship, a herd, the player.

*(Flocks are ambient life. For a rigged character that walks, runs and looks around, that's [ANIMA](https://github.com/pariharshyamu/anima); for steered agents with pathfinding, that's [GAMA](https://github.com/pariharshyamu/gama) — a flock's `positions` and `setCenter` are the seams to wire them together.)*
