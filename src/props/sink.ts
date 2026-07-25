import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createFill, createSteam, type Fill, type Steam } from './waterworks';
import { createTap, type Tap } from './washing';
import { makeBurst, type Burst, type WorkStation } from './workstations';
import {
  addApproach,
  createPropSurface,
  createSlot,
  type Prop,
  type PropSlot,
  type PropSurface,
} from '../core/types';

/**
 * The sink, and the washing-up.
 *
 * `createBasin` already exists and this is deliberately not it. A basin is
 * about **water**: taps, a level, a plug. A sink is about the **pile of
 * dishes** — the water is only the thing that makes the pile go down, and
 * how good the water is decides how fast.
 *
 * So this is a `WorkStation` like the chopping block and the prep bench, but
 * with one difference that turns it into a track of its own: **the cycle
 * time is not a constant.** Every other work loop in the library grinds at a
 * fixed rate forever. Here the rate is a product of what is in the bowl:
 *
 * ```
 * rate = (water > 0) × (1 − soil × 0.75) × (0.5 + hot × 0.5)
 * ```
 *
 * No water and nothing happens at all. Fresh hot water is four times faster
 * than a cold grey bowlful, and every plate you wash makes the water a
 * little worse — so at some point you stop, pull the plug, and run another
 * lot. That decision is the game, and none of it is a re-skin of a basin.
 *
 * The era axis is the same shape as the stove's and the cold store's, and it
 * ends the same way: the modern one **takes the loop away**. A dishwasher is
 * not a faster sink, it is a door, a capacity and a wait.
 *
 * ```ts
 * const sink = createWashUp({ era: 'sink' });
 * sink.load(10);
 * sink.taps[0].set(true);
 * sink.onYield = (n) => console.log('washed', n);
 * game.onUpdate((t) => sink.update(t.delta, cook.atSink));
 * ```
 */

export type SinkEra =
  /** A stone trough. No tap and no drain: water is carried in and baled out. */
  | 'trough'
  /** A deep butler sink with one cold tap. Hot water arrives in a kettle. */
  | 'scullery'
  /** A double bowl, a mixer, a draining board. Hot water on demand. */
  | 'sink'
  /** A machine. Load it, shut it, start it, walk away. */
  | 'dishwasher';

/**
 * A pile of things to wash and a pile of things that are washed.
 *
 * Deliberately a **count**, not a list of objects. What a game wants from
 * the sink is "are the dishes done", and making the caller hand over twelve
 * `Carryable`s to get twelve back is ceremony around a number.
 */
export interface WashQueue {
  /** Waiting to be washed. */
  readonly dirty: number;
  /** Washed, and still sitting there until somebody puts them away. */
  readonly clean: number;
  /** How many it holds at once. */
  readonly capacity: number;
  /** Put dirty things in. Returns how many it actually took. */
  load(count?: number): number;
  /** Take the clean ones away. Returns how many it actually gave. */
  collect(count?: number): number;
}

/** The machine door — structurally a `Manipulable`, like every other one. */
export interface SinkDoor {
  readonly state: number;
  readonly open: boolean;
  toggle(): boolean;
  set(target: number | boolean): void;
  update(dt: number): void;
  onChange?: (open: boolean) => void;
  object: Object3D;
}

