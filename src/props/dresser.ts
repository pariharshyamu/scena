import {
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import {
  createPropSurface,
  createSlot,
  addApproach,
  type Carryable,
  type Prop,
  type PropSlot,
  type PropSurface,
} from '../core/types';

/**
 * Dressers, racks and rails — storage that **shows what is in it**.
 *
 * Every storage prop the library has so far is a box that opens: a chest, a
 * drawer, a cupboard, a `Manipulable` whose whole job is to hide its
 * contents until somebody operates it. A kitchen is the opposite. The room
 * is arranged so that the things you use most are visible and within reach,
 * and a dresser with nothing on it is a bookcase.
 *
 * So this track's contribution is the vertical counterpart to `dress`:
 *
 * ```ts
 * dress(table.surfaces[0], things);   // puts things DOWN on a surface
 * stock(dresser, things);             // puts things AWAY — on shelves,
 *                                     // in grooves, on hooks
 * ```
 *
 * `dress` only knows about horizontal surfaces. Half of a kitchen's storage
 * is neither: plates stand **on edge** in the grooves of a rack, pans **hang**
 * from a rail, and a wall cupboard's shelves are **behind a door** and
 * therefore not on display at all until it is opened. A `StorageSpace`
 * carries all three of those distinctions, and `hidden` is live — shut the
 * cupboard and what is in it stops counting as shown.
 *
 * ```ts
 * const dresser = createDresser({ kind: 'welsh' });
 * stock(dresser, createKitchenware({ count: 14 }), { seed: 3 });
 * dresser.shown;   // how much of it a person can actually see
 * ```
 */

export type DresserKind =
  /** A Welsh dresser: a cupboard base, and open plate shelves above. */
  | 'welsh'
  /** A wall-hung plate rack — grooves, and nothing else. */
  | 'plateRack'
  /** A hanging rail of S-hooks for pans and tools. */
  | 'potRail'
  /** A run of modern wall cabinets. Doors, so nothing is on show. */
  | 'wallUnit'
  /** A tall larder cupboard for dry goods. Deep shelves, behind doors. */
  | 'pantry';

export type SpaceKind =
  /** Sits on it, the way it was built. */
  | 'shelf'
  /** Stands ON EDGE in it — a plate rack, a tray slot. */
  | 'groove'
  /** Hangs from it, by its top. */
  | 'hook'
  /** Sits in it, and is hidden whether or not there is a door. */
  | 'drawer';

/** A cupboard door or a drawer front — structurally a `Manipulable`. */
export interface DresserDoor {
  readonly state: number;
  readonly open: boolean;
  toggle(): boolean;
  set(target: number | boolean): void;
  update(dt: number): void;
  onChange?: (open: boolean) => void;
  object: Object3D;
}

/** Somewhere one thing goes. */
export interface StorageSpace {
  kind: SpaceKind;
  /** Where the thing sits, stands or hangs from. A child of the prop. */
  anchor: Object3D;
  /** Clear height above a shelf, or the drop below a hook, in metres. */
  clear: number;
  /** Clear width along the anchor's x, in metres. */
  width: number;
  /** What is in it, or null. */
  held: Object3D | null;
  /**
   * Is it out of sight?
   *
   * **Live**, not a constant: shut the cupboard door and everything on its
   * shelves stops being on display. This is the distinction the whole track
   * turns on, because it is the difference between a dresser and a cupboard.
   */
  readonly hidden: boolean;
}

export interface Storage extends Prop {
  kind: DresserKind;
  spaces: StorageSpace[];
  /** Doors, where it has any. Operate them like any other `Manipulable`. */
  doors: DresserDoor[];
  /** Worktops and shelf tops you can also `dress`. */
  surfaces: PropSurface[];
  /** Where somebody stands to reach it. */
  slot: PropSlot;
  readonly used: number;
  readonly free: number;
  /** How many of the things in it are actually visible right now. */
  readonly shown: number;
  /**
   * Put something away. Picks the first free space it fits, optionally of a
   * given kind. Returns the space, or null if nothing would take it.
   */
  put(item: Prop | Object3D, kind?: SpaceKind): StorageSpace | null;
  /** Take it back out. Returns what was there, unparented. */
  take(space: StorageSpace): Object3D | null;
  update(dt: number): void;
}

interface KindSpec {
  width: number;
  depth: number;
  height: number;
  /** Height of the underside, for the wall-hung ones. */
  base: number;
  doors: number;
  /** Shelves behind the doors. */
  inner: number;
  /** Open shelves. */
  open: number;
  grooves: number;
  hooks: number;
  drawers: number;
  /** Is there a worktop you can put things down on? */
  worktop: boolean;
}

/**
 * The kind table.
 *
 * The `doors` column is the one that matters, and it is not a styling
 * choice: a `welsh` dresser and a `wallUnit` hold about the same amount, and
 * one of them is furniture you look at while the other is a box on a wall.
 * Everything downstream — what `shown` reports, what a room reads as, what
 * `stock` is even worth doing to it — follows from that column.
 */
const KINDS: Record<DresserKind, KindSpec> = {
  welsh: {
    width: 1.2, depth: 0.46, height: 2.0, base: 0,
    doors: 2, inner: 1, open: 3, grooves: 5, hooks: 4, drawers: 2, worktop: true,
  },
  plateRack: {
    width: 0.72, depth: 0.2, height: 0.52, base: 1.28,
    doors: 0, inner: 0, open: 0, grooves: 8, hooks: 0, drawers: 0, worktop: false,
  },
  potRail: {
    width: 1.15, depth: 0.12, height: 0.1, base: 1.72,
    doors: 0, inner: 0, open: 0, grooves: 0, hooks: 7, drawers: 0, worktop: false,
  },
  wallUnit: {
    width: 1.0, depth: 0.34, height: 0.74, base: 1.38,
    doors: 2, inner: 3, open: 0, grooves: 0, hooks: 0, drawers: 0, worktop: false,
  },
  pantry: {
    width: 0.82, depth: 0.5, height: 2.05, base: 0,
    doors: 2, inner: 5, open: 0, grooves: 0, hooks: 0, drawers: 0, worktop: false,
  },
};

export interface DresserOptions {
  kind?: DresserKind;
  seed?: number;
  palette?: Palette;
  /** Paint/timber colour. Defaults per kind. */
  color?: number;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** A hinged leaf or a sliding drawer, shaped exactly like `Manipulable`. */
function makeJoint(
  pivot: Group,
  apply: (t: number, pivot: Group) => void,
  speed = 3
): DresserDoor {
  let target = 0;
  let state = 0;
  const api: DresserDoor = {
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
      apply(smooth(state), pivot);
    },
  };
  return api;
}

/** Measure an object in its own space, with any previous placement undone. */
function sizeOf(object: Object3D): { size: Vector3; min: Vector3 } {
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0, 0);
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object);
  return { size: box.getSize(new Vector3()), min: box.min.clone() };
}

