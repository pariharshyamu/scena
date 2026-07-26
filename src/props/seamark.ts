import {
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createSlot, type Prop, type PropSlot } from '../core/types';

/**
 * Seamarks — the first thing in this library whose entire purpose is **to be
 * seen from somewhere else.**
 *
 * Everything up to here has been a thing that *is*: a hull that floats, a
 * boiler that makes steam, a net that comes fast. A light is none of those. It
 * does nothing where it stands. Its whole function happens fifteen miles away
 * in somebody else's eye, and every number on it is really a number about the
 * observer.
 *
 * ## The curvature of the earth decides it, and the lamp does not
 *
 * This is the truth the module exists for, and it is the least intuitive one
 * in the whole trilogy. A light has two ranges and you get the SMALLER:
 *
 * - the **geographic** range, where it drops below the horizon — a function of
 *   how high the light is and how high your eye is, and of nothing else at all;
 * - the **luminous** range, where it gets too faint to see — a function of the
 *   lamp and the visibility.
 *
 * ```ts
 * const light = createSeamark({ kind: 'flashing' });     // 40 m, 200 000 cd
 * light.sightedFrom(x, z, 12).range;      // 18.5 nm — the lamp is the limit
 * ```
 *
 * …so make the lamp bigger. Double it, and again, and again:
 *
 * ```ts
 *    200 000 cd  ->  seen at 18.5 nm
 *    400 000 cd  ->  seen at 20.2 nm
 *    800 000 cd  ->  seen at 20.4 nm
 *  1 600 000 cd  ->  seen at 20.4 nm
 * 20 000 000 cd  ->  seen at 20.4 nm     ← a hundredfold lamp. Under two miles.
 * ```
 *
 * The horizon does not negotiate. Past that point the only thing that buys
 * range is **height** — of the tower, or of the eye looking for it, and that is
 * why lighthouses are on cliffs and why the answer to "we cannot see it" was
 * never a bigger lamp.
 *
 * ## The same light, the same night, and two boats that see differently
 *
 * `heightOfEye` is not a detail. A man standing in an open boat has his eye
 * about 1.5 m up; the officer on a ship's bridge has his at 12 m. They are
 * looking at the same lamp:
 *
 * ```ts
 * light.sightedFrom(x, z, 1.5).range;   // 15.7 nm, and HORIZON-limited
 * light.sightedFrom(x, z, 12).range;    // 18.5 nm, and LAMP-limited
 * ```
 *
 * Not only a different range — a different *reason*. And it inverts: with a
 * feeble light, raising your eye buys nothing whatever, because you were never
 * near the horizon to begin with.
 *
 * ## What tells you it is that light and not another one
 *
 * The era axis, and it is about **identity** rather than power:
 *
 * | kind | how you know which light it is |
 * | --- | --- |
 * | `bonfire` | you do not. It is a fire on a headland, and so is a burning house. |
 * | `harbour` | by where it is. A fixed light is a fixed light, and ships were lost mistaking one for another. |
 * | `flashing` | by its **character** — `Fl(3) 15s` is a name you can look up. |
 * | `sectored` | it tells you where **you** are: white in the fairway, red over the rocks. |
 *
 * The last one is the inversion at the end of the axis, the same shape as a
 * gyro stabiliser that needs no way from you and a self-righting boat that
 * needs no crew: a sectored light does the navigating instead of you. You do
 * not take a bearing off it. You look at its colour.
 *
 * ```ts
 * const s = light.sightedFrom(x, z, 4);
 * s.sector;   // 'red'
 * s.safe;     // false — and there is nothing else to work out
 * ```
 */
export type MarkKind = 'bonfire' | 'harbour' | 'flashing' | 'sectored';

export const MARK_KINDS: MarkKind[] = ['bonfire', 'harbour', 'flashing', 'sectored'];

/**
 * What she has of it, as she comes up on it.
 *
 * This is the real sequence, and it is four-stated like everything else here —
 * `'loom'` is the one people forget. A light is seen in the sky for miles
 * before it is seen at all: the beam lights the haze above the horizon while
 * the lamp itself is still under it.
 *
 * `'raising'` is the narrow band where the lamp sits ON the horizon, and it is
 * not a curiosity — standing up brings it in sight and crouching puts it out,
 * and that gives a distance. It is the one navigational fix in this library
 * that costs nothing but knowing how tall you are.
 */
