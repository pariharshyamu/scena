import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

/**
 * Stabilisers — and the only thing in this library that **stops working when
 * you stop.**
 *
 * A fin stabiliser is a wing. It makes its righting moment out of lift, and
 * lift comes out of water going past it, so a ship lying stopped has none at
 * all — she rolls exactly as badly as she would with no fins fitted, and the
 * fins are still there costing her the drag. Get her moving and they come
 * alive; the faster she goes the better they work, because lift goes as the
 * **square** of the speed.
 *
 * ```ts
 * const fins = createStabilisers({ kind: 'activeFin' });
 * ship.object.add(fins.object);
 *
 * fins.deploy(true);
 * game.onUpdate((t) => {
 *   fins.setWay(plant.way);                 // …and this is what they run on
 *   fins.update(t.delta);
 *   ship.update(t.delta, {
 *     speed: plant.way - fins.drag,         // they are not free
 *     damping: fins.damping,
 *   });
 * });
 * ```
 *
 * That is backwards from every other comfort in a ship. A wider hull is calm
 * at anchor. Deep loading is calm at anchor. Fins are the one thing that is
 * worst exactly when she is least able to do anything about it — riding out a
 * gale hove to, which is the moment you want them most.
 *
 * ## They take the roll out and leave the pitch
 *
 * `damping` touches `ShipInput.damping`, which touches the roll and nothing
 * else. A stabilised ship in a head sea pitches exactly as hard as an
 * unstabilised one, and that is the commonest complaint about them rather
 * than a simplification here.
 */
export type StabiliserKind = 'bilgeKeel' | 'fin' | 'activeFin' | 'gyro';

/**
 * The era axis is **what it needs from you.**
 *
 * A bilge keel needs nothing whatever — welded on, never moves, works at any
 * speed including none — and takes about a quarter of the roll out. A fin
 * needs way. An active fin needs way *and* power and gives you nearly all of
 * it back. And the gyro is the inversion at the end: it asks for no speed, no
 * water, no drag and no thought, and then simply cannot lift a big ship —
 * which is why it is on yachts and not on liners.
 */
export const STABILISER_KINDS: StabiliserKind[] = ['bilgeKeel', 'fin', 'activeFin', 'gyro'];

export interface Stabilisers extends Prop {
  kind: StabiliserKind;
  /** Run them out, or house them. A no-op on a bilge keel, which is welded on
   *  — and that no-op is the era axis. */
  deploy(out: boolean): void;
  /** Where the fins ARE, 0 housed to 1 fully out. They travel. */
  readonly out: number;
  readonly ordered: boolean;
  /** Her way through the water, m/s. What they run on. */
  setWay(speed: number): void;
  readonly way: number;
  /**
   * How much of her roll they are ACTUALLY taking out, 0–1 — straight into
   * `ShipInput.damping`.
   *
   * Not what they are rated at: what they are managing, at this speed, at
   * this much deployment. Zero when she is stopped, for everything but a
   * gyro.
   */
  readonly damping: number;
  /** What they are rated at, with all the way in the world. */
  readonly rated: number;
  /** Speed they are costing her, m/s. Subtract it from what you hand the
   *  hull — comfort is not free and this is the bill. */
  readonly drag: number;
  /** Working, and not merely deployed. */
  readonly biting: boolean;
  /** The speed below which they do essentially nothing, m/s. Published so a
   *  bridge can say "we need eight knots to steady her" rather than a
   *  caller having to know it. */
  readonly bites: number;
  update(dt: number): void;
}

