import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { Prop, PropSlot } from '../core/types';

/**
 * Alongside — mooring lines, fenders and the gangway.
 *
 * The decked-ship track made a vessel a **frame**: `ride` carries whatever
 * is standing on her, and a sailor who never takes a step still travels at
 * six knots. This is what happens when that frame meets one that does not
 * move, and there are exactly two ideas in it.
 *
 * **A rope is a one-way constraint.** It can pull and it can never push. A
 * fender is the same thing backwards: it pushes and can never pull. Neither
 * one alone holds a ship — a line by itself lets her grind along the wall, a
 * fender by itself lets her drift away — and neither is a spring, because a
 * spring would haul her *back* when she came in and shove her *out* when she
 * went away, which is not what either object does. She is held in the gap
 * between two constraints that each only act in one direction, and the whole
 * reason a ship alongside is never quite still is that inside that gap
 * nothing is acting on her at all.
 *
 * ```ts
 * const berth = createBerth({ era: 'harbour' });
 * const lines = moor(ship, berth);
 * game.onUpdate((t) => ship.update(t.delta, lines.hold(t.delta)));
 * ```
 *
 * **A gangway is where two frames blend.** It is walkable ground with a
 * `DeckField` on it exactly like a deck — but somebody halfway up it is
 * carried half as much by the ship as somebody standing on her deck, and
 * not at all at the shore end. Get that wrong in either direction and they
 * are either dragged off the quay or left behind by the ship.
 *
 * ```ts
 * const brow = createGangway({ berth, ship });
 * legs.update(t.delta, aboard ? ship : onBrow ? brow : berth);
 * ```
 *
 * All three — quay, gangway, deck — publish the same three functions, and
 * only one of them moves. Fixed ground is a moving frame whose delta is the
 * identity, which is why walking ashore needs no special case anywhere.
 */

/** Anything that can carry what is standing on it — SCENA's `DeckField`. */
export interface Carrier {
  deckAt(x: number, z: number, near?: number): number | null;
  normalAt(x: number, z: number): Vector3;
  ride(position: Vector3): Vector3;
}

export type BerthEra =
  /** Timber piles and a plank deck — a river wharf. */
  | 'wharf'
  /** Dressed stone with iron rings — a harbour wall. */
  | 'harbour'
  /** Concrete, steel bollards and rubber fenders — a container quay. */
  | 'quay';

export const BERTH_ERAS: BerthEra[] = ['wharf', 'harbour', 'quay'];

/** Something to make fast to. */
export interface Bollard {
  anchor: Object3D;
  kind: 'ring' | 'bollard' | 'bitt';
  /** Distance along the quay from its centre, metres. */
  along: number;
}

export interface Berth extends Prop, Carrier {
  era: BerthEra;
  /** Along the quay face, metres. */
  length: number;
  /** Coping height above the water. */
  height: number;
  bollards: Bollard[];
  /** Fenders hung on the face — where the hull is allowed to touch. */
  fenders: Object3D[];
  /**
   * How far clear of the quay face a world point is.
   *
   * Positive is out in the harbour, negative is inside the wall. Everything
   * a fender does is a reaction to this going negative.
   */
  clearance(x: number, z: number): number;
  /** Outward normal of the face, in world space. */
  faceNormal(out?: Vector3): Vector3;
  /** Where a gangway would land on the shore side. */
  brow: PropSlot;
  slots: PropSlot[];
}

export interface BerthOptions {
  era?: BerthEra;
  /** Along the face. Default 34. */
  length?: number;
  /** Coping above the water. Default per era. */
  height?: number;
  /** How many bollards. Default 4. */
  bollards?: number;
  seed?: number;
  palette?: Palette;
}

interface BerthSpec {
  height: number;
  /** How far the fenders stand off the face. */
  fender: number;
  bollard: Bollard['kind'];
  deep: number;
}

const BERTHS: Record<BerthEra, BerthSpec> = {
  // `deep` is how far the thing reaches back from the water, and it is not a
  // detail. A quay is the EDGE OF THE LAND: give it seven metres and it
  // floats in the middle of the harbour with open water behind it, which
  // reads as a pier and makes the whole scene a raft. Every test about
  // clearance and mooring passed at seven.
  wharf: { height: 1.4, fender: 0.45, bollard: 'bitt', deep: 14 },
  harbour: { height: 2.6, fender: 0.75, bollard: 'ring', deep: 26 },
  quay: { height: 3.4, fender: 1.15, bollard: 'bollard', deep: 38 },
};

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const UP = new Vector3(0, 1, 0);

