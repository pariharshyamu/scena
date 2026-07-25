import { Box3, Object3D, Vector3 } from 'three';
import { Rng } from './random';
import type { Prop, PropSurface } from './types';

/**
 * Placement — putting things where a person would have put them.
 *
 * Prop generators say what a thing *is*. This says where it *goes*, and for
 * decoration that is the larger half of the problem: the difference between
 * a decorated room and an undecorated one is a few meshes, but the
 * difference between a decorated room and a showroom is entirely placement.
 * Three identical frames, centred, evenly spaced and perfectly level is
 * what every hand-placed wall ends up as, and it is instantly readable as
 * generated.
 *
 * ```ts
 * hangOn(room.walls[0], painting, { height: 1.55, seed: 3 });
 * hangGallery(room.walls[1], [a, b, c, d, e], { seed: 7 });
 * ```
 */

/**
 * A surface you can hang things on.
 *
 * Structural, like everything else in this library: anything with an anchor
 * oriented **+z out of the wall, +x along the run, +y up from the floor**
 * works, whether it came from `createRoom`, from `createWallAnchor`, or from
 * a wall the caller built themselves.
 */
export interface HangSurface {
  /** Anchor, already parented into whatever owns the wall. */
  anchor: Object3D;
  /** Usable run along the anchor's local x, in metres. */
  length: number;
  /** Wall height, in metres. */
  height: number;
}

/**
 * Make a hangable surface out of a bare wall: an anchor at (x, y, z) in the
 * parent's space, turned by `rotY` so its +z faces into the room.
 */
export function createWallAnchor(
  parent: Object3D,
  x: number,
  y: number,
  z: number,
  rotY: number,
  length: number,
  height: number
): HangSurface {
  const anchor = new Object3D();
  anchor.name = 'wall';
  anchor.position.set(x, y, z);
  anchor.rotation.y = rotY;
  parent.add(anchor);
  return { anchor, length, height };
}

export interface HangOptions {
  /**
   * Height of the item's centre above the floor. Default 1.55 — a shade
   * above eye level for the centre of the picture, which is where galleries
   * hang and where a room looks wrong without.
   */
  height?: number;
  /** Offset along the wall from its centre, in metres. Default 0. */
  along?: number;
  /**
   * Maximum tilt, in radians. Default 0.02 (about a degree). **Nothing hangs
   * level.** This single value is most of the difference between a prop on a
   * wall and a picture in a room; set 0 only for things actually screwed on,
   * like a clock or a fixture.
   */
  tilt?: number;
  /** Gap between the wall face and the back of the item. Default 0.004. */
  standoff?: number;
  seed?: number;
}

function objectOf(item: Prop | Object3D): Object3D {
  return item instanceof Object3D ? item : item.object;
}

/**
 * Hang one thing on a wall. Returns the object placed, already parented.
 *
 * Placement assumes the art's origin is at its own centre with the picture
 * facing +z — the convention every piece in `wallArt` follows — so the only
 * decisions left are how high, how far along, and how crooked.
 */
export function hangOn(
  wall: HangSurface,
  item: Prop | Object3D,
  options: HangOptions = {}
): Object3D {
  const object = objectOf(item);
  const rng = new Rng(options.seed ?? 1);
  const tilt = options.tilt ?? 0.02;
  object.position.set(
    options.along ?? 0,
    options.height ?? 1.55,
    options.standoff ?? 0.004
  );
  // Roll about the view axis: a picture hangs from one point and swings, so
  // the error is roll, not yaw or pitch. Tilting in the wrong axis pushes a
  // corner into the plaster and reads as broken rather than as crooked.
  object.rotation.z = tilt === 0 ? 0 : rng.range(-tilt, tilt);
  wall.anchor.add(object);
  return object;
}

export interface GalleryOptions extends HangOptions {
  /** Mean gap between neighbours, in metres. Default 0.1. */
  gap?: number;
  /**
   * How far items stray from the spine line, in metres. Default 0.09. Zero
   * gives a picture rail; a large value gives a salon hang.
   */
  scatter?: number;
}

/**
 * Hang several things as an arrangement.
 *
 * A wall of pictures is not a row of pictures. What holds a real group
 * together is a **spine** — an invisible horizontal line that most of the
 * pieces touch with either their centre, their top or their bottom edge —
 * and what stops it looking mechanical is that they touch it in different
 * ways and the gaps are uneven.
 *
 * Returns the items it actually placed. If the wall is not long enough for
 * all of them the overflow is **left off and reported by the shorter
 * return**, rather than being crammed in or silently overlapped.
 */
