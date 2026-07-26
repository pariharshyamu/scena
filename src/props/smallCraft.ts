import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createSlot, type Prop, type PropSlot } from '../core/types';
import type { Loading } from './hold';

/**
 * Small craft — the only vessel in this library whose stability walks around,
 * and the only one that can be lost and come back.
 *
 * Everything else in the boat arc is a machine that survives things. A liner
 * takes a gale because she is a hundred and eighty metres long; a steamer
 * takes it because she has a thousand tonnes of cargo holding her down. A
 * small boat has neither, and what happens to her in the next thirty seconds
 * is decided by half a metre of freeboard and by where four people are
 * sitting.
 *
 * ## She is not lost to stability. She is lost to freeboard.
 *
 * This is the finding, and it is not what anybody expects — including the
 * first draft of this module, which took the free-surface sum straight out of
 * `createHold` and got a negative metacentric height out of **two buckets of
 * water**. That formula is a full-beam slab, derived for a ballast tank six
 * metres wide with a metre of water standing in it. Water in the bottom of a
 * boat lies in the *narrow* part of her section, and the width that matters is
 * the width at that depth. Taken seriously, she keeps a positive GM all the
 * way to the gunwale.
 *
 * What actually happens is a **runaway**:
 *
 * ```text
 *   water aboard  →  less freeboard  →  more water aboard
 * ```
 *
 * Nothing else in this library does that. Every other model here settles: a
 * boiler finds a pressure, a sea finds a height, a hull finds a list. This one
 * has a tipping point, and on the wrong side of it there is nothing to find.
 *
 * ```ts
 * boat.meet(0.8);  boat.swampsIn();   // Infinity — she is dry all day
 * boat.meet(1.0);  boat.swampsIn();   // 79 s
 * boat.meet(1.5);  boat.swampsIn();   // 23 s
 * boat.bail(2);    boat.swampsIn();   // 23 s. A man with a bucket is not in it.
 * ```
 *
 * ## What happens after she fills
 *
 * The era axis is **where in that loop you intervene**, and every one of the
 * four intervenes somewhere different:
 *
 * | fit | what it does about the runaway |
 * | --- | --- |
 * | `open` | nothing. You bail, and you lose, and then she goes under. |
 * | `buoyant` | cannot stop it — puts a FLOOR under it. She floods to awash and stays there. |
 * | `selfDraining` | breaks it. Water out faster than water in, so the freeboard never falls. |
 * | `selfRighting` | lets it finish and comes back anyway, with nobody doing anything. |
 *
 * `buoyant` is the interesting one, and the numbers say something sharper than
 * the usual claim for it: **it buys no seconds at all.** She fills marginally
 * SOONER than an open boat, because the tanks take up room the water would
 * have had. What changes is what is still floating when she is full — and
 * turning drowning into swimming is the biggest single step on this list even
 * though it does not buy one second of it.
 *
 * And `selfRighting` is the inversion at the end of the axis, the same shape as
 * a gyro stabiliser that needs no way and a derrick that cannot let go: it
 * makes the crew's position **stop mattering**. Every other fit here is a boat
 * you have to be good in.
 *
 * ## A breaker does not care what her GM is
 *
 * A sea steeper than one in seven is breaking, and a breaking sea taller than
 * about six tenths of her beam rolls her over regardless of stability, because
 * it is not a heeling moment — it is a wall of water with momentum in it. It
 * is the only failure in this library that no number on the vessel answers.
 *
 * ```ts
 * boat.meet(1.4, 9);   // 1.4 m at 9 m long: steepness 1 in 6.4, and breaking
 * boat.breaking;       // true
 * boat.capsized;       // true, and her GM was 3.6
 * ```
 */
export type CraftFit = 'open' | 'buoyant' | 'selfDraining' | 'selfRighting';

export const CRAFT_FITS: CraftFit[] = ['open', 'buoyant', 'selfDraining', 'selfRighting'];

/** dry / taking it / full / foundered, on the same four-state shape as the rest. */
export type CraftState = 'dry' | 'wet' | 'awash' | 'gone';

