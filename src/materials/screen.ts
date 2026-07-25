import { Color, MeshStandardMaterial, Object3D } from 'three';

/**
 * Screens — the lit rectangles that make a scene read as modern.
 *
 * A screen is not a texture here. It is drawn procedurally in the fragment
 * shader from the panel's own UVs, the same way `createSurface` draws stone
 * and brick: nothing is fetched, every panel is unique, and a phone and a
 * television share one material path.
 *
 * The content is deliberately **not text**. At the size a screen occupies on
 * a monitor — a phone is a few pixels across at conversational distance —
 * you need the *impression* of an interface, not readable content: rows,
 * tiles, a scrubbing bar, a route line. Real glyphs would cost thousands of
 * triangles for something illegible, and look worse on the rare occasion the
 * camera got close enough to read them.
 *
 * ```ts
 * const panel = createScreenPanel(0.6, 0.34, { mode: 'feed' });
 * mesh.material = panel.material;
 * game.onUpdate((t) => panel.update(t.delta));
 * ```
 *
 * The content is written into **emissive radiance** rather than base colour,
 * so a screen lights up in a dark room and the day/night cycle cannot dim it
 * — a monitor at midnight is exactly as bright as one at noon, which is the
 * whole reason anyone notices screens at night.
 */
export type ScreenMode =
  | 'off'
  | 'standby'
  | 'home'
  | 'feed'
  | 'video'
  | 'map'
  | 'chart'
  | 'call'
  | 'keypad';

/** Mode → shader branch. Kept explicit so the GLSL never guesses. */
const MODE_ID: Record<ScreenMode, number> = {
  off: 0,
  standby: 1,
  home: 2,
  feed: 3,
  video: 4,
  map: 5,
  chart: 6,
  call: 7,
  keypad: 8,
};

export interface ScreenOptions {
  /** What the screen is showing. Default 'home'. */
  mode?: ScreenMode;
  /** Varies icon colours, chart bars, the cut rhythm of video. Default 1. */
  seed?: number;
  /** UI accent colour (the highlighted bar, the answer pill). */
  accent?: number;
  /** Overall emissive gain. Default 1. Dim a phone, brighten a TV wall. */
  brightness?: number;
  /** Rows scrolled per second in 'feed'. Default 0 (a still screen). */
  scrollRate?: number;
}

/**
 * A lit panel. Structurally what ANIMA's `Viewable` wants (`surface`,
 * `width`, `height`) so a character can look at one, and what GAMA's
 * `DisplayTarget` wants (`setMode`) so a device can drive one — with no
 * library importing another.
 */
export interface ScreenPanel {
  /** The lit face. Set by the prop that owns it; the gaze target. */
  surface: Object3D;
  /** Panel size in metres. */
  width: number;
  height: number;
  material: MeshStandardMaterial;
  readonly mode: ScreenMode;
  setMode(mode: ScreenMode): void;
  /**
   * What this screen is throwing into the room right now — colour and
   * strength, updated every frame. A light that copies these flickers in
   * time with the content, which is the difference between a television and
   * a blue lamp.
   */
  readonly glow: { color: Color; intensity: number };
  update(dt: number): void;
}

// --- the shader ---------------------------------------------------------
//
// GLSL ES 1.00 (three patches the standard chunks, which are GLSL1): no
// `switch`, constant loop bounds only. Layout is done in UV space 0..1 with
// x converted to y-units wherever roundness or squareness matters, so a
// 16:9 panel's icons are square and its corners are round.

const SCREEN_HELPERS = /* glsl */ `
  float scrHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  vec3 scrHue(float h) {
    return 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
  }
  float scrBand(float v, float lo, float hi) {
    return step(lo, v) * step(v, hi);
  }
  // Rounded rect coverage. c/h in UV space, r in y-units.
  float scrRound(vec2 uv, vec2 c, vec2 h, float r, float aspect) {
    vec2 q = uv - c;
    q.x *= aspect;
    vec2 hh = vec2(h.x * aspect, h.y);
    vec2 d = abs(q) - hh + r;
    float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
    return 1.0 - smoothstep(0.0, 0.006, dist);
  }
  float scrSeg(vec2 p, vec2 a, vec2 b, float aspect) {
    vec2 pa = p - a; vec2 ba = b - a;
    pa.x *= aspect; ba.x *= aspect;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
    return length(pa - ba * h);
  }
`;

