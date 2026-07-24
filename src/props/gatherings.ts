import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  SphereGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { addApproach, createSlot } from '../core/types';
import type { Gathering, PropSlot } from '../core/types';
import { createSeat, createTable } from './furniture';

/**
 * Props that seat *several* characters at once — the dining table, the
 * park bench, the game board, the ring of logs round a fire.
 *
 * The geometry is the easy half. What makes a group of bodies read as
 * people rather than mannequins is the detail these generators encode:
 *
 * - **Nothing is square.** Every chair is nudged off its ideal angle and
 *   pushed back a different amount, because nobody in the history of
 *   dining has left a chair exactly where they found it. The seat slot
 *   inherits that crookedness, so the sitters land crooked too — and one
 *   seeded radian of it does more for realism than another thousand
 *   triangles.
 * - **Every seat has an approach.** A slot's `approach` anchor stands a
 *   pace behind the chair. Characters walk *there*, then turn and lower.
 * - **Every gathering has a focus.** The bowl in the middle, the board,
 *   the fire. Aim the occupants' gaze at it (ANIMA's `LookAt`, or a
 *   `Conversation`) and adjacency becomes company.
 */

export interface GatheringOptions {
  seed?: number;
  palette?: Palette;
}

/** Place a focus marker (what occupants attend to) at a local point. */
function focusAt(parent: Group, x: number, y: number, z: number): Object3D {
  const focus = new Object3D();
  focus.name = 'focus';
  focus.position.set(x, y, z);
  parent.add(focus);
  return focus;
}

/**
 * Seat a chair at (x, z) facing `rotY`, crooked by a believable amount,
 * and hand back its slot (with approach) re-parented into the chair so it
 * carries every bit of that jitter.
 */
function seatChair(
  group: Group,
  rng: Rng,
  x: number,
  z: number,
  rotY: number,
  options: { seed: number; palette: Palette; style?: 'chair' | 'stool' }
): PropSlot {
  // Pushed back from the table by a hand's width or two, and never square on.
  const back = rng.range(0.0, 0.16);
  const skew = rng.range(-0.17, 0.17);
  const chair = createSeat({
    seed: options.seed + Math.floor(rng.next() * 1000),
    style: options.style ?? 'chair',
    palette: options.palette,
  });
  chair.object.position.set(x - Math.sin(rotY) * back, 0, z - Math.cos(rotY) * back);
  chair.object.rotation.y = rotY + skew;
  group.add(chair.object);
  const slot = chair.slots![0];
  slot.kind = 'seat';
  return addApproach(slot, chair.object, rng.range(0.62, 0.82));
}

/** A plate-and-cup place setting on the table in front of a seat. */
function placeSetting(
  group: Group,
  rng: Rng,
  x: number,
  z: number,
  rotY: number,
  height: number,
  palette: Palette,
  seed: number
): void {
  const reach = rng.range(0.4, 0.5);
  const px = x + Math.sin(rotY) * reach;
  const pz = z + Math.cos(rotY) * reach;
  const clay = createSurface('plaster', { color: 0xd9cdb8, seed });
  const plate = new Mesh(new CylinderGeometry(0.11, 0.09, 0.02, 10), clay);
  plate.position.set(px, height + 0.01, pz);
  group.add(plate);
  // The cup lands wherever the hand put it — off to one side, never centred.
  const side = rng.pick([-1, 1]) * rng.range(0.13, 0.2);
  const cup = new Mesh(new CylinderGeometry(0.04, 0.035, 0.08, 8), clay);
  cup.position.set(px + Math.cos(rotY) * side, height + 0.04, pz - Math.sin(rotY) * side);
  cup.rotation.z = rng.range(-0.04, 0.04);
  group.add(cup);
}

// ---- dining table ------------------------------------------------------

export interface DiningTableOptions extends GatheringOptions {
  /** How many places to lay. Round tables ring them; trestles line them up. */
  seats?: number;
  /** 'round' pedestal or long 'trestle' board. */
  style?: 'round' | 'trestle';
  /** Lay plates and cups. Default true. */
  settings?: boolean;
}

/**
 * A table with chairs round it and the meal laid out — the archetypal
 * gathering. Round tables seat everyone equally; trestles have a head.
 */
