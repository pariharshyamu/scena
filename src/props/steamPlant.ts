import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  TorusGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createSlot, addApproach, type Prop, type PropSlot } from '../core/types';
import { createSmoke, type SmokeSource, type SmokeLayer } from './smoke';
import { createSteam, type Steam } from './waterworks';
import { createPressureGauge, type PressureGauge } from './gauge';

/**
 * A steam plant — and the one propulsion in this trilogy whose output is
 * **not monotonic in its own control.**
 *
 * A sail gives you more the better you trim it. Oars give you more the harder
 * you pull. Open a steam engine right up and she goes **slower**, and that is
 * not a penalty anybody wrote:
 *
 * ```ts
 * plant.setLink(1.0);                   // full gear, longest cut-off
 * plant.setLink(plant.linkFor(3600));   // …and this one beats it, by a third
 * ```
 *
 * The reason is that the regulator spends a store the fire fills a hundred
 * times more slowly than the engine empties it. Full gear admits steam for
 * most of the stroke, which is enormous torque and enormous consumption; the
 * boiler cannot keep up, the pressure sags, and half an hour later she is
 * making less power at 4 bar than she would have made all day at 9. Notch her
 * up — admit steam for a fifth of the stroke and let it *expand* — and she
 * settles at a speed she can hold. The whole nineteenth century is in that.
 *
 * So the store is the model. One integrated number, the boiler temperature,
 * with a **signed balance** across it:
 *
 * ```
 * balance = raised − lost − engine − auxiliaries − vent − dumped
 * ```
 *
 * and everything else is a read of that number. The pressure is not stored,
 * it is `pressureFor(temperature)` every time you ask — which is why the
 * needle sits flat on its stop for the first stretch of a cold light-up while
 * the funnel is already black. Below 100 °C there is no steam to have.
 *
 * ```ts
 * const ship  = createDeckedShip({ era: 'steamer' });
 * const plant = createSteamPlant({ kind: 'triple' });
 * ship.object.add(plant.object);
 *
 * plant.setDraught(1);
 * plant.setRegulator(1);
 * plant.setLink(plant.linkFor(3600));   // a setting she will actually keep
 *
 * game.onUpdate((t) => {
 *   plant.update(t.delta);                                    // FIRST
 *   ship.update(t.delta, { speed: plant.way, drift: plant.walk });
 * });
 * ```
 *
 * `way` goes straight into `ShipInput.speed` — it is already in hull units,
 * like `OarBank.way` and unlike `SailRig.drive`.
 */
export type SteamKind = 'sidelever' | 'compound' | 'triple' | 'launch';

/**
 * Era order — and the axis is **what she asks of you to give you power.**
 *
 * A sidelever wants a man with a shovel and gives you 20 rpm at one and a bit
 * bar. A triple wants a stokehold watch and gives you a fortnight at sea. And
 * `launch` is the inversion at the end of it: she asks nothing — no bed, no
 * bunker, no black smoke, steam in eleven minutes — and then refuses to start
 * at all, because she has one cylinder and can stop on dead centre. Same
 * table, opposite gameplay.
 */
export const STEAM_KINDS: SteamKind[] = ['sidelever', 'compound', 'triple', 'launch'];

/**
 * rest / transitioning-toward / at-target / drifting-back, classified from
 * `balance` at the end of every update — never a transition table.
 *
 * `blowing` and `turning` are booleans *beside* it rather than states of their
 * own: a boiler blowing off is still `'up'`, and four states have no room for
 * over-range.
 */
export type SteamState = 'cold' | 'raising' | 'up' | 'falling';

/**
 * The control duck-type again — deliberately not imported from `mechanisms`,
 * so a caller can hand any object with this shape to anything that wants one.
 */
export interface SteamControl {
  readonly state: number;
  readonly open: boolean;
  toggle(): boolean;
  set(target: number | boolean): void;
  update(dt: number): void;
  onChange?: (open: boolean) => void;
  object: Object3D;
}

export interface SteamPlant extends Prop {
  kind: SteamKind;

  // ── the store ────────────────────────────────────────────────────────
  /** Boiler contents, °C. THE ONE INTEGRATED NUMBER. */
  readonly temperature: number;
  /** Gauge pressure, bar. NOT STORED — derived from `temperature` every read. */
  readonly pressure: number;
  /** °C/s, SIGNED. The value that was integrated this step, so the needle's
   *  velocity and a planner's number cannot drift apart. */
  readonly balance: number;
  readonly working: number;
  readonly blowOff: number;
  /** The red mark at the bottom of the dial. Read by the gauge, by `state`
   *  and by `endurance` — and by NOTHING in the physics. Back pressure
   *  already brings her smoothly to a stand. */
  readonly low: number;
  /** How much of her power she can give you now, 0–1. */
  readonly readiness: number;
  /** The pressure the fire NOW ON THE GRATE would settle at, capped at
   *  `blowOff` because that is where the valve puts her. A getter, never a
   *  table row — a written-down banked-hold figure is the single easiest
   *  number in this family to get wrong. */
  readonly reach: number;
  /** Seconds to `bar` at the firing order she has now. `Infinity` if that
   *  fire will never get her there.
   *
   *  Assumes you are NOT steaming while you wait, which is what notice means
   *  — the same honest omission as `SailRig.layline` ignoring the tide. It
   *  also ignores the fire's own catch time and the scale she lays down on
   *  the way, so it runs a few per cent optimistic on a long light-up: under
   *  2% on a hand-fired boiler, more like 7% on a compound. */
  noticeFor(bar: number): number;
  /** Seconds she will still have `bar` if nobody touches anything else. A
   *  projection under held settings, not a promise. `Infinity` if she holds. */
  holdsFor(bar: number): number;
  /** === `holdsFor(low)`. One integrator, so the two cannot disagree. */
  readonly endurance: number;
  readonly state: SteamState;
  onState?: (state: SteamState) => void;

  // ── the fire ─────────────────────────────────────────────────────────
  /** What it is DOING, 0–1, eased. */
  readonly firing: number;
  /** What it was TOLD. */
  readonly draught: number;
  setDraught(level: number): void;
  /** Bank her: sugar for `setDraught(this era's banked level)`. Vocabulary,
   *  not model. */
  bank(): void;
  /** Coal on. Raises the bed and sets `green`, which is the black puff. A
   *  SILENT NO-OP on `launch` — and that no-op is the era axis. */
  stoke(amount?: number): void;
  /** Fire bed 0–1; caps `firing`. Always 1 on `launch`. */
  readonly bed: number;
  readonly fuel: number;
  bunker(amount?: number): void;
  /** Scale on the tubes, 0–1. A MULTIPLIER on the fire, not a state: a
   *  fouled boiler still gets there, it just never stops working for it. */
  readonly scale: number;
  blowDown(): void;
  fireDoor: SteamControl;

  // ── the engine ───────────────────────────────────────────────────────
  readonly regulator: number;
  setRegulator(open: number): void;
  /** Where the link IS: −1 (full astern gear) … 0 (mid-gear) … +1. NOT where
   *  it was ordered — it travels, and it travels heavier under steam.
   *  Cut-off AND direction in one number, because on a real engine they are
   *  one lever. */
  readonly link: number;
  readonly linkOrder: number;
  setLink(target: number): void;
  ahead(gear?: number): void;
  astern(gear?: number): void;
  stopEngine(): void;
  /** Fraction of the stroke steam is admitted for. */
  readonly cutoff: number;
  /** Revolutions per second, SIGNED. */
  readonly rev: number;
  /** Crank angle, rad, wrapping. The visible clock. */
  readonly crank: number;
  readonly mep: number;
  /** Includes the ripple: it dips twice a rev on one cylinder. */
  readonly torque: number;
  /** Stopped on dead centre with steam on and nothing happening. Only ever
   *  true where `cyls === 1`, and that is not a special case — it is the
   *  crank effort sum reaching zero. */
  readonly onCentre: boolean;
  /** Bar her over by hand: a quarter turn, so she can start. */
  barOver(): void;
  /** The longest cut-off she can hold for `seconds`, as a reverser position
   *  you hand straight back to `setLink`, signed to her current direction.
   *  0 if she cannot hold anything that long.
   *
   *  THE FUNCTION THE WHOLE THING EXISTS FOR, and the exact analogue of
   *  `SailRig.layline`: ask for a passage, get a setting she will keep. */
  linkFor(seconds: number): number;

