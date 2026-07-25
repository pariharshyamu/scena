import { describe, expect, it } from 'vitest';
import { Box3, Object3D, Raycaster, Vector3 } from 'three';
import {
  createJacuzzi,
  createShower,
  createTub,
  type ShowerState,
  type ShowerStyle,
  type TubStyle,
} from '../src';

const boxOf = (object: Object3D): Box3 => {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
};

const SHOWERS: ShowerStyle[] = ['enclosure', 'overBath', 'open'];
const TUBS: TubStyle[] = ['clawfoot', 'modern', 'sunken', 'hip'];

describe('createShower', () => {
  it.each(SHOWERS)('%s has its head above head height and a drain at the floor', (style) => {
    const shower = createShower({ style, seed: 2 });
    const box = boxOf(shower.object);
    expect(box.max.y).toBeGreaterThan(1.9);
    expect(box.min.y).toBeLessThan(0.02);
  });

  it('water arrives at once but HEAT does not', () => {
    // The whole difference between a shower and a switch. Cold water is
    // instant; steam waits for the warm-up.
    const shower = createShower({ warmUp: 3, seed: 1 });
    expect(shower.state).toBe('off');
    shower.setRunning(true);
    for (let i = 0; i < 30; i++) shower.update(1 / 60);
    expect(shower.state).toBe('warming');
    expect(shower.spray.flow).toBeGreaterThan(0.5); // water already running
    expect(shower.steam.density).toBe(0); // but no heat yet

    for (let i = 0; i < 180; i++) shower.update(1 / 60);
    expect(shower.state).toBe('running');
    expect(shower.steam.density).toBeGreaterThan(0);
  });

  it('warmUp 0 makes it a switch, which is the point of the option', () => {
    const shower = createShower({ warmUp: 0 });
    shower.setRunning(true);
    shower.update(1 / 60);
    expect(shower.state).toBe('running');
  });

  it('reports every state change exactly once', () => {
    const shower = createShower({ warmUp: 1 });
    const seen: ShowerState[] = [];
    shower.onState = (s) => seen.push(s);
    shower.setRunning(true);
    for (let i = 0; i < 120; i++) shower.update(1 / 60);
    shower.setRunning(false);
    for (let i = 0; i < 180; i++) shower.update(1 / 60);
    expect(seen).toEqual(['warming', 'running', 'cooling', 'off']);
  });

  it('the steam outlives the water', () => {
    // A bathroom stays fogged after the shower stops; a room that clears the
    // instant the tap shuts is an extractor fan.
    const shower = createShower({ warmUp: 0.5 });
    shower.setRunning(true);
    for (let i = 0; i < 300; i++) shower.update(1 / 60);
    const hot = shower.steam.density;
    expect(hot).toBeGreaterThan(0.4);
    shower.setRunning(false);
    for (let i = 0; i < 60; i++) shower.update(1 / 60);
    expect(shower.spray.flow).toBe(0);
    expect(shower.steam.density).toBeGreaterThan(hot * 0.5);
  });

  it('only the over-bath style has a curtain, and it stirs', () => {
    expect(createShower({ style: 'enclosure' }).curtain).toBeNull();
    expect(createShower({ style: 'open' }).curtain).toBeNull();
    const over = createShower({ style: 'overBath', seed: 3 });
    expect(over.curtain).not.toBeNull();
    const panel = over.curtain!.object.children.find((c) => c.name === 'panel')!;
    const uniforms = (panel as unknown as {
      material: { userData: { waveUniforms: { uTime: { value: number } } } };
    }).material.userData.waveUniforms;
    over.update(0.4);
    expect(uniforms.uTime.value).toBeCloseTo(0.4, 5);
  });

  it('publishes somewhere to stand, under the head', () => {
    for (const style of SHOWERS) {
      const shower = createShower({ style, seed: 1 });
      shower.object.updateMatrixWorld(true);
      const at = shower.slot.anchor.getWorldPosition(new Vector3());
      expect(Math.abs(at.x)).toBeLessThan(0.2);
      expect(shower.slot.approach).toBeDefined();
    }
  });
});

