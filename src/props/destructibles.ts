import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  SphereGeometry,
  TetrahedronGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { createSurface } from '../materials/surface';
import { buildTextGeometry } from '../text/textGeometry';
import type { Obstacle } from '../core/types';

/**
 * Destructibles — the props that give feedback by coming apart.
 *
 * A breakable is two props in one: the intact shell everyone sees, and
 * the seeded pre-fractured shards hiding inside it. `break()` swaps one
 * for the other and lets the pieces fly, bounce, and settle into debris
 * — the classic loop-closer, with a `loot` position where a pickup
 * should appear. The target dummy wobbles by the blow and topples on
 * command; the scoreboard gives the vector font a job with moving
 * parts; and the stumps finally do the thing cricket feedback is FOR:
 * the bails fly.
 */

const GRAVITY = 9.8;

interface Piece {
  mesh: Mesh;
  vel: Vector3;
  spin: Vector3;
  home: Vector3;
  homeQuat: [number, number, number, number];
  resting: boolean;
}

/** Shared shard flight: gravity, one soft floor bounce, then rest. */
function flyPieces(pieces: Piece[], dt: number, floorY: number): void {
  for (const piece of pieces) {
    if (piece.resting) continue;
    piece.vel.y -= GRAVITY * dt;
    piece.mesh.position.addScaledVector(piece.vel, dt);
    piece.mesh.rotation.x += piece.spin.x * dt;
    piece.mesh.rotation.y += piece.spin.y * dt;
    piece.mesh.rotation.z += piece.spin.z * dt;
    if (piece.mesh.position.y <= floorY && piece.vel.y < 0) {
      piece.mesh.position.y = floorY;
      if (Math.abs(piece.vel.y) > 1.2) {
        piece.vel.y *= -0.3;
        piece.vel.x *= 0.5;
        piece.vel.z *= 0.5;
        piece.spin.multiplyScalar(0.5);
      } else {
        piece.resting = true;
        piece.vel.set(0, 0, 0);
      }
    }
  }
}

function resetPieces(pieces: Piece[]): void {
  for (const piece of pieces) {
    piece.mesh.position.copy(piece.home);
    piece.mesh.quaternion.set(...piece.homeQuat);
    piece.mesh.rotation.setFromQuaternion(piece.mesh.quaternion);
    piece.vel.set(0, 0, 0);
    piece.resting = false;
  }
}

// ---------------------------------------------------------------------------
// Breakables
// ---------------------------------------------------------------------------

export type BreakableKind = 'crate' | 'barrel' | 'pot';
export type BreakableState = 'intact' | 'breaking' | 'debris';

export interface BreakableOptions {
  seed?: number;
  /** Overall size, metres. Default 0.9. */
  size?: number;
  /** Shard count. Default 9. */
  shards?: number;
}

export interface Breakable {
  group: Group;
  kind: BreakableKind;
  trigger: Obstacle;
  readonly state: BreakableState;
  /**
   * Where dropped loot belongs, in the group's local frame — hand it to
   * a pickup's position when the shards fly.
   */
  loot: Vector3;
  /** Come apart. `impulse` biases the shards' flight (a hit direction). */
  break(impulse?: { x: number; y?: number; z: number }): void;
  /** Back in one piece — pooled levels reuse their props. */
  reset(): void;
  update(dt: number): void;
}

