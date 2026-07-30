import { describe, expect, it } from 'vitest';
import { MeshStandardMaterial, type Material, type Mesh, type Object3D } from 'three';
import { sharedBy } from '../src/materials/shared';
import { createStall } from '../src/props/stall';
import { createRailing } from '../src/props/modern';
import { createCar } from '../src/props/vehicles';

/**
 * Draw cost is exact, so it is testable, and `bench/geometry.mjs` is the gate
 * that holds every prop to a ceiling. These are the invariants underneath it —
 * they run in `npm test`, so the sharing cannot quietly come undone between
 * bench runs.
 */

/** Distinct material instances under an object, and how many are duplicates. */
function materials(object: Object3D): { instances: number; distinct: number } {
  const seen = new Set<Material>();
  object.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.material) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (m) seen.add(m);
    }
  });
  // Group by the fields a renderer actually binds, plus SCENA's own uniform
  // bags — two `wood` surfaces built with different seeds carry different
  // `uSurfSeed` values and are NOT duplicates, however alike they look here.
  const byValue = new Set<string>();
  for (const m of seen) {
    const parts: unknown[] = [m.type, m.transparent, m.opacity, m.side];
    const any = m as unknown as Record<string, { getHexString?: () => string }>;
    for (const k of ['color', 'emissive']) parts.push(any[k]?.getHexString?.() ?? '-');
    for (const k of ['roughness', 'metalness', 'flatShading', 'emissiveIntensity']) {
      parts.push((m as unknown as Record<string, unknown>)[k]);
    }
    for (const bag of Object.values(m.userData ?? {})) {
      if (!bag || typeof bag !== 'object') continue;
      for (const [name, u] of Object.entries(bag as Record<string, { value?: unknown }>)) {
        if (u && typeof u === 'object' && 'value' in u) parts.push(`${name}=${JSON.stringify(u.value)}`);
      }
    }
    byValue.add(parts.join('|'));
  }
  return { instances: seen.size, distinct: byValue.size };
}

describe('sharedBy', () => {
  it('builds one material per key, not one per call', () => {
    let built = 0;
    const matte = sharedBy((color: number) => {
      built++;
      return new MeshStandardMaterial({ color });
    });
    const a = matte(0xff0000);
    const b = matte(0xff0000);
    const c = matte(0x00ff00);
    expect(built).toBe(2);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('keeps each cache to its own caller', () => {
    // The reason this is a factory and not a module-level map: two props must
    // never end up sharing a material, or tinting one crate tints them all.
    const make = () => sharedBy((color: number) => new MeshStandardMaterial({ color }));
    expect(make()(0xff0000)).not.toBe(make()(0xff0000));
  });
});

describe('props do not allocate materials they could share', () => {
  it('a stall builds one material per goods colour, not one per item', () => {
    // `matte(rng.pick(BREAD_COLORS))` inside the loop gave 18 instances for 8
    // distinct materials. Every bakery stall has more loaves than colours.
    for (const seed of [1, 2, 3, 4, 5]) {
      const { instances, distinct } = materials(createStall({ seed }).object);
      expect(instances, `stall seed ${seed}`).toBe(distinct);
    }
  });

  it('a glass railing glazes every bay from one material', () => {
    const railing = createRailing({ seed: 1, style: 'glass', length: 8 });
    const { instances, distinct } = materials(railing.object);
    expect(instances).toBe(distinct);
    // And the panes really are one object, not merely equal ones.
    const panes: Material[] = [];
    railing.object.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.transparent) {
        panes.push(mesh.material);
      }
    });
    expect(panes.length).toBeGreaterThan(2);
    expect(new Set(panes).size).toBe(1);
  });

  it('a car has four wheels and one rubber', () => {
    const { instances, distinct } = materials(createCar({ seed: 1 }).object);
    expect(instances).toBe(distinct);
  });

  it('the stall keeps its per-basket weathering', () => {
    // The counter-invariant, and the reason the duplicate check reads the
    // surface uniform bag: three baskets carry three `wood` surfaces that
    // differ only in `uSurfSeed`. Collapsing them to one would pass a naive
    // duplicate check and quietly stamp the baskets out identically.
    const stall = createStall({ seed: 1, goods: 'produce' });
    const seeds = new Set<string>();
    stall.object.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const bag = mesh.material.userData?.scenaSurface as
        | Record<string, { value?: { x: number; y: number; z: number } }>
        | undefined;
      const s = bag?.uSurfSeed?.value;
      if (s) seeds.add(`${s.x},${s.y},${s.z}`);
    });
    expect(seeds.size).toBeGreaterThan(1);
  });
});
