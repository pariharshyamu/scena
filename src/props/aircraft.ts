import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createGlass } from '../materials/glass';
import { createSlot, type Prop, type PropSlot } from '../core/types';
import { makeHalo, type LuminousClaim } from './luminous';

/**
 * Aircraft — the vehicle kit grows wings.
 *
 * Same contract as the cars and boats: the prop renders and animates;
 * WHO flies it is GAMA's problem. Feed `update(dt, input)` the flight
 * state and the airplane *shows* it — the propeller spins and becomes a
 * translucent blur disc past a third throttle, the control surfaces
 * deflect with the intent (elevator, differential ailerons, rudder),
 * retractable gear folds away, and the wingtip nav lights (red port,
 * green starboard, white tail, a seeded strobe) are luminous CLAIMS
 * that drop into a `LightBudget` like any street lamp.
 *
 * Authored nose toward +z, origin at the ground contact — park it,
 * taxi it, or hand its pose to a flight controller.
 */

export interface AircraftInput {
  /** Engine setting 0..1. Props spin with it; blur past ~0.35. */
  throttle?: number;
  /** Elevator deflection, -1 (nose down) .. 1 (nose up). */
  pitch?: number;
  /** Aileron deflection, -1 .. 1 (differential, left stick left = -1). */
  roll?: number;
  /** Rudder deflection, -1 .. 1. */
  yaw?: number;
  /** Landing gear down. Default true. Retractables fold over ~1.5 s. */
  gearDown?: boolean;
}

export interface AircraftProp extends Prop {
  update(dt: number, input?: AircraftInput): void;
  /** Nav lights + strobe — register each with a LightBudget. */
  claims: LuminousClaim[];
  /** Master switch for the nav lights. */
  setLit(on: boolean): void;
  readonly lit: boolean;
  wingspan: number;
  length: number;
}

export interface PlaneOptions {
  style?: 'prop' | 'airliner';
  seed?: number;
  color?: number;
  palette?: Palette;
}

interface NavLight {
  material: MeshStandardMaterial;
  halo: ReturnType<typeof makeHalo>;
  base: number;
  /** Strobes blink; steady lights don't. */
  strobe: boolean;
}

function navLight(
  parent: Object3D,
  color: number,
  x: number,
  y: number,
  z: number,
  strobe = false
): { light: NavLight; claim: LuminousClaim; anchor: Object3D } {
  const material = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 });
  const bulb = new Mesh(new BoxGeometry(0.07, 0.07, 0.07), material);
  bulb.position.set(x, y, z);
  const halo = makeHalo(color, 0.55);
  halo.position.set(x, y, z);
  const anchor = new Object3D();
  anchor.position.set(x, y, z);
  parent.add(bulb, halo, anchor);
  return {
    light: { material, halo, base: 2, strobe },
    claim: { anchor, color, intensity: 1.2, radius: 4, priority: 0.6, isLit: () => true },
    anchor,
  };
}

