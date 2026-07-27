import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
} from 'three';
import { Rng } from '../core/random';
import { createSurface } from '../materials/surface';
import { wavingClothMaterial } from '../materials/clothWave';
import type { Prop } from '../core/types';

/**
 * Tropical trees whose leaves are CLOTH.
 *
 * A palm frond is, mechanically, a flag pinned at the stem: fixed at one
 * edge, free at the fly, rippled by the air, drooping under its own
 * weight. So these trees borrow the banner machinery wholesale — every
 * leaf is a tapered plane driven by the shared cloth-wave shader, with a
 * seeded phase of its own so no two leaves flutter in step. Rigid-leaf
 * palms read as plastic; fabric reads as alive, which is the whole trick.
 *
 * ```ts
 * const palm = createPalm({ seed: 7, height: 6 });
 * scene.add(palm.object);
 * game.onUpdate((t) => palm.update(t.delta));
 * ```
 *
 * Two species:
 * - **`createPalm`** — a coconut palm: curved trunk (the lean toward the
 *   water is the whole silhouette), a crown of long serrated-feel fronds,
 *   coconuts at the throat.
 * - **`createBananaTree`** — a banana plant: green pseudostem, huge
 *   paddle leaves that arch up and over — each leaf built as THREE cloth
 *   strips side by side, because banana leaves split along their veins
 *   and the strips fluttering out of phase with each other IS that split.
 */

export interface TropicalTree extends Prop {
  /** Advance the leaves' cloth. */
  update(dt: number): void;
  /** World-ish height of the crown/stem top, for dressing. */
  crownY: number;
}

export interface PalmOptions {
  seed?: number;
  /** Trunk height to the crown. Default seeded 4.5–6.5. */
  height?: number;
  /** Sideways lean of the whole trunk, radians. Default seeded 0.1–0.3. */
  lean?: number;
  /** Fronds in the crown. Default 9. */
  fronds?: number;
  /** Coconuts. Default seeded 2–4. */
  coconuts?: number;
}

export interface BananaOptions {
  seed?: number;
  /** Pseudostem height. Default seeded 1.6–2.4. */
  height?: number;
  /** Leaves. Default 6. */
  leaves?: number;
  /** Hang a bunch of bananas. Default seeded (about half of them). */
  fruiting?: boolean;
}

/** A tapered leaf strip: fixed edge at x=0, fly at x=len, width in Y. */
function leafGeometry(len: number, width: number, tipWidth: number): PlaneGeometry {
  const geo = new PlaneGeometry(len, width, 10, 2);
  geo.translate(len / 2, 0, 0);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    // Clamped: float32 storage can leave the fixed edge a few nanometres
    // NEGATIVE after the translate, and pow(-2e-8, 1.4) is NaN.
    const t = Math.max(0, pos.getX(i) / len);
    const taper = 1 - (1 - tipWidth / width) * Math.pow(t, 1.4);
    pos.setY(i, pos.getY(i) * taper);
  }
  return geo;
}

/**
 * Mount one cloth leaf on a crown: azimuth around the trunk, drooped by
 * `pitch`, fluttering with its own phase. Returns its wave uniforms.
 */
function mountLeaf(
  crown: Group,
  geo: PlaneGeometry,
  color: number,
  len: number,
  width: number,
  pitch: number,
  azimuth: number,
  phase: number,
  sag: number,
  amp: number,
  cacheKey: string
): { value: number } {
  const material = wavingClothMaterial({
    freeLen: len,
    crossLen: width,
    amp,
    waves: 1.6,
    speed: 1.7,
    sag,
    phase,
    cacheKey,
    color,
    roughness: 0.85,
  });
  const az = new Group();
  az.rotation.y = azimuth;
  const tilt = new Group();
  tilt.rotation.z = -pitch;
  const leaf = new Mesh(geo, material);
  leaf.rotation.x = -Math.PI / 2; // leaf lies flat; the cloth ripple turns vertical
  tilt.add(leaf);
  az.add(tilt);
  crown.add(az);
  return (material.userData.waveUniforms as { uTime: { value: number } }).uTime;
}

