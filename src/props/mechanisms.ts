import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
} from 'three';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createSlot } from '../core/types';
import type { Prop } from '../core/types';

/**
 * Manipulables — props with a STATE that a character (or GAMA) actuates, and
 * that animate in response: doors swing, drawers slide, levers throw, valves
 * spin, hatches hinge, portcullises rise. This is the "operate and the world
 * responds" verb the interaction system was missing — until now props were
 * inert (except vehicles, which only spin wheels).
 *
 * Every manipulable exposes a small, uniform control surface:
 *
 * ```ts
 * const door = createDoor();
 * door.toggle();                 // flip open/closed
 * door.onChange = (open) => …;   // fires when the target flips
 * game.onUpdate((t) => door.update(t.delta));  // eases the joint toward target
 * ```
 *
 * `state` is the live eased position (0 = closed/rest, 1 = open/actuated);
 * `open` is the boolean target. The shape is structurally identical to GAMA's
 * `Mechanism`, so `Interactable`/`linkMechanism`/`Trigger` drive these without
 * either library importing the other. Props that a character stands at to
 * work (lever, valve, drawer, hatch) publish an `operate` slot at ANIMA's
 * floor-level anchor convention; doors and portcullises are pass-through.
 */
export interface Manipulable extends Prop {
  /** Live eased position: 0 = closed/rest … 1 = open/actuated. */
  readonly state: number;
  /** The current target: true once set/toggled past halfway open. */
  readonly open: boolean;
  /** Flip open↔closed. Returns the new `open`. */
  toggle(): boolean;
  /** Drive to open (`true`/1), closed (`false`/0), or a partial target in [0,1]. */
  set(target: number | boolean): void;
  /** Ease the joint toward the target. Call every frame. */
  update(dt: number): void;
  /** Fired when the target flips open↔closed (after `set`/`toggle`). */
  onChange?: (open: boolean) => void;
}

export interface MechanismOptions {
  seed?: number;
  palette?: Palette;
  /** Body/paint colour; defaults to a seeded or preset pick. */
  color?: number;
  /** How fast the joint travels toward its target (1/sec). Default 3. */
  speed?: number;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The shared easing core: tracks a linear `state` chasing `target`, and calls
 * `apply(smooth(state))` each step so visuals start and stop softly. Returns
 * the full Manipulable once the caller attaches `object`/`slots`.
 */
function makeManipulable(
  object: Group,
  obstacleRadius: number,
  slots: Prop['slots'],
  apply: (v: number) => void,
  speed: number
): Manipulable {
  let target = 0;
  let state = 0;
  apply(0);

  const core = {
    object,
    obstacleRadius,
    slots,
    onChange: undefined as ((open: boolean) => void) | undefined,
    get state() {
      return state;
    },
    get open() {
      return target >= 0.5;
    },
    set(t: number | boolean) {
      const next = typeof t === 'boolean' ? (t ? 1 : 0) : clamp01(t);
      const was = target >= 0.5;
      target = next;
      const now = target >= 0.5;
      if (now !== was) core.onChange?.(now);
    },
    toggle() {
      core.set(target >= 0.5 ? 0 : 1);
      return target >= 0.5;
    },
    update(dt: number) {
      if (state === target) return;
      const d = target - state;
      const step = Math.max(0, speed) * dt;
      state += Math.abs(d) <= step ? d : Math.sign(d) * step;
      apply(smooth(state));
    },
  };
  return core as Manipulable;
}

// ------------------------------------------------------------------- Door

export interface DoorOptions extends MechanismOptions {
  width?: number;
  height?: number;
  /** Hinge on the 'left' (−x) or 'right' (+x) post. Default 'left'. */
  hinge?: 'left' | 'right';
  /** Swing-open angle in radians. Default ~1.9 (just past 90°). */
  swing?: number;
  /** Two leaves meeting in the middle (a gateway). Default false. */
  double?: boolean;
}

/**
 * A framed door that swings on its hinge — the workhorse manipulable. Set
 * `double` for a two-leaf gateway (both leaves swing apart). Walk-through
 * when open; the frame is thin scenery.
 */
export function createDoor(options: DoorOptions = {}): Manipulable {
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const width = options.width ?? 1.0;
  const height = options.height ?? 2.1;
  const swing = options.swing ?? 1.9;
  const wood = createSurface('plank', { color: options.color ?? palette.wood, seed });
  const post = createSurface('wood', { color: palette.wood, seed: seed + 5 });

  const group = new Group();
  group.name = 'door';
  // Frame: two posts + a lintel around the opening.
  const span = options.double ? width * 2 : width;
  for (const s of [-1, 1]) {
    const jamb = new Mesh(new BoxGeometry(0.12, height + 0.1, 0.16), post);
    jamb.position.set((s * (span + 0.12)) / 2, (height + 0.1) / 2, 0);
    group.add(jamb);
  }
  const lintel = new Mesh(new BoxGeometry(span + 0.36, 0.14, 0.16), post);
  lintel.position.set(0, height + 0.07, 0);
  group.add(lintel);

  const leaf = (dir: number): Object3D => {
    // A hinge pivot at the jamb; the slab hangs toward the opening centre.
    const hinge = new Object3D();
    hinge.position.set((dir * span) / 2, height / 2, 0);
    const slab = new Mesh(new BoxGeometry(width - 0.04, height - 0.06, 0.06), wood);
    slab.position.set((-dir * width) / 2, 0, 0);
    const handle = new Mesh(
      new CylinderGeometry(0.03, 0.03, 0.14, 6),
      new MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.6, roughness: 0.4 })
    );
    handle.rotation.x = Math.PI / 2;
    handle.position.set(-dir * (width - 0.18), 0, 0.08);
    slab.add(handle);
    hinge.add(slab);
    group.add(hinge);
    return hinge;
  };

  if (options.double) {
    const left = leaf(-1);
    const right = leaf(1);
    return makeManipulable(group, 0, undefined, (v) => {
      left.rotation.y = swing * v;
      right.rotation.y = -swing * v;
    }, options.speed ?? 3);
  }
  const dir = options.hinge === 'right' ? 1 : -1;
  const hinge = leaf(dir);
  return makeManipulable(group, 0, undefined, (v) => {
    hinge.rotation.y = -dir * swing * v;
  }, options.speed ?? 3);
}

