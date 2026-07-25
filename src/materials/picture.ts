import { MeshStandardMaterial } from 'three';

/**
 * Pictures — the images that go on walls.
 *
 * This is `createScreenPanel`'s twin, and deliberately so: the same trick of
 * drawing content procedurally in the fragment shader from the panel's own
 * UVs, so a gallery of forty framed pictures fetches nothing, repeats
 * nothing, and costs one material path.
 *
 * The one structural difference matters more than everything else here. A
 * screen writes into **emissive radiance** — it is a light source, and the
 * day/night cycle must not dim it. A picture writes into **base colour**. It
 * has no light of its own; a painting in an unlit room is invisible, and one
 * that keeps glowing at midnight is the single loudest tell that a wall is
 * decorated with screenshots. So this patches `map_fragment`, not
 * `emissivemap_fragment`, and everything downstream — lighting, shadow, the
 * day cycle, fog — applies to it exactly as it does to plaster.
 *
 * ```ts
 * const picture = createPicture(0.6, 0.45, { style: 'landscape', seed: 7 });
 * mesh.material = picture.material;
 * ```
 *
 * Content is not representational in any detail. At the size a picture
 * occupies on screen — a framed photo is a couple of dozen pixels across
 * from the sofa — what reads is **value structure**: where the light is,
 * where the dark mass is, roughly what the subject's silhouette does. Paint
 * that correctly and the eye supplies a landscape. Paint individual leaves
 * and you get mush that costs more.
 */
export type PictureStyle =
  /** Sky, horizon, receding hills. The default wall filler. */
  | 'landscape'
  /** A figure: shoulders, head, hair mass, warm and low-contrast. */
  | 'portrait'
  /** Dark ground, a table edge, lit objects — the old-master still life. */
  | 'stillLife'
  /** Soft bands of colour with blurred edges. */
  | 'abstract'
  /** Hard-edged shapes in a limited palette. */
  | 'geometric'
  /** Desaturated, vignetted, a bright window and a dark subject. */
  | 'photo'
  /** Flat colour field, a heavy band, and blocks where the type goes. */
  | 'poster'
  /** Mostly white with ruled lines of text and a stamp — a printed notice. */
  | 'notice'
  /**
   * Not a picture at all: a pale gradient with a skewed bright patch where a
   * window would land. A real mirror is a second render pass per mirror,
   * which is an absurd price for set dressing, and a metal surface with no
   * environment map renders black. A painted reflection reads correctly at
   * any distance you would actually film a room from.
   */
  | 'mirror';

const STYLE_ID: Record<PictureStyle, number> = {
  landscape: 0,
  portrait: 1,
  stillLife: 2,
  abstract: 3,
  geometric: 4,
  photo: 5,
  mirror: 6,
  poster: 7,
  notice: 8,
};

export const PICTURE_STYLES: PictureStyle[] = [
  'landscape',
  'portrait',
  'stillLife',
  'abstract',
  'geometric',
  'photo',
];

/** Everything `createPicture` can draw, including the non-painting styles. */
export const ALL_PICTURE_STYLES: PictureStyle[] = [
  ...PICTURE_STYLES,
  'mirror',
  'poster',
  'notice',
];

export interface PictureOptions {
  /** What the picture is of. Default 'landscape'. */
  style?: PictureStyle;
  /** Drives every hue, layout and placement choice. Default 1. */
  seed?: number;
  /**
   * Yellowing, darkened varnish and a heavier vignette (0–1). Default 0.25.
   * Push it up for a manor, down for a new-build.
   */
  age?: number;
  /** Overall value. Default 1. Below 1 for a picture in a dim corner. */
  brightness?: number;
  /** Aspect override. Defaults to width / height. */
  aspect?: number;
}

export interface Picture {
  material: MeshStandardMaterial;
  style: PictureStyle;
  width: number;
  height: number;
}

// --- the shader ---------------------------------------------------------
//
// GLSL ES 1.00, same constraints as the screen shader: no `switch`, constant
// loop bounds. Laid out in UV space with x scaled by aspect wherever a shape
// has to stay round.

