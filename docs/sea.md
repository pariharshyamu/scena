# Sea state — the sea remembers and the wind does not

Every ocean in this library so far has been a setting. This one is a **state**, and it has a memory.

```js
import { createSeaState, createOcean } from 'scena3d';

const sea = createSeaState({ kind: 'ocean' });
// ONE surface, driven by the state. Two would be two seas, and a boat would
// float on the one nobody can see.
const ocean = createOcean({ sea: () => sea.trains, size: 1600, segments: 220 });

sea.setWind(20, 315);
game.onUpdate((t) => {
  sea.update(t.delta);
  ocean.update(t.delta);
});
```

## The wind drops and the sea does not

A wind gets up in twenty minutes and can drop in ten. The sea it raises takes **sixteen hours** to answer it and **days** to die:

```js
sea.setWind(20, 315);
sea.building;    // 15.9 h before she is anywhere near it
sea.state;       // 'building'

// …a day later
sea.height;      // 9.5 m, and now the wind dies flat calm
sea.setWind(0);
sea.height;      // 9.5 m. Nothing has changed but the air.
sea.state;       // 'dying'

// an hour on
sea.windSea.height;   // 2.1 — the wind sea has gone
sea.swell.height;     // 9.1 — and the SWELL has all of it
// a day on
sea.height;           // 4.3 m, under a sky with nothing in it
```

Nothing is lost when the wind stops: the sea stops being wind sea and becomes swell, which is a train that does not answer the wind at all. That asymmetry is the module. A boat can shelter from wind behind a headland and cannot shelter from the swell that came round it; a harbour mouth is workable in a gale and unworkable the morning after one.

The bookkeeping is in **energy**, not in height. Take it off one train linearly and add it to the other in quadrature and most of it simply disappears — written that way, a full Atlantic gale of nine and a half metres came down to two and a third in one hour, which is the exact opposite of what this is for.

```js
sea.height;   // √(windSea² + swell²) — two 3 m seas crossing make 4.2, not 6
```

## You cannot make an ocean sea in a lake

A sea needs **fetch** — open water for the wind to work on — as well as time:

| kind | fetch | what 20 m/s can raise |
| --- | --- | --- |
| `lake` | 3 km | 0.56 m |
| `coastal` | 30 km | 1.77 m |
| `shelf` | 200 km | 4.57 m |
| `ocean` | 2000 km | 9.84 m |

```js
createSeaState({ kind: 'lake' }).setWind(20, 0);   // limit 0.56 m
// …and blowing for a week will not change it
```

The era axis here is not *when* and not *what she asks of you* — it is **how much sea this water can hold**. A gale in a lake is unpleasant and not dangerous, and that is a fact about the lake.

```js
sea.limit;      // the most this wind could ever raise HERE
sea.building;   // seconds until it is within a tenth of that
sea.fallsTo(2); // …and seconds until it is down to two metres again
```

`fallsTo` returns `Infinity` below `limit`, because under a held wind the sea will never go there.

## Two seas at once, from different directions

The swell came from somewhere else, so it comes from somewhere else:

```js
sea.swellIn(215, 3.6, 11);   // a storm a thousand miles away, days ago
sea.setWind(13, 315);        // …and a fresh breeze from the north-west

sea.confusion;   // 0.76 — and this is the dangerous one
```

Where two trains cross there is no pattern to steer to. `confusion` peaks when they are the same size and crossing at a right angle, and is zero when they run together — which is why a big swell with the wind behind it is comfortable and the same swell on the beam is not.

The ocean carries both. Its shader has always taken a direction **per wave**; it was only the tuning loop that put all four components on one heading. Given a sea state, two run with the wind sea and two with the swell, and that is the difference between a sea and a wave.

## A swell tells you how far it came

```js
sea.swell.period;   // 11.2 s fresh… and 12.9 s three days later
sea.swell.length;   // …so it lengthens as it goes
```

The short components die first, so an old swell is a long low one. A very long swell under a clear sky means weather somewhere you cannot see.

## The four states

`'calm'` · `'building'` · `'full'` · `'dying'` — classified from **the sea against the wind that is on it now**, with a two-sided band.

`'dying'` is the state the module exists for: a big sea running under a wind that could not possibly have raised it, because the wind that did has gone somewhere else. Nothing that models the sea as a function of the current wind can reach it at all.

```js
sea.douglas;   // 0–9, the scale everybody actually quotes
```

Douglas 0 is *glassy* — not "small" but nothing at all — so the bottom of the scale is a case and not a mark. Written as a mark at zero, a millpond comes out as sea state 1 and the scale never reads its own first entry.

## The surface a boat floats on is the surface you can see

`createOcean({ sea })` overrides `amplitude`, `wavelength`, `direction` and any `wind`. Its `heightAt` reads the same live wavenumbers the shader gets, so the water a hull floats on and the water you are looking at are one surface. They were not, at first: `heightAt` read the wavelength the ocean was *constructed* with while the mesh ran on the live one, and a boat floated on a sea nobody could see.

See **?view=sea** in the gallery — a big old swell from the south-west, a fresh breeze from the north-west, and the clock at sixty times life. Bring a gale on with `gallerySeaWind(20, 315)`, then take it away with `gallerySeaWind(0)`, and watch what does not happen.
