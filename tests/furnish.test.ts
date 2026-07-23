import { describe, expect, it } from 'vitest';
import { createRoom, furnishRoom, type RoomRole } from '../src';

const PLAN = [
  '##H######',
  '#.......#',
  'W...~...W',
  '#.......#',
  '#.......#',
  '##WDW####',
];

const build = (role: RoomRole, seed = 5) => {
  const room = createRoom(PLAN, { seed: 3 });
  return { room, furnished: furnishRoom(room, { role, seed }) };
};

describe('furnishRoom', () => {
  it('is deterministic per seed and varies across seeds', () => {
    const a = build('tavern', 7).furnished;
    const b = build('tavern', 7).furnished;
    const layout = (f: typeof a): string =>
      f.props.map((p) => `${p.object.name}@${p.object.position.x.toFixed(2)},${p.object.position.z.toFixed(2)}`).join('|');
    expect(layout(a)).toBe(layout(b));
    const c = build('tavern', 8).furnished;
    expect(layout(a)).not.toBe(layout(c));
  });

  it('gives each role its anchor utility', () => {
    const names = (role: RoomRole): string[] =>
      build(role).furnished.props.map((p) => p.object.name);
    expect(names('tavern')).toContain('counter');
    expect(names('smithy')).toContain('forge');
    expect(names('bakery')).toContain('oven');
    expect(names('cottage').some((n) => n.startsWith('bed'))).toBe(true);
    expect(names('study').filter((n) => n.startsWith('shelf')).length).toBeGreaterThanOrEqual(2);
    expect(names('barracks').filter((n) => n.startsWith('bed')).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps everything on walkable floor and off the doorway', () => {
    const { room, furnished } = build('tavern');
    for (const prop of furnished.props) {
      const { x, z } = prop.object.position;
      expect(room.floorAt(x, z)).toBe(true);
      for (const door of room.doors) {
        if (prop.obstacleRadius > 0) {
          expect(Math.hypot(door.x - x, door.z - z)).toBeGreaterThan(room.unit);
        }
      }
    }
  });

  it('does not stack big furniture on itself', () => {
    for (const role of ['cottage', 'tavern', 'smithy', 'bakery', 'barracks'] as RoomRole[]) {
      const { furnished } = build(role);
      const big = furnished.obstacles.filter((o) => o.radius >= 0.5);
      for (let i = 0; i < big.length; i++) {
        for (let j = i + 1; j < big.length; j++) {
          const d = Math.hypot(
            big[i].center.x - big[j].center.x,
            big[i].center.z - big[j].center.z
          );
          expect(d).toBeGreaterThan(Math.max(big[i].radius, big[j].radius) * 0.8);
        }
      }
    }
  });

  it('emits the markers agents need', () => {
    const cottage = build('cottage').furnished;
    expect(cottage.markers.sleep.length).toBeGreaterThanOrEqual(1);
    expect(cottage.markers.sit.length).toBeGreaterThanOrEqual(1);
    expect(cottage.markers.hearth).toHaveLength(1);
    const tavern = build('tavern').furnished;
    expect(tavern.markers.work.length).toBeGreaterThanOrEqual(1);
    expect(tavern.markers.sit.length).toBeGreaterThanOrEqual(3);
    const smithy = build('smithy').furnished;
    expect(smithy.markers.work.length).toBeGreaterThanOrEqual(1);
    // Work markers stand on walkable floor.
    const { room, furnished } = build('smithy');
    for (const work of furnished.markers.work) {
      expect(room.floorAt(work.x, work.z)).toBe(true);
    }
  });

  it('attaches its group to the room and reports obstacles', () => {
    const { room, furnished } = build('bakery');
    expect(room.group.children).toContain(furnished.group);
    expect(furnished.obstacles.length).toBeGreaterThan(2);
    for (const obstacle of furnished.obstacles) expect(obstacle.radius).toBeGreaterThan(0);
  });
});
