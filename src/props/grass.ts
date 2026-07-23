import { ConeGeometry, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial } from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { WindField } from '../environment/wind';
import type { Prop } from '../core/types';

export interface GrassOptions {
  seed?: number;
  /** Blades per tuft. Default 4–6 by seed. */
  blades?: number;
  /** A WindField to sway the blades in. */
  wind?: WindField;
  palette?: Palette;
}

/**
 * A tuft of grass blades — pure scatter fodder (zero obstacle footprint,
 * walk straight through). Sways beautifully under `applyWind`.
 */
export function createGrassTuft(options: GrassOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const blades = options.blades ?? rng.int(4, 6);
  const group = new Group();
  group.name = 'grass';
  const material = new MeshStandardMaterial({
    color: rng.next() < 0.5 ? palette.grassHigh : rng.pick(palette.foliage),
    flatShading: true,
  });
  for (let i = 0; i < blades; i++) {
    const height = rng.range(0.25, 0.5);
    const blade = new Mesh(new ConeGeometry(0.035, height, 3), material);
    blade.position.set(rng.jitter(0, 0.12), height / 2, rng.jitter(0, 0.12));
    blade.rotation.set(rng.range(-0.25, 0.25), rng.range(0, Math.PI), rng.range(-0.25, 0.25));
    group.add(blade);
  }
  // Whole-blade sway from near the base (soft, stiffness ~1.2).
  if (options.wind) options.wind.sway(group, { height: 0.5, stiffness: 1.2, anchor: 0.04 });
  return { object: group, obstacleRadius: 0 };
}

export interface BushOptions {
  seed?: number;
  size?: number;
  /** A WindField to gently sway the foliage in. */
  wind?: WindField;
  palette?: Palette;
}

/** A low foliage bush: two or three squashed blobs. Small footprint. */
export function createBush(options: BushOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const size = options.size ?? rng.range(0.4, 0.7);
  const group = new Group();
  group.name = 'bush';
  const material = new MeshStandardMaterial({ color: rng.pick(palette.foliage), flatShading: true });
  const blobs = rng.int(2, 3);
  for (let i = 0; i < blobs; i++) {
    const radius = size * rng.range(0.55, 0.85);
    const blob = new Mesh(new IcosahedronGeometry(radius, 0), material);
    blob.position.set(rng.jitter(0, size * 0.4), radius * 0.7, rng.jitter(0, size * 0.4));
    blob.scale.y = rng.range(0.7, 0.85);
    blob.rotation.y = rng.range(0, Math.PI);
    group.add(blob);
  }
  // Gentle, stiff sway — a bush barely nods.
  if (options.wind) options.wind.sway(group, { height: size, stiffness: 2.2, anchor: size * 0.25 });
  return { object: group, obstacleRadius: size * 0.6 };
}
