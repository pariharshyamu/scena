# Underwater — god rays & caustics

Above the water there's the [ocean](ocean.md); below it, two effects sell *submerged*: shafts of light falling from the surface, and the rippling net of light they throw onto the seabed.

```js
import { createGodRays, createCaustics } from 'scena3d';

const rays = createGodRays({ count: 22, height: 24, tilt: 20 });
rays.object.position.y = waterLevel;
scene.add(rays.object);

const caustics = createCaustics({ intensity: 0.55 });
caustics.apply(seabed);        // sand + rocks catch the moving light
```

## God rays

Volumetric light shafts, streaming down through the water. Each shaft is a pair of **crossed additive quads** — so it reads as a solid beam from any camera angle, not a flat card that vanishes edge-on — brightest at the surface, feathered soft at the edges, and wavering gently as if the current were stirring them. The whole set is **one additive draw call** and it self-animates.

Position the object at the water surface; the shafts hang below. `tilt` and `azimuth` lean them with the sun, `spread` sets how wide they scatter, `opacity` how bright they burn. Keep it subtle — god rays are a suggestion of light, not a spotlight.

## Caustics

Caustics are the shifting web of bright light that a rippling surface focuses onto whatever lies beneath it — the single most recognisable "this is underwater" cue. `createCaustics` **patches a `MeshStandardMaterial`** (PBR, shadows and fog all survive) and adds a moving caustic network — three rotated, drifting cell layers summed into a shifting mesh of light — to the material's **emissive**, so it glows through *any* lighting, day or night.

It's the same material-patch pattern as the [wind field](wind.md): `bind(material)` composes with SCENA surfaces (so caustics on `createSurface('sand')` is a distinct shader program from the sand alone), it's idempotent per material, and `apply(target)` binds every material under an object and starts the clock:

```js
const seabed = new Group();  // sand plane + scattered rocks
// …
createCaustics({ intensity: 0.55, scale: 0.42, speed: 0.7 }).apply(seabed);
```

> **A mobile note:** caustics read world-space coordinates, so — exactly like the [surface noise](surfaces.md) — the pattern is computed in `highp` to keep it from swimming on mobile `mediump`. SwiftShader (what the headless captures run on) ignores the qualifier, so this can only be confirmed on a real device.

## Bubbles

`createBubbles` sends streams of bubbles rising from the seabed — a vent, a wreck, a diver. Each bubble **wanders** a little and **swells as it rises** (the pressure drops), then **pops** near the top; they're drawn as hollow bright-rimmed points and the columns are anchored to fixed world **vents**, not the camera. Like the rain, every bubble's position is computed in the vertex shader from a seed and the clock, so it's **one draw call** with no per-particle CPU work.

```js
const bubbles = createBubbles({ columns: 7, area: 14, floor: seabedY, rise: 11 });
scene.add(bubbles.object);
// …or pin the vents exactly: createBubbles({ sources: [[3, -2], [8, 4]] })
```

## Water grade

The single biggest "this is deep water" cue is **colour**. Real water absorbs light by wavelength — red dies first, then green, leaving blue — so distant and deep things go blue-green and dark. `createWaterGrade` **patches a `MeshStandardMaterial`** and applies **per-channel Beer–Lambert extinction** toward the water colour, driven by **view distance** *and* **depth below the surface**. It's physically flavoured, not a flat fog: two things the same distance away grade differently if one is deeper.

It's the same material-patch pattern as [caustics](#caustics) and the [wind field](wind.md) — `bind(material)` composes (surface + caustics + grade is one distinct program), `apply(target)` grades everything under an object:

```js
const grade = createWaterGrade({ surface: 0, color: 0x0e3a49, density: 0.03, redShift: 0.7 });
grade.apply(seabed);        // sand, rocks, kelp all sink into the deep
grade.bind(fish.object.material);
```

Bind it to the seabed, the props *and* the fish, and the whole reef falls away into the blue with distance instead of staying flatly lit. (Like the caustics and the [surface noise](surfaces.md), the depth term reads world-space coordinates, so it's computed in `highp` to keep steady on mobile.)

## Putting it together

Drop the seabed under an [ocean](ocean.md), stream god rays down from `ocean.level`, project caustics onto the floor, rise bubble columns from the rocks, grade the whole scene into the deep, and swim a `type: 'fish'` [flock](flock.md) through the shafts — that's a reef. Every piece is one draw call and self-animating (or a static material patch), so the whole scene is a handful of objects and no per-frame wiring.
