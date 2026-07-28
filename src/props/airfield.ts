import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  TorusGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { buildTextGeometry } from '../text/textGeometry';
import type { Prop } from '../core/types';

/**
 * The airfield — everything an airplane parks beside.
 *
 * A runway with real markings (the vector font finally lying flat: the
 * numbers are the heading in tens of degrees, and the far end reads the
 * reciprocal, because that is what runways DO), a windsock that reads an
 * actual `WindField` structurally — its swing is the wind's direction
 * and its droop the wind's strength, which makes it weather
 * instrumentation you can unit-test — a hangar to hide from it in, and
 * a helipad for the release after this one.
 */

// ---------------------------------------------------------------------------
// Runway

export interface RunwayOptions {
  /** Strip length, metres. Default 60. */
  length?: number;
  /** Strip width, metres. Default 8. */
  width?: number;
  /**
   * Runway number at the NEAR end (heading in tens of degrees, 1–36).
   * The far end shows the reciprocal automatically. Default 27.
   */
  number?: number;
  seed?: number;
}

export interface Runway extends Prop {
  /** The number painted at the near end. */
  number: number;
  /** The far end's designation — always the reciprocal. */
  reciprocal: number;
}

export function createRunway(options: RunwayOptions = {}): Runway {
  const length = options.length ?? 60;
  const width = options.width ?? 8;
  const number = Math.min(Math.max(Math.round(options.number ?? 27), 1), 36);
  const reciprocal = ((number + 17) % 36) + 1;
  const seed = options.seed ?? 1;

  const group = new Group();
  group.name = `runway-${number}`;
  const strip = new Mesh(new BoxGeometry(width, 0.08, length), createSurface('asphalt', { seed }));
  strip.position.y = 0.04;
  group.add(strip);

  const paint = new MeshStandardMaterial({ color: 0xe8e6dc, roughness: 0.8 });
  // Centreline dashes.
  const dashCount = Math.floor(length / 6);
  for (let i = 0; i < dashCount; i++) {
    const dash = new Mesh(new BoxGeometry(0.3, 0.02, 2.6), paint);
    dash.position.set(0, 0.09, -length / 2 + 4 + i * 6);
    group.add(dash);
  }
  // Threshold bars ("piano keys") at both ends.
  for (const end of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const bar = new Mesh(new BoxGeometry(0.55, 0.02, 2.2), paint);
      bar.position.set(-width / 2 + 0.9 + i * ((width - 1.8) / 5), 0.09, end * (length / 2 - 1.6));
      group.add(bar);
    }
  }
  // The numbers, flat on the deck, each readable to a pilot on approach.
  const pad = (n: number): string => (n < 10 ? '0' + n : String(n));
  for (const [value, end] of [
    [number, -1],
    [reciprocal, 1],
  ] as Array<[number, number]>) {
    const text = buildTextGeometry(pad(value), { size: 2.2, depth: 0.02 });
    const mesh = new Mesh(text.geometry, paint);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = end > 0 ? Math.PI : 0; // the far number faces the far approach
    mesh.position.set(0, 0.1, end * (length / 2 - 6));
    group.add(mesh);
  }

  return { object: group, obstacleRadius: 0, number, reciprocal };
}

// ---------------------------------------------------------------------------
// Windsock

export interface WindsockOptions {
  /** Pole height, metres. Default 4. */
  pole?: number;
  seed?: number;
}

export interface Windsock extends Prop {
  /** Where the sock points (radians, world XZ) — DOWNwind, like the real thing. */
  readonly angle: number;
  /** How far the sock hangs off horizontal (0 = flying straight, ~1.2 = limp). */
  readonly droop: number;
  /** Feed it the wind (a WindField, structurally) every frame. */
  update(dt: number, wind?: { direction: { x: number; y: number }; strength: number }): void;
}

