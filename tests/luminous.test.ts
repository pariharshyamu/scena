import { describe, expect, it } from 'vitest';
import { Mesh, MeshStandardMaterial, PointLight, type Object3D } from 'three';
import {
  createLightBudget,
  createLanternLight,
  createNeonSign,
  createPhotocell,
  createRevolvingBeacon,
  createStreetLight,
  createStringLights,
  type Luminous,
} from '../src';

const at = (x: number, z: number) => ({ x, y: 0, z });

describe('createLightBudget', () => {
  it('grants at most max lights, nearest-first, and priority outranks distance', () => {
    const budget = createLightBudget({ max: 2 });
    const near = budget.register({ anchor: at(1, 0), color: 0xffffff, intensity: 5, radius: 10 });
    const mid = budget.register({ anchor: at(5, 0), color: 0xffffff, intensity: 5, radius: 10 });
    const far = budget.register({ anchor: at(20, 0), color: 0xffffff, intensity: 5, radius: 10 });
    budget.update(at(0, 0));
    expect(budget.active).toBe(2);
    expect(near.granted).toBe(true);
    expect(mid.granted).toBe(true);
    expect(far.granted).toBe(false);

    // A VIP at the far end takes a slot from the middle of the pack.
    far.release();
    const vip = budget.register({
      anchor: at(20, 0),
      color: 0xff0000,
      intensity: 5,
      radius: 10,
      priority: 8,
    });
    budget.update(at(0, 0));
    expect(vip.granted).toBe(true);
    expect(near.granted).toBe(true); // still the closest
    expect(mid.granted).toBe(false); // the one that paid for the VIP
  });

  it('is hysteretic: small viewpoint jitter does not swap grants', () => {
    const budget = createLightBudget({ max: 1, hysteresis: 1.35 });
    const a = budget.register({ anchor: at(-5, 0), color: 0xffffff, intensity: 4, radius: 8 });
    const b = budget.register({ anchor: at(5, 0), color: 0xffffff, intensity: 4, radius: 8 });
    budget.update(at(-1, 0)); // a is closer — a gets the light
    expect(a.granted).toBe(true);
    budget.update(at(0.8, 0)); // b is now slightly closer — not decisively
    expect(a.granted).toBe(true);
    expect(b.granted).toBe(false);
    budget.update(at(4.5, 0)); // decisively b's neighborhood
    expect(b.granted).toBe(true);
    expect(a.granted).toBe(false);
  });

  it('doused claims free their slot without unregistering, and the light truly dims', () => {
    const budget = createLightBudget({ max: 1 });
    let aLit = true;
    const a = budget.register({
      anchor: at(1, 0),
      color: 0xffcc88,
      intensity: 6,
      radius: 9,
      isLit: () => aLit,
    });
    const b = budget.register({ anchor: at(10, 0), color: 0xffffff, intensity: 4, radius: 8 });
    budget.update(at(0, 0));
    expect(a.granted).toBe(true);
    const lights = budget.group.children.filter((c): c is PointLight => c instanceof PointLight);
    expect(lights.some((l) => l.intensity === 6)).toBe(true);

    aLit = false; // the lamp went out; the budget notices by itself
    budget.update(at(0, 0));
    expect(a.granted).toBe(false);
    expect(b.granted).toBe(true);
    expect(lights.some((l) => l.intensity === 6)).toBe(false);
  });
});

const emissives = (fixture: Luminous): number[] => {
  const out: number[] = [];
  fixture.object.traverse((child: Object3D) => {
    const material = (child as Mesh).material as MeshStandardMaterial | undefined;
    if (
      material?.emissive &&
      material.emissive.getHex() !== 0 &&
      !out.includes(material.emissiveIntensity)
    ) {
      out.push(material.emissiveIntensity);
    }
  });
  return out;
};