const SCREEN_MODES = /* glsl */ `
  // A phone/desktop home screen: status strip, a grid of app tiles, a dock.
  vec3 scrHome(vec2 uv, float t, float seed, float aspect, vec3 accent) {
    vec3 col = mix(vec3(0.03, 0.05, 0.11), vec3(0.07, 0.06, 0.15), uv.y);
    // Status strip: a clock block left, two indicator pips right.
    float bar = scrBand(uv.y, 0.945, 0.972);
    col += vec3(0.55) * bar * (scrBand(uv.x, 0.06, 0.16) + scrBand(uv.x, 0.82, 0.94));
    // 4 x 5 tile grid.
    vec2 g = vec2(uv.x * 4.0, (uv.y - 0.17) / 0.155);
    vec2 cell = floor(g);
    if (uv.y > 0.17 && uv.y < 0.92) {
      float id = scrHash(cell + seed);
      float tile = scrRound(fract(g) - 0.5, vec2(0.0), vec2(0.30, 0.30), 0.09, aspect / 4.0 * 0.155 * 4.0);
      col += scrHue(id) * tile * 0.85;
      // A notification pip on one tile in six.
      col += vec3(1.0, 0.25, 0.2) * step(0.84, id) * scrRound(fract(g) - vec2(0.78, 0.78), vec2(0.0), vec2(0.07, 0.07), 0.07, 1.0);
    }
    // Dock: a translucent slab holding four tiles.
    float dock = scrRound(uv, vec2(0.5, 0.085), vec2(0.44, 0.062), 0.03, aspect);
    col += vec3(0.10, 0.12, 0.20) * dock;
    vec2 dg = vec2(uv.x * 4.0, 0.0);
    if (uv.y > 0.035 && uv.y < 0.135) {
      float did = scrHash(vec2(floor(dg.x), 9.0) + seed);
      col += scrHue(did) * scrRound(vec2(fract(dg.x), uv.y) - vec2(0.5, 0.085), vec2(0.0), vec2(0.16, 0.036), 0.02, aspect / 4.0) * 0.9;
    }
    return col + accent * 0.04;
  }

  // The scrolling list everyone actually looks at: thumbnail, two text bars.
  vec3 scrFeed(vec2 uv, float scroll, float seed, float aspect, vec3 accent) {
    vec3 col = vec3(0.02, 0.025, 0.045);
    float rowH = 0.235;
    float fy = (uv.y + scroll) / rowH;
    float row = floor(fy);
    float ry = fract(fy);
    float id = scrHash(vec2(row, seed));
    if (uv.y < 0.93) {
      // Card body.
      col += vec3(0.055, 0.065, 0.10) * scrRound(vec2(uv.x, ry), vec2(0.5, 0.5), vec2(0.455, 0.40), 0.04, aspect * rowH);
      // Thumbnail block, hue per row.
      col += scrHue(id) * 0.75 * scrRound(vec2(uv.x, ry), vec2(0.16, 0.5), vec2(0.09, 0.30), 0.03, aspect * rowH);
      // Two text bars: a long title and a short byline.
      float w = 0.24 + id * 0.26;
      col += vec3(0.62) * scrBand(ry, 0.55, 0.66) * scrBand(uv.x, 0.30, 0.30 + w);
      col += vec3(0.30) * scrBand(ry, 0.36, 0.45) * scrBand(uv.x, 0.30, 0.30 + w * 0.55);
      // Every fourth card carries the accent (a "sponsored" tint).
      col += accent * 0.5 * step(0.88, id) * scrRound(vec2(uv.x, ry), vec2(0.86, 0.5), vec2(0.05, 0.16), 0.02, aspect * rowH);
    }
    // Fixed header above the scroll.
    col += vec3(0.09, 0.10, 0.16) * scrBand(uv.y, 0.93, 1.0);
    col += accent * 0.8 * scrBand(uv.y, 0.955, 0.978) * scrBand(uv.x, 0.06, 0.30);
    return col;
  }

  // Video: letterboxed, soft moving fields, colour set by the CPU so the cuts
  // and the light in the room are the same event.
  vec3 scrVideo(vec2 uv, float t, float aspect, vec3 a, vec3 b) {
    float inside = scrBand(uv.y, 0.13, 0.87);
    vec2 p = uv - vec2(0.5);
    p.x *= aspect;
    // Two drifting blobs over a gradient — enough parallax to read as motion.
    float d1 = length(p - vec2(sin(t * 0.7) * 0.28, cos(t * 0.53) * 0.14));
    float d2 = length(p - vec2(cos(t * 0.41) * 0.34, sin(t * 0.9) * 0.10));
    vec3 col = mix(a, b, clamp(uv.y * 1.2 - 0.1, 0.0, 1.0));
    // Broad, overlapping washes rather than two tight spots — a tight
    // falloff puts a single hot dot in the middle of the picture, which
    // reads as a torch pointed at the wall, not as footage.
    col += a * 0.30 * smoothstep(0.80, 0.06, d1);
    col += b * 0.26 * smoothstep(0.68, 0.04, d2);
    // A horizon: cooler above, warmer below. Almost any real frame has one,
    // and without it the picture is a lava lamp.
    col *= mix(vec3(1.06, 1.0, 0.92), vec3(0.72, 0.82, 1.0), smoothstep(0.4, 0.62, uv.y));
    // Scanline-ish texture, very faint: sells "screen" over "painted panel".
    col *= 0.93 + 0.07 * sin(uv.y * 420.0);
    // The shot's own level, so a cut to a dark scene darkens the PICTURE and
    // not merely the lamp in the room. Scaled to sit below clipping: emissive
    // at 1.0 is pure white after tone mapping, which is a lightbox, not a
    // television.
    return col * inside * uScrLevel * 0.58;
  }

  // Navigation: a road grid, an arterial, a route, and you.
  vec3 scrMap(vec2 uv, float t, float seed, float aspect, vec3 accent) {
    vec3 col = vec3(0.055, 0.075, 0.075);
    vec2 p = vec2(uv.x * aspect, uv.y);
    // Minor grid.
    vec2 gg = abs(fract(p * 7.0 + seed * 0.1) - 0.5);
    float roads = (1.0 - smoothstep(0.0, 0.06, gg.x)) + (1.0 - smoothstep(0.0, 0.06, gg.y));
    col += vec3(0.12, 0.13, 0.14) * clamp(roads, 0.0, 1.0);
    // Two arterials.
    col += vec3(0.22, 0.21, 0.18) * (1.0 - smoothstep(0.0, 0.02, abs(uv.y - 0.62)));
    col += vec3(0.22, 0.21, 0.18) * (1.0 - smoothstep(0.0, 0.02, abs(uv.x - 0.38)));
    // The route: three segments in the accent, thick and bright.
    float r = min(
      min(scrSeg(uv, vec2(0.20, 0.16), vec2(0.38, 0.42), aspect),
          scrSeg(uv, vec2(0.38, 0.42), vec2(0.38, 0.62), aspect)),
      scrSeg(uv, vec2(0.38, 0.62), vec2(0.78, 0.80), aspect));
    col += accent * (1.0 - smoothstep(0.008, 0.022, r)) * 1.2;
    // Position dot with a breathing accuracy halo.
    float dot0 = length((uv - vec2(0.20, 0.16)) * vec2(aspect, 1.0));
    col += vec3(0.35, 0.7, 1.0) * (1.0 - smoothstep(0.012, 0.02, dot0));
    col += vec3(0.2, 0.45, 0.8) * (1.0 - smoothstep(0.03, 0.075, dot0)) * (0.25 + 0.15 * sin(t * 2.2));
    return col;
  }

  // A dashboard: gridlines and a bar series, one column called out.
  vec3 scrChart(vec2 uv, float t, float seed, float aspect, vec3 accent) {
    vec3 col = vec3(0.035, 0.04, 0.06);
    col += vec3(0.08) * scrBand(uv.y, 0.92, 1.0);
    // Horizontal gridlines.
    float grid = 1.0 - smoothstep(0.0, 0.004, abs(fract(uv.y * 5.0) - 0.5) * 0.2);
    col += vec3(0.07, 0.08, 0.11) * grid * scrBand(uv.y, 0.12, 0.88);
    // Bars.
    float col0 = floor(uv.x * 9.0);
    float h = 0.16 + 0.62 * scrHash(vec2(col0, seed));
    float bar = scrBand(fract(uv.x * 9.0), 0.18, 0.82) * scrBand(uv.y, 0.12, 0.12 + h);
    float hot = step(6.0, col0) * step(col0, 6.0);
    col += mix(vec3(0.25, 0.45, 0.75), accent, hot) * bar;
    // A moving read-head, because dashboards are never still.
    col += accent * 0.5 * (1.0 - smoothstep(0.0, 0.006, abs(uv.x - fract(t * 0.13))));
    return col;
  }

  // An incoming call: avatar, name plate, decline and answer.
  vec3 scrCall(vec2 uv, float t, float seed, float aspect, vec3 accent) {
    vec3 col = vec3(0.04, 0.05, 0.09);
    float d = length((uv - vec2(0.5, 0.66)) * vec2(aspect, 1.0));
    col += scrHue(scrHash(vec2(seed, 3.0))) * 0.8 * (1.0 - smoothstep(0.15, 0.16, d));
    // Ring pulse radiating off the avatar.
    float pulse = fract(t * 0.7);
    col += accent * 0.35 * (1.0 - smoothstep(0.006, 0.02, abs(d - 0.16 - pulse * 0.16))) * (1.0 - pulse);
    // Name plate.
    col += vec3(0.55) * scrBand(uv.y, 0.40, 0.435) * scrBand(uv.x, 0.30, 0.70);
    col += vec3(0.25) * scrBand(uv.y, 0.34, 0.365) * scrBand(uv.x, 0.38, 0.62);
    // Decline / answer.
    col += vec3(0.85, 0.15, 0.15) * scrRound(uv, vec2(0.30, 0.15), vec2(0.10, 0.055), 0.05, aspect);
    col += vec3(0.15, 0.80, 0.35) * scrRound(uv, vec2(0.70, 0.15), vec2(0.10, 0.055), 0.05, aspect)
           * (0.75 + 0.25 * sin(t * 6.0));
    return col;
  }

  // A PIN pad — for the terminals, door locks and ATMs this sets up.
  vec3 scrKeypad(vec2 uv, float t, float seed, float aspect, vec3 accent) {
    vec3 col = vec3(0.03, 0.04, 0.05);
    // Entry strip with masked digits.
    col += vec3(0.09, 0.11, 0.13) * scrRound(uv, vec2(0.5, 0.87), vec2(0.40, 0.06), 0.02, aspect);
    float typed = floor(mod(t * 0.8, 5.0));
    float slot = floor((uv.x - 0.34) * 12.5);
    float dotm = scrRound(vec2(fract((uv.x - 0.34) * 12.5), uv.y), vec2(0.5, 0.87), vec2(0.16, 0.016), 0.016, aspect / 12.5);
    col += accent * dotm * step(0.0, slot) * step(slot, typed - 1.0) * scrBand(uv.x, 0.34, 0.66);
    // 3 x 4 keys.
    vec2 k = vec2((uv.x - 0.17) / 0.22, (uv.y - 0.06) / 0.185);
    if (uv.x > 0.17 && uv.x < 0.83 && uv.y > 0.06 && uv.y < 0.80) {
      vec2 kc = floor(k);
      float lit = step(0.5, scrHash(vec2(kc.x + kc.y * 3.0, floor(t * 1.6) + seed)));
      float key = scrRound(fract(k) - 0.5, vec2(0.0), vec2(0.36, 0.34), 0.06, aspect * 0.22 / 0.185);
      col += mix(vec3(0.14, 0.16, 0.19), accent * 0.8, lit * 0.35) * key;
    }
    return col;
  }
`;

