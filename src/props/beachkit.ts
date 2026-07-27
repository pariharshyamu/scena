import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { Rng } from '../core/random';
import { createSurface } from '../materials/surface';
import { wavingClothMaterial } from '../materials/clothWave';
import { createSlot, addApproach } from '../core/types';
import type { Prop, PropSlot } from '../core/types';

/**
 * The beach kit — Miami.
 *
 * The props that turn sand into a BEACH: the art-deco lifeguard stand,
 * the striped umbrella, the lounger. Miami Beach's lifeguard towers are
 * the reason this file has a palette: they are pastel geometric huts on
 * stilts, no two the same colour, and a beach with a row of them is
 * unmistakably that beach.
 *
 * ```ts
 * const tower = createLifeguardTower({ seed: 3 });
 * const shade = createBeachUmbrella({ seed: 4 });
 * const chair = createLounger({ seed: 5, recline: 'reading' });
 * ```
 *
 * Cloth wherever cloth belongs: the tower's pennant and the umbrella's
 * valance are driven by the shared cloth-wave shader (the same one
 * behind the flags and the palm fronds), so the beach moves even when
 * nothing is happening.
 */

/** The Ocean Drive palette: pastels that only look right in that light. */
export const MIAMI_COLORS = [
  0x35cfc9, // aqua
  0xff6f91, // flamingo
  0xffd166, // lemon
  0x8ce99a, // mint
  0xff9f6b, // coral
  0x7ac6ff, // sky
  0xf5f0e6, // shell white
];

export interface LifeguardTowerOptions {
  seed?: number;
  /** Deck height above the sand. Default seeded 1.5–2.2. */
  height?: number;
  /** Body colour. Default: a seeded Miami pastel. */
  color?: number;
  /** Trim/roof colour. Default: a contrasting seeded pastel. */
  trim?: number;
  /** Fly a surf pennant. Default true. */
  pennant?: boolean;
}

export interface BeachUmbrellaOptions {
  seed?: number;
  /** Canopy radius. Default seeded 1.1–1.5. */
  radius?: number;
  /** Pole height to the hub. Default seeded 2.0–2.4. */
  height?: number;
  /** The two stripe colours. Default: seeded Miami pair. */
  colors?: [number, number];
  /** Lean off vertical, radians. Default seeded ±0.14. */
  tilt?: number;
}

export type LoungerRecline = 'flat' | 'reading' | 'upright';

export interface LoungerOptions {
  seed?: number;
  /** Back angle preset. Default 'reading'. */
  recline?: LoungerRecline;
  /** Frame colour. Default seeded pastel. */
  color?: number;
  /** Towel over the bed. Default seeded (about half). */
  towel?: boolean;
}

export interface BeachProp extends Prop {
  update(dt: number): void;
}

const RECLINE: Record<LoungerRecline, number> = {
  flat: 0.06,
  reading: 0.62,
  upright: 1.15,
};

