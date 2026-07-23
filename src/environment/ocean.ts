import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  Vector2,
  Vector4,
} from 'three';
import type { WindField } from './wind';

export interface OceanOptions {
  /** World-space sea level (the plane's Y). Default 0. */
  level?: number;
  /** Plane extent in metres. Default 240. */
  size?: number;
  /** Grid subdivisions per side (more = smoother crests). Default 180. */
  segments?: number;
  /** Overall wave height in metres. Default 0.5. */
  amplitude?: number;
  /** Crest sharpness, 0–1 (0 = rolling swell, 1 = peaked chop). Default 0.75. */
  choppiness?: number;
  /** Wavelength of the primary swell, metres. Default 26. */
  wavelength?: number;
  /** Wave heading in degrees when no wind is given. Default 30. */
  direction?: number;
  /** Phase-speed multiplier. Default 1. */
  speed?: number;
  /** A WindField — the swell turns downwind and grows with the wind. */
  wind?: WindField;
  /** Storm surge, 0–1, or a live source (`() => weather.storminess`): whips up
   *  bigger, choppier, foamier, darker seas and raises the sea level. Default 0. */
  storm?: number | (() => number);
  /** Sea-level rise at full storm, metres (the surge). Default 1.2. */
  surge?: number;
  /** Terrain height sampler (`terrain.heightAt`): the ocean fades out over land and foams at the shore. */
  shore?: (x: number, z: number) => number;
  /** Deep-water colour. Default 0x184a63. */
  deepColor?: number;
  /** Shallow / shoreward colour. Default 0x3f8fa6. */
  shallowColor?: number;
  /** Sky colour reflected at grazing angles (fresnel). Default 0xbcd4e6. */
  skyColor?: number;
}

export interface Ocean {
  /** The ocean surface — add it to the scene. */
  mesh: Mesh;
  /** Sea level (the plane's Y). */
  level: number;
  /** The wave height at a world point (and time) — sit a boat on this to bob it. */
  heightAt(x: number, z: number, time?: number): number;
  /** Advance manually instead of self-driving (for deterministic loops). */
  update(dt: number): void;
}

const N = 4;
const G = 9.8;
// Per-wave layout, relative to the swell heading: angular spread, wavelength
// factor and amplitude falloff. A little detuned so the sum never repeats.
const REL_ANGLE = [0, 0.34, -0.52, 0.82];
const LEN_FACTOR = [1, 0.55, 0.32, 0.19];
const AMP_FACTOR = [1, 0.52, 0.3, 0.17];

interface Wave {
  w: number; // wavenumber
  amp: number; // base amplitude
  speed: number; // temporal phase speed
}

