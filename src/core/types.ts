import { Vector3, type Group, type Object3D } from 'three';

/**
 * A steering obstacle in world space — structurally identical to GAMA's
 * `Obstacle`, so SCENA props plug straight into `ObstacleAvoidance`
 * without either library importing the other.
 */
export interface Obstacle {
  center: Vector3;
  radius: number;
}

/** What a prop generator returns: the visual plus gameplay metadata. */
export interface Prop {
  object: Group;
  /**
   * Footprint radius for steering/placement, in the prop's local space
   * (centered at its origin). 0 means walk-through (e.g. grass).
   */
  obstacleRadius: number;
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
