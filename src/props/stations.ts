import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
} from 'three';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createSlot } from '../core/types';
import type { Prop } from '../core/types';

/**
 * Interaction stations — props built to be USED. Each publishes `slots`
 * (the ANIMA-compatible handshake) and conforms to ANIMA's GRIPS geometry:
 * seat surfaces at 0.45, anchors at floor level facing +z.
 */

const slot = createSlot;

// ---- treadmill ---------------------------------------------------------

export interface TreadmillOptions {
  seed?: number;
  /** Belt speed in m/s — feed the same number to the runner's Locomotion. */
  speed?: number;
  palette?: Palette;
}

export interface TreadmillProp extends Prop {
  /** Current belt speed (m/s). */
  speed: number;
  /** Change the belt speed; the tread bars follow. */
  setSpeed(speed: number): void;
}

/**
 * A gym treadmill with a genuinely moving belt — instanced tread bars
 * marching toward the runner. Stand a character on the `run` slot and
 * drive its `Locomotion` with `treadmill.speed`: running without going
 * anywhere, which is the whole idea.
 */
export function createTreadmill(options: TreadmillOptions = {}): TreadmillProp {
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  let speed = options.speed ?? 2.4;

  const group = new Group();
  group.name = 'treadmill';
  const coat = createSurface('paintedMetal', { color: palette.metal, seed });
  const steel = createSurface('steel', { seed: seed + 1 });

  const DECK_L = 1.7;
  const DECK_W = 0.72;
  const deck = new Mesh(new BoxGeometry(DECK_W, 0.14, DECK_L), coat);
  deck.position.set(0, 0.09, 0.1);
  group.add(deck);

  // The belt: tread bars that march (looping along the deck).
  const BARS = 12;
  const bars = new InstancedMesh(
    new BoxGeometry(DECK_W - 0.12, 0.022, 0.09),
    new MeshStandardMaterial({ color: 0x1d2126, roughness: 0.85 }),
    BARS
  );
  group.add(bars);
  const matrix = new Matrix4();
  let scroll = 0;
  bars.onBeforeRender = () => {
    const now = performance.now() * 0.001;
    scroll = (now * speed) % 1;
    for (let i = 0; i < BARS; i++) {
      const t = (i / BARS + scroll / (DECK_L - 0.2)) % 1;
      matrix.makeTranslation(0, 0.172, 0.1 + (DECK_L - 0.2) * (t - 0.5));
      bars.setMatrixAt(i, matrix);
    }
    bars.instanceMatrix.needsUpdate = true;
  };
  bars.frustumCulled = false;

  // Uprights, handrails, console.
  for (const side of [-1, 1]) {
    const upright = new Mesh(new BoxGeometry(0.06, 1.15, 0.06), steel);
    upright.position.set(side * (DECK_W / 2 - 0.03), 0.58, -0.62);
    upright.rotation.x = 0.18;
    group.add(upright);
    const rail = new Mesh(new CylinderGeometry(0.022, 0.022, 0.7, 6), steel);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(side * (DECK_W / 2 - 0.03), 1.08, -0.32);
    group.add(rail);
  }
  const console_ = new Mesh(new BoxGeometry(0.56, 0.3, 0.08), coat);
  console_.position.set(0, 1.24, -0.66);
  console_.rotation.x = -0.5;
  group.add(console_);
  const screen = new Mesh(
    new BoxGeometry(0.3, 0.16, 0.02),
    new MeshStandardMaterial({ color: 0x223540, emissive: 0x3fd6c0, emissiveIntensity: 0.7 })
  );
  screen.position.set(0, 1.27, -0.62);
  screen.rotation.x = -0.5;
  group.add(screen);

  // The runner faces the console (-z), standing mid-deck.
  const runSlot = slot('run', 'run', group, 0, 0.19, 0.25, Math.PI);

  return {
    object: group,
    obstacleRadius: 0.95,
    slots: [runSlot],
    get speed() {
      return speed;
    },
    setSpeed(s: number) {
      speed = Math.max(0, s);
    },
  } as TreadmillProp;
}

// ---- guitar ------------------------------------------------------------

export interface GuitarOptions {
  seed?: number;
  /** Body finish. Default warm 'teak'; try palette colors for electrics. */
  color?: number;
  palette?: Palette;
}

/**
 * An acoustic guitar, origin at the body's centre, neck up +y — sized to
 * ANIMA's GRIPS.guitar so it sits right across a strumming character's
 * chest (position it there and add the `strum` loop), or lean it on a
 * wall/stand as décor.
 */
