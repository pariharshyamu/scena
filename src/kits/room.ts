import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { makeFlame, animateFire } from '../props/fire';
import { KIT_UNIT } from './kit';
import type { Obstacle } from '../core/types';

export interface RoomOptions {
  seed?: number;
  /** Cell size override. Default KIT_UNIT. */
  unit?: number;
  /** Wall height. Default 3. */
  wallHeight?: number;
  /** Build a ceiling slab (with beams). Default true. */
  ceiling?: boolean;
  /** Floor finish. Default 'plank' (floorboards); 'stone' for flagstones. */
  floor?: 'plank' | 'stone';
  /** Give each hearth a real flickering PointLight. Default true. */
  hearthLight?: boolean;
  palette?: Palette;
}

/** A window opening in a room wall. */
export interface RoomWindow {
  /** Center of the opening at the interior wall face (room-local). */
  position: Vector3;
  /** Unit vector pointing from the window INTO the room. */
  normal: Vector3;
  /** Opening width / height in world units. */
  width: number;
  height: number;
  /** The daylight pane material — `createInteriorLight` brightens/dims it. */
  pane: MeshStandardMaterial;
}

/** A fireplace built into a room wall. */
export interface RoomHearth {
  /** Cell center of the hearth (room-local, y = 0). */
  position: Vector3;
  /** Unit vector pointing from the hearth INTO the room. */
  normal: Vector3;
}

/**
 * A clear run of interior wall — somewhere to hang things.
 *
 * Runs are **merged**: five wall cells in a line become one 6 m wall, not
 * five 1.2 m panels, because "hang a picture halfway along the north wall"
 * is the question anyone actually has. A window or a hearth splits a run,
 * since you cannot hang a picture over either.
 *
 * Structurally a `HangSurface`, so it goes straight into `hangOn`.
 */
export interface RoomWall {
  /**
   * Anchor at the wall face, floor level, centred on the run: **+z points
   * into the room, +x runs along the wall, +y is up**. Already parented into
   * the room group.
   */
  anchor: Object3D;
  /** Centre of the run at the interior face, room-local, y = 0. */
  position: Vector3;
  /** Unit vector pointing from the wall INTO the room. */
  normal: Vector3;
  /** Length of the clear run, in world units. */
  length: number;
  /** Wall height, in world units. */
  height: number;
}

export interface Room {
  group: Group;
  /** One obstacle per wall/window/hearth cell — feed GAMA's ObstacleAvoidance. */
  obstacles: Obstacle[];
  /** World positions of 'S' cells (player/NPC spawn points). */
  spawns: Vector3[];
  /** Window openings — `createInteriorLight` turns these into light shafts. */
  windows: RoomWindow[];
  /** Fireplaces (already burning; their light honors `hearthLight`). */
  hearths: RoomHearth[];
  /** Clear interior wall runs, longest first — feed these to `hangOn`. */
  walls: RoomWall[];
  /** Centers of '~' rug cells (a woven rug is already laid on each). */
  rugs: Vector3[];
  /** Centers of 'D' doorway cells — `furnishRoom` keeps them clear. */
  doors: Vector3[];
  /** The grid cell size this room was built on. */
  unit: number;
  /** Is (x, z) over a walkable floor cell? */
  floorAt(x: number, z: number): boolean;
  /** Footprint in world units: { width, depth } centered on the origin. */
  size: { width: number; depth: number };
  /**
   * Show/hide the whole interior (geometry AND its real lights) in one call —
   * the cheap culling switch for stepping outdoors.
   */
  setActive(active: boolean): void;
}

/** Characters that stand on a walkable floor tile. */
const FLOORISH = new Set(['.', 'D', 'T', 'S', '~']);

/** Wall-face directions, in order: -z, +z, +x, -x. Index is the `dir` id. */
const FACE_DIRS: Array<[number, number]> = [
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
];

