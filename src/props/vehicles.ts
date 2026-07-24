import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createGlass } from '../materials/glass';
import { createSlot } from '../core/types';
import type { Prop } from '../core/types';

/**
 * Land vehicles — low-poly, palette-themed, and ALIVE: every vehicle
 * exposes a kinematic `update(dt, { speed, steer })` that spins the wheels
 * radius-correctly, turns the fronts and twirls the steering wheel, plus
 * GRIPS-conformant `slots` so an ANIMA character drops into the driver's
 * seat with the `drive` (or `cycle`) pose and their hands land on the
 * controls by construction. GAMA steering output plugs straight in:
 * speed from `agent.velocity.length()`, steer from the heading change.
 */

export interface VehicleInput {
  /** Ground speed in m/s (wheels spin to match). */
  speed?: number;
  /** Steering angle in radians (front wheels + steering wheel follow). */
  steer?: number;
}

export interface VehicleProp extends Prop {
  /** Advance the running gear. Call from your game loop when it moves. */
  update(dt: number, input?: VehicleInput): void;
}

export interface VehicleOptions {
  seed?: number;
  /** Body colour. Defaults to a seeded pick from the palette. */
  color?: number;
  palette?: Palette;
}

interface Wheel {
  node: Object3D;
  radius: number;
  steers: boolean;
}

/** A tire + hub on a spin pivot, axle along local x. */
function makeWheel(radius: number, width: number, seed: number): { pivot: Object3D; spin: Object3D } {
  const pivot = new Object3D(); // yaw pivot (steering)
  const spin = new Object3D(); // roll pivot (speed)
  pivot.add(spin);
  const tire = new Mesh(
    new TorusGeometry(radius * 0.78, radius * 0.24, 6, 12),
    new MeshStandardMaterial({ color: 0x1d2126, roughness: 0.9 })
  );
  tire.rotation.y = Math.PI / 2;
  const hub = new Mesh(
    new CylinderGeometry(radius * 0.55, radius * 0.55, width, 8),
    createSurface('steel', { seed })
  );
  hub.rotation.z = Math.PI / 2;
  spin.add(tire, hub);
  return { pivot, spin };
}

/** Wire the shared running-gear update. */
function running(
  wheels: Wheel[],
  spins: Object3D[],
  steeringWheel: Object3D | null
): VehicleProp['update'] {
  return (dt, input = {}) => {
    const speed = input.speed ?? 0;
    const steer = Math.max(-0.6, Math.min(0.6, input.steer ?? 0));
    wheels.forEach((wheel, i) => {
      spins[i].rotation.x += (speed / wheel.radius) * dt;
      if (wheel.steers) wheel.node.rotation.y = steer;
    });
    if (steeringWheel) steeringWheel.rotation.z = -steer * 2.2;
  };
}

/** A compact modern car: powder-coat body, glass cabin, driver's slot. */
export function createCar(options: VehicleOptions = {}): VehicleProp {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const bodyColor = options.color ?? rng.pick([0xb8433a, 0x3a6ea5, 0x3f7f5c, 0xd8d5cc, palette.metal]);
  const body = createSurface('paintedMetal', { color: bodyColor, seed });
  const trim = new MeshStandardMaterial({ color: 0x22262b, flatShading: true });
  const glass = createGlass({ tint: 0x9fb8c8 });

  const group = new Group();
  group.name = 'car';
  const chassis = new Mesh(new BoxGeometry(1.8, 0.52, 4.0), body);
  chassis.position.y = 0.62;
  const nose = new Mesh(new BoxGeometry(1.7, 0.3, 0.9), body);
  nose.position.set(0, 0.98, 1.5);
  const cabin = new Mesh(new BoxGeometry(1.62, 0.56, 2.1), body);
  cabin.position.set(0, 1.14, -0.35);
  group.add(chassis, nose, cabin);
  const windshield = new Mesh(new BoxGeometry(1.5, 0.5, 0.06), glass);
  windshield.position.set(0, 1.16, 0.72);
  windshield.rotation.x = -0.42;
  const rear = windshield.clone();
  rear.position.set(0, 1.16, -1.42);
  rear.rotation.x = 0.42;
  group.add(windshield, rear);
  for (const side of [-1, 1]) {
    const pane = new Mesh(new BoxGeometry(0.05, 0.42, 1.9), glass);
    pane.position.set(side * 0.82, 1.18, -0.35);
    group.add(pane);
    for (const [z, lit] of [[1.95, 0xfff2cc], [-1.95, 0xd8402a]] as const) {
      const lamp = new Mesh(
        new BoxGeometry(0.3, 0.12, 0.06),
        new MeshStandardMaterial({ color: lit, emissive: lit, emissiveIntensity: 0.5 })
      );
      lamp.position.set(side * 0.6, 0.78, z);
      group.add(lamp);
    }
  }
  const bumperF = new Mesh(new BoxGeometry(1.84, 0.16, 0.2), trim);
  bumperF.position.set(0, 0.44, 2.0);
  const bumperR = bumperF.clone();
  bumperR.position.z = -2.0;
  group.add(bumperF, bumperR);

  const wheels: Wheel[] = [];
  const spins: Object3D[] = [];
  const R = 0.34;
  for (const [x, z, steers] of [[-0.86, 1.32, true], [0.86, 1.32, true], [-0.86, -1.32, false], [0.86, -1.32, false]] as const) {
    const { pivot, spin } = makeWheel(R, 0.16, seed + wheels.length);
    pivot.position.set(x, R, z);
    group.add(pivot);
    wheels.push({ node: pivot, radius: R, steers });
    spins.push(spin);
  }

  // Driver's seat + the standard wheel at ANIMA's GRIPS offsets.
  const driver = createSlot('driver', 'drive', group, -0.42, 0.12, -0.15);
  const passenger = createSlot('passenger', 'sit', group, 0.42, 0.12, -0.15);
  const wheelMesh = new Mesh(new TorusGeometry(0.19, 0.025, 6, 12), trim);
  const column = new Object3D();
  column.position.set(-0.42, 0.12 + 0.75, -0.15 + 0.45);
  column.rotation.x = -0.5;
  column.add(wheelMesh);
  group.add(column);

  return {
    object: group,
    obstacleRadius: 2.2,
    slots: [driver, passenger],
    update: running(wheels, spins, wheelMesh),
  };
}

