import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { Prop } from '../core/types';

export interface FenceOptions {
  seed?: number;
  /** Run length along local +x. Default 6. */
  length?: number;
  postSpacing?: number;
  height?: number;
  palette?: Palette;
}

/**
 * A rustic fence run along local +x, centered at the origin: posts with
 * two slightly-crooked rails. Chain several and rotate to enclose areas.
 * The obstacle radius covers the whole run (rough but steering-safe);
 * for tight navigation, bake a navmesh — the geometry is authoritative.
 */
export function createFence(options: FenceOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const length = options.length ?? 6;
  const spacing = options.postSpacing ?? 1.5;
  const height = options.height ?? 1.1;

  const group = new Group();
  group.name = 'fence';
  const postMaterial = new MeshStandardMaterial({ color: palette.woodDark, flatShading: true });
  const railMaterial = new MeshStandardMaterial({ color: palette.wood, flatShading: true });

  const posts = Math.max(2, Math.round(length / spacing) + 1);
  const step = length / (posts - 1);
  for (let i = 0; i < posts; i++) {
    const post = new Mesh(new CylinderGeometry(0.06, 0.075, height, 5), postMaterial);
    post.position.set(-length / 2 + i * step, height / 2, rng.jitter(0, 0.03));
    post.rotation.z = rng.range(-0.04, 0.04);
    group.add(post);
  }
  for (const railY of [height * 0.55, height * 0.85]) {
    const rail = new Mesh(new BoxGeometry(length, 0.07, 0.05), railMaterial);
    rail.position.y = rng.jitter(railY, 0.02);
    rail.rotation.x = rng.range(-0.02, 0.02);
    group.add(rail);
  }

  return { object: group, obstacleRadius: length / 2 };
}
