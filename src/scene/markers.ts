import { Vector3, type Object3D } from 'three';
import type { Obstacle } from '../core/types';

export interface Markers {
  /** `spawn_<name>` → world position. */
  spawns: Record<string, Vector3>;
  /** `route_<name>_<index>` → world positions ordered by index. */
  routes: Record<string, Vector3[]>;
  /** `obstacle_<name>` → steering obstacle (radius from the node's scale). */
  obstacles: Obstacle[];
  /** `keepout_<name>` → scatter keep-out circle (radius from scale). */
  keepOut: Array<{ center: { x: number; z: number }; radius: number }>;
}

/**
 * Extract gameplay markers from an object tree by naming convention — the
 * bridge between a DCC tool (Blender empties, glTF nodes) and SCENA/GAMA:
 *
 * - `spawn_player`, `spawn_boss` → named spawn points
 * - `route_patrol_0`, `route_patrol_1`, … → ordered patrol routes
 * - `obstacle_statue` → steering obstacle; radius = max(scale.x, scale.z)
 * - `keepout_plaza` → scatter keep-out circle; radius = max(scale.x, scale.z)
 *
 * Blender's duplicate suffixes (`.001`) are stripped, so `route_a_0.001`
 * still parses. Positions are world-space (the tree is updated first).
 *
 * ```ts
 * const gltf = await new GLTFLoader().loadAsync('level.glb');
 * const markers = extractMarkers(gltf.scene);
 * player.position.copy(markers.spawns.player);
 * guard.addBehavior(new FollowPath(new Path(markers.routes.patrol, true), 1.5));
 * scatter({ ..., keepOut: markers.keepOut });
 * ```
 */
export function extractMarkers(root: Object3D): Markers {
  root.updateWorldMatrix(true, true);
  const spawns: Record<string, Vector3> = {};
  const routePoints: Record<string, Array<{ index: number; position: Vector3 }>> = {};
  const obstacles: Obstacle[] = [];
  const keepOut: Array<{ center: { x: number; z: number }; radius: number }> = [];

  root.traverse((node) => {
    const name = node.name.replace(/\.\d+$/, ''); // Blender's `.001` suffixes
    const match = /^(spawn|route|obstacle|keepout)_(.+)$/.exec(name);
    if (!match) return;
    const [, kind, rest] = match;
    const position = node.getWorldPosition(new Vector3());
    const radius = Math.max(node.scale.x, node.scale.z);

    if (kind === 'spawn') {
      spawns[rest] = position;
    } else if (kind === 'route') {
      const step = /^(.*)_(\d+)$/.exec(rest);
      const routeName = step ? step[1] : rest;
      const index = step ? parseInt(step[2], 10) : 0;
      (routePoints[routeName] ??= []).push({ index, position });
    } else if (kind === 'obstacle') {
      obstacles.push({ center: position, radius });
    } else {
      keepOut.push({ center: { x: position.x, z: position.z }, radius });
    }
  });

  const routes: Record<string, Vector3[]> = {};
  for (const [name, points] of Object.entries(routePoints)) {
    routes[name] = points.sort((a, b) => a.index - b.index).map((p) => p.position);
  }
  return { spawns, routes, obstacles, keepOut };
}
