import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

/**
 * The shala — a place to practice.
 *
 * A yoga centre is the quietest gathering this library has: no seats, no
 * table, no fire — a deck, a grid of mats, and an orientation. The
 * orientation is the point. Surya namaskar faces the sun, so the shala
 * takes a **sunrise bearing** and lays every student mat facing it, with
 * the instructor's mat out front facing back at the class — the same
 * geometry a class controller (ANIMA's `YogaClass`) produces on its own,
 * offered here as a *place* instead of a formula.
 *
 * ```ts
 * const shala = createShala({ era: 'retreat', students: 8, sunrise: 0.4 });
 * shala.object.position.set(10, 0, -4);
 * scene.add(shala.object);
 *
 * // The handshake: one spot per mat, in WORLD space, instructor first.
 * for (const [i, spot] of shala.matSpots().entries()) {
 *   rigs[i].object.position.set(spot.x, deckTop, spot.z);
 *   rigs[i].object.rotation.y = spot.facing;
 * }
 * ```
 *
 * ## Eras
 *
 * Like the PA stacks, the shala has eras — the same practice, four rooms:
 *
 * - **ashram** — sandstone deck between carved columns, a low ashlar wall
 *   at the back, bronze finials. The oldest room.
 * - **studio** — parquet floor, a mirror wall with a barre. The room that
 *   rents by the hour.
 * - **rooftop** — concrete pad, perimeter railing, string lights sagging
 *   between the posts. The room with a skyline.
 * - **retreat** — teak planks under a bamboo pergola, planters at the
 *   corners, open on every side. The room that is barely a room.
 *
 * ## The spots are world-space, on purpose
 *
 * `matSpots()` converts through the prop's current transform at call time:
 * move or rotate the shala and the spots move with it, facing included.
 * Index 0 is always the instructor's mat. The deck is walk-through
 * (`obstacleRadius` 0) — a platform is a floor, not an obstacle.
 */

export type ShalaEra = 'ashram' | 'studio' | 'rooftop' | 'retreat';

export const SHALA_ERAS: ShalaEra[] = ['ashram', 'studio', 'rooftop', 'retreat'];

export interface ShalaOptions {
  seed?: number;
  /** Which room. Default: a seeded pick. */
  era?: ShalaEra;
  /** Student mats. Default 8. */
  students?: number;
  /** Mats per row. Default 4. */
  perRow?: number;
  /** Bearing of the sunrise about +Y, radians — the class faces it. Default 0 (+Z). */
  sunrise?: number;
}

/** One mat's stand-here, in world space. Index 0 is the instructor. */
export interface MatSpot {
  x: number;
  z: number;
  /** World yaw to stand at. Students face the sunrise; the instructor faces them. */
  facing: number;
}

export interface Shala extends Prop {
  era: ShalaEra;
  /** One spot per mat, world-space, converted at call time. Instructor first. */
  matSpots(): MatSpot[];
  /** A point above the instructor's mat — aim the class's gaze here. */
  focus: Object3D;
  /** Height of the deck surface above the prop's origin. */
  deckTop: number;
}

const MAT_COLORS = [0x7a4f9e, 0x3e7d78, 0x8a6d3b, 0x9e5540, 0x4f5d9e, 0x6b8747];

