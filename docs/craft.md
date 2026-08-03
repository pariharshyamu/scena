# Small craft — the stability that walks, and the boat that comes back

Everything else in the boat arc is a machine that survives things. A liner takes a gale because she is a hundred and eighty metres long; a steamer takes it because she has a thousand tonnes of cargo holding her down. A small boat has neither, and what happens to her in the next thirty seconds is decided by half a metre of freeboard and by where three people are sitting.

```js
import { createSmallCraft, livesIn } from 'scena3d';

const boat = createSmallCraft({ fit: 'open' });
boat.float((x, z) => sea.heightAt(x, z));
boat.seat('bow', 82, 0.55, 0);
boat.seat('midships', 88, 0, 0);
boat.seat('helm', 85, -0.5, 0);

game.onUpdate((t) => {
  boat.meet(state.windSea.height, state.windSea.length);   // two numbers
  boat.update(t.delta);
});
```

## She is not lost to stability. She is lost to freeboard

This is the finding, and it is not what anybody expects — including the first draft of this module, which took the free-surface sum straight out of `createHold` and got a **negative metacentric height out of two buckets of water.**

That formula is a full-beam slab, derived for a ballast tank six metres wide with a metre of water standing in it. Water in the bottom of a boat lies in the *narrow* part of her section, and the width that matters is the width at that depth. Her section is a wedge, so the volume up to depth `d` goes as `d²` — a little water is deep and narrow, a lot of it is shallow and wide. Taken as a box the depth comes out four times too small and the free surface with it.

Taken seriously, she keeps a positive GM the whole way to the gunwale:

| water aboard | freeboard | solid GM | free surface | GM |
| --- | --- | --- | --- | --- |
| 0 kg | 0.49 m | 3.59 | 0.00 | **3.59** |
| 200 | 0.44 | 2.67 | 0.06 | 2.61 |
| 1000 | 0.26 | 1.37 | 0.35 | 1.02 |
| 1800 | 0.08 | 0.98 | 0.55 | 0.42 |

The free surface is real and it never gets near the number it is subtracted from. She has stability to spare right up to the moment her gunwale goes under — and she goes under anyway.

## It is a runaway, and nothing else in this library is

```text
water aboard  →  less freeboard  →  more water aboard
```

Every other model here settles. A boiler finds a pressure, a sea finds a height, a hull finds a list. This one has a tipping point, and on the wrong side of it there is nothing to find.

```js
boat.meet(0.8);  boat.swampsIn();   // Infinity — dry all day
boat.meet(1.0);  boat.swampsIn();   // 85 s
boat.meet(1.5);  boat.swampsIn();   // 27 s
boat.meet(2.2);  boat.swampsIn();   // 16 s
```

The threshold is **twice her freeboard**, and it has a name of its own because it mentions her length, her engine, her crew and her stability nowhere at all:

```js
livesIn(boat.freeboard);   // 0.98 m, and she is fine in anything under it
```

## You cannot bail your way out of it

The single most important number here. A man with a bucket moves about two kilos a second; in a 1.5 m sea the water is coming aboard at thirty times that.

```js
boat.bail(0);     boat.swampsIn();   // 27 s
boat.bail(2);     boat.swampsIn();   // 27 s  ← a man, flat out
boat.bail(1.5);   boat.swampsIn();   // 27 s  ← a hand pump
boat.bail(30);    boat.swampsIn();   // 39 s  ← absurd, and still only half again
```

It is not that bailing is slow. It is that **a constant outflow cannot beat a growing inflow.** The bucket takes the same two kilos a second however low she gets, and the sea takes more of them the lower she is, so above the point where the sea wins there is no level she can settle at. That is the whole reason freeing ports exist.

## Where they sit decides what sea she can live in

The crew are a third of her displacement, so seating them moves her draught, her trim, her list and her metacentric height at once — and they can move again next second. Nothing else in this library has ballast that walks.

```js
boat.freeboard;   // 0.489 spread along her
// …now put all three in the stern
boat.freeboard;   // -0.002. Her transom is on the water and she is shipping it
                  // standing still. This is how boats are swamped from astern.
```

`freeboard` is measured at her **lowest rail**, not amidships on the centreline. Without that the crew's position feeds nothing and a boat with three people in the stern is as safe as an empty one.

```js
livesIn(spread.freeboard);   // 0.98 m
livesIn(aft.freeboard);      // 0.00 m — the same boat, the same people
```

## Standing up barely touches her, and that IS the finding

```js
sitting.gm;    // 3.59
standing.gm;   // 3.44 — four per cent
```

