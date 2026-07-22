import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { wavingClothMaterial } from '../materials/clothWave';
import type { Prop } from '../core/types';

export type BannerStyle = 'flag' | 'banner' | 'pennant';
export type BannerPattern =
  | 'solid'
  | 'bands'
  | 'stripes'
  | 'bicolor'
  | 'cross'
  | 'saltire'
  | 'diamond';

export interface BannerOptions {
  seed?: number;
  /** flag (flies from a pole), banner (hangs from a crossbar), pennant (triangular). */
  style?: BannerStyle;
  /** Heraldic device. Default seeded. */
  pattern?: BannerPattern;
  /** Field colour and charge colour (hex). Default seeded from a heraldic set. */
  colors?: [number, number];
  /** Pole height in metres. Default seeded ~3.2–3.8. */
  poleHeight?: number;
  /** Wind strength (ripple amplitude multiplier). Default 1. */
  wind?: number;
  palette?: Palette;
}

// Heraldic tinctures — gules, azure, or, argent, vert, sable, purpure.
const TINCTURES = [0xb5372f, 0x2f5fa8, 0xd8a93c, 0xe8dcc0, 0x2f7a4a, 0x2a2a2e, 0x6a3f7a];
const ALL_STYLES: BannerStyle[] = ['flag', 'banner', 'pennant'];
const ALL_PATTERNS: BannerPattern[] = ['solid', 'bands', 'stripes', 'bicolor', 'cross', 'saltire', 'diamond'];

/**
 * A flag, banner or pennant on a pole — real cloth, not a stiff board. The
 * fabric is a subdivided plane rippled by a GPU vertex wave: a travelling
 * fold that grows from the fixed edge to the free fly, droops under its own
 * weight, and carries a seeded phase so a row of flags never waves in
 * lockstep. Flat-shaded facets catch the light of each fold, and the whole
 * thing animates itself from the render loop — no per-frame wiring, so it
 * works dropped straight into `scatter` or a village. Heraldic devices
 * (cross, saltire, bands, diamond…) are baked as vertex colours, so there
 * are no textures to fetch.
 */
export function createBanner(options: BannerOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;
  const style = options.style ?? rng.pick(ALL_STYLES);
  const pattern = options.pattern ?? rng.pick(ALL_PATTERNS);
  const wind = options.wind ?? 1;
  const poleH = options.poleHeight ?? rng.range(3.2, 3.8);

  // Two contrasting tinctures.
  let c1 = options.colors?.[0];
  let c2 = options.colors?.[1];
  if (c1 === undefined || c2 === undefined) {
    c1 = rng.pick(TINCTURES);
    do {
      c2 = rng.pick(TINCTURES);
    } while (c2 === c1);
  }

  const group = new Group();
  group.name = 'banner';

  // --- Pole + finial (and crossbar for a hanging banner).
  const pole = new Mesh(
    new CylinderGeometry(0.045, 0.06, poleH, 8),
    createSurface('wood', { color: palette.woodDark, seed })
  );
  pole.position.y = poleH / 2;
  group.add(pole);
  const gold = createSurface('metal', { color: 0xd8a93c, tint: 0x7a5a1f, tintAmount: 0.3, seed: seed + 2 });
  const finial = new Mesh(new ConeGeometry(0.075, 0.28, 8), gold);
  finial.position.y = poleH + 0.14;
  group.add(finial);
  const knob = new Mesh(new SphereGeometry(0.06, 8, 6), gold);
  knob.position.y = poleH;
  group.add(knob);

  // --- Cloth dimensions per style (free = length along the wave, cross = span).
  let freeLen: number;
  let crossLen: number;
  let geometry: BufferGeometry;
  if (style === 'pennant') {
    freeLen = rng.range(2.0, 2.6);
    crossLen = rng.range(0.6, 0.8);
    geometry = clothGrid(freeLen, crossLen, 20, 5, 'taper');
  } else if (style === 'banner') {
    freeLen = rng.range(1.9, 2.4); // hangs down
    crossLen = rng.range(1.0, 1.3);
    geometry = clothGrid(freeLen, crossLen, 16, 9, 'swallow');
  } else {
    freeLen = rng.range(1.5, 1.9);
    crossLen = rng.range(0.95, 1.15);
    geometry = clothGrid(freeLen, crossLen, 16, 9, 'rect');
  }
  paintPattern(geometry, freeLen, crossLen, pattern, new Color(c1), new Color(c2));

  const clothMat = wavingCloth(freeLen, crossLen, wind, style, seed);
  const cloth = new Mesh(geometry, clothMat);
  // Self-animate from the render loop: the shared uniform is advanced just
  // before the cloth draws, so a banner ripples with no per-frame wiring —
  // even inside scatter or a village that never calls an update().
  const waveUniforms = clothMat.userData.waveUniforms as { uTime: { value: number } };
  cloth.onBeforeRender = () => {
    waveUniforms.uTime.value = performance.now() * 0.001;
  };
  if (style === 'banner') {
    // Crossbar along world X, cloth hangs beneath it.
    const crossbar = new Mesh(
      new CylinderGeometry(0.035, 0.035, crossLen + 0.3, 7),
      createSurface('wood', { color: palette.woodDark, seed: seed + 4 })
    );
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.y = poleH - 0.12;
    group.add(crossbar);
    cloth.rotation.z = -Math.PI / 2; // local +X (free) → world −Y (down)
    cloth.position.set(0, poleH - 0.16, 0);
  } else {
    // Flag/pennant: fixed edge at the pole, flies along +X.
    cloth.position.set(0.05, poleH - 0.2 - crossLen / 2, 0);
  }
  group.add(cloth);

  return { object: group, obstacleRadius: 0.4 };
}

