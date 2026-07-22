import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Points,
  ShaderMaterial,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createWater } from '../environment/water';
import { createStatue, type StatueFigure } from './statue';
import type { Prop } from '../core/types';

export interface FountainOptions {
  seed?: number;
  /** Basin width (square). Default seeded ~3–3.6. */
  size?: number;
  /** Centrepiece figure. Default seeded (small figures suit a fountain). */
  figure?: StatueFigure;
  /** Material of the centrepiece. Default 'stone'. */
  centrepiece?: 'stone' | 'bronze';
  palette?: Palette;
}

const FOUNTAIN_FIGURES: StatueFigure[] = ['orb', 'figure', 'obelisk', 'bust'];

/**
 * A tiered town fountain: a square stone basin brimming with animated water
 * (SCENA's own `createWater`, self-driven here), a central pedestal carrying
 * a small statue that spouts, an upper catch-bowl, sheets of water falling
 * between the tiers and a fine spray of droplets at the jet. Self-animating —
 * the water ripples and the spray falls with no per-frame code.
 */
export function createFountain(options: FountainOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;
  const size = options.size ?? rng.range(3, 3.6);
  const figure = options.figure ?? rng.pick(FOUNTAIN_FIGURES);

  const group = new Group();
  group.name = 'fountain';

  const stone = createSurface('stone', { color: palette.rock[0], seed });
  const stone2 = createSurface('stone', { color: palette.rock[1] ?? palette.rock[0], seed: seed + 5 });

  // --- Square lower basin: floor + four low walls.
  const wallH = 0.55;
  const wallT = 0.22;
  const half = size / 2;
  const floor = new Mesh(new CylinderGeometry(half * 0.98, half * 0.98, 0.12, 4), stone2);
  floor.rotation.y = Math.PI / 4;
  floor.position.y = 0.06;
  group.add(floor);
  // Four low coping walls around the rim.
  const walls: Array<[number, number, number, number]> = [
    [0, half - wallT / 2, size, wallT],
    [0, -(half - wallT / 2), size, wallT],
    [half - wallT / 2, 0, wallT, size],
    [-(half - wallT / 2), 0, wallT, size],
  ];
  for (const [x, z, w, d] of walls) {
    const wall = new Mesh(new BoxGeometry(w, wallH, d), stone);
    wall.position.set(x, wallH / 2, z);
    group.add(wall);
  }

  // --- Lower pool: createWater, sized to the basin interior, self-driven.
  const lowerLevel = wallH - 0.12;
  const water = createWater({
    level: lowerLevel,
    size: size - wallT * 1.4,
    resolution: 12,
    amplitude: 0.02,
    speed: 1.4,
    palette,
  });
  group.add(water.mesh);

  // --- Central pedestal + upper catch-bowl + spouting statue.
  const pedR = size * 0.16;
  const pedH = wallH + size * 0.24;
  const pedestal = new Mesh(new CylinderGeometry(pedR * 0.8, pedR, pedH, 10), stone);
  pedestal.position.y = pedH / 2;
  group.add(pedestal);

  const bowlY = pedH;
  const bowl = new Mesh(new CylinderGeometry(size * 0.3, size * 0.14, 0.16, 12), stone);
  bowl.position.y = bowlY;
  group.add(bowl);
  const bowlWater = createWater({
    level: bowlY + 0.09,
    size: size * 0.34, // fits inside the round catch-bowl, no corners peeking
    resolution: 6,
    amplitude: 0.012,
    speed: 1.9,
    palette,
  });
  group.add(bowlWater.mesh);

  const statue = createStatue({
    seed: seed + 3,
    figure,
    material: options.centrepiece ?? 'stone',
    height: size * 0.62,
    palette,
  });
  statue.object.position.y = bowlY + 0.08;
  statue.object.scale.setScalar(0.9);
  group.add(statue.object);

  // --- Falling water: translucent sheets from the bowl rim to the pool.
  const waterMat = new MeshStandardMaterial({
    color: palette.water,
    transparent: true,
    opacity: 0.4,
    roughness: 0.3,
    metalness: 0.4,
    flatShading: true,
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const fall = new Mesh(new CylinderGeometry(0.02, 0.03, bowlY - lowerLevel - 0.05, 4), waterMat);
    fall.position.set(Math.cos(a) * size * 0.28, (bowlY + lowerLevel) / 2, Math.sin(a) * size * 0.28);
    group.add(fall);
  }

  // --- Jet spray: additive droplet points rising from the spout and falling.
  const spray = makeSpray(rng, size * 0.14, bowlY + size * 0.2);
  spray.mesh.position.y = bowlY + 0.12;
  group.add(spray.mesh);

  // --- Self-animation: ripple both pools and rain the spray, from the loop.
  let last = performance.now() * 0.001;
  water.mesh.onBeforeRender = () => {
    const now = performance.now() * 0.001;
    const dt = Math.min(0.05, Math.max(0, now - last));
    last = now;
    water.update(dt);
    bowlWater.update(dt);
    spray.uniforms.uTime.value = now;
  };

  return { object: group, obstacleRadius: half + 0.1 };
}

// ---- helpers -----------------------------------------------------------

const SPRAY_VERT = /* glsl */ `
attribute float aPhase;
attribute float aSpeed;
attribute float aRad;
attribute float aAng;
uniform float uTime;
uniform float uRise;
uniform float uSize;
varying float vLife;
void main() {
  float life = fract(uTime * aSpeed + aPhase);
  vLife = life;
  // Ballistic arc: up then down.
  float h = 4.0 * life * (1.0 - life);
  float rad = aRad * life;
  vec3 p = vec3(cos(aAng) * rad, h * uRise, sin(aAng) * rad);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (240.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const SPRAY_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  // Fade in at birth, out at death; soft round dot; kept dim so many
  // droplets read as a fine spray rather than a blown-out bloom.
  float fade = max(0.0, 0.5 - abs(vLife - 0.5));
  gl_FragColor = vec4(uColor, (1.0 - d * 2.0) * fade * 0.8);
}`;

function makeSpray(
  rng: Rng,
  spread: number,
  riseTo: number
): { mesh: Points; uniforms: { uTime: { value: number } } } {
  const N = 22;
  const pos = new Float32Array(N * 3);
  const aPhase = new Float32Array(N);
  const aSpeed = new Float32Array(N);
  const aRad = new Float32Array(N);
  const aAng = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    aPhase[i] = rng.next();
    aSpeed[i] = rng.range(0.35, 0.6);
    aRad[i] = rng.range(0.25, 1) * spread;
    aAng[i] = rng.range(0, Math.PI * 2);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new BufferAttribute(aPhase, 1));
  geo.setAttribute('aSpeed', new BufferAttribute(aSpeed, 1));
  geo.setAttribute('aRad', new BufferAttribute(aRad, 1));
  geo.setAttribute('aAng', new BufferAttribute(aAng, 1));
  const mat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRise: { value: riseTo * 0.42 },
      uSize: { value: 0.28 }, // gl_PointSize ≈ uSize * 240 / dist — small droplets
      uColor: { value: new Color(0xbfe0ee) },
    },
    vertexShader: SPRAY_VERT,
    fragmentShader: SPRAY_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Points(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms: mat.uniforms as { uTime: { value: number } } };
}