Everybody believes standing up in a boat is what capsizes her. In a beamy one the waterplane inertia swamps the change in her centre of gravity. In a narrow one it is most of what she has, because `BM` goes as the beam **cubed**:

```js
createSmallCraft({ beam: 1.05 });   // three people standing costs her a third
```

Hiking multiplies whichever arm they already have, and it does not care which way that arm points:

```js
boat.hike('helm', 1);   // on the high side, the only stability she has
                        // on the low side, how a dinghy is capsized to windward
```

## A breaker does not care what her GM is

A sea steeper than one in seven is breaking, and a breaking sea taller than about six tenths of her beam rolls her whatever her stability is — because it is not a heeling moment, it is a wall of water with momentum in it. It is the only failure in this library that no number on the vessel answers.

```js
boat.meet(1.0, 6);   // steep, and under 0.6 × beam — she stays up
boat.meet(1.2, 6);   // and now she does not, with a GM of 3.6
boat.meet(2.4, 90);  // a big sea that is NOT breaking does not roll her.
                     // It fills her.
```

The only defence is beam, which is why open boats are beamy and why a wide boat takes a bigger breaker than a narrow one.

## What happens after she fills

Same hull, four fits. Sized differently they would not be comparable and the axis would be a catalogue instead of an argument.

| fit | what it does about the runaway |
| --- | --- |
| `open` | nothing. You bail, you lose, and then she goes under. |
| `buoyant` | cannot stop it — puts a **floor** under it. She floods to awash and stays there. |
| `selfDraining` | **breaks** it. Water out faster than in, so the freeboard never falls. |
| `selfRighting` | lets it finish and comes back anyway, with nobody doing anything. |

The era axis is **where in the loop you intervene**, and every one of the four intervenes somewhere different.

```js
boat.swamping;   // is the loop running?
```

`swamping` is a comparison of *slopes*, not of rates. A constant outflow can never beat a growing inflow, so anything without ports runs away the moment the sea beats the bucket. Freeing ports are different **in kind**: their outflow goes as the water she already has, so it grows too, and faster.

## Buoyancy buys no seconds whatever

The usual claim for buoyancy tanks is that they buy you time. They do not buy one second — she fills marginally *sooner* than an open boat, because the tanks take up room the water would have had.

```js
open.swampsIn();      // 27 s
buoyant.swampsIn();   // 22 s   ← sooner
open.state;           // 'gone'
buoyant.state;        // 'awash', GM 0.99, and everybody hanging onto her
```

What changes is what is still floating at the end of them. Turning drowning into swimming is the biggest single step on this list even though it does not buy a second of it.

And what the tanks have to hold up is the hull, her ballast and her crew — **not the water.** Water inside a swamped boat weighs nothing at all: it is sea water sitting in a hole in the sea, already held up by the sea it came from. Counted against the tanks it founders every boat here however much buoyancy she has.

## Coming back up is not the same as being all right

```js
open.capsize();  open.right();
open.water;      // still full. You have a boat-shaped bath.

drains.capsize(); drains.right();
drains.update(dt);  // …and she empties herself
```

A capsized boat is `'awash'` however little water is in her, and her freeing ports do not work upside down: a hole in the transom lets water out when the transom is above the sea and is a hole in the bottom of a bowl when it is not.

```js
righting.capsize();
righting.capsized;              // true
run(righting, 6);
righting.capsized;              // false. Nobody did anything.
```

That is the end of the axis and the same shape as a gyro stabiliser that needs no way and a derrick that cannot let go: **it makes the crew's position stop mattering.** Every other fit here is a boat you have to be good in.

It is not free. She is a worse boat every other day of the year:

```js
plain.freeboard;      // 0.489     righting.freeboard;   // 0.430
plain.gm;             // 3.59      righting.gm;          // 2.51
livesIn(plain.freeboard);   // 0.98      livesIn(righting.freeboard);   // 0.86
```

## The handshakes

Four, and not one of them an import.

```js
boat.meet(sea.windSea.height, sea.windSea.length);   // ← the sea state, two numbers
boat.loading;                                        // → the same Loading a hold makes
boat.deckAt(x, z);                                   // → null if they are over the side
boat.ride(person.position);                          // → carried by her own motion
```

`deckAt` returning **null** outside her sheer is how you find out somebody has gone over the side, with no separate test for it.

See **?view=craft** in the gallery — four identical boats in an ordinary 1.1 m sea, one breaker at twenty-five seconds, and four different things happening to them.
