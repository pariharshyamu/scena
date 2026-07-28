import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/random';

/**
 * Lightning — the sky's percussion.
 *
 * A strike is three things at once: the **flash** (a two-pulse spike
 * driven through whatever targets you hand it — ambient intensity, sky
 * background, fog color — then decayed back to exactly where they
 * were), the **bolt** (a seeded forked polyline of additive tubes,
 * gone in a tenth of a second), and the **thunder** — an `onThunder`
 * callback delayed by the strike's distance, which is the handshake a
 * Soundboard answers. Distance IS the delay: close strikes crack
 * immediately, far ones rumble in late.
 *
 * ```ts
 * const storm = createLightning({
 *   targets: { ambient: rig.ambient, background: scene.background, fog: scene.fog },
 *   onThunder: (s) => sounds.crack(Math.min(1.4 - s.distance / 60, 1)),
 * });
 * scene.add(storm.group);
 * storm.storminess = 0.8;                 // auto-strikes, seeded
 * // per frame: storm.update(dt);
 * ```
 */

export interface Strike {
  /** Game-metres from the origin. */
  distance: number;
  /** Bearing of the strike, radians. */
  azimuth: number;
  /** 0..1 — how hard the flash hits. */
  energy: number;
}

export interface LightningTargets {
  ambient?: { intensity: number };
  /** A Color — the scene's background. */
  background?: { getHex(): number; setHex(hex: number): unknown } | null;
  /** The scene's fog (its color is flashed). */
  fog?: { color: { getHex(): number; setHex(hex: number): unknown } } | null;
}

export interface LightningOptions {
  targets?: LightningTargets;
  seed?: number;
  /** Mean seconds between auto-strikes at storminess 1. Default 5. */
  cadence?: number;
  /** Game-metres of thunder delay per real second. Default 100. */
  soundSpeed?: number;
  onStrike?: (strike: Strike) => void;
  onThunder?: (strike: Strike) => void;
}

export interface Lightning {
  /** Bolts appear here — add it to the scene. */
  group: Group;
  /** 0 = clear skies, 1 = the full show. Drives auto-strikes. */
  storminess: number;
  /** The current flash level, 0..1 — flash your own things by it too. */
  readonly flash: number;
  /** Strikes so far (auto + manual). */
  readonly strikes: number;
  /** Force a strike now; omitted fields are seeded. */
  strike(options?: Partial<Strike>): Strike;
  update(dt: number): void;
}

const FLASH_COLOR = new Color(0xcfd8ff);
const mixScratch = new Color();

interface Bolt {
  group: Group;
  material: MeshBasicMaterial;
  life: number;
}

