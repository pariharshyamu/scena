import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PointLight,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createGlass } from '../materials/glass';
import type { Prop } from '../core/types';

/**
 * Modern building components — the steel-railing tier. Everything is on the
 * standard Prop contract and themed by the Tier-4 surfaces: brushed steel,
 * powder-coat, teak, corten, concrete and architectural glass.
 */

// ---- railings ----------------------------------------------------------

export type RailingStyle = 'bars' | 'cable' | 'glass' | 'panel';

export interface RailingOptions {
  seed?: number;
  /** Vertical 'bars', horizontal 'cable', frameless 'glass', or a decorative laser-cut 'panel'. */
  style?: RailingStyle;
  /** Run length along local +x. Default 4. */
  length?: number;
  /** Rail height. Default 1.05. */
  height?: number;
  palette?: Palette;
}

/** A modern railing run — balconies, terraces, stairs. Like `createFence`,
 * the run lies along local +x and the obstacle circle spans it. */
export function createRailing(options: RailingOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const style = options.style ?? 'bars';
  const length = options.length ?? 4;
  const height = options.height ?? 1.05;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const steel = createSurface('steel', { seed });
  const coat = createSurface('paintedMetal', { color: palette.metal, seed: seed + 1 });

  const group = new Group();
  group.name = `railing-${style}`;

  const bays = Math.max(1, Math.round(length / 1.1));
  const bayW = length / bays;
  for (let i = 0; i <= bays; i++) {
    const post = new Mesh(new BoxGeometry(0.05, height, 0.05), style === 'glass' ? steel : coat);
    post.position.set(-length / 2 + i * bayW, height / 2, 0);
    group.add(post);
  }
  const rail = new Mesh(new CylinderGeometry(0.03, 0.03, length + 0.06, 8), steel);
  rail.rotation.z = Math.PI / 2;
  rail.position.y = height;
  group.add(rail);

  if (style === 'bars') {
    const n = Math.round(length / 0.13);
    for (let i = 1; i < n; i++) {
      const bar = new Mesh(new CylinderGeometry(0.011, 0.011, height - 0.12, 5), coat);
      bar.position.set(-length / 2 + (i / n) * length, (height - 0.12) / 2 + 0.02, 0);
      group.add(bar);
    }
  } else if (style === 'cable') {
    for (let i = 1; i <= 5; i++) {
      const cable = new Mesh(new CylinderGeometry(0.007, 0.007, length, 5), steel);
      cable.rotation.z = Math.PI / 2;
      cable.position.y = (i / 6) * height;
      group.add(cable);
    }
  } else if (style === 'glass') {
    // ONE glass for the whole run. Every bay in a balustrade is the same pane,
    // and building it inside the loop gave a seven-bay railing seven identical
    // materials for the renderer to bind separately — `npm run geometry`
    // counts exactly this.
    const glass = createGlass();
    for (let i = 0; i < bays; i++) {
      const pane = new Mesh(new BoxGeometry(bayW - 0.12, height - 0.2, 0.02), glass);
      pane.position.set(-length / 2 + (i + 0.5) * bayW, (height - 0.2) / 2 + 0.06, 0);
      group.add(pane);
    }
  } else {
    // Decorative laser-cut sheet: the per-cell motif stamped in a darker tone.
    const sheet = createSurface('paintedMetal', {
      color: palette.metal, seed: seed + 2,
      tile: 1, tileW: 0.18, tileH: 0.18, mortar: 0.002, bond: 0,
      motif: 0.85, tint: 0x14181c, tileJitter: 0.02, tileRelief: 0.02,
    });
    const panel = new Mesh(new BoxGeometry(length - 0.08, height - 0.18, 0.02), sheet);
    panel.position.y = (height - 0.18) / 2 + 0.04;
    group.add(panel);
  }
  return { object: group, obstacleRadius: length / 2 };
}

// ---- windows -----------------------------------------------------------

export type ModernWindowStyle = 'fixed' | 'sliding';

