import { Group, Vector3 } from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { Obstacle, Prop } from '../core/types';
import type { Room } from './room';
import {
  createBed,
  createCandle,
  createChest,
  createRug,
  createSeat,
  createShelf,
  createTable,
} from '../props/furniture';
import { createCounter, createForge, createLoom, createOven } from '../props/workshop';
import { createCrate } from '../props/crate';

export type RoomRole = 'cottage' | 'tavern' | 'smithy' | 'bakery' | 'weaver' | 'study' | 'barracks';

export interface FurnishOptions {
  seed?: number;
  /** What the room is for. Default 'cottage'. */
  role?: RoomRole;
  palette?: Palette;
}

/** Named points ANIMA characters can use: where to sit, sleep, work, warm up. */
export interface RoomMarkers {
  /** One per seat (chairs, stools, bench places, counter fronts). */
  sit: Vector3[];
  /** One per sleeping place (bed decks). */
  sleep: Vector3[];
  /** In front of each work utility (forge, oven, loom, counter, desk). */
  work: Vector3[];
  /** A spot in front of each hearth, for warming hands. */
  hearth: Vector3[];
}

export interface Furnished {
  /** Everything placed, already added to `group`. */
  props: Prop[];
  /** Room-local steering circles for the placed furniture. */
  obstacles: Obstacle[];
  /** Room-local gameplay markers by kind. */
  markers: RoomMarkers;
  /** The container — already a child of `room.group`. */
  group: Group;
}

interface Spot {
  x: number;
  z: number;
  /** For wall cells: unit vector pointing away from the wall, into the room. */
  normal: Vector3 | null;
}

/**
 * Furnish a `createRoom` interior for a role, using the room's own grid:
 * beds and shelves go against walls facing inward, tables take the middle
 * (the rug if there is one), seats gather round, and the role's trade
 * utility — a tavern's counter, a smith's forge, a baker's oven, a
 * weaver-less study's book wall — anchors the room. Doorways stay clear,
 * nothing overlaps, and the same seed always furnishes the same way.
 *
 * The payoff for agents: `markers` — named, room-local points (`sit`,
 * `sleep`, `work`, `hearth`) a GAMA/ANIMA character can walk to and use,
 * and `obstacles` ready for steering.
 *
 * ```ts
 * const tavern = furnishRoom(room, { role: 'tavern', seed: 4 });
 * guest.walkTo(room.group.localToWorld(tavern.markers.sit[0].clone()));
 * ```
 */
