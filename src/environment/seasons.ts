import { Color, Mesh, type Material, type Object3D } from 'three';
import type { TreeSeason } from '../props/tree';

/** The slice of the shader object `onBeforeCompile` receives. */
interface PatchableShader {
  uniforms: Record<string, { value: unknown }>;
  fragmentShader: string;
}

/** A season is the four names a foliage `Seasons` controller cross-fades between. */
export type Season = TreeSeason; // 'spring' | 'summer' | 'autumn' | 'winter'

/**
 * How a season re-grades foliage albedo. A pure colour operation — tint the
 * leaves toward a seasonal hue, push or drop their saturation, and lighten or
 * darken them — so no geometry is rebuilt and a whole wood turns over a few
 * seconds by lerping these numbers.
 */
export interface SeasonGrade {
  /** Hue the foliage is blended toward (hex). */
  tint: number;
  /** How far toward `tint`, 0–1. */
  tintAmount: number;
  /** Saturation multiplier (1 = unchanged, >1 richer, <1 toward grey). */
  saturation: number;
  /** Brightness multiplier (1 = unchanged). */
  brightness: number;
}

export interface SeasonsOptions {
  /** Starting season. Default 'summer' (the as-authored look — no grade). */
  initial?: Season;
  /** Override or extend the built-in grades (merged over the defaults). */
  grades?: Partial<Record<Season, Partial<SeasonGrade>>>;
}

export interface Seasons {
  /** The shared shader uniforms (one set, referenced by every bound material). */
  readonly uniforms: Record<string, { value: unknown }>;
  /** The current target season. */
  readonly season: Season;
  /** Every foliage material re-graded so far. */
  materials: Material[];
  /** Patch one material to take the seasonal grade. Composes with wind; idempotent. */
  bind(material: Material): Seasons;
  /** Self-animate: drive the cross-fade clock from a rendered object's `onBeforeRender`. */
  attach(object: Object3D): Seasons;
  /** Bind every tagged foliage material under `target`, then attach the driver. */
  apply(target: Object3D): Seasons;
  /** Cross-fade to a season over `fade` seconds (default 6). */
  set(season: Season, options?: { fade?: number }): Seasons;
  /** Advance manually instead of self-driving (for deterministic loops). */
  update(dt: number): void;
}

// Summer is the neutral baseline (the tree as `createTree` authored it); the
// other three grade away from it. Winter reads as bare/dead — desaturated,
// browned and darkened — since we recolour rather than drop leaves.
const BUILT_IN: Record<Season, SeasonGrade> = {
  spring: { tint: 0xbfe070, tintAmount: 0.32, saturation: 1.12, brightness: 1.08 },
  summer: { tint: 0x3f7d2f, tintAmount: 0.0, saturation: 1.0, brightness: 1.0 },
  autumn: { tint: 0xcf7a24, tintAmount: 0.62, saturation: 1.2, brightness: 0.95 },
  winter: { tint: 0x6f6350, tintAmount: 0.58, saturation: 0.35, brightness: 0.72 },
};

const SEASON_UNIFORMS = /* glsl */ `
uniform vec3  uSeasonTint;
uniform float uSeasonTintAmt;
uniform float uSeasonSat;
uniform float uSeasonBright;
`;

// A pure albedo grade: desaturate/enrich around luma, blend toward the season
// hue, then scale brightness. Pure 0–1 maths, no world space — safe on mediump.
const SEASON_FRAG = /* glsl */ `
{
  vec3 scenaSeason = diffuseColor.rgb;
  float scenaLum = dot(scenaSeason, vec3(0.299, 0.587, 0.114));
  scenaSeason = mix(vec3(scenaLum), scenaSeason, uSeasonSat);
  scenaSeason = mix(scenaSeason, uSeasonTint, uSeasonTintAmt);
  diffuseColor.rgb = max(scenaSeason * uSeasonBright, vec3(0.0));
}
`;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);

function nowSeconds(): number {
  return typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
}

/** A live, colour-aware grade we can interpolate in place. */
interface LiveGrade {
  tint: Color;
  tintAmount: number;
  saturation: number;
  brightness: number;
}

function toLive(g: SeasonGrade): LiveGrade {
  return { tint: new Color(g.tint), tintAmount: g.tintAmount, saturation: g.saturation, brightness: g.brightness };
}

/**
 * A season controller for foliage — the counterpart to {@link createWeather},
 * but for the trees themselves. It cross-fades a whole wood between `spring`,
 * `summer`, `autumn` and `winter` by re-grading each canopy's albedo (tint,
 * saturation, brightness) in the shader — no geometry rebuilt, so thousands of
 * scattered trees turn together for the cost of a few uniform writes. Only
 * foliage is touched; trunks stay planted and unchanged.
 *
 * It patches the same foliage materials `createTree` tags, composes cleanly with
 * a {@link WindField} (a tree can sway *and* turn), and self-animates from the
 * render loop — so `set('autumn')` and the leaves warm over a few seconds.
 *
 * ```ts
 * const seasons = createSeasons({ initial: 'summer' });
 * seasons.apply(forest.group);          // re-grade every tagged canopy
 * seasons.apply(oak.object);            // and standalone trees
 * seasons.set('autumn', { fade: 8 });   // turn the wood over eight seconds
 * ```
 */