const PIC_HELPERS = /* glsl */ `
  float picHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float picHash1(float x) { return picHash(vec2(x, 17.13)); }
  // Value noise, for canvas weave and the softening of hard bands.
  float picNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(picHash(i), picHash(i + vec2(1.0, 0.0)), f.x),
               mix(picHash(i + vec2(0.0, 1.0)), picHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float picFbm(vec2 p) {
    return picNoise(p) * 0.6 + picNoise(p * 2.3) * 0.26 + picNoise(p * 5.1) * 0.14;
  }
  // Ellipse coverage, soft-edged. Radii are in UV units on each axis, so a
  // round shape wants r.x divided by the aspect; most shapes here are
  // deliberately elliptical and pass their own.
  float picBlob(vec2 uv, vec2 c, vec2 r, float soft, float aspect) {
    vec2 q = (uv - c) / max(r, vec2(1e-4));
    return 1.0 - smoothstep(1.0 - soft, 1.0 + soft, length(q));
  }
  float picStep(float v, float lo, float hi) {
    return step(lo, v) * step(v, hi);
  }
  float picRect(vec2 uv, vec2 c, vec2 h, float soft) {
    vec2 d = abs(uv - c) - h;
    float dist = max(d.x, d.y);
    return 1.0 - smoothstep(-soft, soft, dist);
  }
  // A head-and-shoulders silhouette, in units of head-heights, positioned at
  // the base of the neck.
  //
  // Worth a helper because the naive version — a disc sitting on a soft blob
  // — is a snowman, and it is a snowman at every size and in every palette.
  // Shoulders have to WIDEN AS THEY FALL; that slope is the single feature
  // that makes a dark shape read as a person.
  float picBust(vec2 uv, vec2 at, float scale, float aspect) {
    vec2 q = (uv - at) / max(scale, 1e-4);
    q.x *= aspect;
    float head = 1.0 - smoothstep(0.94, 1.06, length(vec2(q.x / 0.27, (q.y - 0.36) / 0.38)));
    // Widen fast just under the neck, then stop. A spread that keeps growing
    // all the way down is a pyramid, which is no more a person than the
    // snowman was.
    float spread = 0.11 + 0.80 * smoothstep(0.07, -0.26, q.y);
    float body = (1.0 - smoothstep(spread - 0.03, spread + 0.03, abs(q.x)))
               * smoothstep(0.10, 0.02, q.y);
    return clamp(head + body, 0.0, 1.0);
  }
  // A muted painterly palette from a hue. Deliberately not saturated: full
  // chroma on a wall reads as a poster of a colour swatch, never as paint.
  vec3 picPigment(float h, float sat, float val) {
    vec3 c = 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
    return mix(vec3(dot(c, vec3(0.33))), c, sat) * val;
  }
`;

