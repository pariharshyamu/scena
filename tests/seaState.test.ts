import { describe, it, expect } from 'vitest';
import {
  createSeaState,
  createOcean,
  douglasFor,
  fetchLimited,
  fullyDeveloped,
  lengthFor,
  periodFor,
  SEA_KINDS,
  type SeaKind,
} from '../src';

const hours = (s: ReturnType<typeof createSeaState>, h: number, step = 60): void => {
  for (let i = 0; i < (h * 3600) / step; i++) s.update(step);
};

describe('the sea remembers and the wind does not', () => {
  it('the wind drops to nothing and the sea does not', () => {
    const s = createSeaState({ kind: 'ocean' });
    s.setWind(20, 250);
    hours(s, 24);
    const gale = s.height;
    expect(gale).toBeGreaterThan(8);
    expect(s.state).toBe('full');

    s.setWind(0);
    s.update(60);
    // ONE MINUTE after the wind dies the sea is exactly as big as it was.
    expect(s.height).toBeCloseTo(gale, 1);
    expect(s.state).toBe('dying');

    hours(s, 1);
    // …and an hour later the wind sea has gone and the SWELL has it all.
    expect(s.windSea.height).toBeLessThan(gale * 0.35);
    expect(s.swell.height).toBeGreaterThan(gale * 0.85);
    expect(s.height, 'the sea forgot').toBeGreaterThan(gale * 0.9);

    hours(s, 23);
    // A DAY LATER there is still most of a gale running under a flat calm.
    expect(s.height).toBeGreaterThan(gale * 0.35);
    expect(s.wind).toBe(0);
  });

  it('the transfer conserves ENERGY, which is not the same as height', () => {
    const s = createSeaState({ kind: 'ocean' });
    s.setWind(18, 90);
    hours(s, 20);
    const before = s.height;
    s.setWind(0);
    // Over the ten minutes the wind sea takes to become swell, the total may
    // not jump — take it off one train linearly and add it to the other in
    // quadrature and most of a gale simply disappears.
    for (let i = 0; i < 10; i++) {
      s.update(60);
      expect(s.height).toBeGreaterThan(before * 0.97);
      expect(s.height).toBeLessThan(before * 1.01);
    }
  });

  it('a swell lengthens as it ages, which is how you know it came far', () => {
    const s = createSeaState({ kind: 'ocean' });
    s.setWind(20, 0);
    hours(s, 18);
    s.setWind(0);
    hours(s, 2);
    const young = s.swell.period;
    hours(s, 48);
    expect(s.swell.period).toBeGreaterThan(young);
    expect(s.swell.length).toBeCloseTo(lengthFor(s.swell.period), 6);
  });

  it('`dying` is a state nothing else in the library can reach', () => {
    const s = createSeaState({ kind: 'ocean' });
    const seen: string[] = [];
    s.onState = (st) => seen.push(st);
    expect(s.state).toBe('calm');
    s.setWind(19, 200);
    hours(s, 30);
    s.setWind(0);
    hours(s, 4);
    expect(seen).toEqual(['building', 'full', 'dying']);
    // …and it is reached with a big sea running and NO wind on it, which is
    // the whole reason the module keeps two trains instead of one number.
    expect(s.height).toBeGreaterThan(3);
    expect(s.wind).toBe(0);
    // No state twice in a row: the band has to hold against its own noise.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('fallsTo agrees with the integrator that has to do it', () => {
    const s = createSeaState({ kind: 'ocean' });
    s.setWind(20, 0);
    hours(s, 26);
    s.setWind(0);
    hours(s, 2);
    const want = s.height * 0.5;
    const said = s.fallsTo(want);
    expect(Number.isFinite(said)).toBe(true);
    hours(s, said / 3600);
    expect(s.height / want).toBeGreaterThan(0.85);
    expect(s.height / want).toBeLessThan(1.15);
    // And it will never fall below what the wind on it now can sustain.
    const t = createSeaState({ kind: 'ocean' });
    t.setWind(14, 0);
    hours(t, 30);
    expect(t.fallsTo(0.2)).toBe(Infinity);
  });
});

