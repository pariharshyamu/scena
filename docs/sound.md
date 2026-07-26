# The PA — the first prop that reaches the ear

Everything else in this library is seen. A hull, a light, a derrick, a boiler: things you look at. Even the fields — `heatAt`, `smokeAt`, `depthAt` — answer questions about where a *body* is.

Sound is the first one where the interesting number is what a **person** can do there.

```js
import { createPA } from 'scena3d';

const pa = createPA({ era: 'array', power: 118 });

pa.levelAt(0, 100);      // 93 dB(A), a hundred metres back
pa.stateAt(0, 100);      // 'harmful'
pa.earshotAt(0, 100);    // 0.18 m — you shout into an ear, or you don't talk
pa.exposureAt(0, 100);   // 4 500 s before the day's dose is gone
```

## Distance is a filter, not a volume knob

Everybody has heard this and almost nobody models it: from far enough away, a band is **all bass**. That is not a mixing choice, it is air. Absorption is about 0.004 dB/m at 125 Hz and 0.15 dB/m at 4 kHz — forty times worse — so distance does not turn the music down, it takes it apart.

```js
//               bass   mid  treble
pa.bandsAt(0,   3);  // 110   111   110    a band
pa.bandsAt(0, 100);  //  85    92    83    a band, further off
pa.bandsAt(0, 300);  //  74    77    47    a PA, over there
pa.bandsAt(0, 800);  //  64    55    33    a thud, two streets away
```

Model it as one number that falls off with range and you get a quiet band. It is not a quiet band, it is a **different band** — which is why `bandsAt` exists next to `levelAt`, and why two points can read the same dB(A) and sound nothing alike.

The same fact runs the other way too. `levelAt` reports dB(A), and A-weighting sits 16 dB down at 125 Hz — so a festival can measure legal at the site boundary while the people two streets away lie awake, because everything they can hear is in the band the meter discounts.

## What it costs the person standing there

The states are not `off` / `low` / `high`. That is a fact about the amplifier, and the plumbing track already spent a version learning that it is the wrong thing to measure.

| state | |
| --- | --- |
| `quiet` | you can hold a conversation |
| `raised` | you are raising your voice and have not noticed |
| `shouting` | you shout into an ear, or you don't talk |
| `harmful` | the day's safe dose runs out in under four hours |

```js
pa.earshotAt(x, z);    // metres a shout still carries
pa.exposureAt(x, z);   // seconds before the daily dose is gone
```

`exposureAt` is real arithmetic, not a mood: 85 dB(A) for eight hours, and a 3 dB exchange rate, because 3 dB is twice the energy. That makes 100 dB(A) fifteen minutes and 115 dB(A) half a minute.

## The era axis: what the front row pays for the back row

A PA has one hard problem and it is not power. It is that the front row and the back row are **the same system**. So the fair question is never "how loud is it" — it is: cover 200 m to a usable 75 dB(A) at the back, and see who pays.

```js
const pa = createPA({ era });
pa.cover(200, 75);      // turn everything down as far as it will go
pa.frontRow();          // and see what that did to the barrier
```

| era | front row | safe for | |
| --- | --- | --- | --- |
| `horn` | 113 dB(A) | 49 seconds | efficient, directional, **no bass at all** |
| `hifi` | 114 dB(A) | 35 seconds | a point source: 6 dB per doubling |
| `array` | 105 dB(A) | 5 minutes | cylindrical, while the near field lasts |
| `delayed` | 91 dB(A) | 2 hours | the same array, turned **down** |

`delayed` is the inversion at the end of the axis, in the same shape as the gyro stabiliser that needs nothing from you, the sectored light that navigates instead of you and the thermostatic mixer that stops the contention reaching you. **It does not make the PA louder — it stops the loudness having to reach that far.** The mains come *down* by fourteen decibels and everybody still hears.

And the currency changes, which is what makes it an inversion rather than an upgrade. Every other era is paid for in watts. This one is paid for in **time**.

## The bill is time

A delay tower is a second copy of the sound arriving from somewhere else. Whether that is a PA or a disaster is decided by a few milliseconds.

```js
pa.alignDelays(0.012);
pa.echoAt(0, 120);   // { spread: 12, state: 'fused', arrivals: 2 }
```

| `echoAt().state` | |
| --- | --- |
| `clean` | one source. Nothing to interfere with. |
| `comb` | under 5 ms. Not an echo — a **filter**. Hollow and phasey. |
| `fused` | the precedence effect: two arrivals, one apparent source. |
| `echo` | over 40 ms. You hear it twice, and you cannot unhear it. |

