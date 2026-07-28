import { describe, expect, it, vi } from 'vitest';
import { Mesh, Vector3 } from 'three';
import { linkMechanism } from 'gama3d';
import {
  createBouncePad,
  createConveyor,
  createCrumblingPlatform,
  createPendulum,
  createPlatform,
  createPressurePlate,
  createSpikeTrap,
} from '../src';

describe('createPlatform', () => {
  it('moves, and delta is EXACTLY what a rider must add to stay aboard', () => {
    const platform = createPlatform({ motion: 'linear', period: 4, seed: 3 });
    const before = platform.group.position.clone();
    platform.update(0.5);
    const moved = platform.group.position.clone().sub(before);
    expect(platform.delta.distanceTo(moved)).toBeLessThan(1e-9);
    expect(moved.length()).toBeGreaterThan(0.01);
    // Velocity is delta over time.
    expect(platform.velocity.length()).toBeCloseTo(moved.length() / 0.5, 5);
  });

  it('linear turns around smoothly; orbit stays on its circle', () => {
    const linear = createPlatform({
      motion: 'linear',
      from: new Vector3(-2, 0, 0),
      to: new Vector3(2, 0, 0),
      period: 2,
      seed: 1,
    });
    for (let i = 0; i < 200; i++) {
      linear.update(0.02);
      expect(Math.abs(linear.group.position.x)).toBeLessThanOrEqual(2.0001);
    }
    const orbit = createPlatform({ motion: 'orbit', radius: 3, seed: 2 });
    for (let i = 0; i < 40; i++) {
      orbit.update(0.1);
      const r = Math.hypot(orbit.group.position.x, orbit.group.position.z);
      expect(r).toBeCloseTo(3, 5);
    }
  });
});

describe('createCrumblingPlatform', () => {
  it('THE WARNING IS THE GAMEPLAY: shudder, fall, gone, return, solid', () => {
    const platform = createCrumblingPlatform({ delay: 0.5, respawn: 1 });
    platform.group.position.set(4, 2, 0);
    platform.update(0);
    expect(platform.state).toBe('solid');
    expect(platform.solid).toBe(true);

    platform.disturb();
    expect(platform.state).toBe('shaking');
    expect(platform.solid).toBe(true); // still standable during the warning
    platform.update(0.6);
    expect(platform.state).toBe('falling');
    expect(platform.solid).toBe(false);
    platform.update(0.5);
    expect(platform.group.position.y).toBeLessThan(2);
    platform.update(0.5); // past the 0.9 s fall
    expect(platform.state).toBe('gone');
    expect(platform.group.visible).toBe(false);

    platform.disturb(); // poking a hole in the air does nothing
    expect(platform.state).toBe('gone');

    platform.update(1.05);
    expect(platform.state).toBe('returning');
    platform.update(0.6);
    expect(platform.state).toBe('solid');
    expect(platform.group.position.y).toBeCloseTo(2, 5);
    expect(platform.group.visible).toBe(true);
  });
});

describe('createBouncePad', () => {
  it('returns its launch speed and squashes before it stretches', () => {
    const pad = createBouncePad({ strength: 12 });
    const cushion = pad.group.children[1] as Mesh;
    pad.update(1); // settle
    expect(cushion.scale.y).toBeCloseTo(1, 1);
    expect(pad.bounce()).toBe(12);
    pad.update(0.03);
    expect(cushion.scale.y).toBeLessThan(0.9); // the squash
    pad.update(1);
    expect(cushion.scale.y).toBeCloseTo(1, 1); // settled again
  });
});

describe('createPendulum', () => {
  it('the hazard rides the blade tip at arm length, live', () => {
    const pendulum = createPendulum({ length: 3, period: 2, seed: 4 });
    pendulum.group.position.set(0, 5, 0);
    pendulum.update(0);
    const first = pendulum.hazard.center.clone();
    // Tip is always one arm-length from the pivot.
    expect(first.distanceTo(new Vector3(0, 5, 0))).toBeCloseTo(3, 5);
    pendulum.update(0.5);
    expect(pendulum.hazard.center.distanceTo(first)).toBeGreaterThan(0.2);
    expect(pendulum.hazard.center.distanceTo(new Vector3(0, 5, 0))).toBeCloseTo(3, 5);
  });
});