export function createBreakable(kind: BreakableKind, options: BreakableOptions = {}): Breakable {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const size = options.size ?? 0.9;
  const shardCount = Math.max(options.shards ?? 9, 4);

  const group = new Group();
  group.name = `breakable-${kind}`;

  // The intact shell.
  const shell = new Group();
  group.add(shell);
  let material;
  if (kind === 'crate') {
    material = createSurface('plank', { seed });
    const body = new Mesh(new BoxGeometry(size, size, size), material);
    body.position.y = size / 2;
    shell.add(body);
  } else if (kind === 'barrel') {
    material = createSurface('wood', { seed });
    const body = new Mesh(
      new CylinderGeometry(size * 0.42, size * 0.42, size, 12),
      material
    );
    body.position.y = size / 2;
    shell.add(body);
    const hoop = createSurface('steel', { seed: seed + 1 });
    for (const y of [size * 0.22, size * 0.78]) {
      const ring = new Mesh(new CylinderGeometry(size * 0.44, size * 0.44, size * 0.06, 12), hoop);
      ring.position.y = y;
      shell.add(ring);
    }
  } else {
    material = createSurface('terracotta', { seed });
    const body = new Mesh(new SphereGeometry(size * 0.45, 12, 9), material);
    body.scale.y = 1.1;
    body.position.y = size * 0.5;
    shell.add(body);
    const neck = new Mesh(new CylinderGeometry(size * 0.2, size * 0.26, size * 0.16, 10), material);
    neck.position.y = size * 0.98;
    shell.add(neck);
  }

  // The shards, pre-fractured and hidden. Seeded once: the same crate
  // always breaks into the same pieces, which is what makes a break
  // replayable and a save-file honest.
  const debris = new Group();
  debris.visible = false;
  group.add(debris);
  const pieces: Piece[] = [];
  for (let i = 0; i < shardCount; i++) {
    const shard = new Mesh(
      new TetrahedronGeometry(size * rng.range(0.12, 0.24), 0),
      material
    );
    shard.position.set(
      rng.range(-0.25, 0.25) * size,
      rng.range(0.2, 0.85) * size,
      rng.range(-0.25, 0.25) * size
    );
    shard.rotation.set(rng.range(0, Math.PI), rng.range(0, Math.PI), rng.range(0, Math.PI));
    debris.add(shard);
    pieces.push({
      mesh: shard,
      vel: new Vector3(),
      spin: new Vector3(),
      home: shard.position.clone(),
      homeQuat: [shard.quaternion.x, shard.quaternion.y, shard.quaternion.z, shard.quaternion.w],
      resting: false,
    });
  }

  let state: BreakableState = 'intact';
  let settleClock = 0;

  const trigger: Obstacle = { center: group.position, radius: size * 0.7 };

  return {
    group,
    kind,
    trigger,
    loot: new Vector3(0, size * 0.5, 0),
    get state() {
      return state;
    },
    break(impulse) {
      if (state !== 'intact') return;
      state = 'breaking';
      settleClock = 0;
      shell.visible = false;
      debris.visible = true;
      const bias = new Vector3(impulse?.x ?? 0, impulse?.y ?? 0, impulse?.z ?? 0);
      if (bias.length() > 6) bias.setLength(6);
      for (const piece of pieces) {
        // Outward from the centre, up, plus the hit's own push.
        piece.vel
          .copy(piece.home)
          .setY(0)
          .normalize()
          .multiplyScalar(rng.range(1.2, 2.6))
          .add(bias);
        piece.vel.y = rng.range(2, 4);
        piece.spin.set(rng.range(-8, 8), rng.range(-8, 8), rng.range(-8, 8));
        piece.resting = false;
      }
    },
    reset() {
      state = 'intact';
      shell.visible = true;
      debris.visible = false;
      resetPieces(pieces);
    },
    update(dt) {
      if (state === 'intact') return;
      const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
      flyPieces(pieces, step, 0.05);
      if (state === 'breaking') {
        settleClock += step;
        if (settleClock > 1 && pieces.every((p) => p.resting)) state = 'debris';
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Target dummy
// ---------------------------------------------------------------------------

export interface TargetDummyOptions {
  seed?: number;
  /** Total height, metres. Default 1.7. */
  height?: number;
}

export interface TargetDummy {
  group: Group;
  trigger: Obstacle;
  readonly toppled: boolean;
  /** Wobble away from the blow. `power` scales the swing. */
  hit(from?: { x: number; y?: number; z: number }, power?: number): void;
  /** Over it goes — the KO. */
  topple(): void;
  reset(): void;
  update(dt: number): void;
}

/**
 * The training-yard prop: a post, a torso, a head, and a spring. Hits
 * wobble it (a damped pendulum about its base); `topple()` lays it
 * down and it stays down. Wire its trigger to GAMA's Projectiles and
 * its `hit` to the impact event, and the yard teaches aim.
 */
export function createTargetDummy(options: TargetDummyOptions = {}): TargetDummy {
  const seed = options.seed ?? 1;
  const height = options.height ?? 1.7;

  const group = new Group();
  group.name = 'target-dummy';
  const pivot = new Group();
  group.add(pivot);
  const post = new Mesh(
    new CylinderGeometry(0.06, 0.08, height * 0.55, 8),
    createSurface('wood', { seed })
  );
  post.position.y = height * 0.275;
  pivot.add(post);
  const torso = new Mesh(
    new CylinderGeometry(0.2, 0.16, height * 0.36, 10),
    createSurface('canvas', { seed: seed + 1 })
  );
  torso.position.y = height * 0.68;
  pivot.add(torso);
  const head = new Mesh(new SphereGeometry(0.13, 10, 8), createSurface('canvas', { seed: seed + 2 }));
  head.position.y = height * 0.95;
  pivot.add(head);

  // The wobble spring: angle + angular velocity about a seeded-fixed axis.
  let angle = 0;
  let omega = 0;
  const axis = new Vector3(1, 0, 0);
  let toppled = false;

  const trigger: Obstacle = { center: group.position, radius: 0.45 };

  return {
    group,
    trigger,
    get toppled() {
      return toppled;
    },
    hit(from, power = 1) {
      if (toppled) return;
      // Swing away from the blow, in the vertical plane containing it.
      if (from) {
        const dx = group.position.x - from.x;
        const dz = group.position.z - from.z;
        const len = Math.hypot(dx, dz) || 1;
        axis.set(dz / len, 0, -dx / len);
      } else {
        axis.set(1, 0, 0);
      }
      omega += Math.min(Math.max(power, 0.2), 3) * 3.2;
    },
    topple() {
      toppled = true;
    },
    reset() {
      toppled = false;
      angle = 0;
      omega = 0;
      pivot.rotation.set(0, 0, 0);
    },
    update(dt) {
      const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
      if (toppled) {
        // Fall to the ground and stay: ease the angle to 90°.
        angle += (Math.PI / 2 - angle) * Math.min(step * 6, 1);
      } else {
        // A damped pendulum: stiffness pulls home, damping bleeds it off.
        omega += (-angle * 28 - omega * 4.5) * step;
        angle += omega * step;
      }
      pivot.quaternion.setFromAxisAngle(axis, angle);
    },
  };
}

// ---------------------------------------------------------------------------
// Scoreboard
// ---------------------------------------------------------------------------

export interface ScoreboardOptions {
  seed?: number;
  /** Digit count. Default 3. */
  digits?: number;
  /** Digit height, metres. Default 0.42. */
  size?: number;
  /** Board colour. Default deep green, like the ground's own boards. */
  color?: number;
  digitColor?: number;
}

export interface Scoreboard {
  group: Group;
  /** Show a value (clamped to what the digits can hold). Flips animate. */
  set(value: number): void;
  readonly value: number;
  update(dt: number): void;
}

/**
 * The vector font's first job with moving parts. Each digit slot flips —
 * the old number rotates away, the new one rotates in — because a board
 * that just swaps text reads as a texture, and one that MOVES reads as a
 * machine somebody built. Ten carved geometries are built once per size
 * and shared by every slot and every board.
 */
const digitCache = new Map<number, ReturnType<typeof buildTextGeometry>[]>();
function digitGeometries(size: number) {
  const key = Math.round(size * 1000);
  let geoms = digitCache.get(key);
  if (!geoms) {
    geoms = Array.from({ length: 10 }, (_, d) =>
      buildTextGeometry(String(d), { size, depth: size * 0.18 })
    );
    digitCache.set(key, geoms);
  }
  return geoms;
}

export function createScoreboard(options: ScoreboardOptions = {}): Scoreboard {
  const seed = options.seed ?? 1;
  const digits = Math.max(options.digits ?? 3, 1);
  const size = options.size ?? 0.42;
  const geoms = digitGeometries(size);

  const group = new Group();
  group.name = 'scoreboard';
  const slotW = size * 0.95;
  const boardW = slotW * digits + size * 0.6;
  const boardH = size * 1.7;
  const board = new Mesh(
    new BoxGeometry(boardW, boardH, 0.1),
    createSurface('paint', { seed, color: options.color ?? 0x18321f })
  );
  board.position.y = boardH / 2 + size * 1.2;
  group.add(board);
  const postMaterial = createSurface('wood', { seed: seed + 1 });
  for (const side of [-1, 1]) {
    const post = new Mesh(
      new CylinderGeometry(0.05, 0.06, size * 1.3 + boardH * 0.5, 8),
      postMaterial
    );
    post.position.set((side * boardW) / 2.4, (size * 1.3 + boardH * 0.5) / 2, 0);
    group.add(post);
  }

  const digitMaterial = createSurface('paint', {
    seed: seed + 2,
    color: options.digitColor ?? 0xf2ede0,
  });
  interface Slot {
    holder: Group;
    mesh: Mesh;
    showing: number;
    next: number | null;
    flip: number; // 0 = at rest; >0 animating
  }
  const slots: Slot[] = Array.from({ length: digits }, (_, i) => {
    const holder = new Group();
    holder.position.set((i - (digits - 1) / 2) * slotW, board.position.y, 0.08);
    group.add(holder);
    const mesh = new Mesh(geoms[0].geometry, digitMaterial);
    holder.add(mesh);
    return { holder, mesh, showing: 0, next: null, flip: 0 };
  });

  let current = 0;
  const max = 10 ** digits - 1;

  return {
    group,
    get value() {
      return current;
    },
    set(value: number) {
      const v = Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 0), max) : 0;
      if (v === current) return;
      current = v;
      const text = String(v).padStart(digits, '0');
      slots.forEach((slot, i) => {
        const digit = Number(text[i]);
        if (digit !== slot.showing) {
          slot.next = digit;
          slot.flip = 1; // restart the flip for this slot
        }
      });
    },
    update(dt) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      for (const slot of slots) {
        if (slot.flip <= 0) continue;
        slot.flip = Math.max(slot.flip - step / 0.28, 0);
        const w = 1 - slot.flip; // 0 → 1 over the flip
        // First half: the old digit tips away. Midpoint: swap. Second
        // half: the new digit tips in from the other side.
        if (w < 0.5) {
          slot.holder.rotation.x = -w * Math.PI;
        } else {
          if (slot.next !== null) {
            slot.showing = slot.next;
            slot.mesh.geometry = geoms[slot.showing].geometry;
            slot.next = null;
          }
          slot.holder.rotation.x = (1 - w) * Math.PI;
        }
        if (slot.flip === 0) slot.holder.rotation.x = 0;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Stumps — the cricket retrofit
// ---------------------------------------------------------------------------

export interface StumpsOptions {
  seed?: number;
  /** Stump height, metres. Default 0.71 (the laws'). */
  height?: number;
}

export interface Stumps {
  group: Group;
  trigger: Obstacle;
  readonly struck: boolean;
  /**
   * The ball arrives. Bails FLY (each on its own arc and spin), the hit
   * stumps lean. `direction` is the ball's travel; `power` scales it.
   */
  strike(direction?: { x: number; y?: number; z: number }, power?: number): void;
  reset(): void;
  update(dt: number): void;
}

/**
 * Three stumps, two bails, and the single most satisfying piece of
 * feedback in cricket: the bails coming off. Until now the trilogy's
 * wickets were scenery; these are an event.
 */
export function createStumps(options: StumpsOptions = {}): Stumps {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const height = options.height ?? 0.71;

  const group = new Group();
  group.name = 'stumps';
  const wood = createSurface('wood', { seed, color: 0xd9c9a3 });
  const gap = 0.055;

  const stumps: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const stump = new Mesh(new CylinderGeometry(0.019, 0.022, height, 8), wood);
    stump.position.set((i - 1) * gap * 2, height / 2, 0);
    group.add(stump);
    stumps.push(stump);
  }

  const bails: Piece[] = [];
  for (let i = 0; i < 2; i++) {
    const bail = new Mesh(new CylinderGeometry(0.012, 0.012, gap * 2 * 0.96, 6), wood);
    bail.rotation.z = Math.PI / 2;
    bail.position.set((i === 0 ? -1 : 1) * gap, height + 0.015, 0);
    group.add(bail);
    bails.push({
      mesh: bail,
      vel: new Vector3(),
      spin: new Vector3(),
      home: bail.position.clone(),
      homeQuat: [bail.quaternion.x, bail.quaternion.y, bail.quaternion.z, bail.quaternion.w],
      resting: false,
    });
  }

  let struck = false;
  const leans = stumps.map(() => 0);
  const leanTargets = stumps.map(() => 0);

  const trigger: Obstacle = { center: group.position, radius: 0.18 };

  return {
    group,
    trigger,
    get struck() {
      return struck;
    },
    strike(direction, power = 1) {
      if (struck) return;
      struck = true;
      const p = Math.min(Math.max(power, 0.3), 2);
      const dir = new Vector3(direction?.x ?? 0, 0, direction?.z ?? 1);
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      dir.normalize();
      for (const bail of bails) {
        // Up first, along the ball second, apart from each other third —
        // two bails that fly identically read as one drawn twice.
        bail.vel
          .copy(dir)
          .multiplyScalar(p * rng.range(1, 1.8))
          .add(new Vector3(rng.range(-0.6, 0.6), p * rng.range(2.4, 3.4), rng.range(-0.3, 0.3)));
        bail.spin.set(rng.range(-14, 14), rng.range(-10, 10), rng.range(-14, 14));
        bail.resting = false;
      }
      // One or two stumps knocked back, seeded.
      const knocked = rng.int(1, 2);
      for (let k = 0; k < knocked; k++) {
        leanTargets[rng.int(0, 2)] = rng.range(0.35, 0.7);
      }
    },
    reset() {
      struck = false;
      resetPieces(bails);
      for (let i = 0; i < stumps.length; i++) {
        leanTargets[i] = 0;
        leans[i] = 0;
        stumps[i].rotation.x = 0;
      }
    },
    update(dt) {
      if (!struck && bails.every((b) => !b.resting && b.vel.lengthSq() === 0)) return;
      const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
      flyPieces(bails, step, 0.012);
      for (let i = 0; i < stumps.length; i++) {
        if (Math.abs(leans[i] - leanTargets[i]) < 1e-4) continue;
        leans[i] += (leanTargets[i] - leans[i]) * Math.min(step * 10, 1);
        stumps[i].rotation.x = -leans[i];
        // A leaning stump pivots at its base, not its middle.
        stumps[i].position.y = (Math.cos(leans[i]) * (stumps[i].geometry as CylinderGeometry).parameters.height) / 2;
        stumps[i].position.z = (Math.sin(leans[i]) * (stumps[i].geometry as CylinderGeometry).parameters.height) / 2;
      }
    },
  };
}
