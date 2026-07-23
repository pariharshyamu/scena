import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createGlass } from '../materials/glass';
import {
  createCladding,
  createModernWindow,
  createPlanter,
  createRailing,
} from '../props/modern';

export interface BungalowOptions {
  seed?: number;
  /** Storeys: 1 or 2. Default 2. */
  floors?: 1 | 2;
  /** Ground-floor footprint. Defaults seeded around 9 × 7. */
  width?: number;
  depth?: number;
  palette?: Palette;
}

export interface Bungalow {
  /** The villa, origin at ground level, entry facing +z. */
  object: Group;
  /** Steering circle for the whole footprint. */
  obstacleRadius: number;
  /** Every glass pane material — all `nightGlow`, ready for a day cycle. */
  panes: MeshStandardMaterial[];
  /** World-local point just outside the entry (spawn/walk-to target). */
  entry: Vector3;
}

/**
 * A seeded modern bungalow — the Tier-4 materials composed into
 * architecture: a rendered ground box under a cantilevered concrete upper
 * box, floor-to-ceiling glazing on the garden face, a teak-slat or stone
 * accent, a balcony behind a glass or laser-cut railing, flat parapet
 * roofs, an entry canopy on steel posts and corten planters by the door.
 *
 * Every seed masses differently (cantilever side, accent style, glazing
 * rhythm, upper-box proportions); one palette themes the street. All the
 * glazing defaults to `nightGlow`, so listing the bungalow in a
 * `createDayCycle`'s `lamps` lights the house window-by-window at dusk.
 */
