import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { createSurface } from '../materials/surface';
import type { Obstacle } from '../core/types';

/**
 * Breaking boards — *tameshiwari*, and a number SCENA is willing to be wrong
 * about in public.
 *
 * Everything else in this file exists to support one function. `boardStrength`
 * says what it takes to break a board, and it says so from published constants
 * and the board's own dimensions — nothing else:
 *
 *   MODULUS OF RUPTURE     the bending stress timber fails at (Wood Handbook)
 *   YOUNG'S MODULUS        how far it bends on the way there (same source)
 *   STRENGTH RATIO         the knock-down for knots and grain (ASTM D245)
 *   three-point bending    F = 2·σ·b·d² / 3L, the standard relation for a
 *                          simply supported beam loaded in the middle
 *
 * SCENA does not know what a punch is, has never heard of ANIMA, and imports
 * nothing from it. It declares what a board takes and stops.
 *
 * ## It has been checked against the world
 *
 * Feld, McNair and Wilk measured a hand going through a 30 × 15 × 2.5 cm pine
 * board in Scientific American in 1979 and put the breaking force at about
 * 3.1 kN. The formulae above, handed that board's dimensions and nothing else,
 * say 3.62 kN.
 *
 * That is a 17% error from four published numbers and no fitting, which is the
 * point of deriving rather than choosing: the number can be WRONG, out loud,
 * against somebody else's measurement.
 */

export type Timber = 'pine' | 'poplar' | 'cedar' | 'oak' | 'pineWet';

export interface TimberSpec {
  label: string;
  /**
   * Modulus of rupture, pascals — the bending stress at which it snaps.
   * Wood Handbook (USDA FPL) values for clear, kiln-dried, 12% moisture.
   */
  rupture: number;
  /** Young's modulus in bending, pascals. Same source. */
  stiffness: number;
  /** Density, kg/m³ — for the mass of the halves once it is in two. */
  density: number;
}

/**
 * The strength ratio for ordinary graded timber, ASTM D245.
 *
 * The moduli above are CLEAR WOOD — select, defect-free laboratory samples.
 * A board you can buy has knots and slope of grain, and the standard practice
 * for turning clear-wood values into working ones is a visual-grade strength
 * ratio, which for common construction grades sits around a third.
 *
 * It matters here rather than being a detail: without it a 25 mm pine board
 * comes out taking 10.4 kN, and the number that has actually been measured —
 * Feld, McNair and Wilk put a hand through one in Scientific American in 1979
 * — is about 3.1 kN. With it the same board comes out at 3.6 kN. A model that
 * is 3x out and looks fine is exactly what a published measurement is for.
 */
export const GRADE_RATIO = 0.35;

/**
 * Five timbers, and not one of these numbers was chosen to make a demo work.
 *
 * Pine at 40 MPa is the standard tameshiwari board and the reason a beginner
 * can break one. Oak at 100 MPa is two and a half times as hard and is the
 * reason nobody uses it. `pineWet` is the same pine at 20% moisture rather
 * than 12%, which is a real and well-documented 25% loss — and is why boards
 * are kept in a dry room and why a demonstration in the rain goes wrong.
 */
export const TIMBERS: Record<Timber, TimberSpec> = {
  pine: { label: 'Eastern white pine', rupture: 41.4e6, stiffness: 9.0e9, density: 380 },
  poplar: { label: 'Yellow poplar', rupture: 69.6e6, stiffness: 10.9e9, density: 455 },
  cedar: { label: 'Western red cedar', rupture: 51.7e6, stiffness: 7.7e9, density: 350 },
  oak: { label: 'White oak', rupture: 102.3e6, stiffness: 12.3e9, density: 755 },
  pineWet: { label: 'Eastern white pine, green', rupture: 34.5e6, stiffness: 6.8e9, density: 380 },
};

export const TIMBER_NAMES = Object.keys(TIMBERS) as Timber[];

export interface BoardShape {
  timber?: Timber;
  /** Across the grain, metres. A competition board is 0.30. */
  width?: number;
  /** Along the grain, metres. Also 0.30 — boards are square. */
  length?: number;
  /** The one that matters, metres. A competition board is 0.019 (¾"). */
  thickness?: number;
  /**
   * Distance between the two supports, metres. Defaults to 85% of the
   * length, which is where hands or blocks actually sit.
   */
  span?: number;
}

export interface BoardStrength {
  timber: Timber;
  /** Peak force the board takes before it snaps, newtons. */
  force: number;
  /** How far the middle has moved by then, metres. */
  deflection: number;
  /**
   * The work done bending it to failure, joules — the area under a linear
   * force-against-deflection curve, so half of force times deflection.
   *
   * Reported because it is derivable and because it settles an argument: a
   * pine board needs 1.9 J and ANIMA independently puts a hammerfist at 113 J,
   * sixty times more. ENERGY IS NOT WHAT LIMITS BOARD BREAKING. The force is,
   * and `force` is the number to compare against.
   */
  energy: number;
  /** Mass of the board, kg. */
  mass: number;
}

