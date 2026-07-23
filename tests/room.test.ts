import { describe, expect, it } from 'vitest';
import { Group, InstancedMesh, PointLight } from 'three';
import { createRoom, KIT_UNIT } from '../src';

const COTTAGE = [
  '##H##',
  'W...W',
  '#.~.#',
  '#TS.#',
  '##D##',
];

describe('createRoom', () => {
  it('is deterministic for the same seed', () => {
    const a = createRoom(COTTAGE, { seed: 7 });
    const b = createRoom(COTTAGE, { seed: 7 });
    expect(a.group.children.length).toBe(b.group.children.length);
    expect(a.obstacles.length).toBe(b.obstacles.length);
    a.obstacles.forEach((obstacle, i) => {
      expect(obstacle.center.x).toBeCloseTo(b.obstacles[i].center.x);
      expect(obstacle.center.z).toBeCloseTo(b.obstacles[i].center.z);
    });
  });

  it('parses the interior vocabulary into gameplay data', () => {
    const room = createRoom(COTTAGE, { seed: 3 });
    expect(room.windows).toHaveLength(2);
    expect(room.hearths).toHaveLength(1);
    expect(room.rugs).toHaveLength(1);
    expect(room.spawns).toHaveLength(1);
    // Hearth is on the top wall (north, -z); its normal points into the room (+z).
    expect(room.hearths[0].normal.z).toBe(1);
    // The two windows are on the side walls, facing inward toward x = 0.
    for (const window of room.windows) {
      expect(Math.abs(window.normal.x)).toBe(1);
      expect(Math.sign(window.normal.x)).toBe(-Math.sign(window.position.x));
    }
  });

  it('records window openings at the interior wall face', () => {
    const room = createRoom(COTTAGE, { seed: 3 });
    const window = room.windows[0];
    // West wall cell centers sit at x = -2·unit; the face is half a unit in.
    const cellX = -2 * KIT_UNIT;
    expect(window.position.x).toBeCloseTo(cellX + KIT_UNIT * 0.5 + 0.02, 1);
    expect(window.position.y).toBeGreaterThan(0.5);
    expect(window.width).toBeGreaterThan(0);
    expect(window.pane.emissiveIntensity).toBeGreaterThan(0.5);
  });

  it('keeps walls, windows and hearths solid but rugs walkable', () => {
    const room = createRoom(COTTAGE, { seed: 3 });
    // 12 plain wall cells + 2 windows + 1 hearth + 1 torch obstacle.
    expect(room.obstacles).toHaveLength(16);
    expect(room.floorAt(0, 0)).toBe(true); // rug cell
    expect(room.floorAt(-2 * KIT_UNIT, 0)).toBe(false); // window cell
    expect(room.floorAt(0, -2 * KIT_UNIT)).toBe(false); // hearth cell
    expect(room.floorAt(0, 2 * KIT_UNIT)).toBe(true); // doorway
  });

  it('builds instanced architecture including a ceiling, and can omit it', () => {
    const instancedCount = (group: Group): number =>
      group.children.filter((child) => (child as InstancedMesh).isInstancedMesh).length;
    const roofed = createRoom(COTTAGE, { seed: 3 });
    const open = createRoom(COTTAGE, { seed: 3, ceiling: false });
    // walls + floors + ceiling + beams vs walls + floors.
    expect(instancedCount(roofed.group)).toBe(4);
    expect(instancedCount(open.group)).toBe(2);
  });

  it('honors the hearth light budget and toggles lights with setActive', () => {
    const lightsIn = (room: { group: Group }): PointLight[] => {
      const found: PointLight[] = [];
      room.group.traverse((child) => {
        if ((child as PointLight).isPointLight) found.push(child as PointLight);
      });
      return found;
    };
    const lit = createRoom(COTTAGE, { seed: 3 });
    expect(lightsIn(lit).length).toBe(2); // hearth + torch
    const dark = createRoom(COTTAGE, { seed: 3, hearthLight: false });
    expect(lightsIn(dark).length).toBe(1); // torch only

    lit.setActive(false);
    expect(lit.group.visible).toBe(false);
    expect(lightsIn(lit).every((light) => !light.visible)).toBe(true);
    lit.setActive(true);
    expect(lit.group.visible).toBe(true);
    expect(lightsIn(lit).every((light) => light.visible)).toBe(true);
  });
});
