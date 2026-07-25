import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createPicture, type PictureStyle } from '../materials/picture';
import type { Prop } from '../core/types';

/**
 * Paper on walls — posters, pinboards, whiteboards, sticky notes.
 *
 * The one hard rule: **no letterforms.** There is no font here, and fake
 * glyphs are the single most recognisable tell in a procedural scene — at
 * any distance where you could tell they were letters, you can tell they are
 * the wrong ones. What goes on these is *type at the density type has when
 * you see it across a room*: ruled bands with ragged right edges, heavy
 * blocks where a headline sits, nothing glyph-shaped. (`createSign` is the
 * exception and earns it, because a signpost is read deliberately and has a
 * real vector font behind it.)
 *
 * Everything here follows the wall-art convention: origin at the wall face,
 * facing +z, so `hangOn` places it.
 */

export interface PosterOptions {
  /** Width in metres. Default 0.5. */
  width?: number;
  /** Height. Defaults to a poster proportion. */
  height?: number;
  /** `poster` (colour field) or `notice` (printed sheet). Default 'poster'. */
  style?: Extract<PictureStyle, 'poster' | 'notice'>;
  /** Fix it with tape at the corners rather than pins. Default false. */
  taped?: boolean;
  seed?: number;
  palette?: Palette;
}

/** A sheet stuck straight to the wall — no frame, no glass. */
export function createPoster(options: PosterOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const w = options.width ?? rng.range(0.34, 0.6);
  const h = options.height ?? w * rng.range(1.3, 1.5);
  const style = options.style ?? 'poster';

  const group = new Group();
  group.name = `poster-${style}`;
  const picture = createPicture(w, h, { style, seed, age: 0.05 });
  const sheet = new Mesh(new PlaneGeometry(w, h), picture.material);
  sheet.name = 'sheet';
  sheet.position.z = 0.0015;
  group.add(sheet);

  const fixings = options.taped
    ? new MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.9, transparent: true, opacity: 0.6 })
    : new MeshStandardMaterial({ color: 0xc04a3a, roughness: 0.4 });
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const pin = new Mesh(
        options.taped ? new BoxGeometry(0.03, 0.014, 0.001) : new BoxGeometry(0.008, 0.008, 0.005),
        fixings
      );
      pin.position.set(sx * (w / 2 - 0.022), sy * (h / 2 - 0.018), options.taped ? 0.002 : 0.004);
      if (options.taped) pin.rotation.z = rng.range(-0.5, 0.5);
      group.add(pin);
    }
  }
  return { object: group, obstacleRadius: 0 };
}

export interface PinboardOptions {
  /** Board width in metres. Default 0.8. */
  width?: number;
  /** Board height. Default 0.6. */
  height?: number;
  /** How many things are pinned to it. Default 7. */
  count?: number;
  seed?: number;
  palette?: Palette;
}

/**
 * A cork pinboard with things overlapping on it.
 *
 * The **overlap** is the prop. A board of neatly spaced non-touching notes is
 * a spreadsheet; a real one has a photo half over a flyer with a corner of a
 * receipt under both, and everything at a slightly different angle.
 */
