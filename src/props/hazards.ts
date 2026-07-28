import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { createSurface } from '../materials/surface';
import type { Obstacle } from '../core/types';

/**
 * Hazards — the props where movement itself is the game.
 *
 * Platforms that carry you, floors that give way, pads that launch you,
 * blades that swing where you wanted to walk, belts that move the ground,
 * and the pressure plate that turns all of SCENA's doors and gates into
 * puzzle vocabulary. Everything speaks the trilogy's structural dialect:
 * `{center, radius}` triggers for proximity, live `delta`/`velocity`
 * vectors for riders, and the plate is shaped exactly like GAMA's
 * `MechanismSource` — `linkMechanism(plate, door)` and the level has its
 * first circuit, with no imports between the libraries.
 */

// ---------------------------------------------------------------------------
// Moving platform
// ---------------------------------------------------------------------------

export type PlatformMotion = 'linear' | 'orbit' | 'pendulum';

export interface PlatformOptions {
  seed?: number;
  /** Top surface size, metres. Default [2.4, 1.8] (x, z). */
  size?: [number, number];
  motion?: PlatformMotion;
  /** linear: the two ends. Defaults ±3 on x. */
  from?: Vector3;
  to?: Vector3;
  /** orbit/pendulum: swing radius, metres. Default 3. */
  radius?: number;
  /** Seconds for a full cycle (there AND back for linear). Default 6. */
  period?: number;
}

export interface MovingPlatform {
  group: Group;
  /** Height of the standing surface above the group origin. */
  top: number;
  /**
   * How far the platform moved LAST update — add it to whoever stands on
   * top and they ride; skip it and they moonwalk off the edge.
   */
  delta: Vector3;
  /** Current velocity, m/s — for launching off the edge with momentum. */
  velocity: Vector3;
  trigger: Obstacle;
  update(dt: number): void;
}

export function createPlatform(options: PlatformOptions = {}): MovingPlatform {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const [sx, sz] = options.size ?? [2.4, 1.8];
  const motion = options.motion ?? 'linear';
  const from = options.from ?? new Vector3(-3, 0, 0);
  const to = options.to ?? new Vector3(3, 0, 0);
  const radius = options.radius ?? 3;
  const period = Math.max(options.period ?? 6, 0.5);

  const group = new Group();
  group.name = 'platform';
  const slab = new Mesh(new BoxGeometry(sx, 0.3, sz), createSurface('plank', { seed }));
  slab.position.y = 0.15;
  group.add(slab);
  const trim = new Mesh(new BoxGeometry(sx * 1.04, 0.08, sz * 1.04), createSurface('steel', { seed: seed + 1 }));
  trim.position.y = 0.04;
  group.add(trim);

  let clock = rng.range(0, period);
  const previous = new Vector3();
  const delta = new Vector3();
  const velocity = new Vector3();
  const place = (t: number, out: Vector3): void => {
    const w = (t % period) / period;
    if (motion === 'linear') {
      // Smooth there-and-back: no jerk at the turnarounds.
      const s = 0.5 - 0.5 * Math.cos(w * Math.PI * 2);
      out.copy(from).lerp(to, s);
    } else if (motion === 'orbit') {
      const a = w * Math.PI * 2;
      out.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    } else {
      // Pendulum: a swing through ±72° hanging below the group origin.
      const a = Math.sin(w * Math.PI * 2) * 1.25;
      out.set(Math.sin(a) * radius, -Math.cos(a) * radius + radius, 0);
    }
  };
  place(clock, group.position);
  previous.copy(group.position);

  const trigger: Obstacle = { center: group.position, radius: Math.max(sx, sz) * 0.6 };

  return {
    group,
    top: 0.3,
    delta,
    velocity,
    trigger,
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      clock += step;
      place(clock, group.position);
      delta.subVectors(group.position, previous);
      velocity.copy(delta).multiplyScalar(step > 1e-6 ? 1 / step : 0);
      previous.copy(group.position);
    },
  };
}

