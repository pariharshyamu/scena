import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createSlot, type Prop, type PropSlot } from '../core/types';

/**
 * Plumbing — the first thing in this library where **what you get depends on
 * what somebody else is doing.**
 *
 * Everything up to here is local. A boiler makes steam out of its own fire; a
 * hull floats on its own displacement; a light is a fact about one observer.
 * None of them has any opinion about what else is happening in the world. A
 * water supply is a *network*, and a network's defining property is that it is
 * shared — so this is the first module in the trilogy where two objects
 * interfere with each other without either one knowing the other exists.
 *
 * ## The shower goes scalding when the lavatory is flushed
 *
 * Everybody has had this happen and almost nobody has the mechanism right. It
 * is not a temperature failure. **It is a pressure failure that arrives as a
 * temperature.**
 *
 * A mixer set to 40 °C from 60 °C hot and 10 °C cold is running 60 % hot. A WC
 * cistern draws from the COLD branch only. The cold manifold's pressure drops,
 * so the cold flow through the mixer drops — and the hot does not, because
 * nothing happened to the hot branch. Same hot, less cold, and the mixture
 * climbs:
 *
 * ```ts
 *   cold at 100%  ->  40.0 °C
 *   cold at  72%  ->  43.8 °C     a basin tap opens
 *   cold at  55%  ->  46.6 °C     a WC fills                    SCALD
 *   cold at  25%  ->  52.9 °C     the cold branch nearly dies   burns in seconds
 *   cold at   0%  ->  60.0 °C     you are standing under the cylinder
 * ```
 *
 * Nothing in the shower changed. Nothing in the mixer changed. Somebody in
 * another room pressed a lever.
 *
 * ## What happens to the person in the shower
 *
 * The era axis, and it is not about how much water you get:
 *
 * | kind | what a flush does to the shower |
 * | --- | --- |
 * | `bucket` | nothing. There is no network, so there is nothing to share. |
 * | `gravity` | takes the flow away. A cistern in the loft has a third of a bar and nothing to spare. |
 * | `mains` | takes the TEMPERATURE away. There is flow to spare and the scald arrives instead. |
 * | `thermostatic` | takes a little flow, and holds the temperature. |
 *
 * A bucket has no contention because it has no network — which is not
 * primitive, it is *uncoupled*, and it is the only supply here that cannot
 * scald anybody.
 *
 * And `thermostatic` is the inversion at the end, the same shape as a gyro
 * stabiliser that needs no way from you and a sectored light that navigates
 * instead of you: **it does not stop the contention. It stops the contention
 * from reaching you.** The pressure still collapses; the mixer gives up flow
 * to hold the temperature, and if the cold fails altogether it shuts off
 * rather than deliver sixty degrees.
 *
 * ## The store empties seven times faster than it fills
 *
 * A 120-litre cylinder at 60 °C, and a shower drawing six and a half litres a
 * minute of hot:
 *
 * ```ts
 * plumbing.hotLastsFor() / 60;   // 20 minutes
 * plumbing.reheatTakes() / 60;   // 140 minutes, on a 3 kW immersion
 * ```
 *
 * Which is the steam plant again in a different trade: a store the heater
 * fills far slower than the outlet empties it. There is no way to have a long
 * shower and a hot bath afterwards, and no setting anywhere that changes it.
 *
 * And it does not cool — it **runs out**. The cylinder is stratified: hot
 * floats on the cold feed coming in underneath and is drawn off the top at
 * very nearly full temperature until it is gone. So the shower stays perfect,
 * and stays perfect, and then falls off a cliff — which is what everybody has
 * actually stood in, and is nothing like the gentle fade a stirred-tank model
 * produces.
 *
 * ## Height is pressure, and that is the whole argument for a pump
 *
 * On gravity the pressure at an outlet is the head above it and nothing else —
 * so the same house gives a different shower on each floor:
 *
 * ```ts
 * // a cistern at 8 m
 * ground floor  (0.0 m):  0.79 bar  ->  7.5 L/min
 * first  floor  (2.7 m):  0.52 bar  ->  6.1 L/min
 * second floor  (5.4 m):  0.26 bar  ->  4.3 L/min
 * ```
 *
 * Pass an outlet's `height` and it is worked out for you. It is the one number
 * in this module that a fitter cannot argue with.
 */