export function hangGallery(
  wall: HangSurface,
  items: Array<Prop | Object3D>,
  options: GalleryOptions = {}
): Object3D[] {
  const rng = new Rng(options.seed ?? 1);
  const gap = options.gap ?? 0.1;
  const scatter = options.scatter ?? 0.09;
  const spine = options.height ?? 1.55;
  const tilt = options.tilt ?? 0.02;

  // Measure each item. Props from `wallArt` publish width/height; anything
  // else gets measured from its bounding box, so a caller's own mesh works.
  const sized = items.map((item) => {
    const object = objectOf(item);
    const w = (item as { width?: number }).width;
    const h = (item as { height?: number }).height;
    if (typeof w === 'number' && typeof h === 'number') return { object, w, h };
    const box = new Vector3();
    object.updateMatrixWorld(true);
    new Box3().setFromObject(object).getSize(box);
    return { object, w: box.x || 0.3, h: box.y || 0.3 };
  });

  // Uneven gaps, and lay the run out before committing to it so it can be
  // centred on the wall rather than starting at one end.
  const gaps = sized.map(() => gap * rng.range(0.6, 1.5));
  const placed: Object3D[] = [];
  let total = 0;
  let fits = 0;
  for (let i = 0; i < sized.length; i++) {
    const next = total + sized[i].w + (i > 0 ? gaps[i] : 0);
    if (next > wall.length) break;
    total = next;
    fits = i + 1;
  }

  let x = -total / 2;
  for (let i = 0; i < fits; i++) {
    const { object, w, h } = sized[i];
    if (i > 0) x += gaps[i];
    // Three ways to relate to the spine — centred on it, hung from it, or
    // standing on it. Mixing them is what makes a group look composed
    // instead of aligned.
    const relation = rng.next();
    let y = spine;
    if (relation > 0.72) y = spine + h / 2 - rng.range(0.0, 0.04);
    else if (relation > 0.44) y = spine - h / 2 + rng.range(0.0, 0.04);
    else y = spine + rng.range(-scatter, scatter);

    object.position.set(x + w / 2, y, options.standoff ?? 0.004);
    object.rotation.z = tilt === 0 ? 0 : rng.range(-tilt, tilt);
    wall.anchor.add(object);
    placed.push(object);
    x += w;
  }
  return placed;
}

// --- putting things down -------------------------------------------------

export interface PlaceOptions {
  /** Position along the surface's local x, from its centre. Default 0. */
  along?: number;
  /** Position along the surface's local z. Default 0. */
  across?: number;
  /** Yaw, in radians. Default 0. */
  turn?: number;
}

/** The measured footprint of an object, and where its origin sits in it. */
interface Footprint {
  object: Object3D;
  /** Extent on each axis. */
  w: number;
  d: number;
  h: number;
  /** Offset from the object's origin to the centre of its footprint. */
  cx: number;
  cz: number;
  /** How far below the origin the object reaches — what it must be lifted by. */
  drop: number;
  /** Tilt that lays the thing down, if it is not something that stands. */
  tiltX: number;
  tiltZ: number;
}

/**
 * Which way up does this thing come to rest?
 *
 * Props are authored in the orientation they are *used* in, and for a phone
 * or a tablet that is upright, in a hand. Set one down without thinking and
 * it stands on its short edge like a domino, which is what the first version
 * of this did to a whole tabletop.
 *
 * A **slab** — one dimension far smaller than the other two, and that thin
 * dimension currently horizontal — is a thing that lies down. A candle is
 * tall and thin too but it is not a slab, so it stays standing; a framed
 * photo has a strut, which thickens it past the threshold, so it stays
 * standing as well. Props can override with `rest`.
 */
function restOf(size: Vector3, rest: string | undefined): { x: number; z: number } {
  if (rest === 'upright') return { x: 0, z: 0 };
  const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
  const [min, mid] = dims;
  if (rest !== 'flat' && min > mid * 0.3) return { x: 0, z: 0 };
  // Turn whichever axis is thinnest to point up.
  if (size.y === min) return { x: 0, z: 0 }; // already lying down
  if (size.z === min) return { x: -Math.PI / 2, z: 0 };
  return { x: 0, z: Math.PI / 2 };
}

function measure(item: Prop | Object3D): Footprint {
  const object = objectOf(item);
  // Measure in the object's own space, with any previous placement undone —
  // otherwise dressing the same surface twice measures the first placement's
  // rotation into the second's footprint.
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0, 0);
  object.updateMatrixWorld(true);
  const upright = new Box3().setFromObject(object).getSize(new Vector3());
  const tilt = restOf(upright, (item as { rest?: string }).rest);

  // Re-measure once it is the way up it will actually sit, or the footprint
  // describes an object nobody will ever see.
  object.rotation.order = 'YXZ';
  object.rotation.set(tilt.x, 0, tilt.z);
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  return {
    object,
    w: size.x,
    d: size.z,
    h: size.y,
    cx: centre.x,
    cz: centre.z,
    drop: box.min.y,
    tiltX: tilt.x,
    tiltZ: tilt.z,
  };
}