const PIC_STYLES = /* glsl */ `
  // Sky, horizon, hills going back into haze. The whole thing is value
  // structure: light sky, mid hills, dark foreground.
  vec3 picLandscape(vec2 uv, float seed, float aspect) {
    float h = 0.36 + picHash1(seed) * 0.16;          // horizon height
    float hue = 0.52 + picHash1(seed + 3.0) * 0.12;  // sky blue-ish
    vec3 zenith = picPigment(hue, 0.42, 0.62);
    vec3 haze = picPigment(hue + 0.06, 0.16, 0.88);
    // Sky: darker at the top, pale at the horizon. Never the other way round.
    vec3 col = mix(haze, zenith, smoothstep(h, 1.0, uv.y));
    // Cloud banding, flattened horizontally the way real cloud reads.
    float cloud = picFbm(vec2(uv.x * 3.2 + seed, uv.y * 7.0)) ;
    col = mix(col, haze * 1.06, smoothstep(0.55, 0.85, cloud) * step(h, uv.y) * 0.55);
    // A low sun on some of them.
    float hasSun = step(0.55, picHash1(seed + 9.0));
    vec2 sunAt = vec2(0.24 + picHash1(seed + 11.0) * 0.52, h + 0.10);
    float sun = picBlob(uv, sunAt, vec2(0.035 / aspect, 0.035), 0.6, aspect);
    col += picPigment(0.11, 0.5, 1.0) * sun * hasSun * 0.8;

    // Three ridges. Each is nearer, darker and less hazy than the last —
    // aerial perspective is doing all the work of saying "distance".
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float top = h - fi * 0.055 - 0.01;
      float wob = (picFbm(vec2(uv.x * (1.6 + fi * 1.4) + seed * 0.7 + fi * 5.0, fi)) - 0.5) * (0.05 + fi * 0.035);
      float land = step(uv.y, top + wob);
      float depth = 1.0 - fi / 3.0;
      vec3 hill = mix(picPigment(0.30 + picHash1(seed + fi) * 0.10, 0.30, 0.30 - fi * 0.055), haze, depth * 0.62);
      col = mix(col, hill, land);
    }
    // Foreground: darkest band, slightly warmer — the ground you stand on.
    float fg = step(uv.y, 0.085 + (picFbm(vec2(uv.x * 4.0 + seed, 9.0)) - 0.5) * 0.06);
    col = mix(col, picPigment(0.18, 0.34, 0.16), fg);
    return col;
  }

  // A figure. Warm, low contrast, lit from one side — that is the entire
  // recipe, and it survives being four pixels tall.
  vec3 picPortrait(vec2 uv, float seed, float aspect) {
    float hue = picHash1(seed + 2.0);
    // The value ladder is the whole picture, and it has to be a real ladder:
    // ground ~0.10, clothes ~0.17, hair ~0.08, face ~0.62. Everything sitting
    // inside one narrow band — which is what this did first — collapses into
    // a ring of near-identical greys where a head should be.
    vec3 col = picPigment(0.09 + hue * 0.05, 0.30, 0.10);
    // A lighter wash behind the shoulder, off to one side. Centred behind the
    // head it just outlines the hair and the figure reads as a doughnut.
    float lit = 0.5 + (step(0.5, picHash1(seed + 17.0)) - 0.5) * 0.44;
    col = mix(col, picPigment(0.10, 0.24, 0.26),
      picBlob(uv, vec2(lit, 0.52), vec2(0.40, 0.42), 1.0, aspect) * 0.85);
    // The figure, as one silhouette: neck, sloping shoulders, head. Muted,
    // so the sitter's coat does not out-shout their face.
    vec3 cloth = picPigment(hue, 0.22, 0.17 + picHash1(seed + 5.0) * 0.07);
    col = mix(col, cloth, picBust(uv, vec2(0.5, 0.44), 0.40, aspect));
    // Hair, as a CAP: the same ellipse pushed up, so it is thick over the
    // crown and gone by the chin. Concentric with the head it comes out as
    // an even ring, which is a helmet.
    col = mix(col, picPigment(0.07, 0.40, 0.06 + picHash1(seed + 7.0) * 0.07),
      picBlob(uv, vec2(0.5, 0.625), vec2(0.125, 0.150), 0.12, aspect));
    // Face: much lighter, modelled from one side.
    float side = smoothstep(0.60, 0.40, uv.x);
    float head = picBlob(uv, vec2(0.5, 0.578), vec2(0.098, 0.132), 0.10, aspect);
    vec3 skin = picPigment(0.055, 0.30, 0.50 + picHash1(seed + 13.0) * 0.22)
      * (0.62 + side * 0.48);
    col = mix(col, skin, head);
    // A collar: the light note that stops it being a head balanced on a blob.
    col = mix(col, skin * 0.9, picRect(uv, vec2(0.5, 0.425), vec2(0.085, 0.018), 0.022) * 0.8);
    return col;
  }

  // Old-master still life: near-black ground, a table edge, three lit objects.
  vec3 picStillLife(vec2 uv, float seed, float aspect) {
    // A proper value ladder: near-black ground, mid table, and objects that
    // are genuinely light where the light hits them. Everything within one
    // narrow band — which is where this started — is a mauve rectangle with
    // suggestions in it.
    vec3 col = picPigment(0.08, 0.30, 0.045);
    // The table: a horizontal edge, everything below it darker still.
    float table = 0.30 + picHash1(seed) * 0.06;
    col = mix(col, picPigment(0.07, 0.34, 0.10), step(uv.y, table));
    col = mix(col, picPigment(0.09, 0.30, 0.26), picRect(uv, vec2(0.5, table), vec2(0.6, 0.006), 0.008));
    // A vessel: tall, with a neck. Two stacked blobs is enough of a silhouette.
    float vx = 0.34 + picHash1(seed + 4.0) * 0.10;
    vec3 pot = picPigment(0.06 + picHash1(seed + 6.0) * 0.08, 0.26, 0.50);
    float belly = picBlob(uv, vec2(vx, table + 0.115), vec2(0.105, 0.115), 0.10, aspect);
    float neck = picRect(uv, vec2(vx, table + 0.235), vec2(0.030, 0.075), 0.012);
    // Lit hard from one side: the falloff across a curved body is what says
    // "round" without a single extra triangle.
    float lit = smoothstep(vx + 0.09, vx - 0.10, uv.x) * 0.82 + 0.24;
    col = mix(col, pot * lit, clamp(belly + neck, 0.0, 1.0));
    // Fruit: two or three, sitting ON the table line, never floating above it.
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float r = 0.042 + picHash1(seed + fi * 3.0 + 21.0) * 0.028;
      float fx = 0.56 + fi * 0.115 + picHash1(seed + fi + 31.0) * 0.04;
      float f = picBlob(uv, vec2(fx, table + r * 0.92), vec2(r / aspect, r), 0.16, aspect);
      vec3 fc = picPigment(0.02 + picHash1(seed + fi * 7.0) * 0.16, 0.52, 0.62);
      float fl = smoothstep(fx + r * 1.1, fx - r, uv.x) * 0.78 + 0.26;
      col = mix(col, fc * fl, f);
    }
    return col;
  }

  // Soft fields of colour. Blurred edges, related hues, one field dominant.
  vec3 picAbstract(vec2 uv, float seed, float aspect) {
    float hue = picHash1(seed);
    // Two wandering boundaries cutting three fields, with a real spread of
    // value between them. Stacking soft mixes on top of each other — the
    // first attempt — averages everything back to one flat wash.
    float wob = (picFbm(vec2(uv.x * 2.2 + seed, 3.0)) - 0.5) * 0.07;
    float y = uv.y + wob;
    float b1 = 0.28 + picHash1(seed + 1.0) * 0.14;
    float b2 = b1 + 0.22 + picHash1(seed + 2.0) * 0.18;
    vec3 col = picPigment(hue, 0.36, 0.18 + picHash1(seed + 5.0) * 0.09);
    col = mix(col, picPigment(hue + 0.11, 0.44, 0.44 + picHash1(seed + 6.0) * 0.14),
      smoothstep(b1 - 0.04, b1 + 0.04, y));
    col = mix(col, picPigment(hue + 0.24, 0.26, 0.68 + picHash1(seed + 7.0) * 0.10),
      smoothstep(b2 - 0.04, b2 + 0.04, y));
    // A vertical cut on some of them. Without it, three horizontal fields
    // with a light top is indistinguishable from the landscape.
    float split = 0.32 + picHash1(seed + 8.0) * 0.36;
    col = mix(col, col * 0.66 + picPigment(hue + 0.5, 0.5, 0.34) * 0.34,
      step(0.5, picHash1(seed + 9.0)) * smoothstep(split - 0.012, split + 0.012, uv.x));
    // Enough tooth that it reads as a surface and not a gradient fill.
    col *= 0.94 + picFbm(vec2(uv.x * 40.0 * aspect, uv.y * 40.0)) * 0.12;
    return col;
  }

  // Hard-edged shapes, limited palette, one accent. The modern-office print.
  vec3 picGeometric(vec2 uv, float seed, float aspect) {
    float hue = picHash1(seed + 8.0);
    vec3 col = vec3(0.78, 0.76, 0.72) * (0.82 + picHash1(seed) * 0.2);
    // A ground rectangle, then two shapes overlapping it.
    col = mix(col, picPigment(hue, 0.42, 0.44),
      picRect(uv, vec2(0.5, 0.5), vec2(0.40, 0.40), 0.004));
    float cx = 0.36 + picHash1(seed + 2.0) * 0.2;
    float cy = 0.40 + picHash1(seed + 4.0) * 0.2;
    col = mix(col, picPigment(hue + 0.42, 0.55, 0.52),
      picBlob(uv, vec2(cx, cy), vec2(0.20 / aspect, 0.20), 0.02, aspect));
    // A bar, either upright or lying down, in the accent.
    float upright = step(0.5, picHash1(seed + 6.0));
    vec2 h = mix(vec2(0.30, 0.045), vec2(0.045, 0.30), upright);
    col = mix(col, picPigment(hue + 0.14, 0.62, 0.60),
      picRect(uv, vec2(0.5 + picHash1(seed + 10.0) * 0.16, 0.5), h, 0.004));
    return col;
  }

  // A photograph: near-monochrome, cool, a bright window and a dark subject.
  // Colour is what separates this from the paintings — a photo that is as
  // chromatic as an oil reads as an oil.
  vec3 picPhoto(vec2 uv, float seed, float aspect) {
    float hue = 0.55 + picHash1(seed) * 0.1;
    // Near-neutral. Colour is what separates a photograph from an oil, so
    // almost all the chroma comes out of this one.
    vec3 col = picPigment(hue, 0.09, 0.50 + picHash1(seed + 1.0) * 0.14);
    // A bright region behind them: a window, a doorway, the sky.
    vec2 at = vec2(0.28 + picHash1(seed + 3.0) * 0.44, 0.68);
    col = mix(col, vec3(0.88, 0.89, 0.90), picBlob(uv, at, vec2(0.26, 0.28), 0.8, aspect) * 0.75);
    // Two or three people, different sizes, none of them centred. One dark
    // mass in the middle of the frame is not a photograph of anything.
    float extra = step(0.5, picHash1(seed + 40.0));
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float here = step(fi, 1.0 + extra);
      float x = 0.26 + fi * 0.23 + picHash1(seed + fi * 5.0 + 11.0) * 0.09;
      float s = 0.30 + picHash1(seed + fi * 3.0 + 23.0) * 0.09;
      col = mix(col, picPigment(hue - 0.05 + fi * 0.03, 0.20, 0.19 + fi * 0.045),
        picBust(uv, vec2(x, 0.20), s, aspect) * here);
    }
    // Ground.
    col = mix(col, picPigment(hue, 0.07, 0.30), 1.0 - smoothstep(0.06, 0.13, uv.y));
    // Grain, which is the other half of "photograph".
    col *= 0.93 + picHash(uv * vec2(520.0 * aspect, 520.0) + seed) * 0.14;
    return col;
  }

  // Type, as TYPE — bands at the density a line of text has when you see it
  // across a room, never glyph-shaped. There is no font here, and fake
  // letterforms are the single most recognisable tell in a procedural scene:
  // at any distance where you could tell they were letters, you can tell
  // they are wrong.
  float picType(vec2 uv, float top, float lines, float indent, float seed, float weight) {
    float row = floor((top - uv.y) * lines);
    if (row < 0.0 || row > lines - 1.0) return 0.0;
    float band = fract((top - uv.y) * lines);
    // Ink occupies the middle of each line's box, never the whole of it.
    float ink = picStep(band, 0.28, 0.28 + weight);
    // Ragged right edge: every line is a different length.
    float len = 0.30 + picHash(vec2(row, seed)) * 0.62;
    return ink * step(indent, uv.x) * step(uv.x, indent + len);
  }

  // A poster: one strong colour field, a heavy band, and type blocks.
  vec3 picPoster(vec2 uv, float seed, float aspect) {
    float hue = picHash1(seed);
    vec3 ground = picPigment(hue, 0.45, 0.30 + picHash1(seed + 1.0) * 0.34);
    vec3 col = ground;
    // A band across, top or bottom, in a contrasting value.
    float at = picHash1(seed + 3.0) > 0.5 ? 0.74 : 0.16;
    vec3 bandCol = picPigment(hue + 0.45, 0.55, 0.72);
    col = mix(col, bandCol, picRect(uv, vec2(0.5, at), vec2(0.6, 0.10), 0.004));
    // A big shape: the poster's image.
    col = mix(col, picPigment(hue + 0.18, 0.5, 0.20),
      picBlob(uv, vec2(0.5, 0.5), vec2(0.26 / aspect, 0.26), 0.03, aspect));
    // The headline: two heavy short bars, not letters.
    vec3 ink = picPigment(hue + 0.5, 0.2, 0.12);
    col = mix(col, ink, picRect(uv, vec2(0.32, at), vec2(0.16, 0.028), 0.003));
    col = mix(col, ink, picRect(uv, vec2(0.26, at - 0.052), vec2(0.10, 0.016), 0.003));
    // Small print at the foot.
    col = mix(col, ink, picType(uv, at > 0.5 ? 0.14 : 0.92, 4.0, 0.16, seed, 0.34) * 0.75);
    return col;
  }

  // A printed notice: white paper, a rule, a block of text, a stamp.
  vec3 picNotice(vec2 uv, float seed, float aspect) {
    vec3 col = vec3(0.80, 0.79, 0.75) * (0.94 + picHash1(seed) * 0.1);
    vec3 ink = vec3(0.16, 0.15, 0.14);
    // Heading, then a rule under it.
    col = mix(col, ink, picRect(uv, vec2(0.5, 0.86), vec2(0.26, 0.026), 0.003));
    col = mix(col, ink * 1.6, picRect(uv, vec2(0.5, 0.80), vec2(0.36, 0.004), 0.002));
    // Body copy: ruled lines with a ragged right edge.
    col = mix(col, ink, picType(uv, 0.74, 9.0, 0.14, seed, 0.3) * 0.85);
    // A stamp or seal, off to one corner and never square to the page.
    float d = length((uv - vec2(0.74, 0.20)) * vec2(aspect, 1.0));
    vec3 stamp = picPigment(0.98, 0.55, 0.42);
    col = mix(col, stamp, (1.0 - smoothstep(0.085, 0.095, d)) * 0.5);
    col = mix(col, stamp, (1.0 - smoothstep(0.062, 0.07, d)) * 0.25);
    return col;
  }

  // A mirror, painted. Pale, cool, a skewed bright patch where a window
  // lands, and a darker lower half because the floor is darker than the sky.
  vec3 picMirror(vec2 uv, float seed, float aspect) {
    vec3 col = mix(vec3(0.30, 0.33, 0.36), vec3(0.56, 0.60, 0.64), uv.y);
    // The window: a parallelogram, because a mirror is never square-on to one.
    float skew = (uv.y - 0.5) * 0.34;
    float win = picRect(vec2(uv.x + skew, uv.y), vec2(0.34, 0.66), vec2(0.13, 0.17), 0.02);
    col = mix(col, vec3(0.90, 0.92, 0.95), win * 0.85);
    // A soft second bounce, and a dark mass low down (furniture, the floor).
    col = mix(col, vec3(0.72, 0.75, 0.79), picBlob(uv, vec2(0.72, 0.52), vec2(0.22, 0.30), 0.9, aspect) * 0.35);
    col = mix(col, vec3(0.19, 0.21, 0.24), smoothstep(0.30, 0.02, uv.y) * 0.7);
    // Glass is not perfectly clean.
    col *= 0.97 + picFbm(vec2(uv.x * 6.0 * aspect, uv.y * 6.0) + seed) * 0.06;
    return col;
  }
`;

