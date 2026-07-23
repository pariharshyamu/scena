import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { WindField } from '../environment/wind';
import type { Prop } from '../core/types';

export interface TreeOptions {
  seed?: number;
  /** Overall height in world units. Default ~3.5–5 by seed. */
  height?: number;
  style?: 'pine' | 'oak';
  /** A WindField to sway the canopy in (the trunk stays planted). */
  wind?: WindField;
  palette?: Palette;
}

/**
 * A seeded low-poly tree. `pine` stacks cones; `oak` clusters foliage
 * blobs on a forked trunk. Same seed → identical tree, forever.
 */
export function createTree(options: TreeOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const style = options.style ?? (rng.next() < 0.6 ? 'pine' : 'oak');
  const height = options.height ?? rng.range(3.2, 5.2);
  const group = new Group();
  group.name = `tree-${style}`;

  const trunkMaterial = new MeshStandardMaterial({ color: palette.trunk, flatShading: true });
  const foliageMaterial = new MeshStandardMaterial({
    color: rng.pick(palette.foliage),
    flatShading: true,
  });

  if (style === 'pine') {
    const trunkHeight = height * 0.25;
    const trunk = new Mesh(new CylinderGeometry(0.09, 0.14, trunkHeight, 6), trunkMaterial);
    trunk.position.y = trunkHeight / 2;
    group.add(trunk);

    const tiers = rng.int(3, 4);
    let y = trunkHeight;
    let radius = height * rng.range(0.24, 0.3);
    const tierHeight = (height - trunkHeight) / tiers + 0.15;
    for (let i = 0; i < tiers; i++) {
      const cone = new Mesh(new ConeGeometry(radius, tierHeight * 1.35, 7), foliageMaterial);
      cone.position.y = y + tierHeight * 0.55;
      cone.rotation.y = rng.range(0, Math.PI);
      group.add(cone);
      y += tierHeight * 0.8;
      radius *= 0.72;
    }
  } else {
    const trunkHeight = height * 0.45;
    const trunk = new Mesh(new CylinderGeometry(0.12, 0.2, trunkHeight, 6), trunkMaterial);
    trunk.position.y = trunkHeight / 2;
    trunk.rotation.z = rng.range(-0.08, 0.08);
    group.add(trunk);

    const blobs = rng.int(2, 4);
    for (let i = 0; i < blobs; i++) {
      const radius = height * rng.range(0.18, 0.28);
      const blob = new Mesh(new IcosahedronGeometry(radius, 0), foliageMaterial);
      blob.position.set(
        rng.jitter(0, height * 0.16),
        trunkHeight + radius * rng.range(0.5, 0.9) + i * radius * 0.35,
        rng.jitter(0, height * 0.16)
      );
      blob.rotation.set(rng.range(0, Math.PI), rng.range(0, Math.PI), 0);
      group.add(blob);
    }
  }

  // Only the canopy sways — the trunk material is left unbound, so it stays
  // planted. (For a scattered forest, prefer applyWind(forest.group), which
  // drives the shared clock from the rendered InstancedMesh.)
  if (options.wind) {
    options.wind.bind(foliageMaterial, { height, stiffness: 2.4, anchor: height * 0.22 });
    options.wind.attach(group);
  }

  return { object: group, obstacleRadius: style === 'pine' ? 0.5 : 0.6 };
}