export interface ModernWindowOptions {
  seed?: number;
  width?: number;
  height?: number;
  /** Mullion grid: [columns, rows] of panes. Default [2, 1]. */
  mullions?: [number, number];
  /** 'fixed' glazing or 'sliding' (two offset panes on a track). */
  style?: ModernWindowStyle;
  /** Glass options passthrough. */
  tint?: number;
  frosted?: boolean;
  /** Emissive pane the day cycle ignites at dusk. Default true. */
  nightGlow?: boolean;
  palette?: Palette;
}

export interface ModernWindowProp extends Prop {
  /** The glass material — hand it to a day cycle via the building's lamps. */
  pane: MeshStandardMaterial;
}

/** A framed modern window standing on local origin, facing ±z. */
export function createModernWindow(options: ModernWindowOptions = {}): ModernWindowProp {
  const seed = options.seed ?? 1;
  const width = options.width ?? 1.8;
  const height = options.height ?? 1.5;
  const [cols, rows] = options.mullions ?? [2, 1];
  const style = options.style ?? 'fixed';
  const palette = options.palette ?? DEFAULT_PALETTE;
  const frame = createSurface('paintedMetal', { color: palette.metal, seed });
  const pane = createGlass({
    tint: options.tint,
    frosted: options.frosted,
    nightGlow: options.nightGlow ?? true,
  });

  const group = new Group();
  group.name = `window-${style}`;
  const t = 0.06; // frame thickness

  const bar = (w: number, h: number, x: number, y: number, z = 0): void => {
    const m = new Mesh(new BoxGeometry(w, h, 0.07), frame);
    m.position.set(x, y, z);
    group.add(m);
  };
  bar(width, t, 0, t / 2);
  bar(width, t, 0, height - t / 2);
  bar(t, height, -width / 2 + t / 2, height / 2);
  bar(t, height, width / 2 - t / 2, height / 2);

  if (style === 'fixed') {
    for (let i = 1; i < cols; i++) bar(t * 0.7, height, -width / 2 + (i / cols) * width, height / 2);
    for (let j = 1; j < rows; j++) bar(width, t * 0.7, 0, (j / rows) * height);
    const glassPane = new Mesh(new BoxGeometry(width - t * 2, height - t * 2, 0.02), pane);
    glassPane.position.y = height / 2;
    group.add(glassPane);
  } else {
    // Two sliding leaves on a visible track, one offset behind the other.
    const track = new Mesh(new BoxGeometry(width, 0.04, 0.12), frame);
    track.position.y = 0.02;
    group.add(track);
    for (const [dir, dz] of [[-1, 0.025], [1, -0.025]] as const) {
      const leafW = width / 2 + t;
      const leaf = new Group();
      const lf = new Mesh(new BoxGeometry(leafW, height - 0.08, 0.03), frame);
      leaf.add(lf);
      const lg = new Mesh(new BoxGeometry(leafW - t * 2, height - 0.08 - t * 2, 0.015), pane);
      lg.position.z = 0.012;
      leaf.add(lg);
      leaf.position.set((dir * (width - leafW)) / 2, height / 2, dz);
      group.add(leaf);
    }
  }
  return { object: group, obstacleRadius: 0, pane };
}

// ---- gates -------------------------------------------------------------

export type GateStyle = 'slat' | 'bars' | 'panel';

export interface GateOptions {
  seed?: number;
  /** Horizontal 'slat' (teak or steel), vertical 'bars', or motif 'panel'. */
  style?: GateStyle;
  /** Clear opening width. Default 3.2. */
  width?: number;
  /** Leaf height. Default 1.6. */
  height?: number;
  /** Masonry pillars flanking the gate (with warm cap lamps). Default true. */
  pillars?: boolean;
  /** 0 closed … 1 fully open. Default 0. */
  open?: number;
  /** One sliding leaf instead of two swing leaves. */
  sliding?: boolean;
  palette?: Palette;
}

export interface GateProp extends Prop {
  /** Drive the gate: 0 closed … 1 open (swing leaves rotate, sliders slide). */
  setOpen(fraction: number): void;
}