/** A bicycle: frame, saddle at GRIPS height, handlebar, cranking pedals. */
export function createBike(options: VehicleOptions = {}): VehicleProp {
  const seed = options.seed ?? 1;
  const frame = createSurface('paintedMetal', { color: options.color ?? 0xc24d38, seed });
  const dark = new MeshStandardMaterial({ color: 0x22262b, flatShading: true });

  const group = new Group();
  group.name = 'bike';
  const R = 0.34;
  const tube = (x1: number, y1: number, z1: number, y2: number, z2: number): void => {
    const length = Math.hypot(y2 - y1, z2 - z1);
    const bar = new Mesh(new CylinderGeometry(0.022, 0.022, length, 6), frame);
    bar.position.set(x1, (y1 + y2) / 2, (z1 + z2) / 2);
    bar.rotation.x = Math.atan2(z2 - z1, y2 - y1);
    group.add(bar);
  };
  tube(0, R, 0.62, 0.72, 0.5); //   head tube line
  tube(0, 0.68, 0.48, 0.42, -0.12); // top tube (sloped)
  tube(0, R, -0.62, 0.75, -0.55); // seat stay
  tube(0, 0.36, -0.05, 0.75, -0.55); // seat tube
  tube(0, R, 0.62, 0.36, -0.05); // down tube

  const saddle = new Mesh(new BoxGeometry(0.24, 0.05, 0.3), dark);
  saddle.position.set(0, 0.8, -0.55); // GRIPS.saddleHeight
  group.add(saddle);
  const bars = new Mesh(new CylinderGeometry(0.018, 0.018, 0.5, 6), dark);
  bars.rotation.z = Math.PI / 2;
  bars.position.set(0, 1.0, 0.45); // GRIPS.handlebar
  group.add(bars);

  const wheels: Wheel[] = [];
  const spins: Object3D[] = [];
  for (const [z, steers] of [[0.62, true], [-0.62, false]] as const) {
    const { pivot, spin } = makeWheel(R, 0.05, seed + wheels.length);
    pivot.position.set(0, R, z);
    group.add(pivot);
    wheels.push({ node: pivot, radius: R, steers });
    spins.push(spin);
  }
  // Pedal cranks, geared to the wheels (roughly 1:2).
  const crank = new Object3D();
  crank.position.set(0, 0.36, -0.05);
  for (const s of [-1, 1]) {
    const pedal = new Mesh(new BoxGeometry(0.1, 0.03, 0.14), dark);
    pedal.position.set(s * 0.14, s * 0.16, 0);
    crank.add(pedal);
  }
  group.add(crank);

  const rider = createSlot('rider', 'cycle', group, 0, 0.05, -0.5);
  const base = running(wheels, spins, null);
  return {
    object: group,
    obstacleRadius: 0.85,
    slots: [rider],
    update: (dt, input = {}) => {
      base(dt, input);
      crank.rotation.x += ((input.speed ?? 0) / 0.34) * 0.5 * dt;
      // The bike leans gently into a steer.
      group.rotation.z = -(input.steer ?? 0) * 0.25;
    },
  };
}

