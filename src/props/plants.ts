import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createVessel } from './vessels';
import type { Prop } from '../core/types';

/**
 * Houseplants.
 *
 * The trap here is worth stating before the code, because it is the only
 * thing that matters: **plants read by silhouette, not by colour.** Six
 * species that are all "green ball on a stalk" in six different greens is
 * one plant, six times, and no amount of leaf detail rescues it. So the
 * species below differ *structurally* — upright blades, drooping strands, a
 * dense low mound, a bare column with pads, a thin trunk under a canopy, a
 * flat rosette — and the colour is chosen afterwards.
 *
 * ```ts
 * const plant = createPlant({ species: 'trailing', seed: 3 });
 * placeOn(shelf.surfaces[0], plant, { along: 0.2 });
 * ```
 *
 * The pot is a `createVessel` lathe, which is the whole reason that track
 * came first: a houseplant in a box would undo it.
 */
export type PlantSpecies =
  /** Tall stiff blades fanning up from the soil. */
  | 'snake'
  /** A low crown with strands hanging over the rim and down. */
  | 'trailing'
  /** A dense low mound of arcing fronds. */
  | 'fern'
  /** A bare column with a pad or two, and no leaves at all. */
  | 'cactus'
  /** A thin trunk under a loose canopy — the corner tree. */
  | 'ficus'
  /** A flat rosette of thick leaves, barely above the soil. */
  | 'succulent';

export const PLANT_SPECIES: PlantSpecies[] = [
  'snake',
  'trailing',
  'fern',
  'cactus',
  'ficus',
  'succulent',
];

/** Rough natural height above the soil, in metres, before seeded variation. */
const FOLIAGE_HEIGHT: Record<PlantSpecies, number> = {
  snake: 0.5,
  trailing: 0.2,
  fern: 0.26,
  cactus: 0.34,
  ficus: 0.75,
  succulent: 0.09,
};

/**
 * Pot height as a fraction of the foliage height.
 *
 * A trailing plant gets a TALL pot, because that is what real ones are put
 * in: the whole species is defined by strands hanging down, and a plant with
 * nothing to hang down past is a small bush. This is the difference between
 * six silhouettes and five.
 */
const POT_RATIO: Record<PlantSpecies, number> = {
  snake: 0.42,
  trailing: 1.15,
  fern: 0.5,
  cactus: 0.5,
  ficus: 0.38,
  succulent: 0.9,
};

export interface PlantOptions {
  species?: PlantSpecies;
  /** Overall height including the pot. Defaults to the species' own. */
  height?: number;
  /** Skip the pot — for planting into a trough or a window box. */
  pot?: boolean;
  /**
   * How far foliage may hang below the soil, in metres.
   *
   * A potted plant on a shelf must stop at the base of its own pot, or the
   * strands go through it and out under the shelf — and every placement
   * helper then lifts the whole plant to clear them, floating the pot. But an
   * UNPOTTED one has been planted into something with a rim of its own, and
   * that host knows how deep it is. Defaults to the pot height when potted;
   * pass it when planting into a trough or a basket.
   */
  drop?: number;
  /** Foliage colour. Defaults to a seeded pick from the palette. */
  color?: number;
  seed?: number;
  palette?: Palette;
}

export interface Plant extends Prop {
  species: PlantSpecies;
  /** Total height in metres. */
  height: number;
  /** Where the soil surface is, for planting several in one trough. */
  soil: number;
}

function leafMaterial(rng: Rng, palette: Palette, color: number | undefined): MeshStandardMaterial {
  const base = new Color(color ?? rng.pick(palette.foliage));
  return new MeshStandardMaterial({
    color: base.offsetHSL(rng.range(-0.03, 0.03), rng.range(-0.1, 0.05), rng.range(-0.08, 0.06)).getHex(),
    roughness: 0.82,
    flatShading: true,
  });
}

