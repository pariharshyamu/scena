# Rain & snow

Weather turns a scene into a place — a *mood*. `createPrecipitation` drops rain or snow that follows the camera, leans along the wind, and (for snow) settles onto everything below.

```js
import { createPrecipitation, createWindField } from 'scena3d';

const wind = createWindField({ direction: 20, strength: 0.5 });
const snow = createPrecipitation({ type: 'snow', wind });
scene.add(snow.object);
snow.accumulate(scene);   // roofs & ground whiten as it falls
```

## GPU-driven — thousands of particles, no CPU work

Every drop's position is computed **entirely in the vertex shader** from a fixed per-particle seed plus the clock: it falls, drifts, and wraps into a box that follows the camera, so a *finite* cloud of particles becomes an *infinite* fall. There is no per-particle CPU update and no geometry churn — the whole storm is **one draw call and one uniform bump per frame**, the same technique as the fire embers and fountain spray.

- **Rain** renders as `LineSegments`: each drop is a short streak whose tail trails up its velocity, so it stretches and **slants along the wind**.
- **Snow** renders as soft round `Points` that **drift and wobble** as they fall, sizes clamped so near flakes never balloon into a white veil.
- Both read a {@link WindField} if you pass one — the same gust that bends the trees leans the rain.
- It **self-animates** from the render loop (`onBeforeRender`); `update(dt)` is there for deterministic loops.

`setIntensity(0..1)` dials it from a flurry to a downpour (0 stops it) — swing it with your weather system.

## Snow that settles

The headline: **snow accumulates**, reusing the surface system's up-facing cap. `accumulate(target)` finds the [surface](./surfaces.md) materials under `target` and, as the snow falls, ramps a white cap onto them — so roofs, walls and ground **whiten over time**, gathering most on the flat, up-facing faces and only a dusting on steep walls.

```js
snow.accumulate(scene, {
  color: 0xf4f8fc,   // snow colour
  max: 0.8,          // how deep it settles (0–1)
  rate: 0.2,         // how fast (cap per second)
  capUp: 0.3,        // how up-facing a face must be to collect it
});
```

It only settles on **plain** surfaces (ones with no cap of their own), so it never fights a preset `snow` or `moss` material. Because it's the same cap the surfaces already carry, there's no extra geometry or texture — the snow is *painted on by the light*.

## A storm, composed

Precipitation is one layer of weather. Pair it with a close, desaturated `Fog`, an overcast sky, and a stiff `WindField` and you have a proper storm; drop the intensity and clear the fog and it passes. Rain and snow are the same call with a different `type`, so a weather controller can cross-fade between them.