export type SightState = 'dark' | 'loom' | 'raising' | 'showing';

export interface Sector {
  name: string;
  /**
   * Bearings **outward from the light** — the direction you are, seen from
   * the tower.
   *
   * Charts quote sector limits the other way round, as bearings *from
   * seaward*, and the two differ by 180°. Take one for the other and the red
   * sector lands squarely over the fairway, which is a way of putting a ship
   * on the rocks with entirely correct arithmetic.
   */
  from: number;
  to: number;
  colour: 'white' | 'red' | 'green';
  /** Fraction of the lamp that gets through the glass. */
  transmission: number;
  /** True where this is the water you want to be in. */
  safe: boolean;
}

/** Coloured glass eats light, and this is how much of it. */
export const SECTOR_TRANSMISSION: Record<'white' | 'red' | 'green', number> = {
  white: 1,
  red: 0.25,
  green: 0.18,
};

export interface Sighting {
  /**
   * Close enough to see it — whether or not it happens to be lit this instant.
   *
   * This is the question charts and passage plans ask. `visible` is the other
   * one, and for a flashing light the two disagree most of the time: `Fl(3)
   * 15s` is DARK for eleven and a half seconds out of every fifteen, so a
   * caller testing `visible` once a frame sees a light that is mostly not
   * there. Both are true statements about the same lamp.
   */
  inRange: boolean;
  /** In range AND lit at this instant. */
  visible: boolean;
  state: SightState;
  /** Metres from the observer to the tower. */
  distance: number;
  /** Radians, from the observer to the light, clockwise from north (−z). */
  bearing: number;
  /** How far she could see it from there, m — the SMALLER of the two. */
  range: number;
  /** Where it drops below the horizon, m. The lamp has no say in this. */
  geographic: number;
  /** Where it gets too faint, m. The horizon has no say in this. */
  luminous: number;
  /** Which of the two is doing the limiting — and it changes with her eye. */
  limitedBy: 'horizon' | 'lamp';
  /** Which sector she is in, or `null` on a light that has none. */
  sector: Sector | null;
  /** In the water the light says is good. `null` where it does not say. */
  safe: boolean | null;
  /** Is the lamp lit this instant? A flashing light is dark most of the time. */
  showing: boolean;
}

export interface Seamark extends Prop {
  kind: MarkKind;
  /** Focal plane above sea level, m. THE number for geographic range. */
  readonly height: number;
  /** Candela on the white bearing. */
  readonly intensity: number;
  /** `'Fl(3) 15s'`, `'Oc 8s'`, `'F'` — the name of its rhythm. */
  readonly character: string;
  /** Seconds for one complete character. `Infinity` for a fixed light. */
  readonly period: number;
  /** Lit this instant. */
  readonly showing: boolean;
  /** 0–1 through the character. */
  readonly phase: number;
  /**
   * Can she tell it from another light?
   *
   * False for a bonfire, which is a fire like any other fire, and false for a
   * plain fixed light, which is why characters were invented at all.
   */
  readonly identifiable: boolean;
  /** On a chart at all, with a name and a daymark. A bonfire is not. */
  readonly charted: boolean;

  /** What she has of it from there. THE method. */
  sightedFrom(x: number, z: number, heightOfEye?: number): Sighting;
  /**
   * The range at which a given eye raises it, m.
   *
   * Also a position line: see the lamp sitting on the horizon and you know how
   * far off you are, to within the accuracy of knowing your own height.
   */
  dips(heightOfEye: number): number;
  /** Where it becomes too faint, m, in the visibility she is in. */
  luminousRange(intensity?: number): number;

  /** Meteorological visibility, nautical miles. Straight out of the weather. */
  setVisibility(nauticalMiles: number): void;
  readonly visibility: number;

