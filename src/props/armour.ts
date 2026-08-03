import { BoxGeometry, CylinderGeometry, Group, Mesh } from 'three';
import { createSurface } from '../materials/surface';

/**
 * Armour — what a plate takes, and the second half of a handshake.
 *
 * SCENA has never heard of an arrow. This file declares what it costs to push
 * a hard point through a sheet of metal, from the metal's yield strength and a
 * ruler, and stops.
 *
 * ## The mechanism is indentation, not punching
 *
 * The obvious model is shearing a plug: force equals perimeter times thickness
 * times shear strength, which is what every press-tool handbook uses for
 * punching holes. Handed a 9 mm bodkin and 2 mm of wrought iron it says
 * **19.6 joules**, and the measured figure is nearly ten times that.
 *
 * It is the wrong mechanism. A sharp point does not shear a plug out — it
 * OPENS A HOLE, pushing metal aside radially, and the pressure that takes is
 * the metal's INDENTATION pressure. Tabor measured that in 1951 and it is
 * about three times the yield stress:
 *
 *   p ≈ 3·σ_y                     Tabor's relation. It is also what a hardness
 *                                 test measures, which is why hardness numbers
 *                                 and yield strengths sit in that ratio
 *   F = p · π·d²/4                over the point's own frontal area
 *   E = F · t                     through the thickness of the plate
 *
 * Same 9 mm bodkin, same 2 mm plate: **114 joules**, against a measured 175.
 * 35% out from two published numbers and a ruler.
 *
 * ## What it is wrong against
 *
 * Alan Williams (*The Knight and the Blast Furnace*, 2003) measured energies to
 * defeat armour and put 2 mm of wrought iron plate at about **175 J**, and mail
 * over padding at around **120 J**. English war-bow arrows carry 80-120 J.
 *
 * Those are system figures — they include dishing the plate over a hand's
 * breadth, the arrow bending, and whatever is underneath. This file models the
 * hole and nothing else, so it should and does come out UNDER them.
 *
 * ## And the part this file deliberately hands off
 *
 * `mailStrength` says what one riveted ring takes, and the answer is almost
 * nothing: a couple of joules. Mail is not what stops the arrow. **The padding
 * under it is**, and the padding is textile — which SCENA has no business
 * knowing the fracture toughness of. That number lives in ANIMA, in a module
 * about cutting people, and neither package imports the other.
 */

export type Alloy = 'wroughtIron' | 'mildSteel' | 'mediumCarbon' | 'hardened' | 'bronze' | 'aluminium';

export interface AlloySpec {
  label: string;
  /** Yield strength, pascals. Ordinary published values. */
  yield: number;
  /** Ultimate tensile strength, pascals. */
  ultimate: number;
  /** kg/m³. */
  density: number;
}

/**
 * Tabor's relation: the indentation pressure of a ductile metal is about three
 * times its yield stress.
 *
 * Measured, in *The Hardness of Metals* (1951), and it is the reason a Vickers
 * number and a yield strength sit in that ratio. It is the single number that
 * turns "how strong is this steel" into "what does it cost to push a spike
 * through it", and there is no fitting anywhere near it.
 */
export const TABOR = 3;

/**
 * Six metals. Wrought iron is the one that matters, because it is what most
 * surviving armour is and it is nothing like modern steel.
 */
export const ALLOYS: Record<Alloy, AlloySpec> = {
  /** Medieval bloomery iron: soft, slaggy, and what most armour actually was. */
  wroughtIron: { label: 'Wrought iron', yield: 200e6, ultimate: 300e6, density: 7750 },
  mildSteel: { label: 'Mild steel', yield: 250e6, ultimate: 400e6, density: 7850 },
  /** Air-cooled medium carbon: the best late-medieval munition plate. */
  mediumCarbon: { label: 'Medium-carbon steel', yield: 400e6, ultimate: 650e6, density: 7850 },
  /** Quenched and tempered — Milanese and Innsbruck work, and rare. */
  hardened: { label: 'Hardened steel', yield: 1100e6, ultimate: 1400e6, density: 7850 },
  bronze: { label: 'Bronze', yield: 180e6, ultimate: 350e6, density: 8800 },
  aluminium: { label: 'Aluminium alloy', yield: 275e6, ultimate: 310e6, density: 2700 },
};

export const ALLOY_NAMES = Object.keys(ALLOYS) as Alloy[];

export interface PlateShape {
  alloy?: Alloy;
  /** Metres. Munition plate is 1.5-2 mm; a jousting breastplate is 4 mm. */
  thickness?: number;
  /** The hole that has to be made, metres — the point's widest diameter. */
  hole?: number;
  /** Metres, for the mass. */
  width?: number;
  height?: number;
}

export interface PlateStrength {
  alloy: Alloy;
  /** Pa — the indentation pressure, 3σ_y. */
  pressure: number;
  /** Newtons to keep the point moving. */
  force: number;
  /** Joules to open a hole all the way through. */
  energy: number;
  /** kg of the panel. */
  mass: number;
  /**
   * What the WRONG model says, joules — shearing a plug out instead of opening
   * a hole.
   *
   * Kept and reported because it is the model everybody reaches for first, it
   * is off by nearly ten times, and a number that is only ever right is a
   * number nobody has checked against the alternative.
   */
  punchingEnergy: number;
}