const SCREEN_FRAG = /* glsl */ `
  {
    vec2 scrUv = vUv;
    vec3 scrCol = vec3(0.0);
    if (uScrMode == 1) {
      // Standby: one breathing pip, low in the corner. Everything else dark.
      float d = length((scrUv - vec2(0.93, 0.07)) * vec2(uScrAspect, 1.0));
      scrCol = uScrAccent * (1.0 - smoothstep(0.008, 0.014, d)) * (0.35 + 0.3 * sin(uScrTime * 1.6));
    } else if (uScrMode == 2) {
      scrCol = scrHome(scrUv, uScrTime, uScrSeed, uScrAspect, uScrAccent);
    } else if (uScrMode == 3) {
      scrCol = scrFeed(scrUv, uScrScroll, uScrSeed, uScrAspect, uScrAccent);
    } else if (uScrMode == 4) {
      scrCol = scrVideo(scrUv, uScrTime, uScrAspect, uScrShotA, uScrShotB);
    } else if (uScrMode == 5) {
      scrCol = scrMap(scrUv, uScrTime, uScrSeed, uScrAspect, uScrAccent);
    } else if (uScrMode == 6) {
      scrCol = scrChart(scrUv, uScrTime, uScrSeed, uScrAspect, uScrAccent);
    } else if (uScrMode == 7) {
      scrCol = scrCall(scrUv, uScrTime, uScrSeed, uScrAspect, uScrAccent);
    } else if (uScrMode == 8) {
      scrCol = scrKeypad(scrUv, uScrTime, uScrSeed, uScrAspect, uScrAccent);
    }
    // Written into radiance directly, NOT material.emissive, so the day/night
    // cycle's emissiveIntensity scaling cannot dim a screen. A monitor at
    // midnight is as bright as one at noon — that is the point of a screen.
    totalEmissiveRadiance += scrCol * uScrBright;
  }
`;

