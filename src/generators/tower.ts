import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createGlass } from '../materials/glass';

export interface HighriseOptions {
  seed?: number;
  /** Storeys above the lobby. Default 8. */
  floors?: number;
  /** Footprint. Defaults seeded around 12 × 10. */
  width?: number;
  depth?: number;
  /** 'grid' punched windows in render, or full 'curtain' glazing. Seeded default. */
  facade?: 'grid' | 'curtain';
  /** Fraction of windows lit at night — the "who's home" mask. Default 0.55. */
  occupancy?: number;
  palette?: Palette;
}

export interface Highrise {
  /** The building, origin at ground level. */
  object: Group;
  /** Steering circle for the footprint. */
  obstacleRadius: number;
  /** Storeys above the lobby. */
  floors: number;
  /** The occupied-window glass — `nightGlow`, day-cycle adoptable. */
  litPanes: MeshStandardMaterial;
  /** How many of the tower's windows belong to the lit set. */
  litCount: number;
  /** Total windows. */
  windowCount: number;
}

/**
 * A multi-storey modern tower whose cost does NOT scale with height: every
 * repeated element — windows, spandrels, mullions, floor bands — is an
 * `InstancedMesh`, so a 30-floor tower draws the same handful of calls as a
 * 6-floor one.
 *
 * The facade is either **punched windows in render** (`'grid'`) or a full
 * **curtain wall** (`'curtain'`): glass units around all four faces, split
 * into two seeded sets — *occupied* windows use `nightGlow` glass, the rest
 * stay dark. List the tower in a `createDayCycle`'s `lamps` and the classic
 * random lit-window skyline appears at dusk for free.
 *
 * Below and above the shaft: a double-height glazed lobby with a steel
 * canopy, and a parapet roof carrying the plant room.
 */