export type SupplyKind = 'bucket' | 'gravity' | 'mains' | 'thermostatic';

export const SUPPLY_KINDS: SupplyKind[] = ['bucket', 'gravity', 'mains', 'thermostatic'];

/** idle / comfortable / noticeably down / not enough to use. */
export type SupplyState = 'idle' | 'easy' | 'strained' | 'starved';

/** What kind of thing is on the end of the pipe. */
export type OutletKind = 'shower' | 'tap' | 'bath' | 'wc';

export interface Draw {
  name: string;
  kind: OutletKind;
  /** How far open, 0–1. */
  open: number;
  /** Litres a minute, both branches together. */
  flow: number;
  /** …of which this much is coming out of the cylinder. */
  hot: number;
  /** Degrees C at the outlet. */
  temp: number;
  /**
   * Over 44 °C, which is the limit for water a person stands under.
   *
   * Fifty and above scalds a child in well under a minute; sixty does it in
   * about a second, and sixty is simply the cylinder temperature — the number
   * you get when the cold gives up entirely.
   */
  scalding: boolean;
  /** Enough flow to be worth having. A shower under five litres a minute is a
   *  drip you stand in. */
  usable: boolean;
  /**
   * Bar AT THE OUTLET — the manifold pressure less the lift to get up there.
   *
   * Reporting the manifold instead reads backwards: raise an outlet and it
   * draws less, so the manifold pressure goes UP while the shower gets worse.
   */
  pressure: number;
}

export interface OutletOptions {
  kind?: OutletKind;
  /** Where it is, for the pipework to be drawn to. */
  at?: Vector3;
  /**
   * Metres above the supply datum.
   *
   * On gravity this is subtracted from the head, so it decides everything. An
   * outlet above the cistern gets nothing at all, which is why the cistern is
   * in the loft and why a shower in a loft conversion does not work.
   */
  height?: number;
  /** Fraction of the flow taken from the hot branch, 0–1. A WC ignores it. */
  mix?: number;
}

export interface Plumbing extends Prop {
  kind: SupplyKind;
  /** Add something on the end of a pipe. */
  outlet(name: string, options?: OutletOptions): void;
  open(name: string, fraction?: number): void;
  close(name: string): void;
  /** Move the mixer. 0 is all cold, 1 is all cylinder. */
  setMix(name: string, hotFraction: number): void;
  /**
   * Set it to a TEMPERATURE, which is what a person actually does.
   *
   * Nobody turns a shower to 'sixty per cent hot'. They turn it until it feels
   * right, with whatever else in the house happens to be running at that
   * moment — and the setting is then fixed, so when the conditions change the
   * temperature does. Calibrating by mix fraction quietly assumes the tap
   * knows something it cannot know, and hides the entire failure.
   */
  setTarget(name: string, celsius: number): void;
  /** What that outlet is getting, right now, given everything else. */
  drawAt(name: string): Draw | null;
  readonly draws: Draw[];
  readonly outlets: string[];

  /** Bar at the cold manifold. */
  readonly pressure: number;
  /** Bar at the hot manifold — a different number, and that is the module. */
  readonly hotPressure: number;
  /** Litres a minute leaving the system. */
  readonly demand: number;
  readonly state: SupplyState;
  onState?: (state: SupplyState) => void;