/**
 * A wall to lie alongside.
 *
 * The face is the quay's local **+x** plane at `x = 0`, running along z, and
 * the harbour is out toward +x. Everything about clearance is measured from
 * that plane in world space, so the berth can be placed and turned like any
 * other prop.
 */
export function createBerth(options: BerthOptions = {}): Berth {
  const era = options.era ?? 'harbour';
  const spec = BERTHS[era];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const length = options.length ?? 34;
  const height = options.height ?? spec.height;
  const count = Math.max(2, options.bollards ?? 4);

  const group = new Group();
  group.name = `berth-${era}`;

  const stone =
    era === 'quay'
      ? createSurface('concrete', { seed, color: 0x9a9c99 })
      : era === 'harbour'
        ? createSurface('ashlar', { seed, color: palette.cliff })
        : createSurface('plank', { seed, color: palette.woodDark });
  const iron = createSurface('steel', { seed: seed + 1, color: 0x4a4f55, metalness: 0.5, roughness: 0.5 });

  // ---- the wall --------------------------------------------------------
  // It goes DOWN into the water, not just up from it. A quay whose face
  // stops at the waterline is a shelf, and a hull moored against a shelf
  // has daylight under the one surface it is supposed to be leaning on.
  const wall = new Mesh(new BoxGeometry(spec.deep, height + 8, length), stone);
  wall.position.set(-spec.deep / 2, height / 2 - 4, 0);
  group.add(wall);
  // …and it runs off the ends too, or the berth is an island with a ship
  // tied to it. Cheap: the same block, wider than the quay is long.
  const shore = new Mesh(
    new BoxGeometry(spec.deep * 0.8, height + 8, length * 2.4),
    stone
  );
  shore.position.set(-spec.deep * 0.62, height / 2 - 4.2, 0);
  group.add(shore);

  if (era === 'wharf') {
    // Timber piles, because a wharf is a deck on legs and reads as one.
    for (let i = 0; i < Math.round(length / 3.2); i++) {
      const pile = new Mesh(
        new CylinderGeometry(0.16, 0.19, height + 3.4, 6),
        createSurface('wood', { seed: seed + i, color: palette.woodDark })
      );
      pile.position.set(-0.28, height / 2 - 1.7, -length / 2 + 1.6 + i * 3.2);
      group.add(pile);
    }
  }

  // ---- bollards --------------------------------------------------------
  const bollards: Bollard[] = [];
  for (let i = 0; i < count; i++) {
    const along = count === 1 ? 0 : -length / 2 + 2 + (i * (length - 4)) / (count - 1);
    const post = new Group();
    post.position.set(-1.35, height, along);
    if (spec.bollard === 'ring') {
      const ring = new Mesh(new CylinderGeometry(0.3, 0.3, 0.11, 10), iron);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.34, 0);
      post.add(ring);
      const plate = new Mesh(new BoxGeometry(0.22, 0.42, 0.22), iron);
      plate.position.set(0, 0.21, 0);
      post.add(plate);
    } else if (spec.bollard === 'bitt') {
      for (const s of [-0.22, 0.22]) {
        const bitt = new Mesh(new CylinderGeometry(0.11, 0.13, 0.62, 7), iron);
        bitt.position.set(0, 0.31, s);
        post.add(bitt);
      }
    } else {
      const body = new Mesh(new CylinderGeometry(0.28, 0.36, 0.78, 10), iron);
      body.position.y = 0.39;
      post.add(body);
      const cap = new Mesh(new CylinderGeometry(0.4, 0.3, 0.16, 10), iron);
      cap.position.y = 0.82;
      post.add(cap);
    }
    group.add(post);
    bollards.push({ anchor: post, kind: spec.bollard, along });
  }

  // ---- fenders ---------------------------------------------------------
  // Hung ON the face, standing proud of it. They are the only thing a hull
  // is ever allowed to touch, and their standoff IS the gap she lives in.
  const fenders: Object3D[] = [];
  const rubber = new MeshStandardMaterial({ color: 0x23262a, roughness: 0.95, flatShading: true });
  const fenderCount = Math.max(2, Math.round(length / 5));
  for (let i = 0; i < fenderCount; i++) {
    const at = -length / 2 + 3 + (i * (length - 6)) / Math.max(1, fenderCount - 1);
    const f = new Group();
    f.position.set(0, height - 0.9 - rng.range(0, 0.3), at);
    // The OUTER face of a fender is the plane `clearance` measures from —
    // its centre is half a diameter inboard of that. Hung by their centres
    // instead, every fender stood proud of the line the hull is stopped at
    // and she lay through the middle of them: a ship resting on fenders
    // that are inside her own plating, and not one number said so.
    const radius = spec.fender * 0.5;
    if (era === 'wharf') {
      // A bundle of old rope, which is what a wharf actually used.
      for (let r = 0; r < 3; r++) {
        const coil = new Mesh(
          new CylinderGeometry(radius, radius, 0.22, 8),
          createSurface('canvas', { seed: seed + r, color: 0x9c8c68 })
        );
        coil.rotation.z = Math.PI / 2;
        coil.position.set(radius, r * 0.26 - 0.26, 0);
        f.add(coil);
      }
    } else {
      const drum = new Mesh(
        new CylinderGeometry(radius, radius, era === 'quay' ? 1.6 : 1.1, 10),
        rubber
      );
      drum.rotation.x = Math.PI / 2;
      drum.position.x = radius;
      f.add(drum);
    }
    group.add(f);
    fenders.push(f);
  }

  // ---- the coping, which is somewhere to stand -------------------------
  const brow = new Object3D();
  brow.position.set(-1.9, height, 0);
  group.add(brow);

  const here = new Vector3();
  const normal = new Vector3();
  const local = new Vector3();
  const spin = new Quaternion();

  /** Signed distance out from the face plane, in world units. */
  const clearance = (x: number, z: number): number => {
    group.updateWorldMatrix(true, false);
    local.set(x, 0, z);
    group.worldToLocal(local);
    // The face is the plane x = fender standoff: a hull is "touching" when
    // it reaches the fenders, not when it reaches the masonry.
    return local.x - spec.fender;
  };

  const api: Berth = {
    object: group,
    obstacleRadius: 0,
    era,
    length,
    height,
    bollards,
    fenders,
    clearance,
    faceNormal(out = new Vector3()) {
      group.updateWorldMatrix(true, false);
      return out.set(1, 0, 0).applyQuaternion(group.getWorldQuaternion(spin)).normalize();
    },
    brow: { kind: 'brow', anchor: brow, pose: 'run', approach: brow },
    slots: [{ kind: 'brow', anchor: brow, pose: 'run', approach: brow }],

    // ---- Carrier: fixed ground ----------------------------------------
    deckAt(x: number, z: number) {
      group.updateWorldMatrix(true, false);
      local.set(x, 0, z);
      group.worldToLocal(local);
      if (local.x > 0 || local.x < -spec.deep) return null;
      if (Math.abs(local.z) > length / 2) return null;
      here.set(local.x, height, local.z);
      return group.localToWorld(here).y;
    },
    normalAt() {
      group.updateWorldMatrix(true, false);
      return normal.set(0, 1, 0).applyQuaternion(group.getWorldQuaternion(spin)).normalize().clone();
    },
    /**
     * Fixed ground is a moving frame whose delta is the identity.
     *
     * Not a stub — it is the reason walking ashore needs no special case.
     * A controller that rides whatever it is standing on can be handed a
     * quay, a gangway or a deck and never has to ask which it got.
     */
    ride(position: Vector3) {
      return position;
    },
  };
  return api;
}

