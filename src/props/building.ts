import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { Prop } from '../core/types';

/** A gabled-roof prism: ridge along local z, base resting on y = 0. */
function prismGeometry(width: number, height: number, depth: number): BufferGeometry {
  const w = width / 2;
  const d = depth / 2;
  // prettier-ignore
  const positions = new Float32Array([
    // front gable (z = +d)
    -w, 0, d,   w, 0, d,   0, height, d,
    // back gable (z = -d)
    w, 0, -d,  -w, 0, -d,   0, height, -d,
    // left slope
    -w, 0, -d,  -w, 0, d,   0, height, d,
    -w, 0, -d,   0, height, d,   0, height, -d,
    // right slope
    w, 0, d,   w, 0, -d,   0, height, -d,
    w, 0, d,   0, height, -d,   0, height, d,
    // bottom
    -w, 0, -d,   w, 0, -d,   w, 0, d,
    -w, 0, -d,   w, 0, d,  -w, 0, d,
  ]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export interface HouseOptions {
  seed?: number;
  /** Footprint width (gable side). Default seeded 3.2–4.2. */
  width?: number;
  depth?: number;
  wallHeight?: number;
  palette?: Palette;
}

/**
 * A cottage: plastered walls, gabled roof, door, chimney and emissive
 * windows. Pass the house in `createDayCycle`'s `lamps` list and its
 * windows glow at night along with the street lamps. A stone foundation
 * extends below ground so sloped terrain never shows a gap.
 */
export function createHouse(options: HouseOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const width = options.width ?? rng.range(3.2, 4.2);
  const depth = options.depth ?? width * rng.range(0.75, 0.9);
  const wallHeight = options.wallHeight ?? rng.range(2.1, 2.4);

  const group = new Group();
  group.name = 'house';
  const wall = new MeshStandardMaterial({ color: palette.wall, flatShading: true });
  wall.color.offsetHSL(0, 0, rng.range(-0.03, 0.03));
  const roof = new MeshStandardMaterial({ color: palette.roof, flatShading: true });
  roof.color.offsetHSL(0, 0, rng.range(-0.04, 0.04));
  const stone = new MeshStandardMaterial({ color: palette.rock[0], flatShading: true });
  const wood = new MeshStandardMaterial({ color: palette.woodDark, flatShading: true });

  const foundation = new Mesh(new BoxGeometry(width + 0.3, 1.6, depth + 0.3), stone);
  foundation.position.y = -0.55;
  group.add(foundation);

  const body = new Mesh(new BoxGeometry(width, wallHeight, depth), wall);
  body.position.y = wallHeight / 2;
  group.add(body);

  const ridgeHeight = width * rng.range(0.32, 0.4);
  const roofMesh = new Mesh(prismGeometry(width + 0.5, ridgeHeight, depth + 0.6), roof);
  roofMesh.position.y = wallHeight - 0.02;
  group.add(roofMesh);

  const chimney = new Mesh(new BoxGeometry(0.34, ridgeHeight + 0.8, 0.34), stone);
  chimney.position.set(rng.pick([-1, 1]) * width * 0.22, wallHeight + ridgeHeight * 0.45, depth * 0.12);
  group.add(chimney);

  // Door on the front face (+z).
  const door = new Mesh(new BoxGeometry(0.85, 1.5, 0.08), wood);
  door.position.set(rng.range(-0.4, 0.4), 0.75, depth / 2 + 0.02);
  group.add(door);

  // Emissive windows — createDayCycle treats these like lamp bulbs.
  const glass = new MeshStandardMaterial({
    color: palette.lampGlow,
    emissive: palette.lampGlow,
    emissiveIntensity: 1.0,
  });
  const windowGeometry = new BoxGeometry(0.6, 0.62, 0.08);
  const front = new Mesh(windowGeometry, glass);
  front.position.set(door.position.x < 0 ? width * 0.28 : -width * 0.28, 1.35, depth / 2 + 0.02);
  group.add(front);
  for (const side of [-1, 1]) {
    if (rng.next() < 0.35) continue;
    const pane = new Mesh(windowGeometry, glass);
    pane.position.set(side * (width / 2 + 0.02), 1.35, rng.range(-0.3, 0.3) * depth);
    pane.rotation.y = Math.PI / 2;
    group.add(pane);
  }

  return { object: group, obstacleRadius: Math.hypot(width + 0.5, depth + 0.5) / 2 };
}

export interface TowerOptions {
  seed?: number;
  height?: number;
  palette?: Palette;
}

/** A wooden watchtower: splayed legs, platform with railing, pyramid roof. */
export function createTower(options: TowerOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const height = options.height ?? rng.range(4.2, 5.2);

  const group = new Group();
  group.name = 'tower';
  const wood = new MeshStandardMaterial({ color: palette.wood, flatShading: true });
  const woodDark = new MeshStandardMaterial({ color: palette.woodDark, flatShading: true });
  const roof = new MeshStandardMaterial({ color: palette.roof, flatShading: true });

  const spread = 1.0;
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const leg = new Mesh(new CylinderGeometry(0.09, 0.12, height, 6), woodDark);
      leg.position.set(x * spread * 0.75, height / 2 - 0.6, z * spread * 0.75);
      leg.rotation.z = -x * 0.1;
      leg.rotation.x = z * 0.1;
      group.add(leg);
    }
  }
  // Cross-braces.
  for (const level of [0.3, 0.62]) {
    const brace = new Mesh(new BoxGeometry(spread * 2.1, 0.09, 0.07), wood);
    brace.position.set(0, height * level, spread * 0.82 * (1 - level * 0.35));
    brace.rotation.z = rng.pick([-0.5, 0.5]);
    group.add(brace);
    const braceSide = new Mesh(new BoxGeometry(0.07, 0.09, spread * 2.1), wood);
    braceSide.position.set(spread * 0.82 * (1 - level * 0.35), height * level, 0);
    braceSide.rotation.x = rng.pick([-0.5, 0.5]);
    group.add(braceSide);
  }

  const platform = new Mesh(new BoxGeometry(spread * 2.2, 0.14, spread * 2.2), wood);
  platform.position.y = height - 0.5;
  group.add(platform);
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.08, 0.9, 0.08), woodDark);
      post.position.set(x * spread * 1.0, height - 0.05, z * spread * 1.0);
      group.add(post);
    }
  }
  for (const [rx, rz, w, d] of [
    [0, 1, spread * 2.1, 0.06],
    [0, -1, spread * 2.1, 0.06],
    [1, 0, 0.06, spread * 2.1],
    [-1, 0, 0.06, spread * 2.1],
  ] as const) {
    const rail = new Mesh(new BoxGeometry(w, 0.07, d), wood);
    rail.position.set(rx * spread, height + 0.28, rz * spread);
    group.add(rail);
  }

  const cap = new Mesh(new CylinderGeometry(0, spread * 1.55, 1.0, 4), roof);
  cap.position.y = height + 1.15;
  cap.rotation.y = Math.PI / 4;
  group.add(cap);

  return { object: group, obstacleRadius: spread * 1.35 };
}

