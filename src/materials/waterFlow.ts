import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  Points,
  ShaderMaterial,
} from 'three';
import { Rng } from '../core/random';

/**
 * Moving water — the shared material behind streams, spouts, showers and
 * spray.
 *
 * This is the same extraction `clothWave` was: the fountain has had falling
 * water and a jet since 0.9, and every tap, shower and cascade wants both.
 * Pulling them out here is what stops the bathroom set growing a second
 * water shader.
 *
 * It also fixes what was there. The fountain's "falling water" was a
 * **static** translucent cylinder — at rest it reads as a glass rod, and no
 * amount of tinting fixes that, because the thing that says *water* is not
 * the colour, it is that the surface is **travelling downward and breaking
 * up as it goes**. Real falling water accelerates, so it narrows and
 * stretches, and past a certain distance it stops being a sheet and becomes
 * strands.
 */

export interface FlowOptions {
  /** Fall height in metres — sets how far down the break-up develops. */
  length?: number;
  /** Downward travel, in UV lengths per second. Default 1.6. */
  speed?: number;
  /**
   * How far down the fall it comes apart, 0–1. Default 0.35. Low for a thin
   * tap stream (it breaks up almost at once); high for a thick weir.
   */
  breakUp?: number;
  /** How many strands across the width. Default 7. */
  strands?: number;
  /** Base opacity at full flow. Default 0.55. */
  opacity?: number;
  color?: number | Color;
}

const FLOW_HELPERS = /* glsl */ `
  float flowHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float flowNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(flowHash(i), flowHash(i + vec2(1.0, 0.0)), f.x),
               mix(flowHash(i + vec2(0.0, 1.0)), flowHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

const FLOW_FRAG = /* glsl */ `
  {
    // Cylinder UVs run v = 0 at the bottom, 1 at the top; down below is how
    // far the water has fallen.
    float down = 1.0 - vUv.y;

    // Falling water ACCELERATES, so equal spans of time cover longer spans of
    // distance further down: the pattern has to stretch, not merely scroll.
    // Scrolling at a constant rate is what makes a stream read as a barber's
    // pole.
    float stretched = down * down * 0.6 + down * 0.4;
    float travel = stretched * 6.0 - uFlowTime * uFlowSpeed;

    // Strands: bands around the column, wobbling as they fall.
    float across = vUv.x * uFlowStrands;
    float strand = flowNoise(vec2(across, travel));
    float fine = flowNoise(vec2(across * 2.7, travel * 1.9 + 4.0));
    float texture = strand * 0.65 + fine * 0.35;

    // Break-up grows with distance fallen. Above the threshold it is a
    // sheet; below it, holes open and it becomes separate ropes of water.
    float apart = smoothstep(uFlowBreak, 1.0, down);
    float mask = mix(1.0, smoothstep(0.28, 0.62, texture), apart);

    // The leading edges catch the light — the bright rim is most of what
    // makes water read as wet rather than as coloured glass. It has to be a
    // strong, LOCAL highlight: a uniformly pale tube is a rod, whatever it is
    // tinted, because what the eye reads as water is the variation along the
    // length and not the colour.
    float edge = smoothstep(0.38, 0.78, texture) * (0.4 + apart * 0.6);
    diffuseColor.rgb = mix(uFlowColor * 0.8, vec3(1.25), edge);

    // Fade in at the lip and out at the bottom, where it meets whatever it
    // is falling into. A stream with a hard end looks cut off.
    float ends = smoothstep(0.0, 0.06, down) * (1.0 - smoothstep(0.86, 1.0, down));
    // The body of the water is quite transparent and the lit edges are not —
    // that contrast is what separates a stream from a glass rod.
    float body = mix(0.45, 1.0, edge);
    diffuseColor.a *= uFlowOpacity * uFlowRate * mask * ends * body;
  }
`;

/**
 * A material for water in motion down a surface — a spout's stream, a weir,
 * a shower's column.
 *
 * Drive it with `material.userData.flowUniforms`: `uFlowTime` every frame,
 * `uFlowRate` for how hard it is running (0 turns it off completely, which is
 * what a closed tap should look like).
 */
export function flowingWaterMaterial(options: FlowOptions = {}): MeshStandardMaterial {
  const uniforms = {
    uFlowTime: { value: 0 },
    uFlowRate: { value: 1 },
    uFlowSpeed: { value: options.speed ?? 1.6 },
    uFlowBreak: { value: options.breakUp ?? 0.35 },
    uFlowStrands: { value: options.strands ?? 7 },
    uFlowOpacity: { value: options.opacity ?? 0.55 },
    uFlowColor: { value: new Color(options.color ?? 0x9fd0e0) },
  };

  const material = new MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    // Water is see-through from both sides, and a stream is a thin tube: the
    // far wall is in shot through the near one.
    side: DoubleSide,
    // Never write depth. Two overlapping streams sort wrong for one frame
    // and look solid for the rest of the shot.
    depthWrite: false,
    roughness: 0.12,
    metalness: 0.1,
  });
  material.defines = { ...(material.defines ?? {}), USE_UV: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform float uFlowTime;
         uniform float uFlowRate;
         uniform float uFlowSpeed;
         uniform float uFlowBreak;
         uniform float uFlowStrands;
         uniform float uFlowOpacity;
         uniform vec3 uFlowColor;
         ${FLOW_HELPERS}
         void main() {`
      )
      .replace('#include <map_fragment>', `#include <map_fragment>\n${FLOW_FRAG}`);
  };
  material.customProgramCacheKey = () => 'scenaWaterFlow';
  material.userData.flowUniforms = uniforms;
  return material;
}

