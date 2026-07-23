import { describe, expect, it } from 'vitest';
import { Group, Mesh } from 'three';
import { createTree, TREE_SPECIES, type TreeSpecies } from '../src/props/tree';
import { createWindField } from '../src/environment/wind';

function meshCount(g: Group): number {
  let n = 0;
  g.traverse((o) => {
    if (o instanceof Mesh) n++;
  });
  return n;
}

describe('createTree species', () => {
  it('builds every species as a Prop with geometry and a steering footprint', () => {
    for (const species of TREE_SPECIES) {
      const tree = createTree({ species, seed: 5 });
      expect(tree.object).toBeInstanceOf(Group);
      expect(tree.object.name).toBe(`tree-${species}`);
      expect(meshCount(tree.object)).toBeGreaterThan(1); // trunk + canopy
      expect(tree.obstacleRadius).toBeGreaterThan(0);
    }
  });

  it('each species is deterministic per seed and distinct per species', () => {
    for (const species of TREE_SPECIES) {
      const a = createTree({ species, seed: 12 });
      const b = createTree({ species, seed: 12 });
      expect(meshCount(a.object)).toBe(meshCount(b.object));
      // Same seed → identical first-mesh transform.
      const ma = a.object.children[0] as Mesh;
      const mb = b.object.children[0] as Mesh;
      expect(ma.position.toArray()).toEqual(mb.position.toArray());
    }
    // Species have distinct silhouettes: a tall cypress vs a squat cedar differ
    // in footprint, and the columnar cypress is far narrower than the cedar.
    expect(createTree({ species: 'cypress' }).obstacleRadius).toBeLessThan(
      createTree({ species: 'cedar' }).obstacleRadius
    );
  });

  it('species have their own height bands (cypress is tall, maple is not)', () => {
    // Sample a few seeds; cypress should tower over maple on average.
    const avgHeight = (species: TreeSpecies): number => {
      let sum = 0;
      const n = 8;
      for (let s = 0; s < n; s++) {
        const box = createTree({ species, seed: s + 1 }).object;
        let top = 0;
        box.traverse((o) => {
          if (o instanceof Mesh) top = Math.max(top, o.position.y);
        });
        sum += top;
      }
      return sum / n;
    };
    expect(avgHeight('cypress')).toBeGreaterThan(avgHeight('maple'));
  });

  it('the default (no species) stays the pine/oak mix — existing forests unchanged', () => {
    // Across many seeds only pine and oak appear when species is unspecified.
    const seen = new Set<string>();
    for (let s = 1; s <= 60; s++) seen.add(createTree({ seed: s }).object.name);
    expect([...seen].sort()).toEqual(['tree-oak', 'tree-pine']);
  });

  it('the deprecated `style` alias still selects a species', () => {
    expect(createTree({ style: 'cypress', seed: 2 }).object.name).toBe('tree-cypress');
    // `species` wins over `style` if both are given.
    expect(createTree({ species: 'birch', style: 'oak', seed: 2 }).object.name).toBe('tree-birch');
  });

  it('binds exactly one (foliage) material to the wind for any species', () => {
    for (const species of TREE_SPECIES) {
      const wind = createWindField();
      const before = wind.materials.length;
      createTree({ species, seed: 4, wind });
      expect(wind.materials.length).toBe(before + 1); // canopy sways, trunk (+ birch bands) planted
      expect(wind.materials[wind.materials.length - 1].customProgramCacheKey()).toContain('scena-wind-v1');
    }
  });
});
