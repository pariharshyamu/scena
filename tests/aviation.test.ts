import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { createHangar, createHelipad, createPlane, createRunway, createWindsock } from '../src';

const findBlur = (plane: ReturnType<typeof createPlane>): MeshBasicMaterial => {
  let found: MeshBasicMaterial | null = null;
  plane.object.traverse((c: Object3D) => {
    const material = (c as Mesh).material as MeshBasicMaterial | undefined;
    if (material?.blending === 2 && material.transparent && !found && material.opacity !== 0.55) {
      // AdditiveBlending === 2; halos are Sprites, skip via geometry type
      if ((c as Mesh).geometry?.type === 'CircleGeometry') found = material;
    }
  });
  return found!;
};

describe('createPlane', () => {
  it('spins the prop into a blur disc past a third throttle, and back', () => {
    const plane = createPlane({ style: 'prop', seed: 3 });
    const blur = findBlur(plane);
    plane.update(0.5, { throttle: 0.2 });
    expect(blur.opacity).toBe(0); // idle: blades, not a disc
    plane.update(0.5, { throttle: 0.9 });
    expect(blur.opacity).toBeGreaterThan(0.2); // full power: the disc
    plane.update(0.5, { throttle: 0 });
    expect(blur.opacity).toBe(0);
  });

  it('shows its intent: elevator, differential ailerons, rudder', () => {
    const plane = createPlane({ style: 'prop', seed: 2 });
    plane.update(1 / 60, { pitch: 1, roll: 1, yaw: -1 });
    const hinges: Record<string, number> = {};
    // Hinged surfaces are the bare Object3D pivots with a single mesh child.
    plane.object.traverse((c) => {
      if (c.type === 'Object3D' && c.children.length === 1 && (c.children[0] as Mesh).isMesh) {
        hinges[`${c.position.x.toFixed(1)},${c.position.z.toFixed(1)}`] =
          c.rotation.x !== 0 ? c.rotation.x : c.rotation.y;
      }
    });
    const values = Object.values(hinges).filter((v) => v !== 0);
    expect(values.length).toBeGreaterThanOrEqual(3); // elevator + 2 ailerons + rudder moved
    // Differential: somewhere a positive and a negative x-rotation coexist.
    expect(values.some((v) => v > 0)).toBe(true);
    expect(values.some((v) => v < 0)).toBe(true);
  });

  it('the airliner folds its gear away, over time, not instantly', () => {
    const airliner = createPlane({ style: 'airliner', seed: 4 });
    const gear = airliner.object.children.find(
      (c) => c.type === 'Group' && c.children.length >= 6
    )!;
    expect(gear.visible).toBe(true);
    airliner.update(0.4, { gearDown: false });
    expect(gear.visible).toBe(true); // mid-retraction — still out there
    for (let i = 0; i < 10; i++) airliner.update(0.3, { gearDown: false });
    expect(gear.visible).toBe(false); // tucked away
    airliner.update(0.2, { gearDown: true });
    expect(gear.visible).toBe(true); // coming back down
  });

  it('carries nav lights as budget-ready claims under one master switch', () => {
    const plane = createPlane({ style: 'airliner', seed: 5 });
    expect(plane.claims.length).toBeGreaterThanOrEqual(4); // red, green, strobe, beacon
    for (const claim of plane.claims) {
      expect(claim.radius).toBeGreaterThan(0);
      expect(claim.isLit()).toBe(true);
      expect(claim.anchor.parent).toBe(plane.object);
    }
    plane.setLit(false);
    expect(plane.claims.every((c) => c.isLit() === false)).toBe(true);
    expect(plane.lit).toBe(false);
    plane.setLit(true);

    // A pilot's seat exists — ANIMA drops in via the drive pose.
    expect(plane.slots!.some((s) => s.kind === 'pilot' && s.pose === 'drive')).toBe(true);
  });
});

describe('createRunway', () => {
  it('paints the reciprocal on the far end, because that is what runways do', () => {
    expect(createRunway({ number: 27 }).reciprocal).toBe(9);
    expect(createRunway({ number: 9 }).reciprocal).toBe(27);
    expect(createRunway({ number: 36 }).reciprocal).toBe(18);
    expect(createRunway({ number: 18 }).reciprocal).toBe(36);
    expect(createRunway({ number: 1 }).reciprocal).toBe(19);
    const runway = createRunway({ length: 60, number: 27 });
    // Strip + dashes + 12 piano keys + 2 numbers, at least.
    expect(runway.object.children.length).toBeGreaterThan(1 + 8 + 12 + 2 - 1);
  });
});

describe('createWindsock', () => {
  it('swings downwind and droops with a dying wind — testable weather', () => {
    const sock = createWindsock({ seed: 3 });
    const wind = { direction: { x: 1, y: 0 }, strength: 0.9 };
    for (let i = 0; i < 240; i++) sock.update(1 / 60, wind);
    expect(Math.abs(sock.angle - Math.PI / 2)).toBeLessThan(0.05); // pointing +x
    expect(sock.droop).toBeLessThan(0.15); // flying nearly straight

    wind.direction = { x: 0, y: -1 }; // wind swings around
    wind.strength = 0.08; // and dies
    for (let i = 0; i < 400; i++) sock.update(1 / 60, wind);
    expect(Math.abs(Math.abs(sock.angle % (Math.PI * 2)) - Math.PI)).toBeLessThan(0.1);
    expect(sock.droop).toBeGreaterThan(0.8); // limp
  });
});

describe('the rest of the field', () => {
  it('hangar and helipad build with their essentials', () => {
    const hangar = createHangar({ width: 12, depth: 10, seed: 2 });
    expect(hangar.object.children.length).toBeGreaterThanOrEqual(3); // slab, arch, back
    expect(hangar.obstacleRadius).toBeGreaterThan(4);
    const pad = createHelipad({ radius: 3 });
    expect(pad.object.children.length).toBeGreaterThanOrEqual(3); // slab, ring, H
  });
});
