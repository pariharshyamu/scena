import { describe, it, expect } from 'vitest';
import { Mesh, Vector3 } from 'three';
import { createPressureGauge } from '../src';

/** The far END of the needle, in world space. A rotation is not a reading. */
const tipOf = (gauge: ReturnType<typeof createPressureGauge>): Vector3 => {
  gauge.object.updateMatrixWorld(true);
  const needle = gauge.object.getObjectByName('gauge:needle');
  if (!needle) throw new Error('no needle found');
  const geo = (needle as Mesh).geometry;
  geo.computeBoundingBox();
  const half = geo.boundingBox!.max.y;
  return needle.localToWorld(new Vector3(0, half, 0));
};

const settleTo = (g: ReturnType<typeof createPressureGauge>, v: number): void => {
  g.setValue(v);
  for (let i = 0; i < 200; i++) g.update(1 / 30);
};

describe('the gauge — an instrument, not a clock', () => {
  it('sweeps 270° with a dead zone at the bottom, and never enters it', () => {
    const g = createPressureGauge({ max: 16 });
    settleTo(g, 0);
    const zero = tipOf(g).clone();
    settleTo(g, 16);
    const full = tipOf(g).clone();
    // Zero is down-left, full is down-right: the two ends of an arc that does
    // not close. A clock's twelve and its six are directly opposite; these
    // are not, and that asymmetry IS what says "gauge".
    expect(zero.x).toBeLessThan(0);
    expect(full.x).toBeGreaterThan(0);
    expect(zero.y).toBeLessThan(0);
    expect(full.y).toBeLessThan(0);
    // …and neither is at the bottom, because the bottom is the dead zone.
    expect(Math.abs(zero.x)).toBeGreaterThan(Math.abs(zero.y) * 0.6);
    expect(Math.abs(full.x)).toBeGreaterThan(Math.abs(full.y) * 0.6);
  });

  it('over-range clamps at the stop instead of wrapping through the bottom', () => {
    const g = createPressureGauge({ max: 16 });
    settleTo(g, 16);
    const full = tipOf(g).clone();
    settleTo(g, 48);
    const past = tipOf(g).clone();
    // A needle that wrapped would come back round the LEFT side. It must not
    // move at all: full scale is a stop.
    expect(past.distanceTo(full)).toBeLessThan(1e-6);
    expect(g.overRange).toBe(true);
  });

  it('the needle travels monotonically, and it lags', () => {
    const g = createPressureGauge({ max: 16 });
    settleTo(g, 0);
    g.setValue(14);
    let last = tipOf(g).clone();
    let travelled = 0;
    for (let i = 0; i < 20; i++) {
      g.update(1 / 60);
      const now = tipOf(g).clone();
      const step = now.distanceTo(last);
      expect(step).toBeGreaterThanOrEqual(0);
      travelled += step;
      last = now;
    }
    expect(travelled).toBeGreaterThan(0.02);
    // A PARTIAL approach: after a third of a second it must still be short of
    // its target, or the ease is decoration.
    expect(g.value).toBeLessThan(14 * 0.95);
    expect(g.target).toBe(14);
  });

  it('knows its two red marks and reports them as booleans', () => {
    const g = createPressureGauge({ max: 16, redline: 13.2, lowMark: 5 });
    settleTo(g, 2);
    expect(g.low).toBe(true);
    expect(g.overRange).toBe(false);
    settleTo(g, 9);
    expect(g.low).toBe(false);
    expect(g.overRange).toBe(false);
    settleTo(g, 14);
    expect(g.overRange).toBe(true);
  });

  it('is a readout: no open, no toggle, and nothing to walk around', () => {
    const g = createPressureGauge();
    expect(g.obstacleRadius).toBe(0);
    expect((g as unknown as { toggle?: unknown }).toggle).toBeUndefined();
    expect((g as unknown as { open?: unknown }).open).toBeUndefined();
  });

  it('survives being handed a number that is not one', () => {
    const g = createPressureGauge({ max: 16 });
    g.setValue(Number.NaN);
    g.update(1 / 60);
    expect(Number.isFinite(g.value)).toBe(true);
  });
});
