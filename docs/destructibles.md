# Destructibles & the scoreboard

The props that give feedback by coming apart — and the board that
counts it. Phase D's world half.

## Breakables

```ts
const crate = createBreakable('crate', { seed: 5 });   // crate | barrel | pot
scene.add(crate.group);

// when the game loop says it was hit:
crate.break({ x: hitDir.x, z: hitDir.z });   // shards fly, biased by the blow
spawnCoinAt(crate.group.position.clone().add(crate.loot));

crate.update(dt);   // per frame — flight, bounce, settle
crate.reset();      // pooled levels reuse their props
```

A breakable is two props in one: the intact shell everyone sees, and
the seeded pre-fractured shards hiding inside. `break()` swaps one for
the other; pieces fly outward and up (plus the hit's own push), take
one soft floor bounce, and settle into debris. **The same seed always
breaks into the same pieces** — a replay is honest, and a save file
that stores the seed stores the wreckage. `loot` marks where a pickup
belongs the moment the shards fly — the classic loop, closed in one
handshake with `createPickup`.

## The target dummy

```ts
const dummy = createTargetDummy();
dummy.hit(shot.at, energy);   // a damped pendulum swings away from the blow
dummy.topple();               // the KO — over it goes, and stays
```

Post, torso, head, and a spring. Wire its `trigger` to GAMA's
`Projectiles` and its `hit` to the impact event, and the training yard
teaches aim.

## The scoreboard

```ts
const board = createScoreboard({ digits: 3 });
board.set(score);      // changed digits FLIP — old tips away, new tips in
board.update(dt);
```

The vector font's first job with moving parts. A board that just swaps
text reads as a texture; one that moves reads as a machine somebody
built. Ten carved digit geometries are built once per size and shared
by every slot of every board. Values clamp to what the digits can hold.

## The stumps — cricket's missing feedback

```ts
const stumps = createStumps();
// the ball arrives:
stumps.strike(ballVelocity, power);   // THE BAILS FLY
stumps.reset();                        // new over
```

Three stumps, two bails, and the single most satisfying piece of
feedback in cricket, finally an event instead of scenery. Each bail
gets its own seeded arc and spin — two bails that fly identically read
as one drawn twice — and one or two stumps lean back, pivoting at the
base. `strike` on an already-broken wicket does nothing: the laws only
let you out once per ball.

## One break, all senses

```ts
onHit: ({ at }) => {
  crate.break(velocity);
  fx.burst('debris', at); fx.burst('dust', at);   // 0.93
  sounds.crack(0.8, { at });                       // gama Soundboard
  feel.shake(0.3);                                 // gama GameFeel
  board.set(++smashed);
  coin.respawn();                                  // 0.94, at crate.loot
}
```
