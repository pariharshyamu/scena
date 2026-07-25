import { describe, expect, it } from 'vitest';
import { Box3, Object3D, Vector3 } from 'three';
import {
  BASIN_ERAS,
  createBasin,
  createEwer,
  createTap,
  type BasinEra,
  type TapStyle,
} from '../src';

const boxOf = (object: Object3D): Box3 => {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
};

const STYLES: TapStyle[] = ['crosshead', 'mixer', 'pillar', 'pump'];

describe('createTap', () => {
  it.each(STYLES)('%s eases toward its target rather than snapping', (style) => {
    const tap = createTap({ style, speed: 2 });
    expect(tap.state).toBe(0);
    tap.set(true);
    expect(tap.state).toBe(0); // nothing moves until update
    tap.update(0.1);
    expect(tap.state).toBeGreaterThan(0);
    expect(tap.state).toBeLessThan(1);
    for (let i = 0; i < 60; i++) tap.update(1 / 60);
    expect(tap.state).toBeCloseTo(1, 4);
  });

  it.each(STYLES)('%s actually moves its handle', (style) => {
    // A control whose handle does not visibly move is not a control. The
    // knurled pillar knob exists for exactly this reason: a smooth cylinder
    // turning about its own axis looks identical to a stationary one.
    const tap = createTap({ style });
    const handle = tap.object.children.find((c) => c.name === 'handle')!;
    handle.updateMatrixWorld(true);
    // Sample a point OFFSET from each child, not its origin: a rotation
    // never moves its own origin, so measuring positions reports a turning
    // crosshead as perfectly still. Same trap as animating a keystroke on
    // the wrist.
    const probe = (): Vector3[] =>
      handle.children.map((c) => c.localToWorld(new Vector3(0.03, 0, 0.03)));
    const before = probe();
    tap.set(true);
    for (let i = 0; i < 60; i++) tap.update(1 / 60);
    handle.updateMatrixWorld(true);
    const after = probe();
    const moved = before.map((p, i) => p.distanceTo(after[i]));
    expect(Math.max(...moved)).toBeGreaterThan(0.004);
  });

  it('reports open from the target, and fires onChange once', () => {
    const tap = createTap({ style: 'mixer' });
    const events: boolean[] = [];
    tap.onChange = (open) => events.push(open);
    tap.set(true);
    for (let i = 0; i < 30; i++) tap.update(1 / 60);
    tap.set(true);
    for (let i = 0; i < 30; i++) tap.update(1 / 60);
    expect(events).toEqual([true]);
    tap.toggle();
    tap.update(0.1);
    expect(events).toEqual([true, false]);
  });

  it('clamps a partial target', () => {
    const tap = createTap({});
    tap.set(3);
    for (let i = 0; i < 90; i++) tap.update(1 / 60);
    expect(tap.state).toBe(1);
    tap.set(-1);
    for (let i = 0; i < 90; i++) tap.update(1 / 60);
    expect(tap.state).toBe(0);
  });
});

