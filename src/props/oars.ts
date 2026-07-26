import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Object3D,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { Prop, PropSlot } from '../core/types';

/**
 * Oars — and why a rowed boat does not travel at a steady speed.
 *
 * A sail is a curve against the angle to the wind. An engine is a throttle.
 * An oar is neither: it is a **duty cycle**. The blade is in the water for
 * something under half of every stroke and out of it for the rest, so the
 * thrust is a pulse and everything downstream of it inherits that.
 *
 * ```ts
 * bank.thrust   // ZERO for most of every stroke
 * bank.way      // …so her speed SURGES: drive, coast, drive, coast
 * ```
 *
 * That is the first idea and it is not a detail — a galley under oars
 * lurches, and the lurch is at the stroke rate, and you can feel the rate
 * from the deck without seeing an oar. Publish thrust as an average and the
 * whole thing becomes an engine with a wooden skin on it.
 *
 * The second idea is that it takes **several bodies agreeing**. Nothing
 * else in the trilogy needs that. Every rower drives off one shared number:
 *
 * ```ts
 * bank.phaseAt(seat)   // 0 at the catch, ~0.4 at the finish, 1 back again
 * ```
 *
 * and ANIMA's rowing controller takes that same number and writes a body
 * with it. Neither library imports the other; the handshake is a **scalar**
 * — a shared clock rather than a shared field or a shared frame, which is a
 * third kind and the only one that can say "together".
 *
 * And they are not quite together, ever. A rower does not watch the
 * coxswain, he watches the blade in front of him, so the stroke propagates
 * down the boat with a delay and `phaseAt` is a different number per seat.
 * Close it up and she runs; let it spread and the blades go in at different
 * moments, the thrusts no longer add, and she slows down — which falls out
 * of averaging the oars rather than being a penalty anybody wrote.
 *
 * ```ts
 * const bank = createOarBank({ kind: 'longship', seats: 8, beam: 4 });
 * ship.object.add(bank.object);
 * game.onUpdate((t) => {
 *   bank.update(t.delta);
 *   ship.update(t.delta, { speed: bank.way, turn: bank.yaw * 0.35 });
 * });
 * ```
 */

export type OarKind =
  /** A pair of oars in a small boat — one person, both hands. */
  | 'skiff'
  /** A longship's benches: heavy oars, slow deep strokes. */
  | 'longship'
  /** A war galley — many oars, driven hard, and a rate you can hear. */
  | 'galley'
  /** A racing eight: light, long, and rowed at forty to the minute. */
  | 'racing';

export const OAR_KINDS: OarKind[] = ['skiff', 'longship', 'galley', 'racing'];

/** One oar in the bank. */
export interface Oar {
  seat: number;
  /** −1 port, +1 starboard. */
  side: -1 | 1;
  /** The whole oar, pivoting at its rowlock. */
  object: Object3D;
  /**
   * The handle, in world space, wherever it is this instant.
   *
   * ANIMA's props conform to the pose rather than the pose reaching for the
   * prop, so this is published for anything that wants to know rather than
   * driven at — but it is the honest answer to "where are his hands".
   */
  grip: Object3D;
  /** Somewhere to sit. */
  seatSlot: PropSlot;
  /** This oar's own phase, which is not the bank's. */
  readonly phase: number;
  /** Is the blade in the water right now? */
  readonly buried: boolean;
  /** What this one is contributing, −1 to 1. */
  readonly thrust: number;
  /** Fouled: the blade did not come clear and she is dragging it. */
  readonly crabbing: boolean;
}

