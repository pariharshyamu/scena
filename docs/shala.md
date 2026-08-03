# The shala — a place to practice

The quietest gathering in this library: no seats, no table, no fire — a deck, a grid of mats, and an **orientation**. Surya namaskar faces the sun, so the shala takes a sunrise bearing and lays every student mat facing it, with the instructor's mat out front facing back at the class.

```js
import { createShala } from 'scena3d';

const shala = createShala({ era: 'retreat', students: 8, sunrise: 0.4 });
shala.object.position.set(10, 0, -4);
scene.add(shala.object);
```

## Four rooms, one practice

Like the PA stacks, the shala has eras — the same practice in four rooms:

| era | the room |
| --- | --- |
| `ashram` | sandstone deck between carved columns, a low ashlar wall, bronze finials — the oldest room |
| `studio` | parquet floor, a mirror wall with a barre — the room that rents by the hour |
| `rooftop` | concrete pad, perimeter railing, string lights sagging between the posts — the room with a skyline (the sunrise side stays open; that is what the roof is for) |
| `retreat` | teak planks under a bamboo pergola, planters at the corners, open on every side — the room that is barely a room |

Omit `era` and the seed picks one. The mats are laid *almost* neatly — a few centimetres and a couple of degrees of seeded jitter, because humans lay mats — but the jitter stays out of the spots: a class aligns to the contract, not to the millimetre a mat was dropped.

## `matSpots()` — the handshake

One spot per mat, **in world space**, converted through the prop's transform at call time — move or rotate the shala and the spots move with it, facing included. Index 0 is always the instructor.

```js
const spots = shala.matSpots();   // [{ x, z, facing }, …], instructor first
```

Stand an ANIMA `YogaClass` on it and the room fills — same structural seam as every other cross-library handshake in the trilogy, no imports either way:

```js
const rigs = spots.map((_, i) => createHumanoid({ seed: 880 + i }));
rigs.forEach((rig, i) => {
  const s = spots[i];
  rig.object.position.set(s.x, shala.deckTop, s.z);
  rig.object.rotation.y = s.facing;
  scene.add(rig.object);
});
const cls = new YogaClass(rigs, { seed: 6 });   // rigs[0] took the front mat
cls.start();                                    // the salutation, on the deck
```

The shala's layout and `YogaClass.place()` produce the same geometry — instructor front, rows behind, everyone facing the bearing — so either can own placement; the shala just makes it a *place*.

## The rest of the contract

- `focus` — an `Object3D` above the instructor's mat; aim the class's gaze (ANIMA `LookAt`) or a camera at it.
- `deckTop` — the height of the deck surface, for standing things on it.
- `obstacleRadius` is `0`: a platform is a floor, not an obstacle.
- `sunrise` (radians about +Y) orients the whole room; `students` and `perRow` size it, and the deck grows to hold the rows.
- Deterministic, as ever: same seed, same room, to the pebble.

See the **shala** playground: all four eras catching the same dawn, each mat spot marked with a pebble so the world-space contract is visible.