// ------------------------------------------------------------------ Drawer

export interface DrawerOptions extends MechanismOptions {
  width?: number;
  height?: number;
  depth?: number;
}

/** A cabinet with a single drawer that slides out toward the front (+z). */
export function createDrawer(options: DrawerOptions = {}): Manipulable {
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const w = options.width ?? 0.8;
  const h = options.height ?? 0.7;
  const d = options.depth ?? 0.55;
  const body = createSurface('wood', { color: options.color ?? palette.wood, seed });
  const face = createSurface('plank', { color: palette.wood, seed: seed + 3 });

  const group = new Group();
  group.name = 'drawer';
  // Carcass: back + sides + top, open at the front.
  const back = new Mesh(new BoxGeometry(w, h, 0.04), body);
  back.position.set(0, h / 2, -d / 2);
  const top = new Mesh(new BoxGeometry(w, 0.04, d), body);
  top.position.set(0, h, 0);
  group.add(back, top);
  for (const s of [-1, 1]) {
    const side = new Mesh(new BoxGeometry(0.04, h, d), body);
    side.position.set((s * w) / 2, h / 2, 0);
    group.add(side);
  }

  // The sliding drawer: a shallow tray + a front face with a pull.
  const drawer = new Object3D();
  const tray = new Mesh(new BoxGeometry(w - 0.12, h - 0.16, d - 0.1), body);
  tray.position.set(0, h / 2, 0);
  const front = new Mesh(new BoxGeometry(w - 0.06, h - 0.1, 0.05), face);
  front.position.set(0, h / 2, d / 2);
  const pull = new Mesh(
    new TorusGeometry(0.05, 0.012, 6, 10),
    new MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.6, roughness: 0.4 })
  );
  pull.position.set(0, h / 2, d / 2 + 0.05);
  drawer.add(tray, front, pull);
  group.add(drawer);

  const slot = createSlot('operate', 'operate', group, 0, 0, d / 2 + 0.75, Math.PI);
  return makeManipulable(group, 0.6, [slot], (v) => {
    drawer.position.z = (d * 0.8) * v; // slides out up to 80% of its depth
  }, options.speed ?? 3.5);
}

