import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { VESSEL_STYLES, createVessel, type VesselStyle } from '../src';

/** Fire a ray straight down the axis and report where it first lands. */
function drop(object: Mesh | { object: { children: unknown[] } }, from: number): number | null {
  const group = (object as { object: any }).object;
  group.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(0, from, 0), new Vector3(0, -1, 0));
  const hits = ray.intersectObject(group, true);
  return hits.length ? hits[0].point.y : null;
}

const HOLLOW: VesselStyle[] = ['vase', 'urn', 'jug', 'goblet', 'bowl', 'pot'];

describe('createVessel', () => {
  it.each(VESSEL_STYLES)('%s stands on y = 0', (style) => {
    const v = createVessel({ style, seed: 3 });
    const box = new Box3().setFromObject(v.object);
    // `dress` seats things by their own bounds, but a prop whose base is not
    // at its origin is still wrong everywhere else in the kit.
    expect(box.min.y).toBeGreaterThan(-0.002);
    expect(box.min.y).toBeLessThan(0.004);
    expect(box.max.y).toBeGreaterThan(0.04);
  });

  it.each(VESSEL_STYLES)('%s is tabletop-sized', (style) => {
    const v = createVessel({ style, seed: 5 });
    const box = new Box3().setFromObject(v.object);
    const size = box.getSize(new Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(0.45);
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.04);
  });

  it.each(VESSEL_STYLES)('%s reports a radius that matches its geometry', (style) => {
    const v = createVessel({ style, seed: 2 });
    const box = new Box3().setFromObject(v.object);
    const size = box.getSize(new Vector3());
    expect(v.radius * 2).toBeGreaterThan(Math.max(size.x, size.z) * 0.82);
    expect(v.radius * 2).toBeLessThan(Math.max(size.x, size.z) * 1.5);
    // `height` is the vessel's own height. A candlestick's bounds also cover
    // the candle standing in it, which is an addition rather than part of the
    // turned form.
    if (style === 'candlestick') expect(v.height).toBeLessThan(size.y);
    else expect(v.height).toBeCloseTo(size.y, 1);
  });

  it.each(HOLLOW)('%s is actually hollow', (style) => {
    // The whole difference between a vase and an egg. Fire a ray down the
    // axis: it must land INSIDE, well below the rim. A profile that stops at
    // the rim gets capped flat by the lathe and passes every other check
    // here while rendering as a solid lump.
    const v = createVessel({ style, seed: 4 });
    const hit = drop(v, v.height * 3);
    expect(hit).not.toBeNull();
    expect(hit!).toBeLessThan(v.height * 0.85);
  });

  it('a bottle is not hollowed out to its floor — the mouth is small', () => {
    const v = createVessel({ style: 'bottle', seed: 4 });
    const hit = drop(v, v.height * 3)!;
    expect(hit).toBeGreaterThan(v.height * 0.55);
  });

  it('never inverts the wall through the axis', () => {
    // Catmull-Rom can overshoot; a negative radius turns the vessel inside
    // out and the lathe happily builds it.
    for (const style of VESSEL_STYLES) {
      for (let seed = 1; seed <= 6; seed++) {
        const v = createVessel({ style, seed });
        const body = v.object.children.find((c) => c.name === 'body') as Mesh;
        const pos = body.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          expect(Number.isFinite(pos.getX(i))).toBe(true);
          expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeLessThan(0.4);
        }
      }
    }
  });

  it('no two are the same pot', () => {
    const heights = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      heights.add(createVessel({ style: 'vase', seed }).height.toFixed(4));
    }
    expect(heights.size).toBe(12);
  });

  it('a jug has a handle and a plain bottle does not', () => {
    const jug = createVessel({ style: 'jug', seed: 1 });
    const bottle = createVessel({ style: 'bottle', seed: 1 });
    expect(jug.object.children.length).toBeGreaterThan(bottle.object.children.length);
    // The handle must stick out past the body, or it is a rib.
    const jugBox = new Box3().setFromObject(jug.object);
    expect(jugBox.max.x).toBeGreaterThan(jug.radius * 0.6);
  });

  it('a candlestick comes with its candle', () => {
    const stick = createVessel({ style: 'candlestick', seed: 1 });
    expect(stick.object.children.length).toBeGreaterThan(1);
    const box = new Box3().setFromObject(stick.object);
    // The candle adds real height above the socket.
    expect(box.max.y).toBeGreaterThan(stick.height * 1.15);
  });

  it('honours an asked-for height, within its own variation', () => {
    const v = createVessel({ style: 'vase', height: 1, seed: 3 });
    expect(v.height).toBeGreaterThan(0.8);
    expect(v.height).toBeLessThan(1.2);
  });
});