/** Build the greenery for a species into `group`, rising from y = 0. */
function grow(
  group: Group,
  species: PlantSpecies,
  rng: Rng,
  palette: Palette,
  color: number | undefined,
  height: number,
  spread: number,
  /**
   * How far below the soil anything may hang. A potted plant on a shelf must
   * stop at the base of its own pot: strands that carry on past it go through
   * the pot and out under the shelf, and every placement helper then lifts
   * the whole plant to clear them, floating the pot in mid-air.
   */
  maxDrop: number
): number {
  let radius = spread;

  if (species === 'snake') {
    // Stiff blades, splayed slightly, each twisted so the fan is not flat.
    const blades = 5 + Math.floor(rng.next() * 4);
    for (let i = 0; i < blades; i++) {
      const h = height * rng.range(0.6, 1);
      const blade = new Mesh(new BoxGeometry(spread * 0.34, h, 0.008), leafMaterial(rng, palette, color));
      const a = (i / blades) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const lean = rng.range(0.08, 0.26);
      blade.position.set(Math.cos(a) * spread * 0.2, (h / 2) * Math.cos(lean), Math.sin(a) * spread * 0.2);
      blade.rotation.set(Math.sin(a) * lean, a, -Math.cos(a) * lean);
      group.add(blade);
    }
    radius = spread * 0.6;
  } else if (species === 'trailing') {
    // A small crown, then strands that go OVER the rim and hang. The hang is
    // the species: a trailing plant that stays inside its pot is a fern.
    const crown = new Mesh(new IcosahedronGeometry(spread * 0.42, 0), leafMaterial(rng, palette, color));
    crown.scale.y = 0.5;
    crown.position.y = height * 0.5;
    group.add(crown);
    const strands = 4 + Math.floor(rng.next() * 4);
    for (let i = 0; i < strands; i++) {
      const a = (i / strands) * Math.PI * 2 + rng.range(-0.4, 0.4);
      // Reach all the way to whatever the strands are allowed to fall to,
      // measured from where they leave the crown — not a fixed length that
      // then gets clipped to nothing on a short pot.
      const reach = height * 0.4 + maxDrop;
      const drop = reach * rng.range(0.55, 1);
      const segs = 4 + Math.floor(rng.next() * 3);
      const mat = leafMaterial(rng, palette, color);
      for (let s = 0; s < segs; s++) {
        const t = (s + 1) / segs;
        const leaf = new Mesh(new BoxGeometry(0.026, 0.012, 0.038), mat);
        // Out over the rim first, then straight down — an arc, not a spike.
        const out = spread * (0.5 + Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * 0.42);
        leaf.position.set(Math.cos(a) * out, height * 0.4 - t * t * drop, Math.sin(a) * out);
        leaf.rotation.set(rng.range(-0.4, 0.4), a, rng.range(-0.5, 0.5));
        group.add(leaf);
      }
      radius = Math.max(radius, spread * 0.95);
    }
  } else if (species === 'fern') {
    // Many short fronds arcing out and over — a mound with a soft edge.
    const fronds = 9 + Math.floor(rng.next() * 6);
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + rng.range(-0.25, 0.25);
      const len = height * rng.range(0.7, 1.15);
      const arc = rng.range(0.7, 1.15);
      const frond = new Mesh(new BoxGeometry(len, 0.01, 0.05), leafMaterial(rng, palette, color));
      frond.position.set(
        Math.cos(a) * len * 0.42,
        height * rng.range(0.4, 0.7),
        Math.sin(a) * len * 0.42
      );
      frond.rotation.set(0, -a, arc * 0.5);
      group.add(frond);
    }
    radius = spread * 1.25;
  } else if (species === 'cactus') {
    // No leaves at all, which is exactly what makes it read.
    const mat = leafMaterial(rng, palette, color);
    const trunk = new Mesh(new CylinderGeometry(spread * 0.3, spread * 0.34, height, 8), mat);
    trunk.position.y = height / 2;
    group.add(trunk);
    const arms = Math.floor(rng.next() * 3);
    for (let i = 0; i < arms; i++) {
      const s = i % 2 === 0 ? 1 : -1;
      const at = height * rng.range(0.35, 0.6);
      const len = height * rng.range(0.22, 0.38);
      const elbow = new Mesh(new CylinderGeometry(spread * 0.17, spread * 0.19, len * 0.7, 7), mat);
      elbow.rotation.z = -s * Math.PI * 0.5;
      elbow.position.set(s * (spread * 0.3 + len * 0.35), at, rng.range(-0.02, 0.02));
      group.add(elbow);
      const up = new Mesh(new CylinderGeometry(spread * 0.15, spread * 0.17, len, 7), mat);
      up.position.set(s * (spread * 0.3 + len * 0.7), at + len / 2, elbow.position.z);
      group.add(up);
      radius = Math.max(radius, spread * 0.3 + len * 0.85);
    }
  } else if (species === 'ficus') {
    // A visible bare trunk under the canopy. Without the gap it is a bush.
    const trunkH = height * rng.range(0.42, 0.55);
    const trunk = new Mesh(
      new CylinderGeometry(height * 0.018, height * 0.028, trunkH, 6),
      createSurface('bark', { color: palette.trunk, seed: rng.int(1, 1e9) })
    );
    trunk.position.y = trunkH / 2;
    trunk.rotation.z = rng.range(-0.06, 0.06);
    group.add(trunk);
    const clumps = 4 + Math.floor(rng.next() * 4);
    for (let i = 0; i < clumps; i++) {
      const r = spread * rng.range(0.42, 0.72);
      const clump = new Mesh(new IcosahedronGeometry(r, 0), leafMaterial(rng, palette, color));
      const a = (i / clumps) * Math.PI * 2 + rng.range(-0.5, 0.5);
      clump.position.set(
        Math.cos(a) * spread * rng.range(0.1, 0.5),
        trunkH + rng.range(0, height - trunkH) * 0.8 + r * 0.4,
        Math.sin(a) * spread * rng.range(0.1, 0.5)
      );
      clump.scale.y = rng.range(0.65, 0.9);
      group.add(clump);
      radius = Math.max(radius, spread * 0.5 + r);
    }
  } else {
    // A rosette: flat leaves radiating out in two layers, barely proud of
    // the soil. Height is what it does NOT have.
    for (let ring = 0; ring < 2; ring++) {
      const leaves = ring === 0 ? 7 : 5;
      for (let i = 0; i < leaves; i++) {
        const a = (i / leaves) * Math.PI * 2 + ring * 0.4;
        const len = spread * (ring === 0 ? rng.range(0.8, 1.0) : rng.range(0.45, 0.62));
        const leaf = new Mesh(
          new BoxGeometry(len, height * rng.range(0.3, 0.45), len * 0.42),
          leafMaterial(rng, palette, color)
        );
        const rise = ring === 0 ? rng.range(0.15, 0.3) : rng.range(0.5, 0.8);
        leaf.position.set(
          Math.cos(a) * len * 0.45,
          height * (0.2 + ring * 0.3),
          Math.sin(a) * len * 0.45
        );
        leaf.rotation.set(0, -a, rise);
        group.add(leaf);
      }
    }
    radius = spread * 1.1;
  }
  return radius;
}

