import { Color, Fog, type Light, type Object3D, type Scene } from 'three';
import { Rng } from '../core/random';
import { createWindField, type WindField } from './wind';
import { createPrecipitation, type Precipitation } from './precipitation';

export type WeatherPreset =
  | 'clear'
  | 'overcast'
  | 'fog'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'blizzard';

/** The full set of knobs a weather state drives. All are cross-faded on `set`. */
export interface WeatherStateParams {
  /** Wind strength (WindField.strength). */
  wind: number;
  /** Gustiness, 0–1. */
  gust: number;
  /** Rain intensity, 0–1. */
  rain: number;
  /** Snow intensity, 0–1. */
  snow: number;
  /** Fog colour (hex). */
  fogColor: number;
  /** Fog near distance, metres. */
  fogNear: number;
  /** Fog far distance, metres. */
  fogFar: number;
  /** Sky / background colour (hex). */
  sky: number;
  /** Light level multiplier, 0–1 (dims the sun & ambient in storms). */
  light: number;
  /** Sea roughness, 0–1 — wire an ocean's `storm` to `() => weather.storminess`
   *  and it whips up a surge (bigger, choppier, foamier, higher seas). Default 0. */
  sea?: number;
  /** Whether lightning flashes fire in this state. */
  lightning?: boolean;
}

export interface WeatherOptions {
  /** Starting state. Default 'clear'. */
  initial?: WeatherPreset | string;
  /** Reuse an existing WindField (so flora already bound to it responds). Otherwise one is made. */
  wind?: WindField;
  /** The sun / key light to dim in storms (its current intensity is taken as "full sun"). */
  sun?: Light;
  /** The ambient / fill light to dim in storms. */
  ambient?: Light;
  /** Manage `scene.fog` (creating a Fog if absent). Default true. */
  fog?: boolean;
  /** Manage `scene.background` colour. Default true. */
  background?: boolean;
  /** Settle snow onto this object in snowy states (via Precipitation.accumulate). */
  accumulateOn?: Object3D;
  /** Rain particle count. Default 6000. */
  rainCount?: number;
  /** Snow particle count. Default 3500. */
  snowCount?: number;
  /** Override or add states (deep-merged over the built-ins). */
  states?: Record<string, Partial<WeatherStateParams>>;
  seed?: number;
}

export interface Weather {
  /** The shared wind field — bind flora to it so trees lean into the storm. */
  wind: WindField;
  /** The rain system (its intensity is driven by the current state). */
  rain: Precipitation;
  /** The snow system. */
  snow: Precipitation;
  /** The renderables added to the scene (rain + snow). */
  objects: Object3D[];
  /** The current target state name. */
  readonly state: string;
  /** The live, cross-faded sea roughness, 0–1 — wire an ocean's `storm` to this. */
  readonly storminess: number;
  /** Cross-fade to a state over `fade` seconds (default 4). */
  set(name: WeatherPreset | string, options?: { fade?: number }): Weather;
  /** Advance manually instead of self-driving (for deterministic loops). */
  update(dt: number): void;
}

const BUILT_IN: Record<WeatherPreset, WeatherStateParams> = {
  clear: { wind: 0.15, gust: 0.4, rain: 0, snow: 0, fogColor: 0xbcd4e6, fogNear: 30, fogFar: 200, sky: 0xbcd4e6, light: 1, sea: 0.05 },
  overcast: { wind: 0.3, gust: 0.5, rain: 0, snow: 0, fogColor: 0x9aa7b0, fogNear: 24, fogFar: 140, sky: 0x9aa7b0, light: 0.7, sea: 0.22 },
  fog: { wind: 0.1, gust: 0.3, rain: 0, snow: 0, fogColor: 0xc2c8cc, fogNear: 3, fogFar: 30, sky: 0xc2c8cc, light: 0.85, sea: 0.08 },
  rain: { wind: 0.4, gust: 0.6, rain: 0.7, snow: 0, fogColor: 0x74808a, fogNear: 16, fogFar: 90, sky: 0x74808a, light: 0.55, sea: 0.5 },
  storm: { wind: 0.9, gust: 0.9, rain: 1, snow: 0, fogColor: 0x565f68, fogNear: 10, fogFar: 62, sky: 0x565f68, light: 0.4, sea: 1, lightning: true },
  snow: { wind: 0.25, gust: 0.4, rain: 0, snow: 0.7, fogColor: 0xcdd6dd, fogNear: 16, fogFar: 90, sky: 0xcdd6dd, light: 0.8, sea: 0.15 },
  blizzard: { wind: 0.8, gust: 0.9, rain: 0, snow: 1, fogColor: 0xdde6ec, fogNear: 6, fogFar: 40, sky: 0xdde6ec, light: 0.62, sea: 0.7, lightning: false },
};

