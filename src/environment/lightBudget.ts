import { Group, PointLight, Vector3, type Object3D } from 'three';

/**
 * The light budget — spending scarcity where the camera is looking.
 *
 * Forward-rendered WebGL affords a handful of real dynamic lights before
 * mobile GPUs weep, but a street wants twenty lamps. The resolution: every
 * luminous prop keeps its cheap glow (emissive bulb + additive halo) always,
 * and *claims* a real light it may or may not be granted. The budget owns a
 * small pool of PointLights and, each update, grants them to the
 * best-scoring claims — score is priority over distance to the viewpoint —
 * so light pools appear under the lamps near the camera and quietly leave
 * the ones behind it.
 *
 * Granting is **hysteretic**: an incumbent keeps its light until a
 * challenger clearly outscores it, so panning the camera doesn't strobe
 * lights between owners. A kept claim also keeps the *same* PointLight
 * instance — no rebind flicker.
 *
 * ```ts
 * const budget = createLightBudget({ max: 6 });
 * scene.add(budget.group);
 * for (const lamp of lamps) budget.register(lamp.claim);
 * // per frame:
 * budget.update(camera.position);
 * ```
 */

export interface LightClaim {
  /** Where the light lives. An Object3D is tracked live (movers welcome). */
  anchor: Object3D | { x: number; y: number; z: number };
  color: number;
  /** Intensity the granted PointLight burns at. */
  intensity: number;
  /** Falloff distance of the granted light, metres. */
  radius: number;
  /** Bigger outranks distance. Default 1. */
  priority?: number;
  /**
   * Litness, read live — a doused fixture's claim goes ineligible without
   * any unregistering. Luminous props close this over their own state.
   */
  isLit?: () => boolean;
}

export interface LightGrant {
  readonly claim: LightClaim;
  /** Holding a real light right now? */
  readonly granted: boolean;
  /** Withdraw the claim entirely. */
  release(): void;
}

export interface LightBudgetOptions {
  /** Real lights in the pool. Default 6. */
  max?: number;
  /**
   * How decisively a challenger must beat an incumbent to take its light
   * (score ratio). 1 = no stickiness. Default 1.35.
   */
  hysteresis?: number;
}

export interface LightBudget {
  /** Add this to the scene — the pool lives here. */
  group: Group;
  readonly max: number;
  /** Claims currently holding a real light. */
  readonly active: number;
  register(claim: LightClaim): LightGrant;
  /** Re-grant the pool for this viewpoint (camera or hero position). */
  update(viewpoint: Object3D | { x: number; y: number; z: number }): void;
}

interface Entry {
  claim: LightClaim;
  score: number;
  light: PointLight | null;
  released: boolean;
}

const worldScratch = new Vector3();

function anchorPosition(anchor: LightClaim['anchor'], out: Vector3): Vector3 {
  if ((anchor as Object3D).isObject3D) {
    return (anchor as Object3D).getWorldPosition(out);
  }
  const p = anchor as { x: number; y: number; z: number };
  return out.set(p.x, p.y, p.z);
}

export function createLightBudget(options: LightBudgetOptions = {}): LightBudget {
  const max = Math.max(options.max ?? 6, 1);
  const hysteresis = Math.max(options.hysteresis ?? 1.35, 1);

  const group = new Group();
  group.name = 'light-budget';
  const pool: PointLight[] = [];
  for (let i = 0; i < max; i++) {
    const light = new PointLight(0xffffff, 0, 1, 2);
    group.add(light);
    pool.push(light);
  }

  const entries: Entry[] = [];
  const view = new Vector3();

  const update = (viewpoint: Object3D | { x: number; y: number; z: number }): void => {
    anchorPosition(viewpoint as LightClaim['anchor'], view);

    // Score every live claim; doused or released claims are ineligible.
    for (const entry of entries) {
      if (entry.released || entry.claim.isLit?.() === false) {
        entry.score = -1;
        continue;
      }
      const d = anchorPosition(entry.claim.anchor, worldScratch).distanceTo(view);
      entry.score = (entry.claim.priority ?? 1) / (1 + d);
    }

    const eligible = entries.filter((e) => e.score > 0).sort((a, b) => b.score - a.score);
    const cutoff = eligible.length > max ? eligible[max - 1].score : 0;

    // Incumbents stay unless clearly below the cut; they keep their light.
    const kept: Entry[] = [];
    for (const entry of entries) {
      if (entry.light && entry.score > 0 && entry.score * hysteresis >= cutoff) {
        kept.push(entry);
      } else if (entry.light) {
        entry.light.intensity = 0;
        entry.light = null;
      }
    }
    kept.sort((a, b) => b.score - a.score);
    for (const dropped of kept.splice(max)) {
      // paranoia: never over budget
      if (dropped.light) dropped.light.intensity = 0;
      dropped.light = null;
    }

    // Fill free slots with the best of the rest.
    const free = pool.filter((l) => !kept.some((e) => e.light === l));
    for (const entry of eligible) {
      if (kept.length >= max) break;
      if (entry.light) continue;
      const light = free.pop();
      if (!light) break;
      entry.light = light;
      kept.push(entry);
    }

    // Park the granted lights on their fixtures.
    for (const entry of kept) {
      const light = entry.light!;
      anchorPosition(entry.claim.anchor, worldScratch);
      light.position.copy(worldScratch);
      light.color.setHex(entry.claim.color);
      light.intensity = entry.claim.intensity;
      light.distance = entry.claim.radius;
    }
  };

  return {
    group,
    max,
    get active() {
      return entries.filter((e) => e.light !== null).length;
    },
    register(claim) {
      const entry: Entry = { claim, score: 0, light: null, released: false };
      entries.push(entry);
      return {
        claim,
        get granted() {
          return entry.light !== null;
        },
        release() {
          entry.released = true;
          if (entry.light) {
            entry.light.intensity = 0;
            entry.light = null;
          }
          const i = entries.indexOf(entry);
          if (i >= 0) entries.splice(i, 1);
        },
      };
    },
    update,
  };
}
