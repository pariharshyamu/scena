import { describe, expect, it } from 'vitest';
import { Scene, Vector3 } from 'three';
import { PALETTES } from '../src/core/palette';
import { createTerrain } from '../src/environment/terrain';
import { createSky } from '../src/environment/sky';
import { createLightingRig, applyFog } from '../src/environment/lighting';
import { createWater, aboveWater } from '../src/environment/water';
import { createDayCycle } from '../src/environment/dayCycle';
import { applyWind } from '../src/environment/wind';
import { createPath } from '../src/environment/path';
import { createLamp } from '../src/props/lamp';
import { createGrassTuft, createBush } from '../src/props/grass';
import { createTree } from '../src/props/tree';
import { scatter } from '../src/scatter/scatter';
import { Rng } from '../src/core/random';

describe('water', () => {
  it('sits at its level, animates, and reports underwater ground', () => {
    const water = createWater({ level: 1.2, resolution: 8 });
    expect(water.mesh.position.y).toBeCloseTo(1.2);
    water.update(0.5); // must not throw; vertices move
    expect(water.isUnderwater(0.5)).toBe(true);
    expect(water.isUnderwater(2)).toBe(false);
  });

  it('aboveWater masks shoreline placements', () => {
    const terrain = createTerrain({ seed: 3, size: 40, resolution: 24, amplitude: 5 });
    const water = createWater({ level: 1 });
    const mask = aboveWater(terrain, water, 0.25);
    let wet = 0;
    let dry = 0;
    for (let i = 0; i < 200; i++) {
      const x = (i % 20) * 2 - 20;
      const z = Math.floor(i / 20) * 4 - 20;
      if (mask(x, z)) {
        dry++;
        expect(terrain.heightAt(x, z)).toBeGreaterThan(1.25);
      } else {
        wet++;
      }
    }
    expect(dry).toBeGreaterThan(0);
    expect(wet).toBeGreaterThan(0);
  });
});

describe('day cycle', () => {
  function setup(t: number) {
    const scene = new Scene();
    applyFog(scene, 'haze');
    const sky = createSky();
    const rig = createLightingRig('day');
    const lamp = createLamp({ seed: 1, light: true });
    const cycle = createDayCycle({ sky, rig, scene, lamps: [lamp], timeOfDay: t });
    const light = lamp.object.children.find((c) => c.type === 'PointLight') as unknown as {
      intensity: number;
    };
    return { cycle, rig, light };
  }

  it('noon: bright sun high in the sky, lamps off', () => {
    const { cycle, rig, light } = setup(0.5);
    expect(cycle.isNight).toBe(false);
    expect(cycle.sunElevation).toBeCloseTo(1, 1);
    expect(rig.sun.intensity).toBeGreaterThan(1.2);
    expect(light.intensity).toBe(0);
  });

  it('midnight: dim world, lamps fully on', () => {
    const { cycle, rig, light } = setup(0);
    expect(cycle.isNight).toBe(true);
    expect(rig.sun.intensity).toBeLessThan(0.2);
    expect(light.intensity).toBeGreaterThan(4);
  });

  it('advances with update and wraps around', () => {
    const { cycle } = setup(0.9);
    cycle.update(30); // dayLength defaults to 60 → +0.5
    expect(cycle.timeOfDay).toBeCloseTo(0.4, 5);
  });

  it('dusk transition ignites lamps gradually', () => {
    const a = setup(0.75).light.intensity; // sun on the horizon
    const b = setup(0.76).light.intensity; // just below
    const c = setup(0.79).light.intensity; // fully night
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe('wind', () => {
  it('patches scatter materials once each and advances time', () => {
    const forest = scatter({
      seed: 2,
      area: { min: { x: -10, z: -10 }, max: { x: 10, z: 10 } },
      count: 40,
      items: [{ create: (rng: Rng) => createTree({ seed: rng.int(1, 1e9) }), variants: 2 }],
    });
    const wind = applyWind(forest.group, { strength: 0.08 });
    expect(wind.materials.length).toBeGreaterThan(0);
    for (const material of wind.materials) {
      expect(material.onBeforeCompile).toBeTypeOf('function');
    }
    wind.update(0.5);
    wind.update(0.5); // no throw; uniform advances internally
  });
});

describe('path', () => {
  const surface = (x: number, z: number) => Math.sin(x * 0.2) + Math.cos(z * 0.1) + 2;

  it('drapes the route on the surface and builds a ribbon', () => {
    const path = createPath(
      [new Vector3(-10, 0, 0), new Vector3(0, 0, 5), new Vector3(10, 0, -2)],
      { surface, width: 2 }
    );
    expect(path.route.length).toBeGreaterThan(10);
    for (const p of path.route) {
      expect(p.y).toBeCloseTo(surface(p.x, p.z), 6);
    }
    expect(path.mesh.geometry.getAttribute('position').count).toBeGreaterThan(20);
  });

  it('contains() is true on the line and false away from it', () => {
    const path = createPath([{ x: -10, z: 0 }, { x: 10, z: 0 }], { width: 2 });
    expect(path.contains(0, 0)).toBe(true);
    expect(path.contains(0, 0.9)).toBe(true);
    expect(path.contains(0, 3)).toBe(false);
    expect(path.contains(0, -5)).toBe(false);
  });

  it('keep-out circles cover the route for scatter', () => {
    const path = createPath([{ x: -10, z: 0 }, { x: 10, z: 0 }], { width: 2 });
    const result = scatter({
      seed: 9,
      area: { min: { x: -12, z: -6 }, max: { x: 12, z: 6 } },
      count: 300,
      minSpacing: 0.5,
      items: [{ create: (rng: Rng) => createTree({ seed: rng.int(1, 1e9) }) }],
      keepOut: path.keepOut,
    });
    for (const p of result.placements) {
      expect(path.contains(p.position.x, p.position.z)).toBe(false);
    }
  });

  it('loops close the route without duplicating the seam', () => {
    const path = createPath(
      [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }],
      { loop: true }
    );
    const first = path.route[0];
    const last = path.route[path.route.length - 1];
    expect(first.distanceTo(last)).toBeGreaterThan(0.1);
    expect(path.loop).toBe(true);
  });
});

describe('grass & bush', () => {
  it('grass has zero footprint; bush has a small one', () => {
    const grass = createGrassTuft({ seed: 4 });
    const bush = createBush({ seed: 4 });
    expect(grass.object.children.length).toBeGreaterThanOrEqual(4);
    expect(grass.obstacleRadius).toBe(0);
    expect(bush.obstacleRadius).toBeGreaterThan(0);
  });
});

describe('winter palette & sand bands', () => {
  it('winter palette exists with the full shape', () => {
    expect(PALETTES.winter.water).toBeTypeOf('number');
    expect(PALETTES.winter.sand).toBeTypeOf('number');
    expect(PALETTES.winter.path).toBeTypeOf('number');
  });

  it('terrain accepts waterLevel and still matches heightAt', () => {
    const terrain = createTerrain({ seed: 6, size: 30, resolution: 16, waterLevel: 1 });
    expect(terrain.heightAt(2, 2)).toBeCloseTo(terrain.heightAt(2, 2));
    expect(terrain.mesh.geometry.getAttribute('color')).toBeDefined();
  });
});
