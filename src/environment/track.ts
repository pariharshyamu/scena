import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type Material,
} from 'three';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';

/**
 * Railway track: two rails, sleepers, ballast, and — the part that matters —
 * a way to ask where you are at a given distance along it.
 *
 * ```ts
 * const line = createTrack([a, b, c], { surface: terrain.heightAt });
 * scene.add(line.object);
 *
 * const where = line.at(120);      // 120 m along
 * carriage.position.copy(where.position);
 * carriage.quaternion.copy(where.rotation);
 * ```
 *
 * ## `at(distance)` is the whole point
 *
 * Everything else in the trilogy steers: an agent picks a direction and the
 * simulation integrates it. A train does not. Its entire position is one
 * number — how far along — and the track turns that number into a place and a
 * facing. That single function is what a controller drives, what a carriage
 * is placed by, and what a station stop is expressed in.
 *
 * It is deliberately the ONLY thing a driver needs, so GAMA's rail controller
 * can take `{ length, at }` structurally and never import SCENA. Same
 * handshake as everywhere else in the trilogy: a shape, not a package.
 *
 * ## Arc length, not curve parameter
 *
 * `CatmullRomCurve3.getPoint(t)` walks the curve's PARAMETER, which is not
 * distance: on a curve with a tight bend and a long straight, equal steps in
 * `t` cover wildly unequal ground. A train driven on `t` would speed up and
 * slow down for no reason as it went round a bend, which is exactly the class
 * of defect `measureFootSkate` exists to catch in a walk cycle.
 *
 * So the curve is resampled into a table of equally-spaced-in-DISTANCE points
 * once, at build time, and `at()` interpolates that. `distanceError` reports
 * how far off the table is — see the note on it.
 */
export interface TrackOptions {
  /** Distance between rail centres. Default 1.435 — standard gauge, in metres. */
  gauge?: number;
  /** Ground height lookup; a number means flat ground. Default 0. */
  surface?: number | ((x: number, z: number) => number);
  /** Metres between sleepers. Default 0.65. */
  sleeperSpacing?: number;
  /** Close the track into a loop. Default false. */
  loop?: boolean;
  /** Extra clearance added to scatter keep-out circles. Default 2.4. */
  keepOutMargin?: number;
  /**
   * Samples per metre in the arc-length table. Default 2.
   *
   * This is a resolution/memory trade, not a quality dial for the mesh: the
   * rails are built from the same table, so raising it smooths tight curves
   * and costs vertices. `distanceError` says whether it is enough.
   */
  samplesPerMetre?: number;
  /** Build the ballast shoulder. Default true. */
  ballast?: boolean;
  palette?: Palette;
}

/** Where the track is, and which way it faces, at some distance along it. */
export interface TrackPoint {
  position: Vector3;
  /** Unit vector along the track, pointing in the direction of travel. */
  tangent: Vector3;
  /** A rotation that faces −Z down the track and keeps +Y up. */
  rotation: Quaternion;
}

export interface RailTrack {
  object: Group;
  /** Total length in metres. `at(length)` is the far end. */
  length: number;
  gauge: number;
  loop: boolean;
  /**
   * Position and facing at `distance` metres along the track.
   *
   * Past the ends it CLAMPS rather than extrapolating (or wraps, on a loop) —
   * a train that overruns should stop at the buffers, not fly off down the
   * tangent into the scenery.
   *
   * Pass `out` to avoid allocating; the same object is returned.
   */
  at(distance: number, out?: TrackPoint): TrackPoint;
  /** The centreline, for scatter keep-out or a camera dolly. */
  route: Vector3[];
  keepOut: Array<{ center: { x: number; z: number }; radius: number }>;
  /**
   * Worst gap between the arc-length table's spacing and its nominal step,
   * as a fraction. Near zero means `at()` is honest about distance.
   *
   * Reported rather than asserted, because the honest value depends on how
   * sharply the caller's own control points turn. A track laid with a 5 m
   * radius curve cannot be resampled evenly at 0.5 m steps, and the number
   * says so instead of the library pretending otherwise.
   */
  distanceError: number;
  dispose(): void;
}

