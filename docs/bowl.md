# The singing bowl — the breath pulse

The woofer's calm opposite. The woofer publishes music as an `AudioPulse` — `{ bass, mid, treble, beat, bpm }` — and a floor full of dancers answers it. The bowl publishes **breath**:

```js
{ phase, inhale, rate, ring }
```

a tenth the frequency, and with no beat edge at all: breath has turning points, not kicks. `phase` runs 0..1 (inhale over the first half, exhale the second), `rate` is breaths per minute, and `ring` is the chime's envelope — 1 at the strike, 0 at silence.

```js
import { createSingingBowl } from 'scena3d';

const bowl = createSingingBowl({ seed: 4, breathsPerMinute: 6 });
scene.add(bowl.object);
window.addEventListener('pointerdown', () => bowl.strike());

game.onUpdate((t) => {
  bowl.update(t.delta);
  const breath = bowl.pulse();   // the whole coupling
});
```

## The chime is the cue to breathe in

`strike()` restarts the breath clock at the inhale. That is not a convenience — it is what the bowl is *for* in a practice: the teacher rings it, and the room breathes in together. `onStrike` and `onBreath` (`'inhale' | 'exhale'`, at the turning points) let anything listen.

## The ring is long on purpose

A struck bowl sings for tens of seconds — the decay IS the instrument. `ringing` falls exponentially (~12 s to a third); while it lasts the rim visibly shivers and the bronze holds a little of the strike's warmth. A soft strike rings softer (`strike(0.4)`), and a tap never steals ring from a note already singing louder.

In a browser the strike also **sounds**: three partials — the fundamental (seeded 200–320 Hz per bowl, or set `frequency`), a shimmer-mate a few hertz off whose beating is the "singing", and one bright inharmonic — synthesized on an `AudioContext` created lazily *inside the strike*, which is a user gesture, so autoplay policy is satisfied by construction. Headless, in tests, or with `mute: true`, the bowl rings silently and nothing throws — the same honest degradation as the woofer's bed.

## The second three-way composition

The pulse crosses the same structural seams as the woofer's:

```js
// ANIMA: the class keeps the bowl's time (the instructor surrenders the clock,
// the students already follow the instructor — one line couples the room).
cls.instructor.slaveTo(bowl.pulse().phase);

// SCENA: the ambience answers the breath.
const breath = bowl.pulse();
incense.setRate(0.2 + exhale(breath.phase) * 0.75);     // smoke on the out-breath
lantern.intensity = 1.8 + inhale(breath.phase) * 1.6 + breath.ring * 4;
```

No imports either way, as ever — the shape is the contract.

See the **bowl** playground: a retreat shala before dawn, incense thickening on the exhale, lanterns breathing on the inhale and flaring softly at the strike. Click to ring it.
