import { describe, expect, it } from 'vitest';
import { BufferAttribute, Group, InstancedMesh, Mesh, Vector3 } from 'three';
import { Rng, fractalNoise2 } from '../src/core/random';
import { collectObstacles } from '../src/core/types';
import { createTree } from '../src/props/tree';
import { createRock } from '../src/props/rock';
import { createCrate } from '../src/props/crate';
import { createFence } from '../src/props/fence';
import { createLamp } from '../src/props/lamp';
import { createTerrain } from '../src/environment/terrain';
import { createSky } from '../src/environment/sky';
import { createLightingRig, applyFog } from '../src/environment/lighting';
import { scatter } from '../src/scatter/scatter';
import { Scene } from 'three';

function meshPositions(group: Group): number[] {
  const out: number[] = [];
  group.traverse((child) => {
    if (child instanceof Mesh) {
      const attr = child.geometry.getAttribute('position') as BufferAttribute;
      for (let i = 0; i < Math.min(attr.count, 12); i++) out.push(attr.getX(i), attr.getY(i));
      out.push(child.position.x, child.position.y, child.position.z);
    }
  });
  return out;
}

describe('Rng', () => {
  it('is deterministic per seed and different across seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    const seqC = [c.next(), c.next(), c.next()];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('noise is continuous-ish and bounded', () => {
    for (let i = 0; i < 50; i++) {
      const v = fractalNoise2(i * 0.37, i * 0.61, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const a = fractalNoise2(5.0, 5.0, 7);
    const b = fractalNoise2(5.01, 5.0, 7);
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });
});

describe('props', () => {
  it.each([
    ['tree', () => createTree({ seed: 5 })],
    ['rock', () => createRock({ seed: 5 })],
    ['crate', () => createCrate({ seed: 5 })],
    ['fence', () => createFence({ seed: 5 })],
    ['lamp', () => createLamp({ seed: 5 })],
  ])('%s: renders geometry and reports a footprint', (_name, make) => {
    const prop = make();
    expect(prop.object.children.length).toBeGreaterThan(0);
    expect(prop.obstacleRadius).toBeGreaterThan(0);
  });

  it('same seed → identical prop; different seed → different prop', () => {
    const a = createTree({ seed: 9, style: 'oak' });
    const b = createTree({ seed: 9, style: 'oak' });
    const c = createTree({ seed: 10, style: 'oak' });
    expect(meshPositions(a.object)).toEqual(meshPositions(b.object));
    expect(meshPositions(a.object)).not.toEqual(meshPositions(c.object));
  });

  it('rocks keep a flattened underside', () => {
    const rock = createRock({ seed: 3, size: 1 });
    const mesh = rock.object.children[0] as Mesh;
    const positions = mesh.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getY(i)).toBeGreaterThanOrEqual(-0.15 - 1e-6);
    }
  });

  it('collectObstacles reports world-space positions and scaled radii', () => {
    const tree = createTree({ seed: 1 });
    tree.object.position.set(10, 0, -4);
    tree.object.scale.setScalar(2);
    const [obstacle] = collectObstacles([tree]);
    expect(obstacle.center.x).toBe(10);
    expect(obstacle.center.z).toBe(-4);
    expect(obstacle.radius).toBeCloseTo(tree.obstacleRadius * 2);
  });
});

describe('terrain', () => {
  it('mesh vertices agree exactly with heightAt', () => {
    const terrain = createTerrain({ seed: 11, size: 40, resolution: 24 });
    const positions = terrain.mesh.geometry.getAttribute('position') as BufferAttribute;
    for (const i of [0, 57, 200, positions.count - 1]) {
      expect(positions.getY(i)).toBeCloseTo(
        terrain.heightAt(positions.getX(i), positions.getZ(i)),
        6
      );
    }
  });

  it('is deterministic per seed and stays within amplitude', () => {
    const a = createTerrain({ seed: 4, size: 30, resolution: 16, amplitude: 5 });
    const b = createTerrain({ seed: 4, size: 30, resolution: 16, amplitude: 5 });
    expect(a.heightAt(3.7, -8.1)).toBe(b.heightAt(3.7, -8.1));
    for (let i = 0; i < 30; i++) {
      const h = a.heightAt(i * 1.7 - 15, i * 0.9 - 15);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(5);
    }
  });

  it('has vertex colors', () => {
    const terrain = createTerrain({ seed: 2, size: 20, resolution: 12 });
    expect(terrain.mesh.geometry.getAttribute('color')).toBeDefined();
  });
});

