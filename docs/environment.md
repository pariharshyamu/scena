# Terrain, sky, water, weather

The environment modules build the stage: ground, sky, light, fog, water, wind and time itself. They're designed to be driven together — one `timeOfDay` parameter can move all of them in lockstep.

## Terrain

```js
const terrain = createTerrain({
  seed: 7,
  size: 90,           // square side length
  amplitude: 6,       // peak height
  resolution: 96,     // vertices per side
  valleyFlatness: 0.55, // higher = flatter meadows between peaks
  waterLevel: 0.9,    // optional: blend shoreline bands toward sand
  palette,
});
scene.add(terrain.mesh);
```

The mesh gets height/slope-banded vertex colors (grass → high grass → cliff → peak), but the important part is **`terrain.heightAt(x, z)`** — the *same analytic function that displaced the vertices*. Use it for spawning, ground-clamping agents, draping roads and masking scatters; it never disagrees with the visuals, which a raycast against the mesh can (between vertices).

## Sky & lighting

```js
const sky = createSky({ palette });           // gradient dome, sky.setColors(top, bottom)
const rig = createLightingRig('golden-hour'); // 'day' | 'golden-hour' | 'overcast' | 'night'
applyFog(scene, 'haze', palette);             // 'clear' | 'haze' | 'thick' | 'eerie'
scene.add(sky.mesh, rig.group);
```

The rig exposes `sun`, `ambient` and `hemisphere` for retuning. Fog and sky take their colors from the palette so themes carry through.

## Water & shores

```js
const water = createWater({ level: 0.9, size: 120, palette });
scene.add(water.mesh);
game.onUpdate((t) => water.update(t.delta));   // low-poly wave bobbing
```

Pair it with a terrain built using the same `waterLevel` and shores blend to sand. Two helpers close the loop with gameplay:

- `water.isUnderwater(groundHeight)` — is ground at this height submerged?
- `aboveWater(terrain, water, margin)` — a `(x, z) => boolean` mask for `scatter` and `createVillage`, so nothing grows (or builds) in the lake.

## The day-night cycle

```js
const cycle = createDayCycle({
  sky, rig, scene,
  lamps: [lampA, lampB, house],   // anything with PointLights or emissive bulbs
  palette,
  dayLength: 120,                 // seconds per full day
  timeOfDay: 0.5,                 // 0 midnight · 0.25 dawn · 0.5 noon · 0.75 dusk
});
game.onUpdate((t) => cycle.update(t.delta));
```

One `timeOfDay` drives the sun's position, color and intensity, the sky gradient, ambient and hemisphere levels, fog color — and **lamps ignite as the sun drops below the horizon**. Pass lamp props *or* houses: anything in `lamps` is scanned for `PointLight`s and strongly-emissive materials (that's how village windows glow at night). Noon colors come from the palette, so a `winter` noon looks wintry.

`cycle.set(t)` jumps to a time; `cycle.sunElevation` and `cycle.isNight` are readable for gameplay ("wolves spawn at night").

## Wind

```js
const wind = applyWind(forest.group, { strength: 0.08 });
game.onUpdate((t) => wind.update(t.delta));
```

`applyWind` patches the materials of everything in a group (instanced meshes included) with a vertex-shader sway: amplitude grows with height above the anchor (trunks stay planted) and each *instance* gets its own phase, so a forest shimmers instead of marching in step. It's a shader patch — zero per-frame CPU cost beyond one uniform.

## Paths: one curve, three jobs

```js
const road = createPath(
  [{ x: -18, z: -10 }, { x: 0, z: -16 }, { x: 16, z: -6 }],
  { surface: terrain.heightAt, width: 2.2, loop: true, palette });
scene.add(road.mesh);
```

One authored polyline becomes:

- **the visual ribbon** (`road.mesh`), Catmull-Rom-smoothed and draped on the surface,
- **the scatter keep-out** (`road.keepOut` circles + `road.contains(x, z)` for fine masks),
- **the patrol route** (`road.route`, points ready for GAMA's `Path`/`FollowPath`).

That's level design as a single polyline — move a bend and the visuals, the vegetation gap and the guards' route all follow.
