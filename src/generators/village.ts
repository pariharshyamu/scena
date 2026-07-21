import { Group } from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { collectObstacles, type Obstacle, type Prop } from '../core/types';
import { createHouse, createRuin, createTower, createWell } from '../props/building';
import { createCrate } from '../props/crate';
import { createLamp } from '../props/lamp';

export interface VillageOptions {
  seed?: number;
  /** Village center in the XZ plane. Default origin. */
  center?: { x: number; z: number };
  /** Ring radius the houses settle on. Default 12. */
  radius?: number;
  /** House count. Default 5. */
  houses?: number;
  /** Ground height lookup; a number means flat ground. Default 0. */
  surface?: number | ((x: number, z: number) => number);
  /** Veto candidate spots (e.g. water, roads). Return false to reject. */
  mask?: (x: number, z: number, y: number) => boolean;
  /** Add real PointLights to this many street lamps. Default 3. */
  lampLights?: number;
  /** Add a watchtower at the edge. Default true. */
  tower?: boolean;
  /** Add a ruin outside the ring. Default true. */
  ruin?: boolean;
  palette?: Palette;
}

export interface Village {
  group: Group;
  /** Every placed prop (houses, well, lamps, crates, tower, ruin). */
  props: Prop[];
  /** World-space steering obstacles — feed GAMA's ObstacleAvoidance. */
  obstacles: Obstacle[];
  /**
   * Props with something to ignite at night (street lamps AND house
   * windows). Pass straight to `createDayCycle({ lamps })`.
   */
  lamps: Prop[];
  /** One clearing circle covering the village — feed `scatter`'s keepOut. */
  keepOut: Array<{ center: { x: number; z: number }; radius: number }>;
  center: { x: number; z: number };
}

/**
 * A seeded hamlet: a well at the center, houses ringed around it facing
 * inward, street lamps between them, crates by the doors, a watchtower on
 * the edge and a ruin beyond. Everything is placed on the given surface
 * (steep or masked spots are rejected and re-rolled), and the result
 * carries the full gameplay handshake: `obstacles` for steering,
 * `keepOut` for scatter, and `lamps` for the day-night cycle — windows
 * and lamps ignite together at dusk.
 *
 * ```ts
 * const village = createVillage({ seed: 5, radius: 10, surface: terrain.heightAt, palette });
 * scene.add(village.group);
 * const cycle = createDayCycle({ sky, rig, scene, lamps: village.lamps, palette });
 * const forest = scatter({ ..., keepOut: village.keepOut });
 * ```
 */
export function createVillage(options: VillageOptions = {}): Village {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const center = options.center ?? { x: 0, z: 0 };
  const radius = options.radius ?? 12;
  const houseCount = options.houses ?? 5;
  const surface = options.surface ?? 0;
  const heightAt =
    typeof surface === 'number' ? () => surface : (x: number, z: number) => surface(x, z);

  const group = new Group();
  group.name = 'village';
  const props: Prop[] = [];
  const lamps: Prop[] = [];

  const place = (prop: Prop, x: number, z: number, rotY: number): Prop => {
    prop.object.position.set(x, heightAt(x, z), z);
    prop.object.rotation.y = rotY;
    group.add(prop.object);
    props.push(prop);
    return prop;
  };

  /**
   * Find a buildable spot near (angle, distance): reasonably level across
   * the footprint and not vetoed by the mask. Re-rolls up to 10 times,
   * then falls back to the last candidate so layout never dead-ends.
   */
  const findSpot = (
    angle: number,
    distance: number,
    footprint: number
  ): { x: number; z: number } => {
    let x = center.x;
    let z = center.z;
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = angle + rng.range(-0.25, 0.25) * (attempt > 0 ? 1 : 0.3);
      const d = distance * rng.range(attempt > 0 ? 0.8 : 0.95, 1.1);
      x = center.x + Math.cos(a) * d;
      z = center.z + Math.sin(a) * d;
      const y = heightAt(x, z);
      if (options.mask && !options.mask(x, z, y)) continue;
      let min = y;
      let max = y;
      for (const [dx, dz] of [[footprint, 0], [-footprint, 0], [0, footprint], [0, -footprint]]) {
        const h = heightAt(x + dx, z + dz);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
      if (max - min <= Math.max(0.9, footprint * 0.35)) break;
    }
    return { x, z };
  };

  // The well anchors the plaza.
  const well = createWell({ seed: rng.int(1, 1e9), palette });
  place(well, center.x, center.z, rng.range(0, Math.PI * 2));

  // Houses on the ring, facing the well.
  let lightBudget = options.lampLights ?? 3;
  for (let i = 0; i < houseCount; i++) {
    const angle = (i / houseCount) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const house = createHouse({ seed: rng.int(1, 1e9), palette });
    const spot = findSpot(angle, radius * rng.range(0.7, 0.95), house.obstacleRadius);
    const facing = Math.atan2(center.x - spot.x, center.z - spot.z);
    place(house, spot.x, spot.z, facing);
    lamps.push(house);

    // A crate by most doors, a lamp partway toward the plaza for some.
    if (rng.next() < 0.7) {
      const crateAngle = angle + rng.range(-0.5, 0.5);
      const crateDistance = Math.hypot(spot.x - center.x, spot.z - center.z) - house.obstacleRadius - 0.7;
      place(
        createCrate({ seed: rng.int(1, 1e9), size: rng.range(0.7, 1), palette }),
        center.x + Math.cos(crateAngle) * crateDistance,
        center.z + Math.sin(crateAngle) * crateDistance,
        rng.range(0, Math.PI)
      );
    }
    if (i % 2 === 0) {
      const lampDistance = Math.hypot(spot.x - center.x, spot.z - center.z) * 0.55;
      const lamp = createLamp({ seed: rng.int(1, 1e9), light: lightBudget > 0, palette });
      lightBudget--;
      place(lamp, center.x + Math.cos(angle) * lampDistance, center.z + Math.sin(angle) * lampDistance, 0);
      lamps.push(lamp);
    }
  }

  if (options.tower ?? true) {
    const angle = rng.range(0, Math.PI * 2);
    const tower = createTower({ seed: rng.int(1, 1e9), palette });
    const spot = findSpot(angle, radius * 1.05, tower.obstacleRadius);
    place(tower, spot.x, spot.z, rng.range(0, Math.PI * 2));
  }
  if (options.ruin ?? true) {
    const angle = rng.range(0, Math.PI * 2);
    const ruin = createRuin({ seed: rng.int(1, 1e9), palette });
    const spot = findSpot(angle, radius * 1.35, ruin.obstacleRadius);
    place(ruin, spot.x, spot.z, rng.range(0, Math.PI * 2));
  }

  return {
    group,
    props,
    obstacles: collectObstacles(props),
    lamps,
    keepOut: [{ center: { ...center }, radius: radius * 1.5 }],
    center,
  };
}
