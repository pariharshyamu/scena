import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  Quaternion,
  Object3D,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { addApproach, createSlot, type Prop, type PropSlot } from '../core/types';

/**
 * Vessels you can stand on — the deck as ground that moves.
 *
 * `createBoat` and `createShip` already exist and are hulls that **bob**:
 * bind a water sampler, ride the waves, seat somebody at the helm. This is
 * the other half, and it is a different problem. Past about ten metres a
 * ship stops being a vehicle and becomes a **place** — somewhere with work
 * and rooms and other people, that happens to be moving.
 *
 * Every character controller in the trilogy assumes the floor is the world.
 * `terrain.heightAt` never moves. A deck pitches, rolls **and translates**,
 * so the fact that breaks everything is this:
 *
 * > A character standing perfectly still on a moving deck has to change
 * > world position anyway.
 *
 * Nothing in ANIMA or GAMA does that, and no amount of walking code fixes
 * it, because the character is not walking. So the handshake is a pair —
 * one query that mirrors `terrain.heightAt`, and one that has no equivalent
 * anywhere in the library:
 *
 * ```ts
 * deckAt(x, z): number | null    // walkable height in WORLD space
 * ride(position): Vector3        // and where that point goes next
 * ```
 *
 * `ride` is the whole track. It is one matrix multiply: the inverse of the
 * vessel's transform last frame, times its transform this frame. Feed a
 * standing character through it and they come along; do not, and they walk
 * out through the stern at whatever speed the ship is making.
 *
 * ```ts
 * const ship = createVessel({ era: 'carrack' });
 * ship.float((x, z) => ocean.heightAt(x, z));
 * game.onUpdate((t) => {
 *   ship.update(t.delta, { speed: 4 });
 *   ship.ride(sailor.position);              // carried by the deck
 *   sailor.position.y = ship.deckAt(sailor.position.x, sailor.position.z) ?? 0;
 * });
 * ```
 */

export type ShipEra =
  /** An open oared galley: one low deck, no rail, and it moves like a leaf. */
  | 'galley'
  /** A carrack: a waist between a raised fo'c'sle and poop, ladders between. */
  | 'carrack'
  /** A steamer: flush deck, rails, a superstructure amidships. */
  | 'steamer'
  /** A liner: several decks, high freeboard, and a motion you barely feel. */
  | 'liner';

/**
 * Ground that moves, in **world** coordinates.
 *
 * The fifth spatial handshake, after `depthAt`, `heatAt`, `chillAt` and
 * `smokeAt` — and the first one that is not a *reading* but a *frame*. The
 * others answer "what is it like here". This one answers "where is here
 * going".
 */
export interface DeckField {
  /**
   * Walkable height at a world (x, z), or **null** if that point is not over
   * a deck at all — which is how you test whether somebody is aboard, with
   * no separate `contains`.
   *
   * `near` picks between stacked decks: the walkable surface nearest below
   * it, so a sailor in the hold does not get teleported to the poop.
   */
  deckAt(x: number, z: number, near?: number): number | null;
  /** The deck's up vector at a world point — it is not (0,1,0) at sea. */
  normalAt(x: number, z: number): Vector3;
  /**
   * Carry a world point along with the vessel's own motion, in place.
   *
   * Call it every frame on anything standing on the deck, **after**
   * `update`. Returns the same vector for chaining.
   */
  ride(position: Vector3): Vector3;
}

/** One walkable level. */
export interface DeckLevel {
  /** Free label: 'waist', 'poop', 'promenade', 'hold'. */
  name: string;
  /** Height above the vessel's origin, in vessel space. */
  y: number;
  /** Extent along the vessel's z (fore–aft) and x (beam). */
  length: number;
  beam: number;
  /** Centre along z, in vessel space. */
  z: number;
}

/** A way up: structurally ANIMA's `Climbable`, like the pool ladder. */
export interface Companionway {
  bottom: Object3D;
  top: Object3D;
  rungSpacing: number;
}

export interface ShipInput {
  /** Way through the water, m/s. */
  speed?: number;
  /** Rate of turn, radians/s. */
  turn?: number;
}