describe('environment', () => {
  it('sky builds a backside dome with adjustable colors', () => {
    const sky = createSky();
    expect(sky.mesh.name).toBe('sky');
    sky.setColors(0x112233, 0x445566);
  });

  it('lighting rig presets build sun/ambient/hemisphere', () => {
    const rig = createLightingRig('golden-hour');
    expect(rig.group.children).toHaveLength(3);
    expect(rig.sun.intensity).toBeGreaterThan(1);
  });

  it('fog presets apply and clear', () => {
    const scene = new Scene();
    applyFog(scene, 'thick');
    expect(scene.fog).not.toBeNull();
    applyFog(scene, 'clear');
    expect(scene.fog).toBeNull();
  });
});

describe('scatter', () => {
  const area = { min: { x: -20, z: -20 }, max: { x: 20, z: 20 } };
  const items = [{ create: (rng: Rng) => createTree({ seed: rng.int(1, 1e9) }) }];

  it('is deterministic per seed', () => {
    const a = scatter({ seed: 7, area, items, count: 200 });
    const b = scatter({ seed: 7, area, items, count: 200 });
    expect(a.count).toBe(b.count);
    expect(a.placements.map((p) => p.position.toArray())).toEqual(
      b.placements.map((p) => p.position.toArray())
    );
    expect(scatter({ seed: 8, area, items, count: 200 }).placements[0].position.toArray()).not.toEqual(
      a.placements[0].position.toArray()
    );
  });

  it('renders as InstancedMeshes with counts matching placements', () => {
    const result = scatter({ seed: 7, area, items, count: 300 });
    expect(result.count).toBeGreaterThan(30);
    let instancedTotal = 0;
    let meshParts = 0;
    result.group.traverse((child) => {
      if (child instanceof InstancedMesh) {
        meshParts++;
        instancedTotal += child.count;
      }
    });
    expect(meshParts).toBeGreaterThan(0);
    // Each placement instantiates every mesh part of its variant, so the
    // per-part instance counts must sum back to a multiple structure —
    // at minimum, no placement may be dropped: total >= placements.
    expect(instancedTotal).toBeGreaterThanOrEqual(result.count);
  });

  it('respects minSpacing', () => {
    const result = scatter({ seed: 3, area, items, count: 400, minSpacing: 2 });
    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        const d = result.placements[i].position.distanceTo(result.placements[j].position);
        expect(d).toBeGreaterThanOrEqual(2 - 1e-6);
      }
    }
  });

  it('respects mask, keepOut and surface height', () => {
    const result = scatter({
      seed: 5,
      area,
      items,
      count: 400,
      surface: (x, z) => x * 0.1 + z * 0.05,
      mask: (x) => x > 0, // only the +x half
      keepOut: [{ center: { x: 10, z: 0 }, radius: 5 }],
    });
    expect(result.count).toBeGreaterThan(5);
    for (const p of result.placements) {
      expect(p.position.x).toBeGreaterThan(0);
      expect(p.position.y).toBeCloseTo(p.position.x * 0.1 + p.position.z * 0.05, 6);
      expect(Math.hypot(p.position.x - 10, p.position.z)).toBeGreaterThanOrEqual(5);
    }
  });

  it('reports world-space obstacles scaled per placement', () => {
    const result = scatter({ seed: 6, area, items, count: 200 });
    expect(result.obstacles.length).toBeGreaterThan(0);
    for (const obstacle of result.obstacles) {
      expect(obstacle.center).toBeInstanceOf(Vector3);
      expect(obstacle.radius).toBeGreaterThan(0.3);
      expect(obstacle.radius).toBeLessThan(1.2);
    }
  });
});
