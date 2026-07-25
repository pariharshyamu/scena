import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, Object3D, Vector3 } from 'three';
import {
  createCandle,
  createChest,
  createFramedPhoto,
  createPhone,
  createTablet,
  createPropSurface,
  createShelf,
  createTable,
  dress,
  placeOn,
  type PropSurface,
} from '../src';

/** A bare surface floating in space, so tests control the extents exactly. */
function bench(width = 1.2, depth = 0.7, y = 0.75): { root: Group; surface: PropSurface } {
  const root = new Group();
  return { root, surface: createPropSurface('top', root, 0, y, 0, width, depth) };
}

/** A block whose origin is at its base centre — the SCENA prop convention. */
function block(w: number, h: number, d: number): Object3D {
  const mesh = new Mesh(new BoxGeometry(w, h, d));
  mesh.position.y = h / 2;
  const group = new Group();
  group.add(mesh);
  return group;
}

/** A block whose origin is at its own centre — deliberately not the convention. */
function centredBlock(w: number, h: number, d: number): Object3D {
  return new Mesh(new BoxGeometry(w, h, d));
}

/** World-space box of a placed object. */
function worldBox(root: Object3D, object: Object3D): Box3 {
  root.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
}

describe('placeOn', () => {
  it('seats an object ON the surface whatever its own origin', () => {
    // The defect this exists to catch: a mug sunk half way into a tabletop,
    // which is what happens the moment a prop's origin is not at its base.
    for (const make of [block, centredBlock]) {
      const { root, surface } = bench();
      const item = make(0.1, 0.24, 0.1);
      placeOn(surface, item);
      const box = worldBox(root, item);
      expect(box.min.y).toBeCloseTo(0.75, 5);
      expect(box.max.y).toBeCloseTo(0.99, 5);
    }
  });

  it('puts the FOOTPRINT where asked, not the origin', () => {
    const { root, surface } = bench();
    const item = centredBlock(0.1, 0.2, 0.1);
    placeOn(surface, item, { along: 0.3, across: -0.2 });
    const centre = worldBox(root, item).getCenter(new Vector3());
    expect(centre.x).toBeCloseTo(0.3, 5);
    expect(centre.z).toBeCloseTo(-0.2, 5);
  });

  it('keeps the footprint centred when it is also turned', () => {
    // Turning about the object's own origin moves its footprint, so the
    // correction has to be rotated too — otherwise anything whose origin is
    // off-centre drifts as soon as it is not square.
    const { root, surface } = bench();
    const item = new Group();
    const mesh = new Mesh(new BoxGeometry(0.2, 0.2, 0.1));
    mesh.position.set(0.4, 0.1, 0.25); // origin nowhere near the geometry
    item.add(mesh);
    placeOn(surface, item, { along: 0.1, across: 0.05, turn: 0.6 });
    const centre = worldBox(root, item).getCenter(new Vector3());
    expect(centre.x).toBeCloseTo(0.1, 5);
    expect(centre.z).toBeCloseTo(0.05, 5);
  });
});