// =====================================================================
//  Mooring
// =====================================================================

export interface MooringLine {
  /** Where it leaves the ship. */
  from: Object3D;
  /** What it is made fast to. */
  to: Object3D;
  /**
   * How much line is out, metres.
   *
   * Shorter than the gap and she is hauled in; longer and it does nothing
   * whatever. There is no setting at which it pushes.
   */
  scope: number;
  /** 0 while there is slack, rising as it comes bar-taut. */
  readonly tension: number;
  readonly taut: boolean;
  /** Pay out or heave in to a given scope. */
  set(scope: number): void;
  /** Take in this much — `heave(0.5)` shortens by half a metre. */
  heave(by?: number): void;
  /** Let it go. */
  cast(): void;
  /** Take a turn again. */
  makeFast(): void;
  readonly fast: boolean;
}

export interface Mooring {
  /** The ropes themselves. Parent this to your scene, not to the ship. */
  object: Object3D;
  lines: MooringLine[];
  /** Alongside and held — every fast line taut or nearly so, and touching. */
  readonly alongside: boolean;
  /**
   * How much she is working, 0 (dead still) to 1 (ranging about).
   *
   * This is the number the gangway and the crew care about, and it is a
   * SPEED, not a distance — a ship two metres off the wall and steady is a
   * fine place to work, and one an inch off it and surging is not.
   */
  readonly surge: number;
  /** Distance from the hull's inboard side to the fenders, metres. */
  readonly gap: number;
  /** Make another line fast. */
  add(from: Object3D, to: Object3D, scope?: number): MooringLine;
  /** Let go — everything, or one line. */
  cast(line?: MooringLine): void;
  /**
   * Work out what the lines are doing to her, and give it back as helm.
   *
   * Returns a `ShipInput` to hand straight to `ship.update` — merged with
   * anything you were already asking for. It goes through `update` rather
   * than writing her position afterwards because `ride` depends on the
   * frame delta covering every bit of a frame's movement.
   */
  hold(dt: number, input?: { speed?: number; turn?: number }): {
    speed?: number;
    turn?: number;
    drift: { x: number; z: number };
  };
  /** Redraw the ropes. `hold` does this too; this is for when you don't. */
  update(dt: number): void;
}

