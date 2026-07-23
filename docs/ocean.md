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

*(For a still pond or a fountain, reach for the simpler `createWater` instead — `createOcean` is for open, wind-driven sea.)*
