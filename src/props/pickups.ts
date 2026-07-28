import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  OctahedronGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { Rng } from '../core/random';
import { createSurface } from '../materials/surface';
import type { Obstacle } from '../core/types';

/**
 * Pickups — the things a game loop is made of.
 *
 * A pickup is a small seeded prop with a built-in idle (spin at a seeded
 * phase plus a sine bob — a field of coins must never tick in lockstep)
 * and two transitions: `collect()` pops it out of the world and
 * `respawn()` shimmers it back, each returning its duration so the caller
 * can schedule the consequences. The gem wears the `gemstone` surface —
 * dispersion doing the "this one is valuable" work games usually fake
 * with a glow sprite.
 *
 * The gameplay handshake is the house rule: `trigger` is structurally an
 * `Obstacle` (`{center, radius}`), with `center` a LIVE reference to the
 * prop's root position — hand it to GAMA's proximity queries and neither
 * library imports the other. SCENA renders the pickup; who gets credit
 * for touching it is the game loop's business.
 *
 * ```ts
 * const gem = createPickup('gem', { seed: 7 });
 * gem.group.position.set(4, 0.8, -2);
 * scene.add(gem.group);
 * // per frame:
 * gem.update(dt);
 * // when the game loop says so:
 * const wait = gem.collect();
 * ```
 */

export type PickupKind = 'coin' | 'gem' | 'key' | 'heart' | 'star' | 'orb' | 'potion';

export interface PickupOptions {
  seed?: number;
  /** Overall size multiplier. Default 1. */
  scale?: number;
  /** Tint override for the body material. */
  color?: number;
  /** Bob amplitude in metres. Default 0.07. */
  bob?: number;
  /** Idle spin speed, radians/second. Default 1.6. */
  spin?: number;
}

export type PickupState = 'idle' | 'collecting' | 'collected' | 'respawning';

export interface Pickup {
  group: Group;
  kind: PickupKind;
  /** Where the game loop should test proximity: live centre + pick radius. */
  trigger: Obstacle;
  readonly state: PickupState;
  /** Pop out of the world. Returns the animation's seconds; 0 if not idle. */
  collect(): number;
  /** Shimmer back in. Returns the animation's seconds; 0 unless collected. */
  respawn(): number;
  update(dt: number): void;
}

const COLLECT_TIME = 0.35;
const RESPAWN_TIME = 0.45;

interface BuiltBody {
  nodes: Mesh[];
  radius: number;
}

/**
 * Make a metal READ as treasure with no environment map in sight. A pure
 * metal shows only reflections, and a pickup cannot demand the caller set
 * up IBL before a coin looks like a coin — so the gold kinds trade some
 * physical purity for readability: part-dielectric, with a warm ember of
 * emissive that keeps them golden in any light. Game tokens, not bullion.
 */
function treasure(material: { metalness: number; emissive: { setHex(hex: number): unknown } }): void {
  material.metalness = 0.55;
  material.emissive.setHex(0x402c06);
}

