// SCENA — environment: sky, terrain, weather, ocean, light
//
// A sub-path entry point. `import from 'scena3d'` still gives you everything;
// this exists so a bundler can see module boundaries, and so an import says
// what part of the library it depends on.
//
// GENERATED from src/index.ts by scripts/entries.mjs — every statement below
// is the root barrel's own, partitioned by source directory. `npm run
// entries:check` fails if this file and the barrel disagree.

export { createTerrain, type Terrain, type TerrainOptions } from './environment/terrain';
export { createSky, type Sky, type SkyOptions } from './environment/sky';
export {
  applyEnvironment,
  createEnvironmentMap,
  type EnvironmentOptions,
  type SceneEnvironment,
} from './environment/environment';
export {
  createLightingRig,
  applyFog,
  type LightingRig,
  type LightingPreset,
  type FogPreset,
} from './environment/lighting';
export { createWater, aboveWater, type Water, type WaterOptions } from './environment/water';
export { createDayCycle, type DayCycle, type DayCycleOptions } from './environment/dayCycle';
export {
  createLightBudget,
  type LightBudget,
  type LightBudgetOptions,
  type LightClaim,
  type LightGrant,
} from './environment/lightBudget';
export {
  createLightning,
  type Lightning,
  type LightningOptions,
  type LightningTargets,
  type Strike,
} from './environment/lightning';
export {
  createFireworks,
  type Fireworks,
  type FireworksOptions,
  type LaunchOptions,
} from './environment/fireworks';
export {
  createLightShafts,
  type LightShafts,
  type LightShaftsOptions,
} from './environment/lightShafts';
export {
  createWindField,
  applyWind,
  type WindField,
  type WindFieldOptions,
  type SwayOptions,
  type Wind,
  type WindOptions,
} from './environment/wind';
export {
  createPrecipitation,
  type Precipitation,
  type PrecipitationOptions,
  type PrecipitationType,
  type AccumulateOptions,
} from './environment/precipitation';
export { createOcean, type Ocean, type SurfOptions,
  type RippleOptions,
  type OceanOptions } from './environment/ocean';
export {
  createWeather,
  type Weather,
  type WeatherOptions,
  type WeatherPreset,
  type WeatherStateParams,
} from './environment/weather';
export {
  createSeasons,
  type Seasons,
  type SeasonsOptions,
  type Season,
  type SeasonGrade,
} from './environment/seasons';
export {
  createGodRays,
  createCaustics,
  createBubbles,
  createWaterGrade,
  type GodRays,
  type GodRaysOptions,
  type Caustics,
  type CausticsOptions,
  type Bubbles,
  type BubbleOptions,
  type WaterGrade,
  type WaterGradeOptions,
} from './environment/underwater';
export { createFlock, type Flock, type FlockOptions, type FlockType } from './environment/flock';
export { createHerd, type Herd, type HerdOptions, type HerdType } from './environment/herd';
export { createPath, type WorldPath, type PathOptions } from './environment/path';
export {
  createEffects,
  type Effects,
  type EffectsOptions,
  type BurstKind,
  type BurstOptions,
  type RingOptions,
} from './environment/effects';
export { createTrail, type Trail, type TrailOptions } from './environment/trail';
export {
  createMarks,
  type Marks,
  type MarksOptions,
  type GroundMarkKind,
  type StampOptions,
} from './environment/marks';
export {
  createInteriorLight,
  type InteriorLight,
  type InteriorLightOptions,
  type InteriorSun,
} from './environment/interiorLight';
export {
  createSeaState,
  fullyDeveloped,
  fetchLimited,
  periodFor,
  lengthFor,
  douglasFor,
  SEA_KINDS,
  type SeaState,
  type SeaStateOptions,
  type SeaKind,
  type SeaCondition,
  type Train,
} from './environment/seaState';
export {
  createTrack,
  type RailTrack,
  type TrackOptions,
  type TrackPoint,
} from './environment/track';
