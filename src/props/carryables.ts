import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { Carryable } from '../core/types';

/**
 * Carryable props — things a character picks up and carries. Each returns a
 * `Carryable` (a `Prop` plus a `carry` style and hold-point `grip`), so it
 * drops into ANIMA's `Carry`: `new Carry(rig, loco).pickUp(createBarrel())`.
 * Origins sit at the base (place them on the ground); `grip` puts the hold
 * point where the hands go, so no runtime IK is needed.
 */

export interface CarryableOptions {
  seed?: number;
  color?: number;
  palette?: Palette;
}

/** A hooped wooden barrel — hugged to the chest (`crate` style). */
export function createBarrel(options: CarryableOptions = {}): Carryable {
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const H = 0.86;
  const R = 0.32;
  const stave = createSurface('wood', { color: options.color ?? palette.wood, seed });
  const iron = createSurface('steel', { seed: seed + 1 });

  const group = new Group();
  group.name = 'barrel';
  const body = new Mesh(new CylinderGeometry(R * 0.86, R * 0.86, H, 14), stave);
  body.position.y = H / 2;
  const bulge = new Mesh(new CylinderGeometry(R, R, H * 0.5, 14), stave);
  bulge.position.y = H / 2;
  group.add(body, bulge);
  for (const y of [H * 0.16, H * 0.5, H * 0.84]) {
    const hoop = new Mesh(new TorusGeometry(R * (y === H * 0.5 ? 1.02 : 0.9), 0.022, 6, 16), iron);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    group.add(hoop);
  }
  return { object: group, obstacleRadius: R * 1.1, carry: 'crate', grip: { y: -H / 2 } };
}

/** A woven basket with an arched handle — carried at the side, by the handle. */
export function createBasket(options: CarryableOptions = {}): Carryable {
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const rng = new Rng(seed);
  const bodyH = 0.3;
  const rTop = 0.22;
  const weave = createSurface('wood', { color: options.color ?? palette.woodDark, seed });

  const group = new Group();
  group.name = 'basket';
  const body = new Mesh(new CylinderGeometry(rTop, rTop * 0.72, bodyH, 12, 1, true), weave);
  body.position.y = bodyH / 2;
  const base = new Mesh(new CylinderGeometry(rTop * 0.72, rTop * 0.72, 0.03, 12), weave);
  base.position.y = 0.015;
  const rim = new Mesh(new TorusGeometry(rTop, 0.02, 6, 14), weave);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = bodyH;
  group.add(body, base, rim);
  // Arched handle over the top.
  const handle = new Mesh(new TorusGeometry(rTop * 0.9, 0.016, 5, 12, Math.PI), weave);
  handle.position.y = bodyH;
  group.add(handle);
  // A couple of loose contents for flavour.
  for (let i = 0; i < 3; i++) {
    const fruit = new Mesh(
      new SphereGeometry(0.05, 6, 6),
      new MeshStandardMaterial({ color: [0xd05a3a, 0xe0a52e, 0x6f8f3a][i], flatShading: true })
    );
    fruit.position.set(rng.range(-0.08, 0.08), bodyH - 0.03, rng.range(-0.08, 0.08));
    group.add(fruit);
  }
  return { object: group, obstacleRadius: rTop, carry: 'side', grip: { y: -0.14 } };
}

/** A cinched sack — hoisted onto the shoulder (`shoulder` style). */
export function createSack(options: CarryableOptions = {}): Carryable {
  const seed = options.seed ?? 1;
  const cloth = createSurface('canvas', { color: options.color ?? 0xcdb98a, seed });
  const cord = new MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.9, flatShading: true });

  const group = new Group();
  group.name = 'sack';
  const belly = new Mesh(new SphereGeometry(0.24, 10, 10), cloth);
  belly.scale.set(1, 1.25, 1);
  belly.position.y = 0.26;
  const neck = new Mesh(new CylinderGeometry(0.09, 0.14, 0.14, 8), cloth);
  neck.position.y = 0.5;
  const tie = new Mesh(new TorusGeometry(0.09, 0.02, 5, 10), cord);
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 0.48;
  group.add(belly, neck, tie);
  return { object: group, obstacleRadius: 0.28, carry: 'shoulder', grip: { y: -0.26 } };
}

export interface LanternOptions extends CarryableOptions {
  /** Emissive glow colour. Default warm. */
  glow?: number;
}

/** A hand lantern — carried at the side, hanging from its bail. Glass glows. */
export function createLantern(options: LanternOptions = {}): Carryable {
  const seed = options.seed ?? 1;
  const metal = createSurface('steel', { color: options.color ?? 0x2c2f36, seed });
  const glowColor = options.glow ?? 0xffd48a;
  const glass = new MeshStandardMaterial({
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.85,
  });

  const group = new Group();
  group.name = 'lantern';
  const base = new Mesh(new CylinderGeometry(0.08, 0.1, 0.04, 8), metal);
  base.position.y = 0.02;
  const cage = new Mesh(new CylinderGeometry(0.075, 0.075, 0.16, 8, 1, true), glass);
  cage.position.y = 0.13;
  const cap = new Mesh(new CylinderGeometry(0.055, 0.09, 0.05, 8), metal);
  cap.position.y = 0.235;
  group.add(base, cage, cap);
  // Corner posts + a bail handle.
  for (let i = 0; i < 4; i++) {
    const post = new Mesh(new CylinderGeometry(0.008, 0.008, 0.16, 4), metal);
    const a = (i / 4) * Math.PI * 2;
    post.position.set(Math.cos(a) * 0.072, 0.13, Math.sin(a) * 0.072);
    group.add(post);
  }
  const bail = new Mesh(new TorusGeometry(0.05, 0.008, 5, 10, Math.PI), metal);
  bail.position.y = 0.26;
  group.add(bail);
  return { object: group, obstacleRadius: 0.12, carry: 'side', grip: { y: -0.2 } };
}
