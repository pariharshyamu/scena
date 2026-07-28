# Game feel: effects, trails & marks

A hit that only changes a number is a spreadsheet event. What sells
contact is debris — dust where a boot lands, sparks where metal meets
stone, droplets where something takes the water — and what sells *history*
is the ground remembering: the corner you overcooked still written on the
tarmac three laps later. This page is the visible half of game feel; the
audible half is gama3d's `Soundboard`, and they are designed to fire from
the same events.

```ts
import { createEffects, createMarks, createTrail } from 'scena3d';

const fx = createEffects({ seed: 7 });
const marks = createMarks({ seed: 2 });
const trail = createTrail({ color: 0x8fd0ff });
scene.add(fx.group, marks.mesh, trail.mesh);

// per frame:
fx.update(dt); marks.update(dt); trail.update(dt);
```

## Bursts

```ts
fx.burst('dust', boot.position);
fx.burst('sparks', hit.point, { direction: hit.normal });
fx.burst('debris', crate.position, { color: 0x8a6238 });
fx.burst('splash', prow.position);
fx.burst('confetti', podium.position);
```

Five voices, one pool. All matte particles share one `InstancedMesh` and
all glowing ones another, so it is **two draw calls for everything in
flight** whatever you spawn. A particle is a tiny octahedron rather than a
billboarded sprite: a solid needs no camera to face — so `update(dt)`
needs no camera — and at this size the silhouette difference is invisible
while the *tumble* a flat sprite cannot do reads clearly. Fade is done
with scale (a mote shrinking to nothing is indistinguishable from one
fading out, and per-instance opacity would cost a custom shader).

Each voice is one idea: dust barely falls and *grows* (a cloud billows),
sparks keep their speed and die shrinking, debris drops like debris and
bounces, splash droplets arc and vanish, confetti flutters — its sideways
wander is written into the velocity, because nothing about falling paper
is straight — and refuses a single colour. Everything lands: bouncers
bounce off `floor`, the rest settle onto it. Nothing sinks through.

`ring(at)` adds the expanding, fading ground ring — landings, splashes,
shockwaves — easing outward the way a wavefront loses steam.

The pool recycles: past `capacity` (default 320) the oldest particle gives
up its slot, so a fireworks finale degrades by dropping its history, never
by crashing its frame rate. `update` walks lag spikes in sub-steps — a
slow frame advances effects honestly instead of freezing or exploding
them.

## Trails

```ts
const trail = createTrail({ width: 0.34, life: 0.8, color: 0x8fd0ff });
trail.push(kart.position);   // per frame
trail.update(dt);
trail.clear();               // teleports must not draw a streak across the map
```

A ribbon of the emitter's recent past, tapering to the tail, fading with
real per-vertex alpha (the colour attribute carries four components —
three treats that as RGBA, no custom shader). The ribbon lies in the plane
orthogonal to `up`: the Y-up default is right for vehicles and runners;
pass the swing plane's normal for a bat or a sword. Standing still adds no
points, and a stalled emitter can never fold the ribbon into NaN.

## Marks

```ts
marks.stamp('skid', kart.position, kart.heading, { length: 1.4 });
marks.stamp('footprint', foot.position, walkDir);
marks.stamp('scorch', blast.position);   // no heading — burns face nowhere
```

**One draw call for every mark on the map.** The pool is a single
`InstancedMesh` of unit quads; which shape a quad shows (soft-ended
streak, ellipse, radial scorch) and how faded it is are the two things
instancing famously cannot vary per instance — so a small shader carries
them both as instanced attributes. Marks fade over `fade` seconds
(default 18) and a full ground recycles its oldest.

The design rule that matters: **stamp what happened, not what you
placed.** In the playground the kart skids only where the ellipse turns
hard — the marks trace the two tight corners and stop on the straights,
which is exactly the information a skid mark exists to record.

## Wiring it to the game

The trilogy handshake, as ever, is structural — positions in, no imports
between libraries:

```ts
// gama3d collision → sight and sound together:
onImpact = (hit) => {
  fx.burst('sparks', hit.point, { direction: hit.normal });
  sounds.impact('metal', hit.energy);          // gama3d Soundboard
};

// anima3d footsteps → prints and puffs:
locomotion.onFootstep(() => {
  marks.stamp('footprint', foot, heading);
  fx.burst('dust', foot, { count: 3, size: 0.6 });
});
```

## What it costs

Three systems fully loaded: two instanced draws for particles, one for
marks, one mesh for the trail, plus a handful of pooled ring meshes. CPU
is a few hundred Euler integrations a frame. There are no textures, no
sprite sheets, and nothing to preload — like every surface in this
library, the whole thing is generated.