export interface DeckedShip extends Prop, DeckField {
  era: ShipEra;
  length: number;
  beam: number;
  decks: DeckLevel[];
  ladders: Companionway[];
  /** Where somebody steers. */
  helm: PropSlot;
  /** Bind the sea: `ocean.heightAt`, or a flat level. */
  float(heightAt: (x: number, z: number) => number): void;
  /** Live attitude, radians. */
  readonly pitch: number;
  readonly roll: number;
  /**
   * How hard it is to stand up right now, 0 (alongside) to 1 (hang on).
   *
   * Derived from the RATE of change of attitude and the heave, not from the
   * attitude itself. A vessel heeled steadily at ten degrees under sail is
   * easy to walk on; the same ten degrees arriving twice a second is not,
   * and a number taken off the angle cannot tell those apart.
   */
  readonly motion: number;
  update(dt: number, input?: ShipInput): void;
}

interface EraSpec {
  length: number;
  beam: number;
  /** Deck height above the waterline. */
  freeboard: number;
  draft: number;
  /**
   * How much of the wave-induced attitude actually reaches the deck, and how
   * fast. A galley follows every wave; a liner averages them out and takes
   * its time about what is left.
   */
  gain: number;
  /** Attitude smoothing (1/s). Low = slow, ponderous motion. */
  ease: number;
  levels: Array<{ name: string; y: number; length: number; beam: number; z: number }>;
  rails: boolean;
  superstructure: boolean;
}

/**
 * The era table.
 *
 * `gain` and `ease` are the whole of it, and they are not decoration: they
 * decide whether the deck is somewhere you can work. A galley at gain 1 and
 * ease 9 snaps to every crest — you brace, you do not carry things. A liner
 * at 0.12 and 0.7 has a motion you notice mainly as a slow lean, which is
 * exactly why one has a swimming pool on it and the other has oars.
 *
 * The beam does a lot of this for free and correctly: `deckAt` samples the
 * sea at port and starboard, and a 24 m beam spans more of a wavelength than
 * a 3.4 m one, so a wide hull averages the swell out before `gain` is even
 * applied. That fell out of the maths rather than being put in.
 */
const ERAS: Record<ShipEra, EraSpec> = {
  galley: {
    length: 22, beam: 3.6, freeboard: 0.75, draft: 0.5, gain: 1.0, ease: 9,
    levels: [{ name: 'deck', y: 0.75, length: 20, beam: 3.2, z: 0 }],
    rails: false, superstructure: false,
  },
  carrack: {
    length: 26, beam: 8, freeboard: 2.1, draft: 1.6, gain: 0.72, ease: 4.5,
    levels: [
      { name: 'waist', y: 2.1, length: 12, beam: 7, z: 0 },
      { name: 'forecastle', y: 3.5, length: 5.5, beam: 6, z: 9 },
      { name: 'poop', y: 3.9, length: 6.5, beam: 6.4, z: -8.5 },
      { name: 'hold', y: 0.5, length: 16, beam: 6, z: 0 },
    ],
    rails: true, superstructure: false,
  },
  steamer: {
    length: 58, beam: 9.5, freeboard: 3.2, draft: 2.6, gain: 0.42, ease: 2.2,
    levels: [
      { name: 'main', y: 3.2, length: 52, beam: 9, z: 0 },
      { name: 'boat', y: 6.0, length: 18, beam: 8, z: -4 },
      { name: 'bridge', y: 8.2, length: 7, beam: 7.5, z: 4 },
    ],
    rails: true, superstructure: true,
  },
  liner: {
    length: 180, beam: 24, freeboard: 11, draft: 7.5, gain: 0.12, ease: 0.7,
    levels: [
      { name: 'promenade', y: 11, length: 160, beam: 22, z: 0 },
      { name: 'lido', y: 16, length: 90, beam: 20, z: -12 },
      { name: 'sun', y: 20, length: 46, beam: 16, z: -20 },
      { name: 'bridge', y: 23, length: 12, beam: 18, z: 55 },
    ],
    rails: true, superstructure: true,
  },
};

