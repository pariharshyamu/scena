import { BoxGeometry, Group, Mesh } from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { Carryable } from '../core/types';

export interface CrateOptions {
  seed?: number;
  size?: number;
  /** 0–1 color wear. Default 0.3. */
  weathering?: number;
  palette?: Palette;
}

/**
 * A wooden crate: panel box with darker edge framing, seeded wear tint. It's
 * a **carryable** — hand it to ANIMA's `Carry` and a character hoists it to
 * the chest (`carry: 'crate'`), the hold point offset to the box's centre.
 */
export function createCrate(options: CrateOptions = {}): Carryable {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const size = options.size ?? 1;
  const wear = options.weathering ?? 0.3;

  const group = new Group();
  group.name = 'crate';

  const panelMaterial = createSurface('plank', { color: palette.wood, seed: options.seed ?? 1 });
  panelMaterial.color.offsetHSL(0, 0, -rng.range(0, wear * 0.18));
  const frameMaterial = createSurface('wood', { color: palette.woodDark, seed: (options.seed ?? 1) + 3 });

  const body = new Mesh(new BoxGeometry(size * 0.92, size * 0.92, size * 0.92), panelMaterial);
  body.position.y = size / 2;
  group.add(body);

  const beam = size * 0.12;
  const long = size * 1.0;
  for (const y of [beam / 2, size - beam / 2]) {
    for (const [rx, rz, w, d] of [
      [0, size / 2 - beam / 2, long, beam],
      [0, -(size / 2 - beam / 2), long, beam],
      [size / 2 - beam / 2, 0, beam, long],
      [-(size / 2 - beam / 2), 0, beam, long],
    ] as const) {
      const rail = new Mesh(new BoxGeometry(w, beam, d), frameMaterial);
      rail.position.set(rx, y, rz);
      group.add(rail);
    }
  }
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(beam, size, beam), frameMaterial);
      post.position.set(x * (size / 2 - beam / 2), size / 2, z * (size / 2 - beam / 2));
      group.add(post);
    }
  }
  group.rotation.y = rng.range(0, Math.PI / 2);

  return {
    object: group,
    obstacleRadius: size * 0.75,
    carry: 'crate',
    // Origin is the base: lift the hold point to the centre (y) and push it
    // forward by half the depth (z) so the box rides IN FRONT of the chest,
    // not merged into it.
    grip: { y: -size / 2, z: size / 2 },
  };
}