  /** Add a sector, in bearings OUTWARD from the light. */
  sector(name: string, from: number, to: number, colour: 'white' | 'red' | 'green'): void;
  sectorAt(bearing: number): Sector | null;
  readonly sectors: Sector[];
  /**
   * Draw the sectors on the water.
   *
   * Off by default, and it is a **chart made visible**: nothing at sea looks
   * remotely like this. The point of the picture is that the boat can see one
   * colour at a time and the chart can see all of them.
   *
   * `scale` is there because a sector arc is thirteen nautical miles long and
   * the tower it comes out of is twenty-five metres tall. No frame holds both,
   * and that is not a limitation of the renderer — it is the subject. Drawn to
   * a fraction the RATIOS survive, which is what carries the one claim the
   * picture is for: the red arc is shorter than the white one.
   */
  showSectors(on: boolean, scale?: number): void;

  /** When you cannot see it at all. */
  readonly fogSignal: number;
  readonly sounding: boolean;
  /**
   * Audible out to here, m — and it is the least trustworthy number on the
   * object. Sound goes over the top of you, round headlands, and into silent
   * sectors close under the station itself.
   */
  readonly audibleRange: number;

  station: PropSlot;
  slots: PropSlot[];
  update(dt: number): void;
}

export interface SeamarkOptions {
  kind?: MarkKind;
  /** Focal plane above the sea, m. */
  height?: number;
  /** Candela. */
  intensity?: number;
  /** Starting meteorological visibility, nautical miles. */
  visibility?: number;
  seed?: number;
  palette?: Palette;
}

/** Metres in a nautical mile. */
export const NM = 1852;
/** The eye at night, lux — the threshold everything luminous is solved against. */
const THRESHOLD = 0.67e-6;

const TAU = Math.PI * 2;

/**
 * Geographic range in METRES: how far a light of height `H` is visible to an
 * eye of height `h`, both in metres.
 *
 * `2.08(√H + √h)` nautical miles. The 2.08 rather than a bare geometric 1.93 is
 * terrestrial refraction — the atmosphere bends light down around the curve and
 * hands you about eight per cent more range than the geometry alone allows.
 */
export function geographicRange(height: number, heightOfEye: number): number {
  return 2.08 * (Math.sqrt(Math.max(0, height)) + Math.sqrt(Math.max(0, heightOfEye))) * NM;
}

/**
 * Luminous range in METRES, by Allard's law, solved for the distance at which
 * a light of `intensity` candela falls to the night threshold in `visibility`
 * nautical miles of air.
 *
 * `E = I·e^(−σd) / d²`. There is no closed form for `d`, so it is bisected —
 * eighty halvings, which is exact to the width of an atom and costs nothing.
 */
export function luminousRange(intensity: number, visibility: number): number {
  const I = Math.max(0, intensity);
  if (I <= 0) return 0;
  const sigma = 3 / Math.max(0.05, visibility);
  const at = (nm: number): number => (I * Math.exp(-sigma * nm)) / Math.pow(nm * NM, 2);
  let lo = 0.0005;
  let hi = 300;
  if (at(lo) < THRESHOLD) return 0;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) > THRESHOLD) lo = mid;
    else hi = mid;
  }
  return lo * NM;
}

interface CharSpec {
  label: string;
  /** Flashes in a group. */
  flashes: number;
  /** Seconds each flash is lit. */
  on: number;
  /** Seconds between flashes within the group. */
  gap: number;
  /** Seconds for the whole thing. `Infinity` is a fixed light. */
  period: number;
}

interface KindSpec {
  height: number;
  intensity: number;
  char: CharSpec;
  charted: boolean;
  /** Can you tell it from the next one along the coast? */
  identifiable: boolean;
  /** Painted bands, which is how you know it by DAY — a light is a mark
   *  around the clock and is unlit for half of it. */
  bands: number;
  /** Seconds between blasts. `Infinity` for a station with no signal. */
  fog: number;
  /** How loud, as a range in metres. */
  audible: number;
}

const FIXED: CharSpec = { label: 'F', flashes: 1, on: Infinity, gap: 0, period: Infinity };