export interface DeckedShipOptions {
  era?: ShipEra;
  seed?: number;
  palette?: Palette;
  color?: number;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * A vessel with decks you can stand on.
 *
 * The origin is at the waterline, amidships, with **+z forward** — matching
 * the existing watercraft, so a hull and a vessel are interchangeable to
 * anything that only wants to float something.
 */
export function createDeckedShip(options: DeckedShipOptions = {}): DeckedShip {
  const era = options.era ?? 'carrack';
  const spec = ERAS[era];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = `ship-${era}`;

  const L = spec.length;
  const B = spec.beam;

  const hullMat =
    era === 'liner'
      ? createSurface('paint', { seed, color: options.color ?? 0xf0f1f2 })
      : era === 'steamer'
        ? createSurface('paintedMetal', { seed, color: options.color ?? 0x2a3540 })
        : createSurface('plank', { seed, color: options.color ?? palette.woodDark });
  const deckMat =
    era === 'liner'
      ? createSurface('teak', { seed: seed + 1 })
      : createSurface('plank', { seed: seed + 1, color: palette.wood });
  const trim = createSurface(era === 'carrack' || era === 'galley' ? 'wood' : 'steel', {
    seed: seed + 2,
    metalness: 0.4,
    roughness: 0.4,
  });

  // ---- hull ------------------------------------------------------------
  /**
   * Tapered at both ends rather than a box. Three sections is enough to read
   * as a hull at any distance somebody will look at it from, and the point
   * of this track is what happens ON the deck.
   */
  const hullTop = spec.freeboard;
  const hullBottom = -spec.draft;
  const hullH = hullTop - hullBottom;
  const sections: Array<[number, number, number]> = [
    [B, L * 0.6, 0],
    [B * 0.62, L * 0.22, L * 0.41],
    [B * 0.7, L * 0.2, -L * 0.4],
  ];
  for (const [w, len, z] of sections) {
    const m = new Mesh(new BoxGeometry(w, hullH, len), hullMat);
    m.position.set(0, hullBottom + hullH / 2, z);
    group.add(m);
  }
  // A stem that actually cuts the water.
  const stem = new Mesh(new BoxGeometry(B * 0.24, hullH, L * 0.12), hullMat);
  stem.position.set(0, hullBottom + hullH / 2, L * 0.53);
  stem.rotation.x = -0.22;
  group.add(stem);

  // ---- decks -----------------------------------------------------------
  const decks: DeckLevel[] = [];
  for (const level of spec.levels) {
    decks.push({ ...level });
    const board = new Mesh(new BoxGeometry(level.beam, 0.12, level.length), deckMat);
    board.position.set(0, level.y - 0.06, level.z);
    group.add(board);
    // Bulwark or rail — all FOUR sides. Three of them left every raised deck
    // open at the after end, which reads as a tray rather than a deck.
    if (spec.rails && level.name !== 'hold') {
      const railH = era === 'carrack' ? 0.9 : 1.05;
      for (const s of [-1, 1]) {
        const side = new Mesh(new BoxGeometry(0.09, railH, level.length), trim);
        side.position.set((s * level.beam) / 2, level.y + railH / 2, level.z);
        group.add(side);
      }
      for (const e of [-1, 1]) {
        const end = new Mesh(new BoxGeometry(level.beam, railH, 0.09), trim);
        end.position.set(0, level.y + railH / 2, level.z + (e * level.length) / 2);
        group.add(end);
      }
    }
    // …and the face it stands on. Without this a raised deck is a plank
    // hovering above the hull with daylight under it — from three metres
    // away the first render read as a stack of separate rafts rather than
    // one ship.
    if (level.y > spec.freeboard + 0.05) {
      const drop = level.y - spec.freeboard;
      for (const e of [-1, 1]) {
        const face = new Mesh(new BoxGeometry(level.beam, drop, 0.14), hullMat);
        face.position.set(0, level.y - drop / 2, level.z + (e * level.length) / 2);
        group.add(face);
      }
      for (const sgn of [-1, 1]) {
        const flank = new Mesh(new BoxGeometry(0.14, drop, level.length), hullMat);
        flank.position.set((sgn * level.beam) / 2, level.y - drop / 2, level.z);
        group.add(flank);
      }
    }
  }
  // Sort high to low: `deckAt` walks this and takes the first one at or
  // below where you already are.
  decks.sort((a, b) => b.y - a.y);

  // ---- companionways ---------------------------------------------------
  const ladders: Companionway[] = [];
  const raised = decks.filter((d) => d.name !== 'hold');
  for (let i = 0; i < raised.length - 1; i++) {
    const upper = raised[i];
    const lower = raised[i + 1];
    if (upper.y - lower.y < 0.6) continue;
    const at = new Group();
    at.name = `companionway:${lower.name}-${upper.name}`;
    // At the near edge of the upper deck, on the centreline-ish.
    const z = upper.z + (upper.z > lower.z ? -upper.length / 2 - 0.3 : upper.length / 2 + 0.3);
    at.position.set(B * 0.22, lower.y, z);
    group.add(at);
    const rise = upper.y - lower.y;
    const spacing = 0.28;
    for (let r = spacing; r < rise; r += spacing) {
      const rung = new Mesh(new CylinderGeometry(0.03, 0.03, 0.7, 6), trim);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, r, 0);
      at.add(rung);
    }
    for (const s of [-1, 1]) {
      const stringer = new Mesh(new BoxGeometry(0.06, rise, 0.06), trim);
      stringer.position.set(s * 0.35, rise / 2, 0);
      at.add(stringer);
    }
    const bottom = new Object3D();
    bottom.name = 'ladder:bottom';
    at.add(bottom);
    const top = new Object3D();
    top.name = 'ladder:top';
    top.position.set(0, rise, upper.z > lower.z ? 0.5 : -0.5);
    at.add(top);
    ladders.push({ bottom, top, rungSpacing: spacing });
  }

