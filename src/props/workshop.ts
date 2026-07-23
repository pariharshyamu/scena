import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

/**
 * Trade utilities — the props that give a room a job: a smith's forge, a
 * baker's oven, a weaver's loom, a taverner's counter. Same Prop contract
 * as everything else; `furnishRoom` places them by role.
 */

export interface WorkshopOptions {
  seed?: number;
  /** Forge only: add the real flickering PointLight. Default true. */
  light?: boolean;
  palette?: Palette;
}

/** Glowing-coal material + a flicker driver shared by forge and oven. */
function glowingCoals(
  group: Group,
  rng: Rng,
  count: number,
  cx: number,
  cy: number,
  cz: number,
  spread: number,
  light: PointLight | null
): void {
  const coalMat = new MeshStandardMaterial({
    color: 0x1a1008,
    emissive: 0xff5a1a,
    emissiveIntensity: 1.7,
    flatShading: true,
  });
  for (let i = 0; i < count; i++) {
    const coal = new Mesh(new IcosahedronGeometry(rng.range(0.05, 0.09), 0), coalMat);
    coal.position.set(cx + rng.jitter(0, spread), cy + rng.range(0, 0.05), cz + rng.jitter(0, spread));
    group.add(coal);
  }
  const phase = rng.range(0, 20);
  const base = light?.intensity ?? 0;
  group.children[group.children.length - 1].onBeforeRender = () => {
    const t = performance.now() * 0.001 + phase;
    const flick = 0.8 + 0.12 * Math.sin(t * 10.0) + 0.08 * Math.sin(t * 21.7 + 1.4);
    coalMat.emissiveIntensity = 1.7 * flick;
    if (light) light.intensity = base * flick;
  };
}

/** A smith's corner: coal forge, anvil on a stump, quench barrel. */
export function createForge(options: WorkshopOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const stone = createSurface('stone', { color: palette.rock[0], seed });
  const metal = new MeshStandardMaterial({ color: palette.metal, flatShading: true, metalness: 0.55, roughness: 0.45 });

  const group = new Group();
  group.name = 'forge';

  // The coal hearth: a waist-high stone box with a bed of burning coals.
  const bed = new Mesh(new BoxGeometry(1.0, 0.75, 0.85), stone);
  bed.position.set(-0.35, 0.375, 0);
  group.add(bed);
  const lip = new Mesh(new BoxGeometry(1.08, 0.1, 0.93), stone);
  lip.position.set(-0.35, 0.78, 0);
  group.add(lip);

  let light: PointLight | null = null;
  if (options.light ?? true) {
    light = new PointLight(0xff7a28, 4, 6, 2);
    light.position.set(-0.35, 1.1, 0);
    group.add(light);
  }
  glowingCoals(group, rng, 6, -0.35, 0.85, 0, 0.24, light);

  // Anvil on a stump.
  const stump = new Mesh(new CylinderGeometry(0.2, 0.24, 0.45, 8), createSurface('wood', { color: palette.woodDark, seed: seed + 1 }));
  stump.position.set(0.55, 0.225, 0.1);
  group.add(stump);
  const anvilBody = new Mesh(new BoxGeometry(0.5, 0.14, 0.16), metal);
  anvilBody.position.set(0.55, 0.53, 0.1);
  const anvilWaist = new Mesh(new BoxGeometry(0.2, 0.1, 0.12), metal);
  anvilWaist.position.set(0.55, 0.5 - 0.05, 0.1);
  const horn = new Mesh(new CylinderGeometry(0.028, 0.06, 0.22, 6), metal);
  horn.rotation.z = Math.PI / 2 + 0.15;
  horn.position.set(0.86, 0.55, 0.1);
  group.add(anvilBody, anvilWaist, horn);

  // Quench barrel.
  const barrel = new Mesh(new CylinderGeometry(0.19, 0.17, 0.5, 9), createSurface('plank', { color: palette.woodDark, seed: seed + 2 }));
  barrel.position.set(0.35, 0.25, -0.55);
  const water = new Mesh(new CylinderGeometry(0.16, 0.16, 0.02, 9), new MeshStandardMaterial({ color: 0x1c2c33, roughness: 0.2 }));
  water.position.set(0.35, 0.49, -0.55);
  group.add(barrel, water);

  return { object: group, obstacleRadius: 1.05 };
}

