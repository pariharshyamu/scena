import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SpotLight,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createScreenPanel, type ScreenMode, type ScreenPanel } from '../materials/screen';
import type { Carryable, Prop } from '../core/types';

/**
 * Electronics — the props that make an interior read as *now* rather than as
 * a period set. Everything here is a body plus a `ScreenPanel`: the panel is
 * the whole point, the chassis exists to hold it at the right height and
 * angle.
 *
 * Every one of these publishes `screen`, which is structurally ANIMA's
 * `Viewable` (a character can look at it) and GAMA's `DisplayTarget` (a
 * device can drive what it shows) — so the three libraries compose here with
 * no imports between them, the same handshake pattern as seats and ladders.
 *
 * ```ts
 * const tv = createTelevision({ diagonal: 1.4, mode: 'video' });
 * scene.add(tv.object);
 * const glow = createScreenLight(tv.screen);   // the room flickers with it
 * game.onUpdate((t) => { tv.screen.update(t.delta); glow.update(); });
 * ```
 */
export interface ScreenProp extends Prop {
  /** The lit panel: gaze target, glow source, display target. */
  screen: ScreenPanel;
}

export interface ScreenPropOptions {
  seed?: number;
  /** Panel diagonal in metres. */
  diagonal?: number;
  /** What it shows on creation. */
  mode?: ScreenMode;
  /** UI accent colour. */
  accent?: number;
  /** Emissive gain — a television is brighter than a watch. */
  brightness?: number;
  /** Rows per second for 'feed'. */
  scrollRate?: number;
  palette?: Palette;
}

/** 16:9 from a diagonal: w = d·cos(atan(9/16)), h = d·sin(atan(9/16)). */
function panelSize(diagonal: number): [number, number] {
  return [diagonal * 0.8716, diagonal * 0.4903];
}

/** Build the lit face and wire it into the panel as its `surface`. */
function attachPanel(
  parent: Group,
  width: number,
  height: number,
  options: ScreenPropOptions,
  seedOffset = 0
): ScreenPanel {
  const panel = createScreenPanel(width, height, {
    mode: options.mode ?? 'home',
    seed: (options.seed ?? 1) + seedOffset,
    accent: options.accent,
    brightness: options.brightness,
    scrollRate: options.scrollRate,
  });
  const mesh = new Mesh(new PlaneGeometry(width, height), panel.material);
  mesh.name = 'screen';
  parent.add(mesh);
  panel.surface = mesh;
  return panel;
}

/** Casing: the dark grey plastic/aluminium everything here is made of. */
function shell(palette: Palette, tint = 0.0): MeshStandardMaterial {
  const base = new Color(0x2b2f36).lerp(new Color(palette.metal), tint);
  return createSurface('paintedMetal', { color: base.getHex(), roughness: 0.62 });
}

/**
 * A desk monitor. Origin at the base of the foot, so it stands on a desk
 * surface at y = 0.
 */
export function createMonitor(options: ScreenPropOptions = {}): ScreenProp {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const diagonal = options.diagonal ?? 0.61; // 24"
  const [w, h] = panelSize(diagonal);
  const casing = shell(palette);

  const group = new Group();
  group.name = 'monitor';

  const foot = new Mesh(new BoxGeometry(w * 0.42, 0.014, h * 0.42), casing);
  foot.position.y = 0.007;
  group.add(foot);

  const neck = new Mesh(new BoxGeometry(0.055, h * 0.44, 0.042), casing);
  neck.position.set(0, h * 0.22 + 0.012, -0.01);
  group.add(neck);

  // The head tilts back a few degrees — nobody runs a monitor dead vertical.
  const head = new Group();
  head.position.set(0, h * 0.44 + h / 2 + 0.012, 0);
  head.rotation.x = -rng.range(0.04, 0.09);
  group.add(head);

  const back = new Mesh(new BoxGeometry(w + 0.016, h + 0.016, 0.026), casing);
  back.position.z = -0.014;
  head.add(back);

  const panel = attachPanel(head, w, h, options);
  panel.surface.position.z = 0.0005;

  return { object: group, obstacleRadius: 0, screen: panel };
}

export interface TelevisionOptions extends ScreenPropOptions {
  /**
   * 'stand' rests on a pedestal (origin at the pedestal base — put it on a
   * media unit); 'wall' has no support (origin at the panel's bottom edge,
   * so you position it at the height you want it hung).
   */
  mount?: 'stand' | 'wall';
}

