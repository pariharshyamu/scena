# Sailing — the rig, the polar and the no-go

Every steering system in the trilogy knows how to point at a target and drive. A sailing vessel is the one thing in it that **cannot do that**, and `createSailRig` is where that constraint comes from.

```js
import { createSailRig, createWindField, createDeckedShip } from 'scena3d';

const wind = createWindField({ direction: 35, strength: 0.6 });
const ship = createDeckedShip({ era: 'carrack' });
const rig  = createSailRig({ kind: 'square' });

ship.object.add(rig.object);   // it reads its own world heading — tell it nothing
rig.setWind(wind);

game.onUpdate((t) => {
  rig.update(t.delta);
  ship.update(t.delta, { speed: rig.drive * 9, turn: helm });
});
```

`createWindField` has been in the library since the flora track and its `sample(x, z)` had never once been read by anything that *moves*. This is the thing that reads it.

## Drive is a curve, not a throttle

```js
rig.driveAt(angleOffWind)   // 0 → π radians off the wind; returns 0…1
```

That curve — the **polar** — is the whole model. It has a peak somewhere abaft the bow, and, far more importantly, it has a **wall**:

```js
rig.driveAt(0.4)         // 0     — she will not sail there
rig.driveAt(rig.noGo)    // 0.3   — the closest she will lie
rig.driveAt(Math.PI / 2) // 1.0   — a reach, for a modern rig
```

Inside `noGo` the answer is **exactly zero**, not merely small. That matters more than it sounds. If pinching up merely *costs* something, a helmsman gets away with it, an AI steers straight at its target at a small discount, and the constraint quietly evaporates. It has to be a wall.

## Four rigs, four different curves

The rig kinds are not a reskin with a multiplier — the shapes genuinely differ, and six hundred years of naval architecture is in the difference.

| kind | no-go | at 60° off the wind | dead downwind |
| --- | --- | --- | --- |
| `square` | ~70° | **0** | **1.00** |
| `lateen` | ~55° | 0.52 | 0.62 |
| `gaff` | ~50° | 0.66 | 0.52 |
| `bermudan` | ~40° | **0.84** | 0.44 |

Read the first and last columns together. A square sail is a bag being pushed: magnificent dead astern and *completely unable* to make ground to windward — which is why getting anywhere upwind took the age of sail centuries and a lateen yard. A Bermudan sloop is the exact opposite trade. Nobody was ever simply "better at sailing"; they moved along a curve.

`noGoDegrees(kind)` gives the angle in degrees, and `RIG_KINDS` lists all four.

## The layline — where to point when you can't point at it

The function the whole thing exists for:

```js
rig.layline(bearingToMark, currentHeading?)
```

- If the mark is **sailable**, it hands the bearing straight back. Nothing changes.
- If it is **inside the no-go**, it returns a close-hauled heading instead — which is to say it tells you to *tack*, and the straight line was never available.

Given `currentHeading` it picks whichever tack is the smaller change from where she is already pointing, so choosing a tack is a decision rather than a coin toss. The course it gives back is always one she will actually sail — laid a couple of degrees outside the no-go, never on the boundary itself, because a heading laid exactly on the boundary is one rounding error away from making no ground at all.

```js
const steer = rig.layline(bearing, ship.object.rotation.y);
ship.update(dt, { speed: rig.drive * 9, turn: turnToward(steer) });
```

That is the whole of upwind navigation. Everything else — beating, tacking, a passage that takes three times as long as the distance suggests — falls out of it.

## Heel is not a fraction of drive

```js
rig.heelForce   // 0…1
```

The rig's force is roughly square to the canvas, and the canvas is trimmed at about half the angle to the wind. So drive is that force's forward component and heel is its sideways one, and the **ratio** between them is `cot(windAngle / 2)`:

- **Dead downwind it is zero.** She does not heel at all, however hard she is driving. A single fraction of `drive` cannot say that, and it is the most recognisable fact about a ship under sail.
- **Hard on the wind a tender rig is over one** — she lies down further than she goes. That is why beating to windward is wet work.

Where the force itself peaks falls out of the two curves multiplied together, and it is not where intuition puts it: on a **close reach**, not close-hauled — and further aft the older the rig, because a square sail makes nothing at all up near the wind to be pressed by. Nobody chose that; it is what the numbers do.

## Luffing, and why the no-go is learnable

```js
rig.luffing     // true in irons, and while the sheets are let fly
rig.windAngle   // radians off the bow, 0 = straight into it
```

When she is not drawing, the canvas **flogs and goes slack** — it shakes about the edge it is bent to and loses its belly. That is the feedback loop: a helmsman who has pinched up sees the sail shaking before the speed has finished bleeding off. Without it the no-go zone is merely punishing; with it, it is learnable.

The spar swings too. On a fore-and-aft rig the boom goes out on the side away from the wind, further the further off the wind she is, and **crosses the deck when she goes about** — which is how a player knows a gybe happened without being told. Square yards brace round to meet the wind instead, which is not the same motion at all.

## Setting and shortening sail

```js
rig.setSail(0.5);   // half of it
rig.reef(0.3);      // take another third in
rig.set;            // what is up now
```

Furled canvas is not half-size canvas hanging in mid-air: it comes **down**, toward the spar it is bent to — the head for a square sail under its yard, the foot for anything standing up off a boom. Furl it altogether and she is stopped and flogging whatever the course.

## Composing with the deck

A `DeckedShip` publishes `deckAt` / `normalAt` / `ride`, so a sailed ship is also somewhere people can stand:

```js
rig.update(dt);
ship.update(dt, { speed: rig.drive * 9, turn: helm });
legs.update(dt, ship);          // ANIMA's SeaLegs, riding the deck
```

The rig drives the hull, the hull carries the crew, and neither library imports the other — `WindSource` is structurally `WindField`, and `Deck` is structurally `DeckField`. See **?view=sail** in the gallery for four rigs beating to the same mark in one breeze.
