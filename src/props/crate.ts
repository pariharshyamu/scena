import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { Prop } from '../core/types';

export interface CrateOptions {
  seed?: number;
  size?: number;
  /** 0–1 color wear. Default 0.3. */
  weathering?: number;
  palette?: Palette;
}

/** A wooden crate: panel box with darker edge framing, seeded wear tint. */
export function createCrate(options: CrateOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const size = options.size ?? 1;
  const wear = options.weathering ?? 0.3;

  const group = new Group();
  group.name = 'crate';

  const panelMaterial = new MeshStandardMaterial({ color: palette.wood, flatShading: true });
  panelMaterial.color.offsetHSL(0, 0, -rng.range(0, wear * 0.18));
  const frameMaterial = new MeshStandardMaterial({ color: palette.woodDark, flatShading: true });

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

  return { object: group, obstacleRadius: size * 0.75 };
}
