import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type Material,
} from 'three';
import { Rng } from '../core/random';
import type { Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createGlass } from '../materials/glass';
import { sharedBy } from '../materials/shared';
import { createSlot, type Prop, type PropSlot } from '../core/types';
import type { RailTrack, TrackPoint } from '../environment/track';

/**
 * Rolling stock: locomotives, carriages, and goods wagons — and the coupling
 * that makes a list of them into a train.
 *
 * ```ts
 * const train = createConsist(track, [
 *   createLocomotive({ seed: 1 }),
 *   createCarriage({ seed: 2 }),
 *   createCarriage({ seed: 3 }),
 * ]);
 * scene.add(train.object);
 * train.place(120);        // the whole train, 120 m along the line
 * ```
 *
 * ## Why a consist is not just N props in a row
 *
 * A vehicle on a curve does not face the way the track faces at its centre. It
 * is a rigid body resting on two bogies, and it faces along the CHORD between
 * them — which on a bend is measurably different, and is the difference
 * between a train that looks like a train and a string of boxes shrink-wrapped
 * to a spline.
 *
 * So `place` samples the track twice per vehicle, at its bogie centres, and
 * puts the body on the midpoint facing the chord. Two extra samples per
 * carriage per frame, and it is the whole trick.
 */

export interface RollingStockOptions {
  seed?: number;
  palette?: Palette;
  /** Body colour. Seeded from a livery set when omitted. */
  color?: number;
  /** Length over couplings, metres. Sensible defaults per kind. */
  length?: number;
}

/** A vehicle that can be coupled into a consist. */
export interface RollingStock extends Prop {
  /** Length over couplings, metres — what the consist spaces by. */
  length: number;
  /** Distance between bogie centres. The chord `place` faces along. */
  bogieSpacing: number;
  /**
   * Door centres as offsets from the vehicle's own centre, in metres.
   *
   * Empty on a goods wagon. This is what a platform aligns to, and what makes
   * "the doors stopped 40 cm past their markers" a number rather than a
   * complaint.
   */
  doors: number[];
  /** The bogies, so a caller can spin the wheels at the right rate. */
  wheels: Object3D[];
  /** Wheel radius, so that rate is derivable rather than guessed. */
  wheelRadius: number;
}

const LIVERY = [0x1f4e79, 0x7a1f2b, 0x1d5b34, 0x37474f, 0x6b4c2a];
const UP = new Vector3(0, 1, 0);

/** Bogie: a frame and four wheels, returned so the caller can roll them. */
function bogie(steel: Material, dark: Material, radius: number): Object3D {
  const pivot = new Object3D();
  pivot.name = 'bogie';
  const frame = new Mesh(new BoxGeometry(1.9, 0.18, 1.7), dark);
  frame.position.y = radius + 0.18;
  pivot.add(frame);
  for (const z of [-0.72, 0.72]) {
    for (const x of [-0.78, 0.78]) {
      const wheel = new Mesh(new CylinderGeometry(radius, radius, 0.08, 12), steel);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, radius, z);
      wheel.name = 'wheel';
      pivot.add(wheel);
    }
  }
  return pivot;
}

/** The shared skeleton of every vehicle: underframe, bogies, buffers. */
function chassis(
  group: Group,
  length: number,
  bogieSpacing: number,
  steel: Material,
  dark: Material,
  wheelRadius: number
): Object3D[] {
  const deck = new Mesh(new BoxGeometry(2.8, 0.22, length - 0.4), dark);
  deck.position.y = wheelRadius + 0.42;
  group.add(deck);
  const bogies: Object3D[] = [];
  for (const z of [-bogieSpacing / 2, bogieSpacing / 2]) {
    const b = bogie(steel, dark, wheelRadius);
    b.position.z = z;
    group.add(b);
    bogies.push(b);
  }
  // Buffers and a coupling hook at each end — the bit that says "this joins
  // to another one of these".
  for (const end of [-1, 1]) {
    for (const x of [-0.85, 0.85]) {
      const buffer = new Mesh(new CylinderGeometry(0.17, 0.17, 0.3, 8), steel);
      buffer.rotation.x = Math.PI / 2;
      buffer.position.set(x, wheelRadius + 0.42, end * (length / 2 - 0.1));
      group.add(buffer);
    }
  }
  return bogies;
}