/** A television: a big thin panel, either on a pedestal or hung on a wall. */
export function createTelevision(options: TelevisionOptions = {}): ScreenProp {
  const palette = options.palette ?? DEFAULT_PALETTE;
  const diagonal = options.diagonal ?? 1.4; // 55"
  const mount = options.mount ?? 'stand';
  const [w, h] = panelSize(diagonal);
  const casing = shell(palette);

  const group = new Group();
  group.name = 'television';

  let panelY = h / 2;
  if (mount === 'stand') {
    const plate = new Mesh(new BoxGeometry(w * 0.36, 0.016, h * 0.34), casing);
    plate.position.y = 0.008;
    group.add(plate);
    const post = new Mesh(new BoxGeometry(0.09, 0.1, 0.05), casing);
    post.position.set(0, 0.06, 0);
    group.add(post);
    panelY = 0.11 + h / 2;
  }

  const head = new Group();
  head.position.y = panelY;
  group.add(head);

  // A modern set is nearly all panel: a 12 mm rim and a slightly deeper
  // electronics hump across the lower back.
  const bezel = new Mesh(new BoxGeometry(w + 0.024, h + 0.024, 0.016), casing);
  bezel.position.z = -0.009;
  head.add(bezel);
  const hump = new Mesh(new BoxGeometry(w * 0.55, h * 0.4, 0.03), casing);
  hump.position.set(0, -h * 0.22, -0.03);
  head.add(hump);

  const panel = attachPanel(head, w, h, { brightness: 1.15, ...options });
  panel.surface.position.z = 0.0005;

  return {
    object: group,
    obstacleRadius: mount === 'stand' ? w * 0.2 : 0,
    screen: panel,
  };
}

export interface LaptopOptions extends ScreenPropOptions {
  /** Lid angle: 0 shut, 1 fully open (~105°). Default 1. */
  open?: number;
}

/**
 * A laptop. Origin at the base of the deck, so it sits on a desk at y = 0.
 * The lid hinges at the rear edge; `open` drives the angle.
 */
export function createLaptop(options: LaptopOptions = {}): ScreenProp {
  const palette = options.palette ?? DEFAULT_PALETTE;
  const diagonal = options.diagonal ?? 0.355; // 14"
  const [w, h] = panelSize(diagonal);
  const open = options.open ?? 1;
  const casing = shell(palette, 0.35);
  const deep = new MeshStandardMaterial({ color: 0x15171c, roughness: 0.8, flatShading: true });

  const group = new Group();
  group.name = 'laptop';

  const deckDepth = h * 0.94;
  const deck = new Mesh(new BoxGeometry(w + 0.02, 0.014, deckDepth), casing);
  deck.position.set(0, 0.007, deckDepth / 2 - h * 0.5);
  group.add(deck);

  // Keyboard well and trackpad — small dark insets, which is all that reads.
  const keys = new Mesh(new BoxGeometry(w * 0.86, 0.002, deckDepth * 0.46), deep);
  keys.position.set(0, 0.015, deckDepth * 0.22 - h * 0.5);
  group.add(keys);
  const pad = new Mesh(new BoxGeometry(w * 0.3, 0.002, deckDepth * 0.22), deep);
  pad.position.set(0, 0.015, deckDepth * 0.72 - h * 0.5);
  group.add(pad);

  // Hinge at the deck's rear edge. The lid is built extending +y, so SHUT is
  // +90° (it lies forward over the keyboard, screen face down) and opening
  // rotates back through vertical to ~105° off the deck — a laptop screen
  // leans a little past upright, it does not stand square.
  const lid = new Group();
  lid.position.set(0, 0.014, -h * 0.5);
  lid.rotation.x = Math.PI / 2 - open * 1.83;
  group.add(lid);

  const back = new Mesh(new BoxGeometry(w + 0.02, h + 0.018, 0.008), casing);
  back.position.set(0, h / 2 + 0.006, -0.005);
  lid.add(back);

  const panel = attachPanel(lid, w, h, { brightness: 0.9, ...options });
  panel.surface.position.set(0, h / 2 + 0.006, 0);

  return { object: group, obstacleRadius: 0, screen: panel };
}

/** A smart speaker with a face: fabric body, screen raked back to be read. */
export function createSmartDisplay(options: ScreenPropOptions = {}): ScreenProp {
  const palette = options.palette ?? DEFAULT_PALETTE;
  const diagonal = options.diagonal ?? 0.19;
  const [w, h] = panelSize(diagonal);

  const group = new Group();
  group.name = 'smartDisplay';

  // The speaker sits BEHIND the raked panel, not beside it. Because the
  // screen leans back, its top edge is the furthest-back point of the face —
  // a body flush with the base would stand in front of the top of its own
  // screen, which is exactly the kind of thing that looks fine in a
  // wireframe and wrong the moment it is lit.
  const fabric = createSurface('canvas', { color: 0x6a6f78, roughness: 0.95 });
  const body = new Mesh(new BoxGeometry(w + 0.03, h * 0.78, 0.075), fabric);
  body.position.set(0, h * 0.39, -0.052);
  group.add(body);

  const head = new Group();
  head.position.set(0, h * 0.55, 0.012);
  head.rotation.x = -0.22; // raked back, the way these sit on a counter
  group.add(head);

  const rim = new Mesh(
    new BoxGeometry(w + 0.014, h + 0.014, 0.012),
    shell(palette, 0.2)
  );
  rim.position.z = -0.007;
  head.add(rim);

  const panel = attachPanel(head, w, h, { brightness: 0.75, ...options });
  panel.surface.position.z = 0.0005;

  return { object: group, obstacleRadius: 0, screen: panel };
}

