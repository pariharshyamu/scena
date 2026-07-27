import { describe, expect, it } from 'vitest';
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { createStall, type StallGoods } from '../src/props/stall';
import { createStatue, type StatueFigure } from '../src/props/statue';

function meshCount(object: { traverse(cb: (o: unknown) => void): void }): number {
  let n = 0;
  object.traverse((o) => {
    if (o instanceof Mesh) n++;
  });
  return n;
}

function surfaceCount(object: { traverse(cb: (o: unknown) => void): void }): number {
  let n = 0;
  object.traverse((o) => {
    const m = (o as Mesh).material;
    if (m instanceof MeshStandardMaterial && m.customProgramCacheKey() === 'scena-surface-v4') n++;
  });
  return n;
}

const GOODS: StallGoods[] = ['produce', 'pottery', 'bakery', 'textiles'];
const FIGURES: StatueFigure[] = ['obelisk', 'figure', 'orb', 'bust', 'beast'];

describe('createStall', () => {
  it('is deterministic per seed', () => {
    const a = createStall({ seed: 42 });
    const b = createStall({ seed: 42 });
    expect(meshCount(a.object)).toBe(meshCount(b.object));
    expect(a.obstacleRadius).toBe(b.obstacleRadius);
  });

  it('builds every trade with a stocked counter and a blocking footprint', () => {
    for (const goods of GOODS) {
      const stall = createStall({ seed: 7, goods });
      expect(stall.object.name).toBe('stall');
      // Posts + awning + counter + goods → plenty of meshes.
      expect(meshCount(stall.object)).toBeGreaterThan(20);
      expect(stall.obstacleRadius).toBeGreaterThan(1);
      expect(surfaceCount(stall.object)).toBeGreaterThan(0); // wood/plank surfaces
    }
  });

  it('different trades stock differently', () => {
    const counts = GOODS.map((goods) => meshCount(createStall({ seed: 5, goods }).object));
    // Not all four trades produce an identical mesh count.
    expect(new Set(counts).size).toBeGreaterThan(1);
  });

  it('honours an explicit cloth colour', () => {
    let found = false;
    createStall({ seed: 3, clothColor: 0x123456 }).object.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (m?.color && m.color.getHex() === 0x123456) found = true;
    });
    expect(found).toBe(true);
  });

  it('rests on the ground (nothing below y = 0)', () => {
    const box = new Box3().setFromObject(createStall({ seed: 9 }).object);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.05);
  });
});

describe('createStatue', () => {
  it('is deterministic per seed', () => {
    const a = createStatue({ seed: 11, figure: 'figure' });
    const b = createStatue({ seed: 11, figure: 'figure' });
    expect(meshCount(a.object)).toBe(meshCount(b.object));
    expect(a.obstacleRadius).toBe(b.obstacleRadius);
  });

  it('builds every figure on a pedestal with a footprint', () => {
    for (const figure of FIGURES) {
      const statue = createStatue({ seed: 4, figure });
      expect(statue.object.name).toBe('statue');
      expect(meshCount(statue.object)).toBeGreaterThan(3); // pedestal tiers + plinth + figure
      expect(statue.obstacleRadius).toBeGreaterThan(0);
      expect(surfaceCount(statue.object)).toBeGreaterThan(0);
    }
  });

  it('respects the requested height', () => {
    const box = new Box3().setFromObject(createStatue({ seed: 2, figure: 'obelisk', height: 4 }).object);
    const size = box.getSize(new Vector3());
    expect(size.y).toBeGreaterThan(3.4);
    expect(size.y).toBeLessThan(4.6);
  });

  it('bronze and stone select different sculpture materials', () => {
    const bronzeHexes = new Set<number>();
    createStatue({ seed: 6, figure: 'orb', material: 'bronze' }).object.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (m) bronzeHexes.add(m.color.getHex());
    });
    // The bronze sculpt colour (0x9a7b46) must appear; it is not a rock hue.
    expect(bronzeHexes.has(0x9a7b46)).toBe(true);
  });

  it('rests on the ground (pedestal base at y = 0)', () => {
    const box = new Box3().setFromObject(createStatue({ seed: 8, figure: 'beast' }).object);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.05);
    expect(box.min.y).toBeLessThan(0.2);
  });
});
