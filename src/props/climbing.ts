import { BoxGeometry, CylinderGeometry, Group, Mesh, Object3D, TorusGeometry } from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

/**
 * Things to climb, and the tack that goes on a horse.
 *
 * Both exist to be *met* by an ANIMA character: the ladder publishes the
 * anchors its `Climb` controller needs, and the saddle and bridle are
 * built to the fixtures a `createQuadruped` already carries, so a rider
 * lands in the seat and the reins run to the mouth without any runtime IK.
 */

export type LadderStyle = 'wooden' | 'steel' | 'rope';

export interface LadderOptions {
  seed?: number;
  /** Height to the top rung, metres. Default 3.2. */
  height?: number;
  /** 'wooden' rungs, a 'steel' fixed ladder, or a 'rope' ladder. */
  style?: LadderStyle;
  /** Width between the rails. Default 0.44. */
  width?: number;
  palette?: Palette;
}

/**
 * A climbable ladder. Publishes `bottom`, `top` and `rungSpacing` —
 * structurally ANIMA's `Climbable`, so it drops straight into
 * `new Climb(rig, loco).start(ladder)` with no cross-imports.
 *
 * `rungSpacing` is the contract that matters: ANIMA drives the body up by
 * exactly that much per half-cycle of the climb loop, so hands land on
 * rungs rather than sliding past them.
 */
export interface Ladder extends Prop {
  /** Floor-level anchor at the foot; +z faces INTO the rungs. */
  bottom: Object3D;
  /** Anchor level with the top rung, where the climber steps off. */
  top: Object3D;
  rungSpacing: number;
  rungs: number;
}

export function createLadder(options: LadderOptions = {}): Ladder {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const height = options.height ?? 3.2;
  const style = options.style ?? 'wooden';
  const width = options.width ?? 0.44;
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = `ladder-${style}`;
  // Rungs a comfortable stride apart — close enough that a climber never
  // has to stretch, which is what makes the spacing look right.
  const rungSpacing = style === 'rope' ? 0.32 : 0.3;
  const rungs = Math.max(2, Math.floor(height / rungSpacing));

  const wood = createSurface('wood', { color: palette.wood, seed });
  const dark = createSurface('wood', { color: palette.woodDark, seed: seed + 1 });
  const steel = createSurface('metal', { color: palette.metal, seed: seed + 2 });
  const rope = createSurface('canvas', { color: 0xb9a274, seed: seed + 3 });

  const railMat = style === 'steel' ? steel : style === 'rope' ? rope : wood;
  const rungMat = style === 'steel' ? steel : style === 'rope' ? dark : dark;

  if (style === 'rope') {
    // A rope ladder hangs, so the rails sag a little between fixings.
    for (const side of [-1, 1]) {
      const rail = new Mesh(new CylinderGeometry(0.018, 0.018, height, 5), railMat);
      rail.position.set(side * width * 0.5, height * 0.5, 0);
      rail.rotation.z = side * 0.012;
      group.add(rail);
    }
  } else {
    for (const side of [-1, 1]) {
      const rail =
        style === 'steel'
          ? new Mesh(new CylinderGeometry(0.026, 0.026, height, 7), railMat)
          : new Mesh(new BoxGeometry(0.06, height, 0.045), railMat);
      rail.position.set(side * width * 0.5, height * 0.5, 0);
      group.add(rail);
    }
    // Steel ladders are bolted to a wall with standoff brackets.
    if (style === 'steel') {
      for (let i = 0; i < Math.max(2, Math.floor(height / 1.3)); i++) {
        const bracket = new Mesh(new BoxGeometry(width + 0.12, 0.04, 0.14), steel);
        bracket.position.set(0, 0.5 + i * 1.3, -0.08);
        group.add(bracket);
      }
    }
  }

  for (let i = 0; i < rungs; i++) {
    const y = (i + 1) * rungSpacing;
    const rung =
      style === 'wooden'
        ? new Mesh(new BoxGeometry(width, 0.035, 0.05), rungMat)
        : new Mesh(new CylinderGeometry(0.019, 0.019, width, 6), rungMat);
    if (style !== 'wooden') rung.rotation.z = Math.PI / 2;
    rung.position.set(0, y, 0);
    if (style === 'rope') rung.position.y += rng.range(-0.012, 0.012);
    if (style === 'wooden') rung.rotation.z = rng.range(-0.012, 0.012);
    group.add(rung);
  }

  // The anchors ANIMA climbs between. +z faces into the ladder, so a
  // climber standing on `bottom` is looking at the rungs.
  const bottom = new Object3D();
  bottom.name = 'ladder:bottom';
  bottom.position.set(0, 0, 0);
  group.add(bottom);
  const top = new Object3D();
  top.name = 'ladder:top';
  top.position.set(0, rungs * rungSpacing, 0);
  group.add(top);

  return {
    object: group,
    obstacleRadius: 0.3,
    bottom,
    top,
    rungSpacing,
    rungs,
  };
}

// ---- tack --------------------------------------------------------------

export type TackStyle = 'english' | 'western' | 'bareback';

export interface TackOptions {
  seed?: number;
  /** An 'english' saddle, a 'western' one with a horn, or 'bareback' pad. */
  style?: TackStyle;
  /** Withers height of the horse it goes on, metres. Default 1.62. */
  horseHeight?: number;
  /** Leather colour. */
  color?: number;
  palette?: Palette;
}

