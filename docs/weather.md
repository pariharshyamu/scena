# The weather controller

Wind, rain, snow, fog — SCENA has all the pieces. `createWeather` is the conductor: one object that cross-fades a whole scene between named states, driving every piece together so you never wire them up by hand.

```js
import { createWeather, applyWind } from 'scena3d';

const weather = createWeather(scene, { sun: rig.sun, ambient: rig.ambient, accumulateOn: ground });
applyWind(forest.group, { field: weather.wind, height: 4, anchor: 1 });  // trees lean into it

weather.set('storm', { fade: 6 });   // roll a storm in over six seconds
```

## Named states

Seven built-in states, each a full description of the sky: `clear`, `overcast`, `fog`, `rain`, `storm`, `snow`, `blizzard`. Calling `set(name)` **cross-fades** to it — wind strength and gustiness, rain and snow intensity, fog colour and distance, the background sky, and the light level all ease from where they are to the new state's targets over a few seconds (default four; pass `{ fade }` to change it). Nothing snaps.

Because it's a fade, a scene can *roll* — clear to overcast to rain to storm and back — and every frame in between is a valid, coherent sky.

## One controller, every piece

Under the hood `createWeather` owns and drives:

- a **{@link WindField}** (or the one you pass in, so flora already bound to it responds) — its strength and gust rise in wind;
- **rain and snow** {@link Precipitation} systems, added to the scene, their intensities faded in and out;
- the scene's **fog** — colour and near/far, so storms close the world in and darken it;
- the scene's **background** colour, tinted to the sky of the moment;
- optionally your **sun and ambient** lights, dimmed relative to the intensities your rig started with (so a storm goes grey and a blizzard goes flat-white);
- **lightning** — stormy states crack with an occasional double-flash that briefly lifts the sky and the light.

Pass `accumulateOn` and snow **settles** on it as it falls (reusing the [surface cap](surfaces.md)), so a blizzard whitens the ground and roofs.

It **self-animates** from the render loop; `update(dt)` is there for deterministic runs.

## Custom states

Override a built-in or add your own through `states` — a partial deep-merge over the defaults:

```js
const weather = createWeather(scene, {
  states: {
    storm: { rain: 1, wind: 1.2 },                 // a fiercer built-in storm
    duststorm: {                                    // a whole new state
      wind: 1.1, gust: 1, rain: 0, snow: 0,
      fogColor: 0xb4915a, fogNear: 6, fogFar: 34,
      sky: 0xc9a86a, light: 0.6,
    },
  },
});
weather.set('duststorm');
```

## Reading it

`weather.state` is the current target, `weather.wind` is the field to bind flora to, and `weather.rain` / `weather.snow` are the live systems if you want to poke them directly.

And `weather.storminess` — a live, cross-faded 0–1 sea-roughness — is the seam to the sea. Hand it to an [ocean](ocean.md)'s `storm` and a storm surge whips the water up at the same moment it bends the trees:

```js
const ocean = createOcean({ wind: weather.wind, storm: () => weather.storminess, surge: 1.5 });
```

The one field drives the flora bend, the rain's slant, *and* the swell, so a storm raises the sea while it darkens the sky — the whole world weathers together.
