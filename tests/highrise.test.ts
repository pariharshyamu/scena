import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { createHighrise } from '../src';

describe('createHighrise', () => {
  it('mesh count stays flat as floors grow — instancing does the scaling', () => {
    const short = createHighrise({ seed: 4, floors: 6, facade: 'curtain' });
    const tall = createHighrise({ seed: 4, floors: 26, facade: 'curtain' });
    expect(tall.object.children.length).toBe(short.object.children.length);
    expect(tall.windowCount).toBeGreaterThan(short.windowCount * 3);
    const height = (t: typeof short): number =>
      new Box3().setFromObject(t.object).getSize(new Vector3()).y;
    expect(height(tall)).toBeGreaterThan(height(short) * 2.5);
  });

  it('partitions windows into lit and dark by occupancy', () => {
    const tower = createHighrise({ seed: 7, floors: 12, occupancy: 0.55 });
    expect(tower.litCount + 0).toBeGreaterThan(0);
    expect(tower.litCount).toBeLessThan(tower.windowCount);
    const fraction = tower.litCount / tower.windowCount;
    expect(fraction).toBeGreaterThan(0.35);
    expect(fraction).toBeLessThan(0.75);
    // The lit set is day-cycle adoptable, the mask deterministic per seed.
    expect(tower.litPanes.emissiveIntensity).toBeGreaterThan(0.5);
    const again = createHighrise({ seed: 7, floors: 12, occupancy: 0.55 });
    expect(again.litCount).toBe(tower.litCount);
    const empty = createHighrise({ seed: 7, floors: 12, occupancy: 0 });
    expect(empty.litCount).toBe(0);
  });

  it('facade styles differ and the footprint reports honestly', () => {
    const grid = createHighrise({ seed: 3, facade: 'grid', width: 12, depth: 10 });
    const curtain = createHighrise({ seed: 3, facade: 'curtain', width: 12, depth: 10 });
    expect(grid.object.name).toBe('tower-grid');
    expect(curtain.object.name).toBe('tower-curtain');
    // Curtain panes are taller than punched windows — the bounding boxes match
    // (same shaft), but window counts equal and obstacle radius spans the plan.
    expect(grid.windowCount).toBe(curtain.windowCount);
    expect(grid.obstacleRadius).toBeCloseTo(12 * 0.62, 3);
  });
});