/** A modern driveway gate between concrete pillars. */
export function createGate(options: GateOptions = {}): GateProp {
  const seed = options.seed ?? 1;
  const style = options.style ?? 'slat';
  const width = options.width ?? 3.2;
  const height = options.height ?? 1.6;
  const withPillars = options.pillars ?? true;
  const sliding = options.sliding ?? false;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const coat = createSurface('paintedMetal', { color: palette.metal, seed });
  const teak = createSurface('teak', { seed: seed + 1 });

  const group = new Group();
  group.name = `gate-${style}`;

  if (withPillars) {
    for (const side of [-1, 1]) {
      const pillar = new Mesh(new BoxGeometry(0.45, height + 0.5, 0.45), createSurface('concrete', { seed: seed + 2 }));
      pillar.position.set(side * (width / 2 + 0.24), (height + 0.5) / 2, 0);
      group.add(pillar);
      const cap = new Mesh(new BoxGeometry(0.3, 0.1, 0.3), new MeshStandardMaterial({
        color: palette.lampGlow, emissive: palette.lampGlow, emissiveIntensity: 1.2,
      }));
      cap.position.set(side * (width / 2 + 0.24), height + 0.56, 0);
      group.add(cap);
      if (side === 1) {
        const lamp = new PointLight(palette.lampGlow, 0, 7, 2); // day cycle drives it
        lamp.position.set(side * (width / 2 + 0.24), height + 0.7, 0);
        group.add(lamp);
      }
    }
  }

  const buildLeaf = (leafW: number): Group => {
    const leaf = new Group();
    const frame = (w: number, h: number, x: number, y: number): void => {
      const m = new Mesh(new BoxGeometry(w, h, 0.05), coat);
      m.position.set(x, y, 0);
      leaf.add(m);
    };
    frame(leafW, 0.07, leafW / 2, 0.1);
    frame(leafW, 0.07, leafW / 2, height - 0.05);
    frame(0.07, height - 0.05, 0.035, height / 2);
    frame(0.07, height - 0.05, leafW - 0.035, height / 2);
    if (style === 'slat') {
      const n = 7;
      for (let i = 1; i < n; i++) {
        const slat = new Mesh(new BoxGeometry(leafW - 0.1, 0.09, 0.03), teak);
        slat.position.set(leafW / 2, 0.12 + (i / n) * (height - 0.2), 0);
        leaf.add(slat);
      }
    } else if (style === 'bars') {
      const n = Math.round(leafW / 0.13);
      for (let i = 1; i < n; i++) {
        const gbar = new Mesh(new CylinderGeometry(0.012, 0.012, height - 0.2, 5), coat);
        gbar.position.set((i / n) * leafW, height / 2, 0);
        leaf.add(gbar);
      }
    } else {
      const sheet = createSurface('paintedMetal', {
        color: palette.metal, seed: seed + 3,
        tile: 1, tileW: 0.2, tileH: 0.2, mortar: 0.002, bond: 0,
        motif: 0.85, tint: 0x14181c, tileJitter: 0.02, tileRelief: 0.02,
      });
      const panel = new Mesh(new BoxGeometry(leafW - 0.1, height - 0.22, 0.02), sheet);
      panel.position.set(leafW / 2, height / 2, 0);
      leaf.add(panel);
    }
    return leaf;
  };

  const leaves: Array<{ leaf: Group; dir: number }> = [];
  if (sliding) {
    const leaf = buildLeaf(width + 0.2);
    leaf.position.set(-width / 2 - 0.1, 0, 0.16);
    group.add(leaf);
    leaves.push({ leaf, dir: 1 });
  } else {
    for (const dir of [-1, 1]) {
      const leaf = buildLeaf(width / 2 + 0.02);
      leaf.position.set(dir * (width / 2), 0, 0);
      if (dir === 1) leaf.scale.x = -1; // hinge both leaves at the pillars
      group.add(leaf);
      leaves.push({ leaf, dir });
    }
  }

  const setOpen = (fraction: number): void => {
    const f = Math.min(1, Math.max(0, fraction));
    for (const { leaf, dir } of leaves) {
      if (sliding) leaf.position.x = -width / 2 - 0.1 - f * (width + 0.2);
      else leaf.rotation.y = dir * f * 1.9;
    }
  };
  setOpen(options.open ?? 0);

  return { object: group, obstacleRadius: width / 2 + 0.5, setOpen };
}

// ---- cladding & pergola ------------------------------------------------

export type CladdingStyle = 'slats' | 'louvers' | 'stone';

