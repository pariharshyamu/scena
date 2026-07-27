# Sea waves

A coast only feels like a coast when the sea is *moving*. `createOcean` is a Gerstner-wave sea — real rolling swell, whitecap foam, a shoreline, and a boat that bobs on it.

```js
import { createOcean } from 'scena3d';

const ocean = createOcean({ level: 0, wind, shore: terrain.heightAt });
scene.add(ocean.mesh);
```

## Gerstner swell, not a sine plane

The surface is a subdivided plane displaced by a **sum of Gerstner waves** in the vertex shader. Unlike a plain sine, a Gerstner wave moves each point in a *circle*, so **crests peak and troughs flatten** — the profile of real ocean swell. A few detuned waves are summed (with a wind-derived heading, dispersion-correct speeds, and a `choppiness` steepness that's clamped so crests never fold through themselves), and the **analytic Gerstner normal** is computed in the same loop, so the light rides the waves exactly.

It patches a `MeshStandardMaterial`, so PBR lighting, shadows and fog survive; on top it adds:

- **Whitecap foam** where the wave sum folds (the steepest, breaking crests).
- A **fresnel sky tint** — the surface reflects `skyColor` at grazing angles, so the sea reads as water, not paint.
- **Deep vs shallow** colour graded by depth toward the shore.

Pass a {@link WindField} and the swell **turns downwind and grows with the wind** — the same field that bends the trees and slants the rain drives the sea, so a gust crosses the whole world at once.

## The shore handshake

Give `createOcean` a terrain height sampler as `shore` (that's `terrain.heightAt` — the same handshake terrain already exposes) and the ocean:

- **fades out over land** — any vertex where the terrain stands above sea level is cut away, so the sea meets the coast exactly instead of clipping through it, and
- **foams along the waterline** — a band of foam where the water is shallowest.

It's baked per-vertex at build (the terrain is static), so it costs nothing at runtime.

## Buoyancy — `heightAt`

The payoff of doing the waves analytically: `heightAt(x, z)` gives the **wave height on the CPU**, matching the shader. Sit a boat, a buoy, or a floating crate on it and it rides the swell — the buoyancy handshake, mirroring `terrain.heightAt`:

```js
boat.position.y = ocean.heightAt(boat.position.x, boat.position.z);
// sample a couple of neighbours for roll & pitch:
const dy = ocean.heightAt(boat.position.x + 1, boat.position.z) - boat.position.y;
boat.rotation.z = -dy * 0.4;
```

Because both the visual and the gameplay read the *same* Gerstner sum, a boat never floats above or sinks below the wave you can see — exactly the guarantee `terrain.heightAt` gives for the ground.

## Storm surge

The sea shouldn't be indifferent to the sky. Pass **`storm`** — a number, or a live source like `() => weather.storminess` — and the ocean answers as a storm builds:

- waves grow **taller** (up to ~3× amplitude) and **choppier** (crests peak),
- **whitecaps spread** across the swell, not just the highest crests,
- the water **darkens and greys** between the foam,
- and the **surge raises the sea level** by `surge` metres — the waterline climbs, flooding higher up the beach, and `heightAt` rises with it, so boats lift on the swell.

```js
const weather = createWeather(scene, { wind });
const ocean = createOcean({
  level: 0, wind, shore: terrain.heightAt,
  storm: () => weather.storminess,   // ← the whole sea now tracks the weather
  surge: 1.5,
});
// weather.set('storm') → the wind rises, the trees lean, AND the sea heaves up.
```

Because the surge feeds through `heightAt`, the buoyancy handshake keeps holding: a boat bobbing on a calm swell is lifted by the surge and pitched by the bigger waves, all from the same function. It's the [weather controller](weather.md) reaching all the way down into the sea — one `storminess` value, and the whole world weathers together.

*(For a still pond or a fountain, reach for the simpler `createWater` instead — `createOcean` is for open, wind-driven sea.)*

## The surf zone — breakers and the swash

A coloured plane with a fixed edge reads as a painted line, however good the waves further out are. Given a `shore`, the ocean now runs a **surf zone**: two effects on one clock, so they agree with each other.

```js
const ocean = createOcean({
  level: 0,
  shore: beachProfile,          // the same height function the sand mesh uses
  surf: { breakDepth: 1.7, runUp: 0.42, period: 8, bands: 2.4 },
});
```

- **Breakers** — bands of whitewater that form where the swell trips on the bottom (shallower than `breakDepth`) and travel *shoreward*, brightening as they shallow.
- **The swash** — the waterline itself runs up the beach and drains back every `period` seconds. `runUp` is given in metres of **depth**, and the edge's travel is that divided by the beach slope: 0.42 m on a 1-in-7 face is nearly three metres of moving waterline. That movement is the single strongest cue that a coast is water and not paint.
- **The drain sheet** — the thinnest water left behind goes nearly mirror-smooth, which is what a wet beach looks like between waves.

Shallow water is also now bright out of proportion to its depth, so the turquoise hugs the shore instead of ramping linearly to blue.

**It is inert without a `shore`.** Out at sea the shore depth is 999 and every surf term multiplies out to nothing, so open-water scenes are untouched. `surf: false` turns it off entirely.

### Gameplay agrees with the picture

The swash is not a shader-only effect — the same run-up is readable on the CPU, so a wader gets caught by the wave that visibly arrives:

```js
ocean.runUp;              // metres of extra depth right now (+ running up, − draining)
ocean.depthOver(groundY); // depth over ground of that height, swash included; 0 when drained
```

Walk a character along the edge reading `depthOver(profile(x, z))` and they are in and out of the water as the waves come.
