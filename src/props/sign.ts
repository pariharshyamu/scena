import {
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { buildTextGeometry, measureText } from '../text/textGeometry';
import type { Prop } from '../core/types';

export type SignKind = 'post' | 'hanging' | 'fingerpost' | 'milestone';

/** One arm of a fingerpost: a place name and the way to it. */
export interface Direction {
  text: string;
  /** Compass-ish bearing in degrees the arm points (0 = +X, 90 = +Z). Default seeded. */
  angle?: number;
  /** Arm height up the post, in metres. Default stacked automatically. */
  height?: number;
}

export interface SignOptions {
  seed?: number;
  /** post (board on a post), hanging (a swaying shop sign), fingerpost (direction arms), milestone (carved stone). */
  kind?: SignKind;
  /** The words on the sign. Default a seeded place name. Ignored by fingerpost (use `directions`). */
  text?: string;
  /** Fingerpost arms. Default three seeded directions. */
  directions?: Direction[];
  /** Board/paint colour of the lettering (hex). Default seeded cream/gold. */
  inkColor?: number;
  /** Board face colour (hex). Default palette wood. */
  boardColor?: number;
  /** Overall height in metres (post top). Default per-kind. */
  height?: number;
  palette?: Palette;
}

const PLACE_NAMES = ['HAVENBROOK', 'MILLFORD', 'OAKVALE', 'GREYMOOR', 'ASHFORD', 'WESTWATCH', 'THORNWICK'];
const DIR_NAMES = ['MARKET', 'HARBOUR', 'THE MILL', 'CASTLE', 'FORGE', 'CHAPEL', 'FERRY', 'THE INN'];
const INKS = [0xf0e6cf, 0xe8d9a8, 0xd8b878, 0xdccdb0]; // cream, straw, faded gold, bone

/**
 * A signpost with real, legible lettering — the "stylised text on props"
 * frontier. Letters are carved as merged relief geometry from an embedded
 * vector font (no textures, no font files, no `three/examples` loaders), so a
 * sign reads the same in a browser, a headless capture and a Node test.
 *
 *  - `post`      a plank on a post, lettered on both faces.
 *  - `hanging`   a shop sign on a bracket arm that sways gently on its hooks —
 *                self-animated from the render loop, like the banners.
 *  - `fingerpost` a cluster of pointed arms, each naming a place and pointing
 *                the way (great for "MARKET →", "HARBOUR →").
 *  - `milestone` a weathered stone marker with the name cut dark into it.
 */
export function createSign(options: SignOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;
  const kind = options.kind ?? 'post';
  const ink = options.inkColor ?? rng.pick(INKS);

  const group = new Group();
  group.name = 'sign';

  const wood = () => createSurface('wood', { color: options.boardColor ?? palette.wood, seed });
  const woodDark = createSurface('wood', { color: palette.woodDark, seed: seed + 3 });
  const iron = createSurface('metal', { color: 0x2f333b, tint: 0x14161a, tintAmount: 0.35, seed: seed + 5 });

  // Lettering paint: legible day and night via a touch of emissive, but kept
  // below the day-cycle's lamp threshold (0.5) so it never glows like a lamp.
  const inkMat = new MeshStandardMaterial({
    color: ink,
    roughness: 0.72,
    metalness: 0.0,
    emissive: ink,
    emissiveIntensity: 0.28,
    flatShading: true,
  });

  if (kind === 'milestone') {
    buildMilestone(group, options.text ?? rng.pick(PLACE_NAMES), palette, seed);
    return { object: group, obstacleRadius: 0.42 };
  }

  if (kind === 'fingerpost') {
    const directions =
      options.directions ??
      pickDirections(rng, options.text ? [options.text, ...DIR_NAMES] : DIR_NAMES);
    const postH = options.height ?? 3.4;
    const post = new Mesh(new CylinderGeometry(0.075, 0.09, postH, 9), woodDark);
    post.position.y = postH / 2;
    group.add(post);
    const cap = new Mesh(new SphereGeometry(0.12, 10, 8), iron);
    cap.position.y = postH + 0.02;
    group.add(cap);

    const n = directions.length;
    directions.forEach((d, i) => {
      const angle = d.angle ?? (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const y = d.height ?? postH - 0.5 - i * 0.62;
      const arm = fingerArm(d.text, wood(), inkMat, seed + i);
      arm.position.y = y;
      arm.rotation.y = angle;
      group.add(arm);
    });
    return { object: group, obstacleRadius: 0.4 };
  }

  const text = options.text ?? rng.pick(PLACE_NAMES);
  const boardH = 0.62;
  const pad = 0.28;
  const boardW = Math.max(1.4, measureText(text, { size: boardH * 0.46 }) + pad * 2);
  const boardT = 0.08;

  if (kind === 'hanging') {
    const postH = options.height ?? 3.0;
    const post = new Mesh(new CylinderGeometry(0.07, 0.085, postH, 9), woodDark);
    post.position.y = postH / 2;
    group.add(post);
    // Bracket arm reaching out over the street.
    const armLen = boardW * 0.5 + 0.35;
    const arm = new Mesh(new BoxGeometry(armLen, 0.09, 0.09), iron);
    arm.position.set(armLen / 2, postH - 0.18, 0);
    group.add(arm);
    const brace = new Mesh(new CylinderGeometry(0.03, 0.03, 0.55, 6), iron);
    brace.position.set(armLen * 0.42, postH - 0.5, 0);
    brace.rotation.z = Math.PI / 4;
    group.add(brace);

    // The board hangs from two hooks and sways — a pivot group swung from the
    // render loop, phase seeded so neighbouring signs never swing in lockstep.
    const armTipX = armLen - 0.12;
    const pivot = new Group();
    pivot.name = 'signPivot';
    pivot.position.set(armTipX, postH - 0.22, 0);
    group.add(pivot);
    for (const dx of [-boardW * 0.34, boardW * 0.34]) {
      const link = new Mesh(new TorusGeometry(0.05, 0.016, 6, 10), iron);
      link.position.set(dx, -0.16, 0);
      link.rotation.x = Math.PI / 2;
      pivot.add(link);
      const chain = new Mesh(new CylinderGeometry(0.012, 0.012, 0.3, 5), iron);
      chain.position.set(dx, -0.16, 0);
      pivot.add(chain);
    }
    const board = letteredBoard(text, boardW, boardH, boardT, wood(), inkMat, true);
    board.position.y = -0.5;
    pivot.add(board);

    // three only fires onBeforeRender on rendered objects (a Group never gets
    // it), so the driver rides the board mesh but swings the pivot above it —
    // then re-solves the pivot's subtree so the board draws swung this frame.
    const phase = (seed % 100) * 0.21;
    board.children[0].onBeforeRender = () => {
      const t = (typeof performance !== 'undefined' ? performance.now() : 0) * 0.001;
      pivot.rotation.z = Math.sin(t * 1.6 + phase) * 0.05;
      pivot.updateMatrixWorld(true);
    };
    return { object: group, obstacleRadius: 0.3 };
  }

  // kind === 'post'
  const postH = options.height ?? 2.05;
  const gap = 0.16;
  const boardCenterY = postH - boardH / 2 - 0.05;
  for (const dx of [-boardW * 0.32, boardW * 0.32]) {
    const post = new Mesh(new CylinderGeometry(0.055, 0.07, postH, 8), woodDark);
    post.position.set(dx, postH / 2, 0);
    group.add(post);
  }
  const board = letteredBoard(text, boardW, boardH, boardT, wood(), inkMat, true);
  board.position.y = boardCenterY;
  group.add(board);
  // A little peaked cap rail over the board.
  const rail = new Mesh(new BoxGeometry(boardW + 0.12, 0.07, boardT + 0.12), woodDark);
  rail.position.y = boardCenterY + boardH / 2 + 0.06;
  group.add(rail);
  void gap;
  return { object: group, obstacleRadius: 0.3 };
}

// ---- pieces ------------------------------------------------------------

/** A rectangular board with lettering laid on the front face (and back if two-sided). */
function letteredBoard(
  text: string,
  w: number,
  h: number,
  t: number,
  boardMat: MeshStandardMaterial,
  inkMat: MeshStandardMaterial,
  twoSided: boolean
): Group {
  const g = new Group();
  const board = new Mesh(new BoxGeometry(w, h, t), boardMat);
  g.add(board);
  const size = h * 0.46;
  const front = new Mesh(buildTextGeometry(text, { size, align: 'center' }).geometry, inkMat);
  front.position.z = t / 2 + 0.005;
  g.add(front);
  if (twoSided) {
    const back = new Mesh(buildTextGeometry(text, { size, align: 'center' }).geometry, inkMat);
    back.position.z = -t / 2 - 0.005;
    back.rotation.y = Math.PI;
    g.add(back);
  }
  return g;
}

/** A pointed direction arm: a plank tapering to a point, lettered along it. */
function fingerArm(text: string, boardMat: MeshStandardMaterial, inkMat: MeshStandardMaterial, seed: number): Group {
  const g = new Group();
  const h = 0.4;
  const t = 0.07;
  const size = h * 0.5;
  const textW = measureText(text, { size });
  const len = Math.max(1.5, textW + 0.65); // room for text + the point
  const plank = extrudePolygon(
    [
      [0, -h / 2],
      [len - h * 0.85, -h / 2],
      [len, 0],
      [len - h * 0.85, h / 2],
      [0, h / 2],
    ],
    t
  );
  const arm = new Mesh(plank, boardMat);
  g.add(arm);
  // Text hugs the shaft, left-aligned from the post end.
  const label = new Mesh(buildTextGeometry(text, { size, align: 'left' }).geometry, inkMat);
  label.position.set(0.22, 0, t / 2 + 0.004);
  g.add(label);
  void seed;
  return g;
}

/** A weathered stone marker with the name cut dark into the face. */
function buildMilestone(group: Group, text: string, palette: Palette, seed: number): void {
  const stone = createSurface('stone', { color: palette.rock[0], seed });
  const h = 0.95;
  const slab = new Mesh(
    extrudePolygon(
      [
        [-0.42, 0],
        [0.42, 0],
        [0.42, h * 0.7],
        [0.24, h],
        [-0.24, h],
        [-0.42, h * 0.7],
      ],
      0.26
    ),
    stone
  );
  group.add(slab);
  // Dark, recessed carving — matte, no emissive, sunk just below the face.
  const carveMat = new MeshStandardMaterial({ color: 0x2a2622, roughness: 0.95, flatShading: true });
  const size = 0.2;
  const label = new Mesh(buildTextGeometry(text, { size, align: 'center', depth: 0.012 }).geometry, carveMat);
  label.position.set(0, h * 0.55, 0.13 - 0.006);
  group.add(label);
}

// ---- geometry helper ---------------------------------------------------

/**
 * Extrude a convex 2D outline (XY, CCW) to a slab of thickness `depth`, centred
 * on z=0: front + back faces (triangle fans) plus the side walls. Hand-rolled
 * so the library never reaches into `three/examples` for a geometry util.
 */
function extrudePolygon(points: [number, number][], depth: number): BufferGeometry {
  const n = points.length;
  const hz = depth / 2;
  const pos: number[] = [];
  const idx: number[] = [];
  // Front ring (z=+hz): verts 0..n-1, back ring (z=-hz): n..2n-1.
  for (const [x, y] of points) pos.push(x, y, hz);
  for (const [x, y] of points) pos.push(x, y, -hz);
  // Front fan (facing +Z), back fan (facing -Z, reversed winding).
  for (let i = 1; i < n - 1; i++) {
    idx.push(0, i, i + 1);
    idx.push(n, n + i + 1, n + i);
  }
  // Side walls.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i, n + i, j, j, n + i, n + j);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function pickDirections(rng: Rng, pool: string[]): Direction[] {
  const names = [...pool];
  const out: Direction[] = [];
  const count = 3;
  for (let i = 0; i < count && names.length; i++) {
    const k = Math.floor(rng.next() * names.length);
    out.push({ text: names.splice(k, 1)[0] });
  }
  return out;
}
