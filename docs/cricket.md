# The cricket ground

A cricket field is mostly **empty**, and the emptiness is measured. Get the numbers right and it reads as a cricket ground; get them approximately right and it reads as a green circle with sticks in it. So `createCricketGround` works in the game's own units — yards and inches, converted once — and every distance is the real one.

```js
import { createCricketGround, createBat, createCricketBall } from 'scena3d';

const ground = createCricketGround({ seed: 3, boundary: 62 });
scene.add(ground.object);

ground.strikerEnd;      // where the batter stands, world space
ground.bowlerEnd;       // the other end
ground.stumpsAt(-1);    // the stumps a delivery is aimed at
ground.isBoundary(x, z);
game.onUpdate((t) => ground.update(t.delta));
```

## The measurements

| | |
|---|---|
| `PITCH_LENGTH` | 22 yards, 20.117 m — stump to stump |
| `PITCH_WIDTH` | 3.05 m (10 feet) |
| `STUMP_HEIGHT` | 28 inches, 0.711 m |
| `STUMP_SPREAD` | 9 inches across all three |
| `CREASE_FRONT` | 4 feet — the popping crease, in front of the stumps |
| `boundary` | 62 m by default, and further out than anyone expects |

`strikerEnd` is on the popping crease, not on the stumps, because that is where a batter actually stands. Both ends are world-space getters that ride the prop's transform, so moving the ground moves the game.

## The stripes are the ground

The single change that made this stop looking like a lawn was the **mower**. A cricket outfield is cut in alternating bands, and each band is light or dark for a physical reason: the grass is lying towards you or away from you. Without them a 62-metre disc of one green has no scale, no direction, and no depth — the trees on the horizon are the only thing telling you how big it is.

The bands ride a patched `createSurface('dirt')`, so the grass keeps its noise and gains the cut. `stripe` sets the width (7 m by default). The thirty-yard circle is painted the way a limited-overs ground paints it, and the strip has a **worn middle** where a season of bowlers has taken the grass off.

## The bails fly

A wicket is the only moment in cricket that announces itself, and a wicket without the bails is a scoreboard update:

```js
ground.breakWicket(-1);   // the striker's end
ground.resetWicket();     // for the next batter
```

`breakWicket` throws the two bails at that end with seeded velocity and spin; `update(dt)` flies them under gravity until they settle on the turf and stay there. Breaking one end leaves the other end standing. `resetWicket` puts them back exactly.

## The gear

`createBat` is a willow blade with the **swell** — a bat is thicker at the bottom, and that is why it drives — a splice, and a bound handle with five grip bands. `createCricketBall` is 72 mm of leather with a proud stitched seam on one great circle, and carries a `marker` so a game can parent effects to it.

Neither is an obstacle you walk into; the ground reports `obstacleRadius: 0` because it is a field, not a wall.

## Playing on it

The ground knows nothing about a match. GAMA's `CricketMatch` template supplies the ball flight, timing and scoring, and ANIMA's `Cricketer` supplies the bowling action and the strokes — the three meet at nothing more than positions and a `breakWicket()` call. The **cricket** playground is a playable two-over game built from exactly that.