const objectOf = (item: Prop | Object3D): Object3D =>
  (item as Prop).object instanceof Object3D ? (item as Prop).object : (item as Object3D);

/**
 * A dresser, rack, rail or cupboard.
 *
 * The origin is on the floor at the centre of the front face, facing +z into
 * the room — the same as the stove, the cold store and the sink, **including
 * the wall-hung kinds**. A plate rack's origin is on the floor below it, not
 * at the bracket, so a kitchen wall is a row of these at the same y with no
 * arithmetic.
 */
export function createDresser(options: DresserOptions = {}): Storage {
  const kind = options.kind ?? 'welsh';
  const spec = KINDS[kind];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = `dresser-${kind}`;

  const W = spec.width;
  const D = spec.depth;
  const H = spec.height;
  const B = spec.base;
  const T = 0.026;

  const body =
    kind === 'wallUnit'
      ? createSurface('paint', { seed, color: options.color ?? 0xe6e3dc })
      : createSurface('wood', { seed, color: options.color ?? palette.wood });
  const dark = createSurface('wood', { seed: seed + 1, color: palette.woodDark });
  const metal = createSurface('metal', { seed: seed + 2, color: 0x8d939a });

  const spaces: StorageSpace[] = [];
  const doors: DresserDoor[] = [];
  const surfaces: PropSurface[] = [];

  /**
   * Build a space.
   *
   * `door` is captured rather than copied, so `hidden` follows the door for
   * the life of the prop. A boolean snapshotted at build time would report a
   * shut cupboard forever, however often the thing is opened.
   */
  const addSpace = (
    spaceKind: SpaceKind,
    x: number,
    y: number,
    z: number,
    clear: number,
    width: number,
    door: DresserDoor | null
  ): StorageSpace => {
    const anchor = new Object3D();
    anchor.name = `space:${spaceKind}`;
    anchor.position.set(x, y, z);
    group.add(anchor);
    const space: StorageSpace = {
      kind: spaceKind,
      anchor,
      clear,
      width,
      held: null,
      get hidden() {
        // A drawer is out of sight whether or not it has a front on it.
        if (spaceKind === 'drawer') return !(door?.open ?? false);
        return door !== null && !door.open;
      },
    };
    spaces.push(space);
    return space;
  };

  /** A carcass: five panels around a hole, never a solid box. */
  const carcass = (y0: number, y1: number, depth: number, zBack: number): void => {
    const h = y1 - y0;
    for (const [w, hh, d, x, y, z] of [
      [T, h, depth, -W / 2 + T / 2, (y0 + y1) / 2, zBack - depth / 2],
      [T, h, depth, W / 2 - T / 2, (y0 + y1) / 2, zBack - depth / 2],
      [W, h, T, 0, (y0 + y1) / 2, zBack - depth + T / 2],
      [W, T, depth, 0, y1 - T / 2, zBack - depth / 2],
      [W, T, depth, 0, y0 + T / 2, zBack - depth / 2],
    ] as Array<[number, number, number, number, number, number]>) {
      const m = new Mesh(new BoxGeometry(w, hh, d), body);
      m.position.set(x, y, z);
      group.add(m);
    }
  };

  /** A pair of doors on the front of a carcass between y0 and y1. */
  const hangDoors = (y0: number, y1: number, count: number, z: number): DresserDoor[] => {
    const made: DresserDoor[] = [];
    const leafW = (W - 0.02) / count;
    for (let i = 0; i < count; i++) {
      // Hinged on the OUTER edge of each leaf, so a pair opens outward like a
      // pair rather than both swinging the same way like a saloon.
      const side = count === 1 ? -1 : i === 0 ? -1 : 1;
      const hx = -W / 2 + 0.01 + i * leafW + (side < 0 ? 0 : leafW);
      const pivot = new Group();
      pivot.position.set(hx, 0, z);
      group.add(pivot);
      const leaf = new Mesh(new BoxGeometry(leafW - 0.006, y1 - y0 - 0.01, 0.022), body);
      leaf.position.set((-side * leafW) / 2, (y0 + y1) / 2, 0.012);
      pivot.add(leaf);
      const panel = new Mesh(
        new BoxGeometry((leafW - 0.006) * 0.72, (y1 - y0 - 0.01) * 0.78, 0.008),
        dark
      );
      panel.position.set((-side * leafW) / 2, (y0 + y1) / 2, 0.026);
      pivot.add(panel);
      const knob = new Mesh(new SphereGeometry(0.016, 8, 6), metal);
      knob.position.set((-side * leafW) / 2 + side * (leafW / 2 - 0.05), (y0 + y1) / 2, 0.03);
      pivot.add(knob);
      made.push(makeJoint(pivot, (t, p) => (p.rotation.y = -side * t * 1.85)));
    }
    return made;
  };

  if (kind === 'welsh') {
    const baseTop = 0.9;
    carcass(0, baseTop, D, 0);
    const cupboardDoors = hangDoors(0.24, baseTop - 0.16, spec.doors, 0);
    doors.push(...cupboardDoors);
    // Hidden shelf inside the base.
    const midY = 0.24 + (baseTop - 0.4) / 2;
    const shelfBoard = new Mesh(new BoxGeometry(W - T * 2, 0.02, D - T * 2), body);
    shelfBoard.position.set(0, midY, -D / 2);
    group.add(shelfBoard);
    addSpace('shelf', 0, midY + 0.01, -D / 2, 0.3, W - 0.1, cupboardDoors[0] ?? null);

    // The drawer row.
    for (let i = 0; i < spec.drawers; i++) {
      const dw = (W - 0.04) / spec.drawers;
      const dx = -W / 2 + 0.02 + dw * (i + 0.5);
      const pivot = new Group();
      pivot.position.set(dx, baseTop - 0.08, 0);
      group.add(pivot);
      const front = new Mesh(new BoxGeometry(dw - 0.01, 0.11, 0.02), body);
      front.position.z = 0.011;
      pivot.add(front);
      const pull = new Mesh(new CylinderGeometry(0.008, 0.008, dw * 0.4, 6), metal);
      pull.rotation.z = Math.PI / 2;
      pull.position.z = 0.03;
      pivot.add(pull);
      // A drawer box, so an open drawer is not a hole with a face floating
      // in front of it.
      for (const [w, h, dd, x, y, z] of [
        [dw - 0.02, 0.012, D * 0.8, 0, -0.05, -D * 0.4],
        [0.01, 0.09, D * 0.8, -(dw - 0.02) / 2, 0, -D * 0.4],
        [0.01, 0.09, D * 0.8, (dw - 0.02) / 2, 0, -D * 0.4],
      ] as Array<[number, number, number, number, number, number]>) {
        const m = new Mesh(new BoxGeometry(w, h, dd), dark);
        m.position.set(x, y, z);
        pivot.add(m);
      }
      const drawer = makeJoint(pivot, (t, p) => (p.position.z = t * D * 0.62));
      doors.push(drawer);
      addSpace('drawer', dx, baseTop - 0.13, -D * 0.4, 0.085, dw - 0.05, drawer);
    }

    // The worktop, which is also a surface you can `dress`.
    const top = new Mesh(new BoxGeometry(W + 0.04, 0.03, D + 0.03), dark);
    top.position.set(0, baseTop + 0.015, -D / 2);
    group.add(top);
    surfaces.push(createPropSurface('worktop', group, 0, baseTop + 0.03, -D * 0.45, W * 0.86, D * 0.7));

    // The open plate shelves above — the point of a dresser.
    const upperD = D * 0.52;
    const back = new Mesh(new BoxGeometry(W - 0.04, H - baseTop - 0.04, 0.014), body);
    back.position.set(0, (baseTop + H) / 2, -upperD + 0.007);
    group.add(back);
    for (const s of [-1, 1]) {
      const side = new Mesh(new BoxGeometry(0.02, H - baseTop - 0.04, upperD), body);
      side.position.set((s * (W - 0.04)) / 2, (baseTop + H) / 2, -upperD / 2);
      group.add(side);
    }
    const cornice = new Mesh(new BoxGeometry(W + 0.02, 0.04, upperD + 0.02), dark);
    cornice.position.set(0, H - 0.02, -upperD / 2);
    group.add(cornice);

    const shelfGap = (H - 0.06 - (baseTop + 0.06)) / spec.open;
    for (let i = 0; i < spec.open; i++) {
      const y = baseTop + 0.06 + shelfGap * i;
      const board = new Mesh(new BoxGeometry(W - 0.06, 0.018, upperD - 0.01), body);
      board.position.set(0, y, -upperD / 2);
      group.add(board);
      // A groove strip at the back: the ledge plates lean against, and the
      // reason a dresser displays crockery instead of storing it.
      const lip = new Mesh(new BoxGeometry(W - 0.06, 0.014, 0.012), dark);
      lip.position.set(0, y + 0.016, -upperD + 0.05);
      group.add(lip);
      surfaces.push(
        createPropSurface(`shelf${i}`, group, 0, y + 0.01, -upperD * 0.42, W * 0.8, upperD * 0.6)
      );
      addSpace('shelf', 0, y + 0.01, -upperD * 0.36, shelfGap - 0.05, W - 0.12, null);
      // …and grooves on the back half of the same shelf.
      const per = Math.max(1, Math.round(spec.grooves / spec.open));
      for (let g = 0; g < per && spaces.filter((sp) => sp.kind === 'groove').length < spec.grooves; g++) {
        const gx = -W / 2 + 0.12 + ((W - 0.24) * (g + 0.5)) / per;
        addSpace('groove', gx, y + 0.02, -upperD + 0.075, shelfGap - 0.06, (W - 0.24) / per, null);
      }
    }
    // Cup hooks under the lowest open shelf.
    for (let i = 0; i < spec.hooks; i++) {
      const hx = -W / 2 + 0.14 + ((W - 0.28) * i) / Math.max(1, spec.hooks - 1);
      const hy = baseTop + 0.06 + shelfGap - 0.03;
      const hook = new Mesh(new TorusGeometry(0.016, 0.003, 4, 8, Math.PI * 1.4), metal);
      hook.rotation.set(Math.PI / 2, 0, 0);
      hook.position.set(hx, hy, -upperD * 0.45);
      group.add(hook);
      addSpace('hook', hx, hy - 0.02, -upperD * 0.45, shelfGap - 0.12, (W - 0.28) / spec.hooks, null);
    }
  } else if (kind === 'plateRack') {
    // A frame of dowels on the wall. Every space is a groove and nothing is
    // hidden — it is a rack, it has no secrets.
    const frameY = B + H / 2;
    for (const s of [-1, 1]) {
      const side = new Mesh(new BoxGeometry(0.022, H, D), body);
      side.position.set((s * (W - 0.02)) / 2, frameY, -D / 2);
      group.add(side);
    }
    for (const y of [B + 0.03, B + H - 0.03]) {
      const rail = new Mesh(new BoxGeometry(W, 0.022, D), body);
      rail.position.set(0, y, -D / 2);
      group.add(rail);
    }
    const per = spec.grooves;
    for (let i = 0; i <= per; i++) {
      const x = -W / 2 + 0.04 + ((W - 0.08) * i) / per;
      for (const z of [-D + 0.05, -0.05]) {
        const dowel = new Mesh(new CylinderGeometry(0.007, 0.007, H - 0.08, 6), dark);
        dowel.position.set(x, frameY, z);
        group.add(dowel);
      }
    }
    for (let i = 0; i < per; i++) {
      const x = -W / 2 + 0.04 + ((W - 0.08) * (i + 0.5)) / per;
      addSpace('groove', x, B + 0.05, -D / 2, H - 0.1, (W - 0.08) / per, null);
    }
  } else if (kind === 'potRail') {
    const railY = B;
    const rail = new Mesh(new CylinderGeometry(0.013, 0.013, W, 10), metal);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, railY, -D / 2);
    group.add(rail);
    for (const s of [-1, 1]) {
      const bracket = new Mesh(new BoxGeometry(0.018, 0.1, 0.018), metal);
      bracket.position.set((s * W) / 2 - s * 0.05, railY + 0.05, -D / 2);
      group.add(bracket);
      const arm = new Mesh(new BoxGeometry(0.018, 0.018, D), metal);
      arm.position.set((s * W) / 2 - s * 0.05, railY + 0.1, -D / 2);
      group.add(arm);
    }
    for (let i = 0; i < spec.hooks; i++) {
      const x = -W / 2 + 0.1 + ((W - 0.2) * i) / Math.max(1, spec.hooks - 1);
      // An S-hook, drawn as a hook rather than a peg, because a straight peg
      // with a pan on it reads as a pan stuck to the wall.
      const s1 = new Mesh(new TorusGeometry(0.019, 0.0035, 4, 9, Math.PI * 1.3), metal);
      s1.rotation.set(Math.PI / 2, 0, Math.PI);
      s1.position.set(x, railY - 0.016, -D / 2);
      group.add(s1);
      const s2 = new Mesh(new TorusGeometry(0.019, 0.0035, 4, 9, Math.PI * 1.3), metal);
      s2.rotation.set(Math.PI / 2, 0, 0);
      s2.position.set(x, railY - 0.05, -D / 2);
      group.add(s2);
      addSpace('hook', x, railY - 0.07, -D / 2, 0.42, (W - 0.2) / spec.hooks, null);
    }
  } else {
    // wallUnit and pantry: a carcass with doors, and everything inside is
    // hidden until they are open.
    carcass(B, B + H, D, 0);
    const leaves = hangDoors(B + 0.01, B + H - 0.01, spec.doors, 0);
    doors.push(...leaves);
    const gap = (H - 0.12) / spec.inner;
    for (let i = 0; i < spec.inner; i++) {
      const y = B + 0.08 + gap * i;
      const board = new Mesh(new BoxGeometry(W - T * 2, 0.018, D - T * 2), body);
      board.position.set(0, y, -D / 2);
      group.add(board);
      // Each shelf belongs to the door that covers it: a two-door pantry with
      // one leaf open shows half its contents, which is the correct answer
      // and not one a single boolean could give.
      const owner = leaves[Math.min(leaves.length - 1, i % Math.max(1, leaves.length))] ?? null;
      addSpace('shelf', 0, y + 0.009, -D / 2, gap - 0.04, W - 0.1, owner);
    }
    if (kind === 'pantry') {
      const plinth = new Mesh(new BoxGeometry(W * 0.94, 0.06, D * 0.9), dark);
      plinth.position.set(0, 0.03, -D / 2);
      group.add(plinth);
    }
  }

  const standAt = createSlot('reach', 'work', group, 0, 0, 0.6, Math.PI);
  addApproach(standAt, group, 0.55, 'behind');

  const held = new Map<StorageSpace, Object3D>();

  const api: Storage = {
    object: group,
    obstacleRadius: B > 0.6 ? 0 : Math.max(W, D) * 0.55,
    kind,
    spaces,
    doors,
    surfaces,
    slot: standAt,
    slots: [standAt],
    get used() {
      return spaces.filter((s) => s.held !== null).length;
    },
    get free() {
      return spaces.filter((s) => s.held === null).length;
    },
    get shown() {
      return spaces.filter((s) => s.held !== null && !s.hidden).length;
    },
    put(item: Prop | Object3D, want?: SpaceKind) {
      const object = objectOf(item);
      const { size, min } = sizeOf(object);
      for (const space of spaces) {
        if (space.held) continue;
        if (want && space.kind !== want) continue;

        if (space.kind === 'groove') {
          // ON EDGE. A plate laid flat in a plate rack is a plate on a shelf
          // and the rack might as well not be there.
          //
          // The axis matters and it is not the obvious one. A rack's slots
          // run front to back, and plates go in side by side ALONG the rack —
          // so the plate turns about z, not x, and what has to fit the slot
          // width is its THICKNESS while what has to fit the clear height is
          // its diameter. Turning it about x instead lays each plate across
          // the slots like a bridge, and the fit test then measures the wrong
          // two numbers and rejects everything.
          if (size.y > space.width || size.x > space.clear) continue;
          object.rotation.set(rng.range(-0.07, 0.07), 0, Math.PI / 2);
          object.updateMatrixWorld(true);
          const box = new Box3().setFromObject(object);
          object.position.set(
            space.anchor.position.x,
            space.anchor.position.y - box.min.y,
            space.anchor.position.z
          );
        } else if (space.kind === 'hook') {
          if (size.y > space.clear || size.x > space.width) continue;
          // Hung by its TOP, and off-square. A row of pans all hanging plumb
          // is a shop display.
          object.rotation.set(0, rng.range(-0.35, 0.35), rng.range(-0.1, 0.1));
          object.updateMatrixWorld(true);
          const box = new Box3().setFromObject(object);
          object.position.set(
            space.anchor.position.x,
            space.anchor.position.y - box.max.y,
            space.anchor.position.z
          );
        } else {
          if (size.y > space.clear || size.x > space.width) continue;
          object.rotation.set(0, rng.range(-0.4, 0.4), 0);
          object.position.set(
            space.anchor.position.x + rng.range(-1, 1) * Math.max(0, (space.width - size.x) * 0.3),
            space.anchor.position.y - min.y,
            space.anchor.position.z
          );
        }
        group.add(object);
        space.held = object;
        held.set(space, object);
        return space;
      }
      return null;
    },
    take(space: StorageSpace) {
      const object = held.get(space) ?? null;
      if (!object) return null;
      group.remove(object);
      held.delete(space);
      space.held = null;
      return object;
    },
    update(dt: number) {
      for (const d of doors) d.update(dt);
    },
  };
  return api;
}