// --- the CPU half ------------------------------------------------------

/** Per-mode resting glow: what the panel throws into the room. */
const MODE_GLOW: Record<ScreenMode, { color: number; intensity: number }> = {
  off: { color: 0x000000, intensity: 0 },
  standby: { color: 0x33ff88, intensity: 0.03 },
  home: { color: 0x8fa6ff, intensity: 0.55 },
  feed: { color: 0xcfd8ff, intensity: 0.7 },
  video: { color: 0xffffff, intensity: 1.0 }, // overridden per shot
  map: { color: 0x7fd0c0, intensity: 0.5 },
  chart: { color: 0x6fa0e0, intensity: 0.45 },
  call: { color: 0x9fd8ff, intensity: 0.65 },
  keypad: { color: 0x7fc0d8, intensity: 0.35 },
};

/**
 * A shot list: the cuts a "playing" screen runs through. Durations vary
 * because real edits are not metronomic — a fixed cut length reads as a
 * strobe, and the room lighting gives it away long before the picture does.
 */
interface Shot {
  at: number;
  a: Color;
  b: Color;
  level: number;
}

function buildShots(seed: number, count = 48): Shot[] {
  let s = (seed * 2654435761) >>> 0;
  const rand = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shots: Shot[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    // Most cuts are short; a few hold. Squaring biases toward the short end.
    const hold = 0.55 + Math.pow(rand(), 2) * 3.4;
    const hue = rand();
    // Mostly desaturated. Real footage is skin, sky, concrete and cloth; a
    // run of fully saturated hues lights the room like a nightclub. Squaring
    // keeps most shots muted and lets the occasional vivid one through.
    const sat = 0.1 + Math.pow(rand(), 2) * 0.5;
    const warm = new Color().setHSL(hue, sat, 0.52);
    const cool = new Color().setHSL((hue + 0.1 + rand() * 0.16) % 1, sat * 0.8, 0.3);
    shots.push({ at, a: warm, b: cool, level: 0.45 + rand() * 0.85 });
    at += hold;
  }
  return shots;
}

