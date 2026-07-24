import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createSlot } from '../core/types';
import type { Prop, PropSlot } from '../core/types';

/**
 * Interior furniture — the cottage set. Every piece follows the Prop
 * contract (seeded, palette-themed, origin at floor level, honest
 * obstacleRadius), so it scatters, steers and re-themes like any other
 * SCENA prop; it just happens to live indoors.
 */

// ---- tables ------------------------------------------------------------

export type TableStyle = 'round' | 'trestle' | 'desk';

export interface TableOptions {
  seed?: number;
  /** 'round' pedestal table, long 'trestle' board, or a small 'desk'. */
  style?: TableStyle;
  palette?: Palette;
}

/** A wooden table: round pedestal, long trestle board, or writing desk. */
export function createTable(options: TableOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const style = options.style ?? 'trestle';
  const palette = options.palette ?? DEFAULT_PALETTE;
  const top = createSurface('plank', { color: palette.wood, seed });
  const legWood = createSurface('wood', { color: palette.woodDark, seed: seed + 1 });

  const group = new Group();
  group.name = `table-${style}`;
  const h = 0.74 + rng.range(-0.02, 0.02);
  let radius = 0.8;

  if (style === 'round') {
    const board = new Mesh(new CylinderGeometry(0.72, 0.72, 0.07, 10), top);
    board.position.y = h;
    const stem = new Mesh(new CylinderGeometry(0.09, 0.13, h, 7), legWood);
    stem.position.y = h / 2;
    const foot = new Mesh(new CylinderGeometry(0.34, 0.4, 0.08, 8), legWood);
    foot.position.y = 0.04;
    group.add(board, stem, foot);
    radius = 0.78;
  } else if (style === 'trestle') {
    const board = new Mesh(new BoxGeometry(2.0, 0.08, 0.9), top);
    board.position.y = h;
    group.add(board);
    for (const side of [-1, 1]) {
      for (const lean of [-1, 1]) {
        const leg = new Mesh(new BoxGeometry(0.09, h, 0.12), legWood);
        leg.position.set(side * 0.78, h / 2, 0);
        leg.rotation.x = lean * 0.32;
        group.add(leg);
      }
    }
    const stretcher = new Mesh(new BoxGeometry(1.66, 0.08, 0.1), legWood);
    stretcher.position.y = 0.24;
    group.add(stretcher);
    radius = 1.05;
  } else {
    const board = new Mesh(new BoxGeometry(1.3, 0.06, 0.68), top);
    board.position.y = h;
    group.add(board);
    const apron = new Mesh(new BoxGeometry(1.18, 0.16, 0.56), legWood);
    apron.position.y = h - 0.11;
    group.add(apron);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new Mesh(new BoxGeometry(0.07, h, 0.07), legWood);
        leg.position.set(sx * 0.56, h / 2, sz * 0.26);
        group.add(leg);
      }
    }
    radius = 0.72;
  }
  return { object: group, obstacleRadius: radius };
}

// ---- seats -------------------------------------------------------------

export type SeatStyle = 'chair' | 'bench' | 'stool';

export interface SeatOptions {
  seed?: number;
  /** A slat-back 'chair', a long 'bench', or a three-legged 'stool'. */
  style?: SeatStyle;
  palette?: Palette;
}