export interface CladdingOptions {
  seed?: number;
  /** Vertical teak 'slats', angled 'louvers', or a 'stone' feature panel. */
  style?: CladdingStyle;
  width?: number;
  height?: number;
  palette?: Palette;
}

/** A facade accent panel — the modern-bungalow signature. Flat against ±z. */
export function createCladding(options: CladdingOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const style = options.style ?? 'slats';
  const width = options.width ?? 3;
  const height = options.height ?? 3;
  const group = new Group();
  group.name = `cladding-${style}`;

  if (style === 'stone') {
    const panel = new Mesh(new BoxGeometry(width, height, 0.14), createSurface('slate', {
      seed, tile: 1, tileW: 0.55, tileH: 0.14, mortar: 0.008, bond: 1,
      tileJitter: 0.22, mortarColor: 0x22262b, tileRelief: 0.08,
    }));
    panel.position.y = height / 2;
    group.add(panel);
  } else {
    const teak = createSurface('teak', { seed });
    const n = Math.round(width / 0.16);
    for (let i = 0; i < n; i++) {
      const slat = new Mesh(new BoxGeometry(0.09, height, 0.04), teak);
      slat.position.set(-width / 2 + (i + 0.5) * (width / n), height / 2, 0);
      if (style === 'louvers') slat.rotation.y = 0.6;
      group.add(slat);
    }
    for (const y of [0.06, height - 0.06]) {
      const rail = new Mesh(new BoxGeometry(width, 0.06, 0.03), teak);
      rail.position.set(0, y, -0.035);
      group.add(rail);
    }
  }
  return { object: group, obstacleRadius: 0 };
}

export interface PergolaOptions {
  seed?: number;
  width?: number;
  depth?: number;
  palette?: Palette;
}

/** A teak pergola: four posts, doubled beams, rafter slats. Walk-through
 * (obstacleRadius 0) — feed the posts to steering yourself if needed. */
export function createPergola(options: PergolaOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const width = options.width ?? 3.6;
  const depth = options.depth ?? 3;
  const teak = createSurface('teak', { seed });
  const H = 2.5;

  const group = new Group();
  group.name = 'pergola';
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.14, H, 0.14), teak);
      post.position.set(sx * (width / 2 - 0.1), H / 2, sz * (depth / 2 - 0.1));
      group.add(post);
    }
  }
  for (const sz of [-1, 1]) {
    const beam = new Mesh(new BoxGeometry(width + 0.5, 0.16, 0.08), teak);
    beam.position.set(0, H + 0.08, sz * (depth / 2 - 0.1));
    group.add(beam);
  }
  const rafters = Math.round(width / 0.42);
  for (let i = 0; i <= rafters; i++) {
    const rafter = new Mesh(new BoxGeometry(0.06, 0.12, depth + 0.5), teak);
    rafter.position.set(-width / 2 + (i / rafters) * width, H + 0.22, 0);
    group.add(rafter);
  }
  return { object: group, obstacleRadius: 0 };
}

export interface PlanterOptions {
  seed?: number;
  /** Trough length. Default 1.6. */
  length?: number;
  palette?: Palette;
}

/** A corten planter trough with low greenery. */
export function createPlanter(options: PlanterOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const length = options.length ?? 1.6;
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = 'planter';
  const box = new Mesh(new BoxGeometry(length, 0.5, 0.45), createSurface('corten', { seed }));
  box.position.y = 0.25;
  group.add(box);
  const soil = new Mesh(new BoxGeometry(length - 0.06, 0.04, 0.39), createSurface('dirt', { seed: seed + 1 }));
  soil.position.y = 0.5;
  group.add(soil);
  const leaf = new MeshStandardMaterial({ color: rng.pick(palette.foliage), flatShading: true });
  const clumps = Math.max(2, Math.round(length / 0.4));
  for (let i = 0; i < clumps; i++) {
    const clump = new Mesh(new IcosahedronGeometry(rng.range(0.14, 0.22), 0), leaf);
    clump.position.set(-length / 2 + (i + 0.5) * (length / clumps), 0.58 + rng.range(0, 0.06), rng.jitter(0, 0.08));
    group.add(clump);
  }
  return { object: group, obstacleRadius: length / 2 };
}
