import {
  Box3,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { ChillField } from './cold';
import type { Carryable } from '../core/types';

/**
 * Ingredients — the things the rest of the kitchen is for.
 *
 * This is the prop that closes the loop. The stove published a `HeatField`,
 * the cold store published a `ChillField`, the prep bench yields and the
 * sink consumes; none of it had anything to act *on*. An ingredient is the
 * subject, and it reads those fields itself, exactly the way `Cookware`
 * does:
 *
 * ```ts
 * onion.update(t.delta, fridge);   // samples keepAt at its own position
 * ```
 *
 * There are **two independent axes**, and keeping them apart is the whole
 * design:
 *
 * - **form** — `whole` → `prepped`. What you did to it. A one-way step, and
 *   it is the yield of a prep station.
 * - **freshness** — 1 down to 0. What time did to it, at a rate the cold
 *   store decides.
 *
 * They interact in exactly one place, and it is the rule worth having:
 * **prepping something makes it spoil far faster.** A whole onion keeps for
 * weeks and a chopped one keeps for a day, so `prep()` is a commitment
 * rather than a free upgrade — which is the only thing that makes a cook
 * plan the order of anything.
 *
 * ```ts
 * const onion = createIngredient({ kind: 'onion' });
 * onion.prep();                    // now on a clock
 * onion.update(t.delta, larder);   // …that the larder can slow down
 * onion.spoiled;                   // and eventually lose
 * ```
 */

export type IngredientKind =
  | 'onion'
  | 'carrot'
  | 'potato'
  | 'cabbage'
  | 'meat'
  | 'fish'
  | 'bread'
  | 'cheese'
  | 'herbs'
  | 'egg';

/** What has been done to it. One way only — you cannot un-chop an onion. */
export type IngredientForm = 'whole' | 'prepped';

/** How it is doing. `spoiled` is terminal. */
export type IngredientState = 'fresh' | 'tired' | 'spoiled';

interface KindSpec {
  /** Seconds it keeps, whole, at bench temperature. */
  keeps: number;
  /**
   * How much faster it goes off once it is cut.
   *
   * The number that makes the kitchen a planning problem rather than a
   * sequence. Anything above about 4 and prepping ahead is simply wrong;
   * at 1 it is free and nobody ever has to think.
   */
  cutFactor: number;
  /** Radius of the whole thing, roughly. */
  size: number;
  colour: number;
  /** What it looks like inside, once cut. */
  inside: number;
  /** How many pieces it falls into. */
  pieces: number;
  shape: 'round' | 'long' | 'slab' | 'leafy';
}

/**
 * The kind table.
 *
 * `keeps` spans two orders of magnitude on purpose. A potato and a fish are
 * not the same object with different meshes: one of them you can leave in a
 * corner for the whole game and the other is a **timer that started when you
 * picked it up**, and a kitchen with only one of those in it has no
 * decisions in it either.
 */
const KINDS: Record<IngredientKind, KindSpec> = {
  onion:   { keeps: 900, cutFactor: 6,  size: 0.045, colour: 0xd8c9a4, inside: 0xf2ece0, pieces: 7, shape: 'round' },
  carrot:  { keeps: 700, cutFactor: 5,  size: 0.028, colour: 0xd4732a, inside: 0xe89a4c, pieces: 8, shape: 'long' },
  potato:  { keeps: 1400, cutFactor: 7, size: 0.05, colour: 0xa8834e, inside: 0xead9b0, pieces: 6, shape: 'round' },
  cabbage: { keeps: 800, cutFactor: 4,  size: 0.075, colour: 0x8fae62, inside: 0xd6e2b4, pieces: 9, shape: 'round' },
  meat:    { keeps: 180, cutFactor: 3,  size: 0.06, colour: 0xa84a48, inside: 0xc46a63, pieces: 5, shape: 'slab' },
  fish:    { keeps: 120, cutFactor: 3,  size: 0.055, colour: 0xb8bec4, inside: 0xe4c9b4, pieces: 4, shape: 'long' },
  bread:   { keeps: 420, cutFactor: 4,  size: 0.07, colour: 0xc09858, inside: 0xeadcb8, pieces: 6, shape: 'slab' },
  cheese:  { keeps: 600, cutFactor: 3,  size: 0.05, colour: 0xe4c464, inside: 0xf0dc98, pieces: 5, shape: 'slab' },
  herbs:   { keeps: 150, cutFactor: 8,  size: 0.05, colour: 0x4e8c3c, inside: 0x6ea84e, pieces: 10, shape: 'leafy' },
  egg:     { keeps: 500, cutFactor: 9,  size: 0.026, colour: 0xf0e4cc, inside: 0xf6c93a, pieces: 3, shape: 'round' },
};

export interface IngredientOptions {
  kind?: IngredientKind;
  /** Start already cut. Default false. */
  form?: IngredientForm;
  /** Start at less than perfect. 0–1, default 1. */
  freshness?: number;
  seed?: number;
  palette?: Palette;
}

export interface Ingredient extends Carryable {
  kind: IngredientKind;
  readonly form: IngredientForm;
  readonly state: IngredientState;
  /** 1 (just picked) down to 0 (gone). */
  readonly freshness: number;
  /** Nothing you can do about it. */
  readonly spoiled: boolean;
  /**
   * Seconds of life left **at the rate it is currently going off**, or
   * `Infinity` in a freezer. What a HUD wants and what a planner needs.
   */
  readonly shelfLife: number;
  /** Cut it up. Returns false if it was already prepped, or already gone. */
  prep(): boolean;
  /** Advance the clock. Pass the cold store it is sitting in, or a rate. */
  update(dt: number, chill?: ChillField | number): void;
  /** Fired once, when it crosses into `tired` or `spoiled`. */
  onState?: (state: IngredientState) => void;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * One ingredient.
 *
 * The origin is at its base, like every other carryable, so it sits on a
 * shelf or a board without arithmetic.
 */
export function createIngredient(options: IngredientOptions = {}): Ingredient {
  const kind = options.kind ?? 'onion';
  const spec = KINDS[kind];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  void palette;

  const group = new Group();
  group.name = `ingredient-${kind}`;

  const skinBase = new Color(spec.colour);
  const skin = new MeshStandardMaterial({
    color: skinBase.clone(),
    roughness: 0.72,
    flatShading: true,
  });
  const flesh = new MeshStandardMaterial({
    color: new Color(spec.inside),
    roughness: 0.65,
    flatShading: true,
  });

  /** The uncut thing. */
  const whole = new Group();
  group.add(whole);
  const R = spec.size;
  if (spec.shape === 'round') {
    const body = new Mesh(new SphereGeometry(R, 9, 7), skin);
    body.scale.set(1, kind === 'egg' ? 1.32 : rng.range(0.85, 1.0), 1);
    body.position.y = R * (kind === 'egg' ? 1.32 : 0.92);
    whole.add(body);
    if (kind === 'onion') {
      const wisp = new Mesh(new CylinderGeometry(0.002, 0.006, R * 0.9, 4), skin);
      wisp.position.y = R * 2.2;
      whole.add(wisp);
    }
  } else if (spec.shape === 'long') {
    const body = new Mesh(new CylinderGeometry(R * 0.45, R, R * 5.5, 7), skin);
    body.rotation.z = Math.PI / 2;
    body.position.y = R;
    whole.add(body);
    if (kind === 'carrot') {
      for (let i = 0; i < 3; i++) {
        const frond = new Mesh(new BoxGeometry(0.004, R * 1.6, 0.012), flesh);
        frond.material = new MeshStandardMaterial({ color: 0x4e8c3c, roughness: 0.8, flatShading: true });
        frond.position.set(R * 2.9, R + R * 0.9, rng.range(-0.01, 0.01));
        frond.rotation.z = rng.range(-0.5, 0.5);
        whole.add(frond);
      }
    }
  } else if (spec.shape === 'slab') {
    const body = new Mesh(new BoxGeometry(R * 2.4, R * 1.1, R * 1.7), skin);
    body.position.y = R * 0.55;
    body.rotation.y = rng.range(-0.3, 0.3);
    whole.add(body);
  } else {
    for (let i = 0; i < 6; i++) {
      const leaf = new Mesh(new BoxGeometry(R * 0.5, 0.004, R * 1.1), skin);
      leaf.position.set(rng.range(-R * 0.5, R * 0.5), 0.004 + i * 0.005, rng.range(-R * 0.4, R * 0.4));
      leaf.rotation.set(rng.range(-0.2, 0.2), rng.range(0, 3), rng.range(-0.2, 0.2));
      whole.add(leaf);
    }
  }

  /**
   * The cut-up version.
   *
   * Built up front and hidden, rather than rebuilt on `prep()`. A generator
   * that swaps geometry mid-game is a generator that allocates during play,
   * and the whole point of the pieces is that they are the same object.
   */
  const cut = new Group();
  cut.visible = false;
  group.add(cut);
  for (let i = 0; i < spec.pieces; i++) {
    const piece =
      spec.shape === 'long'
        ? new Mesh(new CylinderGeometry(R * 0.85, R * 0.85, R * 0.5, 8), flesh)
        : spec.shape === 'leafy'
          ? new Mesh(new BoxGeometry(R * 0.2, 0.003, R * 0.2), flesh)
          : new Mesh(new BoxGeometry(R * 0.7, R * 0.35, R * 0.7), flesh);
    // A heap, not a grid. Cut vegetables land where they land.
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, R * 1.5);
    piece.position.set(Math.cos(a) * r, R * 0.2 + (i % 2) * R * 0.22, Math.sin(a) * r);
    piece.rotation.set(rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.4, 0.4));
    cut.add(piece);
  }

  /**
   * Seat both versions on y = 0.
   *
   * Measured rather than hand-placed. A cylinder laid on its side has a
   * seven-sided cross-section that is not symmetric about its axis, so
   * "put the centre at the radius" leaves a carrot a centimetre into the
   * worktop and a fish nearly three — and every one of those numbers would
   * have had to be found and tuned by kind. Shifting the children (not the
   * group) also keeps the wilting scale shrinking toward the surface rather
   * than lifting the thing off it.
   */
  for (const part of [whole, cut]) {
    part.updateMatrixWorld(true);
    const drop = new Box3().setFromObject(part).min.y;
    if (Number.isFinite(drop)) for (const child of part.children) child.position.y -= drop;
  }

  // ---- state -------------------------------------------------------------
  let form: IngredientForm = options.form ?? 'whole';
  let freshness = clamp01(options.freshness ?? 1);
  let state: IngredientState = 'fresh';
  const world = new Vector3();

  const classify = (): IngredientState =>
    freshness <= 0 ? 'spoiled' : freshness < 0.4 ? 'tired' : 'fresh';
  state = classify();

  /** Ageing per second, before whatever the cold store does about it. */
  const wear = (): number => (1 / spec.keeps) * (form === 'prepped' ? spec.cutFactor : 1);

  const paint = (): void => {
    // Fresh → tired → spoiled, in the skin. A number nothing on screen
    // reflects is a number, and a green cabbage that reports itself rotten
    // is worse than no state at all.
    const t = 1 - freshness;
    skin.color.copy(skinBase);
    // Desaturate and darken toward a grey-brown; the last stretch goes
    // properly off rather than just dim.
    const off = new Color(0x6b5f44);
    skin.color.lerp(off, Math.min(1, t * 0.85));
    flesh.color.set(spec.inside);
    flesh.color.lerp(off, Math.min(1, t * 0.95));
    // And it shrinks. Everything that goes off loses water.
    const shrink = 1 - t * 0.22;
    whole.scale.set(shrink, shrink, shrink);
    cut.scale.set(shrink, shrink, shrink);
  };
  paint();
  whole.visible = form === 'whole';
  cut.visible = form === 'prepped';

  /** The last sampled preservation rate, so `shelfLife` can answer honestly. */
  let lastKeep = 1;

  const api: Ingredient = {
    object: group,
    obstacleRadius: 0,
    carry: 'side',
    kind,
    get form() {
      return form;
    },
    get state() {
      return state;
    },
    get freshness() {
      return freshness;
    },
    get spoiled() {
      return freshness <= 0;
    },
    get shelfLife() {
      if (freshness <= 0) return 0;
      const rate = wear() * lastKeep;
      return rate <= 1e-9 ? Infinity : freshness / rate;
    },
    prep() {
      // One way, and not on something that is already gone: chopping a
      // rotten onion gives you rotten chopped onion, which no recipe wants
      // and which no player meant to make.
      if (form === 'prepped' || freshness <= 0) return false;
      form = 'prepped';
      whole.visible = false;
      cut.visible = true;
      return true;
    },
    update(dt: number, chill?: ChillField | number) {
      if (dt <= 0 || freshness <= 0) return;

      // The same shape as `Cookware.update(dt, heat)`: hand it the prop and
      // it samples the field at its OWN position, so moving it into the
      // fridge is all it takes and nothing has to be told about it.
      let keep = 1;
      if (typeof chill === 'number') keep = Math.max(0, chill);
      else if (chill) {
        group.updateWorldMatrix(true, false);
        group.getWorldPosition(world);
        keep = Math.max(0, chill.keepAt(world.x, world.y, world.z));
      }
      lastKeep = keep;

      const was = state;
      freshness = Math.max(0, freshness - wear() * keep * dt);
      paint();
      state = classify();
      if (state !== was) api.onState?.(state);
    },
  };
  return api;
}

/**
 * How long this kind keeps at bench temperature, in seconds — whole, and
 * once it is cut.
 *
 * Exported so a planner can decide what to prepare last without having to
 * build one and watch it rot.
 */
export function keepsFor(kind: IngredientKind, form: IngredientForm = 'whole'): number {
  const spec = KINDS[kind];
  return form === 'prepped' ? spec.keeps / spec.cutFactor : spec.keeps;
}

export const INGREDIENT_KINDS: IngredientKind[] = [
  'onion', 'carrot', 'potato', 'cabbage', 'meat',
  'fish', 'bread', 'cheese', 'herbs', 'egg',
];