/** Something to sit on: chair, bench or stool. Seat height ≈ 0.45. */
export function createSeat(options: SeatOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const style = options.style ?? 'chair';
  const palette = options.palette ?? DEFAULT_PALETTE;
  const wood = createSurface('wood', { color: palette.wood, seed });
  const dark = createSurface('wood', { color: palette.woodDark, seed: seed + 1 });

  const group = new Group();
  group.name = `seat-${style}`;
  const h = 0.45;
  let radius = 0.3;

  if (style === 'stool') {
    const disc = new Mesh(new CylinderGeometry(0.24, 0.22, 0.06, 8), wood);
    disc.position.y = h;
    group.add(disc);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rng.range(0, 0.4);
      const leg = new Mesh(new CylinderGeometry(0.035, 0.045, h, 5), dark);
      leg.position.set(Math.cos(a) * 0.13, h / 2, Math.sin(a) * 0.13);
      leg.rotation.z = Math.cos(a) * 0.22;
      leg.rotation.x = -Math.sin(a) * 0.22;
      group.add(leg);
    }
    radius = 0.26;
  } else if (style === 'bench') {
    const seat = new Mesh(new BoxGeometry(1.5, 0.06, 0.36), wood);
    seat.position.y = h;
    group.add(seat);
    for (const side of [-1, 1]) {
      const leg = new Mesh(new BoxGeometry(0.08, h, 0.3), dark);
      leg.position.set(side * 0.6, h / 2, 0);
      leg.rotation.z = side * 0.06;
      group.add(leg);
    }
    radius = 0.78;
  } else {
    const seat = new Mesh(new BoxGeometry(0.44, 0.05, 0.42), wood);
    seat.position.y = h;
    group.add(seat);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const back = sz < 0;
        const leg = new Mesh(new BoxGeometry(0.05, back ? 0.98 : h, 0.05), dark);
        leg.position.set(sx * 0.18, back ? 0.49 : h / 2, sz * 0.17);
        group.add(leg);
      }
    }
    for (const y of [0.72, 0.88]) {
      const slat = new Mesh(new BoxGeometry(0.36, 0.08, 0.03), wood);
      slat.position.set(0, y, -0.17);
      group.add(slat);
    }
    radius = 0.3;
  }
  // Sitting places — chairs and stools seat one, benches two.
  const slots: PropSlot[] =
    style === 'bench'
      ? [createSlot('sit', 'sit', group, -0.4, 0, 0), createSlot('sit', 'sit', group, 0.4, 0, 0)]
      : [createSlot('sit', 'sit', group, 0, 0, 0)];
  return { object: group, obstacleRadius: radius, slots };
}

// ---- beds --------------------------------------------------------------

export type BedSize = 'single' | 'double' | 'bunk';

export interface BedOptions {
  seed?: number;
  /** 'single', wide 'double', or stacked 'bunk'. */
  size?: BedSize;
  palette?: Palette;
}

/** A post bed with mattress, quilt and pillow. Bunks stack two. */
export function createBed(options: BedOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const size = options.size ?? 'single';
  const palette = options.palette ?? DEFAULT_PALETTE;
  const frame = createSurface('wood', { color: palette.woodDark, seed });
  const linen = new MeshStandardMaterial({ color: 0xefe6d2, flatShading: true });
  const quiltMat = createSurface('canvas', { color: palette.roof, seed: seed + 2 });

  const w = size === 'double' ? 1.6 : 0.95;
  const l = 2.05;
  const group = new Group();
  group.name = `bed-${size}`;

  const deck = (baseY: number): void => {
    const base = new Mesh(new BoxGeometry(w, 0.1, l), frame);
    base.position.y = baseY;
    const mattress = new Mesh(new BoxGeometry(w - 0.08, 0.14, l - 0.08), linen);
    mattress.position.y = baseY + 0.12;
    const quilt = new Mesh(new BoxGeometry(w - 0.04, 0.08, l * 0.62), quiltMat);
    quilt.position.set(0, baseY + 0.21, l * 0.16);
    group.add(base, mattress, quilt);
    const pillows = size === 'double' ? [-w / 4, w / 4] : [0];
    for (const px of pillows) {
      const pillow = new Mesh(new BoxGeometry(w * (size === 'double' ? 0.38 : 0.6), 0.09, 0.34), linen);
      pillow.position.set(px, baseY + 0.22, -l / 2 + 0.28);
      pillow.rotation.y = rng.jitter(0, 0.06);
      group.add(pillow);
    }
    const head = new Mesh(new BoxGeometry(w, 0.5, 0.07), frame);
    head.position.set(0, baseY + 0.3, -l / 2 + 0.03);
    group.add(head);
  };

  const postH = size === 'bunk' ? 1.9 : 0.75;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.09, postH, 0.09), frame);
      post.position.set(sx * (w / 2 - 0.045), postH / 2, sz * (l / 2 - 0.045));
      group.add(post);
    }
  }
  deck(0.32);
  if (size === 'bunk') {
    deck(1.35);
    // Ladder up the side.
    for (const y of [0.55, 0.9, 1.25]) {
      const rung = new Mesh(new CylinderGeometry(0.025, 0.025, 0.4, 5), frame);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(w / 2 + 0.02, y, l * 0.22);
      group.add(rung);
    }
  }
  // Sleeping places: anchor at the foot end on the mattress, pitched flat
  // so the body extends toward the headboard (ANIMA's sleep convention).
  const sleepAt = (x: number, deckY: number): PropSlot =>
    createSlot('sleep', 'sleep', group, x, deckY + 0.22, l / 2 - 0.3, 0, -Math.PI / 2);
  const slots: PropSlot[] =
    size === 'bunk'
      ? [sleepAt(0, 0.32), sleepAt(0, 1.35)]
      : size === 'double'
        ? [sleepAt(-w / 4, 0.32), sleepAt(w / 4, 0.32)]
        : [sleepAt(0, 0.32)];
  return { object: group, obstacleRadius: size === 'double' ? 1.25 : 1.1, slots };
}

