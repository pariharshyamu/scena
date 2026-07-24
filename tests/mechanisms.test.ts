import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import {
  createDoor,
  createDrawer,
  createLever,
  createValve,
  createHatch,
  createPortcullis,
  type Manipulable,
} from '../src';

/** Run a manipulable to rest at its current target. */
function settle(m: Manipulable, seconds = 3, dt = 1 / 60): void {
  for (let i = 0; i < seconds / dt; i++) m.update(dt);
}

const height = (m: Manipulable): number =>
  new Box3().setFromObject(m.object).getSize(new Vector3()).y;

describe('manipulables — shared control surface', () => {
  it('starts closed and eases open on toggle', () => {
    const door = createDoor({ seed: 2 });
    expect(door.state).toBe(0);
    expect(door.open).toBe(false);

    expect(door.toggle()).toBe(true); // now targeting open
    expect(door.open).toBe(true);
    expect(door.state).toBe(0); // …but hasn't moved yet
    door.update(1 / 60);
    expect(door.state).toBeGreaterThan(0);
    expect(door.state).toBeLessThan(1);

    settle(door);
    expect(door.state).toBeCloseTo(1, 3);
    door.toggle();
    settle(door);
    expect(door.state).toBeCloseTo(0, 3);
  });

  it('fires onChange only when the target flips', () => {
    const lever = createLever();
    const flips: boolean[] = [];
    lever.onChange = (open) => flips.push(open);

    lever.set(true);
    lever.set(1); // already open — no flip
    lever.set(0.9); // still open — no flip
    lever.set(false);
    expect(flips).toEqual([true, false]);
  });

  it('set accepts booleans and partial targets', () => {
    const drawer = createDrawer();
    drawer.set(0.5);
    expect(drawer.open).toBe(true); // ≥ 0.5 counts as open
    settle(drawer);
    expect(drawer.state).toBeCloseTo(0.5, 2);
    drawer.set(false);
    settle(drawer);
    expect(drawer.state).toBeCloseTo(0, 3);
  });

  it('actually moves a joint — the door swings', () => {
    const door = createDoor({ seed: 1 });
    // Track the door handle's world position as a proxy for the swing.
    door.object.updateWorldMatrix(true, true);
    const before = new Box3().setFromObject(door.object).getSize(new Vector3()).clone();
    door.set(true);
    settle(door);
    door.object.updateWorldMatrix(true, true);
    const after = new Box3().setFromObject(door.object).getSize(new Vector3());
    // Swinging a leaf changes the object's footprint (z grows as it opens).
    expect(after.z).toBeGreaterThan(before.z + 0.3);
  });

  it('portcullis rises when opened', () => {
    const pc = createPortcullis({ seed: 3 });
    const grille = pc.object.children.find((c) => c.type === 'Group')!;
    const restY = grille.position.y;
    pc.set(true);
    settle(pc, 4);
    expect(grille.position.y).toBeGreaterThan(restY + 1);
  });
});

describe('manipulables — construction', () => {
  it('work stations publish an operate slot; pass-throughs do not', () => {
    expect(createLever().slots?.[0].kind).toBe('operate');
    expect(createValve().slots?.[0].pose).toBe('operate');
    expect(createDrawer().slots).toHaveLength(1);
    expect(createHatch().slots).toHaveLength(1);
    expect(createDoor().slots).toBeUndefined();
    expect(createPortcullis().slots).toBeUndefined();
  });

  it('is deterministic per seed and renders geometry', () => {
    const a = createValve({ seed: 7 });
    const b = createValve({ seed: 7 });
    expect(a.object.children.length).toBe(b.object.children.length);
    expect(height(a)).toBeGreaterThan(0.5);
    expect(createPortcullis().object.children.length).toBeGreaterThan(3);
  });

  it('double door swings both leaves apart', () => {
    const gate = createDoor({ double: true, width: 1.2 });
    gate.set(true);
    settle(gate);
    // Two hinge groups rotate in opposite directions.
    const hinges = gate.object.children.filter((c) => c.type === 'Object3D');
    const ys = hinges.map((h) => h.rotation.y).filter((y) => Math.abs(y) > 0.1);
    expect(ys.length).toBe(2);
    expect(Math.sign(ys[0])).toBe(-Math.sign(ys[1]));
  });
});
