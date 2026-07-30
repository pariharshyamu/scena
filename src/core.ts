// SCENA — core: randomness, palettes, structural types
//
// A sub-path entry point. `import from 'scena3d'` still gives you everything;
// this exists so a bundler can see module boundaries, and so an import says
// what part of the library it depends on.
//
// GENERATED from src/index.ts by scripts/entries.mjs — every statement below
// is the root barrel's own, partitioned by source directory. `npm run
// entries:check` fails if this file and the barrel disagree.

export { Rng, valueNoise2, fractalNoise2, hash2 } from './core/random';
export { PALETTES, DEFAULT_PALETTE, type Palette } from './core/palette';
export {
  collectObstacles,
  createSlot,
  addApproach,
  createPropSurface,
  type Obstacle,
  type Prop,
  type PropSlot,
  type PropSurface,
  type Carryable,
  type CarryStyle,
  type Gathering,
  type WaterBody,
} from './core/types';
export {
  hangOn,
  hangGallery,
  createWallAnchor,
  placeOn,
  dress,
  type HangSurface,
  type HangOptions,
  type GalleryOptions,
  type PlaceOptions,
  type DressOptions,
} from './core/place';
