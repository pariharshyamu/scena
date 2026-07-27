import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  Points,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { Rng } from '../core/random';
import type { WindField } from './wind';

export type PrecipitationType = 'rain' | 'snow' | 'petal';

export interface PrecipitationOptions {
  /** rain (slanted streaks), snow (drifting flakes) or petal (fluttering, spinning blossom/leaf fall). Default 'rain'. */
  type?: PrecipitationType;
  /** Particle count. Default 6000 (rain) / 3500 (snow) / 1400 (petal). */
  count?: number;
  /** Box size around the camera the weather fills, in metres. Default [55, 34, 55]. */
  area?: number | [number, number, number];
  /** How heavy, 0–1. Default 1. */
  intensity?: number;
  /** A WindField — rain slants and snow/petals drift along it. */
  wind?: WindField;
  /** How strongly the wind pushes the fall (metres/s per unit strength). Default 9 (rain) / 4 (snow) / 5 (petal). */
  windInfluence?: number;
  /** Fall speed, metres/s. Default 14 (rain) / 2.2 (snow) / 1.4 (petal). */
  speed?: number;
  /** Streak length (rain) or particle size in px (snow/petal). Default 0.5 / 9 / 11. */
  size?: number;
  /** Particle colour. Default light blue-grey (rain) / white (snow) / blossom pink (petal). */
  color?: number;
  /** Particle opacity. Default 0.5 (rain) / 0.85 (snow) / 0.9 (petal). */
  opacity?: number;
  seed?: number;
}

type SurfaceUniforms = {
  uSurfCap: { value: number };
  uSurfCapColor: { value: Color };
  uSurfCapUp: { value: number };
  uSurfCapSharp: { value: number };
  uSurfCapRough: { value: number };
  uSurfWet: { value: number };
  uSurfWetCling: { value: number };
};

interface Accumulation {
  entries: Array<{ material: Material; configured: boolean }>;
  color: Color;
  capUp: number;
  max: number;
  rate: number;
}

interface Soaking {
  entries: Array<{ material: Material; configured: boolean }>;
  cling: number;
  max: number;
  rate: number;
  dry: number;
}

export interface Precipitation {
  /** The renderable — add it to the scene. Follows the camera; never culled. */
  object: Points | LineSegments;
  /** The particle material. */
  material: ShaderMaterial;
  /** Set how heavy it falls, 0–1 (0 stops it). */
  setIntensity(value: number): void;
  /** Snow only: settle a white cap onto the surfaces under `target` as it falls. */
  accumulate(target: Object3D, options?: SoakOptions & AccumulateOptions): Precipitation;
  /** Rain only: wet the surfaces under `target` as it falls, and dry them after. */
  soak(target: Object3D, options?: SoakOptions): Precipitation;
  /** Advance manually instead of self-driving (for deterministic loops). */
  update(dt: number): void;
}

export interface SoakOptions {
  /** How wet it gets at full intensity, 0–1. Default 0.9. */
  max?: number;
  /** Wetting speed (wetness per second). Default 0.22. */
  rate?: number;
  /**
   * Drying speed once the rain eases (wetness per second). Default 0.045 —
   * a fifth of the wetting rate, because a wall soaks in a minute and takes
   * an hour to dry, and a puddle that vanishes the moment the rain stops
   * reads as a bug rather than as weather.
   */
  dry?: number;
  /** How well water clings to vertical faces, 0–1. Default 0.55. */
  cling?: number;
}

export interface AccumulateOptions {
  /** Snow colour. Default 0xf4f8fc. */
  color?: number;
  /** How deep it settles, 0–1 (the cap strength). Default 0.85. */
  max?: number;
  /** Settle speed (cap per second). Default 0.08. */
  rate?: number;
  /** How up-facing a face must be to collect snow. Default 0.25. */
  capUp?: number;
}