export function createLifeguardTower(options: LifeguardTowerOptions = {}): BeachProp {
  const rng = new Rng(options.seed ?? 1);
  const H = options.height ?? rng.range(1.5, 2.2);
  const body = options.color ?? MIAMI_COLORS[Math.floor(rng.next() * MIAMI_COLORS.length)];
  const trim =
    options.trim ??
    (() => {
      // A contrasting pastel: never the body colour back again.
      const others = MIAMI_COLORS.filter((c) => c !== body);
      return others[Math.floor(rng.next() * others.length)];
    })();

  const group = new Group();
  group.name = 'lifeguard-tower';
  const paint = (color: number, rough = 0.65): MeshStandardMaterial =>
    new MeshStandardMaterial({ color, roughness: rough, flatShading: true });
  const bodyMat = paint(body);
  const trimMat = paint(trim);
  const wood = createSurface('plank', { seed: options.seed ?? 1, color: 0xd8c9a8 });

  const W = 2.0;
  const D = 1.8;

  // Stilts, raked outward — a tower on plumb legs looks like a table.
  const legGeo = new BoxGeometry(0.12, H + 0.3, 0.12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new Mesh(legGeo, trimMat);
      leg.position.set(sx * (W / 2 - 0.16), (H + 0.3) / 2 - 0.2, sz * (D / 2 - 0.16));
      leg.rotation.z = -sx * 0.06;
      leg.rotation.x = sz * 0.05;
      group.add(leg);
    }
  }

  const deck = new Mesh(new BoxGeometry(W + 0.3, 0.12, D + 0.3), wood);
  deck.name = 'deck';
  deck.position.y = H;
  group.add(deck);

  // The cabin: three walls and a wide open front, the way a lifeguard
  // stand actually is — you have to be able to see the water.
  const wallH = 1.15;
  const back = new Mesh(new BoxGeometry(W, wallH, 0.1), bodyMat);
  back.position.set(0, H + wallH / 2, -D / 2);
  group.add(back);
  for (const sx of [-1, 1]) {
    const side = new Mesh(new BoxGeometry(0.1, wallH, D), bodyMat);
    side.position.set(sx * (W / 2), H + wallH / 2, 0);
    group.add(side);
    // The deco eyebrow: a bold horizontal band, the giveaway detail.
    const band = new Mesh(new BoxGeometry(0.12, 0.13, D + 0.06), trimMat);
    band.position.set(sx * (W / 2), H + wallH * 0.72, 0);
    group.add(band);
  }
  const rail = new Mesh(new BoxGeometry(W, 0.1, 0.1), trimMat);
  rail.position.set(0, H + 0.42, D / 2);
  group.add(rail);

  // The roof: a jaunty overhanging wedge, tilted to the sea.
  const roof = new Mesh(new BoxGeometry(W + 0.7, 0.12, D + 0.7), trimMat);
  roof.name = 'roof';
  roof.position.set(0, H + wallH + 0.22, 0.05);
  roof.rotation.x = -0.16;
  group.add(roof);
  const crest = new Mesh(new BoxGeometry(W * 0.5, 0.26, 0.12), bodyMat);
  crest.position.set(0, H + wallH + 0.4, -D / 2 + 0.15);
  group.add(crest);

  // The ramp up the back — every stand has one, and it reads instantly.
  const ramp = new Mesh(new BoxGeometry(0.7, 0.08, H * 1.5), wood);
  ramp.position.set(0, H / 2 - 0.05, -D / 2 - H * 0.62);
  ramp.rotation.x = Math.atan2(H, H * 1.45);
  group.add(ramp);

  const times: Array<{ value: number }> = [];
  if (options.pennant ?? true) {
    const mast = new Mesh(new CylinderGeometry(0.03, 0.03, 1.5, 6), trimMat);
    mast.position.set(W / 2 - 0.1, H + wallH + 0.85, -D / 2 + 0.2);
    group.add(mast);
    const flagLen = 0.6;
    const flagH = 0.34;
    const geo = new BufferGeometry();
    {
      // A simple two-triangle pennant, fixed edge at x = 0.
      const verts = new Float32Array([0, 0, 0, flagLen, -0.06, 0, 0, flagH, 0, flagLen, flagH - 0.1, 0]);
      geo.setAttribute('position', new BufferAttribute(verts, 3));
      geo.setIndex([0, 1, 2, 1, 3, 2]);
      geo.computeVertexNormals();
    }
    const cloth = wavingClothMaterial({
      freeLen: flagLen,
      crossLen: flagH,
      amp: 0.09,
      waves: 2.2,
      speed: 3.4,
      sag: 0.03,
      phase: rng.next() * Math.PI * 2,
      cacheKey: 'scena-lifeguard-pennant',
      color: 0xff3b30, // the red flag: the one everybody knows
      roughness: 0.9,
    });
    const flag = new Mesh(geo, cloth);
    flag.name = 'pennant';
    flag.position.set(W / 2 - 0.08, H + wallH + 1.25, -D / 2 + 0.2);
    group.add(flag);
    times.push((cloth.userData.waveUniforms as { uTime: { value: number } }).uTime);
  }

  const slot = createSlot('watch', 'sit', group, 0, H + 0.12, -0.2);
  const slots: PropSlot[] = [addApproach(slot, group, 1.4)];

  let time = rng.next() * 10;
  return {
    object: group,
    obstacleRadius: 1.3,
    slots,
    update(dt: number): void {
      time += dt;
      for (const t of times) t.value = time;
    },
  };
}