export interface OarBank extends Prop {
  kind: OarKind;
  oars: Oar[];
  seats: PropSlot[];
  slots: PropSlot[];
  /** The stroke's own phase: 0 at the catch, ~0.4 at the finish. */
  readonly phase: number;
  /** Strokes per minute. */
  readonly rate: number;
  setRate(spm: number): void;
  /**
   * How hard they are pulling, −1 (backing water) to 1.
   *
   * Give it two numbers to pull harder on one side than the other, which is
   * how a boat with no rudder turns and how one with a rudder turns quickly.
   */
  setEffort(port: number, starboard?: number): void;
  /**
   * How together they are, 0 (a shambles) to 1 (as one blade).
   *
   * Not a multiplier on the output. It sets how far the stroke smears down
   * the boat, and the loss of thrust comes out of the oars disagreeing.
   */
  together: number;
  /**
   * Thrust this instant, −1 to 1, and **zero through every recovery**.
   *
   * The mean over the bank, so a ragged crew makes less of it without
   * anybody applying a penalty.
   */
  readonly thrust: number;
  /**
   * Her speed through the water, m/s.
   *
   * Integrated from `thrust` against drag, which is the only place the
   * surge can live: hand a hull the instantaneous thrust and she jerks to a
   * stop twice a second.
   */
  readonly way: number;
  /** Turning effect from one side out-pulling the other, −1 to 1. */
  readonly yaw: number;
  /** Fraction of the bank currently fouled. */
  readonly crabbing: number;
  /** Where a given seat is in the stroke. */
  phaseAt(seat: number): number;
  /** Catch a crab: the blade fails to come clear and she drags it. */
  crab(seat: number): void;
  /** Ship oars — everybody stops, blades in. */
  ship(): void;
  /** Out oars again. */
  out(): void;
  readonly rowing: boolean;
  update(dt: number): void;
}

interface KindSpec {
  /** Oar length, metres. */
  loom: number;
  blade: number;
  /** Spacing between benches, metres. */
  pitch: number;
  /** Fastest they can go, strokes per minute. */
  maxRate: number;
  /** Comfortable cruising rate. */
  rate: number;
  /**
   * Fraction of the cycle the blade is in the water.
   *
   * Always well under half. The recovery is the longer part of a stroke —
   * that is what makes rowing a duty cycle rather than a crank.
   */
  drive: number;
  /** How much way a full stroke puts on her. */
  power: number;
  /** How fast she loses it again. */
  drag: number;
  /** Half the angle the loom sweeps through, radians. */
  reach: number;
}

const KINDS: Record<OarKind, KindSpec> = {
  skiff: { loom: 2.6, blade: 0.7, pitch: 0.9, maxRate: 34, rate: 22, drive: 0.42, power: 7.0, drag: 0.9, reach: 0.60 },
  longship: { loom: 4.2, blade: 0.9, pitch: 1.0, maxRate: 30, rate: 20, drive: 0.40, power: 9.0, drag: 0.55, reach: 0.62 },
  galley: { loom: 5.6, blade: 1.1, pitch: 1.15, maxRate: 36, rate: 26, drive: 0.38, power: 11.0, drag: 0.5, reach: 0.58 },
  racing: { loom: 3.8, blade: 0.9, pitch: 1.25, maxRate: 44, rate: 32, drive: 0.36, power: 9.5, drag: 1.1, reach: 0.66 },
};

