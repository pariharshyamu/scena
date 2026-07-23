import {
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  Color,
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
  /** Lettering colour (hex). Default seeded gold/cream. */
  inkColor?: number;
  /** Painted panel colour behind the lettering (hex). Default a seeded deep tone. */
  panelColor?: number;
  /** Board timber colour (hex). Default palette wood. */
  boardColor?: number;
  /** Overall height in metres (post top). Default per-kind. */
  height?: number;
  palette?: Palette;
}

const PLACE_NAMES = ['HAVENBROOK', 'MILLFORD', 'OAKVALE', 'GREYMOOR', 'ASHFORD', 'WESTWATCH', 'THORNWICK'];
const DIR_NAMES = ['MARKET', 'HARBOUR', 'THE MILL', 'CASTLE', 'FORGE', 'CHAPEL', 'FERRY', 'THE INN'];
const INKS = [0xf3e2a8, 0xf6ecc9, 0xe8c66a, 0xf0dcae]; // gold, cream, amber, bone
const PANELS = [0x22392e, 0x1e3049, 0x4a1f22, 0x243a20, 0x2a231d]; // forest, navy, oxblood, moss, soot

/**
 * A signpost with real, legible lettering — the "stylised text on props"
 * frontier. Letters are carved as bold, rounded relief from an embedded vector
 * font (no textures, no font files, no `three/examples` loaders) and set on a
 * painted panel so they read cleanly at a distance, day or dusk.
 *
 *  - `post`      a framed board on a post, lettered on both faces.
 *  - `hanging`   a shop sign on a bracket that sways gently on its hooks —
 *                self-animated from the render loop, like the banners.
 *  - `fingerpost` a cluster of pointed arms, each naming a place and pointing
 *                the way ("MARKET →", "HARBOUR →").
 *  - `milestone` a weathered stone marker with the name painted onto it.
 */
