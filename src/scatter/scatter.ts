import {
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
} from 'three';
import { Rng, valueNoise2 } from '../core/random';
import type { Obstacle, Prop } from '../core/types';

export interface ScatterItem {
  /** Prop factory, called once per visual variant with a seeded Rng. */
  create(rng: Rng): Prop;
  /** Relative frequency among items. Default 1. */
  weight?: number;
  /** Distinct variants generated per item (visual variety). Default 4. */
  variants?: number;
  /** Per-instance uniform scale range. Default [0.8, 1.25]. */
  scale?: [number, number];
}

export interface ScatterOptions {
  seed?: number;
  items: ScatterItem[];
  /** Placement region in the XZ plane. */
  area: { min: { x: number; z: number }; max: { x: number; z: number } };
  /** Ground height lookup; a number means flat ground. Default 0. */
  surface?: number | ((x: number, z: number) => number);
  /** Expected instances per square unit (thinned by density noise). */
  density?: number;
  /** Or an exact target count (before masks/spacing rejections). */
  count?: number;
  /** Veto function: return false to reject a candidate point. */
  mask?: (x: number, z: number, y: number) => boolean;
  /** Minimum distance between any two placements. Default 1.2. */
  minSpacing?: number;
  /** World-space circles to keep clear (paths, spawns, buildings). */
  keepOut?: Obstacle[] | { center: { x: number; z: number }; radius: number }[];
  /** Density-noise feature size in world units. Default 18. */
  clumpScale?: number;
}

export interface Placement {
  position: Vector3;
  rotationY: number;
  scale: number;
  itemIndex: number;
}

export interface ScatterResult {
  /** One InstancedMesh per template part — a handful of draw calls total. */
  group: Group;
  placements: Placement[];
  /** World-space steering obstacles for everything with a footprint. */
  obstacles: Obstacle[];
  count: number;
}

/**
 * Populate an area with seeded, instanced props: "empty plane → forest"
 * in one call. Placement uses density noise for natural clumping, a
 * spatial hash for minimum spacing, and masks/keep-out circles for
 * exclusion. Rendering merges every placement into InstancedMeshes — a
 * few draw calls for thousands of props.
 *
 * ```ts
 * const forest = scatter({
 *   seed: 7,
 *   area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
 *   surface: terrain.heightAt,
 *   density: 0.04,
 *   items: [
 *     { create: (rng) => createTree({ seed: rng.int(1, 1e9) }), weight: 3 },
 *     { create: (rng) => createRock({ seed: rng.int(1, 1e9) }) },
 *   ],
 *   mask: (x, z, y) => y > 0.5 && y < 5,        // between shore and peaks
 *   keepOut: [{ center: village, radius: 12 }],
 * });
 * scene.add(forest.group);
 * agent.addBehavior(new ObstacleAvoidance(() => forest.obstacles));
 * ```
 */
export function scatter(options: ScatterOptions): ScatterResult {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const { area } = options;
  const width = area.max.x - area.min.x;
  const depth = area.max.z - area.min.z;
  const surface = options.surface ?? 0;
  const heightAt =
    typeof surface === 'number' ? () => surface : (x: number, z: number) => surface(x, z);
  const minSpacing = options.minSpacing ?? 1.2;
  const clumpScale = options.clumpScale ?? 18;
  const attempts = options.count ?? Math.round(width * depth * (options.density ?? 0.03));

  const keepOut = (options.keepOut ?? []).map((k) => ({
    x: k.center.x,
    z: 'z' in k.center ? k.center.z : (k.center as { z: number }).z,
    radius: k.radius,
  }));

  // Weighted item choice.
  const weights = options.items.map((i) => i.weight ?? 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const pickItem = (): number => {
    let r = rng.next() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  };

  // Spatial hash for min-spacing rejection.
  const cell = Math.max(minSpacing, 0.001);
  const occupied = new Map<string, Array<{ x: number; z: number }>>();
  const tooClose = (x: number, z: number): boolean => {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = occupied.get(`${cx + dx},${cz + dz}`);
        if (!bucket) continue;
        for (const p of bucket) {
          if ((p.x - x) ** 2 + (p.z - z) ** 2 < minSpacing * minSpacing) return true;
        }
      }
    }
    return false;
  };

  const placements: Placement[] = [];
  for (let i = 0; i < attempts; i++) {
    const x = rng.range(area.min.x, area.max.x);
    const z = rng.range(area.min.z, area.max.z);
    // Density noise: clumps and clearings instead of uniform confetti.
    if (valueNoise2(x / clumpScale, z / clumpScale, seed + 77) < rng.range(0.15, 0.55)) continue;
    if (keepOut.some((k) => (k.x - x) ** 2 + (k.z - z) ** 2 < k.radius * k.radius)) continue;
    if (tooClose(x, z)) continue;
    const y = heightAt(x, z);
    if (options.mask && !options.mask(x, z, y)) continue;

    const itemIndex = pickItem();
    const [minScale, maxScale] = options.items[itemIndex].scale ?? [0.8, 1.25];
    placements.push({
      position: new Vector3(x, y, z),
      rotationY: rng.range(0, Math.PI * 2),
      scale: rng.range(minScale, maxScale),
      itemIndex,
    });
    const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    let bucket = occupied.get(key);
    if (!bucket) occupied.set(key, (bucket = []));
    bucket.push({ x, z });
  }

  // Build variants per item, bucket placements per variant, then emit one
  // InstancedMesh per (variant, mesh part).
  const group = new Group();
  group.name = 'scatter';
  const obstacles: Obstacle[] = [];
  const placementMatrix = new Matrix4();
  const composed = new Matrix4();
  const quaternion = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const scaleVector = new Vector3();

  options.items.forEach((item, itemIndex) => {
    const variantCount = item.variants ?? 4;
    const variants: Prop[] = [];
    for (let v = 0; v < variantCount; v++) variants.push(item.create(rng.fork()));

    const byVariant: Placement[][] = variants.map(() => []);
    for (const placement of placements) {
      if (placement.itemIndex !== itemIndex) continue;
      // Deterministic variant choice from position.
      const v = Math.abs(Math.floor(placement.position.x * 31 + placement.position.z * 17)) % variantCount;
      byVariant[v].push(placement);
    }

    variants.forEach((variant, v) => {
      const list = byVariant[v];
      if (list.length === 0) return;
      variant.object.updateMatrixWorld(true);
      variant.object.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        const instanced = new InstancedMesh(child.geometry, child.material, list.length);
        instanced.instanceMatrix.setUsage(DynamicDrawUsage);
        list.forEach((placement, index) => {
          quaternion.setFromAxisAngle(up, placement.rotationY);
          scaleVector.setScalar(placement.scale);
          placementMatrix.compose(placement.position, quaternion, scaleVector);
          composed.multiplyMatrices(placementMatrix, child.matrixWorld);
          instanced.setMatrixAt(index, composed);
        });
        instanced.instanceMatrix.needsUpdate = true;
        group.add(instanced);
      });
      if (variant.obstacleRadius > 0) {
        for (const placement of list) {
          obstacles.push({
            center: placement.position.clone(),
            radius: variant.obstacleRadius * placement.scale,
          });
        }
      }
    });
  });

  return { group, placements, obstacles, count: placements.length };
}
