import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Points,
  PointsMaterial,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/random';

/**
 * Light shafts — god rays for the out-of-doors.
 *
 * `createInteriorLight` casts them from windows; this is the same light
 * let loose: seeded sunbeams slanting through a forest canopy, a ruin's
 * broken roof, a cavern mouth. Each shaft is a pair of crossed additive
 * cards that fade along their run (all shafts share ONE merged geometry
 * and one material — the whole grove is a single draw call), with dust
 * motes drifting slowly down the beams, twinkling as they go.
 *
 * Bind a day cycle (structurally — anything with `sunElevation`) and
 * the shafts live with the sun: full at midday, gone by dusk. No cycle
 * means a fixed sun and shafts that never die.
 *
 * ```ts
 * const shafts = createLightShafts({ count: 7, area: 8, seed: 4, cycle });
 * scene.add(shafts.group);
 * // per frame: shafts.update(dt);
 * ```
 */

export interface LightShaftsOptions {
  /** How many beams. Default 7. */
  count?: number;
  /** Radius of the lit patch on the ground, metres. Default 8. */
  area?: number;
  /** Beam run from canopy to ground, metres. Default 13. */
  length?: number;
  /** Beam color. Default a warm 0xfff2c8. */
  color?: number;
  /** Peak card opacity. Default 0.13 — shafts suggest, never shout. */
  strength?: number;
  /** Dust motes per shaft. Default 18; 0 disables. */
  dust?: number;
  /** Tilt from vertical, radians. Default 0.32. */
  tilt?: number;
  /** Which way the beams lean. Default 0.7. */
  azimuth?: number;
  /** A DayCycle (structurally): strength follows the sun. */
  cycle?: { readonly sunElevation: number };
  seed?: number;
}

export interface LightShafts {
  group: Group;
  /** Current effective strength (after the cycle has its say). */
  readonly strength: number;
  /** Override the base strength (still scaled by the cycle). */
  setStrength(value: number): void;
  /** Drift the motes; follow the bound cycle. */
  update(dt: number): void;
}

const SHAFT_VERT = /* glsl */ `
attribute float aFade;
varying float vFade;
void main() {
  vFade = aFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SHAFT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying float vFade;
void main() {
  // Brightest where the beam enters, thinning toward the ground.
  float alpha = uStrength * (1.0 - vFade * 0.75);
  gl_FragColor = vec4(uColor, alpha);
}`;

interface Mote {
  shaft: number;
  across: number; // -0.5..0.5 of the shaft width
  along: number; // 0 at canopy, 1 at ground
  speed: number;
  sway: number;
  phase: number;
}

