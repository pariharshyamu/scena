import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Object3D, Vector3 } from 'three';
import {
  CLUTTER_THEMES,
  createBooks,
  createClutter,
  createFolded,
  createFruitBowl,
  createPapers,
  createTrinket,
  type BookStyle,
  type ClutterTheme,
} from '../src';

const sizeOf = (object: Object3D): Vector3 => {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object).getSize(new Vector3());
};
const boxOf = (object: Object3D): Box3 => {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
};

const BOOKS: BookStyle[] = ['stack', 'row', 'leaning', 'open'];

describe('createBooks', () => {
  it.each(BOOKS)('%s sits on y = 0 and is tabletop-sized', (style) => {
    const books = createBooks({ style, seed: 2 });
    const box = boxOf(books.object);
    // A leaning book pivots on its bottom edge; forget to shift it by its own
    // lean and it sinks through the shelf.
    expect(box.min.y).toBeGreaterThan(-0.003);
    const size = box.getSize(new Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(0.35);
  });

  it('a stack is graded and nothing in it is square to anything else', () => {
    const books = createBooks({ style: 'stack', count: 5, seed: 4 });
    const shelves = books.object.children as Mesh[];
    expect(shelves.length).toBe(5);
    const widths = shelves.map((b) => (b.geometry as unknown as { parameters: { width: number } }).parameters.width);
    // Biggest at the bottom.
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeLessThan(widths[i - 1]);
    const turns = new Set(shelves.map((b) => b.rotation.y.toFixed(5)));
    expect(turns.size).toBe(5);
    for (const b of shelves) expect(b.rotation.y).not.toBe(0);
  });

  it('a row does not push its spines through each other', () => {
    // Real geometry: adjacent spines must not overlap in x.
    for (const style of ['row', 'leaning'] as BookStyle[]) {
      const books = createBooks({ style, count: 5, seed: 6 });
      books.object.updateMatrixWorld(true);
      const spans = books.object.children
        .map((c) => {
          const b = new Box3().setFromObject(c);
          return { lo: b.min.x, hi: b.max.x };
        })
        .sort((a, b) => a.lo - b.lo);
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i].lo).toBeGreaterThan(spans[i - 1].hi - 0.006);
      }
    }
  });

  it('leaning actually leans, and a row does not', () => {
    const row = createBooks({ style: 'row', count: 4, seed: 3 });
    const leaning = createBooks({ style: 'leaning', count: 4, seed: 3 });
    const tiltOf = (p: { object: Object3D }): number =>
      Math.max(...p.object.children.map((c) => Math.abs(c.rotation.z)));
    expect(tiltOf(row)).toBeLessThan(1e-9);
    expect(tiltOf(leaning)).toBeGreaterThan(0.3);
  });

  it('an open book has two leaves, splayed opposite ways', () => {
    const open = createBooks({ style: 'open', seed: 1 });
    const rolls = open.object.children.map((c) => c.rotation.z);
    expect(Math.min(...rolls)).toBeLessThan(0);
    expect(Math.max(...rolls)).toBeGreaterThan(0);
  });
});

describe('createPapers', () => {
  it('is a pile where no two sheets line up', () => {
    const papers = createPapers({ seed: 3, count: 6 });
    const turns = papers.object.children.map((c) => c.rotation.y);
    expect(new Set(turns.map((t) => t.toFixed(5))).size).toBe(6);
  });

  it('one sheet is clear of the pile, and lying on the surface', () => {
    const papers = createPapers({ seed: 3, count: 6 });
    const kids = papers.object.children;
    const stray = kids[kids.length - 1];
    const pile = kids.slice(0, -1);
    const meanX = pile.reduce((a, c) => a + c.position.x, 0) / pile.length;
    expect(Math.abs(stray.position.x - meanX)).toBeGreaterThan(0.06);
    expect(stray.position.y).toBeLessThan(0.002);
  });

  it('is flat and paper-sized', () => {
    const size = sizeOf(createPapers({ seed: 1 }).object);
    expect(size.y).toBeLessThan(0.02);
    expect(size.x).toBeGreaterThan(0.2);
    expect(size.x).toBeLessThan(0.55);
  });
});