export function createWindsock(options: WindsockOptions = {}): Windsock {
  const rng = new Rng(options.seed ?? 1);
  const poleHeight = options.pole ?? 4;
  const group = new Group();
  group.name = 'windsock';

  const pole = new Mesh(
    new CylinderGeometry(0.05, 0.07, poleHeight, 6),
    new MeshStandardMaterial({ color: 0x9aa2ac, flatShading: true })
  );
  pole.position.y = poleHeight / 2;
  const ring = new Mesh(
    new TorusGeometry(0.22, 0.03, 6, 12),
    new MeshStandardMaterial({ color: 0x60666e, flatShading: true })
  );
  ring.position.y = poleHeight;
  ring.rotation.y = Math.PI / 2;
  group.add(pole, ring);

  // The swivel carries the sock; the sock is banded frustums, orange/white.
  const swivel = new Group();
  swivel.position.y = poleHeight;
  const sock = new Group();
  const orange = new MeshStandardMaterial({ color: 0xe8762e, roughness: 0.85, flatShading: true });
  const white = new MeshStandardMaterial({ color: 0xe8e6dc, roughness: 0.85, flatShading: true });
  const segments: Mesh[] = [];
  let z = 0;
  const radii = [0.22, 0.18, 0.145, 0.11, 0.08];
  for (let i = 0; i < 4; i++) {
    const segment = new Mesh(
      new CylinderGeometry(radii[i + 1], radii[i], 0.34, 8, 1, true),
      i % 2 === 0 ? orange : white
    );
    segment.rotation.x = -Math.PI / 2;
    segment.position.z = z + 0.17;
    z += 0.33;
    sock.add(segment);
    segments.push(segment);
  }
  swivel.add(sock);
  group.add(swivel);

  let angle = rng.range(0, Math.PI * 2);
  let droop = 1.1;
  let clock = rng.range(0, 10);

  const apply = (): void => {
    swivel.rotation.y = angle;
    sock.rotation.x = droop;
    // The tail segments flutter more than the throat.
    for (let i = 0; i < segments.length; i++) {
      const flutter = Math.sin(clock * (5 + i * 1.7) + i) * 0.05 * (i + 1) * Math.min(droop + 0.3, 1);
      segments[i].rotation.x = -Math.PI / 2 + flutter;
    }
  };
  apply();

  return {
    object: group,
    obstacleRadius: 0.15,
    get angle() {
      return angle;
    },
    get droop() {
      return droop;
    },
    update(dt, wind) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      clock += step;
      if (wind) {
        const target = Math.atan2(wind.direction.x, wind.direction.y);
        let diff = target - angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        angle += diff * Math.min(step * 2.5, 1); // socks swing, they don't snap
        const strength = Math.min(Math.max(wind.strength, 0), 1);
        const targetDroop = 1.15 * (1 - Math.min(strength * 1.8, 1));
        droop += (targetDroop - droop) * Math.min(step * 2, 1);
      }
      apply();
    },
  };
}

// ---------------------------------------------------------------------------
// Hangar

export interface HangarOptions {
  width?: number;
  depth?: number;
  seed?: number;
  palette?: Palette;
}

/** An open-front arch hangar — park the trainer out of the weather. */
export function createHangar(options: HangarOptions = {}): Prop {
  const width = options.width ?? 12;
  const depth = options.depth ?? 10;
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const group = new Group();
  group.name = 'hangar';

  const slab = new Mesh(
    new BoxGeometry(width + 1, 0.12, depth + 1),
    createSurface('concrete', { seed })
  );
  slab.position.y = 0.06;
  group.add(slab);

  // The arch: a half-open cylinder rotated in GEOMETRY space so the
  // arc springs over the top with its axis down the hangar's depth.
  const shellGeometry = new CylinderGeometry(width / 2, width / 2, depth, 14, 1, true, 0, Math.PI);
  shellGeometry.rotateX(-Math.PI / 2);
  shellGeometry.rotateZ(Math.PI / 2);
  const shellSkin = createSurface('steel', { seed: seed + 1 });
  shellSkin.side = 2; // seen from inside AND out
  const shell = new Mesh(shellGeometry, shellSkin);
  shell.position.y = 0.1;
  group.add(shell);

  const backSkin = createSurface('paintedMetal', { color: palette.metal, seed: seed + 2 });
  backSkin.side = 2;
  const back = new Mesh(new CircleGeometry(width / 2, 14, 0, Math.PI), backSkin);
  back.position.set(0, 0.1, -depth / 2);
  group.add(back);

  return { object: group, obstacleRadius: Math.max(width, depth) / 2 };
}

// ---------------------------------------------------------------------------
// Helipad

export interface HelipadOptions {
  radius?: number;
  seed?: number;
}

/** A round pad with the ring and the H — the font's flattest job yet. */
export function createHelipad(options: HelipadOptions = {}): Prop {
  const radius = options.radius ?? 3.2;
  const seed = options.seed ?? 1;
  const group = new Group();
  group.name = 'helipad';

  const slab = new Mesh(
    new CylinderGeometry(radius, radius, 0.14, 24),
    createSurface('concrete', { seed })
  );
  slab.position.y = 0.07;
  group.add(slab);

  const paint = new MeshStandardMaterial({ color: 0xe8e6dc, roughness: 0.8 });
  const ring = new Mesh(new RingGeometry(radius * 0.78, radius * 0.9, 28), paint);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);

  const h = buildTextGeometry('H', { size: radius * 0.75, depth: 0.02 });
  const mesh = new Mesh(h.geometry, paint);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.15;
  group.add(mesh);

  return { object: group, obstacleRadius: radius };
}
