import {
  BufferGeometry,
  Color,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  Vector2,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface, type SurfaceKind } from '../materials/surface';
import type { Prop } from '../core/types';

/**
 * Vessels — everything round, from one generator.
 *
 * This kit is otherwise made of boxes, and it shows: a room of props built
 * from `BoxGeometry` has no curves in it anywhere, which reads as a *style*
 * right up until you put a bowl of fruit on the table and discover there is
 * no bowl.
 *
 * A **surface of revolution** fixes that with almost no code. Sample a
 * seeded radius profile up the height, spin it, and the same twenty lines
 * produce a vase, an urn, a bottle, a goblet, a bowl and a candlestick —
 * shapes that would each be a separate hand-modelled prop otherwise. The
 * style is nothing but the list of control points.
 *
 * ```ts
 * const vase = createVessel({ style: 'vase', seed: 4 });
 * dress(table.surfaces[0], [vase, ...], { seed: 4 });
 * ```
 */
export type VesselStyle =
  | 'vase'
  | 'urn'
  | 'bottle'
  | 'jug'
  | 'goblet'
  | 'bowl'
  | 'pot'
  | 'candlestick';

interface Recipe {
  /** Control points as (height fraction, radius as a fraction of height). */
  stops: Array<[number, number]>;
  /**
   * How far down the inside the cavity runs, as a fraction of the height.
   * 0 leaves it solid — which is fine for a bottle and completely wrong for
   * a bowl, because the whole of a bowl is the hole in it.
   */
  hollow: number;
  /** Natural height in metres. */
  height: number;
  /** Radial segments. Low, and flat-shaded, to match everything else. */
  segments: number;
  /** A strap handle down one side. */
  handle?: boolean;
  surface: SurfaceKind;
}

const RECIPES: Record<VesselStyle, Recipe> = {
  // Foot, belly, waisted neck, flared lip.
  vase: {
    stops: [[0, 0.26], [0.06, 0.31], [0.3, 0.44], [0.56, 0.37], [0.78, 0.23], [0.93, 0.20], [1, 0.25]],
    hollow: 0.62,
    height: 0.3,
    segments: 14,
    surface: 'terracotta',
  },
  // Small foot, wide shoulders high up, short neck. The classic silhouette.
  urn: {
    stops: [[0, 0.20], [0.05, 0.27], [0.36, 0.47], [0.6, 0.44], [0.82, 0.28], [0.93, 0.31], [1, 0.29]],
    hollow: 0.5,
    height: 0.34,
    segments: 16,
    surface: 'terracotta',
  },
  // Straight body, hard shoulder, long thin neck.
  bottle: {
    stops: [[0, 0.28], [0.08, 0.30], [0.44, 0.30], [0.56, 0.22], [0.68, 0.10], [0.95, 0.09], [1, 0.11]],
    hollow: 0.2,
    height: 0.26,
    segments: 12,
    surface: 'porcelain',
  },
  // A fat bottle with a handle: the thing that actually pours.
  jug: {
    stops: [[0, 0.30], [0.07, 0.36], [0.4, 0.42], [0.66, 0.34], [0.82, 0.20], [0.95, 0.19], [1, 0.24]],
    hollow: 0.55,
    height: 0.24,
    segments: 14,
    handle: true,
    surface: 'porcelain',
  },
  // Foot, stem, cup. Three quite different radii in a short height, which is
  // exactly what a profile curve is good at and a box is hopeless at.
  goblet: {
    stops: [[0, 0.24], [0.05, 0.26], [0.14, 0.07], [0.52, 0.06], [0.6, 0.10], [0.72, 0.26], [1, 0.29]],
    hollow: 0.34,
    height: 0.17,
    segments: 14,
    surface: 'bronze',
  },
  // Wide and shallow, and mostly cavity.
  bowl: {
    stops: [[0, 0.34], [0.08, 0.40], [0.45, 0.66], [1, 0.80]],
    hollow: 0.78,
    height: 0.1,
    segments: 16,
    surface: 'porcelain',
  },
  // A plain kitchen pot: slight taper, rolled rim.
  pot: {
    stops: [[0, 0.34], [0.08, 0.40], [0.55, 0.44], [0.9, 0.40], [1, 0.44]],
    hollow: 0.72,
    height: 0.16,
    segments: 14,
    surface: 'terracotta',
  },
  // Broad foot, knopped stem, a socket at the top.
  candlestick: {
    stops: [
      [0, 0.32], [0.05, 0.35], [0.13, 0.09], [0.4, 0.075], [0.5, 0.14],
      [0.6, 0.08], [0.86, 0.075], [0.93, 0.19], [1, 0.16],
    ],
    hollow: 0.12,
    height: 0.22,
    segments: 12,
    surface: 'bronze',
  },
};

