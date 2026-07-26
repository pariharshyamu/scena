# Steam — a store, and why full ahead is not her fastest

Every other way of moving a hull in this library gives you more when you ask for more. Trim a sail better and she goes faster. Pull harder on an oar and she goes faster. A steam engine does not.

```js
import { createSteamPlant } from 'scena3d';

const plant = createSteamPlant({ kind: 'triple' });
ship.object.add(plant.object);

plant.setDraught(1);
plant.setRegulator(1);
plant.setLink(1);                       // full gear — and she will be beaten
plant.setLink(plant.linkFor(3600));     // …by this, by a third
```

Open her right up and half an hour later she is slower than she would have been all day at a quarter cut-off. That is not a penalty anybody wrote into the model. It falls out of one fact: **the regulator spends a store that the fire fills about a hundred times more slowly than the engine empties it.**

## The store is the whole model

One integrated number — the water temperature in the boiler — with a signed balance across it:

```
balance = raised − lost − engine − auxiliaries − vent − dumped
```

Everything else is a *read* of that number rather than a second copy of it:

```js
plant.temperature   // the one thing that is integrated
plant.pressure      // NOT stored: pressureFor(temperature), every time you ask
plant.balance       // °C/s, SIGNED. The value that was integrated this step.
```

`balance` being signed is the point. A boiler is not chasing a setpoint; it is making steam and spending it at the same time, and those are two different terms. That is why she can be **flat out on the fire and losing pressure**, which no chase-toward-a-target model can represent at all.

## The needle that does not move

Pressure is derived, so the first stretch of a cold light-up looks like nothing happening:

```js
const plant = createSteamPlant({ kind: 'triple', pressure: 0 });
plant.setDraught(1);
plant.state;      // 'raising' — the fire is lit and the funnel is black
plant.pressure;   // 0.0, and it stays 0.0 for two and a half hours
```

Below 100 °C the absolute pressure is under one atmosphere, and a gauge measures the *difference*, so it reads nothing. Nearly forty per cent of a triple's light-up is spent with the needle flat on its stop while the water goes from cold to boiling. A launch gives you a fifth of that, and a paddle steamer over half.

## She needs notice

```js
plant.noticeFor(plant.working);   // seconds, from where she is now
plant.reach;                      // the pressure THIS fire would settle at
plant.holdsFor(8.0);              // seconds she will still have 8 bar
plant.endurance;                  // === holdsFor(low)
```

`reach` is a getter and never a table row. The pressure a banked fire holds at depends on the scale on her tubes and on what the engine is taking, and it moves as both change — a written-down figure is the single easiest number in this family to get wrong. `noticeFor` returns `Infinity` for anything above `reach`, which is the honest answer: that fire will never get her there, and a number would be a lie.

Both assume you are **not steaming while you wait**, which is what notice means. The same honest omission as `layline` ignoring the tide.

## Full ahead is not her fastest

The reverser is not a gear selector, it is the **cut-off**: what fraction of the stroke steam is admitted for. Admit it for a fifth and let it expand for the rest, and:

```js
expansionRatio(0.2);   // 0.52 — still half the work…
steamPerWork(0.2);     // 0.38 — …on 38% of the steam
```

That logarithm is the entire argument for expansion, and it is why the two curves separate. Full gear is enormous torque and enormous consumption; the boiler cannot keep up, the pressure sags, and the ship that opened her up is overhauled inside an hour by an identical ship that did not.

```js
plant.linkFor(3600);   // the longest cut-off she can hold for an hour
```

It is signed to her current direction and you hand it straight back to `setLink`. It is the exact analogue of `layline`: ask for a passage and get a setting she will actually keep, instead of ordering full ahead and finding out in half an hour.

It is also why mid-gear makes no torque, and that is a **limit and not a wall** — `expansionRatio(c) → 0` as `c → 0`, reached smoothly, with nothing written to stop her. The die block slides to the middle of the expansion link at exactly the instant the torque goes to zero, so the geometry and the physics are the same claim seen twice.

## Dead centre

```js
plant.onCentre;   // steam on, regulator wide, and nothing happening
plant.barOver();  // a quarter turn by hand, and she goes
```

The torque a crank can make is `Σ|sin θ + (λ/2) sin 2θ|` over the cylinders. For one cylinder that reaches **zero**, twice a revolution. For two at ninety degrees it never falls below 0.78. So a launch can stop with a full boiler and a wide-open regulator and simply sit there, and nothing else here can — and that is not a special case anywhere in the code, it is the sum reaching zero.