describe('createBasin', () => {
  it.each(BASIN_ERAS)('%s stands on the floor at a usable height', (era) => {
    const basin = createBasin({ era, seed: 2 });
    const box = boxOf(basin.object);
    expect(box.min.y).toBeGreaterThan(-0.02);
    // A basin you wash at is between knee and chest.
    expect(basin.rim).toBeGreaterThan(0.7);
    expect(basin.rim).toBeLessThan(1.0);
    expect(box.max.y).toBeGreaterThan(basin.rim - 0.02);
  });

  it('the eras differ in what you DO, not just how they look', () => {
    // This is the whole argument for the axis. If all three had taps, it
    // would be a re-skin.
    const medieval = createBasin({ era: 'medieval', seed: 1 });
    const victorian = createBasin({ era: 'victorian', seed: 1 });
    const modern = createBasin({ era: 'modern', seed: 1 });
    expect(medieval.taps).toHaveLength(0);
    expect(medieval.stream).toBeNull();
    // Hot and cold arrived separately, and mixing them was your problem.
    expect(victorian.taps).toHaveLength(2);
    expect(modern.taps).toHaveLength(1);
    expect(victorian.stream).not.toBeNull();
    expect(modern.stream).not.toBeNull();
  });

  it('a running tap fills it, through the stream', () => {
    const basin = createBasin({ era: 'modern', seed: 3, rate: 0.5 });
    expect(basin.fill.level).toBe(0);
    expect(basin.stream!.flow).toBe(0);
    basin.taps[0].set(true);
    for (let i = 0; i < 120; i++) basin.update(1 / 60);
    expect(basin.stream!.flow).toBeGreaterThan(0.9);
    expect(basin.fill.level).toBeGreaterThan(0.5);
  });

  it('a closed tap stops the stream and the filling', () => {
    const basin = createBasin({ era: 'victorian', seed: 3, rate: 0.5 });
    basin.taps[0].set(true);
    for (let i = 0; i < 60; i++) basin.update(1 / 60);
    const filled = basin.fill.level;
    basin.taps[0].set(false);
    // Water keeps running while the handle travels, which is correct — so
    // sample after it has actually shut, not the instant it was told to.
    for (let i = 0; i < 60; i++) basin.update(1 / 60);
    expect(basin.stream!.flow).toBe(0);
    expect(basin.fill.level).toBeGreaterThan(filled);
    const settled = basin.fill.level;
    for (let i = 0; i < 120; i++) basin.update(1 / 60);
    // Level holds — the plug is in.
    expect(basin.fill.level).toBeCloseTo(settled, 6);
  });

  it('either victorian tap runs the water', () => {
    // Two taps, one spout. Opening the hot one has to produce water.
    for (const which of [0, 1]) {
      const basin = createBasin({ era: 'victorian', seed: 4 });
      basin.taps[which].set(true);
      for (let i = 0; i < 60; i++) basin.update(1 / 60);
      expect(basin.stream!.flow).toBeGreaterThan(0.9);
    }
  });

  it('the drain empties it — except where there is no plug', () => {
    const modern = createBasin({ era: 'modern', seed: 1, drainRate: 1 });
    modern.pour(0.8);
    modern.setDrain(true);
    expect(modern.draining).toBe(true);
    for (let i = 0; i < 120; i++) modern.update(1 / 60);
    expect(modern.fill.level).toBe(0);

    // A laver has no plug, and quietly pretending it does would let a
    // medieval scene empty itself.
    const laver = createBasin({ era: 'medieval', seed: 1, drainRate: 1 });
    laver.pour(0.8);
    laver.setDrain(true);
    expect(laver.draining).toBe(false);
    for (let i = 0; i < 120; i++) laver.update(1 / 60);
    expect(laver.fill.level).toBeCloseTo(0.8, 3);
  });

  it('pouring works on every era — it is how the medieval one fills', () => {
    for (const era of BASIN_ERAS) {
      const basin = createBasin({ era, seed: 2 });
      basin.pour(0.4);
      expect(basin.fill.level).toBeCloseTo(0.4, 6);
    }
  });

  it('the water sits INSIDE the bowl, not around it', () => {
    // The fill radius has to match the bowl's interior. Cut to the widest
    // point it pokes out through the sides as a ring around the outside,
    // which is exactly what the first water demo did.
    for (const era of BASIN_ERAS) {
      const basin = createBasin({ era, seed: 5 });
      basin.pour(1);
      basin.update(1 / 60);
      basin.object.updateMatrixWorld(true);
      const water = new Box3().setFromObject(basin.fill.object);
      const whole = boxOf(basin.object);
      const wide = Math.max(water.max.x - water.min.x, water.max.z - water.min.z);
      const bowlWide = Math.max(whole.max.x - whole.min.x, whole.max.z - whole.min.z);
      expect(wide).toBeLessThan(bowlWide * 0.92);
      // And it is up in the bowl, not on the floor.
      expect(water.min.y).toBeGreaterThan(basin.rim - 0.2);
      expect(water.max.y).toBeLessThan(basin.rim + 0.02);
    }
  });

  it('publishes a slot in front of it, facing back at the basin', () => {
    // Three demos this session seated somebody with their back to the thing
    // they were meant to face.
    for (const era of BASIN_ERAS) {
      const basin = createBasin({ era, seed: 3 });
      basin.object.updateMatrixWorld(true);
      const at = basin.slot.anchor.getWorldPosition(new Vector3());
      expect(at.z).toBeGreaterThan(0.2);
      const facing = basin.slot.anchor.getWorldDirection(new Vector3());
      // Looking back toward the basin at the origin.
      expect(facing.z).toBeLessThan(-0.9);
      expect(basin.slot.approach).toBeDefined();
    }
  });

  it('nothing happens without update', () => {
    const basin = createBasin({ era: 'modern', seed: 1 });
    basin.taps[0].set(true);
    expect(basin.fill.level).toBe(0);
    expect(basin.stream!.flow).toBe(0);
  });
});

describe('createEwer', () => {
  it('is a carryable jug that ANIMA can pick up with no adapter', () => {
    const ewer = createEwer({ seed: 2 });
    expect(ewer.carry).toBe('side');
    expect(ewer.grip?.y).toBeGreaterThan(0);
    const box = boxOf(ewer.object);
    expect(box.min.y).toBeGreaterThan(-0.01);
    // Something a person carries in one hand.
    expect(box.max.y - box.min.y).toBeLessThan(0.5);
  });

  it('no two ewers are the same jug', () => {
    const sizes = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const box = boxOf(createEwer({ seed }).object);
      sizes.add((box.max.y - box.min.y).toFixed(4));
    }
    expect(sizes.size).toBe(8);
  });
});