export function createSign(options: SignOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;
  const kind = options.kind ?? 'post';
  const ink = options.inkColor ?? rng.pick(INKS);
  const panel = options.panelColor ?? rng.pick(PANELS);

  const group = new Group();
  group.name = 'sign';

  const wood = () => createSurface('plank', { color: options.boardColor ?? palette.wood, seed });
  const woodDark = createSurface('wood', { color: palette.woodDark, seed: seed + 3 });
  const iron = createSurface('metal', { color: 0x2f333b, tint: 0x14161a, tintAmount: 0.35, seed: seed + 5 });

  // Bright painted lettering: a little emissive keeps it readable at dusk, but
  // below the day/night lamp threshold (0.5) so it never glows like a lamp.
  const inkMat = () =>
    new MeshStandardMaterial({
      color: ink,
      roughness: 0.55,
      metalness: 0.0,
      emissive: new Color(ink).multiplyScalar(0.5),
      emissiveIntensity: 0.32,
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
    const post = new Mesh(new CylinderGeometry(0.08, 0.1, postH, 10), woodDark);
    post.position.y = postH / 2;
    group.add(post);
    const cap = new Mesh(new SphereGeometry(0.13, 12, 8), iron);
    cap.position.y = postH + 0.03;
    group.add(cap);

    const n = directions.length;
    directions.forEach((d, i) => {
      const angle = d.angle ?? (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const y = d.height ?? postH - 0.55 - i * 0.66;
      const arm = fingerArm(d.text, wood(), inkMat(), panel, iron);
      arm.position.y = y;
      arm.rotation.y = angle;
      group.add(arm);
    });
    return { object: group, obstacleRadius: 0.4 };
  }

  const text = options.text ?? rng.pick(PLACE_NAMES);
  const boardH = 0.72;
  const textSize = boardH * 0.5;
  const pad = 0.34;
  const boardW = Math.max(1.5, measureText(text, { size: textSize }) + pad * 2);
  const boardT = 0.1;

  if (kind === 'hanging') {
    const postH = options.height ?? 3.0;
    const post = new Mesh(new CylinderGeometry(0.075, 0.09, postH, 10), woodDark);
    post.position.y = postH / 2;
    group.add(post);
    // Bracket arm reaching out over the street, with a diagonal brace.
    const armLen = boardW * 0.5 + 0.4;
    const arm = new Mesh(new BoxGeometry(armLen, 0.1, 0.1), iron);
    arm.position.set(armLen / 2, postH - 0.18, 0);
    group.add(arm);
    const scroll = new Mesh(new TorusGeometry(0.11, 0.022, 7, 12, Math.PI * 1.4), iron);
    scroll.position.set(armLen - 0.1, postH - 0.32, 0);
    scroll.rotation.z = -0.4;
    group.add(scroll);
    const brace = new Mesh(new CylinderGeometry(0.032, 0.032, 0.6, 6), iron);
    brace.position.set(armLen * 0.4, postH - 0.52, 0);
    brace.rotation.z = Math.PI / 4;
    group.add(brace);

    // The board hangs from two hooks and sways — a pivot group swung from the
    // render loop, phase seeded so neighbouring signs never swing in lockstep.
    const armTipX = armLen - 0.14;
    const pivot = new Group();
    pivot.name = 'signPivot';
    pivot.position.set(armTipX, postH - 0.24, 0);
    group.add(pivot);
    for (const dx of [-boardW * 0.34, boardW * 0.34]) {
      const link = new Mesh(new TorusGeometry(0.055, 0.018, 7, 12), iron);
      link.position.set(dx, -0.15, 0);
      link.rotation.x = Math.PI / 2;
      pivot.add(link);
      const chain = new Mesh(new CylinderGeometry(0.014, 0.014, 0.28, 6), iron);
      chain.position.set(dx, -0.16, 0);
      pivot.add(chain);
    }
    const board = letteredBoard(text, boardW, boardH, boardT, wood(), inkMat(), panel, iron, textSize, true);
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
  const postH = options.height ?? 2.15;
  const boardCenterY = postH - boardH / 2 - 0.06;
  for (const dx of [-boardW * 0.33, boardW * 0.33]) {
    const post = new Mesh(new CylinderGeometry(0.06, 0.075, postH, 9), woodDark);
    post.position.set(dx, postH / 2, 0);
    group.add(post);
  }
  const board = letteredBoard(text, boardW, boardH, boardT, wood(), inkMat(), panel, iron, textSize, true);
  board.position.y = boardCenterY;
  group.add(board);
  // A peaked cap rail over the board.
  const rail = new Mesh(new BoxGeometry(boardW + 0.14, 0.09, boardT + 0.14), woodDark);
  rail.position.y = boardCenterY + boardH / 2 + 0.07;
  group.add(rail);
  return { object: group, obstacleRadius: 0.3 };
}

// ---- pieces ------------------------------------------------------------

/**
 * A framed board: timber plank, a recessed painted panel set proud of it, the
 * lettering raised on the panel, and iron corner studs. Two-sided when asked,
 * so a hanging sign reads from either approach.
 */
function letteredBoard(
  text: string,
  w: number,
  h: number,
  t: number,
  boardMat: MeshStandardMaterial,
  inkMat: MeshStandardMaterial,
  panelColor: number,
  ironMat: MeshStandardMaterial,
  size: number,
  twoSided: boolean
): Group {
  const g = new Group();
  const board = new Mesh(new BoxGeometry(w, h, t), boardMat);
  g.add(board);

  const panelMat = new MeshStandardMaterial({ color: panelColor, roughness: 0.62, metalness: 0.0 });
  const faces = twoSided ? [1, -1] : [1];
  for (const s of faces) {
    const panel = new Mesh(new BoxGeometry(w - 0.18, h - 0.18, 0.03), panelMat);
    panel.position.z = s * (t / 2 + 0.012);
    g.add(panel);
    const label = new Mesh(buildTextGeometry(text, { size, align: 'center' }).geometry, inkMat);
    label.position.z = s * (t / 2 + 0.035);
    if (s < 0) label.rotation.y = Math.PI;
    g.add(label);
  }
  // Iron corner studs.
  const sx = w / 2 - 0.11;
  const sy = h / 2 - 0.11;
  for (const cx of [-sx, sx]) {
    for (const cy of [-sy, sy]) {
      const stud = new Mesh(new SphereGeometry(0.035, 8, 6), ironMat);
      stud.position.set(cx, cy, t / 2 + 0.01);
      g.add(stud);
    }
  }
  return g;
}

/** A pointed direction arm: a plank tapering to a point, with a painted stripe and lettering. */
function fingerArm(
  text: string,
  boardMat: MeshStandardMaterial,
  inkMat: MeshStandardMaterial,
  panelColor: number,
  ironMat: MeshStandardMaterial
): Group {
  const g = new Group();
  const h = 0.46;
  const t = 0.08;
  const size = h * 0.52;
  const textW = measureText(text, { size });
  const len = Math.max(1.6, textW + 0.8); // room for text + the point
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
  // Painted stripe running the shaft so the lettering has contrast.
  const panelMat = new MeshStandardMaterial({ color: panelColor, roughness: 0.62 });
  const stripe = new Mesh(new BoxGeometry(len - 0.16, h - 0.14, 0.03), panelMat);
  stripe.position.set((len - 0.16) / 2 - 0.02, 0, t / 2 + 0.012);
  g.add(stripe);
  const label = new Mesh(buildTextGeometry(text, { size, align: 'left' }).geometry, inkMat);
  label.position.set(0.24, 0, t / 2 + 0.035);
  g.add(label);
  // A ring where the arm meets the post.
  const ring = new Mesh(new TorusGeometry(0.06, 0.02, 6, 10), ironMat);
  ring.position.set(0.03, 0, 0);
  ring.rotation.y = Math.PI / 2;
  g.add(ring);
  return g;
}

/** A weathered stone marker with the name painted onto it. */
function buildMilestone(group: Group, text: string, palette: Palette, seed: number): void {
  const stone = createSurface('stone', { color: palette.rock[0], seed });
  const h = 1.0;
  const slab = new Mesh(
    extrudePolygon(
      [
        [-0.44, 0],
        [0.44, 0],
        [0.44, h * 0.68],
        [0.26, h],
        [-0.26, h],
        [-0.44, h * 0.68],
      ],
      0.28
    ),
    stone
  );
  group.add(slab);
  // A painted band and weathered off-white letters — how a real milestone is
  // marked. The band sizes itself to the name (long names also shrink to fit
  // the slab), raised a touch so it catches the light on grey stone.
  const maxW = 0.74;
  let size = 0.19;
  let textW = measureText(text, { size });
  if (textW > maxW - 0.1) {
    size *= (maxW - 0.1) / textW;
    textW = maxW - 0.1;
  }
  const band = new Mesh(
    new BoxGeometry(Math.min(maxW, textW + 0.14), size + 0.18, 0.02),
    new MeshStandardMaterial({ color: 0x30302c, roughness: 0.8 })
  );
  band.position.set(0, h * 0.56, 0.145);
  group.add(band);
  const paint = new MeshStandardMaterial({
    color: 0xe8e3d6,
    roughness: 0.6,
    emissive: 0x2a2824,
    emissiveIntensity: 0.15,
  });
  const label = new Mesh(buildTextGeometry(text, { size, align: 'center', depth: 0.02 }).geometry, paint);
  label.position.set(0, h * 0.56, 0.16);
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
  for (const [x, y] of points) pos.push(x, y, hz);
  for (const [x, y] of points) pos.push(x, y, -hz);
  for (let i = 1; i < n - 1; i++) {
    idx.push(0, i, i + 1);
    idx.push(n, n + i + 1, n + i);
  }
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
  for (let i = 0; i < 3 && names.length; i++) {
    const k = Math.floor(rng.next() * names.length);
    out.push({ text: names.splice(k, 1)[0] });
  }
  return out;
}
