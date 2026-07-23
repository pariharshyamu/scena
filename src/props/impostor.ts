import { Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { Prop } from '../core/types';
import type { ScatterItem } from '../scatter/scatter';
import { createTree, type TreeSpecies, type TreeOptions } from './tree';

/** The slice of the shader object `onBeforeCompile` receives. */
interface PatchableShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

/**
 * A silhouette family. The billboard carves this shape per-fragment from its
 * UVs — so an impostor is one camera-facing quad, not a texture.
 * - `conifer`  — a tall triangle over a trunk (pine, **sequoia**).
 * - `round`    — a broad dome (oak, maple, **banyan**).
 * - `column`   — a slender flame (cypress).
 * - `umbrella` — a wide flat crown high on a thin trunk (**acacia**).
 * - `bottle`   — a sparse crown on a fat tapering trunk (**baobab**).
 */
export type ImpostorProfile = 'conifer' | 'round' | 'column' | 'umbrella' | 'bottle';

interface ProfileParams {
  profile: ImpostorProfile;
  /** Normalised height where the canopy begins (below is trunk). */
  canopyBase: number;
  /** Where in the canopy the silhouette is widest (0 base … 1 top). */
  belly: number;
  /** How sharply the width falls off away from the belly. */
  taper: number;
  /** Trunk half-width, in UV (fraction of the quad's half-width). */
  trunkHalf: number;
  /** Trunk taper: how much the trunk narrows going up (0 = parallel, 1 = to a point). */
  trunkTaper: number;
  /** Crown diameter as a fraction of height (sets the billboard's world width). */
  widthRatio: number;
}

// One row per silhouette; giants first, then the garden species for reuse.
const SPECIES_PROFILE: Partial<Record<TreeSpecies, ProfileParams>> = {
  sequoia: { profile: 'conifer', canopyBase: 0.4, belly: 0.0, taper: 1.25, trunkHalf: 0.09, trunkTaper: 0.35, widthRatio: 0.34 },
  banyan: { profile: 'round', canopyBase: 0.26, belly: 0.55, taper: 1.6, trunkHalf: 0.12, trunkTaper: 0.1, widthRatio: 1.1 },
  baobab: { profile: 'bottle', canopyBase: 0.72, belly: 0.5, taper: 1.4, trunkHalf: 0.22, trunkTaper: 0.55, widthRatio: 0.62 },
  acacia: { profile: 'umbrella', canopyBase: 0.58, belly: 0.9, taper: 2.2, trunkHalf: 0.05, trunkTaper: 0.25, widthRatio: 1.0 },
  pine: { profile: 'conifer', canopyBase: 0.22, belly: 0.0, taper: 1.4, trunkHalf: 0.06, trunkTaper: 0.3, widthRatio: 0.5 },
  oak: { profile: 'round', canopyBase: 0.42, belly: 0.5, taper: 1.5, trunkHalf: 0.08, trunkTaper: 0.15, widthRatio: 0.62 },
  cypress: { profile: 'column', canopyBase: 0.12, belly: 0.35, taper: 1.1, trunkHalf: 0.05, trunkTaper: 0.2, widthRatio: 0.22 },
  maple: { profile: 'round', canopyBase: 0.4, belly: 0.5, taper: 1.5, trunkHalf: 0.08, trunkTaper: 0.15, widthRatio: 0.68 },
};

const DEFAULT_PARAMS: ProfileParams = SPECIES_PROFILE.oak!;

/** Mid-height (world units) a species stands, used to size an impostor from a name. */
const SPECIES_HEIGHT: Partial<Record<TreeSpecies, number>> = {
  sequoia: 27, banyan: 6.5, baobab: 6.5, acacia: 5, pine: 4.2, oak: 4.2, cypress: 8, maple: 4.5,
};

/** Characteristic foliage tint per species (matches the full tree's recipe). */
function foliageFor(species: TreeSpecies | undefined, palette: Palette, rng: Rng): number {
  const base = new Color(rng.pick(palette.foliage));
  const toward: Partial<Record<TreeSpecies, number>> = {
    sequoia: 0x1f4a34, banyan: 0x1d5a3a, baobab: 0x6f8a3a, acacia: 0x8fa04a,
    cypress: 0x123a24, maple: 0x86a83a, pine: 0x2f5d2a, oak: 0x3f7d2f,
  };
  const t = species && toward[species] !== undefined ? new Color(toward[species]) : null;
  return t ? base.lerp(t, 0.4).getHex() : base.getHex();
}

export interface ImpostorOptions {
  /** Species to imitate (picks the silhouette, size and colours). */
  species?: TreeSpecies;
  /** Silhouette family, if not deriving it from `species`. */
  profile?: ImpostorProfile;
  /** Height in world units. Default: the species' typical height. */
  height?: number;
  /** Crown diameter in world units. Default: derived from height. */
  width?: number;
  /** Foliage colour (hex). Default: derived from the palette + species. */
  foliage?: number;
  /** Trunk colour (hex). Default: the palette trunk. */
  trunk?: number;
  seed?: number;
  palette?: Palette;
}

const IMP_UNIFORMS = /* glsl */ `
uniform float uImpWidth;
uniform float uImpHeight;
uniform vec3  uImpFoliage;
uniform vec3  uImpTrunk;
uniform float uImpCanopyBase;
uniform float uImpBelly;
uniform float uImpTaper;
uniform float uImpTrunkHalf;
uniform float uImpTrunkTaper;
uniform float uImpSeed;
varying vec2  vImpUv;
`;

// Cylindrical billboard: expand the quad around the instance's world origin
// using the camera's world right axis and world up — so it always faces the
// camera but stays upright. Per-instance scale is read from the instance matrix.
const IMP_PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
{
  mat4 scenaInst = mat4(1.0);
  #ifdef USE_INSTANCING
    scenaInst = instanceMatrix;
  #endif
  mat4 scenaWM = modelMatrix * scenaInst;
  vec3 scenaAnchor = scenaWM[3].xyz;
  float scenaScl = length(scenaWM[0].xyz);
  vec3 scenaRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
  vec3 scenaUp = vec3(0.0, 1.0, 0.0);
  vec3 scenaWorld = scenaAnchor
    + scenaRight * (position.x * uImpWidth * scenaScl)
    + scenaUp    * (position.y * uImpHeight * scenaScl);
  mvPosition = viewMatrix * vec4(scenaWorld, 1.0);
}
gl_Position = projectionMatrix * mvPosition;
`;

// Carve the species silhouette from the UVs, tint canopy vs. trunk, bake a
// vertical + lateral shading gradient for volume, and discard the empty corners.
const IMP_FRAG = /* glsl */ `
{
  float ix = vImpUv.x - 0.5;      // -0.5 … 0.5 across
  float iy = vImpUv.y;            // 0 base … 1 top
  float inside = 0.0;
  vec3  impCol = uImpTrunk;

  // Canopy: width peaks at the belly and tapers away, with a little edge wobble.
  if (iy >= uImpCanopyBase) {
    float t = (iy - uImpCanopyBase) / max(1.0 - uImpCanopyBase, 1e-3);
    float above = t - uImpBelly;
    float span = above > 0.0 ? (1.0 - uImpBelly) : uImpBelly;
    float k = clamp(1.0 - abs(above) / max(span, 1e-3), 0.0, 1.0);
    float w = 0.5 * pow(k, uImpTaper);
    w += 0.03 * sin(iy * 34.0 + uImpSeed) * step(0.02, w); // ragged edge
    if (abs(ix) < w) {
      inside = 1.0;
      float shade = 1.0 - 0.4 * (abs(ix) / max(w, 1e-3)); // rounder toward the edge
      impCol = uImpFoliage * (0.82 + 0.32 * iy) * shade;
    }
  }
  // Trunk: a tapering bar up to (and a little into) the canopy.
  float trunkTop = uImpCanopyBase + 0.08;
  if (iy < trunkTop) {
    float th = uImpTrunkHalf * (1.0 - uImpTrunkTaper * iy);
    if (abs(ix) < th) {
      inside = 1.0;
      impCol = uImpTrunk * (0.7 + 0.4 * iy);
    }
  }
  if (inside < 0.5) discard;
  diffuseColor.rgb = impCol;
}
`;

/**
 * A billboard **impostor** — a single camera-facing quad that stands in for a
 * full tree at distance. The species silhouette is carved procedurally from the
 * quad's UVs (no texture), lit by a baked gradient and three's fog, and the
 * billboard is expanded in the vertex shader so one shared quad faces the camera
 * for every instance. Built for {@link scatter}'s far-LOD slot, so a *dense
 * giant forest* — thousands of sequoias — can cull to a handful of draw calls
 * of billboards beyond the swap distance while the near tiles keep full geometry.
 *
 * ```ts
 * const far = createImpostor({ species: 'sequoia', palette });
 * // usually via treeLOD(), which pairs the full tree with this automatically:
 * scatter({ items: [treeLOD('sequoia', { palette })], lod: { distance: 90 } });
 * ```
 */
export function createImpostor(options: ImpostorOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const params = (options.species && SPECIES_PROFILE[options.species]) || DEFAULT_PARAMS;
  const height = options.height ?? (options.species ? SPECIES_HEIGHT[options.species] ?? 5 : 5);
  const width = options.width ?? height * params.widthRatio;
  const foliage = new Color(options.foliage ?? foliageFor(options.species, palette, rng));
  const trunk = new Color(options.trunk ?? palette.trunk);

  const uniforms = {
    uImpWidth: { value: width },
    uImpHeight: { value: height },
    uImpFoliage: { value: foliage },
    uImpTrunk: { value: trunk },
    uImpCanopyBase: { value: params.canopyBase },
    uImpBelly: { value: params.belly },
    uImpTaper: { value: params.taper },
    uImpTrunkHalf: { value: params.trunkHalf },
    uImpTrunkTaper: { value: params.trunkTaper },
    uImpSeed: { value: rng.range(0, 100) },
  };

  // A unit quad, base at y=0, so position.y is the 0…1 height and position.x
  // the -0.5…0.5 span — read directly as UVs in the shader (no uv attribute).
  const geometry = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const material = new MeshBasicMaterial({ fog: true });
  material.onBeforeCompile = (shader: PatchableShader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + IMP_UNIFORMS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vImpUv = vec2(position.x + 0.5, position.y);')
      .replace('#include <project_vertex>', IMP_PROJECT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + IMP_UNIFORMS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + IMP_FRAG);
  };
  material.customProgramCacheKey = () => 'scena-impostor-v1';

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false; // the billboard reaches beyond its origin
  const group = new Group();
  group.name = `impostor-${options.species ?? params.profile}`;
  group.add(mesh);

  // Match the full tree's steering footprint so a mixed near/far wood is honest.
  const obstacleRadius = options.species
    ? (options.species === 'sequoia' ? height * 0.06
      : options.species === 'banyan' ? height * 0.3
      : options.species === 'baobab' ? height * 0.16
      : width * 0.35)
    : width * 0.35;
  return { object: group, obstacleRadius };
}

export interface TreeLODOptions extends TreeOptions {
  /** Relative frequency among scatter items. Default 1. */
  weight?: number;
  /** Full-detail visual variants. Default 4. */
  variants?: number;
  /** Per-instance uniform scale range. Default [0.85, 1.2]. */
  scale?: [number, number];
}

/**
 * A {@link ScatterItem} that pairs a full {@link createTree} with its billboard
 * {@link createImpostor} — the near/far LOD couple. Drop it straight into
 * `scatter({ items, lod })` and tiles past the swap distance trade full trees
 * for camera-facing impostors, so a forest of giants stays a few draw calls at
 * range while the trees you can walk up to keep every branch.
 *
 * ```ts
 * const forest = scatter({
 *   area, surface: terrain.heightAt, density: 0.01, minSpacing: 7,
 *   items: [treeLOD('sequoia', { palette }), treeLOD('pine', { palette, weight: 3 })],
 *   lod: { distance: 90, tileSize: 24 },
 * });
 * scene.add(forest.group);
 * // each frame: forest.update(camera)
 * ```
 */
export function treeLOD(species: TreeSpecies, options: TreeLODOptions = {}): ScatterItem {
  const { weight, variants, scale, ...treeOptions } = options;
  return {
    create: (rng: Rng) => createTree({ ...treeOptions, species, seed: rng.int(1, 1e9) }),
    createFar: (rng: Rng) =>
      createImpostor({ species, palette: treeOptions.palette, seed: rng.int(1, 1e9) }),
    weight: weight ?? 1,
    variants: variants ?? 4,
    scale: scale ?? [0.85, 1.2],
  };
}