export interface StockOptions {
  /** Fill at most this share of the spaces, 0–1. Default 0.72. */
  density?: number;
  /** Restrict to these kinds of space. */
  only?: SpaceKind[];
  seed?: number;
}

/**
 * Put things away — the vertical counterpart to `dress`.
 *
 * `dress` arranges items on a horizontal surface. Half of what a kitchen
 * holds is not on one: plates stand on edge, pans hang, jars go behind a
 * door. `stock` walks the spaces instead, tries each item into the first one
 * that will take it, and **deliberately leaves gaps** — a dresser with
 * something in every single space is a shop, and the density default is
 * there for the same reason `dress` has one.
 *
 * Returns what it actually placed. Anything that would not fit is left
 * unparented and simply missing from the result.
 */
export function stock(
  storage: Storage,
  items: Array<Prop | Object3D>,
  options: StockOptions = {}
): Object3D[] {
  const rng = new Rng(options.seed ?? 1);
  const density = Math.min(1, Math.max(0, options.density ?? 0.72));
  const only = options.only;

  const usable = storage.spaces.filter((s) => s.held === null && (!only || only.includes(s.kind)));
  const budget = Math.round(usable.length * density);
  if (budget <= 0) return [];

  // Shuffle which spaces get used, so the gaps are scattered rather than all
  // at the end — a dresser filled front-to-back has one empty shelf, which
  // reads as an unfinished dresser rather than a used one.
  const order = usable.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const open = new Set(order.slice(0, budget));

  const placed: Object3D[] = [];
  for (const item of items) {
    if (placed.length >= budget) break;
    let seated: StorageSpace | null = null;
    for (const space of storage.spaces) {
      if (!open.has(space) || space.held) continue;
      seated = storage.put(item, space.kind);
      // `put` scans from the start, so it may have landed somewhere other
      // than the space we were offering. That is fine — it is still a space
      // we meant to fill — but stop looking once it is in.
      if (seated) break;
    }
    if (seated) placed.push(seated.held!);
  }
  return placed;
}

