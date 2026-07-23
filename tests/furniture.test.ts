import { describe, expect, it } from 'vitest';
import { Box3, Group, Mesh, PointLight, Vector3 } from 'three';
import {
  createBed,
  createCandle,
  createChest,
  createRug,
  createSeat,
  createShelf,
  createTable,
} from '../src';

const bounds = (object: Group): Vector3 =>
  new Box3().setFromObject(object).getSize(new Vector3());

describe('furniture', () => {
  it('is deterministic per seed', () => {
    const a = createShelf({ seed: 9, stock: 'books' });
    const b = createShelf({ seed: 9, stock: 'books' });
    expect(a.object.children.length).toBe(b.object.children.length);
    const layout = (shelf: { object: Group }): string =>
      shelf.object.children.map((child) => child.position.y.toFixed(4)).join(',');
    expect(layout(a)).toBe(layout(b));
    const c = createShelf({ seed: 10, stock: 'books' });
    expect(layout(a)).not.toBe(layout(c));
  });

  it('table styles have distinct footprints', () => {
    const round = createTable({ style: 'round' });
    const trestle = createTable({ style: 'trestle' });
    const desk = createTable({ style: 'desk' });
    expect(bounds(trestle.object).x).toBeGreaterThan(bounds(round.object).x);
    expect(trestle.obstacleRadius).toBeGreaterThan(desk.obstacleRadius);
    // All tables stand at usable height.
    for (const table of [round, trestle, desk]) {
      expect(bounds(table.object).y).toBeGreaterThan(0.6);
      expect(bounds(table.object).y).toBeLessThan(1.0);
    }
  });

  it('seats: chair has a back, bench is long, stool is small', () => {
    const chair = createSeat({ style: 'chair' });
    const bench = createSeat({ style: 'bench' });
    const stool = createSeat({ style: 'stool' });
    expect(bounds(chair.object).y).toBeGreaterThan(0.9); // backrest
    expect(bounds(stool.object).y).toBeLessThan(0.6);
    expect(bounds(bench.object).x).toBeGreaterThan(1.3);
    expect(stool.obstacleRadius).toBeLessThan(bench.obstacleRadius);
  });

  it('bed sizes: double is wider, bunk is taller with two decks', () => {
    const single = createBed({ size: 'single' });
    const double = createBed({ size: 'double' });
    const bunk = createBed({ size: 'bunk' });
    expect(bounds(double.object).x).toBeGreaterThan(bounds(single.object).x);
    expect(bounds(bunk.object).y).toBeGreaterThan(bounds(single.object).y * 1.8);
    expect(bunk.object.children.length).toBeGreaterThan(single.object.children.length);
    expect(double.obstacleRadius).toBeGreaterThan(single.obstacleRadius);
  });

  it('shelf stock changes what lines the boards', () => {
    const books = createShelf({ seed: 4, stock: 'books' });
    const empty = createShelf({ seed: 4, stock: 'empty' });
    expect(books.object.children.length).toBeGreaterThan(empty.object.children.length + 5);
  });

  it('chest lid tilts open', () => {
    const closed = createChest({ seed: 2 });
    const open = createChest({ seed: 2, open: true });
    const lidOf = (prop: { object: Group }): Group =>
      prop.object.children.find((child) => child.name === 'lid') as Group;
    expect(lidOf(closed).rotation.x).toBe(0);
    expect(lidOf(open).rotation.x).toBeLessThan(-1);
    expect(bounds(open.object).y).toBeGreaterThan(bounds(closed.object).y);
  });

  it('candles glow for free and only carry a PointLight when asked', () => {
    const lightsIn = (group: Group): PointLight[] => {
      const found: PointLight[] = [];
      group.traverse((child) => {
        if ((child as PointLight).isPointLight) found.push(child as PointLight);
      });
      return found;
    };
    const free = createCandle({ style: 'candelabra' });
    expect(lightsIn(free.object)).toHaveLength(0);
    const lit = createCandle({ style: 'candelabra', light: true });
    expect(lightsIn(lit.object)).toHaveLength(1);
    // Emissive flames exist either way.
    let flames = 0;
    free.object.traverse((child) => {
      const material = (child as Mesh).material as { emissiveIntensity?: number } | undefined;
      if (material?.emissiveIntensity && material.emissiveIntensity > 1) flames++;
    });
    expect(flames).toBeGreaterThanOrEqual(3);
    // The chandelier hangs downward from its hook origin.
    const chandelier = createCandle({ style: 'chandelier' });
    const box = new Box3().setFromObject(chandelier.object);
    expect(box.min.y).toBeLessThan(-0.5);
  });

  it('rugs are walk-through and shaped', () => {
    const round = createRug({ shape: 'round' });
    const runner = createRug({ shape: 'runner' });
    expect(round.obstacleRadius).toBe(0);
    expect(runner.obstacleRadius).toBe(0);
    const size = bounds(runner.object);
    expect(size.x).toBeGreaterThan(size.z * 2);
  });
});