export function createDiningTable(options: DiningTableOptions = {}): Gathering {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const style = options.style ?? 'round';
  const count = Math.max(2, Math.min(10, options.seats ?? 6));

  const group = new Group();
  group.name = `dining-${style}`;
  const table = createTable({ seed, style, palette });
  group.add(table.object);
  const height = 0.74;

  const seats: PropSlot[] = [];
  const spots: Array<{ x: number; z: number; rotY: number }> = [];

  if (style === 'round') {
    const ring = 1.12;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng.range(-0.08, 0.08);
      spots.push({ x: Math.sin(a) * ring, z: Math.cos(a) * ring, rotY: a + Math.PI });
    }
  } else {
    // Two long sides first, then the heads — the way a board fills up.
    const perSide = Math.floor(count / 2);
    const heads = count - perSide * 2;
    for (const side of [1, -1]) {
      for (let i = 0; i < perSide; i++) {
        const t = perSide === 1 ? 0.5 : i / (perSide - 1);
        spots.push({ x: (t - 0.5) * 1.5, z: side * 0.86, rotY: side > 0 ? Math.PI : 0 });
      }
    }
    for (let i = 0; i < heads; i++) {
      const end = i === 0 ? 1 : -1;
      spots.push({ x: end * 1.28, z: 0, rotY: end > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
  }

  for (const spot of spots) {
    seats.push(seatChair(group, rng, spot.x, spot.z, spot.rotY, { seed, palette }));
    if (options.settings !== false) {
      placeSetting(group, rng, spot.x, spot.z, spot.rotY, height, palette, seed);
    }
  }

  // The shared dish in the middle: what hands reach for and eyes come back to.
  if (options.settings !== false) {
    const clay = createSurface('plaster', { color: 0xc9b79c, seed: seed + 4 });
    const bowl = new Mesh(new SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), clay);
    bowl.rotation.x = Math.PI;
    bowl.position.y = height + 0.17;
    group.add(bowl);
  }

  const focus = focusAt(group, 0, height + 0.12, 0);
  return {
    object: group,
    obstacleRadius: style === 'round' ? 1.35 : 1.65,
    slots: seats,
    seats,
    focus,
  };
}

// ---- picnic table ------------------------------------------------------

export interface PicnicTableOptions extends GatheringOptions {
  /** Places, split between the two benches. Default 6. */
  seats?: number;
}

/** A trestle top with the benches built on — six round it, elbow to elbow. */
export function createPicnicTable(options: PicnicTableOptions = {}): Gathering {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const count = Math.max(2, Math.min(8, options.seats ?? 6));
  const perSide = Math.ceil(count / 2);
  const length = Math.max(1.8, perSide * 0.62 + 0.4);

  const group = new Group();
  group.name = 'picnic-table';
  const plank = createSurface('plank', { color: palette.wood, seed });
  const dark = createSurface('wood', { color: palette.woodDark, seed: seed + 1 });
  const topY = 0.74;
  const seatY = 0.45;

  const board = new Mesh(new BoxGeometry(length, 0.07, 0.78), plank);
  board.position.y = topY;
  group.add(board);
  for (const side of [-1, 1]) {
    const bench = new Mesh(new BoxGeometry(length, 0.06, 0.3), plank);
    bench.position.set(0, seatY, side * 0.72);
    group.add(bench);
  }
  // A-frames: the splayed legs that make a picnic table a picnic table.
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const leg = new Mesh(new BoxGeometry(0.09, 1.0, 0.1), dark);
      leg.position.set(end * (length / 2 - 0.24), topY / 2, side * 0.42);
      leg.rotation.x = -side * 0.62;
      group.add(leg);
    }
    const brace = new Mesh(new BoxGeometry(0.08, 0.08, 1.5), dark);
    brace.position.set(end * (length / 2 - 0.24), seatY + 0.02, 0);
    group.add(brace);
  }

  const seats: PropSlot[] = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const index = Math.floor(i / 2);
    const span = perSide === 1 ? 0 : (index / (perSide - 1) - 0.5) * (length - 0.7);
    // Benches have no chair to shove about, so the slack shows up as people
    // sitting a little apart, or a little too close.
    const x = span + rng.range(-0.07, 0.07);
    const z = side * 0.72;
    const rotY = side > 0 ? Math.PI : 0;
    const slot = createSlot('seat', 'sit', group, x, 0, z, rotY + rng.range(-0.12, 0.12));
    seats.push(addApproach(slot, group, rng.range(0.6, 0.8)));
  }

  const focus = focusAt(group, 0, topY + 0.1, 0);
  return { object: group, obstacleRadius: length / 2 + 0.5, slots: seats, seats, focus };
}

// ---- park bench --------------------------------------------------------

export interface LongBenchOptions extends GatheringOptions {
  /** Places along the bench. Default 3. */
  seats?: number;
  /** Slatted back and armrests. Default true. */
  back?: boolean;
}

/**
 * The park bench: several places on one continuous seat. Its slots are
 * deliberately *loose* — real strangers do not sit at even spacing, they
 * take the ends first and leave the middle for last. GAMA's `Occupancy`
 * does the choosing; the bench just offers the room.
 */
