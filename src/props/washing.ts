import {
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
import { createVessel } from './vessels';
import { createFill, createStream, type Fill, type Stream } from './waterworks';
import { addApproach, createSlot, type Carryable, type Prop, type PropSlot } from '../core/types';

/**
 * Washing — basins, taps and the vessels you carry water in.
 *
 * The era axis here is a **gameplay** axis, not a styling one, and that is
 * the whole reason this track is worth its own file:
 *
 * - `medieval` — no plumbing at all. Water arrives *in a vessel*, is poured
 *   in by hand, and is thrown out. `pour()` is the entire interface, and the
 *   loop is a fetch-and-carry chore.
 * - `victorian` — a pair of taps over a pedestal, and a plug. Two controls,
 *   because hot and cold arrived separately and mixing was your problem.
 * - `modern` — one mixer lever and a drain. Water on demand.
 *
 * The same three meshes with different textures would be a re-skin. These
 * differ in *what the player does*, which is why `taps` is empty on one of
 * them and `pour` does nothing on another.
 */

export type BasinEra = 'medieval' | 'victorian' | 'modern';

export const BASIN_ERAS: BasinEra[] = ['medieval', 'victorian', 'modern'];

/**
 * A tap. Structurally a `Manipulable`, the same as doors and valves, so
 * anything that can operate one of those can operate this.
 */
export interface Tap extends Prop {
  /** Live eased position: 0 shut … 1 wide open. */
  readonly state: number;
  readonly open: boolean;
  toggle(): boolean;
  set(target: number | boolean): void;
  update(dt: number): void;
  onChange?: (open: boolean) => void;
}

export type TapStyle =
  /** A crossed capstan handle that turns. Victorian, and always in pairs. */
  | 'crosshead'
  /** A single lever that lifts. Modern. */
  | 'mixer'
  /** A small round knurled knob. */
  | 'pillar'
  /** A long pump handle that swings down — the thing before plumbing. */
  | 'pump';

export interface TapOptions {
  style?: TapStyle;
  /** Metal colour. Defaults per style. */
  color?: number;
  /** How fast the handle travels toward its target (1/sec). Default 3.5. */
  speed?: number;
  seed?: number;
  palette?: Palette;
}

/** A tap, valve or pump handle you can turn. */
export function createTap(options: TapOptions = {}): Tap {
  const style = options.style ?? 'pillar';
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const speed = options.speed ?? 3.5;

  const group = new Group();
  group.name = `tap-${style}`;
  const brass = style === 'crosshead' || style === 'pump';
  const metal = new MeshStandardMaterial({
    color: options.color ?? (brass ? 0xb89a52 : 0xc0c6cc),
    roughness: brass ? 0.38 : 0.22,
    metalness: 0.85,
  });

  // The moving part is always a child of `handle`, so one transform drives
  // every style and the shape below only has to describe what it looks like.
  const handle = new Object3D();
  handle.name = 'handle';
  let motion: 'turn' | 'lift' | 'swing' = 'turn';

  if (style === 'crosshead') {
    const stem = new Mesh(new CylinderGeometry(0.008, 0.01, 0.05, 8), metal);
    stem.position.y = 0.025;
    group.add(stem);
    handle.position.y = 0.055;
    for (let i = 0; i < 2; i++) {
      const bar = new Mesh(new BoxGeometry(0.056, 0.008, 0.012), metal);
      bar.rotation.y = (i * Math.PI) / 2;
      handle.add(bar);
    }
    const boss = new Mesh(new CylinderGeometry(0.011, 0.011, 0.012, 8), metal);
    handle.add(boss);
    group.add(handle);
  } else if (style === 'mixer') {
    const body = new Mesh(new CylinderGeometry(0.017, 0.021, 0.09, 10), metal);
    body.position.y = 0.045;
    group.add(body);
    handle.position.y = 0.09;
    const lever = new Mesh(new BoxGeometry(0.014, 0.012, 0.075), metal);
    lever.position.z = 0.032;
    handle.add(lever);
    group.add(handle);
    motion = 'lift';
  } else if (style === 'pillar') {
    const body = new Mesh(new CylinderGeometry(0.014, 0.017, 0.055, 10), metal);
    body.position.y = 0.028;
    group.add(body);
    handle.position.y = 0.062;
    const knob = new Mesh(new CylinderGeometry(0.019, 0.016, 0.018, 10), metal);
    handle.add(knob);
    // Knurling: a few ribs, so a turned knob visibly turns. A smooth
    // cylinder rotating about its own axis is indistinguishable from a
    // stationary one, which makes the whole control invisible.
    for (let i = 0; i < 6; i++) {
      const rib = new Mesh(new BoxGeometry(0.004, 0.02, 0.04), metal);
      rib.rotation.y = (i / 6) * Math.PI;
      handle.add(rib);
    }
    group.add(handle);
  } else {
    const post = new Mesh(new CylinderGeometry(0.03, 0.036, 0.5, 10), metal);
    post.position.y = 0.25;
    group.add(post);
    handle.position.y = 0.46;
    const arm = new Mesh(
      new BoxGeometry(0.03, 0.026, 0.34),
      createSurface('wood', { color: 0x6b4a33, seed })
    );
    arm.position.z = 0.15;
    handle.add(arm);
    group.add(handle);
    motion = 'swing';
  }

  let target = 0;
  let state = 0;
  let wasOpen = false;
  const applyHandle = (): void => {
    if (motion === 'turn') handle.rotation.y = state * 2.3 + rng.range(0, 0.001);
    else if (motion === 'lift') handle.rotation.x = -state * 0.6;
    else handle.rotation.x = state * 0.75;
  };
  applyHandle();

  const api: Tap = {
    object: group,
    obstacleRadius: 0,
    get state() {
      return state;
    },
    get open() {
      return target > 0.5;
    },
    toggle() {
      target = target > 0.5 ? 0 : 1;
      return target > 0.5;
    },
    set(next: number | boolean) {
      target = typeof next === 'boolean' ? (next ? 1 : 0) : Math.min(1, Math.max(0, next));
    },
    update(dt: number) {
      if (dt <= 0) return;
      const step = speed * dt;
      state = target > state ? Math.min(target, state + step) : Math.max(target, state - step);
      applyHandle();
      const nowOpen = target > 0.5;
      if (nowOpen !== wasOpen) {
        wasOpen = nowOpen;
        api.onChange?.(nowOpen);
      }
    },
  };
  return api;
}

export interface BasinOptions {
  era?: BasinEra;
  /** How fast a fully open tap fills it, in levels per second. Default 0.25. */
  rate?: number;
  /** How fast an open drain empties it. Default 0.4. */
  drainRate?: number;
  seed?: number;
  palette?: Palette;
}

export interface Basin extends Prop {
  era: BasinEra;
  /** The water in the bowl. */
  fill: Fill;
  /** Water coming out, on the eras that have plumbing. */
  stream: Stream | null;
  /** Taps to operate. **Empty on `medieval`** — that is the point of it. */
  taps: Tap[];
  /** Where a character stands to use it. */
  slot: PropSlot;
  /** Height of the rim above the floor — where the hands go. */
  rim: number;
  /** Tip water in by hand. The medieval loop; works on any era. */
  pour(amount: number): void;
  /** Open or close the plug. Medieval basins have none, and ignore this. */
  setDrain(open: boolean): void;
  readonly draining: boolean;
  /** Runs the taps, the stream and the level. Nothing happens without it. */
  update(dt: number): void;
}

/**
 * A wash basin, of its era.
 *
 * The whole tap → stream → level loop is wired **inside** the prop, so the
 * caller only ever operates the taps — `basin.taps[0].toggle()` — and calls
 * `update`. It still composes outward: the taps are `Manipulable`s, so
 * GAMA's `Automation` or an interaction system drives them without knowing
 * what a basin is.
 */
export function createBasin(options: BasinOptions = {}): Basin {
  const era = options.era ?? 'modern';
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const rate = options.rate ?? 0.25;
  const drainRate = options.drainRate ?? 0.4;

  const group = new Group();
  group.name = `basin-${era}`;
  const taps: Tap[] = [];
  let stream: Stream | null = null;
  let bowlRadius = 0.17;
  let rim = 0.85;
  let hasDrain = true;

  if (era === 'medieval') {
    // A pottery laver in a wooden stand. No plumbing, no plug: the water
    // comes in from a ewer and goes out of the door.
    rim = 0.78;
    hasDrain = false;
    const wood = createSurface('wood', { color: palette.woodDark, seed });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const leg = new Mesh(new BoxGeometry(0.05, rim, 0.05), wood);
      leg.position.set(Math.cos(a) * 0.19, rim / 2, Math.sin(a) * 0.19);
      leg.rotation.set(Math.sin(a) * 0.07, -a, -Math.cos(a) * 0.07);
      group.add(leg);
    }
    const ring = new Mesh(new TorusGeometry(0.2, 0.022, 5, 14), wood);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = rim;
    group.add(ring);
    const bowl = createVessel({
      style: 'bowl',
      height: 0.16,
      seed: seed + 5,
      surface: 'terracotta',
      palette,
    });
    bowl.object.position.y = rim - 0.05;
    group.add(bowl.object);
    bowlRadius = bowl.radius;
  } else if (era === 'victorian') {
    // Pedestal, oval bowl, splashback, and TWO taps — hot and cold arrived
    // separately and mixing them was the user's problem.
    rim = 0.84;
    const ceramic = createSurface('glaze', { color: 0xeeeae2, seed });
    const pedestal = new Mesh(new CylinderGeometry(0.11, 0.16, rim - 0.14, 12), ceramic);
    pedestal.position.y = (rim - 0.14) / 2;
    group.add(pedestal);
    const bowl = new Mesh(new CylinderGeometry(0.24, 0.17, 0.16, 16), ceramic);
    bowl.position.y = rim - 0.08;
    group.add(bowl);
    const lip = new Mesh(new TorusGeometry(0.24, 0.02, 5, 18), ceramic);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = rim;
    group.add(lip);
    const splash = new Mesh(new BoxGeometry(0.44, 0.12, 0.03), ceramic);
    splash.position.set(0, rim + 0.06, -0.2);
    group.add(splash);
    bowlRadius = 0.2;

    for (const side of [-1, 1]) {
      const tap = createTap({ style: 'crosshead', seed: seed + (side > 0 ? 1 : 2), palette });
      tap.object.position.set(side * 0.13, rim + 0.01, -0.17);
      group.add(tap.object);
      taps.push(tap);
    }
    const spoutBody = new Mesh(new CylinderGeometry(0.011, 0.011, 0.1, 8), new MeshStandardMaterial({
      color: 0xb89a52,
      roughness: 0.38,
      metalness: 0.85,
    }));
    spoutBody.rotation.x = Math.PI / 2.6;
    spoutBody.position.set(0, rim + 0.07, -0.15);
    group.add(spoutBody);
  } else {
    // A vanity counter with a vessel basin standing on it, and one mixer.
    rim = 0.92;
    const counterH = 0.8;
    const counter = new Mesh(
      new BoxGeometry(0.72, 0.05, 0.46),
      createSurface('teak', { color: 0x8a6a47, seed })
    );
    counter.position.y = counterH;
    group.add(counter);
    for (const side of [-1, 1]) {
      const panel = new Mesh(
        new BoxGeometry(0.04, counterH, 0.4),
        createSurface('paintedMetal', { color: 0x4a5158, seed })
      );
      panel.position.set(side * 0.32, counterH / 2, 0);
      group.add(panel);
    }
    const bowl = new Mesh(
      new CylinderGeometry(0.19, 0.15, 0.12, 18),
      createSurface('glaze', { color: 0xf4f2ee, seed })
    );
    bowl.position.y = counterH + 0.085;
    group.add(bowl);
    bowlRadius = 0.16;

    const mixer = createTap({ style: 'mixer', seed: seed + 1, palette });
    mixer.object.position.set(0, counterH + 0.025, -0.16);
    group.add(mixer.object);
    taps.push(mixer);
    const neck = new Mesh(
      new CylinderGeometry(0.012, 0.012, 0.16, 8),
      new MeshStandardMaterial({ color: 0xc0c6cc, roughness: 0.22, metalness: 0.85 })
    );
    neck.rotation.x = Math.PI / 2.3;
    neck.position.set(0, counterH + 0.14, -0.12);
    group.add(neck);
  }

  // Where the water goes in. The fill radius has to match the bowl's
  // INTERIOR — cut to the widest point it pokes out through the sides as a
  // ring around the outside.
  const fill = createFill({
    radius: bowlRadius * 0.86,
    depth: 0.1,
    palette,
  });
  fill.object.position.y = rim - 0.11;
  group.add(fill.object);

  // The stream, on the eras that have one. A medieval laver has no spout at
  // all, so there is nothing to draw and nothing to turn on.
  if (era !== 'medieval') {
    stream = createStream({
      height: rim - (rim - 0.11) - 0.02,
      radius: 0.009,
      flow: 0,
      seed,
      palette,
    });
    stream.object.position.set(0, rim + (era === 'victorian' ? 0.02 : 0.06), -0.09);
    group.add(stream.object);
  }

  const slot = createSlot('wash', 'operate', group, 0, 0, 0.46, Math.PI);
  addApproach(slot, group, 0.4, 'front');

  let draining = false;

  return {
    object: group,
    obstacleRadius: 0.4,
    era,
    fill,
    stream,
    taps,
    slot,
    slots: [slot],
    rim,
    pour(amount: number) {
      fill.fillBy(amount);
    },
    setDrain(open: boolean) {
      // A basin with no plug cannot be drained, and quietly pretending it can
      // would let a medieval scene empty itself.
      draining = hasDrain && open;
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
      if (stream) {
        stream.setFlow(flow);
        stream.update(dt);
      }
      const change = flow * rate * dt - (draining ? drainRate * dt : 0);
      if (change !== 0) fill.fillBy(change);
      fill.update(dt);
    },
  };
}

export interface EwerOptions {
  seed?: number;
  palette?: Palette;
}

/**
 * A ewer — the jug water arrives in before plumbing does.
 *
 * A `Carryable`, so ANIMA's `Carry` picks it up with no adapter: this is the
 * medieval half of the era axis, and it is a carry loop rather than a switch.
 */
export function createEwer(options: EwerOptions = {}): Carryable {
  const seed = options.seed ?? 1;
  const jug = createVessel({
    style: 'jug',
    height: 0.3,
    seed,
    surface: 'terracotta',
    palette: options.palette,
  });
  jug.object.name = 'ewer';
  return {
    object: jug.object,
    obstacleRadius: 0,
    carry: 'side',
    grip: { y: jug.height * 0.6 },
  };
}
