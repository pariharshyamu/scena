import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createScreenPanel, type ScreenPanel } from '../materials/screen';
import { createSlot, type Prop, type PropSlot } from '../core/types';

/**
 * Fixtures — the small wall-mounted things a smart home is made of.
 *
 * These are deliberately tiny. A switch is 8 cm across and a sensor smaller
 * than that, so almost none of the modelling budget goes on shape: what makes
 * them read is the **indicator** — a single lit pip whose colour says what the
 * device thinks is happening. That pip is the whole prop at any honest camera
 * distance, which is why every one of these publishes `setIndicator`.
 *
 * ```ts
 * const sensor = createFixture({ style: 'sensor' });
 * home.on('motion', (v) => sensor.setIndicator(v > 0.5 ? 0x44ff88 : 0x223026));
 * ```
 */
export interface Fixture extends Prop {
  /** Set the indicator colour, and how hard it burns (0 = dark). */
  setIndicator(color: number, strength?: number): void;
  /** The panel, on the fixtures that carry one (thermostat only). */
  screen?: ScreenPanel;
  /** Where a character stands to reach it, on the ones you touch. */
  slot?: PropSlot;
  /** The mounting height this was built for, in metres. */
  height: number;
}

export type FixtureStyle = 'switch' | 'thermostat' | 'doorbell' | 'camera' | 'sensor';

export interface FixtureOptions {
  style?: FixtureStyle;
  seed?: number;
  palette?: Palette;
  /** Indicator colour to start with. */
  indicator?: number;
}

/**
 * A wall fixture. The origin is at the **wall face**, with the device facing
 * +z — so parenting it to a wall and pushing it to the right height is the
 * whole placement job.
 *
 * - `switch` — a rocker plate at hand height, with a slot to stand at.
 * - `thermostat` — a small round dial with a screen in it.
 * - `doorbell` — a button with a bright ring, up beside a door.
 * - `camera` — a stub body angled down, with a lens and a status pip.
 * - `sensor` — a corner-mounted wedge; the smallest thing in the kit.
 */
export function createFixture(options: FixtureOptions = {}): Fixture {
  const style = options.style ?? 'switch';
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = `fixture-${style}`;
  const plastic = createSurface('paintedMetal', {
    color: new Color(0xe8eaec).lerp(new Color(palette.wall), 0.25).getHex(),
    roughness: 0.55,
  });
  const dark = new MeshStandardMaterial({ color: 0x22262c, roughness: 0.6, flatShading: true });

  // One shared indicator material — this is what actually reads.
  const indicator = new MeshStandardMaterial({
    color: 0x2a3038,
    emissive: new Color(options.indicator ?? 0x2a3038),
    emissiveIntensity: 1,
    roughness: 0.35,
  });

  let screen: ScreenPanel | undefined;
  let slot: PropSlot | undefined;
  let height = 1.15;

  if (style === 'switch') {
    const plate = new Mesh(new BoxGeometry(0.086, 0.086, 0.011), plastic);
    plate.position.z = 0.0055;
    group.add(plate);
    const rocker = new Mesh(new BoxGeometry(0.05, 0.062, 0.006), plastic);
    rocker.position.set(0, 0, 0.013);
    rocker.rotation.x = rng.range(-0.05, 0.05); // never quite level
    group.add(rocker);
    const pip = new Mesh(new BoxGeometry(0.006, 0.006, 0.002), indicator);
    pip.position.set(0.03, -0.03, 0.014);
    group.add(pip);
    height = 1.15;
    slot = createSlot('operate', 'stand', group, 0, -height, 0.62, Math.PI);
  } else if (style === 'thermostat') {
    const body = new Mesh(new CylinderGeometry(0.052, 0.052, 0.022, 20), plastic);
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.011;
    group.add(body);
    screen = createScreenPanel(0.062, 0.062, {
      mode: 'chart',
      seed,
      brightness: 0.55,
      accent: 0xff9a4d,
    });
    const panel = new Mesh(new PlaneGeometry(0.062, 0.062), screen.material);
    panel.name = 'screen';
    panel.position.z = 0.0225;
    group.add(panel);
    const ring = new Mesh(new CylinderGeometry(0.056, 0.056, 0.004, 20), indicator);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = 0.0015;
    group.add(ring);
    height = 1.42;
    slot = createSlot('operate', 'stand', group, 0, -height, 0.58, Math.PI);
  } else if (style === 'doorbell') {
    const body = new Mesh(new BoxGeometry(0.042, 0.11, 0.016), dark);
    body.position.z = 0.008;
    group.add(body);
    const button = new Mesh(new CylinderGeometry(0.013, 0.013, 0.004, 14), indicator);
    button.rotation.x = Math.PI / 2;
    button.position.set(0, -0.03, 0.018);
    group.add(button);
    const lens = new Mesh(new CylinderGeometry(0.008, 0.008, 0.003, 12), new MeshStandardMaterial({
      color: 0x0b0d10,
      roughness: 0.15,
      metalness: 0.4,
    }));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.028, 0.017);
    group.add(lens);
    height = 1.3;
    slot = createSlot('operate', 'stand', group, 0, -height, 0.66, Math.PI);
  } else if (style === 'camera') {
    const mount = new Mesh(new BoxGeometry(0.03, 0.03, 0.03), plastic);
    mount.position.z = 0.015;
    group.add(mount);
    const barrel = new Group();
    barrel.position.z = 0.03;
    barrel.rotation.x = -0.42; // angled down at the room
    group.add(barrel);
    const body = new Mesh(new CylinderGeometry(0.022, 0.026, 0.07, 14), plastic);
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.035;
    barrel.add(body);
    const lens = new Mesh(new CylinderGeometry(0.014, 0.014, 0.005, 14), dark);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.071;
    barrel.add(lens);
    const pip = new Mesh(new BoxGeometry(0.005, 0.005, 0.002), indicator);
    pip.position.set(0.016, 0.012, 0.069);
    barrel.add(pip);
    height = 2.35;
  } else {
    // A corner sensor: a wedge with one eye. Smallest prop in the kit.
    // Tilted, so it must sit proud of the wall or its top corner ends up
    // buried in the plaster — a rotated box needs clearance for its diagonal,
    // not for its depth.
    const body = new Mesh(new BoxGeometry(0.05, 0.062, 0.026), plastic);
    body.position.z = 0.022;
    body.rotation.x = -0.3;
    group.add(body);
    const eye = new Mesh(new BoxGeometry(0.026, 0.016, 0.004), dark);
    eye.position.set(0, -0.012, 0.037);
    eye.rotation.x = -0.3;
    group.add(eye);
    const pip = new Mesh(new BoxGeometry(0.005, 0.005, 0.002), indicator);
    pip.position.set(0, 0.018, 0.035);
    group.add(pip);
    height = 2.3;
  }

  return {
    object: group,
    obstacleRadius: 0,
    height,
    screen,
    slot,
    slots: slot ? [slot] : undefined,
    setIndicator(color: number, strength = 1) {
      indicator.emissive.set(color);
      indicator.emissiveIntensity = strength;
    },
  };
}

