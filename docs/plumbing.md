# Plumbing — the first thing that is somebody else's fault

Everything else in this library is local. A boiler makes steam out of its own fire; a hull floats on its own displacement; a light is a fact about one observer. None of them has any opinion about what else is happening in the world.

A water supply is a **network**, and a network's defining property is that it is shared. This is the first module in the trilogy where two objects interfere with each other without either one knowing the other exists.

```js
import { createPlumbing } from 'scena3d';

const house = createPlumbing({ kind: 'mains' });
house.outlet('shower', { kind: 'shower', height: 2.6 });
house.outlet('basin', { kind: 'tap', height: 1.5 });
house.outlet('wc', { kind: 'wc', height: 1.1 });

house.open('shower');
house.update(0.1);
house.setTarget('shower', 40);   // turned until it felt right
```

## The shower scalds when the lavatory is flushed

Everybody has had this happen and almost nobody has the mechanism right. It is not a temperature failure. **It is a pressure failure that arrives as a temperature.**

A mixer set to 40 °C from 60 °C hot and 10 °C cold is running 60 % hot. A WC draws from the **cold branch only**. The cold manifold's pressure drops, so the cold flow through the mixer drops — and the hot does not, because nothing happened to the hot branch. Same hot, less cold:

| cold flow left | delivered | |
| --- | --- | --- |
| 100 % | 40.0 °C | |
| 72 % | 43.8 °C | a basin tap opens |
| 55 % | 46.6 °C | a WC fills — **scald** |
| 25 % | 52.9 °C | burns in seconds |
| 0 % | 60.0 °C | you are standing under the cylinder |

```js
house.drawAt('shower').temp;   // 40.2
house.open('wc');
house.update(0.1);
house.drawAt('shower').temp;       // 46.1
house.drawAt('shower').scalding;   // true
```

Nothing in the shower changed. Nothing in the mixer changed. Somebody in another room pressed a lever.

The two branches are solved **separately**, and that is the module. Solved as one supply they fall together, the mixture stays at 40 °C, and there is no scald anywhere — which is a plumbing system nobody has ever lived in.

```js
house.pressure;      // 0.70 bar — the cold, and it collapsed
house.hotPressure;   // 1.76 bar — the hot, and nothing touched it
```

## Set it by temperature, because that is what a person does

Nobody turns a shower to "sixty per cent hot". They turn it until it feels right, with whatever else in the house happens to be running at that moment — and then the setting is fixed.

```js
house.setTarget('shower', 40);   // right for this house, at this instant
```

`setMix` is there too, but calibrating an example by mix fraction quietly assumes the tap knows something it cannot know, and hides the entire failure.

## What happens to the person in the shower

The era axis, and it is not about how much water you get.

| kind | what a flush does to the shower |
| --- | --- |
| `bucket` | nothing. There is no network, so there is nothing to share. |
| `gravity` | takes the **flow**. A loft cistern is a third of a bar and has nothing to spare. |
| `mains` | takes the **temperature**. There is flow to spare, so it arrives the other way. |
| `thermostatic` | takes a little flow, and holds the temperature. |

A bucket has no contention because it has no network — which is not primitive, it is **uncoupled**, and it is the only supply here that cannot scald anybody.

```js
bucket.drawAt('shower').scalding;   // false, whatever anybody else does
bucket.pour('shower', 12);          // the one way of getting water no supply
                                    // failure can take away from you
```

And `thermostatic` is the inversion at the end — the same shape as a gyro stabiliser that needs no way from you and a sectored light that navigates instead of you. **It does not stop the contention. It stops the contention reaching you**, and the bill is paid in flow:

```js
thermo.drawAt('shower');   //  9.6 L/min at 39.3 °C
thermo.open('wc');
thermo.update(0.1);
thermo.drawAt('shower');   //  5.6 L/min at 39.3 °C — 42 % of the flow, gone
```

If the cold fails altogether it shuts off rather than deliver sixty degrees.

### Weak and dangerous are not the same failure

```js
draw.usable;     // enough to be worth standing under
draw.scalding;   // over 44 °C
```

Both are ways for a shower to stop being a shower and they are not interchangeable, which is why the gallery paints three colours rather than two. The thermostatic house gives up flow *precisely so that* it never goes red.

## The store empties seven times faster than it fills

```js
house.hotLastsFor() / 60;   //  20 minutes
house.reheatTakes() / 60;   // 140 minutes, on a 3 kW immersion
```

Which is the steam plant again in a different trade: a store the heater fills far slower than the outlet empties it. There is no way to have a long shower and a hot bath afterwards, and no setting anywhere that changes it.

And it does not *cool* — it **runs out**:

```js
run(house, 300);   house.drawAt('shower').temp;   // 40.2 — unchanged
run(house, 900);   house.drawAt('shower').temp;   // 40.2 — still
run(house, 1200);  house.drawAt('shower').temp;   // 10.0
```

The cylinder is stratified: hot floats on the cold feed coming in underneath and is drawn off the top at very nearly full temperature until it is gone. So the shower stays perfect, and stays perfect, and then falls off a cliff — which is what everybody has actually stood in, and nothing like the gentle fade a stirred-tank model produces. Modelled as a stirred tank it starts cooling in the first second and is tepid in three minutes.

`hotLastsFor` reports when the **delivered** water stops being warm enough, not when some notional litre count reaches zero, and asking does not spend any of it.

## Height is pressure

On gravity the pressure at an outlet is the head above it and nothing else, so the same house gives a different shower on each floor:

```js
// a cistern at 8 m
ground (0.0 m):  0.79 bar  ->  7.0 L/min
first  (2.7 m):  0.50 bar  ->  5.5 L/min
second (5.4 m):  0.24 bar  ->  3.5 L/min   — not worth standing under
loft   (9.0 m):  0.00 bar  ->  0.0 L/min   — above the cistern
```

That is the whole argument for a pump, and the whole reason the cistern is in the loft.

```js
draw.pressure;   // bar AT THE OUTLET
```

Not at the manifold. The manifold reads *backwards*: raise an outlet and it draws less, so the manifold pressure goes **up** while the shower gets worse.

On mains, height barely matters — which is the other half of why people replace gravity systems.

## What the supply is being asked to do

`'idle'` · `'easy'` · `'strained'` · `'starved'` — and measured in **consequences**, not in how much of the source pressure is still standing. That was the first attempt: it is a number about the pipe, it has to be tuned against whatever resistance the pipe happens to have, and with a realistic branch it called one shower on a mains supply `'strained'`.

```js
house.state;    // 'easy'
house.demand;   // 26.5 L/min — what is actually leaving, not what was asked for
```

A WC is the one outlet that does not mind being starved, because a cistern is a **buffer**: starve it and it simply takes longer to fill, and nobody is standing in it while it does. Given a shower's expectations it drags a whole house to `'starved'` over a fixture that is perfectly happy.

## The resistance that matters is the branch

Not the main. What kills a shower is the fifteen-millimetre run the bathroom shares, and the cold one is always worse because it feeds the WC, the basin and everything outside as well. Sized off the main instead, a flush moves the shower six tenths of a degree and the module has nothing to say.

See **?view=plumbing** in the gallery — four houses, somebody in the shower in each, and one flush at twelve seconds doing four different things.