describe('createTub', () => {
  it.each(TUBS)('%s is long enough to lie in', (style) => {
    const tub = createTub({ style, seed: 2 });
    const size = boxOf(tub.object).getSize(new Vector3());
    expect(Math.max(size.x, size.z)).toBeGreaterThan(0.8);
  });

  it('a sunken tub goes DOWN and the rest go up', () => {
    const sunken = createTub({ style: 'sunken', seed: 1 });
    expect(boxOf(sunken.object).min.y).toBeLessThan(-0.3);
    expect(sunken.rim).toBeLessThan(0.15);
    for (const style of ['clawfoot', 'modern', 'hip'] as TubStyle[]) {
      const tub = createTub({ style, seed: 1 });
      expect(boxOf(tub.object).min.y).toBeGreaterThan(-0.02);
      expect(tub.rim).toBeGreaterThan(0.4);
    }
  });

  it('a hip bath has no taps — you fill it by hand', () => {
    // The medieval end of the axis, same as the laver.
    const hip = createTub({ style: 'hip', seed: 1 });
    expect(hip.taps).toHaveLength(0);
    hip.pour(0.6);
    expect(hip.fill.level).toBeCloseTo(0.6, 6);

    const modern = createTub({ style: 'modern', seed: 1 });
    expect(modern.taps.length).toBeGreaterThan(0);
  });

  it('fills slowly — a bath is not a basin', () => {
    const tub = createTub({ style: 'modern', seed: 1 });
    tub.taps[0].set(true);
    for (let i = 0; i < 60; i++) tub.update(1 / 60);
    // A minute of tap gives a bath, not a second of it.
    expect(tub.fill.level).toBeGreaterThan(0.02);
    expect(tub.fill.level).toBeLessThan(0.4);
  });

  it('drains faster than it fills, because it does', () => {
    const tub = createTub({ style: 'modern', seed: 1 });
    tub.pour(1);
    tub.setDrain(true);
    for (let i = 0; i < 60; i++) tub.update(1 / 60);
    expect(tub.fill.level).toBeLessThan(0.9);
    for (let i = 0; i < 600; i++) tub.update(1 / 60);
    expect(tub.fill.level).toBe(0);
  });

  it('the water sits inside the tub', () => {
    for (const style of TUBS) {
      const tub = createTub({ style, seed: 3 });
      tub.pour(1);
      tub.update(1 / 60);
      tub.object.updateMatrixWorld(true);
      const water = new Box3().setFromObject(tub.fill.object);
      expect(water.max.y).toBeLessThan(tub.rim + 0.02);
      const shell = boxOf(tub.object);
      expect(water.min.x).toBeGreaterThan(shell.min.x);
      expect(water.max.x).toBeLessThan(shell.max.x);
    }
  });

  it('you can see into every one of them from above', () => {
    // The failure this catches is not a bad number, it is a lid. A deck slab
    // across the whole footprint of a sunken tub caps the well it is meant to
    // surround, and the prop renders as a sheet of marble with taps on it.
    // Every numeric test above still passed while that was true.
    for (const style of TUBS) {
      const tub = createTub({ style, seed: 5 });
      tub.pour(1);
      tub.update(1 / 60);
      tub.object.updateMatrixWorld(true);
      const ray = new Raycaster(new Vector3(0, 4, 0), new Vector3(0, -1, 0));
      const first = ray
        .intersectObject(tub.object, true)
        .filter((h) => h.object.type === 'Mesh')[0];
      expect(first, `${style}: nothing under the ray at all`).toBeDefined();
      // The first thing a ray down the middle meets is the water, not a lid
      // sitting above it.
      expect(
        tub.fill.object.getObjectById(first!.object.id) ??
          (first!.object === tub.fill.object ? first!.object : null),
        `${style}: hit "${first!.object.name || first!.object.type}" above the water`
      ).not.toBeNull();
    }
  });

  it('the sunken taps stand on the deck, not over the hole', () => {
    const tub = createTub({ style: 'sunken', length: 1.65, seed: 1 });
    tub.object.updateMatrixWorld(true);
    for (const tap of tub.taps) {
      const at = tap.object.getWorldPosition(new Vector3());
      expect(Math.abs(at.x)).toBeGreaterThan(1.65 / 2);
    }
  });

  it('publishes a reclined slot to lie in', () => {
    const tub = createTub({ style: 'clawfoot', seed: 1 });
    expect(tub.slot.pose).toBe('sleep');
    // Pitched back, not lying flat on the floor.
    expect(tub.slot.anchor.rotation.x).toBeLessThan(0);
    expect(tub.slot.approach).toBeDefined();
  });
});