// ---- cloth geometry ----------------------------------------------------

type ClothShape = 'rect' | 'taper' | 'swallow';

/**
 * A subdivided cloth in the XY plane: x from 0 (fixed edge) to freeLen (fly),
 * y centred on 0. `taper` converges to a point (pennant); `swallow` cuts a V
 * into the fly edge (swallow-tailed banner).
 */
function clothGrid(freeLen: number, crossLen: number, segF: number, segC: number, shape: ClothShape): BufferGeometry {
  const geo = new BufferGeometry();
  const cols = segF + 1;
  const rows = segC + 1;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  for (let i = 0; i < cols; i++) {
    const u = i / segF; // 0 at fixed edge → 1 at fly
    let half = crossLen / 2;
    if (shape === 'taper') half = (crossLen / 2) * (1 - u * 0.94); // triangle
    for (let j = 0; j < rows; j++) {
      const v = j / segC; // 0..1 across
      const idx = i * rows + j;
      let x = u * freeLen;
      if (shape === 'swallow') {
        const edge = Math.abs(v - 0.5) * 2; // 0 centre → 1 rim
        const cut = Math.max(0, (u - 0.7) / 0.3);
        x = u * freeLen - cut * cut * (1 - edge) * crossLen * 0.5;
      }
      const y = (v - 0.5) * half * 2;
      pos[idx * 3] = x;
      pos[idx * 3 + 1] = y;
      pos[idx * 3 + 2] = 0;
      uv[idx * 2] = u;
      uv[idx * 2 + 1] = v;
    }
  }
  const index: number[] = [];
  for (let i = 0; i < segF; i++) {
    for (let j = 0; j < segC; j++) {
      const a = i * rows + j;
      const b = (i + 1) * rows + j;
      const c = (i + 1) * rows + (j + 1);
      const d = i * rows + (j + 1);
      index.push(a, b, d, b, c, d);
    }
  }
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Bake a heraldic device into per-vertex colours. */
function paintPattern(
  geo: BufferGeometry,
  freeLen: number,
  crossLen: number,
  pattern: BannerPattern,
  a: Color,
  b: Color
): void {
  const uvAttr = geo.getAttribute('uv');
  const colors = new Float32Array(uvAttr.count * 3);
  const pick = (u: number, v: number): Color => {
    switch (pattern) {
      case 'bicolor':
        return u < 0.5 ? a : b;
      case 'bands':
        return Math.floor(v * 3) % 2 === 0 ? a : b;
      case 'stripes':
        return Math.floor(u * 5) % 2 === 0 ? a : b;
      case 'cross':
        return Math.abs(v - 0.5) < 0.16 || Math.abs(u - 0.42) < 0.14 ? b : a;
      case 'saltire':
        return Math.abs(u - v) < 0.17 || Math.abs(u - (1 - v)) < 0.17 ? b : a;
      case 'diamond':
        return Math.abs(u - 0.5) + Math.abs(v - 0.5) < 0.3 ? b : a;
      default:
        return a;
    }
  };
  for (let i = 0; i < uvAttr.count; i++) {
    const c = pick(uvAttr.getX(i), uvAttr.getY(i));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
}

// ---- waving cloth material --------------------------------------------

/**
 * A double-sided, flat-shaded, vertex-coloured cloth rippled in the shader —
 * built on the shared cloth-wave material (also used by bunting).
 */
function wavingCloth(
  freeLen: number,
  crossLen: number,
  wind: number,
  style: BannerStyle,
  seed: number
): MeshStandardMaterial {
  return wavingClothMaterial({
    freeLen,
    crossLen,
    amp: (style === 'pennant' ? 0.16 : 0.13) * wind,
    waves: style === 'pennant' ? 7.0 : 5.0,
    speed: 3.4 + (seed % 7) * 0.12,
    sag: style === 'banner' ? 0 : 0.14,
    phase: (seed % 100) * 0.183,
    cacheKey: 'scena-banner-v1',
    vertexColors: true,
  });
}
