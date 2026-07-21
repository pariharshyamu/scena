import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, type Scene } from 'three';
import { Rng } from '../core/random';
import { PALETTES, DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { Obstacle, Prop } from '../core/types';
import { createTerrain, type Terrain } from '../environment/terrain';
import { createWater, aboveWater, type Water } from '../environment/water';
import { createSky, type Sky } from '../environment/sky';
import {
  createLightingRig,
  applyFog,
  type LightingRig,
  type LightingPreset,
  type FogPreset,
} from '../environment/lighting';
import { createDayCycle, type DayCycle } from '../environment/dayCycle';
import { applyWind, type Wind } from '../environment/wind';
import { createPath, type WorldPath } from '../environment/path';
import { createVillage, type Village } from '../generators/village';
import { scatter, type ScatterResult, type ScatterItem } from '../scatter/scatter';
import { createTree } from '../props/tree';
import { createRock } from '../props/rock';
import { createCrate } from '../props/crate';
import { createFence } from '../props/fence';
import { createLamp } from '../props/lamp';
import { createGrassTuft, createBush } from '../props/grass';

/** Prop vocabulary available to manifest scatters. */
export type ScatterPropType = 'tree' | 'rock' | 'bush' | 'grass' | 'crate' | 'fence' | 'lamp';

export interface ManifestScatterItem {
  type: ScatterPropType;
  weight?: number;
  variants?: number;
  scale?: [number, number];
}

export interface ManifestScatter {
  /** Defaults to the terrain footprint (slightly inset). */
  area?: { min: { x: number; z: number }; max: { x: number; z: number } };
  density?: number;
  count?: number;
  minSpacing?: number;
  clumpScale?: number;
  items: ManifestScatterItem[];
  /** Reject spots above this ground height (keep peaks bare). */
  maxHeight?: number;
  /** Keep placements ashore. Default true when the scene has water. */
  avoidWater?: boolean;
  /** Keep placements off paths and out of the village. Default true. */
  avoidPaths?: boolean;
  /** Opt into tile-based LOD (see ScatterOptions.lod). */
  lod?: { distance: number; tileSize?: number };
}

/**
 * A whole world as plain JSON — every field is data, so manifests can be
 * stored, diffed, sent over the network, or edited in a tool.
 */
export interface SceneManifest {
  seed?: number;
  palette?: keyof typeof PALETTES;
  terrain?: {
    size?: number;
    resolution?: number;
    amplitude?: number;
    noiseScale?: number;
    octaves?: number;
    valleyFlatness?: number;
  };
  water?: { level: number; size?: number };
  /** Sky dome. Default true. */
  sky?: boolean;
  lighting?: LightingPreset;
  /** Fog preset, or false for none. Default 'haze'. */
  fog?: FogPreset | false;
  /** Animated day-night cycle. Off unless specified. */
  dayCycle?: { dayLength?: number; timeOfDay?: number };
  paths?: Array<{
    points: Array<{ x: number; z: number }>;
    width?: number;
    loop?: boolean;
  }>;
  village?: {
    center?: { x: number; z: number };
    radius?: number;
    houses?: number;
    lampLights?: number;
    tower?: boolean;
    ruin?: boolean;
  };
  scatters?: ManifestScatter[];
  /** Vegetation sway. Default on; false disables, or set the strength. */
  wind?: boolean | { strength?: number };
}

export interface BuiltScene {
  /** Everything visual, ready to add to a scene (already added if one was passed). */
  group: Group;
  palette: Palette;
  terrain?: Terrain;
  water?: Water;
  sky?: Sky;
  rig: LightingRig;
  cycle?: DayCycle;
  paths: WorldPath[];
  village?: Village;
  scatters: ScatterResult[];
  /** Combined steering obstacles from the village and every scatter. */
  obstacles: Obstacle[];
  /** Ground height (terrain's, or 0 for flat scenes). */
  heightAt(x: number, z: number): number;
  /** Advance water, wind and the day cycle. Call from your frame loop. */
  update(dt: number): void;
}

const PROP_FACTORIES: Record<ScatterPropType, (seed: number, palette: Palette) => Prop> = {
  tree: (seed, palette) => createTree({ seed, palette }),
  rock: (seed, palette) => createRock({ seed, palette }),
  bush: (seed, palette) => createBush({ seed, palette }),
  grass: (seed, palette) => createGrassTuft({ seed, palette }),
  crate: (seed, palette) => createCrate({ seed, palette }),
  fence: (seed, palette) => createFence({ seed, palette }),
  lamp: (seed, palette) => createLamp({ seed, palette }),
};

// Far-distance stand-ins used when a manifest scatter opts into LOD:
// trees collapse to a single cone, bushes to a squat cone, grass vanishes.
const FAR_FACTORIES: Partial<Record<ScatterPropType, (seed: number, palette: Palette) => Prop>> = {
  tree: (seed, palette) => {
    const rng = new Rng(seed);
    const group = new Group();
    const cone = new Mesh(
      new CylinderGeometry(0, rng.range(1.0, 1.4), rng.range(2.6, 3.8), 5),
      new MeshStandardMaterial({ color: rng.pick(palette.foliage), flatShading: true })
    );
    cone.position.y = cone.geometry.parameters.height / 2 + 0.3;
    group.add(cone);
    return { object: group, obstacleRadius: 0 };
  },
  bush: (seed, palette) => {
    const rng = new Rng(seed);
    const group = new Group();
    const cone = new Mesh(
      new CylinderGeometry(0.1, rng.range(0.5, 0.7), rng.range(0.5, 0.8), 5),
      new MeshStandardMaterial({ color: rng.pick(palette.foliage), flatShading: true })
    );
    cone.position.y = 0.3;
    group.add(cone);
    return { object: group, obstacleRadius: 0 };
  },
  grass: () => ({ object: new Group(), obstacleRadius: 0 }),
};

/**
 * Compile a `SceneManifest` into a live world: terrain, water, sky,
 * lighting, fog, paths, a village, scatters and the day cycle — with all
 * the cross-feature wiring the forest demo does by hand applied
 * automatically (scatters stay ashore, off paths and out of the village;
 * the village avoids water and roads; village lamps and windows feed the
 * day cycle).
 *
 * ```ts
 * const world = buildScene(JSON.parse(manifestJson), scene);
 * game.onUpdate((t) => world.update(t.delta));
 * agent.addBehavior(new ObstacleAvoidance(() => world.obstacles));
 * ```
 */
export function buildScene(manifest: SceneManifest, scene?: Scene): BuiltScene {
  const seed = manifest.seed ?? 1;
  const palette = manifest.palette ? PALETTES[manifest.palette] : DEFAULT_PALETTE;
  const group = new Group();
  group.name = 'scena-scene';
  const updates: Array<(dt: number) => void> = [];

  // Ground and water.
  let terrain: Terrain | undefined;
  if (manifest.terrain) {
    terrain = createTerrain({
      ...manifest.terrain,
      seed,
      waterLevel: manifest.water?.level,
      palette,
    });
    group.add(terrain.mesh);
  }
  const heightAt = terrain ? terrain.heightAt : () => 0;

  let water: Water | undefined;
  if (manifest.water) {
    water = createWater({
      level: manifest.water.level,
      size: manifest.water.size ?? (terrain ? terrain.size * 1.4 : 200),
      palette,
    });
    group.add(water.mesh);
    updates.push((dt) => water!.update(dt));
  }
  const dryLand = terrain && water ? aboveWater(terrain, water, 0.3) : () => true;

  // Sky, lights, fog.
  let sky: Sky | undefined;
  if (manifest.sky ?? true) {
    sky = createSky({ palette });
    group.add(sky.mesh);
  }
  const rig = createLightingRig(manifest.lighting ?? 'day');
  group.add(rig.group);
  if (scene && manifest.fog !== false) applyFog(scene, manifest.fog ?? 'haze', palette);

  // Paths.
  const paths: WorldPath[] = (manifest.paths ?? []).map((spec) => {
    const path = createPath(spec.points, {
      surface: heightAt,
      width: spec.width,
      loop: spec.loop,
      palette,
    });
    group.add(path.mesh);
    return path;
  });
  const onAnyPath = (x: number, z: number): boolean => paths.some((p) => p.contains(x, z));

  // Village.
  let village: Village | undefined;
  if (manifest.village) {
    village = createVillage({
      ...manifest.village,
      seed: seed + 1,
      surface: heightAt,
      mask: (x, z) => dryLand(x, z) && !onAnyPath(x, z),
      palette,
    });
    group.add(village.group);
  }

  // Scatters, kept ashore / off roads / out of the village by default.
  const wind = manifest.wind ?? true;
  const scatters: ScatterResult[] = (manifest.scatters ?? []).map((spec, index) => {
    const inset = terrain ? terrain.size * 0.45 : 40;
    const avoidWater = spec.avoidWater ?? true;
    const avoidPaths = spec.avoidPaths ?? true;
    const result = scatter({
      seed: seed + 10 + index,
      area: spec.area ?? { min: { x: -inset, z: -inset }, max: { x: inset, z: inset } },
      surface: heightAt,
      density: spec.density,
      count: spec.count,
      minSpacing: spec.minSpacing,
      clumpScale: spec.clumpScale,
      lod: spec.lod,
      items: spec.items.map((item): ScatterItem => {
        const far = spec.lod ? FAR_FACTORIES[item.type] : undefined;
        return {
          create: (rng) => PROP_FACTORIES[item.type](rng.int(1, 1e9), palette),
          createFar: far && ((rng) => far(rng.int(1, 1e9), palette)),
          weight: item.weight,
          variants: item.variants,
          scale: item.scale,
        };
      }),
      mask: (x, z, y) =>
        (spec.maxHeight === undefined || y < spec.maxHeight) &&
        (!avoidWater || dryLand(x, z)) &&
        (!avoidPaths || !onAnyPath(x, z)),
      keepOut: [
        ...(avoidPaths ? paths.flatMap((p) => p.keepOut) : []),
        ...(village ? village.keepOut : []),
      ],
    });
    group.add(result.group);
    if (wind !== false) {
      const sway: Wind = applyWind(result.group, {
        strength: typeof wind === 'object' ? wind.strength ?? 0.05 : 0.05,
      });
      updates.push((dt) => sway.update(dt));
    }
    return result;
  });

  // Day cycle last, so it can adopt the village's lamps and windows.
  let cycle: DayCycle | undefined;
  if (manifest.dayCycle) {
    cycle = createDayCycle({
      sky,
      rig,
      scene,
      lamps: village?.lamps,
      palette,
      dayLength: manifest.dayCycle.dayLength,
      timeOfDay: manifest.dayCycle.timeOfDay,
    });
    updates.push((dt) => cycle!.update(dt));
  }

  scene?.add(group);

  return {
    group,
    palette,
    terrain,
    water,
    sky,
    rig,
    cycle,
    paths,
    village,
    scatters,
    obstacles: [
      ...(village ? village.obstacles : []),
      ...scatters.flatMap((s) => s.obstacles),
    ],
    heightAt,
    update(dt) {
      for (const fn of updates) fn(dt);
    },
  };
}