/** Somebody aboard, and on a boat this size they are a third of her. */
export interface Hand {
  name: string;
  /** Kilograms. */
  kg: number;
  /** Where along her, −1 hard aft to +1 hard forward. */
  along: number;
  /** Where across her, −1 on the port gunwale to +1 on the starboard one. */
  side: number;
  /** On their feet — which puts their weight most of a metre higher up. */
  standing: boolean;
  /** Out over the side, 0–1. It multiplies whichever arm they already have,
   *  and which side that is decides whether it saves her. */
  out: number;
}

export interface SmallCraft extends Prop {
  fit: CraftFit;
  readonly length: number;
  readonly beam: number;
  /** Keel to gunwale, m. Freeboard is this minus her draught. */
  readonly depth: number;

  // ── the ballast that walks ───────────────────────────────────────────
  /**
   * Put somebody aboard. `along` is −1 aft to +1 forward, `side` is −1 to +1
   * across her.
   *
   * Their weight is a third of her displacement, so this moves her draught,
   * her trim, her list and her metacentric height all at once — and they can
   * do it again next second, which is what makes a small boat a boat you have
   * to be good in.
   */
  seat(name: string, kg: number, along?: number, side?: number): void;
  /** Move somebody who is already aboard. */
  move(name: string, along: number, side: number): void;
  /** On their feet. Their centre of mass goes up most of a metre. */
  stand(name: string, up: boolean): void;
  /**
   * Out over the gunwale, 0–1.
   *
   * It multiplies the arm they already have, and it does not care which way
   * that arm points: hiking out on the high side is the only time the crew is
   * stability rather than a problem, and hiking out on the low side puts her
   * over twice as fast. The sign is the skill.
   */
  hike(name: string, out: number): void;
  leave(name: string): void;
  readonly hands: Hand[];
  readonly crew: number;
  readonly crewMass: number;

  // ── the water ────────────────────────────────────────────────────────
  /**
   * The sea she is in: height in metres, and the wavelength if you have it.
   *
   * `SeaState`'s trains go straight in — `boat.meet(sea.windSea.height,
   * sea.windSea.length)` — with nothing imported either way. Given a length
   * she works out for herself whether it is **breaking**, which is the one
   * thing that can roll her whatever her stability is.
   */
  meet(height: number, length?: number): void;
  readonly sea: number;
  /** Steeper than one in seven, and it is a wall rather than a slope. */
  readonly breaking: boolean;
  /** Kilograms of water in her. */
  readonly water: number;
  /** Kilograms she would hold to the gunwale. */
  readonly capacity: number;
  /** Coming aboard right now, kg/s. It GROWS as her freeboard falls. */
  readonly boarding: number;
  /** Bail at this many kg/s — a bucket is about 2, a hand pump about 1.5. */
  bail(kgPerSecond: number): void;
  readonly bailing: number;
  /** Going out again by itself, kg/s. Zero unless she is self-draining. */
  readonly draining: number;
  /** More coming in than everything she has can put out. The runaway has
   *  started, and on the wrong side of this it does not stop. */
  readonly swamping: boolean;
  /**
   * Seconds until she is FULL, in the sea she is in now — or `Infinity` if she
   * can live in it.
   *
   * Full is not the same as lost, and the difference is the whole era axis:
   * read `state` when this expires. A buoyant boat fills marginally SOONER
   * than an open one, because her tanks take up room the water would have
   * had — buoyancy buys no seconds whatever. What it changes is what is
   * floating there at the end of them.
   *
   * The same idiom as `SeaState.fallsTo` and `SteamPlant.reach`: run the model
   * forward coarsely and say when, rather than making the caller integrate it
   * themselves to find out.
   */
  swampsIn(): number;
  /** Empty her. */
  dry(): void;

  // ── what she is doing about it ───────────────────────────────────────
  readonly displacement: number;
  readonly draught: number;
  /**
   * Metres of side above the sea AT HER LOWEST RAIL — which is not the same
   * as amidships on the centreline once she is trimmed or listed. Four people
   * sitting in the stern cost her half of it, and that is how a boat is
   * swamped from astern.
   */
  readonly freeboard: number;
  readonly gm: number;
  readonly solidGm: number;
  readonly freeSurface: number;
  readonly rollPeriod: number;
  readonly state: CraftState;
  onState?: (state: CraftState) => void;
  readonly capsized: boolean;
  capsize(): void;
  /**
   * Get her back up.
   *
   * On an `open` boat that leaves you with a boat full of water. On a
   * `buoyant` one, a boat floating awash. On a `selfDraining` one she empties
   * herself afterwards. And on a `selfRighting` one you never call this at
   * all, because she has already done it.
   */
  right(): void;