export function createBungalow(options: BungalowOptions = {}): Bungalow {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const floors = options.floors ?? 2;
  const W = options.width ?? rng.range(8.4, 10.5);
  const D = options.depth ?? rng.range(6.2, 7.6);
  const H = 3.0; // storey height

  const group = new Group();
  group.name = 'bungalow';
  const panes: MeshStandardMaterial[] = [];

  const render = createSurface('paint', { color: palette.wall, seed });
  const concrete = createSurface('concrete', { seed: seed + 1 });
  const fascia = new MeshStandardMaterial({ color: palette.roof, flatShading: true });

  const slab = (w: number, d: number, x: number, y: number, z: number, h = 0.22): void => {
    const roof = new Mesh(new BoxGeometry(w + 0.5, h, d + 0.5), fascia);
    roof.position.set(x, y + h / 2, z);
    group.add(roof);
    const lip = new Mesh(new BoxGeometry(w + 0.56, 0.16, d + 0.56), fascia);
    lip.position.set(x, y + h + 0.02, z);
    group.add(lip);
  };

  const glazeBand = (w: number, h: number, x: number, y: number, z: number, cols: number): void => {
    const win = createModernWindow({
      seed: rng.int(1, 1e9), width: w, height: h, mullions: [cols, 1], palette,
    });
    win.object.position.set(x, y, z);
    group.add(win.object);
    panes.push(win.pane);
  };

  // ---- ground floor: rendered box, glazed garden face, teak entry ------
  const ground = new Mesh(new BoxGeometry(W, H, D), render);
  ground.position.y = H / 2;
  group.add(ground);
  // Floor-to-ceiling glazing across most of the front (+z).
  const glassW = W * rng.range(0.42, 0.55);
  glazeBand(glassW, H - 0.55, -W / 2 + glassW / 2 + 0.6, 0.06, D / 2 + 0.05, rng.int(3, 4));
  // Entry: teak-framed door band on the other side of the front.
  const doorX = W / 2 - 1.4;
  const surround = new Mesh(new BoxGeometry(1.7, H - 0.3, 0.14), createSurface('teak', { seed: seed + 2 }));
  surround.position.set(doorX, (H - 0.3) / 2, D / 2 + 0.03);
  group.add(surround);
  const door = createGlass({ frosted: true, nightGlow: true });
  const doorPane = new Mesh(new BoxGeometry(1.06, H - 0.8, 0.05), door);
  doorPane.position.set(doorX, (H - 0.8) / 2 + 0.02, D / 2 + 0.12);
  group.add(doorPane);
  panes.push(door);
  // Entry canopy on two slim steel posts.
  const canopy = new Mesh(new BoxGeometry(2.4, 0.12, 1.6), fascia);
  canopy.position.set(doorX, H - 0.25, D / 2 + 0.8);
  group.add(canopy);
  const steel = createSurface('steel', { seed: seed + 3 });
  for (const dx of [-0.9, 0.9]) {
    const post = new Mesh(new BoxGeometry(0.07, H - 0.31, 0.07), steel);
    post.position.set(doorX + dx, (H - 0.31) / 2, D / 2 + 1.45);
    group.add(post);
  }
  // A side window on the gable face.
  glazeBand(1.6, 1.3, W / 2 + 0.05, 1.1, D * rng.range(-0.2, 0.2), 2);
  group.children[group.children.length - 1].rotation.y = Math.PI / 2;

  // ---- accent cladding: teak slats or stone, on a front corner ---------
  const accent = createCladding({
    style: rng.next() < 0.6 ? 'slats' : 'stone',
    width: rng.range(1.8, 2.6),
    height: floors === 2 ? H * 2 + 0.3 : H,
    seed: seed + 4,
  });
  accent.object.position.set(-W / 2 + 1.3, 0, D / 2 + 0.08);
  group.add(accent.object);

  if (floors === 2) {
    // ---- upper floor: concrete box cantilevered toward the front -------
    const W2 = W * rng.range(0.68, 0.85);
    const D2 = D * rng.range(0.8, 0.95);
    const side = rng.next() < 0.5 ? -1 : 1;
    const x2 = side * (W - W2) * rng.range(0.15, 0.4);
    const cant = rng.range(0.9, 1.5); // overhang toward +z
    const z2 = (D2 - D) / 2 + cant;
    const upper = new Mesh(new BoxGeometry(W2, H, D2), rng.next() < 0.5 ? concrete : render);
    upper.position.set(x2, H * 1.5, z2);
    group.add(upper);
    // Sliding glazing across the upper front.
    const upGlassW = W2 * rng.range(0.5, 0.65);
    glazeBand(upGlassW, 1.6, x2 - W2 * 0.1, H + 0.7, z2 + D2 / 2 + 0.05, 2);
    // Balcony: the cantilever roof of the ground box, behind a railing.
    const balconyW = W2 * 0.9;
    const railing = createRailing({
      style: rng.next() < 0.5 ? 'glass' : 'panel',
      length: balconyW,
      seed: seed + 5,
      palette,
    });
    railing.object.position.set(x2, H, z2 + D2 / 2 + 0.85);
    group.add(railing.object);
    slab(W2, D2, x2, H * 2, z2);
    // The exposed strip of ground-floor roof becomes the balcony deck.
    const deck = new Mesh(new BoxGeometry(balconyW + 0.4, 0.08, 1.7), createSurface('teak', { seed: seed + 6 }));
    deck.position.set(x2, H + 0.04, z2 + D2 / 2 + 0.1);
    group.add(deck);
  } else {
    slab(W, D, 0, H, 0);
  }
  if (floors === 2) {
    // Cap any exposed ground-floor roof at the back.
    slab(W, D * 0.55, 0, H, -D * 0.22, 0.18);
  }

  // ---- a corten planter by the entry ------------------------------------
  const planter = createPlanter({ seed: seed + 7, length: rng.range(1.2, 1.8), palette });
  planter.object.position.set(doorX - 1.7, 0, D / 2 + 1.1);
  group.add(planter.object);

  return {
    object: group,
    obstacleRadius: Math.max(W, D) * 0.62,
    panes,
    entry: new Vector3(doorX, 0, D / 2 + 2.2),
  };
}