/**
 * A saddle, built to sit on ANIMA's `QuadrupedRig.saddle` fixture.
 *
 * ```ts
 * const tack = createSaddle({ horseHeight: horse.height });
 * horse.saddle.add(tack.object);        // it lands where the seat is
 * ```
 *
 * The stirrups hang where the rider's foot goes, which is the whole point:
 * ANIMA's ride pose puts the heel down at that height, so the two meet by
 * construction rather than by fiddling.
 */
export function createSaddle(options: TackOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const style = options.style ?? 'english';
  const H = options.horseHeight ?? 1.62;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const leather = createSurface('leather', { color: options.color ?? 0x6b4326, seed });
  const dark = createSurface('leather', { color: 0x4a2d19, seed: seed + 1 });
  const iron = createSurface('metal', { color: palette.metal, seed: seed + 2 });

  const group = new Group();
  group.name = `saddle-${style}`;
  const scale = H / 1.62;

  if (style === 'bareback') {
    const pad = new Mesh(new BoxGeometry(0.4 * scale, 0.03 * scale, 0.46 * scale), leather);
    group.add(pad);
  } else {
    // Seat, with a cantle behind and a pommel in front — the dip between
    // them is where the rider sits, and it is why a saddle has a shape.
    const seat = new Mesh(new BoxGeometry(0.36 * scale, 0.06 * scale, 0.44 * scale), leather);
    group.add(seat);
    const cantle = new Mesh(new BoxGeometry(0.34 * scale, 0.11 * scale, 0.07 * scale), leather);
    cantle.position.set(0, 0.06 * scale, -0.2 * scale);
    cantle.rotation.x = -0.3;
    group.add(cantle);
    const pommel = new Mesh(new BoxGeometry(0.28 * scale, 0.08 * scale, 0.07 * scale), leather);
    pommel.position.set(0, 0.05 * scale, 0.2 * scale);
    pommel.rotation.x = 0.25;
    group.add(pommel);
    // Skirts down each side, and the girth that actually holds it on.
    for (const side of [-1, 1]) {
      const skirt = new Mesh(new BoxGeometry(0.04 * scale, 0.26 * scale, 0.34 * scale), dark);
      skirt.position.set(side * 0.19 * scale, -0.13 * scale, 0);
      group.add(skirt);
      // Stirrup leather and iron, hung where a rider's foot goes.
      const strap = new Mesh(new BoxGeometry(0.03 * scale, 0.34 * scale, 0.02 * scale), dark);
      strap.position.set(side * 0.21 * scale, -0.3 * scale, 0.02 * scale);
      group.add(strap);
      const stirrup = new Mesh(new TorusGeometry(0.055 * scale, 0.012 * scale, 5, 8), iron);
      stirrup.position.set(side * 0.21 * scale, -0.5 * scale, 0.02 * scale);
      group.add(stirrup);
    }
    if (style === 'western') {
      // The horn: the one silhouette difference everybody recognises.
      const horn = new Mesh(new CylinderGeometry(0.028 * scale, 0.04 * scale, 0.1 * scale, 7), leather);
      horn.position.set(0, 0.13 * scale, 0.19 * scale);
      group.add(horn);
      const cap = new Mesh(new CylinderGeometry(0.05 * scale, 0.032 * scale, 0.022 * scale, 8), leather);
      cap.position.set(0, 0.19 * scale, 0.19 * scale);
      group.add(cap);
    }
  }

  return { object: group, obstacleRadius: 0 };
}

/**
 * A bridle: headstall, browband, bit and reins. Add it to the horse's
 * `Head` bone so it follows every nod.
 */
export function createBridle(options: TackOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const H = options.horseHeight ?? 1.62;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const leather = createSurface('leather', { color: options.color ?? 0x4a2d19, seed });
  const iron = createSurface('metal', { color: palette.metal, seed: seed + 1 });
  const scale = H / 1.62;

  const group = new Group();
  group.name = 'bridle';
  // Browband across the forehead, cheekpieces down each side, noseband.
  const brow = new Mesh(new BoxGeometry(0.13 * scale, 0.018 * scale, 0.02 * scale), leather);
  brow.position.set(0, 0.055 * scale, -0.005 * scale);
  group.add(brow);
  for (const side of [-1, 1]) {
    const cheek = new Mesh(new BoxGeometry(0.016 * scale, 0.2 * scale, 0.018 * scale), leather);
    cheek.position.set(side * 0.062 * scale, -0.07 * scale, 0.07 * scale);
    cheek.rotation.x = 0.5;
    group.add(cheek);
  }
  const noseband = new Mesh(new BoxGeometry(0.1 * scale, 0.02 * scale, 0.075 * scale), leather);
  noseband.position.set(0, -0.115 * scale, 0.19 * scale);
  noseband.rotation.x = 0.52;
  group.add(noseband);
  // Bit, at the corner of the mouth.
  const bit = new Mesh(new CylinderGeometry(0.008 * scale, 0.008 * scale, 0.12 * scale, 5), iron);
  bit.rotation.z = Math.PI / 2;
  bit.position.set(0, -0.16 * scale, 0.235 * scale);
  group.add(bit);
  // Reins, running back from the bit toward the rider's hands.
  for (const side of [-1, 1]) {
    const rein = new Mesh(new BoxGeometry(0.014 * scale, 0.012 * scale, 0.62 * scale), leather);
    rein.position.set(side * 0.055 * scale, -0.05 * scale, -0.05 * scale);
    rein.rotation.x = -0.62;
    group.add(rein);
  }

  return { object: group, obstacleRadius: 0 };
}