// ---- shelves -----------------------------------------------------------

export type ShelfStock = 'books' | 'pottery' | 'food' | 'empty';

export interface ShelfOptions {
  seed?: number;
  /** What lines the boards: 'books', 'pottery', 'food' or 'empty'. */
  stock?: ShelfStock;
  palette?: Palette;
}

/** A tall open shelf, boards lined with seeded books, pots or provisions. */
export function createShelf(options: ShelfOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const stock = options.stock ?? 'books';
  const palette = options.palette ?? DEFAULT_PALETTE;
  const wood = createSurface('wood', { color: palette.woodDark, seed });
  const board = createSurface('plank', { color: palette.wood, seed: seed + 1 });

  const W = 1.25;
  const H = 1.85;
  const D = 0.34;
  const group = new Group();
  group.name = `shelf-${stock}`;

  for (const side of [-1, 1]) {
    const panel = new Mesh(new BoxGeometry(0.06, H, D), wood);
    panel.position.set(side * (W / 2 - 0.03), H / 2, 0);
    group.add(panel);
  }
  const back = new Mesh(new BoxGeometry(W, H, 0.04), wood);
  back.position.set(0, H / 2, -D / 2 + 0.02);
  group.add(back);

  const boardYs = [0.28, 0.78, 1.28, 1.72];
  for (const y of boardYs) {
    const shelfBoard = new Mesh(new BoxGeometry(W - 0.1, 0.05, D - 0.04), board);
    shelfBoard.position.set(0, y, 0);
    group.add(shelfBoard);
  }

  if (stock !== 'empty') {
    const hues = [palette.roof, palette.water, palette.foliage[0], palette.trunk, palette.metal, palette.path];
    for (const y of boardYs.slice(0, 3)) {
      let x = -W / 2 + 0.14;
      while (x < W / 2 - 0.16) {
        if (stock === 'books') {
          const bh = rng.range(0.16, 0.26);
          const bw = rng.range(0.035, 0.06);
          const bookMat = new MeshStandardMaterial({ color: rng.pick(hues), flatShading: true });
          const tilt = rng.next() < 0.12 ? rng.range(0.1, 0.22) : 0;
          const bk = new Mesh(new BoxGeometry(bw, bh, 0.2), bookMat);
          bk.position.set(x, y + 0.025 + bh / 2, 0);
          bk.rotation.z = tilt;
          group.add(bk);
          x += bw + 0.012 + tilt * 0.1;
        } else if (stock === 'pottery') {
          const r = rng.range(0.05, 0.09);
          const ph = rng.range(0.12, 0.22);
          const pot = new Mesh(
            new CylinderGeometry(r * rng.range(0.5, 0.8), r, ph, 7),
            createSurface('terracotta', { seed: rng.int(1, 1e9) })
          );
          pot.position.set(x + r, y + 0.025 + ph / 2, rng.jitter(0, 0.04));
          group.add(pot);
          x += r * 2 + rng.range(0.05, 0.12);
        } else {
          // food: sacks and round loaves
          const r = rng.range(0.07, 0.1);
          const isSack = rng.next() < 0.5;
          const item = new Mesh(
            isSack ? new IcosahedronGeometry(r, 0) : new SphereGeometry(r, 7, 5),
            isSack
              ? createSurface('canvas', { color: palette.sand, seed: rng.int(1, 1e9) })
              : new MeshStandardMaterial({ color: 0xb8874f, flatShading: true })
          );
          item.scale.y = 0.72;
          item.position.set(x + r, y + 0.025 + r * 0.6, rng.jitter(0, 0.04));
          group.add(item);
          x += r * 2 + rng.range(0.04, 0.1);
        }
      }
    }
  }
  return { object: group, obstacleRadius: 0.65 };
}