/** A baker's dome oven: stone dome, ember-lit mouth, chimney stub. */
export function createOven(options: WorkshopOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const stone = createSurface('stone', { color: palette.rock[1] ?? palette.rock[0], seed });
  const brick = createSurface('brick', { color: palette.roof, seed: seed + 1 });

  const group = new Group();
  group.name = 'oven';

  const plinth = new Mesh(new BoxGeometry(1.2, 0.7, 1.0), stone);
  plinth.position.y = 0.35;
  group.add(plinth);
  const dome = new Mesh(new SphereGeometry(0.52, 9, 6), brick);
  dome.scale.y = 0.72;
  dome.position.y = 0.72;
  group.add(dome);
  const chimney = new Mesh(new BoxGeometry(0.16, 0.5, 0.16), brick);
  chimney.position.set(0, 1.2, -0.2);
  group.add(chimney);

  // The glowing mouth: a dark arch with embers inside — faces +z.
  const mouth = new Mesh(
    new CylinderGeometry(0.24, 0.24, 0.1, 8, 1, false, Math.PI, Math.PI),
    new MeshStandardMaterial({ color: 0x140d08, flatShading: true })
  );
  mouth.rotation.x = Math.PI / 2;
  mouth.rotation.y = Math.PI / 2;
  mouth.position.set(0, 0.74, 0.44);
  group.add(mouth);
  glowingCoals(group, rng, 4, 0, 0.72, 0.42, 0.12, null);

  // A peel (baker's paddle) leaning on the side.
  const peelWood = createSurface('wood', { color: palette.wood, seed: seed + 2 });
  const handle = new Mesh(new CylinderGeometry(0.02, 0.02, 1.3, 5), peelWood);
  handle.position.set(0.68, 0.7, 0.1);
  handle.rotation.z = 0.28;
  const blade = new Mesh(new BoxGeometry(0.2, 0.02, 0.28), peelWood);
  blade.position.set(0.5, 0.1, 0.1);
  group.add(handle, blade);

  return { object: group, obstacleRadius: 0.95 };
}

/** A weaver's upright loom: frame, warp threads, cloth growing up it. */
export function createLoom(options: WorkshopOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const wood = createSurface('wood', { color: palette.wood, seed });
  const dark = createSurface('wood', { color: palette.woodDark, seed: seed + 1 });

  const group = new Group();
  group.name = 'loom';
  const W = 1.1;
  const H = 1.7;

  for (const side of [-1, 1]) {
    const upright = new Mesh(new BoxGeometry(0.08, H, 0.1), dark);
    upright.position.set(side * W / 2, H / 2, 0);
    upright.rotation.x = -0.14;
    group.add(upright);
    const foot = new Mesh(new BoxGeometry(0.09, 0.07, 0.5), dark);
    foot.position.set(side * W / 2, 0.035, 0.05);
    group.add(foot);
  }
  for (const y of [H - 0.08, 0.35]) {
    const beam = new Mesh(new CylinderGeometry(0.05, 0.05, W + 0.1, 7), wood);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(0, y, (H / 2 - y) * 0.14);
    group.add(beam);
  }
  // Warp threads.
  const thread = new MeshStandardMaterial({ color: 0xe8dfc8, flatShading: true });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.12 + (i / (n - 1)) * (W - 0.24);
    const t = new Mesh(new BoxGeometry(0.012, H - 0.5, 0.012), thread);
    t.position.set(x, (H - 0.5) / 2 + 0.35, (H / 2 - ((H - 0.5) / 2 + 0.35)) * 0.14);
    t.rotation.x = -0.14;
    group.add(t);
  }
  // The woven cloth climbing the lower half, dyed from the palette.
  const cloth = new Mesh(
    new BoxGeometry(W - 0.2, 0.55, 0.03),
    createSurface('canvas', { color: rng.pick([palette.roof, palette.water, palette.sand]), seed: seed + 2 })
  );
  cloth.position.set(0, 0.66, (H / 2 - 0.66) * 0.14 + 0.012);
  cloth.rotation.x = -0.14;
  group.add(cloth);

  return { object: group, obstacleRadius: 0.68 };
}

/** A taverner's counter: paneled bar with mugs and a jug on top. */
export function createCounter(options: WorkshopOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const top = createSurface('plank', { color: palette.wood, seed });
  const panel = createSurface('wood', { color: palette.woodDark, seed: seed + 1 });

  const group = new Group();
  group.name = 'counter';
  const L = 2.2;
  const H = 1.0;

  const base = new Mesh(new BoxGeometry(L - 0.15, H - 0.08, 0.5), panel);
  base.position.y = (H - 0.08) / 2;
  group.add(base);
  const slab = new Mesh(new BoxGeometry(L, 0.08, 0.68), top);
  slab.position.y = H - 0.04;
  group.add(slab);
  const rail = new Mesh(new CylinderGeometry(0.025, 0.025, L - 0.3, 6), panel);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 0.16, 0.32);
  group.add(rail);

  // Mugs and a jug along the top.
  const glaze = new MeshStandardMaterial({ color: palette.path, flatShading: true });
  const mugs = rng.int(2, 4);
  for (let i = 0; i < mugs; i++) {
    const mug = new Mesh(new CylinderGeometry(0.045, 0.05, 0.1, 7), glaze);
    mug.position.set(rng.range(-L / 2 + 0.3, L / 2 - 0.3), H + 0.05, rng.jitter(0, 0.16));
    group.add(mug);
  }
  const jug = new Mesh(
    new CylinderGeometry(0.06, 0.1, 0.24, 8),
    createSurface('terracotta', { seed: seed + 3 })
  );
  jug.position.set(rng.range(-L / 2 + 0.3, L / 2 - 0.3), H + 0.12, 0);
  group.add(jug);

  return { object: group, obstacleRadius: 1.15 };
}
