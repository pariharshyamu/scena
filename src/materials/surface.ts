import { Color, MeshStandardMaterial, Vector3 } from 'three';

/**
 * Procedural surface materials — the reason low-poly SCENA props can look
 * richer than a downloaded GLTF at a fraction of the bytes.
 *
 * A downloaded model ships baked albedo/normal/roughness textures (often
 * megabytes). Here the same detail — weathered stone, wood grain, mottled
 * plaster, thatch, tile — is generated in the shader from triplanar value
 * noise, so nothing is fetched and every prop is unique. The result is a
 * plain `MeshStandardMaterial` with an `onBeforeCompile` patch, so it keeps
 * three's full PBR lighting, shadows, fog, tone-mapping, and SCENA's
 * day/night emissive dimming — none of which a raw `ShaderMaterial` would.
 *
 * ```ts
 * const mat = createSurface('stone', { color: 0x8a8f98 });
 * mesh.material = mat;                       // that's it
 * ```
 *
 * Triplanar means no UVs are needed (a `BoxGeometry` has none worth using),
 * and because the noise is sampled in world space a wall built from several
 * abutting boxes reads as one continuous stone face with no visible seams.
 */
export type SurfaceKind =
  | 'plaster'
  | 'stone'
  | 'wood'
  | 'plank'
  | 'thatch'
  | 'tile'
  | 'metal'
  | 'dirt';

export interface SurfaceParams {
  /** PBR base roughness. */
  roughness: number;
  /** PBR metalness. */
  metalness: number;
  /** Noise frequency in world units (higher = finer grain). */
  scale: number;
  /** How strongly the fine noise lightens/darkens the albedo (0–1). */
  albedoVar: number;
  /** Secondary colour blended into cavities, as a hex int. */
  tint: number;
  /** How much of `tint` shows in cavities (0–1). */
  tintAmount: number;
  /** Low-frequency cavity darkening — the baked-AO look (0–1). */
  ao: number;
  /** Surface relief strength (normal perturbation from the noise). */
  bump: number;
  /** Roughness variation added from the noise (0–1). */
  roughVar: number;
  /** Anisotropic grain strength for wood-like surfaces (0 = none). */
  grain: number;
  /** Grain ring frequency. */
  grainScale: number;
  /** World axis the grain runs along. */
  grainAxis: Vector3;
  /** flatShading default for this kind. */
  flat: boolean;
}

const V = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

