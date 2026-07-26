import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

/**
 * A public address — the first prop in this library that reaches the ear.
 *
 * Everything until now has been seen. A hull, a light, a derrick, a boiler:
 * all of them are things you look at, and the ones that answer questions
 * about a point in space — `heatAt`, `smokeAt`, `depthAt` — answer them about
 * where a *body* is. Sound is the first field where the interesting number is
 * about what a **person** can do there: whether they can talk, whether they
 * can stay, how long before it costs them something.
 *
 * ```ts
 * const pa = createPA({ era: 'array', power: 118 });
 * pa.levelAt(0, 100);      // 93 dB(A), a hundred metres back
 * pa.stateAt(0, 100);      // 'harmful'
 * pa.earshotAt(0, 100);    // 0.18 m — you shout into an ear or you don't talk
 * pa.exposureAt(0, 100);   // 4 500 s before the day's dose is gone
 * ```
 *
 * ## Distance is a filter, not a volume knob
 *
 * The one fact everybody has met and almost nobody models: from far enough
 * away, a band is **all bass**. That is not an artistic choice about mixing,
 * it is air. Absorption is strongly frequency-dependent — about 0.004 dB/m at
 * 125 Hz and 0.15 dB/m at 4 kHz — so over 800 m the bass loses 3 dB and the
 * top loses a hundred and twenty:
 *
 * ```ts
 *      3 m   bass 110   mid 111   treble 110     a band
 *    100 m   bass  85   mid  92   treble  83     a band, further off
 *    300 m   bass  74   mid  77   treble  47     a PA, over there
 *    800 m   bass  64   mid  55   treble  33     a thud, two streets away
 * ```
 *
 * Model sound as one number that falls off with range and you get a quiet
 * band. It is not a quiet band. It is a **different band**, and that is why
 * `bandsAt` exists next to `levelAt`.
 *
 * ## What it costs the person standing there
 *
 * The states are not `'off' | 'low' | 'high'` — that is a fact about the
 * amplifier. They are what a person has to do:
 *
 * | state | |
 * | --- | --- |
 * | `quiet` | you can talk |
 * | `raised` | you are raising your voice and have not noticed |
 * | `shouting` | you shout into an ear, or you do not talk |
 * | `harmful` | the day's safe dose runs out in under four hours |
 *
 * ## The era axis: what the front row pays for the back row
 *
 * A PA has exactly one hard problem, and it is not power. It is that the
 * front row and the back row are the same system. Cover 200 m to a usable
 * 75 dB(A) at the back and ask what that does to the people at the barrier:
 *
 * | era | front row | safe for |
 * | --- | --- | --- |
 * | `horn` | 113 dB(A) | 49 seconds |
 * | `hifi` | 114 dB(A) | 35 seconds |
 * | `array` | 105 dB(A) | 5 minutes |
 * | `delayed` | 91 dB(A) | 2 hours |
 *
 * `delayed` is the inversion at the end of the axis, in the same shape as the
 * gyro stabiliser and the thermostatic mixer: **it does not make the PA
 * louder, it stops the loudness having to reach that far** — and the bill is
 * paid in a completely different currency, which is *time*. Get a delay wrong
 * and every one of those people hears an echo.
 */

/** How the sound is thrown. */
export type PAEra =
  /** Horns on a pole. Efficient, directional, and no bass at all. */
  | 'horn'
  /** A pair of full-range stacks. A point source: 6 dB per doubling. */
  | 'hifi'
  /** A line array. Cylindrical near field: 3 dB per doubling, while it lasts. */
  | 'array'
  /** An array plus delay towers downfield. The front row stops paying. */
  | 'delayed';

/**
 * Three bands, because one number cannot say what distance does to sound.
 *
 * Centred at 125 Hz, 1 kHz and 4 kHz — low enough to diffract round a wall,
 * the region speech lives in, and the region air eats.
 */
export type Band = 'bass' | 'mid' | 'treble';

/** What it costs to stand there. Measured in the person, not the amplifier. */
export type LoudnessState = 'quiet' | 'raised' | 'shouting' | 'harmful';

/**
 * What two arrivals of the same sound do to each other.
 *
 * `clean` — one source, nothing to interfere with.
 * `comb` — under 5 ms apart: not an echo, a *filter*. Hollow and phasey.
 * `fused` — the precedence effect. Two arrivals, one apparent source.
 * `echo` — over 40 ms: you hear the sound twice, and you cannot unhear it.
 */
