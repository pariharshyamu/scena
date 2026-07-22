import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  SphereGeometry,
  type Material,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

export type StatueFigure = 'obelisk' | 'figure' | 'orb' | 'bust' | 'beast';
export type StatueMaterial = 'stone' | 'bronze';

export interface StatueOptions {
  seed?: number;
  /** What stands on the pedestal. Default seeded. */
  figure?: StatueFigure;
  /** Sculpture material. Default seeded (mostly stone). */
  material?: StatueMaterial;
  /** Overall height in metres (pedestal + figure). Default ~3.4. */
  height?: number;
  palette?: Palette;
}

const ALL_FIGURES: StatueFigure[] = ['obelisk', 'figure', 'orb', 'bust', 'beast'];

/**
 * A town statue or monument: a stepped stone pedestal carrying one of five
 * seeded figures — an `obelisk`, a robed `figure`, an `orb` monument, a
 * `bust`, or a guardian `beast`. Sculpted in weathered `stone` or patinated
 * `bronze`. A natural centrepiece for a plaza or the heart of a village.
 */
export function createStatue(options: StatueOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;
  const figure = options.figure ?? rng.pick(ALL_FIGURES);
  const material = options.material ?? (rng.next() < 0.72 ? 'stone' : 'bronze');
  const totalH = options.height ?? rng.range(3.1, 3.7);

  const group = new Group();
  group.name = 'statue';

  const stone = createSurface('stone', { color: rng.pick(palette.rock), seed });
  // Bronze: warm metal with a green patina drawn into the cavities.
  const sculptMat: Material =
    material === 'bronze'
      ? createSurface('metal', { color: 0x9a7b46, tint: 0x3f5f43, tintAmount: 0.34, seed: seed + 4 })
      : createSurface('stone', { color: rng.pick(palette.rock), seed: seed + 7 });

  // --- Stepped pedestal (always stone).
  const pedH = totalH * rng.range(0.32, 0.4);
  const baseW = totalH * 0.34;
  const tiers = 3;
  let y = 0;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const w = baseW * (1 - t * 0.34);
    const th = (pedH * 0.42) / tiers + (i === 0 ? 0.06 : 0);
    const step = new Mesh(new BoxGeometry(w, th, w), stone);
    step.position.y = y + th / 2;
    group.add(step);
    y += th;
  }
  // Plinth the figure stands on.
  const plinthW = baseW * 0.5;
  const plinthH = pedH - y;
  const plinth = new Mesh(new BoxGeometry(plinthW, plinthH, plinthW), stone);
  plinth.position.y = y + plinthH / 2;
  group.add(plinth);
  const topY = pedH;
  const figH = totalH - pedH;

  // --- The figure.
  const fig = new Group();
  fig.position.y = topY;
  group.add(fig);

  if (figure === 'obelisk') {
    const shaftH = figH * 0.86;
    const shaft = new Mesh(new CylinderGeometry(plinthW * 0.24, plinthW * 0.34, shaftH, 4), sculptMat);
    shaft.position.y = shaftH / 2;
    shaft.rotation.y = Math.PI / 4;
    fig.add(shaft);
    const cap = new Mesh(new ConeGeometry(plinthW * 0.24 * 1.35, figH * 0.16, 4), sculptMat);
    cap.position.y = shaftH + figH * 0.08;
    cap.rotation.y = Math.PI / 4;
    fig.add(cap);
  } else if (figure === 'orb') {
    const colH = figH * 0.62;
    const col = new Mesh(new CylinderGeometry(plinthW * 0.2, plinthW * 0.26, colH, 10), sculptMat);
    col.position.y = colH / 2;
    fig.add(col);
    const orb = new Mesh(new SphereGeometry(figH * 0.22, 16, 12), sculptMat);
    orb.position.y = colH + figH * 0.22;
    fig.add(orb);
    // A tilted ring around it (an armillary hint).
    const ring = new Mesh(new CylinderGeometry(figH * 0.28, figH * 0.28, 0.04, 20, 1, true), sculptMat);
    ring.position.copy(orb.position);
    ring.rotation.set(Math.PI / 2.4, 0, 0.2);
    fig.add(ring);
  } else if (figure === 'bust') {
    const colH = figH * 0.52;
    const col = new Mesh(new CylinderGeometry(plinthW * 0.22, plinthW * 0.3, colH, 8), sculptMat);
    col.position.y = colH / 2;
    fig.add(col);
    const shoulders = new Mesh(new CylinderGeometry(figH * 0.2, figH * 0.26, figH * 0.2, 7), sculptMat);
    shoulders.position.y = colH + figH * 0.1;
    fig.add(shoulders);
    fig.add(head(sculptMat, figH * 0.13, colH + figH * 0.32, rng));
  } else if (figure === 'beast') {
    // A seated guardian lion: haunches folded, chest upright, proud head.
    const s = figH * 0.5;
    // Rump low at the back, rising to an upright chest at the front.
    const rump = new Mesh(new BoxGeometry(s * 0.78, s * 0.62, s * 0.9), sculptMat);
    rump.position.set(0, s * 0.42, -s * 0.42);
    fig.add(rump);
    const chest = new Mesh(new BoxGeometry(s * 0.62, s * 0.95, s * 0.5), sculptMat);
    chest.position.set(0, s * 0.62, s * 0.32);
    fig.add(chest);
    // Brisket fills the centre between the forelegs (no see-through gap).
    const brisket = new Mesh(new BoxGeometry(s * 0.32, s * 0.78, s * 0.34), sculptMat);
    brisket.position.set(0, s * 0.3, s * 0.44);
    fig.add(brisket);
    for (const sx of [-1, 1]) {
      // Folded rear haunch.
      const haunch = new Mesh(new BoxGeometry(s * 0.26, s * 0.5, s * 0.7), sculptMat);
      haunch.position.set(sx * s * 0.32, s * 0.34, -s * 0.34);
      fig.add(haunch);
      // Straight foreleg down to a paw.
      const foreleg = new Mesh(new BoxGeometry(s * 0.2, s * 0.62, s * 0.22), sculptMat);
      foreleg.position.set(sx * s * 0.2, s * 0.31, s * 0.5);
      fig.add(foreleg);
      const paw = new Mesh(new BoxGeometry(s * 0.24, s * 0.14, s * 0.36), sculptMat);
      paw.position.set(sx * s * 0.2, s * 0.07, s * 0.62);
      fig.add(paw);
    }
    // Maned head over the chest.
    const mane = new Mesh(new SphereGeometry(s * 0.36, 10, 8), sculptMat);
    mane.position.set(0, s * 1.16, s * 0.36);
    mane.scale.set(1, 1, 0.9);
    fig.add(mane);
    const muzzle = new Mesh(new BoxGeometry(s * 0.22, s * 0.2, s * 0.28), sculptMat);
    muzzle.position.set(0, s * 1.08, s * 0.64);
    fig.add(muzzle);
    for (const sx of [-1, 1]) {
      const ear = new Mesh(new BoxGeometry(s * 0.09, s * 0.11, s * 0.05), sculptMat);
      ear.position.set(sx * s * 0.17, s * 1.4, s * 0.32);
      fig.add(ear);
    }
    const tail = new Mesh(new CylinderGeometry(s * 0.045, s * 0.07, s * 0.9, 6), sculptMat);
    tail.position.set(s * 0.34, s * 0.42, -s * 0.62);
    tail.rotation.set(0.6, 0, -0.5);
    fig.add(tail);
  } else {
    // 'figure': a robed standing figure.
    const robeH = figH * 0.62;
    const robe = new Mesh(new CylinderGeometry(figH * 0.14, figH * 0.24, robeH, 9), sculptMat);
    robe.position.y = robeH / 2;
    fig.add(robe);
    const torso = new Mesh(new CylinderGeometry(figH * 0.13, figH * 0.15, figH * 0.18, 8), sculptMat);
    torso.position.y = robeH + figH * 0.06;
    fig.add(torso);
    // Arms: one at the side, one raised or across (seeded pose).
    const raised = rng.next() < 0.5;
    for (const sx of [-1, 1]) {
      const arm = new Mesh(new CylinderGeometry(figH * 0.045, figH * 0.05, figH * 0.34, 6), sculptMat);
      if (raised && sx === 1) {
        arm.position.set(sx * figH * 0.16, robeH + figH * 0.12, figH * 0.02);
        arm.rotation.z = -0.9;
      } else {
        arm.position.set(sx * figH * 0.15, robeH - figH * 0.04, 0);
        arm.rotation.z = sx * 0.12;
      }
      fig.add(arm);
    }
    fig.add(head(sculptMat, figH * 0.1, robeH + figH * 0.24, rng));
  }

  return { object: group, obstacleRadius: baseW * 0.72 };
}

function head(mat: Material, r: number, y: number, rng: Rng): Group {
  const g = new Group();
  const skull = new Mesh(new SphereGeometry(r, 12, 10), mat);
  skull.scale.set(0.92, 1.08, 0.95);
  g.add(skull);
  g.position.y = y;
  g.rotation.y = rng.jitter(0, 0.15);
  return g;
}