  /** Litres of usable hot water left in the cylinder. */
  readonly hot: number;
  /** What is in the cylinder now, °C. It falls as it is drawn. */
  readonly hotTemp: number;
  readonly cylinder: number;
  /**
   * Seconds until the water stops being warm enough to stand under, at the
   * present draw — or `Infinity` if nothing is drawing hot.
   *
   * A cylinder does not run out, it cools: a tank model falls exponentially
   * and never reaches the cold feed, so 'litres of hot left divided by the
   * rate' overstates it badly. This integrates the thing forward until the
   * delivered temperature drops below `warm`, which is the number a person
   * standing in it would recognise.
   */
  hotLastsFor(warm?: number): number;
  /** Seconds to bring a cold cylinder back up. */
  reheatTakes(): number;
  /** Switch the immersion on and off. */
  setHeater(on: boolean): void;
  readonly heating: boolean;

  /**
   * Tip water in by hand, litres.
   *
   * The bucket loop, and it works on every kind — because it is the one way of
   * getting water that no supply failure can take away from you.
   */
  pour(name: string, litres: number): void;
  readonly poured: number;

  station: PropSlot;
  slots: PropSlot[];
  update(dt: number): void;
}

export interface PlumbingOptions {
  kind?: SupplyKind;
  /** Metres of head, for `gravity`. The loft, usually. */
  head?: number;
  /** Bar at the stopcock, for the pressurised kinds. */
  mains?: number;
  /** Cylinder size, litres. */
  cylinder?: number;
  /** Immersion rating, kW. */
  heater?: number;
  /** What the cylinder is held at, °C. */
  stored?: number;
  /** What comes out of the ground, °C. */
  cold?: number;
  seed?: number;
  palette?: Palette;
}

const RHO = 1000;
const G = 9.81;
/** Specific heat of water, kJ per kg per K. */
const CP = 4.186;
/** Above this, water is not something a person can stand under. */
export const SCALD = 44;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Bar from metres of head. A loft cistern is a third of a bar and no more. */
export function headPressure(metres: number): number {
  return (Math.max(0, metres) * RHO * G) / 1e5;
}

/**
 * Litres a minute through an orifice at a given pressure.
 *
 * `Q = k√p`, calibrated so a shower head at two bar gives twelve litres a
 * minute — which is what a decent mains shower actually does.
 */
export function orificeFlow(k: number, bar: number): number {
  return bar <= 0 ? 0 : k * Math.sqrt(bar);
}

interface OutletSpec {
  /** Orifice coefficient. */
  k: number;
  /** Litres a minute below which it is not worth having. */
  usable: number;
  /** Can its mixer be moved, or does it only ever take cold? */
  mixes: boolean;
}

const OUTLETS: Record<OutletKind, OutletSpec> = {
  shower: { k: 12 / Math.SQRT2, usable: 5, mixes: true },
  tap: { k: 10 / Math.SQRT2, usable: 2, mixes: true },
  bath: { k: 18 / Math.SQRT2, usable: 8, mixes: true },
  // A WC takes COLD AND ONLY COLD, and that single fact is what makes the
  // shower scald rather than merely weaken.
  //
  // It is also the one outlet here that does not mind being starved, because
  // a cistern is a BUFFER: starve it and it simply takes longer to fill, and
  // nobody is standing in it while it does. Given a shower's expectations it
  // drags the whole house to `starved` over a fixture that is perfectly happy.
  wc: { k: 6 / Math.SQRT2, usable: 1.5, mixes: false },
};

interface KindSpec {
  /** Metres of head on the cold side. `0` where it is not a head system. */
  head: number;
  /** Bar at the stopcock. `0` on gravity. */
  mains: number;
  /** How much lower the hot side sits than the cold, m or bar as appropriate. */
  hotDrop: number;
  /**
   * Resistance of each branch, bar per (L/min)².
   *
   * NOT the main — the branch. What kills a shower is the fifteen-millimetre
   * run that the bathroom shares, and the cold one is always the worse of the
   * two because it feeds the WC, the basin and everything outside as well.
   * Sized off the main instead, a flush moves the shower six tenths of a
   * degree and the module has nothing to say.
   */
  coldResistance: number;
  hotResistance: number;
  /** Does a mixer hold its temperature when a branch fails? */
  thermostatic: boolean;
  /** Is there any network at all? */
  piped: boolean;
}