// --- droplets ------------------------------------------------------------

export interface DropletOptions {
  /** How many points. Default 24. Each is one billboard, so keep it small. */
  count?: number;
  /** How far out they spread from the origin, in metres. */
  spread?: number;
  /**
   * Ballistic rise before falling, in metres. A fountain jet throws water UP;
   * a shower and a splash do not. Zero gives a pure fall.
   */
  rise?: number;
  /** How far they fall, in metres. Default 0.4. */
  fall?: number;
  /** Point size. Default 0.28. */
  size?: number;
  /**
   * Largest a droplet may get on screen, in pixels. Default 22. Point sprites
   * scale with 1/distance and have no upper bound, so without this a splash
   * viewed from close up becomes a screenful of glowing beach balls.
   */
  maxPixels?: number;
  color?: number | Color;
  seed?: number;
}

export interface Droplets {
  mesh: Points;
  /** Advance the simulation. */
  update(dt: number): void;
  /** How hard it is spraying, 0–1. At 0 nothing is drawn. */
  setRate(rate: number): void;
}

const DROPLET_VERT = /* glsl */ `
attribute float aPhase;
attribute float aSpeed;
attribute float aRad;
attribute float aAng;
uniform float uTime;
uniform float uRise;
uniform float uFall;
uniform float uSpread;
uniform float uSize;
uniform float uMaxPixels;
varying float vLife;
void main() {
  float life = fract(uTime * aSpeed + aPhase);
  vLife = life;
  // Up-then-down when uRise > 0; a straight accelerating fall when it is 0.
  // Gravity is what makes droplets read as droplets: constant-speed points
  // are a snow effect.
  float h = uRise > 0.0
    ? 4.0 * life * (1.0 - life) * uRise
    : -life * life * uFall;
  float rad = aRad * uSpread * (uRise > 0.0 ? life : 0.35 + life * 0.65);
  vec3 p = vec3(cos(aAng) * rad, h, sin(aAng) * rad);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // Point sprites grow without bound as the camera closes in, and a splash
  // seen from 60 cm turns into a screenful of glowing beach balls. Cap it.
  gl_PointSize = min(uSize * (240.0 / -mv.z), uMaxPixels);
  gl_Position = projectionMatrix * mv;
}`;

const DROPLET_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uRate;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  // Fade in at birth, out at death; soft round dot; kept dim so many
  // droplets read as a fine spray rather than a blown-out bloom.
  float fade = max(0.0, 0.5 - abs(vLife - 0.5));
  gl_FragColor = vec4(uColor, (1.0 - d * 2.0) * fade * 0.8 * uRate);
}`;

/**
 * A puff of droplets: a fountain jet, a shower's mist, the splash where a
 * stream lands.
 *
 * The only particles in the whole water set. Everything else here is shader
 * work on geometry that was going to be drawn anyway, so this is the one
 * piece with a real frame cost — keep the counts low.
 */
export function createDroplets(options: DropletOptions = {}): Droplets {
  const rng = new Rng(options.seed ?? 1);
  const count = options.count ?? 24;
  const pos = new Float32Array(count * 3);
  const aPhase = new Float32Array(count);
  const aSpeed = new Float32Array(count);
  const aRad = new Float32Array(count);
  const aAng = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    aPhase[i] = rng.next();
    aSpeed[i] = rng.range(0.35, 0.7);
    aRad[i] = rng.range(0.25, 1);
    aAng[i] = rng.range(0, Math.PI * 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('aPhase', new BufferAttribute(aPhase, 1));
  geometry.setAttribute('aSpeed', new BufferAttribute(aSpeed, 1));
  geometry.setAttribute('aRad', new BufferAttribute(aRad, 1));
  geometry.setAttribute('aAng', new BufferAttribute(aAng, 1));

  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRise: { value: options.rise ?? 0 },
      uFall: { value: options.fall ?? 0.4 },
      uSpread: { value: options.spread ?? 0.12 },
      uSize: { value: options.size ?? 0.28 },
      uMaxPixels: { value: options.maxPixels ?? 22 },
      uRate: { value: 1 },
      uColor: { value: new Color(options.color ?? 0xbfe0ee) },
    },
    vertexShader: DROPLET_VERT,
    fragmentShader: DROPLET_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Points(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    update(dt: number) {
      material.uniforms.uTime.value += dt;
    },
    setRate(rate: number) {
      const r = Math.min(1, Math.max(0, rate));
      material.uniforms.uRate.value = r;
      mesh.visible = r > 0.001;
    },
  };
}