/** The vessel a mooring can hold: structurally a `DeckedShip`. */
export interface Moorable {
  object: Object3D;
  length: number;
  beam: number;
  /**
   * Height of her rail above the waterline, if she knows it.
   *
   * Lines are led from the DECK, over the bulwark, and down to the bollard.
   * Led from the waterline instead they run up the inside of the gap where
   * nothing can see them, and a ship apparently moored by nothing at all is
   * the sort of thing no test notices.
   */
  freeboard?: number;
}

export interface MooringOptions {
  /**
   * Where she wants to lie: distance from the fenders, metres.
   *
   * Not zero. A ship resting hard against her fenders all watch is a ship
   * with no lines on her — she is pinned there by whatever is pushing her,
   * and if nothing is, she lies off.
   */
  standoff?: number;
  /** How many lines, if none are given. Default 4 — head, stern and springs. */
  lines?: number;
  /** How hard the lines pull, per metre of stretch. Default 0.9. */
  stiffness?: number;
  /** How much the water damps her. Default 1.4. */
  damping?: number;
  seed?: number;
  palette?: Palette;
}

/**
 * Make a vessel fast to a berth.
 *
 * Lines are run from fairleads at her bow and stern to the nearest bollards,
 * plus springs crossed the other way — which is what actually stops a ship
 * ranging fore and aft, and the reason four lines is the smallest number
 * that holds anything.
 */
