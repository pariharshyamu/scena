# Working gear — the first load that pulls back

Every other force in the boat arc acts through her centreline. A sail's drive, an oar's thrust, a screw's push: all of them push her the way she is pointing, and none of them can put her on her beam ends.

A working load does not. It acts at a point on her deck, at the end of a wire.

```js
import { createGear, createHold } from 'scena3d';

const gear = createGear({ kind: 'tow', beam: ship.beam, length: ship.length });
// On her DECK. y = 0 in a hull is her waterline, and left there every gallows
// stands inside her and the wire runs along the sea bed.
gear.object.position.y = deck.y;
ship.object.add(gear.object);

gear.shoot();
game.onUpdate((t) => {
  gear.setWay(plant.way);
  gear.setAngle(towAngle);           // …and this is the one that kills you
  gear.update(t.delta);
  hold.heel('gear', gear.moment);    // straight into the same arithmetic
  ship.update(t.delta, { speed: plant.way - gear.drag, loading: hold.loading });
});
```

## The wire comes abeam and the boat is gone

A tug tows from a hook as near her middle and as low as it will go, and she is still lost if the line comes across her. It is called **girting**: the weight comes on her quarter, the pull is behind her pivot so her rudder cannot bring her back, and she goes over.

```js
gear.setAngle(0);            gear.moment;   // 0 — dead astern does nothing at all
gear.setAngle(Math.PI / 4);  gear.moment;   // 74 t·m
gear.setAngle(Math.PI / 2);  gear.moment;   // 105 t·m, and gear.girting is true
```

The arm is not the height of the hook above the deck. The wire pulls one way up there and the water holds the hull the other way down here, and **the couple is the whole distance between them** — the lead above the deck, the deck above the sea, and her grip on the water below it. Measured about the planking a girted tug heels about half as far as she really does, and the sum comes out reassuring.

## Her own gear cannot sink her, and that is the point

```js
gear.setWay(6);
gear.setAngle(Math.PI / 2);
listFor(gear.moment, 400, 1.2);   // 21.7° — a long way over, and she comes back
```

Twenty-odd degrees from her own full bollard pull right abeam is the honest figure, and it is why the whole argument for a towing hook is not more beam. What kills a tug is **the other end**:

```js
gear.snatch(140);                 // the tow sheers, with way on it
gear.strain;                      // 161 t — four times what she can pull
listFor(gear.moment, 400, 1.2);   // 38°, and her vanishing angle is 40
gear.surge;                       // …and it is gone in four seconds
```

`snatch` is the only thing in this module that can capsize a properly built boat. It is over in seconds, which is exactly the problem with it: by the time anybody has decided what to do, it has already either capsized her or not.

## The strain is a thing you control with the throttle

```js
gear.setWay(1);   gear.strain;   // 1.7 t
gear.setWay(2);   gear.strain;   // 4.0 t   — it goes as the SQUARE of her way
gear.setWay(20);  gear.strain;   // 9.0 t   — and it stops there
```

It saturates at her bollard pull, because a boat cannot pull harder than she can pull. Written as a bare square she out-pulls herself at working speed — and then coming fast, which gives her *all* of it, makes the strain go **down**, and the one event this module exists to be about becomes a relief.

```js
gear.setWay(3.5);  gear.strain;   // 6.6 t, towing
gear.comeFast();   gear.strain;   // 9.0 — everything she has, and it stays there
gear.setWay(0);    gear.strain;   // 9.0. It does not care how fast she is going,
                                  // because she is not going.
```

A net foul of the bottom will not come home either, and hauling on it is how a boat is pulled down by her own winch.

## How fast you can be rid of it

| kind | the load | how it kills you | letting go |
| --- | --- | --- | --- |
| `pots` | a string on the rail | weight outboard, hauled by hand | drop it — 1 s |
| `trawl` | a net towed astern | it comes fast on the bottom | knock the block out — 8 s |
| `tow` | another vessel | it comes abeam — girting | **instant**, by design |
| `derrick` | a weight in the air | it acts at the boom head the instant it lifts | **you cannot** |

The era axis is not *when* and not *what she asks of you*. It is **how fast you can be rid of it**, and it is not monotone: the most capable gear here is the one with no way out.

```js
derrick.slip();     // a silent no-op, and that no-op is the whole axis
```

A derrick's load has to be **lowered**, and lowering it takes as long as it takes. The same shape as `deploy(false)` doing nothing to a bilge keel and `stoke()` doing nothing to a launch.

## A hanging load and a towed one are different sums

```js
derrick.setLoad(4);
derrick.setOutreach(0);  derrick.moment;   // 0
derrick.setOutreach(6);  derrick.moment;   // 24 t·m — the arm IS the outreach
```

A hanging load heels her through how far **outboard** it is; a towed one through how far **round** the wire has come. Getting them the same way round is the difference between a boat that capsizes when you swing the derrick and one that capsizes when you open the throttle.

And she is heeled *all of it at once*. The dangerous moment of a lift is the pick-up, not the swing:

```js
derrick.shoot();
derrick.update(1);
derrick.out;      // 0.02 — the lift has barely started
derrick.moment;   // 24 t·m — and the full weight is on the hook already
```

## The load is in the world, not on her deck

The wire and the load are children of the hull, so they roll when she rolls — and a hundred and fifty metres of wire rolled forty-five degrees puts its far end a hundred metres under the sea. She carries her own net around the sky, and the picture of a girted tug has no wire in it at all.

So a towed load lies **in the water and stays there**, whatever she is doing, and a hanging one hangs **plumb** — which is precisely why a heeled ship's derrick load swings out over her side. Both of those are the world's vertical and not hers.

## What it costs her

```js
net.drag;      // 1.4 m/s out of 3.5 — most of a trawler's power is in the net
boom.drag;     // 0 — a weight in the air is not in the water
```

## Into the hold, by the same door a bad stow uses

`Hold.heel(name, tonneMetres)` hangs an external heeling moment on her. Named, so several can be live at once:

```js
hold.heel('gear', gear.moment);
hold.heel('deckload', -400);        // and this one is holding her up
hold.loading.list;                  // …the sum of the two
hold.heel('deckload', 0);           // take it off by name
```

Everything that capsizes a badly stowed steamer capsizes a tug girted by her own tow, through the identical arithmetic and past the identical angle:

```js
hold.heel('gear', 4000);
hold.capsized;        // true
hold.loading.list;    // exactly her angle of vanishing stability, and no further
```

For a boat with no cargo model to hand it to, the same sum is published on its own:

```js
listFor(moment, displacement, gm, vanishing);   // asin(M / (Δ·GM)), and it gives
                                                // up at vanishing rather than at 90°
```

## The same load, on something it is heavy for

```js
pots.moment;                        // 0.64 t·m — three hundred kilos over the rail
listFor(pots.moment, 290, 2.23);    // 0.06° on a coaster. Nothing.
listFor(pots.moment, 5, 0.6);       // 12.3° on a creel boat. Everything.
```

Nothing about the gear changed. That is the whole reason small boats are lost at work and big ones are not, and it is one line of arithmetic.

See **?view=gear** in the gallery — the same tug twice, given the same snatch in the same second, with a lever pulled on one of them.
