import { describe, expect, it } from 'vitest';
import { Mesh, PointLight, Scene, type MeshStandardMaterial } from 'three';
import { createHouse, createRuin, createTower, createWell } from '../src/props/building';
import { createVillage } from '../src/generators/village';
import { createDayCycle } from '../src/environment/dayCycle';
import { createSky } from '../src/environment/sky';
import { createLightingRig, applyFog } from '../src/environment/lighting';
import { fractalNoise2 } from '../src/core/random';

function meshCount(object: { traverse(cb: (o: unknown) => void): void }): number {
  let count = 0;
  object.traverse((o) => {
    if (o instanceof Mesh) count++;
  });
  return count;
}

describe('building props', () => {
  it('are deterministic per seed', () => {
    const a = createHouse({ seed: 42 });
    const b = createHouse({ seed: 42 });
    const c = createHouse({ seed: 43 });
    expect(meshCount(a.object)).toBe(meshCount(b.object));
    expect(a.obstacleRadius).toBe(b.obstacleRadius);
    expect(a.obstacleRadius).not.toBe(c.obstacleRadius);
  });

  it('every building has a blocking footprint', () => {
    for (const prop of [
      createHouse({ seed: 1 }),
      createTower({ seed: 1 }),
      createWell({ seed: 1 }),
      createRuin({ seed: 1 }),
    ]) {
      expect(prop.obstacleRadius).toBeGreaterThan(0.5);
      expect(meshCount(prop.object)).toBeGreaterThan(3);
    }
  });

  it('house windows are emissive enough for the day cycle to adopt', () => {
    const house = createHouse({ seed: 7 });
    let windows = 0;
    house.object.traverse((child) => {
      const material = (child as Mesh).material as MeshStandardMaterial | undefined;
      if (material?.emissive && material.emissiveIntensity > 0.5) windows++;
    });
    expect(windows).toBeGreaterThanOrEqual(1);
  });

  it('house windows glow at night and dim at noon via the day cycle', () => {
    const scene = new Scene();
    applyFog(scene, 'haze');
    const house = createHouse({ seed: 7 });
    const cycle = createDayCycle({
      sky: createSky(),
      rig: createLightingRig('day'),
      scene,
      lamps: [house],
      timeOfDay: 0.5,
    });
    const window = (() => {
      let found: MeshStandardMaterial | undefined;
      house.object.traverse((child) => {
        const material = (child as Mesh).material as MeshStandardMaterial | undefined;
        if (!found && material?.emissive) found = material;
      });
      return found!;
    })();
    const noon = window.emissiveIntensity;
    cycle.set(0.95);
    expect(window.emissiveIntensity).toBeGreaterThan(noon * 2);
  });

  it('ruins differ between seeds', () => {
    expect(meshCount(createRuin({ seed: 1 }).object)).not.toBe(
      meshCount(createRuin({ seed: 9 }).object)
    );
  });
});

describe('createVillage', () => {
  const surface = (x: number, z: number): number => fractalNoise2(x / 30, z / 30, 5, 3) * 4;

  it('is deterministic and places the requested structures', () => {
    const a = createVillage({ seed: 11, radius: 10, houses: 5, surface });
    const b = createVillage({ seed: 11, radius: 10, houses: 5, surface });
    expect(a.props.length).toBe(b.props.length);
    expect(a.props.map((p) => p.object.position.x)).toEqual(b.props.map((p) => p.object.position.x));

    const names = a.props.map((p) => p.object.name);
    expect(names.filter((n) => n === 'house')).toHaveLength(5);
    expect(names).toContain('well');
    expect(names).toContain('tower');
    expect(names).toContain('ruin');
    expect(names).toContain('lamp');
  });

  it('seats every prop on the surface, houses inside the ring', () => {
    const village = createVillage({ seed: 3, radius: 12, houses: 4, surface, ruin: false });
    for (const prop of village.props) {
      const { x, y, z } = prop.object.position;
      expect(y).toBeCloseTo(surface(x, z), 5);
      if (prop.object.name === 'house') {
        expect(Math.hypot(x, z)).toBeLessThanOrEqual(12 * 1.1 + 0.001);
      }
    }
  });

  it('houses face the well', () => {
    const village = createVillage({ seed: 6, radius: 10, houses: 4, surface: 0 });
    for (const prop of village.props) {
      if (prop.object.name !== 'house') continue;
      const { x, z } = prop.object.position;
      const expected = Math.atan2(-x, -z);
      expect(prop.object.rotation.y).toBeCloseTo(expected, 5);
    }
  });

  it('publishes the gameplay handshake: obstacles, keepOut, lamps', () => {
    const village = createVillage({ seed: 4, center: { x: 8, z: -3 }, radius: 10, surface });
    expect(village.obstacles.length).toBe(village.props.length);
    for (const obstacle of village.obstacles) expect(obstacle.radius).toBeGreaterThan(0);
    expect(village.keepOut).toEqual([{ center: { x: 8, z: -3 }, radius: 15 }]);
    // lamps list = houses (windows) + street lamps, ready for createDayCycle.
    expect(village.lamps.length).toBeGreaterThan(5);
    const lit: PointLight[] = [];
    for (const lamp of village.lamps) {
      lamp.object.traverse((child) => {
        if (child instanceof PointLight) lit.push(child);
      });
    }
    expect(lit).toHaveLength(3); // default light budget
  });

  it('respects the mask when siting buildings', () => {
    const village = createVillage({
      seed: 9,
      radius: 10,
      houses: 5,
      surface: 0,
      mask: (x) => x < 100, // never vetoes — just must not throw or loop
    });
    expect(village.props.length).toBeGreaterThan(6);
  });
});