export function createSeasons(options: SeasonsOptions = {}): Seasons {
  const grades: Record<Season, SeasonGrade> = {
    spring: { ...BUILT_IN.spring },
    summer: { ...BUILT_IN.summer },
    autumn: { ...BUILT_IN.autumn },
    winter: { ...BUILT_IN.winter },
  };
  if (options.grades) {
    for (const key of Object.keys(options.grades) as Season[]) {
      grades[key] = { ...grades[key], ...options.grades[key] };
    }
  }

  const initial = options.initial ?? 'summer';
  const cur = toLive(grades[initial]);

  // The shared uniforms — one set, referenced by every bound material, so a
  // single update re-grades the whole forest.
  const uniforms = {
    uSeasonTint: { value: cur.tint },
    uSeasonTintAmt: { value: cur.tintAmount },
    uSeasonSat: { value: cur.saturation },
    uSeasonBright: { value: cur.brightness },
  };

  const patched: Material[] = [];
  let from = toLive(grades[initial]);
  let to = toLive(grades[initial]);
  let p = 1; // fade progress, 1 = settled
  let duration = 1;
  let targetName: Season = initial;

  const push = (): void => {
    uniforms.uSeasonTint.value = cur.tint;
    uniforms.uSeasonTintAmt.value = cur.tintAmount;
    uniforms.uSeasonSat.value = cur.saturation;
    uniforms.uSeasonBright.value = cur.brightness;
  };

  const step = (dt: number): void => {
    if (p >= 1) return;
    dt = Math.min(0.1, Math.max(0, dt));
    p = Math.min(1, p + dt / duration);
    const e = smooth(p);
    cur.tint.lerpColors(from.tint, to.tint, e);
    cur.tintAmount = lerp(from.tintAmount, to.tintAmount, e);
    cur.saturation = lerp(from.saturation, to.saturation, e);
    cur.brightness = lerp(from.brightness, to.brightness, e);
    push();
  };

  let manual = false;
  let last = nowSeconds();

  const seasons: Seasons = {
    uniforms,
    get season() {
      return targetName;
    },
    materials: patched,

    bind(material) {
      const data = (material.userData ??= {}) as { __scenaSeason?: boolean };
      if (data.__scenaSeason) return seasons;
      data.__scenaSeason = true;

      const prevCompile = material.onBeforeCompile;
      // Capture the base cache key BEFORE overriding, so foliage+season stays a
      // distinct program from foliage+wind and from foliage+wind+season.
      const baseKey = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
      material.onBeforeCompile = function (shader: PatchableShader, renderer: unknown) {
        if (prevCompile) (prevCompile as (s: PatchableShader, r: unknown) => void).call(this, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\n' + SEASON_UNIFORMS)
          .replace('#include <color_fragment>', '#include <color_fragment>\n' + SEASON_FRAG);
      };
      material.customProgramCacheKey = () => baseKey + '|scena-season-v1';
      material.needsUpdate = true;
      patched.push(material);
      return seasons;
    },

    attach(object) {
      let mesh: Mesh | null = object instanceof Mesh ? object : null;
      if (!mesh) {
        object.traverse((o) => {
          if (!mesh && o instanceof Mesh) mesh = o;
        });
      }
      if (mesh) {
        const target = mesh as Mesh;
        const prev = target.onBeforeRender;
        target.onBeforeRender = function (this: Mesh, ...args: unknown[]) {
          if (prev) (prev as (...a: unknown[]) => void).apply(this, args);
          if (!manual) {
            const t = nowSeconds();
            step(t - last);
            last = t;
          }
        } as Mesh['onBeforeRender'];
      }
      return seasons;
    },

    apply(target) {
      const seen = new Set<Material>();
      target.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m && (m.userData as { scenaFoliage?: boolean })?.scenaFoliage && !seen.has(m)) {
            seen.add(m);
            seasons.bind(m);
          }
        }
      });
      seasons.attach(target);
      return seasons;
    },

    set(season, opts = {}) {
      from = toLive({
        tint: cur.tint.getHex(),
        tintAmount: cur.tintAmount,
        saturation: cur.saturation,
        brightness: cur.brightness,
      });
      to = toLive(grades[season] ?? grades.summer);
      p = 0;
      duration = Math.max(0.001, opts.fade ?? 6);
      targetName = season;
      last = nowSeconds();
      return seasons;
    },

    update(dt) {
      manual = true;
      step(dt);
    },
  };

  push();
  return seasons;
}