describe('you cannot make an ocean sea in a lake', () => {
  it.each(SEA_KINDS)('%s: the same gale, and a different sea', (kind: SeaKind) => {
    const s = createSeaState({ kind });
    s.setWind(20, 0);
    hours(s, 60);
    expect(s.height).toBeCloseTo(s.limit, 0);
    // …and the limit is the FETCH, not the wind, until there is enough water.
    if (kind !== 'ocean') expect(s.limit).toBeLessThan(fullyDeveloped(20) * 0.95);
  });

  it('a lake in a gale is unpleasant and not dangerous', () => {
    const lake = createSeaState({ kind: 'lake' });
    const ocean = createSeaState({ kind: 'ocean' });
    for (const s of [lake, ocean]) s.setWind(20, 0);
    hours(lake, 40);
    hours(ocean, 40);
    expect(lake.height).toBeLessThan(1);
    expect(ocean.height).toBeGreaterThan(8);
    // Blow for a week and the lake will not oblige.
    hours(lake, 168);
    expect(lake.height).toBeLessThan(1);
  });

  it('the published curves are the ones it runs on', () => {
    expect(fullyDeveloped(20)).toBeCloseTo(9.84, 2);
    expect(fetchLimited(20, 3000)).toBeCloseTo(0.56, 2);
    const s = createSeaState({ kind: 'coastal' });
    s.setWind(15, 0);
    expect(s.limit).toBeCloseTo(Math.min(fullyDeveloped(15), fetchLimited(15, 30_000)), 6);
  });

  it('building says how long, and it is hours', () => {
    const s = createSeaState({ kind: 'ocean' });
    s.setWind(20, 0);
    const said = s.building;
    expect(said / 3600).toBeGreaterThan(6);
    hours(s, said / 3600);
    expect(s.height / s.limit).toBeGreaterThan(0.85);
    expect(s.building).toBe(0);
  });

  it('douglas is the scale everybody actually quotes', () => {
    expect(douglasFor(0)).toBe(0);
    expect(douglasFor(0.3)).toBe(2);
    expect(douglasFor(3)).toBe(5);
    expect(douglasFor(20)).toBe(9);
    for (let h = 0; h < 20; h += 0.37) {
      expect(douglasFor(h)).toBeGreaterThanOrEqual(douglasFor(Math.max(0, h - 0.37)));
    }
  });
});

describe('wind sea and swell are two different seas', () => {
  it('they add in QUADRATURE, because energy adds and height does not', () => {
    const s = createSeaState({ kind: 'ocean', height: 3, from: 0 });
    s.setWind(0);
    // Nothing running but the swell.
    expect(s.height).toBeCloseTo(3, 6);
    s.swellIn(0, 3, 12);
    // Two threes make four and a bit, not six.
    expect(s.height).toBeCloseTo(Math.sqrt(18), 3);
  });

  it('confusion peaks where they cross and is nothing where they agree', () => {
    const across = createSeaState({ kind: 'ocean' });
    across.swellIn(180, 4, 13);
    across.setWind(17, 270);
    hours(across, 12);

    const along = createSeaState({ kind: 'ocean' });
    along.swellIn(270, 4, 13);
    along.setWind(17, 270);
    hours(along, 12);

    expect(across.confusion).toBeGreaterThan(0.6);
    expect(along.confusion, 'a swell running with the wind was called confused').toBeLessThan(
      0.15
    );
    // One train alone is never confused, whatever it is doing.
    const one = createSeaState({ kind: 'ocean' });
    one.setWind(20, 0);
    hours(one, 20);
    expect(one.confusion).toBe(0);
  });

  it('a swell from somewhere else keeps its own direction', () => {
    const s = createSeaState({ kind: 'ocean' });
    s.setWind(14, 90);
    hours(s, 10);
    s.swellIn(200, 3.5, 14);
    expect(s.swell.from).toBeGreaterThan(150);
    expect(s.swell.from).toBeLessThan(250);
    expect(Math.abs(s.windSea.from - 90)).toBeLessThan(20);
  });

  it('period and length are the same claim twice', () => {
    const s = createSeaState({ kind: 'shelf' });
    s.setWind(16, 0);
    hours(s, 14);
    expect(s.windSea.period).toBeCloseTo(periodFor(s.windSea.height), 6);
    expect(s.windSea.length).toBeCloseTo(lengthFor(s.windSea.period), 6);
    expect(s.period).toBe(
      s.windSea.height >= s.swell.height ? s.windSea.period : s.swell.period
    );
  });
});

