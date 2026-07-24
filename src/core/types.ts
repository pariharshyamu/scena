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