export interface StabiliserOptions {
  kind?: StabiliserKind;
  /** Her beam, m — the fins are sized off it. Default per kind. */
  beam?: number;
  /** How far below the waterline they come out. Default per kind. */
  depth?: number;
  /** Start them out. Default false, because a fin housed is a fin that has
   *  not yet been bent on somebody's quay. */
  deployed?: boolean;
  seed?: number;
  palette?: Palette;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

interface KindSpec {
  beam: number;
  depth: number;
  /** Roll reduction with all the way in the world, 0–1. */
  rated: number;
  /**
   * Speed at which they make HALF their rated damping, m/s.
   *
   * Lift goes as the square of the speed, so this is not a threshold with a
   * cliff at it — it is the knee of a curve, and below it she is on her own
   * by degrees rather than all at once.
   */
  bites: number;
  /** m/s of way they cost when fully out and she is doing 10 m/s. */
  cost: number;
  /** m/s of way they cost when HOUSED. A bilge keel never houses. */
  parked: number;
  /** Seconds to run them out. */
  travel: number;
  /** Does it need water going past it? */
  needsWay: boolean;
  /** Fins a side. */
  fins: number;
}

const KINDS: Record<StabiliserKind, KindSpec> = {
  bilgeKeel: {
    beam: 24, depth: 3.2, rated: 0.26, bites: 0.6, cost: 0.05, parked: 0.05,
    travel: 0, needsWay: false, fins: 1,
    // Welded to the turn of the bilge and never moves. It works by dragging,
    // not by lifting, so it does not care whether she is going anywhere —
    // and it is dragging all the time, including in harbour.
  },
  fin: {
    beam: 24, depth: 4.0, rated: 0.62, bites: 4.6, cost: 0.22, parked: 0.02,
    travel: 40, needsWay: true, fins: 1,
  },
  activeFin: {
    beam: 24, depth: 4.6, rated: 0.9, bites: 3.8, cost: 0.34, parked: 0.02,
    travel: 55, needsWay: true, fins: 2,
    // The real thing: fins driven off a gyro, actively working against the
    // roll rather than merely resisting it. Nearly all of the roll, for a
    // third of a metre a second and a very long time running them out.
  },
  gyro: {
    beam: 12, depth: 0, rated: 0.55, bites: 0, cost: 0.0, parked: 0.0,
    travel: 180, needsWay: false, fins: 0,
    // ASKS NOTHING. No water, no speed, no drag — and it is a flywheel, so
    // what it can do is bounded by how heavy it is, which is why the beam it
    // is sized for here is half a liner's and it is on yachts instead.
  },
};

export function createStabilisers(options: StabiliserOptions = {}): Stabilisers {
  const kind = options.kind ?? 'activeFin';
  const base = KINDS[kind];
  const spec: KindSpec = {
    ...base,
    beam: options.beam ?? base.beam,
    depth: options.depth ?? base.depth,
  };
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  void palette;
  void rng;

  const group = new Group();
  group.name = `stabilisers:${kind}`;

  const steel = createSurface('steel', { color: 0x3b4046, seed });
  const antifoul = new MeshStandardMaterial({ color: 0x7d2f28, roughness: 0.85 });

  interface Blade {
    pivot: Object3D;
    side: number;
  }
  const blades: Blade[] = [];

  if (kind === 'gyro') {
    // A flywheel in a housing, on her centreline and as low as it will go.
    const housing = new Mesh(new CylinderGeometry(spec.beam * 0.16, spec.beam * 0.16, spec.beam * 0.2, 16), steel);
    housing.position.y = -0.4;
    group.add(housing);
    const wheel = new Object3D();
    wheel.name = 'flywheel';
    group.add(wheel);
    const rim = new Mesh(
      new CylinderGeometry(spec.beam * 0.13, spec.beam * 0.13, spec.beam * 0.06, 20),
      createSurface('steel', { color: 0x8a9099, seed: seed + 1 })
    );
    rim.position.y = -0.4;
    wheel.add(rim);
    blades.push({ pivot: wheel, side: 0 });
  } else {
    for (const side of [-1, 1]) {
      for (let i = 0; i < spec.fins; i++) {
        const pivot = new Object3D();
        pivot.name = `fin:${side < 0 ? 'port' : 'stbd'}${i}`;
        // On the turn of the bilge, low and about a third aft of amidships.
        pivot.position.set(side * spec.beam * 0.46, -spec.depth * 0.55, -i * spec.beam * 0.7);
        group.add(pivot);

        if (kind === 'bilgeKeel') {
          // A STRAKE, not a wing: a long thin plate running most of her
          // length, and it never moves because there is nothing to move it.
          const strake = new Mesh(
            new BoxGeometry(0.14, spec.depth * 0.35, spec.beam * 3.6),
            antifoul
          );
          strake.position.x = side * 0.1;
          pivot.add(strake);
        } else {
          const root = new Mesh(new CylinderGeometry(0.34, 0.34, 0.9, 10), steel);
          root.rotation.z = Math.PI / 2;
          pivot.add(root);
          const fin = new Mesh(new BoxGeometry(spec.beam * 0.34, 0.34, spec.beam * 0.16), steel);
          fin.position.x = side * spec.beam * 0.19;
          pivot.add(fin);
          const tip = new Mesh(new BoxGeometry(spec.beam * 0.06, 0.22, spec.beam * 0.12), antifoul);
          tip.position.x = side * spec.beam * 0.36;
          pivot.add(tip);
        }
        blades.push({ pivot, side });
      }
    }
  }

  // A bilge keel is always out and has no travel; everything else starts
  // housed unless the caller says otherwise.
  let out = spec.travel <= 0 ? 1 : options.deployed ? 1 : 0;
  let ordered = out > 0.5;
  let way = 0;
  let angle = 0;
  let spin = 0;

  const place = (): void => {
    for (const b of blades) {
      if (kind === 'gyro') {
        // A flywheel does not stop when the ship does. It is the one moving
        // part here whose speed has nothing to do with hers.
        b.pivot.rotation.y = spin;
      } else if (kind === 'bilgeKeel') {
        b.pivot.rotation.z = 0;
      } else {
        // Housed, they lie fore-and-aft in their boxes; out, they stand
        // athwartships and the ACTIVE ones work — the visible angle is the
        // angle of attack, and it goes to nothing when she has no way on.
        b.pivot.rotation.y = (1 - out) * (Math.PI / 2) * b.side;
        b.pivot.rotation.z = out * angle * b.side;
      }
    }
  };
  place();

  const api: Stabilisers = {
    object: group,
    // Below the waterline. Nobody walks round it.
    obstacleRadius: 0,
    kind,
    deploy(want: boolean) {
      // A SILENT NO-OP on a bilge keel, and that no-op is the era axis: it is
      // welded to her, and there was never a lever.
      if (spec.travel <= 0) return;
      ordered = want;
    },
    get out() {
      return out;
    },
    get ordered() {
      return ordered;
    },
    setWay(speed: number) {
      way = Math.abs(Number.isFinite(speed) ? speed : 0);
    },
    get way() {
      return way;
    },
    rated: spec.rated,
    bites: spec.bites,
    get damping() {
      if (!spec.needsWay) return spec.rated * out;
      // LIFT GOES AS THE SQUARE OF THE SPEED, so this is a knee and not a
      // cliff: she loses them by degrees as she slows, and at rest she has
      // nothing. Written as a threshold it would switch off at a stroke and
      // a ship would go from steady to rolling between two frames.
      const v = way / Math.max(1e-6, spec.bites);
      return spec.rated * out * (v * v) / (1 + v * v);
    },
    get drag() {
      // They cost her whether they are working or not, and a housed fin still
      // costs a little because the box it lives in is a hole in her bottom.
      const share = spec.parked + (spec.cost - spec.parked) * out;
      return share * (way / 10) * (way / 10) * 10 * 0.1 + share * 0.08;
    },
    get biting() {
      return api.damping > spec.rated * 0.25;
    },
    update(dt: number) {
      if (!(dt > 0)) return;
      if (spec.travel > 0) {
        const step = dt / spec.travel;
        const want = ordered ? 1 : 0;
        const err = want - out;
        out += Math.abs(err) <= step ? err : Math.sign(err) * step;
      }
      // The angle of attack an active fin is holding. It is a READ, not a
      // control: it goes to nothing as she loses way, which is what makes a
      // stopped ship's fins visibly idle rather than invisibly useless.
      const bite = spec.needsWay ? clamp01(way / Math.max(1e-6, spec.bites * 2)) : 1;
      angle = (kind === 'activeFin' ? 0.42 : 0.16) * bite;
      spin += dt * (kind === 'gyro' ? 26 : 0);
      place();
    },
  };
  return api;
}

/**
 * How much roll a set of fins would take out at a given speed — without
 * building any.
 *
 * Published for the same reason `freeSurfaceCost` is: it is the question you
 * want to ask *before* you commit, and the answer is a curve rather than a
 * yes. At half their biting speed they are managing a fifth of what they are
 * rated at; at twice it, four fifths.
 */
export function dampingAt(kind: StabiliserKind, speed: number): number {
  const spec = KINDS[kind];
  if (!spec.needsWay) return spec.rated;
  const v = Math.abs(speed) / Math.max(1e-6, spec.bites);
  return (spec.rated * (v * v)) / (1 + v * v);
}
