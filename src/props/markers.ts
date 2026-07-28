import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { createSurface } from '../materials/surface';
import type { Obstacle } from '../core/types';

/**
 * Markers — the furniture of objectives. A checkpoint arch that knows
 * whether it is next, a capture zone that turns on the ground, a beacon
 * readable across a whole map, and a chequered finish gate. Almost pure
 * state machine: the geometry is cheap and all the value is in the
 * transitions, because a player reads a checkpoint's STATE at a glance
 * or not at all.
 *
 * Every marker exposes `trigger` — structurally an `Obstacle`
 * (`{center, radius}`, centre a live reference to the marker's root) —
 * so GAMA's Circuit and trigger queries consume them without imports.
 */

export type CheckpointState = 'upcoming' | 'active' | 'passed';

export interface CheckpointOptions {
  seed?: number;
  /** Clear width between the pillars, metres. Default 4. */
  width?: number;
  /** Height to the underside of the beam. Default 3. */
  height?: number;
  /** Emissive colour when active. Default 0x53c7f0. */
  color?: number;
}

export interface Checkpoint {
  group: Group;
  trigger: Obstacle;
  readonly state: CheckpointState;
  /** upcoming = slow pulse · active = bright · passed = dim green. */
  setState(state: CheckpointState): void;
  update(dt: number): void;
}

export function createCheckpoint(options: CheckpointOptions = {}): Checkpoint {
  const seed = options.seed ?? 1;
  const width = options.width ?? 4;
  const height = options.height ?? 3;
  const activeColor = options.color ?? 0x53c7f0;

  const group = new Group();
  group.name = 'checkpoint';

  const pillarMaterial = createSurface('steel', { seed });
  const pillar = new CylinderGeometry(0.14, 0.18, height, 10);
  for (const side of [-1, 1]) {
    const post = new Mesh(pillar, pillarMaterial);
    post.position.set((side * width) / 2, height / 2, 0);
    group.add(post);
  }
  const beam = new Mesh(new BoxGeometry(width + 0.6, 0.24, 0.24), pillarMaterial);
  beam.position.y = height + 0.12;
  group.add(beam);

  // The glow strip under the beam is the state display. MeshBasic on
  // purpose: state must read identically at noon and at midnight, so it
  // cannot be at the mercy of the lighting rig.
  const strip = new MeshBasicMaterial({ color: activeColor, transparent: true });
  const glow = new Mesh(new BoxGeometry(width, 0.1, 0.1), strip);
  glow.position.y = height - 0.08;
  group.add(glow);

  let state: CheckpointState = 'upcoming';
  let clock = new Rng(seed).range(0, 6);

  const trigger: Obstacle = { center: group.position, radius: width / 2 };

  return {
    group,
    trigger,
    get state() {
      return state;
    },
    setState(next: CheckpointState) {
      state = next;
      if (state === 'active') strip.color.setHex(activeColor);
      else if (state === 'passed') strip.color.setHex(0x4caf6e);
      else strip.color.setHex(activeColor);
    },
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      clock += step;
      if (state === 'upcoming') strip.opacity = 0.35 + 0.25 * Math.sin(clock * 2.2);
      else if (state === 'active') strip.opacity = 0.9 + 0.1 * Math.sin(clock * 6);
      else strip.opacity = 0.4;
    },
  };
}

// ---------------------------------------------------------------------------

export interface ZoneOptions {
  seed?: number;
  /** Zone radius, metres. Default 2.2. */
  radius?: number;
  color?: number;
  /** Rotating dash count. Default 14. */
  dashes?: number;
}

export interface Zone {
  group: Group;
  trigger: Obstacle;
  /** 0..1 — how "captured"/charged the zone reads. Drives the fill ring. */
  setProgress(value: number): void;
  update(dt: number): void;
}

/**
 * A flat ground ring with rotating dashes — spawn pad, capture area,
 * charge circle. `setProgress` fills an inner ring so the game loop can
 * show how long you have stood in it.
 */
export function createZone(options: ZoneOptions = {}): Zone {
  const seed = options.seed ?? 1;
  const radius = options.radius ?? 2.2;
  const color = options.color ?? 0x53c7f0;
  const dashCount = options.dashes ?? 14;

  const group = new Group();
  group.name = 'zone';

  const edge = new MeshBasicMaterial({ color, transparent: true, opacity: 0.75 });
  const dashes = new Group();
  const dashGeometry = new BoxGeometry((2 * Math.PI * radius) / dashCount * 0.55, 0.04, 0.16);
  for (let i = 0; i < dashCount; i++) {
    const dash = new Mesh(dashGeometry, edge);
    const a = (i / dashCount) * Math.PI * 2;
    dash.position.set(Math.cos(a) * radius, 0.03, Math.sin(a) * radius);
    dash.rotation.y = -a + Math.PI / 2;
    dashes.add(dash);
  }
  group.add(dashes);

  const fillMaterial = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.28,
    side: DoubleSide,
  });
  const fill = new Mesh(new RingGeometry(0.01, radius * 0.92, 40), fillMaterial);
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.02;
  fill.scale.setScalar(0.001);
  group.add(fill);

  let clock = new Rng(seed).range(0, 6);
  const trigger: Obstacle = { center: group.position, radius };

  return {
    group,
    trigger,
    setProgress(value: number) {
      const v = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
      fill.scale.setScalar(Math.max(v, 0.001));
      fillMaterial.opacity = 0.18 + v * 0.25;
    },
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      clock += step;
      dashes.rotation.y = clock * 0.6;
      edge.opacity = 0.6 + 0.2 * Math.sin(clock * 3);
    },
  };
}

