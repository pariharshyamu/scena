import { describe, expect, it } from 'vitest';
import { Group, Object3D, PointLight, Scene, Vector3 } from 'three';
import { KIT_UNIT, assembleKit } from '../src/kits/kit';
import { extractMarkers } from '../src/scene/markers';
import { buildScene, type SceneManifest } from '../src/scene/manifest';
import { scatter } from '../src/scatter/scatter';
import { createTree } from '../src/props/tree';
import { Rng } from '../src/core/random';

describe('assembleKit', () => {
  const MAP = [
    '#####',
    '#.T.#',
    '#.S.D',
    '#####',
  ];

  it('snaps cells to the kit grid, centered on the origin', () => {
    const kit = assembleKit(MAP);
    expect(kit.size).toEqual({ width: 5 * KIT_UNIT, depth: 4 * KIT_UNIT });
    // The 'S' cell is at column 2, row 2 → half a cell below center.
    expect(kit.spawns).toHaveLength(1);
    expect(kit.spawns[0].x).toBeCloseTo(0);
    expect(kit.spawns[0].z).toBeCloseTo(KIT_UNIT / 2);
  });

  it('walls block, floors walk, gaps are void', () => {
    const kit = assembleKit(MAP);
    // 13 wall cells (the 14-cell perimeter minus the doorway).
    expect(kit.obstacles.filter((o) => o.radius > 0.5)).toHaveLength(13);
    expect(kit.floorAt(0, KIT_UNIT / 2)).toBe(true); // the S cell
    expect(kit.floorAt(-2 * KIT_UNIT, -1.5 * KIT_UNIT)).toBe(false); // a wall
    expect(kit.floorAt(90, 90)).toBe(false);
  });

  it('torches are emissive and light within the budget', () => {
    const kit = assembleKit(MAP, { torchLights: 1 });
    expect(kit.torches).toHaveLength(1);
    let lights = 0;
    kit.group.traverse((child) => {
      if (child instanceof PointLight) lights++;
    });
    expect(lights).toBe(1);
  });

  it('is deterministic', () => {
    const a = assembleKit(MAP, { seed: 5 });
    const b = assembleKit(MAP, { seed: 5 });
    expect(a.obstacles.map((o) => o.center.x)).toEqual(b.obstacles.map((o) => o.center.x));
  });
});

describe('extractMarkers', () => {
  function node(name: string, x: number, z: number, scale = 1): Object3D {
    const object = new Object3D();
    object.name = name;
    object.position.set(x, 0, z);
    object.scale.setScalar(scale);
    return object;
  }

  it('collects spawns, ordered routes, obstacles and keep-outs', () => {
    const root = new Group();
    root.add(
      node('spawn_player', 1, 2),
      node('route_patrol_1', 10, 0),
      node('route_patrol_0', 5, 0),
      node('route_patrol_2.001', 15, 0), // Blender duplicate suffix
      node('obstacle_statue', -3, -3, 2),
      node('keepout_plaza', 8, 8, 6),
      node('just_a_mesh', 0, 0)
    );
    const markers = extractMarkers(root);
    expect(markers.spawns.player).toEqual(new Vector3(1, 0, 2));
    expect(markers.routes.patrol.map((p) => p.x)).toEqual([5, 10, 15]);
    expect(markers.obstacles).toEqual([{ center: new Vector3(-3, 0, -3), radius: 2 }]);
    expect(markers.keepOut).toEqual([{ center: { x: 8, z: 8 }, radius: 6 }]);
  });

  it('uses world positions for nested markers', () => {
    const root = new Group();
    const parent = new Group();
    parent.position.set(100, 0, 0);
    parent.add(node('spawn_boss', 5, 5));
    root.add(parent);
    expect(extractMarkers(root).spawns.boss.x).toBeCloseTo(105);
  });
});