export interface WashUp extends Prop, WorkStation, WashQueue {
  era: SinkEra;
  /** Water in the bowl, 0–1. */
  readonly water: number;
  /** How grey it is, 0 (fresh) to 1 (finished). Every plate adds to it. */
  readonly soil: number;
  /** Heat left in it, 0–1. It goes cold on its own, fast in a stone trough. */
  readonly hot: number;
  /**
   * Run water in. `hot` is what came out of it — 1 from a plumbed hot tap or
   * a kettle off the stove, 0 from a bucket. New water **dilutes** what is
   * already there rather than replacing it, so topping up a filthy bowl
   * helps a bit and never as much as emptying it.
   */
  fill(amount: number, hot?: number): void;
  /** Pull the plug. Takes the heat and the dirt with it. */
  empty(): void;
  /** Taps to operate. **Empty on `trough`** — that is the point of it. */
  taps: Tap[];
  /** The draining board clean things stack on. Also published in `surfaces`. */
  board: PropSurface | null;
  /** The machine's door. Null on everything you wash by hand. */
  door: SinkDoor | null;
  /**
   * Start a cycle. Returns false if it will not go: door open, nothing in
   * it, or already running. A no-op on the eras you wash by hand.
   */
  start(): boolean;
  readonly running: boolean;
  /** Cycle progress, 0–1. Always 0 on the hand eras. */
  readonly cycle: number;
  /** Steam off hot water, or out of a machine that has just finished. */
  steam: Steam;
  /** Where somebody stands. */
  slot: PropSlot;
  /** Fired when a machine cycle finishes. */
  onDone?: () => void;
  /** Advance it. `working` gates the scrubbing, not the machine. */
  update(dt: number, working?: boolean): void;
}

interface EraSpec {
  /** Seconds per item in perfect water. The rate scales this. */
  scrub: number;
  /** Items one bowlful will do before it is grey. */
  perFill: number;
  /** Water each item uses up. */
  usePerItem: number;
  /** Heat lost per second. A stone trough is a radiator. */
  cool: number;
  capacity: number;
  taps: number;
  /** Does the tap deliver hot? On a scullery it does not — that is a kettle. */
  plumbedHot: boolean;
  hasBoard: boolean;
  machine: boolean;
  /** Seconds for a machine cycle. */
  cycleFor: number;
  width: number;
  depth: number;
  height: number;
  /** How deep the bowl is below the counter. */
  bowl: number;
}

/**
 * The era table, and as always every number is a gameplay decision.
 *
 * `perFill` is the interesting column. A stone trough does six things before
 * the water is filthy and a modern sink does fourteen, not because the
 * porcelain is better but because a trough holds less and you were never
 * going to carry more. It is the same shape as the icebox's block of ice:
 * the medieval end of every one of these axes is a **resource you have to
 * keep going and fetch**.
 */
const ERAS: Record<SinkEra, EraSpec> = {
  trough: {
    scrub: 2.2, perFill: 6, usePerItem: 0.09, cool: 0.055, capacity: 8,
    taps: 0, plumbedHot: false, hasBoard: false, machine: false, cycleFor: 0,
    width: 1.0, depth: 0.52, height: 0.82, bowl: 0.2,
  },
  scullery: {
    scrub: 1.8, perFill: 10, usePerItem: 0.06, cool: 0.03, capacity: 12,
    taps: 1, plumbedHot: false, hasBoard: true, machine: false, cycleFor: 0,
    width: 0.94, depth: 0.56, height: 0.9, bowl: 0.26,
  },
  sink: {
    scrub: 1.4, perFill: 14, usePerItem: 0.045, cool: 0.02, capacity: 16,
    taps: 1, plumbedHot: true, hasBoard: true, machine: false, cycleFor: 0,
    width: 1.26, depth: 0.6, height: 0.9, bowl: 0.18,
  },
  dishwasher: {
    scrub: 0, perFill: 0, usePerItem: 0, cool: 0, capacity: 12,
    taps: 0, plumbedHot: true, hasBoard: false, machine: true, cycleFor: 45,
    width: 0.6, depth: 0.6, height: 0.86, bowl: 0,
  },
};

