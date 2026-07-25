import {
  BackSide,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createGlass } from '../materials/glass';
import { createDroplets, type Droplets } from '../materials/waterFlow';
import { createCurtains, type Curtains } from './soft';
import { createFill, createSpray, createSteam, type Fill, type Spray, type Steam } from './waterworks';
import { createTap, type Tap } from './washing';
import {
  addApproach,
  createSlot,
  type Gathering,
  type Prop,
  type PropSlot,
} from '../core/types';

/**
 * Bathing — showers, tubs and hot tubs.
 *
 * Everything expensive here was built already: the spray and the steam came
 * with the water layer, the enclosure screen is a `createCurtains` panel or
 * a sheet of `createGlass`, and a hot tub is a `Gathering` — seats around a
 * rim with a shared focus, which is what one actually is socially.
 *
 * What is new is **the wait**. A shower does not produce hot water the
 * instant you open it, and that pause is most of what makes one feel
 * plumbed rather than switched. The state machine below is deliberately the
 * same shape as GAMA's `Device` (off → warming → running), so a device
 * graph drives a shower with nothing importing anything.
 */

export type ShowerState = 'off' | 'warming' | 'running' | 'cooling';

export type ShowerStyle =
  /** A glass cubicle with a tray. */
  | 'enclosure'
  /** A head and a rail over the end of a bath, with a curtain. */
  | 'overBath'
  /** A wet room: a head, a drain, and nothing else. */
  | 'open';

export interface ShowerOptions {
  style?: ShowerStyle;
  /** Tray/footprint width in metres. Default 0.9. */
  width?: number;
  /** Head height above the floor. Default 2.05. */
  head?: number;
  /**
   * Seconds of cold before it runs warm. Default 3.5. Zero makes it a
   * switch, which is exactly what a shower is not.
   */
  warmUp?: number;
  seed?: number;
  palette?: Palette;
}

export interface Shower extends Prop {
  readonly state: ShowerState;
  /** Turn it on or off. The warm-up happens on its own. */
  setRunning(on: boolean): void;
  readonly running: boolean;
  spray: Spray;
  steam: Steam;
  /** The curtain, on the styles that have one. */
  curtain: Curtains | null;
  /** Where a character stands under it. */
  slot: PropSlot;
  /** Fires as the state changes — wire it to a sound or a light. */
  onState?: (state: ShowerState) => void;
  update(dt: number): void;
}

/**
 * A shower.
 *
 * The origin is on the floor at the centre of the tray, facing +z out of the
 * enclosure.
 */
