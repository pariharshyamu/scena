import { describe, expect, it } from 'vitest';
import { Box3, Group, PointLight, Vector3 } from 'three';
import {
  createCladding,
  createGate,
  createModernWindow,
  createPergola,
  createPlanter,
  createRailing,
} from '../src';

const bounds = (object: Group): Vector3 => new Box3().setFromObject(object).getSize(new Vector3());

describe('modern components', () => {
  it('railing styles build distinct infill and span their length', () => {
    const bars = createRailing({ style: 'bars', length: 4 });
    const cable = createRailing({ style: 'cable', length: 4 });
    const glass = createRailing({ style: 'glass', length: 4 });
    const panel = createRailing({ style: 'panel', length: 4 });
    expect(bars.object.children.length).toBeGreaterThan(cable.object.children.length);
    expect(panel.object.children.length).toBeLessThan(bars.object.children.length);
    for (const railing of [bars, cable, glass, panel]) {
      expect(bounds(railing.object).x).toBeGreaterThan(3.9);
      expect(railing.obstacleRadius).toBe(2);
    }
    // Glass bays are transparent panes.
    const pane = glass.object.children.find((c) => (c as { material?: { transparent?: boolean } } & Group)
      && ((c as unknown as { material?: { transparent?: boolean } }).material?.transparent));
    expect(pane).toBeDefined();
  });

  it('windows expose their pane and honor mullions and sliding', () => {
    const fixed = createModernWindow({ mullions: [3, 2] });
    expect(fixed.pane.transparent).toBe(true);
    expect(fixed.pane.emissiveIntensity).toBeGreaterThan(0.5); // nightGlow default
    expect(fixed.obstacleRadius).toBe(0);
    const plainCount = createModernWindow({ mullions: [1, 1] }).object.children.length;
    expect(fixed.object.children.length).toBeGreaterThan(plainCount);
    const sliding = createModernWindow({ style: 'sliding' });
    // Two leaves at different depths.
    const leaves = sliding.object.children.filter((c) => c instanceof Group);
    expect(leaves.length).toBe(2);
    expect(leaves[0].position.z).not.toBe(leaves[1].position.z);
  });

  it('gates open: swing leaves rotate, sliders translate', () => {
    const swing = createGate({ style: 'slat', width: 3 });
    const leaves = swing.object.children.filter((c) => c instanceof Group) as Group[];
    expect(leaves.length).toBe(2);
    const before = leaves.map((l) => l.rotation.y);
    swing.setOpen(1);
    leaves.forEach((l, i) => expect(Math.abs(l.rotation.y - before[i])).toBeGreaterThan(1));

    const slider = createGate({ sliding: true, width: 3, open: 0 });
    const leaf = slider.object.children.find((c) => c instanceof Group) as Group;
    const x0 = leaf.position.x;
    slider.setOpen(1);
    expect(leaf.position.x).toBeLessThan(x0 - 2);
  });

  it('gate pillars carry a glowing cap and a budgeted lamp', () => {
    const gate = createGate({ pillars: true });
    let lights = 0;
    gate.object.traverse((c) => { if ((c as PointLight).isPointLight) lights++; });
    expect(lights).toBe(1);
    const bare = createGate({ pillars: false });
    let bareLights = 0;
    bare.object.traverse((c) => { if ((c as PointLight).isPointLight) bareLights++; });
    expect(bareLights).toBe(0);
  });

  it('cladding and pergola are walk-through; planter is not', () => {
    expect(createCladding({ style: 'slats' }).obstacleRadius).toBe(0);
    expect(createCladding({ style: 'stone' }).object.children.length).toBe(1);
    expect(createPergola().obstacleRadius).toBe(0);
    expect(createPergola().object.children.length).toBeGreaterThan(8); // posts+beams+rafters
    const planter = createPlanter({ length: 2 });
    expect(planter.obstacleRadius).toBe(1);
    expect(bounds(planter.object).x).toBeGreaterThan(1.9);
  });

  it('louvers angle their slats where plain slats stay flat', () => {
    const slats = createCladding({ style: 'slats', seed: 2 });
    const louvers = createCladding({ style: 'louvers', seed: 2 });
    const yRot = (prop: { object: Group }): number =>
      Math.max(...prop.object.children.map((c) => Math.abs(c.rotation.y)));
    expect(yRot(slats)).toBe(0);
    expect(yRot(louvers)).toBeGreaterThan(0.5);
  });
});
