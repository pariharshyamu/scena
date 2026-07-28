# Hazards & the pressure plate

The props where movement itself is the game — and the plate that turns
every door SCENA ships into puzzle vocabulary. All of them speak the
trilogy's structural dialect: `{center, radius}` triggers, live
`delta`/`velocity` vectors for riders, and a mechanism contract GAMA
can wire without either library importing the other.

## Moving platforms

```ts
const platform = createPlatform({
  motion: 'linear',          // or 'orbit' | 'pendulum'
  from: a, to: b, period: 6,
});
scene.add(platform.group);

// per frame:
platform.update(dt);
if (standingOnIt) rider.position.add(platform.delta);
```

`delta` is *exactly* how far the platform moved last update — add it to
whoever stands on top and they ride; skip it and they moonwalk off the
edge. `velocity` is there for launching off with momentum. Linear
motion eases through its turnarounds (no jerk); orbit circles; pendulum
swings below the group origin.

## Crumbling platforms

```ts
const slab = createCrumblingPlatform({ delay: 0.7, respawn: 3 });
if (heroStandsOnIt) slab.disturb();
```

**The warning is the gameplay.** A floor that drops unannounced is
unfair; one that shudders for `delay` seconds first is a decision you
made. States run `solid → shaking → falling → gone → returning`;
`solid` (the getter) stays true through the shake — you can still jump
off — and `disturb()` on anything but a solid slab does nothing.

## Bounce pads, pendulums, spikes, conveyors

```ts
const pad = createBouncePad({ strength: 11 });
if (landedOnPad) velocity.y = pad.bounce();   // squash-and-stretch plays itself

const blade = createPendulum({ length: 3 });  // hang it from a beam
// blade.hazard.center RIDES THE TIP — test against it, live.

const trap = createSpikeTrap({ mode: 'cycling' });   // or 'triggered' + spring()
if (trap.dangerous && standingOnIt) health.damage(...);
// Out FAST (the danger), in slow (the tell).

const belt = createConveyor({ speed: 1.6 });
rider.position.addScaledVector(belt.velocity, dt);   // world-space, yaw-aware
```

The conveyor's motion is instanced chevrons, not a texture scroll —
readable at any angle, one draw call, and `velocity` follows the
group's rotation so a turned belt pushes the turned way.

## The pressure plate

```ts
import { createPressurePlate } from 'scena3d';
import { linkMechanism } from 'gama3d';

const plate = createPressurePlate();          // { latching: true } for puzzles
linkMechanism(plate, door);                   // ← the whole point

// per frame — any occupancy source works (GAMA Occupancy, a trigger test):
plate.occupy(countStandingOnIt);
plate.update(dt);
```

The plate is shaped exactly like GAMA's `MechanismSource` — `open`,
`toggle()`, `set()`, `onChange` — so `linkMechanism(plate, door)` gives
a level its first circuit. Momentary plates release when everyone steps
off (a door held); latching plates stay pressed (a puzzle solved), and
only a deliberate `set(false)` resets them. The test suite wires a
plate to a door through the *actual* gama3d `linkMechanism` — the
cross-library bet is exercised, not assumed.

## Verification notes

Two lessons this release added to the record: the playground falls back
to its first example for unknown ids, so the verifier now rejects a
typo'd id instead of happily verifying the wrong page under the right
name; and `treadPlate` is spelled `diamondPlate` — the compiler catches
what memory invents.
