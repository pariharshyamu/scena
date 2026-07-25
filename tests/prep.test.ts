import { describe, expect, it } from 'vitest';
import { Box3, Object3D, Vector3 } from 'three';
import { createPrepStation, PREP_KINDS, type PrepKind } from '../src';

/**
 * Bounds of the SOLID parts.
 *
 * The shared burst pool parks its dead particles at -9999 so they cost
 * nothing on screen, which makes a naive bounding box of any work station
 * ten kilometres tall.
 */
const boxOf = (o: Object3D): Box3 => {
  o.updateMatrixWorld(true);
  const box = new Box3();
  o.traverse((c) => {
    // NOT a `type === 'Mesh'` check: InstancedMesh does not override `type`,
    // so it reports as a plain Mesh and the pool sails straight through.
    if (c.type === 'Mesh' && !(c as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) {
      box.expandByObject(c);
    }
  });
  return box;
};

const run = (
  s: ReturnType<typeof createPrepStation>,
  seconds: number,
  working = true
): void => {
  for (let i = 0; i < Math.round(seconds * 60); i++) s.update(1 / 60, working);
};

describe('createPrepStation — two hands, two jobs', () => {
  it.each(PREP_KINDS)('%s publishes a work hand AND a guide hand, apart', (kind) => {
    // The whole point of the track. One anchor is a one-handed loop, which
    // the trilogy already had four of.
    const s = createPrepStation({ kind, seed: 2 });
    s.object.updateMatrixWorld(true);
    const w = s.work.getWorldPosition(new Vector3());
    const g = s.guide.getWorldPosition(new Vector3());
    expect(w.distanceTo(g), `${kind}: the hands are in the same place`).toBeGreaterThan(0.1);
    // Both within a body's reach of each other — this is one person, not two.
    expect(w.distanceTo(g)).toBeLessThan(0.6);
  });

  it.each(PREP_KINDS)('%s puts both hands at working height', (kind) => {
    const s = createPrepStation({ kind, seed: 1 });
    s.object.updateMatrixWorld(true);
    for (const hand of [s.work, s.guide]) {
      const at = hand.getWorldPosition(new Vector3());
      expect(at.y, `${kind}`).toBeGreaterThan(0.55);
      expect(at.y, `${kind}`).toBeLessThan(1.35);
    }
  });

  it.each(PREP_KINDS)('%s stands on the floor at bench height', (kind) => {
    const s = createPrepStation({ kind, seed: 1 });
    const box = boxOf(s.object);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.max.y).toBeLessThan(1.35);
  });

  it('is a WorkStation, so it drops into the machinery that already exists', () => {
    for (const kind of PREP_KINDS) {
      const s = createPrepStation({ kind });
      expect(typeof s.action).toBe('string');
      expect(s.tool).toBeDefined();
      expect(s.slots?.length).toBeGreaterThan(0);
      expect(s.slots![0].loop).toBe(s.action);
    }
  });
});

describe('createPrepStation — the loop', () => {
  it('yields once per cycle while it is being worked', () => {
    const s = createPrepStation({ kind: 'board', batch: 100, seed: 1 });
    const yields: number[] = [];
    s.onYield = (n) => yields.push(n);
    run(s, 3);
    expect(yields.length).toBeGreaterThan(2);
    // Counting up, one at a time, no repeats.
    expect(yields).toEqual(yields.map((_, i) => i + 1));
  });

  it('does nothing at all when nobody is working it', () => {
    const s = createPrepStation({ kind: 'board', seed: 1 });
    let count = 0;
    s.onYield = () => (count += 1);
    run(s, 5, false);
    expect(count).toBe(0);
    expect(s.remaining).toBe(1);
  });

  it('runs OUT, and stops — an empty board still throwing chips is a hole', () => {
    const s = createPrepStation({ kind: 'board', batch: 4, seed: 1 });
    let count = 0;
    s.onYield = () => (count += 1);
    run(s, 4);
    expect(s.remaining).toBe(0);
    const done = count;
    run(s, 5);
    expect(count, 'it kept working an empty board').toBe(done);

    s.load(1);
    expect(s.remaining).toBe(1);
    run(s, 2);
    expect(count).toBeGreaterThan(done);
  });

  it.each(PREP_KINDS)('%s actually MOVES something while it works', (kind) => {
    // A station whose progress bar advances while nothing on it stirs is a
    // progress bar.
    const s = createPrepStation({ kind, batch: 100, seed: 1 });
    s.object.updateMatrixWorld(true);
    const sample = (): number[] => {
      s.object.updateMatrixWorld(true);
      const out: number[] = [];
      s.object.traverse((c) => {
        out.push(c.position.x, c.position.y, c.position.z, c.rotation.y, c.rotation.z);
      });
      return out;
    };
    const before = sample();
    run(s, 0.4);
    const after = sample();
    const moved = after.reduce((m, v, i) => Math.max(m, Math.abs(v - before[i])), 0);
    expect(moved, `${kind}: nothing on it moved`).toBeGreaterThan(0.01);
  });

  it('the quern handle sweeps a real circle, not just a spin', () => {
    // A smooth stone turning about its own axis is pixel-identical to a
    // stationary one — the knurled-knob trap for the third time. The crank
    // has to travel.
    const s = createPrepStation({ kind: 'quern', batch: 100, seed: 1 });
    const seen: Vector3[] = [];
    for (let i = 0; i < 120; i++) {
      s.update(1 / 60, true);
      s.object.updateMatrixWorld(true);
      seen.push(s.tool.getWorldPosition(new Vector3()));
    }
    const xs = seen.map((v) => v.x);
    const zs = seen.map((v) => v.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.2);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.2);
  });

  it('a knife lifts and falls, and falls FASTER than it rises', () => {
    // Slow raise, fast strike. A knife that floats down is a knife in a lift.
    const s = createPrepStation({ kind: 'board', batch: 100, seed: 1 });
    const ys: number[] = [];
    for (let i = 0; i < 66; i++) {
      s.update(1 / 60, true);
      ys.push(s.tool.position.y);
    }
    const rises = ys.slice(1).map((y, i) => y - ys[i]).filter((d) => d > 0);
    const falls = ys.slice(1).map((y, i) => y - ys[i]).filter((d) => d < 0);
    expect(rises.length).toBeGreaterThan(0);
    expect(falls.length).toBeGreaterThan(0);
    const fastestFall = Math.abs(Math.min(...falls));
    const fastestRise = Math.max(...rises);
    expect(fastestFall).toBeGreaterThan(fastestRise);
  });

  it('every kind names a distinct ANIMA loop', () => {
    const names = new Set(PREP_KINDS.map((k: PrepKind) => createPrepStation({ kind: k }).action));
    expect(names.size).toBe(PREP_KINDS.length);
  });
});