export interface OarBankOptions {
  kind?: OarKind;
  /** Benches a side. Default per kind. */
  seats?: number;
  /** Beam of the hull it is bolted to — where the rowlocks go. */
  beam?: number;
  /** Height of the gunwale above the vessel's origin. */
  gunwale?: number;
  /** Rowers only down one side, for a sculling boat. Default both. */
  sides?: 1 | 2;
  together?: number;
  seed?: number;
  palette?: Palette;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const wrap01 = (t: number): number => t - Math.floor(t);

/**
 * Smooth 0→1→0 over [0,1], for the shape of a pull.
 *
 * A rower does not apply full force the instant the blade touches, and the
 * pressure comes off before it leaves. A square pulse reads as a piston.
 */
const bump = (t: number): number => Math.sin(Math.PI * clamp01(t)) ** 1.4;

/**
 * A bank of oars.
 *
 * Parent it to a hull. The origin is the hull's origin, +z forward, so the
 * rowlocks land on the gunwale and the blades reach out over the water.
 */
export function createOarBank(options: OarBankOptions = {}): OarBank {
  const kind = options.kind ?? 'longship';
  const spec = KINDS[kind];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const beam = options.beam ?? (kind === 'skiff' ? 1.5 : kind === 'galley' ? 5 : 4);
  const gunwale = options.gunwale ?? (kind === 'skiff' ? 0.45 : 1.1);
  const sides: 1 | 2 = options.sides ?? 2;
  const count = Math.max(1, options.seats ?? (kind === 'skiff' ? 1 : kind === 'racing' ? 4 : 6));

  const group = new Group();
  group.name = `oars-${kind}`;

  const timber = createSurface('wood', { seed, color: palette.woodDark });
  const bladeMat = createSurface('plank', { seed: seed + 1, color: palette.wood });

  // ---- state -----------------------------------------------------------
  let phase = 0;
  let rate = spec.rate;
  let effortPort = 1;
  let effortStar = 1;
  let together = clamp01(options.together ?? 0.85);
  let way = 0;
  let thrust = 0;
  let yaw = 0;
  let rowing = true;
  const crabs = new Map<number, number>();
  /** Per-rower slop, so a ragged crew is ragged in its own way. */
  const wobble: number[] = [];
  for (let i = 0; i < count * 2; i++) wobble.push(rng.range(-1, 1));

  interface Built {
    oar: Oar;
    pivot: Group;
    loom: Group;
    seat: number;
    side: -1 | 1;
    thrust: number;
    phase: number;
    buried: boolean;
  }
  const built: Built[] = [];
  const seats: PropSlot[] = [];

  /**
   * How far the loom is cocked down so the blade reaches the water.
   *
   * An oar runs DOWN and out from its rowlock — the thole is on the gunwale
   * and the blade is under the surface, and the angle between them is set by
   * how high she floats. The first cut left every loom horizontal, so three
   * boats' worth of blades swept about in mid-air a metre above the sea and
   * she made way on nothing at all. Every number in the model was right.
   */
  const outboard = spec.loom * (2 / 3);
  const bury = Math.atan2(gunwale + 0.18, outboard);

  const sideList: Array<-1 | 1> = sides === 1 ? [-1] : [-1, 1];
  for (let i = 0; i < count; i++) {
    const z = ((count - 1) / 2 - i) * spec.pitch;
    for (const side of sideList) {
      // The rowlock: the oar turns about a point ON the gunwale, and both
      // of its motions are rotations about that point.
      const pivot = new Group();
      pivot.position.set((side * beam) / 2, gunwale, z);
      group.add(pivot);

      const thole = new Mesh(new CylinderGeometry(0.05, 0.06, 0.26, 6), timber);
      thole.position.y = 0.1;
      pivot.add(thole);

      // The oar itself lies along the pivot's +x, handle inboard.
      const loom = new Group();
      pivot.add(loom);
      const shaft = new Mesh(
        new CylinderGeometry(0.062, 0.078, spec.loom, 6),
        timber
      );
      shaft.rotation.z = Math.PI / 2;
      // A third of it inboard of the rowlock, two thirds out — which is
      // what makes an oar a lever rather than a paddle.
      shaft.position.x = side * (spec.loom / 2 - spec.loom / 3);
      loom.add(shaft);

      // A blade is a VERTICAL paddle — it pushes water sternward, so it
      // stands on edge in the water. Laid flat it is a spoon, and a bank of
      // spoons skims the surface without gripping anything.
      const blade = new Mesh(new BoxGeometry(spec.blade, 0.3, 0.045), bladeMat);
      blade.position.x = side * (spec.loom * (2 / 3) + spec.blade * 0.4);
      loom.add(blade);

      const grip = new Object3D();
      grip.position.x = -side * (spec.loom / 3);
      loom.add(grip);

      const thwart = new Object3D();
      thwart.position.set((-side * beam) / 6, gunwale - 0.42, z);
      group.add(thwart);
      const slot: PropSlot = {
        kind: 'row',
        anchor: thwart,
        pose: 'sit',
        approach: thwart,
      };
      seats.push(slot);

      const record: Built = {
        seat: i,
        side,
        pivot,
        loom,
        thrust: 0,
        phase: 0,
        buried: false,
        oar: null as unknown as Oar,
      };
      record.oar = {
        seat: i,
        side,
        object: loom,
        grip,
        seatSlot: slot,
        get phase() {
          return record.phase;
        },
        get buried() {
          return record.buried;
        },
        get thrust() {
          return record.thrust;
        },
        get crabbing() {
          return (crabs.get(i * 2 + (side > 0 ? 1 : 0)) ?? 0) > 0;
        },
      };
      built.push(record);
    }
  }

  const key = (b: Built): number => b.seat * 2 + (b.side > 0 ? 1 : 0);

  /**
   * Where a given seat is in the stroke.
   *
   * Behind the stroke oar by a lag that grows as the crew comes apart,
   * because nobody is watching the coxswain — they are watching the blade
   * in front, and every one of them is a little late.
   */
  const phaseAt = (seat: number): number => {
    const slop = 1 - together;
    const lag = slop * 0.09 * seat;
    return wrap01(phase - lag);
  };

  const api: OarBank = {
    object: group,
    obstacleRadius: 0,
    kind,
    oars: built.map((b) => b.oar),
    seats,
    slots: seats,
    get phase() {
      return phase;
    },
    get rate() {
      return rate;
    },
    setRate(spm: number) {
      rate = Math.max(0, Math.min(spec.maxRate, spm));
    },
    setEffort(port: number, starboard = port) {
      effortPort = Math.max(-1, Math.min(1, port));
      effortStar = Math.max(-1, Math.min(1, starboard));
    },
    get together() {
      return together;
    },
    set together(t: number) {
      together = clamp01(t);
    },
    get thrust() {
      return thrust;
    },
    get way() {
      return way;
    },
    get yaw() {
      return yaw;
    },
    get crabbing() {
      let n = 0;
      for (const v of crabs.values()) if (v > 0) n++;
      return built.length ? n / built.length : 0;
    },
    get rowing() {
      return rowing;
    },
    phaseAt,
    crab(seat: number) {
      for (const b of built) {
        if (b.seat !== seat) continue;
        // One oar of the pair, not both — a crab is one blade, and the
        // whole point of it is that she slews.
        crabs.set(key(b), 1);
        break;
      }
    },
    ship() {
      rowing = false;
    },
    out() {
      rowing = true;
    },

    update(dt: number) {
      if (dt <= 0) return;
      if (rowing && rate > 0) phase = wrap01(phase + (rate / 60) * dt);

      // How fast a blade is travelling sternward through the water. Arc
      // length over the time the drive takes — so it rises with the rate,
      // which is the whole reason rating up makes a boat go faster.
      const arc = 2 * spec.reach * spec.loom * (2 / 3);
      const bladeSpeed = rate > 0 ? (arc * rate) / (60 * spec.drive) : 0;

      let sum = 0;
      let port = 0;
      let star = 0;
      let portN = 0;
      let starN = 0;

      for (const b of built) {
        const k = key(b);
        const foul = crabs.get(k) ?? 0;
        if (foul > 0) crabs.set(k, Math.max(0, foul - dt * 0.55));

        const effort = b.side < 0 ? effortPort : effortStar;
        const slop = 1 - together;
        // His own phase: the seat's lag, plus his own slop, which is what
        // makes a ragged crew ragged rather than merely late.
        const own = rowing
          ? wrap01(phaseAt(b.seat) + wobble[k % wobble.length] * slop * 0.05)
          : 0;
        b.phase = own;

        // Backing water runs the whole cycle the other way round.
        const p = effort < 0 ? wrap01(1 - own) : own;
        const inWater = p < spec.drive;
        b.buried = rowing && inWater && foul <= 0;

        // ---- what it is doing to her --------------------------------
        let mine = 0;
        if (rowing) {
          if (foul > 0) {
            // A crab is not "no thrust". The blade is caught flat in the
            // water and being dragged through it, which is worse than not
            // rowing at all — she slews toward the fouled side.
            mine = -0.45 * foul;
          } else if (inWater) {
            // SLIP. A blade only pushes while it is going sternward faster
            // than the water it is in; once she is already travelling at
            // the speed the blade sweeps, it stops biting and starts being
            // dragged along. It is the same fact as propeller slip, and it
            // does three jobs at once:
            //
            //  * she has a terminal speed under oars, and it goes UP with
            //    the rate rather than the model being indifferent to it;
            //  * a crew out of time is slower, because the late blades
            //    catch while she is already running from the early ones'
            //    drive and get much less bite — which is a real mechanism
            //    rather than a penalty applied to raggedness;
            //  * and pulling one side only does not spin her up for ever.
            const bite = bladeSpeed > 1e-4 ? clamp01(1 - way / bladeSpeed) : 0;
            // And being out of time costs him. This one is a term I wrote
            // rather than one that fell out, and it has to be: spreading
            // the same total pull over more of the cycle makes a hull
            // FASTER, because a steady push beats a pulsed one against
            // drag — so left to itself the model says a shambles is quick,
            // which is the opposite of every crew that ever rowed.
            //
            // What is missing from it is the rower. A man out of time is
            // not applying the same force a moment late; he is washing out
            // at the catch and checking her at the finish, fighting the
            // boat through his own stretcher while the rest of them fight
            // him back. That is a property of the body, not of the water,
            // so it does not emerge from the water and it is written here.
            const offBeat = Math.abs(wrap01(own - phase + 0.5) - 0.5);
            const inTime = clamp01(1 - offBeat * 3.6);
            mine = bump(p / spec.drive) * effort * (effort < 0 ? 1 : bite) * inTime;
          }
        }
        b.thrust = mine;
        sum += mine;
        if (b.side < 0) {
          port += mine;
          portN++;
        } else {
          star += mine;
          starN++;
        }

        // ---- and what it looks like ----------------------------------
        // Sweep: aft through the drive, forward again through the recovery.
        // The recovery is the longer half, so it comes back slower than it
        // went — the tell that separates rowing from a windscreen wiper.
        const swing = inWater
          ? p / spec.drive
          : 1 - (p - spec.drive) / (1 - spec.drive);
        const reach = 0.62 + 0.12 * Math.abs(effort);
        b.pivot.rotation.y = b.side * (reach * (swing - 0.5) * 2) * -1;
        // Lift: buried through the drive, clear of the water on the way
        // forward. Without this the blades scythe through the sea in both
        // directions and she should be going nowhere.
        const clear = inWater ? 0 : Math.sin(Math.PI * ((p - spec.drive) / (1 - spec.drive)));
        b.pivot.rotation.z = b.side * -(bury - clear * (bury + 0.22));
        if (foul > 0) {
          // Fouled: the loom kicks up and stops sweeping. It is the one
          // thing in a boat that everybody sees at once.
          b.pivot.rotation.z = b.side * -(bury - 0.9 * foul);
          b.pivot.rotation.y *= 1 - foul * 0.8;
        }
      }

      thrust = built.length ? sum / built.length : 0;
      yaw = (starN ? star / starN : 0) - (portN ? port / portN : 0);

      // ---- her way through the water ---------------------------------
      // The pulse becomes a surge here and nowhere else. Handed straight to
      // a hull, `thrust` stops her dead twice a second.
      way += (thrust * spec.power - way * spec.drag) * dt;
      if (way < 0 && thrust >= 0) way = Math.max(way, -0.5);
    },
  };
  return api;
}

/**
 * Where the handle of an oar sits relative to the thwart a rower is on.
 *
 * Published in the same spirit as ANIMA's `GRIPS`: the prop is built to the
 * body's expectations rather than the body reaching for the prop, so an oar
 * and a rowing pose meet without any runtime IK between them.
 */
export const OAR_GRIP = {
  /** Height of the handle above the thwart at the catch. */
  height: 0.42,
  /** How far in front of the chest the hands go at the catch. */
  reach: 0.58,
  /** …and how far past the body they come at the finish. */
  finish: -0.16,
} as const;

/** Where the handle should be, for a given phase, in the rower's own frame. */
export function oarGripAt(phase: number, out = new Vector3()): Vector3 {
  const p = wrap01(phase);
  const drive = 0.4;
  const swing = p < drive ? p / drive : 1 - (p - drive) / (1 - drive);
  return out.set(
    0,
    OAR_GRIP.height + (1 - swing) * 0.08,
    OAR_GRIP.reach + (OAR_GRIP.finish - OAR_GRIP.reach) * swing
  );
}