export const SURFACE_PRESETS: Record<SurfaceKind, SurfaceParams> = {
  // Lime-washed cottage walls: soft warm mottle, gentle relief.
  plaster: {
    roughness: 0.92, metalness: 0, scale: 3.4, albedoVar: 0.14, tint: 0x9c8f74,
    tintAmount: 0.12, ao: 0.18, bump: 0.15, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Rough weathered stone: strong cavity AO + mossy tint, pitted relief.
  stone: {
    roughness: 0.96, metalness: 0, scale: 2.6, albedoVar: 0.26, tint: 0x5c6b44,
    tintAmount: 0.16, ao: 0.34, bump: 0.42, roughVar: 0.14, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Structural timber: pronounced grain rings darkening the albedo.
  wood: {
    roughness: 0.82, metalness: 0, scale: 5.5, albedoVar: 0.12, tint: 0x3a2a1c,
    tintAmount: 0.14, ao: 0.16, bump: 0.12, roughVar: 0.12, grain: 0.55,
    grainScale: 3.2, grainAxis: V(0, 1, 0), flat: true,
  },
  // Sawn planks: finer, straighter grain, a touch smoother.
  plank: {
    roughness: 0.78, metalness: 0, scale: 6.5, albedoVar: 0.1, tint: 0x40301f,
    tintAmount: 0.1, ao: 0.12, bump: 0.1, roughVar: 0.1, grain: 0.4,
    grainScale: 5.0, grainAxis: V(1, 0, 0), flat: true,
  },
  // Straw thatch: busy fibrous streaking, high roughness, deep shadowing.
  thatch: {
    roughness: 0.98, metalness: 0, scale: 9.0, albedoVar: 0.3, tint: 0x6a5324,
    tintAmount: 0.2, ao: 0.28, bump: 0.3, roughVar: 0.08, grain: 0.35,
    grainScale: 8.0, grainAxis: V(0, 0, 1), flat: true,
  },
  // Clay roof tiles: regular ridged rows, warm cavity tint.
  tile: {
    roughness: 0.7, metalness: 0, scale: 4.0, albedoVar: 0.14, tint: 0x6e2f22,
    tintAmount: 0.16, ao: 0.24, bump: 0.34, roughVar: 0.1, grain: 0.6,
    grainScale: 6.0, grainAxis: V(1, 0, 0), flat: true,
  },
  // Aged iron/bronze: mild mottle, low roughness variance, metallic.
  metal: {
    roughness: 0.52, metalness: 0.85, scale: 4.5, albedoVar: 0.16, tint: 0x2a2118,
    tintAmount: 0.18, ao: 0.22, bump: 0.16, roughVar: 0.2, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Packed earth: broad soft variation, strong low-frequency patches.
  dirt: {
    roughness: 1.0, metalness: 0, scale: 2.0, albedoVar: 0.22, tint: 0x4a3524,
    tintAmount: 0.2, ao: 0.3, bump: 0.1, roughVar: 0.05, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },
};

export interface SurfaceOptions extends Partial<SurfaceParams> {
  /** Base colour (hex int or three Color). Defaults to a neutral grey. */
  color?: number | Color;
  /**
   * Seed offset so two props with the same colour still weather
   * differently. Any number; shifts the noise field.
   */
  seed?: number;
}

// ---- GLSL --------------------------------------------------------------

const NOISE_GLSL = /* glsl */ `
varying vec3 vSurfWorldPos;
varying vec3 vSurfWorldNormal;
uniform float uSurfScale;
uniform float uSurfAlbedoVar;
uniform vec3  uSurfTint;
uniform float uSurfTintAmount;
uniform float uSurfAO;
uniform float uSurfBump;
uniform float uSurfRoughVar;
uniform float uSurfGrain;
uniform float uSurfGrainScale;
uniform vec3  uSurfGrainAxis;
uniform vec3  uSurfSeed;

float scenaHash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float scenaVNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = scenaHash13(i + vec3(0.0,0.0,0.0));
  float n100 = scenaHash13(i + vec3(1.0,0.0,0.0));
  float n010 = scenaHash13(i + vec3(0.0,1.0,0.0));
  float n110 = scenaHash13(i + vec3(1.0,1.0,0.0));
  float n001 = scenaHash13(i + vec3(0.0,0.0,1.0));
  float n101 = scenaHash13(i + vec3(1.0,0.0,1.0));
  float n011 = scenaHash13(i + vec3(0.0,1.0,1.0));
  float n111 = scenaHash13(i + vec3(1.0,1.0,1.0));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float scenaFbm(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++){ s += a * scenaVNoise(p); p *= 2.02; a *= 0.5; }
  return s;
}
// Triplanar fbm: blend three axis-projected samples by the world normal, so
// box faces need no UVs and adjacent boxes share one continuous field.
float scenaTri(vec3 wp, vec3 wn, float scale){
  vec3 p = wp * scale + uSurfSeed;
  vec3 w = abs(normalize(wn)); w = pow(w, vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
  return scenaFbm(p.yzx) * w.x + scenaFbm(p.zxy) * w.y + scenaFbm(p.xyz) * w.z;
}
// Concentric grain rings around the grain axis, warped by noise.
float scenaGrain(vec3 wp){
  vec3 ax = normalize(uSurfGrainAxis);
  float along = dot(wp, ax);
  vec3 perp = wp - ax * along;
  float rings = length(perp) * uSurfGrainScale + scenaFbm(wp * uSurfGrainScale * 0.4) * 2.0;
  return abs(fract(rings) - 0.5) * 2.0; // triangle wave 0..1
}
`;

function vertexPatch(src: string): string {
  return src
    .replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vSurfWorldPos;\nvarying vec3 vSurfWorldNormal;'
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec4 scenaWP = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          scenaWP = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        vSurfWorldPos = scenaWP.xyz;
      }`
    )
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      {
        vec3 scenaON = objectNormal;
        #ifdef USE_INSTANCING
          scenaON = mat3(instanceMatrix) * scenaON;
        #endif
        vSurfWorldNormal = normalize(mat3(modelMatrix) * scenaON);
      }`
    );
}

function fragmentPatch(src: string): string {
  return src
    .replace('#include <common>', '#include <common>\n' + NOISE_GLSL)
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float scenaN   = scenaTri(vSurfWorldPos, vSurfWorldNormal, uSurfScale);
      float scenaLow = scenaTri(vSurfWorldPos, vSurfWorldNormal, uSurfScale * 0.25);
      float scenaG   = scenaGrain(vSurfWorldPos);
      // fine mottle
      diffuseColor.rgb *= 1.0 + (scenaN - 0.5) * uSurfAlbedoVar;
      // cavity ambient occlusion (dark where the low band is low)
      diffuseColor.rgb *= 1.0 - uSurfAO * (1.0 - scenaLow);
      // cavity tint
      diffuseColor.rgb = mix(diffuseColor.rgb, uSurfTint, uSurfTintAmount * (1.0 - scenaLow));
      // grain darkening (no-op when uSurfGrain == 0)
      diffuseColor.rgb *= 1.0 - uSurfGrain * scenaG * 0.5;`
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (scenaN - 0.5) * uSurfRoughVar + uSurfGrain * scenaG * 0.12, 0.04, 1.0);`
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // three's perturbNormalArb, in view space, driven by the noise height.
        float scenaH = scenaN + uSurfGrain * scenaG * 0.5;
        vec3 sX = dFdx(-vViewPosition);
        vec3 sY = dFdy(-vViewPosition);
        vec3 sN = normal;
        vec3 R1 = cross(sY, sN);
        vec3 R2 = cross(sN, sX);
        float det = dot(sX, R1);
        vec3 grad = sign(det) * (dFdx(scenaH) * R1 + dFdy(scenaH) * R2);
        normal = normalize(abs(det) * sN - uSurfBump * grad);
      }`
    );
}

/**
 * Build a procedural surface material. Pass a preset name for the defaults,
 * plus any overrides (colour, roughness, bump, seed, …).
 */
export function createSurface(kind: SurfaceKind, options: SurfaceOptions = {}): MeshStandardMaterial {
  const preset = SURFACE_PRESETS[kind];
  const p: SurfaceParams = { ...preset, ...options };
  const seed = options.seed ?? 0;

  const material = new MeshStandardMaterial({
    color: options.color ?? 0x9a9a9a,
    roughness: p.roughness,
    metalness: p.metalness,
    flatShading: p.flat,
  });

  const uniforms = {
    uSurfScale: { value: p.scale },
    uSurfAlbedoVar: { value: p.albedoVar },
    uSurfTint: { value: new Color(p.tint) },
    uSurfTintAmount: { value: p.tintAmount },
    uSurfAO: { value: p.ao },
    uSurfBump: { value: p.bump },
    uSurfRoughVar: { value: p.roughVar },
    uSurfGrain: { value: p.grain },
    uSurfGrainScale: { value: p.grainScale },
    uSurfGrainAxis: { value: p.grainAxis.clone().normalize() },
    // A large, seed-driven world-space offset so equal colours weather apart.
    uSurfSeed: {
      value: new Vector3(
        Math.sin(seed * 12.9898) * 43.75,
        Math.cos(seed * 78.233) * 51.13,
        Math.sin(seed * 37.719) * 29.41
      ),
    },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = vertexPatch(shader.vertexShader);
    shader.fragmentShader = fragmentPatch(shader.fragmentShader);
  };
  // All surface materials inject identical source (uniforms carry the
  // differences), so one cache key groups them — and, crucially, keeps them
  // from colliding with a plain MeshStandardMaterial that has matching base
  // params but no injection. three still appends its own feature key, so
  // flat/smooth/instanced variants stay separate programs.
  material.customProgramCacheKey = () => 'scena-surface-v1';

  return material;
}
