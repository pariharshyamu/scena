import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import {
  addApproach,
  createPropSurface,
  createSlot,
  type Prop,
  type PropSlot,
  type PropSurface,
} from '../core/types';

/**
 * Cold storage: the larder-to-freezer axis.
 *
 * The mirror of the heat track, and the differences are the interesting
 * part. Heat is a **surface** you put a pot on top of; cold is a **volume**
 * you put food inside, and the whole of it leaks the moment you open the
 * door. So the handshake gains a y:
 *
 * ```ts
 * chillAt(x, y, z): number   // °C at a world point, ambient outside
 * ```
 *
 * alongside `heatAt(x, z)` and `depthAt(x, z)`. It reports **°C**, not a
 * 0–1 dial, because unlike a fire's output there is a real scale here and
 * the entire game is played against thresholds on it: four degrees keeps
 * milk, minus eighteen keeps it for a year, and the line between them is a
 * phase change rather than "a bit colder".
 *
 * The era is not a finish. It is *what you have to do to keep the cold in*:
 *
 * - a **larder** has no mechanism at all and simply sits a few degrees under
 *   the room, so on a hot day it does nothing and that is the point;
 * - an **icebox** spends a block of ice, faster the more heat it absorbs —
 *   the fuel loop from the hearth, running backwards;
 * - a **fridge** holds a setpoint, cycling a compressor you cannot see;
 * - a **freezer** holds one far below zero and slowly ices itself up until
 *   somebody defrosts it.
 *
 * ```ts
 * const fridge = createColdStore({ era: 'fridge' });
 * fridge.door.toggle();                       // it leaks while it is open
 * game.onUpdate((t) => fridge.update(t.delta));
 * fridge.keepAt(milk.x, milk.y, milk.z);      // how fast the milk is going off
 * ```
 */

export type ColdEra =
  /** A cool stone cupboard with a marble slab and a mesh door. No mechanism. */
  | 'larder'
  /** An oak cabinet chilled by a block of ice that melts and must be replaced. */
  | 'icebox'
  /** A domestic refrigerator: a setpoint, a cycling compressor, a door light. */
  | 'fridge'
  /** A freezer, well below zero, that frosts up until it is defrosted. */
  | 'freezer';

/** The same four-state shape as the stove and the shower, running the other way. */
export type ColdState = 'warm' | 'chilling' | 'cold' | 'warming';

/**
 * How cold it is somewhere, in **world** coordinates.
 *
 * The preserving mirror of `HeatField`. Note that the neutral value is
 * **ambient**, not zero: `depthAt` and `heatAt` can return 0 for "nothing
 * here" because no water and no fire are genuinely nothing, but there is no
 * such thing as a place with no temperature. Outside the cabinet you get
 * the room.
 */
export interface ChillField {
  /** Temperature at a world point in °C. The ambient room anywhere outside. */
  chillAt(x: number, y: number, z: number): number;
  /**
   * How fast food spoils at a world point, **relative to the open bench**.
   *
   * 1 is sitting out at 20 °C; a fridge is about 0.3; a freezer is under
   * 0.01. Multiply a perishable's clock by it and the whole track becomes
   * one line of gameplay code.
   */
  keepAt(x: number, y: number, z: number): number;
}

/** The door — structurally a `Manipulable`, like every other hinged thing. */
export interface ColdDoor {
  readonly state: number;
  readonly open: boolean;
  toggle(): boolean;
  set(target: number | boolean): void;
  update(dt: number): void;
  onChange?: (open: boolean) => void;
  object: Object3D;
}

