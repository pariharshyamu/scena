import {
  BoxGeometry,
  Color,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createVessel, type VesselStyle } from './vessels';
import type { Prop } from '../core/types';

/**
 * Clutter — the small stuff that sits on things.
 *
 * The kit already had carryables, and every one of them is a *carryable*: a
 * basket is 48 cm across, so three of them is a full table and a tabletop
 * dressed from that set says nothing except "somebody left the shopping
 * out". What was missing is the 5–25 cm layer — books, papers, folded cloth,
 * a couple of pieces of fruit — which is what actually makes a shelf look
 * like a shelf rather than a shelf-shaped object.
 *
 * ```ts
 * dress(shelf.surfaces[0], createClutter({ theme: 'study', count: 7, seed: 2 }));
 * ```
 *
 * Everything here is deliberately cheap: a book is one box, a stack is five.
 * At the size these occupy on screen that is already more detail than
 * survives, and the budget belongs to having *more different things* rather
 * than better ones.
 */

export interface ClutterOptions {
  seed?: number;
  palette?: Palette;
}

/** Spine colours that look like books rather than like a paint chart. */
function bookColours(palette: Palette): number[] {
  return [
    0x7d3b3b, 0x2f4a6b, 0x4a5a35, 0x6b4a2f, 0x3d3a4a, 0x8a6a3a, 0x2f5a52,
    new Color(palette.roof).getHex(),
    new Color(palette.woodDark).getHex(),
  ];
}

export type BookStyle =
  /** Lying flat, largest at the bottom. */
  | 'stack'
  /** Standing in a row, shoulder to shoulder. */
  | 'row'
  /** A short row with the last one leaning on it. */
  | 'leaning'
  /** One book, open, face down. */
  | 'open';

export interface BooksOptions extends ClutterOptions {
  style?: BookStyle;
  /** How many. Default 4. */
  count?: number;
}

/**
 * Books.
 *
 * A row of spines with varied heights, a few leaning, one stack lying flat is
 * most of what a bookshelf is, and none of it needs more than a box each.
 */
export function createBooks(options: BooksOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const style = options.style ?? 'stack';
  const palette = options.palette ?? DEFAULT_PALETTE;
  const colours = bookColours(palette);
  const count = options.count ?? (style === 'open' ? 1 : 3 + Math.floor(rng.next() * 3));

  const group = new Group();
  group.name = `books-${style}`;
  const mat = (): MeshStandardMaterial =>
    new MeshStandardMaterial({ color: rng.pick(colours), roughness: 0.85, flatShading: true });

  if (style === 'stack') {
    let y = 0;
    // Biggest at the bottom, and each one askew — a stack squared up is a
    // single box with lines drawn on it.
    let w = rng.range(0.15, 0.19);
    let d = rng.range(0.11, 0.14);
    for (let i = 0; i < count; i++) {
      const t = rng.range(0.022, 0.042);
      const book = new Mesh(new BoxGeometry(w, t, d), mat());
      book.position.set(rng.range(-0.012, 0.012), y + t / 2, rng.range(-0.012, 0.012));
      book.rotation.y = rng.range(-0.22, 0.22);
      group.add(book);
      y += t;
      w *= rng.range(0.9, 0.99);
      d *= rng.range(0.9, 0.99);
    }
  } else if (style === 'open') {
    // Face down, splayed: two leaves at a shallow angle over a spine.
    const w = rng.range(0.13, 0.16);
    const d = rng.range(0.1, 0.13);
    const cover = mat();
    const tilt = 0.13;
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    const leafT = 0.008;
    const pagesT = 0.012;
    // Splayed leaves are tilted boxes, and a tilted box has to be lifted by
    // its rotated half-extent or a corner ends up under the table.
    const pagesY = (pagesT * cos + w * 0.94 * sin) / 2;
    const coverY = pagesY + ((pagesT + leafT) / 2) * cos;
    for (const s of [-1, 1]) {
      const pages = new Mesh(
        new BoxGeometry(w * 0.94, pagesT, d * 0.92),
        new MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.95, flatShading: true })
      );
      pages.position.set(s * w * 0.5, pagesY, 0);
      pages.rotation.z = s * tilt;
      group.add(pages);
      const leaf = new Mesh(new BoxGeometry(w, leafT, d), cover);
      leaf.position.set(s * w * 0.5, coverY, 0);
      leaf.rotation.z = s * tilt;
      group.add(leaf);
    }
  } else {
    // Standing. `leaning` tips the last one against the rest, which needs a
    // real gap left for it or it just intersects its neighbour.
    let x = 0;
    for (let i = 0; i < count; i++) {
      const h = rng.range(0.15, 0.22);
      const w = rng.range(0.024, 0.042);
      const d = rng.range(0.1, 0.14);
      const last = i === count - 1;
      const tip = style === 'leaning' && last ? rng.range(0.34, 0.5) : 0;
      const book = new Mesh(new BoxGeometry(w, h, d), mat());
      // A tipped box is lifted by its OWN half-extent after rotation, which
      // includes its thickness: h*cos/2 alone leaves the low corner w*sin/2
      // below the shelf, and a leaning book that sinks into the wood is more
      // obviously wrong than one that never leaned.
      book.position.set(
        x + w / 2 + Math.sin(tip) * h * 0.5,
        (Math.cos(tip) * h + Math.sin(tip) * w) / 2,
        0
      );
      book.rotation.z = -tip;
      group.add(book);
      x += w + (tip > 0 ? Math.sin(tip) * h * 0.5 : rng.range(0.001, 0.004));
    }
    group.position.x = -x / 2;
  }
  return { object: group, obstacleRadius: 0 };
}