  if (spec.superstructure) {
    const house = new Mesh(
      new BoxGeometry(B * 0.72, era === 'liner' ? 9 : 3.2, L * (era === 'liner' ? 0.42 : 0.22)),
      era === 'liner' ? hullMat : createSurface('paint', { seed: seed + 3, color: 0xe8e6e0 })
    );
    house.position.set(0, spec.freeboard + (era === 'liner' ? 4.5 : 1.6), era === 'liner' ? -6 : 2);
    group.add(house);
  }
  if (era === 'galley') {
    // Thwarts. An open boat is benches, and the deck between them is the
    // only walkable strip on it.
    for (let i = -7; i <= 7; i++) {
      const thwart = new Mesh(new BoxGeometry(B * 0.86, 0.1, 0.3), deckMat);
      thwart.position.set(0, spec.freeboard + 0.35, i * 1.3);
      group.add(thwart);
    }
  }
  void rng;

  const top = decks[0];
  const helm = createSlot('helm', 'stand', group, 0, top.y, top.z - top.length / 2 + 0.8, 0);
  addApproach(helm, group, 1.2, 'front');

  // ---- state -----------------------------------------------------------
  let sampler: ((x: number, z: number) => number) | null = null;
  let pitch = 0;
  let roll = 0;
  let motion = 0;
  /**
   * The vessel's transform delta for this frame: current × inverse(previous).
   *
   * This one matrix IS the track. `ride` is a single `applyMatrix4` by it.
   */
  const delta = new Matrix4();
  const prevInverse = new Matrix4();
  const local = new Vector3();
  const up = new Vector3();
  const spin = new Quaternion();

