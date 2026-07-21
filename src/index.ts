// SCENA — SCenes & ENvironment Assets
// A 3D world-building library on top of three.js. Seeded procedural props,
// terrain, sky, lighting and scattering — with gameplay metadata (steering
// obstacles, walkable surfaces) that game libraries like GAMA understand.

// Core
export { Rng, valueNoise2, fractalNoise2, hash2 } from './core/random';
export { PALETTES, DEFAULT_PALETTE, type Palette } from './core/palette';
export { collectObstacles, type Obstacle, type Prop } from './core/types';

// Props
export { createTree, type TreeOptions } from './props/tree';
export { createRock, type RockOptions } from './props/rock';
export { createCrate, type CrateOptions } from './props/crate';
export { createFence, type FenceOptions } from './props/fence';
export { createLamp, type LampOptions } from './props/lamp';

// Environment
export { createTerrain, type Terrain, type TerrainOptions } from './environment/terrain';
export { createSky, type Sky, type SkyOptions } from './environment/sky';
export {
  createLightingRig,
  applyFog,
  type LightingRig,
  type LightingPreset,
  type FogPreset,
} from './environment/lighting';

// Scattering
export {
  scatter,
  type ScatterOptions,
  type ScatterItem,
  type ScatterResult,
  type Placement,
} from './scatter/scatter';
