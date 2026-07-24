import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createSlot } from '../core/types';
import type { Prop, PropSlot } from '../core/types';

/**
 * Rhythmic work stations — props built to be WORKED, not just used. A worker
 * stands at the `work` slot playing the station's `action` loop (ANIMA: chop,
 * mine, saw, stir), and each frame you drive `update(dt, working)`: the
 * station advances `progress` (0→1), throws a burst of effects on the impact
 * beat (chips, sparks, sawdust, steam) and fires `onYield` once per cycle —
 * the "do work over time and produce something" verb. Pair the yield with
 * GAMA's `Stockpile`:
 *
 * Walk the worker to the `work` slot, hold the tool, and layer the action
 * loop over the idle stance (the loop owns the arms — don't fight it with a
 * held pose):
 *
 * ```ts
 * const block = createChoppingBlock();
 * attach(rig, 'handRight', block.tool);                       // ANIMA holds the axe
 * const swing = loco.overlay(createLoopClip(rig, block.action)); // the chop, over idle
 * block.onYield = () => stock.add('wood');                    // GAMA counts the logs
 * game.onUpdate((t) => block.update(t.delta, working));       // effects + progress + yield
 * ```
 */
export interface WorkStation extends Prop {
  /** The ANIMA loop the worker plays ('chop' | 'mine' | 'saw' | 'stir'). */
  readonly action: string;
  /** Progress toward the next yield, 0→1 (resets each cycle). */
  readonly progress: number;
  /** A tool the worker holds — `attach(rig, 'handRight', station.tool)`. */
  readonly tool: Object3D;
  /** Fired once per work cycle, with the running total produced. */
  onYield?: (total: number) => void;
  /** Advance the station. `working` (default true) gates progress + effects. */
  update(dt: number, working?: boolean): void;
}

export interface WorkStationOptions {
  seed?: number;
  palette?: Palette;
}

// ------------------------------------------------------------- burst pool

interface Burst {
  mesh: InstancedMesh;
  emit(n: number): void;
  update(dt: number): void;
}

interface BurstOptions {
  origin: Vector3;
  color: number;
  count?: number;
  size?: number;
  speed?: number;
  spread?: number;
  up?: number;
  gravity?: number;
  life?: number;
  /** Steam-like: drift up and swell instead of falling. Default false. */
  rise?: boolean;
}

/**
 * A tiny CPU particle pool as an InstancedMesh (local to the station). Debris
 * (chips, sparks, dust) arcs under gravity and shrinks out; `rise` makes soft
 * steam that floats up and swells. Deterministic given a seeded Rng.
 */
