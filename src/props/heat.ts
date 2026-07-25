import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createGlass } from '../materials/glass';
import { makeFlame } from './fire';
import { addApproach, createSlot, type Prop, type PropSlot } from '../core/types';

/**
 * Heat: the hearth-to-induction axis.
 *
 * The era is not a texture here, it is **what you have to do to cook**, and
 * it is the same discovery the basins turned on. A medieval fire has no
 * dial: you control it by feeding it and by moving the pot nearer or further
 * away, so heat has to be a **field in space** rather than a number on a
 * device. A gas ring has a knob and heat exists only in a 9 cm circle. Those
 * are different games, not different materials.
 *
 * So the handshake is a spatial query, and it is deliberately the same shape
 * as the pool's:
 *
 * ```ts
 * heatAt(x, z): number   // 0 (cold) .. 1 (full), 0 anywhere out of reach
 * ```
 *
 * mirroring `WaterBody.depthAt`. SCENA answers where the heat is; GAMA and
 * whatever is in the pot decide what that means.
 *
 * The state machine — cold → heating → hot → cooling — is the same shape as
 * the shower's and as GAMA's `Device`, for the third time, because it keeps
 * being the right shape.
 *
 * ```ts
 * const stove = createHeatSource({ era: 'gas' });
 * stove.setPower(1);
 * game.onUpdate((t) => stove.update(t.delta));
 * stove.heatAt(pot.x, pot.z);
 * ```
 */

export type HeatEra =
  /** An open fire on a stone hearth, with a swinging crane to hang a pot. */
  | 'hearth'
  /** A cast-iron range: enclosed firebox, a damper, graded hotplates, an oven. */
  | 'range'
  /** A gas hob: four rings, four knobs, a visible flame, instant. */
  | 'gas'
  /** Induction: no flame at all, and heat that outlives the switch. */
  | 'induction';

export type HeatState = 'cold' | 'heating' | 'hot' | 'cooling';

/**
 * Where the heat is, in **world** coordinates.
 *
 * The cooking mirror of `WaterBody.depthAt`, and for the same reason: a
 * fire's heat is a place, not a property of a device, and anything that
 * wants to know whether it is cooking should be able to ask about a point.
 */
export interface HeatField {
  /** 0 (cold) to 1 (full heat) at a world point. 0 anywhere out of reach. */
  heatAt(x: number, z: number): number;
}

/**
 * Somewhere a pot goes.
 *
 * A zone is a **place**, not a source. Its `heat` is sampled from the field
 * at wherever the zone currently is, which is what lets the hearth's crane
 * work at all: swing the hook away from the fire and it cools, with nothing
 * about it special-cased. Conflate the two — let the hook carry its own heat
 * around with it — and a pot swung out over the flagstones is still boiling.
 */
export interface HeatZone {
  /** Free label: 'hook', 'plate', 'ring'. */
  kind: string;
  /** Sits at the surface a pan rests on (or the hook a pot hangs from). */
  anchor: Object3D;
  /** How far the zone's heat reaches, in metres. */
  radius: number;
  /** This zone's own heat right now, 0–1. */
  readonly heat: number;
  /** Demand for this zone, 0–1. Ignored where the era has no separate controls. */
  setPower(level: number): void;
  readonly power: number;
}

/** A control you can operate — structurally a `Manipulable`, like a tap. */
export interface HeatControl {
  readonly state: number;
  readonly open: boolean;
  toggle(): boolean;
  set(target: number | boolean): void;
  update(dt: number): void;
  onChange?: (open: boolean) => void;
  object: Object3D;
}

export interface HeatSource extends Prop, HeatField {
  era: HeatEra;
  readonly state: HeatState;
  /** The hottest reading anywhere on it, 0–1. */
  readonly temperature: number;
  /** Demand, 0–1. On a fire this is how hard it is burning, not a setting. */
  readonly power: number;
  /** Set the demand. With a zone index, on the eras whose rings are separate. */
  setPower(level: number | boolean, zone?: number): void;
  zones: HeatZone[];
  /**
   * Does it burn fuel? On `hearth` and `range` this is the whole loop: no
   * fuel, no fire, and `feed` is how it gets there.
   */
  readonly burnsFuel: boolean;
  /** Fuel left, 0–1. Always 1 on the eras that are plumbed or wired. */
  readonly fuel: number;
  /** Put another log on. A no-op where there is nothing to burn. */
  feed(amount?: number): void;
  /** The knob, damper or crane. Null on an open hearth with neither. */
  control: HeatControl | null;
  /** Swing the pot off the fire — the medieval heat control. Hearth only. */
  crane: HeatControl | null;
  /** The oven cavity door, on the eras that have an oven. */
  ovenDoor: HeatControl | null;
  /** Where a cook stands. */
  slot: PropSlot;
  onState?: (state: HeatState) => void;
  update(dt: number): void;
}