describe('the surface a boat floats on is the surface you can see', () => {
  const spread = (o: ReturnType<typeof createOcean>): number => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 900; i++) {
      const y = o.heightAt(((i % 30) - 15) * 22, (Math.floor(i / 30) - 15) * 22);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    return hi - lo;
  };

  it('the ocean follows the sea state, and by the right amount', () => {
    const s = createSeaState({ kind: 'ocean' });
    const o = createOcean({ sea: () => s.trains, size: 800, segments: 40 });
    s.setWind(18, 270);
    expect(spread(o)).toBeLessThan(0.05);
    hours(s, 10);
    o.update(1 / 60);
    const rough = spread(o);
    // The mesh is driven from the same numbers `heightAt` reads. A boat
    // floating on a sea nobody can see is this library's oldest defect.
    expect(rough).toBeGreaterThan(s.height * 0.6);
    expect(rough).toBeLessThan(s.height * 1.6);
  });

  it('the wavelength is live, not the one it was built with', () => {
    const s = createSeaState({ kind: 'ocean' });
    const o = createOcean({ sea: () => s.trains, size: 800, segments: 40, wavelength: 26 });
    s.setWind(20, 0);
    hours(s, 30);
    o.update(1 / 60);
    // A 30 m sea has a 200 m wavelength. Sampling every 22 m, a surface still
    // running on the 26 m it was constructed with looks like noise; one on the
    // real length is smooth between neighbouring points.
    let jumps = 0;
    let last = o.heightAt(-330, 0);
    for (let i = 1; i < 30; i++) {
      const y = o.heightAt(-330 + i * 22, 0);
      if (Math.abs(y - last) > s.height * 0.9) jumps++;
      last = y;
    }
    expect(jumps, 'the surface is sampling a wavelength nobody asked for').toBeLessThan(4);
  });

  it('a cross sea puts the two trains on different headings', () => {
    const s = createSeaState({ kind: 'ocean' });
    s.swellIn(180, 4, 14);
    s.setWind(18, 270);
    hours(s, 12);
    const o = createOcean({ sea: () => s.trains, size: 800, segments: 40 });
    o.update(1 / 60);
    // Along the swell's own axis the surface must still be moving, because
    // there is a wind sea crossing it — a single-heading ocean would be flat
    // along one line and that is exactly what one wave train looks like.
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 40; i++) {
      const y = o.heightAt(0, (i - 20) * 18);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    expect(hi - lo).toBeGreaterThan(s.height * 0.3);
    expect(s.confusion).toBeGreaterThan(0.4);
  });

  it('an ocean with no sea state behaves exactly as it always did', () => {
    const plain = createOcean({ size: 400, segments: 30, amplitude: 0.8, wavelength: 30 });
    plain.update(1 / 60);
    const s = spread(plain);
    expect(s).toBeGreaterThan(0.3);
    expect(s).toBeLessThan(6);
  });
});

describe('structure', () => {
  it('survives being handed nonsense', () => {
    const s = createSeaState({ kind: 'coastal' });
    s.update(0);
    s.update(-1);
    s.setWind(Number.NaN);
    expect(s.wind).toBe(0);
    s.setWind(-9);
    expect(s.wind).toBe(0);
    s.setWind(12, 800);
    expect(s.windFrom).toBeGreaterThanOrEqual(0);
    expect(s.windFrom).toBeLessThan(360);
    s.swellIn(0, -3, 10);
    expect(s.swell.height).toBe(0);
    expect(Number.isFinite(s.height)).toBe(true);
    expect(s.fallsTo(1e6)).toBe(0);
  });

  it('trains is a live view, not a snapshot', () => {
    const s = createSeaState({ kind: 'ocean' });
    const t = s.trains;
    s.setWind(18, 0);
    hours(s, 6);
    expect(t.windSea.height).toBe(s.windSea.height);
    expect(t.windSea.height).toBeGreaterThan(0.5);
  });
});
