import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
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