// ---------------------------------------------------------------------------
// Crumbling platform
// ---------------------------------------------------------------------------

export type CrumbleState = 'solid' | 'shaking' | 'falling' | 'gone' | 'returning';

export interface CrumbleOptions {
  seed?: number;
  size?: [number, number];
  /** Seconds of warning shudder after being disturbed. Default 0.7. */
  delay?: number;
  /** Seconds gone before it returns. Default 3. */
  respawn?: number;
}

export interface CrumblingPlatform {
  group: Group;
  top: number;
  trigger: Obstacle;
  readonly state: CrumbleState;
  /** Someone stood on it. Starts the shudder (once). */
  disturb(): void;
  /** Is it currently safe to stand on? */
  readonly solid: boolean;
  update(dt: number): void;
}

export function createCrumblingPlatform(options: CrumbleOptions = {}): CrumblingPlatform {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const [sx, sz] = options.size ?? [2, 2];
  const delay = Math.max(options.delay ?? 0.7, 0.05);
  const respawn = Math.max(options.respawn ?? 3, 0.5);

  const group = new Group();
  group.name = 'crumbling-platform';
  const slab = new Mesh(new BoxGeometry(sx, 0.26, sz), createSurface('ashlar', { seed }));
  slab.position.y = 0.13;
  group.add(slab);

  let state: CrumbleState = 'solid';
  let timer = 0;
  const home = new Vector3();
  let homed = false;
  const phase = rng.range(0, Math.PI * 2);

  const trigger: Obstacle = { center: group.position, radius: Math.max(sx, sz) * 0.6 };

  return {
    group,
    top: 0.26,
    trigger,
    get state() {
      return state;
    },
    get solid() {
      return state === 'solid' || state === 'shaking';
    },
    disturb() {
      if (state !== 'solid') return;
      state = 'shaking';
      timer = 0;
    },
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      if (!homed) {
        home.copy(group.position);
        homed = true;
      }
      timer += step;
      if (state === 'shaking') {
        // The warning IS the gameplay: a floor that drops unannounced is
        // unfair; one that shudders first is a decision you made.
        slab.position.x = Math.sin(timer * 46 + phase) * 0.03;
        slab.position.z = Math.cos(timer * 39 + phase) * 0.03;
        if (timer >= delay) {
          state = 'falling';
          timer = 0;
          slab.position.x = 0;
          slab.position.z = 0;
        }
      } else if (state === 'falling') {
        group.position.y = home.y - timer * timer * 9.8 * 0.5;
        slab.rotation.x += step * 1.4;
        if (timer > 0.9) {
          state = 'gone';
          timer = 0;
          group.visible = false;
        }
      } else if (state === 'gone') {
        if (timer >= respawn) {
          state = 'returning';
          timer = 0;
          group.visible = true;
          slab.rotation.x = 0;
          group.position.copy(home).y = home.y - 1.2;
        }
      } else if (state === 'returning') {
        const w = Math.min(timer / 0.5, 1);
        group.position.y = home.y - 1.2 * (1 - w * w * (3 - 2 * w));
        if (w >= 1) {
          group.position.copy(home);
          state = 'solid';
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Bounce pad
// ---------------------------------------------------------------------------

export interface BouncePadOptions {
  seed?: number;
  /** Pad radius, metres. Default 0.9. */
  radius?: number;
  /** Launch speed handed back by bounce(), m/s. Default 11. */
  strength?: number;
  color?: number;
}

export interface BouncePad {
  group: Group;
  trigger: Obstacle;
  /** Squash, stretch, and return the launch speed for the caller to apply. */
  bounce(): number;
  update(dt: number): void;
}

export function createBouncePad(options: BouncePadOptions = {}): BouncePad {
  const seed = options.seed ?? 1;
  const radius = options.radius ?? 0.9;
  const strength = options.strength ?? 11;

  const group = new Group();
  group.name = 'bounce-pad';
  const base = new Mesh(new CylinderGeometry(radius, radius * 1.12, 0.18, 18), createSurface('steel', { seed }));
  base.position.y = 0.09;
  group.add(base);
  const cushion = new Mesh(
    new CylinderGeometry(radius * 0.88, radius * 0.92, 0.16, 18),
    createSurface('paint', { seed: seed + 1, color: options.color ?? 0xd9903c })
  );
  cushion.position.y = 0.24;
  group.add(cushion);

  let anim = 1; // spring phase: 1 = at rest

  const trigger: Obstacle = { center: group.position, radius };

  return {
    group,
    trigger,
    bounce() {
      anim = 0;
      return strength;
    },
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      anim = Math.min(anim + step / 0.45, 1);
      // Squash hard and instantly, then overshoot tall, then settle —
      // the classic squash-and-stretch envelope in one damped sine.
      const s = anim;
      const scale = 1 + Math.sin(s * Math.PI * 3) * (1 - s) * 0.55 * (s < 0.12 ? -2.2 : 1);
      cushion.scale.set(1 + (1 - scale) * 0.5, Math.max(scale, 0.25), 1 + (1 - scale) * 0.5);
      cushion.position.y = 0.09 + 0.15 * Math.max(scale, 0.25);
    },
  };
}

// ---------------------------------------------------------------------------
// Pendulum blade
// ---------------------------------------------------------------------------

export interface PendulumOptions {
  seed?: number;
  /** Arm length, metres. Default 3. */
  length?: number;
  /** Swing half-angle, radians. Default 1.05 (~60°). */
  amplitude?: number;
  /** Seconds per full swing there and back. Default 2.6. */
  period?: number;
}

export interface Pendulum {
  group: Group;
  /** The blade's LIVE world-offset circle (relative to group position). */
  hazard: Obstacle;
  update(dt: number): void;
}

/** Hang the group from a beam; the blade swings below and `hazard` follows it. */
export function createPendulum(options: PendulumOptions = {}): Pendulum {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const length = options.length ?? 3;
  const amplitude = options.amplitude ?? 1.05;
  const period = Math.max(options.period ?? 2.6, 0.4);

  const group = new Group();
  group.name = 'pendulum';
  const arm = new Group();
  group.add(arm);
  const rod = new Mesh(new CylinderGeometry(0.06, 0.06, length, 8), createSurface('steel', { seed }));
  rod.position.y = -length / 2;
  arm.add(rod);
  const blade = new Mesh(new ConeGeometry(0.55, 0.5, 4), createSurface('brushedMetal', { seed: seed + 1 }));
  blade.rotation.set(Math.PI, Math.PI / 4, 0);
  blade.position.y = -length;
  blade.scale.z = 0.3;
  arm.add(blade);

  let clock = rng.range(0, period);
  const hazard: Obstacle = { center: new Vector3(), radius: 0.6 };

  const settle = (): void => {
    const a = Math.sin((clock / period) * Math.PI * 2) * amplitude;
    arm.rotation.z = a;
    // The hazard rides the blade tip, in the group's local frame plus its
    // world position — cheap and exact for an unrotated group.
    hazard.center
      .set(Math.sin(a) * length, -Math.cos(a) * length, 0)
      .add(group.position);
  };
  settle();

  return {
    group,
    hazard,
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      clock += step;
      settle();
    },
  };
}

// ---------------------------------------------------------------------------
// Spike trap
// ---------------------------------------------------------------------------

export interface SpikeTrapOptions {
  seed?: number;
  /** Plate size, metres. Default [1.6, 1.6]. */
  size?: [number, number];
  /** 'cycling' extends on a timer; 'triggered' waits for spring(). Default 'cycling'. */
  mode?: 'cycling' | 'triggered';
  /** Cycling: seconds per full cycle. Default 2.4. */
  period?: number;
}

export interface SpikeTrap {
  group: Group;
  trigger: Obstacle;
  /** True while the spikes are OUT — the only time this square hurts. */
  readonly dangerous: boolean;
  /** Triggered mode: spring the trap now. */
  spring(): void;
  update(dt: number): void;
}

export function createSpikeTrap(options: SpikeTrapOptions = {}): SpikeTrap {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const [sx, sz] = options.size ?? [1.6, 1.6];
  const mode = options.mode ?? 'cycling';
  const period = Math.max(options.period ?? 2.4, 0.6);

  const group = new Group();
  group.name = 'spike-trap';
  const plate = new Mesh(new BoxGeometry(sx, 0.1, sz), createSurface('diamondPlate', { seed }));
  plate.position.y = 0.05;
  group.add(plate);

  const columns = 3;
  const rows = 3;
  const spikes = new InstancedMesh(
    new ConeGeometry(0.09, 0.55, 6),
    createSurface('steel', { seed: seed + 1 }),
    columns * rows
  );
  group.add(spikes);
  const matrix = new Matrix4();
  const quat = new Quaternion();
  const one = new Vector3(1, 1, 1);
  const pos = new Vector3();
  const setSpikes = (out: number): void => {
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        pos.set(
          (c - (columns - 1) / 2) * (sx / columns) * 0.8,
          -0.28 + out * 0.55,
          (r - (rows - 1) / 2) * (sz / rows) * 0.8
        );
        matrix.compose(pos, quat, one);
        spikes.setMatrixAt(i++, matrix);
      }
    }
    spikes.instanceMatrix.needsUpdate = true;
  };
  setSpikes(0);

  let clock = rng.range(0, period);
  let out = 0;
  let springing = 0;

  const trigger: Obstacle = { center: group.position, radius: Math.max(sx, sz) * 0.6 };

  return {
    group,
    trigger,
    get dangerous() {
      return out > 0.6;
    },
    spring() {
      if (mode === 'triggered' && springing === 0) springing = 1e-6;
    },
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      if (mode === 'cycling') {
        clock += step;
        const w = (clock % period) / period;
        // Out FAST (the danger), in slow (the tell): 20% snap, 45% hold,
        // 35% withdraw.
        out = w < 0.2 ? w / 0.2 : w < 0.65 ? 1 : 1 - (w - 0.65) / 0.35;
      } else if (springing > 0) {
        springing += step;
        out = springing < 0.12 ? springing / 0.12 : springing < 0.9 ? 1 : Math.max(1 - (springing - 0.9) / 0.5, 0);
        if (out === 0) springing = 0;
      }
      setSpikes(out);
    },
  };
}

