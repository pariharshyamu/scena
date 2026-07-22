import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

export type StallGoods = 'produce' | 'pottery' | 'bakery' | 'textiles';

export interface StallOptions {
  seed?: number;
  /** What the stall sells. Default seeded. */
  goods?: StallGoods;
  /** Awning fabric colour (the coloured stripe). Default seeded. */
  clothColor?: number;
  palette?: Palette;
}

// Awning stripe colours (the pale stripe is shared cream). Market-canvas hues.
const CLOTH_COLORS = [0xb5372f, 0x2f5fa8, 0x3f7a4a, 0xc98a2f, 0x7a3f6a, 0x2f8f8a];
const CLOTH_CREAM = 0xe8dcc0;
const FRUIT_COLORS = [0xc0392b, 0xe0812c, 0x9ab52f, 0x7a3f6a, 0xe0c23c, 0xd05a2f];
const BREAD_COLORS = [0xc79a5b, 0xb5854a, 0xd8b477];

const ALL_GOODS: StallGoods[] = ['produce', 'pottery', 'bakery', 'textiles'];

/**
 * A market stall: four posts, a forward-sloping striped canvas awning with a
 * fringed valance, a plank counter and back shelf, stocked with seeded goods.
 * Four trades — `produce`, `pottery`, `bakery`, `textiles` — each stocks the
 * counter differently, so a market row reads as a bustling variety rather
 * than one stall repeated.
 */
export function createStall(options: StallOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;
  const goods = options.goods ?? rng.pick(ALL_GOODS);
  const clothColor = options.clothColor ?? rng.pick(CLOTH_COLORS);

  const group = new Group();
  group.name = 'stall';

  const wood = createSurface('wood', { color: palette.woodDark, seed });
  const plank = createSurface('plank', { color: palette.wood, seed: seed + 3 });
  const stripe = new MeshStandardMaterial({ color: clothColor, roughness: 0.95, flatShading: true });
  const cream = new MeshStandardMaterial({ color: CLOTH_CREAM, roughness: 0.95, flatShading: true });

  const W = 2.6; // width (x)
  const D = 1.7; // depth (z), front at +D/2
  const backH = 2.5;
  const frontH = 2.05;

  // Four posts (front pair shorter → the awning sheds forward).
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const h = sz < 0 ? backH : frontH;
      const post = new Mesh(new CylinderGeometry(0.055, 0.07, h, 6), wood);
      post.position.set(sx * (W / 2 - 0.1), h / 2, sz * (D / 2 - 0.1));
      group.add(post);
    }
  }

  // Sloping striped awning: strips run front-to-back across the width.
  const overhang = 0.32;
  const backZ = -D / 2 + 0.05;
  const frontZ = D / 2 + overhang;
  const dz = frontZ - backZ;
  const dy = frontH + 0.06 - (backH + 0.06);
  const slopeLen = Math.hypot(dz, dy);
  const tilt = Math.atan2(backH - frontH, dz); // +ve: front edge dips
  const midZ = (backZ + frontZ) / 2;
  const midY = (backH + frontH) / 2 + 0.06;
  const strips = 11;
  const stripW = (W + 0.5) / strips;
  for (let i = 0; i < strips; i++) {
    const canvas = new Mesh(
      new BoxGeometry(stripW * 0.97, 0.04, slopeLen),
      i % 2 === 0 ? stripe : cream
    );
    canvas.position.set(-((W + 0.5) / 2) + stripW * (i + 0.5), midY, midZ);
    canvas.rotation.x = tilt;
    group.add(canvas);
    // Fringed valance hanging off the front edge, continuing the stripe.
    const fringe = new Mesh(new BoxGeometry(stripW * 0.97, 0.2, 0.03), i % 2 === 0 ? stripe : cream);
    fringe.position.set(canvas.position.x, frontH - 0.04, frontZ);
    group.add(fringe);
  }

  // Plank counter at the front, and a back shelf.
  const counter = new Group();
  const top = new Mesh(new BoxGeometry(W - 0.1, 0.09, 0.62), plank);
  top.position.set(0, 0.96, D / 2 - 0.42);
  counter.add(top);
  const apron = new Mesh(new BoxGeometry(W - 0.1, 0.5, 0.05), plank);
  apron.position.set(0, 0.68, D / 2 - 0.12);
  counter.add(apron);
  group.add(counter);

  const shelf = new Mesh(new BoxGeometry(W - 0.3, 0.07, 0.28), plank);
  shelf.position.set(0, 1.45, -D / 2 + 0.22);
  group.add(shelf);

  // Stock the counter (and, for some trades, the ground) by trade.
  const counterY = 1.05;
  const spanX = W - 0.7;
  const acrossCounter = (n: number): number[] =>
    Array.from({ length: n }, (_, i) => -spanX / 2 + (spanX * (i + 0.5)) / n + rng.jitter(0, 0.05));

  if (goods === 'produce') {
    for (const x of acrossCounter(3)) {
      group.add(basket(rng, x, counterY, D / 2 - 0.42, palette, seed));
      fruitPile(rng, x, counterY + 0.16, D / 2 - 0.42).forEach((f) => group.add(f));
    }
  } else if (goods === 'bakery') {
    for (const x of acrossCounter(3)) {
      group.add(basket(rng, x, counterY, D / 2 - 0.42, palette, seed));
      for (let k = 0; k < rng.int(3, 5); k++) {
        const loaf = new Mesh(roundedLoaf(), matte(rng.pick(BREAD_COLORS)));
        loaf.position.set(x + rng.jitter(0, 0.09), counterY + 0.17, D / 2 - 0.42 + rng.jitter(0, 0.09));
        loaf.rotation.y = rng.range(0, Math.PI);
        group.add(loaf);
      }
    }
  } else if (goods === 'pottery') {
    const terracotta = createSurface('tile', { color: 0xb5623f, seed: seed + 5 });
    for (const x of acrossCounter(4)) {
      group.add(urn(rng, x, counterY, D / 2 - 0.42, terracotta));
    }
    // Big urns on the ground beside the stall.
    for (let k = 0; k < rng.int(2, 3); k++) {
      const scale = rng.range(1.6, 2.3);
      const big = urn(rng, rng.pick([-1, 1]) * (W / 2 + rng.range(0.2, 0.5)), 0, rng.range(-0.3, 0.5), terracotta);
      big.scale.setScalar(scale);
      group.add(big);
    }
  } else {
    // textiles: stacked folded bolts + a couple of rolls.
    for (const x of acrossCounter(3)) {
      let y = counterY;
      for (let k = 0, n = rng.int(2, 4); k < n; k++) {
        const bolt = new Mesh(new BoxGeometry(0.5, 0.12, 0.42), matte(rng.pick(CLOTH_COLORS)));
        bolt.position.set(x + rng.jitter(0, 0.04), y + 0.06, D / 2 - 0.42);
        bolt.rotation.y = rng.jitter(0, 0.08);
        group.add(bolt);
        y += 0.13;
      }
    }
    for (let k = 0; k < 2; k++) {
      const roll = new Mesh(new CylinderGeometry(0.11, 0.11, 0.5, 8), matte(rng.pick(CLOTH_COLORS)));
      roll.rotation.z = Math.PI / 2;
      roll.position.set(rng.range(-spanX / 2, spanX / 2), 1.52, -D / 2 + 0.22);
      group.add(roll);
    }
  }

  return { object: group, obstacleRadius: Math.hypot(W, D) / 2 };
}

