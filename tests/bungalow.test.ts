import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { createBungalow, PALETTES } from '../src';

const size = (b: { object: Parameters<Box3['setFromObject']>[0] }): Vector3 =>
  new Box3().setFromObject(b.object).getSize(new Vector3());

describe('createBungalow', () => {
  it('is deterministic per seed and masses differently across seeds', () => {
    const a = createBungalow({ seed: 5 });
    const b = createBungalow({ seed: 5 });
    expect(a.object.children.length).toBe(b.object.children.length);
    expect(size(a).x).toBeCloseTo(size(b).x);
    const c = createBungalow({ seed: 9 });
    expect(size(a).x).not.toBeCloseTo(size(c).x, 2);
  });

  it('two floors stand roughly twice as tall as one', () => {
    const tall = createBungalow({ seed: 3, floors: 2 });
    const low = createBungalow({ seed: 3, floors: 1 });
    expect(size(tall).y).toBeGreaterThan(size(low).y * 1.6);
  });

  it('collects nightGlow panes and an entry point for agents', () => {
    const villa = createBungalow({ seed: 7, palette: PALETTES.urban });
    expect(villa.panes.length).toBeGreaterThanOrEqual(3); // glazing + door + upper
    for (const pane of villa.panes) {
      expect(pane.transparent).toBe(true);
      expect(pane.emissiveIntensity).toBeGreaterThan(0.5); // day-cycle adoptable
    }
    expect(villa.entry.z).toBeGreaterThan(0); // outside the +z entry face
    expect(villa.obstacleRadius).toBeGreaterThan(4);
  });

  it('the urban palette exists and themes the walls warm-white', () => {
    expect(PALETTES.urban).toBeDefined();
    expect(PALETTES.urban.wall).toBe(0xe8e2d6);
    // Sanity: the palette satisfies the full interface (spot fields).
    expect(PALETTES.urban.foliage.length).toBeGreaterThan(0);
    expect(typeof PALETTES.urban.lampGlow).toBe('number');
  });
});