/**
 * Put one thing down on a surface, at a position you choose.
 *
 * The object is **seated on** the surface rather than centred on it: whatever
 * its own origin convention, its lowest point ends up at surface level. Props
 * in this kit mostly have their origin at their base, but not all of them do,
 * and a mug sunk half way into a tabletop is the same defect every time.
 */
export function placeOn(
  surface: PropSurface,
  item: Prop | Object3D,
  options: PlaceOptions = {}
): Object3D {
  const fp = measure(item);
  const turn = options.turn ?? 0;
  seat(surface, fp, options.along ?? 0, options.across ?? 0, turn);
  return fp.object;
}

/** Place a measured item, correcting for its origin and its yaw. */
function seat(
  surface: PropSurface,
  fp: Footprint,
  along: number,
  across: number,
  turn: number
): void {
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  // The footprint centre moves when the object turns about its own origin,
  // so the correction has to be rotated too. YXZ order so the yaw is applied
  // last, about world up, whatever tilt lays the object down.
  fp.object.rotation.order = 'YXZ';
  fp.object.rotation.set(fp.tiltX, turn, fp.tiltZ);
  fp.object.position.set(
    along - (fp.cx * cos + fp.cz * sin),
    -fp.drop,
    across - (-fp.cx * sin + fp.cz * cos)
  );
  surface.anchor.add(fp.object);
}

/** Axis-aligned extent of a w×d footprint turned by `turn`. */
function turnedExtent(w: number, d: number, turn: number): { w: number; d: number } {
  const c = Math.abs(Math.cos(turn));
  const s = Math.abs(Math.sin(turn));
  return { w: w * c + d * s, d: w * s + d * c };
}

export interface DressOptions {
  /**
   * How full the surface gets, 0–1. Default 0.55. This is a target, not a
   * promise — items that will not fit are left off.
   */
  density?: number;
  /** Clear border kept around the edge, in metres. Default 0.03. */
  margin?: number;
  /** Minimum gap between neighbours, in metres. Default 0.02. */
  gap?: number;
  /**
   * Maximum yaw off square, in radians. Default 0.4. Nobody sets a mug down
   * aligned to the table, and a surface of perfectly square objects is the
   * clearest possible tell.
   */
  turn?: number;
  /**
   * How tightly things cluster, 0–1. Default 0.6. At 0 they spread evenly
   * across the surface; at 1 they pile into one region and leave the rest
   * clear — which is what real surfaces look like.
   */
  cluster?: number;
  seed?: number;
}

/**
 * Dress a surface: put a set of things down on it the way a person would.
 *
 * The naive version — space them evenly, centred, square — is what every
 * hand-placed tabletop ends up as, and it reads as generated instantly. Four
 * things fix it, and they are the whole of this function:
 *
 * - **Tall things go behind.** Sorted by height, and the taller an item is
 *   the further back it is aimed. Otherwise a candlestick lands in front of
 *   a bowl and hides it.
 * - **Things cluster.** Positions are drawn around a seeded centre of
 *   gravity rather than uniformly, so one part of the surface is busy and
 *   another is clear. An even spread is a display of merchandise.
 * - **The middle stays emptier.** Items are biased toward the back and front
 *   edges, because the middle of a table is where you put your plate.
 * - **Nothing is square, and nothing overlaps.** Small random yaw, and
 *   placement is rejection-sampled against what is already down.
 *
 * ```ts
 * dress(table.surfaces[0], [mug, bowl, candle, book], { seed: 3 });
 * ```
 *
 * Returns what it actually placed. Items that could not be fitted are left
 * unparented and simply missing from the result, rather than crammed in or
 * silently overlapped — check `placed.length` if you care.
 */