export function createPlane(options: PlaneOptions = {}): AircraftProp {
  const style = options.style ?? 'prop';
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const bodyColor =
    options.color ?? rng.pick([0xe8e2d4, 0xd8dee6, 0xc23b3b, 0x3a6ea5, palette.metal]);
  const skin = createSurface('paintedMetal', { color: bodyColor, seed });
  const accent = createSurface('paintedMetal', { color: 0x2b3340, seed: seed + 1 });
  const glass = createGlass({ tint: 0x9fb8c8 });

  const group = new Group();
  group.name = `plane-${style}`;

  const navLights: NavLight[] = [];
  const claims: LuminousClaim[] = [];
  let lit = true;
  const addNav = (color: number, x: number, y: number, z: number, strobe = false): void => {
    const { light, claim } = navLight(group, color, x, y, z, strobe);
    claim.isLit = () => lit;
    navLights.push(light);
    claims.push(claim);
  };

  const spinners: Object3D[] = [];
  const blurDiscs: Mesh[] = [];
  let elevator: Object3D | null = null;
  let rudder: Object3D | null = null;
  let aileronL: Object3D | null = null;
  let aileronR: Object3D | null = null;
  let gear: Group | null = null;
  let gearRetracts = false;
  let wingspan = 0;
  let length = 0;
  const slots: PropSlot[] = [];

  const blurMaterial = new MeshBasicMaterial({
    color: 0xdadfe8,
    transparent: true,
    opacity: 0,
    side: DoubleSide,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  if (style === 'prop') {
    // ---- A high-wing trainer, tail-to-nose about 6.5 m.
    wingspan = 8.6;
    length = 6.5;
    const deckY = 1.05; // fuselage centreline height on its gear
    const fuselage = new Mesh(new BoxGeometry(1.0, 1.0, 4.4), skin);
    fuselage.position.set(0, deckY, 0.1);
    const nose = new Mesh(new BoxGeometry(0.85, 0.8, 1.0), skin);
    nose.position.set(0, deckY, 2.6);
    const tailboom = new Mesh(new BoxGeometry(0.5, 0.55, 1.8), skin);
    tailboom.position.set(0, deckY + 0.08, -2.7);
    const canopy = new Mesh(new BoxGeometry(0.9, 0.5, 1.3), glass);
    canopy.position.set(0, deckY + 0.62, 0.75);
    group.add(fuselage, nose, tailboom, canopy);

    // The high wing, one straight plank over the cabin.
    const wing = new Mesh(new BoxGeometry(wingspan, 0.14, 1.5), skin);
    wing.position.set(0, deckY + 0.95, 0.55);
    group.add(wing);
    for (const side of [-1, 1]) {
      const strut = new Mesh(new CylinderGeometry(0.035, 0.035, 1.65, 5), accent);
      strut.position.set(side * 1.7, deckY + 0.35, 0.55);
      strut.rotation.z = side * 0.9;
      group.add(strut);
      // Ailerons on the outer third, hinged at their leading edge.
      const aileron = new Mesh(new BoxGeometry(1.9, 0.09, 0.45), accent);
      aileron.position.set(0, 0, -0.22);
      const hinge = new Object3D();
      hinge.position.set(side * 3.1, deckY + 0.95, -0.2);
      hinge.add(aileron);
      group.add(hinge);
      if (side < 0) aileronL = hinge;
      else aileronR = hinge;
    }

    // Tail feathers: fin + rudder, stabilizer + elevator.
    const fin = new Mesh(new BoxGeometry(0.1, 1.15, 0.8), skin);
    fin.position.set(0, deckY + 0.85, -3.35);
    const stab = new Mesh(new BoxGeometry(2.5, 0.09, 0.7), skin);
    stab.position.set(0, deckY + 0.25, -3.4);
    group.add(fin, stab);
    const rudderMesh = new Mesh(new BoxGeometry(0.08, 1.0, 0.45), accent);
    rudderMesh.position.set(0, 0, -0.22);
    rudder = new Object3D();
    rudder.position.set(0, deckY + 0.85, -3.72);
    rudder.add(rudderMesh);
    const elevatorMesh = new Mesh(new BoxGeometry(2.4, 0.07, 0.4), accent);
    elevatorMesh.position.set(0, 0, -0.2);
    elevator = new Object3D();
    elevator.position.set(0, deckY + 0.25, -3.72);
    elevator.add(elevatorMesh);
    group.add(rudder, elevator);

    // The propeller: two blades, a spinner, and the blur disc behind them.
    const propPivot = new Object3D();
    propPivot.position.set(0, deckY, 3.15);
    const spinner = new Mesh(new ConeGeometry(0.16, 0.35, 8), accent);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.z = 0.15;
    propPivot.add(spinner);
    for (const angle of [0, Math.PI]) {
      const blade = new Mesh(new BoxGeometry(0.16, 1.1, 0.05), accent);
      blade.position.y = Math.cos(angle) * 0.55 * (angle === 0 ? 1 : -1);
      blade.rotation.z = angle;
      propPivot.add(blade);
    }
    group.add(propPivot);
    spinners.push(propPivot);
    const disc = new Mesh(new CircleGeometry(1.15, 20), blurMaterial);
    disc.position.set(0, deckY, 3.12);
    group.add(disc);
    blurDiscs.push(disc);

    // Fixed tricycle gear — trainers don't hide their legs.
    gear = new Group();
    const wheel = (x: number, z: number): void => {
      const leg = new Mesh(new BoxGeometry(0.07, 0.5, 0.12), accent);
      leg.position.set(x, 0.5, z);
      const tire = new Mesh(new CylinderGeometry(0.22, 0.22, 0.16, 10), accent);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, 0.24, z);
      gear!.add(leg, tire);
    };
    wheel(-0.85, 0.4);
    wheel(0.85, 0.4);
    wheel(0, 2.4);
    group.add(gear);
    gearRetracts = false;

    slots.push(createSlot('pilot', 'drive', group, -0.22, deckY - 0.42, 0.75));
    addNav(0xff3b30, -wingspan / 2 + 0.1, deckY + 0.95, 0.55); // port red
    addNav(0x34d058, wingspan / 2 - 0.1, deckY + 0.95, 0.55); // starboard green
    addNav(0xffffff, 0, deckY + 1.42, -3.35, true); // tail strobe
  } else {
    // ---- A short-haul airliner, about 26 m of tube.
    wingspan = 24;
    length = 26;
    const deckY = 2.3;
    const tube = new Mesh(new CylinderGeometry(1.5, 1.5, 20, 12), skin);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, deckY, 0);
    const noseCone = new Mesh(new ConeGeometry(1.5, 3.2, 12), skin);
    noseCone.rotation.x = Math.PI / 2;
    noseCone.position.set(0, deckY, 11.6);
    const tailCone = new Mesh(new ConeGeometry(1.5, 4.5, 12), skin);
    tailCone.rotation.x = -Math.PI / 2;
    tailCone.position.set(0, deckY + 0.25, -12.2);
    tailCone.rotation.z = Math.PI; // ugly seam down, roughly
    const cockpit = new Mesh(new BoxGeometry(1.9, 0.6, 1.4), glass);
    cockpit.position.set(0, deckY + 0.75, 9.6);
    group.add(tube, noseCone, tailCone, cockpit);

    // Low swept wings and their engines.
    for (const side of [-1, 1]) {
      const wing = new Mesh(new BoxGeometry(11, 0.3, 3.4), skin);
      wing.position.set(side * 6.4, deckY - 0.8, -1.2);
      wing.rotation.y = side * 0.42; // sweep
      wing.rotation.z = side * -0.06; // dihedral
      group.add(wing);
      const pod = new Mesh(new CylinderGeometry(0.62, 0.55, 2.4, 10), accent);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(side * 4.6, deckY - 1.35, 1.4);
      group.add(pod);
      const fan = new Object3D();
      fan.position.set(side * 4.6, deckY - 1.35, 2.62);
      for (const angle of [0, Math.PI / 2]) {
        const blade = new Mesh(new BoxGeometry(0.1, 1.0, 0.04), accent);
        blade.rotation.z = angle;
        fan.add(blade);
      }
      group.add(fan);
      spinners.push(fan);
      const disc = new Mesh(new CircleGeometry(0.55, 16), blurMaterial);
      disc.position.set(side * 4.6, deckY - 1.35, 2.6);
      group.add(disc);
      blurDiscs.push(disc);
    }

    // Swept tail: fin with rudder, stabs with one shared elevator.
    const fin = new Mesh(new BoxGeometry(0.25, 4.2, 2.6), skin);
    fin.position.set(0, deckY + 2.3, -11.3);
    fin.rotation.x = -0.35;
    group.add(fin);
    const rudderMesh = new Mesh(new BoxGeometry(0.18, 3.2, 0.9), accent);
    rudderMesh.position.set(0, 1.2, -0.5);
    rudder = new Object3D();
    rudder.position.set(0, deckY + 1.4, -12.2);
    rudder.add(rudderMesh);
    group.add(rudder);
    const stab = new Mesh(new BoxGeometry(8, 0.2, 1.8), skin);
    stab.position.set(0, deckY + 0.6, -11.4);
    group.add(stab);
    const elevatorMesh = new Mesh(new BoxGeometry(7.6, 0.15, 0.7), accent);
    elevatorMesh.position.set(0, 0, -0.35);
    elevator = new Object3D();
    elevator.position.set(0, deckY + 0.6, -12.3);
    elevator.add(elevatorMesh);
    group.add(elevator);

    // Retractable gear: two mains and a nose leg that fold away.
    gear = new Group();
    const leg = (x: number, z: number): void => {
      const strut = new Mesh(new BoxGeometry(0.14, 1.6, 0.2), accent);
      strut.position.set(x, 1.5, z);
      const tire = new Mesh(new CylinderGeometry(0.45, 0.45, 0.35, 10), accent);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, 0.5, z);
      gear!.add(strut, tire);
    };
    leg(-1.6, -1.6);
    leg(1.6, -1.6);
    leg(0, 8.2);
    group.add(gear);
    gearRetracts = true;

    slots.push(createSlot('pilot', 'drive', group, -0.45, deckY - 1.1, 9.4));
    slots.push(createSlot('copilot', 'drive', group, 0.45, deckY - 1.1, 9.4));
    addNav(0xff3b30, -11.6, deckY - 0.35, -3.6); // port red
    addNav(0x34d058, 11.6, deckY - 0.35, -3.6); // starboard green
    addNav(0xffffff, 0, deckY + 0.3, -13.8, true); // tail strobe
    addNav(0xff3b30, 0, deckY + 1.55, 0, true); // top beacon
  }

  let spin = 0;
  let gearState = 1; // 1 = down
  let strobeClock = rng.range(0, 2);

  const setLit = (on: boolean): void => {
    lit = on;
    for (const nav of navLights) {
      nav.material.emissiveIntensity = on ? nav.base : 0.05;
      nav.halo.visible = on;
    }
  };

  return {
    object: group,
    obstacleRadius: style === 'prop' ? 4 : 12,
    slots,
    claims,
    wingspan,
    length,
    get lit() {
      return lit;
    },
    setLit,
    update(dt, input = {}) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      const throttle = Math.min(Math.max(input.throttle ?? 0, 0), 1);
      spin += step * (4 + throttle * 55);
      for (const pivot of spinners) pivot.rotation.z = spin;
      // Past a third throttle the blades read as a disc, not blades.
      const blur = Math.min(Math.max((throttle - 0.35) / 0.3, 0), 1);
      blurMaterial.opacity = blur * 0.28;
      for (const disc of blurDiscs) disc.visible = blur > 0;

      const pitch = Math.min(Math.max(input.pitch ?? 0, -1), 1);
      const roll = Math.min(Math.max(input.roll ?? 0, -1), 1);
      const yawIn = Math.min(Math.max(input.yaw ?? 0, -1), 1);
      if (elevator) elevator.rotation.x = -pitch * 0.5;
      if (rudder) rudder.rotation.y = -yawIn * 0.5;
      if (aileronL) aileronL.rotation.x = roll * 0.45;
      if (aileronR) aileronR.rotation.x = -roll * 0.45;

      if (gear && gearRetracts) {
        const target = (input.gearDown ?? true) ? 1 : 0;
        gearState += Math.min(Math.max(target - gearState, -step / 1.5), step / 1.5);
        gear.position.y = (1 - gearState) * 1.4; // legs fold up into the belly
        gear.visible = gearState > 0.02;
      }

      // The strobe: two quick white pops a second, aviation-style.
      strobeClock += step;
      const flash = strobeClock % 1.1;
      const strobeOn = flash < 0.06 || (flash > 0.16 && flash < 0.22);
      for (const nav of navLights) {
        if (!nav.strobe) continue;
        nav.material.emissiveIntensity = lit && strobeOn ? nav.base * 1.6 : 0.05;
        nav.halo.visible = lit && strobeOn;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Helicopter

export interface HelicopterInput {
  /** Rotor spool, 0..1 — blades blur past ~0.5, and droop when parked. */
  rotor?: number;
  /** Cyclic: tilts the rotor disc to show intent, -1..1 each. */
  cyclicPitch?: number;
  cyclicRoll?: number;
  /** The nose searchlight. */
  light?: boolean;
}

export interface HelicopterProp extends Prop {
  update(dt: number, input?: HelicopterInput): void;
  /** Nav lights + the searchlight — register with a LightBudget. */
  claims: LuminousClaim[];
  /** Aim pivot for the searchlight: rotate to sweep the beam. */
  searchlight: Object3D;
  /** Searchlight on/off (the claim and beam follow). */
  setSearchlight(on: boolean): void;
  readonly searchlightOn: boolean;
  /** Current rotor spool, 0..1 (lerps toward the input). */
  readonly rotor: number;
}

export interface HelicopterOptions {
  seed?: number;
  color?: number;
  palette?: Palette;
}

/**
 * A utility helicopter: cabin, boom, skids, a main rotor that droops
 * when parked and blurs into a disc when spooled, a tail rotor doing
 * the same sideways, and a nose SEARCHLIGHT — an aimable pivot with an
 * additive beam and a luminous claim, ready to be the visible half of a
 * GAMA `Flashlight` sweeping an `Illumination` field.
 */
export function createHelicopter(options: HelicopterOptions = {}): HelicopterProp {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const bodyColor = options.color ?? rng.pick([0xd8a13a, 0xc23b3b, 0x3a6ea5, palette.metal]);
  const skin = createSurface('paintedMetal', { color: bodyColor, seed });
  const dark = createSurface('paintedMetal', { color: 0x2b3340, seed: seed + 1 });
  const glass = createGlass({ tint: 0x9fb8c8 });

  const group = new Group();
  group.name = 'helicopter';
  const deckY = 1.0;

  // Cabin + boom + fin.
  const cabin = new Mesh(new BoxGeometry(1.5, 1.3, 2.6), skin);
  cabin.position.set(0, deckY + 0.35, 0.5);
  const nose = new Mesh(new BoxGeometry(1.2, 0.9, 0.8), glass);
  nose.position.set(0, deckY + 0.3, 1.95);
  const boom = new Mesh(new BoxGeometry(0.4, 0.45, 3.2), skin);
  boom.position.set(0, deckY + 0.5, -2.2);
  const fin = new Mesh(new BoxGeometry(0.09, 0.9, 0.6), skin);
  fin.position.set(0, deckY + 1.0, -3.7);
  group.add(cabin, nose, boom, fin);

  // Skids.
  for (const side of [-1, 1]) {
    const rail = new Mesh(new BoxGeometry(0.09, 0.09, 2.6), dark);
    rail.position.set(side * 0.85, 0.1, 0.4);
    group.add(rail);
    for (const z of [-0.4, 1.2]) {
      const strut = new Mesh(new CylinderGeometry(0.04, 0.04, 0.85, 5), dark);
      strut.position.set(side * 0.75, 0.55, z);
      strut.rotation.z = side * 0.25;
      group.add(strut);
    }
  }

  // The main rotor: mast, hub, blades on their own pivots (for droop),
  // and the blur disc that replaces them at speed.
  const mast = new Group(); // tilts with the cyclic
  mast.position.set(0, deckY + 1.1, 0.3);
  const mastPole = new Mesh(new CylinderGeometry(0.07, 0.09, 0.5, 6), dark);
  mastPole.position.y = 0.1;
  mast.add(mastPole);
  const rotorHead = new Group(); // spins
  rotorHead.position.y = 0.35;
  const bladePivots: Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const pivot = new Object3D();
    pivot.rotation.y = (i / 3) * Math.PI * 2;
    const blade = new Mesh(new BoxGeometry(0.24, 0.04, 3.4), dark);
    blade.position.z = 1.75;
    pivot.add(blade);
    rotorHead.add(pivot);
    bladePivots.push(pivot);
  }
  mast.add(rotorHead);
  const mainBlurMaterial = new MeshBasicMaterial({
    color: 0xdadfe8,
    transparent: true,
    opacity: 0,
    side: DoubleSide,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const mainBlur = new Mesh(new CircleGeometry(3.55, 24), mainBlurMaterial);
  mainBlur.rotation.x = -Math.PI / 2;
  mainBlur.position.y = 0.36;
  mast.add(mainBlur);
  group.add(mast);

  // The tail rotor, doing the same job sideways.
  const tailRotor = new Group();
  tailRotor.position.set(0.28, deckY + 1.0, -3.7);
  for (const angle of [0, Math.PI / 2]) {
    const blade = new Mesh(new BoxGeometry(0.05, 0.9, 0.12), dark);
    blade.rotation.x = angle;
    tailRotor.add(blade);
  }
  const tailBlur = new Mesh(new CircleGeometry(0.55, 14), mainBlurMaterial);
  tailBlur.rotation.y = Math.PI / 2;
  tailRotor.add(tailBlur);
  group.add(tailRotor);

  // Nav lights, off the shared helper.
  const navLights: NavLight[] = [];
  const claims: LuminousClaim[] = [];
  let lit = true;
  for (const [color, x, strobe] of [
    [0xff3b30, -0.8, false],
    [0x34d058, 0.8, false],
    [0xffffff, 0, true],
  ] as Array<[number, number, boolean]>) {
    const { light, claim } = navLight(group, color, x, deckY + 0.95, strobe ? -3.9 : 0.6, strobe);
    claim.isLit = () => lit;
    navLights.push(light);
    claims.push(claim);
  }

  // The searchlight: an aimable pivot under the nose with a lens, a
  // long additive beam, and a claim that outranks the street below.
  const searchlight = new Object3D();
  searchlight.position.set(0, deckY - 0.35, 1.7);
  const lensMaterial = new MeshStandardMaterial({
    color: 0xfff6d8,
    emissive: 0xfff6d8,
    emissiveIntensity: 2.4,
  });
  const housing = new Mesh(new CylinderGeometry(0.16, 0.2, 0.3, 10), dark);
  housing.rotation.x = Math.PI / 2;
  const lens = new Mesh(new CircleGeometry(0.17, 10), lensMaterial);
  lens.position.z = 0.16;
  const beamMaterial = new MeshBasicMaterial({
    color: 0xfff2c0,
    transparent: true,
    opacity: 0.16,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const beam = new Mesh(new ConeGeometry(2.4, 14, 14, 1, true), beamMaterial);
  beam.rotation.x = -Math.PI / 2;
  beam.position.z = 7.16;
  const beamHalo = makeHalo(0xfff6d8, 1.1);
  const lightAnchor = new Object3D();
  lightAnchor.position.z = 0.3;
  searchlight.add(housing, lens, beam, beamHalo, lightAnchor);
  searchlight.rotation.x = 0.5; // resting aim: down and ahead
  group.add(searchlight);
  let lightOn = false;
  claims.push({
    anchor: lightAnchor,
    color: 0xfff6d8,
    intensity: 5,
    radius: 16,
    priority: 1.5,
    isLit: () => lightOn,
  });

  let rotorSpeed = 0;
  let spin = 0;
  let strobeClock = rng.range(0, 2);

  const setSearchlight = (on: boolean): void => {
    lightOn = on;
    lensMaterial.emissiveIntensity = on ? 2.4 : 0.1;
    beam.visible = on;
    beamHalo.visible = on;
  };
  setSearchlight(false);

  return {
    object: group,
    obstacleRadius: 3.6,
    slots: [createSlot('pilot', 'drive', group, -0.35, deckY - 0.35, 0.9)],
    claims,
    searchlight,
    setSearchlight,
    get searchlightOn() {
      return lightOn;
    },
    get rotor() {
      return rotorSpeed;
    },
    update(dt, input = {}) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      const target = Math.min(Math.max(input.rotor ?? 0, 0), 1);
      rotorSpeed += Math.min(Math.max(target - rotorSpeed, -step / 3), step / 3); // spool takes time
      spin += step * rotorSpeed * 28;
      rotorHead.rotation.y = spin;
      tailRotor.rotation.x = spin * 4.7;

      // Parked blades droop; spun blades cone flat with the lift.
      const droop = 0.09 * (1 - Math.min(rotorSpeed * 1.6, 1));
      for (const pivot of bladePivots) pivot.rotation.x = droop;

      // Past half spool the blades read as a disc.
      const blur = Math.min(Math.max((rotorSpeed - 0.5) / 0.25, 0), 1);
      mainBlurMaterial.opacity = blur * 0.26;
      mainBlur.visible = blur > 0;
      tailBlur.visible = blur > 0;

      // The cyclic tilts the DISC — the fuselage follows it elsewhere.
      const cp = Math.min(Math.max(input.cyclicPitch ?? 0, -1), 1);
      const cr = Math.min(Math.max(input.cyclicRoll ?? 0, -1), 1);
      mast.rotation.x = cp * 0.12;
      mast.rotation.z = -cr * 0.12;

      if (input.light !== undefined && input.light !== lightOn) setSearchlight(input.light);

      strobeClock += step;
      const flash = strobeClock % 1.1;
      const strobeOn = flash < 0.06 || (flash > 0.16 && flash < 0.22);
      for (const nav of navLights) {
        if (!nav.strobe) continue;
        nav.material.emissiveIntensity = lit && strobeOn ? nav.base * 1.6 : 0.05;
        nav.halo.visible = lit && strobeOn;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Fighter jet

export interface FighterInput extends AircraftInput {
  /** Light the burner regardless of throttle (default: throttle > 0.8). */
  afterburner?: boolean;
}

export interface FighterProp extends Prop {
  update(dt: number, input?: FighterInput): void;
  claims: LuminousClaim[];
  setLit(on: boolean): void;
  readonly lit: boolean;
  /** Under-wing anchors, each carrying a dummy round until launched. */
  hardpoints: Object3D[];
  /** Rounds still hanging. */
  readonly armed: number;
  /**
   * Take the round off hardpoint `i`: hides the dummy and returns the
   * launch pose in WORLD space — hand it straight to GAMA `Missiles.fire`.
   * Null if that rail is already empty.
   */
  launchFrom(i: number): { position: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number } } | null;
  /** Hang fresh rounds on every rail. */
  rearm(): void;
  wingspan: number;
  length: number;
}

export interface FighterOptions {
  seed?: number;
  color?: number;
  palette?: Palette;
  /** Rails under the wings. Default 2. */
  hardpoints?: number;
}

/**
 * A delta-wing fighter: extruded delta, ELEVONS (each surface mixes
 * pitch and roll — that's what elevons are), a big fin, retractable
 * gear, and an afterburner whose flame lights past 80% throttle and
 * flickers on its own seeded nerve. The under-wing hardpoints carry
 * dummy rounds; `launchFrom(i)` hands GAMA's `Missiles` a world-space
 * launch pose and hides the round, so the missile the game flies is
 * the missile the wing stops carrying.
 */
export function createFighterJet(options: FighterOptions = {}): FighterProp {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const bodyColor = options.color ?? rng.pick([0x5d6a78, 0x3a4550, 0x6e7a68, palette.metal]);
  const skin = createSurface('paintedMetal', { color: bodyColor, seed });
  const dark = createSurface('paintedMetal', { color: 0x262c33, seed: seed + 1 });
  const glass = createGlass({ tint: 0x88b0c8 });

  const group = new Group();
  group.name = 'fighter';
  const deckY = 1.35;
  const railCount = Math.min(Math.max(options.hardpoints ?? 2, 1), 4);

  // Fuselage: a long box with a needle nose and a canopy bump.
  const body = new Mesh(new BoxGeometry(1.1, 0.9, 9), skin);
  body.position.set(0, deckY, 0);
  const noseCone = new Mesh(new ConeGeometry(0.5, 2.6, 8), skin);
  noseCone.rotation.x = Math.PI / 2;
  noseCone.position.set(0, deckY, 5.8);
  const canopy = new Mesh(new BoxGeometry(0.7, 0.5, 1.7), glass);
  canopy.position.set(0, deckY + 0.6, 2.6);
  const intakeL = new Mesh(new BoxGeometry(0.5, 0.6, 2.4), dark);
  intakeL.position.set(-0.8, deckY - 0.1, 1.2);
  const intakeR = intakeL.clone();
  intakeR.position.x = 0.8;
  group.add(body, noseCone, canopy, intakeL, intakeR);

  // The delta: one thin extruded triangle across both sides.
  const half = 4.6;
  const chord = 5.6;
  const deltaShape = new Shape();
  deltaShape.moveTo(-half, -chord / 2);
  deltaShape.lineTo(half, -chord / 2);
  deltaShape.lineTo(0, chord / 2);
  deltaShape.lineTo(-half, -chord / 2);
  const deltaGeometry = new ExtrudeGeometry(deltaShape, { depth: 0.12, bevelEnabled: false });
  deltaGeometry.rotateX(-Math.PI / 2);
  const delta = new Mesh(deltaGeometry, skin);
  delta.position.set(0, deckY - 0.15, -1.2);
  group.add(delta);

  // Elevons: two trailing surfaces that MIX pitch and roll.
  const elevons: Object3D[] = [];
  for (const side of [-1, 1]) {
    const surface = new Mesh(new BoxGeometry(2.6, 0.08, 0.7), dark);
    surface.position.set(0, 0, -0.35);
    const hinge = new Object3D();
    hinge.position.set(side * 2.2, deckY - 0.1, -3.9);
    hinge.add(surface);
    group.add(hinge);
    elevons.push(hinge);
  }
  const fin = new Mesh(new BoxGeometry(0.12, 2.1, 1.9), skin);
  fin.position.set(0, deckY + 1.15, -3.6);
  fin.rotation.x = -0.4;
  group.add(fin);
  const rudderMesh = new Mesh(new BoxGeometry(0.1, 1.5, 0.6), dark);
  rudderMesh.position.set(0, 0.7, -0.3);
  const rudder = new Object3D();
  rudder.position.set(0, deckY + 0.6, -4.35);
  rudder.add(rudderMesh);
  group.add(rudder);

  // The burner: nozzle, hot core, and the flame that lights past 80%.
  const nozzle = new Mesh(new CylinderGeometry(0.42, 0.36, 0.7, 10), dark);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, deckY, -4.6);
  group.add(nozzle);
  const flameMaterial = new MeshBasicMaterial({
    color: 0xffa242,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const flame = new Mesh(new ConeGeometry(0.34, 2.6, 10, 1, true), flameMaterial);
  flame.rotation.x = Math.PI / 2;
  flame.position.set(0, deckY, -6.2);
  const flameHalo = makeHalo(0xffa242, 1.3);
  flameHalo.position.set(0, deckY, -5.2);
  flameHalo.visible = false;
  group.add(flame, flameHalo);

  // Hardpoints: rails under the delta, each with a dummy round hanging.
  const hardpoints: Object3D[] = [];
  const rounds: Mesh[] = [];
  for (let i = 0; i < railCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const spread = 1.3 + Math.floor(i / 2) * 1.1;
    const rail = new Object3D();
    rail.position.set(side * spread, deckY - 0.55, -1.4);
    const pylon = new Mesh(new BoxGeometry(0.08, 0.28, 0.6), dark);
    pylon.position.y = 0.14;
    const round = new Mesh(new ConeGeometry(0.13, 1.6, 6), dark);
    round.rotation.x = Math.PI / 2;
    rail.add(pylon, round);
    group.add(rail);
    hardpoints.push(rail);
    rounds.push(round);
  }

  // Gear, folding like the airliner's.
  const gear = new Group();
  for (const [x, z] of [
    [-0.9, -0.8],
    [0.9, -0.8],
    [0, 4.2],
  ]) {
    const strut = new Mesh(new BoxGeometry(0.1, 1.1, 0.14), dark);
    strut.position.set(x, 0.75, z);
    const tire = new Mesh(new CylinderGeometry(0.28, 0.28, 0.2, 10), dark);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, 0.28, z);
    gear.add(strut, tire);
  }
  group.add(gear);

  const navLights: NavLight[] = [];
  const claims: LuminousClaim[] = [];
  let lit = true;
  for (const [color, x, z, strobe] of [
    [0xff3b30, -half, -3.9, false],
    [0x34d058, half, -3.9, false],
    [0xffffff, 0, -4.6, true],
  ] as Array<[number, number, number, boolean]>) {
    const { light, claim } = navLight(group, color, x, deckY - 0.1, z, strobe);
    claim.isLit = () => lit;
    navLights.push(light);
    claims.push(claim);
  }

  let gearState = 1;
  let strobeClock = rng.range(0, 2);
  let flick = rng.range(0, 10);
  const launchScratch = new Vector3();
  const dirScratch = new Vector3();

  return {
    object: group,
    obstacleRadius: 6,
    slots: [createSlot('pilot', 'drive', group, 0, deckY - 0.55, 2.5)],
    claims,
    hardpoints,
    wingspan: half * 2,
    length: 12,
    get lit() {
      return lit;
    },
    get armed() {
      return rounds.filter((r) => r.visible).length;
    },
    setLit(on: boolean) {
      lit = on;
      for (const nav of navLights) {
        nav.material.emissiveIntensity = on ? nav.base : 0.05;
        nav.halo.visible = on;
      }
    },
    launchFrom(i: number) {
      const round = rounds[i];
      if (!round || !round.visible) return null;
      round.visible = false;
      round.getWorldPosition(launchScratch);
      dirScratch.set(0, 0, 1).applyQuaternion(group.quaternion);
      return {
        position: { x: launchScratch.x, y: launchScratch.y, z: launchScratch.z },
        direction: { x: dirScratch.x, y: dirScratch.y, z: dirScratch.z },
      };
    },
    rearm() {
      for (const round of rounds) round.visible = true;
    },
    update(dt, input = {}) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      const throttle = Math.min(Math.max(input.throttle ?? 0, 0), 1);
      const pitch = Math.min(Math.max(input.pitch ?? 0, -1), 1);
      const roll = Math.min(Math.max(input.roll ?? 0, -1), 1);
      const yawIn = Math.min(Math.max(input.yaw ?? 0, -1), 1);

      // Elevons: each side is pitch PLUS its share of roll.
      elevons[0].rotation.x = -(pitch + roll) * 0.4;
      elevons[1].rotation.x = -(pitch - roll) * 0.4;
      rudder.rotation.y = -yawIn * 0.45;

      // The burner: past 80% throttle (or commanded), flame and flicker.
      const burning = input.afterburner ?? throttle > 0.8;
      flick += step;
      const wave = 0.85 + Math.sin(flick * 31) * Math.sin(flick * 17) * 0.15;
      flameMaterial.opacity = burning ? 0.55 * wave : 0;
      flame.visible = burning;
      flame.scale.set(1, wave * (0.8 + throttle * 0.5), 1);
      flameHalo.visible = burning;

      const target = (input.gearDown ?? true) ? 1 : 0;
      gearState += Math.min(Math.max(target - gearState, -step / 1.2), step / 1.2);
      gear.position.y = (1 - gearState) * 1.2;
      gear.visible = gearState > 0.02;

      strobeClock += step;
      const flash = strobeClock % 1.1;
      const strobeOn = flash < 0.06 || (flash > 0.16 && flash < 0.22);
      for (const nav of navLights) {
        if (!nav.strobe) continue;
        nav.material.emissiveIntensity = lit && strobeOn ? nav.base * 1.6 : 0.05;
        nav.halo.visible = lit && strobeOn;
      }
    },
  };
}
