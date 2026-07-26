/**
 * The sea state — and the one thing in this library with a **memory**.
 *
 * The wind can get up in twenty minutes and drop in ten. The sea it raises
 * cannot: it takes hours to build and **days** to die. So the sea you are in
 * is almost never the sea that the wind you can feel would make.
 *
 * ```ts
 * const sea = createSeaState({ kind: 'ocean' });
 * const ocean = createOcean({ sea: () => sea.trains, size: 900 });
 *
 * sea.setWind(18, 250);          // a gale from the west-south-west
 * sea.state;                     // 'building' — and it will be for hours
 * sea.setWind(0, 250);           // …and now it drops flat calm
 * sea.state;                     // 'dying'. The sea does not care.
 * sea.height;                    // still 6 m, and still 4 m tomorrow
 * ```
 *
 * That asymmetry is the module. A boat can shelter from wind behind a
 * headland and cannot shelter from the swell that came round it; a harbour
 * mouth is workable in a gale and unworkable the morning after one; and the
 * swell running under you right now may have been raised by a storm a
 * thousand miles away that you will never see.
 *
 * ## You cannot make an ocean sea in a lake
 *
 * A sea needs **fetch** — a stretch of open water for the wind to work on —
 * and **duration**. The same forty knots makes ripples across a lake, a nasty
 * short sea in a channel, and a thirty-foot swell in the Southern Ocean, and
 * the only difference is how far the wind had to work with:
 *
 * ```ts
 * createSeaState({ kind: 'lake' }).setWind(20, 0);    // limit: 0.4 m
 * createSeaState({ kind: 'ocean' }).setWind(20, 0);   // limit: 9.8 m
 * ```
 *
 * ## Wind sea and swell are two different seas
 *
 * They come from different directions, because the swell came from somewhere
 * else. Where they cross, the sea is **confused** — and a confused sea is the
 * dangerous one, because there is no pattern in it to steer to.
 */
export type SeaKind = 'lake' | 'coastal' | 'shelf' | 'ocean';

/** How much sea this water can hold, which is a question about its size. */
export const SEA_KINDS: SeaKind[] = ['lake', 'coastal', 'shelf', 'ocean'];

/**
 * rest / transitioning-toward / at-target / drifting-back — and the axis is
 * **the sea against the wind that is on it now.**
 *
 * `'dying'` is the state this module exists for: a big sea running under a
 * wind that could not possibly have raised it, because the wind that did has
 * gone somewhere else.
 */
export type SeaCondition = 'calm' | 'building' | 'full' | 'dying';

/** One train of waves. Two of these make a sea. */
export interface Train {
  /** Significant height, m — the average of the highest third, which is what
   *  a sailor means by "the sea is running two metres". */
  height: number;
  /** Seconds between crests. */
  period: number;
  /** Crest to crest, m. `1.56 × period²` in deep water. */
  length: number;
  /** Degrees it is coming FROM, the way a sailor says it. */
  from: number;
}

export interface SeaState {
  kind: SeaKind;
  /** `speed` m/s, `from` degrees. */
  setWind(speed: number, from?: number): void;
  readonly wind: number;
  readonly windFrom: number;

  /** What this wind has managed to raise HERE, so far. */
  readonly windSea: Train;
  /** What was raised somewhere else, and arrived. */
  readonly swell: Train;
  /** The two of them, for `createOcean({ sea })`. Mutated in place — a live
   *  view, not a snapshot. */
  readonly trains: { windSea: Train; swell: Train };

  /** Combined significant height, m. Two trains add in QUADRATURE, not
   *  arithmetically: two 3 m seas crossing make 4.2 m, not 6. */
  readonly height: number;
  /** Of the bigger train. */
  readonly period: number;
  /** Douglas sea state, 0–9. */
  readonly douglas: number;
  /**
   * How confused it is, 0–1. Peaks when two trains of equal height cross at
   * right angles, and is zero when they run together — which is why a big
   * swell with the wind behind it is comfortable and the same swell on the
   * beam is not.
   */
  readonly confusion: number;
  /** The most this wind could ever raise here, m. Fetch-limited or fully
   *  developed, whichever is smaller. */
  readonly limit: number;
  /** Metres of open water the wind has to work on. */
  readonly fetch: number;
  /** Seconds until the sea is within a tenth of `limit`. `Infinity` if this
   *  wind will never get there; 0 if it is already there. */
  readonly building: number;
  /** Seconds until the sea is down to `metres`, if the wind stays as it is.
   *  `Infinity` if it never will. */
  fallsTo(metres: number): number;

  /** A swell from a storm you will never see. */
  swellIn(from: number, height: number, period: number): void;

  readonly state: SeaCondition;
  onState?: (state: SeaCondition) => void;
  update(dt: number): void;
}

