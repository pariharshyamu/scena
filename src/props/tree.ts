import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { WindField } from '../environment/wind';
import type { Prop } from '../core/types';

export type TreeSpecies =
  | 'pine'
  | 'oak'
  | 'cypress'
  | 'birch'
  | 'cedar'
  | 'maple'
  | 'sakura'
  | 'palm'
  | 'willow';

/** The season a tree wears. Currently shapes `sakura` (bloom / green / warm / bare). */
export type TreeSeason = 'spring' | 'summer' | 'autumn' | 'winter';

/** Every species `createTree` can build. */
export const TREE_SPECIES: readonly TreeSpecies[] = [
  'pine',
  'oak',
  'cypress',
  'birch',
  'cedar',
  'maple',
  'sakura',
  'palm',
  'willow',
];

export interface TreeOptions {
  seed?: number;
  /** Overall height in world units. Default is species-specific. */
  height?: number;
  /** Which species. Default: a seeded pick of pine or oak (new species are opt-in). */
  species?: TreeSpecies;
  /** @deprecated Use `species`. Kept as an alias so old calls keep working. */
  style?: TreeSpecies;
  /** Season — currently drives `sakura` (blossom in spring, green in summer, warm in autumn, bare in winter). */
  season?: TreeSeason;
  /** A WindField to sway the canopy in (the trunk stays planted). */
  wind?: WindField;
  palette?: Palette;
}

// --- shared helpers -----------------------------------------------------

function mat(color: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, flatShading: true });
}

/** Blend a base colour toward another — species tints that still theme with the palette. */
function tint(base: number, toward: number, t: number): number {
  return new Color(base).lerp(new Color(toward), t).getHex();
}

// --- silhouette builders (shared by the recipes) ------------------------

/** A gently curving trunk from stacked segments — the lean of a palm. Returns the crown position. */
function curvedTrunk(
  group: Group,
  material: MeshStandardMaterial,
  height: number,
  baseR: number,
  topR: number,
  curve: number
): { x: number; y: number } {
  const segs = 7;
  const segH = height / segs;
  let cx = 0;
  for (let i = 0; i < segs; i++) {
    const f = i / segs;
    const r0 = baseR + (topR - baseR) * f;
    const r1 = baseR + (topR - baseR) * ((i + 1) / segs);
    cx = curve * f * f; // accelerating lean
    const seg = new Mesh(new CylinderGeometry(r1, r0, segH * 1.04, 6), material);
    seg.position.set(cx, segH * (i + 0.5), 0);
    seg.rotation.z = -curve * 0.12;
    group.add(seg);
  }
  return { x: curve, y: height };
}

/** A crown of long, drooping, radial fronds — a palm top. */
function frondCrown(
  group: Group,
  material: MeshStandardMaterial,
  rng: Rng,
  cx: number,
  cy: number,
  count: number,
  length: number,
  droopDeg: number
): void {
  const droop = (droopDeg * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.range(-0.12, 0.12);
    const frond = new Group();
    const w = length * 0.13;
    const blade = new Mesh(new ConeGeometry(w, length, 4), material); // tapered blade
    blade.rotation.z = -Math.PI / 2; // point along +x
    blade.position.x = length * 0.5;
    blade.scale.z = 0.28; // flatten into a frond
    frond.add(blade);
    frond.position.set(cx, cy, 0);
    frond.rotation.y = a;
    frond.rotation.z = -(droop + rng.range(-0.14, 0.14)); // droop down
    group.add(frond);
  }
}

/** Long strands hanging and swaying from the canopy hem — a willow's veil. */
function droopStrands(
  group: Group,
  material: MeshStandardMaterial,
  rng: Rng,
  cy: number,
  radius: number,
  count: number,
  minLen: number,
  maxLen: number
): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.range(-0.12, 0.12);
    const rr = radius * rng.range(0.78, 1.02); // hang from the outer hem
    const len = Math.min(rng.range(minLen, maxLen), cy - 0.4); // never punch through the ground
    if (len <= 0.3) continue;
    // A leafy strip, wide enough to read as a veil from any angle.
    const strand = new Mesh(new BoxGeometry(0.12, len, 0.12), material);
    strand.position.set(Math.cos(a) * rr, cy - len / 2, Math.sin(a) * rr);
    strand.rotation.y = -a;
    strand.rotation.z = rng.range(-0.08, 0.08);
    group.add(strand);
  }
}