export interface ColdStore extends Prop, ChillField {
  era: ColdEra;
  readonly state: ColdState;
  /** Interior air temperature, °C. */
  readonly temperature: number;
  /** What it is trying to hold, °C. On a larder this floats with the room. */
  readonly setpoint: number;
  /** The room outside, °C. Writable: hand it your season or your weather. */
  ambient: number;
  door: ColdDoor;
  /** How long the door has been open, in seconds. 0 while it is shut. */
  readonly ajar: number;
  /**
   * Is the mechanism drawing power right now?
   *
   * A fridge does not run continuously — it cycles. This is the one reading
   * with no visual to go with it, deliberately: you *hear* a fridge. Wire it
   * to a hum and a power meter.
   */
  readonly running: boolean;
  /** Ice left, 0–1. Always 1 on the eras that are wired or need none. */
  readonly ice: number;
  /** Put a fresh block in. A no-op on anything but an icebox. */
  restock(amount?: number): void;
  /** Frost on the coils, 0–1. It chokes the cooling as it builds. */
  readonly frost: number;
  /** Scrape it out. */
  defrost(): void;
  /** Interior shelves, also published as `surfaces` so `dress` can fill them. */
  shelves: PropSurface[];
  /** The bulb, on the eras that have one. Comes on with the door. */
  light: PointLight | null;
  /** Where somebody stands to open it. */
  slot: PropSlot;
  onState?: (state: ColdState) => void;
  /** The door has been open too long. Fires once per opening. */
  onAlarm?: () => void;
  update(dt: number): void;
}

interface EraSpec {
  /** Target °C. On a larder this is read as "degrees under the room" instead. */
  setpoint: number;
  /** Passive: no mechanism, just sits this far below ambient. */
  passive: boolean;
  /** Heat leaking in through shut walls, as a fraction of the gap per second. */
  leak: number;
  /** …and with the door hanging open. */
  openLeak: number;
  /** °C per second the mechanism can pull, at full capacity. */
  pull: number;
  /** Does it spend ice? */
  usesIce: boolean;
  /** Kelvin-seconds of absorbed heat in a full block. */
  iceCapacity: number;
  /** Ice melts even doing nothing — it is cold and the world is not. K/s. */
  iceStanding: number;
  /** Frost per second while running. 0 where it is auto-defrosting or has no coil. */
  frostRate: number;
  /** Seconds the door may hang open before the alarm. 0 = it has no alarm. */
  alarmAfter: number;
  hasLight: boolean;
  shelves: number;
  width: number;
  depth: number;
  height: number;
}

/**
 * The era table. Every number here is a gameplay decision, not a datasheet.
 *
 * The `leak` column is the one that matters. A larder loses its whole gap to
 * the room in about twenty seconds, so it is never really cold; a freezer
 * holds for minutes. But `openLeak` is within a factor of three across all
 * four, because an open door is an open door — a £900 fridge standing open
 * is barely better than a stone cupboard, and that is the lesson the track
 * is built to teach.
 */
const ERAS: Record<ColdEra, EraSpec> = {
  larder: {
    setpoint: 6, passive: true, leak: 0.012, openLeak: 0.5, pull: 0,
    usesIce: false, iceCapacity: 0, iceStanding: 0, frostRate: 0, alarmAfter: 0, hasLight: false,
    shelves: 3, width: 0.92, depth: 0.46, height: 1.62,
  },
  icebox: {
    setpoint: 7, passive: false, leak: 0.014, openLeak: 0.34, pull: 0.55,
    usesIce: true, iceCapacity: 160, iceStanding: 0.06, frostRate: 0, alarmAfter: 0, hasLight: false,
    shelves: 2, width: 0.7, depth: 0.54, height: 1.16,
  },
  fridge: {
    setpoint: 4, passive: false, leak: 0.006, openLeak: 0.22, pull: 1.4,
    usesIce: false, iceCapacity: 0, iceStanding: 0, frostRate: 0.00025, alarmAfter: 25, hasLight: true,
    shelves: 4, width: 0.62, depth: 0.62, height: 1.76,
  },
  freezer: {
    setpoint: -18, passive: false, leak: 0.004, openLeak: 0.18, pull: 1.1,
    usesIce: false, iceCapacity: 0, iceStanding: 0, frostRate: 0.006, alarmAfter: 20, hasLight: true,
    shelves: 3, width: 0.62, depth: 0.62, height: 1.58,
  },
};