// ---------------------------------------------------------------------------
// Conveyor
// ---------------------------------------------------------------------------

export interface ConveyorOptions {
  seed?: number;
  /** Belt length and width, metres. Default 6 × 1.6. */
  length?: number;
  width?: number;
  /** Surface speed along local +x, m/s (negative reverses). Default 1.6. */
  speed?: number;
}

export interface Conveyor {
  group: Group;
  /** Live surface velocity in WORLD space — add `velocity * dt` to riders. */
  velocity: Vector3;
  trigger: Obstacle;
  /** Change the belt speed (chevrons and velocity follow). */
  setSpeed(speed: number): void;
  update(dt: number): void;
}

export function createConveyor(options: ConveyorOptions = {}): Conveyor {
  const seed = options.seed ?? 1;
  const length = options.length ?? 6;
  const width = options.width ?? 1.6;
  let speed = options.speed ?? 1.6;

  const group = new Group();
  group.name = 'conveyor';
  const bed = new Mesh(new BoxGeometry(length, 0.22, width), createSurface('steel', { seed }));
  bed.position.y = 0.11;
  group.add(bed);

  // The motion is CHEVRONS, not a texture scroll: instanced bars that ride
  // along and wrap, readable at any angle and cheap as one draw call.
  const count = Math.max(Math.round(length / 0.55), 4);
  const chevrons = new InstancedMesh(
    new BoxGeometry(0.12, 0.03, width * 0.82),
    createSurface('paint', { seed: seed + 1, color: 0xe8c645 }),
    count
  );
  group.add(chevrons);
  const matrix = new Matrix4();
  const quat = new Quaternion();
  const one = new Vector3(1, 1, 1);
  const pos = new Vector3();
  let offset = 0;
  const settle = (): void => {
    for (let i = 0; i < count; i++) {
      let x = ((i / count) * length + offset) % length;
      if (x < 0) x += length;
      pos.set(x - length / 2, 0.235, 0);
      matrix.compose(pos, quat, one);
      chevrons.setMatrixAt(i, matrix);
    }
    chevrons.instanceMatrix.needsUpdate = true;
  };
  settle();

  const velocity = new Vector3(speed, 0, 0);
  const trigger: Obstacle = { center: group.position, radius: Math.max(length, width) * 0.55 };

  return {
    group,
    velocity,
    trigger,
    setSpeed(next: number) {
      speed = Number.isFinite(next) ? next : 0;
    },
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      offset = (offset + speed * step) % length;
      settle();
      // World-space velocity: local +x through the group's yaw.
      velocity.set(speed, 0, 0).applyQuaternion(group.quaternion);
    },
  };
}