/** A passenger carriage: body, window band, roof, and doors that matter. */
export function createCarriage(options: RollingStockOptions = {}): RollingStock {
  const rng = new Rng(options.seed ?? 1);
  const length = options.length ?? 19;
  const bogieSpacing = length * 0.68;
  const wheelRadius = 0.45;
  const color = options.color ?? rng.pick(LIVERY);

  const group = new Group();
  group.name = 'carriage';
  const steel = createSurface('steel', { seed: rng.int(1, 999) });
  const dark = new MeshStandardMaterial({ color: 0x22262b, roughness: 0.85, flatShading: true });
  const body = createSurface('paintedMetal', { color, seed: rng.int(1, 999) });
  const glass = createGlass({ tint: 0x9fc4d8 });

  const bogies = chassis(group, length, bogieSpacing, steel, dark, wheelRadius);

  // Roofs are a light grey, NOT the underframe's near-black. Station canopies
  // are dark too, and a dark roof under a dark canopy makes the train
  // disappear into the building — visible the moment the railway example was
  // first rendered, and invisible in any test.
  const roofGrey = new MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.78, flatShading: true });
  const bodyY = wheelRadius + 0.53;
  const shell = new Mesh(new BoxGeometry(2.9, 2.5, length - 0.5), body);
  shell.position.y = bodyY + 1.25;
  group.add(shell);
  const roof = new Mesh(new BoxGeometry(2.75, 0.22, length - 0.8), roofGrey);
  roof.position.y = bodyY + 2.6;
  group.add(roof);

  // Window band: one mesh per side, not one per window — a carriage with
  // sixteen separate panes is sixteen draw calls for a stripe.
  for (const side of [-1, 1]) {
    const band = new Mesh(new BoxGeometry(0.06, 0.95, length - 3.4), glass);
    band.position.set(side * 1.47, bodyY + 1.75, 0);
    band.name = 'window-band';
    group.add(band);
  }

  // Doors, and the offsets that go with them. A carriage has one pair near
  // each end, which is what platform alignment is measured against.
  const doors = [-length * 0.32, length * 0.32];
  const doorMaterial = sharedBy((c: number) =>
    new MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2, flatShading: true })
  );
  const slots: PropSlot[] = [];
  for (const z of doors) {
    for (const side of [-1, 1]) {
      const leaf = new Mesh(new BoxGeometry(0.08, 2.0, 1.25), doorMaterial(0x2b3138));
      leaf.position.set(side * 1.48, bodyY + 1.05, z);
      leaf.name = 'door';
      group.add(leaf);
    }
    slots.push(
      createSlot('seat', 'sit', group, 0.75, bodyY + 0.55, z + 1.6, Math.PI)
    );
  }

  return {
    object: group,
    obstacleRadius: length / 2,
    slots,
    length,
    bogieSpacing,
    doors,
    wheels: bogies,
    wheelRadius,
  };
}

