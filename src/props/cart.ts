import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  type Material,
  TorusGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createCrate } from './crate';
import type { Prop } from '../core/types';

export type CartStyle = 'cart' | 'wagon';
export type CartCargo = 'empty' | 'crates' | 'barrels' | 'sacks' | 'hay';

export interface CartOptions {
  seed?: number;
  /** Two-wheel hand `cart` (with shafts) or four-wheel `wagon`. Default seeded. */
  style?: CartStyle;
  /** What it carries. Default seeded. */
  cargo?: CartCargo;
  palette?: Palette;
}

const ALL_STYLES: CartStyle[] = ['cart', 'wagon'];
const ALL_CARGO: CartCargo[] = ['empty', 'crates', 'barrels', 'sacks', 'hay'];

/**
 * A wooden cart or wagon: spoked wheels with iron tyres, a planked bed with
 * low sideboards, and either two pull-shafts (a hand `cart`) or four wheels
 * (a `wagon`). Optionally loaded with crates, barrels, sacks or hay. Forward
 * is +X.
 */
export function createCart(options: CartOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;
  const style = options.style ?? rng.pick(ALL_STYLES);
  const cargo = options.cargo ?? rng.pick(ALL_CARGO);

  const group = new Group();
  group.name = 'cart';

  const plank = createSurface('plank', { color: palette.wood, seed });
  const wood = createSurface('wood', { color: palette.woodDark, seed: seed + 2 });
  const iron = createSurface('metal', { color: palette.metal, seed: seed + 4 });

  const bedL = style === 'wagon' ? 2.6 : 2.0; // along X (forward)
  const bedW = 1.3; // along Z
  const wheelR = style === 'wagon' ? 0.5 : 0.56;
  const TYRE = 1.11; // outer radius factor (rim + tyre tube) → contact lift
  const bedY = wheelR * TYRE + 0.18;

  // --- Bed + sideboards.
  const bed = new Mesh(new BoxGeometry(bedL, 0.12, bedW), plank);
  bed.position.y = bedY;
  group.add(bed);
  const boards: Array<[number, number, number, number]> = [
    [0, bedW / 2 - 0.04, bedL, 0.08],
    [0, -(bedW / 2 - 0.04), bedL, 0.08],
    [bedL / 2 - 0.04, 0, 0.08, bedW],
    [-(bedL / 2 - 0.04), 0, 0.08, bedW],
  ];
  for (const [x, z, w, d] of boards) {
    const board = new Mesh(new BoxGeometry(w, 0.32, d), plank);
    board.position.set(x, bedY + 0.22, z);
    group.add(board);
  }

  // --- Wheels.
  const wheelZ = bedW / 2 + 0.09;
  const axleXs = style === 'wagon' ? [bedL * 0.32, -bedL * 0.32] : [-bedL * 0.05];
  for (const ax of axleXs) {
    // Front wagon wheels a touch smaller for that hand-built look.
    const r = style === 'wagon' && ax > 0 ? wheelR * 0.82 : wheelR;
    for (const sz of [1, -1]) {
      const wheel = makeWheel(r, wood, iron, rng);
      wheel.position.set(ax, r * TYRE, sz * wheelZ); // tyre contact rests at y = 0
      group.add(wheel);
    }
    // Axle beam.
    const axle = new Mesh(new CylinderGeometry(0.05, 0.05, wheelZ * 2, 6), wood);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(ax, r * TYRE, 0);
    group.add(axle);
  }

  // --- Two pull-shafts angling down from the front (hand cart only).
  if (style === 'cart') {
    for (const sz of [1, -1]) {
      const shaft = new Mesh(new CylinderGeometry(0.045, 0.055, 1.5, 6), wood);
      shaft.position.set(bedL / 2 + 0.55, bedY - 0.35, sz * (bedW / 2 - 0.2));
      shaft.rotation.z = Math.PI / 2 - 0.32;
      group.add(shaft);
    }
  }

  // --- Cargo on the bed.
  loadCargo(group, cargo, rng, seed, palette, bedL, bedW, bedY + 0.06, wood);

  const obstacleRadius = Math.hypot(bedL, bedW) / 2 + 0.15;
  return { object: group, obstacleRadius };
}

