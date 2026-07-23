import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { Rng } from '../core/random';

// ======================================================================
//  God rays — volumetric light shafts descending through water
// ======================================================================

export interface GodRaysOptions {
  /** How many shafts. Default 18. */
  count?: number;
  /** Shaft length downward, metres. Default 20. */
  height?: number;
  /** Shaft width, metres. Default 1.4. */
  width?: number;
  /** Radius of the disc the shafts scatter across. Default 14. */
  spread?: number;
  /** Sun tilt in degrees — how far the shafts lean from vertical. Default 18. */
  tilt?: number;
  /** Sun azimuth in degrees — which way they lean. Default 0. */
  azimuth?: number;
  /** Shaft colour. Default 0xbfe6f0 (pale cyan). */
  color?: number;
  /** Additive brightness, 0–1. Default 0.14. */
  opacity?: number;
  /** How far the shafts waver, metres. Default 0.5. */
  sway?: number;
  seed?: number;
}

export interface GodRays {
  /** The additive shaft mesh — add it to the scene, position it at the surface. Self-animates. */
  object: Mesh;
  material: ShaderMaterial;
  /** Set the additive brightness, 0–1. */
  setOpacity(value: number): void;
  /** Advance manually instead of self-driving (for deterministic loops). */
  update(dt: number): void;
}

const RAY_VERT = /* glsl */ `
uniform float uTime;
uniform float uSway;
attribute float aRayV;
attribute float aRayU;
attribute float aPhase;
varying float vV;
varying float vU;
varying float vPhase;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.5 + aPhase) * uSway * aRayV;
  p.z += cos(uTime * 0.4 + aPhase * 1.3) * uSway * 0.6 * aRayV;
  vV = aRayV; vU = aRayU; vPhase = aPhase;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const RAY_FRAG = /* glsl */ `