/** A potted houseplant. */
export function createPlant(options: PlantOptions = {}): Plant {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const species = options.species ?? PLANT_SPECIES[Math.floor(rng.next() * PLANT_SPECIES.length)];
  const palette = options.palette ?? DEFAULT_PALETTE;
  const withPot = options.pot ?? true;

  const group = new Group();
  group.name = `plant-${species}`;

  const natural = FOLIAGE_HEIGHT[species];
  const scale = options.height ? options.height / (natural * 1.35) : rng.range(0.82, 1.2);
  const foliageH = natural * scale;

  let soil = 0;
  let radius = foliageH * 0.34;

  if (withPot) {
    // The pot is a lathe. A houseplant standing in a box would undo the
    // entire point of having built the vessel generator.
    const pot = createVessel({
      style: 'pot',
      height: Math.max(0.07, foliageH * POT_RATIO[species]),
      seed: seed + 11,
      color: rng.pick([0xa9603f, 0xb8b0a4, 0x8d7a63, 0x5f6b63]),
      palette,
    });
    group.add(pot.object);
    soil = pot.height * 0.72;
    radius = pot.radius;
    const earth = new Mesh(
      new CylinderGeometry(pot.radius * 0.82, pot.radius * 0.82, 0.012, 12),
      createSurface('dirt', { seed })
    );
    earth.position.y = soil;
    group.add(earth);
  }

  const foliage = new Group();
  foliage.name = 'foliage';
  foliage.position.y = soil;
  group.add(foliage);
  const spread = Math.max(radius, foliageH * 0.32);
  const maxDrop = options.drop ?? (withPot ? soil : 0.12);
  radius = Math.max(
    radius,
    grow(foliage, species, rng, palette, options.color, foliageH, spread, maxDrop)
  );

  return {
    object: group,
    obstacleRadius: 0,
    species,
    height: soil + foliageH,
    soil,
  };
}

