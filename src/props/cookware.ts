import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createFill, createSteam, type Fill, type Steam } from './waterworks';
import type { HeatControl, HeatField } from './heat';
import type { Carryable, CarryStyle } from '../core/types';

/**
 * Cookware, and what is in it.
 *
 * The heat track made a field; this is the thing that reads it. A pan is a
 * container with **contents that change**, and the change is the whole prop:
 * raw → cooking → done → burnt, driven entirely by how hot it is where the
 * pan is standing.
 *
 * Two things make it behave rather than tick:
 *
 * - **The pan has its own temperature**, and it lags. Food does not start
 *   cooking the instant a ring is lit, and a cauldron takes far longer to
 *   come up than a frying pan, because there is a great deal more iron in
 *   it. Drive `progress` straight off `heatAt` and everything cooks the
 *   moment it is put down, which is a timer, not a stove.
 * - **Water boils away.** A pot left on goes dry, and a dry pot burns. That
 *   one rule is what turns "wait for the bar to fill" into something you
 *   have to watch.
 *
 * ```ts
 * const pot = createCookware({ kind: 'pot' });
 * pot.add(0.8, { cookFor: 40 });
 * game.onUpdate((t) => pot.update(t.delta, stove));  // reads heatAt itself
 * ```
 */

export type CookwareKind =
  /** A deep lidded pot with two loop handles. */
  | 'pot'
  /** A shallow frying pan with one long handle. */
  | 'pan'
  /** A kettle: spout, swing handle, and it whistles. */
  | 'kettle'
  /** A big bellied cauldron on three feet, for hanging over a fire. */
  | 'cauldron'
  /** An oven tray. */
  | 'tray';

export type CookState = 'raw' | 'cooking' | 'done' | 'burnt';

interface KindSpec {
  radius: number;
  height: number;
  /** Seconds for the vessel itself to come up to the heat under it. */
  mass: number;
  /** Fraction of the level boiled off per second at a rolling boil. */
  boilOff: number;
  lid: boolean;
  carry: CarryStyle;
  metal: number;
  rough: number;
}

/**
 * Mass is the interesting column. A frying pan is up in four seconds and a
 * cauldron takes nearly a minute, which is the difference between searing
 * something and putting a stew on.
 */
const KINDS: Record<CookwareKind, KindSpec> = {
  pot: { radius: 0.115, height: 0.15, mass: 12, boilOff: 0.012, lid: true, carry: 'crate', metal: 0xb9bec4, rough: 0.35 },
  pan: { radius: 0.13, height: 0.055, mass: 4, boilOff: 0.05, lid: false, carry: 'tray', metal: 0x3a3d41, rough: 0.5 },
  kettle: { radius: 0.09, height: 0.12, mass: 7, boilOff: 0.02, lid: true, carry: 'side', metal: 0xc2c8ce, rough: 0.3 },
  cauldron: { radius: 0.19, height: 0.24, mass: 52, boilOff: 0.006, lid: false, carry: 'crate', metal: 0x2b2c2e, rough: 0.72 },
  tray: { radius: 0.16, height: 0.035, mass: 3, boilOff: 0.03, lid: false, carry: 'tray', metal: 0x54585c, rough: 0.62 },
};

/** Colours the contents pass through. Raw food is pale; burnt food is not. */
const RAW = new Vector3(0.63, 0.55, 0.4);
const DONE = new Vector3(0.55, 0.33, 0.14);
const BURNT = new Vector3(0.07, 0.06, 0.055);

export interface CookwareOptions {
  kind?: CookwareKind;
  /** Seconds at a good heat to go from raw to done. Default 30. */
  cookFor?: number;
  /** Starting contents, 0–1. Default 0 (empty). */
  level?: number;
  seed?: number;
  palette?: Palette;
}