/** A live, colour-aware copy of a state we can interpolate in place. */
interface LiveState {
  wind: number;
  gust: number;
  rain: number;
  snow: number;
  fogColor: Color;
  fogNear: number;
  fogFar: number;
  sky: Color;
  light: number;
  sea: number;
  lightning: boolean;
}

function toLive(p: WeatherStateParams): LiveState {
  return {
    wind: p.wind,
    gust: p.gust,
    rain: p.rain,
    snow: p.snow,
    fogColor: new Color(p.fogColor),
    fogNear: p.fogNear,
    fogFar: p.fogFar,
    sky: new Color(p.sky),
    light: p.light,
    sea: p.sea ?? 0,
    lightning: !!p.lightning,
  };
}

function copyLive(src: LiveState): LiveState {
  return {
    ...src,
    fogColor: src.fogColor.clone(),
    sky: src.sky.clone(),
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t); // smoothstep ease

function nowSeconds(): number {
  return typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
}

/**
 * A weather controller that cross-fades a whole scene between named states —
 * `clear`, `overcast`, `fog`, `rain`, `storm`, `snow`, `blizzard` — by driving
 * the pieces SCENA already has: a {@link WindField}, rain and snow
 * {@link Precipitation}, the scene's fog and background colour, and (optionally)
 * the sun and ambient light. Call `set('storm')` and the wind rises, rain
 * fills in, the fog closes and darkens and lightning cracks — all eased over a
 * few seconds. It self-animates from the render loop.
 *
 * Bind your flora to `weather.wind` so the trees lean into the storm; the one
 * field drives the bend, the rain's slant and (if you have an ocean) the swell.
 *
 * ```ts
 * const weather = createWeather(scene, { sun: rig.sun, accumulateOn: ground });
 * wind = weather.wind;
 * applyWind(forest.group, { field: weather.wind, height: 4, anchor: 1 });
 * weather.set('storm', { fade: 6 });     // roll a storm in over six seconds
 * ```
 */
export function createWeather(scene: Scene, options: WeatherOptions = {}): Weather {
  const manageFog = options.fog ?? true;
  const manageBg = options.background ?? true;
  const rng = new Rng(options.seed ?? 1);

  // Resolve the state table: built-ins with any user overrides merged on top.
  const states: Record<string, WeatherStateParams> = {};
  for (const [name, p] of Object.entries(BUILT_IN)) states[name] = { ...p };
  if (options.states) {
    for (const [name, patch] of Object.entries(options.states)) {
      states[name] = { ...(states[name] ?? BUILT_IN.clear), ...patch };
    }
  }
  const resolve = (name: string): WeatherStateParams => states[name] ?? BUILT_IN.clear;

  const wind = options.wind ?? createWindField({ direction: 35, strength: 0.15, gust: 0.4 });
  const rain = createPrecipitation({ type: 'rain', wind, count: options.rainCount ?? 6000, intensity: 0 });
  const snow = createPrecipitation({ type: 'snow', wind, count: options.snowCount ?? 3500, intensity: 0 });
  if (options.accumulateOn) snow.accumulate(options.accumulateOn);
  scene.add(rain.object, snow.object);

  // Fog & background handles.
  let fog: Fog | null = null;
  if (manageFog) {
    if (scene.fog instanceof Fog) fog = scene.fog;
    else {
      fog = new Fog(0xbcd4e6, 30, 200);
      scene.fog = fog;
    }
  }
  const bg = manageBg && scene.background instanceof Color ? scene.background : null;

  // "Full sun" reference intensities, so `light` multiplies from the values the
  // caller set up their rig with.
  const sun = options.sun ?? null;
  const ambient = options.ambient ?? null;
  const sunBase = sun ? sun.intensity : 0;
  const ambientBase = ambient ? ambient.intensity : 0;

  const initial = options.initial ?? 'clear';
  const cur = toLive(resolve(initial));
  let from = copyLive(cur);
  let to = copyLive(cur);
  let p = 1; // fade progress, 1 = settled
  let duration = 1;
  let targetName = initial;

  // Lightning state.
  let flashTimer = rng.range(3, 9);
  let flash = 0;

  const apply = (): void => {
    wind.setStrength(cur.wind);
    wind.uniforms.uWindGust.value = cur.gust;
    rain.setIntensity(cur.rain);
    snow.setIntensity(cur.snow);
    if (fog) {
      fog.color.copy(cur.fogColor);
      fog.near = cur.fogNear;
      fog.far = cur.fogFar;
    }
    const lightMul = Math.min(1, cur.light + flash * 0.9);
    if (bg) {
      bg.copy(cur.sky);
      if (flash > 0) bg.lerp(new Color(0xffffff), flash * 0.7);
    }
    if (sun) sun.intensity = sunBase * lightMul + sunBase * flash * 1.4;
    if (ambient) ambient.intensity = ambientBase * lightMul + ambientBase * flash * 1.4;
  };
  apply();

  const step = (dt: number): void => {
    dt = Math.min(0.1, Math.max(0, dt));
    if (p < 1) {
      p = Math.min(1, p + dt / duration);
      const e = smooth(p);
      cur.wind = lerp(from.wind, to.wind, e);
      cur.gust = lerp(from.gust, to.gust, e);
      cur.rain = lerp(from.rain, to.rain, e);
      cur.snow = lerp(from.snow, to.snow, e);
      cur.fogNear = lerp(from.fogNear, to.fogNear, e);
      cur.fogFar = lerp(from.fogFar, to.fogFar, e);
      cur.light = lerp(from.light, to.light, e);
      cur.sea = lerp(from.sea, to.sea, e);
      cur.fogColor.lerpColors(from.fogColor, to.fogColor, e);
      cur.sky.lerpColors(from.sky, to.sky, e);
      cur.lightning = e > 0.5 ? to.lightning : from.lightning;
    }
    // Lightning: fire an occasional double-flash in stormy states.
    if (cur.lightning) {
      flashTimer -= dt;
      if (flashTimer <= 0) {
        flash = 1;
        flashTimer = rng.range(4, 11);
      }
    }
    flash = Math.max(0, flash - dt * 5.5); // ~0.18s decay
    apply();
  };

  let manual = false;
  let last = nowSeconds();
  const prevRender = rain.object.onBeforeRender;
  rain.object.onBeforeRender = function (this: typeof rain.object, ...args: unknown[]) {
    if (prevRender) (prevRender as (...a: unknown[]) => void).apply(this, args);
    if (!manual) {
      const t = nowSeconds();
      step(t - last);
      last = t;
    }
  } as typeof rain.object.onBeforeRender;

  const weather: Weather = {
    wind,
    rain,
    snow,
    objects: [rain.object, snow.object],
    get state() {
      return targetName;
    },
    get storminess() {
      return cur.sea;
    },
    set(name, opts = {}) {
      from = copyLive(cur);
      to = toLive(resolve(name));
      p = 0;
      duration = Math.max(0.001, opts.fade ?? 4);
      targetName = name;
      return weather;
    },
    update(dt) {
      manual = true;
      step(dt);
    },
  };

  return weather;
}