// --------------------------------------------------------------- the things

export type UtensilStyle = 'ladle' | 'skimmer' | 'spoon' | 'knife' | 'board' | 'sieve';

export interface UtensilOptions {
  style?: UtensilStyle;
  seed?: number;
  palette?: Palette;
}

/**
 * A kitchen tool, built **handle up**.
 *
 * That is the one decision in here. A ladle hangs from its handle with the
 * bowl below, and it also stands in a jar the same way up — so a single
 * model works both hung and put down, and `stock` needs no per-prop hook
 * point to hang it by. It just uses the top of the bounding box.
 */
export function createUtensil(options: UtensilOptions = {}): Carryable {
  const style = options.style ?? 'ladle';
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = `utensil-${style}`;
  const steel = new MeshStandardMaterial({
    color: 0xb4bac0,
    roughness: 0.34,
    metalness: 0.6,
    flatShading: true,
  });
  const wood = createSurface('wood', { seed, color: palette.woodDark });

  const handleFor = (length: number, top: number): void => {
    const h = new Mesh(new CylinderGeometry(0.008, 0.0095, length, 6), wood);
    h.position.y = top - length / 2;
    group.add(h);
    // The hanging hole, and it is not decoration: without it a hung utensil
    // reads as a stick balanced on a hook.
    const eye = new Mesh(new TorusGeometry(0.009, 0.002, 4, 8), steel);
    eye.rotation.x = Math.PI / 2;
    eye.position.y = top - 0.004;
    group.add(eye);
  };

  if (style === 'board') {
    const slab = new Mesh(new BoxGeometry(0.2, 0.3, 0.016), wood);
    slab.position.y = 0.15;
    group.add(slab);
    const hole = new Mesh(new TorusGeometry(0.016, 0.004, 4, 10), wood);
    hole.rotation.x = Math.PI / 2;
    hole.position.y = 0.295;
    group.add(hole);
  } else if (style === 'knife') {
    handleFor(0.11, 0.3);
    const blade = new Mesh(new BoxGeometry(0.035, 0.16, 0.003), steel);
    blade.position.y = 0.11;
    group.add(blade);
  } else if (style === 'sieve') {
    handleFor(0.1, 0.3);
    const mesh = new Mesh(new SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel);
    mesh.material.side = 2;
    mesh.position.y = 0.19;
    group.add(mesh);
    const rim = new Mesh(new TorusGeometry(0.06, 0.004, 4, 14), steel);
    rim.position.y = 0.19;
    group.add(rim);
  } else {
    const long = style === 'spoon' ? 0.19 : 0.16;
    handleFor(long, 0.32);
    const bowl =
      style === 'ladle'
        ? new Mesh(new SphereGeometry(0.042, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel)
        : style === 'skimmer'
          ? new Mesh(new CylinderGeometry(0.05, 0.05, 0.008, 12), steel)
          : new Mesh(new SphereGeometry(0.036, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel);
    if (style !== 'skimmer') bowl.material.side = 2;
    bowl.position.y = 0.32 - long;
    bowl.scale.set(1, style === 'spoon' ? 0.6 : 1, style === 'spoon' ? 1.35 : 1);
    group.add(bowl);
  }
  group.rotation.y = rng.range(0, 0.4);

  return { object: group, obstacleRadius: 0, carry: 'side', rest: 'upright' };
}

export interface CrockeryOptions {
  /** A single plate, a stack of them, or a stack of bowls. */
  style?: 'plate' | 'stack' | 'bowls';
  /** How many in a stack. Default 4. */
  count?: number;
  seed?: number;
  palette?: Palette;
}

/**
 * Plates and bowls.
 *
 * A single `plate` is what goes in a rack groove; a `stack` is what goes on
 * a shelf. They are the same object at different counts, which is exactly
 * why a rack and a shelf are different kinds of space rather than the same
 * one with a flag.
 */
export function createCrockery(options: CrockeryOptions = {}): Carryable {
  const style = options.style ?? 'stack';
  const count = style === 'plate' ? 1 : Math.max(1, options.count ?? 4);
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);

  const group = new Group();
  group.name = `crockery-${style}`;
  const glaze = createSurface('glaze', {
    seed,
    color: rng.next() < 0.4 ? 0xe8e2d4 : rng.next() < 0.5 ? 0xdfe8ea : 0xf2efe8,
  });

  for (let i = 0; i < count; i++) {
    const piece =
      style === 'bowls'
        ? new Mesh(new CylinderGeometry(0.072, 0.045, 0.05, 14), glaze)
        : new Mesh(new CylinderGeometry(0.088, 0.07, 0.013, 16), glaze);
    const step = style === 'bowls' ? 0.026 : 0.015;
    piece.position.set(rng.range(-0.004, 0.004), 0.008 + i * step, rng.range(-0.004, 0.004));
    piece.rotation.y = rng.range(0, 3);
    group.add(piece);
  }

  return { object: group, obstacleRadius: 0, carry: 'crate', rest: 'upright' };
}

export interface KitchenwareOptions {
  /** How many pieces. Default 10. */
  count?: number;
  seed?: number;
  palette?: Palette;
}

/**
 * The kitchen dress kit: a mixed set of things a kitchen actually holds.
 *
 * Weighted rather than uniform, because a real kitchen is mostly crockery
 * with a few tools in it, and an even draw across six utensil styles and
 * three crockery styles gives you a hardware display.
 */
export function createKitchenware(options: KitchenwareOptions = {}): Carryable[] {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const count = options.count ?? 10;

  const utensils: UtensilStyle[] = ['ladle', 'skimmer', 'spoon', 'knife', 'board', 'sieve'];
  const out: Carryable[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rng.next();
    if (roll < 0.34) {
      out.push(createCrockery({ style: 'plate', seed: seed * 17 + i, palette }));
    } else if (roll < 0.52) {
      out.push(createCrockery({ style: 'stack', count: 3 + Math.floor(rng.next() * 3), seed: seed * 17 + i, palette }));
    } else if (roll < 0.64) {
      out.push(createCrockery({ style: 'bowls', count: 2 + Math.floor(rng.next() * 3), seed: seed * 17 + i, palette }));
    } else {
      out.push(
        createUtensil({ style: utensils[Math.floor(rng.next() * utensils.length)], seed: seed * 17 + i, palette })
      );
    }
  }
  return out;
}

export const DRESSER_KINDS: DresserKind[] = ['welsh', 'plateRack', 'potRail', 'wallUnit', 'pantry'];
export const UTENSIL_STYLES: UtensilStyle[] = ['ladle', 'skimmer', 'spoon', 'knife', 'board', 'sieve'];