export function createPinboard(options: PinboardOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const w = options.width ?? 0.8;
  const h = options.height ?? 0.6;
  const count = options.count ?? 7;

  const group = new Group();
  group.name = 'pinboard';
  const frame = createSurface('wood', { color: palette.woodDark, seed });
  const cork = new Mesh(
    new BoxGeometry(w, h, 0.016),
    createSurface('canvas', { color: 0xb08a55, roughness: 0.95, seed: seed + 1 })
  );
  cork.position.z = 0.008;
  group.add(cork);
  for (const [bw, bh, x, y] of [
    [w + 0.04, 0.028, 0, h / 2 + 0.006],
    [w + 0.04, 0.028, 0, -h / 2 - 0.006],
    [0.028, h + 0.04, -w / 2 - 0.006, 0],
    [0.028, h + 0.04, w / 2 + 0.006, 0],
  ]) {
    const bar = new Mesh(new BoxGeometry(bw, bh, 0.024), frame);
    bar.position.set(x, y, 0.012);
    group.add(bar);
  }

  const pinMat = new MeshStandardMaterial({ color: 0xc04a3a, roughness: 0.35 });
  const pinned: PictureStyle[] = ['notice', 'photo', 'poster', 'notice', 'photo'];
  for (let i = 0; i < count; i++) {
    const style = pinned[i % pinned.length];
    const pw = w * rng.range(0.16, 0.3);
    const ph = pw * rng.range(0.72, 1.45);
    const picture = createPicture(pw, ph, { style, seed: seed * 13 + i, age: 0.04 });
    const note = new Mesh(new PlaneGeometry(pw, ph), picture.material);
    // Overlapping on purpose, and stacked in z so the ones on top really are.
    note.position.set(
      rng.range(-1, 1) * (w / 2 - pw / 2 - 0.02),
      rng.range(-1, 1) * (h / 2 - ph / 2 - 0.02),
      0.017 + i * 0.0012
    );
    note.rotation.z = rng.range(-0.16, 0.16);
    group.add(note);
    const pin = new Mesh(new BoxGeometry(0.009, 0.009, 0.006), pinMat);
    pin.position.set(note.position.x, note.position.y + ph / 2 - 0.014, note.position.z + 0.004);
    group.add(pin);
  }
  return { object: group, obstacleRadius: 0 };
}

export interface WhiteboardOptions {
  /** Board width in metres. Default 1.2. */
  width?: number;
  /** Board height. Default 0.8. */
  height?: number;
  /** How covered it is, 0–1. Default 0.6. */
  fill?: number;
  seed?: number;
}

/**
 * A whiteboard with something on it.
 *
 * Handwriting is drawn as strokes rather than as anything readable, for the
 * same reason as everything else in this file. What sells a whiteboard is
 * the **layout**: a boxed diagram somewhere, a couple of lines of scrawl, an
 * arrow — and a big blank patch, because nobody ever fills one.
 */
export function createWhiteboard(options: WhiteboardOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const w = options.width ?? 1.2;
  const h = options.height ?? 0.8;
  const fill = options.fill ?? 0.6;

  const group = new Group();
  group.name = 'whiteboard';
  const tray = new MeshStandardMaterial({ color: 0x9aa2aa, roughness: 0.4, metalness: 0.5 });
  const board = new Mesh(
    new BoxGeometry(w, h, 0.018),
    new MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.16 })
  );
  board.position.z = 0.009;
  group.add(board);
  for (const [bw, bh, x, y] of [
    [w + 0.03, 0.024, 0, h / 2 + 0.004],
    [w + 0.03, 0.024, 0, -h / 2 - 0.004],
    [0.024, h + 0.03, -w / 2 - 0.004, 0],
    [0.024, h + 0.03, w / 2 + 0.004, 0],
  ]) {
    const edge = new Mesh(new BoxGeometry(bw, bh, 0.026), tray);
    edge.position.set(x, y, 0.013);
    group.add(edge);
  }
  const shelf = new Mesh(new BoxGeometry(w * 0.5, 0.018, 0.05), tray);
  shelf.position.set(0, -h / 2 - 0.024, 0.03);
  group.add(shelf);
  for (let i = 0; i < 3; i++) {
    const pen = new Mesh(
      new BoxGeometry(0.09, 0.012, 0.012),
      new MeshStandardMaterial({ color: [0x2a2d33, 0xc0392b, 0x2a6fb0][i], roughness: 0.5 })
    );
    pen.position.set(-0.13 + i * 0.11 + rng.range(-0.02, 0.02), -h / 2 - 0.012, 0.045);
    pen.rotation.y = rng.range(-0.12, 0.12);
    group.add(pen);
  }

  // The writing. Strokes, never glyphs.
  const inkColours = [0x2a2d33, 0x2a6fb0, 0xc0392b];
  const stroke = (x: number, y: number, len: number, tall: number, colour: number): void => {
    const mark = new Mesh(
      new PlaneGeometry(len, tall),
      new MeshStandardMaterial({ color: colour, roughness: 0.6 })
    );
    mark.position.set(x, y, 0.0195);
    group.add(mark);
  };
  const lines = Math.round(7 * fill);
  for (let i = 0; i < lines; i++) {
    const colour = rng.pick(inkColours);
    const y = h * 0.36 - (i / Math.max(1, lines)) * h * 0.6;
    const x = -w * rng.range(0.1, 0.36);
    stroke(x, y, w * rng.range(0.14, 0.42), 0.012, colour);
  }
  // A boxed diagram off to one side, which is what a whiteboard always has.
  const bx = w * rng.range(0.16, 0.28);
  const by = h * rng.range(-0.1, 0.2);
  const bw2 = w * 0.2;
  const bh2 = h * 0.24;
  const diagram = rng.pick(inkColours);
  for (const [ox, oy, lx, ly] of [
    [0, bh2 / 2, bw2, 0.008],
    [0, -bh2 / 2, bw2, 0.008],
    [-bw2 / 2, 0, 0.008, bh2],
    [bw2 / 2, 0, 0.008, bh2],
  ]) {
    stroke(bx + ox, by + oy, lx, ly, diagram);
  }
  stroke(bx - bw2 * 0.75, by, bw2 * 0.4, 0.008, diagram); // an arrow into it
  return { object: group, obstacleRadius: 0 };
}

