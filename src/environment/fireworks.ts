import {
  AdditiveBlending,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  OctahedronGeometry,
} from 'three';
import { Rng } from '../core/random';

/**
 * Fireworks — celebration tech.
 *
 * Seeded rockets rise on a slightly drunken line, burst at the top of
 * their fuse into a spherical shell of glowing sparks that droop under
 * gravity and gutter out. One InstancedMesh for everything in flight
 * (the effects-system idiom: octahedra, scale-is-fade, per-instance
 * color), so a grand finale is still one draw call.
 *
 * `onBurst` fires at every shell break with the position and color —
 * that's the hook for the boom, the GameFeel thump, and the crowd.
 *
 * ```ts
 * const show = createFireworks({ seed: 7, onBurst: (at) => sounds.impact('soft', 1) });
 * scene.add(show.group);
 * show.launch({ x: -4, y: 0, z: 0 }, { color: 0xff9d5c });
 * // per frame: show.update(dt);
 * ```
 */

export interface FireworksOptions {
  seed?: number;
  /** Spark capacity — the finale budget. Default 600. */
  capacity?: number;
  /** Downward pull on sparks. Default 3.4 (stylized, not Earth). */
  gravity?: number;
  onBurst?: (at: { x: number; y: number; z: number }, color: number) => void;
}

export interface LaunchOptions {
  color?: number;
  /** Sparks in the shell. Default seeded 70–110. */
  sparks?: number;
}

export interface Fireworks {
  group: Group;
  /** Rockets currently climbing. */
  readonly rockets: number;
  /** Sparks currently burning. */
  readonly sparks: number;
  launch(from?: { x: number; y: number; z: number }, options?: LaunchOptions): void;
  update(dt: number): void;
}

const SHELL_COLORS = [0xffd889, 0xff9d5c, 0x9dd1ff, 0xff5f8f, 0xb8ffc8, 0xf0e6ff];

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  /** Rockets have a fuse and burst; sparks just burn down. */
  fuse: number;
  color: number;
  shellSparks: number;
}

const matrix = new Matrix4();
const colorScratch = new Color();

export function createFireworks(options: FireworksOptions = {}): Fireworks {
  const rng = new Rng(options.seed ?? 1);
  const capacity = Math.max(options.capacity ?? 600, 50);
  const gravity = options.gravity ?? 3.4;

  const group = new Group();
  group.name = 'fireworks';
  const mesh = new InstancedMesh(
    new OctahedronGeometry(0.11),
    new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false, transparent: true }),
    capacity
  );
  mesh.frustumCulled = false;
  group.add(mesh);

  const slots: Particle[] = Array.from({ length: capacity }, () => ({
    alive: false,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    life: 0, maxLife: 1, size: 1, fuse: -1, color: 0xffffff, shellSparks: 0,
  }));
  // All slots start hidden.
  matrix.makeScale(0, 0, 0);
  for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, matrix);
  mesh.instanceMatrix.needsUpdate = true;

  let cursor = 0;
  const take = (): Particle => {
    // Oldest-recycled: a finale never crashes, the dimmest spark just dies early.
    for (let i = 0; i < capacity; i++) {
      const slot = slots[(cursor + i) % capacity];
      if (!slot.alive) {
        cursor = (cursor + i + 1) % capacity;
        return slot;
      }
    }
    cursor = (cursor + 1) % capacity;
    return slots[cursor];
  };

  const paint = (slot: Particle, brightness = 1): void => {
    colorScratch.setHex(slot.color).multiplyScalar(brightness);
    mesh.setColorAt(slots.indexOf(slot), colorScratch);
  };

  const burst = (rocket: Particle): void => {
    const count = rocket.shellSparks;
    for (let i = 0; i < count; i++) {
      const spark = take();
      // Uniform-ish sphere directions, seeded.
      const theta = rng.range(0, Math.PI * 2);
      const cosPhi = rng.range(-1, 1);
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
      const speed = rng.range(4.5, 8) * rng.range(0.75, 1);
      spark.alive = true;
      spark.x = rocket.x;
      spark.y = rocket.y;
      spark.z = rocket.z;
      spark.vx = Math.cos(theta) * sinPhi * speed + rocket.vx * 0.15;
      spark.vy = cosPhi * speed + rocket.vy * 0.1;
      spark.vz = Math.sin(theta) * sinPhi * speed + rocket.vz * 0.15;
      spark.maxLife = spark.life = rng.range(1.4, 2.2);
      spark.size = rng.range(0.7, 1.3);
      spark.fuse = -1;
      spark.color = rocket.color;
      paint(spark, rng.range(0.85, 1.15));
    }
    options.onBurst?.({ x: rocket.x, y: rocket.y, z: rocket.z }, rocket.color);
  };

  return {
    group,
    get rockets() {
      return slots.filter((s) => s.alive && s.fuse >= 0).length;
    },
    get sparks() {
      return slots.filter((s) => s.alive && s.fuse < 0).length;
    },
    launch(from = { x: 0, y: 0, z: 0 }, launchOptions = {}) {
      const rocket = take();
      rocket.alive = true;
      rocket.x = from.x;
      rocket.y = from.y;
      rocket.z = from.z;
      rocket.vx = rng.range(-0.7, 0.7);
      rocket.vy = rng.range(9, 11);
      rocket.vz = rng.range(-0.7, 0.7);
      rocket.fuse = rng.range(1.0, 1.35);
      rocket.maxLife = rocket.life = 10; // fuse decides, not life
      rocket.size = 0.8;
      rocket.color = launchOptions.color ?? SHELL_COLORS[rng.int(0, SHELL_COLORS.length - 1)];
      rocket.shellSparks = launchOptions.sparks ?? rng.int(70, 110);
      // The climbing streak burns white-hot, whatever the shell's color.
      const i = slots.indexOf(rocket);
      colorScratch.setHex(0xfff6e0);
      mesh.setColorAt(i, colorScratch);
    },
    update(dt) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      for (let i = 0; i < capacity; i++) {
        const p = slots[i];
        if (!p.alive) continue;
        if (p.fuse >= 0) {
          // A rocket: climb, wobble, pop.
          p.fuse -= step;
          p.vy -= 2.2 * step; // gentle slowdown near apex
          p.x += p.vx * step;
          p.y += p.vy * step;
          p.z += p.vz * step;
          if (p.fuse <= 0) {
            p.alive = false;
            burst(p);
            matrix.makeScale(0, 0, 0);
            mesh.setMatrixAt(i, matrix);
            continue;
          }
          matrix.makeScale(p.size, p.size * 1.6, p.size); // streak, not dot
          matrix.setPosition(p.x, p.y, p.z);
          mesh.setMatrixAt(i, matrix);
        } else {
          // A spark: droop, drag, gutter.
          p.life -= step;
          if (p.life <= 0) {
            p.alive = false;
            matrix.makeScale(0, 0, 0);
            mesh.setMatrixAt(i, matrix);
            continue;
          }
          p.vy -= gravity * step;
          const drag = Math.max(1 - 1.1 * step, 0);
          p.vx *= drag;
          p.vy *= drag;
          p.vz *= drag;
          p.x += p.vx * step;
          p.y += p.vy * step;
          p.z += p.vz * step;
          const fade = p.life / p.maxLife;
          const s = p.size * fade;
          matrix.makeScale(s, s, s);
          matrix.setPosition(p.x, p.y, p.z);
          mesh.setMatrixAt(i, matrix);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
