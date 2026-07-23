// SCENA — SCenes & ENvironment Assets
// A 3D world-building library on top of three.js. Seeded procedural props,
// terrain, sky, lighting and scattering — with gameplay metadata (steering
// obstacles, walkable surfaces) that game libraries like GAMA understand.

// Core
export { Rng, valueNoise2, fractalNoise2, hash2 } from './core/random';
export { PALETTES, DEFAULT_PALETTE, type Palette } from './core/palette';
export { collectObstacles, type Obstacle, type Prop } from './core/types';

// Materials
export {
  createSurface,
  SURFACE_PRESETS,
  type SurfaceKind,
  type SurfaceParams,
  type SurfaceOptions,
} from './materials/surface';

// Text — stylised lettering carved from an embedded vector font (no textures,
// no font files, no loaders); label any prop, in the browser or a Node test.
export {
  buildTextGeometry,
  measureText,
  type TextOptions,
  type TextGeometry,
  type TextAlign,
} from './text/textGeometry';

// Props
export { createTree, type TreeOptions } from './props/tree';
export { createRock, type RockOptions } from './props/rock';
export { createCrate, type CrateOptions } from './props/crate';
export { createFence, type FenceOptions } from './props/fence';
export { createLamp, type LampOptions } from './props/lamp';
export { createGrassTuft, createBush, type GrassOptions, type BushOptions } from './props/grass';
export {
  createHouse,
  createTower,
  createWell,
  createRuin,
  type HouseOptions,
  type TowerOptions,
  type WellOptions,
  type RuinOptions,
  type WallStyle,
  type RoofStyle,
} from './props/building';
export { createStall, type StallOptions, type StallGoods } from './props/stall';
export {
  createBanner,
  type BannerOptions,
  type BannerStyle,
  type BannerPattern,
} from './props/banner';
export { createBrazier, createCampfire, type FireOptions } from './props/fire';
export { createBunting, type BuntingOptions } from './props/bunting';
export { createFountain, type FountainOptions } from './props/fountain';
export {
  createCart,
  type CartOptions,
  type CartStyle,
  type CartCargo,
} from './props/cart';
export {
  createStatue,
  type StatueOptions,
  type StatueFigure,
  type StatueMaterial,
} from './props/statue';
export {
  createSign,
  type SignOptions,
  type SignKind,
  type Direction,
} from './props/sign';

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
export { createWater, aboveWater, type Water, type WaterOptions } from './environment/water';
export { createDayCycle, type DayCycle, type DayCycleOptions } from './environment/dayCycle';
export { applyWind, type Wind, type WindOptions } from './environment/wind';
export { createPath, type WorldPath, type PathOptions } from './environment/path';

// Generators
export { createVillage, type Village, type VillageOptions } from './generators/village';

// Kits
export { KIT_UNIT, assembleKit, type Kit, type KitOptions } from './kits/kit';

// Scene assembly
export {
  buildScene,
  type SceneManifest,
  type BuiltScene,
  type ManifestScatter,
  type ManifestScatterItem,
  type ScatterPropType,
} from './scene/manifest';
export { extractMarkers, type Markers } from './scene/markers';

// Scattering
export {
  scatter,
  type ScatterOptions,
  type ScatterItem,
  type ScatterResult,
  type ScatterTile,
  type Placement,
} from './scatter/scatter';
