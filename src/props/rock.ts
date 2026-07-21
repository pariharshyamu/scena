import {
  BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { Prop } from '../core/types';

export interface RockOptions {
  seed?: number;
  /** Approximate radius. Default ~0.4–1.1 by seed. */
  size?: number;
  palette?: Palette;
}

/**
 * A seeded low-poly boulder: an icosahedron with jittered vertices and a
 * flattened underside so it sits on the ground.
 */
export function createRock(options: RockOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const size = options.size ?? rng.range(0.4, 1.1);

  const geometry = new IcosahedronGeometry(size, 0);
  const positions = geometry.getAttribute('position') as BufferAttribute;
  // Jitter welded-by-value: identical vertex values get identical offsets,
  // so faces stay connected.
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < positions.count; i++) {
    const key = `${positions.getX(i).toFixed(4)},${positions.getY(i).toFixed(4)},${positions.getZ(i).toFixed(4)}`;
    let offset = seen.get(key);
    if (!offset) {
      offset = [rng.jitter(0, size * 0.22), rng.jitter(0, size * 0.16), rng.jitter(0, size * 0.22)];
      seen.set(key, offset);
    }
    positions.setXYZ(
      i,
      positions.getX(i) + offset[0],
      Math.max(positions.getY(i) + offset[1], -size * 0.15), // flatten the bottom
      positions.getZ(i) + offset[2]
    );
  }
  geometry.computeVertexNormals();

  const rock = new Mesh(
    geometry,
    new MeshStandardMaterial({ color: rng.pick(palette.rock), flatShading: true })
  );
  rock.position.y = size * 0.15;
  rock.scale.y = rng.range(0.6, 0.9);

  const group = new Group();
  group.name = 'rock';
  group.add(rock);
  return { object: group, obstacleRadius: size * 1.05 };
}
