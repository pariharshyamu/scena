import { Mesh, Vector2, type Material, type Object3D } from 'three';

/** The slice of the shader object `onBeforeCompile` receives. */
interface PatchableShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
}

export interface WindFieldOptions {
  /** Wind bearing: degrees (0 = +X, 90 = +Z) or a world [x, z] vector. Default 35°. */
  direction?: number | [number, number];
  /** Steady lean at full sway, in world units. Default 0.3. */
  strength?: number;
  /** Gustiness 0–1: 0 = constant lean, 1 = deep travelling gusts. Default 0.5. */
  gust?: number;
  /** Distance between gust crests, in metres (smaller = tighter ripples). Default 6. */
  waveLength?: number;
  /** Speed the gust crests travel downwind. Default 2.2. */
  waveSpeed?: number;
}

export interface SwayOptions {
  /** Local height (metres) at which sway reaches full. Default 1. */
  height?: number;
  /** Stiffness curve exponent — higher keeps the base stiffer. Default 1.6. */
  stiffness?: number;
  /** Local height below which nothing moves (keeps trunks planted). Default 0. */
  anchor?: number;
}

export interface WindField {
  /** The shared shader uniforms (one set, referenced by every bound material). */
  readonly uniforms: Record<string, { value: unknown }>;
  /** The (normalized) wind direction in world XZ. Mutate via `setDirection`. */
  readonly direction: Vector2;
  /** Current steady strength. */
  strength: number;
  /** Every material patched so far. */
  materials: Material[];
  /** Point the wind along a new bearing (degrees) or [x, z] vector. */
  setDirection(direction: number | [number, number]): WindField;
  /** Change the steady strength. */
  setStrength(strength: number): WindField;
  /** The wind vector at a world point (CPU side) — for pushing agents, particles, boats. */
  sample(x: number, z: number, time?: number): Vector2;
  /** Patch a material to sway. Composes with surface materials; idempotent per material. */
  bind(material: Material, options?: SwayOptions): WindField;
  /** Self-animate: drive the shared clock from a rendered object's `onBeforeRender`. */
  attach(object: Object3D): WindField;
  /** Convenience: `bind` every material under `target`, then `attach` the driver. */
  sway(target: Object3D, options?: SwayOptions): WindField;
  /** Advance the clock manually instead of self-driving (for deterministic loops). */
  update(dt: number): void;
}

const WIND_UNIFORMS = /* glsl */ `
uniform vec2  uWindDir;
uniform float uWindStrength;
uniform float uWindGust;
uniform float uWindWaveK;
uniform float uWindWaveSpeed;
uniform float uWindTime;
uniform float uWindHeight;
uniform float uWindStiff;
uniform float uWindAnchor;
`;

// Vertex bend: displacement grows with local height (bases stay planted), leans
// along the wind, and rides a gust that TRAVELS downwind (so a field ripples,
// and neighbours never sway in lockstep). Computed in world space then folded
// back to local (assumes uniform scale + rotation, true for scattered plants).
const WIND_BEGIN = /* glsl */ `
{
  mat4 scenaWM = modelMatrix;
  #ifdef USE_INSTANCING
    scenaWM = modelMatrix * instanceMatrix;
  #endif
  vec3 scenaBase = scenaWM[3].xyz;
  float scenaLH = max(position.y - uWindAnchor, 0.0);
  float scenaSway = pow(clamp(scenaLH / max(uWindHeight, 1e-3), 0.0, 1.0), uWindStiff);
  if (uWindStrength > 0.0 && scenaSway > 0.0) {
    float scenaPhase = dot(scenaBase.xz, uWindDir) * uWindWaveK - uWindTime * uWindWaveSpeed;
    float scenaGust = mix(1.0, 0.5 + 0.5 * sin(scenaPhase), uWindGust);
    float scenaLean = uWindStrength * scenaGust * scenaSway;
    float scenaFlutter = 0.3 * uWindStrength * sin(scenaPhase * 1.7 + scenaBase.x) * scenaSway;
    vec2 scenaPerp = vec2(-uWindDir.y, uWindDir.x);
    vec3 scenaDisp = vec3(
      uWindDir.x * scenaLean + scenaPerp.x * scenaFlutter,
      -0.12 * abs(scenaLean),
      uWindDir.y * scenaLean + scenaPerp.y * scenaFlutter
    );
    mat3 scenaLin = mat3(scenaWM);
    float scenaInv = 1.0 / max(dot(scenaLin[0], scenaLin[0]), 1e-5);
    // transpose(M) * v via column dots → world displacement back into local space.
    transformed += vec3(dot(scenaLin[0], scenaDisp), dot(scenaLin[1], scenaDisp), dot(scenaLin[2], scenaDisp)) * scenaInv;
  }
}
`;

function toDir(direction: number | [number, number], out: Vector2): Vector2 {
  if (Array.isArray(direction)) out.set(direction[0], direction[1]);
  else {
    const r = (direction * Math.PI) / 180;
    out.set(Math.cos(r), Math.sin(r));
  }
  if (out.lengthSq() < 1e-9) out.set(1, 0);
  return out.normalize();
}

function nowSeconds(): number {
  return typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
}

