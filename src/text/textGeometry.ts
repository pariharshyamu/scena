import { BufferAttribute, BufferGeometry } from 'three';
import { CAP, FONT, MISSING, type Glyph } from './font';

export type TextAlign = 'left' | 'center' | 'right';

export interface TextOptions {
  /** Cap height in metres. Default 0.5. */
  size?: number;
  /** Stroke width as a fraction of cap height. Default 0.22 (bold, signage-weight). */
  weight?: number;
  /** Relief depth in metres (how far the letters stand off the board). Default size*0.12. */
  depth?: number;
  /** Extra gap between letters, in grid units. Default 0.6. */
  tracking?: number;
  /** Horizontal anchor. Default 'center'. */
  align?: TextAlign;
  /** Vertical placement: 'baseline' puts y=0 at the baseline; 'center' centres the cap band on y=0. Default 'center'. */
  baseline?: 'baseline' | 'center';
}

export interface TextGeometry {
  geometry: BufferGeometry;
  /** Total advance width in metres. */
  width: number;
  /** Cap height in metres. */
  height: number;
}

function glyphFor(ch: string): Glyph {
  return FONT[ch] ?? FONT[ch.toUpperCase()] ?? MISSING;
}

/** Total pen advance of a string in grid units (before scaling), for measuring. */
function advanceUnits(text: string, tracking: number): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w += glyphFor(text[i]).advance + (i < text.length - 1 ? tracking : 0);
  }
  return w;
}

/**
 * Turn a string into a single carved-relief `BufferGeometry`. Each polyline
 * stroke of the vector font becomes a **solid, constant-width ribbon** with
 * mitred corners — the way a bold typeface is drawn — extruded into a shallow
 * slab (front face, side walls and a back face) and merged into one draw call.
 * Butt ends are extended by half a stroke so crossing strokes (the bar of an H,
 * the arms of an E) weld into a solid joint instead of cracking open.
 *
 * It's pure geometry built from the embedded font, so it renders the same in a
 * browser, a headless capture and a Node test — no textures, no font files, no
 * loaders. The result sits in the XY plane facing +Z, ready to lay onto a
 * board; origin follows `align` (default centred) and `baseline` (default the
 * cap band centred on y=0).
 */
export function buildTextGeometry(text: string, options: TextOptions = {}): TextGeometry {
  const size = options.size ?? 0.5;
  const weight = options.weight ?? 0.22;
  const depth = options.depth ?? size * 0.12;
  const tracking = options.tracking ?? 0.6;
  const align = options.align ?? 'center';
  const baseline = options.baseline ?? 'center';

  const unit = size / CAP; // grid units → metres
  const hw = (weight * size) / 2; // half stroke width in metres
  const widthUnits = advanceUnits(text, tracking);
  const width = widthUnits * unit;

  const xShift = align === 'center' ? -width / 2 : align === 'right' ? -width : 0;
  const yShift = baseline === 'center' ? -size / 2 : 0;

  const pos: number[] = [];
  const idx: number[] = [];
  let base = 0;

  /**
   * One stroke → a mitred ribbon slab. Cross-section i contributes four
   * vertices at base+i*4: 0 right-front, 1 left-front, 2 right-back, 3
   * left-back ("left" is +perpendicular of the travel direction). All
   * windings are CCW from outside, verified against +X travel.
   */
  const ribbon = (stroke: number[], gx: number): void => {
    const n = stroke.length / 2;
    if (n < 2) return;
    // Points in metres, with butt ends extended by hw to weld joints.
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = stroke[i * 2] * unit + gx;
      py[i] = stroke[i * 2 + 1] * unit + yShift;
    }
    const d0x = px[1] - px[0];
    const d0y = py[1] - py[0];
    const l0 = Math.hypot(d0x, d0y) || 1e-6;
    px[0] -= (d0x / l0) * hw;
    py[0] -= (d0y / l0) * hw;
    const dmx = px[n - 1] - px[n - 2];
    const dmy = py[n - 1] - py[n - 2];
    const lm = Math.hypot(dmx, dmy) || 1e-6;
    px[n - 1] += (dmx / lm) * hw;
    py[n - 1] += (dmy / lm) * hw;

    // Unit direction of each segment.
    const dx = new Float64Array(n - 1);
    const dy = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      const ex = px[i + 1] - px[i];
      const ey = py[i + 1] - py[i];
      const l = Math.hypot(ex, ey) || 1e-6;
      dx[i] = ex / l;
      dy[i] = ey / l;
    }

    // Offset each vertex along its (mitred) normal; clamp the miter so sharp
    // corners thicken instead of spiking.
    for (let i = 0; i < n; i++) {
      const s0 = i === 0 ? 0 : i - 1;
      const s1 = i === n - 1 ? n - 2 : i;
      let mx = -dy[s0] - dy[s1];
      let my = dx[s0] + dx[s1];
      let ml = Math.hypot(mx, my);
      if (ml < 1e-6) {
        mx = -dy[s1];
        my = dx[s1];
        ml = 1;
      }
      mx /= ml;
      my /= ml;
      const scale = hw / Math.max(0.35, mx * -dy[s1] + my * dx[s1]);
      const lx = px[i] + mx * scale;
      const ly = py[i] + my * scale;
      const rx = px[i] - mx * scale;
      const ry = py[i] - my * scale;
      // 0 right-front, 1 left-front, 2 right-back, 3 left-back
      pos.push(rx, ry, depth, lx, ly, depth, rx, ry, 0, lx, ly, 0);
    }

    const v = (i: number, k: number) => base + i * 4 + k;
    for (let i = 0; i < n - 1; i++) {
      const j = i + 1;
      // front face (+Z)
      idx.push(v(i, 0), v(j, 0), v(j, 1), v(i, 0), v(j, 1), v(i, 1));
      // back face (−Z)
      idx.push(v(i, 2), v(j, 3), v(j, 2), v(i, 2), v(i, 3), v(j, 3));
      // right wall
      idx.push(v(i, 0), v(i, 2), v(j, 2), v(i, 0), v(j, 2), v(j, 0));
      // left wall
      idx.push(v(i, 1), v(j, 3), v(i, 3), v(i, 1), v(j, 1), v(j, 3));
    }
    // end caps
    const m = n - 1;
    idx.push(v(0, 0), v(0, 1), v(0, 3), v(0, 0), v(0, 3), v(0, 2));
    idx.push(v(m, 0), v(m, 2), v(m, 3), v(m, 0), v(m, 3), v(m, 1));
    base += n * 4;
  };

  let penUnits = 0;
  for (let i = 0; i < text.length; i++) {
    const glyph = glyphFor(text[i]);
    const gx = penUnits * unit + xShift;
    for (const stroke of glyph.strokes) ribbon(stroke, gx);
    penUnits += glyph.advance + tracking;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, width, height: size };
}

/** Measure a string without building geometry (metres). */
export function measureText(text: string, options: TextOptions = {}): number {
  const size = options.size ?? 0.5;
  const tracking = options.tracking ?? 0.6;
  return advanceUnits(text, tracking) * (size / CAP);
}
