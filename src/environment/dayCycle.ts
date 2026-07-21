import { Color, PointLight, type MeshStandardMaterial, type Mesh, type Object3D, type Scene } from 'three';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { LightingRig } from './lighting';
import type { Sky } from './sky';

interface Keyframe {
  t: number;
  skyTop: number;
  skyBottom: number;
  sun: number;
  sunIntensity: number;
  ambientIntensity: number;
  fog: number;
}

export interface DayCycleOptions {
  sky?: Sky;
  rig?: LightingRig;
  /** Scene whose fog color should track the cycle. */
  scene?: Scene;
  /** Lamp props/objects whose PointLights + glow bulbs ignite at night. */
  lamps?: Array<{ object: Object3D } | Object3D>;
  palette?: Palette;
  /** Seconds per full day. Default 60. */
  dayLength?: number;
  /** Initial time: 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk. */
  timeOfDay?: number;
}

export interface DayCycle {
  timeOfDay: number;
  /** Sun elevation in [-1, 1]; negative = below the horizon. */
  readonly sunElevation: number;
  readonly isNight: boolean;
  /** Advance by dt seconds of real time and re-apply everything. */
  update(dt: number): void;
  /** Jump to a time of day and re-apply everything. */
  set(t: number): void;
}

/**
 * One `timeOfDay` parameter driving the whole environment in lockstep:
 * sun position/color/intensity, sky gradient, ambient level, fog color,
 * and lamps that ignite as the sun drops below the horizon.
 *
 * ```ts
 * const cycle = createDayCycle({ sky, rig, scene, lamps: [lampA, lampB], dayLength: 120 });
 * game.onUpdate((t) => cycle.update(t.delta));
 * ```
 */
export function createDayCycle(options: DayCycleOptions = {}): DayCycle {
  const palette = options.palette ?? DEFAULT_PALETTE;
  const dayLength = options.dayLength ?? 60;

  // Universal ramp; noon colors come from the palette so themes carry through.
  const frames: Keyframe[] = [
    { t: 0.0, skyTop: 0x0b1026, skyBottom: 0x1a2340, sun: 0x8ea6d8, sunIntensity: 0.03, ambientIntensity: 0.06, fog: 0x141a2e },
    { t: 0.23, skyTop: 0x27335c, skyBottom: 0x6a5470, sun: 0xcf9a72, sunIntensity: 0.3, ambientIntensity: 0.12, fog: 0x4a4258 },
    { t: 0.3, skyTop: 0x4a6ba0, skyBottom: 0xe8a97a, sun: 0xffb861, sunIntensity: 1.0, ambientIntensity: 0.26, fog: 0xb08a72 },
    { t: 0.5, skyTop: palette.skyTop, skyBottom: palette.skyBottom, sun: 0xfff4e0, sunIntensity: 1.9, ambientIntensity: 0.45, fog: palette.fog },
    { t: 0.7, skyTop: 0x4a5a94, skyBottom: 0xe0955e, sun: 0xffa050, sunIntensity: 1.0, ambientIntensity: 0.26, fog: 0xa07a68 },
    { t: 0.78, skyTop: 0x232a52, skyBottom: 0x8a5560, sun: 0xd88a5a, sunIntensity: 0.25, ambientIntensity: 0.11, fog: 0x463e54 },
    { t: 1.0, skyTop: 0x0b1026, skyBottom: 0x1a2340, sun: 0x8ea6d8, sunIntensity: 0.03, ambientIntensity: 0.06, fog: 0x141a2e },
  ];

  // Collect lamp lights and glowing bulb materials once.
  const lampLights: Array<{ light: PointLight; base: number }> = [];
  const lampBulbs: Array<{ material: MeshStandardMaterial; base: number }> = [];
  for (const entry of options.lamps ?? []) {
    const root = (entry as { isObject3D?: boolean }).isObject3D
      ? (entry as Object3D)
      : (entry as { object: Object3D }).object;
    root.traverse((child) => {
      if (child instanceof PointLight) {
        lampLights.push({ light: child, base: child.intensity || 6 });
      }
      const material = (child as Mesh).material as MeshStandardMaterial | undefined;
      if (material?.emissive && material.emissiveIntensity > 0.5) {
        lampBulbs.push({ material, base: material.emissiveIntensity });
      }
    });
  }

  const colorA = new Color();
  const colorB = new Color();
  let timeOfDay = options.timeOfDay ?? 0.5;
  let sunElevation = 0;

  const sample = (t: number): Keyframe => {
    let a = frames[0];
    let b = frames[frames.length - 1];
    for (let i = 0; i < frames.length - 1; i++) {
      if (t >= frames[i].t && t <= frames[i + 1].t) {
        a = frames[i];
        b = frames[i + 1];
        break;
      }
    }
    const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    const lerpHex = (ha: number, hb: number): number =>
      colorA.setHex(ha).lerp(colorB.setHex(hb), f).getHex();
    return {
      t,
      skyTop: lerpHex(a.skyTop, b.skyTop),
      skyBottom: lerpHex(a.skyBottom, b.skyBottom),
      sun: lerpHex(a.sun, b.sun),
      sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * f,
      ambientIntensity: a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * f,
      fog: lerpHex(a.fog, b.fog),
    };
  };

  const apply = (): void => {
    const t = timeOfDay;
    const frame = sample(t);
    const sunAngle = (t - 0.25) * Math.PI * 2;
    sunElevation = Math.sin(sunAngle);

    options.sky?.setColors(frame.skyTop, frame.skyBottom);
    if (options.rig) {
      const { sun, ambient, hemisphere } = options.rig;
      sun.color.setHex(frame.sun);
      sun.intensity = frame.sunIntensity;
      sun.position.set(Math.cos(sunAngle) * 40, Math.max(sunElevation, -0.2) * 45 + 6, 16);
      ambient.intensity = frame.ambientIntensity;
      // Hemisphere fill follows the ambient curve so nights actually darken.
      hemisphere.intensity = frame.ambientIntensity * 1.4;
    }
    if (options.scene?.fog && 'color' in options.scene.fog) {
      options.scene.fog.color.setHex(frame.fog);
    }
    // Lamps fade in as the sun dips below the horizon.
    const night = Math.min(1, Math.max(0, (0.06 - sunElevation) / 0.16));
    for (const { light, base } of lampLights) light.intensity = base * night;
    for (const { material, base } of lampBulbs) {
      material.emissiveIntensity = 0.15 * base + 0.85 * base * night;
    }
  };
  apply();

  return {
    get timeOfDay() {
      return timeOfDay;
    },
    set timeOfDay(t: number) {
      timeOfDay = ((t % 1) + 1) % 1;
      apply();
    },
    get sunElevation() {
      return sunElevation;
    },
    get isNight() {
      return sunElevation < 0;
    },
    update(dt) {
      timeOfDay = (timeOfDay + dt / dayLength) % 1;
      apply();
    },
    set(t) {
      timeOfDay = ((t % 1) + 1) % 1;
      apply();
    },
  };
}