  // ── what the hull takes ──────────────────────────────────────────────
  /** Her way through the water, m/s. Straight into `ShipInput.speed`. */
  readonly way: number;
  /** Instantaneous. TELEMETRY — do not hand this to the hull. */
  readonly thrust: number;
  /** Transverse thrust in WORLD m/s, ready for `ShipInput.drift`. MUTATED IN
   *  PLACE each frame: a live view, not a snapshot. */
  readonly walk: { x: number; z: number };
  /** How deep the screw is, 0 (racing in air) to 1. Feed it from the sea and
   *  she races over the crests with nothing written for it. */
  setImmersion(fraction: number): void;
  readonly immersion: number;

  // ── what you can see ─────────────────────────────────────────────────
  readonly blowing: boolean;
  readonly turning: boolean;
  /** [soot, grease], parented at the funnel top and cross-faded. */
  plumes: SmokeSource[];
  /** The safety valve's white feather. ADDITIVE, driven with `setTarget`. */
  feather: Steam;
  /** TRUE until you call `plumesInto`. */
  readonly stepsPlumes: boolean;
  /** Hand the plumes to a room AND STOP STEPPING THEM. `SmokeLayer.update`
   *  already calls `source.update` on everything add()ed; step them twice and
   *  the rate easing and the shader clock both run at 2× with nothing
   *  anywhere reporting it. Do NOT parent that layer to a moving hull —
   *  the layer samples parent space. */
  plumesInto(layer: SmokeLayer): void;
  /** Top of the funnel. Call `updateMatrixWorld` before reading its world
   *  position, like every other mouth in SCENA. */
  funnelTop: Object3D;
  gauge: PressureGauge;

  stokehold: PropSlot;
  platform: PropSlot;
  slots: PropSlot[];

  update(dt: number): void;
  /** Explicit fast-forward for authoring. Places the shaft and hull at their
   *  closed-form fixed points each coarse step and emits endpoints only. */
  settle(seconds: number): void;
}

export interface SteamPlantOptions {
  kind?: SteamKind;
  /** Where the crank starts, rad. Random by seed otherwise — and on a
   *  single-cylinder engine, 0 is dead centre. */
  crank?: number;
  /** Where she starts, in bar. DEFAULTS TO THE ERA'S WORKING PRESSURE — a
   *  ship in a scene has steam up, the way a fridge in a kitchen is cold.
   *  Pass 0 for a cold ship and be prepared to wait, or to call `settle`. */
  pressure?: number;
  fuel?: number;
  /** Funnel top above the plant's origin, m. Default 16 — far enough up that
   *  a deck-level camera is not standing inside the plume. */
  funnelHeight?: number;
  /** Suppress the casing, keep the plumes. */
  funnel?: boolean;
  push?: number;
  drag?: number;
  /** Exposed so a test can wire the valve shut and prove the cap is an
   *  OBJECT and not a `Math.min`. */
  reliefArea?: number;
  seed?: number;
  palette?: Palette;
}

const AMBIENT = 15;
const TAU = Math.PI * 2;
/** Below this she is not turning, for the purpose of breaking away. */
const CREEP = 0.02;
/** Half the travel of the die block in the expansion link, m. */
const ARC_HALF = 0.16;

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Saturated-steam pressure, bar GAUGE, from water temperature. Antoine, and
 * the `max(0, …)` is the whole reason the needle sits on its stop: below
 * 100 °C the absolute pressure is under one atmosphere and the gauge — which
 * measures the difference — reads nothing at all.
 */
export function pressureFor(celsius: number): number {
  return Math.max(0, Math.exp(11.784 - 3885 / (celsius + 230.2)) - 1.013);
}

/** The inverse. Gauge bar in, °C out. */
export function tempFor(bar: number): number {
  return 3885 / (11.784 - Math.log(Math.max(0, bar) + 1.013)) - 230.2;
}

/**
 * Mean effective pressure as a fraction of boiler pressure, for a cut-off.
 *
 * `c·(1 + ln(1/c))` — admit for a fifth of the stroke and the steam still
 * does 0.52 of the work it would do admitted all the way, on a fifth of the
 * steam. That logarithm IS the argument for expansion, and it is also why
 * mid-gear produces no torque: the limit at c → 0 is zero, reached smoothly,
 * with nothing written to stop her.
 */
export function expansionRatio(cutoff: number): number {
  return cutoff <= 1e-4 ? 0 : cutoff * (1 + Math.log(1 / cutoff));
}

/** Steam spent per unit of work: the reciprocal of the expansion gain. */
export function steamPerWork(cutoff: number): number {
  return cutoff <= 1e-4 ? Infinity : 1 / (1 + Math.log(1 / cutoff));
}

interface KindSpec {
  /** Cylinders. DECIDES WHETHER SHE CAN STOP ON DEAD CENTRE — a behaviour,
   *  not a mesh count. */
  cyls: number;
  phase: number[];
  stroke: number;
  rodRatio: number;
  working: number;
  blowOff: number;
  reseat: number;
  back: number;
  /** °C/s at full fire. */
  fire: number;
  /** Fixed loss coefficient — the LAGGING. The only loss that does not scale
   *  with the fire, and therefore the only thing that makes a banked fire
   *  hold lower than a full one. */
  lag: number;
  /** Loss coefficient proportional to the firing rate — up the FLUE. */
  flue: number;
  appetite: number;
  auxiliary: number;
  reliefArea: number;
  /** The draught that holds her at a simmer. DERIVED from the hold pressure
   *  wanted, not chosen. */
  banked: number;
  dump: number;
  catch: number;
  die: number;
  bedBurn: number;
  green: number;
  burnFor: number;
  scaleRate: number;
  maxCut: number;
  /** How the cut-off maps onto reverser travel. DECIDES WHETHER THE PLAYER'S
   *  REAL CONTROL IS THE GEAR OR THE THROTTLE — harmonise this toward 1.0
   *  across the kinds "for tidiness" and the sidelever quietly becomes a slow
   *  triple. */
  gearShape: number;
  linkRate: number;
  pull: number;
  absorb: number;
  friction: number;
  inertia: number;
  pitch: number;
  push: number;
  drag: number;
  astern: number;
  walk: number;
  paddle: boolean;
}

/**
 * The era table.
 *
 * The four thermal columns — `fire`, `lag`, `flue`, `auxiliary` — and
 * `banked` are **derived, not chosen.** Each was solved against one measured
 * behaviour, in an order where nothing has to be re-solved:
 *
 * - `lag` ← how long she takes to go cold with the fires drawn. Exact: with
 *   the fire out the auxiliaries are dead too, so it is a pure exponential.
 * - `fire` ← how often the safety valve lifts with the regulator shut.
 * - `flue` ← the light-up time, bisected, with `fire` following it.
 * - `banked` ← the draught that holds her at ~60% of working. Closed form.
 *
 * Solved the other way round — picking a banked draught and hoping — the
 * ceiling locks onto the banked hold and the safety valve can never lift at
 * all, because the flue loss and the heat are both proportional to the firing
 * rate and cancel.
 */