export interface Cookware extends Carryable {
  kind: CookwareKind;
  /** How hot the VESSEL is, 0–1. Lags the heat under it by its own mass. */
  readonly temperature: number;
  readonly state: CookState;
  /** 0 raw … 1 done, and on past 1 toward burnt. */
  readonly progress: number;
  /** How full it is, 0–1. Falls while it boils. */
  readonly level: number;
  readonly boiling: boolean;
  /** A kettle at the boil, until somebody takes it off. */
  readonly whistling: boolean;
  fill: Fill;
  steam: Steam;
  /** The lid, on the kinds that have one. Closed cooks faster. */
  lid: HeatControl | null;
  /** Put food or water in. `cookFor` overrides how long this batch takes. */
  add(amount?: number, options?: { cookFor?: number }): void;
  /** Tip it out and start again. */
  empty(): void;
  onState?: (state: CookState) => void;
  /** Fires once each time a kettle comes to the boil. */
  onWhistle?: () => void;
  /**
   * Advance it. Pass the stove — it reads `heatAt` at its own world
   * position, so moving the pan is all it takes — or a number if the caller
   * has already sampled the field.
   */
  update(dt: number, heat?: HeatField | number): void;
}

const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

/**
 * An open-topped vessel body: a wall you can see BOTH sides of, plus a base.
 *
 * `DoubleSide` on an open cylinder is the cheap answer to the shape that has
 * now produced defects in three separate tracks. A solid cylinder with a
 * smaller one hollowed out of it is invisible; a capped one is a tin.
 */
function bowlBody(
  rTop: number,
  rBottom: number,
  height: number,
  material: MeshStandardMaterial
): Group {
  const g = new Group();
  const wall = new Mesh(new CylinderGeometry(rTop, rBottom, height, 18, 1, true), material);
  wall.position.y = height / 2;
  g.add(wall);
  const base = new Mesh(new CylinderGeometry(rBottom, rBottom, 0.008, 18), material);
  base.position.y = 0.004;
  g.add(base);
  const rim = new Mesh(new TorusGeometry(rTop, 0.006, 4, 18), material);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = height;
  g.add(rim);
  return g;
}