// ---- goods helpers -----------------------------------------------------

function matte(color: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
}

function basket(rng: Rng, x: number, y: number, z: number, palette: Palette, seed: number): Mesh {
  const b = new Mesh(
    new CylinderGeometry(0.2, 0.16, 0.2, 9),
    createSurface('wood', { color: palette.wood, seed: seed + Math.floor(x * 100) })
  );
  b.position.set(x, y + 0.1, z + rng.jitter(0, 0.03));
  return b;
}

function fruitPile(rng: Rng, x: number, y: number, z: number): Mesh[] {
  const color = rng.pick(FRUIT_COLORS);
  const mat = matte(color);
  const out: Mesh[] = [];
  const n = rng.int(5, 8);
  for (let i = 0; i < n; i++) {
    const r = rng.range(0.05, 0.075);
    const fruit = new Mesh(new IcosahedronGeometry(r, 0), mat);
    const a = (i / n) * Math.PI * 2;
    const ring = i === 0 ? 0 : rng.range(0.04, 0.13);
    fruit.position.set(x + Math.cos(a) * ring, y + (i === 0 ? 0.05 : rng.range(-0.02, 0.02)), z + Math.sin(a) * ring);
    out.push(fruit);
  }
  return out;
}

function roundedLoaf(): BufferGeometry {
  const g = new BoxGeometry(0.22, 0.12, 0.14, 1, 1, 1);
  return g; // low-poly loaf; kept boxy on purpose for the flat-shaded look
}

function urn(rng: Rng, x: number, y: number, z: number, mat: Material): Group {
  const g = new Group();
  const h = rng.range(0.22, 0.34);
  const body = new Mesh(new CylinderGeometry(0.1, 0.07, h, 9), mat);
  body.position.y = h / 2;
  g.add(body);
  const shoulder = new Mesh(new CylinderGeometry(0.06, 0.11, h * 0.35, 9), mat);
  shoulder.position.y = h + h * 0.15;
  g.add(shoulder);
  const neck = new Mesh(new CylinderGeometry(0.055, 0.05, 0.06, 8), mat);
  neck.position.y = h + h * 0.35;
  g.add(neck);
  g.position.set(x + rng.jitter(0, 0.03), y, z + rng.jitter(0, 0.03));
  g.rotation.y = rng.range(0, Math.PI);
  return g;
}