// ------------------------------------------------------------------- Lever

export interface LeverOptions extends MechanismOptions {
  /** Handle length. Default 0.6. */
  length?: number;
  /** Mount on a floor 'base' or a 'wall' plate. Default 'base'. */
  mount?: 'base' | 'wall';
}

/**
 * A throw lever — the canonical switch. The handle swings from back to
 * forward as it actuates; wire its `onChange` to a gate/portcullis with
 * GAMA's `linkMechanism` for switch-driven level logic.
 */
export function createLever(options: LeverOptions = {}): Manipulable {
  const seed = options.seed ?? 1;
  const len = options.length ?? 0.6;
  const metal = createSurface('steel', { color: options.color ?? 0x8b3a2f, seed });
  const dark = new MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.5, roughness: 0.5 });

  const group = new Group();
  group.name = 'lever';
  const wall = options.mount === 'wall';
  const base = wall
    ? new Mesh(new BoxGeometry(0.34, 0.34, 0.08), createSurface('steel', { seed: seed + 1 }))
    : new Mesh(new CylinderGeometry(0.16, 0.2, 0.14, 8), createSurface('steel', { seed: seed + 1 }));
  base.position.y = wall ? 0.9 : 0.07;
  group.add(base);

  // Pivot near the base; handle points up-and-back at rest.
  const pivot = new Object3D();
  pivot.position.set(0, wall ? 0.9 : 0.14, 0);
  const shaft = new Mesh(new CylinderGeometry(0.03, 0.035, len, 6), metal);
  shaft.position.set(0, len / 2, 0);
  const knob = new Mesh(new CylinderGeometry(0.06, 0.06, 0.1, 8), dark);
  knob.position.set(0, len, 0);
  pivot.add(shaft, knob);
  group.add(pivot);

  const throwFrom = 0.55; // leaning back at rest
  const throwTo = -0.55; // thrown forward when open
  const slot = createSlot('operate', 'operate', group, 0, 0, 0.75, Math.PI);
  return makeManipulable(group, 0.3, [slot], (v) => {
    pivot.rotation.x = throwFrom + (throwTo - throwFrom) * v;
  }, options.speed ?? 6);
}

// ------------------------------------------------------------------- Valve

export interface ValveOptions extends MechanismOptions {
  /** Wheel radius. Default 0.28. */
  radius?: number;
  /** Full turns from closed to open. Default 3. */
  turns?: number;
}

/** A pipe valve — a hand-wheel that spins through several turns as it opens. */
export function createValve(options: ValveOptions = {}): Manipulable {
  const seed = options.seed ?? 1;
  const R = options.radius ?? 0.28;
  const turns = options.turns ?? 3;
  const metal = createSurface('steel', { color: options.color, seed });
  const pipeMat = createSurface('paintedMetal', { color: 0x9a2f26, seed: seed + 2 });

  const group = new Group();
  group.name = 'valve';
  const pipe = new Mesh(new CylinderGeometry(0.12, 0.12, 1.2, 10), pipeMat);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.y = 0.6;
  const body = new Mesh(new CylinderGeometry(0.16, 0.16, 0.3, 10), pipeMat);
  body.position.y = 0.78;
  group.add(pipe, body);

  // The hand-wheel on a stem, spinning about local z (it faces +z).
  const wheel = new Object3D();
  wheel.position.set(0, 0.98, 0);
  const rim = new Mesh(new TorusGeometry(R, 0.03, 6, 16), metal);
  wheel.add(rim);
  for (let i = 0; i < 4; i++) {
    const spoke = new Mesh(new BoxGeometry(R * 2, 0.04, 0.04), metal);
    spoke.rotation.z = (i / 4) * Math.PI;
    wheel.add(spoke);
  }
  wheel.rotation.x = -Math.PI / 2; // face up-ish so it reads as a wheel on top
  const stem = new Mesh(new CylinderGeometry(0.03, 0.03, 0.2, 6), metal);
  stem.position.y = 0.88;
  group.add(stem, wheel);

  const slot = createSlot('operate', 'operate', group, 0, 0, 0.7, Math.PI);
  return makeManipulable(group, 0.4, [slot], (v) => {
    wheel.rotation.y = v * turns * Math.PI * 2; // spins about the stem
  }, options.speed ?? 2.2);
}