function makeBurst(rng: Rng, options: BurstOptions): Burst {
  const count = options.count ?? 24;
  const size = options.size ?? 0.05;
  const speed = options.speed ?? 1.6;
  const spread = options.spread ?? 0.7;
  const up = options.up ?? 1.4;
  const rise = options.rise ?? false;
  const gravity = options.gravity ?? (rise ? -1.2 : 6);
  const lifeMax = options.life ?? 0.7;

  const geo = options.rise ? new IcosahedronGeometry(size, 0) : new BoxGeometry(size, size, size);
  const mat = new MeshStandardMaterial({
    color: options.color,
    flatShading: true,
    transparent: rise,
    opacity: rise ? 0.6 : 1,
    emissive: options.color,
    emissiveIntensity: rise ? 0 : 0.15,
  });
  const mesh = new InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.count = count;

  const pos = Array.from({ length: count }, () => new Vector3());
  const vel = Array.from({ length: count }, () => new Vector3());
  const life = new Float32Array(count);
  const m = new Matrix4();
  const q = new Quaternion();
  const one = new Vector3(1, 1, 1);
  const parked = new Vector3(0, -9999, 0);
  // Start all parked.
  for (let i = 0; i < count; i++) {
    m.compose(parked, q, one);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;

  return {
    mesh,
    emit(n: number) {
      let spawned = 0;
      for (let i = 0; i < count && spawned < n; i++) {
        if (life[i] > 0) continue;
        life[i] = lifeMax * (0.7 + rng.next() * 0.5);
        pos[i].copy(options.origin);
        vel[i].set(
          (rng.next() - 0.5) * spread * speed,
          (rise ? up * (0.6 + rng.next() * 0.6) : up * speed * (0.5 + rng.next())),
          (rng.next() - 0.5) * spread * speed
        );
        spawned++;
      }
    },
    update(dt: number) {
      let dirty = false;
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) continue;
        dirty = true;
        life[i] -= dt;
        vel[i].y -= gravity * dt;
        pos[i].addScaledVector(vel[i], dt);
        const t = Math.max(0, life[i] / lifeMax);
        const s = rise ? (1.4 - t) * size * 8 : t; // steam swells, debris shrinks
        if (life[i] <= 0) {
          m.compose(parked, q, one);
        } else {
          m.compose(pos[i], q, one.set(s, s, s));
        }
        mesh.setMatrixAt(i, m);
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------- the driver

interface StationCore {
  action: string;
  progress: number;
  onYield?: (total: number) => void;
  update(dt: number, working?: boolean): void;
}

function drive(
  action: string,
  cycle: number,
  impactAt: number,
  emit: () => void,
  bursts: Burst[]
): StationCore {
  let phase = 0;
  let struck = false;
  let total = 0;
  const core: StationCore = {
    action,
    progress: 0,
    onYield: undefined,
    update(dt: number, working = true) {
      if (working && dt > 0) {
        phase += dt / cycle;
        if (!struck && phase >= impactAt) {
          struck = true;
          total += 1;
          emit();
          core.onYield?.(total);
        }
        if (phase >= 1) {
          phase -= 1;
          struck = false;
        }
        core.progress = phase;
      }
      for (const b of bursts) b.update(dt);
    },
  };
  return core;
}

// ------------------------------------------------------------------ tools

const DARK = () => new MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.5, roughness: 0.5 });

/** An axe held in the hand (origin at the grip; shaft up, head near the top). */
function makeAxe(seed: number): Object3D {
  const g = new Group();
  g.name = 'axe';
  const shaft = new Mesh(new CylinderGeometry(0.018, 0.022, 0.6, 6), createSurface('wood', { seed }));
  shaft.position.y = 0.28;
  const head = new Mesh(new BoxGeometry(0.04, 0.14, 0.16), createSurface('steel', { seed: seed + 1 }));
  head.position.set(0, 0.54, 0.05);
  g.add(shaft, head);
  return g;
}

function makePickaxe(seed: number): Object3D {
  const g = new Group();
  g.name = 'pickaxe';
  const shaft = new Mesh(new CylinderGeometry(0.018, 0.022, 0.62, 6), createSurface('wood', { seed }));
  shaft.position.y = 0.29;
  const head = new Mesh(new CylinderGeometry(0.02, 0.02, 0.44, 6), createSurface('steel', { seed: seed + 1 }));
  head.rotation.z = Math.PI / 2;
  head.position.y = 0.56;
  for (const s of [-1, 1]) {
    const tip = new Mesh(new ConeGeometry(0.03, 0.08, 5), createSurface('steel', { seed: seed + 2 }));
    tip.rotation.z = (s * Math.PI) / 2;
    tip.position.set(s * 0.24, 0.56, 0);
    g.add(tip);
  }
  g.add(shaft, head);
  return g;
}

function makeLadle(seed: number): Object3D {
  const g = new Group();
  g.name = 'ladle';
  const shaft = new Mesh(new CylinderGeometry(0.014, 0.016, 0.5, 6), createSurface('wood', { seed }));
  shaft.position.y = 0.24;
  const bowl = new Mesh(new IcosahedronGeometry(0.06, 1), DARK());
  bowl.scale.y = 0.55;
  bowl.position.y = 0.5;
  g.add(shaft, bowl);
  return g;
}

function makeSaw(seed: number): Object3D {
  const g = new Group();
  g.name = 'saw';
  const handle = new Mesh(new BoxGeometry(0.07, 0.1, 0.04), createSurface('wood', { seed }));
  handle.position.y = 0.05;
  const blade = new Mesh(new BoxGeometry(0.5, 0.09, 0.006), createSurface('steel', { seed: seed + 1 }));
  blade.position.set(0.28, 0.05, 0);
  g.add(handle, blade);
  return g;
}

// ------------------------------------------------------------- the props

function workSlot(action: string, group: Group, x: number, z: number, rotY: number): PropSlot {
  const s = createSlot('work', 'operate', group, x, 0, z, rotY);
  s.loop = action; // the worker layers the action loop over the stand
  return s;
}

/** A chopping block: a stump with a log to split, an axe, flying wood chips. */
export function createChoppingBlock(options: WorkStationOptions = {}): WorkStation {
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const rng = new Rng(seed);
  const bark = createSurface('bark', { color: palette.woodDark, seed });
  const raw = createSurface('wood', { color: palette.wood, seed: seed + 1 });

  const group = new Group();
  group.name = 'chopping-block';
  const stump = new Mesh(new CylinderGeometry(0.3, 0.34, 0.5, 10), bark);
  stump.position.y = 0.25;
  const log = new Mesh(new CylinderGeometry(0.11, 0.11, 0.44, 8), raw);
  log.rotation.z = Math.PI / 2;
  log.position.y = 0.56;
  group.add(stump, log);
  for (let i = 0; i < 4; i++) {
    const split = new Mesh(new BoxGeometry(0.09, 0.09, 0.38), raw);
    split.position.set(rng.jitter(0.42, 0.12), 0.05, rng.jitter(0.1, 0.3));
    split.rotation.y = rng.range(0, Math.PI);
    group.add(split);
  }
  const chips = makeBurst(rng, { origin: new Vector3(0, 0.6, 0), color: palette.wood, count: 20, size: 0.045, speed: 1.4, up: 1.2, life: 0.6 });
  group.add(chips.mesh);

  const core = drive('chop', 1.2, 0.6, () => chips.emit(14), [chips]);
  return finish(group, 0.55, workSlot('chop', group, 0, 0.7, Math.PI), makeAxe(seed), core);
}

/** An ore vein: a boulder streaked with glowing ore, a pickaxe, dust + sparks. */
export function createOreVein(options: WorkStationOptions = {}): WorkStation {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const rock = createSurface('granite', { seed });
  const oreMat = new MeshStandardMaterial({ color: 0xffb454, emissive: 0xd7791f, emissiveIntensity: 0.6, flatShading: true });

  const group = new Group();
  group.name = 'ore-vein';
  const boulder = new Mesh(new IcosahedronGeometry(0.55, 0), rock);
  boulder.scale.set(1.2, 1.0, 0.9);
  boulder.position.y = 0.5;
  group.add(boulder);
  for (let i = 0; i < 6; i++) {
    const ore = new Mesh(new IcosahedronGeometry(rng.range(0.05, 0.09), 0), oreMat);
    const a = rng.range(0, Math.PI * 2);
    ore.position.set(Math.cos(a) * 0.45, 0.5 + rng.range(-0.2, 0.3), 0.35 + rng.range(-0.1, 0.1));
    group.add(ore);
  }
  const dust = makeBurst(rng, { origin: new Vector3(0, 0.55, 0.5), color: 0x9a8f82, count: 16, size: 0.04, speed: 1.2, up: 1.0, life: 0.6 });
  const sparks = makeBurst(rng, { origin: new Vector3(0, 0.55, 0.5), color: 0xffd27a, count: 10, size: 0.03, speed: 2.4, up: 1.8, life: 0.4 });
  group.add(dust.mesh, sparks.mesh);

  const core = drive('mine', 1.05, 0.6, () => { dust.emit(12); sparks.emit(8); }, [dust, sparks]);
  return finish(group, 0.7, workSlot('mine', group, 0, 1.0, Math.PI), makePickaxe(seed), core);
}

/** A cook-pot: a cauldron on a tripod over embers, a ladle, rising steam. */
export function createCookpot(options: WorkStationOptions = {}): WorkStation {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const iron = createSurface('metal', { seed });

  const group = new Group();
  group.name = 'cookpot';
  const pot = new Mesh(new CylinderGeometry(0.32, 0.26, 0.4, 12), iron);
  pot.position.y = 0.55;
  const rim = new Mesh(new CylinderGeometry(0.34, 0.34, 0.06, 12), iron);
  rim.position.y = 0.74;
  group.add(pot, rim);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new Mesh(new CylinderGeometry(0.02, 0.02, 0.7, 5), iron);
    leg.position.set(Math.cos(a) * 0.28, 0.3, Math.sin(a) * 0.28);
    leg.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3);
    group.add(leg);
  }
  const embers = new Mesh(new CylinderGeometry(0.18, 0.2, 0.06, 8), new MeshStandardMaterial({ color: 0xff7b32, emissive: 0xff5a1a, emissiveIntensity: 0.9, flatShading: true }));
  embers.position.y = 0.05;
  group.add(embers);
  const steam = makeBurst(rng, { origin: new Vector3(0, 0.78, 0), color: 0xf2f2f2, count: 18, size: 0.05, up: 0.5, spread: 0.5, speed: 0.5, life: 1.4, rise: true });
  group.add(steam.mesh);

  const core = drive('stir', 1.3, 0.5, () => steam.emit(6), [steam]);
  return finish(group, 0.5, workSlot('stir', group, 0, 0.46, Math.PI), makeLadle(seed), core);
}

