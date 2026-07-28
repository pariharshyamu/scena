import {
  Color,
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  LinearFilter,
  RGBAFormat,
  Vector3,
  type DirectionalLight,
  type Scene,
} from 'three';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';

/**
 * A scene environment — the thing that makes metal look like metal.
 *
 * A metal has no diffuse colour. Everything you see on it is a reflection,
 * so a metal in a scene with nothing to reflect renders BLACK. That is not
 * a bug in the material: it is the material being right about a world with
 * no sky in it. `createSky` draws a beautiful gradient dome, but a dome is
 * geometry — three cannot reflect it, because reflection needs an
 * environment map and a mesh is not one.
 *
 * So this builds one, from the same gradient the sky is drawing: a tiny
 * equirectangular {@link DataTexture} — sky above, ground bounce below, and
 * the sun burned in where the lighting rig actually put it. Nothing is
 * fetched, nothing is loaded, and three PMREM-filters it on first use so
 * rough surfaces get a blurred version and polished ones a sharp one.
 *
 * ```ts
 * const rig = createLightingRig('day');
 * scene.add(createSky({ palette }).mesh, rig.group);
 * applyEnvironment(scene, { palette, sun: rig.sun });   // now chrome is chrome
 * ```
 *
 * It affects every PBR material in the scene, not just the metals: it is
 * ambient light arriving from a direction, which is what the flat
 * `AmbientLight` in the rig is a stand-in for.
 */
export interface EnvironmentOptions {
  /** Palette to take the sky colours from. */
  palette?: Palette;
  /** Zenith colour (hex int). Defaults to the palette's `skyTop`. */
  top?: number;
  /** Horizon colour (hex int). Defaults to the palette's `skyBottom`. */
  horizon?: number;
  /**
   * What the light bounces off below the horizon (hex int). Defaults to the
   * palette's `grassLow` — the ground half of an environment matters more
   * than it sounds, because it is what stops the underside of everything
   * metal from being a black hole.
   */
  ground?: number;
  /**
   * The sun to burn into the map, as a light or a direction. A sky with no
   * sun in it gives polished metal a soft even sheen and no highlight at
   * all, which reads as plastic.
   */
  sun?: DirectionalLight | Vector3 | null;
  /** How bright the sun disc is, relative to the sky. Default 6. */
  sunIntensity?: number;
  /** How tight it is: bigger is smaller. Default 380. */
  sunFocus?: number;
  /** Overall strength, written to `scene.environmentIntensity`. Default 1. */
  intensity?: number;
  /**
   * Equirect width in texels (height is half). Default 128 — this is an
   * environment, not a photograph, and three blurs it into a PMREM chain
   * anyway.
   */
  size?: number;
}

export interface SceneEnvironment {
  /** The generated map, already assigned to `scene.environment`. */
  texture: DataTexture;
  /** Rebuild after changing the palette or moving the sun. */
  refresh(options?: EnvironmentOptions): void;
  /** Take it off the scene and free it. */
  dispose(): void;
}

const SUN_DIR = new Vector3();
const DIR = new Vector3();

function sunDirection(sun: EnvironmentOptions['sun']): Vector3 | null {
  if (!sun) return null;
  if (sun instanceof Vector3) return SUN_DIR.copy(sun).normalize();
  // A DirectionalLight shines from its position toward its target, so the
  // direction light ARRIVES from is the position — which is where the sun
  // has to be in the sky for the highlight to land in the same place.
  return SUN_DIR.copy(sun.position).sub(sun.target.position).normalize();
}

/**
 * Paint the equirect: sky above, ground below, sun where the rig put it.
 *
 * Use this directly — rather than {@link applyEnvironment} — when only SOME
 * materials should reflect, because a per-material `envMap` is the only way
 * to do that. `scene.environment` cannot be opted out of: three overwrites
 * `material.envMapIntensity` with `scene.environmentIntensity` for every
 * material that has no `envMap` of its own, so setting it to 0 on one
 * material does nothing at all.
 *
 * ```ts
 * const map = createEnvironmentMap({ palette, sun: rig.sun });
 * chrome.envMap = map;            // this one reflects
 * plaster.envMap = null;          // this one does not
 * ```
 */
export function createEnvironmentMap(options: EnvironmentOptions = {}): DataTexture {
  const palette = options.palette ?? DEFAULT_PALETTE;
  const width = Math.max(16, Math.round(options.size ?? 128));
  const height = Math.max(8, width >> 1);
  const top = new Color(options.top ?? palette.skyTop);
  const horizon = new Color(options.horizon ?? palette.skyBottom);
  const ground = new Color(options.ground ?? palette.grassLow);
  const sun = sunDirection(options.sun);
  const sunPower = options.sunIntensity ?? 6;
  const focus = options.sunFocus ?? 380;

  const data = new Float32Array(width * height * 4);
  const c = new Color();
  for (let y = 0; y < height; y++) {
    // Equirect: v spans the poles, u spans the full turn.
    const phi = ((y + 0.5) / height) * Math.PI;
    for (let x = 0; x < width; x++) {
      const theta = ((x + 0.5) / width) * Math.PI * 2;
      DIR.set(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      );
      if (DIR.y >= 0) {
        // The same curve the sky dome's shader draws, so the reflection and
        // the backdrop agree with each other.
        c.copy(horizon).lerp(top, Math.pow(DIR.y, 0.8));
      } else {
        // Below the horizon it falls off to the ground colour rather than
        // cutting to it — light bounces, it does not stop.
        c.copy(horizon).lerp(ground, Math.min(1, -DIR.y * 2.2));
      }
      let r = c.r;
      let g = c.g;
      let b = c.b;
      if (sun) {
        const spot = Math.pow(Math.max(0, DIR.dot(sun)), focus) * sunPower;
        if (spot > 0) {
          r += spot;
          g += spot * 0.97;
          b += spot * 0.9;
        }
      }
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 1;
    }
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
  // Equirect + reflection mapping is the form three knows how to PMREM.
  texture.mapping = EquirectangularReflectionMapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.name = 'scena-environment';
  return texture;
}

/**
 * Give the scene something to reflect. Returns a handle so it can be
 * refreshed when the sun moves or the palette changes, and disposed.
 */
export function applyEnvironment(
  scene: Scene,
  options: EnvironmentOptions = {}
): SceneEnvironment {
  let current = options;
  let texture = createEnvironmentMap(current);
  scene.environment = texture;
  scene.environmentIntensity = options.intensity ?? 1;

  return {
    get texture() {
      return texture;
    },
    refresh(next = {}) {
      current = { ...current, ...next };
      texture.dispose();
      texture = createEnvironmentMap(current);
      scene.environment = texture;
      if (next.intensity !== undefined) scene.environmentIntensity = next.intensity;
    },
    dispose() {
      if (scene.environment === texture) scene.environment = null;
      texture.dispose();
    },
  };
}