export interface SinkOptions {
  era?: SinkEra;
  /** Start with dirty things in it. Default 0. */
  dirty?: number;
  /** Start with water in the bowl, 0–1. Default 0. */
  water?: number;
  /** How fast a fully open tap fills it, in levels per second. Default 0.3. */
  rate?: number;
  seed?: number;
  palette?: Palette;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** The drop-front door of a machine, hinged along its bottom edge. */
function makeFlap(pivot: Group, swing: number, speed = 2.4): SinkDoor {
  let target = 0;
  let state = 0;
  const api: SinkDoor = {
    object: pivot,
    get state() {
      return state;
    },
    get open() {
      return target > 0.5;
    },
    toggle() {
      const next = !(target > 0.5);
      api.set(next);
      return next;
    },
    set(value: number | boolean) {
      const was = target > 0.5;
      target = typeof value === 'boolean' ? (value ? 1 : 0) : clamp01(value);
      if (was !== target > 0.5) api.onChange?.(target > 0.5);
    },
    update(dt: number) {
      state += (target - state) * Math.min(1, dt * speed);
      pivot.rotation.x = smooth(state) * swing;
    },
  };
  return api;
}

/**
 * A sink, trough, scullery bowl or dishwasher.
 *
 * The origin is on the floor at the centre of the front face, facing +z out
 * into the room — the same convention as the stove and the cold store, so a
 * kitchen wall is a row of these with no arithmetic.
 */
export function createWashUp(options: SinkOptions = {}): WashUp {
  const era = options.era ?? 'sink';
  const spec = ERAS[era];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const fillRate = options.rate ?? 0.3;

  const group = new Group();
  group.name = `washup-${era}`;

  const W = spec.width;
  const D = spec.depth;
  const H = spec.height;

  const carcass =
    era === 'trough'
      ? createSurface('stone', { seed, color: palette.rock[1] })
      : era === 'scullery'
        ? createSurface('wood', { seed, color: palette.wood })
        : createSurface('paint', { seed, color: 0xe4e7ea });
  const ware =
    era === 'trough'
      ? createSurface('stone', { seed: seed + 1, color: palette.rock[0] })
      : era === 'scullery'
        ? createSurface('glaze', { seed: seed + 1 })
        : // NOT stock 'steel'. At metalness 0.92 with no environment map a
          // stainless worktop renders near-black at any glancing angle — the
          // same trap the range hit — and the first render of the double sink
          // was a slab of tarmac with a tap on it.
          createSurface('steel', { seed: seed + 1, metalness: 0.4, roughness: 0.36 });
  const metal = createSurface('chrome', { seed: seed + 2 });
  const timber = createSurface('teak', { seed: seed + 3 });

  const bursts: Burst[] = [];
  const dirtyStack: Object3D[] = [];
  const cleanStack: Object3D[] = [];
  const taps: Tap[] = [];
  let fill: Fill | null = null;
  let sudsMat: MeshStandardMaterial | null = null;
  let suds: Mesh | null = null;
  let waterMat: MeshStandardMaterial | null = null;
  let board: PropSurface | null = null;
  /** Where the washing bowl is, so the suds can sit on it. */
  let bowlX = 0;
  let door: SinkDoor | null = null;
  let rack: Group | null = null;
  let lampMat: MeshStandardMaterial | null = null;

  const plateGeom = new CylinderGeometry(0.085, 0.07, 0.014, 14);
  const plateMat = createSurface('glaze', { seed: seed + 4 });

  if (spec.machine) {
    // ---- the machine ---------------------------------------------------
    // Five walls around a hole, as ever: a solid box with a door painted on
    // it has nowhere for the rack to be, and the moment the door drops the
    // render shows a slab.
    const T = 0.05;
    for (const [w, h, d, x, y, z] of [
      [T, H, D, -W / 2 + T / 2, H / 2, -D / 2],
      [T, H, D, W / 2 - T / 2, H / 2, -D / 2],
      [W, H, T, 0, H / 2, -D + T / 2],
      [W, T, D, 0, H - T / 2, -D / 2],
      [W, T, D, 0, T / 2, -D / 2],
    ] as Array<[number, number, number, number, number, number]>) {
      const m = new Mesh(new BoxGeometry(w, h, d), carcass);
      m.position.set(x, y, z);
      group.add(m);
    }
    const cavity = new MeshStandardMaterial({
      color: 0xb9c1c6,
      roughness: 0.3,
      metalness: 0.6,
      side: DoubleSide,
    });
    const backLiner = new Mesh(new BoxGeometry(W - T * 2, H - T * 2, 0.004), cavity);
    backLiner.position.set(0, H / 2, -D + T + 0.005);
    group.add(backLiner);

    // The rack rides OUT with the door. A machine whose door drops to reveal
    // an empty black hole is a cupboard with a hinge.
    const pivot = new Group();
    pivot.position.set(0, T, 0);
    group.add(pivot);
    const leaf = new Mesh(new BoxGeometry(W - 0.01, H - T, 0.04), carcass);
    leaf.position.set(0, (H - T) / 2, 0.02);
    pivot.add(leaf);
    const handle = new Mesh(new CylinderGeometry(0.013, 0.013, W * 0.7, 8), metal);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0, H - T - 0.08, 0.06);
    pivot.add(handle);
    // The indicator: the machine's only visible state, and it needs one,
    // because a cycle you cannot see is a forty-five second nothing.
    lampMat = new MeshStandardMaterial({
      color: 0x2a3a30,
      roughness: 0.4,
      emissive: 0x33ff88,
      emissiveIntensity: 0,
    });
    const lamp = new Mesh(new BoxGeometry(0.05, 0.014, 0.006), lampMat);
    lamp.position.set(-W / 2 + 0.12, H - T - 0.16, 0.042);
    pivot.add(lamp);

    rack = new Group();
    rack.position.set(0, 0.28, -D / 2);
    group.add(rack);
    for (let i = 0; i < 9; i++) {
      const tine = new Mesh(new CylinderGeometry(0.004, 0.004, 0.3, 5), metal);
      tine.rotation.x = Math.PI / 2;
      tine.position.set(-W / 2 + 0.09 + i * ((W - 0.18) / 8), 0.02, 0);
      rack.add(tine);
    }
    for (const z of [-0.14, 0.14]) {
      const rail = new Mesh(new CylinderGeometry(0.005, 0.005, W - 0.14, 5), metal);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, 0.04, z);
      rack.add(rail);
    }
    // Plates stand ON EDGE in a rack. Lying flat they read as a stack of
    // coins and the rack reads as a shelf.
    for (let i = 0; i < spec.capacity; i++) {
      const plate = new Mesh(plateGeom, plateMat);
      plate.rotation.z = Math.PI / 2;
      plate.position.set(-W / 2 + 0.1 + (i % 9) * ((W - 0.2) / 8), 0.12, i < 9 ? -0.07 : 0.07);
      plate.visible = false;
      rack.add(plate);
      dirtyStack.push(plate);
    }
    door = makeFlap(pivot, Math.PI / 2);
  } else {
    // ---- a bowl you stand at --------------------------------------------
    /**
     * The worktop is a FRAME AROUND A HOLE, not a slab with a bowl parked on
     * top of it.
     *
     * This is the defect the library keeps rediscovering — the pot, the
     * pool, the oven, the sunken bath, the fridge — and it caught this prop
     * too. The first version built a solid counter box and then placed the
     * bowl at its centre, which put the bowl *inside* solid geometry: from
     * above, four sinks that were four worktops. Everything below the bowl
     * floor is solid; everything beside it is solid; the aperture itself has
     * nothing in it at all.
     */
    const bowls =
      era === 'sink'
        ? [
            { x: -0.254 * W, w: 0.397 * W },
            { x: 0.127 * W, w: 0.27 * W },
          ]
        : era === 'scullery'
          ? [{ x: -0.16 * W, w: 0.6 * W }]
          : [{ x: 0, w: 0.68 * W }];
    const bd = D * 0.66;
    const bz = -D / 2;
    const floorY = H - spec.bowl;
    const wall = 0.018;
    const ax0 = Math.min(...bowls.map((b) => b.x - b.w / 2));
    const ax1 = Math.max(...bowls.map((b) => b.x + b.w / 2));
    const az0 = bz - bd / 2;
    const az1 = bz + bd / 2;

    // Solid below the bowls.
    const plinth = new Mesh(new BoxGeometry(W, floorY, D), carcass);
    plinth.position.set(0, floorY / 2, -D / 2);
    group.add(plinth);
    // …and solid on all four sides of the aperture, full worktop height.
    const rim = H - floorY;
    for (const [w, d, cx, cz] of [
      [ax0 + W / 2, D, (-W / 2 + ax0) / 2, -D / 2],
      [W / 2 - ax1, D, (ax1 + W / 2) / 2, -D / 2],
      [ax1 - ax0, az0 + D, (ax0 + ax1) / 2, (-D + az0) / 2],
      [ax1 - ax0, -az1, (ax0 + ax1) / 2, az1 / 2],
    ] as Array<[number, number, number, number]>) {
      if (w <= 0.001 || d <= 0.001) continue;
      const block = new Mesh(new BoxGeometry(w, rim, d), carcass);
      block.position.set(cx, floorY + rim / 2, cz);
      group.add(block);
    }

    // The bowls themselves: a ware floor, and a ware liner on the inside
    // faces, because the frame's own faces point outward and are invisible
    // from where you are standing.
    const makeBowl = (cx: number, bw: number): void => {
      const f = new Mesh(new BoxGeometry(bw, 0.01, bd), ware);
      f.position.set(cx, floorY + 0.006, bz);
      group.add(f);
      for (const [w, d, ox, oz] of [
        [bw, wall, 0, -bd / 2 + wall / 2],
        [bw, wall, 0, bd / 2 - wall / 2],
        [wall, bd, -bw / 2 + wall / 2, 0],
        [wall, bd, bw / 2 - wall / 2, 0],
      ] as Array<[number, number, number, number]>) {
        const s = new Mesh(new BoxGeometry(w, rim, d), ware);
        s.position.set(cx + ox, floorY + rim / 2, bz + oz);
        group.add(s);
      }
    };
    for (const b of bowls) makeBowl(b.x, b.w);
    // The divider between a double sink's two bowls — the one piece the
    // aperture frame cannot supply.
    if (bowls.length > 1) {
      const gapMid = (bowls[0].x + bowls[0].w / 2 + (bowls[1].x - bowls[1].w / 2)) / 2;
      const gapW = bowls[1].x - bowls[1].w / 2 - (bowls[0].x + bowls[0].w / 2);
      if (gapW > 0.005) {
        const div = new Mesh(new BoxGeometry(gapW, rim, bd), ware);
        div.position.set(gapMid, floorY + rim / 2, bz);
        group.add(div);
      }
    }
    const bw = bowls[0].w;
    const bx = bowls[0].x;
    bowlX = bx;

    fill = createFill({
      width: bw - wall * 2,
      length: bd - wall * 2,
      depth: spec.bowl - 0.02,
      level: 0,
      color: 0x5f8fa4,
      seed,
      palette,
    });
    fill.object.position.set(bx, floorY + 0.006, bz);
    group.add(fill.object);
    // Reach in for the water's material once, so `soil` can grey it. The
    // level alone is not a reading of how filthy it is, and grey water is
    // the only thing on screen that says "change me".
    fill.object.traverse((c) => {
      if (!waterMat && (c as Mesh).isMesh) waterMat = (c as Mesh).material as MeshStandardMaterial;
    });

    sudsMat = new MeshStandardMaterial({
      color: 0xf6f8f7,
      roughness: 0.95,
      transparent: true,
      opacity: 0,
      flatShading: true,
    });
    // Foam clumps rather than one flat lid: a white slab lying on the water
    // is indistinguishable from the water, which is how the first render of
    // this came out.
    suds = new Group() as unknown as Mesh;
    for (let i = 0; i < 7; i++) {
      const clump = new Mesh(
        new BoxGeometry(rng.range(0.05, 0.13), rng.range(0.012, 0.026), rng.range(0.05, 0.12)),
        sudsMat
      );
      clump.position.set(
        rng.range(-1, 1) * (bw * 0.32),
        rng.range(0, 0.012),
        rng.range(-1, 1) * (bd * 0.3)
      );
      clump.rotation.y = rng.range(0, 3);
      suds.add(clump);
    }
    suds.visible = false;
    group.add(suds);

    // Dirty things leaning in the bowl, one per item waiting.
    for (let i = 0; i < spec.capacity; i++) {
      const plate = new Mesh(plateGeom, plateMat);
      plate.rotation.set(rng.range(-0.3, 0.3), rng.range(0, 3), Math.PI / 2 + rng.range(-0.5, 0.5));
      plate.position.set(
        bx + rng.range(-bw * 0.3, bw * 0.3),
        floorY + 0.05 + (i % 3) * 0.02,
        bz + rng.range(-bd * 0.28, bd * 0.28)
      );
      plate.visible = false;
      group.add(plate);
      dirtyStack.push(plate);
    }

    if (spec.hasBoard) {
      // Beside the aperture, on the solid part of the worktop — which is
      // exactly where the frame above left room for it.
      const boardX = (ax1 + W / 2) / 2;
      const bwid = (W / 2 - ax1) * 0.86;
      if (era === 'sink') {
        // A ribbed steel drainer, tilted so it runs back into the bowl.
        const slab = new Mesh(new BoxGeometry(bwid, 0.012, bd), ware);
        slab.position.set(boardX, H + 0.006, bz);
        slab.rotation.z = 0.04;
        group.add(slab);
        for (let i = 0; i < 5; i++) {
          const rib = new Mesh(new BoxGeometry(bwid * 0.88, 0.005, 0.009), ware);
          rib.position.set(boardX, H + 0.014, bz - bd / 2 + 0.06 + i * (bd / 6));
          group.add(rib);
        }
      } else {
        // A scullery's board is a teak plank laid on the worktop.
        const slab = new Mesh(new BoxGeometry(bwid, 0.018, bd * 0.85), timber);
        slab.position.set(boardX, H + 0.009, bz);
        group.add(slab);
      }
      board = createPropSurface('drainer', group, boardX, H + 0.02, bz, bwid * 0.9, bd * 0.8);
      // Clean things stack up here — the strongest read in the prop, because
      // it is the only one that shows the WORK rather than the water.
      for (let i = 0; i < spec.capacity; i++) {
        const plate = new Mesh(plateGeom, plateMat);
        // A STACK, not a scatter. Spread across the board they overlap into
        // one white smear and the count is unreadable; piled up, the height
        // of the pile is the count.
        plate.position.set(
          boardX + rng.range(-0.006, 0.006),
          H + 0.03 + i * 0.015,
          bz + rng.range(-0.006, 0.006)
        );
        plate.rotation.y = rng.range(0, 3);
        plate.visible = false;
        group.add(plate);
        cleanStack.push(plate);
      }
    }

    for (let i = 0; i < spec.taps; i++) {
      const tap = createTap({
        style: era === 'sink' ? 'mixer' : 'crosshead',
        seed: seed + 10 + i,
        palette,
      });
      tap.object.position.set(bx, H, az0 - 0.05);
      group.add(tap.object);
      taps.push(tap);
    }

    const splash = makeBurst(rng, {
      origin: new Vector3(bx, floorY + spec.bowl * 0.8, bz),
      color: 0xbcd8e4,
      count: 12,
      size: 0.014,
      speed: 0.7,
      up: 1.1,
      life: 0.45,
    });
    group.add(splash.mesh);
    bursts.push(splash);
  }

  // Small and low. A bowl of hot water gives off a wisp; the stock size read
  // as a bank of fog hanging behind every unit in the row.
  const steam = createSteam({
    radius: W * 0.16,
    height: 0.34,
    count: 8,
    seed: seed + 6,
  });
  steam.object.position.set(0, H + 0.02, -D / 2);
  group.add(steam.object);

  const standAt = createSlot('wash', 'work', group, 0, 0, 0.56, Math.PI);
  standAt.loop = spec.machine ? 'stack' : 'scrub';
  addApproach(standAt, group, 0.55, 'behind');

  // ---- state -------------------------------------------------------------
  let dirty = Math.min(spec.capacity, Math.max(0, Math.round(options.dirty ?? 0)));
  let clean = 0;
  let water = clamp01(options.water ?? 0);
  let soil = 0;
  let heat = 0;
  let phase = 0;
  let total = 0;
  let running = false;
  let cycleAt = 0;
  const tool = new Object3D();
  tool.name = 'tool:cloth';
  tool.position.set(0, H + 0.04, -D / 2 + 0.08);
  group.add(tool);

  /**
   * How fast the scrubbing goes, as a multiple of the era's best.
   *
   * This function IS the track. Everything else is a container to hang it
   * on: no water and there is no washing-up, cold grey water is a quarter
   * the speed of fresh hot, and the way out of that is to stop and refill.
   */
  const rateNow = (): number => {
    if (spec.machine || water <= 0.02) return 0;
    return (1 - soil * 0.75) * (0.5 + heat * 0.5);
  };

  const api: WashUp = {
    object: group,
    obstacleRadius: Math.max(W, D) * 0.55,
    era,
    taps,
    board,
    surfaces: board ? [board] : [],
    door,
    steam,
    slot: standAt,
    slots: [standAt],
    tool,
    capacity: spec.capacity,
    get action() {
      return spec.machine ? 'stack' : 'scrub';
    },
    get progress() {
      return phase;
    },
    get dirty() {
      return dirty;
    },
    get clean() {
      return clean;
    },
    get water() {
      return water;
    },
    get soil() {
      return soil;
    },
    get hot() {
      return heat;
    },
    get running() {
      return running;
    },
    get cycle() {
      return spec.machine && spec.cycleFor > 0 ? clamp01(cycleAt / spec.cycleFor) : 0;
    },
    load(count = 1) {
      const took = Math.max(0, Math.min(Math.round(count), spec.capacity - dirty - clean));
      dirty += took;
      return took;
    },
    collect(count = Infinity) {
      const gave = Math.max(0, Math.min(Math.round(Math.min(count, clean)), clean));
      clean -= gave;
      return gave;
    },
    fill(amount: number, hotness = 0) {
      if (amount <= 0) return;
      const before = water;
      water = clamp01(water + amount);
      const added = water - before;
      if (added <= 0) return;
      // Mixing, not replacing. Adding half a bowl of clean hot water to a
      // grey cold one gives you something in between, which is exactly why
      // topping up is a worse move than emptying and starting again.
      heat = (heat * before + hotness * added) / water;
      soil = (soil * before) / water;
      fill?.fillBy(added);
    },
    empty() {
      water = 0;
      soil = 0;
      heat = 0;
      fill?.setLevel(0);
    },
    start() {
      if (!spec.machine || running || dirty <= 0) return false;
      // It will not run with the door hanging open, which is the whole
      // difference between a machine and a bowl.
      if (door?.open) return false;
      running = true;
      cycleAt = 0;
      return true;
    },
    update(dt: number, working = true) {
      if (dt <= 0) return;
      door?.update(dt);
      for (const t of taps) t.update(dt);
      for (const b of bursts) b.update(dt);

      // Taps run water in. A scullery tap is COLD — hot water is a kettle,
      // and that is the era, not a detail.
      let tapping = 0;
      for (const t of taps) tapping = Math.max(tapping, t.state);
      if (tapping > 0.02 && water < 1) {
        api.fill(tapping * fillRate * dt, spec.plumbedHot ? 0.9 : 0.05);
      }

      if (spec.machine) {
        if (running) {
          // Opening the door mid-cycle ABORTS it. They come out dirty,
          // because half-washed is dirty.
          if (door?.open) {
            running = false;
            cycleAt = 0;
          } else {
            cycleAt += dt;
            if (cycleAt >= spec.cycleFor) {
              total += dirty;
              clean += dirty;
              dirty = 0;
              running = false;
              cycleAt = 0;
              api.onYield?.(total);
              api.onDone?.();
            }
          }
        }
        phase = api.cycle;
      } else {
        // Hand washing. The rate is the whole point — see `rateNow`.
        const rate = rateNow();
        if (working && dirty > 0 && rate > 0) {
          phase += (dt / spec.scrub) * rate;
          while (phase >= 1 && dirty > 0) {
            phase -= 1;
            dirty -= 1;
            // Only count it as clean if there is somewhere to put it. On a
            // trough there is no board, so washed things simply leave.
            if (board) clean += 1;
            total += 1;
            soil = clamp01(soil + 1 / spec.perFill);
            water = Math.max(0, water - spec.usePerItem);
            fill?.setLevel(water);
            fill?.disturb(0.6);
            for (const b of bursts) b.emit(5);
            api.onYield?.(total);
          }
        } else {
          phase = 0;
        }
        // Water goes cold whether or not anybody is using it.
        heat = Math.max(0, heat - spec.cool * dt);
        fill?.setLevel(water);
        fill?.update(dt);
      }

      // ---- reads --------------------------------------------------------
      if (waterMat) {
        // Grey, and then frankly brown. The level says how much; the colour
        // is the only thing that says how much longer it is any use.
        waterMat.color.setRGB(
          0.37 + soil * 0.22,
          0.56 - soil * 0.16,
          0.64 - soil * 0.3
        );
      }
      if (suds && sudsMat) {
        // Suds are the first thing to go. A bowl still frothing after twelve
        // plates is a bowl that has not been used.
        const froth = clamp01(water * 2) * (1 - clamp01(soil * 1.4));
        suds.visible = froth > 0.02;
        sudsMat.opacity = froth * 0.85;
        suds.position.y = H - spec.bowl + 0.01 + water * (spec.bowl - 0.03);
        suds.position.x = bowlX;
        suds.position.z = -D / 2;
      }
      // In a machine, washed dishes do not leave the rack — they are still in
      // there until somebody unloads them. Showing only `dirty` emptied the
      // rack the instant the cycle finished, so the payoff for waiting
      // forty-five seconds was the dishes disappearing.
      const inBowl = spec.machine ? dirty + clean : dirty;
      for (let i = 0; i < dirtyStack.length; i++) dirtyStack[i].visible = i < inBowl;
      for (let i = 0; i < cleanStack.length; i++) cleanStack[i].visible = i < clean;
      if (rack && door) {
        // Out with the door, and only while it is genuinely open.
        rack.position.z = -D / 2 + smooth(door.state) * (D * 0.75);
      }
      if (lampMat) lampMat.emissiveIntensity = running ? 0.9 : 0;
      steam.setTarget(spec.machine ? (running && cycleAt > 2 ? 0.3 : 0) : water * heat * 0.45);
      steam.update(dt);
    },
  };
  return api;
}

/** A stone trough: no tap, no plug, and the water arrives in a bucket. */
export function createTrough(options: Omit<SinkOptions, 'era'> = {}): WashUp {
  return createWashUp({ ...options, era: 'trough' });
}

/**
 * A kitchen sink — `scullery` for the butler sink, `sink` for the double bowl.
 *
 * Named in full because `createSink` is already taken by the bathroom
 * washstand in `stations.ts`, and the two really are different props: that
 * one is somewhere to wash your hands, this one is somewhere to work.
 */
export function createKitchenSink(
  options: Omit<SinkOptions, 'era'> & { era?: 'scullery' | 'sink' } = {}
): WashUp {
  return createWashUp({ ...options, era: options.era ?? 'sink' });
}

/** The machine that takes the loop away. */
export function createDishwasher(options: Omit<SinkOptions, 'era'> = {}): WashUp {
  return createWashUp({ ...options, era: 'dishwasher' });
}

export const SINK_ERAS: SinkEra[] = ['trough', 'scullery', 'sink', 'dishwasher'];
