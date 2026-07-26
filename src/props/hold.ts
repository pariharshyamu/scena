import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createSlot, addApproach, type Prop, type PropSlot } from '../core/types';

/**
 * Below decks — and the first thing in this library where **where** you put
 * something changes what the whole object does.
 *
 * Everything else here that has a mass has it at its origin. A hold does not.
 * Put fifty tonnes in the fore hold and she goes down by the head; put it to
 * starboard and she lists; put it aboard at all and she sits deeper and her
 * propeller bites harder. The load is a position, not a number.
 *
 * ```ts
 * const hold = createHold({ kind: 'steamer' });
 * ship.object.add(hold.object);
 *
 * hold.load('fore', 300);
 * game.onUpdate((t) => {
 *   hold.update(t.delta);
 *   ship.update(t.delta, { speed: plant.way, loading: hold.loading });
 *   plant.setImmersion(hold.immersion);
 * });
 * ```
 *
 * ## The weight is not the problem. The fact that it can move is.
 *
 * A hold **full** of water is safer than a hold **half full** of it, and the
 * reason has nothing whatever to do with how much water there is. A liquid
 * with a free surface runs to the low side as she leans, and the weight goes
 * with it — so her centre of gravity effectively rises, and she leans further.
 * The size of that virtual rise depends on the **width of the surface cubed**
 * and not at all on the depth of the liquid:
 *
 * ```ts
 * hold.pump('ballast', 1.0);   // pressed full — no surface, no problem
 * hold.pump('ballast', 0.5);   // slack — and this is the dangerous one
 * hold.pump('ballast', 0.0);   // empty — safe again, and now she is light
 * ```
 *
 * So `pump` is a verb that can kill her in either direction, and the right
 * answer is almost never "some". It is why tankers are loaded full or in
 * ballast and rarely between, and why a slack tank is a thing officers count.
 *
 * ## And an empty ship is not a safe ship
 *
 * Light, she floats high, her metacentric height is enormous, and she snaps
 * back from every roll hard enough to throw people off their feet and start
 * cargo moving. That is what ballast is *for* — you take weight aboard on
 * purpose, low down, to make her worse at standing up. `'light'` is a state
 * this module warns about, not a state it treats as empty and fine.
 */
export type HoldKind = 'carrack' | 'steamer' | 'liner' | 'tanker';

/**
 * The era axis is **what you can do about it.**
 *
 * A carrack has one open hold and no pumps: your only lever is to move the
 * cargo, by hand, and a cargo that shifts on its own in a seaway is how ships
 * were lost. A steamer has separate holds and a double bottom you can pump —
 * one wide tank, so slack it is a menace. A liner subdivides everything,
 * which makes each free surface small and is the whole reason she is a place
 * people are willing to sleep. A tanker's cargo **is** the free surface, and
 * she is only ever safe pressed up or empty.
 */
export const HOLD_KINDS: HoldKind[] = ['carrack', 'steamer', 'liner', 'tanker'];

/** rest / transitioning-toward / at-target / drifting-back, on the GM axis. */
export type TrimState = 'light' | 'laden' | 'tender' | 'lost';

/**
 * One space below decks.
 *
 * `slack` is the whole module in one boolean: a liquid compartment that is
 * neither empty nor pressed up.
 */
export interface Compartment {
  name: string;
  /** Centre, fore-and-aft, in vessel metres. Positive is forward. */
  z: number;
  /** Centre athwartships. Positive is to starboard. */
  x: number;
  length: number;
  width: number;
  depth: number;
  /** Height of its floor below the waterline, m. */
  floor: number;
  /** Does it hold liquid? Only liquids have a free surface. */
  liquid: boolean;
  /** Tonnes it will take. */
  capacity: number;
  /** Tonnes in it now. */
  readonly load: number;
  /** How full, 0–1. */
  readonly level: number;
  /** Liquid, and neither empty nor pressed up. */
  readonly slack: boolean;
  /** Its own free-surface moment, tonne·m⁴ — `width³ × length / 12`, and it
   *  does not depend on how much is in it. */
  readonly surfaceMoment: number;
  /** Where its contents actually sit across it, in metres from its own
   *  centreline. Cargo stowed to one side is the commonest way a ship gets
   *  a list, and it is nobody's decision — it is a mistake. */
  readonly offset: number;
}

/**
 * What the hull takes from a load.
 *
 * The same shape as `ShipInput.drift` and passed the same way — but it is the
 * first thing in that channel that is a **state of the vessel** rather than a
 * force on her. A drift stops when the tide slackens. A list does not stop.
 */
export interface Loading {
  /** Radians of bow-down pitch. Positive is down by the head. */
  trim: number;
  /** Radians of list. Positive is to starboard. */
  list: number;
  /** Extra metres she is sitting down in the water. */
  sink: number;
  /** Multiplier on how fast she answers the sea. A stiff ship SNAPS. */
  stiffness: number;
}

