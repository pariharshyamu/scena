import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { buildTextGeometry } from '../text/textGeometry';
import { createSlot, type PropSlot } from '../core/types';
import type { RailTrack, TrackPoint } from '../environment/track';

/**
 * A station platform, laid alongside a track.
 *
 * ```ts
 * const platform = createPlatform(track, {
 *   from: 400, to: 520, name: 'HAVENBROOK',
 * });
 * scene.add(platform.object);
 * platform.stopMark;        // where a train's FRONT should come to rest
 * platform.doorMarks;       // where its doors are expected to land
 * ```
 *
 * ## The marks are the point
 *
 * A platform is easy to build and easy to build wrong, and the wrongness is
 * invisible in a screenshot: a train stops, the doors open, and they are two
 * metres past the gap in the fence. So the platform publishes where it expects
 * a train to stop and where it expects the doors to be, and those are numbers
 * a test can hold to a few centimetres.
 *
 * `doorMarks` is derived from the consist you intend to run, not guessed —
 * pass the door offsets and the platform puts a marking on the paving at each
 * one. If the train changes length, the markings move, which is exactly what
 * happens on a real railway when the timetable changes.
 */
export interface StationPlatformOptions {
  /** Distance along the track where the platform starts, metres. */
  from: number;
  /** Distance along the track where it ends. */
  to: number;
  /** Which side of the track, looking along it. Default 'left'. */
  side?: 'left' | 'right';
  /** Platform width, metres. Default 6. */
  width?: number;
  /** Height above rail level. Default 0.9 — a step up into a carriage. */
  height?: number;
  /** Station name, carved into the running-in board. Omit for no board. */
  name?: string;
  /**
   * Door offsets of the train that stops here, from `RollingStock.doors`
   * mapped through the consist. Each gets a marking on the paving.
   */
  doorOffsets?: number[];
  /** Where the train's FRONT stops. Defaults to the far end minus a margin. */
  stopAt?: number;
  /** Canopy over part of the platform. Default true. */
  canopy?: boolean;
  seed?: number;
  palette?: Palette;
}

export interface StationPlatform {
  object: Group;
  obstacleRadius: number;
  slots: PropSlot[];
  /** Distance along the track a train's front should stop at. */
  stopMark: number;
  /** World positions the doors are expected to land on. */
  doorMarks: Vector3[];
  /** The platform edge, for a crowd to queue behind. */
  edge: { from: Vector3; to: Vector3 };
  from: number;
  to: number;
  dispose(): void;
}

