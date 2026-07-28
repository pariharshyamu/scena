# Aviation: planes & the airfield

The vehicle kit grows wings. Same contract as the cars and the boats:
the prop renders and animates; WHO flies it is GAMA's problem.

## createPlane

```ts
const trainer = createPlane({ style: 'prop' });
scene.add(trainer.object);
// per frame, from whoever is flying:
trainer.update(dt, { throttle, pitch, roll, yaw, gearDown });
```

Two styles: `prop` (a high-wing trainer, fixed tricycle gear) and
`airliner` (a short-haul tube with swept wings, podded fans, and gear
that folds away over a second and a half — never instantly). The
airplane *shows* its state: the propeller spins with throttle and
becomes a translucent blur disc past a third power; the elevator,
differential ailerons and rudder deflect with the intent; the wingtip
nav lights — red port, green starboard, white tail strobe popping the
aviation double-flash — are luminous **claims** that register with a
`LightBudget` like any street lamp, under one `setLit` master. A
`pilot` slot seats an ANIMA character with the `drive` pose.

## The airfield

- **`createRunway`** — asphalt, centreline dashes, threshold piano
  keys, and the vector font finally lying flat: the number you ask for
  at the near end, and the far end automatically painted with the
  reciprocal (27 ↔ 09), because that is what runways do.
- **`createWindsock`** — instrumentation, not decoration. Feed
  `update(dt, wind)` anything shaped like a `WindField` and the sock
  swings downwind (with lag — socks swing, they don't snap) and droops
  as the wind dies. `angle` and `droop` are readable, which makes the
  weather unit-testable.
- **`createHangar`** — an open-front arch on a concrete slab.
- **`createHelipad`** — the ring and the H, for the helicopter release
  to land on.

## The airfield playground

The `airfield` example flies the trainer around a closed traffic
pattern — takeoff roll, climb-out, downwind, base, final, touchdown,
around again — banking with the curve, throttle following the climb.
Probes watched altitude cycle 0.9 → 15.2 → 0.03 → 9.9 with the lap
counter ticking, and the sock's angle veer in lockstep with the
turning wind.

## createHelicopter

```ts
const heli = createHelicopter({ seed: 4 });
scene.add(heli.object);
for (const claim of heli.claims) budget.register(claim);
// per frame: heli.update(dt, { rotor, cyclicPitch, cyclicRoll, light });
```

The rotors have inertia — spooling takes seconds, not a frame — and the
blades **droop** when parked, coning flat as the lift comes in; past
half spool both rotors blur into translucent discs, the tail rotor
doing the same job sideways. The cyclic tilts the rotor *disc* (the
fuselage attitude is the flight controller's job, elsewhere). Skids,
nav lights and the tail strobe come from the same kit as the planes.

The crown piece is the nose **searchlight**: an aimable pivot with an
additive beam and a luminous claim whose priority outranks the street
lamps — the LightBudget hands it a real light the moment it switches
on. It is built to be the visible half of a GAMA `Flashlight` sweeping
an `Illumination` field: aim the pivot where the Flashlight aims, and
the beam the player sees and the exposure the game computes never
disagree.

The `heliport` playground flies the night shift on rails: spool, lift
from the H, orbit with the light holding the pad, return, settle, wind
down, again — probes tracked the phase machine end to end with the
budget pinned at its maximum throughout.

## createFighterJet

```ts
const jet = createFighterJet({ hardpoints: 2 });
scene.add(jet.object);
// per frame: jet.update(dt, { throttle, pitch, roll, yaw, gearDown, afterburner });
// firing: const launch = jet.launchFrom(0);
//         if (launch) missiles.fire(launch.position, launch.direction, target);
```

A delta-wing fighter: extruded delta, **elevons** — each trailing
surface mixes pitch and roll, because that is what elevons are (pure
pitch moves them together, pure roll opposes them, both tested) — a
big fin, folding gear, and an **afterburner** whose flame lights past
80% throttle (or on command) and breathes on its own seeded nerve.

The under-wing **hardpoints** carry dummy rounds. `launchFrom(i)`
hides the round and returns the launch pose in world space — position
and nose direction — shaped exactly for GAMA's `Missiles.fire`, so the
missile the game flies is the missile the wing stops carrying.
`rearm()` hangs fresh ones.

The `jets` playground flies a two-ship display circuit in echelon:
low pass over the numbers, burners in the pull (probes watched `armed`
drop 2 → 1 as the lead cleared a rail at the top), gear cycling, and
elevons following the curve.