/**
 * Assemble a furnished-ready interior from an ASCII map — the indoor
 * counterpart of `assembleKit`, sharing its grid, its cell vocabulary and its
 * `Kit`-shaped gameplay data, then adding what a room needs to feel indoors:
 * a beamed ceiling, plastered walls over floorboards, window openings that
 * know which way they face, and a burning hearth.
 *
 * - `#` wall block (blocks movement, becomes an obstacle)
 * - `.` floor tile
 * - `D` doorway: floor + lintel spanning the gap overhead
 * - `W` window: wall with an opening (sill + header), recorded in `windows`
 * - `H` hearth: wall cell replaced by a burning fireplace
 * - `T` floor + standing torch
 * - `S` floor + recorded spawn point
 * - `~` floor + woven rug
 * - ` ` nothing
 *
 * ```ts
 * const cottage = createRoom([
 *   '##H##',
 *   'W...W',
 *   '#.~.#',
 *   '#.S.#',
 *   '##D##',
 * ], { palette });
 * scene.add(cottage.group);
 * cottage.group.add(createInteriorLight(cottage).group); // daylight shafts
 * ```
 *
 * The architecture renders as a handful of InstancedMeshes regardless of map
 * size; only windows, hearths, rugs and torches add individual meshes.
 */
export function createRoom(rows: string[], options: RoomOptions = {}): Room {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const unit = options.unit ?? KIT_UNIT;
  const wallHeight = options.wallHeight ?? 3;
  const withCeiling = options.ceiling ?? true;
  const hearthLight = options.hearthLight ?? true;

  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length), 0);
  const originX = (-width / 2 + 0.5) * unit;
  const originZ = (-height / 2 + 0.5) * unit;
  const worldOf = (col: number, row: number): { x: number; z: number } => ({
    x: originX + col * unit,
    z: originZ + row * unit,
  });
  const cellAt = (col: number, row: number): string => rows[row]?.[col] ?? ' ';

  const group = new Group();
  group.name = 'room';
  const obstacles: Obstacle[] = [];
  const spawns: Vector3[] = [];
  const windows: RoomWindow[] = [];
  const hearths: RoomHearth[] = [];
  const rugs: Vector3[] = [];
  const doors: Vector3[] = [];
  const floorCells = new Set<string>();
  const lights: PointLight[] = [];

  // Shared materials — every wall/floor/ceiling cell batches on these.
  const plaster = createSurface('plaster', { color: palette.wall, seed });
  const floorMat =
    (options.floor ?? 'plank') === 'stone'
      ? createSurface('stone', { color: palette.rock[0], seed: seed + 1 })
      : createSurface('plank', { color: palette.wood, seed: seed + 1 });
  const beamWood = createSurface('wood', { color: palette.woodDark, seed: seed + 2 });
  const trimMat = new MeshStandardMaterial({ color: palette.woodDark, flatShading: true });

  // Window opening proportions (fractions of the cell / wall height).
  const sillH = Math.min(0.95, wallHeight * 0.32);
  const openH = Math.min(1.1, wallHeight - sillH - 0.6);
  const openW = unit * 0.55;

  const wallCells: Array<{ x: number; z: number }> = [];
  const wallFaces: Array<{ col: number; row: number; dir: number }> = [];
  const floorTiles: Array<{ x: number; z: number }> = [];
  const ceilingTiles: Array<{ x: number; z: number }> = [];
  const beamCells: Array<{ x: number; z: number }> = [];

  /**
   * For a wall-run cell (window/hearth), find which way the interior lies:
   * the run axis from its wall neighbors, the inward normal from whichever
   * side has floor. Returns null when the cell is not in a recognizable run.
   */
  const inwardOf = (col: number, row: number): { run: 'x' | 'z'; normal: Vector3 } => {
    const horizontal = cellAt(col - 1, row) === '#' || cellAt(col + 1, row) === '#' ||
      cellAt(col - 1, row) === 'W' || cellAt(col + 1, row) === 'W' ||
      cellAt(col - 1, row) === 'H' || cellAt(col + 1, row) === 'H';
    if (horizontal) {
      // Wall runs along x; interior is on the +z or -z side.
      const inward = FLOORISH.has(cellAt(col, row + 1)) ? 1 : -1;
      return { run: 'x', normal: new Vector3(0, 0, inward) };
    }
    const inward = FLOORISH.has(cellAt(col + 1, row)) ? 1 : -1;
    return { run: 'z', normal: new Vector3(inward, 0, 0) };
  };

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < (rows[row] ?? '').length; col++) {
      const cell = rows[row][col];
      if (cell === ' ' || cell === undefined) continue;
      const { x, z } = worldOf(col, row);
      if (cell !== ' ') ceilingTiles.push({ x, z });

      if (cell === '#') {
        wallCells.push({ x, z });
        // Any side of this block that faces open floor is an interior face,
        // and therefore somewhere a picture could go.
        for (let d = 0; d < 4; d++) {
          const [dc, dr] = FACE_DIRS[d];
          if (FLOORISH.has(cellAt(col + dc, row + dr))) wallFaces.push({ col, row, dir: d });
        }
        obstacles.push({ center: new Vector3(x, wallHeight / 2, z), radius: unit * 0.71 });
        continue;
      }

      if (cell === 'W') {
        const { run, normal } = inwardOf(col, row);
        buildWindow(group, x, z, run, unit, wallHeight, sillH, openH, openW, plaster, trimMat);
        const pane = buildPane(group, x, z, run, sillH, openH, openW, palette);
        windows.push({
          position: new Vector3(x, sillH + openH / 2, z).addScaledVector(normal, unit * 0.5 + 0.02),
          normal,
          width: openW,
          height: openH,
          pane,
        });
        obstacles.push({ center: new Vector3(x, wallHeight / 2, z), radius: unit * 0.71 });
        continue;
      }

      if (cell === 'H') {
        const { normal } = inwardOf(col, row);
        const light = buildHearth(group, rng, x, z, normal, unit, wallHeight, palette, hearthLight);
        if (light) lights.push(light);
        hearths.push({ position: new Vector3(x, 0, z), normal });
        obstacles.push({ center: new Vector3(x, wallHeight / 2, z), radius: unit * 0.8 });
        continue;
      }

      // Everything else stands on a floor tile.
      floorTiles.push({ x, z });
      floorCells.add(`${col},${row}`);
      if (row % 2 === 0) beamCells.push({ x, z });

      if (cell === 'D') {
        doors.push(new Vector3(x, 0, z));
        const horizontalRun = cellAt(col - 1, row) === '#' || cellAt(col + 1, row) === '#';
        const lintel = new Mesh(
          new BoxGeometry(
            horizontalRun ? unit : unit * 0.4,
            wallHeight * 0.22,
            horizontalRun ? unit * 0.4 : unit
          ),
          trimMat
        );
        lintel.position.set(x, wallHeight * 0.89, z);
        group.add(lintel);
      } else if (cell === 'T') {
        const torchLight = buildTorch(group, rng, x, z, palette);
        lights.push(torchLight);
        obstacles.push({ center: new Vector3(x, 0, z), radius: 0.3 });
      } else if (cell === 'S') {
        spawns.push(new Vector3(x, 0, z));
      } else if (cell === '~') {
        buildRug(group, rng, x, z, unit, palette);
        rugs.push(new Vector3(x, 0, z));
      }
    }
  }

  // The architecture: instanced walls, floors, ceiling slab and beams.
  const matrix = new Matrix4();
  const instance = (
    cells: Array<{ x: number; z: number }>,
    geometry: BoxGeometry,
    material: MeshStandardMaterial,
    y: number
  ): void => {
    if (cells.length === 0) return;
    const mesh = new InstancedMesh(geometry, material, cells.length);
    cells.forEach((cell, i) => {
      mesh.setMatrixAt(i, matrix.makeTranslation(cell.x, y, cell.z));
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  };
  instance(wallCells, new BoxGeometry(unit, wallHeight, unit), plaster, wallHeight / 2);
  instance(floorTiles, new BoxGeometry(unit, 0.2, unit), floorMat, -0.1);
  if (withCeiling) {
    instance(ceilingTiles, new BoxGeometry(unit, 0.14, unit), beamWood, wallHeight + 0.07);
    instance(beamCells, new BoxGeometry(unit, 0.12, 0.18), beamWood, wallHeight - 0.06);
  }

  // Merge the collected wall faces into runs. Grouped by direction and by
  // the coordinate that stays fixed along that direction, then split wherever
  // the cells stop being adjacent — which is what a window or a hearth does,
  // and correctly so: neither is somewhere you can hang anything.
  const walls: RoomWall[] = [];
  const byRun = new Map<string, number[]>();
  for (const face of wallFaces) {
    const alongRow = face.dir <= 1; // -z / +z faces run along x (varying col)
    const fixed = alongRow ? face.row : face.col;
    const key = `${face.dir}:${fixed}`;
    const list = byRun.get(key) ?? [];
    list.push(alongRow ? face.col : face.row);
    byRun.set(key, list);
  }
  for (const [key, cells] of byRun) {
    const [dirStr, fixedStr] = key.split(':');
    const dir = Number(dirStr);
    const fixed = Number(fixedStr);
    const alongRow = dir <= 1;
    cells.sort((a, b) => a - b);
    let start = cells[0];
    for (let i = 0; i <= cells.length; i++) {
      const contiguous = i < cells.length && cells[i] === cells[i - 1] + 1;
      if (i > 0 && contiguous) continue;
      if (i > 0) {
        const end = cells[i - 1];
        const mid = (start + end) / 2;
        const col = alongRow ? mid : fixed;
        const row = alongRow ? fixed : mid;
        const { x, z } = { x: originX + col * unit, z: originZ + row * unit };
        const normal = new Vector3(FACE_DIRS[dir][0], 0, FACE_DIRS[dir][1]);
        const position = new Vector3(x, 0, z).addScaledVector(normal, unit * 0.5);
        const anchor = new Object3D();
        anchor.name = 'wall';
        anchor.position.copy(position);
        // Turn the anchor so its +z is the inward normal; its +x then runs
        // along the wall, which is what `hangOn` walks along.
        anchor.rotation.y = Math.atan2(normal.x, normal.z);
        group.add(anchor);
        walls.push({
          anchor,
          position,
          normal,
          length: (end - start + 1) * unit,
          height: wallHeight,
        });
      }
      start = cells[i];
    }
  }
  walls.sort((a, b) => b.length - a.length);

  return {
    group,
    obstacles,
    spawns,
    windows,
    hearths,
    walls,
    rugs,
    doors,
    unit,
    floorAt(x, z) {
      const col = Math.round((x - originX) / unit);
      const row = Math.round((z - originZ) / unit);
      return floorCells.has(`${col},${row}`);
    },
    size: { width: width * unit, depth: height * unit },
    setActive(active) {
      group.visible = active;
      for (const light of lights) light.visible = active;
    },
  };
}

/** Sill, header and jambs filling a wall cell around an open window hole. */
function buildWindow(
  group: Group,
  x: number,
  z: number,
  run: 'x' | 'z',
  unit: number,
  wallHeight: number,
  sillH: number,
  openH: number,
  openW: number,
  plaster: MeshStandardMaterial,
  trim: MeshStandardMaterial
): void {
  const jambW = (unit - openW) / 2;
  const along = (w: number, h: number): BoxGeometry =>
    run === 'x' ? new BoxGeometry(w, h, unit) : new BoxGeometry(unit, h, w);
  const place = (mesh: Mesh, offset: number, y: number): void => {
    mesh.position.set(run === 'x' ? x + offset : x, y, run === 'x' ? z : z + offset);
    group.add(mesh);
  };
  place(new Mesh(along(unit, sillH), plaster), 0, sillH / 2);
  const headH = wallHeight - sillH - openH;
  place(new Mesh(along(unit, headH), plaster), 0, wallHeight - headH / 2);
  place(new Mesh(along(jambW, openH), plaster), -(openW + jambW) / 2, sillH + openH / 2);
  place(new Mesh(along(jambW, openH), plaster), (openW + jambW) / 2, sillH + openH / 2);
  // A protruding sill board on both faces.
  const board = new Mesh(
    run === 'x' ? new BoxGeometry(openW + 0.2, 0.07, unit + 0.2) : new BoxGeometry(unit + 0.2, 0.07, openW + 0.2),
    trim
  );
  board.position.set(x, sillH + 0.035, z);
  group.add(board);
}

/** The glowing daylight pane filling a window opening. */
function buildPane(
  group: Group,
  x: number,
  z: number,
  run: 'x' | 'z',
  sillH: number,
  openH: number,
  openW: number,
  palette: Palette
): MeshStandardMaterial {
  const pane = new MeshStandardMaterial({
    color: palette.skyBottom,
    emissive: palette.skyBottom,
    emissiveIntensity: 1.1,
  });
  const geometry =
    run === 'x' ? new BoxGeometry(openW, openH, 0.06) : new BoxGeometry(0.06, openH, openW);
  const mesh = new Mesh(geometry, pane);
  mesh.name = 'windowPane';
  mesh.position.set(x, sillH + openH / 2, z);
  group.add(mesh);
  return pane;
}

/** A burning stone fireplace filling a wall cell, breast proud of the wall. */
function buildHearth(
  group: Group,
  rng: Rng,
  x: number,
  z: number,
  normal: Vector3,
  unit: number,
  wallHeight: number,
  palette: Palette,
  withLight: boolean
): PointLight | null {
  const hearth = new Group();
  hearth.name = 'hearth';
  const stone = createSurface('stone', { color: palette.rock[1] ?? palette.rock[0], seed: rng.int(1, 1e9) });

  // Chimney breast: the wall cell, slightly wider and proud of the wall face.
  const proud = 0.3;
  const breast = new Mesh(
    normal.z !== 0
      ? new BoxGeometry(unit * 1.12, wallHeight, unit + proud)
      : new BoxGeometry(unit + proud, wallHeight, unit * 1.12),
    stone
  );
  breast.position.set(0, wallHeight / 2, 0).addScaledVector(normal, proud / 2);
  hearth.add(breast);

  // Fire opening on the interior face of the breast: a sooty back panel with
  // stone cheeks and lintel framing it, so the fire itself stays visible.
  const fw = unit * 0.55;
  const fh = 0.85;
  const faceD = unit / 2 + proud; // interior face of the breast
  const face = normal.clone().multiplyScalar(faceD);
  const soot = new MeshStandardMaterial({ color: 0x120c08, flatShading: true });
  const back = new Mesh(
    normal.z !== 0 ? new BoxGeometry(fw + 0.3, fh + 0.2, 0.07) : new BoxGeometry(0.07, fh + 0.2, fw + 0.3),
    soot
  );
  back.position.set(face.x, (fh + 0.2) / 2, face.z).addScaledVector(normal, 0.045);
  hearth.add(back);
  for (const side of [-1, 1]) {
    const cheek = new Mesh(
      normal.z !== 0 ? new BoxGeometry(0.2, fh + 0.2, 0.34) : new BoxGeometry(0.34, fh + 0.2, 0.2),
      stone
    );
    const offset = (fw + 0.3 + 0.2) / 2;
    cheek.position
      .set(face.x, (fh + 0.2) / 2, face.z)
      .addScaledVector(normal, 0.14)
      .add(normal.z !== 0 ? new Vector3(side * offset, 0, 0) : new Vector3(0, 0, side * offset));
    hearth.add(cheek);
  }
  const lintelStone = new Mesh(
    normal.z !== 0 ? new BoxGeometry(fw + 0.7, 0.18, 0.34) : new BoxGeometry(0.34, 0.18, fw + 0.7),
    stone
  );
  lintelStone.position.set(face.x, fh + 0.29, face.z).addScaledVector(normal, 0.14);
  hearth.add(lintelStone);

  // Mantel shelf above, hearthstone slab below.
  const mantel = new Mesh(
    normal.z !== 0 ? new BoxGeometry(fw + 0.9, 0.1, 0.4) : new BoxGeometry(0.4, 0.1, fw + 0.9),
    new MeshStandardMaterial({ color: palette.woodDark, flatShading: true })
  );
  mantel.position.set(face.x, fh + 0.44, face.z).addScaledVector(normal, 0.16);
  hearth.add(mantel);
  const slab = new Mesh(
    normal.z !== 0 ? new BoxGeometry(fw + 0.5, 0.06, 0.7) : new BoxGeometry(0.7, 0.06, fw + 0.5),
    stone
  );
  slab.position.set(face.x, 0.03, face.z).addScaledVector(normal, 0.3);
  hearth.add(slab);

  // Glowing coals + a live flame standing on the hearthstone.
  const fireBase = face.clone().addScaledVector(normal, 0.22);
  const coalMat = new MeshStandardMaterial({
    color: 0x1a1008,
    emissive: 0xff5518,
    emissiveIntensity: 1.6,
    flatShading: true,
  });
  for (let i = 0; i < 5; i++) {
    const coal = new Mesh(new IcosahedronGeometry(rng.range(0.06, 0.11), 0), coalMat);
    coal.position.set(
      fireBase.x + rng.jitter(0, normal.z !== 0 ? 0.18 : 0.08),
      0.1 + rng.range(0, 0.05),
      fireBase.z + rng.jitter(0, normal.z !== 0 ? 0.08 : 0.18)
    );
    hearth.add(coal);
  }
  const fire = makeFlame(rng, 0.8, 4, 0.15, 0.6);
  fire.group.position.set(fireBase.x, 0.12, fireBase.z);
  hearth.add(fire.group);

  let light: PointLight | null = null;
  if (withLight) {
    light = new PointLight(0xff8a3a, 6, 8, 2);
    light.position.copy(fireBase).setY(0.75).addScaledVector(normal, 0.4);
    hearth.add(light);
  }
  animateFire(fire.group.children[0] as Mesh, fire.flameU, fire.emberU, coalMat, 1.6, light, 6);

  hearth.position.set(x, 0, z);
  group.add(hearth);
  return light;
}

/** A standing torch (kit-style) with a real PointLight. */
function buildTorch(group: Group, rng: Rng, x: number, z: number, palette: Palette): PointLight {
  const torch = new Group();
  torch.name = 'torch';
  const pole = new Mesh(
    new CylinderGeometry(0.04, 0.06, 1.5, 5),
    new MeshStandardMaterial({ color: palette.woodDark, flatShading: true })
  );
  pole.position.y = 0.75;
  torch.add(pole);
  const flame = new Mesh(
    new IcosahedronGeometry(0.1, 0),
    new MeshStandardMaterial({
      color: palette.lampGlow,
      emissive: palette.lampGlow,
      emissiveIntensity: 1.8,
    })
  );
  flame.position.y = 1.58;
  flame.scale.y = rng.range(1.2, 1.5);
  torch.add(flame);
  const light = new PointLight(palette.lampGlow, 4, 8, 1.9);
  light.position.y = 1.6;
  torch.add(light);
  torch.position.set(x, 0, z);
  group.add(torch);
  return light;
}

/** A simple woven rug: bordered octagon discs laid flat on the floor. */
function buildRug(group: Group, rng: Rng, x: number, z: number, unit: number, palette: Palette): void {
  const spin = rng.range(0, Math.PI / 4);
  const border = new Mesh(
    new CylinderGeometry(unit * 0.48, unit * 0.48, 0.025, 8),
    new MeshStandardMaterial({ color: palette.roof, flatShading: true })
  );
  border.position.set(x, 0.013, z);
  border.rotation.y = spin;
  const field = new Mesh(
    new CylinderGeometry(unit * 0.36, unit * 0.36, 0.03, 8),
    new MeshStandardMaterial({ color: palette.sand, flatShading: true })
  );
  field.position.set(x, 0.017, z);
  field.rotation.y = spin;
  group.add(border, field);
}