const KINDS: Record<SupplyKind, KindSpec> = {
  // No network. There is nothing to share, nothing to lose pressure, and
  // nothing that can scald anybody — which is not primitive, it is UNCOUPLED.
  bucket: { head: 0, mains: 0, hotDrop: 0, coldResistance: 0, hotResistance: 0, thermostatic: false, piped: false },
  // A cistern in the loft, and a hot cylinder a little below it. A third of a
  // bar, old narrow pipe, and nothing whatever to spare.
  gravity: { head: 8, mains: 0, hotDrop: 1.2, coldResistance: 0.0042, hotResistance: 0.0022, thermostatic: false, piped: true },
  // Pressurised, and now there IS flow to spare — so contention stops taking
  // the flow away and starts taking the temperature away instead.
  mains: { head: 0, mains: 2.4, hotDrop: 0.2, coldResistance: 0.055, hotResistance: 0.012, thermostatic: false, piped: true },
  // The same supply, and a mixer that gives up flow rather than temperature.
  thermostatic: {
    head: 0, mains: 2.4, hotDrop: 0.2, coldResistance: 0.055, hotResistance: 0.012,
    thermostatic: true, piped: true,
  },
};

interface Live {
  name: string;
  kind: OutletKind;
  spec: OutletSpec;
  open: number;
  mix: number;
  height: number;
  at: Vector3 | null;
  pipe: Mesh | null;
  flow: number;
  hotFlow: number;
  temp: number;
}