export function createGuitar(options: GuitarOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const wood = createSurface('teak', { color: options.color, seed });
  const dark = new MeshStandardMaterial({ color: 0x2a1c12, flatShading: true });

  const group = new Group();
  group.name = 'guitar';
  const lower = new Mesh(new CylinderGeometry(0.19, 0.19, 0.07, 12), wood);
  lower.rotation.x = Math.PI / 2;
  lower.position.y = -0.05;
  const upper = new Mesh(new CylinderGeometry(0.145, 0.145, 0.07, 12), wood);
  upper.rotation.x = Math.PI / 2;
  upper.position.y = 0.14;
  const hole = new Mesh(new CylinderGeometry(0.055, 0.055, 0.075, 10), dark);
  hole.rotation.x = Math.PI / 2;
  hole.position.y = 0.05;
  group.add(lower, upper, hole);
  const neck = new Mesh(new BoxGeometry(0.05, 0.5, 0.03), dark);
  neck.position.set(0, 0.42, -0.005);
  group.add(neck);
  const head = new Mesh(new BoxGeometry(0.07, 0.12, 0.025), wood);
  head.position.set(0, 0.72, -0.005);
  group.add(head);
  const bridge = new Mesh(new BoxGeometry(0.12, 0.02, 0.02), dark);
  bridge.position.set(0, -0.12, 0.035);
  group.add(bridge);
  // Strings: one thin bright box reads as the course of six.
  const strings = new Mesh(
    new BoxGeometry(0.045, 0.84, 0.004),
    new MeshStandardMaterial({ color: 0xd8d2c0, metalness: 0.6, roughness: 0.3 })
  );
  strings.position.set(0, 0.28, 0.042);
  group.add(strings);

  return { object: group, obstacleRadius: 0 };
}

// ---- bathroom set ------------------------------------------------------

export interface BathroomOptions {
  seed?: number;
  palette?: Palette;
}

/** A ceramic toilet: pedestal, bowl, seat at sit height, tank. */
export function createToilet(options: BathroomOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const ceramic = createSurface('paint', { color: 0xeceae4, seed });
  const group = new Group();
  group.name = 'toilet';

  const pedestal = new Mesh(new BoxGeometry(0.3, 0.34, 0.34), ceramic);
  pedestal.position.set(0, 0.17, -0.04);
  const bowl = new Mesh(new CylinderGeometry(0.2, 0.15, 0.16, 10), ceramic);
  bowl.position.set(0, 0.35, 0.02);
  const seat = new Mesh(new TorusGeometry(0.16, 0.045, 6, 12), ceramic);
  seat.rotation.x = Math.PI / 2;
  seat.position.set(0, 0.44, 0.02);
  const tank = new Mesh(new BoxGeometry(0.4, 0.36, 0.14), ceramic);
  tank.position.set(0, 0.62, -0.24);
  const lid = new Mesh(new BoxGeometry(0.42, 0.04, 0.16), ceramic);
  lid.position.set(0, 0.82, -0.24);
  group.add(pedestal, bowl, seat, tank, lid);

  const sitSlot = slot('sit', 'sit', group, 0, 0, 0.06);
  return { object: group, obstacleRadius: 0.35, slots: [sitSlot] };
}

/** A pedestal sink with a chrome tap. */
export function createSink(options: BathroomOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const ceramic = createSurface('paint', { color: 0xeceae4, seed });
  const chrome = createSurface('chrome', { seed: seed + 1 });
  const group = new Group();
  group.name = 'sink';

  const column = new Mesh(new BoxGeometry(0.16, 0.78, 0.16), ceramic);
  column.position.y = 0.39;
  const basin = new Mesh(new CylinderGeometry(0.24, 0.17, 0.14, 10), ceramic);
  basin.position.y = 0.84;
  group.add(column, basin);
  const tap = new Mesh(new BoxGeometry(0.035, 0.14, 0.035), chrome);
  tap.position.set(0, 0.97, -0.17);
  const spout = new Mesh(new BoxGeometry(0.035, 0.035, 0.12), chrome);
  spout.position.set(0, 1.03, -0.12);
  group.add(tap, spout);

  return { object: group, obstacleRadius: 0.3 };
}

/** A freestanding bathtub on feet — with a `soak` slot (the sleep pose). */
export function createBathtub(options: BathroomOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const ceramic = createSurface('paint', { color: 0xeceae4, seed });
  const group = new Group();
  group.name = 'bathtub';

  const shell = new Mesh(new BoxGeometry(0.74, 0.52, 1.62), ceramic);
  shell.position.y = 0.36;
  const rim = new Mesh(new BoxGeometry(0.82, 0.07, 1.7), ceramic);
  rim.position.y = 0.62;
  const inner = new Mesh(
    new BoxGeometry(0.6, 0.06, 1.46),
    new MeshStandardMaterial({ color: 0x9fc9d8, roughness: 0.15 }) // still water
  );
  inner.position.y = 0.56;
  group.add(shell, rim, inner);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = new Mesh(new BoxGeometry(0.09, 0.12, 0.09), createSurface('brass', { seed: seed + 2, color: palette.metal }));
      foot.position.set(sx * 0.28, 0.05, sz * 0.68);
      group.add(foot);
    }
  }

  // Soaking = the sleep pose, reclined into the tub (anchor pitched flat,
  // body extending along -z toward the head end).
  const soak = slot('soak', 'sleep', group, 0, 0.62, 0.6, 0, -Math.PI / 2);
  return { object: group, obstacleRadius: 0.95, slots: [soak] };
}
