# The sky's drama: lightning & fireworks

Two dynamic light events — the storm's percussion and the celebration's
answer. Both seeded, both structural, both cheap.

## createLightning

```ts
const storm = createLightning({
  targets: { ambient: rig.ambient, background: scene.background, fog: scene.fog },
  onStrike: (s) => feel.shake(s.energy * 0.3),
  onThunder: (s) => sounds.crack(Math.min(1.4 - s.distance / 60, 1)),
});
scene.add(storm.group);
storm.storminess = 0.8;      // auto-strikes, seeded
// per frame: storm.update(dt);
```

A strike is three things at once:

- **The flash** — a spike driven through whatever targets you hand it
  (ambient intensity, sky background, fog color), pulsing **twice**
  (lightning never blinks just once), then decaying back to *exactly*
  where the channels started — not 0.3000001. Far strikes flash softer.
- **The bolt** — a seeded forked polyline of additive tubes from sky to
  ground, gone in a sixth of a second, geometry disposed behind it.
- **The thunder** — `onThunder` fires late in proportion to the
  strike's distance (`soundSpeed` game-metres per second). Distance IS
  the delay: close strikes crack immediately, far ones rumble in late.
  That callback is the handshake a GAMA Soundboard answers.

`storminess` (0..1) drives seeded auto-strikes on a mean `cadence`;
`strike()` forces one, with any field overridden. `flash` is readable
every frame — flash your own things by it too.

## createFireworks

```ts
const show = createFireworks({ seed: 7,
  onBurst: (at, color) => { sounds.impact('soft', 1); feel.shake(0.15); } });
scene.add(show.group);
show.launch({ x: -4, y: 0, z: 0 }, { color: 0xff9d5c });
// per frame: show.update(dt);
```

Seeded rockets climb on a slightly drunken line (burning white-hot
whatever the shell's color), burst at the top of their fuse into a
spherical shell of 70–110 sparks that droop under stylized gravity and
gutter out by shrinking (scale-is-fade — the effects-system idiom).
Everything in flight lives in **one InstancedMesh** with per-instance
color, so a grand finale is still one draw call; slots recycle
oldest-first under `capacity`, so the finale can't overflow — the
dimmest spark just dies early. `onBurst` is the hook for the boom, the
GameFeel thump, and the crowd.

## The tempest playground

The `tempest` example loops the whole drama: sixteen seconds of storm
(rain from `createPrecipitation`, auto-strikes, thunder counted as it
arrives late), the clouds part, and the fireworks answer — then back.
Timed probes watched a forced strike spike `flash` to 0.91 and ambient
from 0.35 to 0.53 with the double pulse visible mid-decay, and later
caught a 92-spark shell in flight (`bursts:1, sparks:92`) with the next
rocket already climbing.

## A bug worth remembering

This release's infinite loop: `queue.length && f?.(queue.shift())` —
an optional call **skips evaluating its arguments** when `f` is absent,
so with no `onThunder` handler the queue never drained and the while
spun forever. The shift now happens unconditionally. If a while-loop's
progress lives inside an optional call, it isn't progress.
