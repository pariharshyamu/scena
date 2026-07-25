// SCENA — SCenes & ENvironment Assets
// A 3D world-building library on top of three.js. Seeded procedural props,
// terrain, sky, lighting and scattering — with gameplay metadata (steering
// obstacles, walkable surfaces) that game libraries like GAMA understand.

// Core
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
} from './core/types';

// Materials
export {
  createSurface,
  SURFACE_PRESETS,
  type SurfaceKind,
  type SurfaceParams,
  type SurfaceOptions,
} from './materials/surface';
export { createGlass, type GlassOptions } from './materials/glass';

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
export {
  createTree,
  treeBiome,
  TREE_SPECIES,
  TREE_BIOMES,
  type TreeOptions,
  type TreeSpecies,
  type TreeSeason,
  type TreeBiome,
  type TreeBiomeOptions,
} from './props/tree';
export {
  createImpostor,
  treeLOD,
  type ImpostorOptions,
  type ImpostorProfile,
  type TreeLODOptions,
} from './props/impostor';
export { createRock, type RockOptions } from './props/rock';
export { createCrate, type CrateOptions } from './props/crate';
export {
  createBarrel,
  createBasket,
  createSack,
  createLantern,
  type CarryableOptions,
  type LanternOptions,
} from './props/carryables';
export {
  createChoppingBlock,
  createOreVein,
  createCookpot,
  createSawhorse,
  type WorkStation,
  type WorkStationOptions,
} from './props/workstations';
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
export {
  createTable,
  createSeat,
  createBed,
  createShelf,
  createChest,
  createCandle,
  createRug,
  type TableOptions,
  type TableStyle,
  type SeatOptions,
  type SeatStyle,
  type BedOptions,
  type BedSize,
  type ShelfOptions,
  type ShelfStock,
  type ChestOptions,
  type CandleOptions,
  type CandleStyle,
  type RugOptions,
  type RugShape,
} from './props/furniture';
export {
  createDiningTable,
  createPicnicTable,
  createLongBench,
  createGameTable,
  createCampCircle,
  type GatheringOptions,
  type DiningTableOptions,
  type PicnicTableOptions,
  type LongBenchOptions,
  type GameTableOptions,
  type CampCircleOptions,
  type BoardGame,
} from './props/gatherings';
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
export { createOcean, type Ocean, type OceanOptions } from './environment/ocean';
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

// Generators
export { createVillage, type Village, type VillageOptions } from './generators/village';
export { createBungalow, type Bungalow, type BungalowOptions } from './generators/bungalow';
export {
  createHighrise,
  type Highrise,
  type HighriseOptions,
} from './generators/tower';

// Kits
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
  createInteriorLight,
  type InteriorLight,
  type InteriorLightOptions,
  type InteriorSun,
} from './environment/interiorLight';
export {
  furnishRoom,
  type Furnished,
  type FurnishOptions,
  type RoomRole,
  type RoomMarkers,
} from './kits/furnish';
export {
  createForge,
  createOven,
  createLoom,
  createCounter,
  type WorkshopOptions,
} from './props/workshop';
export {
  createTreadmill,
  createGuitar,
  createToilet,
  createSink,
  createBathtub,
  type TreadmillOptions,
  type TreadmillProp,
  type GuitarOptions,
  type BathroomOptions,
} from './props/stations';
export {
  createCar,
  createBike,
  createTractor,
  createTruck,
  type VehicleOptions,
  type VehicleInput,
  type VehicleProp,
} from './props/vehicles';
export {
  createBoat,
  createShip,
  type CraftOptions,
  type CraftInput,
  type CraftProp,
} from './props/watercraft';
export {
  createRailing,
  createModernWindow,
  createGate,
  createCladding,
  createPergola,
  createPlanter,
  type RailingOptions,
  type RailingStyle,
  type ModernWindowOptions,
  type ModernWindowStyle,
  type ModernWindowProp,
  type GateOptions,
  type GateStyle,
  type GateProp,
  type CladdingOptions,
  type CladdingStyle,
  type PergolaOptions,
  type PlanterOptions,
} from './props/modern';
export {
  createDoor,
  createDrawer,
  createLever,
  createValve,
  createHatch,
  createPortcullis,
  type Manipulable,
  type MechanismOptions,
  type DoorOptions,
  type DrawerOptions,
  type LeverOptions,
  type ValveOptions,
  type HatchOptions,
  type PortcullisOptions,
} from './props/mechanisms';

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
export {
  createLadder,
  createSaddle,
  createBridle,
  type Ladder,
  type LadderOptions,
  type LadderStyle,
  type TackOptions,
  type TackStyle,
} from './props/climbing';

// Screens & electronics
export {
  createScreenPanel,
  type ScreenPanel,
  type ScreenPanelOptions,
  type ScreenMode,
  type ScreenOptions,
} from './materials/screen';
export {
  createMonitor,
  createTelevision,
  createLaptop,
  createSmartDisplay,
  createTablet,
  createPhone,
  createSmartwatch,
  createScreenLight,
  type ScreenProp,
  type ScreenPropOptions,
  type ScreenCarryable,
  type TelevisionOptions,
  type LaptopOptions,
  type ScreenLight,
  type ScreenLightOptions,
} from './props/electronics';
export {
  createTerminal,
  type Terminal,
  type TerminalOptions,
  type TerminalStyle,
} from './props/terminals';
export {
  createFixture,
  createDeskSet,
  type Fixture,
  type FixtureOptions,
  type FixtureStyle,
  type DeskSet,
} from './props/fixtures';

// Decoration — wall art, and where a person would actually put it
export {
  createPicture,
  pickPictureStyle,
  PICTURE_STYLES,
  type Picture,
  type PictureOptions,
  type PictureStyle,
} from './materials/picture';
export {
  createPainting,
  createFramedPhoto,
  createMirror,
  createWallClock,
  createTapestry,
  type WallArt,
  type FrameStyle,
  type PaintingOptions,
  type FramedPhotoOptions,
  type MirrorOptions,
  type WallClock,
  type WallClockOptions,
  type TapestryOptions,
} from './props/wallArt';
export {
  createVessel,
  VESSEL_STYLES,
  type Vessel,
  type VesselOptions,
  type VesselStyle,
} from './props/vessels';
export {
  createBooks,
  createPapers,
  createFolded,
  createTrinket,
  createFruitBowl,
  createClutter,
  CLUTTER_THEMES,
  type BooksOptions,
  type BookStyle,
  type PapersOptions,
  type FoldedOptions,
  type TrinketOptions,
  type FruitBowlOptions,
  type ClutterOptions,
  type ClutterKitOptions,
  type ClutterTheme,
} from './props/clutter';
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
