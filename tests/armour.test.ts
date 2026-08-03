import { describe, expect, it } from 'vitest';
import {
  ALLOYS,
  ALLOY_NAMES,
  TABOR,
  createArmour,
  mailStrength,
  plateStrength,
} from '../src/props/armour';

describe('the mechanism is indentation, not punching', () => {
  it('uses Tabor’s three times yield as the indentation pressure', () => {
    expect(TABOR).toBe(3);
    for (const a of ALLOY_NAMES) {
      expect(plateStrength({ alloy: a }).pressure).toBeCloseTo(3 * ALLOYS[a].yield, 6);
    }
  });

  it('puts the force over the point’s frontal area', () => {
    const p = plateStrength({ alloy: 'wroughtIron', hole: 0.009 });
    expect(p.force).toBeCloseTo(3 * 200e6 * (Math.PI * 0.009 * 0.009) / 4, 6);
  });

  it('takes the force through the thickness for the energy', () => {
    const p = plateStrength({ thickness: 0.002 });
    expect(p.energy).toBeCloseTo(p.force * 0.002, 9);
  });

  it('beats the punching model by three to five times, on every alloy', () => {
    for (const a of ALLOY_NAMES) {
      const p = plateStrength({ alloy: a });
      expect(p.energy / p.punchingEnergy).toBeGreaterThan(2.5);
      expect(p.energy / p.punchingEnergy).toBeLessThan(6);
    }
  });
});

describe('the plate scales the way the geometry says', () => {
  it('is linear in thickness', () => {
    const a = plateStrength({ thickness: 0.002 });
    const b = plateStrength({ thickness: 0.004 });
    expect(b.energy / a.energy).toBeCloseTo(2, 9);
  });

  it('is quadratic in the hole diameter', () => {
    const a = plateStrength({ hole: 0.006 });
    const b = plateStrength({ hole: 0.012 });
    expect(b.energy / a.energy).toBeCloseTo(4, 9);
  });

  it('orders the alloys by yield strength', () => {
    const sorted = [...ALLOY_NAMES].sort((x, y) => ALLOYS[x].yield - ALLOYS[y].yield);
    const energies = sorted.map((a) => plateStrength({ alloy: a }).energy);
    for (let i = 1; i < energies.length; i++) expect(energies[i]).toBeGreaterThan(energies[i - 1]);
  });

  it('lands 2 mm of armour metal in the band a measurement puts it', () => {
    // Williams put 2 mm plate at about 175 J. This models the hole only, so it
    // must come out UNDER that — and not by more than about three times, or the
    // mechanism is wrong rather than incomplete.
    for (const a of ['wroughtIron', 'mildSteel', 'mediumCarbon'] as const) {
      const e = plateStrength({ alloy: a, thickness: 0.002 }).energy;
      expect(e).toBeLessThan(175);
      expect(e).toBeGreaterThan(58);
    }
  });

  it('weighs what a panel of that metal weighs', () => {
    const p = plateStrength({ alloy: 'mildSteel', thickness: 0.002, width: 0.35, height: 0.45 });
    expect(p.mass).toBeCloseTo(0.35 * 0.45 * 0.002 * 7850, 9);
  });
});

describe('mail is not what stops the arrow', () => {
  const m = mailStrength();

  it('bursts a ring on two sections of wire in tension', () => {
    expect(m.force).toBeCloseTo(2 * ((Math.PI * 0.0012 * 0.0012) / 4) * 300e6, 6);
  });

  it('takes a couple of joules, against an arrow’s hundred', () => {
    expect(m.energy).toBeGreaterThan(0.5);
    expect(m.energy).toBeLessThan(10);
  });

  it('weighs what surviving mail weighs, per square metre', () => {
    expect(m.areal).toBeGreaterThan(6);
    expect(m.areal).toBeLessThan(16);
  });

  it('gets stronger with thicker wire, as the square', () => {
    const thin = mailStrength({ wire: 0.001 });
    const thick = mailStrength({ wire: 0.002 });
    expect(thick.force / thin.force).toBeCloseTo(4, 9);
  });
});

describe('the prop takes joules, not newtons', () => {
  it('holes only at or above its own energy', () => {
    const a = createArmour({ seed: 3 });
    const need = a.strength.energy;
    expect(a.strike(need * 0.999)).toBe(false);
    expect(a.holes).toBe(0);
    expect(a.strike(need * 1.001)).toBe(true);
    expect(a.holes).toBe(1);
  });

  it('accumulates holes and puts them back on reset', () => {
    const a = createArmour({ seed: 4 });
    const need = a.strength.energy * 1.1;
    a.strike(need);
    a.strike(need);
    expect(a.holes).toBe(2);
    a.reset();
    expect(a.holes).toBe(0);
  });

  it('renders something', () => {
    const a = createArmour({ seed: 5 });
    expect(a.group.children.length).toBeGreaterThan(0);
  });
});