// ---- chests ------------------------------------------------------------

export interface ChestOptions {
  seed?: number;
  /** Tilt the lid open. Default false. */
  open?: boolean;
  palette?: Palette;
}

/** A banded storage chest with a domed lid; `open` tilts it back. */
export function createChest(options: ChestOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const wood = createSurface('plank', { color: palette.wood, seed });
  const metal = new MeshStandardMaterial({ color: palette.metal, flatShading: true, metalness: 0.5, roughness: 0.5 });

  const W = 0.95;
  const H = 0.5;
  const D = 0.55;
  const group = new Group();
  group.name = 'chest';

  const body = new Mesh(new BoxGeometry(W, H, D), wood);
  body.position.y = H / 2;
  group.add(body);
  for (const x of [-W * 0.32, W * 0.32]) {
    const band = new Mesh(new BoxGeometry(0.06, H + 0.02, D + 0.02), metal);
    band.position.set(x, H / 2, 0);
    group.add(band);
  }

  // Lid: a slab hinged at the back edge, with its own metal bands.
  const lid = new Group();
  lid.name = 'lid';
  const slab = new Mesh(new BoxGeometry(W + 0.04, 0.12, D + 0.04), wood);
  slab.position.set(0, 0.06, D / 2);
  lid.add(slab);
  for (const x of [-W * 0.32, W * 0.32]) {
    const band = new Mesh(new BoxGeometry(0.06, 0.14, D + 0.06), metal);
    band.position.set(x, 0.06, D / 2);
    lid.add(band);
  }
  lid.position.set(0, H, -D / 2);
  if (options.open) lid.rotation.x = -1.1;
  group.add(lid);

  const hasp = new Mesh(new BoxGeometry(0.08, 0.14, 0.03), metal);
  hasp.position.set(0, H - 0.02, D / 2 + 0.015);
  group.add(hasp);

  return { object: group, obstacleRadius: 0.55 };
}

// ---- candles -----------------------------------------------------------

export type CandleStyle = 'single' | 'candelabra' | 'chandelier';

export interface CandleOptions {
  seed?: number;
  /**
   * 'single' tabletop candle on a dish, a standing 'candelabra', or a
   * 'chandelier' meant to hang (origin at the hook — position it at the
   * ceiling and it hangs down).
   */
  style?: CandleStyle;
  /** Add one real PointLight. Default false — glow is free, lights are not. */
  light?: boolean;
  palette?: Palette;
}