export function createBeachUmbrella(options: BeachUmbrellaOptions = {}): BeachProp {
  const rng = new Rng(options.seed ?? 1);
  const R = options.radius ?? rng.range(1.1, 1.5);
  const H = options.height ?? rng.range(2.0, 2.4);
  const pair =
    options.colors ??
    (() => {
      const a = MIAMI_COLORS[Math.floor(rng.next() * MIAMI_COLORS.length)];
      const rest = MIAMI_COLORS.filter((c) => c !== a);
      return [a, rest[Math.floor(rng.next() * rest.length)]] as [number, number];
    })();
  const tilt = options.tilt ?? rng.range(-0.14, 0.14);

  const group = new Group();
  group.name = 'beach-umbrella';
  const lean = new Group();
  lean.rotation.z = tilt;
  lean.rotation.x = rng.range(-0.1, 0.1);
  group.add(lean);

  const pole = new Mesh(
    new CylinderGeometry(0.035, 0.045, H, 7),
    new MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.5, flatShading: true })
  );
  pole.position.y = H / 2 - 0.25; // a foot of it is buried in the sand
  lean.add(pole);

  // The canopy: alternating vertex-coloured gores, drooping at the rim —
  // an umbrella is a cone that has given up a little at the edges.
  const GORES = 12;
  const verts: number[] = [];
  const cols: number[] = [];
  const idx: number[] = [];
  const hub = 0.14;
  const c0 = new Color(pair[0]);
  const c1 = new Color(pair[1]);
  verts.push(0, hub, 0);
  cols.push(c0.r, c0.g, c0.b);
  for (let i = 0; i < GORES; i++) {
    const a = (i / GORES) * Math.PI * 2;
    const dip = rng.range(0, 0.03);
    verts.push(Math.cos(a) * R, -0.22 - dip, Math.sin(a) * R);
    const c = i % 2 === 0 ? c0 : c1;
    cols.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < GORES; i++) {
    idx.push(0, 1 + ((i + 1) % GORES), 1 + i);
  }
  const canopyGeo = new BufferGeometry();
  canopyGeo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  canopyGeo.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
  canopyGeo.setIndex(idx);
  canopyGeo.computeVertexNormals();
  const canopy = new Mesh(
    canopyGeo,
    new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      side: DoubleSide,
      flatShading: true,
    })
  );
  canopy.name = 'canopy';
  canopy.position.y = H - 0.25;
  lean.add(canopy);

  const finial = new Mesh(
    new CylinderGeometry(0.02, 0.02, 0.16, 5),
    new MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.5 })
  );
  finial.position.y = H - 0.05;
  lean.add(finial);

  let time = rng.next() * 10;
  const sway = rng.range(0.55, 0.9);
  return {
    object: group,
    obstacleRadius: 0.2,
    update(dt: number): void {
      time += dt;
      // A parasol in a sea breeze never stops moving, and never much.
      lean.rotation.z = tilt + Math.sin(time * sway) * 0.022;
      canopy.rotation.y = Math.sin(time * sway * 0.7) * 0.03;
    },
  };
}

export function createLounger(options: LoungerOptions = {}): BeachProp {
  const rng = new Rng(options.seed ?? 1);
  const recline = options.recline ?? 'reading';
  const color = options.color ?? MIAMI_COLORS[Math.floor(rng.next() * MIAMI_COLORS.length)];
  const towel = options.towel ?? rng.next() < 0.5;

  const group = new Group();
  group.name = 'lounger';
  const frameMat = new MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.45, flatShading: true });
  const slatMat = new MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });

  const L = 1.75;
  const W = 0.62;
  const seatY = 0.34;

  // Frame rails and stubby legs — the sand takes the rest.
  for (const sx of [-1, 1]) {
    const rail = new Mesh(new BoxGeometry(0.05, 0.05, L), frameMat);
    rail.position.set(sx * (W / 2), seatY, 0);
    group.add(rail);
    for (const sz of [-1, 1]) {
      const leg = new Mesh(new BoxGeometry(0.05, seatY, 0.05), frameMat);
      leg.position.set(sx * (W / 2), seatY / 2, sz * (L / 2 - 0.18));
      group.add(leg);
    }
  }

  // The bed: slats, because a solid slab reads as a table.
  const bed = new Group();
  bed.name = 'bed';
  for (let i = 0; i < 7; i++) {
    const slat = new Mesh(new BoxGeometry(W, 0.035, 0.11), slatMat);
    slat.position.set(0, seatY + 0.04, -L / 2 + 0.22 + i * 0.14);
    bed.add(slat);
  }
  group.add(bed);

  // The back, hinged at the head end and set to its recline.
  const backPivot = new Group();
  backPivot.name = 'back';
  backPivot.position.set(0, seatY + 0.04, -L / 2 + 0.18);
  backPivot.rotation.x = RECLINE[recline];
  for (let i = 0; i < 5; i++) {
    const slat = new Mesh(new BoxGeometry(W, 0.035, 0.11), slatMat);
    slat.position.set(0, 0, -0.06 - i * 0.14);
    backPivot.add(slat);
  }
  group.add(backPivot);

  if (towel) {
    const towelColor = MIAMI_COLORS[Math.floor(rng.next() * MIAMI_COLORS.length)];
    const cloth = new Mesh(
      new BoxGeometry(W * 0.8, 0.02, L * 0.5),
      new MeshStandardMaterial({ color: towelColor, roughness: 0.95, flatShading: true })
    );
    cloth.name = 'towel';
    cloth.position.set(rng.range(-0.04, 0.04), seatY + 0.075, rng.range(0.05, 0.3));
    cloth.rotation.y = rng.range(-0.08, 0.08);
    group.add(cloth);
  }

  const slot = createSlot('lie', recline === 'flat' ? 'sleep' : 'sit', group, 0, seatY + 0.1, 0.1);
  const slots: PropSlot[] = [addApproach(slot, group, 0.85)];

  return {
    object: group,
    obstacleRadius: 0.75,
    slots,
    update(): void {
      // A lounger is furniture. It has the decency to stay still.
    },
  };
}