export type EchoState = 'clean' | 'comb' | 'fused' | 'echo';

/** Unweighted sound pressure level in each band, dB re 20 µPa. */
export interface BandLevels {
  bass: number;
  mid: number;
  treble: number;
}

/**
 * How loud it is at a world point.
 *
 * The fifth spatial handshake, after `depthAt`, `heatAt`, `chillAt` and
 * `smokeAt`, and deliberately the same shape. SCENA says how loud it is
 * there; ANIMA decides whether a character has to shout and GAMA decides
 * whether an agent wants to be there.
 */
export interface SoundField {
  /** A-weighted sound pressure level at a world point, dB(A). */
  levelAt(x: number, z: number): number;
}

/** A hang, a stack, or a delay tower. */
export interface SourceSpec {
  /** World position. Defaults to the PA's own origin. */
  x?: number;
  z?: number;
  /** Height of the acoustic centre above ground, metres. */
  height?: number;
  /** Facing, radians, 0 = +z. Defaults to the PA's facing. */
  facing?: number;
  /** On-axis sound pressure level at 1 m, dB. */
  power?: number;
  /**
   * Vertical extent of the radiating source, metres. 0 for a point source.
   * A line array's near field — where it loses 3 dB per doubling instead of
   * 6 — extends to about `length² · f / 2c`, so a longer hang keeps its level
   * further out, and keeps it further out *for the top than for the bottom*.
   */
  length?: number;
  /** Electronic delay, seconds. See `alignDelays`. */
  delay?: number;
}

/**
 * A wall between a source and an ear.
 *
 * A line in plan with a height — which is all a barrier is acoustically. It
 * is not drawn: this is a fact about the sound, in the same way `heightAt` is
 * a fact about the ground, and whatever put the wall there draws it.
 */
export interface BarrierSpec {
  /** One end, in world coordinates. */
  x1: number;
  z1: number;
  /** The other end. */
  x2: number;
  z2: number;
  /** Height of the top edge above ground, metres. */
  height: number;
}

export interface PAOptions {
  era?: PAEra;
  /** On-axis SPL at 1 m of the main hang, dB. Defaults per era. */
  power?: number;
  /** World position of the main hang. */
  x?: number;
  z?: number;
  /** Height of the main hang's acoustic centre, metres. */
  height?: number;
  /** Facing, radians. 0 = +z, which is the direction the crowd is in. */
  facing?: number;
  /** Ear height for every query, metres. */
  earHeight?: number;
  /** Background level with the PA silent, dB(A). */
  ambient?: number;
  /** How much of full output the programme is asking for, 0–1. */
  program?: number;
  /** For `delayed`: how many towers, and how far downfield the field runs. */
  towers?: number;
  fieldLength?: number;
}

/** What one source contributes at a point. */
export interface SoundArrival {
  name: string;
  /** A-weighted contribution, dB(A). */
  level: number;
  /** When it gets there: flight time plus electronic delay, seconds. */
  arrival: number;
}

export interface EchoReading {
  /** Milliseconds between the first and last audible arrival. */
  spread: number;
  state: EchoState;
  /** How many arrivals are within 15 dB of the loudest. */
  arrivals: number;
}

export interface PublicAddress extends Prop, SoundField {
  readonly era: PAEra;
  /** Every source, mains first. */
  readonly names: string[];

  /** A-weighted level at a world point, dB(A). */
  levelAt(x: number, z: number): number;
  /** Unweighted level in each band at a world point, dB. */
  bandsAt(x: number, z: number): BandLevels;
  /** What it costs to stand there. */
  stateAt(x: number, z: number): LoudnessState;
  /** Seconds of the daily noise dose that point spends per second. */
  exposureAt(x: number, z: number): number;
  /** Metres at which a shout is still intelligible there. */
  earshotAt(x: number, z: number): number;
  /** What the arrivals do to each other there. */
  echoAt(x: number, z: number): EchoReading;
  /** Every source's contribution at a point, loudest first. */
  arrivalsAt(x: number, z: number): SoundArrival[];

  /** How far down the axis the level stays at or above `target` dB(A). */
  reach(target?: number): number;
  /** The level at the barrier — `distance` metres down the axis. */
  frontRow(distance?: number): number;

  /** Add a source. Returns its name. */
  tower(name: string, spec?: SourceSpec): string;
  /** Register a wall. Barriers shadow every source. */
  barrier(name: string, spec: BarrierSpec): void;
  /** Forget a wall. */
  clearBarrier(name: string): void;