describe('dress', () => {
  const kit = (n: number): Object3D[] =>
    Array.from({ length: n }, (_, i) =>
      block(0.07 + (i % 4) * 0.02, 0.06 + (i % 5) * 0.06, 0.07 + (i % 3) * 0.02)
    );

  it('nothing ends up inside anything else', () => {
    // Measured from real world boxes, not from the numbers the layout used.
    const { root, surface } = bench(1.6, 0.9);
    const items = kit(12);
    const placed = dress(surface, items, { seed: 4, density: 0.9 });
    expect(placed.length).toBeGreaterThan(4);
    const boxes = placed.map((o) => worldBox(root, o));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapX = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
        const overlapZ = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
        expect(Math.min(overlapX, overlapZ)).toBeLessThan(1e-6);
      }
    }
  });

  it('everything sits on the surface, not through it', () => {
    const { root, surface } = bench(1.4, 0.8, 0.75);
    const placed = dress(surface, kit(10), { seed: 2 });
    for (const object of placed) {
      expect(worldBox(root, object).min.y).toBeCloseTo(0.75, 4);
    }
  });

  it('nothing hangs off the edge', () => {
    const { root, surface } = bench(1.0, 0.6);
    const placed = dress(surface, kit(10), { seed: 6, margin: 0.04 });
    for (const object of placed) {
      const box = worldBox(root, object);
      expect(box.min.x).toBeGreaterThanOrEqual(-0.5);
      expect(box.max.x).toBeLessThanOrEqual(0.5);
      expect(box.min.z).toBeGreaterThanOrEqual(-0.3);
      expect(box.max.z).toBeLessThanOrEqual(0.3);
    }
  });

  it('puts tall things behind short things', () => {
    // A candlestick in front of a bowl hides the bowl. Correlate height
    // against depth rather than checking one pair, which any layout passes
    // by luck.
    const { root, surface } = bench(1.8, 1.0);
    const placed = dress(surface, kit(14), { seed: 3, density: 0.9 });
    const points = placed.map((o) => {
      const box = worldBox(root, o);
      return { h: box.max.y - box.min.y, z: box.getCenter(new Vector3()).z };
    });
    expect(points.length).toBeGreaterThan(5);
    const mean = (v: number[]): number => v.reduce((a, x) => a + x, 0) / v.length;
    const hs = points.map((p) => p.h);
    const zs = points.map((p) => p.z);
    const mh = mean(hs);
    const mz = mean(zs);
    const cov = mean(points.map((p) => (p.h - mh) * (p.z - mz)));
    const sd = (v: number[], m: number): number => Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
    const r = cov / (sd(hs, mh) * sd(zs, mz) || 1);
    // +z is the back of the surface, so taller should mean further back.
    expect(r).toBeGreaterThan(0.3);
  });

  it('does not lay everything out in a line', () => {
    // The failure the height-correlation test above sailed straight past:
    // aiming each item at a depth computed from its height puts everything of
    // similar height at the same z, and tabletop props are all of similar
    // height. The correlation was fine. The absolute spread was nil, and the
    // render was a row of objects across the middle of the table.
    const { root, surface } = bench(1.8, 0.9);
    const placed = dress(surface, kit(12), { seed: 3, density: 0.9 });
    expect(placed.length).toBeGreaterThan(5);
    const zs = placed.map((o) => worldBox(root, o).getCenter(new Vector3()).z);
    const span = Math.max(...zs) - Math.min(...zs);
    // Anything less than a third of the usable depth is a line, not a layout.
    expect(span).toBeGreaterThan(0.9 / 3);
  });

  it('finds room for a small thing among big ones', () => {
    // Random sampling alone cannot find a narrow gap. Once two wide items are
    // down, a shallow surface is effectively one-dimensional — nothing can
    // pass them in the depth — and a small item with obvious room in the
    // corner was missing it on all 24 attempts.
    const { root, surface } = bench(2.0, 0.9);
    const big = [block(0.48, 0.5, 0.46), block(0.48, 0.6, 0.46)];
    const small = [block(0.07, 0.15, 0.02), block(0.05, 0.05, 0.05), block(0.09, 0.1, 0.06)];
    const placed = dress(surface, [...big, ...small], { seed: 4, density: 0.9 });
    expect(placed.length).toBe(5);
    const boxes = placed.map((o) => worldBox(root, o));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const overlapX = Math.min(boxes[i].max.x, boxes[j].max.x) - Math.max(boxes[i].min.x, boxes[j].min.x);
        const overlapZ = Math.min(boxes[i].max.z, boxes[j].max.z) - Math.max(boxes[i].min.z, boxes[j].min.z);
        expect(Math.min(overlapX, overlapZ)).toBeLessThan(1e-6);
      }
    }
  });

  it('clusters instead of spreading evenly', () => {
    // A real surface has a busy end and a clear end. An even spread is a
    // display of merchandise.
    const { root, surface } = bench(2.0, 0.8);
    const clustered = dress(surface, kit(9), { seed: 8, cluster: 1 });
    const xs = clustered.map((o) => worldBox(root, o).getCenter(new Vector3()).x).sort((a, b) => a - b);
    const span = xs[xs.length - 1] - xs[0];
    // Nine items spread evenly across a 2 m bench would span nearly all of
    // it; a clustered group holds together in much less.
    expect(span).toBeLessThan(1.5);

    const loose = bench(2.0, 0.8);
    const spread = dress(loose.surface, kit(9), { seed: 8, cluster: 0 });
    const lxs = spread
      .map((o) => worldBox(loose.root, o).getCenter(new Vector3()).x)
      .sort((a, b) => a - b);
    expect(lxs[lxs.length - 1] - lxs[0]).toBeGreaterThan(span);
  });

  it('nothing is set down square', () => {
    const { surface } = bench(1.6, 0.9);
    const placed = dress(surface, kit(10), { seed: 5 });
    for (const object of placed) expect(object.rotation.y).not.toBe(0);
    const turns = new Set(placed.map((o) => o.rotation.y.toFixed(5)));
    expect(turns.size).toBe(placed.length);
  });

  it('turn 0 lines everything up, for the times you want that', () => {
    const { surface } = bench(1.6, 0.9);
    const placed = dress(surface, kit(8), { seed: 5, turn: 0 });
    for (const object of placed) expect(object.rotation.y).toBe(0);
  });

  it('density decides how full it gets', () => {
    const sparse = bench(1.6, 0.9);
    const full = bench(1.6, 0.9);
    const a = dress(sparse.surface, kit(20), { seed: 7, density: 0.1 });
    const b = dress(full.surface, kit(20), { seed: 7, density: 0.9 });
    expect(a.length).toBeLessThan(b.length);
    expect(a.length).toBeGreaterThan(0);
  });

  it('leaves off what will not fit rather than stacking it', () => {
    const { surface } = bench(0.3, 0.2);
    const items = kit(12);
    const placed = dress(surface, items, { seed: 1, density: 1 });
    expect(placed.length).toBeLessThan(items.length);
    const unplaced = items.filter((o) => !placed.includes(o));
    for (const object of unplaced) expect(object.parent).toBeNull();
  });

  it('refuses a surface smaller than its own margin instead of misplacing', () => {
    const { surface } = bench(0.04, 0.04);
    expect(dress(surface, kit(4), { margin: 0.05 })).toEqual([]);
  });

  it('is deterministic, and different seeds differ', () => {
    const read = (seed: number): string => {
      const { root, surface } = bench(1.5, 0.8);
      return dress(surface, kit(9), { seed })
        .map((o) => {
          const c = worldBox(root, o).getCenter(new Vector3());
          return `${c.x.toFixed(4)},${c.z.toFixed(4)}`;
        })
        .join('|');
    };
    expect(read(11)).toBe(read(11));
    expect(read(11)).not.toBe(read(12));
  });

  it('does not compound rotations when the same items are dressed twice', () => {
    // Measuring an item that is already turned folds the previous placement
    // into its footprint, and the second layout lays out against the wrong
    // sizes.
    const items = kit(8);
    const first = bench(1.5, 0.8);
    dress(first.surface, items, { seed: 3 });
    const second = bench(1.5, 0.8);
    const placed = dress(second.surface, items, { seed: 3 });
    for (const object of placed) {
      expect(Math.abs(object.rotation.y)).toBeLessThanOrEqual(0.4 + 1e-9);
      expect(worldBox(second.root, object).min.y).toBeCloseTo(0.75, 4);
    }
  });

  it('works on a real prop with real furniture', () => {
    const table = createTable({ style: 'trestle', seed: 2 });
    expect(table.surfaces?.length).toBe(1);
    const candles = Array.from({ length: 4 }, (_, i) => createCandle({ seed: i + 1 }));
    const placed = dress(table.surfaces![0], candles, { seed: 4 });
    expect(placed.length).toBeGreaterThan(1);
    table.object.updateMatrixWorld(true);
    for (const object of placed) {
      // The tabletop is at ~0.74; everything must be standing on it.
      const box = new Box3().setFromObject(object);
      expect(box.min.y).toBeGreaterThan(0.7);
      expect(box.min.y).toBeLessThan(0.82);
    }
  });
});

