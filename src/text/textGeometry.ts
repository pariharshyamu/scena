import { BufferAttribute, BufferGeometry } from 'three';
import { CAP, FONT, MISSING, type Glyph } from './font';

export type TextAlign = 'left' | 'center' | 'right';

export interface TextOptions {
  /** Cap height in metres. Default 0.5. */
  size?: number;
  /** Stroke width as a fraction of cap height. Default 0.18 (a bold carved line). */
  weight?: number;
  /** Relief depth in metres (how far the letters stand off the board). Default size*0.1. */
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
 * Turn a string into a single carved-relief `BufferGeometry` — every stroke of
 * every glyph thickened into a shallow raised ribbon (a front face plus lit
 * side walls), all merged into one draw call. It's pure geometry built from the
 * embedded vector font, so it renders the same in a browser, a headless capture
 * and a Node test — no textures, no font files, no loaders.
 *
 * The result sits in the XY plane facing +Z, ready to lay onto the front of a
 * board. Origin follows `align` (default centred) and `baseline` (default the
 * cap band centred on y=0), so dropping it at a board's centre just works.
 */
export function buildTextGeometry(text: string, options: TextOptions = {}): TextGeometry {
  const size = options.size ?? 0.5;
  const weight = options.weight ?? 0.18;
  const depth = options.depth ?? size * 0.1;
  const tracking = options.tracking ?? 0.6;
  const align = options.align ?? 'center';
  const baseline = options.baseline ?? 'center';

  const unit = size / CAP; // grid units → metres
  const hw = (weight * size) / 2; // half stroke width in metres
  const widthUnits = advanceUnits(text, tracking);
  const width = widthUnits * unit;

  // Origin offsets so the finished text is anchored per align/baseline.
  const xShift = align === 'center' ? -width / 2 : align === 'right' ? -width : 0;
  const yShift = baseline === 'center' ? -size / 2 : 0;

  const pos: number[] = [];
  const idx: number[] = [];
  let base = 0; // running vertex count
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, d, b, c, d);

  let penUnits = 0; // pen x in grid units
  for (let i = 0; i < text.length; i++) {
    const glyph = glyphFor(text[i]);
    const gx = penUnits * unit + xShift;
    for (const stroke of glyph.strokes) {
      // Each stroke is a flat [x,y,x,y,…] polyline in grid units.
      for (let s = 0; s < stroke.length - 2; s += 2) {
        const x1 = stroke[s] * unit + gx;
        const y1 = stroke[s + 1] * unit + yShift;
        const x2 = stroke[s + 2] * unit + gx;
        const y2 = stroke[s + 3] * unit + yShift;
        let dx = x2 - x1;
        let dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1e-6;
        dx /= len;
        dy /= len;
        // Perpendicular offset, extended half a width at each cap so segments
        // in a stroke overlap and the joints read as solid.
        const nx = -dy * hw;
        const ny = dx * hw;
        const ex = dx * hw;
        const ey = dy * hw;
        const ax = x1 - ex;
        const ay = y1 - ey;
        const bx = x2 + ex;
        const by = y2 + ey;
        // Four top corners (z = depth) then their z=0 twins.
        const tl = [ax + nx, ay + ny, depth];
        const tr = [bx + nx, by + ny, depth];
        const br = [bx - nx, by - ny, depth];
        const bl = [ax - nx, ay - ny, depth];
        const verts = [
          tl, tr, br, bl, // 0..3 front face (z=depth)
          [tl[0], tl[1], 0], [tr[0], tr[1], 0], [br[0], br[1], 0], [bl[0], bl[1], 0], // 4..7 base
        ];
        for (const v of verts) pos.push(v[0], v[1], v[2]);
        quad(base + 0, base + 1, base + 2, base + 3); // front
        quad(base + 0, base + 4, base + 5, base + 1); // wall along one edge
        quad(base + 1, base + 5, base + 6, base + 2);
        quad(base + 2, base + 6, base + 7, base + 3);
        quad(base + 3, base + 7, base + 4, base + 0);
        base += 8;
      }
    }
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