const KINDS: Record<MarkKind, KindSpec> = {
  // A fire on a headland. It is bright by the standards of a candle and feeble
  // by the standards of a lighthouse, it has no rhythm whatever, and there is
  // nothing about it that says it is not a burning barn.
  bonfire: {
    height: 18, intensity: 1200, char: FIXED,
    charted: false, identifiable: false, bands: 0, fog: Infinity, audible: 0,
  },
  // Charted, in a known place, with a daymark — and still a FIXED light, so a
  // stranger cannot tell it from the next fixed light along the coast. Ships
  // were lost doing exactly that, and that is why the next row exists.
  harbour: {
    height: 12, intensity: 6000, char: FIXED,
    charted: true, identifiable: false, bands: 0, fog: 30, audible: 2 * NM,
  },
  // A CHARACTER. Three flashes every fifteen seconds is a name, and a name can
  // be looked up in a book, and a light with a name cannot be mistaken for a
  // light with a different one.
  flashing: {
    height: 40, intensity: 200000,
    char: { label: 'Fl(3) 15s', flashes: 3, on: 0.4, gap: 1.0, period: 15 },
    charted: true, identifiable: true, bands: 3, fog: 20, audible: 3 * NM,
  },
  // …and this one tells you where YOU are.
  sectored: {
    height: 25, intensity: 100000,
    char: { label: 'Oc 8s', flashes: 1, on: 6, gap: 0, period: 8 },
    charted: true, identifiable: true, bands: 2, fog: 15, audible: 2.5 * NM,
  },
};