/** A locomotive: the same chassis, a cab you can stand in, and a nose. */
export function createLocomotive(options: RollingStockOptions = {}): RollingStock {
  const rng = new Rng(options.seed ?? 1);
  const length = options.length ?? 17;
  const bogieSpacing = length * 0.62;
  const wheelRadius = 0.52;
  const color = options.color ?? rng.pick(LIVERY);

  const group = new Group();
  group.name = 'locomotive';
  const steel = createSurface('steel', { seed: rng.int(1, 999) });
  const dark = new MeshStandardMaterial({ color: 0x22262b, roughness: 0.85, flatShading: true });
  const body = createSurface('paintedMetal', { color, seed: rng.int(1, 999) });
  const glass = createGlass({ tint: 0x9fc4d8 });

  const bogies = chassis(group, length, bogieSpacing, steel, dark, wheelRadius);
  const bodyY = wheelRadius + 0.6;

  // Long hood, then a taller cab set back from the leading end.
  const hood = new Mesh(new BoxGeometry(2.85, 2.1, length - 6), body);
  hood.position.set(0, bodyY + 1.05, 1.4);
  group.add(hood);
  const cab = new Mesh(new BoxGeometry(2.95, 2.7, 4.2), body);
  cab.position.set(0, bodyY + 1.35, -length / 2 + 2.6);
  group.add(cab);
  const cabRoof = new Mesh(
    new BoxGeometry(3.05, 0.2, 4.4),
    new MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.78, flatShading: true })
  );
  cabRoof.position.set(0, bodyY + 2.8, -length / 2 + 2.6);
  group.add(cabRoof);

  // Windscreen and side lights — the face of the thing.
  const screen = new Mesh(new BoxGeometry(2.5, 1.0, 0.1), glass);
  screen.position.set(0, bodyY + 2.0, -length / 2 + 0.55);
  group.add(screen);
  const lamp = sharedBy((c: number) =>
    new MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 })
  );
  for (const x of [-0.9, 0.9]) {
    const light = new Mesh(new BoxGeometry(0.34, 0.24, 0.1), lamp(0xfff2cc));
    light.position.set(x, bodyY + 0.75, -length / 2 + 0.12);
    group.add(light);
  }

  const slots = [createSlot('driver', 'drive', group, 0.55, bodyY + 0.35, -length / 2 + 2.2, Math.PI)];

  return {
    object: group,
    obstacleRadius: length / 2,
    slots,
    length,
    bogieSpacing,
    doors: [],
    wheels: bogies,
    wheelRadius,
  };
}

export interface WagonOptions extends RollingStockOptions {
  /** `open` for mineral/coal, `van` for a closed box, `flat` for a bed. */
  kind?: 'open' | 'van' | 'flat';
}

/** A goods wagon. No doors to align, no seats — freight, not people. */
export function createWagon(options: WagonOptions = {}): RollingStock {
  const rng = new Rng(options.seed ?? 1);
  const kind = options.kind ?? rng.pick(['open', 'van', 'flat'] as const);
  const length = options.length ?? 12;
  const bogieSpacing = length * 0.6;
  const wheelRadius = 0.42;

  const group = new Group();
  group.name = `wagon-${kind}`;
  const steel = createSurface('steel', { seed: rng.int(1, 999) });
  const dark = new MeshStandardMaterial({ color: 0x22262b, roughness: 0.85, flatShading: true });
  // Weathered rather than painted: a goods wagon is a working thing.
  const plate = createSurface('metal', { color: 0x6a5a4c, seed: rng.int(1, 999) });

  const bogies = chassis(group, length, bogieSpacing, steel, dark, wheelRadius);
  const deckY = wheelRadius + 0.53;

  if (kind === 'van') {
    const box = new Mesh(new BoxGeometry(2.85, 2.6, length - 0.6), plate);
    box.position.y = deckY + 1.3;
    group.add(box);
    const roof = new Mesh(new BoxGeometry(2.7, 0.18, length - 0.9), dark);
    roof.position.y = deckY + 2.7;
    group.add(roof);
  } else if (kind === 'open') {
    // Four walls, no lid. Cheaper than a hollowed box and it reads the same.
    for (const [w, h, d, x, z] of [
      [2.85, 1.5, 0.14, 0, -(length / 2 - 0.35)],
      [2.85, 1.5, 0.14, 0, length / 2 - 0.35],
      [0.14, 1.5, length - 0.7, -1.36, 0],
      [0.14, 1.5, length - 0.7, 1.36, 0],
    ] as const) {
      const wall = new Mesh(new BoxGeometry(w, h, d), plate);
      wall.position.set(x, deckY + 0.75, z);
      group.add(wall);
    }
  } else {
    const bed = new Mesh(new BoxGeometry(2.85, 0.16, length - 0.6), plate);
    bed.position.y = deckY + 0.08;
    group.add(bed);
  }

  return {
    object: group,
    obstacleRadius: length / 2,
    length,
    bogieSpacing,
    doors: [],
    wheels: bogies,
    wheelRadius,
  };
}

