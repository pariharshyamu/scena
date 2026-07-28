import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/random';

/**
 * Marks — the world remembering what happened on it.
 *
 * A skid mark is the cheapest persistence-of-action trick in games: the
 * corner you overcooked is still written on the tarmac three laps later.
 * This is a pool of ground decals — skids, footprints, scorches — that
 * fade out over tens of seconds and recycle their oldest slot when full.
 *
 * One draw call for every mark on the map. The pool is a single
 * InstancedMesh of unit quads; which SHAPE a quad shows is decided in the
 * fragment shader by a per-instance attribute (a soft-ended streak, an
 * ellipse, a radial scorch), and the slow fade is a second per-instance
 * attribute — the two things instancing famously cannot vary are exactly
 * the two things a decal needs, so the shader carries them.
 *
 * ```ts
 * const marks = createMarks({ seed: 2 });
 * scene.add(marks.mesh);
 * marks.stamp('skid', kart.position, kart.heading, { length: 1.4 });
 * marks.stamp('footprint', foot.position, walkDir);
 * // per frame:
 * marks.update(dt);
 * ```
 */

export type GroundMarkKind = 'skid' | 'footprint' | 'scorch';

export interface MarksOptions {
  /** Maximum marks on the ground at once. Default 96. */
  capacity?: number;
  /** Seconds a mark takes to fade away. Default 18. */
  fade?: number;
  /** Mark colour — dark, it multiplies against the ground. Default 0x1c1a17. */
  color?: number;
  /** Height above y=0 the decals float to dodge z-fighting. Default 0.015. */
  lift?: number;
  seed?: number;
}

export interface StampOptions {
  /** Along-direction size in metres. Defaults: skid 1.2, footprint 0.26, scorch = width. */
  length?: number;
  /** Across-direction size in metres. Defaults: skid 0.16, footprint 0.11, scorch 0.9. */
  width?: number;
  /** Starting opacity 0..1. Default 0.75 (footprint 0.5). */
  strength?: number;
}

export interface Marks {
  mesh: InstancedMesh;
  /**
   * Leave a mark at `at`, oriented along `direction` (XZ). Scorches ignore
   * the direction and take a seeded rotation instead — burn marks have no
   * heading.
   */
  stamp(kind: GroundMarkKind, at: Vector3, direction?: Vector3, options?: StampOptions): void;
  /** Live (visible) mark count. */
  readonly count: number;
  update(dt: number): void;
  /** Wipe the ground clean. */
  clear(): void;
}

const SHAPE: Record<GroundMarkKind, number> = { skid: 0, footprint: 1, scorch: 2 };

const DEFAULTS: Record<GroundMarkKind, { length: number; width: number; strength: number }> = {
  skid: { length: 1.2, width: 0.16, strength: 0.75 },
  footprint: { length: 0.26, width: 0.11, strength: 0.5 },
  scorch: { length: 0.9, width: 0.9, strength: 0.75 },
};

export function createMarks(options: MarksOptions = {}): Marks {
  const capacity = Math.max(8, options.capacity ?? 96);
  const fade = options.fade ?? 18;
  const lift = options.lift ?? 0.015;
  const rng = new Rng(options.seed ?? 1);

  const geometry = new PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2); // flat on the ground, +X is "along"
  const alpha = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  const shape = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute('aAlpha', alpha);
  geometry.setAttribute('aShape', shape);

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: { uColor: { value: new Color(options.color ?? 0x1c1a17) } },
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      attribute float aShape;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vShape;
      void main() {
        vUv = uv;
        vAlpha = aAlpha;
        vShape = aShape;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vShape;
      void main() {
        vec2 p = vUv - 0.5;
        float mask;
        if (vShape < 0.5) {
          // Skid: a streak, soft across, softer still at the ends.
          float across = 1.0 - smoothstep(0.28, 0.5, abs(p.y));
          float along = 1.0 - smoothstep(0.32, 0.5, abs(p.x));
          mask = across * along;
        } else if (vShape < 1.5) {
          // Footprint: an ellipse, slightly heavier at the heel end.
          float d = length(p * vec2(2.0, 2.4));
          mask = (1.0 - smoothstep(0.62, 1.0, d)) * (0.75 + 0.25 * smoothstep(0.5, -0.5, p.x));
        } else {
          // Scorch: darkest at the centre, ragged-ish falloff.
          float d = length(p) * 2.0;
          mask = 1.0 - smoothstep(0.35, 1.0, d);
        }
        float a = mask * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });

  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false; // marks are wherever the game happened
  mesh.renderOrder = 1;
  mesh.name = 'marks';

  const zero = new Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, zero);
  mesh.instanceMatrix.needsUpdate = true;

  // Per-slot state: current alpha and a monotonic birth stamp so a full
  // pool always recycles its OLDEST mark, not an arbitrary one.
  const level = new Float32Array(capacity);
  const born = new Float32Array(capacity);
  let stampCounter = 0;
  let liveCount = 0;

  const matrix = new Matrix4();
  const quat = new Quaternion();
  const scale = new Vector3();
  const pos = new Vector3();
  const UP = new Vector3(0, 1, 0);

  return {
    mesh,
    stamp(kind, at, direction, opts = {}) {
      const preset = DEFAULTS[kind];
      // A dead slot if there is one, else evict the oldest.
      let index = -1;
      for (let i = 0; i < capacity; i++) {
        if (level[i] <= 0) { index = i; break; }
      }
      if (index === -1) {
        index = 0;
        for (let i = 1; i < capacity; i++) if (born[i] < born[index]) index = i;
      } else {
        liveCount++;
      }

      const angle =
        kind === 'scorch' || !direction || direction.lengthSq() < 1e-10
          ? rng.range(0, Math.PI * 2)
          : Math.atan2(-direction.z, direction.x);
      quat.setFromAxisAngle(UP, angle);
      scale.set(opts.length ?? preset.length, 1, opts.width ?? preset.width);
      pos.copy(at);
      pos.y += lift;
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.instanceMatrix.needsUpdate = true;

      level[index] = Math.min(Math.max(opts.strength ?? preset.strength, 0), 1);
      born[index] = stampCounter++;
      shape.setX(index, SHAPE[kind]);
      alpha.setX(index, level[index]);
      shape.needsUpdate = true;
      alpha.needsUpdate = true;
    },
    update(dt) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      if (step === 0) return;
      let changed = false;
      for (let i = 0; i < capacity; i++) {
        if (level[i] <= 0) continue;
        level[i] -= step / fade;
        if (level[i] <= 0) {
          level[i] = 0;
          liveCount--;
          mesh.setMatrixAt(i, zero);
          mesh.instanceMatrix.needsUpdate = true;
        }
        alpha.setX(i, level[i]);
        changed = true;
      }
      if (changed) alpha.needsUpdate = true;
    },
    clear() {
      for (let i = 0; i < capacity; i++) {
        level[i] = 0;
        alpha.setX(i, 0);
        mesh.setMatrixAt(i, zero);
      }
      liveCount = 0;
      alpha.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    },
    get count() {
      return liveCount;
    },
  };
}