interface EraSpec {
  /** Seconds from cold to hot at full demand. */
  rise: number;
  /** Seconds from hot back to cold with the demand off. */
  fall: number;
  burnsFuel: boolean;
  /** Seconds of burn in a full load of fuel. */
  burnFor: number;
  /** Can each zone be set separately? */
  independent: boolean;
  hasOven: boolean;
  width: number;
  depth: number;
  height: number;
}

/**
 * The era table, and every number in it is a gameplay decision.
 *
 * Rise and fall are the shape of the thing. A hearth takes twenty seconds to
 * come up and four MINUTES to go down, because embers hold heat; a gas ring
 * is up in under two seconds and gone in six. Induction is as instant as gas
 * going up and deliberately slow going down — the plate is still hot long
 * after the light says off, which is the most interesting property in the
 * set and the only one that can hurt you.
 */
const ERAS: Record<HeatEra, EraSpec> = {
  hearth: { rise: 22, fall: 240, burnsFuel: true, burnFor: 180, independent: false, hasOven: false, width: 1.5, depth: 0.8, height: 0.35 },
  range: { rise: 70, fall: 320, burnsFuel: true, burnFor: 300, independent: false, hasOven: true, width: 1.25, depth: 0.68, height: 0.92 },
  gas: { rise: 1.6, fall: 6, burnsFuel: false, burnFor: Infinity, independent: true, hasOven: true, width: 0.9, depth: 0.62, height: 0.92 },
  induction: { rise: 1.2, fall: 34, burnsFuel: false, burnFor: Infinity, independent: true, hasOven: true, width: 0.9, depth: 0.62, height: 0.92 },
};

export interface HeatOptions {
  era?: HeatEra;
  /** Rings/plates/hooks. Defaults per era. */
  zones?: number;
  /** Start with the fuel bunker full. Default true. */
  fuelled?: boolean;
  seed?: number;
  palette?: Palette;
}

const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

/**
 * A control that eases toward a target, shaped exactly like `Manipulable`.
 *
 * The pointer notch is not decoration. A smooth knob rotating about its own
 * axis is pixel-identical to a stationary one, so the entire control would
 * be invisible — the same trap as the knurled tap handle, and it catches
 * every round thing that turns.
 */
function makeKnob(color: number, speed = 4): HeatControl & { object: Group } {
  const group = new Group();
  group.name = 'knob';
  const metal = new MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });
  const body = new Mesh(new CylinderGeometry(0.026, 0.03, 0.022, 12), metal);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const notch = new Mesh(
    new BoxGeometry(0.006, 0.024, 0.012),
    new MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.7 })
  );
  notch.position.set(0, 0.016, 0.012);
  group.add(notch);

  let target = 0;
  let state = 0;
  const api: HeatControl & { object: Group } = {
    object: group,
    get state() {
      return state;
    },
    get open() {
      return target > 0.5;
    },
    toggle() {
      const next = !(target > 0.5);
      api.set(next);
      return next;
    },
    set(value: number | boolean) {
      const was = target > 0.5;
      target = typeof value === 'boolean' ? (value ? 1 : 0) : clamp01(value);
      if (was !== target > 0.5) api.onChange?.(target > 0.5);
    },
    update(dt: number) {
      state += (target - state) * Math.min(1, dt * speed);
      // Three quarters of a turn from off to full.
      group.rotation.z = -state * Math.PI * 1.5;
    },
  };
  return api;
}

/** A pivoting arm — the crane over a hearth, or a hinged door. */
function makeHinge(pivot: Group, axis: 'y' | 'x', swing: number, speed = 2.2): HeatControl {
  let target = 0;
  let state = 0;
  const api: HeatControl = {
    object: pivot,
    get state() {
      return state;
    },
    get open() {
      return target > 0.5;
    },
    toggle() {
      const next = !(target > 0.5);
      api.set(next);
      return next;
    },
    set(value: number | boolean) {
      const was = target > 0.5;
      target = typeof value === 'boolean' ? (value ? 1 : 0) : clamp01(value);
      if (was !== target > 0.5) api.onChange?.(target > 0.5);
    },
    update(dt: number) {
      state += (target - state) * Math.min(1, dt * speed);
      pivot.rotation[axis] = state * swing;
    },
  };
  return api;
}

