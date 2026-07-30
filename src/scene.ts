// SCENA — scene assembly: manifests, kits, scatter, generators
//
// A sub-path entry point. `import from 'scena3d'` still gives you everything;
// this exists so a bundler can see module boundaries, and so an import says
// what part of the library it depends on.
//
// GENERATED from src/index.ts by scripts/entries.mjs — every statement below
// is the root barrel's own, partitioned by source directory. `npm run
// entries:check` fails if this file and the barrel disagree.

// ---- scene
export {
  buildScene,
  type SceneManifest,
  type BuiltScene,
  type ManifestScatter,
  type ManifestScatterItem,
  type ScatterPropType,
} from './scene/manifest';
export { extractMarkers, type Markers } from './scene/markers';

// ---- kits
export { KIT_UNIT, assembleKit, type Kit, type KitOptions } from './kits/kit';
export {
  createRoom,
  type Room,
  type RoomOptions,
  type RoomWindow,
  type RoomHearth,
  type RoomWall,
} from './kits/room';
export {
  furnishRoom,
  type Furnished,
  type FurnishOptions,
  type RoomRole,
  type RoomMarkers,
} from './kits/furnish';

// ---- scatter
export {
  scatter,
  type ScatterOptions,
  type ScatterItem,
  type ScatterResult,
  type ScatterTile,
  type Placement,
} from './scatter/scatter';

// ---- generators
export { createVillage, type Village, type VillageOptions } from './generators/village';
export { createBungalow, type Bungalow, type BungalowOptions } from './generators/bungalow';
export {
  createHighrise,
  type Highrise,
  type HighriseOptions,
} from './generators/tower';