export function createLongBench(options: LongBenchOptions = {}): Gathering {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const count = Math.max(2, Math.min(6, options.seats ?? 3));
  const hasBack = options.back !== false;
  const length = count * 0.58 + 0.34;

  const group = new Group();
  group.name = 'long-bench';
  const plank = createSurface('plank', { color: palette.wood, seed });
  const iron = createSurface('metal', { color: palette.metal, seed: seed + 1 });
  const seatY = 0.44;

  for (let i = 0; i < 3; i++) {
    const slat = new Mesh(new BoxGeometry(length, 0.045, 0.14), plank);
    slat.position.set(0, seatY, (i - 1) * 0.16);
    group.add(slat);
  }
  if (hasBack) {
    for (let i = 0; i < 3; i++) {
      const slat = new Mesh(new BoxGeometry(length, 0.12, 0.04), plank);
      slat.position.set(0, seatY + 0.22 + i * 0.16, -0.26);
      slat.rotation.x = 0.14;
      group.add(slat);
    }
  }
  for (const end of [-1, 1]) {
    const frame = new Mesh(new BoxGeometry(0.06, seatY, 0.42), iron);
    frame.position.set(end * (length / 2 - 0.09), seatY / 2, 0);
    group.add(frame);
    if (hasBack) {
      const post = new Mesh(new BoxGeometry(0.05, 0.56, 0.05), iron);
      post.position.set(end * (length / 2 - 0.09), seatY + 0.28, -0.24);
      post.rotation.x = 0.14;
      group.add(post);
      const arm = new Mesh(new BoxGeometry(0.05, 0.05, 0.44), iron);
      arm.position.set(end * (length / 2 - 0.09), seatY + 0.24, -0.02);
      group.add(arm);
    }
  }

  const seats: PropSlot[] = [];
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1) - 0.5) * (length - 0.62);
    const slot = createSlot('seat', 'sit', group, x, 0, 0.02, rng.range(-0.1, 0.1));
    // Approached from the front: the backrest is behind, so that is the only
    // way onto it — walk up, turn round, sit down.
    seats.push(addApproach(slot, group, rng.range(0.6, 0.78), 'front'));
  }

  const focus = focusAt(group, 0, 1.2, 2.4); // what a bench faces: the view
  return { object: group, obstacleRadius: length / 2 + 0.2, slots: seats, seats, focus };
}

// ---- two-player game ---------------------------------------------------

export type BoardGame = 'chess' | 'cards' | 'dice';

export interface GameTableOptions extends GatheringOptions {
  /** What is being played. Default 'chess'. */
  game?: BoardGame;
}

/**
 * Two stools and a small table between them — the two-player prop. Both
 * seats face each other across a shared `focus` (the board), which is
 * what makes the pair read as *opponents* rather than two people who both
 * happen to be sitting down.
 */
