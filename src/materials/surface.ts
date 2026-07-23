import { Color, MeshStandardMaterial, Vector2, Vector3 } from 'three';

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
  | 'dirt'
  // Tier 1 — ground & terrain
  | 'sand'
  | 'gravel'
  | 'mud'
  // Tier 1 — stone & masonry
  | 'sandstone'
  | 'granite'
  | 'slate'
  // Tier 1 — organic
  | 'bark'
  | 'leather'
  | 'canvas'
  | 'parchment'
  | 'terracotta'
  | 'bone'
  // Tier 1 — metals
  | 'rust'
  | 'bronze'
  | 'brass'
  // Tier 2 — masonry tiling
  | 'brick'
  | 'cobblestone'
  | 'ashlar'
  | 'floortile'
  | 'shingle';

export interface SurfaceParams {
  /**
   * Natural base colour for this kind (hex int). Used when the caller passes
   * no `color`, so `createSurface('sand')` looks like sand out of the box.
   * A caller's `color` always wins.
   */
  baseColor?: number;
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

  // --- masonry tiling (all optional; `tile: 0` — the default — disables it) ---
  /** Tiling strength (0 off, 1 full). Turns on the brick/tile grid. */
  tile?: number;
  /** Cell width in world metres (the length of a brick/tile). */
  tileW?: number;
  /** Cell height in world metres (the course height). */
  tileH?: number;
  /** Mortar-joint width in world metres. */
  mortar?: number;
  /** Row offset: 0 = aligned grid, 1 = half-cell running bond. */
  bond?: number;
  /** Cell profile: 0 = flat tiles, 1 = domed cobbles. */
  round?: number;
  /** Per-cell brightness/roughness jitter (0–1), so no two read alike. */
  tileJitter?: number;
  /** Mortar-joint colour, as a hex int. */
  mortarColor?: number;
  /** Groove relief strength for the joints (normal perturbation). */
  tileRelief?: number;
}

const V = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