/** A tablet: a screen you can pick up. Carryable + ScreenProp, no new verbs. */
export interface ScreenCarryable extends Carryable {
  screen: ScreenPanel;
}

/**
 * A tablet. It is a `Carryable` with a `Screen` — which means pick-up,
 * carry-while-walking, put-down and hand-off all already work on it, from
 * the carryables track, with nothing added here.
 */
export function createTablet(options: ScreenPropOptions = {}): ScreenCarryable {
  const palette = options.palette ?? DEFAULT_PALETTE;
  const diagonal = options.diagonal ?? 0.275; // 11"
  const [w, h] = panelSize(diagonal);

  const group = new Group();
  group.name = 'tablet';

  const back = new Mesh(new BoxGeometry(w + 0.012, h + 0.012, 0.008), shell(palette, 0.5));
  back.position.z = -0.004;
  group.add(back);

  const panel = attachPanel(group, w, h, { brightness: 0.8, ...options });
  panel.surface.position.z = 0.0009;

  return {
    object: group,
    obstacleRadius: 0,
    carry: 'tray',
    grip: { y: 0, z: -0.01 },
    screen: panel,
  };
}

export interface ScreenLightOptions {
  /** Multiplier over the panel's own glow. Default 1. */
  gain?: number;
  /** Metres in front of the panel face. Default 0.04 — it emits AT the glass. */
  distance?: number;
  /** Falloff range. Default generous: a screen washes a whole room dimly. */
  range?: number;
  /** Cone half-angle, radians. Default 1.2 (~69°) — a screen is not a torch. */
  spread?: number;
  /** Attach to the panel surface so it tracks the prop. Default true. */
  attach?: boolean;
}

/**
 * A real light that copies what a screen is showing.
 *
 * This is the whole reason to bother drawing content procedurally: because
 * the CPU knows the colour and level of the current shot, a light can carry
 * exactly that, and a television lights a dark room in flickers timed to its
 * own cuts. A static blue point light reads as a lamp; this reads as a TV.
 *
 * Lights are a budget, as everywhere else in SCENA — this is opt-in per
 * panel, and a room full of monitors should light one or two faces and let
 * the rest glow on their emissive alone.
 */
export interface ScreenLight {
  light: SpotLight;
  update(): void;
}

export function createScreenLight(
  panel: ScreenPanel,
  options: ScreenLightOptions = {}
): ScreenLight {
  const gain = options.gain ?? 1;
  const distance = options.distance ?? 0.04;
  const diagonal = Math.hypot(panel.width, panel.height);
  // Emission scales with AREA, not diagonal — a 55" television puts out
  // roughly twenty times what a tablet does, and a diagonal-based figure
  // makes a television about twice a tablet and leaves a dark room dark.
  const output = 3 + panel.width * panel.height * 62;

  // A SPOT, not a point. This mattered more than anything else here: a point
  // light radiates in every direction, so it lights the wall the television
  // is standing against — 1.4 m away — five times harder than the person
  // watching it 3.2 m away. The picture came out as a bright halo on the
  // back wall with the viewer in shadow, which is precisely backwards.
  //
  // A screen only emits from its front face. A wide cone with full penumbra
  // is a close enough stand-in for a flat Lambertian emitter at any distance
  // you would actually sit, and unlike a RectAreaLight it needs no LTC
  // tables (~400 KB of them) and still casts shadows if a caller wants them.
  const light = new SpotLight(0xffffff, 0, options.range ?? Math.max(11, diagonal * 10));
  light.name = 'screenLight';
  light.angle = options.spread ?? 1.2;
  light.penumbra = 1; // no visible cone edge — a screen has no beam
  light.decay = 2;
  light.position.z = distance;
  // Aim it out of the glass. The target must be in the same space as the
  // light, so it is parented alongside it rather than left at the origin.
  light.target.position.set(0, 0, distance + 1);
  if (options.attach !== false) {
    panel.surface.add(light);
    panel.surface.add(light.target);
  }

  return {
    light,
    update() {
      light.color.copy(panel.glow.color);
      light.intensity = panel.glow.intensity * gain * output;
    },
  };
}
