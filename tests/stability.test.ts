import { describe, expect, it } from 'vitest';
import { BufferAttribute, Mesh, type Object3D } from 'three';
import { createTree } from '../src/props/tree';
import { createRock } from '../src/props/rock';
import { createTerrain } from '../src/environment/terrain';
import { scatter } from '../src/scatter/scatter';
import { Rng } from '../src/core/random';

/**
 * Seed-stability snapshots: SCENA promises that generator output for a
 * given seed stays identical within a minor version. These hashes are
 * that promise, executable. If a change breaks them intentionally, bump
 * the minor version and update the hashes in the same commit.
 */
function fnv(values: Iterable<number>): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const rounded = Math.round(value * 1000);
    hash ^= rounded & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (rounded >> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function* objectPositions(root: Object3D): Iterable<number> {
  const meshes: Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof Mesh) meshes.push(child);
  });
  for (const mesh of meshes) {
    yield mesh.position.x;
    yield mesh.position.y;
    yield mesh.position.z;
    const positions = mesh.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      yield positions.getX(i);
      yield positions.getY(i);
      yield positions.getZ(i);
    }
  }
}

describe('seed stability (update hashes only with a minor version bump)', () => {
  it('tree(seed 7, pine) is frozen', () => {
    const tree = createTree({ seed: 7, style: 'pine', height: 4 });
    expect(fnv(objectPositions(tree.object))).toBe('3b3d047c');
  });

  it('rock(seed 7) is frozen', () => {
    const rock = createRock({ seed: 7, size: 0.8 });
    expect(fnv(objectPositions(rock.object))).toBe('76bfe8d8');
  });

  it('terrain(seed 7) heights are frozen', () => {
    const terrain = createTerrain({ seed: 7, size: 40, resolution: 16, amplitude: 5 });
    const samples: number[] = [];
    for (let x = -18; x <= 18; x += 4) {
      for (let z = -18; z <= 18; z += 4) samples.push(terrain.heightAt(x, z));
    }
    expect(fnv(samples)).toBe('da0eda3f');
  });

  it('scatter(seed 7) placements are frozen', () => {
    const result = scatter({
      seed: 7,
      area: { min: { x: -15, z: -15 }, max: { x: 15, z: 15 } },
      count: 120,
      items: [{ create: (rng: Rng) => createTree({ seed: rng.int(1, 1e9) }) }],
    });
    const samples: number[] = [];
    for (const p of result.placements) {
      samples.push(p.position.x, p.position.y, p.position.z, p.rotationY, p.scale);
    }
    expect(fnv(samples)).toBe('77af637a');
  });
});