/** A sawhorse with a plank being cut, a hand-saw, and falling sawdust. */
export function createSawhorse(options: WorkStationOptions = {}): WorkStation {
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const rng = new Rng(seed);
  const timber = createSurface('wood', { color: palette.woodDark, seed });
  const plankMat = createSurface('plank', { color: palette.wood, seed: seed + 1 });

  const group = new Group();
  group.name = 'sawhorse';
  for (const zx of [-0.4, 0.4]) {
    for (const s of [-1, 1]) {
      const leg = new Mesh(new BoxGeometry(0.05, 0.7, 0.05), timber);
      leg.position.set(zx, 0.33, s * 0.22);
      leg.rotation.x = s * 0.35;
      group.add(leg);
    }
  }
  const beam = new Mesh(new BoxGeometry(1.0, 0.08, 0.1), timber);
  beam.position.y = 0.64;
  group.add(beam);
  const plank = new Mesh(new BoxGeometry(1.3, 0.06, 0.24), plankMat);
  plank.position.set(0.1, 0.72, 0);
  group.add(plank);
  const dust = makeBurst(rng, { origin: new Vector3(0.15, 0.7, 0.12), color: 0xd8c295, count: 18, size: 0.03, speed: 0.8, up: 0.4, spread: 0.5, life: 0.7 });
  group.add(dust.mesh);

  const core = drive('saw', 1.0, 0.5, () => dust.emit(12), [dust]);
  return finish(group, 0.75, workSlot('saw', group, 0.15, 0.7, Math.PI), makeSaw(seed), core);
}

/** Assemble the common WorkStation shape (and mount any extra effect meshes). */
function finish(
  group: Group,
  obstacleRadius: number,
  slot: PropSlot,
  tool: Object3D,
  core: StationCore
): WorkStation {
  return {
    object: group,
    obstacleRadius,
    slots: [slot],
    tool,
    get action() {
      return core.action;
    },
    get progress() {
      return core.progress;
    },
    get onYield() {
      return core.onYield;
    },
    set onYield(cb: ((total: number) => void) | undefined) {
      core.onYield = cb;
    },
    update(dt: number, working = true) {
      core.update(dt, working);
    },
  } as WorkStation;
}
