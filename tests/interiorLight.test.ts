import { describe, expect, it } from 'vitest';
import { BufferAttribute, Mesh } from 'three';
import { createInteriorLight, createRoom } from '../src';

const ROOM = [
  '#####',
  'W...W',
  '#...#',
  '##D##',
];

const shaftMeshes = (light: { group: { children: unknown[] } }): Mesh[] =>
  (light.group.children as Mesh[]).filter(
    (child) => (child as Mesh).isMesh && child.geometry?.getAttribute?.('aFade') !== undefined
  );

describe('createInteriorLight', () => {
  it('builds one shaft per window and attaches itself to the room', () => {
    const room = createRoom(ROOM, { seed: 5 });
    const light = createInteriorLight(room, { dust: 0 });
    expect(shaftMeshes(light)).toHaveLength(2);
    expect(room.group.children).toContain(light.group);
  });

  it('only sun-facing windows carry a lit shaft', () => {
    const room = createRoom(ROOM, { seed: 5 });
    const light = createInteriorLight(room, { dust: 0 });
    // Sun due east (+x): the west window (normal +x) admits it, the east
    // window (normal -x) faces away.
    light.setSun({ elevation: 0.6, azimuth: Math.PI / 2 });
    const [west, east] = shaftMeshes(light);
    expect(west.visible).not.toBe(east.visible);
  });

  it('moves the shaft landing as the sun drops', () => {
    const room = createRoom(ROOM, { seed: 5 });
    const light = createInteriorLight(room, { dust: 0 });
    const shaft = shaftMeshes(light).find((mesh) => mesh.visible)!;
    const landingAt = (): number => {
      const positions = shaft.geometry.getAttribute('position') as BufferAttribute;
      return Math.abs(positions.getX(4) - positions.getX(0));
    };
    light.setSun({ elevation: 0.9, azimuth: 0.35 });
    const noon = landingAt();
    light.setSun({ elevation: 0.25, azimuth: 0.35 });
    const evening = landingAt();
    expect(evening).toBeGreaterThan(noon);
  });

  it('brightens panes and fill by day, darkens them by night', () => {
    const room = createRoom(ROOM, { seed: 5 });
    const light = createInteriorLight(room, { dust: 0 });
    light.setSun({ elevation: 1 });
    const dayPane = room.windows[0].pane.emissiveIntensity;
    const dayFill = light.hemisphere.intensity;
    light.setSun({ elevation: -0.8 });
    expect(room.windows[0].pane.emissiveIntensity).toBeLessThan(dayPane);
    expect(light.hemisphere.intensity).toBeLessThan(dayFill);
    // Night still leaves a floor of fill for hearth-lit interiors.
    expect(light.hemisphere.intensity).toBeGreaterThan(0.1);
    // All shafts die at night.
    expect(shaftMeshes(light).some((mesh) => mesh.visible)).toBe(false);
  });

  it('follows a bound day cycle on update()', () => {
    const room = createRoom(ROOM, { seed: 5 });
    const cycle = { sunElevation: 1, timeOfDay: 0.5 };
    const light = createInteriorLight(room, { cycle, dust: 0 });
    const noonFill = light.hemisphere.intensity;
    cycle.sunElevation = -0.5;
    cycle.timeOfDay = 0.95;
    light.update();
    expect(light.hemisphere.intensity).toBeLessThan(noonFill);
  });

  it('sprinkles the requested dust and honors dust: 0', () => {
    const room = createRoom(ROOM, { seed: 5 });
    const dusty = createInteriorLight(room, { dust: 40 });
    const points = dusty.group.children.filter((child) => (child as { isPoints?: boolean }).isPoints);
    expect(points).toHaveLength(room.windows.length);
    const attribute = (points[0] as Mesh).geometry.getAttribute('aCell') as BufferAttribute;
    expect(attribute.count).toBe(40);
    const bare = createInteriorLight(createRoom(ROOM, { seed: 5 }), { dust: 0 });
    expect(bare.group.children.some((child) => (child as { isPoints?: boolean }).isPoints)).toBe(false);
  });
});