/** A few splayed structural branches — visible on a bare sakura. */
function branches(group: Group, material: MeshStandardMaterial, rng: Rng, trunkTop: number, count: number, len: number): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const br = new Mesh(new CylinderGeometry(0.025, 0.055, len, 5), material);
    br.position.set(Math.cos(a) * len * 0.28, trunkTop + len * 0.34, Math.sin(a) * len * 0.28);
    br.rotation.set(-Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7);
    group.add(br);
  }
}

/**
 * A species recipe: the height band, its wind response (how stiffly it sways),
 * its steering footprint, and how to build it. `build` returns the single
 * foliage material — the one the wind binds, leaving the trunk planted.
 */
interface Recipe {
  heightRange: [number, number];
  /** Wind stiffness exponent (higher = stiffer base). */
  stiffness: number;
  /** Fraction of height below which nothing sways (keeps the trunk still). */
  anchorFrac: number;
  /** Steering footprint radius (the GAMA handshake). */
  obstacleRadius: number;
  build(group: Group, rng: Rng, palette: Palette, height: number, season?: TreeSeason): MeshStandardMaterial;
}

// --- species recipes ----------------------------------------------------

const SPECIES: Record<TreeSpecies, Recipe> = {
  // Stacked cones — the classic conifer. (Verbatim from the original, so every
  // seeded forest built before the species system renders identically.)
  pine: {
    heightRange: [3.2, 5.2],
    stiffness: 2.4,
    anchorFrac: 0.22,
    obstacleRadius: 0.5,
    build(group, rng, palette, height) {
      const trunkMaterial = mat(palette.trunk);
      const foliageMaterial = mat(rng.pick(palette.foliage));
      const trunkHeight = height * 0.25;
      const trunk = new Mesh(new CylinderGeometry(0.09, 0.14, trunkHeight, 6), trunkMaterial);
      trunk.position.y = trunkHeight / 2;
      group.add(trunk);

      const tiers = rng.int(3, 4);
      let y = trunkHeight;
      let radius = height * rng.range(0.24, 0.3);
      const tierHeight = (height - trunkHeight) / tiers + 0.15;
      for (let i = 0; i < tiers; i++) {
        const cone = new Mesh(new ConeGeometry(radius, tierHeight * 1.35, 7), foliageMaterial);
        cone.position.y = y + tierHeight * 0.55;
        cone.rotation.y = rng.range(0, Math.PI);
        group.add(cone);
        y += tierHeight * 0.8;
        radius *= 0.72;
      }
      return foliageMaterial;
    },
  },

  // Foliage blobs on a forked trunk. (Verbatim from the original.)
  oak: {
    heightRange: [3.2, 5.2],
    stiffness: 2.4,
    anchorFrac: 0.22,
    obstacleRadius: 0.6,
    build(group, rng, palette, height) {
      const trunkMaterial = mat(palette.trunk);
      const foliageMaterial = mat(rng.pick(palette.foliage));
      const trunkHeight = height * 0.45;
      const trunk = new Mesh(new CylinderGeometry(0.12, 0.2, trunkHeight, 6), trunkMaterial);
      trunk.position.y = trunkHeight / 2;
      trunk.rotation.z = rng.range(-0.08, 0.08);
      group.add(trunk);

      const blobs = rng.int(2, 4);
      for (let i = 0; i < blobs; i++) {
        const radius = height * rng.range(0.18, 0.28);
        const blob = new Mesh(new IcosahedronGeometry(radius, 0), foliageMaterial);
        blob.position.set(
          rng.jitter(0, height * 0.16),
          trunkHeight + radius * rng.range(0.5, 0.9) + i * radius * 0.35,
          rng.jitter(0, height * 0.16)
        );
        blob.rotation.set(rng.range(0, Math.PI), rng.range(0, Math.PI), 0);
        group.add(blob);
      }
      return foliageMaterial;
    },
  },

  // Tall, narrow flame — a lumpy column of deep-green foliage tapering to a
  // point. Barely moves in the wind; perfect for avenues and cemeteries.
  cypress: {
    heightRange: [6, 10],
    stiffness: 3.4,
    anchorFrac: 0.32,
    obstacleRadius: 0.35,
    build(group, rng, palette, height) {
      const trunkMaterial = mat(palette.trunk);
      const foliageMaterial = mat(tint(rng.pick(palette.foliage), 0x123a24, 0.5)); // deep green
      const trunkH = height * 0.14;
      const trunk = new Mesh(new CylinderGeometry(0.07, 0.11, trunkH, 6), trunkMaterial);
      trunk.position.y = trunkH / 2;
      group.add(trunk);

      const maxR = height * 0.075; // narrow flame
      const crownBase = trunkH * 0.6;
      const crownH = height - crownBase;
      const tiers = Math.max(7, Math.round(crownH / (maxR * 1.4)));
      const step = crownH / tiers;
      for (let i = 0; i < tiers; i++) {
        const f = i / (tiers - 1);
        // Rounded low, tapering steadily to a slim top.
        const r = Math.max(0.05, maxR * (0.55 + 0.7 * Math.pow(1 - f, 0.8)) * (0.6 + 0.4 * Math.sin(f * Math.PI)));
        const blob = new Mesh(new IcosahedronGeometry(r, 0), foliageMaterial);
        blob.position.set(rng.jitter(0, maxR * 0.12), crownBase + i * step + step * 0.5, rng.jitter(0, maxR * 0.12));
        blob.scale.y = 1.5; // stretch into a smooth column
        blob.rotation.set(rng.range(0, Math.PI), rng.range(0, Math.PI), rng.range(0, Math.PI));
        group.add(blob);
      }
      // A pointed cap to finish the flame.
      const cap = new Mesh(new ConeGeometry(maxR * 0.7, crownH * 0.22, 6), foliageMaterial);
      cap.position.y = crownBase + crownH + crownH * 0.02;
      group.add(cap);
      return foliageMaterial;
    },
  },

  // Slender, high-canopied, pale cream bark with dark bands and a loose, light
  // yellow-green crown.
  birch: {
    heightRange: [4, 7],
    stiffness: 1.5,
    anchorFrac: 0.45,
    obstacleRadius: 0.32,
    build(group, rng, palette, height) {
      const barkMaterial = mat(0xe6e2d6); // birch cream
      const bandMaterial = mat(0x4a453e);
      const foliageMaterial = mat(tint(rng.pick(palette.foliage), 0xd2e69a, 0.4)); // light yellow-green
      const trunkH = height * 0.72;
      const trunk = new Mesh(new CylinderGeometry(0.05, 0.08, trunkH, 6), barkMaterial);
      trunk.position.y = trunkH / 2;
      trunk.rotation.z = rng.range(-0.04, 0.04);
      group.add(trunk);

      // Characteristic dark bark bands on the lower trunk.
      const bands = rng.int(2, 4);
      for (let i = 0; i < bands; i++) {
        const band = new Mesh(new CylinderGeometry(0.076, 0.076, 0.05, 6), bandMaterial);
        band.position.y = rng.range(trunkH * 0.15, trunkH * 0.8);
        group.add(band);
      }

      // Sparse, loose crown up high.
      const crownBase = trunkH * 0.85;
      const blobs = rng.int(3, 5);
      for (let i = 0; i < blobs; i++) {
        const r = height * rng.range(0.12, 0.19);
        const blob = new Mesh(new IcosahedronGeometry(r, 0), foliageMaterial);
        blob.position.set(
          rng.jitter(0, height * 0.14),
          crownBase + rng.range(0, height * 0.22),
          rng.jitter(0, height * 0.14)
        );
        blob.rotation.set(rng.range(0, Math.PI), rng.range(0, Math.PI), 0);
        group.add(blob);
      }
      return foliageMaterial;
    },
  },

  // Broad, flat horizontal tiers on a stout trunk — a spreading cedar.
  cedar: {
    heightRange: [4, 6],
    stiffness: 2.8,
    anchorFrac: 0.3,
    obstacleRadius: 0.75,
    build(group, rng, palette, height) {
      const trunkMaterial = mat(palette.trunk);
      const foliageMaterial = mat(tint(rng.pick(palette.foliage), 0x3a6b58, 0.45)); // blue-green
      const trunkH = height * 0.32;
      const trunk = new Mesh(new CylinderGeometry(0.13, 0.22, trunkH, 6), trunkMaterial);
      trunk.position.y = trunkH / 2;
      group.add(trunk);

      const tiers = rng.int(3, 4);
      const crownBase = trunkH * 0.8;
      const crownH = height - crownBase;
      const maxR = height * rng.range(0.4, 0.5); // broad
      for (let i = 0; i < tiers; i++) {
        const f = tiers > 1 ? i / (tiers - 1) : 0;
        const r = maxR * (1 - f * 0.45);
        const plate = new Mesh(new IcosahedronGeometry(r, 0), foliageMaterial);
        plate.position.set(rng.jitter(0, maxR * 0.1), crownBase + f * crownH * 0.9, rng.jitter(0, maxR * 0.1));
        plate.scale.y = 0.3; // flatten into a horizontal plate
        plate.rotation.y = rng.range(0, Math.PI);
        group.add(plate);
      }
      return foliageMaterial;
    },
  },

  // A full, rounded dome on a straight trunk. Reads green in a meadow palette
  // and blazes orange under the `autumn` palette.
  maple: {
    heightRange: [3.5, 5.5],
    stiffness: 2.2,
    anchorFrac: 0.24,
    obstacleRadius: 0.65,
    build(group, rng, palette, height) {
      const trunkMaterial = mat(palette.trunk);
      const foliageMaterial = mat(tint(rng.pick(palette.foliage), 0x86a83a, 0.2));
      const trunkH = height * 0.4;
      const trunk = new Mesh(new CylinderGeometry(0.12, 0.19, trunkH, 6), trunkMaterial);
      trunk.position.y = trunkH / 2;
      trunk.rotation.z = rng.range(-0.05, 0.05);
      group.add(trunk);

      const crownBase = trunkH + height * 0.12;
      const R = height * rng.range(0.28, 0.34);
      const center = new Mesh(new IcosahedronGeometry(R, 1), foliageMaterial); // detail 1 = rounder dome
      center.position.y = crownBase;
      center.rotation.set(rng.range(0, Math.PI), rng.range(0, Math.PI), 0);
      group.add(center);

      const ring = rng.int(4, 6);
      for (let i = 0; i < ring; i++) {
        const a = (i / ring) * Math.PI * 2 + rng.range(-0.2, 0.2);
        const r = R * rng.range(0.55, 0.75);
        const blob = new Mesh(new IcosahedronGeometry(r, 0), foliageMaterial);
        blob.position.set(Math.cos(a) * R * 0.75, crownBase - R * 0.15 + rng.range(-0.1, 0.2), Math.sin(a) * R * 0.75);
        blob.rotation.set(rng.range(0, Math.PI), rng.range(0, Math.PI), 0);
        group.add(blob);
      }
      return foliageMaterial;
    },
  },

  // A wide, low umbrella of blossom on a short dark trunk. `season` decides its
  // dress: pink in spring, green in summer, warm in autumn, bare in winter.
  sakura: {
    heightRange: [3, 4.6],
    stiffness: 2,
    anchorFrac: 0.3,
    obstacleRadius: 0.7,
    build(group, rng, palette, height, season) {
      const s = season ?? 'spring';
      const barkMaterial = mat(tint(palette.trunk, 0x2e2320, 0.4)); // dark cherry bark
      const trunkH = height * 0.4;
      const trunk = new Mesh(new CylinderGeometry(0.1, 0.16, trunkH, 6), barkMaterial);
      trunk.position.y = trunkH / 2;
      trunk.rotation.z = rng.range(-0.06, 0.06);
      group.add(trunk);
      branches(group, barkMaterial, rng, trunkH, rng.int(4, 6), height * 0.5);

      // Canopy colour by season (blossom pink is blossom pink, palette aside).
      const canopyColor =
        s === 'summer'
          ? tint(rng.pick(palette.foliage), 0x7fb04a, 0.2)
          : s === 'autumn'
            ? tint(rng.pick(palette.foliage), 0xe08a3a, 0.7)
            : tint(0xf3c1d6, 0xfdeaf1, rng.range(0, 0.4)); // spring blossom
      const canopyMaterial = mat(canopyColor);

      if (s !== 'winter') {
        const crownBase = trunkH + height * 0.16;
        const R = height * rng.range(0.34, 0.4);
        const center = new Mesh(new IcosahedronGeometry(R, 1), canopyMaterial);
        center.position.y = crownBase;
        center.scale.y = 0.55; // flatten into an umbrella
        group.add(center);
        const ring = rng.int(5, 7);
        for (let i = 0; i < ring; i++) {
          const a = (i / ring) * Math.PI * 2 + rng.range(-0.2, 0.2);
          const r = R * rng.range(0.5, 0.72);
          const blob = new Mesh(new IcosahedronGeometry(r, 0), canopyMaterial);
          blob.position.set(Math.cos(a) * R * 0.8, crownBase - R * 0.1 + rng.range(-0.05, 0.1), Math.sin(a) * R * 0.8);
          blob.scale.y = 0.6;
          group.add(blob);
        }
      }
      return canopyMaterial;
    },
  },

  // A curved bare stem crowned with long drooping fronds — a palm.
  palm: {
    heightRange: [5, 8],
    stiffness: 1.2,
    anchorFrac: 0.7,
    obstacleRadius: 0.4,
    build(group, rng, palette, height) {
      const trunkMaterial = mat(tint(0x9c7b4e, palette.trunk, 0.3)); // tan stem
      const crown = curvedTrunk(group, trunkMaterial, height * 0.86, 0.16, 0.1, height * 0.12);
      const frondMaterial = mat(tint(rng.pick(palette.foliage), 0x4e8f3a, 0.3));
      frondCrown(group, frondMaterial, rng, crown.x, crown.y, rng.int(9, 13), height * 0.42, 24);
      // A cluster of coconuts under the crown.
      const nutMaterial = mat(0x6b4a2f);
      const nuts = rng.int(2, 4);
      for (let i = 0; i < nuts; i++) {
        const a = (i / nuts) * Math.PI * 2;
        const nut = new Mesh(new IcosahedronGeometry(height * 0.045, 0), nutMaterial);
        nut.position.set(crown.x + Math.cos(a) * 0.12, crown.y - 0.12, Math.sin(a) * 0.12);
        group.add(nut);
      }
      return frondMaterial;
    },
  },

  // A rounded crown trailing a veil of long swaying strands — a weeping willow.
  willow: {
    heightRange: [4, 6],
    stiffness: 1.5,
    anchorFrac: 0.05,
    obstacleRadius: 0.7,
    build(group, rng, palette, height) {
      const trunkMaterial = mat(palette.trunk);
      const trunkH = height * 0.42;
      const trunk = new Mesh(new CylinderGeometry(0.12, 0.2, trunkH, 6), trunkMaterial);
      trunk.position.y = trunkH / 2;
      trunk.rotation.z = rng.range(-0.05, 0.05);
      group.add(trunk);

      const foliageMaterial = mat(tint(rng.pick(palette.foliage), 0xb6cf6e, 0.4)); // willow yellow-green
      const crownBase = trunkH + height * 0.22;
      const R = height * rng.range(0.32, 0.4);
      const dome = new Mesh(new IcosahedronGeometry(R, 1), foliageMaterial);
      dome.position.y = crownBase;
      dome.scale.y = 0.7;
      group.add(dome);

      // The signature: a veil of strands hanging from the canopy hem.
      droopStrands(group, foliageMaterial, rng, crownBase - R * 0.35, R * 0.95, rng.int(30, 38), height * 0.42, height * 0.72);
      return foliageMaterial;
    },
  },
};