export interface HangingPlantOptions extends PlantOptions {
  /** Length of the cords above the pot. Default 0.3. */
  cord?: number;
}

/**
 * A plant in a hanging basket.
 *
 * The origin is at the **fixing point**, with everything below it, because a
 * hanging thing is positioned by where it is hung from — the same argument
 * as the tapestry's rod.
 */
export function createHangingPlant(options: HangingPlantOptions = {}): Plant {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const cord = options.cord ?? 0.3;
  const plant = createPlant({
    ...options,
    species: options.species ?? (rng.next() < 0.65 ? 'trailing' : 'fern'),
    // The whole point of a hanging basket is that things hang out of it.
    drop: options.drop ?? 0.35,
    seed,
  });

  const group = new Group();
  group.name = 'hangingPlant';
  plant.object.position.y = -cord - plant.height;
  group.add(plant.object);

  const cordMat = new MeshStandardMaterial({ color: 0x6b6153, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const line = new Mesh(new CylinderGeometry(0.0035, 0.0035, cord, 4), cordMat);
    line.position.set((Math.cos(a) * plant.height) / 6, -cord / 2, (Math.sin(a) * plant.height) / 6);
    line.rotation.set(Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.14);
    group.add(line);
  }
  const ring = new Mesh(new CylinderGeometry(0.012, 0.012, 0.006, 8), cordMat);
  ring.position.y = -0.004;
  group.add(ring);

  return {
    object: group,
    obstacleRadius: 0,
    species: plant.species,
    height: cord + plant.height,
    soil: plant.soil,
  };
}

export interface WindowBoxOptions {
  /** Trough length in metres. Default 0.8. */
  length?: number;
  seed?: number;
  palette?: Palette;
}

/** A window trough with several plants in it, sharing one bed of soil. */
export function createWindowBox(options: WindowBoxOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const length = options.length ?? 0.8;
  const depth = 0.16;
  const wall = 0.14;

  const group = new Group();
  group.name = 'windowBox';
  const box = new Mesh(
    new BoxGeometry(length, wall, depth),
    createSurface('wood', { color: palette.woodDark, seed })
  );
  box.position.y = wall / 2;
  group.add(box);
  const earth = new Mesh(
    new BoxGeometry(length - 0.02, 0.02, depth - 0.02),
    createSurface('dirt', { seed: seed + 1 })
  );
  earth.position.y = wall - 0.008;
  group.add(earth);

  // Mixed planting: something upright at the back, something trailing over
  // the front. A trough of one species is a hedge.
  const count = Math.max(2, Math.round(length / 0.22));
  for (let i = 0; i < count; i++) {
    const front = rng.next() < 0.45;
    const plant = createPlant({
      species: front ? 'trailing' : rng.pick(['fern', 'succulent', 'snake'] as PlantSpecies[]),
      pot: false,
      drop: wall - 0.02,
      height: front ? 0.14 : rng.range(0.16, 0.26),
      seed: seed * 7 + i * 13 + 1,
      palette,
    });
    plant.object.position.set(
      -length / 2 + ((i + 0.5) / count) * length + rng.range(-0.02, 0.02),
      wall - 0.01,
      front ? depth * rng.range(0.16, 0.28) : -depth * rng.range(0.1, 0.24)
    );
    plant.object.rotation.y = rng.next() * Math.PI * 2;
    group.add(plant.object);
  }
  return { object: group, obstacleRadius: 0 };
}
