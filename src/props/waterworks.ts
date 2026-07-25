import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createDroplets, flowingWaterMaterial, type Droplets } from '../materials/waterFlow';
import type { Prop } from '../core/types';

/**
 * Waterworks — water that is doing something.
 *
 * The porcelain in a bathroom is trivial: a basin is a lathe and a tub is a
 * box with a hole in it. What makes any of it read is **water behaving** —
 * a stream that falls and breaks up, a shower's cone, a level that rises in
 * a bowl while it fills and settles when it stops. Without these, the whole
 * bathroom set is dry ceramic, which is exactly what it has been.
 *
 * Everything here takes a **flow or a level from outside**, so a tap
 * (`createValve` is already a `Manipulable` with an eased `state`) or GAMA's
 * `Automation` can drive it with no library importing another:
 *
 * ```ts
 * const stream = createStream({ height: 0.3 });
 * const basin = createFill({ radius: 0.18, depth: 0.1 });
 * game.onUpdate((t) => {
 *   stream.setFlow(tap.state);
 *   basin.fillBy(tap.state * t.delta * 0.4);
 *   stream.update(t.delta);
 *   basin.update(t.delta);
 * });
 * ```
 */

export interface StreamOptions {
  /** Fall height in metres. Default 0.25. */
  height?: number;
  /** Radius at the lip. Default 0.012 — a tap, not a waterfall. */
  radius?: number;
  /** Flow to start at, 0–1. Default 1. */
  flow?: number;
  /** Add a splash where it lands. Default true. */
  splash?: boolean;
  color?: number;
  seed?: number;
  palette?: Palette;
}

export interface Stream extends Prop {
  /** How hard it is running, 0–1. At 0 nothing is drawn at all. */
  setFlow(flow: number): void;
  readonly flow: number;
  update(dt: number): void;
  height: number;
}

/**
 * A falling column of water: a tap, a spout, a weir.
 *
 * The origin is at the **lip**, with the water falling to `-height`, because
 * a stream is positioned by where it comes out.
 *
 * The column **narrows as it falls**, which is not decoration: falling water
 * accelerates, and the same volume per second through a faster-moving column
 * means a thinner one. Straight-sided falling water looks like a pipe.
 */
export function createStream(options: StreamOptions = {}): Stream {
  const height = options.height ?? 0.25;
  const radius = options.radius ?? 0.012;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;

  const group = new Group();
  group.name = 'stream';
  const material = flowingWaterMaterial({
    length: height,
    color: options.color ?? new Color(palette.water).lerp(new Color(0xffffff), 0.55).getHex(),
    // A thin stream comes apart almost at once; a thick one holds together.
    // Note the direction: `breakUp` is HOW FAR DOWN the break-up starts, so a
    // thin stream wants a LOW value. The first version had this inverted and
    // gave tap water that held as a sheet all the way to the basin while a
    // weir shattered at the lip.
    breakUp: Math.min(0.7, 0.08 + radius * 14),
    strands: Math.max(3, Math.round(radius * 260)),
    speed: 1.4 + height,
  });
  const column = new Mesh(
    new CylinderGeometry(radius, radius * 0.62, height, 8, 1, true),
    material
  );
  column.name = 'column';
  column.position.y = -height / 2;
  group.add(column);

  let splash: Droplets | null = null;
  if (options.splash ?? true) {
    splash = createDroplets({
      count: 12,
      spread: radius * 6,
      rise: radius * 4,
      fall: radius * 5,
      // Scaled to the stream: a splash from a 5 mm tap and one from a weir
      // are not the same size, and a constant reads as fairy lights on one
      // and as nothing on the other.
      size: Math.max(0.03, radius * 4),
      maxPixels: 14,
      seed: seed + 3,
    });
    splash.mesh.position.y = -height;
    group.add(splash.mesh);
  }

  const uniforms = material.userData.flowUniforms as {
    uFlowTime: { value: number };
    uFlowRate: { value: number };
  };
  let flow = options.flow ?? 1;
  const apply = (): void => {
    uniforms.uFlowRate.value = flow;
    // A closed tap must draw NOTHING. Leaving a fully transparent column in
    // the scene still costs a transparent draw and still sorts against
    // everything behind it.
    column.visible = flow > 0.001;
    splash?.setRate(flow);
  };
  apply();

  return {
    object: group,
    obstacleRadius: 0,
    height,
    get flow() {
      return flow;
    },
    setFlow(next: number) {
      flow = Math.min(1, Math.max(0, next));
      apply();
    },
    update(dt: number) {
      uniforms.uFlowTime.value += dt;
      splash?.update(dt);
    },
  };
}

export interface SprayOptions {
  /** How far the spray reaches down, in metres. Default 1.6. */
  height?: number;
  /** Radius of the head. Default 0.06. */
  radius?: number;
  /** Radius the cone has opened to at the bottom. Default 0.26. */
  spread?: number;
  flow?: number;
  color?: number;
  seed?: number;
  palette?: Palette;
}

export interface Spray extends Prop {
  setFlow(flow: number): void;
  readonly flow: number;
  update(dt: number): void;
  height: number;
}