export function dress(
  surface: PropSurface,
  items: Array<Prop | Object3D>,
  options: DressOptions = {}
): Object3D[] {
  const rng = new Rng(options.seed ?? 1);
  const margin = options.margin ?? 0.03;
  const gap = options.gap ?? 0.02;
  const maxTurn = options.turn ?? 0.4;
  const cluster = Math.min(1, Math.max(0, options.cluster ?? 0.6));
  const density = Math.min(1, Math.max(0, options.density ?? 0.55));

  const halfW = surface.width / 2 - margin;
  const halfD = surface.depth / 2 - margin;
  if (halfW <= 0 || halfD <= 0) return [];

  // Tallest first: they claim the back, and everything shorter arranges
  // itself around what is already there.
  const measured = items.map(measure);
  const order = measured.slice().sort((a, b) => b.h - a.h);
  const tallest = Math.max(...measured.map((m) => m.h), 1e-4);

  // The busy end. Off-centre on purpose — a cluster centred on the middle of
  // the surface is just a symmetrical arrangement with extra steps.
  const focus = rng.range(-0.55, 0.55) * halfW;
  const spread = halfW * (0.9 - cluster * 0.62);

  const taken: Array<{ x: number; z: number; w: number; d: number }> = [];
  const placed: Object3D[] = [];
  // Area budget: stop once the surface is as full as asked for.
  const budget = surface.width * surface.depth * density;
  let used = 0;

  for (const fp of order) {
    if (used + fp.w * fp.d > budget) continue;
    const backness = Math.min(1, fp.h / tallest);
    let seated = false;

    for (let attempt = 0; attempt < 24 && !seated; attempt++) {
      const turn = rng.range(-maxTurn, maxTurn);
      const ext = turnedExtent(fp.w, fp.d, turn);
      if (ext.w > halfW * 2 || ext.d > halfD * 2) break; // never going to fit

      // Along: clustered around the focus. Three uniforms summed is close
      // enough to a bell, and unlike a uniform draw it actually clumps.
      const bell = rng.next() + rng.next() + rng.next() - 1.5;
      // Widen GRADUALLY around the focus as attempts fail, so a crowded
      // surface still fills. Falling back to a uniform draw instead — the
      // first version — makes a tight cluster spread out MORE than a loose
      // one, because a tight cluster is what fails often enough to trigger
      // the fallback.
      let x = focus + bell * spread * (1 + attempt * 0.22);
      const limitX = halfW - ext.w / 2;
      if (limitX < 0) break;
      x = Math.max(-limitX, Math.min(limitX, x));

      // Across: a BIAS toward the back for tall things, not a target.
      //
      // Aiming each item at a depth computed from its height puts everything
      // of similar height at the same z, and a set of tabletop props are all
      // of similar height — so the whole arrangement came out as a straight
      // line across the middle of the table, which is the exact showroom
      // failure this function exists to avoid. Sample the full depth and
      // bend the sample, so the bias shows up across a group without any
      // single item being pinned.
      const limitZ = halfD - ext.d / 2;
      if (limitZ < 0) break;
      const aim = (0.25 + backness * 0.6) * 2 - 1; // -1 front .. +1 back
      const z = (rng.range(-1, 1) * 0.62 + aim * 0.38) * limitZ;

      const clash = taken.some(
        (t) =>
          Math.abs(t.x - x) < (t.w + ext.w) / 2 + gap &&
          Math.abs(t.z - z) < (t.d + ext.d) / 2 + gap
      );
      if (clash) continue;

      seat(surface, fp, x, z, turn);
      taken.push({ x, z, w: ext.w, d: ext.d });
      placed.push(fp.object);
      used += fp.w * fp.d;
      seated = true;
    }

    if (seated) continue;

    // Random sampling cannot find a narrow gap, and once a couple of big
    // things are down a shallow surface is effectively one-dimensional:
    // nothing can pass a 48 cm basket within the depth of a 90 cm table. A
    // phone with plenty of room in the corner was missing it 24 times out of
    // 24. Sweep a coarse grid in a shuffled order and take the first opening,
    // so small things reliably find the space that is genuinely there.
    const turn = rng.range(-maxTurn, maxTurn);
    const ext = turnedExtent(fp.w, fp.d, turn);
    const limitX = halfW - ext.w / 2;
    const limitZ = halfD - ext.d / 2;
    if (limitX < 0 || limitZ < 0) continue;

    const cells: Array<[number, number]> = [];
    const nx = 11;
    const nz = 7;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        cells.push([((i / (nx - 1)) * 2 - 1) * limitX, ((j / (nz - 1)) * 2 - 1) * limitZ]);
      }
    }
    // Shuffled, and jittered on use, so a fallback placement does not read as
    // a grid.
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const swap = cells[i];
      cells[i] = cells[j];
      cells[j] = swap;
    }
    for (const [gx, gz] of cells) {
      const x = Math.max(-limitX, Math.min(limitX, gx + rng.range(-0.02, 0.02)));
      const z = Math.max(-limitZ, Math.min(limitZ, gz + rng.range(-0.02, 0.02)));
      const clash = taken.some(
        (t) =>
          Math.abs(t.x - x) < (t.w + ext.w) / 2 + gap &&
          Math.abs(t.z - z) < (t.d + ext.d) / 2 + gap
      );
      if (clash) continue;
      seat(surface, fp, x, z, turn);
      taken.push({ x, z, w: ext.w, d: ext.d });
      placed.push(fp.object);
      used += fp.w * fp.d;
      break;
    }
  }
  return placed;
}