/** A station platform beside a track, with the marks a train aligns to. */
export function createStationPlatform(
  track: Pick<RailTrack, 'at' | 'gauge' | 'length'>,
  options: StationPlatformOptions
): StationPlatform {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const width = options.width ?? 6;
  const height = options.height ?? 0.9;
  const sideSign = (options.side ?? 'left') === 'left' ? -1 : 1;
  const from = Math.min(options.from, options.to);
  const to = Math.max(options.from, options.to);
  const span = to - from;
  // The train stops with its nose short of the far end — nobody parks a train
  // with the buffers touching the ramp.
  const stopMark = options.stopAt ?? to - 4;

  const group = new Group();
  group.name = 'platform';

  const paving = createSurface('concrete', { seed: rng.int(1, 999) });
  const kerb = createSurface('stone', { color: 0xb8b2a6, seed: rng.int(1, 999) });
  const steel = createSurface('paintedMetal', { color: palette.metal ?? 0x51606b, seed: rng.int(1, 999) });

  // Offset from the track centreline to the platform's inner face: half the
  // gauge, plus the loading-gauge clearance a carriage body needs.
  const inner = track.gauge / 2 + 1.05;
  const probe: TrackPoint = {
    position: new Vector3(),
    tangent: new Vector3(),
    rotation: new Quaternion(),
  };
  const perp = new Vector3();
  const place = (distance: number, lateral: number, out = new Vector3()): Vector3 => {
    track.at(distance, probe);
    perp.set(-probe.tangent.z, 0, probe.tangent.x).multiplyScalar(sideSign * lateral);
    return out.copy(probe.position).add(perp);
  };

  // The deck. One box per 12 m section, oriented to the track, so a platform
  // beside a curve follows it instead of cutting the corner.
  const sections = Math.max(1, Math.round(span / 12));
  const sectionLength = span / sections;
  const deckGeometry = new BoxGeometry(width, height, sectionLength + 0.04);
  const deck = new InstancedMesh(deckGeometry, paving, sections);
  deck.name = 'deck';
  const matrix = new Matrix4();
  const one = new Vector3(1, 1, 1);
  const seat = new Vector3();
  for (let i = 0; i < sections; i++) {
    const d = from + (i + 0.5) * sectionLength;
    place(d, inner + width / 2, seat);
    track.at(d, probe);
    matrix.compose(seat.setY(seat.y + height / 2), probe.rotation, one);
    deck.setMatrixAt(i, matrix);
  }
  deck.instanceMatrix.needsUpdate = true;
  group.add(deck);

  // The edge strip — the tactile line you are told to stand behind.
  const edgeGeometry = new BoxGeometry(0.6, 0.04, sectionLength + 0.04);
  const edgeStrip = new InstancedMesh(edgeGeometry, kerb, sections);
  edgeStrip.name = 'edge';
  for (let i = 0; i < sections; i++) {
    const d = from + (i + 0.5) * sectionLength;
    place(d, inner + 0.35, seat);
    track.at(d, probe);
    matrix.compose(seat.setY(seat.y + height + 0.02), probe.rotation, one);
    edgeStrip.setMatrixAt(i, matrix);
  }
  edgeStrip.instanceMatrix.needsUpdate = true;
  group.add(edgeStrip);

  // Door markings, one per door of the train that stops here.
  const doorMarks: Vector3[] = [];
  const offsets = options.doorOffsets ?? [];
  if (offsets.length) {
    const markGeometry = new BoxGeometry(1.3, 0.03, 0.5);
    const markMaterial = new MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.7 });
    const marks = new InstancedMesh(markGeometry, markMaterial, offsets.length);
    marks.name = 'door-marks';
    for (const [i, offset] of offsets.entries()) {
      const d = stopMark + offset;
      const at = place(d, inner + 1.1);
      track.at(d, probe);
      matrix.compose(at.clone().setY(at.y + height + 0.03), probe.rotation, one);
      marks.setMatrixAt(i, matrix);
      doorMarks.push(place(d, inner + 0.2).setY(at.y + height));
    }
    marks.instanceMatrix.needsUpdate = true;
    group.add(marks);
  }

  // Canopy: posts and a roof over the middle third, where people wait.
  if (options.canopy ?? true) {
    const cover = Math.min(span * 0.55, 44);
    const mid = (from + to) / 2;
    const postCount = Math.max(2, Math.round(cover / 8));
    const postGeometry = new CylinderGeometry(0.09, 0.09, 3.2, 8);
    const posts = new InstancedMesh(postGeometry, steel, postCount * 2);
    posts.name = 'canopy-posts';
    let n = 0;
    for (let i = 0; i < postCount; i++) {
      const d = mid - cover / 2 + (i / Math.max(1, postCount - 1)) * cover;
      for (const lateral of [inner + 1.3, inner + width - 1.3]) {
        place(d, lateral, seat);
        matrix.compose(seat.setY(seat.y + height + 1.6), new Quaternion(), one);
        posts.setMatrixAt(n++, matrix);
      }
    }
    posts.instanceMatrix.needsUpdate = true;
    group.add(posts);

    const roofSections = Math.max(1, Math.round(cover / 12));
    const roofGeometry = new BoxGeometry(width - 1.6, 0.16, cover / roofSections + 0.04);
    const roof = new InstancedMesh(roofGeometry, steel, roofSections);
    roof.name = 'canopy-roof';
    for (let i = 0; i < roofSections; i++) {
      const d = mid - cover / 2 + ((i + 0.5) / roofSections) * cover;
      place(d, inner + width / 2, seat);
      track.at(d, probe);
      matrix.compose(seat.setY(seat.y + height + 3.25), probe.rotation, one);
      roof.setMatrixAt(i, matrix);
    }
    roof.instanceMatrix.needsUpdate = true;
    group.add(roof);
  }

  // Benches, facing the track, with a slot each — this is where ANIMA sits.
  //
  // Instanced, because they scale with the platform: a 390 m platform has
  // fifteen of them and one Mesh each cost fifteen draw calls. Caught by this
  // module's own test, which is the point of having written it.
  const slots: PropSlot[] = [];
  const benchCount = Math.max(1, Math.floor(span / 26));
  const benches = new InstancedMesh(new BoxGeometry(0.55, 0.12, 1.8), kerb, benchCount);
  benches.name = 'benches';
  for (let i = 0; i < benchCount; i++) {
    const d = from + ((i + 0.5) / benchCount) * span;
    const at = place(d, inner + width - 1.5);
    track.at(d, probe);
    seat.copy(at).setY(at.y + height + 0.45);
    matrix.compose(seat, probe.rotation, one);
    benches.setMatrixAt(i, matrix);
    // The slot anchor is an Object3D, not a mesh, so seating stays per-bench
    // while the rendering stays one call.
    slots.push(createSlot('seat', 'sit', group, seat.x, seat.y, seat.z));
  }
  benches.instanceMatrix.needsUpdate = true;
  group.add(benches);

  // The running-in board: the station's name, carved, in the embedded font.
  if (options.name) {
    const at = place((from + to) / 2, inner + width - 0.7);
    track.at((from + to) / 2, probe);
    const board = new Mesh(new BoxGeometry(0.16, 0.9, 5.4), steel);
    board.position.copy(at).setY(at.y + height + 2.1);
    board.quaternion.copy(probe.rotation);
    board.name = 'running-in-board';
    group.add(board);
    const letters = buildTextGeometry(options.name, { size: 0.42, depth: 0.05, align: 'center' });
    const text = new Mesh(
      letters.geometry,
      new MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.8 })
    );
    text.position.copy(board.position);
    text.quaternion.copy(probe.rotation);
    text.translateZ(0);
    text.translateX(-sideSign * 0.1);
    text.rotateY(-Math.PI / 2);
    text.name = 'station-name';
    group.add(text);
  }

  const edge = { from: place(from, inner), to: place(to, inner) };

  return {
    object: group,
    obstacleRadius: 0, // you walk on a platform, you do not steer round it
    slots,
    stopMark,
    doorMarks,
    edge,
    from,
    to,
    dispose(): void {
      group.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      paving.dispose();
      kerb.dispose();
      steel.dispose();
    },
  };
}
