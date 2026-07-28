import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';

/**
 * A motion trail — the ribbon a fast thing leaves behind.
 *
 * Feed it a position every frame; it keeps the recent past as a ribbon
 * that tapers and fades toward the tail. The fade is real per-vertex
 * alpha: the colour attribute carries four components, which three treats
 * as RGBA when the material opts into vertex colours — no custom shader.
 *
 * The ribbon is laid perpendicular to the motion within the plane
 * orthogonal to `up`. With the default Y-up that is exactly right for
 * vehicles, skids and running characters; for a sword swing, pass the
 * swing plane's normal as `up`.
 *
 * ```ts
 * const trail = createTrail({ color: 0x8fd0ff, width: 0.3 });
 * scene.add(trail.mesh);
 * // per frame:
 * trail.push(kart.position);
 * trail.update(dt);
 * ```
 */

export interface TrailOptions {
  /** Maximum points kept. Default 48. */
  length?: number;
  /** Ribbon width at the head, in metres — it tapers to zero at the tail. Default 0.25. */
  width?: number;
  /** Seconds a point survives. Default 0.7. */
  life?: number;
  color?: number;
  /** Head opacity. Default 0.7. */
  opacity?: number;
  /** Normal of the ribbon plane. Default +Y (a ground trail). */
  up?: Vector3;
  /** Points closer than this to the last are ignored (metres). Default 0.05. */
  minDistance?: number;
}

export interface Trail {
  mesh: Mesh;
  /** Record the emitter's position this frame. */
  push(point: Vector3): void;
  /** Age the ribbon; drop what has faded. */
  update(dt: number): void;
  /** Forget everything — teleports should not draw a streak across the map. */
  clear(): void;
  /** Live point count, for tests and debug readouts. */
  readonly count: number;
}

interface TrailPoint {
  pos: Vector3;
  age: number;
}

export function createTrail(options: TrailOptions = {}): Trail {
  const length = Math.max(4, options.length ?? 48);
  const width = options.width ?? 0.25;
  const life = options.life ?? 0.7;
  const opacity = options.opacity ?? 0.7;
  const up = (options.up ?? new Vector3(0, 1, 0)).clone().normalize();
  const minDistance = options.minDistance ?? 0.05;
  const color = new Color(options.color ?? 0xffffff);

  const points: TrailPoint[] = [];

  // Two vertices per point, preallocated for the maximum; drawRange does the
  // rest. Rebuilding attributes per frame would thrash the GC for nothing.
  const positions = new Float32Array(length * 2 * 3);
  const colors = new Float32Array(length * 2 * 4);
  const indices = new Uint16Array((length - 1) * 6);
  for (let i = 0; i < length - 1; i++) {
    const a = i * 2;
    indices.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], i * 6);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 4));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);

  const material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false; // the ribbon goes where the emitter went
  mesh.name = 'trail';

  const dir = new Vector3();
  const side = new Vector3();
  const lastSide = new Vector3(1, 0, 0);

  const rebuild = (): void => {
    const n = points.length;
    if (n < 2) {
      geometry.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const point = points[i];
      // Direction through this point: neighbour to neighbour, so corners
      // get the average of the segments meeting there.
      const ahead = points[Math.max(i - 1, 0)].pos;
      const behind = points[Math.min(i + 1, n - 1)].pos;
      dir.subVectors(ahead, behind);
      side.crossVectors(up, dir);
      // A stall (zero-length segment) keeps the previous side vector: a
      // ribbon must never collapse to NaN because the emitter stood still.
      if (side.lengthSq() < 1e-10) side.copy(lastSide);
      else side.normalize();
      lastSide.copy(side);

      const fade = Math.max(1 - point.age / life, 0);
      const taper = 1 - i / (n - 1);
      const w = (width / 2) * fade * (0.25 + 0.75 * taper);
      const v = i * 6;
      positions[v] = point.pos.x + side.x * w;
      positions[v + 1] = point.pos.y + side.y * w;
      positions[v + 2] = point.pos.z + side.z * w;
      positions[v + 3] = point.pos.x - side.x * w;
      positions[v + 4] = point.pos.y - side.y * w;
      positions[v + 5] = point.pos.z - side.z * w;
      const c = i * 8;
      const alpha = opacity * fade * fade;
      for (const offset of [0, 4]) {
        colors[c + offset] = color.r;
        colors[c + offset + 1] = color.g;
        colors[c + offset + 2] = color.b;
        colors[c + offset + 3] = alpha;
      }
    }
    geometry.setDrawRange(0, (n - 1) * 6);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  };

  return {
    mesh,
    push(point: Vector3): void {
      const head = points[0];
      if (head && head.pos.distanceToSquared(point) < minDistance * minDistance) return;
      const recycled = points.length >= length ? (points.pop() as TrailPoint) : null;
      const entry = recycled ?? { pos: new Vector3(), age: 0 };
      entry.pos.copy(point);
      entry.age = 0;
      points.unshift(entry);
    },
    update(dt: number): void {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      for (const point of points) point.age += step;
      while (points.length && points[points.length - 1].age >= life) points.pop();
      rebuild();
    },
    clear(): void {
      points.length = 0;
      geometry.setDrawRange(0, 0);
    },
    get count() {
      return points.length;
    },
  };
}