export function createSeamark(options: SeamarkOptions = {}): Seamark {
  const kind = options.kind ?? 'flashing';
  const base = KINDS[kind];
  const H = options.height ?? base.height;
  const I = options.intensity ?? base.intensity;
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  let visibility = options.visibility ?? 10;

  const group = new Group();
  group.name = `seamark:${kind}`;

  const stone = createSurface('ashlar', { color: 0xd9d4c8, seed });
  const dark = createSurface('paintedMetal', { color: 0x2e3338, seed: seed + 1 });
  const lampMat = new MeshStandardMaterial({
    color: 0xfff3d0,
    emissive: palette.lampGlow,
    emissiveIntensity: 2.4,
    roughness: 0.3,
  });
  /**
   * The halo, and it is NOT additive.
   *
   * Additive blending can only add light, so a halo drawn that way is invisible
   * against anything already bright — and a light is a thing you look at
   * against a sky. Plain transparency reads at dusk and at night both.
   */
  const haloMat = new MeshBasicMaterial({
    color: palette.lampGlow,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });

  // ── geometry ─────────────────────────────────────────────────────────

  const lantern = new Group();
  lantern.name = 'seamark:lantern';

  if (kind === 'bonfire') {
    // No tower. A stone platform on the head, and a fire on top of it, which
    // is the entire technology and most of the history.
    const plinth = new Mesh(new CylinderGeometry(2.6, 3.2, H * 0.9, 10), stone);
    plinth.position.y = (H * 0.9) / 2;
    group.add(plinth);
    const basket = new Mesh(new CylinderGeometry(1.5, 1.1, H * 0.16, 10, 1, true), dark);
    basket.position.y = H * 0.95;
    group.add(basket);
  } else {
    const shaft = new Mesh(new CylinderGeometry(2.1, 3.4, H * 0.92, 14), stone);
    shaft.position.y = (H * 0.92) / 2;
    group.add(shaft);
    // THE DAYMARK. A lighthouse is a mark around the clock and is unlit for
    // half of it, so the bands are not decoration — they are how she is
    // identified in daylight, when the whole rest of this module is asleep.
    for (let i = 0; i < base.bands; i++) {
      const t = (i + 0.5) / (base.bands + 0.4);
      const r = 3.4 - (3.4 - 2.1) * t;
      const band = new Mesh(
        new CylinderGeometry(r + 0.03, r + 0.03, (H * 0.92) / (base.bands * 2.2), 14),
        dark
      );
      band.position.y = t * H * 0.92;
      group.add(band);
    }
    const gallery = new Mesh(new CylinderGeometry(2.9, 2.9, 0.22, 14), dark);
    gallery.position.y = H * 0.92;
    group.add(gallery);
    const room = new Mesh(new CylinderGeometry(1.8, 2.0, H * 0.13, 12, 1, true), dark);
    room.position.y = H;
    group.add(room);
    const cap = new Mesh(new CylinderGeometry(0.35, 1.9, H * 0.06, 12), dark);
    cap.position.y = H * 1.09;
    group.add(cap);
  }
  /**
   * THE FOCAL PLANE, and it is exactly `height`.
   *
   * Every range on this object is worked out from that number, so the lamp had
   * better be at it. Hung off a fraction of the tower instead, the arithmetic
   * says eighteen metres and the picture shows fourteen — numbers agreeing
   * while the geometry is four metres out, which is the commonest defect in
   * this library and the one no amount of correct maths catches.
   */
  lantern.position.y = H;
  group.add(lantern);

  const lamp = new Mesh(new SphereGeometry(kind === 'bonfire' ? 1.2 : 1.05, 12, 10), lampMat);
  lamp.name = 'seamark:lamp';
  lantern.add(lamp);
  // A light looks far bigger than its lamp, and at any range that shows what a
  // light is FOR, the lamp itself is a fraction of a pixel. The halo is not the
  // glass; it is how a light reads.
  const halo = new Mesh(new SphereGeometry(Math.max(2.4, H * 0.28), 12, 10), haloMat);
  halo.name = 'seamark:halo';
  lantern.add(halo);

  /** The sectors, painted on the water — off unless somebody asks. */
  const chart = new Group();
  chart.name = 'seamark:sectors';
  chart.visible = false;
  chart.position.y = 1.2;
  group.add(chart);

  const station = createSlot('seamark', 'watch', group, 4.2, 0, 0, -Math.PI / 2);

  // ── the model ────────────────────────────────────────────────────────

  const sectors: Sector[] = [];
  let chartScale = 1;
  let clock = rng.next() * (base.char.period === Infinity ? 1 : base.char.period);
  let showing = true;
  let phase = 0;

  const groupLength =
    base.char.period === Infinity
      ? Infinity
      : base.char.flashes * base.char.on + (base.char.flashes - 1) * base.char.gap;

  const litAt = (t: number): boolean => {
    if (base.char.period === Infinity) return true;
    const p = t % base.char.period;
    if (p >= groupLength) return false;
    if (base.char.gap <= 0) return true;
    return p % (base.char.on + base.char.gap) < base.char.on;
  };

  const rebuildChart = (): void => {
    for (const c of [...chart.children]) chart.remove(c);
    if (!sectors.length) return;
    for (const s of sectors) {
      // The wedge is drawn out to the range THIS colour actually reaches, not
      // to some common radius — a red sector is always shorter than the white
      // one beside it, because the glass eats three quarters of the lamp.
      const reach = luminousRange(I * s.transmission, visibility) * chartScale;
      const span = ((s.to - s.from + TAU) % TAU) || TAU;
      const ring = new Mesh(
        new RingGeometry(
          Math.min(6, reach * 0.02),
          Math.max(8, reach),
          Math.max(6, Math.round(span * 12)),
          1,
          0,
          span
        ),
        new MeshBasicMaterial({
          color: s.colour === 'red' ? 0xd1443a : s.colour === 'green' ? 0x2f9d5b : 0xf2ecd8,
          transparent: true,
          opacity: 0.17,
          side: DoubleSide,
          depthWrite: false,
        })
      );
      // A RingGeometry lies in xy and sweeps from +x. The water is xz, and a
      // bearing is clockwise from −z, so it wants laying down AND turning.
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = Math.PI / 2 - s.from;
      chart.add(ring);
    }
  };

  const sectorAt = (bearing: number): Sector | null => {
    if (!sectors.length) return null;
    const b = ((bearing % TAU) + TAU) % TAU;
    for (const s of sectors) {
      const span = ((s.to - s.from + TAU) % TAU) || TAU;
      const off = ((b - s.from + TAU) % TAU);
      if (off < span) return s;
    }
    return null;
  };

  const api: Seamark = {
    object: group,
    obstacleRadius: kind === 'bonfire' ? 3.4 : 3.6,
    kind,
    height: H,
    intensity: I,
    character: base.char.label,
    period: base.char.period,
    charted: base.charted,
    identifiable: base.identifiable,
    station,
    slots: [station],
    fogSignal: base.fog,

    get showing() {
      return showing;
    },
    get phase() {
      return phase;
    },
    get sounding() {
      // Worked out on demand rather than only inside `update`. Set the
      // visibility and ask, and a station that answered with whatever it
      // happened to think last frame would be wrong on the frame that matters
      // — the same defect the trim track had, three modules along.
      return base.fog !== Infinity && visibility < 2 && clock % base.fog < 2.5;
    },
    get audibleRange() {
      return base.audible;
    },
    get visibility() {
      return visibility;
    },
    setVisibility(nauticalMiles: number) {
      visibility = Math.max(0.01, Number.isFinite(nauticalMiles) ? nauticalMiles : 10);
      rebuildChart();
    },
    get sectors() {
      return sectors;
    },

    dips(heightOfEye: number) {
      return geographicRange(H, heightOfEye);
    },
    luminousRange(intensity = I) {
      return luminousRange(intensity, visibility);
    },

    sector(name, from, to, colour) {
      sectors.push({
        name,
        from: ((from % TAU) + TAU) % TAU,
        to: ((to % TAU) + TAU) % TAU,
        colour,
        transmission: SECTOR_TRANSMISSION[colour],
        // White is the water you want. That is the whole convention and it is
        // the reason the system works on a dark night with a frightened crew.
        safe: colour === 'white',
      });
      rebuildChart();
    },
    sectorAt,
    showSectors(on: boolean, scale = 1) {
      chartScale = Math.max(1e-4, Number.isFinite(scale) ? scale : 1);
      rebuildChart();
      chart.visible = on && sectors.length > 0;
    },

    sightedFrom(x: number, z: number, heightOfEye = 1.5) {
      const here = group.getWorldPosition(new Vector3());
      const dx = x - here.x;
      const dz = z - here.z;
      const distance = Math.hypot(dx, dz);
      // Bearing OUTWARD from the light: which way she is, seen from the tower.
      // Clockwise from north, and north is −z.
      const bearing = ((Math.atan2(dx, -dz) % TAU) + TAU) % TAU;

      const sector = sectorAt(bearing);
      const lampHere = I * (sector ? sector.transmission : 1);
      const geographic = geographicRange(H, heightOfEye);
      const lum = luminousRange(lampHere, visibility);
      const range = Math.min(geographic, lum);

      // The loom: the beam lights the haze ABOVE the horizon, so the glow is
      // there for miles before the lamp is. It is the first thing anybody
      // actually sees, and it is beyond the range any table gives.
      //
      // It only exists where the horizon is what is hiding the lamp. A light
      // that has simply got too faint has no loom — there is nothing over the
      // hill, because there is no hill.
      const horizonLimited = geographic <= lum;
      const loomOut = horizonLimited ? geographic * 1.25 : range;
      let state: SightState;
      if (distance > loomOut) state = 'dark';
      else if (distance > range) state = 'loom';
      else if (horizonLimited && distance > geographic * 0.94) state = 'raising';
      else state = 'showing';

      const inRange = distance <= range;
      return {
        inRange,
        visible: inRange && showing,
        state,
        distance,
        bearing,
        range,
        geographic,
        luminous: lum,
        limitedBy: geographic <= lum ? 'horizon' : 'lamp',
        sector,
        safe: sector ? sector.safe : null,
        showing,
      };
    },

    update(dt: number) {
      if (!(dt > 0)) return;
      clock += dt;
      const lit = litAt(clock);
      phase = base.char.period === Infinity ? 0 : (clock % base.char.period) / base.char.period;
      if (lit !== showing) {
        showing = lit;
        lampMat.emissiveIntensity = lit ? 2.4 : 0.02;
        haloMat.opacity = lit ? 0.4 : 0;
        halo.visible = lit;
      }
    },
  };

  // Start consistent with the clock rather than blindly lit: a light created
  // mid-character and reported as `showing` before anybody has stepped it is
  // the same defect the trim track had, one object along.
  showing = litAt(clock);
  lampMat.emissiveIntensity = showing ? 2.4 : 0.02;
  haloMat.opacity = showing ? 0.4 : 0;
  halo.visible = showing;

  if (kind === 'sectored') {
    // A fairway between two dangers: white down the channel, red over the rocks
    // to one side and green over the shoal to the other. The white sector is
    // narrow on purpose — it is a line, not a region.
    api.sector('rocks', (188 * Math.PI) / 180, (352 * Math.PI) / 180, 'red');
    api.sector('fairway', (172 * Math.PI) / 180, (188 * Math.PI) / 180, 'white');
    api.sector('shoal', (352 * Math.PI) / 180, (172 * Math.PI) / 180, 'green');
  }

  return api;
}