/** Catmull-Rom through the stops, clamped so a bulge cannot invert the wall. */
function sampleProfile(stops: Array<[number, number]>, at: number): number {
  let i = 0;
  while (i < stops.length - 2 && stops[i + 1][0] < at) i++;
  const p0 = stops[Math.max(0, i - 1)];
  const p1 = stops[i];
  const p2 = stops[Math.min(stops.length - 1, i + 1)];
  const p3 = stops[Math.min(stops.length - 1, i + 2)];
  const span = p2[0] - p1[0];
  const t = span <= 1e-6 ? 0 : Math.min(1, Math.max(0, (at - p1[0]) / span));
  const t2 = t * t;
  const t3 = t2 * t;
  const r =
    0.5 *
    (2 * p1[1] +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
  return Math.max(0.012, r);
}

/**
 * Build the lathe profile: up the outside, over the rim, and back down the
 * inside.
 *
 * The descent down the inside is what makes a vessel read as a vessel. Stop
 * at the rim and the lathe caps it flat, and a vase becomes an egg — which
 * is fine at fifty metres and obviously wrong the moment anything is put
 * next to it.
 */
function buildProfile(recipe: Recipe, rng: Rng, height: number): Vector2[] {
  const jitter = (v: number, amount: number): number => v * (1 + rng.range(-amount, amount));
  const stops = recipe.stops.map(
    ([y, r], i) =>
      [i === 0 || i === recipe.stops.length - 1 ? y : jitter(y, 0.03), jitter(r, 0.07)] as [
        number,
        number
      ]
  );

  const points: Vector2[] = [];
  const steps = 22;
  // Bottom: centre out to the foot, so the base is capped.
  points.push(new Vector2(0, 0));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(new Vector2(sampleProfile(stops, t) * height, t * height));
  }

  if (recipe.hollow > 0) {
    const rim = points[points.length - 1].x;
    const wall = Math.min(rim * 0.22, height * 0.02);
    const floor = height * (1 - recipe.hollow);
    const innerSteps = 12;
    for (let i = 0; i <= innerSteps; i++) {
      const t = 1 - i / innerSteps;
      const y = floor + (height - floor) * t;
      // Follow the outside in, so the wall keeps a roughly even thickness
      // instead of a bowl having a rim you could stand on.
      const outer = sampleProfile(stops, y / height) * height;
      points.push(new Vector2(Math.max(0.004, outer - wall), y));
    }
    points.push(new Vector2(0, floor));
  }
  return points;
}

export interface VesselOptions {
  style?: VesselStyle;
  /** Overall height in metres. Defaults to something sensible per style. */
  height?: number;
  /** Base colour. Defaults to the surface's own. */
  color?: number;
  /** Override the finish. */
  surface?: SurfaceKind;
  seed?: number;
  palette?: Palette;
}

export interface Vessel extends Prop {
  /** Height in metres, after any seeded variation. */
  height: number;
  /** Widest radius, in metres. */
  radius: number;
  style: VesselStyle;
}

/** A round thing: vase, urn, bottle, jug, goblet, bowl, pot or candlestick. */
export function createVessel(options: VesselOptions = {}): Vessel {
  const style = options.style ?? 'vase';
  const recipe = RECIPES[style];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  // Not every pot is the same pot. A shelf of identical vases is exactly the
  // repetition this whole track exists to avoid.
  const height = (options.height ?? recipe.height) * rng.range(0.86, 1.16);

  const group = new Group();
  group.name = `vessel-${style}`;
  const material = createSurface(options.surface ?? recipe.surface, {
    color: options.color,
    seed,
    roughness: recipe.surface === 'bronze' ? 0.42 : 0.7,
  });

  const points = buildProfile(recipe, rng, height);
  const geometry: BufferGeometry = new LatheGeometry(points, recipe.segments);
  geometry.computeVertexNormals();
  const body = new Mesh(geometry, material);
  body.name = 'body';
  group.add(body);

  let radius = 0;
  for (const p of points) radius = Math.max(radius, p.x);

  if (recipe.handle) {
    // A strap handle: an arc in the plane that contains the vessel's axis and
    // the outward direction, bulging AWAY from the body with both ends
    // meeting it. A torus is already in that plane; the first version turned
    // it a quarter turn about y, which stood the loop across the jug and left
    // a nub sticking out of its side.
    const r = height * 0.26;
    const handle = new Mesh(
      new TorusGeometry(r, height * 0.042, 6, 14, Math.PI * 1.2),
      material
    );
    handle.position.set(radius * 0.82, height * 0.62, 0);
    handle.rotation.z = -Math.PI * 0.6;
    group.add(handle);
    radius += r * 0.75;
  }

  if (style === 'candlestick') {
    // The candle is the point of a candlestick.
    const candle = new Mesh(
      new LatheGeometry(
        [
          new Vector2(0, 0),
          new Vector2(height * 0.055, 0),
          new Vector2(height * 0.05, height * 0.32),
          new Vector2(0, height * 0.35),
        ],
        8
      ),
      new MeshStandardMaterial({
        color: new Color(0xf2e8d0).lerp(new Color(palette.wall), 0.25).getHex(),
        roughness: 0.85,
        flatShading: true,
      })
    );
    candle.position.y = height * 0.96;
    group.add(candle);
  }

  return {
    object: group,
    obstacleRadius: 0,
    height,
    radius,
    style,
  };
}

export const VESSEL_STYLES: VesselStyle[] = [
  'vase',
  'urn',
  'bottle',
  'jug',
  'goblet',
  'bowl',
  'pot',
  'candlestick',
];