/** A farm tractor: big rears, small steering fronts, open perch, stack. */
export function createTractor(options: VehicleOptions = {}): VehicleProp {
  const seed = options.seed ?? 1;
  const body = createSurface('paintedMetal', { color: options.color ?? 0x3f7f3a, seed });
  const trim = new MeshStandardMaterial({ color: 0x22262b, flatShading: true });

  const group = new Group();
  group.name = 'tractor';
  const hull = new Mesh(new BoxGeometry(1.1, 0.7, 2.6), body);
  hull.position.set(0, 0.85, 0.2);
  const hood = new Mesh(new BoxGeometry(0.86, 0.5, 1.3), body);
  hood.position.set(0, 1.25, 0.85);
  group.add(hull, hood);
  const stack = new Mesh(new CylinderGeometry(0.05, 0.05, 0.7, 6), trim);
  stack.position.set(0.28, 1.8, 1.2);
  group.add(stack);
  const arch = new Mesh(new BoxGeometry(1.3, 0.12, 0.12), body);
  arch.position.set(0, 1.9, -0.9);
  group.add(arch);
  for (const side of [-1, 1]) {
    const post = new Mesh(new BoxGeometry(0.08, 1.0, 0.08), trim);
    post.position.set(side * 0.6, 1.45, -0.9);
    group.add(post);
  }

  const wheels: Wheel[] = [];
  const spins: Object3D[] = [];
  for (const [x, z, radius, steers] of [
    [-0.62, 1.05, 0.36, true], [0.62, 1.05, 0.36, true],
    [-0.72, -0.75, 0.68, false], [0.72, -0.75, 0.68, false],
  ] as const) {
    const { pivot, spin } = makeWheel(radius, radius * 0.5, seed + wheels.length);
    pivot.position.set(x, radius, z);
    group.add(pivot);
    wheels.push({ node: pivot, radius, steers });
    spins.push(spin);
  }

  const driver = createSlot('driver', 'drive', group, 0, 0.75, -0.55);
  const wheelMesh = new Mesh(new TorusGeometry(0.19, 0.025, 6, 12), trim);
  const column = new Object3D();
  column.position.set(0, 1.5, -0.1);
  column.rotation.x = -0.6;
  column.add(wheelMesh);
  group.add(column);

  return {
    object: group,
    obstacleRadius: 1.7,
    slots: [driver],
    update: running(wheels, spins, wheelMesh),
  };
}

/** A box truck: cab, cargo box, six wheels, driver's slot up front. */
export function createTruck(options: VehicleOptions = {}): VehicleProp {
  const seed = options.seed ?? 1;
  const cabPaint = createSurface('paintedMetal', { color: options.color ?? 0x3a6ea5, seed });
  const boxPaint = createSurface('paint', { color: 0xdcd9d0, seed: seed + 1 });
  const trim = new MeshStandardMaterial({ color: 0x22262b, flatShading: true });
  const glass = createGlass({ tint: 0x9fb8c8 });

  const group = new Group();
  group.name = 'truck';
  const cab = new Mesh(new BoxGeometry(2.0, 1.3, 1.7), cabPaint);
  cab.position.set(0, 1.25, 2.2);
  group.add(cab);
  const windshield = new Mesh(new BoxGeometry(1.8, 0.6, 0.06), glass);
  windshield.position.set(0, 1.5, 3.06);
  windshield.rotation.x = -0.15;
  group.add(windshield);
  const cargo = new Mesh(new BoxGeometry(2.2, 2.0, 4.2), boxPaint);
  cargo.position.set(0, 1.65, -0.9);
  group.add(cargo);
  const frameRail = new Mesh(new BoxGeometry(2.0, 0.2, 6.4), trim);
  frameRail.position.set(0, 0.6, 0.2);
  group.add(frameRail);

  const wheels: Wheel[] = [];
  const spins: Object3D[] = [];
  const R = 0.42;
  for (const [x, z, steers] of [
    [-1.0, 2.3, true], [1.0, 2.3, true],
    [-1.0, -0.4, false], [1.0, -0.4, false],
    [-1.0, -1.6, false], [1.0, -1.6, false],
  ] as const) {
    const { pivot, spin } = makeWheel(R, 0.24, seed + wheels.length);
    pivot.position.set(x, R, z);
    group.add(pivot);
    wheels.push({ node: pivot, radius: R, steers });
    spins.push(spin);
  }

  const driver = createSlot('driver', 'drive', group, -0.55, 0.68, 2.0);
  const wheelMesh = new Mesh(new TorusGeometry(0.19, 0.025, 6, 12), trim);
  const column = new Object3D();
  column.position.set(-0.55, 1.43, 2.45);
  column.rotation.x = -0.55;
  column.add(wheelMesh);
  group.add(column);

  return {
    object: group,
    obstacleRadius: 3.4,
    slots: [driver],
    update: running(wheels, spins, wheelMesh),
  };
}