export interface Hold extends Prop {
  kind: HoldKind;
  compartments: Compartment[];
  /** By name, because `compartments[2]` is not a thing anybody says. */
  at(name: string): Compartment | undefined;

  /**
   * Put weight in. Returns the tonnes that would not fit.
   *
   * `side` is where it goes ACROSS the compartment, −1 hard to port through 0
   * on the centreline to +1 hard to starboard. It is the whole reason a ship
   * with her cargo correctly distributed fore and aft can still be lying over
   * at ten degrees, and there is no total tonnage that says so.
   */
  load(name: string, tonnes: number, side?: number): number;
  /** Take it out. Returns the tonnes that actually came. */
  unload(name: string, tonnes: number): number;
  /** Move it — the only lever a carrack has, and the slow one. */
  shift(from: string, to: string, tonnes: number): number;
  /**
   * Pump a liquid compartment toward a fraction of its depth.
   *
   * DANGEROUS IN BOTH DIRECTIONS. Emptying a pressed-up tank takes her
   * through slack on the way, and slack is where the free surface is.
   */
  pump(name: string, to: number): void;
  /** Water where it should not be — and it has the widest surface aboard. */
  readonly bilge: number;
  /** Start her making water, tonnes/s. */
  holed(rate: number): void;
  /** Suction on the bilge. Slower than the sea, which is the point. */
  pumpBilge(on: boolean): void;
  readonly pumping: boolean;

  // ── what it does to her ──────────────────────────────────────────────
  /** Tonnes aboard, cargo and ballast and bilge. */
  readonly deadweight: number;
  /** Tonnes of hull and everything in her. */
  readonly displacement: number;
  /** How deep she floats, m. */
  readonly draught: number;
  /** Metres of side left above the sea. */
  readonly freeboard: number;
  /** How much of the screw is in the water, 0–1. Straight into
   *  `SteamPlant.setImmersion`. */
  readonly immersion: number;
  /** Metacentric height WITH the free-surface correction applied, m. THE
   *  number: it is what decides everything else here. */
  readonly gm: number;
  /** What she would have if nothing aboard could move. `gm` is this minus
   *  `freeSurface`, and the difference is the module. */
  readonly solidGm: number;
  /** Virtual rise in her centre of gravity from every slack surface, m. */
  readonly freeSurface: number;
  /** Seconds for one complete roll. Short is STIFF and violent; long is
   *  tender and she hangs at the end of each one. */
  readonly rollPeriod: number;
  /** Loaded to her marks: 0 light, 1 down to the load line, >1 overloaded. */
  readonly toMarks: number;
  readonly state: TrimState;
  onState?: (state: TrimState) => void;
  /** She has taken an angle of loll and is lying there. A boolean BESIDE the
   *  state, because a ship lolling is still `'lost'` by the same measure. */
  readonly lolling: boolean;
  /** Past the angle of vanishing stability — over, and not coming back. */
  readonly capsized: boolean;
  /** Her angle of vanishing stability, radians. Published so a caller can
   *  say how close she is rather than only that she has gone. */
  readonly vanishing: number;

  /** Hand this straight to `ShipInput.loading`. Mutated in place. */
  readonly loading: Loading;
  hatch: PropSlot;
  slots: PropSlot[];
  update(dt: number): void;
}

export interface HoldOptions {
  kind?: HoldKind;
  /** Override the vessel's dimensions, if the hold is going into something
   *  other than the hull its kind is sized for. */
  length?: number;
  beam?: number;
  /** Tonnes of hull, engines and everything that is not cargo. */
  lightship?: number;
  /**
   * How deep the HULL she is going into is drawn, m — `DeckedShip.draft`.
   *
   * `sink` is measured from this, because it is the datum the hull mesh was
   * built to. Leave it out and the hold measures from its own load line
   * instead: a ship loaded exactly to her marks is then lifted clear of the
   * water by the difference between the two, a light one is lifted almost
   * out of it altogether, and there is no number anywhere that says so.
   *
   * ```ts
   * createHold({ kind: 'steamer', draft: ship.draft });
   * ```
   */
  draft?: number;
  /** Start her loaded. Names not in the kind are ignored. */
  cargo?: Record<string, number>;
  seed?: number;
  palette?: Palette;
}

/** Sea water. Everything here is in tonnes and metres. */
const RHO = 1.025;
const G = 9.81;

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

interface Space {
  name: string;
  z: number;
  x: number;
  length: number;
  width: number;
  depth: number;
  floor: number;
  liquid: boolean;
  capacity: number;
}