/**
 * A seeded low-poly tree. Nine species — `pine` and `oak` (the originals), plus
 * `cypress` (a tall narrow flame), `birch` (slender, pale, banded), `cedar`
 * (broad flat tiers), `maple` (a full rounded dome), `sakura` (a blossom
 * umbrella), `palm` (a curved stem with drooping fronds) and `willow` (a veil of
 * swaying strands) — each with its own silhouette, colour, wind response and
 * steering footprint. Same seed → identical tree, forever.
 *
 * New species are opt-in via `species`; with none given, a forest stays the
 * familiar pine/oak mix, so existing scenes are untouched. `season` dresses a
 * `sakura` — pink in spring, green in summer, warm in autumn, bare in winter.
 *
 * ```ts
 * const cypress = createTree({ species: 'cypress', seed: 7 });
 * const bloom = createTree({ species: 'sakura', season: 'spring' });
 * const palm = createTree({ species: 'palm', seed: 3 });
 * ```
 */
export function createTree(options: TreeOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  // Default stays pine/oak (one rng draw), so seeded forests never change.
  const species = options.species ?? options.style ?? (rng.next() < 0.6 ? 'pine' : 'oak');
  const recipe = SPECIES[species];
  const height = options.height ?? rng.range(recipe.heightRange[0], recipe.heightRange[1]);

  const group = new Group();
  group.name = `tree-${species}`;
  const foliageMaterial = recipe.build(group, rng, palette, height, options.season);

  // Only the canopy sways — the trunk material is left unbound, so it stays
  // planted. (For a scattered forest, prefer applyWind(forest.group), which
  // drives the shared clock from the rendered InstancedMesh.)
  if (options.wind) {
    options.wind.bind(foliageMaterial, {
      height,
      stiffness: recipe.stiffness,
      anchor: height * recipe.anchorFrac,
    });
    options.wind.attach(group);
  }

  return { object: group, obstacleRadius: recipe.obstacleRadius };
}