describe('published surfaces', () => {
  it('a table publishes its top at board height', () => {
    for (const style of ['round', 'trestle', 'desk'] as const) {
      const table = createTable({ style, seed: 1 });
      const surface = table.surfaces![0];
      table.object.updateMatrixWorld(true);
      const y = surface.anchor.getWorldPosition(new Vector3()).y;
      const box = new Box3().setFromObject(table.object);
      // At the top of the prop, give or take the thickness of the board.
      expect(y).toBeGreaterThan(box.max.y - 0.06);
      expect(y).toBeLessThanOrEqual(box.max.y + 1e-6);
      expect(surface.width).toBeGreaterThan(0.5);
      expect(surface.depth).toBeGreaterThan(0.5);
    }
  });

  it('a stocked shelf only offers the boards that are actually free', () => {
    const stocked = createShelf({ stock: 'books', seed: 1 });
    const empty = createShelf({ stock: 'empty', seed: 1 });
    expect(empty.surfaces!.length).toBeGreaterThan(stocked.surfaces!.length);
    // Dressing a shelf of books must not put a mug inside the books.
    for (const surface of stocked.surfaces!) {
      expect(surface.anchor.position.y).toBeGreaterThan(1.5);
    }
  });

  it('an open chest offers no lid to put things on', () => {
    expect(createChest({ open: false }).surfaces!.length).toBe(1);
    expect(createChest({ open: true }).surfaces!.length).toBe(0);
  });
});