interface KindSpec {
  length: number;
  beam: number;
  depth: number;
  /** Tonnes of her, empty. */
  lightship: number;
  /** Height of her light centre of gravity above the keel, m. */
  lightKg: number;
  /** Waterplane coefficient — how boxy her waterline is. */
  cw: number;
  /** Block coefficient — how boxy she is underwater. */
  cb: number;
  /** Radius of gyration as a fraction of the beam. Sets the roll period. */
  gyration: number;
  /** Draught she is designed to float at, loaded to her marks. */
  marks: number;
  /** How much GM she wants. Below `tender` she lolls about; above `stiff` she
   *  snaps back hard enough to hurt people. NEITHER END IS SAFE. */
  tender: number;
  stiff: number;
  /** Depth of the screw below the waterline at her marks. */
  screw: number;
  /**
   * Angle of vanishing stability, radians — past which she has no righting
   * arm left and does not come back. It is not a clamp for tidiness: it is
   * the end of the curve, and a ship taken past it is over.
   */
  vanishing: number;
  /** Tonnes a minute the cargo gang can move by hand. */
  shiftRate: number;
  /** Tonnes a second the ballast pumps will do. */
  pumpRate: number;
  /** Tonnes a second the bilge pump will do. */
  bilgeRate: number;
  spaces: Space[];
}

const KINDS: Record<HoldKind, KindSpec> = {
  carrack: {
    length: 26, beam: 8, depth: 3.6, lightship: 120, lightKg: 2.2,
    cw: 0.78, cb: 0.55, gyration: 0.38, marks: 2.4,
    tender: 0.5, stiff: 3.4, vanishing: 0.78, screw: 0, shiftRate: 0.9, pumpRate: 0, bilgeRate: 0.008,
    // ONE SPACE, AND NO PUMPS. Your only lever is to move it, by hand, at
    // under a tonne a minute — which is why a cargo that shifted on its own
    // in a seaway was usually the end of the argument.
    spaces: [{ name: 'hold', z: 0, x: 0, length: 15, width: 6, depth: 2.6, floor: 1.6, liquid: false, capacity: 170 }],
  },
  steamer: {
    length: 58, beam: 9.5, depth: 6.0, lightship: 480, lightKg: 2.9,
    cw: 0.84, cb: 0.68, gyration: 0.37, marks: 3.6,
    tender: 0.4, stiff: 2.6, vanishing: 0.72, screw: 2.2, shiftRate: 2.5, pumpRate: 0.32, bilgeRate: 0.05,
    // Three holds and ONE wide double-bottom tank. The tank is the invention
    // — you can change how she floats without touching the cargo — and it is
    // also the widest free surface she has, so half of it is a menace.
    spaces: [
      { name: 'fore', z: 16, x: 0, length: 14, width: 8, depth: 4.5, floor: 2.5, liquid: false, capacity: 300 },
      { name: 'main', z: 0, x: 0, length: 16, width: 8.6, depth: 4.5, floor: 2.5, liquid: false, capacity: 380 },
      { name: 'aft', z: -17, x: 0, length: 12, width: 7.4, depth: 4.5, floor: 2.5, liquid: false, capacity: 220 },
      { name: 'ballast', z: 0, x: 0, length: 30, width: 8.8, depth: 0.9, floor: 3.4, liquid: true, capacity: 260 },
    ],
  },
  liner: {
    length: 180, beam: 24, depth: 18, lightship: 15600, lightKg: 11.2,
    cw: 0.8, cb: 0.62, gyration: 0.36, marks: 9.0,
    tender: 0.5, stiff: 2.2, vanishing: 0.66, screw: 6.0, shiftRate: 6, pumpRate: 2.2, bilgeRate: 0.4,
    // SUBDIVIDED, and that is the whole point of her. Six narrow tanks in
    // place of one wide one cut the free surface by the square of the number
    // — because the moment goes as the WIDTH CUBED — which is why a liner is
    // somewhere people are willing to go to sleep.
    spaces: [
      { name: 'fore', z: 56, x: 0, length: 30, width: 18, depth: 11, floor: 6.0, liquid: false, capacity: 2600 },
      { name: 'main', z: 10, x: 0, length: 52, width: 22, depth: 11, floor: 6.0, liquid: false, capacity: 4600 },
      { name: 'aft', z: -50, x: 0, length: 30, width: 18, depth: 11, floor: 6.0, liquid: false, capacity: 2400 },
      { name: 'ballastP1', z: 34, x: -8, length: 40, width: 5.4, depth: 2.6, floor: 8.6, liquid: true, capacity: 700 },
      { name: 'ballastS1', z: 34, x: 8, length: 40, width: 5.4, depth: 2.6, floor: 8.6, liquid: true, capacity: 700 },
      { name: 'ballastP2', z: -34, x: -8, length: 40, width: 5.4, depth: 2.6, floor: 8.6, liquid: true, capacity: 700 },
      { name: 'ballastS2', z: -34, x: 8, length: 40, width: 5.4, depth: 2.6, floor: 8.6, liquid: true, capacity: 700 },
    ],
  },
  tanker: {
    length: 150, beam: 22, depth: 14, lightship: 5200, lightKg: 7.0,
    cw: 0.9, cb: 0.82, gyration: 0.38, marks: 8.4,
    tender: 0.7, stiff: 3.4, vanishing: 0.6, screw: 5.5, shiftRate: 0, pumpRate: 3.4, bilgeRate: 0.3,
    // THE CARGO IS THE FREE SURFACE. Three tanks the full width of her, and
    // she is only ever safe pressed up or empty — anywhere between and the
    // whole cargo runs to leeward with her.
    spaces: [
      { name: 'no1', z: 42, x: 0, length: 34, width: 20, depth: 12, floor: 6.4, liquid: true, capacity: 6200 },
      { name: 'no2', z: 0, x: 0, length: 38, width: 21, depth: 12, floor: 6.4, liquid: true, capacity: 7300 },
      { name: 'no3', z: -42, x: 0, length: 34, width: 20, depth: 12, floor: 6.4, liquid: true, capacity: 6200 },
    ],
  },
};