The non-obvious one is `comb`. Set each tower's delay to exactly its distance over 343 and you have done the arithmetic perfectly and produced the *wrong answer*: the two arrivals land within a millisecond of each other and comb-filter. The extra ten or fifteen milliseconds is not slop, it is the whole point — the mains have to arrive **first**, so the sound still comes from the stage.

```js
pa.alignDelays(0);       // right to the millisecond → 'comb'
pa.alignDelays(0.012);   // twelve late → 'fused'
pa.alignDelays(0.25);    // → 'echo', for everybody
```

Two more things fall out of the model that are worth knowing before you place a tower.

**There is a bad patch immediately behind each one.** A tower is delayed for the crowd *in front of* it; stand seven metres short and its sound is fifty milliseconds late for you. That is not a tuning error — it is what a delay tower is, and it is why they go in the aisles.

**Two towers aligned to the mains are not aligned to each other.** Each was set against the mains and neither was ever asked about the other, so somewhere downfield their own arrivals land a millisecond apart and comb. Correct alignment is not the same as no interference.

## More towers, flatter field

```js
createPA({ era: 'delayed', towers: n }).cover(200, 75);
```

| towers | front row | ripple | safe at the barrier |
| --- | --- | --- | --- |
| 0 | 105 dB(A) | 30 dB | 5 minutes |
| 1 | 96 dB(A) | 28 dB | 39 minutes |
| 2 | 91 dB(A) | 22 dB | 2.0 hours |
| 3 | 88 dB(A) | 18 dB | 4.0 hours |
| 5 | 85 dB(A) | 14 dB | 7.5 hours |

More, smaller sources is strictly better on both counts, and the reason nobody uses twenty is that every one of them is a truck, a tower, a cable run and a fresh chance to get a delay wrong.

## A line array is not a bigger speaker

It is a **different exponent**. A point source spreads over a sphere, so its level falls 6 dB per doubling of distance. Near enough to a tall source the wavefront is a cylinder instead, and 6 becomes 3.

```js
spreadingLoss(20, 0, 'mid') - spreadingLoss(10, 0, 'mid');   // 6.02
spreadingLoss(20, 6, 'mid') - spreadingLoss(10, 6, 'mid');   // 3.01
```

That only holds out to the near-field limit, which is `length² · f / 2c` — **proportional to frequency**. A 6 m hang holds 4 kHz cylindrical out to 210 m and 125 Hz to barely 6:

```js
pa.bandsAt(0, 300);   // bass 74   mid 77   treble 47
```

So the back of a big field does not get a smaller version of the front. It gets a thin, mid-heavy one, and the subs are a separate problem — which is exactly why they are flown and arrayed separately in real life.

## What a wall does depends on the wavelength

```js
pa.barrier('site-hoarding', { x1: -40, z1: 50, x2: 40, z2: 50, height: 3 });
```

A barrier here is a line in plan with a height, and nothing else — which is all a wall is, acoustically. It is not drawn: this is a fact about the sound in the same way `heightAt` is a fact about the ground, and whatever put the wall there draws it.

What a wall does depends entirely on wavelength. The number that decides it is the **Fresnel number** `N = 2δ/λ` — how many half-wavelengths of extra path the sound must take to get over the top. A 3 m wall against a 86 mm wavelength at 4 kHz is an obstacle; against 2.7 m at 125 Hz it is barely there.

```js
// ear 60 m out, wall at 50 m       bass   mid  treble   dB(A)
// no wall                            89    98      91      99
// 2 m                                84    94      90      96
// 3 m                                84    90      79      91
// 5 m                                80    81      68      81
// 8 m                                75    75      63      75
```

Which is the whole reason a hoarding round a building site stops the drilling and not the generator.

One result here overturned my own assumption while writing it: a wall *below* the line of sight still shades the bass. Being able to see the source over the wall is not the same as being clear of the first Fresnel zone, which for 125 Hz at that geometry is nearly five metres across. Maekawa's curve fades to nothing over the transition rather than stopping dead at the sightline, and it is right.

## The field handshake

```js
export interface SoundField {
  levelAt(x: number, z: number): number;   // dB(A)
}
```

The fifth spatial handshake, after `depthAt`, `heatAt`, `chillAt` and `smokeAt`, and deliberately the same shape. SCENA says how loud it is there. ANIMA decides whether a character has to raise their voice. GAMA decides whether an agent wants to be there at all.

`setProgram(0..1)` is the seam for anything that wants to drive the level from outside — a sequencer, a game event, or a real audio source. At 0 the field reads the ambient and nothing else.

See **?view=stacks** in the gallery: four systems doing the same job, the field painted underneath each, and a walker coming forward in every one at the same speed — going amber, then red, at wildly different distances.