const WAVE_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform float uStorm;
uniform vec2  uWaveDir[${N}];
uniform vec4  uWaveParams[${N}];  // (wavenumber, amplitude, steepness Q, phase speed)
`;

// Gerstner sum: circular vertex motion so crests sharpen and troughs flatten.
// Computed in beginnormal_vertex (before transformed exists) off `position`,
// so the analytic normal is ready for lighting; begin_vertex just applies it.
const OCEAN_BEGINNORMAL = /* glsl */ `
vec3 scenaDisp = vec3(0.0);
float scNx = 0.0, scNy = 0.0, scNz = 0.0, scCrest = 0.0;
for (int i = 0; i < ${N}; i++) {
  vec2 D = uWaveDir[i];
  float w = uWaveParams[i].x, A = uWaveParams[i].y, Q = uWaveParams[i].z, spd = uWaveParams[i].w;
  float ph = dot(D, position.xz) * w + uTime * spd;
  float c = cos(ph), s = sin(ph);
  scenaDisp.x += Q * A * D.x * c;
  scenaDisp.z += Q * A * D.y * c;
  scenaDisp.y += A * s;
  float wa = w * A;
  scNx += D.x * wa * c;
  scNz += D.y * wa * c;
  scNy += Q * wa * s;
  scCrest += Q * wa * s;
}
objectNormal = normalize(vec3(-scNx, 1.0 - scNy, -scNz));
// Whitecaps where the sum folds — a storm broadens them across the crests.
vOceanFoam = smoothstep(mix(0.5, 0.18, uStorm), 1.0, scCrest);
`;

const OCEAN_BEGIN = /* glsl */ `
transformed += scenaDisp;
vOceanShore = aOceanShore;
`;

function nowSeconds(): number {
  return typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
}

/**
 * A Gerstner-wave ocean — the sea that makes a coast feel like a coast. The
 * surface is a subdivided plane displaced by a sum of Gerstner waves in the
 * vertex shader, so crests peak and troughs flatten like real swell, with
 * analytic normals for the light and **whitecap foam** where the waves fold.
 * It patches a `MeshStandardMaterial`, so PBR lighting, shadows and fog all
 * survive, and a fresnel term tints the surface with the sky at grazing angles.
 *
 * Pass a {@link WindField} and the swell turns downwind and grows with the wind.
 * Pass a terrain `heightAt` as `shore` and the ocean **fades out over land and
 * foams along the waterline** — the same handshake the rest of SCENA uses.
 *
 * `heightAt(x, z)` gives the wave height on the CPU, so a boat or buoy can ride
 * the swell — the buoyancy handshake, mirroring `terrain.heightAt`.
 *
 * ```ts
 * const ocean = createOcean({ level: 0, wind, shore: terrain.heightAt });
 * scene.add(ocean.mesh);
 * boat.position.y = ocean.heightAt(boat.position.x, boat.position.z);
 * ```
 */
export function createOcean(options: OceanOptions = {}): Ocean {
  const level = options.level ?? 0;
  const size = options.size ?? 240;
  const segments = options.segments ?? 180;
  const amplitude = options.amplitude ?? 0.5;
  const choppiness = Math.max(0, Math.min(1, options.choppiness ?? 0.75));
  const baseLen = options.wavelength ?? 26;
  const speedMul = options.speed ?? 1;
  const wind = options.wind;
  const shore = options.shore;
  const surge = options.surge ?? 1.2;
  const stormSrc =
    typeof options.storm === 'function'
      ? options.storm
      : options.storm !== undefined
        ? () => options.storm as number
        : null;

  // --- geometry: an XZ grid at the origin (local space = world), with a
  // per-vertex shore depth (level − terrain height) baked from the handshake.
  const geometry = new BufferGeometry();
  const cols = segments + 1;
  const pos = new Float32Array(cols * cols * 3);
  const nrm = new Float32Array(cols * cols * 3);
  const uv = new Float32Array(cols * cols * 2);
  const shoreAttr = new Float32Array(cols * cols);
  for (let iz = 0; iz < cols; iz++) {
    for (let ix = 0; ix < cols; ix++) {
      const k = iz * cols + ix;
      const x = (ix / segments - 0.5) * size;
      const z = (iz / segments - 0.5) * size;
      pos[k * 3] = x;
      pos[k * 3 + 1] = 0;
      pos[k * 3 + 2] = z;
      nrm[k * 3 + 1] = 1;
      uv[k * 2] = ix / segments;
      uv[k * 2 + 1] = iz / segments;
      shoreAttr[k] = shore ? level - shore(x, z) : 999;
    }
  }
  const index: number[] = [];
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setAttribute('aOceanShore', new BufferAttribute(shoreAttr, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();

  // --- waves: derived from the swell, detuned per component.
  const waves: Wave[] = [];
  for (let i = 0; i < N; i++) {
    const w = (Math.PI * 2) / (baseLen * LEN_FACTOR[i]);
    waves.push({ w, amp: amplitude * AMP_FACTOR[i], speed: Math.sqrt(G * w) * speedMul });
  }

  const uWaveDir = Array.from({ length: N }, () => new Vector2(1, 0));
  const uWaveParams = Array.from({ length: N }, () => new Vector4(0, 0, 0, 0));
  // Current absolute per-wave state, mirrored for the CPU heightAt().
  const curDir = Array.from({ length: N }, () => new Vector2(1, 0));
  const curAmp = new Float32Array(N);

  const uniforms = {
    uTime: { value: 0 },
    uWaveDir: { value: uWaveDir },
    uWaveParams: { value: uWaveParams },
    uDeepColor: { value: new Color(options.deepColor ?? 0x184a63) },
    uShallowColor: { value: new Color(options.shallowColor ?? 0x3f8fa6) },
    uSkyColor: { value: new Color(options.skyColor ?? 0xbcd4e6) },
    uShoalDepth: { value: 3.0 },
    uFoamBand: { value: 0.6 },
    uStorm: { value: 0 },
    uSurge: { value: 0 },
  };
  // The current sea level, lifted by the surge — mirrored into heightAt so
  // boats ride the rising water, not just the base level.
  let curLevel = level;

  // Reproject the wave set for the current heading + wind strength + storm.
  const retune = (): void => {
    let heading = ((options.direction ?? 30) * Math.PI) / 180;
    let ampScale = 1;
    if (wind) {
      const d = wind.uniforms.uWindDir.value as Vector2;
      heading = Math.atan2(d.y, d.x);
      ampScale = Math.max(0.55, Math.min(1.7, 0.55 + (wind.uniforms.uWindStrength.value as number) * 2.4));
    }
    // Storm surge: taller, steeper seas and a raised waterline.
    const sm = stormSrc ? Math.max(0, Math.min(1, stormSrc())) : 0;
    const stormAmp = 1 + sm * 2.2; // up to ~3.2× at full storm
    const chop = Math.min(1, choppiness + sm * (1 - choppiness));
    uniforms.uStorm.value = sm;
    uniforms.uSurge.value = surge * sm;
    curLevel = level + surge * sm;
    for (let i = 0; i < N; i++) {
      const a = heading + REL_ANGLE[i];
      curDir[i].set(Math.cos(a), Math.sin(a));
      uWaveDir[i].copy(curDir[i]);
      const amp = waves[i].amp * ampScale * stormAmp;
      curAmp[i] = amp;
      // Steepness kept so Σ Q·w·A ≤ chop ≤ 1 (no self-intersection).
      const q = Math.min(chop / (waves[i].w * amp * N || 1), 0.98 / (waves[i].w * amp || 1));
      const p = uniforms.uWaveParams.value[i] as { x: number; y: number; z: number; w: number };
      p.x = waves[i].w;
      p.y = amp;
      p.z = q;
      p.w = waves[i].speed;
    }
  };
  retune();

  const material = new MeshStandardMaterial({
    color: 0x2a6b82,
    metalness: 0.0,
    roughness: 0.18,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${WAVE_UNIFORMS}\nattribute float aOceanShore;\nvarying float vOceanFoam;\nvarying float vOceanShore;`
      )
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${OCEAN_BEGINNORMAL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${OCEAN_BEGIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform vec3 uDeepColor;\nuniform vec3 uShallowColor;\nuniform vec3 uSkyColor;\nuniform float uShoalDepth;\nuniform float uFoamBand;\nuniform float uStorm;\nuniform float uSurge;\nvarying float vOceanFoam;\nvarying float vOceanShore;`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // The surge lifts the waterline, so a storm floods higher up the beach.
        float shoreD = vOceanShore + uSurge;
        if (shoreD < -0.06) discard;             // terrain stands above the sea here
        float shoal = clamp(shoreD / uShoalDepth, 0.0, 1.0);
        diffuseColor.rgb = mix(uShallowColor, uDeepColor, shoal);
        float shoreFoam = (1.0 - smoothstep(0.0, uFoamBand, shoreD)) * step(0.0, shoreD);
        float oceanFoam = clamp(max(vOceanFoam, shoreFoam), 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.96, 0.97), oceanFoam);
        // A storm darkens and greys the water between the whitecaps.
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.18, 0.2), uStorm * 0.45 * (1.0 - oceanFoam));`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // View-space fresnel: tint toward the sky at grazing angles.
          float fres = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 5.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSkyColor, fres * 0.5 * (1.0 - oceanFoam));
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, oceanFoam);`
      );
  };
  material.customProgramCacheKey = () => 'scena-ocean-v1';

  const mesh = new Mesh(geometry, material);
  mesh.name = 'ocean';
  mesh.position.y = level;
  mesh.frustumCulled = false;

  let manual = false;
  mesh.onBeforeRender = () => {
    if (!manual) {
      uniforms.uTime.value = nowSeconds();
      retune();
      mesh.position.y = curLevel; // ride the surge up
    }
  };

  const heightAt = (x: number, z: number, time?: number): number => {
    const t = time ?? uniforms.uTime.value;
    let y = 0;
    for (let i = 0; i < N; i++) {
      y += curAmp[i] * Math.sin((curDir[i].x * x + curDir[i].y * z) * waves[i].w + t * waves[i].speed);
    }
    return curLevel + y;
  };

  return {
    mesh,
    level,
    heightAt,
    update(dt) {
      manual = true;
      uniforms.uTime.value += dt;
      retune();
      mesh.position.y = curLevel;
    },
  };
}