const RAIN_VERT = /* glsl */ `
uniform float uTime;
uniform vec3  uArea;
uniform vec2  uWind;
uniform float uFall;
uniform float uStreak;
uniform float uIntensity;
attribute float aEnd;
varying float vKeep;
void main() {
  vec3 home = position * uArea;
  vKeep = step(fract(position.x * 91.7 + position.z * 47.3), uIntensity);
  vec3 vel = vec3(uWind.x, -uFall, uWind.y);
  vec3 p = home + vel * uTime;
  vec3 halfA = uArea * 0.5;
  vec3 world = mod(p - (cameraPosition - halfA), uArea) + (cameraPosition - halfA);
  world -= normalize(vel) * (uStreak * aEnd);      // tail trails up the velocity
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  if (vKeep < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const SNOW_VERT = /* glsl */ `
uniform float uTime;
uniform vec3  uArea;
uniform vec2  uWind;
uniform float uFall;
uniform float uSize;
uniform float uIntensity;
varying float vKeep;
void main() {
  vec3 home = position * uArea;
  vKeep = step(fract(position.x * 91.7 + position.z * 47.3), uIntensity);
  vec3 p = home;
  p.y -= uFall * uTime;
  p.x += uWind.x * uTime + sin(uTime * 1.3 + home.y * 3.1) * 0.6;   // lateral wobble
  p.z += uWind.y * uTime + cos(uTime * 1.1 + home.x * 3.7) * 0.6;
  vec3 halfA = uArea * 0.5;
  vec3 world = mod(p - (cameraPosition - halfA), uArea) + (cameraPosition - halfA);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  // Clamp so flakes near the camera don't balloon into a white veil.
  gl_PointSize = vKeep * min(uSize * (320.0 / max(-mv.z, 1.0)), 16.0);
  if (vKeep < 0.5) gl_Position = vec4(2.0);
}
`;

const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vKeep;
void main() {
  if (vKeep < 0.5) discard;
  gl_FragColor = vec4(uColor, uOpacity);
}
`;

const SNOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vKeep;
void main() {
  if (vKeep < 0.5) discard;
  vec2 c = gl_PointCoord - 0.5;
  float d = 1.0 - smoothstep(0.15, 0.5, length(c));   // soft round flake
  if (d <= 0.0) discard;
  gl_FragColor = vec4(uColor, uOpacity * d);
}
`;

// Petals/leaves: drift like snow but flutter wide and spin as they fall.
const PETAL_VERT = /* glsl */ `
uniform float uTime;
uniform vec3  uArea;
uniform vec2  uWind;
uniform float uFall;
uniform float uSize;
uniform float uIntensity;
varying float vKeep;
varying float vSpin;
void main() {
  vec3 home = position * uArea;
  vKeep = step(fract(position.x * 91.7 + position.z * 47.3), uIntensity);
  float seed = fract(position.y * 57.3 + position.x * 13.1) * 6.2831;
  vec3 p = home;
  p.y -= uFall * uTime;
  // Wide, lazy flutter — petals swing far more than a snowflake wobbles.
  p.x += uWind.x * uTime + sin(uTime * 1.6 + home.y * 3.1 + seed) * 1.4;
  p.z += uWind.y * uTime + cos(uTime * 1.3 + home.x * 3.7 + seed) * 1.4;
  vec3 halfA = uArea * 0.5;
  vec3 world = mod(p - (cameraPosition - halfA), uArea) + (cameraPosition - halfA);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vKeep * min(uSize * (320.0 / max(-mv.z, 1.0)), 18.0);
  vSpin = uTime * 2.0 + seed;
  if (vKeep < 0.5) gl_Position = vec4(2.0);
}
`;

const PETAL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vKeep;
varying float vSpin;
void main() {
  if (vKeep < 0.5) discard;
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vSpin), sn = sin(vSpin);
  c = mat2(cs, -sn, sn, cs) * c;   // spin the petal
  c.x *= 1.7;                       // squash to an oval petal
  float a = (1.0 - smoothstep(0.28, 0.5, length(c))) * uOpacity;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

function toArea(a: number | [number, number, number] | undefined, fallback: Vector3): Vector3 {
  if (a === undefined) return fallback;
  if (typeof a === 'number') return new Vector3(a, a, a);
  return new Vector3(a[0], a[1], a[2]);
}

function nowSeconds(): number {
  return typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
}

/**
 * GPU-driven rain or snow that follows the camera — a finite cloud of particles
 * wrapped into an infinite fall. Every particle's position is computed in the
 * vertex shader from a fixed seed plus the clock, so there is **no per-particle
 * CPU work**: thousands of drops cost one draw call and one uniform update. Rain
 * falls as slanted streaks, snow as soft drifting flakes, both leaning along a
 * {@link WindField} if you pass one. It self-animates from the render loop.
 *
 * Snow can `accumulate` — settling a white cap onto the surfaces below, reusing
 * the surface system's up-facing cap, so roofs and ground whiten as it falls.
 *
 * ```ts
 * const snow = createPrecipitation({ type: 'snow', wind });
 * scene.add(snow.object);
 * snow.accumulate(scene);            // roofs & ground gather snow
 * ```
 */
export function createPrecipitation(options: PrecipitationOptions = {}): Precipitation {
  const type = options.type ?? 'rain';
  const isRain = type === 'rain';
  const isPetal = type === 'petal';
  const count = options.count ?? (isRain ? 6000 : isPetal ? 1400 : 3500);
  const area = toArea(options.area, new Vector3(55, 34, 55));
  const speed = options.speed ?? (isRain ? 14 : isPetal ? 1.4 : 2.2);
  const size = options.size ?? (isRain ? 0.5 : isPetal ? 11 : 9);
  const windInfluence = options.windInfluence ?? (isRain ? 9 : isPetal ? 5 : 4);
  const rng = new Rng(options.seed ?? 1);
  const wind = options.wind;

  // Geometry: `position` holds each particle's home (0..1). Rain doubles up
  // (head + tail) into line segments; snow is one point per flake.
  const geometry = new BufferGeometry();
  const verts = isRain ? count * 2 : count;
  const pos = new Float32Array(verts * 3);
  const ends = isRain ? new Float32Array(verts) : null;
  for (let i = 0; i < count; i++) {
    const hx = rng.next();
    const hy = rng.next();
    const hz = rng.next();
    if (isRain) {
      for (let e = 0; e < 2; e++) {
        const v = i * 2 + e;
        pos[v * 3] = hx;
        pos[v * 3 + 1] = hy;
        pos[v * 3 + 2] = hz;
        ends![v] = e;
      }
    } else {
      pos[i * 3] = hx;
      pos[i * 3 + 1] = hy;
      pos[i * 3 + 2] = hz;
    }
  }
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  if (ends) geometry.setAttribute('aEnd', new BufferAttribute(ends, 1));
  // Follows the camera, so its real bounds are unknowable — never cull it.
  geometry.boundingSphere = new Sphere(new Vector3(), 1e6);

  const material = new ShaderMaterial({
    vertexShader: isRain ? RAIN_VERT : isPetal ? PETAL_VERT : SNOW_VERT,
    fragmentShader: isRain ? RAIN_FRAG : isPetal ? PETAL_FRAG : SNOW_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uArea: { value: area },
      uWind: { value: new Vector2(0, 0) },
      uFall: { value: speed },
      uIntensity: { value: options.intensity ?? 1 },
      uColor: { value: new Color(options.color ?? (isRain ? 0xafc4d8 : isPetal ? 0xf3c1d6 : 0xf4f8fc)) },
      uOpacity: { value: options.opacity ?? (isRain ? 0.5 : isPetal ? 0.9 : 0.85) },
      ...(isRain ? { uStreak: { value: size } } : { uSize: { value: size } }),
    },
  });

  const object = isRain ? new LineSegments(geometry, material) : new Points(geometry, material);
  object.frustumCulled = false;
  object.name = `precipitation-${type}`;

  let accum: Accumulation | null = null;
  let soaking: Soaking | null = null;
  let manual = false;
  let last = nowSeconds();

  const advance = (dt: number): void => {
    if (wind) {
      const dir = wind.uniforms.uWindDir.value as Vector2;
      const s = (wind.uniforms.uWindStrength.value as number) * windInfluence;
      (material.uniforms.uWind.value as Vector2).set(dir.x * s, dir.y * s);
    }
    if (accum) {
      const target = accum.max * (material.uniforms.uIntensity.value as number);
      for (const e of accum.entries) {
        const data = e.material.userData as {
          scenaSurface?: SurfaceUniforms;
          scenaShader?: { uniforms: SurfaceUniforms };
        };
        // The compiled shader's uniforms are what three actually uploads; the
        // pre-compile copy is the fallback before first render. Write both so
        // they stay in step.
        const live = data.scenaShader?.uniforms;
        const base = data.scenaSurface;
        const next = Math.min(target, (base?.uSurfCap.value ?? 0) + accum.rate * dt);
        for (const u of [base, live]) {
          if (!u) continue;
          if (!e.configured) {
            u.uSurfCapColor.value.copy(accum.color);
            u.uSurfCapUp.value = accum.capUp;
            u.uSurfCapSharp.value = 0.3;
            u.uSurfCapRough.value = 0.9;
          }
          u.uSurfCap.value = next;
        }
        if (live) e.configured = true;
      }
    }
    if (soaking) {
      // Wetting is driven by how hard it is raining; DRYING happens whenever
      // the surface is wetter than the weather justifies, at its own much
      // slower rate. That asymmetry is the whole effect: the street goes
      // dark in a minute and takes a long time to come back.
      const target = soaking.max * (material.uniforms.uIntensity.value as number);
      for (const e of soaking.entries) {
        const data = e.material.userData as {
          scenaSurface?: SurfaceUniforms;
          scenaShader?: { uniforms: SurfaceUniforms };
        };
        const live = data.scenaShader?.uniforms;
        const base = data.scenaSurface;
        const now = base?.uSurfWet.value ?? 0;
        const next =
          now < target
            ? Math.min(target, now + soaking.rate * dt)
            : Math.max(target, now - soaking.dry * dt);
        for (const u of [base, live]) {
          if (!u) continue;
          if (!e.configured) u.uSurfWetCling.value = soaking.cling;
          u.uSurfWet.value = next;
        }
        if (live) e.configured = true;
      }
    }
  };

  object.onBeforeRender = () => {
    const t = nowSeconds();
    const dt = Math.min(0.1, Math.max(0, t - last));
    last = t;
    if (!manual) {
      material.uniforms.uTime.value = t % 1000;
      advance(dt);
    }
  };

  const precip: Precipitation = {
    object,
    material,
    setIntensity(value) {
      material.uniforms.uIntensity.value = Math.max(0, Math.min(1, value));
    },
    soak(target, opts = {}) {
      if (!isRain) return precip; // only rain wets things
      const entries: Soaking['entries'] = [];
      target.traverse((o) => {
        const mats = ((o as { material?: Material | Material[] }).material ?? []) as Material | Material[];
        for (const m of Array.isArray(mats) ? mats : [mats]) {
          const u = (m.userData as { scenaSurface?: SurfaceUniforms } | undefined)?.scenaSurface;
          if (u && u.uSurfWet) entries.push({ material: m, configured: false });
        }
      });
      soaking = {
        entries,
        cling: opts.cling ?? 0.55,
        max: opts.max ?? 0.9,
        rate: opts.rate ?? 0.22,
        dry: opts.dry ?? 0.045,
      };
      return precip;
    },
    accumulate(target, opts = {}) {
      if (type !== 'snow') return precip; // only snow settles
      const entries: Accumulation['entries'] = [];
      target.traverse((o) => {
        const mats = ((o as { material?: Material | Material[] }).material ?? []) as Material | Material[];
        for (const m of Array.isArray(mats) ? mats : [mats]) {
          const u = (m.userData as { scenaSurface?: SurfaceUniforms } | undefined)?.scenaSurface;
          // Only settle on plain (un-capped) surfaces, so we never fight an
          // existing snow/moss cap.
          if (u && u.uSurfCap && u.uSurfCap.value === 0) entries.push({ material: m, configured: false });
        }
      });
      accum = {
        entries,
        color: new Color(opts.color ?? 0xf4f8fc),
        capUp: opts.capUp ?? 0.25,
        max: opts.max ?? 0.85,
        rate: opts.rate ?? 0.08,
      };
      return precip;
    },
    update(dt) {
      manual = true;
      material.uniforms.uTime.value += dt;
      advance(dt);
    },
  };

  return precip;
}