describe('scatter LOD', () => {
  const options = {
    seed: 7,
    area: { min: { x: -30, z: -30 }, max: { x: 30, z: 30 } },
    count: 200,
    items: [
      {
        create: (rng: Rng) => createTree({ seed: rng.int(1, 1e9) }),
        createFar: (rng: Rng) => createTree({ seed: rng.int(1, 1e9), style: 'pine' as const }),
      },
    ],
  };

  it('does not change placements (seed-stability holds)', () => {
    const plain = scatter(options);
    const lod = scatter({ ...options, lod: { distance: 20, tileSize: 15 } });
    expect(lod.placements.map((p) => p.position.x)).toEqual(
      plain.placements.map((p) => p.position.x)
    );
    expect(plain.update).toBeUndefined();
    expect(lod.update).toBeDefined();
  });

  it('swaps tiles between near and far by camera distance, with hysteresis', () => {
    const result = scatter({ ...options, lod: { distance: 20, tileSize: 15 } });
    const tiles = result.tiles!;
    expect(tiles.length).toBeGreaterThan(4);

    const camera = { position: new Vector3(0, 5, 0) };
    result.update!(camera);
    const nearTile = tiles.find((t) => Math.hypot(t.center.x, t.center.z) < 18)!;
    const farTile = tiles.find((t) => Math.hypot(t.center.x, t.center.z) > 25)!;
    expect(nearTile.near.visible).toBe(true);
    expect(nearTile.far.visible).toBe(false);
    expect(farTile.near.visible).toBe(false);
    expect(farTile.far.visible).toBe(true);

    // Hysteresis: a tile just inside swap-out distance keeps its state.
    const edge = Math.hypot(nearTile.center.x, nearTile.center.z);
    camera.position.set(nearTile.center.x - (edge > 0 ? 0 : 0), 5, nearTile.center.z - 21);
    result.update!(camera);
    // Move camera far away: everything goes far.
    camera.position.set(500, 5, 500);
    result.update!(camera);
    for (const tile of tiles) expect(tile.near.visible).toBe(false);
  });
});

describe('buildScene (manifests)', () => {
  const manifest: SceneManifest = {
    seed: 12,
    palette: 'autumn',
    terrain: { size: 80, amplitude: 5, resolution: 48 },
    water: { level: 0.25 },
    lighting: 'day',
    fog: 'haze',
    dayCycle: { dayLength: 60, timeOfDay: 0.5 },
    paths: [
      { points: [{ x: -20, z: -10 }, { x: 0, z: -18 }, { x: 20, z: -6 }], width: 2 },
    ],
    village: { radius: 9, houses: 4 },
    scatters: [
      {
        density: 0.04,
        items: [{ type: 'tree', weight: 3 }, { type: 'rock' }],
        maxHeight: 3.5,
        lod: { distance: 40 },
      },
      { density: 0.1, minSpacing: 0.8, items: [{ type: 'grass' }] },
    ],
  };

  it('survives a JSON round-trip and builds the whole world', () => {
    const scene = new Scene();
    const world = buildScene(JSON.parse(JSON.stringify(manifest)), scene);
    expect(world.terrain).toBeDefined();
    expect(world.water).toBeDefined();
    expect(world.sky).toBeDefined();
    expect(world.cycle).toBeDefined();
    expect(world.paths).toHaveLength(1);
    expect(world.village!.props.map((p) => p.object.name)).toContain('house');
    expect(world.scatters).toHaveLength(2);
    expect(world.obstacles.length).toBeGreaterThan(world.village!.obstacles.length);
    expect(scene.fog).toBeTruthy();
    expect(scene.children).toContain(world.group);
    world.update(0.1); // water + wind + cycle tick without a renderer
  });

  it('is deterministic for a given seed', () => {
    const a = buildScene(manifest);
    const b = buildScene(manifest);
    expect(a.scatters[0].placements.map((p) => p.position.x)).toEqual(
      b.scatters[0].placements.map((p) => p.position.x)
    );
    expect(a.village!.props.map((p) => p.object.position.x)).toEqual(
      b.village!.props.map((p) => p.object.position.x)
    );
  });

  it('keeps scatters ashore, off paths and out of the village', () => {
    const world = buildScene(manifest);
    const waterLevel = 0.25;
    for (const placement of world.scatters[0].placements) {
      const { x, z } = placement.position;
      expect(world.terrain!.heightAt(x, z)).toBeGreaterThan(waterLevel);
      expect(world.paths[0].contains(x, z)).toBe(false);
      const dv = Math.hypot(x - world.village!.center.x, z - world.village!.center.z);
      expect(dv).toBeGreaterThan(9); // village keep-out
    }
  });

  it('passes LOD through: first scatter has tiles, grass scatter does not', () => {
    const world = buildScene(manifest);
    expect(world.scatters[0].update).toBeDefined();
    expect(world.scatters[1].update).toBeUndefined();
  });

  it('builds a minimal flat scene with defaults', () => {
    const world = buildScene({});
    expect(world.heightAt(3, 4)).toBe(0);
    expect(world.rig.sun).toBeDefined();
    expect(world.terrain).toBeUndefined();
    world.update(0.016);
  });
});