export interface ConsistOptions {
  /** Gap between coupled vehicles, metres. Default 0.6. */
  coupling?: number;
  /** Roll the wheels as the train moves. Default true. */
  rollWheels?: boolean;
}

export interface Consist {
  object: Group;
  vehicles: RollingStock[];
  /** Length over the whole train, including couplings. */
  length: number;
  /**
   * Put the train's FRONT at `distance` along the track.
   *
   * The front, not the centre, because a station stop is expressed as "the
   * front of the train at the stopping mark" — that is what a driver aims at
   * and what a platform is measured from.
   */
  place(distance: number): void;
  /** Where `vehicles[v]`'s door `d` is in world space, after the last `place`. */
  doorPosition(vehicle: number, door: number, out?: Vector3): Vector3;
  /** Every door on the train, in order. Convenience over `doorPosition`. */
  doorPositions(): Vector3[];
}

/**
 * Couple vehicles onto a track.
 *
 * `track` is taken structurally — anything with `length` and `at()` — so this
 * works with a `RailTrack`, a test double, or whatever a game lays its own
 * lines with.
 */
export function createConsist(
  track: Pick<RailTrack, 'length' | 'at'>,
  vehicles: RollingStock[],
  options: ConsistOptions = {}
): Consist {
  const coupling = options.coupling ?? 0.6;
  const rollWheels = options.rollWheels ?? true;

  const group = new Group();
  group.name = 'consist';
  for (const v of vehicles) group.add(v.object);

  // Distance from the train's front to each vehicle's CENTRE.
  const centres: number[] = [];
  let run = 0;
  for (const v of vehicles) {
    centres.push(run + v.length / 2);
    run += v.length + coupling;
  }
  const length = Math.max(0, run - coupling);

  const front = { position: new Vector3(), tangent: new Vector3(), rotation: new Quaternion() };
  const back = { position: new Vector3(), tangent: new Vector3(), rotation: new Quaternion() };
  const chord = new Vector3();
  let placedAt = 0;

  const place = (distance: number): void => {
    placedAt = distance;
    for (const [i, vehicle] of vehicles.entries()) {
      const centre = distance - centres[i];
      const half = vehicle.bogieSpacing / 2;
      // The two bogies, sampled where they actually sit on the rails.
      track.at(centre + half, front as TrackPoint);
      track.at(centre - half, back as TrackPoint);
      // Body on the midpoint, facing the chord between them — NOT the tangent
      // at the centre, which is what makes a train on a curve look wrong.
      vehicle.object.position.lerpVectors(back.position, front.position, 0.5);
      chord.subVectors(front.position, back.position);
      if (chord.lengthSq() > 1e-9) {
        chord.normalize();
        vehicle.object.quaternion.setFromAxisAngle(UP, Math.atan2(chord.x, chord.z) + Math.PI);
      }
      if (rollWheels) {
        // Rotation follows DISTANCE, not time: a wheel that spins on a timer
        // slips whenever the train changes speed, which is the rail version of
        // foot skate and just as invisible in a still frame.
        const angle = centre / vehicle.wheelRadius;
        for (const b of vehicle.wheels) {
          for (const wheel of b.children) {
            if (wheel.name === 'wheel') wheel.rotation.y = -angle;
          }
        }
      }
    }
  };

  const doorPosition = (vehicle: number, door: number, out = new Vector3()): Vector3 => {
    const v = vehicles[vehicle];
    const offset = v.doors[door];
    return out
      .set(0, 0, offset)
      .applyQuaternion(v.object.quaternion)
      .add(v.object.position);
  };

  place(0);
  void placedAt;

  return {
    object: group,
    vehicles,
    length,
    place,
    doorPosition,
    doorPositions(): Vector3[] {
      const out: Vector3[] = [];
      for (const [i, v] of vehicles.entries()) {
        for (let d = 0; d < v.doors.length; d++) out.push(doorPosition(i, d));
      }
      return out;
    },
  };
}