/** One geometry + material per kind — shared by fields, cloned by nobody. */
function buildBody(kind: PickupKind, seed: number, tint: number | undefined): BuiltBody {
  const paint = (fallback: number) => tint ?? fallback;
  switch (kind) {
    case 'coin': {
      const geometry = new CylinderGeometry(0.3, 0.3, 0.07, 16);
      geometry.rotateX(Math.PI / 2); // a coin STANDS, faces out, spins about Y
      const material = createSurface('brass', { seed, color: paint(0xd9a53c) });
      treasure(material);
      return { nodes: [new Mesh(geometry, material)], radius: 0.32 };
    }
    case 'gem': {
      const material = createSurface('gemstone', { seed, ...(tint ? { color: tint } : {}) });
      return { nodes: [new Mesh(new OctahedronGeometry(0.3, 0), material)], radius: 0.32 };
    }
    case 'star': {
      // A five-point star extruded thin — the shape is ten points on two radii.
      const shape = new Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 0.32 : 0.13;
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      const geometry = new ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
      geometry.translate(0, 0, -0.04);
      const material = createSurface('brass', { seed: seed + 1, color: paint(0xf3c94e) });
      treasure(material);
      return { nodes: [new Mesh(geometry, material)], radius: 0.34 };
    }
    case 'orb': {
      const material = createSurface('crystal', { seed, ...(tint ? { color: tint } : {}) });
      return { nodes: [new Mesh(new IcosahedronGeometry(0.26, 1), material)], radius: 0.28 };
    }
    case 'heart': {
      // Two lobes and a point — reads as a heart at any poly count.
      const material = createSurface('paint', { seed, color: paint(0xd94a5e) });
      const lobe = new SphereGeometry(0.16, 12, 10);
      const left = new Mesh(lobe, material);
      left.position.set(-0.11, 0.1, 0);
      const right = new Mesh(lobe, material);
      right.position.set(0.11, 0.1, 0);
      const point = new Mesh(new ConeGeometry(0.21, 0.34, 4), material);
      point.rotation.set(Math.PI, Math.PI / 4, 0);
      point.position.y = -0.09;
      point.scale.z = 0.55;
      return { nodes: [left, right, point], radius: 0.3 };
    }
    case 'key': {
      const material = createSurface('brass', { seed, color: paint(0xc9a23f) });
      treasure(material);
      const bow = new Mesh(new TorusGeometry(0.12, 0.045, 8, 14), material);
      bow.position.y = 0.18;
      const shaft = new Mesh(new BoxGeometry(0.07, 0.34, 0.05), material);
      shaft.position.y = -0.05;
      const teeth1 = new Mesh(new BoxGeometry(0.11, 0.05, 0.05), material);
      teeth1.position.set(0.08, -0.2, 0);
      const teeth2 = new Mesh(new BoxGeometry(0.08, 0.05, 0.05), material);
      teeth2.position.set(0.065, -0.1, 0);
      return { nodes: [bow, shaft, teeth1, teeth2], radius: 0.3 };
    }
    case 'potion': {
      const glass = createSurface('crystal', { seed, ...(tint ? { color: tint } : { color: 0x7fd486 }) });
      const body = new Mesh(new SphereGeometry(0.18, 12, 10), glass);
      body.scale.y = 1.15;
      const neck = new Mesh(new CylinderGeometry(0.06, 0.07, 0.14, 10), glass);
      neck.position.y = 0.22;
      const cork = new Mesh(
        new CylinderGeometry(0.055, 0.05, 0.07, 8),
        createSurface('wood', { seed: seed + 2 })
      );
      cork.position.y = 0.31;
      return { nodes: [body, neck, cork], radius: 0.28 };
    }
  }
}

export function createPickup(kind: PickupKind, options: PickupOptions = {}): Pickup {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const scale = options.scale ?? 1;
  const bobHeight = options.bob ?? 0.07;
  const spinSpeed = options.spin ?? 1.6;

  const group = new Group();
  group.name = `pickup-${kind}`;
  // The spinner is a child so collect/respawn scaling never fights the
  // caller's own transform on `group`.
  const spinner = new Group();
  group.add(spinner);
  const body = buildBody(kind, seed, options.color);
  for (const node of body.nodes) spinner.add(node);
  spinner.scale.setScalar(scale);

  const phase = rng.range(0, Math.PI * 2);
  let state: PickupState = 'idle';
  let animT = 0;
  let clock = rng.range(0, 10);

  const trigger: Obstacle = { center: group.position, radius: body.radius * scale + 0.25 };

  return {
    group,
    kind,
    trigger,
    get state() {
      return state;
    },
    collect() {
      if (state !== 'idle') return 0;
      state = 'collecting';
      animT = 0;
      return COLLECT_TIME;
    },
    respawn() {
      if (state !== 'collected') return 0;
      state = 'respawning';
      animT = 0;
      return RESPAWN_TIME;
    },
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      clock += step;
      if (state === 'collected') return;

      let size = 1;
      let spin = spinSpeed;
      if (state === 'collecting') {
        animT += step;
        const t = Math.min(animT / COLLECT_TIME, 1);
        // Pop first, then shrink to nothing; the spin doubles on the way out.
        size = t < 0.3 ? 1 + t * 1.2 : Math.max(1.36 * (1 - (t - 0.3) / 0.7), 0);
        spin = spinSpeed * 4;
        if (t >= 1) {
          state = 'collected';
          spinner.visible = false;
        }
      } else if (state === 'respawning') {
        animT += step;
        const t = Math.min(animT / RESPAWN_TIME, 1);
        spinner.visible = true;
        // Overshoot and settle — arriving, not fading in.
        size = t < 0.7 ? (t / 0.7) * 1.15 : 1.15 - 0.15 * ((t - 0.7) / 0.3);
        if (t >= 1) state = 'idle';
      }
      spinner.scale.setScalar(Math.max(size * scale, 1e-4));
      spinner.rotation.y = clock * spin + phase;
      spinner.position.y = Math.sin(clock * 2 + phase) * bobHeight;
    },
  };
}