/**
 * What it costs to put a hard point through a plate.
 *
 * Indentation, not shearing: the point opens a hole of its own diameter
 * against the metal's indentation pressure, all the way through.
 */
export function plateStrength(shape: PlateShape = {}): PlateStrength {
  const alloy = shape.alloy ?? 'wroughtIron';
  const spec = ALLOYS[alloy];
  const t = shape.thickness ?? 0.002;
  const d = shape.hole ?? 0.009;
  const w = shape.width ?? 0.35;
  const h = shape.height ?? 0.45;

  const pressure = TABOR * spec.yield;
  const area = (Math.PI * d * d) / 4;
  const force = pressure * area;

  // The plug-shearing model, for comparison. τ = σ_uts/√3, von Mises.
  const shear = spec.ultimate / Math.sqrt(3);
  const punchForce = Math.PI * d * t * shear;

  return {
    alloy,
    pressure,
    force,
    energy: force * t,
    mass: w * h * t * spec.density,
    punchingEnergy: punchForce * t,
  };
}

export interface MailShape {
  alloy?: Alloy;
  /** Wire diameter, metres. Surviving mail is 1.0-1.6 mm. */
  wire?: number;
  /** Ring inner diameter, metres. Typically 8-10 mm. */
  ring?: number;
}

export interface MailStrength {
  alloy: Alloy;
  /** Newtons to burst one riveted ring — two wire sections in tension. */
  force: number;
  /** Joules, over the distance the point has to open the ring. */
  energy: number;
  /** kg/m² of the fabric. */
  areal: number;
}

/**
 * What one riveted ring takes, and it is not much.
 *
 * A point entering a ring loads it in tension across two sections of wire. The
 * wire is a millimetre and a bit, so the force is a few hundred newtons and the
 * energy is a couple of joules — against the hundred-odd joules an arrow
 * carries.
 *
 * That is not a defect in the model. It is the reason mail was never worn on
 * its own. What stops the arrow is the padding, and the padding is textile.
 */
export function mailStrength(shape: MailShape = {}): MailStrength {
  const alloy = shape.alloy ?? 'wroughtIron';
  const spec = ALLOYS[alloy];
  const wire = shape.wire ?? 0.0012;
  const ring = shape.ring ?? 0.009;

  const section = (Math.PI * wire * wire) / 4;
  const force = 2 * section * spec.ultimate;
  // The point has to open the ring by about its own radius before the wire
  // parts, which is the stroke the work is done over.
  const energy = force * (ring / 2);
  // Four-in-one mail: roughly four rings' worth of wire per ring pitch.
  const perRing = section * Math.PI * (ring + wire) * spec.density;
  const pitch = (ring + wire) * (ring + wire);
  return { alloy, force, energy, areal: pitch > 0 ? (4 * perRing) / pitch : 0 };
}

// ------------------------------------------------------------- the prop

export interface ArmourOptions extends PlateShape {
  seed?: number;
  /** How many strikes it takes before the panel is holed. */
  hits?: number;
}

export interface ArmourProp {
  group: Group;
  strength: PlateStrength;
  /** Holes made so far. */
  holes: number;
  /**
   * Strike it with an energy in JOULES.
   *
   * Joules and not newtons, and that is the opposite of `createBoard`: a board
   * fails when the outer fibre reaches its rupture stress, so what runs out is
   * force. A plate fails when a hole has been opened all the way through, so
   * what runs out is WORK — force through the thickness. The two props take
   * different units because they fail by different mechanisms, and pretending
   * otherwise would be tidier and wrong.
   */
  strike(joules: number): boolean;
  reset(): void;
}

export function createArmour(options: ArmourOptions = {}): ArmourProp {
  const strength = plateStrength(options);
  const seed = options.seed ?? 1;
  const w = options.width ?? 0.35;
  const h = options.height ?? 0.45;
  const t = options.thickness ?? 0.002;

  const group = new Group();
  const panel = new Mesh(
    new BoxGeometry(w, h, Math.max(0.004, t * 3)),
    createSurface('steel', { seed })
  );
  panel.position.y = h / 2;
  group.add(panel);

  const marks: Mesh[] = [];
  const prop: ArmourProp = {
    group,
    strength,
    holes: 0,
    strike(joules: number): boolean {
      if (!(joules >= strength.energy)) return false;
      prop.holes++;
      const hole = new Mesh(
        new CylinderGeometry(0.008, 0.008, t * 4, 10),
        createSurface('steel', { seed: seed + prop.holes })
      );
      hole.rotation.x = Math.PI / 2;
      hole.position.set(
        ((prop.holes * 37) % 100) / 100 - 0.5,
        h / 2 + (((prop.holes * 61) % 100) / 100 - 0.5) * h * 0.6,
        0
      );
      hole.position.x *= w * 0.7;
      group.add(hole);
      marks.push(hole);
      return true;
    },
    reset(): void {
      for (const m of marks) group.remove(m);
      marks.length = 0;
      prop.holes = 0;
    },
  };
  return prop;
}