/**
 * A stove, hob, range or hearth.
 *
 * The origin is on the floor at the centre of the front face, facing +z out
 * into the room.
 */
export function createHeatSource(options: HeatOptions = {}): HeatSource {
  const era = options.era ?? 'gas';
  const spec = ERAS[era];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const zoneCount = options.zones ?? (era === 'hearth' ? 2 : era === 'range' ? 2 : 4);

  const group = new Group();
  group.name = `heat-${era}`;

  const iron = new MeshStandardMaterial({ color: 0x2e3033, roughness: 0.55, metalness: 0.5 });
  const steel = new MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.28, metalness: 0.8 });

  interface ZoneState {
    kind: string;
    anchor: Object3D;
    radius: number;
    /** Fraction of the source's heat this zone gets, where they are not separate. */
    share: number;
    power: number;
    heat: number;
    /** The glowing ring / flame that shows it is on. */
    show: Object3D | null;
    material: MeshStandardMaterial | null;
  }
  /** What actually produces heat: the fire, the rings, the hotplates. */
  const emitters: ZoneState[] = [];
  /** Where a pot goes. Reads the field; may or may not also be an emitter. */
  const places: Array<{ kind: string; anchor: Object3D; radius: number; source: number | null }> = [];
  const controls: HeatControl[] = [];
  let crane: HeatControl | null = null;
  let ovenDoor: HeatControl | null = null;
  let control: HeatControl | null = null;

  /** A ring or plate: it emits, and it is also where the pan sits. */
  const addEmitter = (
    kind: string,
    x: number,
    y: number,
    z: number,
    radius: number,
    share: number
  ): ZoneState => {
    const anchor = new Object3D();
    anchor.name = `zone:${kind}`;
    anchor.position.set(x, y, z);
    group.add(anchor);
    const zone: ZoneState = { kind, anchor, radius, share, power: 0, heat: 0, show: null, material: null };
    emitters.push(zone);
    places.push({ kind, anchor, radius, source: emitters.length - 1 });
    return zone;
  };

  let flameGroup: Group | null = null;
  let flameU: { uTime: { value: number } } | null = null;
  let emberU: { uTime: { value: number } } | null = null;

  if (era === 'hearth') {
    // A stone back and a raised hearthstone, with the fire on it.
    const stone = createSurface('stone', { color: palette.rock[0], seed });
    const back = new Mesh(new BoxGeometry(spec.width, 1.5, 0.16), stone);
    back.position.set(0, 0.75, -spec.depth / 2 - 0.08);
    group.add(back);
    const slab = new Mesh(new BoxGeometry(spec.width, spec.height, spec.depth), stone);
    slab.position.set(0, spec.height / 2, 0);
    group.add(slab);
    for (const sx of [-1, 1]) {
      const cheek = new Mesh(new BoxGeometry(0.16, 1.1, spec.depth), stone);
      cheek.position.set(sx * (spec.width / 2 - 0.08), spec.height + 0.55, 0);
      group.add(cheek);
    }
    // Logs and coals.
    const coals = new MeshStandardMaterial({
      color: 0x2a1a12,
      roughness: 0.9,
      emissive: 0xff5a1e,
      emissiveIntensity: 0,
    });
    const bed = new Mesh(new CylinderGeometry(0.26, 0.3, 0.07, 10), coals);
    bed.position.set(0, spec.height + 0.035, 0);
    group.add(bed);
    for (let i = 0; i < 4; i++) {
      const log = new Mesh(
        new CylinderGeometry(0.045, 0.05, rng.range(0.4, 0.55), 6),
        createSurface('bark', { color: 0x5a4632, seed: seed + i })
      );
      log.rotation.set(0, rng.range(0, Math.PI), Math.PI / 2 + rng.range(-0.2, 0.2));
      log.position.set(rng.range(-0.1, 0.1), spec.height + 0.08, rng.range(-0.08, 0.08));
      group.add(log);
    }
    // Sized to sit INSIDE the opening. The first version was a column of
    // flame twice the height of the chimney breast, which reads as a house
    // fire rather than something you would hang a pot over.
    const fire = makeFlame(rng, 0.5, 5, 0.16, 0.4);
    fire.group.position.set(0, spec.height + 0.06, 0);
    group.add(fire.group);
    flameGroup = fire.group;
    flameU = fire.flameU;
    emberU = fire.emberU;

    // The CRANE: a pivoting iron arm with a chain and hook. On a medieval
    // fire this IS the heat control — there is no dial, you swing the pot
    // off the flames. It only works because heat is a field: the hook's
    // reading falls as it moves away, with nothing special-cased.
    const pivot = new Group();
    pivot.name = 'crane';
    pivot.position.set(-spec.width / 2 + 0.14, spec.height, -spec.depth / 2 + 0.1);
    group.add(pivot);
    const post = new Mesh(new CylinderGeometry(0.022, 0.022, 1.1, 8), iron);
    post.position.y = 0.55;
    pivot.add(post);
    const arm = new Mesh(new CylinderGeometry(0.018, 0.018, 0.72, 6), iron);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0.36, 1.02, 0);
    pivot.add(arm);
    const chain = new Mesh(new CylinderGeometry(0.008, 0.008, 0.3, 5), iron);
    chain.position.set(0.66, 0.87, 0);
    pivot.add(chain);
    const hookIron = new Mesh(new TorusGeometry(0.03, 0.007, 4, 10, Math.PI * 1.4), iron);
    hookIron.rotation.y = Math.PI / 2;
    hookIron.position.set(0.66, 0.71, 0);
    pivot.add(hookIron);
    const hook = new Object3D();
    hook.name = 'zone:hook';
    hook.position.set(0.66, 0.7, 0);
    pivot.add(hook);
    // The hook is a PLACE, not an emitter. Its anchor rides on the crane, so
    // swinging the crane moves it through the fire's field and heatAt does
    // the rest. Give the hook its own heat instead and it carries the fire
    // around with it: a pot swung out over the flagstones stays boiling.
    places.push({ kind: 'hook', anchor: hook, radius: 0.28, source: null });
    crane = makeHinge(pivot, 'y', -Math.PI * 0.55);

    // The fire itself, fixed over the hearthstone. One emitter with a wide,
    // soft reach — which is exactly what an open fire is.
    const fireZone = addEmitter('fire', 0, spec.height + 0.1, 0, 1.15, 1);
    void fireZone;

    // A trivet on the hearthstone — always warm, never hot. Somewhere to
    // keep a pot without cooking it.
    if (zoneCount > 1) {
      const trivet = new Mesh(new TorusGeometry(0.1, 0.012, 4, 10), iron);
      trivet.rotation.x = Math.PI / 2;
      trivet.position.set(spec.width / 2 - 0.28, spec.height + 0.06, 0.1);
      group.add(trivet);
      const trivetAt = new Object3D();
      trivetAt.name = 'zone:trivet';
      trivetAt.position.set(spec.width / 2 - 0.28, spec.height + 0.07, 0.1);
      group.add(trivetAt);
      places.push({ kind: 'trivet', anchor: trivetAt, radius: 0.22, source: null });
    }
  } else {
    // A box with a top: range, gas hob, induction. The oven cavity goes in
    // below, and it is a CAVITY — four walls round a void, never a smaller
    // box inside a bigger one, which is invisible.
    const shellMat =
      era === 'range'
        ? iron
        : // A plain material, deliberately. Both procedural options are wrong
          // here: 'steel' is a high-metalness preset and renders near-BLACK
          // with nothing in the scene for it to reflect, and 'paintedMetal'
          // puts a pitted render finish on what should be a smooth enamelled
          // panel. A modern appliance front has no texture worth simulating.
          new MeshStandardMaterial({
            color: era === 'gas' ? 0xd9dbdf : 0x2b2f33,
            roughness: 0.36,
            metalness: 0.22,
          });
    const t = 0.05;
    const cavityW = spec.width - 0.22;
    const cavityH = 0.42;
    const cavityFloor = 0.2;
    // Sides, back, base, and the strip above the oven mouth.
    for (const [w, h, d, x, y, z] of [
      [t, spec.height, spec.depth, -(spec.width - t) / 2, spec.height / 2, 0],
      [t, spec.height, spec.depth, (spec.width - t) / 2, spec.height / 2, 0],
      [spec.width, spec.height, t, 0, spec.height / 2, -(spec.depth - t) / 2],
      [cavityW, cavityFloor, spec.depth - t, 0, cavityFloor / 2, t / 2],
      [cavityW, spec.height - cavityFloor - cavityH, spec.depth - t, 0,
        (spec.height + cavityFloor + cavityH) / 2, t / 2],
    ] as Array<[number, number, number, number, number, number]>) {
      const panel = new Mesh(new BoxGeometry(w, h, d), shellMat);
      panel.position.set(x, y, z);
      group.add(panel);
    }
    const worktop = new Mesh(
      new BoxGeometry(spec.width, 0.035, spec.depth),
      era === 'induction'
        ? createGlass({ frosted: false, tint: 0x14171a })
        : era === 'gas'
          ? steel
          : iron
    );
    worktop.name = 'worktop';
    worktop.position.set(0, spec.height + 0.018, 0);
    group.add(worktop);

    // The oven door, hinged along its bottom edge so it falls open.
    const doorPivot = new Group();
    doorPivot.name = 'ovenDoor';
    doorPivot.position.set(0, cavityFloor, spec.depth / 2);
    group.add(doorPivot);
    const door = new Mesh(new BoxGeometry(cavityW, cavityH, 0.03), shellMat);
    door.position.set(0, cavityH / 2, 0.015);
    doorPivot.add(door);
    if (era !== 'range') {
      const win = new Mesh(
        new BoxGeometry(cavityW * 0.62, cavityH * 0.5, 0.006),
        createGlass({ frosted: true, tint: 0x2a2f33 })
      );
      win.position.set(0, cavityH / 2, 0.034);
      doorPivot.add(win);
    }
    const handle = new Mesh(new CylinderGeometry(0.012, 0.012, cavityW * 0.8, 8), steel);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0, cavityH - 0.05, 0.06);
    doorPivot.add(handle);
    ovenDoor = makeHinge(doorPivot, 'x', Math.PI / 2, 2.4);

    // Rings on top.
    const cols = Math.min(2, zoneCount);
    const rows = Math.ceil(zoneCount / cols);
    for (let i = 0; i < zoneCount; i++) {
      const cx = ((i % cols) - (cols - 1) / 2) * (spec.width * 0.42);
      const cz = (Math.floor(i / cols) - (rows - 1) / 2) * (spec.depth * 0.36);
      const y = spec.height + 0.036;
      // On a range the plates are NOT controllable: they are graded by how
      // near they sit to the firebox, and moving the pan is how you turn one
      // down. On a hob each ring is its own.
      const share = era === 'range' ? (i === 0 ? 1 : 0.55) : 1;
      const zone = addEmitter(era === 'range' ? 'plate' : 'ring', cx, y, cz, era === 'range' ? 0.16 : 0.11, share);

      if (era === 'gas') {
        const burner = new Mesh(new TorusGeometry(0.055, 0.012, 5, 14), iron);
        burner.rotation.x = Math.PI / 2;
        burner.position.set(cx, y, cz);
        group.add(burner);
        // A gas ring is a SHORT BLUE CROWN, four centimetres tall. Built
        // from the wood-fire flame it comes out as a yellow dome a quarter
        // of a metre across — a bonfire sitting on a worktop, which is what
        // the first version rendered. Height is the reading: you can see how
        // hard gas is going, and that is the whole point of it.
        const crown = new Group();
        for (const [rb, rt, h, col, op] of [
          [0.03, 0.058, 0.045, 0x3d7bff, 0.85],
          [0.016, 0.032, 0.028, 0xcfe6ff, 0.9],
        ] as Array<[number, number, number, number, number]>) {
          const cone = new Mesh(
            new CylinderGeometry(rt, rb, h, 14, 1, true),
            new MeshBasicMaterial({
              color: col,
              transparent: true,
              opacity: op,
              blending: AdditiveBlending,
              depthWrite: false,
              side: DoubleSide,
            })
          );
          cone.position.y = h / 2;
          crown.add(cone);
        }
        crown.position.set(cx, y + 0.004, cz);
        crown.visible = false;
        group.add(crown);
        zone.show = crown;
      } else if (era === 'induction') {
        // No flame at all. A ring painted under the glass that glows.
        const mat = new MeshStandardMaterial({
          color: 0x24282c,
          roughness: 0.5,
          emissive: 0xff3a10,
          emissiveIntensity: 0,
        });
        const ring = new Mesh(new TorusGeometry(0.085, 0.006, 4, 20), mat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(cx, spec.height + 0.006, cz);
        group.add(ring);
        zone.show = ring;
        zone.material = mat;
      } else {
        const mat = new MeshStandardMaterial({
          color: 0x222427,
          roughness: 0.7,
          emissive: 0xff4a12,
          emissiveIntensity: 0,
        });
        const plate = new Mesh(new CylinderGeometry(0.15, 0.15, 0.012, 16), mat);
        plate.position.set(cx, spec.height + 0.04, cz);
        group.add(plate);
        zone.show = plate;
        zone.material = mat;
      }
    }

    // Controls along the front.
    if (spec.independent) {
      for (let i = 0; i < zoneCount; i++) {
        const knob = makeKnob(era === 'gas' ? 0x9aa0a6 : 0x60666c);
        knob.object.position.set(
          (i - (zoneCount - 1) / 2) * 0.1,
          spec.height - 0.02,
          spec.depth / 2 + 0.01
        );
        group.add(knob.object);
        controls.push(knob);
      }
      control = controls[0] ?? null;
    } else {
      // One damper for the whole firebox. That is the range's era in a
      // single object: you can make the fire hotter, and that is all.
      const damper = makeKnob(0xb89a52, 2.2);
      damper.object.position.set(spec.width / 2 - 0.14, spec.height - 0.06, spec.depth / 2 + 0.01);
      group.add(damper.object);
      controls.push(damper);
      control = damper;
      // A firebox door, so it is visibly a thing you feed.
      const fireDoor = new Mesh(new BoxGeometry(0.26, 0.2, 0.02), iron);
      fireDoor.position.set(-spec.width / 2 + 0.22, spec.height - 0.16, spec.depth / 2 + 0.01);
      group.add(fireDoor);
      const glow = new MeshStandardMaterial({
        color: 0x1a1210,
        roughness: 0.9,
        emissive: 0xff5a1e,
        emissiveIntensity: 0,
      });
      const slot = new Mesh(new BoxGeometry(0.16, 0.03, 0.006), glow);
      slot.position.set(-spec.width / 2 + 0.22, spec.height - 0.16, spec.depth / 2 + 0.023);
      group.add(slot);
      // The firebox glow is an INDICATOR, not somewhere a pan goes: zero
      // reach, so it never shows up in heatAt, and no entry in `places`.
      emitters.push({
        kind: 'firebox', anchor: slot, radius: 0, share: 1, power: 0, heat: 0,
        show: slot, material: glow,
      });
    }
  }

  const cookAt = createSlot('cook', 'work', group, 0, 0, spec.depth / 2 + 0.42, Math.PI);
  addApproach(cookAt, group, 0.5, 'behind');

  // ---- state -----------------------------------------------------------
  let power = 0;
  let fuel = options.fuelled === false ? 0 : 1;
  let state: HeatState = 'cold';
  const world = new Vector3();
  const probe = new Vector3();

  const setZonePower = (level: number, index?: number): void => {
    const v = clamp01(level);
    const target = index === undefined ? null : places[index]?.source ?? null;
    if (spec.independent && target !== null) {
      emitters[target].power = v;
      power = Math.max(...emitters.map((e) => e.power));
      return;
    }
    power = v;
    for (const e of emitters) e.power = v;
  };

  const api: HeatSource = {
    object: group,
    obstacleRadius: Math.max(spec.width, spec.depth) * 0.55,
    era,
    zones: places.map((place, i) => ({
      kind: place.kind,
      anchor: place.anchor,
      radius: place.radius,
      get heat() {
        // SAMPLED from the field where the place currently is, never carried.
        place.anchor.updateWorldMatrix(true, false);
        const at = place.anchor.getWorldPosition(new Vector3());
        return api.heatAt(at.x, at.z);
      },
      get power() {
        return place.source === null ? power : emitters[place.source].power;
      },
      setPower(level: number) {
        setZonePower(level, i);
        const c = place.source === null ? null : controls[place.source];
        if (spec.independent && c) c.set(clamp01(level));
      },
    })),
    control,
    crane,
    ovenDoor,
    slot: cookAt,
    slots: [cookAt],
    burnsFuel: spec.burnsFuel,
    get fuel() {
      return spec.burnsFuel ? fuel : 1;
    },
    get state() {
      return state;
    },
    get power() {
      return power;
    },
    get temperature() {
      // What the SOURCE is doing, so a hearth still reads hot while its
      // pot is swung out over the flagstones.
      return emitters.reduce((m, e) => Math.max(m, e.heat), 0);
    },
    setPower(level: number | boolean, zone?: number) {
      const v = typeof level === 'boolean' ? (level ? 1 : 0) : level;
      setZonePower(v, zone);
      if (spec.independent && zone !== undefined) controls[zone]?.set(clamp01(v));
      else for (const c of controls) c.set(clamp01(v));
    },
    feed(amount = 0.5) {
      // A no-op where there is nothing to burn, and that IS the era axis:
      // the same call keeps a hearth alive and does nothing to a gas hob.
      if (!spec.burnsFuel) return;
      fuel = clamp01(fuel + amount);
    },
    heatAt(x: number, z: number) {
      group.updateWorldMatrix(true, false);
      probe.set(x, 0, z);
      let best = 0;
      for (const zone of emitters) {
        if (zone.heat <= 0.001 || zone.radius <= 0) continue;
        zone.anchor.getWorldPosition(world);
        const d = Math.hypot(world.x - probe.x, world.z - probe.z);
        if (d > zone.radius) continue;
        // Falls off toward the edge rather than stopping at it, so moving a
        // pot nearer the fire actually does something.
        best = Math.max(best, zone.heat * (1 - (d / zone.radius) ** 2));
      }
      return best;
    },
    update(dt: number) {
      if (dt <= 0) return;
      const was = state;
      for (const c of controls) c.update(dt);
      crane?.update(dt);
      ovenDoor?.update(dt);

      // Fuel. A fire with nothing left in it goes out however hard the
      // damper is open, which is the difference between burning and being
      // switched on.
      let demand = power;
      if (spec.burnsFuel) {
        if (fuel > 0) fuel = Math.max(0, fuel - (dt / spec.burnFor) * (0.3 + power * 0.7));
        if (fuel <= 0) demand = 0;
      }

      for (const zone of emitters) {
        const want = (spec.independent ? zone.power : demand) * zone.share;
        const rate = want > zone.heat ? dt / spec.rise : dt / spec.fall;
        zone.heat += Math.sign(want - zone.heat) * Math.min(Math.abs(want - zone.heat), rate);
        zone.heat = clamp01(zone.heat);
        if (zone.material) zone.material.emissiveIntensity = zone.heat * 1.05;
        if (zone.show && !zone.material) {
          // A gas flame: visible only while there is gas, and its SIZE is
          // the reading. Drawing a full flame at 10% is a hob that lies.
          zone.show.visible = want > 0.02;
          const s = 0.35 + want * 0.65;
          zone.show.scale.set(1, s, 1);
        }
      }
      if (flameGroup) {
        // The hearth's fire is the fuel, not the demand.
        const alive = spec.burnsFuel ? Math.max(fuel > 0 ? 0.35 : 0, api.temperature) : api.temperature;
        flameGroup.visible = alive > 0.02;
        flameGroup.scale.set(0.6 + alive * 0.4, 0.45 + alive * 0.55, 0.6 + alive * 0.4);
      }
      const t = api.temperature;
      const wanted = spec.independent ? Math.max(...emitters.map((e) => e.power)) : demand;
      if (t < 0.03) state = 'cold';
      else if (wanted > t + 0.02) state = 'heating';
      else if (wanted > 0.02) state = 'hot';
      else state = 'cooling';
      if (state !== was) api.onState?.(state);

      if (flameU && emberU) {
        const clock = (flameU.uTime.value += dt);
        emberU.uTime.value = clock;
      }
    },
  };
  return api;
}

/** An open cooking hearth: a fire on a stone, with a crane to hang a pot. */
export function createHearth(options: Omit<HeatOptions, 'era'> = {}): HeatSource {
  return createHeatSource({ ...options, era: 'hearth' });
}

/** A cast-iron range: one firebox, one damper, graded plates and an oven. */
export function createRange(options: Omit<HeatOptions, 'era'> = {}): HeatSource {
  return createHeatSource({ ...options, era: 'range' });
}

/** A modern hob and oven — `gas` burns visibly, `induction` does not burn. */
export function createHob(
  options: Omit<HeatOptions, 'era'> & { era?: 'gas' | 'induction' } = {}
): HeatSource {
  return createHeatSource({ ...options, era: options.era ?? 'gas' });
}
