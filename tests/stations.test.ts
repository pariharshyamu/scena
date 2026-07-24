import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import {
  createBathtub,
  createBed,
  createGuitar,
  createSeat,
  createSink,
  createToilet,
  createTreadmill,
} from '../src';

describe('interaction slots', () => {
  it('seats publish sit slots (benches seat two)', () => {
    expect(createSeat({ style: 'chair' }).slots).toHaveLength(1);
    expect(createSeat({ style: 'stool' }).slots).toHaveLength(1);
    const bench = createSeat({ style: 'bench' });
    expect(bench.slots).toHaveLength(2);
    expect(bench.slots![0].pose).toBe('sit');
    // Anchors are parented into the prop, at floor level.
    for (const slot of bench.slots!) {
      expect(slot.anchor.parent).toBe(bench.object);
      expect(slot.anchor.position.y).toBe(0);
    }
  });

  it('beds publish sleep slots pitched flat — doubles and bunks sleep two', () => {
    const single = createBed({ size: 'single' });
    expect(single.slots).toHaveLength(1);
    const slot = single.slots![0];
    expect(slot.pose).toBe('sleep');
    expect(slot.anchor.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(slot.anchor.position.y).toBeGreaterThan(0.4); // on the mattress
    expect(createBed({ size: 'double' }).slots).toHaveLength(2);
    const bunk = createBed({ size: 'bunk' });
    expect(bunk.slots).toHaveLength(2);
    expect(bunk.slots![1].anchor.position.y).toBeGreaterThan(bunk.slots![0].anchor.position.y + 0.8);
  });
});

describe('stations', () => {
  it('treadmill: run slot faces the console, belt speed is live', () => {
    const treadmill = createTreadmill({ speed: 2.0 });
    expect(treadmill.slots).toHaveLength(1);
    expect(treadmill.slots![0].pose).toBe('run');
    expect(Math.abs(treadmill.slots![0].anchor.rotation.y)).toBeCloseTo(Math.PI);
    expect(treadmill.speed).toBe(2.0);
    treadmill.setSpeed(3.1);
    expect(treadmill.speed).toBe(3.1);
    treadmill.setSpeed(-5);
    expect(treadmill.speed).toBe(0);
  });

  it('guitar is a hand prop: no footprint, strings and neck present', () => {
    const guitar = createGuitar({ seed: 2 });
    expect(guitar.obstacleRadius).toBe(0);
    expect(guitar.object.children.length).toBeGreaterThanOrEqual(6);
  });

  it('bathroom set: toilet seats, tub soaks lying down, sink stands', () => {
    const toilet = createToilet();
    expect(toilet.slots![0].pose).toBe('sit');
    const tub = createBathtub();
    expect(tub.slots![0].kind).toBe('soak');
    expect(tub.slots![0].pose).toBe('sleep');
    expect(tub.slots![0].anchor.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(createSink().obstacleRadius).toBeGreaterThan(0);
    expect(createSink().slots).toBeUndefined();
  });

  it('slots are plain structural data an Interaction can consume', () => {
    const chair = createSeat({ style: 'chair' });
    const slot = chair.slots![0];
    expect(slot.anchor).toBeInstanceOf(Object3D);
    expect(typeof slot.pose).toBe('string');
    expect(typeof slot.kind).toBe('string');
  });
});
