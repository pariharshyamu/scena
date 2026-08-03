# The GAMA handshake

SCENA builds worlds; [GAMA](https://github.com/pariharshyamu/gama) makes them games — steering agents, navmesh pathfinding, behavior trees, cameras, input. Neither library imports the other. They cooperate through **structural typing**: SCENA emits plain shapes that GAMA consumes.

| SCENA emits | GAMA consumes |
|---|---|
| `forest.obstacles`, `village.obstacles`, `fort.obstacles` — `{ center: Vector3, radius }` | `new ObstacleAvoidance(() => obstacles)` |
| `terrain.heightAt(x, z)` — exact ground height | ground-clamping agents, navmesh baking, spawning |
| `road.route` — draped waypoints | `new Path(route, loop)` + `FollowPath` |
| `road.keepOut`, `village.keepOut`, `markers.keepOut` | `scatter` exclusion (SCENA-side, same shape) |
| `kit.floorAt(x, z)`, `kit.spawns` | walkability checks, spawn placement |
| `cycle.isNight`, `cycle.sunElevation` | gameplay conditions ("wolves at night") |

## Steering around props

The canonical loop — a warden patrolling a SCENA road through a SCENA forest, driven entirely by GAMA:

```js
import { Game, MotionAgent, FollowPath, Path, ObstacleAvoidance } from 'gama3d';

const patrol = new Path(road.route.map((p) => p.clone()), true);
const agent = warden.addComponent(new MotionAgent({ maxSpeed: 4.5, planar: true }));
agent.addBehavior(new FollowPath(patrol, 1.6));
agent.addBehavior(new ObstacleAvoidance(() => forest.obstacles, 3.5, 0.5), 2.5);

game.onUpdate(() => {
  warden.position.y = terrain.heightAt(warden.position.x, warden.position.z);
});
```

Three things worth noticing:

1. **The road is the route.** `road.route` came from the same curve as the visible ribbon — move the road, the patrol follows.
2. **The forest defends itself.** `forest.obstacles` came out of `scatter` for free; agents weave between the actual trees on screen.
3. **The ground is exact.** `heightAt` is analytic, so agents never float or sink between vertices.

## Navmesh baking

GAMA's `generateNavMesh` raycasts against level geometry — hand it the terrain mesh (and buildings) and bake a walkable navmesh with slope and agent-radius rules. Because SCENA's terrain also exposes `heightAt`, you can decide per-project whether steering (obstacle circles) or pathfinding (navmesh) fits better; the world supports both.

## Determinism across the network

Both libraries are deterministic where it matters: the same manifest seed reproduces the same world, so two clients can build identical forests — identical *obstacles* — from a few bytes of JSON, and agents steering through them stay coherent without syncing any geometry.

## Screens

`ScreenPanel` (published as `screen` by every electronics prop) is two handshakes at once:

- `{ surface, width, height }` is structurally ANIMA's `Viewable`, so `new Watching(rig, gaze).watch(tv.screen)` puts a character's eyes on it.
- `setMode(mode: string)` is structurally GAMA's `DisplayTarget`, so `new Device().attach(tv.screen)` lets a power state machine drive what it shows.

```ts
const tv = createTelevision({ mode: 'off' });     // SCENA owns how it looks
new Device({ boot: 2.4 }).attach(tv.screen);      // GAMA owns whether it is on
new Watching(rig, gaze).watch(tv.screen);         // ANIMA owns who is looking
```

No library imports another. GAMA never learns what a `video` mode looks like; SCENA never learns what booting means.