export interface PapersOptions extends ClutterOptions {
  /** How many sheets. Default 6. */
  count?: number;
  /** Sheet long edge in metres. Default 0.24. */
  size?: number;
}

/** A slew of loose sheets: a stack, never square, with one clear of the pile. */
export function createPapers(options: PapersOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const count = options.count ?? 6;
  const long = options.size ?? 0.24;
  const short = long * 0.707;

  const group = new Group();
  group.name = 'papers';
  const paper = new MeshStandardMaterial({ color: 0xeae6da, roughness: 0.95, flatShading: true });
  const scrap = new MeshStandardMaterial({ color: 0xdcd6c4, roughness: 0.95, flatShading: true });

  for (let i = 0; i < count; i++) {
    const stray = i === count - 1 && count > 2;
    const sheet = new Mesh(new BoxGeometry(long, 0.0012, short), rng.next() < 0.3 ? scrap : paper);
    sheet.position.set(
      stray ? rng.range(0.05, 0.09) : rng.range(-0.014, 0.014),
      0.0007 + i * 0.0013,
      stray ? rng.range(-0.05, 0.05) : rng.range(-0.012, 0.012)
    );
    // The whole prop is the fact that no two sheets line up.
    // A sheet skewed too far off the pile turns the whole prop into a 44 cm
    // spread, which `dress` then has to find room for as a single footprint.
    sheet.rotation.y = stray ? rng.range(-0.5, 0.5) : rng.range(-0.1, 0.1);
    if (stray) sheet.position.y = 0.0007;
    group.add(sheet);
  }
  return { object: group, obstacleRadius: 0 };
}

export interface FoldedOptions extends ClutterOptions {
  /** Folded width in metres. Default 0.2. */
  width?: number;
  /** Cloth colour. Defaults to a seeded pick from the palette. */
  color?: number;
}

/** Folded cloth: a towel, a napkin pile, a blanket on the end of a bed. */
export function createFolded(options: FoldedOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const w = options.width ?? 0.2;
  const d = w * rng.range(0.6, 0.78);

  const group = new Group();
  group.name = 'folded';
  const base = new Color(
    options.color ?? rng.pick([0xb8b0a0, 0x8a9aa8, 0xa89080, 0x9aa88c, new Color(palette.wall).getHex()])
  );
  const layers = 2 + Math.floor(rng.next() * 3);
  let y = 0;
  for (let i = 0; i < layers; i++) {
    const t = rng.range(0.014, 0.026);
    const shade = base.clone().offsetHSL(0, 0, rng.range(-0.06, 0.06));
    const slab = new Mesh(
      new BoxGeometry(w * rng.range(0.94, 1.0), t, d * rng.range(0.94, 1.0)),
      createSurface('canvas', { color: shade.getHex(), roughness: 0.95, seed: seed + i })
    );
    // Folded cloth never stacks square; the offsets are the whole read.
    slab.position.set(rng.range(-0.008, 0.008), y + t / 2, rng.range(-0.008, 0.008));
    slab.rotation.y = rng.range(-0.08, 0.08);
    group.add(slab);
    y += t;
  }
  return { object: group, obstacleRadius: 0 };
}

export interface TrinketOptions extends ClutterOptions {
  /** Long edge in metres. Default 0.1. */
  size?: number;
}

/** A small lidded box — the filler that reads as "something of theirs". */
export function createTrinket(options: TrinketOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const w = (options.size ?? 0.1) * rng.range(0.8, 1.2);
  const d = w * rng.range(0.6, 0.95);
  const h = w * rng.range(0.35, 0.6);

  const group = new Group();
  group.name = 'trinket';
  const wood = createSurface('wood', { color: palette.woodDark, seed });
  const body = new Mesh(new BoxGeometry(w, h * 0.78, d), wood);
  body.position.y = (h * 0.78) / 2;
  group.add(body);
  const lid = new Mesh(new BoxGeometry(w * 1.06, h * 0.22, d * 1.06), wood);
  lid.position.y = h * 0.78 + (h * 0.22) / 2;
  group.add(lid);
  if (rng.next() < 0.6) {
    const clasp = new Mesh(
      new BoxGeometry(w * 0.14, h * 0.2, 0.004),
      new MeshStandardMaterial({ color: 0xb8983f, roughness: 0.4, metalness: 0.6 })
    );
    clasp.position.set(0, h * 0.72, d / 2 + 0.002);
    group.add(clasp);
  }
  return { object: group, obstacleRadius: 0 };
}