describe('createFolded', () => {
  it('stacks layers that are offset, not square', () => {
    const cloth = createFolded({ seed: 5 });
    const kids = cloth.object.children;
    expect(kids.length).toBeGreaterThan(1);
    for (const c of kids) expect(c.rotation.y).not.toBe(0);
    const xs = kids.map((c) => c.position.x);
    expect(new Set(xs.map((x) => x.toFixed(5))).size).toBe(kids.length);
  });

  it('sits on the surface and is a hand-sized pile', () => {
    const box = boxOf(createFolded({ seed: 2 }).object);
    expect(box.min.y).toBeGreaterThan(-0.001);
    const size = box.getSize(new Vector3());
    expect(size.y).toBeLessThan(0.1);
    expect(size.x).toBeLessThan(0.3);
  });
});

describe('createFruitBowl', () => {
  it('keeps the fruit inside the bowl', () => {
    // The obvious failure: fruit scattered around the rim, or hovering above
    // it. Measure each piece against the bowl it is supposed to be in.
    const bowl = createFruitBowl({ seed: 4, count: 5 });
    bowl.object.updateMatrixWorld(true);
    const whole = new Box3().setFromObject(bowl.object);
    const body = bowl.object.children.find((c) => c.name === 'body')!;
    const shell = new Box3().setFromObject(body);
    // Nothing sticks out sideways past the bowl.
    expect(whole.min.x).toBeGreaterThanOrEqual(shell.min.x - 1e-6);
    expect(whole.max.x).toBeLessThanOrEqual(shell.max.x + 1e-6);
    // And every piece is up out of the floor.
    for (const fruit of bowl.object.children.filter((c) => c.name !== 'body')) {
      expect(new Box3().setFromObject(fruit).min.y).toBeGreaterThan(0);
    }
  });

  it('varies its fruit', () => {
    const bowl = createFruitBowl({ seed: 2, count: 5 });
    const fruit = bowl.object.children.filter((c) => c.name !== 'body') as Mesh[];
    const colours = new Set(
      fruit.map((f) => (f.material as unknown as { color: { getHex(): number } }).color.getHex())
    );
    expect(colours.size).toBeGreaterThan(1);
  });
});

describe('createTrinket', () => {
  it('is a small lidded box on the surface', () => {
    const box = boxOf(createTrinket({ seed: 1 }).object);
    expect(box.min.y).toBeGreaterThan(-0.001);
    const size = box.getSize(new Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(0.2);
  });
});

describe('createClutter', () => {
  it.each(CLUTTER_THEMES)('%s makes the number asked for', (theme) => {
    expect(createClutter({ theme, count: 7, seed: 2 })).toHaveLength(7);
  });

  it('is a set of different things, not the same thing six times', () => {
    // Picking at random with replacement gives duplicates, which is exactly
    // as obviously generated as an even spread.
    for (const theme of CLUTTER_THEMES) {
      const kit = createClutter({ theme, count: 5, seed: 3 });
      const names = kit.map((p) => p.object.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('themes actually differ', () => {
    const naming = (theme: ClutterTheme): Set<string> =>
      new Set(createClutter({ theme, count: 8, seed: 1 }).map((p) => p.object.name));
    const study = naming('study');
    const kitchen = naming('kitchen');
    expect([...study].some((n) => !kitchen.has(n))).toBe(true);
    expect([...study].some((n) => n.startsWith('books'))).toBe(true);
    expect([...kitchen].some((n) => n.includes('jug') || n.includes('pot'))).toBe(true);
  });

  it('everything it makes stands on y = 0 and fits on a table', () => {
    // This is the gap the kit had: every existing carryable is a CARRYABLE,
    // and a 48 cm basket means three of them is a full table.
    for (const theme of CLUTTER_THEMES) {
      for (const prop of createClutter({ theme, count: 8, seed: 5 })) {
        const box = boxOf(prop.object);
        expect(box.min.y).toBeGreaterThan(-0.004);
        const size = box.getSize(new Vector3());
        expect(Math.max(size.x, size.z)).toBeLessThan(0.4);
        expect(size.y).toBeLessThan(0.45);
      }
    }
  });

  it('gives a different set for a different seed', () => {
    const read = (seed: number): string =>
      createClutter({ theme: 'domestic', count: 6, seed })
        .map((p) => p.object.name)
        .join('|');
    expect(read(1)).toBe(read(1));
    expect(read(1)).not.toBe(read(9));
  });
});