export function createGameTable(options: GameTableOptions = {}): Gathering {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const game = options.game ?? 'chess';

  const group = new Group();
  group.name = `game-${game}`;
  const plank = createSurface('plank', { color: palette.wood, seed });
  const dark = createSurface('wood', { color: palette.woodDark, seed: seed + 1 });
  const topY = 0.72;

  const board = new Mesh(new BoxGeometry(0.82, 0.06, 0.82), plank);
  board.position.y = topY;
  group.add(board);
  const stem = new Mesh(new CylinderGeometry(0.08, 0.11, topY, 7), dark);
  stem.position.y = topY / 2;
  const foot = new Mesh(new CylinderGeometry(0.3, 0.34, 0.06, 8), dark);
  foot.position.y = 0.03;
  group.add(stem, foot);

  const surfaceY = topY + 0.035;
  if (game === 'chess') {
    const light = createSurface('plaster', { color: 0xe6dcc6, seed: seed + 2 });
    const shade = createSurface('wood', { color: 0x4a3729, seed: seed + 3 });
    const field = new Mesh(new BoxGeometry(0.56, 0.012, 0.56), light);
    field.position.y = surfaceY;
    field.rotation.y = rng.range(-0.05, 0.05); // never laid down square
    group.add(field);
    const square = new InstancedMesh(new BoxGeometry(0.068, 0.014, 0.068), shade, 32);
    const m = new Matrix4();
    let n = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 0) continue;
        m.setPosition((col - 3.5) * 0.07, surfaceY + 0.002, (row - 3.5) * 0.07);
        square.setMatrixAt(n++, m);
      }
    }
    square.instanceMatrix.needsUpdate = true;
    square.rotation.y = field.rotation.y;
    group.add(square);
    // Men on the board — thinned out, because a game in progress has losses.
    for (const side of [-1, 1]) {
      const men = new InstancedMesh(
        new CylinderGeometry(0.017, 0.023, 0.05, 6),
        side > 0 ? light : shade,
        8
      );
      let k = 0;
      for (let col = 0; col < 8; col++) {
        if (rng.next() < 0.25) continue;
        m.makeTranslation(
          (col - 3.5) * 0.07,
          surfaceY + 0.03,
          side * (2.5 - Math.floor(rng.next() * 2)) * 0.07
        );
        men.setMatrixAt(k++, m);
      }
      for (let rest = k; rest < 8; rest++) men.setMatrixAt(rest, m.makeScale(0, 0, 0));
      men.instanceMatrix.needsUpdate = true;
      men.rotation.y = field.rotation.y;
      group.add(men);
    }
  } else if (game === 'cards') {
    const face = createSurface('plaster', { color: 0xf2ead8, seed: seed + 2 });
    for (let i = 0; i < 7; i++) {
      const card = new Mesh(new BoxGeometry(0.09, 0.004, 0.13), face);
      card.position.set(rng.range(-0.22, 0.22), surfaceY + 0.004 * i, rng.range(-0.18, 0.18));
      card.rotation.y = rng.range(0, Math.PI);
      group.add(card);
    }
  } else {
    const bone = createSurface('plaster', { color: 0xefe6d2, seed: seed + 2 });
    const cup = new Mesh(new CylinderGeometry(0.05, 0.06, 0.1, 8), dark);
    cup.position.set(rng.range(-0.2, 0.2), surfaceY + 0.05, rng.range(-0.2, 0.2));
    group.add(cup);
    for (let i = 0; i < 3; i++) {
      const die = new Mesh(new BoxGeometry(0.035, 0.035, 0.035), bone);
      die.position.set(rng.range(-0.24, 0.24), surfaceY + 0.018, rng.range(-0.24, 0.24));
      die.rotation.set(0, rng.range(0, Math.PI), 0);
      group.add(die);
    }
  }

  const seats: PropSlot[] = [];
  for (const side of [1, -1]) {
    const z = side * 0.78;
    seats.push(
      seatChair(group, rng, rng.range(-0.06, 0.06), z, side > 0 ? Math.PI : 0, {
        seed,
        palette,
        style: 'stool',
      })
    );
  }

  const focus = focusAt(group, 0, surfaceY + 0.05, 0);
  return { object: group, obstacleRadius: 1.15, slots: seats, seats, focus };
}

// ---- ring of seats round a fire ---------------------------------------

export interface CampCircleOptions extends GatheringOptions {
  /** Log seats in the ring. Default 5. */
  seats?: number;
  /** Ring radius in metres. Default 1.9. */
  radius?: number;
}

/**
 * Logs and stumps ringing a fire pit — the oldest gathering there is.
 * The ring is deliberately gappy and uneven; drop a `createCampfire` at
 * the origin and the `focus` is already aimed at the flames.
 */
export function createCampCircle(options: CampCircleOptions = {}): Gathering {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const count = Math.max(2, Math.min(9, options.seats ?? 5));
  const radius = options.radius ?? 1.9;

  const group = new Group();
  group.name = 'camp-circle';
  const bark = createSurface('wood', { color: palette.trunk, seed });
  const stone = createSurface('stone', { color: palette.rock[0], seed: seed + 1 });

  // The fire ring: stones set by hand, so no two the same or evenly spaced.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const r = rng.range(0.5, 0.6);
    const size = rng.range(0.09, 0.16);
    const rock = new Mesh(new BoxGeometry(size, size * 0.8, size), stone);
    rock.position.set(Math.sin(a) * r, size * 0.35, Math.cos(a) * r);
    rock.rotation.set(rng.range(-0.2, 0.2), a, rng.range(-0.2, 0.2));
    group.add(rock);
  }

  const seats: PropSlot[] = [];
  for (let i = 0; i < count; i++) {
    // A gap in the ring where the wood ran out — rings are never closed.
    const a = (i / count) * Math.PI * 2 + rng.range(-0.16, 0.16);
    const r = radius + rng.range(-0.15, 0.15);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const rotY = a + Math.PI;
    const logLength = rng.range(0.7, 1.15);
    const log = new Mesh(new CylinderGeometry(0.17, 0.19, logLength, 7), bark);
    log.position.set(x, 0.17, z);
    log.rotation.set(0, rotY, Math.PI / 2); // felled: lying across the facing
    group.add(log);
    const slot = createSlot('seat', 'sitLow', group, x, 0, z, rotY + rng.range(-0.14, 0.14));
    seats.push(addApproach(slot, group, rng.range(0.6, 0.85)));
  }

  const focus = focusAt(group, 0, 0.4, 0);
  return { object: group, obstacleRadius: radius + 0.4, slots: seats, seats, focus };
}
