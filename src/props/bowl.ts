import {
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector2,
} from 'three';
import { Rng } from '../core/random';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

/**
 * The singing bowl — the woofer's calm opposite.
 *
 * The woofer publishes the music as an `AudioPulse` and a floor full of
 * dancers answers it. The bowl publishes **breath**: a `BreathPulse` at a
 * tenth the frequency, with no beat edge at all — breath has turning
 * points, not kicks. Strike the bowl and the chime is the cue to breathe
 * in: the breath clock restarts at the inhale, the ring blooms and then
 * takes its long time dying away, and anything listening — a class, the
 * incense, the lanterns — settles onto the bowl's time.
 *
 * ```ts
 * const bowl = createSingingBowl({ seed: 4 });
 * scene.add(bowl.object);
 * window.addEventListener('pointerdown', () => bowl.strike());
 *
 * game.onUpdate((t) => {
 *   bowl.update(t.delta);
 *   const breath = bowl.pulse();          // { phase, inhale, rate, ring }
 *   cls.instructor.slaveTo(breath.phase); // ANIMA: the class keeps bowl time
 *   incense.setRate(0.25 + 0.6 * (breath.inhale ? 0.2 : 1)); // SCENA: ambience
 * });
 * ```
 *
 * ## The ring is long on purpose
 *
 * A struck bowl sings for tens of seconds — the decay IS the instrument.
 * `ringing` falls exponentially (about twelve seconds to a third), the rim
 * shivers visibly while it lasts, and the bowl's bronze warms with a faint
 * emissive glow that cools as the note dies. In a browser the strike also
 * *sounds*: two detuned partials synthesized on a lazily-created
 * AudioContext (created inside the strike, which is a user gesture, so
 * autoplay policy is satisfied by construction). Headless and in tests
 * there is no AudioContext and the bowl simply rings silently — the same
 * honest degradation as the woofer's bed.
 *
 * The pulse's `ring` field carries the envelope, so ambience can answer
 * the chime as well as the breath — a lantern that flares softly at the
 * strike and settles as the note does.
 */

/** What the breath says this frame. ANIMA-compatible by shape, as ever. */
export interface BreathPulse {
  /** 0..1 — inhale over the first half, exhale the second. */
  phase: number;
  inhale: boolean;
  /** Breaths per minute the clock is pacing. */
  rate: number;
  /** The chime's envelope, 1 at the strike, 0 at silence. */
  ring: number;
}

export interface SingingBowlOptions {
  seed?: number;
  /** The pace the bowl keeps. Default 6 breaths a minute. */
  breathsPerMinute?: number;
  /** Fundamental pitch, Hz. Default seeded 200–320 (a mid-size bowl). */
  frequency?: number;
  /** Never synthesize audio, even in a browser. */
  mute?: boolean;
}

export interface SingingBowl extends Prop {
  /** Ring the bowl. The breath restarts at the inhale — the chime is the cue. */
  strike(velocity?: number): void;
  update(dt: number): void;
  /** The whole coupling: read it once a frame and hand it to anything. */
  pulse(): BreathPulse;
  /** The chime envelope, 0..1. */
  readonly ringing: number;
  /** This bowl's fundamental, Hz. */
  readonly frequency: number;
  onStrike(cb: () => void): () => void;
  /** The paced breath's turning points: 'inhale' | 'exhale'. */
  onBreath(cb: (side: 'inhale' | 'exhale') => void): () => void;
}

/** The note takes ~12 s to fall to 1/e — the decay IS the instrument. */
const DECAY = 12;

