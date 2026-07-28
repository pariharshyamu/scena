import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
  AdditiveBlending,
} from 'three';
import { Rng } from '../core/random';

/**
 * Impact effects — the visible half of game feel.
 *
 * A hit that only changes a number is a spreadsheet event. What sells
 * contact is debris: dust where a boot lands, sparks where metal meets
 * stone, droplets where something takes the water. These are the burst
 * effects for those moments, built the way everything here is built —
 * low-poly, seeded, and cheap enough to spend freely.
 *
 * Two draw calls for every particle in flight, whatever you spawn. All
 * matte particles share one InstancedMesh, all glowing ones another, and
 * a particle is a tiny octahedron rather than a billboarded sprite — a
 * solid needs no camera to face, so `update(dt)` needs no camera, and at
 * this size the silhouette difference is invisible while the *tumble* a
 * flat sprite cannot do reads clearly. Fade is done with scale, not
 * opacity: instanced per-particle opacity would cost a custom shader, and
 * a mote shrinking to nothing is indistinguishable from one fading out.
 *
 * ```ts
 * const fx = createEffects({ seed: 4 });
 * scene.add(fx.group);
 * fx.burst('dust', boot.position);
 * fx.burst('sparks', hit.point, { direction: hit.normal });
 * fx.ring(splashPoint, { color: 0xbfe3ff });
 * // per frame:
 * fx.update(dt);
 * ```
 */

export type BurstKind = 'dust' | 'sparks' | 'debris' | 'splash' | 'confetti';

export interface EffectsOptions {
  /** Maximum simultaneous particles; past it the oldest are recycled. Default 320. */
  capacity?: number;
  /** Ground height particles settle against. Default 0. */
  floor?: number;
  /** Same seed, same debris. Default 1. */
  seed?: number;
}

export interface BurstOptions {
  /** Particle count for this burst. Default depends on kind. */
  count?: number;
  /** Tint override (confetti ignores it — confetti is many colours or it is litter). */
  color?: number;
  /** Particle size multiplier. Default 1. */
  size?: number;
  /** Initial speed multiplier. Default 1. */
  speed?: number;
  /** Launch direction bias (an impact normal). Default straight up. */
  direction?: Vector3;
  /** Cone spread around the direction, 0 tight – 1 hemisphere. Default per kind. */
  spread?: number;
}

export interface RingOptions {
  /** Final radius in metres. Default 1.4. */
  radius?: number;
  /** Seconds to reach it and fade. Default 0.55. */
  life?: number;
  color?: number;
  /** Starting opacity. Default 0.65. */
  opacity?: number;
}

export interface Effects {
  /** Add this to the scene; both particle meshes and all rings live in it. */
  group: Group;
  /** Spend some particles at a point. */
  burst(kind: BurstKind, at: Vector3, options?: BurstOptions): void;
  /** An expanding, fading ground ring — landings, splashes, shockwaves. */
  ring(at: Vector3, options?: RingOptions): void;
  /** Live particle count, for tests and debug readouts. */
  readonly alive: number;
  update(dt: number): void;
}

interface KindVoice {
  count: number;
  speed: number;
  spread: number;
  /** Downward pull in m/s² — dust barely falls, debris drops like debris. */
  gravity: number;
  /** Velocity kept per second — dust bleeds speed into the air, sparks keep it. */
  drag: number;
  life: [number, number];
  size: [number, number];
  /** Scale over life: >1 grows (a dust cloud billows), <1 shrinks. */
  grow: number;
  spin: number;
  glow: boolean;
  bounce: boolean;
  flutter: number;
  colors: number[];
}

const VOICES: Record<BurstKind, KindVoice> = {
  dust: {
    count: 10, speed: 1.7, spread: 0.85, gravity: 1.2, drag: 0.12,
    life: [0.5, 0.9], size: [0.09, 0.16], grow: 2.6, spin: 2, glow: false,
    bounce: false, flutter: 0, colors: [0xb8a98c, 0xa89a80, 0xc7bba1],
  },
  sparks: {
    count: 14, speed: 7.5, spread: 0.5, gravity: 9.8, drag: 0.75,
    life: [0.3, 0.55], size: [0.05, 0.09], grow: 0.25, spin: 6, glow: true,
    bounce: true, flutter: 0, colors: [0xffc76a, 0xffa73d, 0xfff3b0],
  },
  debris: {
    count: 8, speed: 4.2, spread: 0.7, gravity: 9.8, drag: 0.85,
    life: [0.8, 1.3], size: [0.08, 0.17], grow: 0.9, spin: 9, glow: false,
    bounce: true, flutter: 0, colors: [0x8a7a64, 0x6e6152, 0x9c8c74],
  },
  splash: {
    count: 12, speed: 3.4, spread: 0.55, gravity: 9.8, drag: 0.9,
    life: [0.4, 0.65], size: [0.05, 0.1], grow: 0.5, spin: 3, glow: false,
    bounce: false, flutter: 0, colors: [0xcfe8f7, 0xa8d4ee, 0xe8f5fc],
  },
  confetti: {
    count: 24, speed: 3.2, spread: 0.9, gravity: 1.6, drag: 0.55,
    life: [1.6, 2.6], size: [0.06, 0.1], grow: 1, spin: 11, glow: false,
    bounce: false, flutter: 2.4,
    colors: [0xef6a6a, 0xf3c34e, 0x6fcf74, 0x64a9ef, 0xc77df0, 0xf090c8],
  },
};

