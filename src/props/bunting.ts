import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { wavingClothMaterial } from '../materials/clothWave';
import type { Prop } from '../core/types';

export interface BuntingOptions {
  seed?: number;
  /** Distance between the two poles (metres). Default seeded ~4.5–6. */
  span?: number;
  /** Pole height. Default seeded ~2.6–3.2. */
  poleHeight?: number;
  /** Number of hanging flaglets. Default scales with span. */
  flags?: number;
  /** Festive colours to cycle through. Default a bright fair palette. */
  colors?: number[];
  palette?: Palette;
}

const FAIR_COLORS = [0xd23b32, 0xe8dcc0, 0x2f6fb0, 0xe0b53a, 0x3f8a52, 0xffffff];

/**
 * A string of festive bunting slung between two poles: a rope in a natural
 * catenary droop, hung with little triangular pennants that flutter on the
 * same GPU cloth wave as the flags — each with its own phase, so the whole
 * line ripples like a real garland in a breeze. Self-animating: it advances
 * its own clock from the render loop, so it just flutters wherever you drop
 * it.
 */
export function createBunting(options: BuntingOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;
  const span = options.span ?? rng.range(4.5, 6);
  const poleH = options.poleHeight ?? rng.range(2.6, 3.2);
  const flags = options.flags ?? Math.max(5, Math.round(span * 1.6));
  const colors = options.colors ?? FAIR_COLORS;

  const group = new Group();
  group.name = 'bunting';

  // Two poles.
  const woodMat = createSurface('wood', { color: palette.woodDark, seed });
  for (const sx of [-1, 1]) {
    const pole = new Mesh(new CylinderGeometry(0.05, 0.06, poleH, 7), woodMat);
    pole.position.set(sx * (span / 2), poleH / 2, 0);
    group.add(pole);
  }

  // The rope: a catenary droop between the pole tops as a smooth tube.
  const attachY = poleH - 0.1;
  const sag = span * rng.range(0.12, 0.18);
  const CURVE_PTS = 24;
  const pts: Vector3[] = [];
  for (let i = 0; i <= CURVE_PTS; i++) {
    const t = i / CURVE_PTS;
    const x = -span / 2 + t * span;
    const y = attachY - 4 * sag * t * (1 - t); // parabolic droop
    pts.push(new Vector3(x, y, 0));
  }
  const curve = new CatmullRomCurve3(pts);
  const rope = new Mesh(
    new TubeGeometry(curve, CURVE_PTS, 0.016, 5, false),
    new MeshStandardMaterial({ color: palette.woodDark, roughness: 0.9, flatShading: true })
  );
  group.add(rope);

  // Hanging flaglets, evenly spaced, each a tiny point-down pennant that
  // flutters on the shared cloth wave with its own phase.
  const flagLen = 0.42;
  const flagW = 0.34;
  const drivers: Array<{ uTime: { value: number } }> = [];
  let driverMesh: Mesh | undefined;
  for (let i = 0; i < flags; i++) {
    const t = (i + 1) / (flags + 1);
    const p = curve.getPoint(t);
    const mat = wavingClothMaterial({
      freeLen: flagLen,
      crossLen: flagW,
      amp: 0.05,
      waves: 2.4,
      speed: 2.6 + (seed % 5) * 0.1,
      sag: 0,
      phase: i * 0.7 + (seed % 10) * 0.3,
      cacheKey: 'scena-bunting-v1',
      color: colors[i % colors.length],
      roughness: 0.9,
    });
    const flag = new Mesh(flagletGeometry(flagLen, flagW), mat);
    flag.rotation.z = -Math.PI / 2; // local +X (free) → world −Y (hangs down)
    flag.position.set(p.x, p.y - 0.01, p.z);
    group.add(flag);
    drivers.push(mat.userData.waveUniforms as { uTime: { value: number } });
    if (!driverMesh) driverMesh = flag;
  }

  // One flaglet drives the shared clock for the whole string each frame.
  if (driverMesh) {
    driverMesh.onBeforeRender = () => {
      const now = performance.now() * 0.001;
      for (const u of drivers) u.uTime.value = now;
    };
  }

  return { object: group, obstacleRadius: 0 };
}

/** A little point-down pennant in the XY plane: x from 0 (top, wide) to len (tip). */
function flagletGeometry(len: number, width: number, segF = 4, segC = 2): BufferGeometry {
  const cols = segF + 1;
  const rows = segC + 1;
  const position: number[] = [];
  for (let i = 0; i < cols; i++) {
    const u = i / segF;
    const half = (width / 2) * (1 - u * 0.92);
    for (let j = 0; j < rows; j++) {
      const v = j / segC;
      position.push(u * len, (v - 0.5) * half * 2, 0);
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
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}