export function createShower(options: ShowerOptions = {}): Shower {
  const style = options.style ?? 'enclosure';
  const width = options.width ?? 0.9;
  const headY = options.head ?? 2.05;
  const warmUp = options.warmUp ?? 3.5;
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = `shower-${style}`;
  const chrome = new MeshStandardMaterial({ color: 0xc4cace, roughness: 0.2, metalness: 0.85 });
  const depth = style === 'overBath' ? 0.72 : width;

  if (style !== 'open') {
    const tray = new Mesh(
      new BoxGeometry(width, 0.07, depth),
      createSurface('glaze', { color: 0xf1efe9, seed })
    );
    tray.position.y = 0.035;
    group.add(tray);
  }
  // A drain, on every style — a shower without one is a puddle.
  const drain = new Mesh(new CylinderGeometry(0.05, 0.05, 0.008, 12), chrome);
  drain.position.y = style === 'open' ? 0.004 : 0.072;
  group.add(drain);

  // Riser and head.
  const riser = new Mesh(new CylinderGeometry(0.014, 0.014, headY - 0.9, 8), chrome);
  riser.position.set(0, 0.9 + (headY - 0.9) / 2, -depth / 2 + 0.06);
  group.add(riser);
  const arm = new Mesh(new CylinderGeometry(0.012, 0.012, 0.2, 8), chrome);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, headY, -depth / 2 + 0.15);
  group.add(arm);
  const rose = new Mesh(new CylinderGeometry(0.075, 0.06, 0.03, 14), chrome);
  rose.position.set(0, headY - 0.02, -depth / 2 + 0.25);
  group.add(rose);

  const control = createTap({ style: 'mixer', seed: seed + 1, palette });
  control.object.position.set(width * 0.3, 1.1, -depth / 2 + 0.04);
  group.add(control.object);

  let curtain: Curtains | null = null;
  if (style === 'enclosure') {
    // Two fixed glass panels. Frosted, because a clear one shows the inside
    // of a box.
    const glass = createGlass({ frosted: true, tint: 0xa8c8d4 });
    for (const [w, x, z, rot] of [
      [depth, -width / 2, 0, Math.PI / 2],
      [width, 0, -depth / 2, 0],
    ] as Array<[number, number, number, number]>) {
      const panel = new Mesh(new BoxGeometry(w, 1.85, 0.012), glass);
      panel.position.set(x, 1.0, z);
      panel.rotation.y = rot;
      group.add(panel);
    }
  } else if (style === 'overBath') {
    const rail = new Mesh(new CylinderGeometry(0.012, 0.012, width + 0.1, 8), chrome);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 1.95, depth / 2 - 0.04);
    group.add(rail);
    curtain = createCurtains({
      width: width + 0.06,
      drop: 1.5,
      style: 'closed',
      stir: 0.25,
      seed: seed + 2,
      palette,
    });
    curtain.object.position.set(0, 1.94, depth / 2 - 0.04);
    group.add(curtain.object);
  }

  const spray = createSpray({
    height: headY - 0.1,
    radius: 0.07,
    spread: Math.min(0.34, width * 0.36),
    flow: 0,
    seed,
    palette,
  });
  spray.object.position.set(0, headY - 0.04, -depth / 2 + 0.25);
  group.add(spray.object);

  const steam = createSteam({
    radius: width * 0.45,
    height: headY * 0.85,
    count: 16,
    seed: seed + 4,
  });
  steam.object.position.y = 0.1;
  group.add(steam.object);

  const slot = createSlot('shower', 'operate', group, 0, style === 'open' ? 0 : 0.07, 0.05, 0);
  addApproach(slot, group, 0.7, 'front');

  let state: ShowerState = 'off';
  let wantOn = false;
  let warmed = 0;
  const api: Shower = {
    object: group,
    obstacleRadius: Math.max(width, depth) * 0.55,
    spray,
    steam,
    curtain,
    slot,
    slots: [slot],
    get state() {
      return state;
    },
    get running() {
      return wantOn;
    },
    setRunning(on: boolean) {
      wantOn = on;
      control.set(on);
    },
    update(dt: number) {
      if (dt <= 0) return;
      control.update(dt);
      const was = state;

      if (wantOn) {
        // Water arrives at once; HEAT does not. Both the steam and the state
        // wait for the warm-up, which is the whole difference between a
        // shower and a switch.
        warmed = Math.min(warmUp, warmed + dt);
        state = warmed >= warmUp ? 'running' : 'warming';
      } else {
        warmed = Math.max(0, warmed - dt * 1.6);
        state = warmed > 0 ? 'cooling' : 'off';
      }

      spray.setFlow(control.state);
      spray.update(dt);
      // Steam only once it is actually hot, and it clears on its own long
      // after the water stops.
      steam.setTarget(state === 'running' ? 1 : 0);
      steam.update(dt);
      curtain?.update(dt);

      if (state !== was) api.onState?.(state);
    },
  };
  // Idle so a shower left alone still stirs its curtain.
  return api;
}

export type TubStyle =
  /** A roll-top on four feet. */
  | 'clawfoot'
  /** A modern panelled bath built into the wall. */
  | 'modern'
  /** A tub set into the floor. */
  | 'sunken'
  /** A short high-sided hip bath — the one you fill by hand. */
  | 'hip';

export interface TubOptions {
  style?: TubStyle;
  /** Length in metres. Defaults per style. */
  length?: number;
  /** How fast an open tap fills it. Default 0.12 — a bath takes a while. */
  rate?: number;
  seed?: number;
  palette?: Palette;
}