export function createShala(options: ShalaOptions = {}): Shala {
  const rng = new Rng(options.seed ?? 1);
  const era = options.era ?? SHALA_ERAS[Math.floor(rng.next() * SHALA_ERAS.length)];
  const students = Math.max(1, options.students ?? 8);
  const perRow = Math.max(1, options.perRow ?? 4);
  const sunrise = options.sunrise ?? 0;
  const rows = Math.ceil(students / perRow);
  const spacing = 1.7;
  const rowGap = 2.3;

  const group = new Group();
  group.name = 'shala';
  // Everything practice-shaped lives in an inner group rotated to the
  // sunrise, so the deck, the dressing and the mats all agree with it.
  const room = new Group();
  room.rotation.y = sunrise;
  group.add(room);

  // --- The floor plan, in practice space (+Z = the sun).
  const width = Math.max(Math.min(students, perRow) * spacing + 2.4, 6.2);
  const instructorZ = (rows * rowGap) / 2 + 0.6;
  const backZ = instructorZ - 1.9 - (rows - 1) * rowGap - 1.6;
  const depth = instructorZ - backZ + 2.6;
  const midZ = (instructorZ + backZ) / 2;
  const deckH = 0.14;

  const deckKind =
    era === 'ashram' ? 'sandstone' : era === 'studio' ? 'parquet' : era === 'rooftop' ? 'concrete' : 'teak';
  const deck = new Mesh(
    new BoxGeometry(width, deckH, depth),
    createSurface(deckKind, { seed: options.seed ?? 1 })
  );
  deck.name = 'deck';
  deck.position.set(0, deckH / 2, midZ);
  room.add(deck);

  // --- Mats: laid neatly, which for humans means ALMOST neatly. The
  // visual jitter stays out of the anchors — a class aligns to the spots,
  // not to the millimetre a mat was dropped.
  const matGeo = new BoxGeometry(0.66, 0.022, 1.95);
  const anchors: Object3D[] = [];
  const layMat = (x: number, z: number, facing: number, color: number): void => {
    const mat = new Mesh(
      matGeo,
      new MeshStandardMaterial({ color, roughness: 0.96, flatShading: true })
    );
    mat.name = 'mat';
    mat.position.set(x + rng.range(-0.04, 0.04), deckH + 0.011, z + rng.range(-0.04, 0.04));
    mat.rotation.y = facing + rng.range(-0.035, 0.035);
    room.add(mat);
    const anchor = new Object3D();
    anchor.name = 'matSpot';
    anchor.position.set(x, deckH, z);
    anchor.rotation.y = facing;
    room.add(anchor);
    anchors.push(anchor);
  };

  // Instructor first: out front, facing the class (back to the sun).
  layMat(0, instructorZ, Math.PI, 0xb5623a);
  for (let i = 0; i < students; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, students - row * perRow);
    const lat = ((i % perRow) - (inRow - 1) / 2) * spacing;
    layMat(lat, instructorZ - 1.9 - row * rowGap, 0, MAT_COLORS[Math.floor(rng.next() * MAT_COLORS.length)]);
  }

  const focus = new Object3D();
  focus.name = 'focus';
  focus.position.set(0, 1.2, instructorZ);
  room.add(focus);

  // --- Era dressing.
  const halfW = width / 2;
  if (era === 'ashram') {
    const columns = new Group();
    columns.name = 'columns';
    const colGeo = new CylinderGeometry(0.14, 0.17, 2.5, 8);
    const capGeo = new SphereGeometry(0.14, 8, 6);
    const stone = createSurface('sandstone', { seed: 2 });
    const bronze = createSurface('bronze', { seed: 3 });
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const z = backZ + 1.0 + (i * (depth - 2.0)) / 2;
        const col = new Mesh(colGeo, stone);
        col.position.set(side * (halfW - 0.35), deckH + 1.25, z);
        columns.add(col);
        const cap = new Mesh(capGeo, bronze);
        cap.position.set(side * (halfW - 0.35), deckH + 2.6, z);
        columns.add(cap);
      }
    }
    const wall = new Mesh(new BoxGeometry(width, 0.9, 0.3), createSurface('ashlar', { seed: 4 }));
    wall.position.set(0, deckH + 0.45, backZ + 0.15);
    columns.add(wall);
    room.add(columns);
  } else if (era === 'studio') {
    const wallGroup = new Group();
    wallGroup.name = 'mirror';
    const wall = new Mesh(new BoxGeometry(width, 2.5, 0.16), createSurface('plaster', { seed: 2 }));
    wall.position.set(0, deckH + 1.25, backZ + 0.08);
    wallGroup.add(wall);
    // The mirror: no reflections in a low-poly world, and FULL metalness
    // with nothing to reflect renders black — so this stays a cold bright
    // half-metal, which reads as glass from every angle that matters.
    const mirror = new Mesh(
      new BoxGeometry(width - 0.8, 1.9, 0.03),
      new MeshStandardMaterial({ color: 0xdde9f4, roughness: 0.1, metalness: 0.45 })
    );
    mirror.position.set(0, deckH + 1.35, backZ + 0.18);
    wallGroup.add(mirror);
    const barre = new Mesh(
      new CylinderGeometry(0.03, 0.03, width - 1.2, 8),
      createSurface('teak', { seed: 5 })
    );
    barre.rotation.z = Math.PI / 2;
    barre.position.set(0, deckH + 1.0, backZ + 0.34);
    wallGroup.add(barre);
    room.add(wallGroup);
  } else if (era === 'rooftop') {
    const railing = new Group();
    railing.name = 'railing';
    const steel = createSurface('steel', { seed: 2 });
    const postGeo = new BoxGeometry(0.05, 1.05, 0.05);
    const railGeo = new BoxGeometry(1, 0.05, 0.05);
    const run = (x0: number, z0: number, x1: number, z1: number): void => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const posts = Math.max(2, Math.round(len / 1.4) + 1);
      for (let i = 0; i < posts; i++) {
        const t = i / (posts - 1);
        const post = new Mesh(postGeo, steel);
        post.position.set(x0 + (x1 - x0) * t, deckH + 0.52, z0 + (z1 - z0) * t);
        railing.add(post);
      }
      const rail = new Mesh(railGeo, steel);
      rail.scale.x = len;
      rail.position.set((x0 + x1) / 2, deckH + 1.05, (z0 + z1) / 2);
      rail.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
      railing.add(rail);
      // String lights: small warm bulbs on a sagging line under the rail.
      const bulbs = Math.max(3, Math.round(len / 0.8));
      const bulbGeo = new SphereGeometry(0.035, 6, 5);
      for (let i = 1; i < bulbs; i++) {
        const t = i / bulbs;
        const sag = Math.sin(t * Math.PI) * 0.16;
        const bulb = new Mesh(
          bulbGeo,
          new MeshStandardMaterial({ color: 0xffe6b8, emissive: 0xffb35a, emissiveIntensity: 1.6 })
        );
        bulb.position.set(x0 + (x1 - x0) * t, deckH + 0.98 - sag, z0 + (z1 - z0) * t);
        railing.add(bulb);
      }
    };
    // Three sides — the sunrise side stays open. That is what the roof is for.
    run(-halfW + 0.1, backZ + 0.1, halfW - 0.1, backZ + 0.1);
    run(-halfW + 0.1, backZ + 0.1, -halfW + 0.1, midZ + depth / 2 - 0.1);
    run(halfW - 0.1, backZ + 0.1, halfW - 0.1, midZ + depth / 2 - 0.1);
    room.add(railing);
  } else {
    const pergola = new Group();
    pergola.name = 'pergola';
    const bamboo = createSurface('bark', { seed: 2, color: 0xa88d54 });
    const postGeo = new CylinderGeometry(0.07, 0.08, 2.6, 7);
    const frontZ = midZ + depth / 2 - 0.5;
    const rearZ = backZ + 0.5;
    for (const [px, pz] of [
      [-halfW + 0.5, rearZ], [halfW - 0.5, rearZ],
      [-halfW + 0.5, frontZ], [halfW - 0.5, frontZ],
    ]) {
      const post = new Mesh(postGeo, bamboo);
      post.position.set(px, deckH + 1.3, pz);
      pergola.add(post);
    }
    const beamGeo = new CylinderGeometry(0.055, 0.055, width - 0.6, 7);
    for (const bz of [rearZ, frontZ]) {
      const beam = new Mesh(beamGeo, bamboo);
      beam.rotation.z = Math.PI / 2;
      beam.position.set(0, deckH + 2.62, bz);
      pergola.add(beam);
    }
    const slatGeo = new CylinderGeometry(0.03, 0.03, frontZ - rearZ + 0.7, 6);
    const slats = Math.max(4, Math.round(width / 0.9));
    for (let i = 0; i < slats; i++) {
      const t = i / (slats - 1);
      const slat = new Mesh(slatGeo, bamboo);
      slat.rotation.x = Math.PI / 2;
      slat.position.set(-halfW + 0.6 + t * (width - 1.2), deckH + 2.72, (rearZ + frontZ) / 2);
      pergola.add(slat);
    }
    // Planters at the rear corners: a box of green where a wall would be.
    for (const side of [-1, 1]) {
      const planter = new Mesh(new BoxGeometry(0.6, 0.4, 0.6), createSurface('terracotta', { seed: 6 }));
      planter.position.set(side * (halfW - 0.7), deckH + 0.2, rearZ + 0.4);
      pergola.add(planter);
      const shrub = new Mesh(
        new BoxGeometry(0.55, 0.5, 0.55),
        new MeshStandardMaterial({ color: 0x5d7a3a, roughness: 1, flatShading: true })
      );
      shrub.position.set(side * (halfW - 0.7), deckH + 0.62, rearZ + 0.4);
      pergola.add(shrub);
    }
    room.add(pergola);
  }

  const pos = new Vector3();
  const quat = new Quaternion();
  const fwd = new Vector3();

  return {
    object: group,
    obstacleRadius: 0,
    era,
    deckTop: deckH,
    focus,
    matSpots(): MatSpot[] {
      group.updateWorldMatrix(true, true);
      return anchors.map((anchor) => {
        anchor.getWorldPosition(pos);
        anchor.getWorldQuaternion(quat);
        fwd.set(0, 0, 1).applyQuaternion(quat);
        return { x: pos.x, z: pos.z, facing: Math.atan2(fwd.x, fwd.z) };
      });
    },
  };
}