describe('createSpikeTrap', () => {
  it('cycling spikes snap out and withdraw slowly, dangerous only while out', () => {
    const trap = createSpikeTrap({ mode: 'cycling', period: 2 });
    const readings: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      trap.update(0.05);
      readings.push(trap.dangerous);
    }
    expect(readings).toContain(true);
    expect(readings).toContain(false);
  });

  it('a triggered trap waits for spring() and resets after', () => {
    const trap = createSpikeTrap({ mode: 'triggered' });
    for (let i = 0; i < 20; i++) trap.update(0.1);
    expect(trap.dangerous).toBe(false);
    trap.spring();
    trap.update(0.15);
    expect(trap.dangerous).toBe(true);
    for (let i = 0; i < 20; i++) trap.update(0.1);
    expect(trap.dangerous).toBe(false);
  });
});

describe('createConveyor', () => {
  it('surface velocity is world-space — turning the belt turns the push', () => {
    const belt = createConveyor({ speed: 2 });
    belt.update(0.1);
    expect(belt.velocity.x).toBeCloseTo(2, 5);
    belt.group.rotation.y = Math.PI / 2;
    belt.group.updateMatrixWorld(true);
    belt.update(0.1);
    expect(Math.abs(belt.velocity.z + 2)).toBeLessThan(1e-5); // now pushes -z
    belt.setSpeed(-1);
    belt.update(0.1);
    expect(belt.velocity.length()).toBeCloseTo(1, 5);
  });

  it('chevrons wrap forever without a NaN in sight', () => {
    const belt = createConveyor({ length: 4, speed: 3 });
    for (let i = 0; i < 100; i++) belt.update(0.1);
    const arr = (belt.group.children[1] as unknown as { instanceMatrix: { array: number[] } })
      .instanceMatrix.array;
    for (const v of arr) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('createPressurePlate', () => {
  it('depresses under weight and releases when everyone steps off', () => {
    const plate = createPressurePlate();
    const heard: boolean[] = [];
    plate.onChange = (open) => heard.push(open);
    plate.occupy(1);
    plate.occupy(2); // more weight is not more open
    expect(plate.open).toBe(true);
    plate.occupy(0);
    expect(plate.open).toBe(false);
    expect(heard).toEqual([true, false]);
    // The visual sinks and rises with the state.
    const top = plate.group.children[1] as Mesh;
    plate.occupy(1);
    plate.update(0.2);
    expect(top.position.y).toBeLessThan(0.09);
  });

  it('a latching plate is a puzzle solved — it never lets go on its own', () => {
    const plate = createPressurePlate({ latching: true });
    plate.occupy(1);
    plate.occupy(0);
    expect(plate.open).toBe(true);
    plate.set(false); // …but a deliberate reset still works
    expect(plate.open).toBe(false);
  });

  it("SPEAKS GAMA'S DIALECT: linkMechanism wires it to a door, for real", () => {
    // Not a shape assertion — the actual gama3d linkMechanism, the actual
    // plate. The whole cross-library bet, exercised.
    const plate = createPressurePlate();
    let doorOpen = false;
    const door = {
      get open() {
        return doorOpen;
      },
      toggle: () => (doorOpen = !doorOpen),
      set: (t: number | boolean) => {
        doorOpen = typeof t === 'number' ? t > 0.5 : t;
      },
    };
    const unlink = linkMechanism(plate, door);
    plate.occupy(1);
    expect(doorOpen).toBe(true);
    plate.occupy(0);
    expect(doorOpen).toBe(false);
    unlink();
    plate.occupy(1);
    expect(doorOpen).toBe(false);

    // And unlink preserved nothing it shouldn't: our own listener still runs.
    const heard = vi.fn();
    plate.onChange = heard;
    plate.occupy(0);
    expect(heard).toHaveBeenCalledWith(false);
  });
});