export interface ScreenPanelOptions extends ScreenOptions {
  /** Aspect override. Defaults to width / height. */
  aspect?: number;
}

/**
 * Build a screen's material and its live state. Callers own the mesh — the
 * panel only needs to know how big it is so its UI lays out square.
 */
export function createScreenPanel(
  width: number,
  height: number,
  options: ScreenPanelOptions = {}
): ScreenPanel {
  const seed = options.seed ?? 1;
  const aspect = options.aspect ?? width / Math.max(height, 1e-4);
  const accent = new Color(options.accent ?? 0x4d9fff);
  const brightness = options.brightness ?? 1;
  const scrollRate = options.scrollRate ?? 0;
  let mode: ScreenMode = options.mode ?? 'home';

  const uniforms = {
    uScrMode: { value: MODE_ID[mode] },
    uScrTime: { value: 0 },
    uScrSeed: { value: seed },
    uScrAspect: { value: aspect },
    uScrAccent: { value: accent.clone() },
    uScrBright: { value: brightness },
    uScrScroll: { value: 0 },
    uScrShotA: { value: new Color(0.6, 0.6, 0.6) },
    uScrShotB: { value: new Color(0.2, 0.2, 0.3) },
    uScrLevel: { value: 1 },
  };

  // A powered-off screen is not black — it is a dark mirror. Low roughness
  // over a near-black base gives the reflection that reads as glass.
  const material = new MeshStandardMaterial({
    color: 0x080a0e,
    roughness: 0.18,
    metalness: 0.35,
  });
  // Force vUv: without a map three omits the varying, and the whole UI is
  // laid out in UV space.
  material.defines = { ...(material.defines ?? {}), USE_UV: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform int uScrMode;
         uniform float uScrTime;
         uniform float uScrSeed;
         uniform float uScrAspect;
         uniform vec3 uScrAccent;
         uniform float uScrBright;
         uniform float uScrScroll;
         uniform vec3 uScrShotA;
         uniform vec3 uScrShotB;
         uniform float uScrLevel;
         ${SCREEN_HELPERS}
         ${SCREEN_MODES}
         void main() {`
      )
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${SCREEN_FRAG}`);
  };
  // Distinct cache key per mode set, so two panels showing different things
  // do not share a compiled program keyed only on material properties.
  material.customProgramCacheKey = () => 'scenaScreen';

  const shots = buildShots(seed);
  const loop = shots[shots.length - 1].at;
  const glow = { color: new Color(0, 0, 0), intensity: 0 };
  let time = 0;
  let scroll = 0;

  const applyGlow = (): void => {
    if (mode === 'video') {
      // Find the current shot. Cheap linear scan over a small list, and it
      // must be the SAME shot the shader is drawing — which it is, because
      // the CPU pushes the shot colours in as uniforms rather than the
      // shader picking its own. Light and picture cannot drift apart.
      const t = time % loop;
      let i = 0;
      while (i + 1 < shots.length && shots[i + 1].at <= t) i++;
      const shot = shots[i];
      uniforms.uScrShotA.value.copy(shot.a);
      uniforms.uScrShotB.value.copy(shot.b);
      // Within a shot the level drifts a little (the camera moves, the
      // picture breathes); at the cut it steps. That step is the flicker.
      const into = t - shot.at;
      const drift = 1 + 0.12 * Math.sin(into * 2.3 + shot.level * 6.0);
      uniforms.uScrLevel.value = shot.level * drift;
      glow.color.copy(shot.a).lerp(shot.b, 0.35);
      glow.intensity = shot.level * drift * brightness;
    } else {
      uniforms.uScrLevel.value = 1;
      const preset = MODE_GLOW[mode];
      glow.color.set(preset.color);
      glow.intensity = preset.intensity * brightness;
    }
  };
  applyGlow();

  return {
    surface: new Object3D(), // replaced by the owning prop
    width,
    height,
    material,
    get mode() {
      return mode;
    },
    setMode(next: ScreenMode) {
      if (next === mode) return;
      mode = next;
      uniforms.uScrMode.value = MODE_ID[next];
      applyGlow();
    },
    glow,
    update(dt: number) {
      time += dt;
      uniforms.uScrTime.value = time;
      if (mode === 'feed' && scrollRate !== 0) {
        scroll += dt * scrollRate * 0.235;
        uniforms.uScrScroll.value = scroll;
      }
      applyGlow();
    },
  };
}
