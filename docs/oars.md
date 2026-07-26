# Under oars — duty cycles and phase-locking

A sail is a curve against the angle to the wind. An engine is a throttle. An oar is neither.

```js
import { createOarBank } from 'scena3d';

const bank = createOarBank({ kind: 'longship', seats: 11, beam: 4 });
ship.object.add(bank.object);

game.onUpdate((t) => {
  bank.update(t.delta);
  ship.update(t.delta, { speed: bank.way, turn: bank.yaw * 0.25 });
});
```

## Thrust is a pulse

The blade is in the water for **under half** of every stroke and out of it for the rest, so:

```js
bank.thrust   // 0 through every recovery — not a small number, none at all
bank.way      // …so her speed SURGES: drive, coast, drive, coast
```

That is not a detail. A galley under oars lurches, the lurch is at the stroke rate, and you can feel the rate from the deck without seeing an oar go past. Publish the *average* thrust and the whole thing quietly becomes an engine with a wooden skin on it.

`way` exists because the surge has to live somewhere. Hand a hull the instantaneous thrust and she jerks to a standstill twice a second; integrate it against drag and you get the motion.

### Slip, and why rating up works

A blade only pushes while it is going sternward **faster than the water it is in**. Once she is already travelling at the speed the blade sweeps, it stops biting and starts being dragged along — the same fact as propeller slip. It does three jobs at once:

- She has a **terminal speed** under oars, and it rises with the rate rather than the model being indifferent to it.
- A crew out of time gets much less bite, because the late blades catch while she is already running from the early ones' drive.
- And pulling one side only does not spin her up for ever.

## It takes several bodies agreeing

Nothing else in the trilogy needs that. Every rower drives off one shared number:

```js
bank.phaseAt(seat)   // 0 at the catch, ~0.4 at the finish, 1 back round again
```

and ANIMA's rowing controller takes that same number and writes a body with it. Neither library imports the other, and the handshake is a **scalar** — a shared clock rather than a shared field or a shared frame. It is a third kind, and the only one that can say *together*.

### The stroke propagates down the boat

Nobody watches the coxswain. They watch the blade in front, so every seat is a little later than the one ahead of it and `phaseAt` is a different number per seat. That is what `together` sets:

```js
bank.together = 1.0;   // one blade — every catch at the same instant
bank.together = 0.2;   // a ripple runs aft, and she is much slower
```

A ragged crew is genuinely slower, and the honest reason is worth stating plainly: **part of that is a term written into the model rather than one that fell out.** Spreading the same total pull over more of the cycle actually makes a hull *faster* — a steady push beats a pulsed one against drag — so left to itself the physics says a shambles is quick, which is the opposite of every crew that ever rowed. What is missing from it is the rower. A man out of time is not applying the same force a moment late; he is washing out at the catch and checking her at the finish, fighting the boat through his own stretcher while the rest of them fight him back. That is a property of the body, not of the water.

## Catching a crab

```js
bank.crab(3);      // one blade of one seat — never both
bank.crabbing;     // fraction of the bank currently fouled
```

A crab is **worse than not rowing**. The blade is caught flat and being dragged through the water, so that oar's contribution goes *negative* — and because it is one blade and not a pair, she slews. The loom kicks up, which is the one thing in a boat everybody sees at once. She recovers over a couple of strokes.

## Working her

```js
bank.setRate(30);          // strokes per minute, capped per kind
bank.setEffort(1, 0.2);    // pull harder to port — this is how she turns
bank.setEffort(-1);        // back water: she goes astern
bank.setEffort(1, -1);     // one side backing, and she spins in her own length
bank.ship();               // oars in — she keeps her way for a while
bank.out();
```

`yaw` comes out of one side genuinely out-pulling the other rather than being a steering input, which is why backing one side turns her so much harder than easing it.

## Kinds

| kind | oar | rate | in the water |
| --- | --- | --- | --- |
| `skiff` | 2.6 m | 22 spm | 42% |
| `longship` | 4.2 m | 20 spm | 40% |
| `galley` | 5.6 m | 26 spm | 38% |
| `racing` | 3.8 m | 32 spm | 36% |

The harder a boat is driven the *shorter* the fraction of the cycle in the water — a racing crew's recovery is nearly two thirds of the stroke.

## Geometry that matters

An oar is a **lever**: pivoted about a third of the way along, most of it outboard, which is why one person can move a longship. And it runs **down** from its rowlock — the thole is on the gunwale and the blade is under the surface. Get that angle wrong and a whole bank sweeps about in mid-air above the sea while every number in the model stays perfectly correct.

```js
bank.oars[0].grip     // where his hands are, this instant
bank.oars[0].buried   // is the blade in the water?
bank.seats            // PropSlots, one per oar
oarGripAt(phase)      // …and where a body should expect them to be
```

`oarGripAt` is published in the same spirit as ANIMA's `GRIPS`: the prop is built to the body's expectations rather than the body reaching for the prop, so an oar and a rowing pose meet with no runtime IK between them.

See **?view=oars** in the gallery — three crews, one rate, and the only difference between them is how together they are.