export function createLightning(options: LightningOptions = {}): Lightning {
  const rng = new Rng(options.seed ?? 1);
  const targets = options.targets ?? {};
  const cadence = Math.max(options.cadence ?? 5, 0.5);
  const soundSpeed = Math.max(options.soundSpeed ?? 100, 1);

  const group = new Group();
  group.name = 'lightning';

  // Where the channels rest — the flash always decays back to exactly this.
  const baseAmbient = targets.ambient?.intensity ?? 0;
  const baseBackground = targets.background?.getHex() ?? 0;
  const baseFog = targets.fog?.color.getHex() ?? 0;

  let flash = 0;
  let strikes = 0;
  let clock = 0;
  let settled = true;
  const pendingThunder: Array<{ at: number; strike: Strike }> = [];
  const pendingPulse: Array<{ at: number; energy: number }> = [];
  const bolts: Bolt[] = [];

  const buildBolt = (strike: Strike): void => {
    const boltGroup = new Group();
    const material = new MeshBasicMaterial({
      color: 0xe8eeff,
      transparent: true,
      opacity: 0.95,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const x = Math.sin(strike.azimuth) * strike.distance;
    const z = Math.cos(strike.azimuth) * strike.distance;
    const run = (
      from: Vector3,
      to: Vector3,
      segments: number,
      radius: number,
      jitter: number
    ): Vector3[] => {
      const points: Vector3[] = [from.clone()];
      for (let i = 1; i < segments; i++) {
        const t = i / segments;
        points.push(
          new Vector3(
            from.x + (to.x - from.x) * t + rng.range(-jitter, jitter),
            from.y + (to.y - from.y) * t,
            from.z + (to.z - from.z) * t + rng.range(-jitter, jitter)
          )
        );
      }
      points.push(to.clone());
      for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i];
        const b = points[i + 1];
        const length = a.distanceTo(b);
        const tube = new Mesh(new CylinderGeometry(radius, radius, length, 4), material);
        tube.position.copy(a).add(b).multiplyScalar(0.5);
        tube.lookAt(b);
        tube.rotateX(Math.PI / 2);
        boltGroup.add(tube);
      }
      return points;
    };
    const top = new Vector3(x + rng.range(-3, 3), 26, z + rng.range(-3, 3));
    const ground = new Vector3(x, 0, z);
    const spine = run(top, ground, 8, 0.09, 1.6);
    // One fork, from a mid node, dying in the air.
    const forkFrom = spine[2 + rng.int(0, 2)];
    const forkTo = new Vector3(
      forkFrom.x + rng.range(-5, 5),
      forkFrom.y * rng.range(0.25, 0.5),
      forkFrom.z + rng.range(-5, 5)
    );
    run(forkFrom, forkTo, 4, 0.05, 1.0);
    group.add(boltGroup);
    bolts.push({ group: boltGroup, material, life: 0.16 });
  };

  const strike = (partial: Partial<Strike> = {}): Strike => {
    const s: Strike = {
      distance: partial.distance ?? rng.range(8, 45),
      azimuth: partial.azimuth ?? rng.range(0, Math.PI * 2),
      energy: partial.energy ?? rng.range(0.6, 1),
    };
    strikes++;
    // Far strikes flash softer.
    const felt = s.energy * Math.max(1 - s.distance / 90, 0.25);
    flash = Math.max(flash, felt);
    settled = false;
    // The double pulse — lightning never blinks just once.
    pendingPulse.push({ at: clock + 0.09, energy: felt * 0.65 });
    pendingThunder.push({ at: clock + s.distance / soundSpeed, strike: s });
    pendingThunder.sort((a, b) => a.at - b.at);
    buildBolt(s);
    options.onStrike?.(s);
    return s;
  };

  return {
    group,
    storminess: 0,
    get flash() {
      return flash;
    },
    get strikes() {
      return strikes;
    },
    strike,
    update(dt) {
      const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      clock += step;

      const self = this as Lightning;
      if (self.storminess > 0 && rng.next() < (self.storminess * step) / cadence) {
        strike();
      }

      for (let i = pendingPulse.length - 1; i >= 0; i--) {
        if (pendingPulse[i].at <= clock) {
          flash = Math.max(flash, pendingPulse[i].energy);
          pendingPulse.splice(i, 1);
        }
      }
      while (pendingThunder.length && pendingThunder[0].at <= clock) {
        // The shift must happen unconditionally — an optional call
        // `f?.(queue.shift())` skips its ARGUMENT when f is absent, and
        // an undrained queue is an infinite loop wearing a while.
        const due = pendingThunder.shift()!;
        options.onThunder?.(due.strike);
      }

      for (let i = bolts.length - 1; i >= 0; i--) {
        const bolt = bolts[i];
        bolt.life -= step;
        bolt.material.opacity = Math.max(bolt.life / 0.16, 0) * 0.95;
        if (bolt.life <= 0) {
          group.remove(bolt.group);
          bolt.material.dispose();
          bolt.group.traverse((c) => (c as Mesh).geometry?.dispose?.());
          bolts.splice(i, 1);
        }
      }

      // Decay the flash and drive the channels; land EXACTLY on base.
      if (flash > 0) flash = flash < 0.004 ? 0 : flash * Math.exp(-9 * step);
      if (!settled) {
        if (targets.ambient) targets.ambient.intensity = baseAmbient + flash * 1.6;
        if (targets.background) {
          mixScratch.setHex(baseBackground).lerp(FLASH_COLOR, Math.min(flash * 0.85, 1));
          targets.background.setHex(mixScratch.getHex());
        }
        if (targets.fog) {
          mixScratch.setHex(baseFog).lerp(FLASH_COLOR, Math.min(flash * 0.85, 1));
          targets.fog.color.setHex(mixScratch.getHex());
        }
        if (flash === 0 && pendingPulse.length === 0) {
          if (targets.ambient) targets.ambient.intensity = baseAmbient;
          if (targets.background) targets.background.setHex(baseBackground);
          if (targets.fog) targets.fog.color.setHex(baseFog);
          settled = true;
        }
      }
    },
  };
}