describe('luminous fixtures', () => {
  it('every fixture carries the same contract: claim, setLit, and a glow that obeys', () => {
    const fixtures: Luminous[] = [
      createStreetLight({ style: 'village', seed: 2 }),
      createStreetLight({ style: 'modern', seed: 3 }),
      createLanternLight({ hanging: true }),
      createNeonSign('OPEN'),
      createStringLights({ count: 9 }),
      createRevolvingBeacon(),
    ];
    for (const fixture of fixtures) {
      expect(fixture.lit).toBe(true);
      expect(fixture.claim.radius).toBeGreaterThan(0);
      expect(fixture.claim.intensity).toBeGreaterThan(0);
      expect(fixture.claim.isLit()).toBe(true);
      expect(fixture.claim.anchor.parent).toBe(fixture.object);
      fixture.setLit(false);
      expect(fixture.lit).toBe(false);
      expect(fixture.claim.isLit()).toBe(false); // the claim reads the same state
      fixture.setLit(true);
    }
    // Dousing actually darkens: the street light's bright emissive drops.
    const lamp = fixtures[0];
    expect(Math.max(...emissives(lamp))).toBeGreaterThan(1);
    lamp.setLit(false);
    expect(Math.max(...emissives(lamp))).toBeLessThan(0.5);
  });

  it('neon lays tubes along the glyph strokes and one seeded letter buzzes', () => {
    const sign = createNeonSign('MOTEL', { seed: 4 });
    expect(sign.segments).toBeGreaterThan(20); // five letters of tube runs
    const before = new Set(emissives(sign));
    // Advance until the buzzing letter dips — it must, on its own rhythm.
    let dipped = false;
    for (let i = 0; i < 600 && !dipped; i++) {
      sign.update!(1 / 30);
      dipped = emissives(sign).some((e) => e > 0.1 && e < 0.5);
    }
    expect(dipped).toBe(true);
    expect(before.size).toBeGreaterThan(0);
  });

  it('string lights sag below their hang points and twinkle out of phase', () => {
    const lights = createStringLights({ span: 8, sag: 0.6, count: 12, seed: 5 });
    // r185 gives every Mesh a `count` (batching), so match InstancedMesh properly.
    const bulbs = lights.object.children.find(
      (c) => (c as { isInstancedMesh?: boolean }).isInstancedMesh
    ) as unknown as {
      count: number;
      instanceColor: { array: Float32Array } | null;
    };
    expect(bulbs.count).toBe(12);
    const snapshot = Float32Array.from(bulbs.instanceColor!.array);
    lights.update!(0.4);
    const moved = bulbs.instanceColor!.array.some((v, i) => Math.abs(v - snapshot[i]) > 1e-4);
    expect(moved).toBe(true);
  });

  it('the beacon sweeps only while lit', () => {
    const beacon = createRevolvingBeacon({ speed: 0.5 });
    const head = beacon.object.children.find((c) => c.type === 'Group')!;
    const start = head.rotation.y;
    beacon.update!(0.5);
    expect(head.rotation.y).not.toBeCloseTo(start);
    const mid = head.rotation.y;
    beacon.setLit(false);
    beacon.update!(0.5);
    expect(head.rotation.y).toBe(mid); // a dark beacon does not turn
  });
});

describe('createPhotocell', () => {
  const fakeFixture = () => {
    const calls: boolean[] = [];
    return { calls, setLit: (on: boolean) => calls.push(on) };
  };

  it('ripples the street alight at dusk, staggered and seeded', () => {
    const sky = { sunElevation: 0.5 };
    const lamps = Array.from({ length: 8 }, fakeFixture);
    const cell = createPhotocell(sky, lamps, { seed: 7, spread: 2 });
    expect(cell.state).toBe('day');
    lamps.forEach((l) => expect(l.calls).toEqual([false])); // day: all doused at once

    sky.sunElevation = -0.01; // the sun dips
    cell.update(1 / 60);
    expect(cell.state).toBe('night');
    expect(cell.pending).toBeGreaterThan(0); // nobody ignites instantly
    const litAfter = (s: number): number => {
      for (let t = 0; t < s; t += 1 / 30) cell.update(1 / 30);
      return lamps.filter((l) => l.calls[l.calls.length - 1] === true).length;
    };
    const early = litAfter(1.0);
    const all = litAfter(1.5);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(8); // SOME are still dark — that's the ripple
    expect(all).toBe(8);

    // Grazing the threshold cannot make the street flap.
    sky.sunElevation = 0.05;
    cell.update(1);
    expect(cell.state).toBe('night'); // dawn needs real daylight, not a graze
    sky.sunElevation = 0.2;
    cell.update(1);
    expect(cell.state).toBe('day');
  });

  it('two cells with the same seed agree; different seeds stagger differently', () => {
    const order = (seed: number): string => {
      const sky = { sunElevation: 0.5 };
      const lamps = Array.from({ length: 5 }, fakeFixture);
      const cell = createPhotocell(sky, lamps, { seed, spread: 3 });
      sky.sunElevation = -0.1;
      const sequence: number[] = [];
      for (let t = 0; t < 3.2; t += 0.05) {
        cell.update(0.05);
        lamps.forEach((l, i) => {
          if (l.calls[l.calls.length - 1] === true && !sequence.includes(i)) sequence.push(i);
        });
      }
      return sequence.join(',');
    };
    expect(order(3)).toBe(order(3));
    expect(order(3)).not.toBe(order(11));
  });
});