/**
 * A shower's cone of water.
 *
 * A stream and a spray are the same material on different geometry — one is
 * a narrowing tube, the other a widening cone that comes apart far sooner,
 * because a shower head is *designed* to break the water up. Getting that
 * backwards gives a shower that looks like a poured bucket.
 */
export function createSpray(options: SprayOptions = {}): Spray {
  const height = options.height ?? 1.6;
  const radius = options.radius ?? 0.06;
  const spread = options.spread ?? 0.26;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;

  const group = new Group();
  group.name = 'spray';
  const material = flowingWaterMaterial({
    length: height,
    color: options.color ?? new Color(palette.water).lerp(new Color(0xffffff), 0.7).getHex(),
    // Breaks up almost immediately: that is what a shower head is FOR.
    breakUp: 0.06,
    strands: 22,
    speed: 2.6,
    opacity: 0.3,
  });
  const cone = new Mesh(new CylinderGeometry(radius, spread, height, 14, 1, true), material);
  cone.name = 'cone';
  cone.position.y = -height / 2;
  group.add(cone);

  // Mist near the floor, where the spray has broken down entirely.
  const mist = createDroplets({
    count: 26,
    spread: spread * 1.15,
    rise: 0,
    fall: 0.22,
    size: 0.5,
    maxPixels: 46,
    color: 0xdff0f6,
    seed: seed + 7,
  });
  mist.mesh.position.y = -height + 0.18;
  group.add(mist.mesh);

  const uniforms = material.userData.flowUniforms as {
    uFlowTime: { value: number };
    uFlowRate: { value: number };
  };
  let flow = options.flow ?? 1;
  const apply = (): void => {
    uniforms.uFlowRate.value = flow;
    cone.visible = flow > 0.001;
    mist.setRate(flow * 0.8);
  };
  apply();

  return {
    object: group,
    obstacleRadius: 0,
    height,
    get flow() {
      return flow;
    },
    setFlow(next: number) {
      flow = Math.min(1, Math.max(0, next));
      apply();
    },
    update(dt: number) {
      uniforms.uFlowTime.value += dt;
      mist.update(dt);
    },
  };
}

export interface FillOptions {
  /** Round surface of this radius. Give this OR width/depth. */
  radius?: number;
  /** Rectangular surface. */
  width?: number;
  length?: number;
  /** How deep the container is: level 1 sits this far above the origin. */
  depth?: number;
  /** Starting level, 0–1. Default 0. */
  level?: number;
  color?: number;
  seed?: number;
  palette?: Palette;
}

export interface Fill extends Prop {
  /** Where the surface sits, 0 (empty) to 1 (brim). */
  readonly level: number;
  /** Set the level directly. */
  setLevel(level: number): void;
  /** Add (or, negative, drain) this much level. Disturbs the surface. */
  fillBy(amount: number): void;
  /** Splash it — a hand going in, something dropped. */
  disturb(amount?: number): void;
  update(dt: number): void;
}


/**
 * The water inside a container — a basin, a tub, a bucket, a pool.
 *
 * The level is the whole prop. But the detail that actually sells it is that
 * **the surface is agitated while it is filling and settles when it stops**:
 * a still disc of blue is a disc of blue, and a rippling one that goes calm
 * a few seconds after the tap closes is water. `fillBy` and `disturb` both
 * stir it; the stir decays on its own.
 *
 * The origin is the **bottom** of the container, so `depth` is the height of
 * the brim above it.
 */