/**
 * A desk set: keyboard, mouse and a mug. What a character actually puts their
 * hands on, which the monitors and laptops so far did not give them.
 *
 * Origin at the desk surface. Publishes a `keyboard` anchor at the home row,
 * so ANIMA's desk poses have something to aim the wrists at rather than a
 * number somebody guessed.
 */
export interface DeskSet extends Prop {
  /** Centre of the home row, on the desk surface. */
  keyboard: Object3D;
  /** Where the mouse sits. */
  mouse: Object3D;
}

export function createDeskSet(options: { seed?: number } = {}): DeskSet {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);

  const group = new Group();
  group.name = 'deskSet';
  const shell = createSurface('paintedMetal', { color: 0x30343b, roughness: 0.62 });
  const keycap = new MeshStandardMaterial({ color: 0x1b1e23, roughness: 0.8, flatShading: true });

  const board = new Mesh(new BoxGeometry(0.44, 0.016, 0.14), shell);
  board.position.set(0, 0.008, 0);
  board.rotation.y = rng.range(-0.05, 0.05); // nobody squares their keyboard
  group.add(board);
  // Three bands of keys is all that reads; individual caps are invisible.
  for (let row = 0; row < 3; row++) {
    const band = new Mesh(new BoxGeometry(0.4, 0.003, 0.03), keycap);
    band.position.set(0, 0.018, -0.04 + row * 0.038);
    board.add(band);
  }

  const keyboard = new Object3D();
  keyboard.name = 'keyboard';
  keyboard.position.set(0, 0.02, 0.01);
  group.add(keyboard);

  const mouseBody = new Mesh(new BoxGeometry(0.055, 0.026, 0.09), shell);
  mouseBody.position.set(0.33, 0.013, 0.01);
  mouseBody.rotation.y = rng.range(-0.12, 0.12);
  group.add(mouseBody);
  const mouse = new Object3D();
  mouse.name = 'mouse';
  mouse.position.copy(mouseBody.position);
  group.add(mouse);

  const mug = new Mesh(
    new CylinderGeometry(0.038, 0.033, 0.095, 12),
    createSurface('porcelain', { color: 0xd8dde2, roughness: 0.4 })
  );
  mug.position.set(-0.34, 0.0475, -0.05);
  group.add(mug);

  return { object: group, obstacleRadius: 0, keyboard, mouse };
}