export function furnishRoom(room: Room, options: FurnishOptions = {}): Furnished {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const role = options.role ?? 'cottage';
  const palette = options.palette ?? DEFAULT_PALETTE;
  const unit = room.unit;

  const group = new Group();
  group.name = `furnish-${role}`;
  room.group.add(group);
  const props: Prop[] = [];
  const obstacles: Obstacle[] = [];
  const markers: RoomMarkers = { sit: [], sleep: [], work: [], hearth: [] };

  // ---- survey the grid --------------------------------------------------
  const cols = Math.round(room.size.width / unit);
  const rows = Math.round(room.size.depth / unit);
  const x0 = -room.size.width / 2 + unit / 2;
  const z0 = -room.size.depth / 2 + unit / 2;
  const nearDoor = (x: number, z: number): boolean =>
    room.doors.some((door) => Math.hypot(door.x - x, door.z - z) < unit * 1.6);
  const nearHearthFront = (x: number, z: number): boolean =>
    room.hearths.some((hearth) => {
      const front = hearth.position.clone().addScaledVector(hearth.normal, unit);
      return Math.hypot(front.x - x, front.z - z) < unit * 0.9;
    });

  const wallSpots: Spot[] = [];
  const openSpots: Spot[] = [];
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = x0 + cx * unit;
      const z = z0 + cz * unit;
      if (!room.floorAt(x, z) || nearDoor(x, z) || nearHearthFront(x, z)) continue;
      // Which neighbors are solid? That cell hugs a wall.
      const solid: Vector3[] = [];
      if (!room.floorAt(x - unit, z)) solid.push(new Vector3(1, 0, 0));
      if (!room.floorAt(x + unit, z)) solid.push(new Vector3(-1, 0, 0));
      if (!room.floorAt(x, z - unit)) solid.push(new Vector3(0, 0, 1));
      if (!room.floorAt(x, z + unit)) solid.push(new Vector3(0, 0, -1));
      if (solid.length > 0) wallSpots.push({ x, z, normal: rng.pick(solid) });
      else openSpots.push({ x, z, normal: null });
    }
  }
  // Seeded shuffle so different seeds pick different walls first.
  const shuffle = <T>(list: T[]): T[] => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  shuffle(wallSpots);
  shuffle(openSpots);

  const taken: Array<{ x: number; z: number; r: number }> = [];
  const fits = (x: number, z: number, r: number): boolean =>
    taken.every((t) => Math.hypot(t.x - x, t.z - z) >= (t.r + r) * 0.82);

  /** Place a prop at a spot (facing its normal, or a given yaw), claim space. */
  const put = (prop: Prop, spot: Spot | null, yaw?: number): Spot | null => {
    if (!spot) return null;
    const ry = yaw ?? (spot.normal ? Math.atan2(spot.normal.x, spot.normal.z) : rng.range(0, Math.PI * 2));
    prop.object.position.set(spot.x, 0, spot.z);
    prop.object.rotation.y = ry;
    group.add(prop.object);
    props.push(prop);
    if (prop.obstacleRadius > 0) {
      obstacles.push({ center: new Vector3(spot.x, 0, spot.z), radius: prop.obstacleRadius });
      taken.push({ x: spot.x, z: spot.z, r: prop.obstacleRadius });
    }
    return spot;
  };
  const wallSpot = (r: number): Spot | null =>
    wallSpots.find((spot) => fits(spot.x, spot.z, r)) ?? null;
  const openSpot = (r: number): Spot | null =>
    openSpots.find((spot) => fits(spot.x, spot.z, r)) ?? null;
  /** The room-local point `dist` in front of a placed prop's facing. */
  const inFront = (spot: Spot, dist: number, yaw?: number): Vector3 => {
    const a = yaw ?? (spot.normal ? Math.atan2(spot.normal.x, spot.normal.z) : 0);
    return new Vector3(spot.x + Math.sin(a) * dist, 0, spot.z + Math.cos(a) * dist);
  };
  /** Two sitting places spaced along a bench's long (local x) axis. */
  const benchSits = (spot: Spot): Vector3[] => {
    const a = spot.normal ? Math.atan2(spot.normal.x, spot.normal.z) : 0;
    const along = new Vector3(Math.cos(a), 0, -Math.sin(a));
    const center = new Vector3(spot.x, 0, spot.z);
    return [center.clone().addScaledVector(along, 0.4), center.clone().addScaledVector(along, -0.4)];
  };

  // Rug cells make the best table spots; hearths always get a marker.
  const centerSpot: Spot | null =
    room.rugs.length > 0
      ? { x: room.rugs[0].x, z: room.rugs[0].z, normal: null }
      : openSpot(1.1);
  for (const hearth of room.hearths) {
    // A step back from the hearthstone — close enough to warm hands, not
    // standing in the flames (the fire itself sits ~1.5 units from the cell).
    markers.hearth.push(hearth.position.clone().addScaledVector(hearth.normal, unit * 1.35));
  }

  // ---- role scripts -----------------------------------------------------
  const child = (): number => rng.int(1, 1e9);

  /** A stool at a work point (if it exists), facing back at the work. */
  const furnishSeatAt = (at: Vector3 | undefined): Vector3 | null => {
    if (!at || !room.floorAt(at.x, at.z)) return null;
    const stool = createSeat({ seed: child(), style: 'stool', palette });
    stool.object.position.set(at.x, 0, at.z);
    group.add(stool.object);
    props.push(stool);
    return at.clone();
  };

  const tableAndSeats = (style: 'round' | 'trestle', seats: number): void => {
    const spot = centerSpot && fits(centerSpot.x, centerSpot.z, 1.05) ? centerSpot : openSpot(1.05);
    const yaw = rng.range(0, Math.PI * 2);
    const placed = put(createTable({ seed: child(), style, palette }), spot, yaw);
    if (!placed) return;
    for (let i = 0; i < seats; i++) {
      const a = yaw + (i / seats) * Math.PI * 2 + 0.4;
      const seat = createSeat({ seed: child(), style: i % 3 === 2 ? 'stool' : 'chair', palette });
      const sx = placed.x + Math.sin(a) * 1.25;
      const sz = placed.z + Math.cos(a) * 1.25;
      if (!room.floorAt(sx, sz) || nearDoor(sx, sz)) continue;
      seat.object.position.set(sx, 0, sz);
      seat.object.rotation.y = a + Math.PI; // face the table
      group.add(seat.object);
      props.push(seat);
      obstacles.push({ center: new Vector3(sx, 0, sz), radius: seat.obstacleRadius });
      taken.push({ x: sx, z: sz, r: seat.obstacleRadius });
      markers.sit.push(new Vector3(sx, 0, sz));
    }
    const candle = createCandle({ seed: child(), palette });
    candle.object.position.set(placed.x + 0.25, 0.78, placed.z);
    group.add(candle.object);
    props.push(candle);
  };

  const bedAndChest = (size: 'single' | 'double'): void => {
    const spot = wallSpot(1.15);
    const placed = put(createBed({ seed: child(), size, palette }), spot);
    if (!placed) return;
    markers.sleep.push(new Vector3(placed.x, 0, placed.z));
    if (size === 'double') markers.sleep.push(new Vector3(placed.x, 0, placed.z));
    const foot = inFront(placed, 1.6);
    if (room.floorAt(foot.x, foot.z) && fits(foot.x, foot.z, 0.55)) {
      put(createChest({ seed: child(), palette }), { x: foot.x, z: foot.z, normal: spot!.normal });
    }
  };

  const shelfOn = (stock: 'books' | 'pottery' | 'food'): void => {
    put(createShelf({ seed: child(), stock, palette }), wallSpot(0.7));
  };

  const utility = (
    prop: Prop,
    kind: 'wall' | 'open',
    workDist: number
  ): void => {
    const spot = kind === 'wall' ? wallSpot(prop.obstacleRadius) : openSpot(prop.obstacleRadius);
    const placed = put(prop, spot);
    if (placed) markers.work.push(inFront(placed, workDist));
  };

  switch (role) {
    case 'cottage':
      bedAndChest('single');
      tableAndSeats('round', 2);
      shelfOn(rng.next() < 0.5 ? 'books' : 'food');
      put(createRug({ seed: child(), shape: 'runner', palette }), wallSpot(0));
      break;
    case 'tavern': {
      utility(createCounter({ seed: child(), palette }), 'wall', 1.1);
      shelfOn('pottery');
      tableAndSeats('trestle', 4);
      if (openSpots.length > 10) tableAndSeats('round', 3);
      // Bench along a spare wall for waiting guests.
      const benchSpot = wallSpot(0.8);
      const bench = put(createSeat({ seed: child(), style: 'bench', palette }), benchSpot);
      if (bench) markers.sit.push(...benchSits(bench));
      put(createCandle({ seed: child(), style: 'candelabra', palette }), wallSpot(0.3));
      break;
    }
    case 'smithy':
      utility(createForge({ seed: child(), palette }), 'wall', 1.2);
      put(createTable({ seed: child(), style: 'desk', palette }), wallSpot(0.75));
      put(createChest({ seed: child(), palette }), wallSpot(0.55));
      put(createCrate({ seed: child(), palette }), wallSpot(0.5));
      put(createSeat({ seed: child(), style: 'stool', palette }), openSpot(0.3));
      break;
    case 'bakery':
      utility(createOven({ seed: child(), palette }), 'wall', 1.15);
      utility(createCounter({ seed: child(), palette }), 'wall', 1.1);
      shelfOn('food');
      tableAndSeats('round', 1);
      put(createCrate({ seed: child(), palette }), wallSpot(0.5));
      break;
    case 'weaver': {
      utility(createLoom({ seed: child(), palette }), 'wall', 0.9);
      const weaverSeat = furnishSeatAt(markers.work[markers.work.length - 1]);
      if (weaverSeat) markers.sit.push(weaverSeat);
      shelfOn('food');
      put(createRug({ seed: child(), shape: 'square', palette }), openSpot(0));
      put(createChest({ seed: child(), palette }), wallSpot(0.55));
      break;
    }
    case 'study': {
      shelfOn('books');
      shelfOn('books');
      const desk = put(createTable({ seed: child(), style: 'desk', palette }), wallSpot(0.75));
      if (desk) {
        markers.work.push(inFront(desk, 0.7));
        const chairAt = inFront(desk, 0.75);
        const chair = createSeat({ seed: child(), style: 'chair', palette });
        chair.object.position.copy(chairAt);
        chair.object.rotation.y = (desk.normal ? Math.atan2(desk.normal.x, desk.normal.z) : 0) + Math.PI;
        group.add(chair.object);
        props.push(chair);
        markers.sit.push(chairAt);
      }
      put(createCandle({ seed: child(), style: 'candelabra', palette }), wallSpot(0.3));
      put(createRug({ seed: child(), shape: 'round', palette }), openSpot(0));
      break;
    }
    case 'barracks': {
      for (let i = 0; i < 3; i++) {
        const spot = wallSpot(1.15);
        const bunk = put(createBed({ seed: child(), size: 'single', palette }), spot);
        if (bunk) {
          markers.sleep.push(new Vector3(bunk.x, 0, bunk.z));
          const foot = inFront(bunk, 1.6);
          if (room.floorAt(foot.x, foot.z) && fits(foot.x, foot.z, 0.55)) {
            put(createChest({ seed: child(), palette }), { x: foot.x, z: foot.z, normal: spot!.normal });
          }
        }
      }
      const bench = put(createSeat({ seed: child(), style: 'bench', palette }), openSpot(0.8));
      if (bench) markers.sit.push(...benchSits(bench));
      break;
    }
  }

  return { props, obstacles, markers, group };
}