  /** The AK handshake, unchanged: trim, list, sink, stiffness. Hand it to
   *  anything that takes a `ShipInput`. */
  readonly loading: Loading;

  // ── the frames handshake, so people can stand in her ─────────────────
  deckAt(x: number, z: number): number | null;
  normalAt(x: number, z: number): Vector3;
  ride(position: Vector3): Vector3;

  /** Bind the water: `ocean.heightAt`. */
  float(heightAt: (x: number, z: number) => number): void;
  helm: PropSlot;
  slots: PropSlot[];
  update(dt: number): void;
}

export interface SmallCraftOptions {
  fit?: CraftFit;
  /** Overall length, m. */
  length?: number;
  beam?: number;
  /** Keel to gunwale, m. */
  depth?: number;
  /** Hull mass with nothing in her, kg. */
  light?: number;
  seed?: number;
  palette?: Palette;
}

const G = 9.81;
/** Kilograms per cubic metre, so every mass in this file is a kilogram. */
const RHO = 1000;
/** Steeper than this and a wave is breaking rather than passing. */
const BREAKS_AT = 1 / 7;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * The four fits, on ONE hull.
 *
 * Sized differently they would not be comparable and the axis would be a
 * catalogue instead of an argument — the same reason `?view=trim` is four
 * identical steamers rather than four different ships. The only thing that
 * changes down this table is what happens to the water.
 */
interface FitSpec {
  /**
   * Kilograms of buoyancy that do not depend on her being dry: sealed tanks,
   * foam, airbags. This is the difference between a boat that goes under and
   * a boat that floats awash with everybody hanging onto it.
   */
  reserve: number;
  /** Seconds to shed the water she has. `Infinity` where there is no way out. */
  freeing: number;
  /** Metres of her section taken up by a tank each side, which narrows the
   *  free surface — and the free surface goes as the width CUBED. */
  tank: number;
  /** Ballast, kg, and how far above her keel it sits. Low and heavy is what
   *  brings her back from beyond ninety degrees. */
  ballast: number;
  ballastAt: number;
  /** Seconds to come back up on her own. `Infinity` if she stays where she
   *  is until somebody does something. */
  rights: number;
}

const FITS: Record<CraftFit, FitSpec> = {
  // An open boat. There is nothing here at all: no tanks, no ports, no
  // ballast, and nothing keeping her up once she is full. This is most of the
  // small craft that have ever existed and most of the people they drowned.
  open: { reserve: 0, freeing: Infinity, tank: 0, ballast: 0, ballastAt: 0, rights: Infinity },
  // Tanks under the side benches. They cannot stop her filling — the ports
  // are the only thing that does — but they hold her up when she has, and
  // they narrow the water that is loose in her.
  buoyant: {
    reserve: 900, freeing: Infinity, tank: 0.3, ballast: 0, ballastAt: 0, rights: Infinity,
  },
  // A sole ABOVE the waterline and holes in the transom. Water that comes
  // aboard goes out again by itself, faster than it comes in, so her
  // freeboard never falls and the loop never starts. It is the only fit here
  // that fixes the problem rather than surviving it.
  selfDraining: {
    reserve: 900, freeing: 6, tank: 0.3, ballast: 0, ballastAt: 0, rights: Infinity,
  },
  // Ballast on the keel and buoyancy high up. She will go over — and then she
  // will come back, with nobody aboard doing anything, which is the end of
  // the axis and the point at which the crew stops being her stability.
  selfRighting: {
    reserve: 1100, freeing: 6, tank: 0.3, ballast: 260, ballastAt: 0.06, rights: 4,
  },
};

