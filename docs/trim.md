# Below decks — trim, list, and the free surface

Everything else in this library that has a mass has it at its origin. A hold does not.

```js
import { createHold } from 'scena3d';

const hold = createHold({ kind: 'steamer' });
ship.object.add(hold.object);

hold.load('fore', 300);        // and she goes down by the head
hold.load('main', 300, 1);     // …and this one lists her, at the same tonnage

game.onUpdate((t) => {
  hold.update(t.delta);
  ship.update(t.delta, { speed: plant.way, loading: hold.loading });
  plant.setImmersion(hold.immersion);
});
```

The load is a **position**, not a number. Three hundred tonnes forward and three hundred tonnes to starboard weigh exactly the same and do completely different things to her, and no total-tonnage figure anywhere can tell you which one you have.

## The weight is not the problem. The fact that it can move is.

A hold **full** of water is safer than a hold **half full** of it, and the reason has nothing whatever to do with how much water there is.

A liquid with a free surface runs to the low side as she leans, and the weight goes with it — so her centre of gravity effectively rises and she leans further. The virtual rise depends on the **width of the surface cubed** and not at all on the depth of the liquid:

```js
hold.pump('ballast', 1.0);   // pressed full — no surface, no penalty
hold.gm;                     // 1.96

hold.pump('ballast', 0.5);   // slack, and this is the dangerous one
hold.freeSurface;            // 1.31 m of metacentric height, gone
hold.gm;                     // 0.55

hold.pump('ballast', 0.0);   // empty — safe again, and now she is light
```

So `pump` is a verb that can kill her in **either** direction, and the right answer is almost never "some". Emptying a pressed-up tank takes her through slack on the way, which is why the sensible order is one tank at a time and never all of them at once.

```js
freeSurfaceCost(8.8, 30, 1500);       // 1.164 m
2 * freeSurfaceCost(4.4, 30, 1500);   // 0.291 m — a QUARTER, for the same volume
```

Split a tank down the middle and you divide its penalty by four. That single fact is the entire difference between a tanker and a liner, and it is why one of them carries people.

## An empty ship is not a safe ship

Light, she floats high, her metacentric height is enormous, and she snaps back from every roll hard enough to throw people off their feet:

```js
const light = createHold({ kind: 'steamer' });
light.gm;            // 5.20  — and her state is 'light', which is a warning
light.rollPeriod;    // 3.1 s — a short period is a VIOLENT one
light.immersion;     // 0.00  — her screw is completely out of the water
```

That is what ballast is *for*. You take weight aboard on purpose, low down, to make her **worse** at standing up. `'light'` is a state this module warns about, not a state it treats as empty and therefore fine.

`stiffness` goes straight into the hull, which is the same claim from the other side: a stiff ship answers the sea faster, so she is the one that hurts.

## There is an angle past which she does not come back

The righting arm is `GM · sin θ`, not `GM · θ`. The sine matters:

```js
hold.load('main', 380, 1);   // the whole cargo hard to starboard
hold.capsized;               // true
hold.state;                  // 'lost'
hold.gm;                     // 1.95 — plenty, and nothing to use it on
```

She has gone over with a perfectly healthy metacentric height, because the heeling moment exceeded anything her righting arm could answer. `vanishing` is published so you can say how close she is rather than only that she has gone.

And below zero GM she does not list at all — she takes an **angle of loll**, falls to whichever side she happened to be leaning, and sits there:

```js
hold.lolling;      // true
hold.rollPeriod;   // Infinity. She is not oscillating about anything.
```

## The sea gets in faster than the pump gets it out

```js
hold.holed(0.4);        // tonnes a second
hold.pumpBilge(true);   // …and this will not keep up
hold.bilge;             // rising anyway
```

Bilge water is the **worst** free surface she has: the full width of her, no subdivision, and it fills itself. Forty tonnes of water in the bottom is not the problem; forty tonnes of water free to run the width of her is. That is why you go for the hole and not the handle.

A compartment flooded solid has no free surface either — which is true, and cold comfort.

## What you can do about it

The era axis is not *when* — it is **what lever you have**.

| kind | spaces | your lever | how fast |
| --- | --- | --- | --- |
| `carrack` | one open hold | move the cargo, by hand | 0.9 t/min |
| `steamer` | three holds, one wide double bottom | pump ballast | 0.32 t/s |
| `liner` | subdivided, four narrow tanks | pump, and the surfaces are small | 2.2 t/s |
| `tanker` | three tanks the width of her | full or empty, and nothing between | 3.4 t/s |

```js
hold.shift('fore', 'aft', 100);   // a carrack's only lever, and it takes HOURS
hold.pump('ballast', 0.5);        // a steamer's, and it takes minutes
```

`shift` returns immediately and then happens slowly — a gang moving cargo by hand is minutes a tonne, and that gap is the whole difference between a hold and a ballast tank. A cargo that shifted on its own in a seaway was usually the end of the argument.

## The load line

```js
hold.toMarks;     // 0 light, 1 down to her marks, >1 overloaded
hold.draught;
hold.freeboard;
```

The Plimsoll marks are an instrument with no moving parts: they stay where they are painted and the **sea comes up them**. Nothing else in SCENA reads out by not moving. In the hull's frame the mark group descends by exactly `loading.sink`, so in the world it holds still and the waterline climbs.

She cannot be loaded to destruction — her capacities and her marks agree, and that is what marks are for. She can be **flooded** to it.

## What the hull takes

```js
ship.update(t.delta, { loading: hold.loading });
```

`Loading` is the same channel as `drift` and it is duck-typed the same way — the hull knows nothing about cargo. But it is the first thing in that channel that is a **state of the vessel** rather than a force on her: a drift stops when the tide slackens, and a list does not stop.

Two signs are worth stating because they are not the same. `trim` is positive **down by the head** and `list` is positive **to starboard**, and the hull applies them with *opposite* signs — because a positive `rotation.x` carries the bow down while a positive `rotation.z` lifts the starboard side. Guessed either way round it reads back out of the model perfectly and puts her stem in the air.

And `immersion` goes straight to the engine:

```js
plant.setImmersion(hold.immersion);
```

A light ship races her screw and makes no ground — which is a fact about her cargo arriving at the propeller through nothing but a number.

See **?view=trim** in the gallery — four identical steamers, loaded four ways, and the one carrying the right weight in the right place is the one with no stability left.
