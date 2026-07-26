# The booth — the first prop that is not all here

Everything else in this trilogy is simulated. A boiler makes steam out of numbers this library owns; a hull floats on arithmetic; even the PA is a field computed from a power figure. Operate the woofer and it plays **web radio** — a stream from outside the process and outside the frame clock, that keeps playing whether or not anybody is looking, and that no amount of correct local code can make reliable.

```js
import { createWoofer, createDanceTiles } from 'scena3d';

const rig = createWoofer({ seed: 7 });
const floor = createDanceTiles({ cols: 10, rows: 8 });
scene.add(rig.object, floor.object);

// THE interaction: first touch starts the radio, every later touch tunes.
canvas.addEventListener('pointerdown', () => rig.operate());

game.onUpdate((t) => {
  rig.update(t.delta);
  floor.feed(rig.pulse());   // and the DJ tiles come alive
  floor.update(t.delta);
});
```

## Operate it and it plays the radio

`operate()` is what a person does to a sound system: off → on, on → next station. The default dial is five SomaFM channels — chosen because they are listener-supported, decades old, and (the property that actually matters here) they send the CORS header that lets the analyser *read* the music it is playing.

```js
rig.operate();          // Groove Salad
rig.operate();          // Beat Blender
rig.play(2);            // straight to DEF CON Radio
rig.station.name;       // 'DEF CON Radio'
rig.stop();             // and the cones go still
```

Bring your own dial with `stations: [{ name, url, genre }]` — but a station that does not send `Access-Control-Allow-Origin` will refuse to load through the analyser graph, which arrives as an error, which is a `holding`. That failure path is not an edge case; it is the module.

## The dropout is the design problem

A stream fails four ways: it takes a moment to start, it rebuffers, the station dies, autoplay policy refuses. A dance floor that freezes whenever the network hiccups is a network monitor wearing a glitter ball. So the rig carries a **bed** — a seeded, deterministic groove that runs under everything, takes the floor whenever the stream cannot, and hands it back the moment it can:

| state | who has the floor |
| --- | --- |
| `off` | nobody. The cones are still. |
| `demo` | the bed, by choice — no radio was asked for. |
| `tuning` | the bed, while the stream buffers its first seconds. |
| `live` | **the radio.** The one state this module cannot fake. |
| `holding` | the bed, because the stream dropped — and the tiles never knew. |

`holding` is this axis's inversion, in the same shape as the thermostatic mixer and the delay tower: it does not stop the dropout, it stops the dropout **reaching the floor** — and the bill is paid in honesty. What you are hearing during a `holding` is not the radio, and `state` says so; the ON-AIR lamp on the cabinet says the same thing in paint (green = bed, red = live, amber = holding).

## The tiles never find out

```js
floor.feed(rig.pulse());
```

That line is the entire coupling. `pulse()` has the same shape whoever has the floor — `{ bass, mid, treble, beat, bpm }` — so the tiles cannot know, and must not know, where the music is coming from. The kick throws a ring out from the centre, the hats sparkle random tiles, the mid sets how warm the floor idles, and a stalled stream upstream changes none of it.

```js
floor.activated;   // true from the first real pulse
floor.litCount();  // how many tiles are lit right now
rig.onBeat(() => camera.kick());   // anything can dance
```

## Live is measured, not trusted

While `live`, the pulse comes off the actual audio: an analyser reads the FFT, bass/mid/treble are integrated from the real spectrum, and the beat is *detected* — bass energy standing clear of its own recent average, with a refractory quarter-second so 120 BPM does not read as 240. The bed is run through the **same detector** rather than announcing its own beats; if `demo` and `live` disagreed about what a beat is, the tiles would dance differently to a fake and give the whole thing away.

`bpm` reports the bed's tempo while the bed drives, and the *measured* median beat gap while the radio does.

## What runs where

- **A browser, after a click** — the real thing. Autoplay policy means nothing sounds until somebody interacts; that is not a bug to fight, it is the prop's off switch.
- **Headless / before the click** — the bed drives, deterministically: the same seed is the same night out, which is how a picture with a live stream in it can still be verified pixel-for-pixel with no network and no audio device.
- **Node (the tests)** — there is no `Audio` at all. The bed is pure arithmetic (`bedPulse(t, bpm)` is exported), and the whole state machine runs against an injected fake stream through the `RadioMedia` seam. If the module needed a real stream to be exercised, the module would be designed wrong.

## She still has a field

```js
rig.levelAt(x, z);   // dB(A), while she plays; 0 when she is off
rig.level();         // 0–1 — feed a PA's setProgram to put her on the big rig
```

The AQ handshake, kept: a single cabinet is the simplest case the PA models — a point source with her own balance for a spectrum — so a GAMA agent can treat a house party and a festival as one kind of fact, and ANIMA characters near the stack raise their voices for the same reason they do at the barrier.

See **?view=booth** in the gallery: one big woofer, one floor of DJ tiles, and a click that starts the radio. Watch the lamp, not the floor — the floor has been designed not to tell you.