interface Particle {
  aliveFlag: boolean;
  glow: boolean;
  pos: Vector3;
  vel: Vector3;
  quat: Quaternion;
  axis: Vector3;
  spin: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  gravity: number;
  drag: number;
  bounce: boolean;
  flutter: number;
  phase: number;
  born: number;
}

const ZERO = new Matrix4().makeScale(0, 0, 0);

export function createEffects(options: EffectsOptions = {}): Effects {
  const capacity = Math.max(8, options.capacity ?? 320);
  const floor = options.floor ?? 0;
  const rng = new Rng(options.seed ?? 1);
  const group = new Group();
  group.name = 'effects';

  const shard = new OctahedronGeometry(0.5, 0);
  const matte = new InstancedMesh(
    shard,
    new MeshBasicMaterial({ transparent: true, opacity: 0.95 }),
    capacity
  );
  const glow = new InstancedMesh(
    shard,
    new MeshBasicMaterial({
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
    capacity
  );
  // Particles scatter across the world; the meshes' own bounds mean nothing.
  matte.frustumCulled = false;
  glow.frustumCulled = false;
  const white = new Color(0xffffff);
  for (let i = 0; i < capacity; i++) {
    matte.setMatrixAt(i, ZERO);
    glow.setMatrixAt(i, ZERO);
    matte.setColorAt(i, white);
    glow.setColorAt(i, white);
  }
  group.add(matte, glow);

  const particles: Particle[] = Array.from({ length: capacity }, () => ({
    aliveFlag: false, glow: false,
    pos: new Vector3(), vel: new Vector3(),
    quat: new Quaternion(), axis: new Vector3(0, 1, 0),
    spin: 0, age: 0, life: 1, size: 0.1, grow: 1,
    gravity: 0, drag: 1, bounce: false, flutter: 0, phase: 0, born: 0,
  }));
  let aliveCount = 0;
  let stamp = 0; // monotonic birth order, so recycling always takes the OLDEST

  /** A slot for a new particle: a dead one if any, else the oldest living. */
  const slot = (): Particle => {
    let oldest: Particle | null = null;
    for (const p of particles) {
      if (!p.aliveFlag) return p;
      if (!oldest || p.born < oldest.born) oldest = p;
    }
    aliveCount--; // the oldest is being evicted, not expiring
    return oldest as Particle;
  };

  const scratchDir = new Vector3();
  const scratchColor = new Color();

  const burst = (kind: BurstKind, at: Vector3, opts: BurstOptions = {}): void => {
    const voice = VOICES[kind];
    const n = Math.max(1, opts.count ?? voice.count);
    const speed = (opts.speed ?? 1) * voice.speed;
    const spread = opts.spread ?? voice.spread;
    const dir = scratchDir.copy(opts.direction ?? UP);
    if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
    dir.normalize();

    for (let k = 0; k < n; k++) {
      const p = slot();
      const index = particles.indexOf(p);
      // An evicted particle may change pools (matte ↔ glow); zero BOTH of its
      // slots or the old pool keeps rendering the stale matrix forever.
      matte.setMatrixAt(index, ZERO);
      glow.setMatrixAt(index, ZERO);
      p.aliveFlag = true;
      p.born = stamp++;
      p.glow = voice.glow;
      p.pos.copy(at);
      // A random direction inside the cone: lerp from the bias axis toward a
      // fully random one by `spread`, so 0 is a jet and 1 is a puffball.
      p.vel
        .set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1))
        .normalize()
        .multiplyScalar(spread)
        .add(dir)
        .normalize()
        .multiplyScalar(speed * rng.range(0.55, 1.25));
      p.quat.set(0, 0, 0, 1);
      p.axis.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
      p.spin = rng.jitter(voice.spin, voice.spin * 0.5);
      p.age = 0;
      p.life = rng.range(voice.life[0], voice.life[1]);
      p.size = rng.range(voice.size[0], voice.size[1]) * (opts.size ?? 1);
      p.grow = voice.grow;
      p.gravity = voice.gravity;
      p.drag = voice.drag;
      p.bounce = voice.bounce;
      p.flutter = voice.flutter;
      p.phase = rng.range(0, Math.PI * 2);
      const base = opts.color !== undefined && kind !== 'confetti'
        ? scratchColor.setHex(opts.color)
        : scratchColor.setHex(rng.pick(voice.colors));
      // A pinch of value variation so a burst is a material, not a swatch.
      (p.glow ? glow : matte).setColorAt(index, base.multiplyScalar(rng.range(0.85, 1.1)));
      aliveCount++;
    }
    if (matte.instanceColor) matte.instanceColor.needsUpdate = true;
    if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
  };

  // -- Rings ----------------------------------------------------------------

  interface RingFx {
    mesh: Mesh;
    material: MeshBasicMaterial;
    age: number;
    life: number;
    radius: number;
    opacity: number;
  }
  const ringGeometry = new RingGeometry(0.72, 1, 40);
  ringGeometry.rotateX(-Math.PI / 2);
  const rings: RingFx[] = [];

  const ring = (at: Vector3, opts: RingOptions = {}): void => {
    let fx = rings.find((r) => r.age >= r.life);
    if (!fx) {
      if (rings.length >= 16) {
        fx = rings.reduce((a, b) => (a.age / a.life > b.age / b.life ? b : a));
      } else {
        const material = new MeshBasicMaterial({ transparent: true, depthWrite: false });
        const mesh = new Mesh(ringGeometry, material);
        mesh.renderOrder = 1;
        group.add(mesh);
        fx = { mesh, material, age: 0, life: 1, radius: 1, opacity: 1 };
        rings.push(fx);
      }
    }
    fx.age = 0;
    fx.life = opts.life ?? 0.55;
    fx.radius = opts.radius ?? 1.4;
    fx.opacity = opts.opacity ?? 0.65;
    fx.material.color.setHex(opts.color ?? 0xd8d2c4);
    fx.material.opacity = fx.opacity;
    fx.mesh.visible = true;
    // A hair above the point, so a ground ring does not z-fight the ground.
    fx.mesh.position.copy(at).y += 0.02;
    fx.mesh.scale.setScalar(0.001);
  };

  // -- Simulation -----------------------------------------------------------

  const matrix = new Matrix4();
  const spinQuat = new Quaternion();
  const scale = new Vector3();

  const integrate = (step: number): void => {
    for (let i = 0; i < capacity; i++) {
      const p = particles[i];
      if (!p.aliveFlag) continue;
      p.age += step;
      if (p.age >= p.life) {
        p.aliveFlag = false;
        aliveCount--;
        (p.glow ? glow : matte).setMatrixAt(i, ZERO);
        continue;
      }
      p.vel.y -= p.gravity * step;
      const keep = Math.pow(p.drag, step);
      p.vel.multiplyScalar(keep);
      if (p.flutter > 0) {
        // Confetti falls the way paper falls — nothing straight about it.
        p.vel.x += Math.sin(p.age * 7 + p.phase) * p.flutter * step;
        p.vel.z += Math.cos(p.age * 6.3 + p.phase) * p.flutter * step;
      }
      p.pos.addScaledVector(p.vel, step);
      if (p.pos.y < floor + p.size * 0.5) {
        p.pos.y = floor + p.size * 0.5;
        if (p.bounce) {
          if (p.vel.y < 0) {
            p.vel.y *= -0.35;
            p.vel.x *= 0.6;
            p.vel.z *= 0.6;
          }
        } else {
          // Dust pancakes and confetti rests — nothing sinks through a floor.
          p.vel.y = 0;
          const settle = Math.pow(0.02, step);
          p.vel.x *= settle;
          p.vel.z *= settle;
        }
      }
      spinQuat.setFromAxisAngle(p.axis, p.spin * step);
      p.quat.premultiply(spinQuat);

      const t = p.age / p.life;
      // Ease from 1 to `grow`, then collapse to zero in the last quarter —
      // the collapse IS the fade.
      const growth = 1 + (p.grow - 1) * t;
      const vanish = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      const s = Math.max(p.size * growth * vanish, 1e-4);
      matrix.compose(p.pos, p.quat, scale.setScalar(s));
      (p.glow ? glow : matte).setMatrixAt(i, matrix);
    }
  };

  const update = (dt: number): void => {
    // A lag spike must advance time honestly — a clamp that freezes the
    // clock turns one slow frame into effects that outstay their lives.
    // But explicit Euler explodes on big steps, so the half-second cap is
    // walked in sub-steps the integrator can survive.
    const total = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.5) : 0;
    let remaining = total;
    while (remaining > 1e-9) {
      const step = Math.min(remaining, 1 / 30);
      remaining -= step;
      integrate(step);
    }
    matte.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;

    for (const fx of rings) {
      if (fx.age >= fx.life) continue;
      fx.age += total;
      const t = Math.min(fx.age / fx.life, 1);
      // Fast out, easing as it goes — how a real wavefront loses steam.
      const eased = 1 - (1 - t) * (1 - t);
      fx.mesh.scale.setScalar(Math.max(fx.radius * eased, 0.001));
      fx.material.opacity = fx.opacity * (1 - t);
      if (t >= 1) fx.mesh.visible = false;
    }
  };

  return {
    group,
    burst,
    ring,
    get alive() {
      return aliveCount;
    },
    update,
  };
}

const UP = new Vector3(0, 1, 0);