// ---------------------------------------------------------------------------

export interface BeaconOptions {
  seed?: number;
  /** Pillar height, metres. Default 9. */
  height?: number;
  color?: number;
}

export interface Beacon {
  group: Group;
  trigger: Obstacle;
  update(dt: number): void;
}

/**
 * A pillar of light readable across the map — the "go HERE" a radar can
 * only hint at. Additive, double-sided, fading with height; a small base
 * ring anchors it to the ground so it reads as placed, not painted.
 */
export function createBeacon(options: BeaconOptions = {}): Beacon {
  const seed = options.seed ?? 1;
  const height = options.height ?? 9;
  const color = options.color ?? 0xf3c94e;

  const group = new Group();
  group.name = 'beacon';

  const shaft = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.4,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  // Two nested tapers beat one: the parallax between them is what makes
  // the pillar read as VOLUME rather than a painted stripe.
  for (const [r0, r1, o] of [
    [0.5, 0.14, 0.35],
    [0.28, 0.06, 0.55],
  ]) {
    const cone = new Mesh(new CylinderGeometry(r1, r0, height, 12, 1, true), shaft.clone());
    (cone.material as MeshBasicMaterial).opacity = o;
    cone.position.y = height / 2;
    group.add(cone);
  }
  const ring = new Mesh(new TorusGeometry(0.62, 0.05, 8, 24), new MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);

  let clock = new Rng(seed).range(0, 6);
  const trigger: Obstacle = { center: group.position, radius: 1.2 };

  return {
    group,
    trigger,
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      clock += step;
      const breathe = 0.85 + 0.15 * Math.sin(clock * 1.7);
      group.children.forEach((child, i) => {
        if (i < 2) (child as Mesh).scale.set(breathe, 1, breathe);
      });
      group.rotation.y = clock * 0.4;
    },
  };
}

// ---------------------------------------------------------------------------

export interface FinishGateOptions {
  seed?: number;
  /** Clear width between posts. Default 6. */
  width?: number;
  /** Height to the banner's underside. Default 3.2. */
  height?: number;
}

export interface FinishGate {
  group: Group;
  trigger: Obstacle;
  update(dt: number): void;
}

/**
 * The chequered line. The banner is real geometry — one InstancedMesh of
 * alternating cells, no texture — so it stays crisp at any distance and
 * dresses both sides.
 */
export function createFinishGate(options: FinishGateOptions = {}): FinishGate {
  const seed = options.seed ?? 1;
  const width = options.width ?? 6;
  const height = options.height ?? 3.2;

  const group = new Group();
  group.name = 'finish-gate';

  const postMaterial = createSurface('steel', { seed });
  const post = new CylinderGeometry(0.16, 0.2, height + 0.9, 10);
  for (const side of [-1, 1]) {
    const p = new Mesh(post, postMaterial);
    p.position.set((side * (width + 0.5)) / 2, (height + 0.9) / 2, 0);
    group.add(p);
  }

  const rows = 2;
  const columns = Math.max(Math.round(width / 0.45), 6);
  const cell = width / columns;
  const cellGeometry = new BoxGeometry(cell, cell, 0.06);
  const white = new MeshStandardMaterial({ color: 0xf2f2ee });
  const black = new MeshStandardMaterial({ color: 0x181a1e });
  const whites = new InstancedMesh(cellGeometry, white, Math.ceil((rows * columns) / 2));
  const blacks = new InstancedMesh(cellGeometry, black, Math.floor((rows * columns) / 2) + 1);
  const matrix = new Matrix4();
  const quat = new Quaternion();
  const one = new Vector3(1, 1, 1);
  const pos = new Vector3();
  let wi = 0;
  let bi = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      pos.set(-width / 2 + cell * (column + 0.5), height + 0.9 - cell * (row + 0.5) - 0.45, 0);
      matrix.compose(pos, quat, one);
      if ((row + column) % 2 === 0) whites.setMatrixAt(wi++, matrix);
      else blacks.setMatrixAt(bi++, matrix);
    }
  }
  whites.count = wi;
  blacks.count = bi;
  group.add(whites, blacks);

  const trigger: Obstacle = { center: group.position, radius: width / 2 };

  return {
    group,
    trigger,
    update() {
      /* the line does not blink — it only waits */
    },
  };
}