describe('which way up things come to rest', () => {
  const wboxOf = (root: Object3D, o: Object3D): Box3 => {
    root.updateMatrixWorld(true);
    return new Box3().setFromObject(o);
  };

  it('lays a phone down instead of standing it on its edge', () => {
    // Props are authored the way they are USED — a phone upright in a hand.
    // Set down as authored it stands on its short edge like a domino, which
    // is what a whole tabletop of them looked like.
    const { root, surface } = bench();
    const phone = createPhone({ seed: 1 });
    const tall = new Box3().setFromObject(phone.object).getSize(new Vector3()).y;
    placeOn(surface, phone);
    const box = wboxOf(root, phone.object);
    expect(box.max.y - box.min.y).toBeLessThan(tall * 0.25);
    expect(box.min.y).toBeCloseTo(0.75, 4);
  });

  it('leaves a candle standing — tall and thin is not the same as a slab', () => {
    const { root, surface } = bench();
    const candle = createCandle({ seed: 1 });
    const tall = new Box3().setFromObject(candle.object).getSize(new Vector3()).y;
    placeOn(surface, candle);
    const box = wboxOf(root, candle.object);
    expect(box.max.y - box.min.y).toBeCloseTo(tall, 4);
  });

  it('leaves a standing photo standing — its strut thickens it past a slab', () => {
    const { root, surface } = bench();
    const photo = createFramedPhoto({ seed: 3, standing: true });
    const tall = new Box3().setFromObject(photo.object).getSize(new Vector3()).y;
    placeOn(surface, photo);
    expect(wboxOf(root, photo.object).max.y - 0.75).toBeCloseTo(tall, 3);
  });

  it('a laid-down thing still lands flat on the surface after a turn', () => {
    const { root, surface } = bench();
    const tablet = createTablet({ seed: 2 });
    placeOn(surface, tablet, { turn: 0.9, along: 0.2 });
    const box = wboxOf(root, tablet.object);
    expect(box.min.y).toBeCloseTo(0.75, 4);
    const centre = box.getCenter(new Vector3());
    expect(centre.x).toBeCloseTo(0.2, 4);
  });
});