/**
 * The thermostat's dead band, in °C.
 *
 * It has to be a band on **both** sides of the setpoint. Switching off at
 * exactly the setpoint looks right and does not work: the leak adds a hair
 * every frame, so the interior never quite reaches the line and the
 * compressor runs forever. A real one overshoots below and coasts back up,
 * which is why you hear a fridge start and stop rather than hum steadily.
 */
const BAND_ON = 1.2;
const BAND_OFF = 0.5;

export interface ColdOptions {
  era?: ColdEra;
  /** The room, °C. Default 20. */
  ambient?: number;
  /** Start already down at temperature. Default true — a fridge in a kitchen is cold. */
  cold?: boolean;
  /** Start with a full block of ice. Default true. */
  iced?: boolean;
  /** Shelf count override. */
  shelves?: number;
  seed?: number;
  palette?: Palette;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Spoilage rate at `t` °C, relative to a bench at 20 °C.
 *
 * Q10: bacteria and the chemistry roughly halve for every ten degrees you
 * take off. That alone would make a freezer only twelve times better than a
 * worktop, which is nonsense — so freezing is modelled as what it actually
 * is, a **phase change** rather than more of the same. Once the water in the
 * food is solid nothing moves through it and the rate falls off a cliff.
 */
export function spoilRate(t: number): number {
  const q10 = Math.pow(2, (t - 20) / 10);
  // Smoothly over the two degrees below zero, so a fridge hovering at 0.5
  // does not flicker between two regimes.
  const frozen = smooth(clamp01(-t / 2));
  return q10 * (1 - frozen * 0.92);
}

/** A hinged door on a pivot at one edge, shaped exactly like `Manipulable`. */
function makeDoor(pivot: Group, swing: number, speed = 2.6): ColdDoor {
  let target = 0;
  let state = 0;
  const api: ColdDoor = {
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
      pivot.rotation.y = -smooth(state) * swing;
    },
  };
  return api;
}

/**
 * A larder, icebox, fridge or freezer.
 *
 * The origin is on the floor at the centre of the front face, facing +z out
 * into the room — the same convention as the stove, so the two stand side by
 * side without anybody doing arithmetic.
 */