const PIC_FRAG = /* glsl */ `
  {
    vec2 picUv = vUv;
    vec3 picCol = vec3(0.5);
    if (uPicStyle == 0) {
      picCol = picLandscape(picUv, uPicSeed, uPicAspect);
    } else if (uPicStyle == 1) {
      picCol = picPortrait(picUv, uPicSeed, uPicAspect);
    } else if (uPicStyle == 2) {
      picCol = picStillLife(picUv, uPicSeed, uPicAspect);
    } else if (uPicStyle == 3) {
      picCol = picAbstract(picUv, uPicSeed, uPicAspect);
    } else if (uPicStyle == 4) {
      picCol = picGeometric(picUv, uPicSeed, uPicAspect);
    } else if (uPicStyle == 5) {
      picCol = picPhoto(picUv, uPicSeed, uPicAspect);
    } else if (uPicStyle == 6) {
      picCol = picMirror(picUv, uPicSeed, uPicAspect);
    } else if (uPicStyle == 7) {
      picCol = picPoster(picUv, uPicSeed, uPicAspect);
    } else if (uPicStyle == 8) {
      picCol = picNotice(picUv, uPicSeed, uPicAspect);
    }

    if (uPicStyle < 6) {
      // Canvas weave: a fine cross-hatch in VALUE only. Visible close, and at
      // distance it just stops the picture looking like flat vector art.
      float weave = sin(picUv.x * 620.0 * uPicAspect) * sin(picUv.y * 620.0);
      picCol *= 1.0 + weave * 0.035;
      // Varnish: old pictures go yellow and go dark at the edges, and both
      // happen together. Applied after the weave so the darkening reads as
      // depth rather than as a painted border.
      picCol = mix(picCol, picCol * vec3(1.18, 1.02, 0.72), uPicAge * 0.65);
      float r = length((picUv - 0.5) * vec2(uPicAspect, 1.0) / max(uPicAspect, 1.0));
      picCol *= 1.0 - smoothstep(0.30, 0.78, r) * (0.16 + uPicAge * 0.34);
    }

    diffuseColor.rgb = picCol * uPicBright;
  }
`;