/**
 * A shared wind field for vegetation and cloth — the environmental handshake
 * that makes a world breathe. One field drives many props: trees and grass
 * bend, a wheat field ripples, banners fly, all from the *same* gust, so a
 * breeze crosses the whole scene in step. The bend is a vertex-shader effect
 * (full PBR/shadows/fog survive), the gust travels downwind so nothing sways
 * in lockstep, and the field self-animates from the render loop — no update
 * wiring needed. `sample(x, z)` exposes the same wind on the CPU, so gameplay
 * (drifting agents, bobbing boats, blown particles) can read it too.
 *
 * ```ts
 * const wind = createWindField({ direction: 40, strength: 0.35 });
 * wind.sway(forest.group, { height: 4, anchor: 1.0 });      // canopies bend
 * wind.sway(wheat.group,  { height: 0.9, stiffness: 1.2 }); // blades ripple
 * ```
 */
export function createWindField(options: WindFieldOptions = {}): WindField {
  const direction = toDir(options.direction ?? 35, new Vector2());
  let strength = options.strength ?? 0.3;
  const gust = Math.max(0, Math.min(1, options.gust ?? 0.5));
  const waveLength = options.waveLength ?? 6;
  const waveSpeed = options.waveSpeed ?? 2.2;

  const uniforms = {
    uWindDir: { value: direction },
    uWindStrength: { value: strength },
    uWindGust: { value: gust },
    uWindWaveK: { value: (Math.PI * 2) / Math.max(waveLength, 0.01) },
    uWindWaveSpeed: { value: waveSpeed },
    uWindTime: { value: 0 },
  };

  const patched: Material[] = [];
  let manual = false;

  const field: WindField = {
    uniforms,
    direction,
    get strength() {
      return strength;
    },
    set strength(s: number) {
      strength = s;
      uniforms.uWindStrength.value = s;
    },
    materials: patched,

    setDirection(dir) {
      toDir(dir, direction);
      return field;
    },
    setStrength(s) {
      field.strength = s;
      return field;
    },

    sample(x, z, time) {
      const t = time ?? (manual ? uniforms.uWindTime.value : nowSeconds());
      const phase = (x * direction.x + z * direction.y) * uniforms.uWindWaveK.value - t * waveSpeed;
      const gustShape = 1 - gust + gust * (0.5 + 0.5 * Math.sin(phase));
      const mag = strength * gustShape;
      return new Vector2(direction.x * mag, direction.y * mag);
    },

    bind(material, opts = {}) {
      const data = (material.userData ??= {}) as { __scenaWind?: boolean };
      if (data.__scenaWind) return field;
      data.__scenaWind = true;

      const perMat = {
        uWindHeight: { value: opts.height ?? 1 },
        uWindStiff: { value: opts.stiffness ?? 1.6 },
        uWindAnchor: { value: opts.anchor ?? 0 },
      };
      const prevCompile = material.onBeforeCompile;
      // Capture the base cache key BEFORE overriding, so surface+wind stays a
      // distinct program from plain+wind and from surface alone.
      const baseKey = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
      material.onBeforeCompile = function (shader: PatchableShader, renderer: unknown) {
        if (prevCompile) (prevCompile as (s: PatchableShader, r: unknown) => void).call(this, shader, renderer);
        Object.assign(shader.uniforms, uniforms, perMat);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n' + WIND_UNIFORMS)
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_BEGIN);
      };
      material.customProgramCacheKey = () => baseKey + '|scena-wind-v1';
      material.needsUpdate = true;
      patched.push(material);
      return field;
    },

    attach(object) {
      let mesh: Mesh | null = object instanceof Mesh ? object : null;
      if (!mesh) {
        object.traverse((o) => {
          if (!mesh && o instanceof Mesh) mesh = o;
        });
      }
      if (mesh) {
        const target = mesh as Mesh;
        const prev = target.onBeforeRender;
        target.onBeforeRender = function (this: Mesh, ...args: unknown[]) {
          if (prev) (prev as (...a: unknown[]) => void).apply(this, args);
          if (!manual) uniforms.uWindTime.value = nowSeconds();
        } as Mesh['onBeforeRender'];
      }
      return field;
    },

    sway(target, opts) {
      const seen = new Set<Material>();
      target.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m && !seen.has(m)) {
            seen.add(m);
            field.bind(m, opts);
          }
        }
      });
      field.attach(target);
      return field;
    },

    update(dt) {
      manual = true;
      uniforms.uWindTime.value += dt;
    },
  };

  return field;
}

// --- Backwards-compatible convenience -----------------------------------

export interface WindOptions extends WindFieldOptions, SwayOptions {
  /** @deprecated use `anchor`. Local height where sway begins. */
  anchorHeight?: number;
  /** Bind against an existing field instead of making a new one. */
  field?: WindField;
}

export type Wind = WindField;

/**
 * Make everything under `target` sway in the wind — the one-call path. Builds
 * (or reuses) a {@link WindField}, binds every material and self-animates.
 * Returns the field, so you can `sample()` it, re-aim it, or share it with more
 * props. Kept `update()`-compatible for deterministic loops.
 *
 * ```ts
 * const wind = applyWind(forest.group, { strength: 0.3, height: 4, anchor: 1 });
 * // optional: game.onUpdate((t) => wind.update(t.delta));
 * ```
 */
export function applyWind(target: Object3D, options: WindOptions = {}): Wind {
  const field = options.field ?? createWindField(options);
  field.sway(target, {
    height: options.height ?? 2.5,
    stiffness: options.stiffness,
    anchor: options.anchor ?? options.anchorHeight ?? 0,
  });
  return field;
}