export interface FruitBowlOptions extends ClutterOptions {
  /** How many pieces. Default 5. */
  count?: number;
}

/**
 * A bowl with fruit in it — the one piece here that composes the two tracks,
 * since the bowl is a lathe and the fruit are not.
 */
export function createFruitBowl(options: FruitBowlOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const bowl = createVessel({ style: 'bowl', seed, palette: options.palette });
  const group = bowl.object;
  group.name = 'fruitBowl';

  const count = options.count ?? 5;
  const hues = [0.02, 0.09, 0.14, 0.28, 0.85];
  for (let i = 0; i < count; i++) {
    const r = bowl.radius * rng.range(0.16, 0.24);
    const fruit = new Mesh(
      new IcosahedronGeometry(r, 0),
      new MeshStandardMaterial({
        color: new Color().setHSL(rng.pick(hues), rng.range(0.45, 0.7), rng.range(0.35, 0.5)).getHex(),
        roughness: 0.75,
        flatShading: true,
      })
    );
    // Inside the bowl and resting on its floor, not floating over the rim.
    const a = rng.next() * Math.PI * 2;
    const spread = bowl.radius * rng.range(0, 0.42);
    fruit.position.set(
      Math.cos(a) * spread,
      bowl.height * 0.28 + r * 0.7 + (i > 2 ? r : 0),
      Math.sin(a) * spread
    );
    fruit.scale.y = rng.range(0.82, 1.0);
    group.add(fruit);
  }
  return { object: group, obstacleRadius: 0 };
}

export type ClutterTheme = 'domestic' | 'kitchen' | 'study' | 'workshop';

export interface ClutterKitOptions extends ClutterOptions {
  theme?: ClutterTheme;
  /** How many pieces to make. Default 6. */
  count?: number;
}

type Maker = (seed: number, palette: Palette) => Prop;

const vessel = (style: VesselStyle): Maker => (seed, palette) =>
  createVessel({ style, seed, palette });

const THEMES: Record<ClutterTheme, Maker[]> = {
  domestic: [
    vessel('vase'),
    vessel('bowl'),
    vessel('candlestick'),
    (s, p) => createBooks({ style: 'stack', seed: s, palette: p }),
    (s, p) => createFolded({ seed: s, palette: p }),
    (s, p) => createFruitBowl({ seed: s, palette: p }),
    (s, p) => createTrinket({ seed: s, palette: p }),
  ],
  kitchen: [
    vessel('jug'),
    vessel('pot'),
    vessel('bowl'),
    vessel('bottle'),
    (s, p) => createFruitBowl({ seed: s, palette: p }),
    (s, p) => createFolded({ seed: s, width: 0.16, palette: p }),
  ],
  study: [
    (s, p) => createBooks({ style: 'row', seed: s, palette: p }),
    (s, p) => createBooks({ style: 'stack', seed: s, palette: p }),
    (s, p) => createBooks({ style: 'leaning', seed: s, palette: p }),
    (s, p) => createBooks({ style: 'open', seed: s, palette: p }),
    (s, p) => createPapers({ seed: s, palette: p }),
    vessel('bottle'),
    vessel('candlestick'),
    (s, p) => createTrinket({ seed: s, palette: p }),
  ],
  workshop: [
    vessel('pot'),
    vessel('bottle'),
    vessel('urn'),
    (s, p) => createPapers({ seed: s, count: 3, palette: p }),
    (s, p) => createTrinket({ seed: s, size: 0.13, palette: p }),
    (s, p) => createFolded({ seed: s, width: 0.15, palette: p }),
  ],
};

/**
 * A mixed set of small things, ready to hand straight to `dress`.
 *
 * The pool is drawn from **without replacement until it runs out**, so a set
 * of six is six different things rather than the same vase six times — which
 * is what picking at random gives you, and which is exactly as obviously
 * generated as an even spread.
 */
export function createClutter(options: ClutterKitOptions = {}): Prop[] {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const pool = THEMES[options.theme ?? 'domestic'];
  const count = options.count ?? 6;

  const out: Prop[] = [];
  let bag: Maker[] = [];
  for (let i = 0; i < count; i++) {
    if (bag.length === 0) bag = pool.slice();
    const pick = Math.floor(rng.next() * bag.length);
    const maker = bag[pick];
    bag.splice(pick, 1);
    out.push(maker(seed * 31 + i * 7 + 1, palette));
  }
  return out;
}

export const CLUTTER_THEMES: ClutterTheme[] = ['domestic', 'kitchen', 'study', 'workshop'];
