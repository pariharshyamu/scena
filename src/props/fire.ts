import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointLight,
  ShaderMaterial,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

export interface FireOptions {
  seed?: number;
  /** Add a flickering warm PointLight. Default true. */
  light?: boolean;
  /** Overall flame scale multiplier. Default 1. */
  scale?: number;
  palette?: Palette;
}

// ---- flame geometry (hand-merged so we need no BufferGeometryUtils) ----

interface Tongue {
  cx: number;
  cz: number;
  r: number;
  h: number;
  phase: number;
}

/**
 * Merge several tapering "tongues" into one flame mesh. Each vertex carries
 * `aY` (0 at the base, 1 at the tip) and `aPhase` (per tongue), which the
 * shader uses to wobble the tips and flicker the height.
 */
function flameGeometry(tongues: Tongue[], R = 5): BufferGeometry {
  const position: number[] = [];
  const aY: number[] = [];
  const aPhase: number[] = [];
  const index: number[] = [];
  for (const t of tongues) {
    const base = position.length / 3;
    const rings = [
      { y: 0, rad: t.r },
      { y: t.h * 0.5, rad: t.r * 0.62 },
    ];
    for (const ring of rings) {
      for (let i = 0; i < R; i++) {
        const a = (i / R) * Math.PI * 2;
        position.push(t.cx + Math.cos(a) * ring.rad, ring.y, t.cz + Math.sin(a) * ring.rad);
        aY.push(ring.y / t.h);
        aPhase.push(t.phase);
      }
    }
    const apex = base + R * 2;
    position.push(t.cx, t.h, t.cz);
    aY.push(1);
    aPhase.push(t.phase);
    for (let i = 0; i < R; i++) {
      const i0 = base + i;
      const i1 = base + ((i + 1) % R);
      const j0 = base + R + i;
      const j1 = base + R + ((i + 1) % R);
      index.push(i0, i1, j1, i0, j1, j0); // ring0 → ring1
      index.push(j0, j1, apex); //           ring1 → apex
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  geo.setAttribute('aY', new BufferAttribute(new Float32Array(aY), 1));
  geo.setAttribute('aPhase', new BufferAttribute(new Float32Array(aPhase), 1));
  geo.setIndex(index);
  return geo;
}

const FLAME_VERT = /* glsl */ `
attribute float aY;
attribute float aPhase;
uniform float uTime;
varying float vY;
void main() {
  vY = aY;
  vec3 p = position;
  float w = aY * aY;                 // tips sway most, base is pinned
  p.x += sin(uTime * 7.0 + aPhase + aY * 4.0) * 0.09 * w;
  p.z += cos(uTime * 6.0 + aPhase * 1.3 + aY * 4.0) * 0.09 * w;
  p.y *= 0.82 + 0.18 * sin(uTime * 13.0 + aPhase * 2.0); // lick up and down
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FLAME_FRAG = /* glsl */ `
uniform vec3 uHot;
uniform vec3 uCool;
varying float vY;
void main() {
  vec3 col = mix(uHot, uCool, vY);   // white-hot base → cool orange tip
  float alpha = 1.0 - vY;            // fade out toward the tip
  gl_FragColor = vec4(col * (1.2 - vY * 0.4), alpha);
}`;

const EMBER_VERT = /* glsl */ `
attribute float aPhase;
attribute float aSpeed;
attribute float aRad;
attribute float aAng;
uniform float uTime;
uniform float uRise;
uniform float uSize;
varying float vLife;
void main() {
  float life = fract(uTime * aSpeed + aPhase); // 0 born → 1 dead
  vLife = life;
  float ang = aAng + life * 2.2;
  float rad = aRad * (1.0 - life * 0.35);
  vec3 p = vec3(cos(ang) * rad, life * uRise, sin(ang) * rad);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (1.0 - life) * (260.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const EMBER_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor, (1.0 - vLife) * (1.0 - d * 2.0));
}`;

/** Build the animated flame + embers, plus the uniforms driving them. */
function makeFlame(
  rng: Rng,
  scale: number,
  tongues: number,
  spread: number,
  baseH: number
): { group: Group; flameU: { uTime: { value: number } }; emberU: { uTime: { value: number } } } {
  const list: Tongue[] = [];
  for (let i = 0; i < tongues; i++) {
    const a = (i / tongues) * Math.PI * 2 + rng.range(0, 1);
    const rad = i === 0 ? 0 : rng.range(0.3, 1) * spread;
    list.push({
      cx: Math.cos(a) * rad,
      cz: Math.sin(a) * rad,
      r: rng.range(0.1, 0.16) * scale,
      h: baseH * rng.range(0.7, 1.15) * scale,
      phase: rng.range(0, Math.PI * 2),
    });
  }
  const flameMat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHot: { value: new Color(0xffe89a) },
      uCool: { value: new Color(0xe0400c) },
    },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const flame = new Mesh(flameGeometry(list), flameMat);

  // Embers.
  const N = Math.round(10 + tongues * 2);
  const ep = new Float32Array(N * 3);
  const aPhase = new Float32Array(N);
  const aSpeed = new Float32Array(N);
  const aRad = new Float32Array(N);
  const aAng = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    aPhase[i] = rng.next();
    aSpeed[i] = rng.range(0.25, 0.5);
    aRad[i] = rng.range(0.02, spread * 0.9);
    aAng[i] = rng.range(0, Math.PI * 2);
  }
  const emberGeo = new BufferGeometry();
  emberGeo.setAttribute('position', new BufferAttribute(ep, 3));
  emberGeo.setAttribute('aPhase', new BufferAttribute(aPhase, 1));
  emberGeo.setAttribute('aSpeed', new BufferAttribute(aSpeed, 1));
  emberGeo.setAttribute('aRad', new BufferAttribute(aRad, 1));
  emberGeo.setAttribute('aAng', new BufferAttribute(aAng, 1));
  const emberMat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRise: { value: baseH * 1.9 * scale },
      uSize: { value: 3.2 * scale },
      uColor: { value: new Color(0xff8a3c) },
    },
    vertexShader: EMBER_VERT,
    fragmentShader: EMBER_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const embers = new Points(emberGeo, emberMat);
  embers.frustumCulled = false;

  const group = new Group();
  group.add(flame, embers);
  return { group, flameU: flameMat.uniforms as { uTime: { value: number } }, emberU: emberMat.uniforms as { uTime: { value: number } } };
}

/**
 * Wire self-animation onto a fire: the flame shader clock, the ember clock,
 * the glowing coals and an optional flickering PointLight are all advanced
 * from the render loop, so a fire lives on its own with no per-frame code —
 * drop it in `scatter` or a village and it burns.
 */
function animateFire(
  driver: Mesh,
  flameU: { uTime: { value: number } },
  emberU: { uTime: { value: number } },
  coals: MeshStandardMaterial,
  coalBase: number,
  light: PointLight | null,
  lightBase: number
): void {
  driver.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    flameU.uTime.value = t;
    emberU.uTime.value = t;
    // Pseudo-noise flicker from a few incommensurate sines.
    const flick =
      0.74 + 0.15 * Math.sin(t * 11.0) + 0.1 * Math.sin(t * 23.3 + 1.7) + 0.06 * Math.sin(t * 41.0 + 0.5);
    coals.emissiveIntensity = coalBase * (0.8 + 0.3 * (flick - 0.74) * 3);
    if (light) light.intensity = lightBase * Math.max(0.4, flick);
  };
}

// ---- braziers & campfires ---------------------------------------------

/**
 * A standing brazier: a metal fire-bowl on splayed legs, filled with glowing
 * coals under a live flame, ringed by rising embers and casting a flickering
 * warm light. Self-animating.
 */
export function createBrazier(options: FireOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;
  const scale = options.scale ?? 1;
  const withLight = options.light ?? true;

  const group = new Group();
  group.name = 'brazier';

  const metal = createSurface('metal', { color: palette.metal, seed });
  const bowlH = 0.9;
  // Three splayed legs.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const leg = new Mesh(new CylinderGeometry(0.03, 0.04, bowlH, 5), metal);
    leg.position.set(Math.cos(a) * 0.22, bowlH / 2, Math.sin(a) * 0.22);
    leg.rotation.z = Math.cos(a) * 0.18;
    leg.rotation.x = -Math.sin(a) * 0.18;
    group.add(leg);
  }
  const bowl = new Mesh(new CylinderGeometry(0.42, 0.24, 0.32, 12, 1, true), metal);
  bowl.position.y = bowlH + 0.02;
  group.add(bowl);
  const base = new Mesh(new CylinderGeometry(0.24, 0.24, 0.05, 12), metal);
  base.position.y = bowlH - 0.13;
  group.add(base);

  const coalMat = new MeshStandardMaterial({
    color: 0x1a1109,
    emissive: 0xff5a1e,
    emissiveIntensity: 1.4,
    flatShading: true,
  });
  for (let i = 0; i < 5; i++) {
    const coal = new Mesh(new IcosahedronGeometry(rng.range(0.07, 0.12), 0), coalMat);
    coal.position.set(rng.jitter(0, 0.16), bowlH + 0.06 + rng.range(0, 0.04), rng.jitter(0, 0.16));
    group.add(coal);
  }

  const fire = makeFlame(rng, scale, 5, 0.2, 0.5);
  fire.group.position.y = bowlH + 0.1;
  group.add(fire.group);

  let light: PointLight | null = null;
  if (withLight) {
    light = new PointLight(0xff8a3a, 7, 9, 2);
    light.position.set(0, bowlH + 0.4, 0);
    group.add(light);
  }
  animateFire(fire.group.children[0] as Mesh, fire.flameU, fire.emberU, coalMat, 1.4, light, 7);

  return { object: group, obstacleRadius: 0.45 };
}

/**
 * A campfire: a ring of stones around charred logs stacked in a lean, a live
 * flame with rising embers, glowing under a flickering warm light.
 * Self-animating.
 */
export function createCampfire(options: FireOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;
  const scale = options.scale ?? 1;
  const withLight = options.light ?? true;

  const group = new Group();
  group.name = 'campfire';

  // Stone ring.
  const stone = createSurface('stone', { color: palette.rock[0], seed });
  const ringR = 0.7;
  const stones = rng.int(7, 9);
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2;
    const s = rng.range(0.16, 0.24);
    const rock = new Mesh(new IcosahedronGeometry(s, 0), stone);
    rock.position.set(Math.cos(a) * ringR, s * 0.5, Math.sin(a) * ringR);
    rock.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
    rock.scale.y = 0.75;
    group.add(rock);
  }

  // Charred logs stacked in a lean.
  const wood = createSurface('wood', { color: palette.woodDark, seed: seed + 3 });
  const charMat = new MeshStandardMaterial({ color: 0x1c140f, flatShading: true });
  const logs = rng.int(3, 4);
  for (let i = 0; i < logs; i++) {
    const a = (i / logs) * Math.PI * 2 + rng.range(0, 0.4);
    const log = new Mesh(new CylinderGeometry(0.07, 0.08, 0.95, 6), i % 2 ? charMat : wood);
    log.position.set(Math.cos(a) * 0.18, 0.28, Math.sin(a) * 0.18);
    log.rotation.set(Math.PI / 2 - 0.55, a, 0);
    group.add(log);
  }

  const coalMat = new MeshStandardMaterial({
    color: 0x1a1008,
    emissive: 0xff5518,
    emissiveIntensity: 1.6,
    flatShading: true,
  });
  for (let i = 0; i < 6; i++) {
    const coal = new Mesh(new IcosahedronGeometry(rng.range(0.08, 0.14), 0), coalMat);
    coal.position.set(rng.jitter(0, 0.24), 0.08 + rng.range(0, 0.05), rng.jitter(0, 0.24));
    group.add(coal);
  }

  const fire = makeFlame(rng, scale, 7, 0.42, 0.85);
  fire.group.position.y = 0.14;
  group.add(fire.group);

  let light: PointLight | null = null;
  if (withLight) {
    light = new PointLight(0xff8636, 9, 12, 2);
    light.position.set(0, 0.9, 0);
    group.add(light);
  }
  animateFire(fire.group.children[0] as Mesh, fire.flameU, fire.emberU, coalMat, 1.6, light, 9);

  return { object: group, obstacleRadius: 0.9 };
}