export interface SeaStateOptions {
  kind?: SeaKind;
  /** Override the fetch, m. */
  fetch?: number;
  /** Start with a sea already running. */
  height?: number;
  /** …from here. */
  from?: number;
  wind?: number;
  windFrom?: number;
}

const G = 9.81;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const wrap360 = (d: number): number => ((d % 360) + 360) % 360;

/** Shortest signed turn from a to b, degrees. */
const delta = (a: number, b: number): number => {
  const d = wrap360(b - a);
  return d > 180 ? d - 360 : d;
};

const FETCH: Record<SeaKind, number> = {
  // A lake: a couple of miles, and it will never be anything but chop.
  lake: 3_000,
  // Inside a headland or across a channel.
  coastal: 30_000,
  // Off soundings but not across an ocean.
  shelf: 200_000,
  // Nothing to windward for a thousand miles.
  ocean: 2_000_000,
};

/** Significant height a wind would raise given all the time and sea room in
 *  the world. `0.0246 U²` — twenty metres a second makes ten metres of sea. */
export function fullyDeveloped(wind: number): number {
  return 0.0246 * wind * wind;
}

/**
 * What a wind can raise across a limited fetch, m.
 *
 * `0.0016 · U · √(F/g)`, the SMB form. It is the reason a lake in a gale is
 * unpleasant and not dangerous: forty knots across three kilometres of water
 * cannot make anything bigger than about half a metre, no matter how long it
 * blows.
 */
export function fetchLimited(wind: number, fetch: number): number {
  return 0.0016 * Math.abs(wind) * Math.sqrt(Math.max(0, fetch) / G);
}

/** Seconds between crests, for a sea of this height. Longer seas are older
 *  seas, and that is the whole of it. */
export function periodFor(height: number): number {
  return height <= 1e-4 ? 0 : 3.9 * Math.sqrt(height) + 1.5;
}

/** Deep-water wavelength for a period, m. */
export function lengthFor(period: number): number {
  return (G * period * period) / (2 * Math.PI);
}

/** Douglas sea state, 0–9, from significant height. */
export function douglasFor(height: number): number {
  // Douglas 0 is GLASSY — not "small", but nothing at all — so the bottom of
  // the scale is a case and not a mark. Written as a mark at zero, a millpond
  // comes out as sea state 1 and the scale never reads its own first entry.
  if (height <= 0) return 0;
  const marks = [0.1, 0.5, 1.25, 2.5, 4, 6, 9, 14];
  let n = 1;
  for (const m of marks) if (height >= m) n++;
  return Math.min(9, n);
}