export function moor(ship: Moorable, berth: Berth, options: MooringOptions = {}): Mooring {
  const standoff = options.standoff ?? 0.5;
  const stiffness = options.stiffness ?? 0.9;
  const damping = options.damping ?? 1.4;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const seed = options.seed ?? 1;
  const wanted = options.lines ?? 4;

  const group = new Group();
  group.name = 'mooring';
  const ropeMat = createSurface('canvas', { seed, color: palette.sand });

  const lines: MooringLine[] = [];
  const ropes = new Map<MooringLine, Mesh>();

  const a = new Vector3();
  const b = new Vector3();
  const dir = new Vector3();
  const mid = new Vector3();
  const pull = new Vector3();
  const arm = new Vector3();
  const last = new Vector3();
  const velocity = new Vector3();
  const face = new Vector3();
  /**
   * What the lines and fenders are doing to her, as an acceleration, and the
   * velocity it integrates into.
   *
   * It has to be integrated rather than applied straight. The first cut set
   * the drift velocity directly from the stretch and then subtracted a
   * fraction of the MEASURED velocity as damping — but the measured velocity
   * is last frame's drift, so the whole thing collapsed to
   * `v(n) = stretch − d·v(n−1)`, which for any `d` over one is a recurrence
   * that alternates sign and doubles. She was at 1e54 metres inside a
   * second, and every test that only looked at forces still passed.
   */
  const accel = new Vector3();
  const held = new Vector3();
  let yaw = 0;
  let surge = 0;
  let gap = 0;
  let started = false;

  const makeLine = (from: Object3D, to: Object3D, scope?: number): MooringLine => {
    from.updateWorldMatrix(true, false);
    to.updateWorldMatrix(true, false);
    const span = from.getWorldPosition(a).distanceTo(to.getWorldPosition(b));
    let out = scope ?? span;
    let tension = 0;
    let fast = true;
    const line: MooringLine = {
      from,
      to,
      get scope() {
        return out;
      },
      set scope(v: number) {
        out = Math.max(0.2, v);
      },
      get tension() {
        return tension;
      },
      get taut() {
        return tension > 0.02;
      },
      get fast() {
        return fast;
      },
      set(v: number) {
        out = Math.max(0.2, v);
      },
      heave(by = 0.5) {
        out = Math.max(0.2, out - by);
      },
      cast() {
        fast = false;
        tension = 0;
      },
      makeFast() {
        fast = true;
      },
    };
    // A private setter the solver uses; kept off the public shape.
    (line as unknown as { __set(t: number): void }).__set = (t: number) => {
      tension = fast ? t : 0;
    };
    const rope = new Mesh(new CylinderGeometry(0.05, 0.05, 1, 6), ropeMat);
    group.add(rope);
    ropes.set(line, rope);
    lines.push(line);
    return line;
  };

  /** Draw a rope between its two ends, sagging when there is slack in it. */
  const drawRope = (line: MooringLine): void => {
    const rope = ropes.get(line);
    if (!rope) return;
    rope.visible = line.fast;
    if (!line.fast) return;
    line.from.updateWorldMatrix(true, false);
    line.to.updateWorldMatrix(true, false);
    line.from.getWorldPosition(a);
    line.to.getWorldPosition(b);
    dir.subVectors(b, a);
    const span = dir.length();
    if (span < 1e-4) return;
    mid.addVectors(a, b).multiplyScalar(0.5);
    // Slack goes somewhere: a rope with a metre spare hangs in a bight, and
    // a rope drawn straight when it is slack is a steel bar.
    const slack = Math.max(0, line.scope - span);
    mid.y -= Math.min(1.4, slack * 0.45);
    rope.position.copy(mid);
    rope.scale.y = a.distanceTo(mid) + mid.distanceTo(b);
    rope.quaternion.setFromUnitVectors(UP, dir.normalize());
  };

  // ---- default set of lines -------------------------------------------
  if (wanted > 0) {
    ship.object.updateWorldMatrix(true, false);
    const fairleads: Object3D[] = [];
    // Bow and stern, on the inboard side. Fore-and-aft position is what
    // makes a line a head rope or a spring.
    const railY = (ship.freeboard ?? 1.6) + 0.35;
    for (const z of [ship.length * 0.42, -ship.length * 0.42]) {
      const lead = new Object3D();
      lead.position.set(-ship.beam * 0.45, railY, z);
      ship.object.add(lead);
      fairleads.push(lead);
    }
    const sorted = [...berth.bollards].sort((p, q) => p.along - q.along);
    const nearest = (lead: Object3D): Object3D => {
      lead.updateWorldMatrix(true, false);
      lead.getWorldPosition(a);
      let best = sorted[0].anchor;
      let bestD = Infinity;
      for (const bol of sorted) {
        bol.anchor.updateWorldMatrix(true, false);
        const d = bol.anchor.getWorldPosition(b).distanceTo(a);
        if (d < bestD) {
          bestD = d;
          best = bol.anchor;
        }
      }
      return best;
    };
    const furthest = (lead: Object3D): Object3D => {
      lead.updateWorldMatrix(true, false);
      lead.getWorldPosition(a);
      let best = sorted[0].anchor;
      let bestD = -1;
      for (const bol of sorted) {
        bol.anchor.updateWorldMatrix(true, false);
        const d = bol.anchor.getWorldPosition(b).distanceTo(a);
        if (d > bestD) {
          bestD = d;
          best = bol.anchor;
        }
      }
      return best;
    };
    // Head and stern ropes.
    makeLine(fairleads[0], nearest(fairleads[0]));
    if (wanted > 1) makeLine(fairleads[1], nearest(fairleads[1]));
    // …and SPRINGS, led the other way along the quay. Without them she is
    // held off the wall and free to range fore and aft the whole length of
    // her lines, which is the failure everybody has watched happen and
    // nobody models.
    if (wanted > 2) makeLine(fairleads[0], furthest(fairleads[0]));
    if (wanted > 3) makeLine(fairleads[1], furthest(fairleads[1]));

    // Then heave them in until she lies where she is wanted. Made up to
    // exactly the distance she happens to be at, four lines hold a ship
    // wherever she was left — including out in the fairway. Warping her
    // alongside IS shortening the scope, so that is what this does.
    ship.object.updateWorldMatrix(true, false);
    a.set(-ship.beam * 0.5, 0, 0);
    ship.object.localToWorld(a);
    const haul = berth.clearance(a.x, a.z) - standoff;
    if (haul > 0) {
      berth.faceNormal(face);
      for (const line of lines) {
        line.from.updateWorldMatrix(true, false);
        line.to.updateWorldMatrix(true, false);
        pull.subVectors(line.to.getWorldPosition(b), line.from.getWorldPosition(a));
        if (pull.lengthSq() < 1e-8) continue;
        // Only the part of each line that actually pulls her TOWARD the
        // wall. Take the whole haul out of every rope and the springs —
        // which lie almost along the quay and barely move her sideways at
        // all — come up hard and drag her onto her own fenders. She lay
        // there pinned, with tension in every line, looking exactly like a
        // ship properly moored.
        const across = Math.abs(pull.normalize().dot(face));
        line.set(Math.max(0.4, line.scope - haul * across));
      }
    }
  }

  /** Where the hull's inboard side is, at bow, midships and stern. */
  const touchPoints = (out: Vector3[]): Vector3[] => {
    ship.object.updateWorldMatrix(true, false);
    const zs = [ship.length * 0.35, 0, -ship.length * 0.35];
    for (let i = 0; i < 3; i++) {
      out[i] = out[i] ?? new Vector3();
      out[i].set(-ship.beam * 0.5, 0, zs[i]);
      ship.object.localToWorld(out[i]);
    }
    return out;
  };
  const touches: Vector3[] = [];

  const api: Mooring = {
    object: group,
    lines,
    get alongside() {
      // NOT "some line is taut". A ship properly moored and left alone has
      // slack in every rope and is touching nothing — that is what lying in
      // the gap between two one-way constraints looks like. Alongside is
      // about being close and being STILL.
      if (!lines.some((l) => l.fast)) return false;
      return gap < 2.5 && surge < 0.25;
    },
    get surge() {
      return surge;
    },
    get gap() {
      return gap;
    },
    add(from: Object3D, to: Object3D, scope?: number) {
      return makeLine(from, to, scope);
    },
    cast(line?: MooringLine) {
      if (line) line.cast();
      else for (const l of lines) l.cast();
    },

    hold(dt: number, input = {}) {
      if (dt <= 0) return { ...input, drift: { x: 0, z: 0 } };
      accel.set(0, 0, 0);
      let torque = 0;

      ship.object.updateWorldMatrix(true, false);
      ship.object.getWorldPosition(mid);
      if (!started) {
        last.copy(mid);
        started = true;
      }
      velocity.subVectors(mid, last).divideScalar(dt);
      last.copy(mid);
      surge += (clamp01(velocity.length() * 0.9) - surge) * Math.min(1, dt * 2.5);

      // ---- the ropes ---------------------------------------------------
      for (const line of lines) {
        if (!line.fast) continue;
        line.from.updateWorldMatrix(true, false);
        line.to.updateWorldMatrix(true, false);
        line.from.getWorldPosition(a);
        line.to.getWorldPosition(b);
        pull.subVectors(b, a);
        const span = pull.length();
        const over = span - line.scope;
        // ONE WAY. Slack line, no force — not a small force, none at all.
        // A spring here would haul her back in whenever she came closer
        // than her scope, and a rope has never done that.
        if (over <= 0 || span < 1e-5) {
          (line as unknown as { __set(t: number): void }).__set(0);
          continue;
        }
        (line as unknown as { __set(t: number): void }).__set(clamp01(over / Math.max(1, line.scope)));
        pull.divideScalar(span).multiplyScalar(over * stiffness);
        accel.x += pull.x;
        accel.z += pull.z;
        // …and it swings her, because it is made fast somewhere that is not
        // her centre. A bow line pulls the bow, not the ship.
        arm.subVectors(a, mid);
        torque += (arm.z * pull.x - arm.x * pull.z) * 0.006;
      }

      // ---- the fenders -------------------------------------------------
      berth.faceNormal(face);
      touchPoints(touches);
      let nearest = Infinity;
      for (const point of touches) {
        const clear = berth.clearance(point.x, point.z);
        nearest = Math.min(nearest, clear);
        // ONE WAY, the other way. A fender pushes a hull off and has never
        // once pulled one in, which is why this is `< 0` and not a spring
        // about the standoff.
        if (clear >= 0) continue;
        const push = -clear * stiffness * 5;
        accel.x += face.x * push;
        accel.z += face.z * push;
        arm.subVectors(point, mid);
        torque += (arm.z * face.x * push - arm.x * face.z * push) * 0.006;
      }
      gap = Number.isFinite(nearest) ? nearest : 0;

      // ---- and the water, which is what stops it ringing ----------------
      // Two one-way constraints with nothing between them would hammer the
      // wall for ever. A hull in water does not. Integrate, then decay by a
      // true exponential so the result does not depend on the frame rate
      // and cannot overshoot however large `damping` gets.
      const decay = Math.exp(-damping * dt);
      held.addScaledVector(accel, dt).multiplyScalar(decay);
      yaw = (yaw + torque * dt) * decay;

      for (const line of lines) drawRope(line);
      return { ...input, turn: (input.turn ?? 0) + yaw, drift: { x: held.x, z: held.z } };
    },

    update() {
      for (const line of lines) drawRope(line);
    },
  };
  return api;
}