  setPower(name: string, dB: number): void;
  setDelay(name: string, seconds: number): void;
  /** How hard the programme is driving it, 0–1. 0 is silence. */
  setProgram(level: number): void;

  /**
   * Set every tower's delay from its distance to the mains, plus `haas`.
   *
   * The extra offset is the whole trick: aligned to the arithmetic and no
   * more, the two arrivals land within a millisecond of each other and comb.
   * Ten or fifteen milliseconds late and the mains arrive first, so the sound
   * still comes from the stage.
   */
  alignDelays(haas?: number): void;

  /**
   * Turn every source down as far as it will go and still cover the field.
   *
   * Each source is sized for the end of its own zone, in order — which is
   * what a system tech does, and what makes the era axis a fair comparison
   * rather than four different volume settings.
   */
  cover(length: number, target?: number): void;

  /** Paint the field. Grey-blue → green → amber → red, by state. */
  showCoverage(on: boolean, opts?: { width?: number; depth?: number; cell?: number }): void;

  update(dt: number): void;
}

// ---------------------------------------------------------------------------
// The physics
// ---------------------------------------------------------------------------

/** Speed of sound, m/s, at 20 °C. */
export const SPEED_OF_SOUND = 343;

const BANDS: Band[] = ['bass', 'mid', 'treble'];

/** Band centre frequencies, Hz. */
export const BAND_HZ: Record<Band, number> = { bass: 125, mid: 1000, treble: 4000 };

/**
 * Air absorption, dB per metre, at 20 °C and 50 % relative humidity.
 *
 * Nearly forty times worse at 4 kHz than at 125 Hz, and that ratio is the
 * whole reason a distant PA is a thud.
 */
export const AIR_ABSORPTION: Record<Band, number> = { bass: 0.004, mid: 0.028, treble: 0.15 };

/**
 * A-weighting at the band centres, dB.
 *
 * The ear is nearly deaf to bass at low levels, and the weighting says so:
 * −16 dB at 125 Hz. Which is also why a festival can measure legal on a
 * dB(A) meter at the site boundary while the people two streets away lie
 * awake — everything they can hear is in the band the meter discounts.
 */
export const A_WEIGHTING: Record<Band, number> = { bass: -16.1, mid: 0, treble: 1.0 };

/**
 * Most a thin barrier can take off, per band.
 *
 * Diffraction over the top is not the only path: some of it comes straight
 * through the panel, and transmission loss follows the mass law — 6 dB per
 * doubling of frequency. So a wall has a floor, and the floor is lowest
 * exactly where the diffraction is weakest.
 */
export const BARRIER_CAP: Record<Band, number> = { bass: 18, mid: 24, treble: 28 };

/** Below this a person can hold a conversation. */
export const QUIET = 62;
/** Above this they must shout to be heard at all. */
export const SHOUTING = 78;
/** Above this the day's dose runs out in under four hours. */
export const HARMFUL = 88;
/** A shout, at one metre, dB(A). */
export const SHOUT_AT_1M = 78;

/** Energy sum of decibel values. */
export function sumDecibels(values: number[]): number {
  let total = 0;
  for (const v of values) total += Math.pow(10, v / 10);
  return total <= 0 ? -Infinity : 10 * Math.log10(total);
}

/**
 * Spreading loss at range `r`, dB.
 *
 * A point source loses 6 dB per doubling — the surface of the sphere the
 * energy is spread over goes as r². A line source loses **3**, because near
 * enough to it the wavefront is a cylinder, not a sphere. That is the entire
 * argument for a line array, and it holds only out to the array's near-field
 * limit, which is proportional to frequency: a 6 m hang holds the top up to
 * 210 m and the bass to 6 m. Which is why the back of a festival gets a thin,
 * mid-heavy sound and the subs are a separate problem.
 */
export function spreadingLoss(r: number, length: number, band: Band): number {
  const d = Math.max(1, r);
  if (length <= 0) return 20 * Math.log10(d);
  const critical = (length * length * BAND_HZ[band]) / (2 * SPEED_OF_SOUND);
  if (critical <= 1) return 20 * Math.log10(d);
  if (d <= critical) return 10 * Math.log10(d);
  return 10 * Math.log10(critical) + 20 * Math.log10(d / critical);
}