const KINDS: Record<SteamKind, KindSpec> = {
  sidelever: {
    cyls: 2, phase: [0, Math.PI / 2], stroke: 1.68, rodRatio: 4.2,
    working: 1.2, blowOff: 1.45, reseat: 1.25, back: 0.1,
    fire: 1.9987e-2, lag: 3.6954e-6, flue: 1.3337e-4,
    appetite: 0.0264, auxiliary: 5.0472e-2, reliefArea: 6.55, banked: 0.0677,
    dump: 1.69, catch: 420, die: 900, bedBurn: 1800, green: 110,
    burnFor: 28800, scaleRate: 4.0e-7,
    maxCut: 0.95, gearShape: 0.1, linkRate: 0.35,
    pull: 5.46, absorb: 46.0, friction: 1.03, inertia: 446,
    pitch: 22.0, push: 0.101, drag: 0.0146, astern: 0.85, walk: 0, paddle: true,
  },
  compound: {
    cyls: 2, phase: [0, Math.PI / 2], stroke: 0.6, rodRatio: 4.0,
    working: 7.0, blowOff: 7.6, reseat: 6.95, back: 0.35,
    fire: 9.1224e-3, lag: 4.3299e-6, flue: 2.5807e-5,
    appetite: 0.0112, auxiliary: 9.3086e-3, reliefArea: 3.74, banked: 0.1205,
    dump: 4.43, catch: 240, die: 600, bedBurn: 1800, green: 90,
    burnFor: 108000, scaleRate: 7.0e-7,
    maxCut: 0.8, gearShape: 1.15, linkRate: 0.7,
    pull: 0.922, absorb: 3.71, friction: 0.292, inertia: 63.2,
    pitch: 5.24, push: 0.204, drag: 0.0114, astern: 0.72, walk: 0.22, paddle: false,
  },
  triple: {
    cyls: 3, phase: [0, (TAU * 1) / 3, (TAU * 2) / 3], stroke: 0.99, rodRatio: 4.2,
    working: 12.5, blowOff: 13.2, reseat: 12.35, back: 0.45,
    fire: 6.9624e-3, lag: 3.9644e-6, flue: 1.3951e-5,
    appetite: 0.00625, auxiliary: 7.1294e-3, reliefArea: 3.69, banked: 0.1471,
    dump: 5.06, catch: 240, die: 600, bedBurn: 1800, green: 90,
    burnFor: 216000, scaleRate: 6.0e-7,
    maxCut: 0.85, gearShape: 1.3, linkRate: 0.55,
    pull: 0.504, absorb: 2.75, friction: 0.251, inertia: 67.0,
    pitch: 4.67, push: 0.173, drag: 0.00808, astern: 0.7, walk: 0.18, paddle: false,
  },
  launch: {
    cyls: 1, phase: [0], stroke: 0.2, rodRatio: 3.8,
    working: 11.0, blowOff: 12.0, reseat: 10.8, back: 0.3,
    fire: 8.8854e-1, lag: 4.9101e-5, flue: 4.5336e-3,
    appetite: 0.172, auxiliary: 3.757e-2, reliefArea: 0.453, banked: 0.0495,
    dump: 8.7, catch: 8, die: 14, bedBurn: Infinity, green: 0,
    burnFor: 21600, scaleRate: 1.2e-6,
    maxCut: 0.75, gearShape: 0.9, linkRate: 1.6,
    pull: 0.581, absorb: 0.127, friction: 0.054, inertia: 2.34,
    pitch: 0.864, push: 0.919, drag: 0.0709, astern: 0.75, walk: 0.3, paddle: false,
  },
};

/** Everything the model integrates, and nothing it draws. Copyable, so a
 *  projection can run forward without touching the plant. */
interface Sim {
  temperature: number;
  crank: number;
  rev: number;
  way: number;
  link: number;
  linkOrder: number;
  firing: number;
  draught: number;
  bed: number;
  green: number;
  fuel: number;
  scale: number;
  blowing: boolean;
  regulator: number;
  immersion: number;
  balance: number;
  torque: number;
  thrust: number;
  doorShut: number;
}

const copy = (s: Sim): Sim => ({ ...s });

/** Mean |crank effort| over a revolution — the normaliser, so `torque` means
 *  the same thing whatever the cylinder count. */
function effortNormOf(spec: KindSpec): number {
  const lambda = 1 / spec.rodRatio;
  let sum = 0;
  const N = 720;
  for (let i = 0; i < N; i++) {
    const crank = (i / N) * TAU;
    let e = 0;
    for (const phi of spec.phase) {
      const th = crank + phi;
      e += Math.abs(Math.sin(th) + (lambda / 2) * Math.sin(2 * th));
    }
    sum += e / spec.cyls;
  }
  return sum / N;
}