// ---------------------------------------------------------------------------
// The field — coin-run density in one draw call.
// ---------------------------------------------------------------------------

export interface PickupFieldOptions {
  seed?: number;
  scale?: number;
  color?: number;
  bob?: number;
  spin?: number;
}

export interface FieldTrigger extends Obstacle {
  /** Which instance this trigger belongs to. */
  index: number;
}

export interface PickupField {
  mesh: InstancedMesh;
  /** One live trigger per position; collected entries stay but stop mattering. */
  triggers: FieldTrigger[];
  /** How many are still collectable. */
  readonly remaining: number;
  isActive(index: number): boolean;
  collect(index: number): number;
  respawn(index: number): number;
  update(dt: number): void;
}

/** Kinds whose body is a single geometry — what an InstancedMesh can carry. */
const FIELD_KINDS: ReadonlySet<PickupKind> = new Set(['coin', 'gem', 'star', 'orb']);

/**
 * A hundred coins, one draw call. Positions are fixed at creation (they
 * are the level design); each instance idles at its own seeded phase and
 * collapses when collected. Composite kinds (key, heart, potion) need a
 * mesh per pickup — use `createPickup` for those; this throws rather than
 * silently rendering the wrong thing.
 */
export function createPickupField(
  kind: PickupKind,
  positions: readonly Vector3[],
  options: PickupFieldOptions = {}
): PickupField {
  if (!FIELD_KINDS.has(kind)) {
    throw new Error(`createPickupField: '${kind}' is a composite body — use createPickup per instance.`);
  }
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const scale = options.scale ?? 1;
  const bobHeight = options.bob ?? 0.07;
  const spinSpeed = options.spin ?? 1.6;

  const body = buildBody(kind, seed, options.color);
  const source = body.nodes[0];
  const mesh = new InstancedMesh(
    source.geometry as BufferGeometry,
    source.material as Material,
    positions.length
  );
  mesh.name = `pickups-${kind}`;
  mesh.frustumCulled = false;

  const phases = positions.map(() => rng.range(0, Math.PI * 2));
  const states: PickupState[] = positions.map(() => 'idle');
  const anims = positions.map(() => 0);
  let clock = 0;
  let alive = positions.length;

  const triggers: FieldTrigger[] = positions.map((p, index) => ({
    center: p.clone(),
    radius: body.radius * scale + 0.25,
    index,
  }));

  const matrix = new Matrix4();
  const quat = new Quaternion();
  const size = new Vector3();
  const pos = new Vector3();
  const UP = new Vector3(0, 1, 0);

  const compose = (): void => {
    for (let i = 0; i < positions.length; i++) {
      let s = 1;
      if (states[i] === 'collected') s = 0;
      else if (states[i] === 'collecting') {
        const t = Math.min(anims[i] / COLLECT_TIME, 1);
        s = t < 0.3 ? 1 + t * 1.2 : Math.max(1.36 * (1 - (t - 0.3) / 0.7), 0);
      } else if (states[i] === 'respawning') {
        const t = Math.min(anims[i] / RESPAWN_TIME, 1);
        s = t < 0.7 ? (t / 0.7) * 1.15 : 1.15 - 0.15 * ((t - 0.7) / 0.3);
      }
      quat.setFromAxisAngle(UP, clock * (states[i] === 'collecting' ? spinSpeed * 4 : spinSpeed) + phases[i]);
      pos.copy(positions[i]);
      pos.y += Math.sin(clock * 2 + phases[i]) * bobHeight;
      size.setScalar(Math.max(s * scale, 1e-4));
      matrix.compose(pos, quat, size);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  compose();

  return {
    mesh,
    triggers,
    get remaining() {
      return alive;
    },
    isActive(index: number) {
      return states[index] === 'idle';
    },
    collect(index: number) {
      if (states[index] !== 'idle') return 0;
      states[index] = 'collecting';
      anims[index] = 0;
      alive--;
      return COLLECT_TIME;
    },
    respawn(index: number) {
      if (states[index] !== 'collected') return 0;
      states[index] = 'respawning';
      anims[index] = 0;
      return RESPAWN_TIME;
    },
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      clock += step;
      for (let i = 0; i < states.length; i++) {
        if (states[i] === 'collecting') {
          anims[i] += step;
          if (anims[i] >= COLLECT_TIME) states[i] = 'collected';
        } else if (states[i] === 'respawning') {
          anims[i] += step;
          if (anims[i] >= RESPAWN_TIME) {
            states[i] = 'idle';
            alive++;
          }
        }
      }
      compose();
    },
  };
}
