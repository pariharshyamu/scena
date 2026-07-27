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

/**
 * The surf zone — what turns a coloured plane into a coast.
 *
 * Two effects, on one clock so they agree: **breakers** (bands of
 * whitewater that form where the swell trips on the bottom and run
 * shoreward) and the **swash** (the waterline itself running up the beach
 * and draining back, leaving a mirror-thin sheet behind it).
 */
export interface SurfOptions {
  /** Water depth at which the swell trips and whitens, metres. Default 1.7. */
  breakDepth?: number;
  /**
   * How far up the beach the water runs, in metres of DEPTH — the edge's
   * travel is this divided by the beach slope, so 0.42 m on a 1-in-7 face
   * is nearly three metres of moving waterline. Default 0.42.
   */
  runUp?: number;
  /** Seconds per swash cycle, in and back out again. Default 8. */
  period?: number;
  /** Breaker lines per metre of depth — more = tighter surf. Default 2.4. */
  bands?: number;
}

/** Fine surface chop: the detail that makes a sea read as liquid. */
export interface RippleOptions {
  /** Normal perturbation, 0–1. Default 0.34; past ~0.6 it reads as fur. */
  strength?: number;
  /** Ripples per metre. Bigger = finer chop. Default 0.85. */
  scale?: number;
}

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
  /**
   * The surf zone: breakers that run shoreward, and a waterline that runs
   * UP the beach and drains back. Needs a `shore` — without one there is
   * no beach to break on and every term is inert. `false` turns it off.
   */
  surf?: false | SurfOptions;
  /**
   * How deep the water goes before it reads as open sea, metres. This is
   * the width of the TURQUOISE SHELF — on a 1-in-7 beach, a shoal depth of
   * 12 puts eighty metres of bright water between the sand and the blue,
   * which is most of what a tropical coast actually is. Default 3.
   */
  shoalDepth?: number;
  /**
   * Fine chop riding on the swell. Four Gerstner waves give a sea its
   * shape, but a swell alone is a rolling sheet — what reads as WATER is
   * the ripple breaking the light into moving highlights. `false` for
   * glass (a lagoon, a harbour at dawn).
   */
  ripples?: false | RippleOptions;
  /**
   * How see-through the shallows are, 0–1. Clear water IS its bottom: at
   * 0.8 you read the sand, the reef and the fish through the turquoise,
   * and the colour deepens to opaque as the floor drops away. Default 0
   * — an opaque sheet, which is right for a grey sea and cheaper.
   */
  clarity?: number;
  /**
   * A live sea state — `() => seaState.trains`.
   *
   * Structurally `SeaState.trains`, duck-typed like `storm`, so the ocean
   * knows nothing about fetch or wind history. Given one, the four wave
   * components SPLIT: two of them run with the wind sea and two with the
   * swell, on their own headings and their own wavelengths. That is a cross
   * sea, and it is what makes the surface stop looking like one wave train
   * with some noise on it.
   *
   * It overrides `amplitude`, `wavelength`, `direction` and any `wind`.
   */
  sea?: () => {
    windSea: { height: number; period: number; length: number; from: number };
    swell: { height: number; period: number; length: number; from: number };
  };
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
  /**
   * The swash's run-up right now, in metres of extra depth — positive while
   * the water is running up the beach, negative while it drains. Add it to a
   * depth reading and gameplay agrees with what the shader is drawing: a
   * wader gets caught by the wave that visibly arrives.
   */
  readonly runUp: number;
  /**
   * How deep the water is over ground of height `groundY`, right now,
   * including the swash. 0 where the sea has drained away — so a player
   * walking the edge is in and out of the water as the waves come.
   */
  depthOver(groundY: number): number;
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
// World position, so the ripple field lives in the WORLD and not on the
// mesh: ripples pinned to UVs slide about when the plane moves.
vOceanWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
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
  const surf = options.surf;
  const ripples = options.ripples;
  const clarity = Math.max(0, Math.min(1, options.clarity ?? 0));
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
  const curW: number[] = new Array(N).fill(0);
  const curSpd: number[] = new Array(N).fill(0);

  const uniforms = {
    uTime: { value: 0 },
    uWaveDir: { value: uWaveDir },
    uWaveParams: { value: uWaveParams },
    uDeepColor: { value: new Color(options.deepColor ?? 0x184a63) },
    uShallowColor: { value: new Color(options.shallowColor ?? 0x3f8fa6) },
    uSkyColor: { value: new Color(options.skyColor ?? 0xbcd4e6) },
    // How deep the water goes before it reads as open sea. Bigger = a
    // wider turquoise shelf, which is most of what a tropical coast IS.
    uShoalDepth: { value: options.shoalDepth ?? 3.0 },
    uClarity: { value: clarity },
    uFlow: { value: new Vector2(0.06, 0.04) },
    uRipple: { value: ripples === false ? 0 : (ripples?.strength ?? 0.34) },
    uRippleScale: { value: ripples === false ? 1 : (ripples?.scale ?? 0.85) },
    uFoamBand: { value: 0.6 },
    uStorm: { value: 0 },
    uSurge: { value: 0 },
    // The surf zone. Inert without a `shore`: out there the shore depth is
    // 999, so every one of these terms multiplies out to nothing.
    uBreakDepth: { value: surf === false ? 0 : (surf?.breakDepth ?? 1.7) },
    uSwash: { value: surf === false ? 0 : (surf?.runUp ?? 0.42) },
    uSwashPeriod: { value: Math.max(1, (surf === false ? 8 : surf?.period) ?? 8) },
    uSurfBands: { value: surf === false ? 0 : (surf?.bands ?? 2.4) },
  };
  // The current sea level, lifted by the surge — mirrored into heightAt so
  // boats ride the rising water, not just the base level.
  let curLevel = level;

  // Reproject the wave set for the current heading + wind strength + storm.
  const seaSrc = options.sea;

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
    // TWO TRAINS, on their own headings, when a sea state is driving.
    //
    // The shader has always taken a direction PER WAVE; it was only this loop
    // that put all four of them on one heading. Splitting them costs nothing
    // and it is the difference between a sea and a wave.
    const seaNow = seaSrc ? seaSrc() : null;
    for (let i = 0; i < N; i++) {
      let dirRad: number;
      let amp: number;
      let w: number;
      let spd: number;
      if (seaNow) {
        // 0,1 the wind sea; 2,3 the swell. Each pair keeps its own little
        // angular spread so neither train is a single mathematical line.
        const t = i < 2 ? seaNow.windSea : seaNow.swell;
        const sub = i % 2;
        // `from` is where it COMES FROM, the way a sailor says it; a wave
        // travels the other way, and getting this backwards makes every sea
        // in the library run into the wind.
        dirRad = ((t.from + 180) * Math.PI) / 180 + (sub === 0 ? 0 : REL_ANGLE[1] * 0.8);
        // Significant height is the average of the highest third; the
        // amplitude of one component is a good deal less than half of it.
        amp = Math.max(0, t.height) * (sub === 0 ? 0.32 : 0.17) * stormAmp;
        const len = Math.max(2, t.length || 26) * (sub === 0 ? 1 : 0.58);
        w = (Math.PI * 2) / len;
        spd = Math.sqrt(G / w) * w * speedMul;
      } else {
        dirRad = heading + REL_ANGLE[i];
        amp = waves[i].amp * ampScale * stormAmp;
        w = waves[i].w;
        spd = waves[i].speed;
      }
      curDir[i].set(Math.cos(dirRad), Math.sin(dirRad));
      uWaveDir[i].copy(curDir[i]);
      curAmp[i] = amp;
      curW[i] = w;
      curSpd[i] = spd;
      // Steepness kept so Σ Q·w·A ≤ chop ≤ 1 (no self-intersection).
      const q = Math.min(chop / (w * amp * N || 1), 0.98 / (w * amp || 1));
      const p = uniforms.uWaveParams.value[i] as { x: number; y: number; z: number; w: number };
      p.x = w;
      p.y = amp;
      p.z = q;
      p.w = spd;
    }
  };
  retune();

  const material = new MeshStandardMaterial({
    color: 0x2a6b82,
    metalness: 0.0,
    roughness: 0.18,
    // Only pay for blending when somebody asked to see through the water.
    // depthWrite stays ON: this is one surface over opaque ground, and
    // turning it off lets the sea floor draw over the sea.
    transparent: clarity > 0,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${WAVE_UNIFORMS}\nattribute float aOceanShore;\nvarying float vOceanFoam;\nvarying float vOceanShore;\nvarying vec3 vOceanWorld;`
      )
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${OCEAN_BEGINNORMAL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${OCEAN_BEGIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uTime;\nuniform vec3 uDeepColor;\nuniform vec3 uShallowColor;\nuniform vec3 uSkyColor;\nuniform float uShoalDepth;\nuniform float uFoamBand;\nuniform float uStorm;\nuniform float uSurge;\nuniform float uBreakDepth;\nuniform float uSwash;\nuniform float uSwashPeriod;\nuniform float uSurfBands;\nuniform float uClarity;\nuniform vec2 uFlow;\nuniform float uRipple;\nuniform float uRippleScale;\nvarying float vOceanFoam;\nvarying float vOceanShore;\nvarying vec3 vOceanWorld;`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // THE SWASH: the whole waterline runs up the beach and drains back.
        // Adding the run-up to the shore depth moves the edge itself — on a
        // 1-in-7 beach face, 40 cm of water is nearly three metres of travel,
        // which is what makes a coast stop looking like a painted line.
        float swashPhase = uTime * 6.2831853 / uSwashPeriod;
        float runUp = uSwash * sin(swashPhase);
        // The surge lifts the waterline, so a storm floods higher up the beach.
        float shoreD = vOceanShore + uSurge + runUp;
        if (shoreD < -0.06) discard;             // terrain stands above the sea here
        float shoal = clamp(shoreD / uShoalDepth, 0.0, 1.0);
        // Shallow water is bright out of all proportion to its depth, so the
        // turquoise hugs the shore instead of ramping linearly to blue.
        diffuseColor.rgb = mix(uShallowColor, uDeepColor, pow(shoal, 0.72));
        // THE BREAKERS: bands of whitewater that form where the swell trips
        // on the bottom and run SHOREWARD, brightening as they shallow. The
        // phase runs with the swash, so the water arrives after a wave breaks
        // rather than breathing on a clock of its own.
        float surfZone = 1.0 - smoothstep(0.0, max(uBreakDepth, 0.0001), shoreD);
        float bands = sin(shoreD * uSurfBands + swashPhase * 2.0);
        float breakers = smoothstep(0.1, 0.85, bands) * surfZone * surfZone;
        float shoreFoam = (1.0 - smoothstep(0.0, uFoamBand, shoreD)) * step(0.0, shoreD);
        float oceanFoam = clamp(max(vOceanFoam, max(shoreFoam, breakers)), 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.96, 0.97), oceanFoam);
        // CLARITY. Shallow water shows its floor and deep water does not —
        // the transition is the whole reason a reef reads as a reef and not
        // a painted circle. Foam stays opaque: froth is not glass.
        float seeThrough = uClarity * (1.0 - smoothstep(0.0, uShoalDepth * 0.6, shoreD));
        diffuseColor.a = max(1.0 - seeThrough * 0.72, oceanFoam);
        // A storm darkens and greys the water between the whitecaps.
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.18, 0.2), uStorm * 0.45 * (1.0 - oceanFoam));`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // RIPPLES. The four Gerstner waves give the sea its swell, but a
          // swell alone is a rolling sheet — what reads as WATER is the fine
          // chop riding on it, breaking the light into a thousand moving
          // highlights. Three crossing trains at different scales, analytic
          // derivatives, drifting with the swell so the surface flows one
          // way like a real sea instead of shimmering in place.
          vec2 wp = vOceanWorld.xz * uRippleScale;
          vec2 drift = uFlow * uTime;
          float p1 = dot(wp, vec2(0.92, 0.39)) + drift.x * 1.7;
          float p2 = dot(wp, vec2(-0.45, 0.89)) * 1.9 - drift.y * 2.1;
          float p3 = dot(wp, vec2(0.66, -0.75)) * 3.7 + (drift.x + drift.y) * 2.9;
          // dh/dx and dh/dz of the summed trains — the slope IS the normal.
          float dx = 0.92 * cos(p1) + (-0.45 * 1.9) * 0.55 * cos(p2) + (0.66 * 3.7) * 0.22 * cos(p3);
          float dz = 0.39 * cos(p1) + (0.89 * 1.9) * 0.55 * cos(p2) + (-0.75 * 3.7) * 0.22 * cos(p3);
          // Fade with distance or the chop aliases into a shimmering mess,
          // and drop it inside foam, which is froth and has no facets.
          float near = 1.0 - smoothstep(45.0, 260.0, length(vViewPosition));
          float amp = uRipple * near * (1.0 - oceanFoam);
          normal = normalize(normal + vec3(-dx, 0.0, -dz) * amp);
          // The glitter: a rippled surface is never uniformly polished.
          roughnessFactor = clamp(roughnessFactor + (abs(dx) + abs(dz)) * 0.04 * amp, 0.02, 1.0);

          // View-space fresnel: tint toward the sky at grazing angles.
          float fres = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 5.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSkyColor, fres * 0.5 * (1.0 - oceanFoam));
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.85, oceanFoam);
        // The drain sheet: the thinnest water left behind is the most
        // mirror-like surface on a beach, and reading it as glass is what
        // separates a wet coast from a coloured plane.
        float sheet = (1.0 - smoothstep(0.0, 0.35, shoreD)) * step(0.0, shoreD) * (1.0 - oceanFoam);
        roughnessFactor = mix(roughnessFactor, 0.04, sheet);`
      );
  };
  material.customProgramCacheKey = () => 'scena-ocean-v3';

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
      // curW and curSpd, NOT waves[i] — a sea state changes the wavelength as
      // it builds, and reading the construction-time value here floats every
      // boat on a sea nobody can see while the mesh shows another one.
      y += curAmp[i] * Math.sin((curDir[i].x * x + curDir[i].y * z) * curW[i] + t * curSpd[i]);
    }
    return curLevel + y;
  };

  /** The same run-up the shader is drawing this frame — one clock, one truth. */
  const runUpNow = (): number => {
    const r =
      uniforms.uSwash.value *
      Math.sin((uniforms.uTime.value * Math.PI * 2) / uniforms.uSwashPeriod.value);
    // A stilled surf multiplies the sine's sign through and hands back -0,
    // which is true-equal to 0 but not Object.is-equal — normalise it.
    return r === 0 ? 0 : r;
  };

  return {
    mesh,
    level,
    heightAt,
    get runUp() {
      return runUpNow();
    },
    depthOver(groundY: number): number {
      return Math.max(0, curLevel - groundY + runUpNow());
    },
    update(dt) {
      manual = true;
      uniforms.uTime.value += dt;
      retune();
      mesh.position.y = curLevel;
    },
  };
}
