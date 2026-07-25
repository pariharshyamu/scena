import { BoxGeometry, CylinderGeometry, Group, Mesh } from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createWater } from '../environment/water';
import { createDroplets } from '../materials/waterFlow';
import { createStream, type Stream } from './waterworks';
import { createStatue, type StatueFigure } from './statue';
import type { Prop } from '../core/types';

export interface FountainOptions {
  seed?: number;
  /** Basin width (square). Default seeded ~3–3.6. */
  size?: number;
  /** Centrepiece figure. Default seeded (small figures suit a fountain). */
  figure?: StatueFigure;
  /** Material of the centrepiece. Default 'stone'. */
  centrepiece?: 'stone' | 'bronze';
  palette?: Palette;
}

const FOUNTAIN_FIGURES: StatueFigure[] = ['orb', 'figure', 'obelisk', 'bust'];

/**
 * A tiered town fountain: a square stone basin brimming with animated water
 * (SCENA's own `createWater`, self-driven here), a central pedestal carrying
 * a small statue that spouts, an upper catch-bowl, sheets of water falling
 * between the tiers and a fine spray of droplets at the jet. Self-animating —
 * the water ripples and the spray falls with no per-frame code.
 */
export function createFountain(options: FountainOptions = {}): Prop {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;
  const size = options.size ?? rng.range(3, 3.6);
  const figure = options.figure ?? rng.pick(FOUNTAIN_FIGURES);

  const group = new Group();
  group.name = 'fountain';

  const stone = createSurface('stone', { color: palette.rock[0], seed });
  const stone2 = createSurface('stone', { color: palette.rock[1] ?? palette.rock[0], seed: seed + 5 });

  // --- Square lower basin: floor + four low walls.
  const wallH = 0.55;
  const wallT = 0.22;
  const half = size / 2;
  const floor = new Mesh(new CylinderGeometry(half * 0.98, half * 0.98, 0.12, 4), stone2);
  floor.rotation.y = Math.PI / 4;
  floor.position.y = 0.06;
  group.add(floor);
  // Four low coping walls around the rim.
  const walls: Array<[number, number, number, number]> = [
    [0, half - wallT / 2, size, wallT],
    [0, -(half - wallT / 2), size, wallT],
    [half - wallT / 2, 0, wallT, size],
    [-(half - wallT / 2), 0, wallT, size],
  ];
  for (const [x, z, w, d] of walls) {
    const wall = new Mesh(new BoxGeometry(w, wallH, d), stone);
    wall.position.set(x, wallH / 2, z);
    group.add(wall);
  }

  // --- Lower pool: createWater, sized to the basin interior, self-driven.
  const lowerLevel = wallH - 0.12;
  const water = createWater({
    level: lowerLevel,
    size: size - wallT * 1.4,
    resolution: 12,
    amplitude: 0.02,
    speed: 1.4,
    palette,
  });
  group.add(water.mesh);

  // --- Central pedestal + upper catch-bowl + spouting statue.
  const pedR = size * 0.16;
  const pedH = wallH + size * 0.24;
  const pedestal = new Mesh(new CylinderGeometry(pedR * 0.8, pedR, pedH, 10), stone);
  pedestal.position.y = pedH / 2;
  group.add(pedestal);

  const bowlY = pedH;
  const bowl = new Mesh(new CylinderGeometry(size * 0.3, size * 0.14, 0.16, 12), stone);
  bowl.position.y = bowlY;
  group.add(bowl);
  const bowlWater = createWater({
    level: bowlY + 0.09,
    size: size * 0.34, // fits inside the round catch-bowl, no corners peeking
    resolution: 6,
    amplitude: 0.012,
    speed: 1.9,
    palette,
  });
  group.add(bowlWater.mesh);

  const statue = createStatue({
    seed: seed + 3,
    figure,
    material: options.centrepiece ?? 'stone',
    height: size * 0.62,
    palette,
  });
  statue.object.position.y = bowlY + 0.08;
  statue.object.scale.setScalar(0.9);
  group.add(statue.object);

  // --- Falling water from the bowl rim to the pool.
  //
  // These were STATIC translucent cylinders until 0.52 — at rest that reads
  // as eight glass rods, because what says "water" is not the tint, it is
  // that the surface travels downward and comes apart as it falls.
  const fallHeight = bowlY - lowerLevel - 0.05;
  const falls: Stream[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const fall = createStream({
      height: fallHeight,
      radius: 0.022,
      splash: false,
      seed: seed + i,
      palette,
    });
    fall.object.position.set(Math.cos(a) * size * 0.28, bowlY - 0.05, Math.sin(a) * size * 0.28);
    group.add(fall.object);
    falls.push(fall);
  }

  // --- Jet spray: droplets rising from the spout and falling back.
  const spray = createDroplets({
    count: 22,
    spread: size * 0.14,
    rise: (bowlY + size * 0.2) * 0.42,
    size: 0.28,
    seed,
  });
  spray.mesh.position.y = bowlY + 0.12;
  group.add(spray.mesh);

  // --- Self-animation: ripple both pools and rain the spray, from the loop.
  let last = performance.now() * 0.001;
  water.mesh.onBeforeRender = () => {
    const now = performance.now() * 0.001;
    const dt = Math.min(0.05, Math.max(0, now - last));
    last = now;
    water.update(dt);
    bowlWater.update(dt);
    spray.update(dt);
    for (const fall of falls) fall.update(dt);
  };

  return { object: group, obstacleRadius: half + 0.1 };
}

// ---- helpers -----------------------------------------------------------
