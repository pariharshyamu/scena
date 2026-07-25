import { Box3, Object3D, Vector3 } from 'three';
import { Rng } from './random';
import type { Prop } from './types';

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