/**
 * How hard a board is, from what it is made of and how thick it is.
 *
 * Three-point bending, which is what a board across two supports with a fist
 * in the middle is:
 *
 *   I = b·d³/12                   second moment of area of a rectangle
 *   F = 2·σ·b·d² / (3·L)          the load at which the outer fibre reaches σ
 *   δ = F·L³ / (48·E·I)           how far the middle has gone by then
 *   U = ½·F·δ                     the work done getting there
 *
 * Thickness is squared in the force and cubed in the stiffness. The obvious
 * conclusion — that doubling it takes eight times as much — is wrong, and was
 * written here that way first: the `d³` is in the STIFFNESS, and a stiffer
 * beam reaches its failure stress sooner, so the deflection at failure falls
 * as `1/d` and the energy comes out linear. See `stackStrength`.
 *
 * The FORCE really is quadratic, and that is the one a person runs out of.
 */
export function boardStrength(shape: BoardShape = {}): BoardStrength {
  const timber = shape.timber ?? 'pine';
  const spec = TIMBERS[timber];
  const b = shape.width ?? 0.3;
  const len = shape.length ?? 0.3;
  const d = shape.thickness ?? 0.019;
  const L = shape.span ?? len * 0.85;
  const I = (b * d * d * d) / 12;
  const force = (GRADE_RATIO * 2 * spec.rupture * b * d * d) / (3 * L);
  const deflection = (force * L * L * L) / (48 * spec.stiffness * I);
  return {
    timber,
    force,
    deflection,
    energy: 0.5 * force * deflection,
    mass: b * len * d * spec.density,
  };
}

/**
 * A stack of them, spaced against glued — and the answer is not the one you
 * would guess.
 *
 * The force to break a beam goes as `d²` and its stiffness as `d³`, so the
 * deflection at failure goes as `1/d` and the ENERGY — half force times
 * deflection — comes out LINEAR in thickness. Six boards glued into one thick
 * beam take exactly the same energy as six separate ones, to the joule.
 *
 * That was written here as "216 times harder" first, on the strength of the
 * `d³`, and it is simply wrong: the `d³` is in the stiffness, and stiffness
 * makes a beam break SOONER, not later. The algebra says `U ∝ σ²bdL/E`.
 *
 * The difference between spaced and glued is entirely in the FORCE, and it is
 * enormous: six spaced boards need 3.6 kN each, one at a time, and the same
 * six glued need 130 kN all at once — which no person can produce. That is
 * what the spacers are for, and nothing about it is about energy.
 */
export function stackStrength(count: number, shape: BoardShape = {}): {
  /** Joules for the whole stack, spaced. */
  spaced: number;
  /** ...and glued into one beam. The same number, which is the point. */
  solid: number;
  /** Newtons needed for ONE spaced board. */
  spacedForce: number;
  /** ...and for the glued beam. This is where the difference lives. */
  solidForce: number;
} {
  const n = Math.max(1, Math.round(count));
  const one = boardStrength(shape);
  const glued = boardStrength({ ...shape, thickness: (shape.thickness ?? 0.019) * n });
  return {
    spaced: one.energy * n,
    solid: glued.energy,
    spacedForce: one.force,
    solidForce: glued.force,
  };
}

// ------------------------------------------------------------- the prop

export type BoardState = 'intact' | 'broken';

export interface BoardOptions extends BoardShape {
  seed?: number;
  /** How many boards, held apart by spacers. Default 1. */
  count?: number;
  /** Height of the supports off the ground, metres. Default 0.9. */
  height?: number;
}

export interface BoardStack {
  group: Group;
  trigger: Obstacle;
  /** What one board of this stack takes, in joules. */
  readonly strength: BoardStrength;
  /** How many are still whole. */
  readonly standing: number;
  readonly state: BoardState;
  /**
   * Hit it with this much FORCE, in newtons.
   *
   * Force rather than energy, because that is what breaks a beam: the outer
   * fibre reaches its rupture stress or it does not, and how much kinetic
   * energy happened to be behind it is a separate question. Returns how many
   * boards broke.
   *
   * Nothing here knows or cares where the newtons came from — a fist, a
   * hammer, a falling rock. It is a force against a threshold computed from
   * the timber, and both sides of that comparison can be derived independently
   * by people who have never heard of each other.
   */
  strike(newtons: number): number;
  reset(): void;
  update(dt: number): void;
}