export const SURFACE_PRESETS: Record<SurfaceKind, SurfaceParams> = {
  // Lime-washed cottage walls: soft warm mottle, gentle relief.
  plaster: {
    baseColor: 0xd9ccb0,
    roughness: 0.92, metalness: 0, scale: 3.4, albedoVar: 0.14, tint: 0x9c8f74,
    tintAmount: 0.12, ao: 0.18, bump: 0.15, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Rough weathered stone: strong cavity AO + mossy tint, pitted relief.
  stone: {
    baseColor: 0x8a8f98,
    roughness: 0.96, metalness: 0, scale: 2.6, albedoVar: 0.26, tint: 0x5c6b44,
    tintAmount: 0.16, ao: 0.34, bump: 0.42, roughVar: 0.14, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Structural timber: pronounced grain rings darkening the albedo.
  wood: {
    baseColor: 0x8a6642,
    roughness: 0.82, metalness: 0, scale: 5.5, albedoVar: 0.12, tint: 0x3a2a1c,
    tintAmount: 0.14, ao: 0.16, bump: 0.12, roughVar: 0.12, grain: 0.55,
    grainScale: 3.2, grainAxis: V(0, 1, 0), flat: true,
  },
  // Sawn planks: finer, straighter grain, a touch smoother.
  plank: {
    baseColor: 0x9a7a52,
    roughness: 0.78, metalness: 0, scale: 6.5, albedoVar: 0.1, tint: 0x40301f,
    tintAmount: 0.1, ao: 0.12, bump: 0.1, roughVar: 0.1, grain: 0.4,
    grainScale: 5.0, grainAxis: V(1, 0, 0), flat: true,
  },
  // Straw thatch: busy fibrous streaking, high roughness, deep shadowing.
  thatch: {
    baseColor: 0xb39a5c,
    roughness: 0.98, metalness: 0, scale: 9.0, albedoVar: 0.3, tint: 0x6a5324,
    tintAmount: 0.2, ao: 0.28, bump: 0.3, roughVar: 0.08, grain: 0.35,
    grainScale: 8.0, grainAxis: V(0, 0, 1), flat: true,
  },
  // Clay roof tiles: regular ridged rows, warm cavity tint.
  tile: {
    baseColor: 0xa8563e,
    roughness: 0.7, metalness: 0, scale: 4.0, albedoVar: 0.14, tint: 0x6e2f22,
    tintAmount: 0.16, ao: 0.24, bump: 0.34, roughVar: 0.1, grain: 0.6,
    grainScale: 6.0, grainAxis: V(1, 0, 0), flat: true,
  },
  // Aged iron/bronze: mild mottle, low roughness variance, metallic.
  metal: {
    baseColor: 0x3d4451,
    roughness: 0.52, metalness: 0.85, scale: 4.5, albedoVar: 0.16, tint: 0x2a2118,
    tintAmount: 0.18, ao: 0.22, bump: 0.16, roughVar: 0.2, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Packed earth: broad soft variation, strong low-frequency patches.
  dirt: {
    baseColor: 0x8a7a58,
    roughness: 1.0, metalness: 0, scale: 2.0, albedoVar: 0.22, tint: 0x4a3524,
    tintAmount: 0.2, ao: 0.3, bump: 0.1, roughVar: 0.05, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },

  // --- Tier 1: ground & terrain -----------------------------------------
  // Fine granular sand with soft wind ripples; smooth-shaded dunes.
  sand: {
    baseColor: 0xcbb98a,
    roughness: 1.0, metalness: 0, scale: 7.0, albedoVar: 0.16, tint: 0x9c8048,
    tintAmount: 0.14, ao: 0.14, bump: 0.14, roughVar: 0.06, grain: 0.18,
    grainScale: 3.0, grainAxis: V(1, 0, 0), flat: false,
  },
  // Loose gravel / riverbed: chunky faceted stones, strong relief.
  gravel: {
    baseColor: 0x9a948a,
    roughness: 0.95, metalness: 0, scale: 5.5, albedoVar: 0.3, tint: 0x605a4f,
    tintAmount: 0.18, ao: 0.32, bump: 0.5, roughVar: 0.16, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Wet churned mud: darkened patches with a damp sheen (lower roughness).
  mud: {
    baseColor: 0x4a3826,
    roughness: 0.6, metalness: 0, scale: 2.4, albedoVar: 0.2, tint: 0x241708,
    tintAmount: 0.3, ao: 0.34, bump: 0.16, roughVar: 0.24, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },

  // --- Tier 1: stone & masonry ------------------------------------------
  // Warm sandstone: soft, faintly streaked, gentle relief — temples, cliffs.
  sandstone: {
    baseColor: 0xc9a06a,
    roughness: 0.9, metalness: 0, scale: 3.4, albedoVar: 0.18, tint: 0x8a6a3c,
    tintAmount: 0.16, ao: 0.22, bump: 0.24, roughVar: 0.1, grain: 0.22,
    grainScale: 2.4, grainAxis: V(0, 1, 0), flat: true,
  },
  // Speckled granite: fine mineral fleck, low relief, a hint of polish.
  granite: {
    baseColor: 0x8e8a94,
    roughness: 0.58, metalness: 0, scale: 9.0, albedoVar: 0.34, tint: 0x45414d,
    tintAmount: 0.14, ao: 0.14, bump: 0.12, roughVar: 0.2, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Dark slate: blue-grey cleavage plates, low roughness, subtle streaks.
  slate: {
    baseColor: 0x50565e,
    roughness: 0.55, metalness: 0, scale: 3.0, albedoVar: 0.14, tint: 0x2c3540,
    tintAmount: 0.2, ao: 0.2, bump: 0.18, roughVar: 0.12, grain: 0.2,
    grainScale: 3.0, grainAxis: V(1, 0, 0), flat: true,
  },

  // --- Tier 1: organic --------------------------------------------------
  // Tree bark: deep vertical ridges (grain rings around the trunk axis).
  bark: {
    baseColor: 0x5a4535,
    roughness: 0.92, metalness: 0, scale: 6.0, albedoVar: 0.2, tint: 0x2a1c10,
    tintAmount: 0.2, ao: 0.26, bump: 0.45, roughVar: 0.12, grain: 0.7,
    grainScale: 5.5, grainAxis: V(0, 1, 0), flat: true,
  },
  // Leather / hide: soft mottled grain with a gentle sheen — straps, armour.
  leather: {
    baseColor: 0x6a4630,
    roughness: 0.62, metalness: 0, scale: 5.0, albedoVar: 0.16, tint: 0x2e1a0f,
    tintAmount: 0.22, ao: 0.2, bump: 0.18, roughVar: 0.12, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },
  // Woven canvas: fine directional weave, matte — tents, sails, sacks.
  canvas: {
    baseColor: 0xcabd9c,
    roughness: 0.95, metalness: 0, scale: 11.0, albedoVar: 0.14, tint: 0x8a7a5c,
    tintAmount: 0.12, ao: 0.14, bump: 0.12, roughVar: 0.06, grain: 0.3,
    grainScale: 12.0, grainAxis: V(1, 0, 0), flat: false,
  },
  // Aged parchment: near-white with soft foxing stains — signs, scrolls.
  parchment: {
    baseColor: 0xe0d4b0,
    roughness: 0.9, metalness: 0, scale: 3.0, albedoVar: 0.12, tint: 0x9a8558,
    tintAmount: 0.18, ao: 0.16, bump: 0.08, roughVar: 0.06, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },
  // Unglazed terracotta: warm clay, smooth, low relief — pots, urns.
  terracotta: {
    baseColor: 0xb5623a,
    roughness: 0.72, metalness: 0, scale: 4.0, albedoVar: 0.12, tint: 0x7a3a20,
    tintAmount: 0.16, ao: 0.16, bump: 0.14, roughVar: 0.08, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },
  // Weathered bone / ivory: off-white with cavity staining — ossuaries, décor.
  bone: {
    baseColor: 0xdcd2ba,
    roughness: 0.55, metalness: 0, scale: 6.0, albedoVar: 0.14, tint: 0x8a7f66,
    tintAmount: 0.2, ao: 0.22, bump: 0.12, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },

  // --- Tier 1: metals ---------------------------------------------------
  // Rusted iron: patchy orange corrosion, part-metallic, high roughness spread.
  rust: {
    baseColor: 0x8a4a2c,
    roughness: 0.85, metalness: 0.25, scale: 4.0, albedoVar: 0.28, tint: 0x5a2a12,
    tintAmount: 0.3, ao: 0.26, bump: 0.28, roughVar: 0.3, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Bronze: warm dark metal with patina in the cavities — bells, statues.
  bronze: {
    baseColor: 0x9a6a3a,
    roughness: 0.44, metalness: 0.9, scale: 4.5, albedoVar: 0.16, tint: 0x3a2410,
    tintAmount: 0.24, ao: 0.22, bump: 0.16, roughVar: 0.18, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Brass: brighter warm metal, smoother and shinier — fittings, instruments.
  brass: {
    baseColor: 0xc9a24a,
    roughness: 0.34, metalness: 0.95, scale: 5.0, albedoVar: 0.12, tint: 0x6a4a12,
    tintAmount: 0.16, ao: 0.16, bump: 0.1, roughVar: 0.14, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },

  // --- Tier 2: masonry tiling -------------------------------------------
  // Fired brick in running bond: long thin courses, pale mortar, bricks that
  // each weather a little differently.
  brick: {
    baseColor: 0x9e4a34,
    roughness: 0.86, metalness: 0, scale: 6.0, albedoVar: 0.14, tint: 0x5a2418,
    tintAmount: 0.16, ao: 0.2, bump: 0.1, roughVar: 0.12, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    tile: 1, tileW: 0.25, tileH: 0.085, mortar: 0.014, bond: 1, round: 0,
    tileJitter: 0.18, mortarColor: 0xb3a892, tileRelief: 0.06,
  },
  // Rounded cobblestones: small domed setts, wide earthy joints, heavy
  // per-stone variation — streets and courtyards.
  cobblestone: {
    baseColor: 0x8a8f98,
    roughness: 0.9, metalness: 0, scale: 5.0, albedoVar: 0.2, tint: 0x4a4436,
    tintAmount: 0.18, ao: 0.28, bump: 0.2, roughVar: 0.14, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    tile: 1, tileW: 0.17, tileH: 0.15, mortar: 0.03, bond: 1, round: 1,
    tileJitter: 0.24, mortarColor: 0x35322b, tileRelief: 0.13,
  },
  // Ashlar: large squared blocks, tight fine joints — castle and keep walls.
  ashlar: {
    baseColor: 0xb9b2a4,
    roughness: 0.9, metalness: 0, scale: 3.0, albedoVar: 0.16, tint: 0x7a725f,
    tintAmount: 0.16, ao: 0.2, bump: 0.12, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    tile: 1, tileW: 0.55, tileH: 0.32, mortar: 0.02, bond: 0.5, round: 0,
    tileJitter: 0.1, mortarColor: 0x857e6f, tileRelief: 0.05,
  },
  // Floor tiles: an aligned grid of square flags, dark grout, low relief —
  // halls and plazas.
  floortile: {
    baseColor: 0x6a6e72,
    roughness: 0.5, metalness: 0, scale: 4.0, albedoVar: 0.12, tint: 0x33363a,
    tintAmount: 0.16, ao: 0.16, bump: 0.08, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    tile: 1, tileW: 0.4, tileH: 0.4, mortar: 0.014, bond: 0, round: 0,
    tileJitter: 0.12, mortarColor: 0x2a2a2c, tileRelief: 0.045,
  },
  // Wooden shingles: overlapping courses with grain, deep shadow lines —
  // roofs and spires.
  shingle: {
    baseColor: 0x6b4a33,
    roughness: 0.85, metalness: 0, scale: 6.0, albedoVar: 0.16, tint: 0x2e2012,
    tintAmount: 0.18, ao: 0.24, bump: 0.12, roughVar: 0.12, grain: 0.32,
    grainScale: 6.0, grainAxis: V(0, 1, 0), flat: true,
    tile: 1, tileW: 0.2, tileH: 0.13, mortar: 0.012, bond: 1, round: 0,
    tileJitter: 0.2, mortarColor: 0x241811, tileRelief: 0.09,
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
uniform float uSurfTile;
uniform vec2  uSurfTileSize;
uniform float uSurfMortar;
uniform float uSurfTileBond;
uniform float uSurfTileRound;
uniform float uSurfTileJitter;
uniform vec3  uSurfMortarColor;
uniform float uSurfTileRelief;

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
// A masonry grid on the dominant-axis face (so box walls/floors/roofs get a
// clean 2D pattern and abutting boxes align). Running-bond rows, mortar bands
// and per-cell jitter. Returns: x = mortar mask (1 in the joint), y = per-cell
// hash (0..1), z = surface height (tile face high → joint low), w = the domed
// stone height for cobbles.
vec4 scenaTile(vec3 wp, vec3 wn){
  vec3 an = abs(normalize(wn));
  vec2 uv;
  if (an.x >= an.y && an.x >= an.z) uv = wp.zy;
  else if (an.y >= an.x && an.y >= an.z) uv = wp.xz;
  else uv = wp.xy;
  uv += uSurfSeed.xy;
  vec2 ts = max(uSurfTileSize, vec2(1e-3));
  float row = floor(uv.y / ts.y);
  float bond = mod(row, 2.0) * uSurfTileBond * 0.5;
  float cxf = uv.x / ts.x + bond;
  float col = floor(cxf);
  vec2 cell = vec2(col, row);
  float fx = fract(cxf);
  float fy = fract(uv.y / ts.y);
  // Distance to the nearest cell edge, in world units → mortar band.
  float ex = min(fx, 1.0 - fx) * ts.x;
  float ey = min(fy, 1.0 - fy) * ts.y;
  float edge = min(ex, ey);
  float m = max(uSurfMortar, 1e-4);
  float mortar = 1.0 - smoothstep(m, m * 1.7, edge);
  // Domed profile for cobbles: peaks at the cell centre, falls to the joint.
  float dome = clamp(1.0 - length(vec2(fx - 0.5, fy - 0.5)) * 2.0, 0.0, 1.0);
  float flatH = 1.0 - mortar;
  float height = mix(flatH, dome * (1.0 - mortar), uSurfTileRound);
  float h = scenaHash13(vec3(cell + vec2(3.1, 7.3), 5.0));
  return vec4(mortar, h, height, dome);
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
      // masonry grid (no-op when uSurfTile == 0)
      vec4  scenaT   = scenaTile(vSurfWorldPos, vSurfWorldNormal);
      float scenaMortar = scenaT.x * uSurfTile;
      // fine mottle
      diffuseColor.rgb *= 1.0 + (scenaN - 0.5) * uSurfAlbedoVar;
      // per-cell brightness jitter, so no two bricks/stones read the same
      diffuseColor.rgb *= 1.0 + uSurfTileJitter * (scenaT.y - 0.5) * uSurfTile;
      // cavity ambient occlusion (dark where the low band is low)
      diffuseColor.rgb *= 1.0 - uSurfAO * (1.0 - scenaLow);
      // cavity tint
      diffuseColor.rgb = mix(diffuseColor.rgb, uSurfTint, uSurfTintAmount * (1.0 - scenaLow));
      // grain darkening (no-op when uSurfGrain == 0)
      diffuseColor.rgb *= 1.0 - uSurfGrain * scenaG * 0.5;
      // recessed mortar joint: to the mortar colour, shadowed in the groove
      diffuseColor.rgb = mix(diffuseColor.rgb, uSurfMortarColor, scenaMortar);
      diffuseColor.rgb *= 1.0 - 0.35 * scenaMortar;`
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (scenaN - 0.5) * uSurfRoughVar + uSurfGrain * scenaG * 0.12
        + scenaMortar * 0.25 + (scenaT.y - 0.5) * uSurfTileJitter * 0.3 * uSurfTile, 0.04, 1.0);`
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // three's perturbNormalArb, in view space, driven by the noise height
        // plus the tile relief (a step down into each mortar joint).
        float scenaH = scenaN + uSurfGrain * scenaG * 0.5 + scenaT.z * uSurfTile * uSurfTileRelief;
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
    color: options.color ?? preset.baseColor ?? 0x9a9a9a,
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
    // Masonry tiling (uSurfTile 0 disables the whole grid at no visual cost).
    uSurfTile: { value: p.tile ?? 0 },
    uSurfTileSize: { value: new Vector2(p.tileW ?? 0.25, p.tileH ?? 0.1) },
    uSurfMortar: { value: p.mortar ?? 0.014 },
    uSurfTileBond: { value: p.bond ?? 1 },
    uSurfTileRound: { value: p.round ?? 0 },
    uSurfTileJitter: { value: p.tileJitter ?? 0.12 },
    uSurfMortarColor: { value: new Color(p.mortarColor ?? 0x3a3a3a) },
    uSurfTileRelief: { value: p.tileRelief ?? 0.06 },
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