export function createPalm(options: PalmOptions = {}): TropicalTree {
  const rng = new Rng(options.seed ?? 1);
  const height = options.height ?? rng.range(4.5, 6.5);
  const lean = options.lean ?? rng.range(0.1, 0.3);
  const fronds = Math.max(4, options.fronds ?? 9);
  const coconuts = options.coconuts ?? Math.floor(rng.range(2, 5));

  const group = new Group();
  group.name = 'palm';
  const bark = createSurface('bark', { seed: options.seed ?? 1, color: 0x9b7d55 });

  // The trunk: stacked segments curving into the lean — a straight palm
  // reads as a lamp post.
  const segs = 7;
  let x = 0;
  let y = 0;
  let angle = 0;
  const trunk = new Group();
  trunk.name = 'trunk';
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const segLen = height / segs;
    const r0 = 0.16 * (1 - t * 0.5);
    const seg = new Mesh(new CylinderGeometry(r0 * 0.92, r0, segLen * 1.08, 7), bark);
    angle = lean * Math.pow(t, 1.4);
    seg.rotation.z = -angle;
    seg.position.set(x + Math.sin(angle) * segLen * 0.5, y + Math.cos(angle) * segLen * 0.5, 0);
    x += Math.sin(angle) * segLen;
    y += Math.cos(angle) * segLen;
    trunk.add(seg);
  }
  group.add(trunk);

  const crown = new Group();
  crown.name = 'crown';
  crown.position.set(x, y, 0);
  crown.rotation.z = -angle * 0.6;
  group.add(crown);

  const times: Array<{ value: number }> = [];
  const frondGeo = leafGeometry(2.3, 0.5, 0.06);
  for (let i = 0; i < fronds; i++) {
    const shade = 0x2f7d3a + Math.floor(rng.next() * 3) * 0x000a04;
    // Upper fronds reach out; lower ones hang — the fountain silhouette.
    const pitch = 0.15 + (i / fronds) * 1.15 + rng.range(-0.08, 0.08);
    times.push(
      mountLeaf(
        crown,
        frondGeo,
        shade,
        2.3,
        0.5,
        pitch,
        (i / fronds) * Math.PI * 2 + rng.range(-0.2, 0.2),
        rng.next() * Math.PI * 2,
        0.55,
        0.09,
        'scena-palm-frond'
      )
    );
  }

  const nutMat = new MeshStandardMaterial({ color: 0x6d5a30, roughness: 0.9, flatShading: true });
  for (let i = 0; i < coconuts; i++) {
    const nut = new Mesh(new SphereGeometry(0.11, 7, 6), nutMat);
    const a = rng.next() * Math.PI * 2;
    nut.position.set(Math.cos(a) * 0.16, -0.12, Math.sin(a) * 0.16);
    nut.name = 'coconut';
    crown.add(nut);
  }

  let time = rng.next() * 10;
  return {
    object: group,
    obstacleRadius: 0.3,
    crownY: y,
    update(dt: number): void {
      time += dt;
      for (const t of times) t.value = time;
      // The whole crown breathes a little on top of the flutter.
      crown.rotation.x = Math.sin(time * 0.4) * 0.02;
    },
  };
}

export function createBananaTree(options: BananaOptions = {}): TropicalTree {
  const rng = new Rng(options.seed ?? 1);
  const height = options.height ?? rng.range(1.6, 2.4);
  const leaves = Math.max(3, options.leaves ?? 6);
  const fruiting = options.fruiting ?? rng.next() < 0.5;

  const group = new Group();
  group.name = 'banana';

  const stem = new Mesh(
    new CylinderGeometry(0.07, 0.13, height, 7),
    new MeshStandardMaterial({ color: 0x7fa04a, roughness: 0.8, flatShading: true })
  );
  stem.name = 'stem';
  stem.position.y = height / 2;
  group.add(stem);

  const crown = new Group();
  crown.name = 'crown';
  crown.position.y = height;
  group.add(crown);

  const times: Array<{ value: number }> = [];
  const len = 1.7;
  const stripW = 0.24;
  for (let i = 0; i < leaves; i++) {
    const azimuth = (i / leaves) * Math.PI * 2 + rng.range(-0.25, 0.25);
    // Arch up and over: pitched UP at the stem, sagged down at the tip.
    const pitch = -0.55 + rng.range(-0.1, 0.1) + (i % 2) * 0.25;
    const shade = 0x3a8a3f + (i % 3) * 0x000c05;
    // THREE strips per leaf, fluttering out of phase: the split of a
    // banana leaf along its veins, done with fabric instead of cuts.
    for (const off of [-1, 0, 1]) {
      const geo = leafGeometry(len, stripW, 0.09);
      geo.translate(0, off * (stripW + 0.015), 0);
      times.push(
        mountLeaf(
          crown,
          geo,
          shade,
          len,
          stripW * 3.2,
          pitch,
          azimuth,
          rng.next() * Math.PI * 2,
          0.75,
          0.07,
          'scena-banana-leaf'
        )
      );
    }
  }

  if (fruiting) {
    const bunch = new Group();
    bunch.name = 'bunch';
    const skin = new MeshStandardMaterial({ color: 0xd9c353, roughness: 0.75, flatShading: true });
    for (let tier = 0; tier < 3; tier++) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const banana = new Mesh(new CylinderGeometry(0.022, 0.03, 0.16, 5), skin);
        banana.position.set(Math.cos(a) * 0.07, -tier * 0.12, Math.sin(a) * 0.07);
        banana.rotation.z = 0.35;
        banana.rotation.y = -a;
        bunch.add(banana);
      }
    }
    bunch.position.set(0.16, -0.2, 0);
    crown.add(bunch);
  }

  let time = rng.next() * 10;
  return {
    object: group,
    obstacleRadius: 0.25,
    crownY: height,
    update(dt: number): void {
      time += dt;
      for (const t of times) t.value = time;
      crown.rotation.y = Math.sin(time * 0.3) * 0.015;
    },
  };
}
