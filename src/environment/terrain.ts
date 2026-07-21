import {
  BufferAttribute,
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { fractalNoise2 } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';

export interface TerrainOptions {
  seed?: number;
  /** Square side length. Default 80. */
  size?: number;
  /** Vertices per side. Default 96. */
  resolution?: number;
  /** Peak height. Default 6. */
  amplitude?: number;
  /** Noise feature size in world units. Default 28. */
  noiseScale?: number;
  octaves?: number;
  /** Flatten low areas into meadows (0–1, higher = flatter valleys). Default 0.55. */
  valleyFlatness?: number;
  palette?: Palette;
}

export interface Terrain {
  mesh: Mesh;
  /** Exact analytic height at any (x, z) — same function that built the
   *  mesh, so agents/navmesh queries never disagree with the visuals. */
  heightAt(x: number, z: number): number;
  size: number;
  seed: number;
}

/**
 * A seeded low-poly terrain: fractal value noise displacing a plane, with
 * height/slope-banded vertex colors (grass → high grass → cliff → peak).
 * The height function is exported, not just baked into vertices — that's
 * what lets gameplay (spawning, scattering, navmesh baking, agent ground
 * clamping) agree exactly with what's rendered.
 */
export function createTerrain(options: TerrainOptions = {}): Terrain {
  const seed = options.seed ?? 1;
  const size = options.size ?? 80;
  const resolution = options.resolution ?? 96;
  const amplitude = options.amplitude ?? 6;
  const noiseScale = options.noiseScale ?? 28;
  const octaves = options.octaves ?? 4;
  const flatness = options.valleyFlatness ?? 0.55;
  const palette = options.palette ?? DEFAULT_PALETTE;

  const heightAt = (x: number, z: number): number => {
    const n = fractalNoise2(x / noiseScale, z / noiseScale, seed, octaves);
    // Push valleys down and flatten them; keep peaks.
    const shaped = Math.pow(n, 1 + flatness * 2);
    return shaped * amplitude;
  };

  const geometry = new PlaneGeometry(size, size, resolution - 1, resolution - 1);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, heightAt(positions.getX(i), positions.getZ(i)));
  }
  geometry.computeVertexNormals();

  // Vertex colors by height band + slope.
  const normals = geometry.getAttribute('normal') as BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const grassLow = new Color(palette.grassLow);
  const grassHigh = new Color(palette.grassHigh);
  const cliff = new Color(palette.cliff);
  const peak = new Color(palette.peak);
  const scratch = new Color();
  for (let i = 0; i < positions.count; i++) {
    const h = positions.getY(i) / amplitude;
    const slope = 1 - normals.getY(i); // 0 flat … 1 vertical
    scratch.copy(grassLow).lerp(grassHigh, Math.min(1, h * 1.6));
    if (h > 0.75) scratch.lerp(peak, (h - 0.75) * 4);
    if (slope > 0.15) scratch.lerp(cliff, Math.min(1, (slope - 0.15) * 4));
    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ vertexColors: true, flatShading: true })
  );
  mesh.name = 'terrain';

  return { mesh, heightAt, size, seed };
}