export function createSingingBowl(options: SingingBowlOptions = {}): SingingBowl {
  const rng = new Rng(options.seed ?? 1);
  const rate = options.breathsPerMinute ?? 6;
  const frequency = options.frequency ?? 200 + rng.next() * 120;

  const group = new Group();
  group.name = 'singing-bowl';

  // --- The bowl: a lathe of a few honest points, in old bronze.
  const profile: Vector2[] = [
    new Vector2(0.02, 0),
    new Vector2(0.14, 0.005),
    new Vector2(0.185, 0.05),
    new Vector2(0.21, 0.13),
    new Vector2(0.205, 0.2),
  ];
  const bronze = createSurface('bronze', { seed: options.seed ?? 1 });
  const bowlMat = bronze.clone() as MeshStandardMaterial;
  bowlMat.emissive.setHex(0xff9a3c);
  bowlMat.emissiveIntensity = 0;
  const bowl = new Mesh(new LatheGeometry(profile, 10), bowlMat);
  bowl.name = 'bowl';
  bowl.position.y = 0.09;
  group.add(bowl);

  // --- The cushion it sits on…
  const cushion = new Mesh(
    new CylinderGeometry(0.19, 0.23, 0.09, 9),
    new MeshStandardMaterial({ color: 0x8a3d3d, roughness: 0.98, flatShading: true })
  );
  cushion.name = 'cushion';
  cushion.position.y = 0.045;
  group.add(cushion);

  // --- …and the mallet resting beside it, leather head outward.
  const mallet = new Group();
  mallet.name = 'mallet';
  const handle = new Mesh(new CylinderGeometry(0.012, 0.012, 0.24, 6), createSurface('wood', { seed: 2 }));
  handle.rotation.z = Math.PI / 2 - 0.18;
  handle.position.set(0.3, 0.03, 0.12);
  mallet.add(handle);
  const head = new Mesh(new SphereGeometry(0.035, 7, 6), createSurface('leather', { seed: 3 }));
  head.position.set(0.42, 0.05, 0.12);
  mallet.add(head);
  group.add(mallet);

  let phase = rng.next() * 0.3;
  let ring = 0;
  let time = 0;
  const strikeCbs = new Set<() => void>();
  const breathCbs = new Set<(side: 'inhale' | 'exhale') => void>();

  // Lazily-created audio, inside the strike gesture. `null` = tried and
  // unavailable (node, or mute) — never try again, never throw.
  let audio: AudioContext | null | undefined;
  const chime = (velocity: number): void => {
    if (options.mute || audio === null) return;
    if (audio === undefined) {
      const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
      audio = Ctx ? new Ctx() : null;
      if (!audio) return;
    }
    const now = audio.currentTime;
    const out = audio.createGain();
    out.gain.setValueAtTime(0.24 * velocity, now);
    out.gain.exponentialRampToValueAtTime(0.0004, now + DECAY * 1.6);
    out.connect(audio.destination);
    // A bowl is its partials: the fundamental, a shimmer-mate a few hertz
    // off (their beating is the "singing"), and one bright inharmonic.
    for (const [f, g] of [
      [frequency, 1],
      [frequency + 2.3, 0.7],
      [frequency * 2.71, 0.22],
    ] as const) {
      const osc = audio.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const mix = audio.createGain();
      mix.gain.value = g;
      osc.connect(mix).connect(out);
      osc.start(now);
      osc.stop(now + DECAY * 1.6);
    }
  };

  return {
    object: group,
    obstacleRadius: 0.3,
    get ringing() {
      return ring;
    },
    frequency,
    strike(velocity = 1): void {
      const v = Math.min(1, Math.max(0.05, velocity));
      ring = Math.min(1, Math.max(ring, v));
      // The chime is the cue to breathe IN: the clock restarts at the inhale.
      phase = 0;
      chime(v);
      for (const cb of strikeCbs) cb();
      for (const cb of breathCbs) cb('inhale');
    },
    update(dt: number): void {
      time += dt;
      const before = phase;
      phase = (phase + (dt * rate) / 60) % 1;
      if (phase < before) for (const cb of breathCbs) cb('inhale');
      else if (before < 0.5 && phase >= 0.5) for (const cb of breathCbs) cb('exhale');
      ring *= Math.exp(-dt / DECAY);
      if (ring < 0.001) ring = 0;
      // The rim shivers while the note lasts, and the bronze holds a
      // little of the strike's warmth.
      const shiver = Math.sin(time * 34) * 0.007 * ring;
      bowl.scale.set(1 + shiver, 1, 1 - shiver);
      bowlMat.emissiveIntensity = ring * 0.35;
    },
    pulse(): BreathPulse {
      return { phase, inhale: phase < 0.5, rate, ring };
    },
    onStrike(cb: () => void): () => void {
      strikeCbs.add(cb);
      return () => strikeCbs.delete(cb);
    },
    onBreath(cb: (side: 'inhale' | 'exhale') => void): () => void {
      breathCbs.add(cb);
      return () => breathCbs.delete(cb);
    },
  };
}
