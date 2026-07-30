# Rail

Rail is the one vehicle class that does not steer.

Everything else in the trilogy picks a direction and integrates it — agents
steer, cars drive, aircraft bank, boats sail. A train's entire position is
**one number**: how far along the track it is. `track.at(distance)` turns that
number into a place and a facing, and everything else here follows from it.

```ts
import { createTrack, createConsist, createLocomotive, createCarriage,
         createStationPlatform } from 'scena3d';

const line = createTrack([{ x: -320, z: -40 }, { x: 90, z: 60 }, { x: 340, z: 60 }]);
scene.add(line.object);

const train = createConsist(line, [
  createLocomotive({ seed: 4 }),
  createCarriage({ seed: 11 }),
  createCarriage({ seed: 12 }),
]);
scene.add(train.object);

train.place(240);          // the whole train, front at 240 m
```

That constraint is a gift, not a limitation: it is what makes exact schedules,
predictable arrival, and centimetre platform alignment possible at all.

## `at(distance)` measures distance

`CatmullRomCurve3.getPoint(t)` walks the curve's **parameter**, which is not
distance. On a curve with a tight bend and a long straight, equal steps in `t`
cover wildly unequal ground — and a train driven on `t` speeds up and slows
down for no reason on every bend. Same class of defect as foot skate, and just
as invisible in a still frame.

So the curve is resampled to equal arc length once, at build time, and `at()`
interpolates that table.

**Measured on the way in:** three.js builds its arc-length lookup from
`arcLengthDivisions`, default **200**. On a 737 m line that is one entry every
3.7 m, and the "equally spaced" points came out **8.3% uneven**. Scaling the
table with the line took `distanceError` to 0.00%, and `at()` is now honest to
**0.02%** over a 10 m step. `distanceError` is reported on every track so the
number is visible rather than assumed.

Past the ends it **clamps** (or wraps, on a loop). A train that overruns should
stop at the buffers, not fly off down the tangent into the scenery.

## The consist: why it is not N props in a row

A vehicle on a curve does not face the way the track faces at its centre. It is
a rigid body resting on two bogies, and it faces along the **chord** between
them. `place` samples the track twice per vehicle, puts the body on the bogie
midpoint, and faces the chord.

Two extra samples per carriage per frame, and it is the difference between a
train and a string of boxes shrink-wrapped to a spline. The test asserts the
chord and the centre tangent genuinely differ on a bend — otherwise it would
pass on a consist that ignored bogies entirely.

`place(d)` puts the **front** at `d`, not the centre, because a station stop is
"the front at the stopping mark" — what a driver aims at and what a platform is
measured from.

Wheels roll by **distance**, not time: `angle = distance / wheelRadius`. A wheel
spun on a timer slips whenever the train changes speed, which is the rail
version of foot skate.

## The platform publishes its marks

```ts
const platform = createStationPlatform(line, {
  from: 150, to: 242, name: 'HAVENBROOK', doorOffsets,
});
platform.stopMark;   // where the train's front should come to rest
platform.doorMarks;  // where its doors are expected to land
```

A platform is easy to build wrong in a way no screenshot shows: the train
stops, the doors open, and they are two metres past the markings. So it
publishes both, and the test holds a stopped train's doors to **10 cm** of
their markings on the straight.

Round a curve the tolerance is honestly looser — a rigid carriage against a
curved platform genuinely stands off, which is why real ones have a gap you are
warned to mind.

`doorOffsets` comes from the consist you intend to run, not a guess. Change the
train and the markings move, exactly as they do when a real timetable changes.

## Four draw calls of track, however long

| | |
|---|---|
| rails | 2 ribbons, built from the same resampled route `at()` uses |
| sleepers | **one** `InstancedMesh` — 1,133 of them on the 737 m fixture |
| ballast | 1 ribbon |

A kilometre at 0.65 m spacing is over 1,500 sleepers, and a `Mesh` each would
be 1,500 draw calls for something nobody looks at directly. The platform is
instanced the same way: deck, edge strip, door markings, canopy posts, canopy
roof and benches are one call each whatever the length.

The benches were **not**, at first — a 390 m platform cost 15 extra draw calls,
caught by this module's own test before it shipped. That is the defect class
[`npm run geometry`](geometry.md) exists for, appearing in a brand-new prop.

## Goods and passengers

`createCarriage` has doors and seat slots. `createWagon` (`open`, `van`,
`flat`) has neither — freight, not people — and a mixed consist reports only
the passenger doors, which is what a platform aligns to.

## What is not here yet

**No controller.** The track and the consist are geometry and placement; what
drives `distance` is the game's, and GAMA's rail controller is the other half
of this. `createConsist` takes the track **structurally** — anything with
`length` and `at()` — so a controller never has to import SCENA.

**No points, junctions or signalling.** A train that can *choose* a path stops
being a scalar and becomes a graph problem. Worth doing; wrong to do first.

**No level crossings, no interlocking, no overhead line.**