export function createColdStore(options: ColdOptions = {}): ColdStore {
  const era = options.era ?? 'fridge';
  const spec = ERAS[era];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const shelfCount = options.shelves ?? spec.shelves;

  const group = new Group();
  group.name = `cold-${era}`;

  const W = spec.width;
  const D = spec.depth;
  const H = spec.height;
  /** Carcass thickness. The interior is this much smaller on every side. */
  const T = era === 'larder' ? 0.06 : 0.05;
  const base = era === 'larder' ? 0 : 0.08;

  const shell =
    era === 'larder'
      ? createSurface('stone', { seed, color: palette.rock[0] })
      : era === 'icebox'
        ? createSurface('wood', { seed, color: palette.woodDark })
        : createSurface('paint', { seed, color: era === 'freezer' ? 0xdfe3e6 : 0xeceff1 });
  const liner = new MeshStandardMaterial({
    // The icebox's zinc lining is DARK, and that is not period colour-matching
    // — a pale-grey block of ice against a pale-grey liner is nothing at all,
    // the same way white frost on a white freezer wall is nothing. The read
    // has to have something to be read against.
    color: era === 'larder' ? 0xb8b2a6 : era === 'icebox' ? 0x7c848b : 0xe8eef2,
    roughness: era === 'larder' ? 0.85 : 0.35,
    metalness: era === 'larder' ? 0 : 0.15,
  });
  const trim = createSurface(era === 'icebox' ? 'brass' : 'chrome', { seed: seed + 1 });
  const wire = new MeshStandardMaterial({ color: 0xcdd3d8, roughness: 0.4, metalness: 0.7 });

  /**
   * The carcass is FIVE WALLS AROUND A HOLE, not a box.
   *
   * This is the same defect that has bitten every container in the library —
   * the pot, the pool, the oven, the bath. A cabinet modelled as a solid box
   * with a door on it has nowhere to put anything, and the moment the door
   * swings the render shows a painted slab where the food should be.
   */
  const panel = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: MeshStandardMaterial
  ): Mesh => {
    const m = new Mesh(new BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  // Outer skin: two sides, a back, a top and a floor, leaving the front open.
  panel(T, H, D, -W / 2 + T / 2, H / 2, -D / 2, shell);
  panel(T, H, D, W / 2 - T / 2, H / 2, -D / 2, shell);
  panel(W, H, T, 0, H / 2, -D + T / 2, shell);
  panel(W, T, D, 0, H - T / 2, -D / 2, shell);
  panel(W, T, D, 0, base + T / 2, -D / 2, shell);
  if (base > 0) panel(W * 0.92, base, D * 0.9, 0, base / 2, -D / 2, trim);

  // Interior liner, inset — what you actually see when the door opens. Its
  // own surfaces face inward, so it is drawn DoubleSide rather than trusting
  // a box's outward normals to be visible from inside.
  const inner = { w: W - T * 2, h: H - base - T * 2, d: D - T * 1.5 };
  const innerY = base + T + inner.h / 2;
  const linerFaces = new MeshStandardMaterial().copy(liner);
  linerFaces.side = DoubleSide;
  const backPanel = new Mesh(new BoxGeometry(inner.w, inner.h, 0.004), linerFaces);
  backPanel.position.set(0, innerY, -D + T + 0.004);
  group.add(backPanel);
  for (const s of [-1, 1]) {
    const side = new Mesh(new BoxGeometry(0.004, inner.h, inner.d), linerFaces);
    side.position.set((s * inner.w) / 2, innerY, -D / 2);
    group.add(side);
  }

  // ---- shelves ---------------------------------------------------------
  const shelves: PropSurface[] = [];
  const shelfMat =
    era === 'larder'
      ? createSurface('marble', { seed: seed + 2 })
      : era === 'icebox'
        ? createSurface('wood', { seed: seed + 2, color: 0x8a6a44 })
        : wire;
  // The top of an icebox is the ice rack, so its shelves start lower.
  // An icebox loses its whole top third to the ice compartment, so its
  // shelves have to clear the rack — publishing a shelf with 16 cm of
  // headroom under a solid board is publishing a surface nothing fits on.
  const topRoom = era === 'icebox' ? 0.44 : 0.1;
  const shelfFrom = base + T + 0.17;
  const shelfSpan = Math.max(0.1, inner.h - topRoom - 0.32);
  const shelfYs: number[] = [];
  for (let i = 0; i < shelfCount; i++) {
    // SPAN the cavity rather than marching up from the bottom. Dividing by
    // the count instead of the gaps left a third of every cabinet empty above
    // the top shelf, and squeezed the lower ones close enough together that a
    // bottle stood on one went straight through the next.
    const y = shelfFrom + shelfSpan * (shelfCount === 1 ? 0.5 : i / (shelfCount - 1));
    shelfYs.push(y);
    if (era === 'fridge' || era === 'freezer') {
      // A wire grille, because a solid white slab in a white box reads as
      // nothing at all — there is no shadow to separate them.
      for (let b = 0; b < 7; b++) {
        const bar = new Mesh(new CylinderGeometry(0.004, 0.004, inner.d * 0.94, 5), shelfMat);
        bar.rotation.x = Math.PI / 2;
        bar.position.set(-inner.w / 2 + 0.03 + (b * (inner.w - 0.06)) / 6, y, -D / 2);
        group.add(bar);
      }
      for (const e of [-1, 1]) {
        const rail = new Mesh(new CylinderGeometry(0.005, 0.005, inner.w * 0.98, 5), shelfMat);
        rail.rotation.z = Math.PI / 2;
        rail.position.set(0, y, -D / 2 + (e * inner.d) / 2.4);
        group.add(rail);
      }
    } else {
      const slab = new Mesh(new BoxGeometry(inner.w * 0.98, 0.026, inner.d * 0.92), shelfMat);
      slab.position.set(0, y, -D / 2);
      group.add(slab);
    }
    shelves.push(createPropSurface(`shelf${i}`, group, 0, y + 0.015, -D / 2, inner.w * 0.9, inner.d * 0.85));
  }

  // ---- the ice block ---------------------------------------------------
  let iceMesh: Mesh | null = null;
  if (spec.usesIce) {
    const rack = new Mesh(new BoxGeometry(inner.w * 0.9, 0.012, inner.d * 0.8), trim);
    rack.position.set(0, base + T + inner.h - 0.3, -D / 2);
    group.add(rack);
    // Translucent, and it SHRINKS — the reading is its size, which is the
    // only honest way to show a resource that is literally consumed. Cut with
    // segments so flat shading gives it faceted edges: a smooth pale box has
    // no silhouette against a liner, and the first render of this was a blank
    // rectangle nobody could tell was there.
    iceMesh = new Mesh(
      new BoxGeometry(inner.w * 0.7, 0.2, inner.d * 0.62, 2, 2, 2),
      new MeshStandardMaterial({
        color: 0x9fd2e8,
        roughness: 0.18,
        metalness: 0.05,
        transparent: true,
        opacity: 0.85,
        flatShading: true,
      })
    );
    iceMesh.position.set(0, base + T + inner.h - 0.18, -D / 2);
    group.add(iceMesh);
  }

  // ---- frost -----------------------------------------------------------
  /**
   * Rime that grows on the interior. Scaled from nothing, so 0 really is 0.
   *
   * The first version was white cards on a white liner, which is to say it
   * was nothing — `frost` read 1.0 in the debug dump and the render showed a
   * clean freezer. Two things fix it: a **blue** white rather than a paper
   * one, and putting most of it on the SHELVES, where pale chunks sit against
   * dark wire instead of disappearing into the walls.
   */
  const frostBits: Mesh[] = [];
  if (spec.frostRate > 0) {
    const rime = new MeshStandardMaterial({
      color: 0xbcdcef,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    const addBit = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): void => {
      const bit = new Mesh(new BoxGeometry(w, h, d), rime);
      bit.position.set(x, y, z);
      // Jittered, because a wall of identically-square slabs reads as blue
      // tiling rather than as something that grew there.
      bit.rotation.set(rng.range(-0.25, 0.25), ry + rng.range(-0.4, 0.4), rng.range(-0.3, 0.3));
      bit.scale.setScalar(0.001);
      group.add(bit);
      frostBits.push(bit);
    };
    for (const y of shelfYs) {
      // Along the shelf: the high-contrast place, and where you would
      // actually find it.
      for (let i = 0; i < 4; i++) {
        addBit(
          rng.range(0.05, 0.11), rng.range(0.025, 0.06), rng.range(0.05, 0.12),
          rng.range(-inner.w / 2, inner.w / 2) * 0.8,
          y + 0.02,
          -D / 2 + rng.range(-0.16, 0.16)
        );
      }
    }
    for (let i = 0; i < 10; i++) {
      const wall = rng.next() < 0.5 ? 0 : rng.next() < 0.5 ? -1 : 1;
      const y = base + T + rng.range(0.1, inner.h - 0.1);
      if (wall === 0) {
        addBit(rng.range(0.06, 0.16), rng.range(0.04, 0.12), rng.range(0.03, 0.06),
          rng.range(-inner.w / 2, inner.w / 2) * 0.85, y, -D + T + 0.025);
      } else {
        addBit(rng.range(0.06, 0.14), rng.range(0.04, 0.12), rng.range(0.03, 0.06),
          (wall * inner.w) / 2 - wall * 0.02, y, -D / 2 + rng.range(-0.2, 0.2), Math.PI / 2);
      }
    }
  }

  // ---- the door --------------------------------------------------------
  /** Hinged at one edge — the pivot IS the hinge, and the leaf hangs off it. */
  const hingeSide = rng.next() < 0.5 ? -1 : 1;
  const pivot = new Group();
  pivot.position.set((hingeSide * W) / 2, 0, 0);
  group.add(pivot);
  const leafW = W - 0.01;
  const leafH = H - base;
  const leaf = new Group();
  leaf.position.set((-hingeSide * leafW) / 2, base + leafH / 2, 0.012);
  pivot.add(leaf);

  if (era === 'larder') {
    // A meat safe: a frame with a punched-tin lattice, so the larder is
    // ventilated — which is exactly why it can never get properly cold.
    const stile = 0.06;
    for (const [w, h, x, y] of [
      [stile, leafH, -leafW / 2 + stile / 2, 0],
      [stile, leafH, leafW / 2 - stile / 2, 0],
      [leafW, stile, 0, leafH / 2 - stile / 2],
      [leafW, stile, 0, -leafH / 2 + stile / 2],
    ] as Array<[number, number, number, number]>) {
      const bar = new Mesh(new BoxGeometry(w, h, 0.03), shell);
      bar.position.set(x, y, 0);
      leaf.add(bar);
    }
    const mesh = new MeshStandardMaterial({ color: 0x4a4438, roughness: 0.7, metalness: 0.4 });
    for (let i = 0; i < 9; i++) {
      const bar = new Mesh(new BoxGeometry(0.006, leafH - stile * 2, 0.006), mesh);
      bar.position.set(-leafW / 2 + stile + ((leafW - stile * 2) * (i + 0.5)) / 9, 0, 0);
      leaf.add(bar);
    }
  } else {
    const slab = new Mesh(new BoxGeometry(leafW, leafH, 0.045), shell);
    leaf.add(slab);
    if (era === 'icebox') {
      // A raised panel and brass hardware: the cabinetmaker's icebox.
      const inset = new Mesh(
        new BoxGeometry(leafW * 0.76, leafH * 0.84, 0.012),
        createSurface('wood', { seed: seed + 5, color: 0x4e3720 })
      );
      inset.position.z = 0.028;
      leaf.add(inset);
      const latch = new Mesh(new CylinderGeometry(0.012, 0.012, 0.09, 8), trim);
      latch.position.set((-hingeSide * leafW) / 2 + hingeSide * 0.07, 0, 0.048);
      leaf.add(latch);
      for (const y of [leafH / 2 - 0.12, -leafH / 2 + 0.12]) {
        const hinge = new Mesh(new BoxGeometry(0.05, 0.05, 0.01), trim);
        hinge.position.set((hingeSide * leafW) / 2 - hingeSide * 0.03, y, 0.03);
        leaf.add(hinge);
      }
    } else {
      // A full-height bar handle, on the swinging edge.
      const handle = new Mesh(new CylinderGeometry(0.014, 0.014, leafH * 0.55, 8), trim);
      handle.position.set((-hingeSide * leafW) / 2 + hingeSide * 0.06, 0, 0.07);
      leaf.add(handle);
      for (const y of [1, -1]) {
        const stand = new Mesh(new BoxGeometry(0.02, 0.02, 0.05), trim);
        stand.position.set((-hingeSide * leafW) / 2 + hingeSide * 0.06, (y * leafH * 0.55) / 2, 0.045);
        leaf.add(stand);
      }
      const gasket = new Mesh(new BoxGeometry(leafW * 0.94, leafH * 0.95, 0.008), liner);
      gasket.position.z = -0.026;
      leaf.add(gasket);
    }
  }
  // The door opens away from its hinge; the sign of the swing follows the side.
  const door = makeDoor(pivot, hingeSide * -1.9);

  // ---- the light -------------------------------------------------------
  let light: PointLight | null = null;
  let lens: Mesh | null = null;
  if (spec.hasLight) {
    // Short range on purpose: an interior bulb that lights the whole room is
    // a fridge with the wall knocked out.
    light = new PointLight(0xfff2d8, 0, 1.1, 2);
    light.position.set(0, base + T + inner.h - 0.08, -D / 2 + 0.06);
    group.add(light);
    lens = new Mesh(
      new BoxGeometry(0.09, 0.03, 0.05),
      new MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffe9c0, emissiveIntensity: 0 })
    );
    lens.position.copy(light.position);
    group.add(lens);
  }

  const openAt = createSlot('open', 'work', group, 0, 0, D * 0 + 0.62, Math.PI);
  addApproach(openAt, group, 0.55, 'behind');

  // ---- state -----------------------------------------------------------
  let ambient = options.ambient ?? 20;
  const floorFor = (): number => (spec.passive ? ambient - spec.setpoint : spec.setpoint);
  let interior = options.cold === false ? ambient : floorFor();
  let ice = spec.usesIce ? (options.iced === false ? 0 : 1) : 1;
  let frost = 0;
  let running = false;
  let ajar = 0;
  let alarmed = false;
  /** Shared by the constructor and the loop, so a store never lies before its first step. */
  const classify = (): ColdState => {
    const floor = floorFor();
    // A store that CANNOT cool is not chilling, whatever its thermometer
    // reads on the way past. An icebox with an empty rack reported
    // 'chilling' at 19 °C and climbing — the same lie the hearth would tell
    // if a fire with no fuel in it still counted as heating.
    const losing = door.open || (spec.usesIce && ice <= 0);
    if (interior > ambient - 1.5) return 'warm';
    if (interior > floor + 2.5) return losing ? 'warming' : 'chilling';
    return losing ? 'warming' : 'cold';
  };
  let state: ColdState = classify();

  const local = new Vector3();
  /** Half-extents of the usable cavity, in the cabinet's own space. */
  const cavity = {
    minX: -inner.w / 2,
    maxX: inner.w / 2,
    minY: base + T,
    maxY: base + T + inner.h,
    minZ: -D + T,
    maxZ: 0,
  };
  const insideLocal = (): boolean =>
    local.x >= cavity.minX &&
    local.x <= cavity.maxX &&
    local.y >= cavity.minY &&
    local.y <= cavity.maxY &&
    local.z >= cavity.minZ &&
    local.z <= cavity.maxZ;

  const api: ColdStore = {
    object: group,
    obstacleRadius: Math.max(W, D) * 0.55,
    era,
    door,
    shelves,
    surfaces: shelves,
    light,
    slot: openAt,
    slots: [openAt],
    get ambient() {
      return ambient;
    },
    set ambient(v: number) {
      ambient = v;
    },
    get temperature() {
      return interior;
    },
    get setpoint() {
      return floorFor();
    },
    get state() {
      return state;
    },
    get running() {
      return running;
    },
    get ajar() {
      return ajar;
    },
    get ice() {
      return spec.usesIce ? ice : 1;
    },
    get frost() {
      return frost;
    },
    restock(amount = 1) {
      // A no-op where there is nothing to restock, and that IS the era axis:
      // the same call keeps an icebox cold and does nothing to a fridge.
      if (!spec.usesIce) return;
      ice = clamp01(ice + amount);
    },
    defrost() {
      frost = 0;
    },
    chillAt(x: number, y: number, z: number) {
      group.updateWorldMatrix(true, false);
      local.set(x, y, z);
      group.worldToLocal(local);
      return insideLocal() ? interior : ambient;
    },
    keepAt(x: number, y: number, z: number) {
      return spoilRate(api.chillAt(x, y, z));
    },
    update(dt: number) {
      if (dt <= 0) return;
      const was = state;
      door.update(dt);

      // The door. Its own timer, and an alarm that fires once per opening
      // rather than every frame it is still hanging there.
      if (door.open) {
        ajar += dt;
        if (spec.alarmAfter > 0 && !alarmed && ajar > spec.alarmAfter) {
          alarmed = true;
          api.onAlarm?.();
        }
      } else {
        ajar = 0;
        alarmed = false;
      }
      // The leaf's easing, not the target: a door halfway through swinging
      // shut is still most of the way open.
      const gape = door.open ? Math.max(door.state, 0.25) : door.state;
      const leakRate = spec.leak + (spec.openLeak - spec.leak) * gape;

      // What the interior is leaking *toward*. Normally the room — but a
      // larder has no mechanism at all, so its whole cooling story lives
      // here: thick stone in the shade settles a few degrees under the
      // room, and swinging the mesh door open puts the room right there.
      // Modelling that as a second settling term on top of the leak was the
      // first bug in this file: the two fought and met in the middle, so a
      // larder in an 8 °C pantry sat at 5 instead of 2.
      const outside = spec.passive ? ambient - spec.setpoint * (1 - gape) : ambient;
      const gained = (outside - interior) * Math.min(1, leakRate * dt);

      // Heat out, from whatever mechanism there is.
      let pulled = 0;
      if (!spec.passive) {
        const target = spec.setpoint;
        let capacity = 0;
        if (spec.usesIce) {
          // Ice does not cycle. It works whenever there is any left.
          capacity = ice > 0 ? 1 : 0;
        } else {
          if (running && interior <= target - BAND_OFF) running = false;
          else if (!running && interior > target + BAND_ON) running = true;
          capacity = running ? 1 : 0;
        }
        // Frost is an insulator on the coil. It does not stop the cooling,
        // it makes it *slower* — so a neglected freezer still gets down to
        // temperature, it just never stops running to stay there. That is
        // exactly why nobody notices until the bill arrives.
        capacity *= 1 - frost * 0.8;
        pulled = spec.pull * capacity * dt;
        // A block of ice cannot make anything colder than the block of ice,
        // so that one clamps where a compressor is free to overshoot.
        if (spec.usesIce) pulled = Math.max(0, Math.min(interior - target, pulled));
        if (spec.usesIce && ice > 0) {
          // Charge the block for what it ACTUALLY absorbed, and nothing
          // else. Charging it for the leak as well double-counted — heat
          // entering the box only melts ice insofar as the ice takes it out
          // again — and produced the backwards result that an icebox stood
          // wide open melted *slower* than a shut one, because once it had
          // warmed to room temperature nothing was leaking in any more.
          ice = Math.max(0, ice - (pulled + spec.iceStanding * dt) / spec.iceCapacity);
        }
      }
      interior += gained - pulled;

      // Frost. It grows while the coil is working, and much faster with the
      // door open, because what freezes onto it is the room's damp air.
      if (spec.frostRate > 0) {
        frost = clamp01(frost + dt * spec.frostRate * ((running ? 1 : 0.15) + gape * 4));
      }

      // ---- reads --------------------------------------------------------
      if (iceMesh) {
        const s = Math.max(0.001, ice);
        iceMesh.scale.set(0.35 + s * 0.65, s, 0.4 + s * 0.6);
        iceMesh.visible = ice > 0.002;
      }
      for (let i = 0; i < frostBits.length; i++) {
        // Staggered, so frost creeps rather than appearing all at once.
        const t = clamp01((frost - (i / frostBits.length) * 0.55) / 0.45);
        frostBits[i].visible = t > 0.01;
        frostBits[i].scale.setScalar(Math.max(0.001, t));
      }
      if (light && lens) {
        const lit = smooth(door.state);
        light.intensity = lit * 1.6;
        (lens.material as MeshStandardMaterial).emissiveIntensity = lit * 1.4;
      }

      state = classify();
      if (state !== was) api.onState?.(state);
    },
  };
  return api;
}

/** A cool cupboard with a marble slab: no mechanism, and it shows. */
export function createLarder(options: Omit<ColdOptions, 'era'> = {}): ColdStore {
  return createColdStore({ ...options, era: 'larder' });
}

/** An oak cabinet cooled by a block of ice you have to keep replacing. */
export function createIcebox(options: Omit<ColdOptions, 'era'> = {}): ColdStore {
  return createColdStore({ ...options, era: 'icebox' });
}

/** A refrigerator — `fridge` holds 4 °C, `freezer` holds −18 °C and ices up. */
export function createFridge(
  options: Omit<ColdOptions, 'era'> & { era?: 'fridge' | 'freezer' } = {}
): ColdStore {
  return createColdStore({ ...options, era: options.era ?? 'fridge' });
}

export const COLD_ERAS: ColdEra[] = ['larder', 'icebox', 'fridge', 'freezer'];
