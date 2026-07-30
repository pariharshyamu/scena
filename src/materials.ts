// SCENA — materials: procedural surfaces and glass
//
// A sub-path entry point. `import from 'scena3d'` still gives you everything;
// this exists so a bundler can see module boundaries, and so an import says
// what part of the library it depends on.
//
// GENERATED from src/index.ts by scripts/entries.mjs — every statement below
// is the root barrel's own, partitioned by source directory. `npm run
// entries:check` fails if this file and the barrel disagree.

export {
  createSurface,
  SURFACE_PRESETS,
  type SurfaceKind,
  type SurfaceParams,
  type SurfaceOptions,
} from './materials/surface';
export { createGlass, type GlassOptions } from './materials/glass';
export {
  createScreenPanel,
  type ScreenPanel,
  type ScreenPanelOptions,
  type ScreenMode,
  type ScreenOptions,
} from './materials/screen';
export {
  createPicture,
  pickPictureStyle,
  PICTURE_STYLES,
  ALL_PICTURE_STYLES,
  type Picture,
  type PictureOptions,
  type PictureStyle,
} from './materials/picture';
export {
  flowingWaterMaterial,
  createDroplets,
  type FlowOptions,
  type DropletOptions,
  type Droplets,
} from './materials/waterFlow';