// =====================================================================
//  Gangway
// =====================================================================

export interface Gangway extends Prop, Carrier {
  /** Slope, radians. Positive is uphill from the shore. */
  readonly angle: number;
  /** Span between its two ends, metres. */
  readonly span: number;
  /** Down and usable. False when raised, or when she has ranged too far. */
  readonly rigged: boolean;
  /** Put it over, or take it in. */
  lower(): void;
  raise(): void;
  /** Follow the ship. Call it after hers. */
  update(dt: number): void;
}

export interface GangwayOptions {
  /** The shore end. Usually `berth.brow.anchor`. */
  shore: Object3D;
  /** The moving end, and the frame it belongs to. */
  ship: Carrier & { object: Object3D };
  /** Where it lands aboard. Defaults to a point on her inboard side. */
  landing?: Object3D;
  /** Widest span it will still bridge, metres. Default 1.6× its own length. */
  reach?: number;
  width?: number;
  seed?: number;
  palette?: Palette;
}

/**
 * A plank between two frames.
 *
 * The shore end is fixed and the ship end is not, so it re-solves every
 * frame — but the part that matters is `ride`. A gangway carries somebody
 * standing on it in **proportion to how far along it they are**: not at all
 * at the shore end, entirely at the ship end. Carry them all the way and
 * they get dragged off the quay; carry them not at all and the ship leaves
 * without them halfway across.
 */
