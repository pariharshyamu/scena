# The lit coast — a light is a fact about the observer

Everything else in this library is a thing that *is*: a hull that floats, a boiler that makes steam, a net that comes fast. A light is none of those. It does nothing where it stands. Its whole function happens fifteen miles away in somebody else's eye, and every number on it is really a number about that eye.

```js
import { createSeamark, NM } from 'scena3d';

const light = createSeamark({ kind: 'flashing' });   // 40 m, 200 000 cd
light.object.position.set(0, 0, 0);

const s = light.sightedFrom(boat.x, boat.z, 4);   // ← height of eye, in metres
s.range / NM;    // 17.3 nautical miles
s.limitedBy;     // 'horizon'
s.state;         // 'showing'
```

## The curvature decides it, and the lamp does not

A light has two ranges and you get the **smaller**:

- the **geographic** range, where it drops below the horizon — `2.08(√H + √h)` nautical miles, a function of how high the lamp is and how high your eye is and of *nothing else at all*;
- the **luminous** range, where it simply gets too faint — a function of the lamp and the visibility, and of nothing else.

So when a light will not reach, make the lamp bigger. Double it, and again, and again:

| lamp | luminous | **seen** |
| --- | --- | --- |
| 200 000 cd | 18.5 nm | **18.5** |
| 400 000 | 20.2 | **20.2** |
| 800 000 | 21.9 | **20.4** |
| 1 600 000 | 23.7 | **20.4** |
| 20 000 000 | 30.5 | **20.4** |

A hundredfold lamp buys under two miles and then nothing whatever, for ever. The horizon does not negotiate. Past that point the only thing that buys range is **height** — of the tower, or of the eye looking for it — and that is why lighthouses are on cliffs, and why the answer to "we cannot see it" was never a bigger lamp.

## The same light, the same night, and two boats that see differently

`heightOfEye` is not a detail. A man standing in an open boat has his eye about 1.5 m up; the officer on a ship's bridge has his at 12 m.

```js
light.sightedFrom(x, z, 1.5).range / NM;   // 15.7 — and limitedBy 'horizon'
light.sightedFrom(x, z, 12).range / NM;    // 18.5 — and limitedBy 'lamp'
```

Not only a different range: a different **reason**. And it inverts — with a feeble light, raising your eye buys nothing at all, because you were never near the horizon to begin with:

```js
const fire = createSeamark({ kind: 'bonfire' });
[1.5, 12, 30, 100].map((h) => fire.sightedFrom(x, z, h).range / NM);
// [7.5, 7.5, 7.5, 7.5]
```

## Coming up on it

```js
s.state;   // 'dark' → 'loom' → 'raising' → 'showing'
```

`'loom'` is the one people forget. A light is seen **in the sky** for miles before it is seen at all: the beam lights the haze above the horizon while the lamp itself is still under it. It exists only where the horizon is what is hiding the lamp — a light that has simply got too faint has no loom, because there is nothing over the hill.

`'raising'` is the narrow band where the lamp sits *on* the horizon. Standing up brings it in sight and crouching puts it out, and that gives you a distance:

```js
light.dips(4) / NM;    // 17.3 — she raises it here, and now she knows her range
light.dips(12) / NM;   // 20.4
```

It is the one navigational fix in this library that costs nothing but knowing how tall you are.

## What tells you it is that light and not another one

The era axis, and it is about **identity** rather than power.

| kind | how you know which light it is | charted | identifiable |
| --- | --- | --- | --- |
| `bonfire` | you do not — a burning barn looks the same | no | no |
| `harbour` | by where it is, and a fixed light is a fixed light | yes | **no** |
| `flashing` | by its character: `Fl(3) 15s` is a name you can look up | yes | yes |
| `sectored` | it tells you where **you** are | yes | yes |

The middle row is the interesting one. A charted fixed light in a known place is *still* indistinguishable from the next fixed light along the coast, and ships were lost on exactly that — which is why characters were invented at all.

And the axis is **not monotone in brightness**. The one that tells you the most has the smaller lamp and the shorter tower:

```js
createSeamark({ kind: 'flashing' }).intensity;   // 200 000
createSeamark({ kind: 'sectored' }).intensity;   // 100 000
```

## In range and lit are different questions

```js
s.inRange;   // close enough to see it
s.visible;   // …and it happens to be lit this instant
```

`Fl(3) 15s` is **dark for eleven and a half seconds out of every fifteen**. A caller testing `visible` once a frame sees a light that is mostly not there, and that is not a bug in the light or in the caller. Both are true statements about the same lamp; charts and passage plans ask the first one.

```js
createSeamark({ kind: 'sectored' }).character;   // 'Oc 8s' — occulting:
                                                 // lit most of the time, with
                                                 // a brief eclipse
```

## A sectored light tells you where you are

```js
const s = light.sightedFrom(x, z, 4);
s.sector.colour;   // 'red'
s.safe;            // false — and there is nothing else to work out
```

You do not take a bearing off it. You look at its colour. That is the inversion at the end of the axis, the same shape as a gyro stabiliser that needs no way from you and a self-righting boat that needs no crew: **it does the navigating instead of you.**

A light with no sectors returns `safe: null` — not `true`. It is not saying you are safe; it is not saying anything at all, and those are very different things to hand a caller.

### The red sector is shorter than the white one, always

```js
white.luminous / NM;   // 16.8
red.luminous / NM;     // 13.6
green.luminous / NM;   // 12.9
```

Coloured glass eats three quarters of the lamp, so the same light does not reach as far exactly where it matters most. Charts draw the arcs at different radii for this reason. In the white fairway that light is **horizon**-limited; twenty degrees round in the red it is **lamp**-limited — the same tower, the same night, and even the reason has changed.

### Which way round the bearings go

Sectors here are defined by the bearing **outward from the light** — the direction you are, seen from the tower. Charts quote them the other way, as bearings *from seaward*, and the two differ by 180°. Take one for the other and the red sector lands squarely over the fairway, which is a way of putting a ship on the rocks with entirely correct arithmetic.

```js
light.sector('leading', deg(80), deg(100), 'white');
light.sectorAt(deg(90)).name;   // 'leading'
```

## Fog eats the lamp and the horizon does not care

```js
light.setVisibility(0.5);
s.geographic / NM;   // 20.4 — unchanged. It is a fact about the earth.
s.luminous / NM;     // 1.7
s.range / NM;        // 1.7
```

And when you cannot see it at all, you listen for it:

```js
light.sounding;       // blowing — it answers the visibility, not the lamp
light.audibleRange;   // …and it is the least trustworthy number on the object
```

Sound goes over the top of you, round headlands, and into silent sectors close under the station itself. A fog signal tells you a station is there. It does not tell you where.

## The daymark

A lighthouse is a mark around the clock and is unlit for half of it, so the painted bands are not decoration — they are how she is identified in daylight, when the whole rest of this module is asleep. `bonfire` and `harbour` have none, which is part of why neither is identifiable.

## What no frame can show

There is no camera that holds a light and its range at once. The sectors it throws are thirteen nautical miles long and the tower they come out of is twenty-five metres tall — five orders of magnitude apart. A frame containing the architecture cannot contain the subject, and a frame containing the subject shows the towers as points.

That is not a shortcoming of a renderer. It is what a lighthouse *is*, and it is why `showSectors(on, scale)` takes a scale: drawn at a twentieth the ratios survive, and the ratios are the whole claim.

See **?view=coast** in the gallery — four marks on a dark shore, and a boat standing out of the white fairway into the red.