export function createLightShafts(options: LightShaftsOptions = {}): LightShafts {
  const rng = new Rng(options.seed ?? 1);
  const count = Math.max(options.count ?? 7, 1);
  const area = options.area ?? 8;
  const length = options.length ?? 13;
  const baseStrength = options.strength ?? 0.13;
  const dustPerShaft = Math.max(options.dust ?? 18, 0);
  const tilt = options.tilt ?? 0.32;
  const azimuth = options.azimuth ?? 0.7;

  const group = new Group();
  group.name = 'light-shafts';

  // The shared sun direction, canopy → ground.
  const dir = new Vector3(
    Math.sin(azimuth) * Math.sin(tilt),
    -Math.cos(tilt),
    Math.cos(azimuth) * Math.sin(tilt)
  ).multiplyScalar(length);

  // Each shaft: ground point seeded in the disc, top back up the sun line,
  // two crossed cards tapering toward the top. One merged geometry.
  const feet: Vector3[] = [];
  const widths: number[] = [];
  const positions: number[] = [];
  const fades: number[] = [];
  const indices: number[] = [];
  const push = (v: Vector3, fade: number): number => {
    positions.push(v.x, v.y, v.z);
    fades.push(fade);
    return positions.length / 3 - 1;
  };
  const a = new Vector3();
  const b = new Vector3();
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rng.next()) * area;
    const theta = rng.range(0, Math.PI * 2);
    const foot = new Vector3(Math.cos(theta) * r, 0.02, Math.sin(theta) * r);
    const top = foot.clone().sub(dir);
    const width = rng.range(0.7, 1.9);
    feet.push(foot);
    widths.push(width);
    for (const across of [
      new Vector3(1, 0, 0),
      new Vector3(0, 0, 1),
    ]) {
      a.copy(across).multiplyScalar(width / 2);
      b.copy(across).multiplyScalar((width / 2) * 0.55); // narrower at the canopy
      const i0 = push(new Vector3().copy(top).sub(b), 0);
      const i1 = push(new Vector3().copy(top).add(b), 0);
      const i2 = push(new Vector3().copy(foot).add(a), 1);
      const i3 = push(new Vector3().copy(foot).sub(a), 1);
      indices.push(i0, i1, i2, i0, i2, i3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setAttribute('aFade', new BufferAttribute(Float32Array.from(fades), 1));
  geometry.setIndex(indices);
  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(options.color ?? 0xfff2c8) },
      uStrength: { value: baseStrength },
    },
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: 2, // DoubleSide — a card seen from behind is still a beam
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  group.add(mesh);

  // The motes: one Points cloud across every shaft, drifting down-beam.
  const motes: Mote[] = [];
  let points: Points | null = null;
  let moteMaterial: PointsMaterial | null = null;
  const motePositions = new Float32Array(count * dustPerShaft * 3);
  if (dustPerShaft > 0) {
    for (let s = 0; s < count; s++) {
      for (let d = 0; d < dustPerShaft; d++) {
        motes.push({
          shaft: s,
          across: rng.range(-0.5, 0.5),
          along: rng.next(),
          speed: rng.range(0.012, 0.035),
          sway: rng.range(0.05, 0.16),
          phase: rng.range(0, Math.PI * 2),
        });
      }
    }
    const moteGeometry = new BufferGeometry();
    moteGeometry.setAttribute('position', new BufferAttribute(motePositions, 3));
    moteMaterial = new PointsMaterial({
      color: options.color ?? 0xfff2c8,
      size: 0.055,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    points = new Points(moteGeometry, moteMaterial);
    points.frustumCulled = false;
    group.add(points);
  }

  let clock = rng.range(0, 10);
  let userStrength = baseStrength;
  let effective = baseStrength;

  const placeMotes = (): void => {
    for (let i = 0; i < motes.length; i++) {
      const mote = motes[i];
      const foot = feet[mote.shaft];
      const width = widths[mote.shaft];
      const sway = Math.sin(clock * 0.7 + mote.phase) * mote.sway;
      // 0 = canopy, 1 = ground: walk back up the sun line.
      const x = foot.x - dir.x * (1 - mote.along) + (mote.across + sway) * width;
      const y = foot.y - dir.y * (1 - mote.along);
      const z = foot.z - dir.z * (1 - mote.along) + (mote.across - sway) * width * 0.5;
      motePositions[i * 3] = x;
      motePositions[i * 3 + 1] = y;
      motePositions[i * 3 + 2] = z;
    }
    if (points) {
      (points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }
  };
  placeMotes();

  const applyStrength = (): void => {
    const sun = options.cycle ? Math.min(Math.max(options.cycle.sunElevation * 2.2, 0), 1) : 1;
    effective = userStrength * sun;
    material.uniforms.uStrength.value = effective;
    if (moteMaterial) moteMaterial.opacity = 0.6 * sun;
  };
  applyStrength();

  return {
    group,
    get strength() {
      return effective;
    },
    setStrength(value: number) {
      userStrength = Math.max(value, 0);
      applyStrength();
    },
    update(dt: number) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      clock += step;
      for (const mote of motes) {
        mote.along += mote.speed * step * 8;
        if (mote.along > 1) mote.along -= 1; // back to the canopy, forever falling
      }
      if (motes.length > 0) placeMotes();
      applyStrength();
    },
  };
}