describe('createJacuzzi', () => {
  it('is a Gathering: seats round a rim with a shared focus', () => {
    const tub = createJacuzzi({ seats: 5, seed: 2 });
    expect(tub.seats).toHaveLength(5);
    expect(tub.focus).toBeDefined();
  });

  it('every seat faces the middle', () => {
    // A slot anchor faces its own +z, so seats placed round a rim without
    // turning them put every bather's back to everyone else. This is the
    // single most repeated mistake in the whole decoration effort.
    const tub = createJacuzzi({ seats: 6, radius: 1.1, seed: 3 });
    tub.object.updateMatrixWorld(true);
    const middle = tub.focus.getWorldPosition(new Vector3());
    for (const seat of tub.seats) {
      const at = seat.anchor.getWorldPosition(new Vector3());
      const facing = seat.anchor.getWorldDirection(new Vector3());
      const toMiddle = middle.clone().sub(at).setY(0).normalize();
      expect(facing.setY(0).normalize().dot(toMiddle)).toBeGreaterThan(0.9);
    }
  });

  it('is open at the top — you can see the water in it', () => {
    // A default CylinderGeometry is CAPPED, so a hot tub built from one is a
    // sealed drum with a lid at rim height, and the water, the jets and the
    // seats all render underneath it. Every other test in this file passed
    // while that was true.
    const tub = createJacuzzi({ seed: 2 });
    tub.update(1 / 60);
    tub.object.updateMatrixWorld(true);
    // Meshes only: steam and jet sprites hang over the water by design and a
    // raw first-hit test would just be measuring the steam.
    const hits = new Raycaster(new Vector3(0, 4, 0), new Vector3(0, -1, 0))
      .intersectObject(tub.object, true)
      .filter((h) => h.object.type === 'Mesh');
    expect(hits.length).toBeGreaterThan(0);
    const water = new Box3().setFromObject(tub.fill.object).max.y;
    // Nothing solid between the sky and the surface of the water.
    expect(hits[0].point.y).toBeLessThan(water + 0.02);
  });

  it('starts full — nobody fills a hot tub from empty on camera', () => {
    const tub = createJacuzzi({ seed: 1 });
    expect(tub.fill.level).toBeGreaterThan(0.5);
  });

  it('the jets churn the surface for as long as they run', () => {
    // The surface settling while the jets are on would be the giveaway.
    const tub = createJacuzzi({ seed: 4 });
    const surface = tub.fill.object.children.find((c) => c.name === 'surface')!;
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: 'void main() {\n#include <common>\n#include <begin_vertex>\n}',
      fragmentShader: 'void main() {\n#include <map_fragment>\n}',
    };
    (surface as unknown as { material: { onBeforeCompile: (s: never, r: never) => void } })
      .material.onBeforeCompile(shader as never, null as never);

    for (let i = 0; i < 120; i++) tub.update(1 / 60);
    expect(shader.uniforms.uFillStir.value).toBeLessThan(0.05); // calm at rest

    tub.setJets(1);
    for (let i = 0; i < 300; i++) tub.update(1 / 60);
    expect(shader.uniforms.uFillStir.value).toBeGreaterThan(0.4);

    tub.setJets(0);
    for (let i = 0; i < 300; i++) tub.update(1 / 60);
    expect(shader.uniforms.uFillStir.value).toBeLessThan(0.05);
  });

  it('the jets are hidden when off, and steam thickens when on', () => {
    const tub = createJacuzzi({ seats: 4, seed: 2 });
    tub.setJets(0);
    for (let i = 0; i < 240; i++) tub.update(1 / 60);
    const idle = tub.steam.density;
    tub.setJets(1);
    for (let i = 0; i < 600; i++) tub.update(1 / 60);
    expect(tub.steam.density).toBeGreaterThan(idle);
    expect(tub.jets).toBe(1);
  });

  it('clamps the jets', () => {
    const tub = createJacuzzi({});
    tub.setJets(9);
    expect(tub.jets).toBe(1);
    tub.setJets(-4);
    expect(tub.jets).toBe(0);
  });
});