/** Candlelight: glowing flames with a gentle flicker; real light opt-in. */
export function createCandle(options: CandleOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const style = options.style ?? 'single';
  const palette = options.palette ?? DEFAULT_PALETTE;
  const wax = new MeshStandardMaterial({ color: 0xf2e8d0, flatShading: true });
  const metal = new MeshStandardMaterial({ color: palette.metal, flatShading: true, metalness: 0.4, roughness: 0.55 });
  const flameMat = new MeshStandardMaterial({
    color: palette.lampGlow,
    emissive: palette.lampGlow,
    emissiveIntensity: 1.9,
    flatShading: true,
  });

  const group = new Group();
  group.name = `candle-${style}`;
  let lightY = 0.3;
  let radius = 0;

  const candleAt = (x: number, y: number, z: number, h: number): void => {
    const stick = new Mesh(new CylinderGeometry(0.025, 0.03, h, 6), wax);
    stick.position.set(x, y + h / 2, z);
    const flame = new Mesh(new IcosahedronGeometry(0.035, 0), flameMat);
    flame.scale.y = 1.7;
    flame.position.set(x, y + h + 0.05, z);
    group.add(stick, flame);
  };

  if (style === 'single') {
    const dish = new Mesh(new CylinderGeometry(0.09, 0.11, 0.025, 8), metal);
    dish.position.y = 0.012;
    group.add(dish);
    candleAt(0, 0.025, 0, rng.range(0.14, 0.22));
    lightY = 0.3;
  } else if (style === 'candelabra') {
    const foot = new Mesh(new CylinderGeometry(0.14, 0.18, 0.04, 8), metal);
    foot.position.y = 0.02;
    const stem = new Mesh(new CylinderGeometry(0.03, 0.04, 1.15, 6), metal);
    stem.position.y = 0.6;
    group.add(foot, stem);
    const arm = new Mesh(new BoxGeometry(0.72, 0.04, 0.04), metal);
    arm.position.y = 1.18;
    group.add(arm);
    for (const x of [-0.34, 0, 0.34]) candleAt(x, x === 0 ? 1.24 : 1.2, 0, 0.16);
    lightY = 1.5;
    radius = 0.24;
  } else {
    // chandelier: origin at the hook, hangs downward.
    const chain = new Mesh(new CylinderGeometry(0.015, 0.015, 0.7, 5), metal);
    chain.position.y = -0.35;
    const ring = new Mesh(new TorusGeometry(0.5, 0.035, 6, 10), metal);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.75;
    group.add(chain, ring);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      candleAt(Math.cos(a) * 0.5, -0.75, Math.sin(a) * 0.5, 0.14);
    }
    lightY = -0.45;
  }

  let light: PointLight | null = null;
  if (options.light) {
    light = new PointLight(palette.lampGlow, style === 'single' ? 1.6 : 3.5, 7, 2);
    light.position.y = lightY;
    group.add(light);
  }

  // A gentle wax-flame flicker, self-driving like every SCENA fire.
  const phase = rng.range(0, 20);
  const flames = group.children.filter(
    (child) => (child as Mesh).material === flameMat
  ) as Mesh[];
  if (flames.length > 0) {
    const base = light?.intensity ?? 0;
    flames[0].onBeforeRender = () => {
      const t = performance.now() * 0.001 + phase;
      const flick = 0.86 + 0.09 * Math.sin(t * 9.0) + 0.05 * Math.sin(t * 17.3 + 1.2);
      flameMat.emissiveIntensity = 1.9 * flick;
      if (light) light.intensity = base * flick;
    };
  }

  return { object: group, obstacleRadius: radius };
}

// ---- rugs --------------------------------------------------------------

export type RugShape = 'round' | 'square' | 'runner';

export interface RugOptions {
  seed?: number;
  /** 'round' banded disc, 'square' bordered mat, or a long 'runner'. */
  shape?: RugShape;
  palette?: Palette;
}

/** A woven rug: banded, palette-dyed, and walk-through (radius 0). */
export function createRug(options: RugOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const shape = options.shape ?? 'round';
  const palette = options.palette ?? DEFAULT_PALETTE;
  const dyes = [palette.roof, palette.sand, palette.water, palette.path];
  const group = new Group();
  group.name = `rug-${shape}`;

  if (shape === 'round') {
    const rings = [1.0, 0.78, 0.5];
    rings.forEach((r, i) => {
      const disc = new Mesh(
        new CylinderGeometry(r, r, 0.02 + i * 0.006, 10),
        new MeshStandardMaterial({ color: dyes[(i + rng.int(0, 3)) % dyes.length], flatShading: true })
      );
      disc.position.y = 0.011 + i * 0.004;
      disc.rotation.y = rng.range(0, Math.PI / 5);
      group.add(disc);
    });
  } else {
    const long = shape === 'runner' ? 2.6 : 1.6;
    const wide = shape === 'runner' ? 1.0 : 1.6;
    const border = new Mesh(
      new BoxGeometry(long, 0.02, wide),
      new MeshStandardMaterial({ color: dyes[rng.int(0, 3)], flatShading: true })
    );
    border.position.y = 0.01;
    group.add(border);
    const bands = shape === 'runner' ? 5 : 3;
    for (let i = 0; i < bands; i++) {
      const band = new Mesh(
        new BoxGeometry((long - 0.3) / bands - 0.06, 0.02, wide - 0.3),
        new MeshStandardMaterial({ color: dyes[(i + 1 + rng.int(0, 2)) % dyes.length], flatShading: true })
      );
      band.position.set(-((long - 0.3) / 2) + (i + 0.5) * ((long - 0.3) / bands), 0.02, 0);
      group.add(band);
    }
  }
  return { object: group, obstacleRadius: 0 };
}
