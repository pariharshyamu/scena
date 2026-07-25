import { Object3D, Vector3, type Group } from 'three';

/**
 * A steering obstacle in world space — structurally identical to GAMA's
 * `Obstacle`, so SCENA props plug straight into `ObstacleAvoidance`
 * without either library importing the other.
 */
export interface Obstacle {
  center: Vector3;
  radius: number;
}

/**
 * An interaction slot — where and how a character uses this prop.
 * Structurally identical to ANIMA's `InteractionSlot` (anchor at floor
 * level, +z the facing direction, pitched for lying poses), so a prop's
 * slot drops straight into `new Interaction(rig, loco).use(slot)` without
 * either library importing the other.
 */
export interface PropSlot {
  /** Free label: 'sit', 'sleep', 'driver', 'run'… */
  kind: string;
  /** The transform target for the character's root (a child of the prop). */
  anchor: Object3D;
  /** ANIMA pose name ('sit', 'sleep', 'drive', 'cycle', …) or 'run'. */
  pose: string;
  /** Optional arms loop ('strum', 'hammer', 'knead'). */
  loop?: string;
  /**
   * Where a character should *stand* before taking the slot — beside the
   * chair, not on it. Nobody materialises into a seat: they walk here, turn,
   * then lower. ANIMA's `Interaction.use(slot, { approach: true })` reads it
   * to stage the sit; steering agents path to it rather than to the anchor.
   */
  approach?: Object3D;
}

/** How a character holds a carryable — structurally ANIMA's `CarryStyle`. */
export type CarryStyle = 'crate' | 'tray' | 'shoulder' | 'side';

/**
 * A prop a character can pick up and carry. Structurally identical to ANIMA's
 * `Holdable`, so a SCENA crate drops into `new Carry(rig, loco).pickUp(crate)`
 * with no cross-imports. The object's origin stays at its base (natural for
 * ground placement); `grip` offsets the *hold point* — where it rides in the
 * hands — from that origin.
 */
export interface Carryable extends Prop {
  /** The carry pose the holder adopts. */
  carry: CarryStyle;
  /** Hold-point offset from the object's origin (metres). */
  grip?: { x?: number; y?: number; z?: number };
}

/**
 * A flat surface on a prop that things can be put down on: a tabletop, a
 * shelf board, the lid of a chest, a windowsill.
 *
 * The anchor sits **on** the surface with +y up, +x along its width and +z
 * along its depth, so `dress` only has to think in two dimensions and the
 * height of whatever it places.
 */
export interface PropSurface {
  /** Free label: 'top', 'shelf', 'sill'. */
  kind: string;
  /** Anchor at surface level, a child of the prop. */
  anchor: Object3D;
  /** Usable extent along the anchor's local x and z, in metres. */
  width: number;
  depth: number;
}

/**
 * A body of water something can be in, in **world** coordinates.
 *
 * The swimming handshake, and it mirrors `terrain.heightAt` and
 * `ocean.heightAt`: the prop answers questions about the water and ANIMA
 * decides what a body does about it. `depthAt` returns 0 anywhere outside,
 * so "am I in the water" needs no separate `contains`.
 *
 * The interesting number is the **depth**, not the surface. Whether a
 * character wades or swims is a decision made against their own height, and
 * a pool with one depth everywhere cannot pose that question at all.
 */
export interface WaterBody {
  /** World Y of the still surface. */
  readonly surfaceY: number;
  /** Water depth at a world point, in metres. 0 anywhere outside. */
  depthAt(x: number, z: number): number;
  /** Ripple it at a world point — a stroke, a dive, a hand going in. */
  disturb(x: number, z: number, strength?: number): void;
}

/** What a prop generator returns: the visual plus gameplay metadata. */
export interface Prop {
  object: Group;
  /**
   * Footprint radius for steering/placement, in the prop's local space
   * (centered at its origin). 0 means walk-through (e.g. grass).
   */
  obstacleRadius: number;
  /** Interaction slots, on props a character can use. */
  slots?: PropSlot[];
  /** Flat surfaces things can be set down on — feed these to `dress`. */
  surfaces?: PropSurface[];
  /**
   * Which way up this comes to rest when it is set down on something.
   *
   * Props are authored in the orientation they are *used* in, which for a
   * phone is upright in a hand — put one down as authored and it stands on
   * its short edge like a domino. `dress` works this out for itself from the
   * shape (a slab lies down, a candle does not); set this only to override.
   */
  rest?: 'upright' | 'flat';
}

/** Build a surface: an anchor parented into the prop at (x, y, z). */
export function createPropSurface(
  kind: string,
  parent: Group,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  rotY = 0
): PropSurface {
  const anchor = new Object3D();
  anchor.name = `surface:${kind}`;
  anchor.position.set(x, y, z);
  anchor.rotation.y = rotY;
  parent.add(anchor);
  return { kind, anchor, width, depth };
}

/**
 * A prop several characters use *together* — a dining table, a bench, a
 * game board. Beyond the seats it publishes a **focus**: the thing the
 * occupants attend to. Point every sitter's gaze at it and a row of bodies
 * becomes a group; without it they are strangers who happen to be adjacent.
 */
export interface Gathering extends Prop {
  /** The places, in a stable order — index 0 is the head of the table. */
  seats: PropSlot[];
  /** What the occupants look at: table centre, game board, campfire. */
  focus: Object3D;
}

/** Build a slot: an anchor Object3D parented into the prop at (x, y, z). */
export function createSlot(
  kind: string,
  pose: string,
  parent: Group,
  x: number,
  y: number,
  z: number,
  rotY = 0,
  rotX = 0
): PropSlot {
  const anchor = new Object3D();
  anchor.name = `slot:${kind}`;
  anchor.position.set(x, y, z);
  anchor.rotation.set(rotX, rotY, 0);
  parent.add(anchor);
  return { kind, anchor, pose };
}

/**
 * Give a slot its standing-room-before: an approach anchor `distance` metres
 * from the seat, facing the same way. The character walks here, turns, and
 * lowers backwards into the slot — which is how sitting actually works.
 *
 * `from` picks the side the character comes at it from, and it must be the
 * side that is *open*. A dining chair is approached from behind (the table
 * is in front of it); a park bench is approached from the front (the
 * backrest is behind it). Get this backwards and characters walk through
 * the furniture to reach their seats.
 */
export function addApproach(
  slot: PropSlot,
  parent: Group,
  distance = 0.7,
  from: 'behind' | 'front' = 'behind'
): PropSlot {
  const anchor = new Object3D();
  anchor.name = `approach:${slot.kind}`;
  const rotY = slot.anchor.rotation.y;
  const sign = from === 'front' ? 1 : -1;
  anchor.position.set(
    slot.anchor.position.x + Math.sin(rotY) * distance * sign,
    slot.anchor.position.y,
    slot.anchor.position.z + Math.cos(rotY) * distance * sign
  );
  anchor.rotation.y = rotY;
  parent.add(anchor);
  slot.approach = anchor;
  return slot;
}

/** Collect world-space obstacles from placed props (call after positioning). */
export function collectObstacles(props: Iterable<Prop>): Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (const prop of props) {
    if (prop.obstacleRadius <= 0) continue;
    prop.object.updateWorldMatrix(true, false);
    obstacles.push({
      center: prop.object.getWorldPosition(new Vector3()),
      radius: prop.obstacleRadius * maxScale(prop.object),
    });
  }
  return obstacles;
}

function maxScale(object: Object3D): number {
  return Math.max(object.scale.x, object.scale.z);
}