export function createGangway(options: GangwayOptions): Gangway {
  const { shore, ship } = options;
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  const width = options.width ?? 0.9;
  void palette;

  const group = new Group();
  group.name = 'gangway';

  const plankMat = createSurface('plank', { seed, color: palette.wood });
  const iron = createSurface('steel', { seed: seed + 1, color: 0x59606a, metalness: 0.5, roughness: 0.5 });

  // Unit-length along +z, so scaling z is scaling the span.
  const deck = new Mesh(new BoxGeometry(width, 0.09, 1), plankMat);
  deck.position.y = 0.045;
  group.add(deck);
  // Treads, so it reads as something you walk up rather than a ramp.
  const treads: Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const t = new Mesh(new BoxGeometry(width * 0.92, 0.035, 0.09), plankMat);
    treads.push(t);
    group.add(t);
  }
  // Handrails, which is most of why a gangway is recognisable at all.
  const rails: Mesh[] = [];
  for (const s of [-1, 1]) {
    const rail = new Mesh(new CylinderGeometry(0.035, 0.035, 1, 6), iron);
    rail.position.set((s * width) / 2, 0.95, 0);
    rail.rotation.x = Math.PI / 2;
    group.add(rail);
    rails.push(rail);
    for (let i = 0; i < 5; i++) {
      const stanchion = new Mesh(new CylinderGeometry(0.026, 0.026, 0.95, 5), iron);
      stanchion.position.set((s * width) / 2, 0.475, 0);
      group.add(stanchion);
      rails.push(stanchion);
    }
  }

  const landing = options.landing ?? null;
  let solved = false;
  const from = new Vector3();
  const to = new Vector3();
  /** Where the ship end was last time it was solved. */
  const wasAt = new Vector3();
  const shift = new Vector3();
  const axis = new Vector3();
  const flat = new Vector3();
  const probe = new Vector3();
  const normal = new Vector3();
  const spin = new Quaternion();
  let span = 1;
  let angle = 0;
  let rigged = true;
  let down = true;
  let reach = options.reach ?? 0;

  /** Both ends, in world space. */
  const ends = (): void => {
    shore.updateWorldMatrix(true, false);
    shore.getWorldPosition(from);
    if (landing) {
      landing.updateWorldMatrix(true, false);
      landing.getWorldPosition(to);
    } else {
      ship.object.updateWorldMatrix(true, false);
      ship.object.getWorldPosition(to);
      // The deck nearest the COPING, not the highest one aboard. `near` is
      // already the stacked-deck rule everywhere else in the library, and
      // without it a gangway to a liner lands on her bridge twenty metres
      // up and reads as a ladder to the sky.
      const y = ship.deckAt(to.x, to.z, from.y + 2.5);
      if (y !== null) to.y = y;
    }
  };

  const solve = (): void => {
    wasAt.copy(to);
    ends();
    axis.subVectors(to, from);
    span = axis.length();
    if (reach <= 0) reach = Math.max(3, span * 1.6);
    // Too far and it comes off the quay. A gangway that stretches to any
    // distance is a bridge, and the whole hazard of working a ship
    // alongside is that this one does not.
    rigged = down && span <= reach && span > 0.4;
    if (!solved) {
      wasAt.copy(to);
      solved = true;
    }
    if (span < 1e-4) return;
    angle = Math.asin(Math.max(-1, Math.min(1, (to.y - from.y) / span)));

    group.position.copy(from);
    group.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), axis.clone().normalize());
    deck.scale.z = span;
    deck.position.set(0, 0.045, span / 2);
    for (let i = 0; i < treads.length; i++) {
      const t = (i + 0.5) / treads.length;
      treads[i].position.set(0, 0.11, span * t);
      treads[i].visible = rigged;
    }
    let r = 0;
    for (const s of [-1, 1]) {
      const rail = rails[r++];
      rail.scale.y = span;
      rail.position.set((s * width) / 2, 0.95, span / 2);
      for (let i = 0; i < 5; i++) {
        const st = rails[r++];
        st.position.set((s * width) / 2, 0.475, span * ((i + 0.5) / 5));
      }
    }
    group.visible = rigged;
  };
  solve();

  /**
   * How far along the plank a world point is, 0 at the shore, 1 aboard —
   * or null if it is not on the plank at all.
   */
  const along = (x: number, z: number): number | null => {
    if (!rigged) return null;
    flat.set(to.x - from.x, 0, to.z - from.z);
    const flatLen = flat.length();
    if (flatLen < 1e-5) return null;
    probe.set(x - from.x, 0, z - from.z);
    const t = probe.dot(flat) / (flatLen * flatLen);
    if (t < -0.02 || t > 1.02) return null;
    // …and within its width, or you are standing beside it in the water.
    const off = Math.abs(probe.x * (-flat.z / flatLen) + probe.z * (flat.x / flatLen));
    if (off > width * 0.75) return null;
    return Math.max(0, Math.min(1, t));
  };

  const api: Gangway = {
    object: group,
    obstacleRadius: 0,
    get angle() {
      return angle;
    },
    get span() {
      return span;
    },
    get rigged() {
      return rigged;
    },
    lower() {
      down = true;
      solve();
    },
    raise() {
      down = false;
      rigged = false;
      group.visible = false;
    },
    update() {
      solve();
    },

    deckAt(x: number, z: number, near?: number) {
      const t = along(x, z);
      if (t === null) return null;
      const y = from.y + (to.y - from.y) * t + 0.11;
      // `near` is how the stacked-deck rule works everywhere else: answer
      // with what is under you, not what is over your head.
      if (near !== undefined && y > near + 1.2) return null;
      return y;
    },
    normalAt(x: number, z: number) {
      const t = along(x, z);
      if (t === null) return normal.set(0, 1, 0).clone();
      // Square to the plank, which is what makes a body lean going up it.
      //
      // Just the plank's own up vector: the group is ALREADY turned to lay
      // its +z along the span, so its local y is tilted by exactly the
      // slope. Tilting it again by `angle` on top — which is what the first
      // cut did — counts the rise twice and hands back a normal pointing
      // into the water.
      group.updateWorldMatrix(true, false);
      return normal
        .set(0, 1, 0)
        .applyQuaternion(group.getWorldQuaternion(spin))
        .normalize()
        .clone();
    },
    /**
     * Carried in proportion to how far aboard you are.
     *
     * The one idea in the whole prop. The plank's ship end moved by some
     * amount since it was last solved; a point a fraction `t` along it moved
     * by exactly `t` of that, because a straight line between a fixed point
     * and a moving one is what a gangway is. At the ship end that is the
     * deck; at the shore end it is nothing at all; in between it is neither,
     * and no amount of choosing one of the two is right.
     *
     * It is the PLANK'S end that is lerped, not the ship's `ride` of the
     * point itself. Those agree while she is only translating and part
     * company the moment she swings: `ship.ride` applied to a point out on
     * the quay rotates it about her centre from several metres outside her,
     * which throws somebody at the shore end further than the plank they
     * are standing on ever went.
     */
    ride(position: Vector3) {
      const t = along(position.x, position.z);
      if (t === null || t <= 0) return position;
      shift.subVectors(to, wasAt);
      return position.addScaledVector(shift, t);
    },
  };
  return api;
}
