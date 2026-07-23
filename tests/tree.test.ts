import { describe, expect, it } from 'vitest';
import { Group, Mesh } from 'three';
import { createTree, treeBiome, TREE_BIOMES, TREE_SPECIES, type TreeSpecies } from '../src/props/tree';
import { Rng } from '../src/core/random';
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

  it('sakura wears its season: bloom is pink and full, winter is bare', () => {
    const spring = createTree({ species: 'sakura', season: 'spring', seed: 3 });
    const winter = createTree({ species: 'sakura', season: 'winter', seed: 3 });
    // A bare winter sakura drops its whole canopy → far fewer meshes.
    expect(meshCount(winter.object)).toBeLessThan(meshCount(spring.object));
    // The spring canopy is a pink blossom, not a green.
    let pink: Mesh | undefined;
    spring.object.traverse((o) => {
      if (o instanceof Mesh && o.geometry.type === 'IcosahedronGeometry') pink = o;
    });
    const c = (pink!.material as unknown as { color: { r: number; g: number; b: number } }).color;
    expect(c.r).toBeGreaterThan(c.g); // reddish-pink, red dominant over green
    expect(c.b).toBeGreaterThan(c.g * 0.9); // and blue-ish, not a leaf green
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

  it('giants are big and their footprint scales with height', () => {
    // A sequoia towers over a garden tree, and its steering footprint scales.
    const small = createTree({ species: 'sequoia', seed: 2, height: 22 });
    const tall = createTree({ species: 'sequoia', seed: 2, height: 32 });
    expect(tall.obstacleRadius).toBeGreaterThan(small.obstacleRadius); // height-scaled
    // And a giant's footprint dwarfs an oak's.
    expect(createTree({ species: 'sequoia' }).obstacleRadius).toBeGreaterThan(
      createTree({ species: 'oak' }).obstacleRadius
    );
    // A banyan drops aerial roots — more meshes than a plain oak of any seed.
    let banyanMeshes = 0;
    createTree({ species: 'banyan', seed: 3 }).object.traverse((o) => {
      if (o instanceof Mesh) banyanMeshes++;
    });
    expect(banyanMeshes).toBeGreaterThan(8);
  });
});

describe('treeBiome', () => {
  it('returns weighted scatter items that build the biome species', () => {
    const items = treeBiome('tropical', { variants: 3 });
    expect(items.length).toBe(TREE_BIOMES.tropical.length);
    for (const item of items) {
      expect(item.variants).toBe(3);
      expect(item.weight).toBeGreaterThan(0);
      const prop = item.create(new Rng(1));
      expect(prop.object.name.startsWith('tree-')).toBe(true);
    }
    // The mix is exactly the biome's species.
    const built = new Set(items.map((it) => it.create(new Rng(9)).object.name.replace('tree-', '')));
    expect(built).toEqual(new Set(TREE_BIOMES.tropical.map((m) => m.species)));
  });

  it('every giant appears in some biome (they are reachable via presets)', () => {
    const inBiomes = new Set(Object.values(TREE_BIOMES).flatMap((mix) => mix.map((m) => m.species)));
    for (const giant of ['sequoia', 'banyan', 'baobab', 'acacia'] as TreeSpecies[]) {
      expect(inBiomes.has(giant)).toBe(true);
    }
  });
});
