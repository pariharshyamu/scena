import { describe, expect, it } from 'vitest';
import { BufferAttribute, Mesh, Points } from 'three';
import { createLightShafts } from '../src';

describe('createLightShafts', () => {
  it('merges every beam into one mesh, and the motes into one cloud', () => {
    const shafts = createLightShafts({ count: 6, dust: 12, seed: 3 });
    const meshes = shafts.group.children.filter((c) => (c as Mesh).isMesh);
    const clouds = shafts.group.children.filter((c) => (c as Points).isPoints);
    expect(meshes.length).toBe(1); // the whole grove is one draw call
    expect(clouds.length).toBe(1);
    const positions = (clouds[0] as Points).geometry.getAttribute('position');
    expect(positions.count).toBe(6 * 12);
    // Two crossed cards, four verts each, per shaft.
    const shaftVerts = (meshes[0] as Mesh).geometry.getAttribute('position');
    expect(shaftVerts.count).toBe(6 * 2 * 4);

    const dustless = createLightShafts({ count: 3, dust: 0 });
    expect(dustless.group.children.filter((c) => (c as Points).isPoints).length).toBe(0);
  });

  it('motes drift down the beam and wrap back to the canopy', () => {
    const shafts = createLightShafts({ count: 2, dust: 10, seed: 5 });
    const cloud = shafts.group.children.find((c) => (c as Points).isPoints) as Points;
    const attribute = cloud.geometry.getAttribute('position') as BufferAttribute;
    const before = Float32Array.from(attribute.array as Float32Array);
    shafts.update(0.5);
    const after = attribute.array as Float32Array;
    let moved = 0;
    for (let i = 0; i < before.length; i++) {
      if (Math.abs(after[i] - before[i]) > 1e-5) moved++;
    }
    expect(moved).toBeGreaterThan(before.length / 3); // most coordinates shifted
    // Long-run: everything stays inside the shaft volume (no runaways).
    for (let i = 0; i < 600; i++) shafts.update(1 / 30);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < after.length; i += 3) {
      minY = Math.min(minY, after[i]);
      maxY = Math.max(maxY, after[i]);
    }
    expect(minY).toBeGreaterThanOrEqual(0);
    expect(maxY).toBeLessThanOrEqual(13.5); // length 13 + headroom
  });

  it('follows the sun: full at noon, gone at dusk, back at dawn', () => {
    const sky = { sunElevation: 0.9 };
    const shafts = createLightShafts({ cycle: sky, strength: 0.2, seed: 2 });
    shafts.update(0);
    expect(shafts.strength).toBeCloseTo(0.2); // clamped full sun
    sky.sunElevation = 0.2;
    shafts.update(0);
    expect(shafts.strength).toBeCloseTo(0.2 * 0.44, 3); // low sun, faint beams
    sky.sunElevation = -0.3;
    shafts.update(0);
    expect(shafts.strength).toBe(0); // no sun, no shafts
    sky.sunElevation = 0.6;
    shafts.update(0);
    expect(shafts.strength).toBeGreaterThan(0.19);

    // setStrength composes with the cycle rather than fighting it.
    shafts.setStrength(0.4);
    expect(shafts.strength).toBeCloseTo(0.4);
    sky.sunElevation = -1;
    shafts.update(0);
    expect(shafts.strength).toBe(0);
  });

  it('is seeded: the same grove twice is the same grove', () => {
    const first = createLightShafts({ count: 5, dust: 8, seed: 11 });
    const second = createLightShafts({ count: 5, dust: 8, seed: 11 });
    const other = createLightShafts({ count: 5, dust: 8, seed: 12 });
    const verts = (shafts: typeof first): Float32Array =>
      (shafts.group.children.find((c) => (c as Mesh).isMesh) as Mesh).geometry.getAttribute(
        'position'
      ).array as Float32Array;
    expect(Array.from(verts(first))).toEqual(Array.from(verts(second)));
    expect(Array.from(verts(first))).not.toEqual(Array.from(verts(other)));
  });
});