export function createSmallCraft(options: SmallCraftOptions = {}): SmallCraft {
  const fit = options.fit ?? 'open';
  const spec = FITS[fit];
  const L = options.length ?? 5.5;
  const B = options.beam ?? 1.9;
  const D = options.depth ?? 0.62;
  const light = options.light ?? 320;
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;

  /** Block and waterplane coefficients for a small boat's sections. */
  const CB = 0.42;
  const CW = 0.72;
  const lightAt = 0.25;

  const group = new Group();
  group.name = `craft:${fit}`;

  const plank = createSurface('plank', { color: palette.wood, seed });
  const paint = createSurface('paintedMetal', { color: 0xd8d2c4, seed: seed + 1 });
  // Water standing IN her has to read against the sea outside her, and a
  // realistic dark green-grey does not: at any range that fits the boat in
  // frame the one thing the whole module is about is a slightly different
  // shade of the same blue.
  const bilge = new MeshStandardMaterial({
    color: 0x1d6f86,
    emissive: 0x07242c,
    transparent: true,
    opacity: 0.9,
    roughness: 0.18,
    flatShading: true,
  });

  // ── geometry ─────────────────────────────────────────────────────────

  const hull = new Group();
  group.add(hull);

  const bottom = new Mesh(new BoxGeometry(B * 0.62, 0.07, L * 0.94), plank);
  bottom.position.y = 0.035;
  hull.add(bottom);
  for (const side of [-1, 1]) {
    // Flared, so her section really is narrow at the bottom and wide at the
    // gunwale — which is the whole reason the free surface down there is not
    // the free surface of a tank.
    const strake = new Mesh(new BoxGeometry(0.06, D, L * 0.96), plank);
    strake.position.set(side * B * 0.42, D / 2, 0);
    strake.rotation.z = side * 0.2;
    hull.add(strake);
    const gunwale = new Mesh(new BoxGeometry(0.1, 0.06, L * 0.96), plank);
    gunwale.position.set(side * B * 0.5, D, 0);
    hull.add(gunwale);
  }
  for (const z of [-L * 0.46, L * 0.46]) {
    const end = new Mesh(new BoxGeometry(B * 0.66, D, 0.07), plank);
    end.position.set(0, D / 2, z);
    hull.add(end);
  }
  /** Thwarts — and they are where the crew sits, which is why they are here. */
  const thwarts: number[] = [-L * 0.24, 0, L * 0.24];
  for (const z of thwarts) {
    const t = new Mesh(new BoxGeometry(B * 0.9, 0.05, 0.26), plank);
    t.position.set(0, D * 0.56, z);
    hull.add(t);
  }

  if (spec.tank > 0) {
    // Side benches with the tanks in them. On a self-draining boat they are
    // also the sole, and the difference is where the top of them is relative
    // to the sea.
    for (const side of [-1, 1]) {
      const bench = new Mesh(new BoxGeometry(spec.tank, D * 0.5, L * 0.8), paint);
      bench.position.set(side * (B * 0.5 - spec.tank / 2), D * 0.42, 0);
      hull.add(bench);
    }
  }
  if (spec.freeing < Infinity) {
    // FREEING PORTS. Four holes in the transom, and they are the whole module.
    for (let i = 0; i < 4; i++) {
      const port = new Mesh(new CylinderGeometry(0.055, 0.055, 0.1, 8), paint);
      port.rotation.x = Math.PI / 2;
      port.position.set(-B * 0.24 + i * (B * 0.16), D * 0.7, -L * 0.46);
      hull.add(port);
    }
  }
  if (spec.ballast > 0) {
    const keel = new Mesh(new BoxGeometry(0.16, 0.2, L * 0.6), paint);
    keel.position.set(0, -0.09, 0);
    hull.add(keel);
  }
  for (let i = 0; i < 6; i++) {
    const frame = new Mesh(new BoxGeometry(B * 0.66, 0.05, 0.05), plank);
    frame.position.set(0, 0.07 + rng.next() * 0.02, -L * 0.36 + i * (L * 0.144));
    hull.add(frame);
  }

  /**
   * The water in her, and it has to be a SLAB THAT MOVES rather than a level.
   *
   * A boat filling up is the one thing in this whole arc that a still frame
   * can show on its own, and the reason it can is that you see the water
   * standing inside her against the sea outside.
   */
  const pond = new Mesh(new BoxGeometry(1, 1, 1), bilge);
  pond.name = 'craft:water';
  pond.visible = false;
  hull.add(pond);

  const helm = createSlot('craft', 'helm', group, 0, D * 0.56, -L * 0.3, 0);

  // ── the model ────────────────────────────────────────────────────────

  const hands = new Map<string, Hand>();
  let water = 0;
  let bailing = 0;
  let seaH = 0;
  let seaL = 0;
  let capsized = false;
  let righting = 0;
  let state: CraftState = 'dry';
  let sampler: ((x: number, z: number) => number) | null = null;
  const loading: Loading = { trim: 0, list: 0, sink: 0, stiffness: 1 };
  /** Her own attitude on the waves, before the crew and the water get a say. */
  let wavePitch = 0;
  let waveRoll = 0;
  let lastY = 0;
  let riseRate = 0;

  /** Her whole internal volume, to the gunwale, in kg of water. */
  const capacity = ((L * B * D) / 2) * RHO * (1 - (spec.tank * 2) / B);

  /**
   * How deep the water in her is standing.
   *
   * Her section is a wedge, not a box: the volume up to depth `d` goes as
   * `d²`, so a little water is deep and narrow and a lot of it is shallow and
   * wide. Taken as a box, `d` comes out four times too small and the free
   * surface with it.
   */
  const pondDepth = (): number =>
    water <= 0 ? 0 : Math.min(D, Math.sqrt((2 * D * water) / (RHO * L * B)));

  /** The width the loose water actually reaches, at the depth it is at. */
  const pondWidth = (): number =>
    Math.max(0, B * Math.min(1, pondDepth() / D) - spec.tank * 2);

  const massAt = (): { mass: number; kg: number } => {
    let moment = light * lightAt + spec.ballast * spec.ballastAt;
    let mass = light + spec.ballast;
    for (const h of hands.values()) {
      // Sitting on a thwart their centre of mass is a bit over half a metre
      // up; standing it is most of a metre and a half. On a boat this size
      // that is a real change in her centre of gravity.
      const y = h.standing ? D * 0.56 + 0.62 : D * 0.56 + 0.28;
      moment += h.kg * y;
      mass += h.kg;
    }
    const d = pondDepth();
    if (water > 0) {
      moment += water * d * 0.45;
      mass += water;
    }
    return { mass, kg: moment / mass };
  };

  /** Where the crew and the water put her, athwartships and fore-and-aft. */
  const moments = (): { mx: number; mz: number } => {
    let mx = 0;
    let mz = 0;
    for (const h of hands.values()) {
      // Hiking puts them beyond the gunwale — which extends whichever arm they
      // already have. On the high side it is the only stability she has; on
      // the low side it is how a dinghy is capsized to windward.
      const across = (h.side + Math.sign(h.side || 1) * h.out * 0.7) * (B / 2);
      mx += h.kg * across;
      mz += h.kg * h.along * (L / 2);
    }
    return { mx, mz };
  };

  const solve = (): void => {
    const { mass, kg } = massAt();
    const disp = mass;
    const vol = disp / RHO;
    const draught = vol / (L * B * CB);
    const bm = (CW * L * B ** 3) / 12 / Math.max(1e-6, vol);
    const solidGm = draught * 0.53 + bm - kg;
    const w = pondWidth();
    const fs = water > 1 ? (RHO * ((w ** 3 * L) / 12)) / disp : 0;
    const gm = solidGm - fs;

    const { mx, mz } = moments();
    loading.list = gm > 0.02 ? Math.asin(clamp(mx / (disp * gm), -1, 1)) : Math.sign(mx) * 1.4;
    // Longitudinal stability is enormous compared with transverse — she trims
    // long before she lists — but on a boat this short the crew's fore-and-aft
    // arm is metres, and four people in the stern is how she is swamped from
    // astern.
    const gml = L * 1.1;
    loading.trim = Math.atan(mz / Math.max(1e-6, disp * gml));
    loading.sink = draught - (light + spec.ballast) / RHO / (L * B * CB);
    loading.stiffness = gm > 0.02 ? clamp(gm / 3.6, 0.3, 2.4) : 0.3;

    solved = { disp, draught, kg, bm, solidGm, fs, gm };
  };
  let solved = { disp: light, draught: 0, kg: 0, bm: 0, solidGm: 0, fs: 0, gm: 0 };

  /**
   * Metres of side above the sea AT HER LOWEST RAIL.
   *
   * Not amidships on the centreline. Trim her by the stern and the low corner
   * is the quarter; list her and it is a gunwale. That distinction is what
   * makes where the crew sits feed straight into how fast she fills, and
   * without it a boat with four people in the stern is as safe as an empty
   * one.
   */
  const freeboardOf = (): number =>
    D -
    solved.draught -
    Math.abs(Math.sin(loading.trim)) * (L / 2) -
    Math.abs(Math.sin(loading.list)) * (B / 2);

  /**
   * What the sea would be putting aboard if she had this much water in her.
   *
   * The same sum as `boarding` with the freeboard evaluated at a hypothetical
   * load, which is what lets the runaway be settled with arithmetic instead of
   * integrated for an hour every frame.
   */
  const boardingAt = (w: number): number => {
    let held = light + spec.ballast;
    for (const h of hands.values()) held += h.kg;
    const draught = (held + w) / RHO / (L * B * CB);
    const fb =
      D -
      draught -
      Math.abs(Math.sin(loading.trim)) * (L / 2) -
      Math.abs(Math.sin(loading.list)) * (B / 2);
    const reach = seaH * (breakingOf() ? 0.85 : 0.5);
    return L * Math.max(0, reach - fb) * 40;
  };

  /**
   * Water over the rail, kg/s.
   *
   * The whole module is in the sign of this derivative: it is a function of
   * the freeboard she has LEFT, and taking water reduces that, so taking water
   * makes her take water faster. Everything else in this library settles.
   */
  const boardingOf = (): number => {
    if (capsized) return 0;
    const fb = freeboardOf();
    const reach = seaH * (breakingOf() ? 0.85 : 0.5);
    return L * Math.max(0, reach - fb) * 40;
  };

  const breakingOf = (): boolean => seaL > 0.1 && seaH / seaL > BREAKS_AT;

  const drainingOf = (): number =>
    // …and not while she is upside down. A hole in the transom is a hole in
    // the transom: it lets water out when the transom is above the sea and it
    // is a hole in the bottom of a bowl when it is not.
    spec.freeing === Infinity || water <= 0 || capsized ? 0 : water / spec.freeing;

  /**
   * She is full, and there is not enough buoyancy in her to hold up what is
   * left.
   *
   * And what is left is the hull, her ballast and her crew — NOT the water.
   * Water inside a swamped boat weighs nothing at all: it is sea water sitting
   * in a hole in the sea, and it is already being held up by the sea it came
   * from. Counted against the tanks it sinks every boat here however much
   * buoyancy she has, which is how the first draft foundered a lifeboat.
   */
  const foundered = (): boolean => {
    if (water < capacity - 1) return false;
    let held = light + spec.ballast;
    for (const h of hands.values()) held += h.kg;
    return spec.reserve < held;
  };

  const classify = (): CraftState => {
    if (foundered()) return 'gone';
    // A boat on her side is not 'dry' however little water is in her, and a
    // self-draining one WILL empty herself while inverted if nobody says so.
    if (capsized) return 'awash';
    if (water >= capacity * 0.82 || solved.gm <= 0.02) return 'awash';
    if (water > capacity * 0.03) return 'wet';
    return 'dry';
  };

  const place = (): void => {
    const d = pondDepth();
    pond.visible = d > 0.005 && !capsized;
    if (pond.visible) {
      const w = Math.max(0.05, B * Math.min(1, d / D) - spec.tank * 2);
      pond.scale.set(w, Math.max(0.01, d), L * 0.9);
      // It lies where the low corner is, not in the middle of her — the same
      // reason the freeboard is measured at a corner.
      pond.position.set(
        clamp(-Math.sin(loading.list) * 6, -1, 1) * ((B - w) / 2),
        d / 2,
        clamp(-Math.sin(loading.trim) * 6, -1, 1) * (L * 0.05)
      );
      // THE SURFACE OF WATER IS LEVEL. It is a child of the hull, so left
      // alone it heels with her — a slab of sea tilted inside a tilted boat,
      // which is the one thing water never does.
      pond.rotation.set(-group.rotation.x, 0, -group.rotation.z);
    }
  };

  solve();
  place();

  const requireHand = (name: string): Hand | undefined => hands.get(name);

  const api: SmallCraft = {
    object: group,
    obstacleRadius: B * 0.6,
    fit,
    length: L,
    beam: B,
    depth: D,
    helm,
    slots: [helm],
    capacity,

    seat(name: string, kg: number, along = 0, side = 0) {
      hands.set(name, {
        name,
        kg: Math.max(0, Number.isFinite(kg) ? kg : 0),
        along: clamp(Number.isFinite(along) ? along : 0, -1, 1),
        side: clamp(Number.isFinite(side) ? side : 0, -1, 1),
        standing: false,
        out: 0,
      });
      solve();
      place();
    },
    move(name: string, along: number, side: number) {
      const h = requireHand(name);
      if (!h) return;
      h.along = clamp(Number.isFinite(along) ? along : 0, -1, 1);
      h.side = clamp(Number.isFinite(side) ? side : 0, -1, 1);
      solve();
      place();
    },
    stand(name: string, up: boolean) {
      const h = requireHand(name);
      if (!h) return;
      h.standing = up;
      solve();
      place();
    },
    hike(name: string, out: number) {
      const h = requireHand(name);
      if (!h) return;
      h.out = clamp01(Number.isFinite(out) ? out : 0);
      solve();
      place();
    },
    leave(name: string) {
      if (hands.delete(name)) {
        solve();
        place();
      }
    },
    get hands() {
      return [...hands.values()];
    },
    get crew() {
      return hands.size;
    },
    get crewMass() {
      let m = 0;
      for (const h of hands.values()) m += h.kg;
      return m;
    },

    meet(height: number, length = 0) {
      seaH = Math.max(0, Number.isFinite(height) ? height : 0);
      seaL = Math.max(0, Number.isFinite(length) ? length : 0);
      // A breaking sea over about six tenths of her beam rolls her, and no
      // number on the vessel has anything to say about it. It is momentum,
      // not a moment.
      if (breakingOf() && seaH > B * 0.6) api.capsize();
    },
    get sea() {
      return seaH;
    },
    get breaking() {
      return breakingOf();
    },
    get water() {
      return water;
    },
    get boarding() {
      return boardingOf();
    },
    bail(kgPerSecond: number) {
      bailing = Math.max(0, Number.isFinite(kgPerSecond) ? kgPerSecond : 0);
    },
    get bailing() {
      return bailing;
    },
    get draining() {
      return drainingOf();
    },
    get swamping() {
      const out = drainingOf() + bailing;
      if (boardingOf() <= out) return false;
      // A CONSTANT outflow cannot beat a growing inflow. Bailing takes the same
      // two kilos a second however low she is, and the sea takes more of them
      // the lower she gets, so above the point where the sea wins there is no
      // level she can settle at — and this is why bailing does not save her.
      if (spec.freeing === Infinity) return true;
      // Freeing ports are different in kind, not in degree: their outflow goes
      // as the water she has, so it grows too, and faster. She settles if they
      // can beat the sea at the very worst level there is.
      return capacity / spec.freeing < boardingAt(capacity);
    },
    swampsIn() {
      // Run her forward coarsely. Integrating a runaway is the only honest way
      // to answer this: there is no closed form, and the whole point is that
      // the rate is a function of the state.
      if (capsized) return 0;
      let w = water;
      const held = water;
      let t = 0;
      const dt = 0.25;
      for (; t < 3600; t += dt) {
        water = w;
        solve();
        const inflow = boardingOf();
        const out = drainingOf() + bailing;
        const next = Math.max(0, w + (inflow - out) * dt);
        if (next >= capacity - 1) {
          water = held;
          solve();
          place();
          return t;
        }
        // She has found a level she can live with, and will sit there all day.
        if (Math.abs(next - w) < 1e-4 && inflow <= out) break;
        w = next;
      }
      water = held;
      solve();
      place();
      return Infinity;
    },
    dry() {
      water = 0;
      solve();
      place();
    },

    get displacement() {
      return solved.disp;
    },
    get draught() {
      return solved.draught;
    },
    get freeboard() {
      return freeboardOf();
    },
    get gm() {
      return solved.gm;
    },
    get solidGm() {
      return solved.solidGm;
    },
    get freeSurface() {
      return solved.fs;
    },
    get rollPeriod() {
      // NOT clamped. A boat with no stability left does not have a long roll
      // period, she has no roll period, and saying '118 seconds' where the
      // truth is 'never' is the kind of number somebody builds on.
      return solved.gm > 0.02 ? (2 * Math.PI * 0.35 * B) / Math.sqrt(G * solved.gm) : Infinity;
    },
    get state() {
      // Classified on demand and not only in `update`, so a boat handed four
      // people and half a tonne of water reports what she is before anybody
      // has stepped a frame.
      return classify();
    },
    get capsized() {
      return capsized;
    },
    capsize() {
      if (capsized) return;
      capsized = true;
      righting = spec.rights;
      // Over she goes, and she fills as she does it — except where there is
      // something holding her up.
      water = Math.min(capacity, water + (capacity - water) * (spec.reserve > 0 ? 0.55 : 1));
      solve();
      place();
    },
    right() {
      if (!capsized) return;
      capsized = false;
      righting = 0;
      // …and she comes up with everything that came in still in her, unless
      // there is a way for it to get out. THAT is the axis: coming back up is
      // not the same as being all right.
      if (spec.freeing === Infinity) water = Math.min(capacity, Math.max(water, capacity * 0.9));
      solve();
      place();
    },
    get loading() {
      return loading;
    },

    deckAt(x: number, z: number) {
      // World point → her frame. The sole she can be stood on is the thwarts,
      // and outside her sheer there is no deck at all — which is how you find
      // out somebody has gone over the side, with no separate test.
      const local = group.worldToLocal(new Vector3(x, 0, z));
      if (Math.abs(local.x) > B * 0.5 || Math.abs(local.z) > L * 0.5) return null;
      const p = new Vector3(local.x, D * 0.56, local.z);
      return group.localToWorld(p).y;
    },
    normalAt(x: number, z: number) {
      void x;
      void z;
      return new Vector3(0, 1, 0).applyQuaternion(group.getWorldQuaternion(new Quaternion())).normalize();
    },
    ride(position: Vector3) {
      position.y += riseRate;
      return position;
    },

    float(heightAt: (x: number, z: number) => number) {
      sampler = heightAt;
    },

    update(dt: number) {
      if (!(dt > 0)) return;

      // She comes back up on her own, or she does not, and that is the fit.
      if (capsized && righting !== Infinity) {
        righting -= dt;
        if (righting <= 0) api.right();
      }

      const inflow = boardingOf();
      const out = drainingOf() + bailing;
      water = clamp(water + (inflow - out) * dt, 0, capacity);
      solve();

      // …and once she is full, whether she is still there depends entirely on
      // whether anything aboard floats without her.
      if (foundered()) water = capacity;

      if (sampler) {
        const { x, z } = group.position;
        const sin = Math.sin(group.rotation.y);
        const cos = Math.cos(group.rotation.y);
        const bow = sampler(x + sin * L * 0.4, z + cos * L * 0.4);
        const stern = sampler(x - sin * L * 0.4, z - cos * L * 0.4);
        const port = sampler(x - cos * B * 0.5, z + sin * B * 0.5);
        const stbd = sampler(x + cos * B * 0.5, z - sin * B * 0.5);
        const want = (bow + stern + port + stbd) / 4 - solved.draught;
        riseRate = want - lastY;
        lastY = want;
        group.position.y = want;
        // A small boat takes the slope of the wave she is on — she does not
        // average it out, because she is shorter than it is.
        wavePitch = Math.atan2(stern - bow, L * 0.8);
        waveRoll = Math.atan2(port - stbd, B);
      }

      group.rotation.x = wavePitch + loading.trim;
      // Trim and list take OPPOSITE signs at the hull, and not by accident.
      group.rotation.z = capsized
        ? Math.sign(loading.list || 1) * 1.75
        : waveRoll - loading.list;
      place();

      const next = classify();
      if (next !== state) {
        state = next;
        api.onState?.(state);
      }
    },
  };
  return api;
}

/**
 * The sea a boat of this freeboard can live in, metres.
 *
 * Half her freeboard is the whole criterion, and it is worth having on its own
 * because it is the number that decides whether a passage is a passage or a
 * drowning — and because it does not mention her length, her engine, her crew
 * or her stability, none of which come into it.
 */
export function livesIn(freeboard: number): number {
  return Math.max(0, freeboard) * 2;
}

/** Is a sea of this height and length breaking? Steeper than one in seven. */
export function isBreaking(height: number, length: number): boolean {
  return length > 0.1 && height / length > BREAKS_AT;
}