export function createSteamPlant(options: SteamPlantOptions = {}): SteamPlant {
  const kind: SteamKind = options.kind ?? 'triple';
  const base = KINDS[kind];
  const spec: KindSpec = {
    ...base,
    push: options.push ?? base.push,
    drag: options.drag ?? base.drag,
    reliefArea: options.reliefArea ?? base.reliefArea,
  };
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const funnelHeight = options.funnelHeight ?? 16;
  const lambda = 1 / spec.rodRatio;
  const effortNorm = effortNormOf(spec);
  const low = 0.4 * spec.working;

  // Free-running speed at working pressure in full gear — the normaliser the
  // engine's steam draw is measured against.
  const mepFull = Math.max(0, spec.working - spec.back) * expansionRatio(spec.maxCut);
  const tqFull = spec.pull * mepFull;
  const maxRev =
    (-spec.friction + Math.sqrt(spec.friction ** 2 + 4 * spec.absorb * tqFull)) /
    (2 * spec.absorb);

  const sim: Sim = {
    temperature: tempFor(options.pressure ?? spec.working),
    crank: options.crank ?? rng.range(0.4, TAU - 0.4),
    rev: 0,
    way: 0,
    link: 0,
    linkOrder: 0,
    firing: 0,
    draught: 0,
    bed: spec.bedBurn === Infinity ? 1 : 1,
    green: 0,
    fuel: clamp01(options.fuel ?? 1),
    scale: 0,
    blowing: false,
    regulator: 0,
    immersion: 1,
    balance: 0,
    torque: 0,
    thrust: 0,
    doorShut: 1,
  };
  // A COLD SHIP IS AT AMBIENT, NOT AT ZERO BAR. `tempFor(0)` is 100 °C — the
  // temperature at which the gauge reads nothing because she is boiling, not
  // because she is cold.
  if ((options.pressure ?? spec.working) <= 0) sim.temperature = AMBIENT;

  // ── the model ────────────────────────────────────────────────────────

  /** Crank effort at an angle, normalised so 1 is the average. */
  const effortAt = (crank: number): number => {
    let e = 0;
    for (const phi of spec.phase) {
      const th = crank + phi;
      e += Math.abs(Math.sin(th) + (lambda / 2) * Math.sin(2 * th));
    }
    return e / spec.cyls / effortNorm;
  };

  /** The fire, shared by the fine and the coarse step. */
  const burn = (s: Sim, h: number): void => {
    // A BANKED FIRE IS CHEAP — that is the one thing banking exists for. Burn
    // the bed and the bunker at a flat rate regardless of the draught and a
    // boiler banked overnight is found dead in the morning.
    const eats = 0.01 + 0.99 * s.firing;
    if (spec.bedBurn !== Infinity) s.bed = Math.max(0, s.bed - (h / spec.bedBurn) * eats);
    // The fire door: open it and the draught falls away while you shovel.
    // One multiplier, and it is why the needle sags every time you stoke.
    const doorFactor = 0.35 + 0.65 * s.doorShut;
    const want =
      Math.min(s.draught * doorFactor, spec.bedBurn === Infinity ? 1 : s.bed) *
      (s.fuel > 0 ? 1 : 0);
    // A fire catches faster than it dies. Two time constants, and the
    // asymmetry is why a banked boiler is worth having.
    const lagT = want > s.firing ? spec.catch : spec.die;
    s.firing += Math.sign(want - s.firing) * Math.min(Math.abs(want - s.firing), h / lagT);
    s.fuel = Math.max(0, s.fuel - (h / spec.burnFor) * eats);
    if (spec.green > 0) s.green = Math.max(0, s.green - h / spec.green);
    s.scale = Math.min(1, s.scale + spec.scaleRate * s.firing * h);
  };

  /** The signed balance, and the integration of it. */
  const thermal = (s: Sim, h: number, engineDraw: number, dumped: number): void => {
    const P = pressureFor(s.temperature);
    if (!s.blowing && P >= spec.blowOff) s.blowing = true;
    else if (s.blowing && P <= spec.reseat) s.blowing = false;

    const raised = spec.fire * s.firing * (1 - s.scale * 0.5);
    const lost = (s.temperature - AMBIENT) * (spec.lag + spec.flue * s.firing);
    // Auxiliary steam is REDUCED and it is only alive while there is a fire in
    // her or the engine is turning. With the fires drawn they stop, which is
    // what makes a cold-down a property of the lagging and nothing else.
    const aux =
      spec.appetite *
      Math.min(P, spec.working) *
      spec.auxiliary *
      Math.max(s.firing, s.regulator);
    const vent = s.blowing ? spec.appetite * P * spec.reliefArea : 0;
    s.balance = raised - lost - engineDraw - aux - vent - dumped;
    s.temperature += s.balance * h;
  };

  const INNER = 0.02;

  /** One fine step: everything moves, nothing is at a fixed point. */
  const fine = (s: Sim, h: number): void => {
    const P = pressureFor(s.temperature);
    const chest = P * s.regulator;

    burn(s, h);

    // The reverser is a VELOCITY, not a knob: it travels, and it travels
    // heavier with steam on the valves.
    const effort = 1 - 0.7 * s.regulator * clamp01(P / spec.working);
    const maxStep = spec.linkRate * effort * h;
    const err = s.linkOrder - s.link;
    const moved = Math.abs(err) <= maxStep ? err : Math.sign(err) * maxStep;
    s.link += moved;
    const linkVel = h > 0 ? moved / h : 0;

    const cutoff = spec.maxCut * Math.abs(s.link) ** spec.gearShape;
    const mep = Math.max(0, chest - spec.back) * expansionRatio(cutoff);
    const dir = Math.sign(s.link);
    s.torque = spec.pull * mep * effortAt(s.crank) * dir * (dir < 0 ? spec.astern : 1);

    const net =
      s.torque - spec.absorb * s.rev * Math.abs(s.rev) * s.immersion - spec.friction * s.rev;
    // DEAD CENTRE. Not a special case: the crank effort sum has simply
    // reached zero, which one cylinder can do and two at 90° never can.
    if (Math.abs(s.rev) < CREEP && Math.abs(net) < spec.friction * 0.5) s.rev = 0;
    else s.rev += (net / spec.inertia) * h;
    s.crank = (s.crank + s.rev * TAU * h) % TAU;
    if (s.crank < 0) s.crank += TAU;

    // Both terms carry `immersion`, but not to the same power: a screw half
    // out of the water turns much faster AND pushes very little, because
    // what is left is churning air down onto the blades. Linear in both and
    // she races and goes FASTER, which is the opposite of the read.
    s.thrust = spec.push * (s.rev * spec.pitch - s.way) * s.immersion * s.immersion;
    s.way += (s.thrust - spec.drag * s.way * Math.abs(s.way)) * h;
    if (s.way < 0 && s.thrust >= 0) s.way = Math.max(s.way, -0.5);

    const engine = spec.appetite * chest * cutoff * (Math.abs(s.rev) / maxRev);
    // Swinging the reverser under steam DUMPS a chestful. Notching up costs
    // you something, which is why you do not fiddle with it.
    const dumped = spec.dump * Math.abs(linkVel) * s.regulator * clamp01(P / spec.working);
    thermal(s, h, engine, dumped);
  };

  /**
   * One coarse step: the shaft and the hull RELAX toward their closed-form
   * fixed points rather than being integrated.
   *
   * `tended` is the one thing a projection assumes that a watched plant does
   * not. Skipping four hours with nobody on the plate finds the fire out and
   * the boiler cold, which is true and useless — "how long will she hold
   * this" means "how long will she hold this while somebody keeps the fire
   * in". In real time, stoking is the player's job and this is false.
   */
  const coarse = (s: Sim, h: number, tended = true): void => {
    if (tended && spec.bedBurn !== Infinity && s.fuel > 0) s.bed = 1;
    const P = pressureFor(s.temperature);
    const chest = P * s.regulator;
    burn(s, h);
    s.link = s.linkOrder;

    const cutoff = spec.maxCut * Math.abs(s.link) ** spec.gearShape;
    const mep = Math.max(0, chest - spec.back) * expansionRatio(cutoff);
    const dir = Math.sign(s.link);
    const tq = spec.pull * mep * dir * (dir < 0 ? spec.astern : 1);
    const a = spec.absorb * s.immersion;
    const revTo =
      Math.sign(tq) *
      ((-spec.friction + Math.sqrt(spec.friction ** 2 + 4 * a * Math.abs(tq))) / (2 * a));
    // A SINGLE CYLINDER STOPPED ON DEAD CENTRE STAYS THERE. The fixed point
    // knows nothing about crank angle, so skipping time would quietly start an
    // engine a watched plant could never start.
    const stalled =
      Math.abs(s.rev) < CREEP && Math.abs(tq * effortAt(s.crank)) < spec.friction * 0.5;
    if (stalled) s.rev = 0;
    else {
      // RELAX, do not SNAP. Snapping puts the shaft at full revolutions on the
      // first coarse step, so the engine draws its whole appetite from an
      // instant when a watched plant would still be turning over — a launch
      // fast-forwarded arrives at half the pressure of the same launch watched.
      const revTau = spec.inertia / (spec.friction + 2 * a * Math.abs(revTo) + 1e-9);
      s.rev = revTo + (s.rev - revTo) * Math.exp(-h / revTau);
    }
    s.crank = (s.crank + s.rev * TAU * h) % TAU;
    if (s.crank < 0) s.crank += TAU;

    const k = spec.push * s.rev * spec.pitch * s.immersion;
    const p = spec.push * s.immersion;
    const mag = (drive: number): number =>
      (-p + Math.sqrt(p * p + 4 * spec.drag * Math.abs(drive))) / (2 * spec.drag);
    const wayTo = k >= 0 ? mag(k) : Math.max(-0.5, -mag(k));
    const wayTau = 1 / (p + 2 * spec.drag * Math.abs(wayTo) + 1e-9);
    s.way = wayTo + (s.way - wayTo) * Math.exp(-h / wayTau);
    s.thrust = spec.push * (s.rev * spec.pitch - s.way) * s.immersion * s.immersion;

    const engine = spec.appetite * chest * cutoff * (Math.abs(s.rev) / maxRev);
    thermal(s, h, engine, 0);
  };

  const COARSE = Math.min(5, spec.catch / 5, spec.die / 5);
  const advance = (s: Sim, seconds: number): void => {
    let left = seconds;
    while (left > 0) {
      const h = Math.min(COARSE, left);
      left -= h;
      coarse(s, h);
    }
  };

  /**
   * The temperature a steady firing rate `f` would settle at, with the engine
   * as it is now. Bisected rather than written down: the equilibrium moves
   * with the scale on the tubes and with what the engine is taking, and a
   * banked-hold figure in a table is the easiest number here to get wrong.
   */
  const settleTemp = (f: number): number => {
    const cutoff = spec.maxCut * Math.abs(sim.link) ** spec.gearShape;
    const at = (T: number): number => {
      const P = pressureFor(T);
      const chest = P * sim.regulator;
      const raised = spec.fire * f * (1 - sim.scale * 0.5);
      const lost = (T - AMBIENT) * (spec.lag + spec.flue * f);
      const aux =
        spec.appetite * Math.min(P, spec.working) * spec.auxiliary * Math.max(f, sim.regulator);
      const engine = spec.appetite * chest * cutoff * (Math.abs(sim.rev) / maxRev);
      return raised - lost - aux - engine;
    };
    let lo = AMBIENT;
    let hi = AMBIENT + spec.fire / spec.lag;
    if (at(lo) <= 0) return AMBIENT;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (at(m) > 0) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };

  // ── geometry ─────────────────────────────────────────────────────────

  const group = new Group();
  group.name = `steamPlant:${kind}`;

  const iron = createSurface('steel', { color: 0x4d4f52, seed });
  const lagged = createSurface('plaster', { color: 0xb9b2a4, seed: seed + 1 });
  const brass = createSurface('brass', { seed: seed + 2 });
  const dark = new MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.75 });
  // Iron, not whatever the palette calls metal — a white firebox face reads
  // as a domestic appliance parked on the deck.
  const plate = createSurface('steel', { color: 0x4a4d51, seed: seed + 3 });

  // Scale everything off the stroke, so a launch is a launch and a sidelever
  // fills an engine room.
  const r = spec.stroke / 2;
  const rod = spec.rodRatio * r;
  const bore = spec.stroke * 0.62;
  // The BOILER is not sized by the engine. Scale everything off the stroke and
  // a triple gets a 2.7 m drum and a 1.1 m funnel — correct arithmetic, and it
  // renders as a fridge with a flagpole on it. A Scotch boiler is four metres
  // across and a liner's funnel is three, because the fire is the big thing.
  const boilerR = Math.max(0.8, spec.stroke * 2.0);
  const boilerLen = boilerR * 2.5;

  // THE BOILER IS A HOLE. Shell as an open-ended cylinder with a back plate
  // only — the front is the firebox face, and the door opens into a recess
  // you can see into. A solid drum with the doors parented inside renders as
  // a closed can and every test still passes, because no test looks through.
  const shell = new Mesh(
    new CylinderGeometry(boilerR, boilerR, boilerLen, 20, 1, true),
    lagged
  );
  shell.rotation.x = Math.PI / 2;
  shell.position.set(0, boilerR + 0.25, -boilerLen / 2 - 0.05);
  group.add(shell);
  const backPlate = new Mesh(new CylinderGeometry(boilerR, boilerR, 0.06, 20), plate);
  backPlate.rotation.x = Math.PI / 2;
  backPlate.position.set(0, boilerR + 0.25, -boilerLen - 0.05);
  group.add(backPlate);
  for (let i = 0; i < 3; i++) {
    const hoop = new Mesh(new TorusGeometry(boilerR * 1.01, 0.035, 6, 20), iron);
    hoop.position.set(0, boilerR + 0.25, -0.35 - (i * (boilerLen - 0.7)) / 2);
    group.add(hoop);
  }

  // The firebox face, with a door-sized hole in it made of four plates.
  const doorCount = spec.cyls === 1 ? 1 : 2;
  const doorW = boilerR * 0.52;
  const doorH = boilerR * 0.46;
  const faceY = boilerR * 0.72;
  const faceZ = -0.06;
  const facePanel = (w: number, hgt: number, x: number, y: number): void => {
    const m = new Mesh(new BoxGeometry(w, hgt, 0.05), plate);
    m.position.set(x, y, faceZ);
    group.add(m);
  };
  {
    const span = doorCount * doorW + (doorCount - 1) * 0.1;
    const sideW = (boilerR * 2 - span) / 2;
    facePanel(sideW, boilerR * 2, -(span / 2 + sideW / 2), boilerR + 0.25);
    facePanel(sideW, boilerR * 2, span / 2 + sideW / 2, boilerR + 0.25);
    facePanel(span, boilerR * 2 - (faceY + doorH / 2) - 0.25 + boilerR, 0,
      boilerR + 0.25 + (faceY + doorH / 2 + 0.25 + boilerR) / 2);
    facePanel(span, faceY - doorH / 2 + 0.25, 0, (faceY - doorH / 2 + 0.25) / 2 - 0.25 + 0.25);
    if (doorCount === 2) facePanel(0.1, doorH, 0, faceY);
  }

  // The void behind it: a box open toward +z, with the fire on the back of it.
  const recess = new Group();
  recess.position.set(0, faceY, faceZ - 0.03);
  group.add(recess);
  const rw = doorCount * doorW + (doorCount - 1) * 0.1;
  const rd = boilerR * 0.9;
  const wall = (w: number, hgt: number, d: number, x: number, y: number, z: number): void => {
    const m = new Mesh(new BoxGeometry(w, hgt, d), dark);
    m.position.set(x, y, z);
    recess.add(m);
  };
  wall(rw, 0.04, rd, 0, doorH / 2, -rd / 2);
  wall(rw, 0.04, rd, 0, -doorH / 2, -rd / 2);
  wall(0.04, doorH, rd, -rw / 2, 0, -rd / 2);
  wall(0.04, doorH, rd, rw / 2, 0, -rd / 2);
  const fireMat = new MeshStandardMaterial({
    color: 0x2a1408,
    emissive: 0xff7326,
    emissiveIntensity: 0,
    roughness: 1,
  });
  const fireGlow = new Mesh(new PlaneGeometry(rw * 0.94, doorH * 0.92), fireMat);
  fireGlow.name = 'firebox:fire';
  fireGlow.position.z = -rd + 0.03;
  recess.add(fireGlow);

  // Fire doors — a fifth hand-rolled copy of the control duck-type, and
  // called a copy. `> 0.5` throughout, matching every other clone in the tree
  // rather than mechanisms.ts's `>= 0.5`.
  const flaps: Object3D[] = [];
  for (let i = 0; i < doorCount; i++) {
    const hinge = new Object3D();
    const x = doorCount === 1 ? 0 : (i === 0 ? -1 : 1) * (doorW / 2 + 0.05);
    hinge.position.set(x + (doorCount === 1 ? -doorW / 2 : i === 0 ? -doorW / 2 : doorW / 2),
      faceY, faceZ + 0.03);
    const leaf = new Mesh(new BoxGeometry(doorW, doorH, 0.04), iron);
    leaf.position.x = (i === 0 && doorCount === 2) || doorCount === 1 ? doorW / 2 : -doorW / 2;
    hinge.add(leaf);
    const handle = new Mesh(new CylinderGeometry(0.018, 0.018, doorH * 0.5, 8), brass);
    handle.position.set(leaf.position.x + (doorCount === 1 ? doorW * 0.36 : 0), 0, 0.035);
    hinge.add(handle);
    group.add(hinge);
    flaps.push(hinge);
  }

  // Funnel — a casing, hollow, so smoke comes out of a pipe and not a post.
  const funnelR = Math.max(0.55, boilerR * 0.62);
  const funnelTop = new Object3D();
  funnelTop.position.set(0, funnelHeight, -boilerLen * 0.55);
  group.add(funnelTop);
  if (options.funnel !== false) {
    const casing = new Mesh(
      new CylinderGeometry(funnelR, funnelR * 1.08, funnelHeight - boilerR * 2 - 0.25, 16, 1, true),
      createSurface('paint', { color: 0x2f3134, seed: seed + 4 })
    );
    casing.position.set(
      0,
      boilerR * 2 + 0.25 + (funnelHeight - boilerR * 2 - 0.25) / 2,
      -boilerLen * 0.55
    );
    group.add(casing);
    const cap = new Mesh(new TorusGeometry(funnelR * 1.04, 0.05, 6, 16), iron);
    cap.rotation.x = Math.PI / 2;
    cap.position.copy(funnelTop.position);
    group.add(cap);
  }

  // Safety valve, on top of the boiler where everybody can hear it.
  const valveMount = new Object3D();
  valveMount.position.set(boilerR * 0.45, boilerR * 2 + 0.25, -boilerLen * 0.28);
  group.add(valveMount);
  const valveSeat = new Mesh(new CylinderGeometry(0.09, 0.11, 0.1, 12), brass);
  valveMount.add(valveSeat);
  const poppet = new Object3D();
  poppet.position.y = 0.08;
  valveMount.add(poppet);
  const poppetHead = new Mesh(new CylinderGeometry(0.07, 0.07, 0.05, 12), brass);
  poppet.add(poppetHead);
  const spring = new Mesh(new CylinderGeometry(0.045, 0.045, 0.16, 8), iron);
  spring.position.y = 0.13;
  valveMount.add(spring);

  // The engine. Built in a frame where the shaft runs along +x; a screw ship's
  // engine is then turned a quarter so her shaft runs aft, and a paddler's is
  // left athwartships with the wheels on the ends of it.
  const engine = new Group();
  engine.position.set(0, 0, boilerR * 1.35);
  engine.rotation.y = spec.paddle ? 0 : Math.PI / 2;
  group.add(engine);

  const shaftY = 0.35 + r;
  const spanX = Math.max(1.2, spec.cyls * bore * 1.9);
  const bed = new Mesh(new BoxGeometry(spanX + 0.5, 0.3, bore * 2.4), plate);
  bed.position.y = 0.15;
  engine.add(bed);

  const shaft = new Object3D();
  shaft.position.y = shaftY;
  engine.add(shaft);
  const shaftBar = new Mesh(new CylinderGeometry(r * 0.22, r * 0.22, spanX + 0.4, 10), iron);
  shaftBar.rotation.z = Math.PI / 2;
  shaft.add(shaftBar);

  interface Unit {
    pin: Object3D;
    crosshead: Object3D;
    conrod: Object3D;
    pistonRod: Mesh;
    phase: number;
    x: number;
  }
  const units: Unit[] = [];
  for (let i = 0; i < spec.cyls; i++) {
    const x = spec.cyls === 1 ? 0 : (i / (spec.cyls - 1) - 0.5) * spanX;
    const phi = spec.phase[i];

    // The throw is a CHILD OF THE SHAFT set at this cylinder's phase, so the
    // pin follows the crank for free and a three-crank engine looks like one
    // rather than like three of the same.
    const throwArm = new Object3D();
    throwArm.rotation.x = phi;
    shaft.add(throwArm);
    const web = new Mesh(new BoxGeometry(r * 0.3, r * 1.3, r * 0.34), iron);
    web.position.set(x, r / 2, 0);
    throwArm.add(web);
    const pin = new Object3D();
    pin.name = 'crankpin';
    pin.position.set(x, r, 0);
    throwArm.add(pin);
    const pinBar = new Mesh(new CylinderGeometry(r * 0.16, r * 0.16, r * 0.4, 8), iron);
    pinBar.rotation.z = Math.PI / 2;
    pin.add(pinBar);

    const crosshead = new Object3D();
    crosshead.name = 'crosshead';
    crosshead.position.x = x;
    engine.add(crosshead);
    const block = new Mesh(new BoxGeometry(bore * 0.5, r * 0.34, bore * 0.44), iron);
    crosshead.add(block);

    const conrod = new Object3D();
    engine.add(conrod);
    const rodBar = new Mesh(new BoxGeometry(r * 0.16, rod, r * 0.16), iron);
    rodBar.position.y = rod / 2;
    conrod.add(rodBar);

    const pistonRod = new Mesh(new CylinderGeometry(r * 0.1, r * 0.1, spec.stroke * 1.4, 8), brass);
    engine.add(pistonRod);

    // Cylinder above, with a cover, and the guide bars the crosshead runs in.
    const cylY = shaftY + r + rod + spec.stroke * 0.5 + 0.12;
    const cyl = new Mesh(
      new CylinderGeometry(bore / 2, bore / 2, spec.stroke * 1.25, 14, 1, true),
      lagged
    );
    cyl.position.set(x, cylY, 0);
    engine.add(cyl);
    const cover = new Mesh(new CylinderGeometry(bore * 0.56, bore * 0.56, 0.06, 14), iron);
    cover.position.set(x, cylY + spec.stroke * 0.625, 0);
    engine.add(cover);
    const bottom = new Mesh(new CylinderGeometry(bore * 0.56, bore * 0.56, 0.06, 14), iron);
    bottom.position.set(x, cylY - spec.stroke * 0.625, 0);
    engine.add(bottom);
    for (let g = 0; g < 4; g++) {
      const gx = x + (g < 2 ? -1 : 1) * bore * 0.4;
      const gz = (g % 2 === 0 ? -1 : 1) * bore * 0.32;
      const col = new Mesh(
        new CylinderGeometry(0.035, 0.035, cylY - spec.stroke * 0.625 - 0.3, 6),
        iron
      );
      col.position.set(gx, 0.3 + (cylY - spec.stroke * 0.625 - 0.3) / 2, gz);
      engine.add(col);
    }

    units.push({ pin, crosshead, conrod, pistonRod, phase: phi, x });
  }

  // The expansion link: a curved slotted plate, STATIC, with a die block that
  // slides in it. The die block sliding to the middle of the link is the exact
  // instant the torque goes to zero — so the geometry and the physics are the
  // same claim, seen twice.
  const linkStand = new Object3D();
  linkStand.position.set(spanX / 2 + 0.42, shaftY + r * 0.4, 0);
  engine.add(linkStand);
  const arc = new Mesh(new TorusGeometry(ARC_HALF * 1.9, 0.028, 6, 14, 1.05), iron);
  arc.rotation.y = Math.PI / 2;
  arc.rotation.z = Math.PI / 2 - 0.525;
  linkStand.add(arc);
  const dieBlock = new Mesh(new BoxGeometry(0.09, 0.075, 0.075), brass);
  dieBlock.name = 'dieBlock';
  linkStand.add(dieBlock);

  const quadrant = new Object3D();
  quadrant.position.set(spanX / 2 + 0.75, 0.32, bore * 0.8);
  engine.add(quadrant);
  const quadPlate = new Mesh(new TorusGeometry(0.55, 0.03, 5, 12, 1.3), iron);
  quadPlate.rotation.y = Math.PI / 2;
  quadPlate.rotation.z = Math.PI / 2 - 0.65;
  quadrant.add(quadPlate);
  const reverserLever = new Object3D();
  quadrant.add(reverserLever);
  const leverBar = new Mesh(new BoxGeometry(0.05, 0.9, 0.05), iron);
  leverBar.position.y = 0.45;
  reverserLever.add(leverBar);
  const leverGrip = new Mesh(new CylinderGeometry(0.035, 0.035, 0.14, 8), brass);
  leverGrip.position.y = 0.9;
  leverGrip.rotation.z = Math.PI / 2;
  reverserLever.add(leverGrip);

  // Regulator: a wheel-topped lever on the starting platform. Its position is
  // POLLED every frame — a notch change from 0.2 to 0.45 fires no onChange.
  const regStand = new Object3D();
  regStand.position.set(-spanX / 2 - 0.6, 0.9, bore * 0.8);
  engine.add(regStand);
  const regPost = new Mesh(new CylinderGeometry(0.05, 0.06, 0.9, 8), iron);
  regPost.position.y = -0.45;
  regStand.add(regPost);
  const regLever = new Object3D();
  regStand.add(regLever);
  const regBar = new Mesh(new BoxGeometry(0.04, 0.62, 0.04), iron);
  regBar.position.y = 0.31;
  regLever.add(regBar);
  const regKnob = new Mesh(new CylinderGeometry(0.05, 0.05, 0.05, 10), brass);
  regKnob.position.y = 0.62;
  regLever.add(regKnob);

  // Starting platform and its rails.
  const grating = new Mesh(new BoxGeometry(spanX + 1.6, 0.05, 0.7), plate);
  grating.position.set(0, 0.3, bore * 1.25);
  engine.add(grating);
  for (let i = 0; i < 2; i++) {
    const rail = new Mesh(
      new CylinderGeometry(0.025, 0.025, spanX + 1.6, 6),
      iron
    );
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 0.3 + 0.55 + i * 0.35, bore * 1.6);
    engine.add(rail);
  }

  // Paddle wheels, on the ends of an athwartships shaft, where she has one.
  interface Float {
    pivot: Object3D;
    ang: number;
  }
  const floats: Float[] = [];
  if (spec.paddle) {
    const wheelR = 3.2;
    for (const side of [-1, 1]) {
      const hub = new Object3D();
      hub.position.x = side * (spanX / 2 + 1.9);
      shaft.add(hub);
      const rim = new Mesh(new TorusGeometry(wheelR, 0.07, 6, 24), iron);
      rim.rotation.y = Math.PI / 2;
      hub.add(rim);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const spoke = new Mesh(new BoxGeometry(0.05, wheelR, 0.05), iron);
        spoke.position.set(0, (Math.cos(a) * wheelR) / 2, (Math.sin(a) * wheelR) / 2);
        spoke.rotation.x = -a;
        hub.add(spoke);
        // The float hangs off the rim on its own pivot and is counter-rotated
        // so it stays near vertical — which is what feathering IS.
        const pivot = new Object3D();
        pivot.position.set(0, Math.cos(a) * wheelR, Math.sin(a) * wheelR);
        hub.add(pivot);
        const board = new Mesh(new BoxGeometry(0.9, 0.7, 0.06), createSurface('plank', {
          color: palette.wood,
          seed: seed + i,
        }));
        pivot.add(board);
        floats.push({ pivot, ang: a });
      }
    }
  }

  // The gauge, on a stand where the engineer can see it from the platform.
  const gauge = createPressureGauge({
    max: Math.ceil(spec.blowOff * 1.25),
    redline: spec.blowOff,
    lowMark: low,
    value: pressureFor(sim.temperature),
    seed: seed + 5,
    palette,
  });
  const gaugeStand = new Object3D();
  gaugeStand.position.set(boilerR * 0.62, 1.55, boilerR * 0.7);
  gaugeStand.rotation.y = -0.5;
  group.add(gaugeStand);
  const gaugePipe = new Mesh(new CylinderGeometry(0.03, 0.03, 1.55, 8), brass);
  gaugePipe.position.y = -0.775;
  gaugeStand.add(gaugePipe);
  gaugeStand.add(gauge.object);

  // Plumes at the funnel top. TWO, cross-faded: soot is what she makes all
  // the time and grease is the black puff of a fresh shovelful. NORMAL
  // blending, always — near-black smoke under AdditiveBlending is invisible
  // while `rate` reads perfectly.
  // A FUNNEL PLUME IS AN ORDER OF MAGNITUDE BIGGER than anything smoke.ts has
  // drawn before — its styles are sized for a 52 m³ kitchen. At kitchen scale
  // a ship's funnel makes three faint dots over a fifty-metre hull while
  // `rate` reads 0.79.
  const soot = createSmoke({
    style: 'soot',
    height: 26,
    radius: funnelR * 2.4,
    count: 34,
    output: 14,
    seed: seed + 6,
  });
  const grease = createSmoke({
    style: 'grease',
    height: 21,
    radius: funnelR * 2.6,
    count: 28,
    output: 22,
    seed: seed + 7,
  });
  funnelTop.add(soot.object);
  funnelTop.add(grease.object);

  // The safety valve's feather. Steam, so ADDITIVE — and driven with
  // setTarget, not setRate. The two are not interchangeable.
  const feather = createSteam({ radius: 0.3, height: 7.5, count: 18, seed: seed + 8 });
  valveMount.add(feather.object);
  feather.object.position.y = 0.24;

  const stokehold = addApproach(
    createSlot('stokehold', 'work', group, 0, 0, boilerR * 1.1, Math.PI),
    group,
    0.8,
    'front'
  );
  const platform = addApproach(
    createSlot('platform', 'work', group, -boilerR * 0.5, 0.35, boilerR * 2.4, Math.PI),
    group,
    0.8,
    'front'
  );

  // ── the visible parts, each driven from exactly one piece of state ────

  let valveLift = 0;
  const walk = { x: 0, z: 0 };
  const worldQ = new Quaternion();
  const starboard = new Vector3();

  const place = (): void => {
    shaft.rotation.x = sim.crank;
    for (const u of units) {
      const th = sim.crank + u.phase;
      // Exact slider-crank. Travel is exactly one stroke, and that is a test.
      const root = Math.sqrt(Math.max(0, rod * rod - (r * Math.sin(th)) ** 2));
      const y = r * Math.cos(th) + root;
      u.crosshead.position.y = shaftY + y;
      // The rod runs from the crankpin up to the crosshead and DOES NOT
      // STRETCH: if the two ends do not meet, the linkage is wrong.
      u.conrod.position.set(u.x, shaftY + r * Math.cos(th), r * Math.sin(th));
      u.conrod.rotation.x = -Math.asin(clamp01(Math.abs(r * Math.sin(th)) / rod) *
        Math.sign(Math.sin(th)));
      u.pistonRod.position.set(u.x, shaftY + y + spec.stroke * 0.7, 0);
    }
    // The die block slides to the middle of the link at exactly the moment
    // the torque goes to zero.
    dieBlock.position.y = sim.link * ARC_HALF;
    reverserLever.rotation.x = sim.link * 0.62;
    regLever.rotation.x = -sim.regulator * 0.7;
    for (const f of floats) {
      // Counter-rotate against the wheel, with a little lag — a feathering
      // float is never quite upright and that is what you see.
      f.pivot.rotation.x = -sim.crank - f.ang + Math.sin(sim.crank + f.ang) * 0.22;
    }
    for (let i = 0; i < flaps.length; i++) {
      const swing = (1 - sim.doorShut) * 1.9;
      flaps[i].rotation.y = (i === 0 ? -1 : 1) * swing;
    }
    poppet.position.y = 0.08 + valveLift * 0.06;
    spring.scale.y = 1 - valveLift * 0.35;
    fireMat.emissiveIntensity = sim.firing * 2.6 * (0.35 + 0.65 * (1 - sim.doorShut));
  };
  place();

  // ── state ────────────────────────────────────────────────────────────

  let state: SteamState = 'cold';
  const classify = (): SteamState => {
    const P = pressureFor(sim.temperature);
    // A two-sided band, so a plant sitting at its equilibrium does not
    // chatter between raising and falling on the noise of its own integrator.
    const enter = spec.fire * 0.12;
    const leave = spec.fire * 0.3;
    const band = state === 'up' || state === 'cold' ? leave : enter;
    // Raising steam is an OPERATION and not only a rate. One frame after the
    // damper opens the fire has not caught, the balance is still nothing, and
    // reporting 'cold' for the next four minutes is a lie about intent.
    //
    // Against the fire she can actually GET, though — not against the damper.
    // A thin bed caps the firing rate for as long as nobody shovels, and a
    // plant collapsing under full gear then reads 'raising' for ever because
    // the damper is still wide open.
    const doorFactor = 0.35 + 0.65 * sim.doorShut;
    const want = Math.min(
      sim.draught * doorFactor,
      spec.bedBurn === Infinity ? 1 : sim.bed
    );
    if (want > sim.firing + 0.02 && P < spec.working) return 'raising';
    if (sim.balance > band) return 'raising';
    if (sim.balance < -band) return 'falling';
    return P >= low ? 'up' : 'cold';
  };
  state = classify();

  const plant: SteamPlant = {
    object: group,
    // A fitting inside a hull is not something you steer around, and a
    // nonzero radius would put a world-space circle in a walkable deck.
    obstacleRadius: 0,
    kind,
    plumes: [soot, grease],
    feather,
    funnelTop,
    gauge,
    stokehold,
    platform,
    slots: [stokehold, platform],

    get temperature() {
      return sim.temperature;
    },
    get pressure() {
      return pressureFor(sim.temperature);
    },
    get balance() {
      return sim.balance;
    },
    working: spec.working,
    blowOff: spec.blowOff,
    low,
    get readiness() {
      return clamp01((pressureFor(sim.temperature) - low) / (spec.working - low));
    },
    get reach() {
      return Math.min(spec.blowOff, pressureFor(settleTemp(sim.firing)));
    },
    noticeFor(bar: number) {
      const target = tempFor(bar);
      if (sim.temperature >= target) return 0;
      // The fire she has been ORDERED, because notice is about what is coming.
      const f = clamp01(sim.draught * (0.35 + 0.65 * sim.doorShut));
      const eq = settleTemp(f);
      if (eq <= target) return Infinity;
      const k = spec.lag + spec.flue * f;
      if (k <= 0) return Infinity;
      return -Math.log((eq - target) / (eq - sim.temperature)) / k;
    },
    holdsFor(bar: number) {
      if (pressureFor(sim.temperature) < bar) return 0;
      const s = copy(sim);
      const STEP = 30;
      for (let t = 0; t < 24 * 3600; t += STEP) {
        coarse(s, STEP);
        if (pressureFor(s.temperature) < bar) return t + STEP;
      }
      return Infinity;
    },
    get endurance() {
      return plant.holdsFor(low);
    },
    get state() {
      return state;
    },

    get firing() {
      return sim.firing;
    },
    get draught() {
      return sim.draught;
    },
    setDraught(level: number) {
      sim.draught = clamp01(level);
    },
    bank() {
      sim.draught = spec.banked;
    },
    stoke(amount = 1) {
      // A SILENT NO-OP on a launch, and that no-op is the era axis: the same
      // call keeps a Scotch alive and does nothing at all to a burner.
      if (spec.bedBurn === Infinity) return;
      sim.bed = clamp01(sim.bed + amount);
      if (spec.green > 0) sim.green = 1;
    },
    get bed() {
      return spec.bedBurn === Infinity ? 1 : sim.bed;
    },
    get fuel() {
      return sim.fuel;
    },
    bunker(amount = 1) {
      sim.fuel = clamp01(sim.fuel + amount);
    },
    get scale() {
      return sim.scale;
    },
    blowDown() {
      sim.scale = 0;
      // Blowing down dumps hot water over the side, so it costs her.
      sim.temperature -= (sim.temperature - AMBIENT) * 0.06;
    },
    fireDoor: {
      get state() {
        return 1 - sim.doorShut;
      },
      get open() {
        // `> 0.5`, matching every hand-rolled clone in the tree rather than
        // mechanisms.ts's `>= 0.5`. A control parked at exactly 0.5 differs
        // by which file you copied from.
        return 1 - sim.doorShut > 0.5;
      },
      toggle() {
        const next = !(1 - sim.doorShut > 0.5);
        doorOrder = next ? 1 : 0;
        return next;
      },
      set(target: number | boolean) {
        doorOrder = typeof target === 'boolean' ? (target ? 1 : 0) : clamp01(target);
      },
      update() {
        // Stepped by the plant; here so the duck-type is complete.
      },
      object: flaps[0],
    },

    get regulator() {
      return sim.regulator;
    },
    setRegulator(open: number) {
      sim.regulator = clamp01(open);
    },
    get link() {
      return sim.link;
    },
    get linkOrder() {
      return sim.linkOrder;
    },
    setLink(target: number) {
      sim.linkOrder = Math.max(-1, Math.min(1, target));
    },
    ahead(gear = 1) {
      sim.linkOrder = Math.abs(Math.max(-1, Math.min(1, gear)));
    },
    astern(gear = 1) {
      sim.linkOrder = -Math.abs(Math.max(-1, Math.min(1, gear)));
    },
    stopEngine() {
      sim.linkOrder = 0;
      sim.regulator = 0;
    },
    get cutoff() {
      return spec.maxCut * Math.abs(sim.link) ** spec.gearShape;
    },
    get rev() {
      return sim.rev;
    },
    get crank() {
      return sim.crank;
    },
    get mep() {
      const chest = pressureFor(sim.temperature) * sim.regulator;
      return Math.max(0, chest - spec.back) * expansionRatio(plant.cutoff);
    },
    get torque() {
      return sim.torque;
    },
    get onCentre() {
      return (
        Math.abs(sim.rev) < CREEP &&
        sim.regulator > 0.05 &&
        Math.abs(sim.link) > 0.05 &&
        pressureFor(sim.temperature) > spec.back &&
        Math.abs(sim.torque) < spec.friction * 0.5
      );
    },
    barOver() {
      sim.crank = (sim.crank + Math.PI / 2) % TAU;
      sim.rev += CREEP * 2 * Math.sign(sim.link || 1);
    },
    linkFor(seconds: number) {
      const dir = sim.link < 0 ? -1 : 1;
      // Monotone: a longer cut-off always empties her sooner, so bisect.
      let lo = 0;
      let hi = 1;
      const holds = (g: number): boolean => {
        const s = copy(sim);
        s.linkOrder = dir * g;
        s.link = dir * g;
        const STEP = 30;
        for (let t = 0; t < seconds; t += STEP) {
          coarse(s, STEP);
          if (pressureFor(s.temperature) < low) return false;
        }
        return true;
      };
      if (!holds(lo)) return 0;
      for (let i = 0; i < 16; i++) {
        const m = (lo + hi) / 2;
        if (holds(m)) lo = m;
        else hi = m;
      }
      return dir * lo;
    },

    get way() {
      return sim.way;
    },
    get thrust() {
      return sim.thrust;
    },
    walk,
    setImmersion(fraction: number) {
      sim.immersion = clamp01(fraction);
    },
    get immersion() {
      return sim.immersion;
    },

    get blowing() {
      return sim.blowing;
    },
    get turning() {
      return Math.abs(sim.rev) >= CREEP;
    },
    get stepsPlumes() {
      return stepsPlumes;
    },
    plumesInto(layer: SmokeLayer) {
      layer.add(soot);
      layer.add(grease);
      // AND STOP STEPPING THEM. SmokeLayer.update already calls source.update
      // on everything added; step them twice and the rate easing and the
      // shader clock both run at 2× with nothing anywhere reporting it.
      stepsPlumes = false;
    },

    update(dt: number) {
      if (!(dt > 0)) return;
      stepDoor(dt);
      const n = Math.max(1, Math.min(64, Math.ceil(dt / INNER)));
      const h = dt / n;
      for (let i = 0; i < n; i++) fine(sim, h);
      after(dt);
    },
    settle(seconds: number) {
      if (!(seconds > 0)) return;
      sim.doorShut = doorOrder > 0.5 ? 0 : 1;
      advance(sim, seconds);
      // Endpoints only — a fast-forward emits no intermediate states, and
      // that is documented rather than pretended away.
      after(Math.min(1, seconds));
    },
  };

  let stepsPlumes = true;
  let doorOrder = 0;

  const stepDoor = (dt: number): void => {
    const want = 1 - doorOrder;
    sim.doorShut += (want - sim.doorShut) * Math.min(1, dt * 3.2);
  };

  /** Everything downstream of the integration: the visible parts, the plumes,
   *  the gauge, the walk, and the state. */
  const after = (dt: number): void => {
    valveLift += ((sim.blowing ? 1 : 0) - valveLift) * Math.min(1, dt * 8);
    place();

    // THE FUNNEL READS THE FIRE AND NEVER THE BOILER. She makes her dirtiest
    // smoke barely moving, because the damper is wide and no engine is taking
    // anything from it — and nobody wrote that.
    if (stepsPlumes) {
      soot.setRate(clamp01(sim.firing * 0.85));
      grease.setRate(clamp01(sim.green * sim.firing));
      soot.update(dt);
      grease.update(dt);
    } else {
      soot.setRate(clamp01(sim.firing * 0.85));
      grease.setRate(clamp01(sim.green * sim.firing));
    }
    feather.setTarget(sim.blowing ? 1 : 0);
    feather.update(dt);

    gauge.setValue(pressureFor(sim.temperature));
    gauge.update(dt);

    // A right-handed single screw throws her stern to PORT going astern and
    // barely at all going ahead — the asymmetry is the whole of it.
    group.getWorldQuaternion(worldQ);
    starboard.set(1, 0, 0).applyQuaternion(worldQ);
    const astern = sim.rev < 0;
    const amount =
      spec.walk *
      (astern ? -1 : 0.15) *
      (Math.abs(sim.rev) / maxRev) *
      sim.immersion *
      Math.abs(sim.way > 0.2 ? 1 : 1.6);
    walk.x = starboard.x * amount;
    walk.z = starboard.z * amount;

    const next = classify();
    if (next !== state) {
      state = next;
      plant.onState?.(state);
    }
  };

  return plant;
}

