import {
  AmbientLight,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  type Scene,
} from 'three';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';

export type LightingPreset = 'day' | 'golden-hour' | 'overcast' | 'night';

export interface LightingRig {
  group: Group;
  sun: DirectionalLight;
  ambient: AmbientLight;
  hemisphere: HemisphereLight;
}

const PRESETS: Record<
  LightingPreset,
  { sun: number; sunIntensity: number; sunPos: [number, number, number]; ambient: number; ambientIntensity: number; skyTint: number; groundTint: number }
> = {
  day: {
    sun: 0xfff4e0, sunIntensity: 1.6, sunPos: [30, 45, 20],
    ambient: 0xdfeaff, ambientIntensity: 0.35, skyTint: 0xbcd8ff, groundTint: 0x6a7d66,
  },
  'golden-hour': {
    sun: 0xffb861, sunIntensity: 1.7, sunPos: [40, 14, -12],
    ambient: 0xffdcc0, ambientIntensity: 0.3, skyTint: 0xffcf9e, groundTint: 0x7a6a58,
  },
  overcast: {
    sun: 0xd8dee8, sunIntensity: 0.7, sunPos: [12, 40, 8],
    ambient: 0xcfd6e0, ambientIntensity: 0.65, skyTint: 0xc8d0dc, groundTint: 0x707a78,
  },
  night: {
    sun: 0x8ea6d8, sunIntensity: 0.35, sunPos: [-20, 30, -25],
    ambient: 0x3a4468, ambientIntensity: 0.35, skyTint: 0x2c3560, groundTint: 0x1e2430,
  },
};

/**
 * The three lights every scene rebuilds, as a preset: warm directional
 * "sun" (position doubles as light direction), ambient fill, and a
 * hemisphere tint. Retune any of them via the returned rig.
 */
export function createLightingRig(preset: LightingPreset = 'day'): LightingRig {
  const config = PRESETS[preset];
  const group = new Group();
  group.name = `lighting-${preset}`;
  const sun = new DirectionalLight(config.sun, config.sunIntensity);
  sun.position.set(...config.sunPos);
  const ambient = new AmbientLight(config.ambient, config.ambientIntensity);
  const hemisphere = new HemisphereLight(config.skyTint, config.groundTint, 0.5);
  group.add(sun, ambient, hemisphere);
  return { group, sun, ambient, hemisphere };
}

export type FogPreset = 'clear' | 'haze' | 'thick' | 'eerie';

const FOG: Record<Exclude<FogPreset, 'clear'>, { near: number; far: number }> = {
  haze: { near: 45, far: 160 },
  thick: { near: 12, far: 70 },
  eerie: { near: 6, far: 42 },
};

/** Distance fog matched to the palette's fog color. 'clear' removes it. */
export function applyFog(scene: Scene, preset: FogPreset, palette: Palette = DEFAULT_PALETTE): void {
  if (preset === 'clear') {
    scene.fog = null;
    return;
  }
  const { near, far } = FOG[preset];
  scene.fog = new Fog(palette.fog, near, far);
}