uniform vec3  uColor;
uniform float uOpacity;
uniform float uTime;
varying float vV;
varying float vU;
varying float vPhase;
void main() {
  float vert = 1.0 - vV;          // brightest near the surface
  vert *= vert;
  float horiz = 1.0 - abs(vU);    // soft feathered sides
  horiz *= horiz;
  float flick = 0.7 + 0.3 * sin(uTime * 1.3 + vPhase * 4.0);
  float a = vert * horiz * uOpacity * flick;
  gl_FragColor = vec4(uColor * a, a);
}
`;

function nowSeconds(): number {
  return typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
}

/**
 * Volumetric light shafts falling through water — the "god rays" that make a
 * submerged scene read as *underwater*. Each shaft is a pair of crossed additive
 * quads (so it holds up from any camera angle), brightest at the surface and
 * feathered at the edges, wavering gently in the current. The whole set is one
 * additive draw call and it self-animates from the render loop.
 *
 * Position the object at the water surface; the shafts hang below it, leaning
 * with the sun (`tilt` / `azimuth`).
 *
 * ```ts
 * const rays = createGodRays({ count: 20, height: 22, tilt: 20 });
 * rays.object.position.set(0, waterLevel, 0);
 * scene.add(rays.object);
 * ```
 */
export function createGodRays(options: GodRaysOptions = {}): GodRays {
  const count = options.count ?? 18;
  const height = options.height ?? 20;
  const width = options.width ?? 1.4;
  const spread = options.spread ?? 14;
  const tilt = ((options.tilt ?? 18) * Math.PI) / 180;
  const azimuth = ((options.azimuth ?? 0) * Math.PI) / 180;
  const rng = new Rng(options.seed ?? 1);

  const halfW = width * 0.5;
  const slant = Math.tan(tilt) * height;
  const slantX = Math.cos(azimuth) * slant;
  const slantZ = Math.sin(azimuth) * slant;

  // Each shaft = two crossed quads (one spanning local X, one spanning Z), so
  // it reads as a solid beam of light from any angle. 8 verts, 4 tris a shaft.
  const vertsPerShaft = 8;
  const trisPerShaft = 4;
  const pos = new Float32Array(count * vertsPerShaft * 3);
  const rayV = new Float32Array(count * vertsPerShaft);
  const rayU = new Float32Array(count * vertsPerShaft);
  const phase = new Float32Array(count * vertsPerShaft);
  const index: number[] = [];

  for (let s = 0; s < count; s++) {
    // Scatter the top over a disc.
    const r = Math.sqrt(rng.next()) * spread;
    const a = rng.next() * Math.PI * 2;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const ph = rng.range(0, Math.PI * 2);
    const bx = cx + slantX;
    const bz = cz + slantZ;
    const base = s * vertsPerShaft;

    // Quad A spans local X; quad B spans local Z. Layout per quad:
    // 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
    const quads: Array<[number, number, number, number, number, number]> = [
      // top-left,               top-right,              bottom-left,                 bottom-right
      [cx - halfW, cz, cx + halfW, cz, bx - halfW, bz], // A (spans X)
      [cx, cz - halfW, cx, cz + halfW, bx, bz - halfW], // B (spans Z) — bottoms mirror
    ];
    for (let q = 0; q < 2; q++) {
      const [tlx, tlz, trx, trz, blx, blz] = quads[q];
      const brx = q === 0 ? bx + halfW : bx;
      const brz = q === 0 ? bz : bz + halfW;
      const corners: Array<[number, number, number, number, number]> = [
        [tlx, 0, tlz, 0, -1], // top-left   v0 u-1
        [trx, 0, trz, 0, 1], // top-right   v0 u+1
        [blx, -height, blz, 1, -1], // bottom-left  v1 u-1
        [brx, -height, brz, 1, 1], // bottom-right v1 u+1
      ];
      const off = base + q * 4;
      for (let c = 0; c < 4; c++) {
        const v = off + c;
        pos[v * 3] = corners[c][0];
        pos[v * 3 + 1] = corners[c][1];
        pos[v * 3 + 2] = corners[c][2];
        rayV[v] = corners[c][3];
        rayU[v] = corners[c][4];
        phase[v] = ph;
      }
      index.push(off, off + 2, off + 1, off + 1, off + 2, off + 3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('aRayV', new BufferAttribute(rayV, 1));
  geometry.setAttribute('aRayU', new BufferAttribute(rayU, 1));
  geometry.setAttribute('aPhase', new BufferAttribute(phase, 1));
  geometry.setIndex(index);
  geometry.boundingSphere = new Sphere(new Vector3(0, -height * 0.5, 0), spread + height);
  void trisPerShaft;

  const material = new ShaderMaterial({
    vertexShader: RAY_VERT,
    fragmentShader: RAY_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: 2, // DoubleSide
    uniforms: {
      uTime: { value: 0 },
      uSway: { value: options.sway ?? 0.5 },
      uColor: { value: new Color(options.color ?? 0xbfe6f0) },
      uOpacity: { value: options.opacity ?? 0.14 },
    },
  });

  const object = new Mesh(geometry, material);
  object.name = 'god-rays';
  object.frustumCulled = false;

  let manual = false;
  object.onBeforeRender = () => {
    if (!manual) material.uniforms.uTime.value = nowSeconds();
  };

  return {
    object,
    material,
    setOpacity(value) {
      material.uniforms.uOpacity.value = Math.max(0, value);
    },
    update(dt) {
      manual = true;
      material.uniforms.uTime.value += dt;
    },
  };
}

// ======================================================================
//  Caustics — the dancing light network on the seabed
// ======================================================================

interface PatchableShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

export interface CausticsOptions {
  /** Caustic tint (added to emissive, so it glows regardless of the day cycle). Default 0x9fd8e6. */
  color?: number;
  /** Pattern scale — larger = finer cells. Default 0.5. */
  scale?: number;
  /** How fast the network shifts. Default 0.6. */
  speed?: number;
  /** Brightness of the caustics. Default 0.5. */
  intensity?: number;
}

export interface Caustics {
  /** The shared shader uniforms (one set, referenced by every bound material). */
  readonly uniforms: Record<string, { value: unknown }>;
  /** Every material patched so far. */
  materials: Material[];
  /** Set the caustic brightness. */
  setIntensity(value: number): Caustics;
  /** Project caustics onto a material's emissive. Composes with surfaces; idempotent per material. */
  bind(material: Material): Caustics;
  /** Self-animate: drive the shared clock from a rendered object's `onBeforeRender`. */
  attach(object: Object3D): Caustics;
  /** Convenience: `bind` every material under `target`, then `attach` the driver. */
  apply(target: Object3D): Caustics;
  /** Advance the clock manually instead of self-driving (for deterministic loops). */
  update(dt: number): void;
}

// Caustics use large world coordinates, so — like the surface noise — they need
// highp in the fragment stage or mobile mediump loses precision and the network
// swims. SwiftShader (headless) ignores the qualifier, so this can't be seen in
// the automated captures; it matters on real phones.
const CAUSTIC_COMMON = /* glsl */ `
varying highp vec3 vCausticWorld;
`;

const CAUSTIC_FRAG_FN = /* glsl */ `
uniform vec3  uCausticColor;
uniform highp float uCausticScale;
uniform highp float uCausticTime;
uniform float uCausticSpeed;
uniform float uCausticIntensity;
float scenaCausticCell(highp vec2 p) {
  highp float s = sin(p.x) * sin(p.y);
  return pow(max(s, 0.0), 8.0);
}
float scenaCaustics(highp vec2 uv, highp float t) {
  mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  float a = scenaCausticCell(uv + vec2(t, t * 0.7));
  float b = scenaCausticCell(R * uv * 1.3 + vec2(-t * 0.8, t * 0.5));
  float c = scenaCausticCell(R * R * uv * 0.7 + vec2(t * 0.5, -t * 0.6));
  return clamp(a + b + c, 0.0, 1.0);
}
`;

/**
 * Caustics — the rippling net of light that the water surface throws onto the
 * seabed. It patches a `MeshStandardMaterial` (so PBR, shadows and fog all
 * survive) and adds a shifting caustic network to the material's *emissive*, so
 * the light dances regardless of the day/night cycle. Bind it to the sand and
 * rocks under your ocean; it composes with SCENA surfaces and self-animates.
 *
 * ```ts
 * const caustics = createCaustics({ intensity: 0.5 });
 * caustics.apply(seabed);   // sand + rocks catch the moving light
 * ```
 */
export function createCaustics(options: CausticsOptions = {}): Caustics {
  const uniforms = {
    uCausticColor: { value: new Color(options.color ?? 0x9fd8e6) },
    uCausticScale: { value: options.scale ?? 0.5 },
    uCausticTime: { value: 0 },
    uCausticSpeed: { value: options.speed ?? 0.6 },
    uCausticIntensity: { value: options.intensity ?? 0.5 },
  };

  const patched: Material[] = [];
  let manual = false;

  const caustics: Caustics = {
    uniforms,
    materials: patched,

    setIntensity(value) {
      uniforms.uCausticIntensity.value = Math.max(0, value);
      return caustics;
    },

    bind(material) {
      const data = (material.userData ??= {}) as { __scenaCaustics?: boolean };
      if (data.__scenaCaustics) return caustics;
      data.__scenaCaustics = true;

      const prevCompile = material.onBeforeCompile;
      const baseKey = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
      material.onBeforeCompile = function (shader: PatchableShader, renderer: unknown) {
        if (prevCompile) (prevCompile as (s: PatchableShader, r: unknown) => void).call(this, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n' + CAUSTIC_COMMON)
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             {
               mat4 scenaCWM = modelMatrix;
               #ifdef USE_INSTANCING
                 scenaCWM = modelMatrix * instanceMatrix;
               #endif
               vCausticWorld = (scenaCWM * vec4(transformed, 1.0)).xyz;
             }`
          );
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\n' + CAUSTIC_COMMON + CAUSTIC_FRAG_FN)
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
             {
               float caust = scenaCaustics(vCausticWorld.xz * uCausticScale, uCausticTime * uCausticSpeed);
               totalEmissiveRadiance += uCausticColor * caust * uCausticIntensity;
             }`
          );
      };
      material.customProgramCacheKey = () => baseKey + '|scena-caustics-v1';
      material.needsUpdate = true;
      patched.push(material);
      return caustics;
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
          if (!manual) uniforms.uCausticTime.value = nowSeconds();
        } as Mesh['onBeforeRender'];
      }
      return caustics;
    },

    apply(target) {
      const seen = new Set<Material>();
      target.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m && !seen.has(m)) {
            seen.add(m);
            caustics.bind(m);
          }
        }
      });
      caustics.attach(target);
      return caustics;
    },

    update(dt) {
      manual = true;
      uniforms.uCausticTime.value += dt;
    },
  };

  return caustics;
}
