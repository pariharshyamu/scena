import {
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

export type TreeSpecies = 'pine' | 'oak' | 'cypress' | 'birch' | 'cedar' | 'maple';

/** Every species `createTree` can build. */
export const TREE_SPECIES: readonly TreeSpecies[] = ['pine', 'oak', 'cypress', 'birch', 'cedar', 'maple'];

export interface TreeOptions {
  seed?: number;
  /** Overall height in world units. Default is species-specific. */
  height?: number;
  /** Which species. Default: a seeded pick of pine or oak (new species are opt-in). */
  species?: TreeSpecies;
  /** @deprecated Use `species`. Kept as an alias so old calls keep working. */
  style?: TreeSpecies;
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
  build(group: Group, rng: Rng, palette: Palette, height: number): MeshStandardMaterial;
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
};

/**
 * A seeded low-poly tree. Six species — `pine` and `oak` (the originals), plus
 * `cypress` (a tall narrow flame), `birch` (slender, pale, banded), `cedar`
 * (broad flat tiers) and `maple` (a full rounded dome) — each with its own
 * silhouette, colour, wind response and steering footprint. Same seed →
 * identical tree, forever.
 *
 * New species are opt-in via `species`; with none given, a forest stays the
 * familiar pine/oak mix, so existing scenes are untouched.
 *
 * ```ts
 * const cypress = createTree({ species: 'cypress', seed: 7 });
 * const grove = createTree({ species: 'maple', palette: PALETTES.autumn });
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
  const foliageMaterial = recipe.build(group, rng, palette, height);

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