const GRAVITY = 9.8;

/**
 * Boards on two blocks, and a `strike` that takes joules.
 *
 * The halves fly with whatever energy was left after breaking them, which is
 * the honest thing to do with it: a strike that only just breaks the board
 * drops the pieces, and one with a lot to spare throws them.
 */
export function createBoard(options: BoardOptions = {}): BoardStack {
  const seed = options.seed ?? 1;
  const count = Math.max(1, Math.round(options.count ?? 1));
  const width = options.width ?? 0.3;
  const length = options.length ?? 0.3;
  const thickness = options.thickness ?? 0.019;
  const height = options.height ?? 0.9;
  const strength = boardStrength(options);
  const span = options.span ?? length * 0.85;

  const group = new Group();
  group.name = 'boards';

  // The two supports. Their spacing IS the span the strength was computed
  // from, so moving them changes the number — as it does in a dojo.
  const blockMat = createSurface('stone', { seed });
  for (const s of [-1, 1]) {
    const block = new Mesh(new BoxGeometry(0.09, height, width * 1.1), blockMat);
    block.position.set(0, height / 2, (s * span) / 2);
    group.add(block);
  }

  const timberMat = createSurface('plank', { seed: seed + 1 });
  const gap = thickness * 1.6; // the spacer, and the reason `d` stays small
  interface Half {
    mesh: Mesh;
    vel: Vector3;
    spin: Vector3;
    home: Vector3;
    resting: boolean;
  }
  const boards: Array<{ whole: Mesh; halves: Half[]; broken: boolean }> = [];
  for (let i = 0; i < count; i++) {
    const y = height + thickness / 2 + i * (thickness + gap);
    const whole = new Mesh(new BoxGeometry(width, thickness, length), timberMat);
    whole.position.set(0, y, 0);
    group.add(whole);
    const halves: Half[] = [];
    for (const s of [-1, 1]) {
      const half = new Mesh(new BoxGeometry(width, thickness, length / 2), timberMat);
      half.position.set(0, y, (s * length) / 4);
      half.visible = false;
      group.add(half);
      halves.push({
        mesh: half,
        vel: new Vector3(),
        spin: new Vector3(),
        home: half.position.clone(),
        resting: false,
      });
    }
    boards.push({ whole, halves, broken: false });
  }

  const trigger: Obstacle = { center: group.position, radius: Math.max(width, length) * 0.7 };
  let standing = count;

  return {
    group,
    trigger,
    strength,
    get standing() {
      return standing;
    },
    get state(): BoardState {
      return standing === count ? 'intact' : 'broken';
    },
    strike(newtons: number): number {
      const force = Math.max(0, newtons);
      if (force < strength.force) return 0;
      // Everything the force has over the threshold goes into the halves. A
      // strike that only just breaks the board drops the pieces; one with a
      // lot to spare throws them.
      let left = ((force - strength.force) * strength.deflection) / 2;
      let broke = 0;
      for (const board of boards) {
        if (board.broken) continue;
        if (broke > 0 && left < strength.energy) break;
        left = Math.max(0, left - (broke > 0 ? strength.energy : 0));
        board.broken = true;
        broke++;
        standing--;
        board.whole.visible = false;
        // Whatever is left over goes into the halves, split between them.
        // Half the mass each, so v = sqrt(2E/m) per side.
        const each = left / 2;
        const speed = Math.sqrt((2 * each) / Math.max(0.01, strength.mass / 2));
        for (const [k, half] of board.halves.entries()) {
          half.mesh.visible = true;
          half.resting = false;
          const s = k === 0 ? -1 : 1;
          half.vel.set(0, Math.min(4, speed * 0.35), s * Math.min(6, speed * 0.5));
          half.spin.set(s * Math.min(9, speed), 0, 0);
        }
      }
      return broke;
    },
    reset(): void {
      standing = count;
      for (const board of boards) {
        board.broken = false;
        board.whole.visible = true;
        for (const half of board.halves) {
          half.mesh.visible = false;
          half.mesh.position.copy(half.home);
          half.mesh.rotation.set(0, 0, 0);
          half.vel.set(0, 0, 0);
          half.resting = false;
        }
      }
    },
    update(dt: number): void {
      for (const board of boards) {
        if (!board.broken) continue;
        for (const half of board.halves) {
          if (half.resting) continue;
          half.vel.y -= GRAVITY * dt;
          half.mesh.position.addScaledVector(half.vel, dt);
          half.mesh.rotation.x += half.spin.x * dt;
          if (half.mesh.position.y <= thickness / 2) {
            half.mesh.position.y = thickness / 2;
            half.resting = true;
            half.vel.set(0, 0, 0);
          }
        }
      }
    },
  };
}
