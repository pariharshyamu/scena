import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';

export interface PathOptions {
  /** Ribbon width. Default 1.8. */
  width?: number;
  /** Ground height lookup; a number means flat ground. Default 0. */
  surface?: number | ((x: number, z: number) => number);
  /** Samples per world unit of path length. Default 1. */
  samplesPerUnit?: number;
  /** Close the path into a loop. Default false. */
  loop?: boolean;
  /** Extra clearance added to scatter keep-out circles. Default 0.6. */
  keepOutMargin?: number;
  palette?: Palette;
}

export interface WorldPath {
  mesh: Mesh;
  /** Smoothed centerline draped on the surface — feed straight into a
   *  GAMA `Path` for patrols, or use as camera dolly points. */
  route: Vector3[];
  /** Keep-out circles for `scatter()` so nothing grows on the road. */
  keepOut: Array<{ center: { x: number; z: number }; radius: number }>;
  /** Is (x, z) on the path surface? (e.g. to exclude grass) */
  contains(x: number, z: number): boolean;
  loop: boolean;
}

/**
 * A dirt path: a Catmull-Rom-smoothed ribbon draped over the surface.
 * One authored polyline feeds three things at once — the visual ribbon,
 * scatter keep-out, and a patrol route for agents. That's the SCENA
 * handshake applied to level design.
 *
 * ```ts
 * const road = createPath([a, b, c], { surface: terrain.heightAt, loop: true });
 * scene.add(road.mesh);
 * scatter({ ..., keepOut: road.keepOut });
 * agent.addBehavior(new FollowPath(new Path(road.route, road.loop), 1.5));
 * ```
 */
export function createPath(
  points: Array<Vector3 | { x: number; z: number }>,
  options: PathOptions = {}
): WorldPath {
  const width = options.width ?? 1.8;
  const surface = options.surface ?? 0;
  const heightAt =
    typeof surface === 'number' ? () => surface : (x: number, z: number) => surface(x, z);
  const loop = options.loop ?? false;
  const palette = options.palette ?? DEFAULT_PALETTE;

  const controls = points.map((p) => new Vector3(p.x, 0, 'z' in p ? p.z : 0));
  const curve = new CatmullRomCurve3(controls, loop, 'centripetal');
  const length = curve.getLength();
  const samples = Math.max(8, Math.ceil(length * (options.samplesPerUnit ?? 1)));

  const route: Vector3[] = [];
  for (let i = 0; i <= samples; i++) {
    if (loop && i === samples) break; // avoid duplicate closing point
    const p = curve.getPoint(i / samples);
    route.push(new Vector3(p.x, heightAt(p.x, p.z), p.z));
  }

  // Ribbon strip: left/right edge vertices per sample.
  const edgeCount = loop ? route.length + 1 : route.length;
  const positions = new Float32Array(edgeCount * 2 * 3);
  const direction = new Vector3();
  const perp = new Vector3();
  for (let i = 0; i < edgeCount; i++) {
    const current = route[i % route.length];
    const previous = route[(i - 1 + route.length) % route.length];
    const next = route[(i + 1) % route.length];
    if (!loop && i === 0) direction.subVectors(next, current);
    else if (!loop && i === edgeCount - 1) direction.subVectors(current, previous);
    else direction.subVectors(next, previous);
    perp.set(-direction.z, 0, direction.x).normalize().multiplyScalar(width / 2);
    const left = i * 6;
    positions[left] = current.x - perp.x;
    positions[left + 1] = heightAt(current.x - perp.x, current.z - perp.z) + 0.05;
    positions[left + 2] = current.z - perp.z;
    positions[left + 3] = current.x + perp.x;
    positions[left + 4] = heightAt(current.x + perp.x, current.z + perp.z) + 0.05;
    positions[left + 5] = current.z + perp.z;
  }
  const indices: number[] = [];
  for (let i = 0; i < edgeCount - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: palette.path,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  mesh.name = 'path';

  const keepOutMargin = options.keepOutMargin ?? 0.6;
  const keepOut = route
    .filter((_p, i) => i % 2 === 0 || i === route.length - 1) // never drop the endpoint
    .map((p) => ({ center: { x: p.x, z: p.z }, radius: width / 2 + keepOutMargin }));

  const half = width / 2;
  const contains = (x: number, z: number): boolean => {
    const count = loop ? route.length : route.length - 1;
    for (let i = 0; i < count; i++) {
      const a = route[i];
      const b = route[(i + 1) % route.length];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const lengthSq = abx * abx + abz * abz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / lengthSq));
      const dx = x - (a.x + abx * t);
      const dz = z - (a.z + abz * t);
      if (dx * dx + dz * dz <= half * half) return true;
    }
    return false;
  };

  return { mesh, route, keepOut, contains, loop };
}