// ------------------------------------------------------------------- Hatch

export interface HatchOptions extends MechanismOptions {
  width?: number;
  depth?: number;
  /** Lid open angle in radians. Default ~2.0. */
  angle?: number;
}

/**
 * A hinged lid — a chest, a crate top, a floor trapdoor. The lid hinges up
 * and back off its rear edge; a character stands at the front to open it.
 */
export function createHatch(options: HatchOptions = {}): Manipulable {
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const w = options.width ?? 0.9;
  const dp = options.depth ?? 0.6;
  const angle = options.angle ?? 2.0;
  const wood = createSurface('plank', { color: options.color ?? palette.wood, seed });
  const iron = new MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.5, roughness: 0.5 });

  const group = new Group();
  group.name = 'hatch';
  const box = new Mesh(new BoxGeometry(w, 0.5, dp), wood);
  box.position.y = 0.25;
  group.add(box);
  for (const s of [-1, 1]) {
    const band = new Mesh(new BoxGeometry(0.05, 0.52, dp + 0.02), iron);
    band.position.set((s * w) / 2 - s * 0.08, 0.25, 0);
    group.add(band);
  }

  // Lid hinged at the back top edge (z = -dp/2), opening up and back.
  const hinge = new Object3D();
  hinge.position.set(0, 0.5, -dp / 2);
  const lid = new Mesh(new BoxGeometry(w, 0.06, dp), wood);
  lid.position.set(0, 0.03, dp / 2);
  hinge.add(lid);
  group.add(hinge);

  const slot = createSlot('operate', 'operate', group, 0, 0, dp / 2 + 0.7, Math.PI);
  return makeManipulable(group, 0.5, [slot], (v) => {
    hinge.rotation.x = angle * v;
  }, options.speed ?? 4);
}

// -------------------------------------------------------------- Portcullis

export interface PortcullisOptions extends MechanismOptions {
  width?: number;
  height?: number;
}

/**
 * A castle portcullis — a barred iron grille in a stone gateway that rises to
 * open. The medieval-village payoff for the switch/lever wiring: throw a
 * lever, raise the gate.
 */
export function createPortcullis(options: PortcullisOptions = {}): Manipulable {
  const seed = options.seed ?? 1;
  const w = options.width ?? 2.4;
  const h = options.height ?? 3.0;
  const stone = createSurface('ashlar', { seed });
  const iron = createSurface('steel', { color: options.color ?? 0x3a3d42, seed: seed + 1 });

  const group = new Group();
  group.name = 'portcullis';
  // Stone gateway: two piers + a lintel block.
  for (const s of [-1, 1]) {
    const pier = new Mesh(new BoxGeometry(0.6, h + 0.4, 0.8), stone);
    pier.position.set((s * (w + 0.6)) / 2, (h + 0.4) / 2, 0);
    group.add(pier);
  }
  const lintel = new Mesh(new BoxGeometry(w + 1.2, 0.7, 0.8), stone);
  lintel.position.set(0, h + 0.35, 0);
  group.add(lintel);

  // The grille that slides up inside the gateway.
  const grille = new Group();
  const bars = Math.max(3, Math.round(w / 0.4));
  for (let i = 0; i <= bars; i++) {
    const bar = new Mesh(new CylinderGeometry(0.05, 0.05, h, 6), iron);
    bar.position.set(-w / 2 + (i / bars) * w, h / 2, 0);
    grille.add(bar);
  }
  for (const yy of [0.2, h * 0.5, h - 0.2]) {
    const rung = new Mesh(new BoxGeometry(w, 0.08, 0.08), iron);
    rung.position.set(0, yy, 0);
    grille.add(rung);
  }
  // Spiked bottom — a nice silhouette when raised.
  for (let i = 0; i <= bars; i++) {
    const spike = new Mesh(new CylinderGeometry(0.001, 0.06, 0.2, 6), iron);
    spike.position.set(-w / 2 + (i / bars) * w, -0.1, 0);
    grille.add(spike);
  }
  group.add(grille);

  return makeManipulable(group, 0, undefined, (v) => {
    grille.position.y = (h - 0.2) * v; // rises nearly its full height
  }, options.speed ?? 1.6);
}
