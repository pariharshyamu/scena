# Alongside — mooring, fenders and the gangway

A vessel is a **frame**: `ride` carries whatever is standing on her, and a sailor who never takes a step still travels at six knots. This is what happens when that frame meets one that does not move.

```js
import { createBerth, moor, createGangway } from 'scena3d';

const berth = createBerth({ era: 'harbour' });
const lines = moor(ship, berth);
const brow  = createGangway({ shore: berth.brow.anchor, ship });

game.onUpdate((t) => {
  ship.update(t.delta, lines.hold(t.delta));   // lines and fenders, as helm
  brow.update(t.delta);                        // the plank follows her
});
```

There are two ideas in it.

## A rope is a one-way constraint

It can pull. It can **never** push. A fender is the same thing backwards: it pushes and has never once pulled a hull in.

Neither one alone holds a ship. A line by itself lets her grind along the wall; a fender by itself lets her drift away. And neither is a *spring* — a spring would haul her back when she came closer than her scope and shove her out when she went away, which is not what either object does.

```js
line.set(40);   // acres of slack — tension 0, and she does not know it is there
line.set(1);    // bar-taut — it pulls, and only toward the bollard
```

So she is held in the gap **between** two constraints that each act in one direction only, and the reason a ship alongside is never quite still is that inside that gap nothing is acting on her at all. A properly moored ship has slack in every rope and is touching nothing.

```js
lines.gap        // hull to fenders, metres. Negative means she is on them.
lines.surge      // 0 (dead still) to 1 (ranging about)
lines.alongside  // close, and STILL — not "some line is taut"
```

`surge` is a **speed**, not a distance. A ship two metres off the wall and steady is a fine place to work; one an inch off it and surging is not.

### Springs

`moor` runs four lines by default: head and stern ropes to the nearest bollards, and **springs** led the other way along the quay. The springs are what stop her ranging fore and aft — head and stern ropes alone hold her off the wall and leave her free to surge the length of her own lines, which is the most-watched, least-modelled fact about a ship alongside.

```js
moor(ship, berth, { lines: 2 })   // she will range
moor(ship, berth, { lines: 4 })   // she will not
```

### Working her

```js
lines.lines[0].heave(0.5);   // take in half a metre
lines.lines[0].set(12);      // pay out to twelve
lines.lines[0].cast();       // let go — the pull stops at once
lines.cast();                // let go everything
```

`standoff` is where she is wanted to lie; `moor` heaves her in to it by shortening each line **by the part of it that actually pulls her toward the wall**. Take the whole distance out of every rope and the springs — which lie almost along the quay — come up hard and drag her onto her own fenders.

### Why it is an input, not a write

`hold` returns a `ShipInput` for you to hand to `ship.update`, including a `drift` in world x and z:

```js
ship.update(dt, lines.hold(dt, { speed: engine }));
```

It goes *through* `update` rather than writing her position afterwards because everything `ride` does depends on the frame delta covering **all** of a frame's movement. A ship warped sideways after her own update leaves her crew standing where she used to be.

## A gangway is where two frames blend

The quay, the gangway and the deck all publish the same three functions — `deckAt`, `normalAt`, `ride`. Only one of them moves. **Fixed ground is a moving frame whose delta is the identity**, which is why walking ashore needs no special case anywhere:

```js
legs.update(dt, aboard ? ship : onBrow ? brow : berth);
```

And the plank itself is neither of the two things it joins. Somebody halfway up it is carried **half** as much by the ship as somebody standing on her deck, and not at all at the shore end:

```js
brow.ride(person);   // moves them by `t` of the plank's ship-end motion
```

Carry them all the way and they are dragged off the quay. Carry them not at all and the ship leaves without them halfway across. It is the plank's own end that is lerped — not the ship's `ride` of the point itself, which agrees only while she is translating and parts company the moment she swings.

```js
brow.rigged   // down and usable
brow.angle    // slope, radians — a body leans going up it
brow.span     // and it changes, because one end will not hold still
brow.raise(); brow.lower();
```

**A gangway is not a bridge.** Let her range past `reach` and it comes off: `rigged` goes false, `deckAt` returns null, and anybody on it needs somewhere else to be. That is the whole hazard of working a ship alongside, and it is the one thing a fixed plank between two fixed points can never model.

## Berths

| era | coping | fenders | make fast to |
| --- | --- | --- | --- |
| `wharf` | 1.4 m | rope coils | timber bitts |
| `harbour` | 2.6 m | rubber drums | iron rings |
| `quay` | 3.4 m | big rubber drums | steel bollards |

The face is the berth's local **+x** plane and the harbour is out that way, so `clearance(x, z)` is positive in open water and negative inside the wall — and the berth turns and moves like any other prop.

```js
berth.clearance(x, z)   // + is clear, − is through the masonry
berth.faceNormal()      // outward, in world space
berth.bollards          // somewhere to make fast
berth.brow              // where a gangway lands ashore
```

See **?view=berth** in the gallery: a steamer working against her lines in a swell, with five posts standing perfectly still on three different frames.