  const api: DeckedShip = {
    object: group,
    // A vessel is not an obstacle you steer around on land; it is the ground.
    obstacleRadius: 0,
    era,
    length: L,
    beam: B,
    decks,
    ladders,
    helm,
    slots: [helm],
    get pitch() {
      return pitch;
    },
    get roll() {
      return roll;
    },
    get motion() {
      return motion;
    },
    float(heightAt) {
      sampler = heightAt;
    },
    deckAt(x: number, z: number, near?: number) {
      group.updateWorldMatrix(true, false);
      local.set(x, 0, z);
      // Only x and z of the query mean anything: we are asking "if I am over
      // this spot, what is under me", so the probe goes down the world Y.
      group.worldToLocal(local);
      for (const level of decks) {
        if (Math.abs(local.x) > level.beam / 2) continue;
        if (Math.abs(local.z - level.z) > level.length / 2) continue;
        // Stacked decks: take the first at or below where the asker already
        // is, so somebody in the hold is not teleported onto the poop.
        if (near !== undefined) {
          up.set(local.x, level.y, local.z);
          group.localToWorld(up);
          if (up.y > near + 1.2) continue;
        }
        up.set(local.x, level.y, local.z);
        return group.localToWorld(up).y;
      }
      return null;
    },
    normalAt(x: number, z: number) {
      // The deck's own up, turned into the world. It is not (0, 1, 0) at
      // sea, which is the entire reason this is published rather than
      // assumed. Flat within one vessel, so x and z do not enter — but they
      // stay in the signature because a caller should not have to know that,
      // and a hull with camber or a listing one will use them.
      void x;
      void z;
      group.updateWorldMatrix(true, false);
      group.getWorldQuaternion(spin);
      return up.set(0, 1, 0).applyQuaternion(spin).normalize().clone();
    },
    ride(position: Vector3) {
      return position.applyMatrix4(delta);
    },
    update(dt: number, input: ShipInput = {}) {
      if (dt <= 0) return;

      // Capture where we were BEFORE moving. Everything about `ride` depends
      // on this being taken first and exactly once.
      group.updateWorldMatrix(true, false);
      prevInverse.copy(group.matrixWorld).invert();

      // Make way.
      const speed = input.speed ?? 0;
      if (input.turn) group.rotation.y += input.turn * dt;
      if (speed) {
        group.position.x += Math.sin(group.rotation.y) * speed * dt;
        group.position.z += Math.cos(group.rotation.y) * speed * dt;
      }

      // Ride the sea. Same four-point sample as the existing hulls, but the
      // attitude is EASED toward it rather than snapped, because a ship has
      // mass and a liner in particular takes half a minute to roll.
      if (sampler) {
        const { x, z } = group.position;
        const sin = Math.sin(group.rotation.y);
        const cos = Math.cos(group.rotation.y);
        const bow = sampler(x + sin * L * 0.4, z + cos * L * 0.4);
        const stern = sampler(x - sin * L * 0.4, z - cos * L * 0.4);
        const port = sampler(x - cos * B * 0.5, z + sin * B * 0.5);
        const starboard = sampler(x + cos * B * 0.5, z - sin * B * 0.5);

        const wantY = (bow + stern + port + starboard) / 4;
        const wantPitch = Math.atan2(stern - bow, L * 0.8) * spec.gain;
        const wantRoll = Math.atan2(port - starboard, B) * spec.gain;
        const k = Math.min(1, dt * spec.ease);
        const prevPitch = pitch;
        const prevRoll = roll;
        const prevY = group.position.y;
        pitch += (wantPitch - pitch) * k;
        roll += (wantRoll - roll) * k;
        group.position.y += (wantY - group.position.y) * k;
        group.rotation.x = pitch;
        group.rotation.z = roll;

        // How hard it is to stand up: the RATE, not the angle. A vessel
        // heeled steadily at ten degrees under sail is easy to walk on; the
        // same ten degrees arriving twice a second is not, and a number
        // taken off the angle cannot tell those two apart.
        const rate =
          (Math.abs(pitch - prevPitch) + Math.abs(roll - prevRoll)) / dt +
          Math.abs(group.position.y - prevY) / dt * 0.25;
        motion += (clamp01(rate * 1.6) - motion) * Math.min(1, dt * 3);
      }

      group.updateWorldMatrix(true, false);
      delta.multiplyMatrices(group.matrixWorld, prevInverse);
    },
  };
  return api;
}

export const SHIP_ERAS: ShipEra[] = ['galley', 'carrack', 'steamer', 'liner'];