export function createSeaState(options: SeaStateOptions = {}): SeaState {
  const kind = options.kind ?? 'ocean';
  const fetch = options.fetch ?? FETCH[kind];

  let wind = Math.max(0, options.wind ?? 0);
  let windFrom = wrap360(options.windFrom ?? 270);

  const windSea: Train = { height: 0, period: 0, length: 0, from: windFrom };
  const swell: Train = {
    height: Math.max(0, options.height ?? 0),
    period: periodFor(Math.max(0, options.height ?? 0)),
    length: 0,
    from: wrap360(options.from ?? windFrom),
  };
  swell.length = lengthFor(swell.period);
  const trains = { windSea, swell };

  let state: SeaCondition = 'calm';

  const limitOf = (): number => Math.min(fullyDeveloped(wind), fetchLimited(wind, fetch));

  /**
   * How long a sea of this size takes to build, in seconds.
   *
   * Bigger seas take longer, which is why a squall makes nothing much and a
   * three-day gale makes everything. Roughly ten hours to fully developed at
   * ten metres a second, twenty at twenty.
   */
  const buildTau = (target: number): number => 3600 * 2.2 * Math.sqrt(Math.max(0.05, target));

  /** A swell dies over DAYS. It is the longest time constant in the trilogy
   *  and it is the entire point of the module. */
  const SWELL_TAU = 3600 * 30;

  const api: SeaState = {
    kind,
    fetch,
    trains,
    windSea,
    swell,
    setWind(speed: number, from?: number) {
      wind = Math.max(0, Number.isFinite(speed) ? speed : 0);
      if (from !== undefined && Number.isFinite(from)) windFrom = wrap360(from);
    },
    get wind() {
      return wind;
    },
    get windFrom() {
      return windFrom;
    },
    get limit() {
      return limitOf();
    },
    get height() {
      // IN QUADRATURE. Two three-metre seas crossing make four and a bit, not
      // six — wave energy adds, and height is the square root of energy.
      return Math.sqrt(windSea.height ** 2 + swell.height ** 2);
    },
    get period() {
      return windSea.height >= swell.height ? windSea.period : swell.period;
    },
    get douglas() {
      return douglasFor(api.height);
    },
    get confusion() {
      const a = windSea.height;
      const b = swell.height;
      if (a < 0.05 || b < 0.05) return 0;
      // Worst when they are the same size — one big sea with a ripple across
      // it is not confused — and worst when they cross at a right angle.
      const evenness = (2 * Math.sqrt(a * b)) / (a + b);
      const cross = Math.sin((delta(windSea.from, swell.from) * Math.PI) / 180);
      return clamp01(evenness * cross * cross);
    },
    get building() {
      const target = limitOf();
      if (target <= windSea.height * 1.1) return 0;
      // Exponential approach: the time to close 90% of the gap.
      const tau = buildTau(target);
      const gap = (target - windSea.height) / Math.max(1e-6, target * 0.1);
      return gap <= 1 ? 0 : tau * Math.log(gap);
    },
    fallsTo(metres: number) {
      if (api.height <= metres) return 0;
      // Under a held wind the wind-sea settles at `limit` and never goes
      // below it, so anything under that is unreachable.
      const floor = limitOf();
      if (metres < floor) return Infinity;
      // Everything above the floor is swell, and swell goes on the long clock.
      const excess = Math.sqrt(Math.max(0, api.height ** 2 - floor ** 2));
      const want = Math.sqrt(Math.max(0, metres * metres - floor * floor));
      if (excess <= want) return 0;
      if (want <= 1e-4) return Infinity;
      return SWELL_TAU * Math.log(excess / want);
    },
    swellIn(from: number, height: number, period: number) {
      const h = Math.max(0, height);
      if (h <= 0) return;
      // Two swells running at once are still one swell: they combine in
      // quadrature and the direction goes with the weight, because there is
      // one swell train and pretending otherwise needs a second shader.
      const total = Math.sqrt(swell.height ** 2 + h * h);
      const w = (h * h) / Math.max(1e-9, total * total);
      swell.from = wrap360(swell.from + delta(swell.from, wrap360(from)) * w);
      swell.period = swell.period * (1 - w) + Math.max(1, period) * w;
      swell.height = total;
      swell.length = lengthFor(swell.period);
    },
    get state() {
      return state;
    },
    update(dt: number) {
      if (!(dt > 0)) return;
      const target = limitOf();

      if (windSea.height < target) {
        // BUILDING. Toward what this wind can do here, on the hours clock.
        const k = 1 - Math.exp(-dt / buildTau(target));
        windSea.height += (target - windSea.height) * k;
        // The sea turns to the wind, but not instantly — an old sea takes a
        // while to come round to a new breeze, which is a cross sea in itself.
        windSea.from = wrap360(windSea.from + delta(windSea.from, windFrom) * Math.min(1, dt / 5400));
      } else {
        // THE WIND HAS DROPPED, and the sea it left does not vanish: it stops
        // being wind sea and becomes SWELL. Nothing is lost here — it moves
        // from the train that answers the wind to the train that does not.
        //
        // AND THE BOOKKEEPING IS IN ENERGY, NOT IN HEIGHT. Take it off one
        // train linearly and add it to the other in quadrature and most of it
        // simply disappears: written that way, a full Atlantic gale of nine
        // and a half metres came down to two and a third in one hour, which is
        // the exact opposite of the thing this module is for.
        const before = windSea.height;
        const after = target + (before - target) * Math.exp(-dt / 2400);
        const shedEnergy = Math.max(0, before * before - after * after);
        windSea.height = after;
        if (shedEnergy > 1e-9) {
          const total = Math.sqrt(swell.height ** 2 + shedEnergy);
          const w = shedEnergy / Math.max(1e-9, total * total);
          swell.from = wrap360(
            swell.from + delta(swell.from, windSea.from) * (swell.height < 1e-4 ? 1 : w)
          );
          swell.period =
            swell.height < 1e-4
              ? windSea.period
              : swell.period * (1 - w) + windSea.period * w;
          swell.height = total;
        }
      }
      windSea.period = periodFor(windSea.height);
      windSea.length = lengthFor(windSea.period);

      // And the swell bleeds away over DAYS. Thirty hours to fall by a third.
      swell.height *= Math.exp(-dt / SWELL_TAU);
      if (swell.height < 0.01) swell.height = 0;
      // …and it LENGTHENS as it goes. The short components die first, so an
      // old swell is a long low one, which is how you know it came a long way.
      swell.period = Math.min(22, swell.period + dt / (3600 * 40));
      swell.length = lengthFor(swell.period);

      const next = ((): SeaCondition => {
        if (api.height < 0.12) return 'calm';
        // The axis is the sea AGAINST the wind that is on it now, with a
        // two-sided band so a sea sitting at its limit does not chatter.
        const ratio = windSea.height / Math.max(0.02, target);
        const wide = state === 'full';
        if (api.height > Math.max(target, 0.02) * (wide ? 1.35 : 1.15)) return 'dying';
        if (ratio < (wide ? 0.75 : 0.9)) return 'building';
        return 'full';
      })();
      if (next !== state) {
        state = next;
        api.onState?.(state);
      }
    },
  };
  return api;
}