/**
 * Can the fireman see the fire?
 *
 * A ray from where he stands to the grate. It has to arrive without meeting
 * boiler plating on the way, which it only does if the firebox was built as
 * WALLS AROUND A VOID rather than as a solid drum with a door painted on it —
 * the failure that has already bitten half the containers in this library,
 * and that no test looking at numbers can catch.
 */
export function firesVisibleFrom(plant: SteamPlant): boolean {
  plant.object.updateMatrixWorld(true);
  const from = new Vector3();
  plant.stokehold.anchor.getWorldPosition(from);
  // From a standing fireman's eye, not from his boots — the door is a metre
  // and a half up the firebox face.
  from.y += 1.55;
  const fire = plant.object.getObjectByName('firebox:fire');
  if (!fire) return false;
  const target = fire.getWorldPosition(new Vector3());
  const dir = target.clone().sub(from);
  if (dir.lengthSq() < 1e-8) return false;
  dir.normalize();
  const ray = new Raycaster(from, dir, 0.01, 40);
  const hits = ray.intersectObject(plant.object, true);
  for (const hit of hits) {
    const mat = (hit.object as Mesh).material as MeshStandardMaterial;
    if (mat && mat.emissive && mat.emissive.getHex() !== 0) return true;
  }
  return false;
}