/**
 * Build a picture's material. The caller owns the mesh; the picture only
 * needs to know its own proportions so shapes inside it stay round.
 *
 * Whatever the style, the output stays inside a painterly value range —
 * nothing goes to white and nothing to black. A wall picture that clips at
 * either end stops looking like a made object and starts looking like a hole
 * in the wall.
 */
export function createPicture(
  width: number,
  height: number,
  options: PictureOptions = {}
): Picture {
  const style = options.style ?? 'landscape';
  const seed = options.seed ?? 1;
  const aspect = options.aspect ?? width / Math.max(height, 1e-4);
  const age = options.age ?? 0.25;
  const brightness = options.brightness ?? 1;

  const uniforms = {
    uPicStyle: { value: STYLE_ID[style] },
    uPicSeed: { value: seed },
    uPicAspect: { value: aspect },
    uPicAge: { value: age },
    uPicBright: { value: brightness },
  };

  const material = new MeshStandardMaterial({
    color: 0xffffff,
    // Oil on canvas is matte; a mirror is not. This is the only PBR
    // difference between the two, and it is the one that sells it.
    // Paper is flatter than canvas and glass is not matte at all.
    roughness: style === 'mirror' ? 0.12 : style === 'notice' || style === 'poster' ? 0.94 : 0.86,
    metalness: style === 'mirror' ? 0.55 : 0,
  });
  // Force vUv: with no map three drops the varying and the layout has
  // nothing to lay out against.
  material.defines = { ...(material.defines ?? {}), USE_UV: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform int uPicStyle;
         uniform float uPicSeed;
         uniform float uPicAspect;
         uniform float uPicAge;
         uniform float uPicBright;
         ${PIC_HELPERS}
         ${PIC_STYLES}
         void main() {`
      )
      // Base colour, NOT emissive. This one line is the whole difference
      // between a painting and a television.
      .replace('#include <map_fragment>', `#include <map_fragment>\n${PIC_FRAG}`);
  };
  material.customProgramCacheKey = () => 'scenaPicture';

  return { material, style, width, height };
}

/** Pick a picture style from a seed, excluding 'mirror'. */
export function pickPictureStyle(seed: number): PictureStyle {
  const s = Math.abs(Math.floor(seed * 2654435761)) % PICTURE_STYLES.length;
  return PICTURE_STYLES[s];
}
