import { describe, expect, it, vi } from 'vitest';
import { InstancedMesh } from 'three';
import {
  createChoppingBlock,
  createOreVein,
  createCookpot,
  createSawhorse,
  type WorkStation,
} from '../src';

const ALL: Array<[string, () => WorkStation, string]> = [
  ['chopping block', createChoppingBlock, 'chop'],
  ['ore vein', createOreVein, 'mine'],
  ['cookpot', createCookpot, 'stir'],
  ['sawhorse', createSawhorse, 'saw'],
];

/** Advance a station for `seconds`. */
function work(s: WorkStation, seconds: number, working = true, dt = 1 / 60): void {
  for (let i = 0; i < seconds / dt; i++) s.update(dt, working);
}

describe('work stations', () => {
  it('each publishes its action, a work slot carrying that loop, and a tool', () => {
    for (const [, make, action] of ALL) {
      const s = make();
      expect(s.action).toBe(action);
      expect(s.slots).toHaveLength(1);
      expect(s.slots![0].kind).toBe('work');
      expect(s.slots![0].pose).toBe('operate');
      expect(s.slots![0].loop).toBe(action); // the worker layers the action loop
      expect(s.tool.children.length).toBeGreaterThan(0); // holds a real tool
      // The effect burst is mounted as an InstancedMesh child.
      const hasBurst = s.object.children.some((c) => c instanceof InstancedMesh);
      expect(hasBurst).toBe(true);
    }
  });

  it('advances progress only while working, wrapping each cycle', () => {
    const s = createChoppingBlock();
    expect(s.progress).toBe(0);
    work(s, 0.3);
    const p = s.progress;
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);

    work(s, 1, false); // idle — no advance
    expect(s.progress).toBeCloseTo(p, 5);

    // Drive well past a full cycle; progress stays within [0, 1).
    work(s, 2);
    expect(s.progress).toBeGreaterThanOrEqual(0);
    expect(s.progress).toBeLessThan(1);
  });

  it('yields once per work cycle', () => {
    const s = createOreVein();
    const onYield = vi.fn();
    s.onYield = onYield;
    work(s, 3.4); // the mine cycle is ~1.05s → about three strikes
    expect(onYield.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(onYield.mock.calls.length).toBeLessThanOrEqual(4);
    // Yield count is the running total, monotonically increasing.
    const totals = onYield.mock.calls.map((c) => c[0]);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(totals[totals.length - 1]).toBe(totals.length);
  });

  it('does not yield while idle', () => {
    const s = createSawhorse();
    const onYield = vi.fn();
    s.onYield = onYield;
    work(s, 3, false);
    expect(onYield).not.toHaveBeenCalled();
  });

  it('is deterministic per seed and updates without throwing', () => {
    const a = createCookpot({ seed: 7 });
    const b = createCookpot({ seed: 7 });
    expect(a.object.children.length).toBe(b.object.children.length);
    expect(() => work(a, 2)).not.toThrow(); // particle pool advances cleanly
  });
});