`cyls` is a behaviour, not a mesh count.

## What the funnel tells you, and what it does not

The plume reads the **fire**. It never reads the boiler:

```js
plant.plumes[0].rate;   // soot — follows `firing`
plant.plumes[1].rate;   // grease — the black puff of a fresh shovelful
```

So during a sprint the funnel is black *and* the gauge is falling, which is the pair of things that says the store is being spent. And she makes her dirtiest smoke barely moving — ease her to let the boiler rebuild with the damper still wide and no engine drawing on it, and there is your blackest funnel. Nobody wrote that down.

Both plumes are **normal-blended**, because near-black smoke under additive blending is invisible while `rate` reads perfectly. The safety valve's feather is `createSteam` and additive, because it is steam. The two are not interchangeable in either direction.

```js
plant.stoke();          // coal on: raises the bed, and makes the black puff
plant.stoke();          // …and on a launch this is a SILENT NO-OP
```

That no-op *is* the era axis. The same call keeps a Scotch boiler alive and does nothing whatever to a burner — the same shape as hearth → induction, landed on the axis this whole track is about.

## Shut her in before you reverse

```js
plant.setRegulator(0);
plant.astern(1);
plant.setRegulator(1);
```

Swinging the reverser with steam on the valves dumps a chestful, and the link itself travels heavier — so the careless way costs pressure *and* takes longer. Neither number is written; both come out of the dump term and the travel-effort term.

## Working her

```js
plant.setDraught(1);       // damper wide
plant.bank();              // banked: a simmer she will hold for days
plant.fireDoor.set(true);  // …and the draught drops to 0.35 while it is open
plant.blowDown();          // scale off the tubes, at the cost of hot water
plant.setImmersion(0.15);  // she races over a crest and pushes nothing
plant.walk;                // stern to port going astern — into ShipInput.drift
```

Opening the fire door costs steam. One multiplier, and it is why the needle sags every time you shovel.

## The kinds, and what each asks of you

| kind | working | light-up | fires drawn | notes |
| --- | --- | --- | --- | --- |
| `sidelever` | 1.2 bar | 3 h | 9 h | paddle wheels, 20 rpm, blows off constantly |
| `compound` | 7 bar | 7 h | 13 h | the first engine that could cross an ocean |
| `triple` | 12.5 bar | 10 h | 15 h | a week on the coal a paddler burns in a day |
| `launch` | 11 bar | 11 min | 1.2 h | asks nothing of anybody — and stops on dead centre |

The era axis is **what she asks of you to give you power**, and the light-up column is not sorted by date. The same water and iron that makes a triple slow to raise makes her slow to go cold, which is exactly why ships banked their fires instead of drawing them: ten hours from cold, and twenty minutes from banked.

Every thermal number in that table was derived rather than chosen — `lag` from the cold-down, `fire` from how often the safety valve lifts, `flue` from the light-up, and the banked draught in closed form from where she has to hold. Solve it the other way round, picking a banked draught and hoping, and the full-fire ceiling locks onto the banked hold so the safety valve can never lift at all: the flue loss and the heat are both proportional to the firing rate and they cancel.

## Fast-forward

```js
plant.settle(4 * 3600);   // four hours, at coarse steps
```

`settle` places the shaft and the hull at their closed-form fixed points and **relaxes toward them rather than snapping**, because snapping puts the shaft at full revolutions on the first step and a launch fast-forwarded arrives at half the pressure of the same launch watched. It also refuses to start an engine stopped on dead centre, and it emits endpoint states only — which is documented here rather than pretended away.

`settle` and every projection (`holdsFor`, `endurance`, `linkFor`) assume **somebody is keeping the fire in**. In real time that is your job: `stoke()` when `bed` gets low, or she goes out.

## Two numbers wide

```js
game.onUpdate((t) => {
  plant.update(t.delta);                                     // FIRST
  ship.update(t.delta, { speed: plant.way, drift: plant.walk });
});
```

`way` is already in hull units and goes straight into `ShipInput.speed` — like `OarBank.way` and unlike `SailRig.drive`. `thrust` is telemetry; do not hand it to the hull. Neither library imports the other.

See **?view=steam** in the gallery — four plants, three decisions and one state, and the whole of the module is in the gap between the red ship and the green one.
