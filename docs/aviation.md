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