/**
 * Maekawa's barrier attenuation, dB, from the path-length difference.
 *
 * The number that matters is the **Fresnel number** `N = 2δ/λ`: how many
 * half-wavelengths of extra path the sound has to take to get over the top.
 * A 3 m wall against a 4 kHz wavelength of 86 mm is an obstacle; against a
 * 125 Hz wavelength of 2.7 m it is barely there. `blocked` is false when the
 * ear can see the source over the wall — attenuation then falls away over the
 * transition zone rather than stopping dead, because being in line of sight
 * is not the same as being clear of the first Fresnel zone.
 */
export function barrierLoss(delta: number, band: Band, blocked: boolean): number {
  const N = ((blocked ? 2 : -2) * Math.max(0, delta) * BAND_HZ[band]) / SPEED_OF_SOUND;
  if (N < -0.2) return 0;
  if (N < 0) return 5 * (1 + N / 0.2);
  return Math.min(BARRIER_CAP[band], 10 * Math.log10(3 + 20 * N));
}

/**
 * Seconds at `dBA` before the day's noise dose is used up.
 *
 * 85 dB(A) for eight hours, and a 3 dB exchange rate — every 3 dB halves the
 * time, because 3 dB is twice the energy. Which makes 100 dB(A) a quarter of
 * an hour and the front row of a badly designed PA a matter of seconds.
 */
export function exposureLimit(dBA: number): number {
  return 8 * 3600 * Math.pow(2, (85 - dBA) / 3);
}

/** Metres at which a shout is still intelligible against `dBA` of noise. */
export function earshot(dBA: number): number {
  return Math.pow(10, (SHOUT_AT_1M - dBA) / 20);
}

/** Classify a level in what it costs the person standing there. */
export function loudnessState(dBA: number): LoudnessState {
  if (dBA >= HARMFUL) return 'harmful';
  if (dBA >= SHOUTING) return 'shouting';
  if (dBA >= QUIET) return 'raised';
  return 'quiet';
}

// ---------------------------------------------------------------------------

interface EraSpec {
  power: number;
  length: number;
  band: Record<Band, number>;
  /** Half-angle at which the source is 6 dB down, degrees. */
  half: number;
  towers: number;
  towerLength: number;
}

const ERAS: Record<PAEra, EraSpec> = {
  // A horn is the most efficient loudspeaker there is and cannot do bass:
  // the mouth would have to be metres across. Speech carries; music does not.
  horn: {
    power: 105, length: 0, half: 30, towers: 0, towerLength: 0,
    band: { bass: -25, mid: 0, treble: -8 },
  },
  hifi: {
    power: 112, length: 0, half: 50, towers: 0, towerLength: 0,
    band: { bass: -2, mid: 0, treble: -2 },
  },
  array: {
    power: 118, length: 6, half: 55, towers: 0, towerLength: 3,
    band: { bass: -1, mid: 0, treble: 0 },
  },
  delayed: {
    power: 118, length: 6, half: 55, towers: 2, towerLength: 3,
    band: { bass: -1, mid: 0, treble: 0 },
  },
};

interface Source {
  name: string;
  x: number;
  z: number;
  height: number;
  facing: number;
  power: number;
  length: number;
  delay: number;
  band: Record<Band, number>;
  half: number;
  object: Group;
  meter: Mesh | null;
}

interface Barrier extends BarrierSpec {
  name: string;
}

const STATE_COLOUR: Record<LoudnessState, number> = {
  quiet: 0x3a4a5e,
  raised: 0x3f7a4a,
  shouting: 0xc08a2a,
  harmful: 0xb03428,
};

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Where two plan segments cross, or null. */
function segmentCross(
  px: number, pz: number, qx: number, qz: number,
  ax: number, az: number, bx: number, bz: number,
): { x: number; z: number } | null {
  const rx = qx - px, rz = qz - pz;
  const sx = bx - ax, sz = bz - az;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((ax - px) * sz - (az - pz) * sx) / den;
  const u = ((ax - px) * rz - (az - pz) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: px + t * rx, z: pz + t * rz };
}