// ---- wheel -------------------------------------------------------------

/** A spoked wheel in the XY plane (axle along Z), iron tyre + wood felloe. */
function makeWheel(r: number, wood: Material, iron: Material, rng: Rng): Group {
  const g = new Group();
  const tyre = new Mesh(new TorusGeometry(r, r * 0.11, 6, 16), iron);
  g.add(tyre);
  const felloe = new Mesh(new TorusGeometry(r * 0.84, r * 0.08, 5, 14), wood);
  g.add(felloe);
  const hub = new Mesh(new CylinderGeometry(r * 0.16, r * 0.16, r * 0.3, 8), wood);
  hub.rotation.x = Math.PI / 2; // barrel along Z (the axle)
  g.add(hub);
  const spokes = rng.int(6, 8);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const spoke = new Mesh(new CylinderGeometry(r * 0.03, r * 0.04, r * 0.72, 5), wood);
    spoke.position.set(Math.cos(a) * r * 0.44, Math.sin(a) * r * 0.44, 0);
    spoke.rotation.z = a - Math.PI / 2; // point radially outward
    g.add(spoke);
  }
  return g;
}

// ---- cargo -------------------------------------------------------------

function loadCargo(
  group: Group,
  cargo: CartCargo,
  rng: Rng,
  seed: number,
  palette: Palette,
  bedL: number,
  bedW: number,
  y: number,
  wood: Material
): void {
  if (cargo === 'empty') return;
  const spread = (): [number, number] => [rng.jitter(0, bedL * 0.3), rng.jitter(0, bedW * 0.28)];

  if (cargo === 'crates') {
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const crate = createCrate({ seed: seed + i * 7, size: rng.range(0.55, 0.7), palette });
      const [x, z] = spread();
      crate.object.position.set(x, y, z);
      group.add(crate.object);
    }
  } else if (cargo === 'barrels') {
    const barrelMat = createSurface('wood', { color: palette.wood, seed: seed + 9 });
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const barrel = new Group();
      const body = new Mesh(new CylinderGeometry(0.24, 0.24, 0.62, 10), barrelMat);
      body.scale.x = 1.08; // belly
      body.position.y = 0.31;
      barrel.add(body);
      for (const by of [0.12, 0.5]) {
        const band = new Mesh(new CylinderGeometry(0.255, 0.255, 0.05, 10), createSurface('metal', { color: palette.metal, seed: seed + 3 }));
        band.position.y = by;
        barrel.add(band);
      }
      const [x, z] = spread();
      barrel.position.set(x, y, z);
      group.add(barrel);
    }
  } else if (cargo === 'sacks') {
    const sackMat = createSurface('plaster', { color: 0xbfa878, seed: seed + 5 });
    const n = rng.int(4, 6);
    for (let i = 0; i < n; i++) {
      const sack = new Mesh(new IcosahedronGeometry(0.22, 1), sackMat);
      const [x, z] = spread();
      sack.position.set(x, y + 0.16, z);
      sack.rotation.y = rng.range(0, Math.PI);
      sack.scale.set(rng.range(0.9, 1.1), rng.range(1.0, 1.3), rng.range(0.9, 1.1)); // taller = plump sack
      group.add(sack);
    }
  } else {
    // hay: a heaped stack of golden blocks.
    const hayMat = createSurface('thatch', { color: 0xc9a94a, seed: seed + 6 });
    for (let i = 0; i < 3; i++) {
      const bale = new Mesh(new BoxGeometry(bedL * 0.7, 0.34, bedW * 0.7), hayMat);
      bale.position.set(rng.jitter(0, 0.1), y + 0.17 + i * 0.3, rng.jitter(0, 0.05));
      bale.rotation.y = rng.jitter(0, 0.1);
      bale.scale.setScalar(1 - i * 0.16);
      group.add(bale);
    }
    void wood;
  }
}