export function createFill(options: FillOptions = {}): Fill {
  const depth = options.depth ?? 0.12;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const round = options.radius !== undefined;

  const group = new Group();
  group.name = 'fill';

  const uniforms = {
    uFillTime: { value: 0 },
    uFillStir: { value: 0 },
  };
  // Its OWN material, not a re-patched `flowingWaterMaterial`. Replacing that
  // one's onBeforeCompile throws away the colour and alpha patch along with
  // the motion, and what is left renders as a plain white disc — the reuse
  // reads well and produces nothing.
  const material = new MeshStandardMaterial({
    color: options.color ?? palette.water,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    roughness: 0.08,
    metalness: 0.25,
    side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uFillTime;\nuniform float uFillStir;'
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           // Concentric ripple plus a cross-chop, scaled by how stirred it is.
           // The geometry is a plane in XY that gets laid flat, so the height
           // to displace is z.
           float r = length(position.xy);
           float ring = sin(r * 34.0 - uFillTime * 5.0);
           float chop = sin(position.x * 21.0 + uFillTime * 3.1)
                      * cos(position.y * 19.0 - uFillTime * 2.4);
           transformed.z += (ring * 0.55 + chop * 0.45) * 0.008 * uFillStir;
         }`
      );
  };
  material.customProgramCacheKey = () => 'scenaFillRipple';

  const surface = new Mesh(
    round
      // Segments matter: a CircleGeometry is a fan from one centre vertex, so
      // a ripple has almost nothing to displace. Rings give it something.
      ? new CircleGeometry(options.radius ?? 0.18, 20, 0, Math.PI * 2)
      : new PlaneGeometry(options.width ?? 0.4, options.length ?? 0.3, 8, 6),
    material
  );
  surface.name = 'surface';
  surface.rotation.x = -Math.PI / 2;
  group.add(surface);

  let level = Math.min(1, Math.max(0, options.level ?? 0));
  let stir = 0;
  const apply = (): void => {
    surface.position.y = level * depth;
    // An empty container shows no water at all — not a flat disc on the floor.
    surface.visible = level > 0.002;
  };
  apply();

  return {
    object: group,
    obstacleRadius: 0,
    get level() {
      return level;
    },
    setLevel(next: number) {
      const clamped = Math.min(1, Math.max(0, next));
      if (clamped !== level) stir = Math.min(1, stir + Math.abs(clamped - level) * 4);
      level = clamped;
      apply();
    },
    fillBy(amount: number) {
      if (amount === 0) return;
      level = Math.min(1, Math.max(0, level + amount));
      // Running water keeps the surface moving the whole time it is running.
      stir = Math.min(1, stir + Math.abs(amount) * 30);
      apply();
    },
    disturb(amount = 0.6) {
      stir = Math.min(1, stir + amount);
    },
    update(dt: number) {
      uniforms.uFillTime.value += dt;
      // Settles on its own. This decay is the difference between water and a
      // permanently choppy blue disc.
      stir = Math.max(0, stir - dt * 0.55);
      uniforms.uFillStir.value = stir;
    },
  };
}

export interface SteamOptions {
  /** Radius of the source. Default 0.3. */
  radius?: number;
  /** How high it rises. Default 1.2. */
  height?: number;
  /** How many puffs. Default 14. */
  count?: number;
  /** Starting density, 0–1. Default 0. */
  density?: number;
  seed?: number;
}

export interface Steam extends Prop {
  /** How thick it is, 0–1. Builds and clears over `update`. */
  readonly density: number;
  /** Where it is heading. Steam takes time to fill a room and time to clear. */
  setTarget(density: number): void;
  update(dt: number): void;
}

const STEAM_VERT = /* glsl */ `
attribute float aPhase;
attribute float aSpeed;
attribute float aRad;
attribute float aAng;
uniform float uTime;
uniform float uHeight;
uniform float uRadius;
uniform float uSize;
varying float vLife;
void main() {
  float life = fract(uTime * aSpeed + aPhase);
  vLife = life;
  // Rises and spreads as it goes, and slows near the top the way warm air
  // does when it reaches the ceiling.
  float rise = sqrt(life);
  float rad = aRad * uRadius * (0.4 + rise * 1.5);
  vec3 p = vec3(cos(aAng + life * 1.2) * rad, rise * uHeight, sin(aAng + life * 1.2) * rad);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (1.0 + life * 2.2) * (240.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const STEAM_FRAG = /* glsl */ `
uniform float uDensity;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  // Thins as it rises, and never gets sharp — a hard-edged puff reads as a
  // cotton ball.
  float fade = max(0.0, 0.5 - abs(vLife - 0.5)) * (1.0 - vLife * 0.55);
  gl_FragColor = vec4(1.0, 1.0, 1.0, (1.0 - d * 2.0) * fade * 0.34 * uDensity);
}`;

/**
 * Steam.
 *
 * The only particle system in the water set, so the only piece with a real
 * frame cost. It is worth it for one reason: steam is the only thing that
 * shows a shower has been running for a *while*. It **builds and clears
 * slowly** — a room that fogs the instant the tap opens is a smoke machine.
 */
export function createSteam(options: SteamOptions = {}): Steam {
  const rng = new Rng(options.seed ?? 1);
  const count = options.count ?? 14;
  const radius = options.radius ?? 0.3;
  const height = options.height ?? 1.2;

  const pos = new Float32Array(count * 3);
  const aPhase = new Float32Array(count);
  const aSpeed = new Float32Array(count);
  const aRad = new Float32Array(count);
  const aAng = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    aPhase[i] = rng.next();
    aSpeed[i] = rng.range(0.08, 0.18);
    aRad[i] = rng.range(0.2, 1);
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
      uHeight: { value: height },
      uRadius: { value: radius },
      uSize: { value: 1.4 },
      uDensity: { value: options.density ?? 0 },
    },
    vertexShader: STEAM_VERT,
    fragmentShader: STEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Points(geometry, material);
  mesh.frustumCulled = false;

  const group = new Group();
  group.name = 'steam';
  group.add(mesh);

  let density = options.density ?? 0;
  let target = density;

  return {
    object: group,
    obstacleRadius: 0,
    get density() {
      return density;
    },
    setTarget(next: number) {
      target = Math.min(1, Math.max(0, next));
    },
    update(dt: number) {
      material.uniforms.uTime.value += dt;
      // Builds slowly, clears slower. Neither is instant, and the asymmetry
      // is why a bathroom stays fogged after the shower stops.
      const rate = target > density ? 0.32 : 0.14;
      const step = rate * dt;
      density = target > density ? Math.min(target, density + step) : Math.max(target, density - step);
      material.uniforms.uDensity.value = density;
      mesh.visible = density > 0.002;
    },
  };
}
