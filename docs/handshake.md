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
