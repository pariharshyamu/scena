import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { createLagoon, createPalm, createBananaTree } from '../src';

const run = (prop: { update(dt: number): void }, seconds: number): void => {
  for (let i = 0; i < seconds * 30; i++) prop.update(1 / 30);
};

describe('the lagoon', () => {
  it('is a bowl of water: deep in the middle, nothing at the rim', () => {
    const lagoon = createLagoon({ seed: 3, radius: 9, depth: 1.8 });
    expect(lagoon.depthAt(0, 0)).toBeGreaterThan(1.0);
    expect(lagoon.depthAt(30, 0)).toBe(0);
    expect(lagoon.depthAt(0, -25)).toBe(0);
    // Wading in gets deeper: rim shelf → bowl.
    const shallow = lagoon.depthAt(7.5, 0);
    const mid = lagoon.depthAt(4, 0);
    expect(shallow).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(shallow);
  });

  it('is structurally ANIMA WaterBody: surfaceY, depthAt, disturb', () => {
    const lagoon = createLagoon({ seed: 3 });
    expect(lagoon.surfaceY).toBe(0);
    expect(typeof lagoon.depthAt).toBe('function');
    expect(() => lagoon.disturb(1, 1, 0.5)).not.toThrow();
  });

  it('depthAt is world-space and rides the transform', () => {
    const lagoon = createLagoon({ seed: 3 });
    const centre = lagoon.depthAt(0, 0);
    lagoon.object.position.set(40, 0, -12);
    expect(lagoon.depthAt(0, 0)).toBe(0);
    expect(lagoon.depthAt(40, -12)).toBeCloseTo(centre, 6);
  });

  it('the fish swim, stay wet, and stay home', () => {
    const lagoon = createLagoon({ seed: 3, radius: 9, fish: 12 });
    const fishGroup = lagoon.object.getObjectByName('fish')!;
    expect(fishGroup.children).toHaveLength(12);
    const before = fishGroup.children.map((f) => f.position.clone());
    const v = new Vector3();
    let minDepthMargin = Infinity;
    for (let i = 0; i < 30 * 30; i++) {
      lagoon.update(1 / 30);
      for (const f of fishGroup.children) {
        v.copy(f.position);
        const depth = lagoon.depthAt(v.x, v.z);
        // Below the surface, above the sand, and never beached.
        minDepthMargin = Math.min(minDepthMargin, depth + v.y, -v.y);
      }
    }
    expect(minDepthMargin).toBeGreaterThan(0.02);
    let moved = 0;
    fishGroup.children.forEach((f, i) => {
      moved = Math.max(moved, f.position.distanceTo(before[i]));
    });
    expect(moved).toBeGreaterThan(0.5);
  });

  it('the surface ripples, centimetres tall, and never drains', () => {
    const lagoon = createLagoon({ seed: 3 });
    const pos = (lagoon.object.getObjectByName('water') as import('three').Mesh).geometry.getAttribute(
      'position'
    );
    run(lagoon, 2);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      min = Math.min(min, pos.getY(i));
      max = Math.max(max, pos.getY(i));
    }
    expect(max - min).toBeGreaterThan(0.01);
    expect(max - min).toBeLessThan(0.1);
  });

  it('no two lagoons are the same pool, but the same seed is', () => {
    const a = createLagoon({ seed: 5 });
    const b = createLagoon({ seed: 5 });
    const c = createLagoon({ seed: 6 });
    expect(a.depthAt(3, 2)).toBeCloseTo(b.depthAt(3, 2), 10);
    expect(a.depthAt(3, 2)).not.toBeCloseTo(c.depthAt(3, 2), 4);
  });
});

describe('the cloth trees', () => {
  it('a palm is a curved trunk, a crown of fronds, and coconuts', () => {
    const palm = createPalm({ seed: 4, fronds: 9, coconuts: 3 });
    expect(palm.object.getObjectByName('trunk')).toBeDefined();
    const crown = palm.object.getObjectByName('crown')!;
    expect(crown).toBeDefined();
    let nuts = 0;
    crown.traverse((o) => {
      if (o.name === 'coconut') nuts++;
    });
    expect(nuts).toBe(3);
    expect(palm.crownY).toBeGreaterThan(3);
    // The lean: the crown is NOT above the roots.
    expect(Math.abs(crown.position.x)).toBeGreaterThan(0.15);
  });

  it('the leaves are CLOTH: every frond carries wave uniforms, out of step', () => {
    const palm = createPalm({ seed: 4, fronds: 8 });
    const phases: number[] = [];
    palm.object.traverse((o) => {
      const mesh = o as import('three').Mesh;
      const mat = mesh.material as import('three').MeshStandardMaterial | undefined;
      if (mat?.userData?.waveUniforms) {
        phases.push((mat.userData.waveUniforms as { uPhase: { value: number } }).uPhase.value);
      }
    });
    expect(phases).toHaveLength(8);
    expect(new Set(phases.map((p) => p.toFixed(4))).size).toBe(8); // nobody in step
  });

  it('update advances the cloth clock on every leaf', () => {
    const palm = createPalm({ seed: 4 });
    const times: Array<{ value: number }> = [];
    palm.object.traverse((o) => {
      const mat = (o as import('three').Mesh).material as
        | import('three').MeshStandardMaterial
        | undefined;
      if (mat?.userData?.waveUniforms) {
        times.push((mat.userData.waveUniforms as { uTime: { value: number } }).uTime);
      }
    });
    const before = times.map((t) => t.value);
    run(palm, 1);
    times.forEach((t, i) => expect(t.value).toBeGreaterThan(before[i]));
  });

  it('a banana leaf is THREE strips — the split along the veins', () => {
    const banana = createBananaTree({ seed: 4, leaves: 6, fruiting: true });
    let cloth = 0;
    banana.object.traverse((o) => {
      const mat = (o as import('three').Mesh).material as
        | import('three').MeshStandardMaterial
        | undefined;
      if (mat?.userData?.waveUniforms) cloth++;
    });
    expect(cloth).toBe(18);
    expect(banana.object.getObjectByName('bunch')).toBeDefined();
    expect(createBananaTree({ seed: 4, fruiting: false }).object.getObjectByName('bunch')).toBeUndefined();
  });

  it('same seed, same tree', () => {
    const a = createPalm({ seed: 9 });
    const b = createPalm({ seed: 9 });
    let ca = 0;
    let cb = 0;
    a.object.traverse(() => ca++);
    b.object.traverse(() => cb++);
    expect(ca).toBe(cb);
    expect(a.crownY).toBeCloseTo(b.crownY, 10);
  });
});
