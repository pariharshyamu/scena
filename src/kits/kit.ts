import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { Obstacle } from '../core/types';

/**
 * The kit grid: every kit piece snaps to this cell size (in world units).
 * Shared snap dimensions are what make pieces combinable — a doorway cut
 * in one wall lines up with the corridor on the other side.
 */
export const KIT_UNIT = 2;

export interface KitOptions {
  seed?: number;
  /** Cell size override. Default KIT_UNIT. */
  unit?: number;
  /** Wall height. Default 2.6. */
  wallHeight?: number;
  /** Add real PointLights to this many torches. Default 4. */
  torchLights?: number;
  palette?: Palette;
}

export interface Kit {
  group: Group;
  /** One obstacle per wall cell — feed GAMA's ObstacleAvoidance. */
  obstacles: Obstacle[];
  /** World positions of 'S' cells (player/NPC spawn points). */
  spawns: Vector3[];
  /** World positions of 'T' cells (torches), lit in placement order. */
  torches: Vector3[];
  /** Is (x, z) over a walkable floor cell? */
  floorAt(x: number, z: number): boolean;
  /** Footprint in world units: { width, depth } centered on the origin. */
  size: { width: number; depth: number };
}

/**
 * Assemble a dungeon/compound from an ASCII map — each character is one
 * KIT_UNIT × KIT_UNIT cell, centered on the group origin:
 *
 * - `#` wall block (blocks movement, becomes an obstacle)
 * - `.` floor tile
 * - `D` doorway: floor + lintel spanning the gap overhead
 * - `T` floor + standing torch (emissive flame; `createDayCycle` adopts it)
 * - `S` floor + recorded spawn point
 * - ` ` nothing
 *
 * ```ts
 * const fort = assembleKit([
 *   '#######',
 *   '#..T..#',
 *   '#.....D',
 *   '#..S..#',
 *   '#######',
 * ], { palette });
 * fort.group.position.set(20, terrain.heightAt(20, 5), 5);
 * ```
 *
 * Walls and floors render as two InstancedMeshes regardless of map size.
 */
export function assembleKit(rows: string[], options: KitOptions = {}): Kit {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const unit = options.unit ?? KIT_UNIT;
  const wallHeight = options.wallHeight ?? 2.6;
  let torchLights = options.torchLights ?? 4;

  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length), 0);
  const originX = (-width / 2 + 0.5) * unit;
  const originZ = (-height / 2 + 0.5) * unit;
  const worldOf = (col: number, row: number): { x: number; z: number } => ({
    x: originX + col * unit,
    z: originZ + row * unit,
  });

  const group = new Group();
  group.name = 'kit';
  const obstacles: Obstacle[] = [];
  const spawns: Vector3[] = [];
  const torches: Vector3[] = [];
  const floorCells = new Set<string>();

  const wallCells: Array<{ x: number; z: number }> = [];
  const floorTiles: Array<{ x: number; z: number }> = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < (rows[row] ?? '').length; col++) {
      const cell = rows[row][col];
      if (cell === ' ' || cell === undefined) continue;
      const { x, z } = worldOf(col, row);

      if (cell === '#') {
        wallCells.push({ x, z });
        obstacles.push({ center: new Vector3(x, wallHeight / 2, z), radius: unit * 0.71 });
        continue;
      }
      // Everything else stands on a floor tile.
      floorTiles.push({ x, z });
      floorCells.add(`${col},${row}`);

      if (cell === 'D') {
        // Lintel over the opening, aligned with whichever axis the walls run.
        const horizontalRun =
          rows[row][col - 1] === '#' || rows[row][col + 1] === '#';
        const lintel = new Mesh(
          new BoxGeometry(
            horizontalRun ? unit : unit * 0.4,
            wallHeight * 0.25,
            horizontalRun ? unit * 0.4 : unit
          ),
          new MeshStandardMaterial({ color: palette.woodDark, flatShading: true })
        );
        lintel.position.set(x, wallHeight * 0.875, z);
        group.add(lintel);
      } else if (cell === 'T') {
        group.add(createTorch(x, z, palette, rng, torchLights > 0));
        torchLights--;
        torches.push(new Vector3(x, 0, z));
        obstacles.push({ center: new Vector3(x, 0, z), radius: 0.3 });
      } else if (cell === 'S') {
        spawns.push(new Vector3(x, 0, z));
      }
    }
  }

  // Two draw calls for the architecture: instanced walls + instanced floors.
  const stone = new MeshStandardMaterial({ color: rng.pick(palette.rock), flatShading: true });
  const stoneDark = new MeshStandardMaterial({ color: palette.cliff, flatShading: true });
  const matrix = new Matrix4();
  if (wallCells.length > 0) {
    const walls = new InstancedMesh(
      new BoxGeometry(unit, wallHeight, unit),
      stone,
      wallCells.length
    );
    wallCells.forEach((cell, i) => {
      walls.setMatrixAt(i, matrix.makeTranslation(cell.x, wallHeight / 2, cell.z));
    });
    walls.instanceMatrix.needsUpdate = true;
    group.add(walls);
  }
  if (floorTiles.length > 0) {
    const floors = new InstancedMesh(
      new BoxGeometry(unit, 0.2, unit),
      stoneDark,
      floorTiles.length
    );
    floorTiles.forEach((cell, i) => {
      floors.setMatrixAt(i, matrix.makeTranslation(cell.x, -0.1, cell.z));
    });
    floors.instanceMatrix.needsUpdate = true;
    group.add(floors);
  }

  return {
    group,
    obstacles,
    spawns,
    torches,
    floorAt(x, z) {
      const col = Math.round((x - originX) / unit);
      const row = Math.round((z - originZ) / unit);
      return floorCells.has(`${col},${row}`);
    },
    size: { width: width * unit, depth: height * unit },
  };
}

function createTorch(
  x: number,
  z: number,
  palette: Palette,
  rng: Rng,
  light: boolean
): Group {
  const torch = new Group();
  torch.name = 'torch';
  const pole = new Mesh(
    new CylinderGeometry(0.04, 0.06, 1.5, 5),
    new MeshStandardMaterial({ color: palette.woodDark, flatShading: true })
  );
  pole.position.y = 0.75;
  torch.add(pole);
  const flame = new Mesh(
    new SphereGeometry(0.1, 6, 5),
    new MeshStandardMaterial({
      color: palette.lampGlow,
      emissive: palette.lampGlow,
      emissiveIntensity: 1.8,
    })
  );
  flame.position.y = 1.58;
  flame.scale.y = rng.range(1.2, 1.5);
  torch.add(flame);
  if (light) {
    const point = new PointLight(palette.lampGlow, 5, 9, 1.9);
    point.position.y = 1.6;
    torch.add(point);
  }
  torch.position.set(x, 0, z);
  return torch;
}