export interface Tub extends Prop {
  style: TubStyle;
  fill: Fill;
  /** Empty on `hip` — you fill that one from a jug. */
  taps: Tap[];
  /** Lie in it. The reclined sleep pose. */
  slot: PropSlot;
  /** Rim height above the floor. */
  rim: number;
  pour(amount: number): void;
  setDrain(open: boolean): void;
  readonly draining: boolean;
  update(dt: number): void;
}

/** A bath. */
export function createTub(options: TubOptions = {}): Tub {
  const style = options.style ?? 'modern';
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const length = options.length ?? (style === 'hip' ? 0.9 : 1.65);
  const width = style === 'hip' ? 0.66 : 0.74;
  const rate = options.rate ?? 0.12;

  const group = new Group();
  group.name = `tub-${style}`;
  const ceramic = createSurface('glaze', { color: 0xf2f0ea, seed });
  const taps: Tap[] = [];
  let rim = 0.58;
  let floorY = 0.12;

  if (style === 'sunken') {
    rim = 0.06;
    floorY = -0.44;
    // The lip is a FRAME, not a slab. A slab across the whole footprint is a
    // lid: it caps the very well it is meant to surround, and the tub renders
    // as a sheet of marble with two taps standing on it.
    const marble = createSurface('marble', { seed });
    const b = 0.14;
    for (const [w, d, x, z] of [
      [length + b * 2, b, 0, -(width + b) / 2],
      [length + b * 2, b, 0, (width + b) / 2],
      [b, width, -(length + b) / 2, 0],
      [b, width, (length + b) / 2, 0],
    ] as Array<[number, number, number, number]>) {
      const lip = new Mesh(new BoxGeometry(w, 0.06, d), marble);
      lip.position.set(x, 0.03, z);
      group.add(lip);
    }
    // The well. Four walls, so it reads as a hole rather than a slab.
    for (const [w, d, x, z] of [
      [length, 0.05, 0, -width / 2],
      [length, 0.05, 0, width / 2],
      [0.05, width, -length / 2, 0],
      [0.05, width, length / 2, 0],
    ] as Array<[number, number, number, number]>) {
      const wall = new Mesh(new BoxGeometry(w, 0.5, d), ceramic);
      wall.position.set(x, -0.25, z);
      group.add(wall);
    }
    const base = new Mesh(new BoxGeometry(length, 0.04, width), ceramic);
    base.position.y = -0.48;
    group.add(base);
  } else {
    // Built as four WALLS around an inner floor, not as a solid box with a
    // smaller box inside it. The second one is invisible — it is hidden by
    // the shell it sits in — and the tub renders as a plain white block with
    // taps on top, which is exactly what the first version did.
    const isHip = style === 'hip';
    const stand = style === 'clawfoot' ? 0.15 : 0;
    floorY = stand + 0.06;
    rim = stand + (isHip ? 0.58 : 0.5);
    const t = 0.05;

    const base = new Mesh(new BoxGeometry(length, 0.06, width), ceramic);
    base.position.y = floorY - 0.03;
    group.add(base);
    for (const [w, d, x, z] of [
      [length, t, 0, -(width / 2 - t / 2)],
      [length, t, 0, width / 2 - t / 2],
      [t, width - t * 2, -(length / 2 - t / 2), 0],
      [t, width - t * 2, length / 2 - t / 2, 0],
    ] as Array<[number, number, number, number]>) {
      const wall = new Mesh(new BoxGeometry(w, rim - stand, d), ceramic);
      wall.position.set(x, stand + (rim - stand) / 2, z);
      group.add(wall);
    }
    // Rolled rims down the long sides, which is most of a bath's silhouette.
    for (const sz of [-1, 1]) {
      const roll = new Mesh(new CylinderGeometry(0.032, 0.032, length, 6), ceramic);
      roll.rotation.z = Math.PI / 2;
      roll.position.set(0, rim, sz * (width / 2 - t / 2));
      group.add(roll);
    }

    if (style === 'clawfoot') {
      const feet = new MeshStandardMaterial({ color: 0xb89a52, roughness: 0.4, metalness: 0.7 });
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const foot = new Mesh(new CylinderGeometry(0.032, 0.055, stand, 7), feet);
          foot.position.set(sx * (length / 2 - 0.14), stand / 2, sz * (width / 2 - 0.1));
          group.add(foot);
        }
      }
    } else if (style === 'modern') {
      const panel = new Mesh(
        new BoxGeometry(length + 0.02, rim, 0.03),
        createSurface('paintedMetal', { color: 0xe4e2dc, seed })
      );
      panel.position.set(0, rim / 2, width / 2 + 0.02);
      group.add(panel);
    }
  }

  // Taps at one end — except the hip bath, which is the whole point of it.
  if (style !== 'hip') {
    const chrome = new MeshStandardMaterial({ color: 0xc4cace, roughness: 0.2, metalness: 0.85 });
    for (const side of [-1, 1]) {
      const tap = createTap({
        style: style === 'clawfoot' ? 'crosshead' : 'pillar',
        seed: seed + (side > 0 ? 1 : 2),
        palette,
      });
      // On a sunken tub the taps stand on the deck BESIDE the well; the same
      // inset that works on a rim would hang them over open water.
      const tapX = style === 'sunken' ? -(length / 2 + 0.07) : -length / 2 + 0.1;
      tap.object.position.set(tapX, rim + 0.01, side * 0.14);
      group.add(tap.object);
      taps.push(tap);
    }
    const spout = new Mesh(new CylinderGeometry(0.014, 0.014, 0.12, 8), chrome);
    spout.rotation.z = Math.PI / 2.4;
    spout.position.set(style === 'sunken' ? -(length / 2 + 0.01) : -length / 2 + 0.16, rim + 0.06, 0);
    group.add(spout);
  }

  const fill = createFill({
    width: length - 0.12,
    length: width - 0.12,
    depth: rim - floorY - 0.04,
    palette,
  });
  fill.object.position.y = floorY;
  group.add(fill.object);

  // Lie in it: the reclined sleep pose, head at the tap end's opposite.
  const slot = createSlot('soak', 'sleep', group, length * 0.06, floorY + 0.05, 0, Math.PI / 2, -0.28);
  addApproach(slot, group, width / 2 + 0.42, 'front');

  let draining = false;
  return {
    object: group,
    obstacleRadius: Math.max(length, width) * 0.55,
    style,
    fill,
    taps,
    slot,
    slots: [slot],
    rim,
    pour(amount: number) {
      fill.fillBy(amount);
    },
    setDrain(open: boolean) {
      draining = open;
    },
    get draining() {
      return draining;
    },
    update(dt: number) {
      if (dt <= 0) return;
      let flow = 0;
      for (const tap of taps) {
        tap.update(dt);
        flow = Math.max(flow, tap.state);
      }
      const change = flow * rate * dt - (draining ? rate * 2.4 * dt : 0);
      if (change !== 0) fill.fillBy(change);
      fill.update(dt);
    },
  };
}

