import { BufferAttribute, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { Terrain } from './terrain';

export interface WaterOptions {
  /** World-space water surface height. Default 0.8. */
  level?: number;
  size?: number;
  resolution?: number;
  /** Wave height. Default 0.06. */
  amplitude?: number;
  /** Wave speed multiplier. Default 1. */
  speed?: number;
  palette?: Palette;
}

export interface Water {
  mesh: Mesh;
  level: number;
  /** Advance the wave animation. Call from your frame loop. */
  update(dt: number): void;
  /** Is ground at this height below the surface? */
  isUnderwater(groundHeight: number): boolean;
}

/**
 * A low-poly animated water plane at a fixed level. Pair it with a
 * terrain built using the same `waterLevel` so shores blend to sand, and
 * keep scatter/agents ashore with `aboveWater(terrain, water)`.
 */
export function createWater(options: WaterOptions = {}): Water {
  const level = options.level ?? 0.8;
  const size = options.size ?? 200;
  const resolution = options.resolution ?? 40;
  const amplitude = options.amplitude ?? 0.06;
  const speed = options.speed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;

  const geometry = new PlaneGeometry(size, size, resolution, resolution);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position') as BufferAttribute;
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: palette.water,
      transparent: true,
      opacity: 0.85,
      flatShading: true,
      metalness: 0.35,
      roughness: 0.4,
    })
  );
  mesh.name = 'water';
  mesh.position.y = level;

  let time = 0;
  const update = (dt: number): void => {
    time += dt * speed;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      positions.setY(
        i,
        Math.sin(x * 0.35 + time) * Math.cos(z * 0.3 + time * 0.8) * amplitude
      );
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  };
  update(0);

  return {
    mesh,
    level,
    update,
    isUnderwater: (groundHeight) => groundHeight < level,
  };
}

/**
 * A scatter mask keeping placements on dry land: true when the terrain
 * at (x, z) sits above the water level plus `margin`.
 */
export function aboveWater(
  terrain: Terrain,
  water: Pick<Water, 'level'>,
  margin = 0.25
): (x: number, z: number) => boolean {
  return (x, z) => terrain.heightAt(x, z) > water.level + margin;
}
