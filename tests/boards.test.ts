import { describe, expect, it } from 'vitest';
import {
  GRADE_RATIO,
  TIMBERS,
  TIMBER_NAMES,
  boardStrength,
  createBoard,
  stackStrength,
} from '../src/props/boards';

describe('the timbers', () => {
  it('are stated in pascals and kilograms per cubic metre', () => {
    for (const t of TIMBER_NAMES) {
      const s = TIMBERS[t];
      // Wood is tens of megapascals in rupture and single-digit gigapascals
      // in stiffness. Anything outside that is a unit mistake, not a timber.
      expect(s.rupture).toBeGreaterThan(20e6);
      expect(s.rupture).toBeLessThan(150e6);
      expect(s.stiffness).toBeGreaterThan(5e9);
      expect(s.stiffness).toBeLessThan(20e9);
      expect(s.density).toBeGreaterThan(300);
      expect(s.density).toBeLessThan(900);
    }
  });

  it('puts oak well above pine and wet pine below it', () => {
    expect(TIMBERS.oak.rupture).toBeGreaterThan(TIMBERS.pine.rupture * 2);
    expect(TIMBERS.pineWet.rupture).toBeLessThan(TIMBERS.pine.rupture);
  });
});

describe('the beam', () => {
  it('agrees with a published measurement', () => {
    // Feld, McNair & Wilk, Scientific American 1979: a 30 x 15 x 2.5 cm pine
    // board, measured at about 3.1 kN. Nothing here was fitted to it.
    const feld = boardStrength({ width: 0.15, thickness: 0.025, span: 0.25 });
    expect(feld.force).toBeGreaterThan(2600);
    expect(feld.force).toBeLessThan(3900);
  });

  it('is quadratic in thickness for FORCE', () => {
    const thin = boardStrength({ thickness: 0.01 });
    const thick = boardStrength({ thickness: 0.02 });
    expect(thick.force / thin.force).toBeCloseTo(4, 6);
  });

  it('...and LINEAR in thickness for energy, which is the surprise', () => {
    const thin = boardStrength({ thickness: 0.01 });
    const thick = boardStrength({ thickness: 0.02 });
    expect(thick.energy / thin.energy).toBeCloseTo(2, 6);
  });

  it('makes a longer span easier to break and a wider board harder', () => {
    expect(boardStrength({ span: 0.4 }).force).toBeLessThan(boardStrength({ span: 0.2 }).force);
    expect(boardStrength({ width: 0.4 }).force).toBeGreaterThan(boardStrength({ width: 0.2 }).force);
  });

  it('orders the timbers the way their moduli do', () => {
    const by = TIMBER_NAMES.map((t) => ({ t, f: boardStrength({ timber: t }).force }));
    by.sort((a, b) => a.f - b.f);
    expect(by[0].t).toBe('pineWet');
    expect(by[by.length - 1].t).toBe('oak');
  });

  it('applies the grade ratio, and says so', () => {
    expect(GRADE_RATIO).toBeGreaterThan(0.2);
    expect(GRADE_RATIO).toBeLessThan(0.6);
    const clear = (2 * TIMBERS.pine.rupture * 0.3 * 0.019 ** 2) / (3 * 0.255);
    expect(boardStrength().force).toBeCloseTo(clear * GRADE_RATIO, 6);
  });
});

describe('a stack', () => {
  it('takes the same energy spaced or glued, and a wildly different force', () => {
    const six = stackStrength(6);
    expect(six.spaced).toBeCloseTo(six.solid, 6);
    // 6x the thickness is 36x the force. That is what the spacers buy.
    expect(six.solidForce / six.spacedForce).toBeCloseTo(36, 4);
  });

  it('scales the spaced energy with the count', () => {
    expect(stackStrength(3).spaced).toBeCloseTo(boardStrength().energy * 3, 9);
  });
});

describe('the prop', () => {
  it('breaks on enough force and not on less', () => {
    const boards = createBoard({ count: 1 });
    expect(boards.state).toBe('intact');
    expect(boards.strike(boards.strength.force * 0.99)).toBe(0);
    expect(boards.state).toBe('intact');
    expect(boards.strike(boards.strength.force * 1.01)).toBe(1);
    expect(boards.state).toBe('broken');
    expect(boards.standing).toBe(0);
  });

  it('does not care where the newtons came from', () => {
    const a = createBoard({ count: 1, seed: 3 });
    const b = createBoard({ count: 1, seed: 3 });
    expect(a.strike(9000)).toBe(b.strike(9000));
  });

  it('resets, and the halves go home', () => {
    const boards = createBoard({ count: 2 });
    boards.strike(boards.strength.force * 40);
    for (let i = 0; i < 60; i++) boards.update(1 / 60);
    expect(boards.standing).toBeLessThan(2);
    boards.reset();
    expect(boards.standing).toBe(2);
    expect(boards.state).toBe('intact');
  });

  it('puts a whole board and two halves in the group for each', () => {
    const boards = createBoard({ count: 3 });
    // Two supports, plus three boards each with a whole and two halves.
    expect(boards.group.children.length).toBe(2 + 3 * 3);
    expect(boards.trigger.radius).toBeGreaterThan(0);
  });

  it('reports the strength it was built with', () => {
    const oak = createBoard({ timber: 'oak', thickness: 0.03 });
    expect(oak.strength.timber).toBe('oak');
    expect(oak.strength.force).toBeCloseTo(boardStrength({ timber: 'oak', thickness: 0.03 }).force, 9);
  });
});