// ---------------------------------------------------------------------------
// Pressure plate
// ---------------------------------------------------------------------------

export interface PressurePlateOptions {
  seed?: number;
  /** Plate size, metres. Default [1.3, 1.3]. */
  size?: [number, number];
  /**
   * Latching plates stay pressed once stood on (a puzzle solved); momentary
   * plates release when everyone steps off (a door held). Default false.
   */
  latching?: boolean;
}

export interface PressurePlate {
  group: Group;
  trigger: Obstacle;
  /** GAMA MechanismSource, structurally: pressed = open = powering the link. */
  readonly open: boolean;
  toggle(): boolean;
  set(target: number | boolean): void;
  onChange?: (open: boolean) => void;
  /** Tell the plate how many stand on it this frame (0 releases momentary). */
  occupy(count: number): void;
  update(dt: number): void;
}

/**
 * The keystone: it depresses under weight and speaks GAMA's mechanism
 * dialect, so `linkMechanism(plate, door)` wires it to every door, gate
 * and drawbridge SCENA already ships. Feed it an occupancy count each
 * frame — GAMA's `Occupancy` or a plain trigger test both know it.
 */
export function createPressurePlate(options: PressurePlateOptions = {}): PressurePlate {
  const seed = options.seed ?? 1;
  const [sx, sz] = options.size ?? [1.3, 1.3];
  const latching = options.latching ?? false;

  const group = new Group();
  group.name = 'pressure-plate';
  const frame = new Mesh(new BoxGeometry(sx * 1.16, 0.08, sz * 1.16), createSurface('ashlar', { seed }));
  frame.position.y = 0.04;
  group.add(frame);
  const plate = new Mesh(new BoxGeometry(sx, 0.09, sz), createSurface('brass', { seed: seed + 1 }));
  plate.position.y = 0.1;
  group.add(plate);

  let pressed = false;
  let sink = 0;

  const trigger: Obstacle = { center: group.position, radius: Math.max(sx, sz) * 0.62 };

  const self: PressurePlate = {
    group,
    trigger,
    get open() {
      return pressed;
    },
    toggle() {
      self.set(!pressed);
      return pressed;
    },
    set(target: number | boolean) {
      const next = typeof target === 'number' ? target > 0.5 : target;
      if (next === pressed) return;
      pressed = next;
      self.onChange?.(pressed);
    },
    occupy(count: number) {
      const on = Number.isFinite(count) && count > 0;
      if (on && !pressed) self.set(true);
      else if (!on && pressed && !latching) self.set(false);
    },
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      const target = pressed ? 1 : 0;
      sink += (target - sink) * Math.min(step * 14, 1);
      plate.position.y = 0.1 - sink * 0.055;
    },
  };
  return self;
}