interface Cell extends Space {
  load: number;
  /** Where the pumps are taking it, for liquids. */
  order: number;
  /** Mean position of the contents across the compartment, metres. */
  offset: number;
}

export function createHold(options: HoldOptions = {}): Hold {
  const kind = options.kind ?? 'steamer';
  const base = KINDS[kind];
  const spec: KindSpec = {
    ...base,
    length: options.length ?? base.length,
    beam: options.beam ?? base.beam,
    lightship: options.lightship ?? base.lightship,
  };
  // The datum her sinkage is measured from. Defaults to her own marks so a
  // hold on its own is self-consistent; pass the hull's if she is going into
  // one, because that is the depth the mesh was drawn to.
  const drawnDraft = options.draft ?? base.marks;
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;

  const L = spec.length;
  const B = spec.beam;

  const cells: Cell[] = spec.spaces.map((s) => ({
    ...s,
    load: clamp01((options.cargo?.[s.name] ?? 0) / Math.max(1, s.capacity)) * s.capacity,
    order: s.liquid ? clamp01((options.cargo?.[s.name] ?? 0) / Math.max(1, s.capacity)) : 0,
    offset: 0,
  }));
  // The bilge is a compartment too, and it is the WORST one she has: the full
  // width of her, no subdivision, and it fills itself.
  const bilgeCell: Cell = {
    name: 'bilge',
    z: 0, x: 0,
    length: L * 0.62,
    width: B * 0.9,
    depth: 0.9,
    floor: spec.marks - 0.1,
    liquid: true,
    capacity: RHO * L * 0.62 * B * 0.9 * 0.9,
    load: 0,
    order: 0,
    offset: 0,
  };

  let leak = 0;
  let pumping = false;
  const loading: Loading = { trim: 0, list: 0, sink: 0, stiffness: 1 };

  // ── geometry ─────────────────────────────────────────────────────────

  const group = new Group();
  group.name = `hold:${kind}`;

  const steel = createSurface('steel', { color: 0x53585e, seed });
  const timber = createSurface('plank', { color: palette.woodDark, seed: seed + 1 });
  const structure = kind === 'carrack' ? timber : steel;
  const cargoMats = [
    createSurface('plank', { color: palette.wood, seed: seed + 2 }),
    createSurface('canvas', { color: 0xa89a7c, seed: seed + 3 }),
    createSurface('leather', { color: 0x6d5843, seed: seed + 4 }),
  ];
  const waterMat = new MeshStandardMaterial({
    color: 0x2f5f74,
    transparent: true,
    opacity: 0.72,
    roughness: 0.25,
    metalness: 0.1,
  });
  const oilMat = new MeshStandardMaterial({
    color: 0x14100c,
    transparent: true,
    opacity: 0.9,
    roughness: 0.45,
  });

  interface Built {
    cell: Cell;
    /** The liquid's own surface — a pivot the plane hangs under. */
    surface: Object3D | null;
    /** Stacks of cargo whose visible count follows the load. */
    stacks: Object3D[];
  }
  const built: Built[] = [];

  /**
   * A COMPARTMENT IS A HOLE. Four walls and a floor, built as slabs around a
   * void — never a solid box with cargo parented inside it, which renders as
   * a filled crate whether it is loaded or empty and passes every test in
   * this file because no test looks into it.
   */
  const boxOut = (c: Cell, parent: Group): void => {
    const t = Math.min(0.16, c.width * 0.03);
    const y0 = -c.floor;
    const wall = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
      const m = new Mesh(new BoxGeometry(w, h, d), structure);
      m.position.set(x, y, z);
      parent.add(m);
    };
    wall(c.width, t, c.length, c.x, y0, c.z);
    wall(t, c.depth, c.length, c.x - c.width / 2, y0 + c.depth / 2, c.z);
    wall(t, c.depth, c.length, c.x + c.width / 2, y0 + c.depth / 2, c.z);
    wall(c.width, c.depth, t, c.x, y0 + c.depth / 2, c.z - c.length / 2);
    wall(c.width, c.depth, t, c.x, y0 + c.depth / 2, c.z + c.length / 2);
  };

  for (const c of cells) {
    const sub = new Group();
    sub.name = `compartment:${c.name}`;
    group.add(sub);
    boxOut(c, sub);

    let surface: Object3D | null = null;
    const stacks: Object3D[] = [];
    if (c.liquid) {
      // THE READ, and it needs its own pivot. Laying a plane flat costs a
      // rotation.x of -90°, and stacking the vessel's attitude on top of that
      // in the same Euler composes in an order nobody can reason about — the
      // surface ends up tilting about the wrong axis by a plausible amount.
      // Pivot rotates; plane inside it only ever lies flat.
      const pivot = new Object3D();
      pivot.name = `surface:${c.name}`;
      pivot.position.set(c.x, -c.floor, c.z);
      const sheet = new Mesh(
        new PlaneGeometry(c.width * 0.97, c.length * 0.98),
        kind === 'tanker' ? oilMat : waterMat
      );
      sheet.rotation.x = -Math.PI / 2;
      pivot.add(sheet);
      sub.add(pivot);
      surface = pivot;
    } else {
      // Cargo in courses in a group of its own, so a hold stowed to one side
      // can be MOVED to one side — a list nobody can see is a list somebody
      // will decide is a bug in the model.
      const stackGroup = new Group();
      stackGroup.name = `stow:${c.name}`;
      sub.add(stackGroup);
      // Cargo in courses, so a half-loaded hold is visibly half loaded.
      const across = Math.max(2, Math.round(c.width / 1.7));
      const along = Math.max(3, Math.round(c.length / 1.9));
      const tiers = Math.max(2, Math.round(c.depth / 1.3));
      const bw = (c.width * 0.88) / across;
      const bl = (c.length * 0.92) / along;
      const bh = (c.depth * 0.86) / tiers;
      for (let ti = 0; ti < tiers; ti++) {
        for (let ai = 0; ai < along; ai++) {
          for (let xi = 0; xi < across; xi++) {
            const m = new Mesh(
              new BoxGeometry(bw * 0.92, bh * 0.9, bl * 0.92),
              cargoMats[Math.floor(rng.next() * cargoMats.length)]
            );
            m.position.set(
              c.x + (xi - (across - 1) / 2) * bw,
              -c.floor + bh / 2 + ti * bh,
              c.z + (ai - (along - 1) / 2) * bl
            );
            m.rotation.y = (rng.next() - 0.5) * 0.09;
            m.visible = false;
            stackGroup.add(m);
            stacks.push(m);
          }
        }
      }
      // Bottom tier first, so she loads from the floor up rather than a
      // random scatter appearing in mid-air.
      stacks.sort((a, b) => a.position.y - b.position.y);
    }
    built.push({ cell: c, surface, stacks });
  }

  // The bilge: one plane, the full width of her, under everything.
  const bilgeSurface = new Object3D();
  bilgeSurface.name = 'surface:bilge';
  bilgeSurface.position.set(0, -bilgeCell.floor, 0);
  bilgeSurface.visible = false;
  const bilgeSheet = new Mesh(
    new PlaneGeometry(bilgeCell.width, bilgeCell.length),
    new MeshStandardMaterial({
      color: 0x1d2a2b,
      transparent: true,
      opacity: 0.8,
      roughness: 0.2,
    })
  );
  bilgeSheet.rotation.x = -Math.PI / 2;
  bilgeSurface.add(bilgeSheet);
  group.add(bilgeSurface);

  /**
   * The load line, painted on her side.
   *
   * An instrument with no moving parts: the marks stay where they are and the
   * SEA comes up them. Nothing else in SCENA reads out by not moving.
   */
  const marks = new Group();
  marks.name = 'loadline';
  const markMat = new MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8 });
  const disc = new Mesh(new BoxGeometry(0.06, 0.5, 0.5), markMat);
  disc.position.set(B / 2 + 0.03, 0, 0);
  marks.add(disc);
  const bar = new Mesh(new BoxGeometry(0.06, 0.09, 1.5), markMat);
  bar.position.set(B / 2 + 0.03, 0, 0);
  marks.add(bar);
  for (let i = 0; i < 5; i++) {
    const step = new Mesh(new BoxGeometry(0.06, 0.07, 0.42), markMat);
    step.position.set(B / 2 + 0.03, (i - 2) * 0.26, 1.1);
    marks.add(step);
  }
  group.add(marks);

  const hatch = addApproach(
    createSlot('hatch', 'work', group, 0, 0.1, cells[0].z + cells[0].length / 2 + 1.1, Math.PI),
    group,
    0.9,
    'front'
  );

  // ── the model ────────────────────────────────────────────────────────

  const at = (name: string): Cell | undefined =>
    name === 'bilge' ? bilgeCell : cells.find((c) => c.name === name);

  const allCells = (): Cell[] => [...cells, bilgeCell];

  /** Tonnes aboard that are not the ship herself. */
  const deadweightOf = (): number => allCells().reduce((s, c) => s + c.load, 0);

  /**
   * Height of the whole vessel's centre of gravity above the keel.
   *
   * A compartment's `floor` is measured DOWN FROM THE WATERLINE, and the
   * waterline at her marks is `spec.marks` above the keel — not `spec.depth`,
   * which is the keel to the main deck. Using the depth puts every tonne
   * aboard a whole freeboard higher than it is, and every ship in the table
   * comes out tender for a reason that is arithmetic rather than loading.
   */
  const kgOf = (): number => {
    let moment = spec.lightship * spec.lightKg;
    let mass = spec.lightship;
    for (const c of allCells()) {
      if (c.load <= 0) continue;
      const fill = clamp01(c.load / Math.max(1e-6, c.capacity));
      const h = Math.max(0, spec.marks - c.floor) + (c.depth * fill) / 2;
      moment += c.load * h;
      mass += c.load;
    }
    return moment / Math.max(1e-6, mass);
  };

  /**
   * THE FREE SURFACE. Sum of `width³ × length / 12` over every SLACK liquid
   * compartment, divided by the displacement — a virtual rise in G that does
   * not care how much liquid there is, only how wide it is free to slop.
   *
   * A pressed-up tank contributes nothing at all, and neither does an empty
   * one. Half of it contributes exactly as much as nine tenths of it.
   */
  const freeSurfaceOf = (disp: number): number => {
    let i = 0;
    for (const c of allCells()) {
      if (!c.liquid) continue;
      const fill = c.load / Math.max(1e-6, c.capacity);
      if (fill <= 0.005 || fill >= 0.995) continue;
      i += (c.width ** 3 * c.length) / 12;
    }
    return (RHO * i) / Math.max(1e-6, disp);
  };

  let state: TrimState = 'laden';
  let read = {
    displacement: spec.lightship,
    draught: 0,
    gm: 0,
    solidGm: 0,
    freeSurface: 0,
    rollPeriod: 0,
  };

  const solve = (): void => {
    const dw = deadweightOf();
    const disp = spec.lightship + dw;

    // How deep she floats. Volume over the waterplane, and the waterplane is
    // what a change in load moves her through.
    const draught = disp / (RHO * spec.cb * L * B);

    // KB is roughly the centroid of the immersed body; BM is the waterplane's
    // own moment of inertia over the volume, which is why a WIDE ship is a
    // stable one and it goes as the beam SQUARED.
    const kb = draught * 0.53;
    const volume = disp / RHO;
    const bm = (spec.cw * L * B ** 3) / 12 / Math.max(1e-6, volume);
    const km = kb + bm;
    const kg = kgOf();
    const solidGm = km - kg;
    const fs = freeSurfaceOf(disp);
    const gm = solidGm - fs;

    // Trim and list are moments about the centre, divided by how hard she
    // resists being turned that way. Longitudinally that is enormous — a ship
    // is long — which is why the same tonne moved athwartships does far more.
    let mz = 0;
    let mx = 0;
    for (const c of allCells()) {
      mz += c.load * c.z;
      mx += c.load * (c.x + c.offset);
    }
    const gml = L * 1.1;
    loading.trim = Math.atan(mz / Math.max(1e-6, disp * gml));
    // A negative GM does not give a negative list, it gives an ANGLE OF LOLL:
    // she falls to one side and sits there, and the side she picks is
    // whichever way she happened to be leaning.
    if (gm > 0.02) {
      // GZ = GM·sin θ, NOT GM·θ — and `atan` obligingly returns an answer all
      // the way to ninety degrees, so a badly stowed ship comes out lying at
      // forty-four degrees and steaming along quite happily. There is no
      // equilibrium past the angle of vanishing stability: she is over.
      const arg = mx / Math.max(1e-6, disp * gm);
      const limit = Math.sin(spec.vanishing);
      loading.list =
        Math.abs(arg) >= limit
          ? Math.sign(arg) * spec.vanishing
          : Math.asin(arg);
    } else {
      const loll = Math.min(0.45, Math.sqrt(Math.max(0, -gm) / Math.max(0.2, bm)) * 1.6);
      loading.list = (mx >= 0 ? 1 : -1) * loll;
    }
    loading.sink = draught - drawnDraft;
    // A stiff ship snaps back. The hull's own easing is how fast she answers
    // the sea, and this is the same claim from the other side.
    // A ship with no positive stability does not roll about upright at all —
    // she lies at her angle of loll. Clamping the square root gives a number
    // like 118 seconds, which reads as "very slow" when the truth is "never".
    const period = gm > 0.02 ? (2 * Math.PI * spec.gyration * B) / Math.sqrt(gm * G) : Infinity;
    // Rises WITH the metacentric height. A stiff ship snaps back and a tender
    // one wallows, so the multiplier that decides how fast she answers the sea
    // has to go the same way GM does — written as `tender/gm` it goes the
    // other way, and a light ship becomes the ponderous one.
    loading.stiffness = 0.6 + clamp01(gm / spec.stiff) * 0.9;

    read = {
      displacement: disp,
      draught,
      gm,
      solidGm,
      freeSurface: fs,
      rollPeriod: period,
    };
  };

  const classify = (): TrimState => {
    if (read.gm <= 0 || spec.depth - read.draught <= 0) return 'lost';
    // Past the end of her righting-arm curve, with plenty of metacentric
    // height and nothing whatever to use it on.
    if (Math.abs(loading.list) >= spec.vanishing - 1e-6) return 'lost';
    // Two-sided bands, so a ship sitting at the edge of tender does not
    // chatter across it on the noise of her own pumps.
    const enterTender = state === 'tender' ? spec.tender * 1.12 : spec.tender;
    const enterLight = state === 'light' ? spec.stiff * 0.9 : spec.stiff;
    if (read.gm < enterTender) return 'tender';
    if (read.gm > enterLight) return 'light';
    return 'laden';
  };

  const place = (): void => {
    for (const b of built) {
      const fill = clamp01(b.cell.load / Math.max(1e-6, b.cell.capacity));
      if (b.surface) {
        b.surface.visible = fill > 0.004;
        b.surface.position.y = -b.cell.floor + b.cell.depth * fill;
        // A LIQUID STAYS LEVEL AND THE SHIP DOES NOT. The hull is rotated by
        // (−trim, −list); the surface takes (+trim, +list) inside it and comes
        // out horizontal, sitting deeper against the low side of a tilted
        // compartment — which is the whole module, visible.
        //
        // A tank pressed up against its deckhead CANNOT do that, so it does
        // not, and a still frame tells you which tanks are the dangerous ones.
        const free = fill > 0.005 && fill < 0.995;
        b.surface.rotation.set(free ? -loading.trim : 0, 0, free ? loading.list : 0);
      }
      if (b.stacks.length) {
        const want = Math.round(fill * b.stacks.length);
        for (let i = 0; i < b.stacks.length; i++) b.stacks[i].visible = i < want;
        const stow = b.stacks[0].parent;
        if (stow) stow.position.x = b.cell.offset;
      }
    }
    const bFill = clamp01(bilgeCell.load / bilgeCell.capacity);
    bilgeSurface.visible = bFill > 0.004;
    bilgeSurface.position.y = -bilgeCell.floor + bilgeCell.depth * bFill;
    bilgeSurface.rotation.set(-loading.trim, 0, loading.list);
    // The marks stay put and the sea comes up them: the group tracks the
    // waterline, which in the hull's frame is y = 0 minus how far she sank.
    marks.position.y = -loading.sink;
  };

  /**
   * Re-derive, re-draw, and RE-CLASSIFY.
   *
   * The classifier lived only in `update` at first, so a ship loaded until
   * her metacentric height went negative went on reporting `'light'` until
   * somebody happened to step the frame. Loading her IS the event.
   */
  const settle = (): void => {
    solve();
    place();
    const next = classify();
    if (next !== state) {
      state = next;
      hold.onState?.(state);
    }
  };

  solve();
  state = classify();
  place();

  const view = (c: Cell): Compartment => ({
    name: c.name,
    z: c.z,
    x: c.x,
    length: c.length,
    width: c.width,
    depth: c.depth,
    floor: c.floor,
    liquid: c.liquid,
    capacity: c.capacity,
    get load() {
      return c.load;
    },
    get level() {
      return clamp01(c.load / Math.max(1e-6, c.capacity));
    },
    get slack() {
      const f = c.load / Math.max(1e-6, c.capacity);
      return c.liquid && f > 0.005 && f < 0.995;
    },
    get surfaceMoment() {
      return (c.width ** 3 * c.length) / 12;
    },
    get offset() {
      return c.offset;
    },
  });
  const views = [...cells, bilgeCell].map(view);

  /** Tonnes still being walked from one hold to another. */
  let moving: { from: Cell; to: Cell; left: number } | null = null;

  const hold: Hold = {
    object: group,
    // Below decks is not something you steer around from outside.
    obstacleRadius: 0,
    kind,
    compartments: views,
    at(name: string) {
      return views.find((c) => c.name === name);
    },
    hatch,
    slots: [hatch],
    loading,

    load(name: string, tonnes: number, side = 0) {
      const c = at(name);
      if (!c || !(tonnes > 0)) return tonnes > 0 ? tonnes : 0;
      const room = Math.max(0, c.capacity - c.load);
      const took = Math.min(room, tonnes);
      // A liquid finds its own level and cannot be stowed to one side; solid
      // cargo can, and stays where it was put.
      if (!c.liquid && took > 0) {
        const where = Math.max(-1, Math.min(1, side)) * (c.width / 2) * 0.8;
        c.offset = (c.offset * c.load + where * took) / (c.load + took);
      }
      c.load += took;
      if (c.liquid) c.order = c.load / c.capacity;
      settle();
      return tonnes - took;
    },
    unload(name: string, tonnes: number) {
      const c = at(name);
      if (!c || !(tonnes > 0)) return 0;
      const came = Math.min(c.load, tonnes);
      c.load -= came;
      if (c.liquid) c.order = c.load / c.capacity;
      settle();
      return came;
    },
    shift(from: string, to: string, tonnes: number) {
      const a = at(from);
      const b = at(to);
      if (!a || !b || a === b || !(tonnes > 0)) return 0;
      // A carrack has no pumps, so this is her only lever — and it takes
      // hours, which is the whole difference between her and a steamer.
      const can = Math.min(a.load, Math.max(0, b.capacity - b.load), tonnes);
      if (can <= 0) return 0;
      moving = { from: a, to: b, left: can };
      return can;
    },
    pump(name: string, to: number) {
      const c = at(name);
      if (!c || !c.liquid) return;
      c.order = clamp01(to);
    },
    get bilge() {
      return bilgeCell.load;
    },
    holed(rate: number) {
      leak = Math.max(0, rate);
    },
    pumpBilge(on: boolean) {
      pumping = on;
    },
    get pumping() {
      return pumping;
    },

    get deadweight() {
      return deadweightOf();
    },
    get displacement() {
      return read.displacement;
    },
    get draught() {
      return read.draught;
    },
    get freeboard() {
      return Math.max(0, spec.depth - read.draught);
    },
    get immersion() {
      // The screw is a fixed depth below her marks; as she rises out of the
      // water it comes with her, and a light ship races.
      if (spec.screw <= 0) return 1;
      const under = read.draught - (spec.marks - spec.screw);
      return clamp01(under / Math.max(0.1, spec.screw));
    },
    get gm() {
      return read.gm;
    },
    get solidGm() {
      return read.solidGm;
    },
    get freeSurface() {
      return read.freeSurface;
    },
    get rollPeriod() {
      return read.rollPeriod;
    },
    get toMarks() {
      return read.draught / spec.marks;
    },
    get state() {
      return state;
    },
    get lolling() {
      return read.gm <= 0.02 && Math.abs(loading.list) > 0.02;
    },
    get capsized() {
      return Math.abs(loading.list) >= spec.vanishing - 1e-6;
    },
    vanishing: spec.vanishing,

    update(dt: number) {
      if (!(dt > 0)) return;

      // The pumps: liquid compartments walk toward their order.
      if (spec.pumpRate > 0) {
        for (const c of cells) {
          if (!c.liquid) continue;
          const want = c.order * c.capacity;
          const step = spec.pumpRate * dt;
          const err = want - c.load;
          c.load += Math.abs(err) <= step ? err : Math.sign(err) * step;
        }
      }

      // The cargo gang, at under a tonne a minute on a carrack.
      if (moving) {
        const step = (spec.shiftRate / 60) * dt;
        const took = Math.min(moving.left, step, moving.from.load);
        const room = Math.max(0, moving.to.capacity - moving.to.load);
        const put = Math.min(took, room);
        moving.from.load -= put;
        moving.to.load += put;
        moving.left -= put;
        if (moving.left <= 1e-6 || put <= 0) moving = null;
      }

      // The sea comes in faster than the pump takes it out. That is not a
      // balance anybody tuned — it is why you go for the hole and not the
      // handle.
      if (leak > 0) bilgeCell.load = Math.min(bilgeCell.capacity, bilgeCell.load + leak * dt);
      if (pumping && bilgeCell.load > 0) {
        bilgeCell.load = Math.max(0, bilgeCell.load - spec.bilgeRate * dt);
      }

      settle();
    },
  };

  return hold;
}

/**
 * What one slack tank costs her, in metres of metacentric height.
 *
 * Published on its own because it is the number the whole module turns on and
 * because it is worth being able to ask before you pump: a surface **eight
 * metres** wide costs eight times what a **four metre** one does, at any
 * depth of liquid whatever. Subdivide a tank in two and you have divided its
 * penalty by four.
 */
export function freeSurfaceCost(
  width: number,
  length: number,
  displacement: number
): number {
  return (RHO * (width ** 3 * length)) / 12 / Math.max(1e-6, displacement);
}

/** Where a point in the hold is, in the vessel's frame. Handy for placing
 *  lights, ladders and people down there. */
export function holdPoint(hold: Hold, name: string, out = new Vector3()): Vector3 {
  const c = hold.at(name);
  if (!c) return out.set(0, 0, 0);
  return out.set(c.x, -c.floor + c.depth * c.level, c.z);
}