export interface WellOptions {
  seed?: number;
  palette?: Palette;
}

/** A stone well: ring, posts, little gabled roof, hanging bucket. */
export function createWell(options: WellOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = 'well';
  const stone = new MeshStandardMaterial({ color: rng.pick(palette.rock), flatShading: true });
  const wood = new MeshStandardMaterial({ color: palette.woodDark, flatShading: true });
  const roof = new MeshStandardMaterial({ color: palette.roof, flatShading: true });

  const ring = new Mesh(new CylinderGeometry(0.85, 0.95, 0.75, 10), stone);
  ring.position.y = 0.375;
  group.add(ring);
  const inner = new Mesh(
    new CylinderGeometry(0.62, 0.62, 0.05, 10),
    new MeshStandardMaterial({ color: 0x16222e })
  );
  inner.position.y = 0.76;
  group.add(inner);

  for (const side of [-1, 1]) {
    const post = new Mesh(new CylinderGeometry(0.06, 0.075, 1.9, 5), wood);
    post.position.set(side * 0.72, 0.95, 0);
    group.add(post);
  }
  const bar = new Mesh(new CylinderGeometry(0.045, 0.045, 1.5, 5), wood);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.72;
  group.add(bar);

  const cap = new Mesh(prismGeometry(2.0, 0.55, 0.65), roof);
  cap.position.y = 1.86;
  cap.rotation.y = Math.PI / 2;
  group.add(cap);

  const rope = new Mesh(new CylinderGeometry(0.012, 0.012, 0.6, 4), wood);
  rope.position.y = 1.42;
  group.add(rope);
  const bucket = new Mesh(new CylinderGeometry(0.13, 0.1, 0.2, 7), wood);
  bucket.position.y = 1.05;
  group.add(bucket);

  return { object: group, obstacleRadius: 1.0 };
}

export interface RuinOptions {
  seed?: number;
  /** Footprint width. Default seeded 3.5–5. */
  size?: number;
  palette?: Palette;
}

/**
 * A ruined building: a partial rectangle of crumbling wall segments with
 * seeded gaps and heights, and tumbled blocks around the floor.
 */
export function createRuin(options: RuinOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const size = options.size ?? rng.range(3.5, 5);
  const depth = size * rng.range(0.7, 0.9);

  const group = new Group();
  group.name = 'ruin';
  const stone = new MeshStandardMaterial({ color: rng.pick(palette.rock), flatShading: true });
  stone.color.offsetHSL(0, 0, rng.range(-0.04, 0.02));

  const thickness = 0.35;
  // Wall runs: [centerX, centerZ, length, alongX]. Front wall mostly gone.
  const runs: Array<[number, number, number, boolean]> = [
    [0, -depth / 2, size, true],
    [-size / 2, 0, depth, false],
    [size / 2, 0, depth, false],
    [size * 0.3, depth / 2, size * 0.35, true],
  ];
  for (const [cx, cz, length, alongX] of runs) {
    const segments = Math.max(2, Math.round(length / 1.1));
    const step = length / segments;
    for (let i = 0; i < segments; i++) {
      if (rng.next() < 0.22) continue; // collapsed gap
      const height = rng.range(0.5, 2.2);
      const wall = new Mesh(
        new BoxGeometry(alongX ? step * 0.96 : thickness, height, alongX ? thickness : step * 0.96),
        stone
      );
      const offset = -length / 2 + step * (i + 0.5);
      wall.position.set(alongX ? cx + offset : cx, height / 2, alongX ? cz : cz + offset);
      wall.rotation.y = rng.range(-0.03, 0.03);
      group.add(wall);
    }
  }
  // Tumbled blocks.
  const blocks = rng.int(4, 7);
  for (let i = 0; i < blocks; i++) {
    const s = rng.range(0.25, 0.55);
    const block = new Mesh(new BoxGeometry(s, s * rng.range(0.6, 1), s * rng.range(0.7, 1.2)), stone);
    block.position.set(rng.range(-size * 0.6, size * 0.6), s * 0.3, rng.range(-depth * 0.6, depth * 0.7));
    block.rotation.set(rng.range(-0.3, 0.3), rng.range(0, Math.PI), rng.range(-0.3, 0.3));
    group.add(block);
  }

  return { object: group, obstacleRadius: Math.hypot(size, depth) / 2 };
}