export function createHighrise(options: HighriseOptions = {}): Highrise {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const floors = Math.max(2, options.floors ?? 8);
  const W = options.width ?? rng.range(10.5, 13.5);
  const D = options.depth ?? rng.range(8.5, 11);
  const facade = options.facade ?? (rng.next() < 0.5 ? 'grid' : 'curtain');
  const occupancy = options.occupancy ?? 0.55;
  const H = 3.0; // storey height
  const LOBBY = 4.2;

  const group = new Group();
  group.name = `tower-${facade}`;

  const render = createSurface('paint', { color: palette.wall, seed });
  const concrete = createSurface('concrete', { seed: seed + 1 });
  const fascia = new MeshStandardMaterial({ color: palette.roof, flatShading: true });
  const litGlass = createGlass({ nightGlow: true });
  const darkGlass = createGlass({ tint: 0x6a7e8c, reflect: 0.4 });

  // ---- the shaft: a solid core the windows sit proud of ----------------
  const shaftH = floors * H;
  const core = new Mesh(new BoxGeometry(W, shaftH, D), facade === 'grid' ? render : concrete);
  core.position.y = LOBBY + shaftH / 2;
  group.add(core);

  // ---- window instances around all four faces --------------------------
  const baysX = Math.max(2, Math.round(W / 1.6));
  const baysZ = Math.max(2, Math.round(D / 1.6));
  const winW = facade === 'curtain' ? 1.0 : 0.72; // fraction of the bay
  const winH = facade === 'curtain' ? H - 0.5 : 1.6;
  const sillY = facade === 'curtain' ? 0.25 : 0.8;

  interface Slot { position: Vector3; rotY: number }
  const slots: Slot[] = [];
  for (let f = 0; f < floors; f++) {
    const y = LOBBY + f * H + sillY + winH / 2;
    for (let i = 0; i < baysX; i++) {
      const x = -W / 2 + ((i + 0.5) / baysX) * W;
      slots.push({ position: new Vector3(x, y, D / 2 + 0.04), rotY: 0 });
      slots.push({ position: new Vector3(x, y, -D / 2 - 0.04), rotY: Math.PI });
    }
    for (let i = 0; i < baysZ; i++) {
      const z = -D / 2 + ((i + 0.5) / baysZ) * D;
      slots.push({ position: new Vector3(W / 2 + 0.04, y, z), rotY: Math.PI / 2 });
      slots.push({ position: new Vector3(-W / 2 - 0.04, y, z), rotY: -Math.PI / 2 });
    }
  }
  // Seeded partition: which windows are "home" tonight.
  const lit: Slot[] = [];
  const dark: Slot[] = [];
  for (const slot of slots) (rng.next() < occupancy ? lit : dark).push(slot);

  const bayW = Math.min(W / baysX, D / baysZ) * winW;
  const paneGeo = new BoxGeometry(bayW, winH, 0.06);
  const matrix = new Matrix4();
  const rot = new Matrix4();
  const instance = (list: Slot[], material: MeshStandardMaterial): void => {
    if (list.length === 0) return;
    const mesh = new InstancedMesh(paneGeo, material, list.length);
    list.forEach((slot, i) => {
      rot.makeRotationY(slot.rotY);
      matrix.makeTranslation(slot.position.x, slot.position.y, slot.position.z).multiply(rot);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  };
  instance(lit, litGlass);
  instance(dark, darkGlass);

  // Mullion frames as one instanced element (a slim vertical per window).
  const mullionGeo = new BoxGeometry(bayW + 0.1, winH + 0.12, 0.03);
  const frames = new InstancedMesh(mullionGeo, fascia, slots.length);
  slots.forEach((slot, i) => {
    rot.makeRotationY(slot.rotY);
    // A hair behind the pane, along each window's own facade normal.
    matrix
      .makeTranslation(
        slot.position.x - Math.sin(slot.rotY) * 0.02,
        slot.position.y,
        slot.position.z - Math.cos(slot.rotY) * 0.02
      )
      .multiply(rot);
    frames.setMatrixAt(i, matrix);
  });
  frames.instanceMatrix.needsUpdate = true;
  group.add(frames);

  // Floor bands ringing the shaft — one instance per storey.
  const bandGeo = new BoxGeometry(W + 0.2, 0.32, D + 0.2);
  const bands = new InstancedMesh(bandGeo, fascia, floors + 1);
  for (let f = 0; f <= floors; f++) {
    bands.setMatrixAt(f, matrix.makeTranslation(0, LOBBY + f * H, 0));
  }
  bands.instanceMatrix.needsUpdate = true;
  group.add(bands);

  // ---- lobby: double-height glazing, concrete piers, entry canopy ------
  const lobbyGlass = new Mesh(new BoxGeometry(W - 0.6, LOBBY - 0.5, D - 0.6), litGlass);
  lobbyGlass.position.y = (LOBBY - 0.5) / 2 + 0.1;
  group.add(lobbyGlass);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pier = new Mesh(new BoxGeometry(0.6, LOBBY, 0.6), concrete);
      pier.position.set(sx * (W / 2 - 0.3), LOBBY / 2, sz * (D / 2 - 0.3));
      group.add(pier);
    }
  }
  const canopy = new Mesh(new BoxGeometry(W * 0.45, 0.14, 2.4), fascia);
  canopy.position.set(0, LOBBY * 0.62, D / 2 + 1.1);
  group.add(canopy);
  const steel = createSurface('steel', { seed: seed + 2 });
  for (const dx of [-W * 0.16, W * 0.16]) {
    const post = new Mesh(new BoxGeometry(0.08, LOBBY * 0.62, 0.08), steel);
    post.position.set(dx, LOBBY * 0.31, D / 2 + 2.1);
    group.add(post);
  }

  // ---- roof: parapet + plant room --------------------------------------
  const roofY = LOBBY + shaftH;
  const parapet = new Mesh(new BoxGeometry(W + 0.3, 0.7, D + 0.3), concrete);
  parapet.position.y = roofY + 0.35;
  group.add(parapet);
  const plant = new Mesh(
    new BoxGeometry(W * rng.range(0.25, 0.4), 1.6, D * rng.range(0.3, 0.45)),
    concrete
  );
  plant.position.set(W * rng.range(-0.15, 0.15), roofY + 1.5, D * rng.range(-0.15, 0.15));
  group.add(plant);

  return {
    object: group,
    obstacleRadius: Math.max(W, D) * 0.62,
    floors,
    litPanes: litGlass,
    litCount: lit.length,
    windowCount: slots.length,
  };
}