export function createPlumbing(options: PlumbingOptions = {}): Plumbing {
  const kind = options.kind ?? 'mains';
  const base = KINDS[kind];
  const head = options.head ?? base.head;
  const mains = options.mains ?? base.mains;
  const capacity = options.cylinder ?? 120;
  const heaterKw = options.heater ?? 3;
  const stored = options.stored ?? 60;
  const coldTemp = options.cold ?? 10;
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = `plumbing:${kind}`;

  const copper = createSurface('paintedMetal', { color: 0xb2703a, seed });
  void palette;
  const lagging = createSurface('plaster', { color: 0xd8d2c2, seed: seed + 1 });
  const steel = createSurface('steel', { color: 0x6d7378, seed: seed + 2 });
  /** Each run gets its own material, because each run is painted by what is
   *  going down it. */
  const pipeMat = (): MeshStandardMaterial =>
    new MeshStandardMaterial({ color: 0x5f7f9a, roughness: 0.5, flatShading: true });

  // ── geometry ─────────────────────────────────────────────────────────

  const MANIFOLD = new Vector3(0, 0.55, 0);

  if (kind === 'bucket') {
    // A pail and a stand. The entire installation.
    const pail = new Mesh(new CylinderGeometry(0.17, 0.13, 0.3, 12, 1, true), steel);
    pail.position.set(0, 0.15, 0);
    group.add(pail);
    const handle = new Mesh(new CylinderGeometry(0.012, 0.012, 0.34, 6), steel);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0, 0.32, 0);
    group.add(handle);
  } else {
    // The cylinder — lagged, because the whole point of it is that it holds
    // heat, and an unlagged one is a radiator in a cupboard.
    const tank = new Mesh(new CylinderGeometry(0.23, 0.23, 1.1, 14), lagging);
    tank.position.set(0.42, 0.62, 0);
    group.add(tank);
    const dome = new Mesh(new CylinderGeometry(0.05, 0.23, 0.16, 14), lagging);
    dome.position.set(0.42, 1.24, 0);
    group.add(dome);

    if (head > 0) {
      // THE CISTERN IN THE LOFT, and it is drawn where the head says it is —
      // this is the one prop whose pressure IS its geometry.
      const cistern = new Mesh(
        new CylinderGeometry(0.44, 0.44, 0.4, 4),
        createSurface('plaster', { color: 0x8d9aa4, seed: seed + 3 })
      );
      cistern.rotation.y = Math.PI / 4;
      cistern.position.set(-0.5, head - 0.2, 0);
      group.add(cistern);
      const riser = new Mesh(new CylinderGeometry(0.028, 0.028, head - 0.4, 8), copper);
      riser.position.set(-0.5, (head - 0.4) / 2, 0);
      group.add(riser);
    } else {
      // A stopcock where it comes in under the floor.
      const stop = new Mesh(new CylinderGeometry(0.05, 0.05, 0.12, 10), copper);
      stop.position.set(-0.5, 0.16, 0);
      group.add(stop);
      const wheel = new Mesh(new CylinderGeometry(0.09, 0.09, 0.02, 12), steel);
      wheel.position.set(-0.5, 0.26, 0);
      group.add(wheel);
    }

    const manifold = new Mesh(new CylinderGeometry(0.035, 0.035, 1.1, 8), copper);
    manifold.rotation.z = Math.PI / 2;
    manifold.position.copy(MANIFOLD);
    group.add(manifold);
    for (let i = 0; i < 3; i++) {
      const clip = new Mesh(new CylinderGeometry(0.045, 0.045, 0.03, 8), steel);
      clip.rotation.z = Math.PI / 2;
      clip.position.set(-0.4 + i * 0.4, MANIFOLD.y, rng.next() * 0.01);
      group.add(clip);
    }
  }

  const pipes = new Group();
  pipes.name = 'plumbing:pipes';
  group.add(pipes);

  const station = createSlot('plumbing', 'stopcock', group, -0.5, 0, 0.6, 0);

  // ── the model ────────────────────────────────────────────────────────

  const live = new Map<string, Live>();
  /**
   * Litres of water in the cylinder still at storage temperature.
   *
   * STRATIFIED, not stirred. Hot water floats: it sits on top of the cold feed
   * coming in underneath and is drawn off the top at very nearly full
   * temperature until it is gone. Modelled as a stirred tank instead, the
   * shower starts cooling in the first second and is tepid in three minutes —
   * where what actually happens is that it stays perfect, and stays perfect,
   * and then falls off a cliff. Everybody has stood in that cliff.
   */
  let hotLitres = capacity;
  let heating = true;
  let poured = 0;
  let coldBar = 0;
  let hotBar = 0;
  let state: SupplyState = 'idle';

  /**
   * What is coming out of the cylinder this instant.
   *
   * Full temperature while there is a layer of it, then down through the
   * thermocline — the mixed band between the hot above and the cold feed
   * below, which on a real cylinder is a few inches and here is the last tenth.
   */
  const THERMOCLINE = 0.1;
  /** kJ to lift one litre from the cold feed to storage temperature. */
  const perLitre = CP * Math.max(1e-6, stored - coldTemp);
  const deliveredHot = (): number => {
    const f = clamp01(hotLitres / Math.max(1e-6, capacity * THERMOCLINE));
    return coldTemp + (stored - coldTemp) * f;
  };

  const sourceCold = base.piped ? (head > 0 ? headPressure(head) : mains) : 0;
  const sourceHot = base.piped
    ? head > 0
      ? headPressure(Math.max(0, head - base.hotDrop))
      : Math.max(0, mains - base.hotDrop)
    : 0;

  /**
   * Solve the two manifolds.
   *
   * They are SEPARATE, and that is the whole module: a WC pulls the cold
   * branch down and leaves the hot exactly where it was, so every mixer in the
   * building is suddenly running a hotter mixture than it was set to. Solved
   * as one supply, the two branches fall together, the mixture stays at 40 °C
   * and there is no scald anywhere — which is a plumbing system nobody has
   * ever lived in.
   */
  const solve = (): void => {
    if (!base.piped) {
      coldBar = 0;
      hotBar = 0;
      for (const o of live.values()) {
        o.flow = 0;
        o.hotFlow = 0;
        o.temp = coldTemp;
      }
      return;
    }
    let pc = sourceCold;
    let ph = sourceHot;
    for (let i = 0; i < 40; i++) {
      let qc = 0;
      let qh = 0;
      for (const o of live.values()) {
        if (o.open <= 0) continue;
        const lift = headPressure(o.height);
        const mix = o.spec.mixes ? o.mix : 0;
        qc += orificeFlow(o.spec.k * (1 - mix), Math.max(0, pc - lift)) * o.open;
        qh += orificeFlow(o.spec.k * mix, Math.max(0, ph - lift)) * o.open;
      }
      const nc = Math.max(0, sourceCold - base.coldResistance * qc * qc);
      const nh = Math.max(0, sourceHot - base.hotResistance * qh * qh);
      pc = pc * 0.55 + nc * 0.45;
      ph = ph * 0.55 + nh * 0.45;
    }
    coldBar = pc;
    hotBar = ph;

    for (const o of live.values()) {
      if (o.open <= 0) {
        o.flow = 0;
        o.hotFlow = 0;
        o.temp = coldTemp;
        continue;
      }
      const lift = headPressure(o.height);
      const mix = o.spec.mixes ? o.mix : 0;
      let c = orificeFlow(o.spec.k * (1 - mix), Math.max(0, pc - lift)) * o.open;
      let h = orificeFlow(o.spec.k * mix, Math.max(0, ph - lift)) * o.open;

      if (base.thermostatic && o.spec.mixes && mix > 0) {
        // A THERMOSTATIC MIXER GIVES UP FLOW, NOT TEMPERATURE. It cannot make
        // more cold appear, so it throttles the hot to match whatever cold it
        // is actually getting — and if there is no cold at all it shuts,
        // rather than hand somebody the cylinder temperature.
        const th = deliveredHot();
        const want = coldTemp + (th - coldTemp) * mix;
        const denom = Math.max(1e-6, th - want);
        const allowed = (c * (want - coldTemp)) / denom;
        h = Math.min(h, Math.max(0, allowed));
        if (c <= 0.01) h = 0;
      }

      o.flow = c + h;
      o.hotFlow = h;
      o.temp = o.flow <= 1e-6 ? coldTemp : (h * deliveredHot() + c * coldTemp) / o.flow;
    }
  };

  /**
   * How hard the supply is being asked to work — measured in CONSEQUENCES.
   *
   * Not in the fraction of the source pressure still standing, which was the
   * first attempt: that is a number about the pipe, it has to be tuned against
   * whatever resistance the pipe happens to have, and with a realistic branch
   * it called one shower on a mains supply 'strained'. What matters is whether
   * anybody is getting something they can use, at a temperature they can stand.
   */
  const classify = (): SupplyState => {
    let anyOpen = false;
    let starved = false;
    let strained = false;
    for (const o of live.values()) {
      if (o.open <= 0) continue;
      anyOpen = true;
      if (o.flow < o.spec.usable) starved = true;
      else if (o.flow < o.spec.usable * 1.3) strained = true;
      if (o.flow > 0.1 && o.temp >= SCALD) strained = true;
    }
    if (!anyOpen) return 'idle';
    if (starved) return 'starved';
    return strained ? 'strained' : 'easy';
  };

  const layPipe = (o: Live): void => {
    if (!o.at || !base.piped) return;
    const from = MANIFOLD.clone();
    const span = o.at.clone().sub(from);
    const len = Math.max(0.02, span.length());
    // Built one metre long and SCALED, so the run's length is readable from
    // the object rather than buried in a geometry parameter.
    const pipe = new Mesh(new CylinderGeometry(0.022, 0.022, 1, 7), pipeMat());
    pipe.name = `plumbing:pipe:${o.name}`;
    pipe.scale.set(1, len, 1);
    pipe.position.copy(from).addScaledVector(span, 0.5);
    pipe.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), span.normalize());
    pipes.add(pipe);
    o.pipe = pipe;
  };

  const paint = (): void => {
    for (const o of live.values()) {
      if (!o.pipe) continue;
      // Hot where the hot is going, and brighter the more is moving — a still
      // frame of a plumbing system is nothing at all unless the pipes say
      // which of them is working.
      const hotShare = o.flow <= 1e-6 ? 0 : o.hotFlow / o.flow;
      const busy = clamp01(o.flow / Math.max(1, o.spec.k * 1.4));
      const mat = o.pipe.material as MeshStandardMaterial;
      mat.color.setRGB(
        0.28 + hotShare * 0.5 + busy * 0.12,
        0.36 - hotShare * 0.12 + busy * 0.2,
        0.5 - hotShare * 0.24 + busy * 0.12
      );
      mat.emissive.setRGB(busy * 0.14 + hotShare * busy * 0.16, busy * 0.09, busy * 0.05);
    }
  };

  const api: Plumbing = {
    object: group,
    obstacleRadius: 0.5,
    kind,
    station,
    slots: [station],
    cylinder: capacity,

    outlet(name: string, opts: OutletOptions = {}) {
      const k = opts.kind ?? 'tap';
      const spec = OUTLETS[k];
      const o: Live = {
        name,
        kind: k,
        spec,
        open: 0,
        mix: spec.mixes ? clamp01(opts.mix ?? 0.6) : 0,
        height: Math.max(0, opts.height ?? 0),
        at: opts.at ? opts.at.clone() : null,
        pipe: null,
        flow: 0,
        hotFlow: 0,
        temp: coldTemp,
      };
      live.set(name, o);
      layPipe(o);
      solve();
      paint();
    },
    open(name: string, fraction = 1) {
      const o = live.get(name);
      if (!o) return;
      o.open = clamp01(Number.isFinite(fraction) ? fraction : 0);
      solve();
      paint();
    },
    close(name: string) {
      api.open(name, 0);
    },
    setTarget(name: string, celsius: number) {
      const o = live.get(name);
      if (!o || !o.spec.mixes) return;
      const want = Number.isFinite(celsius) ? celsius : coldTemp;
      // Solved against the pressures AS THEY ARE. That is the whole point: the
      // setting is right for the house at this instant and for no other.
      solve();
      const lift = headPressure(o.height);
      const pc = Math.max(0, coldBar - lift);
      const ph = Math.max(0, hotBar - lift);
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 40; i++) {
        const m = (lo + hi) / 2;
        const c = orificeFlow(o.spec.k * (1 - m), pc);
        const h = orificeFlow(o.spec.k * m, ph);
        const t = c + h <= 1e-9 ? coldTemp : (h * deliveredHot() + c * coldTemp) / (c + h);
        if (t < want) lo = m;
        else hi = m;
      }
      o.mix = clamp01((lo + hi) / 2);
      solve();
      paint();
    },
    setMix(name: string, hotFraction: number) {
      const o = live.get(name);
      if (!o || !o.spec.mixes) return;
      o.mix = clamp01(Number.isFinite(hotFraction) ? hotFraction : 0);
      solve();
      paint();
    },
    drawAt(name: string) {
      const o = live.get(name);
      if (!o) return null;
      return {
        name: o.name,
        kind: o.kind,
        open: o.open,
        flow: o.flow,
        hot: o.hotFlow,
        temp: o.temp,
        scalding: o.open > 0 && o.flow > 0.1 && o.temp >= SCALD,
        usable: o.flow >= o.spec.usable,
        pressure: Math.max(0, coldBar - headPressure(o.height)),
      };
    },
    get draws() {
      return [...live.keys()].map((n) => api.drawAt(n)!).filter(Boolean);
    },
    get outlets() {
      return [...live.keys()];
    },

    get pressure() {
      return coldBar;
    },
    get hotPressure() {
      return hotBar;
    },
    get demand() {
      let q = 0;
      for (const o of live.values()) q += o.flow;
      return q;
    },
    get state() {
      // Worked out on demand, so a system asked what it is doing before
      // anybody has stepped it answers about the taps that are open rather
      // than about last frame.
      return classify();
    },

    get hot() {
      return hotLitres;
    },
    get hotTemp() {
      return deliveredHot();
    },
    hotLastsFor(warm = 35) {
      let draw = 0;
      for (const o of live.values()) draw += o.hotFlow;
      if (draw <= 1e-6) return Infinity;
      // Run the tank forward coarsely. There is no closed form once the
      // mixture matters, and the whole point is what the PERSON gets.
      const held = hotLitres;
      let t = 0;
      const dt = 5;
      try {
        for (; t < 6 * 3600; t += dt) {
          let hottest = -Infinity;
          for (const o of live.values()) {
            if (o.open > 0 && o.hotFlow > 0.01) hottest = Math.max(hottest, o.temp);
          }
          if (hottest < warm) return t;
          let q = 0;
          for (const o of live.values()) q += o.hotFlow;
          if (q <= 1e-6) return Infinity;
          hotLitres = Math.max(0, hotLitres - (q * dt) / 60);
          if (heating && hotLitres < capacity) {
            hotLitres = Math.min(capacity, hotLitres + (heaterKw * dt) / perLitre);
          }
          solve();
        }
        return Infinity;
      } finally {
        hotLitres = held;
        solve();
      }
    },
    reheatTakes() {
      return heaterKw <= 0 ? Infinity : (capacity * perLitre) / heaterKw;
    },
    setHeater(on: boolean) {
      heating = on;
    },
    get heating() {
      return heating;
    },

    pour(name: string, litres: number) {
      const l = Math.max(0, Number.isFinite(litres) ? litres : 0);
      poured += l;
      void name;
    },
    get poured() {
      return poured;
    },

    update(dt: number) {
      if (!(dt > 0)) return;
      solve();

      // The cylinder: hot out, cold in to replace it, mixed. A tank model
      // rather than a stratified one — real cylinders stratify and give you a
      // little longer, and the difference is not the point.
      let drawn = 0;
      for (const o of live.values()) drawn += o.hotFlow;
      if (drawn > 0) hotLitres = Math.max(0, hotLitres - (drawn * dt) / 60);
      if (heating && hotLitres < capacity) {
        // Litres a second the immersion can bring up from the cold feed:
        // kW divided by the energy it takes to lift one litre the whole way.
        hotLitres = Math.min(capacity, hotLitres + (heaterKw * dt) / perLitre);
      }
      solve();
      paint();

      const next = classify();
      if (next !== state) {
        state = next;
        api.onState?.(state);
      }
    },
  };

  solve();
  paint();
  return api;
}

/**
 * The temperature a mixer actually delivers when the cold has been taken away.
 *
 * Published on its own because it is the one sum in this module worth knowing
 * without a plumbing system attached: `mix` is what the tap was set to, and
 * `coldLeft` is the fraction of the cold flow that survived somebody else
 * opening something.
 */
export function mixedAt(
  mix: number,
  hotTemp: number,
  coldTemp: number,
  coldLeft = 1
): number {
  const h = clamp01(mix);
  const c = (1 - h) * clamp01(coldLeft);
  if (h + c <= 1e-9) return coldTemp;
  return (h * hotTemp + c * coldTemp) / (h + c);
}

/** The mixer setting that gives a wanted temperature. */
export function mixFor(want: number, hotTemp: number, coldTemp: number): number {
  const span = hotTemp - coldTemp;
  if (Math.abs(span) < 1e-6) return 0;
  return clamp01((want - coldTemp) / span);
}