const UP = new Vector3(0, 1, 0);

/** The curve's length through its DEFAULT table — enough to size a better one. */
const rawLength = (curve: CatmullRomCurve3): number => curve.getLength();

/**
 * Lay track along a polyline.
 *
 * Four draw calls whatever the length: two rails, one instanced sleeper mesh,
 * one ballast ribbon. A kilometre of track at 0.65 m spacing is 1,538
 * sleepers, and one mesh each would be 1,538 draw calls — which is the whole
 * reason `npm run geometry` counts them.
 */
export function createTrack(
  points: Array<Vector3 | { x: number; z: number }>,
  options: TrackOptions = {}
): RailTrack {
  const gauge = options.gauge ?? 1.435;
  const spacing = options.sleeperSpacing ?? 0.65;
  const loop = options.loop ?? false;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const surface = options.surface ?? 0;
  const heightAt =
    typeof surface === 'number' ? () => surface : (x: number, z: number) => surface(x, z);

  const controls = points.map(
    (p) => new Vector3(p.x, 0, 'z' in p ? p.z : (p as Vector3).z)
  );
  const curve = new CatmullRomCurve3(controls, loop, 'centripetal');
  // three.js builds its arc-length lookup from `arcLengthDivisions`, default
  // 200. On a 700 m line that is one entry every 3.5 m, and "equally spaced"
  // comes out 8% uneven on the bends — measured. Scale it with the line so a
  // long track is not resampled through a coarse table.
  curve.arcLengthDivisions = Math.max(200, Math.ceil(rawLength(curve) * 4));

  // Resample to EQUAL DISTANCE. `getSpacedPoints` divides by arc length rather
  // than by parameter, which is the difference between a train that holds its
  // speed round a bend and one that does not.
  const rough = curve.getLength();
  const steps = Math.max(8, Math.ceil(rough * (options.samplesPerMetre ?? 2)));
  const spaced = curve.getSpacedPoints(steps);
  if (loop) spaced.pop(); // getSpacedPoints repeats the first point on a loop

  const route: Vector3[] = spaced.map((p) => new Vector3(p.x, heightAt(p.x, p.z), p.z));

  // Cumulative distance along the resampled polyline. This — not the curve's
  // own length — is what `at()` and `length` report, because it is the length
  // of the thing actually drawn.
  const cumulative: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    cumulative.push(cumulative[i - 1] + route[i].distanceTo(route[i - 1]));
  }
  if (loop) cumulative.push(cumulative[cumulative.length - 1] + route[0].distanceTo(route[route.length - 1]));
  const length = cumulative[cumulative.length - 1];

  // How uneven did the resampling actually come out? Draping onto terrain
  // stretches segments that climb, so this is not always the flat-ground zero.
  const nominal = length / (cumulative.length - 1);
  let distanceError = 0;
  for (let i = 1; i < cumulative.length; i++) {
    const step = cumulative[i] - cumulative[i - 1];
    distanceError = Math.max(distanceError, Math.abs(step - nominal) / nominal);
  }

  const at = (distance: number, out?: TrackPoint): TrackPoint => {
    const target = out ?? {
      position: new Vector3(),
      tangent: new Vector3(),
      rotation: new Quaternion(),
    };
    let d = distance;
    if (loop) {
      d = ((d % length) + length) % length;
    } else {
      d = Math.max(0, Math.min(length, d));
    }
    // Binary search the cumulative table: O(log n) per query, and a train
    // queries it once per carriage per frame.
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= d) lo = mid;
      else hi = mid;
    }
    const span = cumulative[hi] - cumulative[lo] || 1;
    const t = (d - cumulative[lo]) / span;
    const a = route[lo % route.length];
    const b = route[hi % route.length];
    target.position.lerpVectors(a, b, t);
    target.tangent.subVectors(b, a).normalize();
    // Face −Z down the track: three.js convention, and what every SCENA
    // vehicle prop is authored to.
    const yaw = Math.atan2(target.tangent.x, target.tangent.z);
    target.rotation.setFromAxisAngle(UP, yaw + Math.PI);
    return target;
  };

  // ---- the mesh -----------------------------------------------------------

  const group = new Group();
  group.name = 'track';

  const railMaterial = createSurface('steel', { seed: 3 });
  const sleeperMaterial = createSurface('wood', { color: palette.woodDark, seed: 7 });
  const ballastMaterial = createSurface('gravel', { seed: 11 });

  const half = gauge / 2;
  const railHead = 0.075;
  const railHeight = 0.14;
  const sleeperTop = 0.12;

  /**
   * A flat ribbon following the route at a lateral offset, at a height.
   *
   * Rails and ballast are the same shape at different widths, and building
   * them from the SAME resampled route is what stops a rail disagreeing with
   * `at()` about where the track is — a train riding half a sleeper off its
   * own rails is the defect this shares code to avoid.
   */
  const ribbon = (offset: number, width: number, height: number, material: Material, name: string): Mesh => {
    const edges = loop ? route.length + 1 : route.length;
    const positions = new Float32Array(edges * 2 * 3);
    const indices: number[] = [];
    const dir = new Vector3();
    const perp = new Vector3();
    for (let i = 0; i < edges; i++) {
      const current = route[i % route.length];
      const ahead = route[(i + 1) % route.length];
      const behind = route[(i - 1 + route.length) % route.length];
      // At an open end there is no neighbour on one side, so use the point
      // itself — a centred difference there would fold the ribbon over.
      const from = i === 0 && !loop ? current : behind;
      const to = i >= edges - 1 && !loop ? current : ahead;
      dir.subVectors(to, from);
      if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
      dir.normalize();
      perp.set(-dir.z, 0, dir.x);
      const cx = current.x + perp.x * offset;
      const cz = current.z + perp.z * offset;
      const y = current.y + height;
      positions.set([cx - perp.x * width * 0.5, y, cz - perp.z * width * 0.5], i * 6);
      positions.set([cx + perp.x * width * 0.5, y, cz + perp.z * width * 0.5], i * 6 + 3);
      if (i < edges - 1) {
        const v = i * 2;
        indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    return mesh;
  };

  if (options.ballast ?? true) {
    group.add(ribbon(0, gauge + 1.9, 0.01, ballastMaterial, 'ballast'));
  }
  group.add(ribbon(-half, railHead, sleeperTop + railHeight, railMaterial, 'rail-left'));
  group.add(ribbon(half, railHead, sleeperTop + railHeight, railMaterial, 'rail-right'));

  // Sleepers: ONE instanced mesh for the whole line, whatever its length.
  // A kilometre at 0.65 m spacing is 1,538 of them, and a Mesh each would be
  // 1,538 draw calls for a thing nobody looks at directly.
  const count = Math.max(1, Math.floor(length / spacing));
  const sleepers = new InstancedMesh(
    new BoxGeometry(gauge + 0.55, 0.12, 0.24),
    sleeperMaterial,
    count
  );
  sleepers.name = 'sleepers';
  const matrix = new Matrix4();
  const probe: TrackPoint = {
    position: new Vector3(),
    tangent: new Vector3(),
    rotation: new Quaternion(),
  };
  const one = new Vector3(1, 1, 1);
  const seat = new Vector3();
  for (let i = 0; i < count; i++) {
    at((i + 0.5) * spacing, probe);
    seat.copy(probe.position).setY(probe.position.y + sleeperTop - 0.06);
    matrix.compose(seat, probe.rotation, one);
    sleepers.setMatrixAt(i, matrix);
  }
  sleepers.instanceMatrix.needsUpdate = true;
  group.add(sleepers);

  const keepOut = route
    .filter((_, i) => i % 4 === 0)
    .map((p) => ({
      center: { x: p.x, z: p.z },
      radius: gauge + (options.keepOutMargin ?? 2.4),
    }));

  return {
    object: group,
    length,
    gauge,
    loop,
    at,
    route,
    keepOut,
    distanceError,
    dispose(): void {
      group.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      railMaterial.dispose();
      sleeperMaterial.dispose();
      ballastMaterial.dispose();
    },
  };
}