export function createPA(options: PAOptions = {}): PublicAddress {
  const era = options.era ?? 'array';
  const spec = ERAS[era];
  const originX = options.x ?? 0;
  const originZ = options.z ?? 0;
  const facing = options.facing ?? 0;
  const earHeight = options.earHeight ?? 1.6;
  const ambient = options.ambient ?? 45;
  const fieldLength = options.fieldLength ?? 200;
  const towerCount = options.towers ?? spec.towers;

  const group = new Group();
  group.position.set(originX, 0, originZ);
  group.rotation.y = facing;

  const sources: Source[] = [];
  const barriers = new Map<string, Barrier>();
  let program = options.program ?? 1;
  let elapsed = 0;

  const boxMat = createSurface('paintedMetal', { baseColor: 0x1b1c20 });
  const grilleMat = createSurface('metal', { baseColor: 0x2c2e34 });
  const steelMat = createSurface('steel', { baseColor: 0x6a6d74 });
  const hornMat = createSurface('brass', {});
  const meterMat = new MeshBasicMaterial({ color: 0x7fe08a });

  // -- visuals -------------------------------------------------------------

  /** A speaker box: a black trapezoid with a grille face. */
  function makeBox(w: number, h: number, d: number): Group {
    const g = new Group();
    const body = new Mesh(new BoxGeometry(w, h, d), boxMat);
    g.add(body);
    const grille = new Mesh(new BoxGeometry(w * 0.86, h * 0.78, 0.02), grilleMat);
    grille.position.z = d / 2 + 0.011;
    g.add(grille);
    return g;
  }

  function makeMeter(): Mesh {
    const m = new Mesh(new BoxGeometry(0.5, 0.06, 0.03), meterMat);
    return m;
  }

  /** Four legs and cross-braces — a scaffold tower. */
  function makeScaffold(height: number, width = 1.6): Group {
    const g = new Group();
    const leg = new CylinderGeometry(0.05, 0.05, height, 6);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const l = new Mesh(leg, steelMat);
      l.position.set((sx * width) / 2, height / 2, (sz * width) / 2);
      g.add(l);
    }
    const rungs = Math.max(2, Math.round(height / 1.8));
    for (let i = 1; i <= rungs; i++) {
      const y = (height * i) / (rungs + 1);
      for (const axis of [0, 1]) {
        const r = new Mesh(new BoxGeometry(axis ? 0.05 : width, 0.05, axis ? width : 0.05), steelMat);
        r.position.set(0, y, axis ? 0 : 0);
        g.add(r);
      }
    }
    return g;
  }

  /** Era-specific geometry for the main hang. */
  function buildMains(height: number, length: number): Group {
    const g = new Group();
    if (era === 'horn') {
      g.add(makeScaffold(height));
      for (let i = 0; i < 4; i++) {
        const cone = new Mesh(new ConeGeometry(0.42, 0.9, 10), hornMat);
        cone.rotation.x = -Math.PI / 2;
        cone.position.set(0, height, 0.5);
        cone.rotation.z = (i / 4) * Math.PI * 2;
        const arm = new Group();
        arm.rotation.y = ((i - 1.5) / 4) * 1.4;
        arm.add(cone);
        g.add(arm);
      }
      return g;
    }
    if (era === 'hifi') {
      for (const side of [-1, 1]) {
        const stack = new Group();
        stack.position.set(side * 3.2, 0, 0);
        stack.rotation.y = -side * 0.28;
        const sub = makeBox(1.3, 0.8, 1.0);
        sub.position.y = 0.4;
        stack.add(sub);
        for (let i = 0; i < 3; i++) {
          const b = makeBox(1.0, 0.7, 0.8);
          b.position.y = 0.8 + 0.7 * i + 0.35;
          stack.add(b);
        }
        g.add(stack);
      }
      return g;
    }
    // array / delayed: a hang either side, subs on the deck between them
    for (const side of [-1, 1]) {
      const hang = new Group();
      hang.position.set(side * 4.2, 0, 0);
      const top = height + length / 2;
      const boxes = Math.max(4, Math.round(length / 0.42));
      for (let i = 0; i < boxes; i++) {
        const t = i / (boxes - 1);
        const b = makeBox(1.15, length / boxes - 0.02, 0.62);
        b.position.y = top - (length * (i + 0.5)) / boxes;
        // A hang is curved: the lower boxes are tilted down at the near field.
        b.rotation.x = -0.05 - t * t * 0.55;
        b.position.z = t * t * 0.35;
        hang.add(b);
      }
      const bumper = new Mesh(new BoxGeometry(1.5, 0.12, 0.7), steelMat);
      bumper.position.y = top + 0.1;
      hang.add(bumper);
      hang.add(makeScaffold(top + 0.2, 1.2));
      for (let i = 0; i < 3; i++) {
        const sub = makeBox(1.25, 0.75, 1.05);
        sub.position.set(-side * 1.6 - side * i * 1.3, 0.38, -0.4);
        hang.add(sub);
      }
      g.add(hang);
    }
    return g;
  }

  function buildTower(height: number, length: number): Group {
    const g = new Group();
    g.add(makeScaffold(height, 1.3));
    const boxes = Math.max(3, Math.round(length / 0.4));
    for (let i = 0; i < boxes; i++) {
      const b = makeBox(0.85, length / boxes - 0.02, 0.5);
      b.position.y = height + length / 2 - (length * (i + 0.5)) / boxes;
      b.rotation.x = -0.08 - (i / boxes) * 0.5;
      g.add(b);
    }
    return g;
  }

  // -- sources -------------------------------------------------------------

  function addSource(name: string, s: SourceSpec, mains: boolean): Source {
    const height = s.height ?? (mains ? (options.height ?? 6) : 5);
    const length = s.length ?? (mains ? spec.length : spec.towerLength);
    const object = mains ? buildMains(height, length) : buildTower(height, length);
    const x = s.x ?? originX;
    const z = s.z ?? originZ;
    // Sources live in world coordinates but hang under the PA's group, which
    // is itself rotated — so undo the rotation to place them.
    const dx = x - originX;
    const dz = z - originZ;
    const c = Math.cos(-facing);
    const sn = Math.sin(-facing);
    object.position.set(dx * c + dz * sn, 0, -dx * sn + dz * c);
    object.rotation.y = (s.facing ?? facing) - facing;
    const meter = makeMeter();
    meter.position.set(0, height + length + 0.35, 0);
    object.add(meter);
    group.add(object);
    const src: Source = {
      name, x, z, height,
      facing: s.facing ?? facing,
      power: s.power ?? (mains ? (options.power ?? spec.power) : spec.power - 12),
      length,
      delay: s.delay ?? 0,
      band: spec.band,
      half: spec.half,
      object,
      meter,
    };
    sources.push(src);
    return src;
  }

  addSource('mains', {}, true);

  // -- the field -----------------------------------------------------------

  /** Worst loss any registered barrier imposes on this path, per band. */
  function barrierAttenuation(s: Source, rx: number, rz: number): Record<Band, number> | null {
    let worst: Record<Band, number> | null = null;
    for (const b of barriers.values()) {
      const cross = segmentCross(s.x, s.z, rx, rz, b.x1, b.z1, b.x2, b.z2);
      if (!cross) continue;
      const ds = Math.hypot(cross.x - s.x, cross.z - s.z);
      const dr = Math.hypot(cross.x - rx, cross.z - rz);
      const t = ds / Math.max(1e-6, ds + dr);
      // Where the direct ray passes the wall line. Above the top edge and the
      // ear can see the source; the barrier still shades the bass, because
      // line of sight is not the same as clear of the first Fresnel zone.
      const rayY = s.height + (earHeight - s.height) * t;
      const A = Math.hypot(ds, b.height - s.height);
      const B = Math.hypot(dr, b.height - earHeight);
      const D = Math.hypot(ds + dr, earHeight - s.height);
      const delta = Math.max(0, A + B - D);
      const blocked = b.height > rayY;
      const loss: Record<Band, number> = { bass: 0, mid: 0, treble: 0 };
      for (const band of BANDS) loss[band] = barrierLoss(delta, band, blocked);
      if (!worst) worst = loss;
      else for (const band of BANDS) worst[band] = Math.max(worst[band], loss[band]);
    }
    return worst;
  }

  interface Contribution {
    name: string;
    band: Record<Band, number>;
    dba: number;
    arrival: number;
  }

  function contribute(s: Source, x: number, z: number): Contribution {
    const dx = x - s.x;
    const dz = z - s.z;
    const plan = Math.hypot(dx, dz);
    const dy = s.height - earHeight;
    const slant = Math.max(1, Math.hypot(plan, dy));
    const theta = plan < 1e-6 ? 0 : Math.abs(angleDiff(Math.atan2(dx, dz), s.facing)) * (180 / Math.PI);
    const off = Math.min(30, 6 * Math.pow(theta / s.half, 2));
    const att = barrierAttenuation(s, x, z);
    const drive = program <= 0 ? -Infinity : 20 * Math.log10(program);
    const band: Record<Band, number> = { bass: 0, mid: 0, treble: 0 };
    for (const b of BANDS) {
      band[b] = s.power + drive + s.band[b]
        - spreadingLoss(slant, s.length, b)
        - AIR_ABSORPTION[b] * slant
        - off
        - (att ? att[b] : 0);
    }
    return {
      name: s.name,
      band,
      dba: sumDecibels(BANDS.map((b) => band[b] + A_WEIGHTING[b])),
      arrival: slant / SPEED_OF_SOUND + s.delay,
    };
  }

  const contributions = (x: number, z: number): Contribution[] =>
    sources.map((s) => contribute(s, x, z));

  const levelAt = (x: number, z: number): number =>
    sumDecibels([...contributions(x, z).map((c) => c.dba), ambient]);

  function bandsAt(x: number, z: number): BandLevels {
    const cs = contributions(x, z);
    const floor = ambient - 12;
    return {
      bass: Math.max(floor, sumDecibels(cs.map((c) => c.band.bass))),
      mid: Math.max(floor, sumDecibels(cs.map((c) => c.band.mid))),
      treble: Math.max(floor, sumDecibels(cs.map((c) => c.band.treble))),
    };
  }

  function echoAt(x: number, z: number): EchoReading {
    const cs = contributions(x, z);
    if (cs.length < 2) return { spread: 0, state: 'clean', arrivals: cs.length };
    const loudest = Math.max(...cs.map((c) => c.dba));
    // A second arrival 15 dB down is still perfectly audible as an echo — it
    // is the *delay* that makes it audible, not the level.
    const heard = cs.filter((c) => c.dba > loudest - 15).map((c) => c.arrival);
    if (heard.length < 2) return { spread: 0, state: 'clean', arrivals: heard.length };
    const spread = (Math.max(...heard) - Math.min(...heard)) * 1000;
    const state: EchoState = spread < 5 ? 'comb' : spread < 40 ? 'fused' : 'echo';
    return { spread, state, arrivals: heard.length };
  }

  /** Unit vector down the PA's axis. */
  const axis = () => ({ x: Math.sin(facing), z: Math.cos(facing) });

  function onAxis(distance: number): { x: number; z: number } {
    const a = axis();
    return { x: originX + a.x * distance, z: originZ + a.z * distance };
  }

  function reach(target = QUIET): number {
    let lo = 0.5;
    let hi = 4000;
    const at = (d: number) => {
      const p = onAxis(d);
      return levelAt(p.x, p.z);
    };
    if (at(lo) < target) return 0;
    for (let i = 0; i < 70; i++) {
      const m = (lo + hi) / 2;
      if (at(m) >= target) lo = m;
      else hi = m;
    }
    return lo;
  }

  // -- tuning --------------------------------------------------------------

  function alignDelays(haas = 0.012): void {
    const mains = sources[0];
    for (const s of sources) {
      if (s === mains) continue;
      const d = Math.hypot(s.x - mains.x, s.z - mains.z);
      s.delay = d / SPEED_OF_SOUND + haas;
    }
    dirty = true;
  }

  function cover(length: number, target = 75): void {
    const a = axis();
    // Order the sources by how far down the axis they sit; each one is then
    // responsible for the stretch between it and the next.
    const along = (s: Source) => (s.x - originX) * a.x + (s.z - originZ) * a.z;
    const order = [...sources].sort((p, q) => along(p) - along(q));
    for (let i = 0; i < order.length; i++) {
      const s = order[i];
      const end = i + 1 < order.length ? along(order[i + 1]) : length;
      const p = onAxis(end);
      // Everything past this source is not helping yet; mute it while we size
      // this one, or a loud tower downfield hides the hole in front of it.
      const held = order.slice(i + 1).map((o) => o.power);
      for (const o of order.slice(i + 1)) o.power = -200;
      let lo = 40;
      let hi = 150;
      for (let k = 0; k < 60; k++) {
        const m = (lo + hi) / 2;
        s.power = m;
        if (levelAt(p.x, p.z) < target) lo = m;
        else hi = m;
      }
      s.power = lo;
      order.slice(i + 1).forEach((o, k) => { o.power = held[k]; });
    }
    dirty = true;
  }

  // -- coverage grid -------------------------------------------------------

  let coverage: Mesh | null = null;
  let coverageOpts = { width: 120, depth: 220, cell: 8 };
  let dirty = false;

  function buildCoverage(): void {
    if (coverage) {
      group.remove(coverage);
      coverage.geometry.dispose();
      coverage = null;
    }
    const { width, depth, cell } = coverageOpts;
    const nx = Math.max(1, Math.round(width / cell));
    const nz = Math.max(1, Math.round(depth / cell));
    const pos = new Float32Array(nx * nz * 18);
    const col = new Float32Array(nx * nz * 18);
    const a = axis();
    const c = new Color();
    let p = 0;
    let q = 0;
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const lx = -width / 2 + (ix + 0.5) * cell;
        const lz = (iz + 0.5) * cell;
        // Local (PA) space to world, to ask the field the right question.
        const wx = originX + lx * a.z + lz * a.x;
        const wz = originZ - lx * a.x + lz * a.z;
        c.setHex(STATE_COLOUR[loudnessState(levelAt(wx, wz))]);
        const h = cell / 2 - 0.35;
        const corners: Array<[number, number]> = [
          [lx - h, lz - h], [lx + h, lz - h], [lx + h, lz + h],
          [lx - h, lz - h], [lx + h, lz + h], [lx - h, lz + h],
        ];
        for (const [cx, cz] of corners) {
          pos[p++] = cx; pos[p++] = 0.06; pos[p++] = cz;
          col[q++] = c.r; col[q++] = c.g; col[q++] = c.b;
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.computeVertexNormals();
    coverage = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
    coverage.renderOrder = -1;
    group.add(coverage);
  }

  // -- the prop ------------------------------------------------------------

  const find = (name: string): Source | undefined => sources.find((s) => s.name === name);

  const pa: PublicAddress = {
    object: group,
    obstacleRadius: era === 'horn' ? 1.2 : 5.5,
    era,
    get names() { return sources.map((s) => s.name); },

    levelAt,
    bandsAt,
    stateAt: (x, z) => loudnessState(levelAt(x, z)),
    exposureAt: (x, z) => exposureLimit(levelAt(x, z)),
    earshotAt: (x, z) => earshot(levelAt(x, z)),
    echoAt,
    arrivalsAt: (x, z) =>
      contributions(x, z)
        .map((c) => ({ name: c.name, level: c.dba, arrival: c.arrival }))
        .sort((p, q) => q.level - p.level),

    reach,
    frontRow(distance = 3) {
      const p = onAxis(distance);
      return levelAt(p.x, p.z);
    },

    tower(name, s = {}) {
      addSource(name, s, false);
      dirty = true;
      return name;
    },
    barrier(name, s) {
      barriers.set(name, { ...s, name });
      dirty = true;
    },
    clearBarrier(name) {
      barriers.delete(name);
      dirty = true;
    },

    setPower(name, dB) {
      const s = find(name);
      if (s) s.power = dB;
      dirty = true;
    },
    setDelay(name, seconds) {
      const s = find(name);
      if (s) s.delay = Math.max(0, seconds);
      dirty = true;
    },
    setProgram(level) {
      program = Math.max(0, Math.min(1, level));
      dirty = true;
    },

    alignDelays,
    cover,

    showCoverage(on, opts) {
      if (opts) coverageOpts = { ...coverageOpts, ...opts };
      if (!on) {
        if (coverage) {
          group.remove(coverage);
          coverage.geometry.dispose();
          coverage = null;
        }
        return;
      }
      buildCoverage();
    },

    update(dt) {
      elapsed += dt;
      if (dirty && coverage) {
        buildCoverage();
        dirty = false;
      }
      // A meter that only says "there is programme": the level is a fact about
      // the source, not about the frame, so it must not integrate `dt`.
      for (const s of sources) {
        if (!s.meter) continue;
        const drive = program * (0.55 + 0.45 * Math.sin(elapsed * 6.1 + s.x * 0.7));
        s.meter.scale.x = Math.max(0.001, drive);
        (s.meter.material as MeshBasicMaterial).color.setHex(
          drive > 0.85 ? 0xe05a3c : drive > 0.6 ? 0xe0c04a : 0x7fe08a,
        );
        s.meter.visible = program > 0.01;
      }
    },
  };

  if (towerCount > 0) {
    const a = axis();
    for (let i = 1; i <= towerCount; i++) {
      const d = (fieldLength * i) / (towerCount + 1);
      pa.tower(`tower${i}`, { x: originX + a.x * d, z: originZ + a.z * d });
    }
    alignDelays();
  }

  return pa;
}
