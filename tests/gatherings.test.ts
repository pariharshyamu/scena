import { describe, expect, it } from 'vitest';
import { Euler, Object3D, Quaternion, Vector3 } from 'three';
import {
  createCampCircle,
  createDiningTable,
  createGameTable,
  createLongBench,
  createPicnicTable,
  type Gathering,
} from '../src';

const ALL: Array<[string, () => Gathering]> = [
  ['dining table', () => createDiningTable()],
  ['picnic table', () => createPicnicTable()],
  ['long bench', () => createLongBench()],
  ['game table', () => createGameTable()],
  ['camp circle', () => createCampCircle()],
];

// Slot anchors may be parented deep (a chair's own group), so every check
// here works in WORLD space — exactly what ANIMA's `Interaction` reads.
function worldOf(g: Gathering, object: Object3D): Vector3 {
  g.object.updateWorldMatrix(true, true);
  return object.getWorldPosition(new Vector3());
}

/** World yaw of an anchor, in radians. */
function worldYaw(g: Gathering, object: Object3D): number {
  g.object.updateWorldMatrix(true, true);
  return new Euler().setFromQuaternion(object.getWorldQuaternion(new Quaternion()), 'YXZ').y;
}

describe('gatherings', () => {
  it('every gathering publishes seats, a focus, and seats === slots', () => {
    for (const [name, make] of ALL) {
      const g = make();
      expect(g.seats.length, name).toBeGreaterThanOrEqual(2);
      expect(g.slots, name).toBe(g.seats);
      expect(g.focus, name).toBeTruthy();
      for (const seat of g.seats) {
        expect(seat.pose, name).toMatch(/^sit/);
        expect(seat.anchor.parent, name).toBeTruthy();
      }
    }
  });

  it('every seat carries an approach anchor standing behind it', () => {
    for (const [name, make] of ALL) {
      const g = make();
      for (const seat of g.seats) {
        expect(seat.approach, name).toBeTruthy();
        const seatAt = worldOf(g, seat.anchor);
        const standAt = worldOf(g, seat.approach!);
        const gap = seatAt.distanceTo(standAt);
        // A pace behind — close enough to be the same place, far enough
        // that the character visibly turns and lowers rather than snapping.
        expect(gap, name).toBeGreaterThan(0.5);
        expect(gap, name).toBeLessThan(1.0);
      }
    }
  });

  it('the approach stands on the OPEN side, never through the furniture', () => {
    // A dining chair is reached from behind (the table blocks the front); a
    // park bench from the front (the backrest blocks the rear). Getting this
    // backwards makes characters walk through solid props to sit down.
    const seatedTables: Array<[string, Gathering]> = [
      ['dining', createDiningTable()],
      ['picnic', createPicnicTable()],
      ['game', createGameTable()],
      ['camp', createCampCircle()],
    ];
    for (const [name, g] of seatedTables) {
      g.object.updateWorldMatrix(true, true);
      const focus = g.focus.getWorldPosition(new Vector3());
      for (const seat of g.seats) {
        // The approach must be FURTHER from the shared focus than the seat —
        // i.e. outside the table, not on top of it.
        const seatAt = worldOf(g, seat.anchor);
        const standAt = worldOf(g, seat.approach!);
        expect(standAt.distanceTo(focus), `${name} approach is outside`).toBeGreaterThan(
          seatAt.distanceTo(focus)
        );
      }
    }
    // The bench is the exception that proves the rule: you come at it from
    // the front, the side its focus (the view) is on.
    const b = createLongBench();
    b.object.updateWorldMatrix(true, true);
    const view = b.focus.getWorldPosition(new Vector3());
    for (const seat of b.seats) {
      expect(worldOf(b, seat.approach!).distanceTo(view)).toBeLessThan(
        worldOf(b, seat.anchor).distanceTo(view)
      );
    }
  });

  it('the focus is in front of every sitter, never behind them', () => {
    // The point of a gathering: the shared thing is in everyone's view. It
    // need not be dead ahead — someone at the end of a picnic bench faces
    // across the table, not diagonally at the centre — but it is always in
    // the forward half, which is what makes the group read as a group.
    for (const [name, make] of ALL) {
      if (name === 'long bench') continue; // a bench faces the view, not itself
      const g = make();
      g.object.updateWorldMatrix(true, true);
      const focus = g.focus.getWorldPosition(new Vector3());
      for (const seat of g.seats) {
        const at = seat.anchor.getWorldPosition(new Vector3());
        const facing = new Vector3(0, 0, 1)
          .applyQuaternion(seat.anchor.getWorldQuaternion(new Quaternion()))
          .setY(0)
          .normalize();
        const toFocus = focus.clone().sub(at).setY(0).normalize();
        expect(facing.dot(toFocus), `${name} seat faces focus`).toBeGreaterThan(0.35);
      }
    }
  });

  it('round tables and game boards put the focus dead ahead', () => {
    for (const g of [createDiningTable({ style: 'round' }), createGameTable()]) {
      g.object.updateWorldMatrix(true, true);
      const focus = g.focus.getWorldPosition(new Vector3());
      for (const seat of g.seats) {
        const at = seat.anchor.getWorldPosition(new Vector3());
        const facing = new Vector3(0, 0, 1)
          .applyQuaternion(seat.anchor.getWorldQuaternion(new Quaternion()))
          .setY(0)
          .normalize();
        expect(facing.dot(focus.clone().sub(at).setY(0).normalize())).toBeGreaterThan(0.9);
      }
    }
  });

  it('no two seats are laid out square — the crookedness is the realism', () => {
    const g = createDiningTable({ seats: 6, seed: 7 });
    let offGrid = 0;
    for (let i = 0; i < g.seats.length; i++) {
      const yaw = worldYaw(g, g.seats[i].anchor);
      const ideal = (i / 6) * Math.PI * 2 + Math.PI;
      const delta = Math.abs(Math.atan2(Math.sin(yaw - ideal), Math.cos(yaw - ideal)));
      if (delta > 0.01) offGrid++;
    }
    expect(offGrid).toBe(6);
    // …and pushed back from the table by visibly differing amounts, too.
    const radii = g.seats.map((s) => worldOf(g, s.anchor).length());
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.03);
  });

  it('seat counts are honoured and clamped', () => {
    expect(createDiningTable({ seats: 4 }).seats).toHaveLength(4);
    expect(createDiningTable({ seats: 8, style: 'trestle' }).seats).toHaveLength(8);
    expect(createPicnicTable({ seats: 4 }).seats).toHaveLength(4);
    expect(createLongBench({ seats: 5 }).seats).toHaveLength(5);
    expect(createCampCircle({ seats: 7 }).seats).toHaveLength(7);
    expect(createGameTable().seats).toHaveLength(2); // always a pair
    expect(createDiningTable({ seats: 99 }).seats.length).toBeLessThanOrEqual(10);
  });

  it('the two game seats face each other across the board', () => {
    const g = createGameTable({ game: 'chess' });
    g.object.updateWorldMatrix(true, true);
    const [a, b] = g.seats.map((s) => s.anchor.getWorldPosition(new Vector3()));
    expect(a.distanceTo(b)).toBeGreaterThan(1.2);
    const focus = g.focus.getWorldPosition(new Vector3());
    // The board sits between them.
    expect(focus.distanceTo(a)).toBeLessThan(a.distanceTo(b));
    expect(focus.distanceTo(b)).toBeLessThan(a.distanceTo(b));
  });

  it('is deterministic: same seed, same seating', () => {
    const a = createDiningTable({ seed: 21, seats: 5 });
    const b = createDiningTable({ seed: 21, seats: 5 });
    for (let i = 0; i < a.seats.length; i++) {
      expect(b.seats[i].anchor.position.toArray()).toEqual(a.seats[i].anchor.position.toArray());
      expect(b.seats[i].anchor.rotation.y).toBe(a.seats[i].anchor.rotation.y);
    }
  });

  it('each variant of the game table builds', () => {
    for (const game of ['chess', 'cards', 'dice'] as const) {
      const g = createGameTable({ game });
      expect(g.object.children.length).toBeGreaterThan(3);
      expect(g.obstacleRadius).toBeGreaterThan(0);
    }
  });
});
