import { describe, it, expect } from 'vitest';
import { createBeach } from '../src';

const run = (beach: ReturnType<typeof createBeach>, seconds: number): void => {
  for (let i = 0; i < seconds * 30; i++) beach.update(1 / 30);
};

/** A hand-cranked sea: high for `pushUntil` seconds, then flat. */
const pulseSea =
  (height: number, pushUntil: number) =>
  (_x: number, _z: number, t: number): number =>
    t < pushUntil ? height : 0;

describe('the beach — the swash', () => {
  it('profiles a berm: dune above, foreshore running under the sea', () => {
    const beach = createBeach({ seed: 3, level: 0 });
    expect(beach.heightAt(0, -11)).toBeGreaterThan(1.2); // the dune
    expect(Math.abs(beach.heightAt(0, 4))).toBeLessThan(0.1); // the waterline
    expect(beach.heightAt(0, 11)).toBeLessThan(-0.3); // under the sea
    // Monotone toward the sea across the foreshore.
    let prev = Infinity;
    for (let z = -4; z <= 11; z += 1) {
      const h = beach.heightAt(0, z);
      expect(h).toBeLessThan(prev + 1e-9);
      prev = h;
    }
  });

  it('starts honest: dry above the line, wet below it', () => {
    const beach = createBeach({ seed: 3 });
    beach.update(1 / 30);
    expect(beach.wetAt(0, -6)).toBe(0); // dry sand
    expect(beach.wetAt(0, 10)).toBe(1); // open water
  });

  it('a wave runs up, and the sand remembers where it reached', () => {
    const beach = createBeach({ seed: 3, water: pulseSea(0.25, 5), dryTime: 30 });
    run(beach, 5); // the push: tongue runs landward of the still line
    const soaked = beach.wetAt(0, 1.2); // ~3 m landward of z0=4
    expect(soaked).toBeGreaterThan(0.9);
    run(beach, 3); // the sea has gone flat; the tongue has drained back
    const drying = beach.wetAt(0, 1.2);
    expect(drying).toBeGreaterThan(0.5);
    expect(drying).toBeLessThan(1);
  });

  it('drying is monotone, paced by dryTime, and completes', () => {
    const beach = createBeach({ seed: 3, water: pulseSea(0.25, 4), dryTime: 12 });
    run(beach, 4);
    run(beach, 1); // let the edge drain seaward
    let prev = beach.wetAt(0, 1.2);
    expect(prev).toBeGreaterThan(0.5);
    for (let s = 0; s < 6; s++) {
      run(beach, 2);
      const now = beach.wetAt(0, 1.2);
      expect(now).toBeLessThanOrEqual(prev + 1e-9);
      prev = now;
    }
    expect(beach.wetAt(0, 1.2)).toBe(0); // dryTime 12 has fully elapsed
  });

  it('the built-in swell moves the edge, differently along the shore', () => {
    const beach = createBeach({ seed: 3 });
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < 20 * 30; i++) {
      beach.update(1 / 30);
      const r = beach.reachAt(0).z;
      minZ = Math.min(minZ, r);
      maxZ = Math.max(maxZ, r);
    }
    expect(maxZ - minZ).toBeGreaterThan(0.6); // the edge breathes
    // Progressive along shore: two stations disagree at one instant.
    const here = beach.reachAt(-15).z;
    const there = beach.reachAt(15).z;
    expect(Math.abs(here - there)).toBeGreaterThan(0.05);
  });

  it('only wet sand takes a print', () => {
    const beach = createBeach({ seed: 3, water: pulseSea(0.25, 4) });
    beach.update(1 / 30);
    expect(beach.stamp(0, -8)).toBe(false); // dry dune: no print
    expect(beach.stamp(0, 10)).toBe(false); // open water: no print
    expect(beach.stamps).toBe(0);
    run(beach, 5);
    run(beach, 1.5); // wave gone, sand wet and bared
    expect(beach.stamp(0, 1.2)).toBe(true);
    expect(beach.stamps).toBe(1);
  });

  it('the next tongue wipes the prints', () => {
    const sea = (_x: number, _z: number, t: number): number =>
      t < 4 ? 0.25 : t < 10 ? 0 : 0.25; // push, drain, push again
    const beach = createBeach({ seed: 3, water: sea });
    run(beach, 6); // first push has drained
    expect(beach.stamp(0, 1.2)).toBe(true);
    expect(beach.stamp(1, 1.4)).toBe(true);
    expect(beach.stamps).toBe(2);
    run(beach, 3); // still drained: prints survive
    expect(beach.stamps).toBe(2);
    run(beach, 4); // second push covers them…
    run(beach, 2); // …and the wash-out completes
    expect(beach.stamps).toBe(0);
  });

  it('retreats strand foam, and the foam dies away', () => {
    const beach = createBeach({ seed: 3 });
    run(beach, 25); // plenty of run-up/retreat cycles from the built-in swell
    let seen = 0;
    for (let i = 0; i < 20 * 30; i++) {
      beach.update(1 / 30);
      seen = Math.max(seen, beach.foam);
    }
    expect(seen).toBeGreaterThan(0);
    // Becalm the sea: scraps have a ~4.5 s life, so soon there are none.
    const calm = createBeach({ seed: 3, water: () => 0 });
    run(calm, 10);
    expect(calm.foam).toBe(0);
  });

  it('wrackLine reports the session high-water mark', () => {
    const beach = createBeach({ seed: 3, water: pulseSea(0.3, 5) });
    run(beach, 8);
    const line = beach.wrackLine();
    expect(line).toHaveLength(48);
    // The big push ran well landward of the still line at z0 = 4.
    for (const p of line) {
      expect(p.z).toBeLessThan(3.2);
      expect(p.z).toBeGreaterThan(-3);
    }
  });

  it('every query is world-space: the fields ride the prop transform', () => {
    const beach = createBeach({ seed: 3, water: pulseSea(0.25, 4) });
    beach.object.position.set(50, 0, -20);
    beach.object.rotation.y = Math.PI / 2;
    run(beach, 6);
    // Local (0, 1.2) → world: rotate then translate.
    const wx = 50 + 1.2;
    const wz = -20 - 0;
    expect(beach.wetAt(wx, wz)).toBeGreaterThan(0.5);
    expect(beach.stamp(wx, wz)).toBe(true);
    const reach = beach.reachAt(wx);
    expect(Math.abs(reach.x - 50)).toBeLessThan(8); // on the rotated strip
    expect(beach.heightAt(50 + 4, -20)).toBeCloseTo(0, 1); // the waterline rode too
  });

  it('is deterministic: same seed, same sea, same sand', () => {
    const make = () => {
      const b = createBeach({ seed: 11 });
      run(b, 17.3);
      return b;
    };
    const a = make();
    const b = make();
    for (let z = -6; z <= 8; z += 2) {
      expect(a.wetAt(3, z)).toBeCloseTo(b.wetAt(3, z), 10);
    }
    expect(a.reachAt(0).z).toBeCloseTo(b.reachAt(0).z, 10);
    expect(a.foam).toBe(b.foam);
  });

  it('a beach is a floor, and it is built', () => {
    const beach = createBeach({ seed: 3 });
    expect(beach.obstacleRadius).toBe(0);
    for (const name of ['sand', 'swash', 'foam', 'stamps']) {
      expect(beach.object.getObjectByName(name), name).toBeDefined();
    }
  });
});