/** A pot, pan, kettle, cauldron or tray, with contents that cook. */
export function createCookware(options: CookwareOptions = {}): Cookware {
  const kind = options.kind ?? 'pot';
  const spec = KINDS[kind];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = `cookware-${kind}`;
  const metal = new MeshStandardMaterial({
    color: spec.metal,
    roughness: spec.rough,
    metalness: kind === 'cauldron' ? 0.35 : 0.72,
  });
  const dark = new MeshStandardMaterial({ color: 0x1e2022, roughness: 0.6, metalness: 0.4 });

  let lid: HeatControl | null = null;
  const innerR = spec.radius * 0.9;

  if (kind === 'tray') {
    // Four walls round a floor, for the same reason as everything else.
    const w = spec.radius * 2;
    const d = spec.radius * 1.4;
    const t = 0.008;
    const floor = new Mesh(new BoxGeometry(w, t, d), metal);
    floor.position.y = t / 2;
    group.add(floor);
    for (const [bw, bd, x, z] of [
      [w, t, 0, -(d - t) / 2],
      [w, t, 0, (d - t) / 2],
      [t, d - t * 2, -(w - t) / 2, 0],
      [t, d - t * 2, (w - t) / 2, 0],
    ] as Array<[number, number, number, number]>) {
      const wall = new Mesh(new BoxGeometry(bw, spec.height, bd), metal);
      wall.position.set(x, spec.height / 2, z);
      group.add(wall);
    }
  } else if (kind === 'cauldron') {
    // A belly: wide in the middle, narrower at the mouth and the base.
    const belly = new Mesh(
      new SphereGeometry(spec.radius, 16, 10, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.68),
      metal
    );
    belly.material.side = DoubleSide;
    belly.position.y = spec.radius * 0.86;
    group.add(belly);
    const rim = new Mesh(new TorusGeometry(spec.radius * 0.83, 0.009, 4, 18), metal);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = spec.height;
    group.add(rim);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const foot = new Mesh(new CylinderGeometry(0.012, 0.016, 0.06, 5), metal);
      foot.position.set(Math.cos(a) * spec.radius * 0.6, 0.03, Math.sin(a) * spec.radius * 0.6);
      group.add(foot);
    }
    // The bail handle, which is how it hangs on a crane hook.
    const bail = new Mesh(new TorusGeometry(spec.radius * 0.92, 0.008, 4, 16, Math.PI), metal);
    bail.rotation.y = Math.PI / 2;
    bail.position.y = spec.height;
    group.add(bail);
  } else {
    group.add(bowlBody(spec.radius, spec.radius * 0.88, spec.height, metal));
    if (kind === 'pan') {
      const handle = new Mesh(new CylinderGeometry(0.011, 0.013, 0.22, 7), dark);
      handle.rotation.z = Math.PI / 2;
      handle.rotation.y = 0;
      handle.position.set(spec.radius + 0.11, spec.height * 0.75, 0);
      group.add(handle);
    } else if (kind === 'kettle') {
      // A spout, angled up so it would actually pour.
      const spout = new Mesh(new CylinderGeometry(0.012, 0.022, 0.11, 8), metal);
      spout.rotation.z = -Math.PI * 0.34;
      spout.position.set(spec.radius + 0.03, spec.height * 0.78, 0);
      group.add(spout);
      const swing = new Mesh(new TorusGeometry(spec.radius * 0.95, 0.007, 4, 14, Math.PI), metal);
      swing.rotation.y = Math.PI / 2;
      swing.position.y = spec.height;
      group.add(swing);
    } else {
      for (const sx of [-1, 1]) {
        const ear = new Mesh(new TorusGeometry(0.026, 0.006, 4, 10, Math.PI), metal);
        ear.rotation.set(Math.PI / 2, 0, sx > 0 ? 0 : Math.PI);
        ear.position.set(sx * (spec.radius + 0.012), spec.height * 0.8, 0);
        group.add(ear);
      }
    }
  }

  // ---- contents --------------------------------------------------------
  const fill = createFill({
    radius: innerR * 0.94,
    depth: spec.height * 0.85,
    level: options.level ?? 0,
    color: 0xa08c66,
    palette,
  });
  fill.object.position.y = kind === 'cauldron' ? spec.height * 0.24 : 0.01;
  group.add(fill.object);
  // The fill's colour is fixed at construction, and the whole point here is
  // that it is not: reach the surface material so the contents can darken
  // from raw through done to burnt.
  const surfaceMesh = fill.object.children.find((c) => c.name === 'surface') as
    | (Mesh & { material: MeshStandardMaterial })
    | undefined;

  // Sized to the pan. A pot's steam is a wisp off a 20 cm mouth, not the
  // column a bathroom shower makes, and the default was reading as fog
  // hanging in the air a metre and a half above the stove.
  const steam = createSteam({
    radius: spec.radius * 0.5,
    height: 0.3 + spec.radius,
    count: 8,
    seed: seed + 3,
  });
  steam.object.position.y = spec.height + 0.02;
  group.add(steam.object);

  // ---- the lid ---------------------------------------------------------
  if (spec.lid) {
    const pivot = new Group();
    pivot.name = 'lid';
    pivot.position.set(0, spec.height, 0);
    group.add(pivot);
    const disc = new Mesh(new CylinderGeometry(spec.radius * 0.98, spec.radius * 0.98, 0.008, 18), metal);
    pivot.add(disc);
    const knob = new Mesh(new SphereGeometry(0.014, 7, 5), dark);
    knob.position.y = 0.014;
    pivot.add(knob);

    let target = 1; // starts ON
    let state = 1;
    lid = {
      object: pivot,
      get state() {
        return state;
      },
      // `open` reads as "the lid is ON", because that is the state that
      // matters to the cooking: closed is the fast one.
      get open() {
        return target > 0.5;
      },
      toggle() {
        const next = !(target > 0.5);
        lid!.set(next);
        return next;
      },
      set(value: number | boolean) {
        const was = target > 0.5;
        target = typeof value === 'boolean' ? (value ? 1 : 0) : clamp01(value);
        if (was !== target > 0.5) lid!.onChange?.(target > 0.5);
      },
      update(dt: number) {
        state += (target - state) * Math.min(1, dt * 5);
        // Off means tipped up and set aside, not vanished.
        pivot.position.set((1 - state) * spec.radius * 1.5, spec.height + (1 - state) * 0.02, 0);
        pivot.rotation.z = (1 - state) * -1.1;
      },
    };
  }

  // ---- state -----------------------------------------------------------
  let temperature = 0;
  let level = clamp01(options.level ?? 0);
  let progress = 0;
  let cookFor = options.cookFor ?? 30;
  let state: CookState = level > 0 ? 'raw' : 'raw';
  let whistling = false;
  const world = new Vector3();
  const tint = new Vector3();
  void rng;

  const api: Cookware = {
    object: group,
    obstacleRadius: 0,
    kind,
    carry: spec.carry,
    grip: { y: spec.height * 0.5 },
    fill,
    steam,
    lid,
    get temperature() {
      return temperature;
    },
    get state() {
      return state;
    },
    get progress() {
      return progress;
    },
    get level() {
      return level;
    },
    get boiling() {
      return level > 0 && temperature > 0.55;
    },
    get whistling() {
      return whistling;
    },
    add(amount = 1, opts = {}) {
      level = clamp01(level + amount);
      if (opts.cookFor !== undefined) cookFor = opts.cookFor;
      progress = 0;
      state = 'raw';
      fill.setLevel(level);
    },
    empty() {
      level = 0;
      progress = 0;
      state = 'raw';
      whistling = false;
      fill.setLevel(0);
    },
    update(dt: number, heat?: HeatField | number) {
      if (dt <= 0) return;
      lid?.update(dt);

      let under = 0;
      if (typeof heat === 'number') under = clamp01(heat);
      else if (heat) {
        group.updateWorldMatrix(true, false);
        group.getWorldPosition(world);
        under = clamp01(heat.heatAt(world.x, world.z));
      }

      // The vessel's own temperature, lagging by its mass. A lid keeps the
      // heat in, so it comes up faster and holds better.
      const lidOn = lid ? lid.state : 0;
      // `mass` IS the time constant in seconds, so it goes in unscaled. A
      // stray multiplier here quietly divides every number in the table:
      // the first version had a cauldron coming up in four seconds and a
      // frying pan in a third of one, which makes the whole column
      // decorative.
      const rate = (dt / spec.mass) * (1 + lidOn * 0.6);
      temperature += (under - temperature) * Math.min(1, rate);
      temperature = clamp01(temperature);

      const was = state;
      if (level > 0) {
        // Boiling off. A pot left on goes dry, and a dry pot burns — which
        // is the rule that makes any of this worth watching.
        if (api.boiling) {
          const off = spec.boilOff * (temperature - 0.5) * 2 * (1 - lidOn * 0.55) * dt;
          level = Math.max(0, level - off);
          fill.setLevel(level);
        }
        // Cooking only happens in a band. Barely warm does nothing.
        if (temperature > 0.28) {
          progress += (dt / cookFor) * (0.4 + temperature * 1.2) * (1 + lidOn * 0.35);
        }
        if (progress >= 1.9 || (level <= 0 && temperature > 0.5)) state = 'burnt';
        else if (progress >= 1) state = 'done';
        else if (progress > 0.02) state = 'cooking';
        else state = 'raw';
      }

      // Steam while it is boiling, and no steam once it has burnt dry.
      // Steam follows the WATER, not the verdict on the food. Keying it off
      // `burnt` alone silences a pot that has caught but is still half full
      // of stock, which is exactly when it steams hardest.
      const steaming = api.boiling ? 0.55 + temperature * 0.45 : 0;
      steam.setTarget(level <= 0 && state === 'burnt' ? 0.15 : steaming);
      steam.update(dt);
      if (api.boiling) fill.disturb(dt * 1.6);
      fill.update(dt);

      // The contents darken as they go. Raw is pale, done is brown, burnt
      // is nearly black — and the fill's colour is the only thing anybody
      // actually reads from across a kitchen.
      if (surfaceMesh) {
        // Driven by the STATE, not by progress alone. A pot that catches
        // because it boiled dry never got past `done` on the timer, so a
        // purely progress-based ramp leaves it looking half-cooked while it
        // is reporting itself burnt — the label and the colour disagreeing
        // about the same pan.
        const char = clamp01((progress - 1) / 0.9);
        if (state === 'burnt') tint.copy(DONE).lerp(BURNT, Math.max(0.8, char));
        else if (progress <= 1) tint.copy(RAW).lerp(DONE, clamp01(progress));
        else tint.copy(DONE).lerp(BURNT, char);
        surfaceMesh.material.color.setRGB(tint.x, tint.y, tint.z);
      }

      // A kettle whistles when it boils, once, until it is taken off.
      if (kind === 'kettle') {
        const should = api.boiling && temperature > 0.7;
        if (should && !whistling) {
          whistling = true;
          api.onWhistle?.();
        } else if (!should) {
          whistling = false;
        }
      }

      if (state !== was) api.onState?.(state);
    },
  };
  void palette;
  return api;
}

export const COOKWARE_KINDS: CookwareKind[] = ['pot', 'pan', 'kettle', 'cauldron', 'tray'];
