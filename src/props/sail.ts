import {
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

/**
 * Sail — and why you cannot go where you are pointing.
 *
 * `createWindField` has been in the library since the flora track, and its
 * `sample(x, z)` has never once been read by anything that moves. This is
 * the thing that reads it, and it produces the deepest movement constraint
 * in the whole trilogy from one function.
 *
 * A sail's drive is not a throttle. It is a **curve against the angle to
 * the wind**, and the interesting part of that curve is where it goes to
 * zero:
 *
 * ```ts
 * driveAt(angleOffWind): number   // 0 inside the no-go, peak on a reach
 * ```
 *
 * Inside roughly forty-five degrees of the wind — more for a square rig,
 * much more — a sailing vessel makes **no ground at all**. She stops, the
 * sails flog, and she is in irons. So the shortest path from here to there
 * stops being a straight line: to go upwind you sail across it, twice, and
 * every steering system in GAMA has only ever known how to point at a
 * target and drive.
 *
 * ```ts
 * const rig = createSailRig({ kind: 'lateen' });
 * ship.object.add(rig.object);
 * rig.setWind(wind);
 * game.onUpdate((t) => {
 *   rig.update(t.delta);
 *   ship.update(t.delta, { speed: rig.drive * 9, turn: helm });
 * });
 * rig.layline(bearingToPort);   // …and which way to point to get there
 * ```
 */

export type RigKind =
  /** A square sail: magnificent downwind, hopeless anywhere near the wind. */
  | 'square'
  /** A lateen yard — the Mediterranean answer, and it points far better. */
  | 'lateen'
  /** Gaff: four-sided fore-and-aft, the working rig of the age of steam. */
  | 'gaff'
  /** Bermudan: the modern triangle, and the closest-winded of the four. */
  | 'bermudan';

/** Anything that can tell you the wind. Structurally SCENA's `WindField`. */
export interface WindSource {
  sample(x: number, z: number, time?: number): Vector2;
}

export interface SailRig extends Prop {
  kind: RigKind;
  /**
   * Radians off the wind inside which she will not sail — the **no-go**.
   *
   * Published rather than inferred, because a helmsman needs it to plan
   * and an AI needs it to avoid steering into a stall it cannot recover
   * from by pointing harder.
   */
  readonly noGo: number;
  /** How much canvas is set, 0 (furled) to 1 (everything). */
  readonly set: number;
  /** Set or shorten sail. */
  setSail(amount: number): void;
  /** Shorten by this much — `reef(0.3)` takes a third of it in. */
  reef(amount?: number): void;
  /** Angle of the apparent wind off the bow, 0 (dead ahead) to π (astern). */
  readonly windAngle: number;
  /** Drive along the hull's heading, 0–1. Multiply by your hull speed. */
  readonly drive: number;
  /**
   * Sideways force, 0–1 — what heels her over.
   *
   * **Not a fixed fraction of `drive`.** The rig's force is roughly square
   * to the canvas and the canvas is trimmed at about half the angle to the
   * wind, so drive is that force's forward component and this is its
   * sideways one: the RATIO between them is `cot(windAngle / 2)` times how
   * tender she is. Dead downwind that is zero and she does not heel at all
   * however hard she is driving; hard on the wind a tender rig is over one
   * and she lies down further than she goes.
   *
   * Where the force itself peaks falls out of the two curves together, and
   * it is not where intuition puts it: on a **close reach**, not
   * close-hauled — and further aft the older the rig, because a square sail
   * makes nothing at all up near the wind to be pressed by.
   */
  readonly heelForce: number;
  /** Are the sails flogging? True in irons, and while sheets are let fly. */
  readonly luffing: boolean;
  /** Bind the wind. */
  setWind(wind: WindSource | null): void;
  /**
   * The polar curve itself, for anybody planning a course.
   *
   * `angleOffWind` in radians, 0 = straight into it. Returns 0 inside the
   * no-go, and peaks on a reach for everything except a square rig — whose
   * best point of sailing is dead astern.
   */
  driveAt(angleOffWind: number): number;
  /**
   * What heading to steer to make ground toward `bearing`.
   *
   * **The function the track exists for.** If the bearing is sailable it
   * hands it straight back. If it is inside the no-go it returns the closer
   * of the two close-hauled headings instead — which is to say it tells you
   * to tack, and the straight line was never available. The course it gives
   * back is always one she will actually sail: laid a couple of degrees
   * outside the no-go, never on the boundary itself.
   */
  layline(bearing: number, currentHeading?: number): number;
  update(dt: number): void;
}

interface KindSpec {
  /** Radians off the wind she will not sail inside. */
  noGo: number;
  /**
   * The polar: drive at 0°, 30°, 60°, 90°, 120°, 150°, 180° off the wind.
   *
   * This table IS the era axis, and it is not a reskin — the shapes are
   * genuinely different curves. A square rig's best point of sailing is
   * dead downwind and it cannot work to windward at all, which is why
   * getting anywhere upwind took the age of sail centuries and a lateen
   * yard. A Bermudan sloop's peak is on a reach and it is still making
   * five-sixths of it at fifty degrees.
   */
  polar: [number, number, number, number, number, number, number];
  /** Height of the mast, metres. */
  mast: number;
  /**
   * How tender she is — the whole rig-and-hull's willingness to lie over.
   *
   * A scale on the side force, not its shape: the shape comes from the
   * angle to the wind and is the same trigonometry for everybody. A square
   * rigger is a deep beamy box that stands up to it; a Bermudan sloop is a
   * tall lever on a light hull and lies down.
   */
  heel: number;
}

const KINDS: Record<RigKind, KindSpec> = {
  square: {
    noGo: 1.22, // ~70°
    polar: [0, 0, 0, 0.30, 0.72, 0.94, 1.0],
    mast: 11, heel: 0.38,
  },
  lateen: {
    noGo: 0.96, // ~55°
    polar: [0, 0, 0.52, 0.86, 1.0, 0.88, 0.62],
    mast: 10, heel: 0.62,
  },
  gaff: {
    noGo: 0.87, // ~50°
    polar: [0, 0, 0.66, 0.95, 1.0, 0.82, 0.52],
    mast: 12, heel: 0.66,
  },
  bermudan: {
    noGo: 0.70, // ~40°
    polar: [0, 0, 0.84, 1.0, 0.96, 0.74, 0.44],
    mast: 13, heel: 0.68,
  },
};

export interface SailOptions {
  kind?: RigKind;
  /** Overall scale of the rig. Default 1. */
  scale?: number;
  /** Start with sail set. Default 1. */
  set?: number;
  seed?: number;
  palette?: Palette;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const TAU = Math.PI * 2;
/** How far outside the no-go a layline is laid — ~2°, i.e. do not pinch. */
const PINCH = 0.035;

/** Shortest signed difference between two bearings, in (-π, π]. */
function wrap(a: number): number {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
}

/**
 * A mast and its canvas.
 *
 * Parent it to a hull: it reads its own world heading and position, so it
 * needs telling nothing about the ship it is on.
 */
export function createSailRig(options: SailOptions = {}): SailRig {
  const kind = options.kind ?? 'gaff';
  const spec = KINDS[kind];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const scale = options.scale ?? 1;

  const group = new Group();
  group.name = `rig-${kind}`;

  const timber = createSurface('wood', { seed, color: palette.woodDark });
  const canvasMat = new MeshStandardMaterial({
    color: 0xe6e0d0,
    roughness: 0.92,
    side: DoubleSide,
    flatShading: true,
  });

  const H = spec.mast * scale;
  const mast = new Mesh(new CylinderGeometry(0.13 * scale, 0.19 * scale, H, 8), timber);
  mast.position.y = H / 2;
  group.add(mast);

  /**
   * The boom or yard swings; the canvas hangs off it.
   *
   * A rig whose sails do not move when you change course is a rig with a
   * picture of a sail on it — the whole visible read here is the boom
   * crossing the deck as she comes about.
   */
  const spar = new Group();
  spar.name = 'spar';
  group.add(spar);

  /**
   * A piece of canvas, and the edge of it that is nailed down.
   *
   * Two things hang off getting this right.
   *
   * Furling: a sail that is half set is not a half-size sail hanging in
   * mid-air, it is a sail that has come DOWN. So each one records the edge
   * bent to its spar — the head for a square sail under its yard, the foot
   * for anything standing up off a boom — and shrinks toward it.
   *
   * And that edge has to be the ORIGIN of the thing that rotates, not a
   * number added afterwards. A rake applied to the mesh and an offset
   * applied to its position do not compose: the offset comes out tilted,
   * and a reefed lateen lifts off its own yard by however much the rake
   * was. Hence the pivot — rake and flog live on it, the canvas inside only
   * ever slides along its own luff.
   */
  interface Canvas {
    mesh: Mesh;
    /** Carries the bent edge: swung athwart, raked, and shaken. */
    pivot: Group;
    height: number;
    /** 'head' = hangs down from a yard; 'foot' = stands up off a boom. */
    anchor: 'head' | 'foot';
    /** Rake within the sail's own plane, before any flogging. */
    rake: number;
  }
  const sails: Canvas[] = [];

  /** Bend a sail to a spar at `at`, and remember which edge that was. */
  const bend = (
    geometry: PlaneGeometry,
    height: number,
    anchor: 'head' | 'foot',
    at: Vector3,
    { swing = 0, rake = 0 } = {}
  ): void => {
    const pivot = new Group();
    pivot.position.copy(at);
    pivot.rotation.set(0, swing, rake);
    const mesh = new Mesh(geometry, canvasMat);
    pivot.add(mesh);
    spar.add(pivot);
    sails.push({ mesh, pivot, height, anchor, rake });
  };

  if (kind === 'square') {
    spar.position.y = H * 0.72;
    const yard = new Mesh(new CylinderGeometry(0.09 * scale, 0.09 * scale, H * 0.82, 6), timber);
    yard.rotation.z = Math.PI / 2;
    spar.add(yard);
    // A square sail lies ACROSS the ship — the plane's own xy is already
    // athwartships-and-vertical, so it needs no swinging at all.
    bend(new PlaneGeometry(H * 0.78, H * 0.46, 6, 4), H * 0.46, 'head', new Vector3(0, 0, 0));
    // A topsail, because a square rig is never one sail.
    const topYard = new Mesh(new CylinderGeometry(0.07 * scale, 0.07 * scale, H * 0.5, 6), timber);
    topYard.rotation.z = Math.PI / 2;
    topYard.position.y = H * 0.28;
    spar.add(topYard);
    bend(new PlaneGeometry(H * 0.48, H * 0.22, 4, 3), H * 0.22, 'head', new Vector3(0, H * 0.28, 0));
  } else if (kind === 'lateen') {
    // FORE-AND-AFT, which is the entire point of a lateen — it is the rig
    // that let the Mediterranean sail closer to the wind than a square sail
    // ever could, and one hung athwartships is just a square sail on the
    // skew. The yard rakes steeply: tack low and forward, peak high and
    // aft, so the lean is about x (into z) and NOT about z (into x).
    spar.position.y = H * 0.22;
    const yard = new Mesh(new CylinderGeometry(0.07 * scale, 0.1 * scale, H * 1.05, 6), timber);
    yard.rotation.x = -0.95;
    yard.position.set(0, H * 0.34, -H * 0.16);
    spar.add(yard);
    bend(new PlaneGeometry(H * 0.85, H * 0.58, 6, 4), H * 0.58, 'foot', new Vector3(0, 0, -H * 0.06), {
      swing: Math.PI / 2,
      rake: 0.3,
    });
  } else {
    // Gaff and Bermudan: a boom at the foot, canvas up the mast.
    spar.position.y = H * 0.16;
    const boom = new Mesh(new CylinderGeometry(0.07 * scale, 0.08 * scale, H * 0.62, 6), timber);
    boom.rotation.x = Math.PI / 2;
    boom.position.z = -H * 0.31;
    spar.add(boom);
    const luff = H * (kind === 'gaff' ? 0.62 : 0.76);
    bend(new PlaneGeometry(H * 0.6, luff, 5, 6), luff, 'foot', new Vector3(0, 0, -H * 0.3), {
      swing: Math.PI / 2,
    });
    if (kind === 'gaff') {
      const gaff = new Mesh(new CylinderGeometry(0.055 * scale, 0.06 * scale, H * 0.42, 6), timber);
      gaff.rotation.x = Math.PI / 2 - 0.4;
      gaff.position.set(0, luff, -H * 0.2);
      spar.add(gaff);
    }
  }
  void rng;

  // ---- state -----------------------------------------------------------
  let wind: WindSource | null = null;
  let sailSet = clamp01(options.set ?? 1);
  let windAngle = Math.PI;
  let drive = 0;
  let heelForce = 0;
  let luffing = false;
  let clock = 0;
  let flog = 0;
  const here = new Vector3();
  const fwd = new Vector3();
  const spin = new Quaternion();

  /**
   * The polar, interpolated.
   *
   * Linear between the seven samples, and hard-zeroed inside the no-go
   * rather than merely small — "she will not go" has to be a wall, not a
   * gentle slope, or a helmsman pinching up gets away with it and the whole
   * constraint evaporates.
   */
  const polarAt = (angle: number): number => {
    const a = Math.abs(wrap(angle));
    if (a < spec.noGo) return 0;
    const t = (a / Math.PI) * 6;
    const i = Math.min(5, Math.floor(t));
    const f = t - i;
    return spec.polar[i] * (1 - f) + spec.polar[i + 1] * f;
  };

  const api: SailRig = {
    object: group,
    obstacleRadius: 0,
    kind,
    noGo: spec.noGo,
    get set() {
      return sailSet;
    },
    get windAngle() {
      return windAngle;
    },
    get drive() {
      return drive;
    },
    get heelForce() {
      return heelForce;
    },
    get luffing() {
      return luffing;
    },
    setSail(amount: number) {
      sailSet = clamp01(amount);
    },
    reef(amount = 0.3) {
      sailSet = clamp01(sailSet - amount);
    },
    setWind(w: WindSource | null) {
      wind = w;
    },
    driveAt(angleOffWind: number) {
      return polarAt(angleOffWind);
    },
    layline(bearing: number, currentHeading?: number) {
      // Where is the wind coming FROM, in world bearing terms?
      group.updateWorldMatrix(true, false);
      group.getWorldPosition(here);
      const w = wind ? wind.sample(here.x, here.z, clock) : new Vector2(0, 0);
      if (w.lengthSq() < 1e-8) return bearing;
      // The wind blows toward `w`; it comes from the opposite bearing.
      const from = Math.atan2(-w.x, -w.y);
      const off = Math.abs(wrap(bearing - from));
      // Sailable? Then the straight line is the answer after all.
      if (off >= spec.noGo) return bearing;
      // Otherwise the two close-hauled headings either side of the wind,
      // and we take whichever is the smaller change from where she is
      // already pointing — that is what makes a tack a decision rather
      // than a coin toss.
      //
      // A hair outside the no-go, never exactly on it. A course laid on the
      // boundary itself is one rounding error from making no ground at all,
      // and a helmsman handed it sails there and stops — pinching. Sailors
      // call the fix footing off, and it is worth two degrees.
      const lay = spec.noGo + PINCH;
      const a = from + lay;
      const b = from - lay;
      const ref = currentHeading ?? bearing;
      return Math.abs(wrap(a - ref)) <= Math.abs(wrap(b - ref)) ? wrap(a) : wrap(b);
    },
    update(dt: number) {
      if (dt <= 0) return;
      clock += dt;
      group.updateWorldMatrix(true, false);
      group.getWorldPosition(here);
      // The hull's heading: +z forward, matching every other craft.
      fwd.set(0, 0, 1).applyQuaternion(group.getWorldQuaternion(spin));

      if (!wind) {
        drive = 0;
        heelForce = 0;
        luffing = false;
        return;
      }
      const w = wind.sample(here.x, here.z, clock);
      const speed = w.length();
      if (speed < 1e-5) {
        drive = 0;
        heelForce = 0;
        luffing = true;
      } else {
        // Angle between where she is pointing and where the wind is coming
        // FROM. Dead ahead into it is 0; dead downwind is π.
        const heading = Math.atan2(fwd.x, fwd.z);
        const from = Math.atan2(-w.x, -w.y);
        windAngle = Math.abs(wrap(heading - from));
        const shape = polarAt(windAngle);
        drive = shape * sailSet * Math.min(1, speed);
        // The rig's force is roughly square to the canvas, and the canvas is
        // trimmed at about half the angle to the wind. So drive is that
        // force's forward component — sin(half) — and heel is its sideways
        // one, cos(half). What matters is the RATIO, cot(half): zero dead
        // downwind, so a ship running before it does not heel however hard
        // she is driving, and greater than one hard on the wind, so she
        // lies over further than she goes. A single fraction of `drive`
        // cannot say either of those things.
        const half = Math.max(0.05, windAngle / 2);
        heelForce = clamp01(drive * (Math.cos(half) / Math.sin(half)) * spec.heel);
        luffing = shape <= 0.001 || sailSet <= 0.02;
      }

      // ---- reads --------------------------------------------------------
      // The spar swings. A rig whose sails do not move when you change
      // course has a picture of a sail on it.
      if (kind === 'square') {
        // Square yards are braced round to meet the wind, up to a limit.
        const brace = wrap(windAngle - Math.PI) * 0.5;
        spar.rotation.y += (brace - spar.rotation.y) * Math.min(1, dt * 1.4);
      } else {
        // Fore-and-aft: the boom goes out on the side away from the wind,
        // further the further off the wind she is.
        const w2 = wind.sample(here.x, here.z, clock);
        const side = wrap(Math.atan2(fwd.x, fwd.z) - Math.atan2(-w2.x, -w2.y));
        const out = (windAngle / Math.PI) * 1.35 * Math.sign(side || 1);
        spar.rotation.y += (out - spar.rotation.y) * Math.min(1, dt * 1.2);
      }

      // Luffing: the canvas flogs. THIS is the feedback loop — a helmsman
      // who has pinched up into the wind sees the sail shaking before the
      // speed has finished bleeding off, and that is the whole reason the
      // no-go zone is learnable rather than merely punishing.
      flog += ((luffing ? 1 : 0) - flog) * Math.min(1, dt * (luffing ? 7 : 3));
      flog = clamp01(flog);
      const hoist = 0.25 + sailSet * 0.75;
      for (let i = 0; i < sails.length; i++) {
        const { mesh, pivot, height, anchor, rake } = sails[i];
        // A sail flogs about the edge it is bent to, not about its middle —
        // so the shake goes on the pivot with the rake, and the canvas
        // itself only ever slides along its own luff.
        pivot.rotation.z = rake + Math.sin(clock * 19 + i * 2.1) * 0.13 * flog;
        // …and it goes SLACK, not just shaky. A flat sail that wobbles is a
        // flag; a sail with no wind in it loses its belly.
        const belly = (1 - flog) * 0.85 + 0.15;
        // Furled canvas is not half-size canvas hanging in mid-air: it comes
        // DOWN. Scale toward the bent edge, never about the middle, or a
        // reefed mainsail floats clear of its own boom.
        mesh.scale.set(belly, hoist, 1);
        mesh.position.y = ((anchor === 'head' ? -1 : 1) * height * hoist) / 2;
        mesh.visible = sailSet > 0.02;
      }
    },
  };
  return api;
}

export const RIG_KINDS: RigKind[] = ['square', 'lateen', 'gaff', 'bermudan'];

/** Degrees, for the tables and the tests, because radians read badly there. */
export const noGoDegrees = (kind: RigKind): number => (KINDS[kind].noGo * 180) / Math.PI;
