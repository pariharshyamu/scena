import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3 } from 'three';
import { createDeskSet, createFixture, type FixtureStyle } from '../src';

const STYLES: FixtureStyle[] = ['switch', 'thermostat', 'doorbell', 'camera', 'sensor'];

describe('fixtures', () => {
  it.each(STYLES)('%s sits flat on the wall, facing out', (style) => {
    const f = createFixture({ style });
    const box = new Box3().setFromObject(f.object);
    // Origin at the wall face: nothing behind it, and it barely projects.
    expect(box.min.z).toBeGreaterThan(-0.005);
    expect(box.max.z).toBeLessThan(0.12);
    // Small. These are 5–12 cm objects, not furniture.
    expect(box.max.x - box.min.x).toBeLessThan(0.14);
  });

  it.each(STYLES)('%s has an indicator you can drive', (style) => {
    const f = createFixture({ style });
    // Collect ALL emissive materials, not the last one found. Every
    // MeshStandardMaterial has an `emissive` (black by default), so taking
    // the last match picked up the doorbell's camera lens rather than its
    // button and reported the indicator as permanently off.
    const lit = (): Array<{ hex: string; strength: number }> => {
      const out: Array<{ hex: string; strength: number }> = [];
      f.object.traverse((o) => {
        const m = (o as Mesh).material as
          | { emissive?: { getHexString(): string }; emissiveIntensity?: number }
          | undefined;
        if (m?.emissive) out.push({ hex: m.emissive.getHexString(), strength: m.emissiveIntensity ?? 0 });
      });
      return out;
    };
    f.setIndicator(0x44ff88, 2.5);
    expect(lit()).toContainEqual({ hex: '44ff88', strength: 2.5 });
    f.setIndicator(0x112233, 0);
    expect(lit()).toContainEqual({ hex: '112233', strength: 0 });
    expect(lit().some((l) => l.hex === '44ff88')).toBe(false);
  });

  it('puts a slot on the things you touch and not on the ones you do not', () => {
    for (const style of ['switch', 'thermostat', 'doorbell'] as FixtureStyle[]) {
      expect(createFixture({ style }).slot).toBeDefined();
    }
    // You do not walk up to a ceiling camera and press it.
    expect(createFixture({ style: 'camera' }).slot).toBeUndefined();
    expect(createFixture({ style: 'sensor' }).slot).toBeUndefined();
  });

  it('drops the reach slot to the FLOOR, not to the fixture height', () => {
    // The fixture is mounted at 1.15 m; a character stands on the ground in
    // front of it. A slot left at the fixture's own height would have people
    // hovering at chest height to flip a light switch.
    const f = createFixture({ style: 'switch' });
    f.object.position.set(0, f.height, -2);
    f.object.updateWorldMatrix(true, true);
    const at = f.slot!.anchor.getWorldPosition(new Vector3());
    expect(at.y).toBeCloseTo(0, 2);
    expect(at.z).toBeGreaterThan(-1.6);
  });

  it('only gives a screen to the thermostat', () => {
    expect(createFixture({ style: 'thermostat' }).screen).toBeDefined();
    expect(createFixture({ style: 'switch' }).screen).toBeUndefined();
  });

  it('never blocks the way — they are on the wall', () => {
    for (const style of STYLES) expect(createFixture({ style }).obstacleRadius).toBe(0);
  });
});

describe('desk set', () => {
  it('lies on the desk with the keyboard where hands go', () => {
    const set = createDeskSet();
    const box = new Box3().setFromObject(set.object);
    expect(box.min.y).toBeGreaterThan(-0.005);
    expect(box.max.y).toBeLessThan(0.12); // a mug is the tallest thing here
    set.object.updateWorldMatrix(true, true);
    const home = set.keyboard.getWorldPosition(new Vector3());
    expect(home.y).toBeGreaterThan(0);
    expect(home.y).toBeLessThan(0.05);
  });

  it('puts the mouse to one side of the keyboard, not on top of it', () => {
    const set = createDeskSet();
    set.object.updateWorldMatrix(true, true);
    const k = set.keyboard.getWorldPosition(new Vector3());
    const m = set.mouse.getWorldPosition(new Vector3());
    expect(Math.abs(m.x - k.x)).toBeGreaterThan(0.24);
  });

  it('never squares the keyboard to the desk', () => {
    // Two seeds, two slightly different angles: nobody lines their keyboard
    // up with the edge of the desk, and a row of identical desks that all do
    // is instantly readable as set dressing.
    const angle = (seed: number): number => {
      const set = createDeskSet({ seed });
      let y = 0;
      set.object.traverse((o) => {
        if ((o as Mesh).isMesh && o.rotation.y !== 0) y = o.rotation.y;
      });
      return y;
    };
    expect(angle(1)).not.toBe(0);
    expect(angle(1)).not.toBe(angle(7));
  });
});