export interface StickyNotesOptions {
  /** How many. Default 5. */
  count?: number;
  /** Note edge in metres. Default 0.075. */
  size?: number;
  /** Spread them over this area (metres). Default 0.4 × 0.3. */
  width?: number;
  height?: number;
  seed?: number;
}

/**
 * A cluster of sticky notes.
 *
 * Origin at the wall face, facing +z, so this goes straight onto a wall, the
 * edge of a monitor, or a whiteboard. They cluster and they overlap, because
 * nobody spaces them out.
 */
export function createStickyNotes(options: StickyNotesOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const count = options.count ?? 5;
  const size = options.size ?? 0.075;
  const w = options.width ?? 0.4;
  const h = options.height ?? 0.3;

  const group = new Group();
  group.name = 'stickyNotes';
  const colours = [0xf2e06a, 0xf2a86a, 0x9ad86a, 0x7ac6e8, 0xf28aa8];
  // One busy corner rather than an even scatter — the same argument as
  // `dress`, at a tenth of the scale.
  const focusX = rng.range(-0.3, 0.3) * w;
  const focusY = rng.range(-0.3, 0.3) * h;
  for (let i = 0; i < count; i++) {
    const s = size * rng.range(0.85, 1.15);
    const note = new Mesh(
      new PlaneGeometry(s, s),
      new MeshStandardMaterial({ color: rng.pick(colours), roughness: 0.92 })
    );
    note.position.set(
      focusX + (rng.next() + rng.next() - 1) * w * 0.42,
      focusY + (rng.next() + rng.next() - 1) * h * 0.42,
      0.001 + i * 0.0004
    );
    note.rotation.z = rng.range(-0.24, 0.24);
    group.add(note);
    // Two scribbled lines. Any more and they start looking like text.
    const ink = new MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.7 });
    for (let l = 0; l < 2; l++) {
      const mark = new Mesh(new PlaneGeometry(s * rng.range(0.34, 0.62), s * 0.05), ink);
      mark.position.set(
        note.position.x - s * rng.range(0.0, 0.14),
        note.position.y + s * (0.16 - l * 0.22),
        note.position.z + 0.0002
      );
      mark.rotation.z = note.rotation.z;
      group.add(mark);
    }
  }
  return { object: group, obstacleRadius: 0 };
}