export interface JacuzziOptions {
  /** How many people it seats. Default 4. */
  seats?: number;
  /** Radius in metres. Default 1.1. */
  radius?: number;
  seed?: number;
  palette?: Palette;
}

export interface Jacuzzi extends Gathering {
  fill: Fill;
  steam: Steam;
  /** How hard the jets are running, 0–1. */
  readonly jets: number;
  setJets(power: number): void;
  update(dt: number): void;
}

/**
 * A hot tub.
 *
 * A `Gathering` — seats around a rim with a shared focus — because that is
 * what one is socially, and it means GAMA's `Occupancy` fills it and ANIMA's
 * `Conversation` runs in it with nothing new written.
 *
 * The jets are the whole prop: they **agitate the surface** continuously
 * while they run, so the water is visibly churning rather than being a still
 * blue disc with bubbles drawn over it.
 */
export function createJacuzzi(options: JacuzziOptions = {}): Jacuzzi {
  const seatCount = options.seats ?? 4;
  const radius = options.radius ?? 1.1;
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = 'jacuzzi';
  const shell = createSurface('paintedMetal', { color: 0x3c4249, roughness: 0.5, seed });
  const rimH = 0.72;

  // OPEN-ENDED, and this matters more than it looks: a default
  // CylinderGeometry is capped, so a closed drum has a LID at rim height. It
  // seals the tub, and every jet, every seat and the entire body of water
  // render underneath a disc of shell material. Nothing numeric notices.
  const body = new Mesh(new CylinderGeometry(radius, radius * 0.92, rimH, 20, 1, true), shell);
  body.position.y = rimH / 2;
  group.add(body);
  const under = new Mesh(new CylinderGeometry(radius * 0.92, radius * 0.92, 0.04, 20), shell);
  under.position.y = 0.02;
  group.add(under);
  const cap = new Mesh(
    new TorusGeometry(radius, 0.055, 6, 22),
    createSurface('teak', { color: 0x8a6a47, seed: seed + 1 })
  );
  cap.rotation.x = Math.PI / 2;
  cap.position.y = rimH;
  group.add(cap);
  // The liner is seen from INSIDE, so it has to be back-faced. An open
  // cylinder's normals point outward; left alone this one sits inside the
  // body with every face turned away from the only camera that can ever see
  // it, which makes it a mesh that costs a draw call and renders nothing.
  const linerMat = createSurface('glaze', { color: 0xdfe6e8, seed });
  linerMat.side = BackSide;
  const inner = new Mesh(
    new CylinderGeometry(radius - 0.02, radius - 0.1, rimH - 0.06, 20, 1, true),
    linerMat
  );
  inner.position.y = (rimH - 0.06) / 2;
  group.add(inner);

  const fill = createFill({
    radius: radius - 0.13,
    depth: 0.42,
    level: 0.85,
    palette,
  });
  fill.object.position.y = rimH - 0.52;
  group.add(fill.object);

  // Jets: droplets rising THROUGH the surface, so they read as coming from
  // under it rather than raining onto it.
  const jetPuffs: Droplets[] = [];
  for (let i = 0; i < seatCount; i++) {
    const a = (i / seatCount) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const puff = createDroplets({
      count: 10,
      spread: 0.16,
      rise: 0.12,
      size: 0.4,
      maxPixels: 30,
      color: 0xe8f4f8,
      seed: seed + i * 3,
    });
    puff.mesh.position.set(Math.cos(a) * radius * 0.6, rimH - 0.16, Math.sin(a) * radius * 0.6);
    group.add(puff.mesh);
    jetPuffs.push(puff);
  }

  const steam = createSteam({ radius: radius * 0.7, height: 1.0, count: 12, seed: seed + 9 });
  steam.object.position.y = rimH - 0.1;
  group.add(steam.object);

  // Seats around the rim, all facing the middle.
  const seats: PropSlot[] = [];
  for (let i = 0; i < seatCount; i++) {
    const a = (i / seatCount) * Math.PI * 2;
    const x = Math.cos(a) * (radius - 0.3);
    const z = Math.sin(a) * (radius - 0.3);
    const bench = new Mesh(new BoxGeometry(0.34, 0.06, 0.28), shell);
    bench.position.set(x, rimH - 0.42, z);
    bench.rotation.y = -a;
    group.add(bench);
    // Facing INWARD. A slot anchor faces its own +z, so a seat placed on the
    // rim without turning it puts the bather's back to everyone else — which
    // is the single most repeated mistake in this whole session.
    const slot = createSlot('soak', 'sitLow', group, x, rimH - 0.38, z, Math.atan2(-x, -z));
    addApproach(slot, group, 0.6, 'behind');
    seats.push(slot);
  }
  const focus = new Object3D();
  focus.name = 'focus';
  focus.position.set(0, rimH - 0.02, 0);
  group.add(focus);

  let jets = 0;
  return {
    object: group,
    obstacleRadius: radius + 0.1,
    seats,
    slots: seats,
    focus,
    fill,
    steam,
    get jets() {
      return jets;
    },
    setJets(power: number) {
      jets = Math.min(1, Math.max(0, power));
      for (const puff of jetPuffs) puff.setRate(jets);
    },
    update(dt: number) {
      if (dt <= 0) return;
      for (const puff of jetPuffs) puff.update(dt);
      // Churning, continuously, for as long as they run. The surface settling
      // while the jets are on would be the giveaway.
      if (jets > 0) fill.disturb(jets * dt * 3.2);
      fill.update(dt);
      steam.setTarget(0.35 + jets * 0.55);
      steam.update(dt);
    },
  };
}
