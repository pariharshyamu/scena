# The liner — stabilisers, and motion as a field

A liner is a machine for not feeling like a ship, and this is the last piece of it.

```js
import { createStabilisers } from 'scena3d';

const fins = createStabilisers({ kind: 'activeFin', beam: ship.beam });
ship.object.add(fins.object);
fins.deploy(true);

game.onUpdate((t) => {
  fins.setWay(plant.way);          // …and this is what they run on
  fins.update(t.delta);
  ship.update(t.delta, {
    speed: plant.way - fins.drag,  // they are not free
    damping: fins.damping,
  });
});
```

## The only thing here that stops working when you stop

A fin stabiliser is a **wing**. It makes its righting moment out of lift, and lift comes out of water going past it — so a ship lying stopped has none at all. She rolls exactly as badly as a ship with no fins fitted, and the fins are still down there costing her the drag.

```js
fins.setWay(10);  fins.damping;  // 0.79 — nearly all her roll, gone
fins.setWay(0);   fins.damping;  // 0.00
fins.drag;                       // …and still not zero
```

That is backwards from every other comfort in a ship. A wide hull is calm at anchor. Deep loading is calm at anchor. Fins are worst exactly when she is least able to do anything about it — hove to in a gale, which is when you want them most.

And it is a **knee, not a cliff**, because lift goes as the square of the speed:

```js
dampingAt('activeFin', 1.9);   // 0.18 — a fifth of rated, at half her biting speed
dampingAt('activeFin', 3.8);   // 0.45 — half, at it
dampingAt('activeFin', 7.6);   // 0.72 — four fifths, at twice it
```

She loses them by degrees as she slows. Written as a threshold she would go from steady to rolling between two frames.

## They take the roll out and leave the pitch

`damping` goes into `ShipInput.damping`, which touches the **roll and nothing else**. A stabilised ship in a head sea pitches exactly as hard as an unstabilised one — that is not a simplification here, it is the commonest complaint about fins.

## Motion is a field

`motion` is one number for the whole ship. It is not enough, and the difference is the entire layout of a passenger vessel:

```js
ship.motionAt(0, 0, 0);                            // 0.19 — amidships, low
ship.motionAt(0, ship.length * 0.45, 0);           // 0.33 — the stem
ship.motionAt(ship.beam * 0.5, 0, ship.freeboard); // 0.36 — the bridge wing
```

Her pitch throws the bow and the stern up and down and leaves amidships nearly alone. Her roll throws the high decks and the wings about and leaves the centreline low down nearly alone. So the quietest berth aboard is **amidships and low** — and that falls out of two lever arms, not out of a price list, which is nonetheless exactly what a price list for cabins looks like.

```js
ship.heaveAt(x, z, y);   // m/s of vertical deck velocity — honest, and height
                         // does not enter it, because heave is the same
                         // everywhere aboard
```

`motionAt` weights the two arms *above* the heave on purpose. Weighted equally, the heave — which is uniform over the hull — swamps both and the bow, the bridge wing and the middle of the dining saloon all read the same number, which is the one distinction the field exists to make.

It **saturates rather than clamps**, so an open boat in a gale is worse than an open boat in a swell instead of both being 1.0.

## Where the fins show, and where they do not

```js
ship.motionAt(...wing);   // fins out 0.36 → housed 0.52
ship.motionAt(...stem);   // fins out 0.33 → housed 0.38
```

Steadying her shows up on the bridge wings, because that is where the roll lives. It barely touches the stem, because that is where the pitch lives. Two lever arms, one damping term, and the whole thing is legible from a screenshot.

## What each of them asks of you

| kind | takes out | needs | costs | notes |
| --- | --- | --- | --- | --- |
| `bilgeKeel` | 26% | nothing at all | a little, always | welded on; `deploy` is a no-op |
| `fin` | 62% | way, and 40 s to run out | 0.16 m/s | |
| `activeFin` | 90% | way, power, 55 s | 0.25 m/s | driven off a gyro |
| `gyro` | 55% | nothing | nothing | works stopped, and cannot lift a big ship |

The era axis is **what it needs from you**, and the gyro is the inversion at the end of it: no water, no speed, no drag, no thought — and then it simply cannot move a liner, which is why it is on yachts. The same shape as hearth → induction, and the same shape as `stoke()` doing nothing to a launch.

`deploy(false)` on a bilge keel is a **silent no-op**, because it is welded to her and there was never a lever.

## The whole arc, in one hull

```js
plant.update(t.delta);
hold.update(t.delta);
fins.setWay(plant.way);              // she feeds her own stabilisers
fins.update(t.delta);
plant.setImmersion(hold.immersion);  // and her load feeds her engine

ship.update(t.delta, {
  speed: plant.way - fins.drag,
  drift: plant.walk,
  loading: hold.loading,
  damping: fins.damping,
});
```

Four modules, four handshakes, and not one of them a throttle. The hold hands the hull a `loading` and the plant an `immersion`; the plant hands the hull a `way` and the fins their input; the fins hand the hull a `damping` and take a bite out of the speed on the way past. Nothing imports anything.

See **?view=liner** in the gallery — a liner and a coaster in the same swell, with the field drawn on both. The coaster's posts are red where the liner's are green, and that is the reason a liner is 180 metres long.
