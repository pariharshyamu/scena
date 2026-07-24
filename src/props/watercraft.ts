import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createSlot } from '../core/types';
import { createRailing } from './modern';
import type { Prop } from '../core/types';

/**
 * Watercraft — hulls that genuinely ride the sea. `float(heightAt)` binds a
 * water sampler (`createOcean(...).heightAt` or `createWater`'s level) and
 * `update(dt, { speed })` bobs, pitches and rolls the hull on the waves
 * under it while it makes way. Helm slots seat an ANIMA character.
 */

export interface CraftInput {
  /** Way through the water, m/s. */
  speed?: number;
}

export interface CraftProp extends Prop {
  /** Bind the water: a sampler like `ocean.heightAt(x, z)`. */
  float(heightAt: (x: number, z: number) => number): void;
  /** Ride the waves + advance. Call from the game loop. */
  update(dt: number, input?: CraftInput): void;
}

export interface CraftOptions {
  seed?: number;
  color?: number;
  palette?: Palette;
}

/** Shared wave-riding: sample bow/stern/beam, set height, pitch and roll. */
function floating(group: Group, length: number, beam: number, draft: number): Pick<CraftProp, 'float' | 'update'> {
  let sampler: ((x: number, z: number) => number) | null = null;
  return {
    float(heightAt) {
      sampler = heightAt;
    },
    update() {
      if (!sampler) return;
      const { x, z } = group.position;
      const sin = Math.sin(group.rotation.y);
      const cos = Math.cos(group.rotation.y);
      const bow = sampler(x + sin * length * 0.4, z + cos * length * 0.4);
      const stern = sampler(x - sin * length * 0.4, z - cos * length * 0.4);
      const port = sampler(x - cos * beam * 0.5, z + sin * beam * 0.5);
      const starboard = sampler(x + cos * beam * 0.5, z - sin * beam * 0.5);
      group.position.y = (bow + stern + port + starboard) / 4 - draft;
      group.rotation.x = Math.atan2(stern - bow, length * 0.8) * 0.9;
      group.rotation.z = Math.atan2(port - starboard, beam) * 0.8;
    },
  };
}

/** An open motor boat: planked hull, bench seats, outboard, helm slot. */
export function createBoat(options: CraftOptions = {}): CraftProp {
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const hullPaint = createSurface('paintedMetal', { color: options.color ?? 0x2f6d8c, seed });
  const deck = createSurface('plank', { color: palette.wood, seed: seed + 1 });

  const group = new Group();
  group.name = 'boat';
  const L = 3.4;
  const hull = new Mesh(new BoxGeometry(1.3, 0.55, L), hullPaint);
  hull.position.y = 0.28;
  const bow = new Mesh(new BoxGeometry(0.9, 0.5, 0.8), hullPaint);
  bow.position.set(0, 0.33, L / 2 + 0.25);
  bow.rotation.x = 0.25;
  const sole = new Mesh(new BoxGeometry(1.1, 0.06, L - 0.3), deck);
  sole.position.y = 0.58;
  group.add(hull, bow, sole);
  for (const z of [0.5, -0.5]) {
    const bench = new Mesh(new BoxGeometry(1.1, 0.07, 0.3), deck);
    bench.position.set(0, 0.62 + 0.45 - 0.45, z); // thwart at GRIPS seat height above sole
    bench.position.y = 0.62;
    group.add(bench);
  }
  const outboard = new Mesh(new BoxGeometry(0.24, 0.5, 0.2), new MeshStandardMaterial({ color: 0x22262b, flatShading: true }));
  outboard.position.set(0, 0.62, -L / 2 - 0.08);
  group.add(outboard);

  // The helm: seated at the stern bench, hand on the tiller.
  const helm = createSlot('helm', 'sit', group, 0, 0.17, -0.5, Math.PI);
  const rider = createSlot('passenger', 'sit', group, 0, 0.17, 0.5);
  const base = floating(group, L, 1.3, 0.12);
  return { object: group, obstacleRadius: 2.0, slots: [helm, rider], ...base };
}

/** A small coastal ship: high hull, deckhouse, mast, railed deck. */
export function createShip(options: CraftOptions = {}): CraftProp {
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const hullPaint = createSurface('paintedMetal', { color: options.color ?? 0x8c3b32, seed });
  const white = createSurface('paint', { color: 0xe8e5dc, seed: seed + 1 });
  const deck = createSurface('plank', { color: palette.wood, seed: seed + 2 });

  const group = new Group();
  group.name = 'ship';
  const L = 11;
  const hull = new Mesh(new BoxGeometry(3.4, 1.7, L), hullPaint);
  hull.position.y = 0.8;
  const bow = new Mesh(new BoxGeometry(2.2, 1.5, 2.2), hullPaint);
  bow.position.set(0, 0.9, L / 2 + 0.7);
  bow.rotation.y = Math.PI / 4;
  const deckPlate = new Mesh(new BoxGeometry(3.3, 0.1, L - 0.2), deck);
  deckPlate.position.y = 1.7;
  group.add(hull, bow, deckPlate);
  const house = new Mesh(new BoxGeometry(2.4, 1.5, 3.2), white);
  house.position.set(0, 2.5, -1.6);
  group.add(house);
  const bridge = new Mesh(new BoxGeometry(2.6, 1.0, 1.2), white);
  bridge.position.set(0, 3.7, -0.9);
  group.add(bridge);
  const funnel = new Mesh(new CylinderGeometry(0.3, 0.36, 1.1, 8), hullPaint);
  funnel.position.set(0, 4.2, -2.4);
  group.add(funnel);
  const mast = new Mesh(new CylinderGeometry(0.05, 0.08, 3.4, 6), white);
  mast.position.set(0, 3.4, 3.4);
  group.add(mast);
  // Deck rails — the modern railing run, doing marine duty.
  for (const side of [-1, 1]) {
    const rail = createRailing({ style: 'bars', length: L - 1.4, seed: seed + 3, height: 0.85 });
    rail.object.position.set(side * 1.6, 1.75, 0);
    rail.object.rotation.y = Math.PI / 2;
    group.add(rail.object);
  }

  const helm = createSlot('helm', 'drive', group, 0, 3.25, -0.7);
  const base = floating(group, L, 3.4, 0.35);
  return { object: group, obstacleRadius: 6.0, slots: [helm], ...base };
}
