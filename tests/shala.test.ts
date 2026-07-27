import { describe, it, expect } from 'vitest';
import { createShala, SHALA_ERAS, type ShalaEra } from '../src';

const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

describe('the shala', () => {
  it('builds every era, each with its own dressing', () => {
    const dressing: Record<ShalaEra, string> = {
      ashram: 'columns',
      studio: 'mirror',
      rooftop: 'railing',
      retreat: 'pergola',
    };
    for (const era of SHALA_ERAS) {
      const shala = createShala({ seed: 3, era });
      expect(shala.era).toBe(era);
      expect(shala.object.getObjectByName(dressing[era]), era).toBeDefined();
      // Nobody gets another room's furniture.
      for (const other of SHALA_ERAS) {
        if (other !== era) {
          expect(shala.object.getObjectByName(dressing[other]), `${era} has ${other}'s`).toBeUndefined();
        }
      }
      expect(shala.object.getObjectByName('deck')).toBeDefined();
    }
  });

  it('era defaults to a seeded pick, deterministically', () => {
    const a = createShala({ seed: 9 });
    const b = createShala({ seed: 9 });
    expect(a.era).toBe(b.era);
    const eras = new Set(Array.from({ length: 12 }, (_, i) => createShala({ seed: i + 1 }).era));
    expect(eras.size).toBeGreaterThan(1);
  });

  it('lays one mat per body: students + the instructor', () => {
    const shala = createShala({ seed: 3, students: 8 });
    let mats = 0;
    shala.object.traverse((o) => {
      if (o.name === 'mat') mats++;
    });
    expect(mats).toBe(9);
    expect(shala.matSpots()).toHaveLength(9);
    expect(createShala({ seed: 3, students: 3 }).matSpots()).toHaveLength(4);
  });

  it('the class faces the sunrise; the instructor faces the class', () => {
    const sunrise = 0.7;
    const shala = createShala({ seed: 3, era: 'retreat', students: 6, sunrise });
    const spots = shala.matSpots();
    expect(Math.abs(wrapPi(spots[0].facing - (sunrise + Math.PI)))).toBeLessThan(1e-6);
    for (const spot of spots.slice(1)) {
      expect(Math.abs(wrapPi(spot.facing - sunrise))).toBeLessThan(1e-6);
    }
    // And the instructor stands sunward of every student.
    const dx = Math.sin(sunrise);
    const dz = Math.cos(sunrise);
    const along = (s: { x: number; z: number }) => s.x * dx + s.z * dz;
    for (const spot of spots.slice(1)) {
      expect(along(spots[0])).toBeGreaterThan(along(spot) + 1.0);
    }
  });

  it('spots are WORLD-space: they ride the prop transform, facing included', () => {
    const shala = createShala({ seed: 3, era: 'studio', students: 4 });
    const before = shala.matSpots();
    shala.object.position.set(10, 0, -4);
    shala.object.rotation.y = Math.PI / 2;
    const after = shala.matSpots();
    // The instructor's spot, rotated a quarter-turn then translated.
    const b = before[0];
    expect(after[0].x).toBeCloseTo(10 + b.z, 5);
    expect(after[0].z).toBeCloseTo(-4 - b.x, 5);
    expect(Math.abs(wrapPi(after[0].facing - (b.facing + Math.PI / 2)))).toBeLessThan(1e-6);
  });

  it('nobody practices in somebody else\'s space: spots keep their distance', () => {
    const shala = createShala({ seed: 3, students: 8 });
    const spots = shala.matSpots();
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const d = Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z);
        expect(d, `${i}↔${j}`).toBeGreaterThan(1.2);
      }
    }
  });

  it('a platform is a floor, not an obstacle', () => {
    const shala = createShala({ seed: 3 });
    expect(shala.obstacleRadius).toBe(0);
    expect(shala.deckTop).toBeGreaterThan(0.05);
    expect(shala.deckTop).toBeLessThan(0.4);
  });

  it('the focus hangs above the instructor\'s mat', () => {
    const shala = createShala({ seed: 3, era: 'ashram', students: 4, sunrise: 1.1 });
    shala.object.updateWorldMatrix(true, true);
    const spot = shala.matSpots()[0];
    const p = shala.focus.getWorldPosition(new (Object.getPrototypeOf(shala.focus.position).constructor)());
    expect(p.x).toBeCloseTo(spot.x, 4);
    expect(p.z).toBeCloseTo(spot.z, 4);
    expect(p.y).toBeGreaterThan(0.8);
  });

  it('is deterministic: same seed, same room', () => {
    const a = createShala({ seed: 21, era: 'rooftop' });
    const b = createShala({ seed: 21, era: 'rooftop' });
    const spotsA = a.matSpots();
    const spotsB = b.matSpots();
    expect(spotsA).toEqual(spotsB);
    let countA = 0;
    let countB = 0;
    a.object.traverse(() => countA++);
    b.object.traverse(() => countB++);
    expect(countA).toBe(countB);
  });

  it('rows wrap at perRow and the deck grows to hold them', () => {
    const small = createShala({ seed: 3, era: 'retreat', students: 3, perRow: 4 });
    const big = createShala({ seed: 3, era: 'retreat', students: 12, perRow: 4 });
    const depthOf = (s: typeof small) => {
      const spots = s.matSpots();
      const zs = spots.map((p) => p.z);
      return Math.max(...zs) - Math.min(...zs);
    };
    // Twelve students are three rows; three students are one.
    expect(depthOf(big)).toBeGreaterThan(depthOf(small) + 3.5);
  });
});
