import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  createSeamark,
  geographicRange,
  luminousRange,
  MARK_KINDS,
  SECTOR_TRANSMISSION,
  NM,
  type MarkKind,
} from '../src';

const deg = (d: number): number => (d * Math.PI) / 180;
/** Put an observer `nm` miles off on a given bearing from the light. */
const off = (
  m: ReturnType<typeof createSeamark>,
  nm: number,
  bearingDeg = 0,
  eye = 4
) => {
  const a = deg(bearingDeg);
  return m.sightedFrom(Math.sin(a) * nm * NM, -Math.cos(a) * nm * NM, eye);
};

describe('the curvature decides it, and the lamp does not', () => {
  it('geographic range is a function of two heights and nothing else', () => {
    // 2.08(√H + √h) nautical miles, refraction included.
    expect(geographicRange(40, 12) / NM).toBeCloseTo(20.4, 1);
    expect(geographicRange(0, 0)).toBe(0);
    // It does not mention the lamp, the visibility, the weather or the boat.
    expect(geographicRange(40, 12)).toBe(geographicRange(12, 40));
  });

  it('a hundredfold lamp buys under two miles, and then nothing at all', () => {
    const seen = (I: number): number =>
      createSeamark({ kind: 'flashing', intensity: I }).sightedFrom(0, 100, 12).range / NM;
    const a = seen(200_000);
    const b = seen(400_000);
    const c = seen(800_000);
    const d = seen(20_000_000);
    expect(a).toBeCloseTo(18.5, 0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    // …and there it stops dead, on the horizon, for ever.
    expect(d).toBeCloseTo(c, 5);
    expect(d - a).toBeLessThan(2);
    expect(d).toBeCloseTo(geographicRange(40, 12) / NM, 5);
  });

  it('says which of the two limits is biting, and it changes with her eye', () => {
    const m = createSeamark({ kind: 'flashing' });
    const low = m.sightedFrom(0, 100, 1.5);
    const high = m.sightedFrom(0, 100, 12);
    expect(low.limitedBy).toBe('horizon');
    expect(high.limitedBy).toBe('lamp');
    // The same lamp, the same night, and a different answer AND a different
    // reason for it.
    expect(high.range).toBeGreaterThan(low.range);
  });

  it('with a feeble light, raising your eye buys nothing whatever', () => {
    const b = createSeamark({ kind: 'bonfire' });
    const ranges = [1.5, 12, 30, 100].map((h) => b.sightedFrom(0, 100, h).range);
    for (const r of ranges) expect(r).toBeCloseTo(ranges[0], 5);
    expect(b.sightedFrom(0, 100, 100).limitedBy).toBe('lamp');
  });

  it('range is the SMALLER of the two, never the larger', () => {
    for (const kind of MARK_KINDS) {
      for (const eye of [1.5, 4, 12, 30]) {
        const s = createSeamark({ kind }).sightedFrom(0, 100, eye);
        expect(s.range).toBeCloseTo(Math.min(s.geographic, s.luminous), 5);
      }
    }
  });

  it('fog eats the lamp and the horizon does not care', () => {
    const m = createSeamark({ kind: 'flashing' });
    const geo = m.sightedFrom(0, 100, 12).geographic;
    let last = Infinity;
    for (const v of [20, 10, 5, 2, 1, 0.5]) {
      m.setVisibility(v);
      const s = m.sightedFrom(0, 100, 12);
      expect(s.geographic, 'the horizon moved when the weather did').toBeCloseTo(geo, 5);
      expect(s.luminous).toBeLessThan(last);
      last = s.luminous;
    }
    expect(m.sightedFrom(0, 100, 12).range / NM).toBeLessThan(2);
  });

  it('luminous range solves Allard rather than guessing', () => {
    expect(luminousRange(200_000, 10) / NM).toBeCloseTo(18.5, 0);
    expect(luminousRange(1_000, 10) / NM).toBeCloseTo(7.1, 0);
    // More lamp is always more range — it is just not always more SEEING.
    expect(luminousRange(400_000, 10)).toBeGreaterThan(luminousRange(200_000, 10));
    expect(luminousRange(0, 10)).toBe(0);
  });
});

describe('coming up on it', () => {
  const lit = (kind: MarkKind = 'flashing') => {
    const m = createSeamark({ kind, seed: 4 });
    return m;
  };

  it('runs dark → loom → raising → showing, in that order', () => {
    const m = lit();
    const geo = m.sightedFrom(0, 100, 4).geographic / NM;
    expect(off(m, geo * 1.4).state).toBe('dark');
    expect(off(m, geo * 1.1).state).toBe('loom');
    expect(off(m, geo * 0.97).state).toBe('raising');
    expect(off(m, geo * 0.5).state).toBe('showing');
  });

  it('the loom is a beyond-the-HORIZON thing, and a faint light has none', () => {
    // Nothing over the hill, because there is no hill.
    const b = createSeamark({ kind: 'bonfire' });
    const r = b.sightedFrom(0, 100, 12).range / NM;
    expect(b.sightedFrom(0, 100, 12).limitedBy).toBe('lamp');
    expect(off(b, r * 1.05, 0, 12).state).toBe('dark');
    expect(off(b, r * 0.5, 0, 12).state).toBe('showing');
  });

  it('dipping distance is a fix, and it grows with her eye', () => {
    const m = lit();
    expect(m.dips(4)).toBeCloseTo(geographicRange(m.height, 4), 5);
    expect(m.dips(12)).toBeGreaterThan(m.dips(4));
    expect(m.dips(4)).toBeGreaterThan(m.dips(1.5));
    // Standing up in an open boat is worth better than a mile.
    expect((m.dips(2.5) - m.dips(1.0)) / NM).toBeGreaterThan(0.6);
  });
});

describe('in range and lit are different questions', () => {
  it('a flashing light is dark for most of its period', () => {
    const m = createSeamark({ kind: 'flashing', seed: 1 });
    let on = 0;
    const steps = 600;
    for (let i = 0; i < steps; i++) {
      m.update(0.05);
      if (m.showing) on++;
    }
    // Fl(3) 15s: three flashes of 0.4 s in fifteen.
    expect(on / steps).toBeLessThan(0.15);
    expect(on / steps).toBeGreaterThan(0.03);
  });

  it('…so inRange holds steady while visible flickers', () => {
    const m = createSeamark({ kind: 'flashing', seed: 1 });
    let inRange = 0;
    let visible = 0;
    for (let i = 0; i < 400; i++) {
      m.update(0.05);
      const s = off(m, 5);
      if (s.inRange) inRange++;
      if (s.visible) visible++;
    }
    expect(inRange).toBe(400);
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(120);
  });

  it('an occulting light is the other way round: lit most of the time', () => {
    const m = createSeamark({ kind: 'sectored', seed: 1 });
    let on = 0;
    for (let i = 0; i < 640; i++) {
      m.update(0.05);
      if (m.showing) on++;
    }
    expect(on / 640).toBeGreaterThan(0.6);
  });

  it('a fixed light is never dark, and has no period at all', () => {
    for (const kind of ['bonfire', 'harbour'] as MarkKind[]) {
      const m = createSeamark({ kind });
      expect(m.period).toBe(Infinity);
      expect(m.character).toBe('F');
      for (let i = 0; i < 200; i++) {
        m.update(0.05);
        expect(m.showing, kind).toBe(true);
      }
      expect(m.phase).toBe(0);
    }
  });

  it('reports what it is doing before anybody has stepped it', () => {
    // Built mid-character and reported as lit is the same defect the trim
    // track had, three modules along.
    const m = createSeamark({ kind: 'flashing', seed: 9 });
    expect(typeof m.showing).toBe('boolean');
    const before = m.showing;
    m.update(1e-9);
    expect(m.showing).toBe(before);
  });
});

describe('what tells you it is that light and not another one', () => {
  it('the axis is identity, not power', () => {
    const rows = MARK_KINDS.map((k) => {
      const m = createSeamark({ kind: k });
      return { k, charted: m.charted, id: m.identifiable, sectors: m.sectors.length };
    });
    // A fire on a headland is not on any chart, and a burning barn looks the
    // same. A plain fixed light IS charted and still cannot be told from the
    // next fixed light along, which is why characters exist.
    expect(rows[0]).toMatchObject({ charted: false, id: false });
    expect(rows[1]).toMatchObject({ charted: true, id: false });
    expect(rows[2]).toMatchObject({ charted: true, id: true });
    expect(rows[3]).toMatchObject({ charted: true, id: true, sectors: 3 });
  });

  it('and it is NOT monotone in brightness', () => {
    // The one that tells you the most is not the one with the biggest lamp.
    const flashing = createSeamark({ kind: 'flashing' });
    const sectored = createSeamark({ kind: 'sectored' });
    expect(sectored.intensity).toBeLessThan(flashing.intensity);
    expect(sectored.height).toBeLessThan(flashing.height);
    expect(sectored.sectors.length).toBeGreaterThan(0);
  });
});

describe('a sectored light tells you where YOU are', () => {
  it('white in the fairway and colour over the dangers', () => {
    const m = createSeamark({ kind: 'sectored', seed: 6 });
    expect(off(m, 4, 180).sector?.colour).toBe('white');
    expect(off(m, 4, 180).safe).toBe(true);
    expect(off(m, 4, 60).sector?.colour).toBe('green');
    expect(off(m, 4, 60).safe).toBe(false);
    expect(off(m, 4, 270).sector?.colour).toBe('red');
    expect(off(m, 4, 270).safe).toBe(false);
  });

  it('the boundaries are where they are said to be', () => {
    const m = createSeamark({ kind: 'sectored', seed: 6 });
    expect(off(m, 4, 174).sector?.colour).toBe('white');
    expect(off(m, 4, 186).sector?.colour).toBe('white');
    expect(off(m, 4, 190).sector?.colour).toBe('red');
    expect(off(m, 4, 170).sector?.colour).toBe('green');
    // The green sector wraps through north without a seam.
    expect(off(m, 4, 359).sector?.colour).toBe('green');
    expect(off(m, 4, 1).sector?.colour).toBe('green');
  });

  it('THE RED SECTOR IS SHORTER THAN THE WHITE ONE, always', () => {
    // Coloured glass eats three quarters of the lamp, so the same light does
    // not reach as far where it matters most. Charts draw the arcs at
    // different radii for exactly this reason.
    const m = createSeamark({ kind: 'sectored', seed: 6 });
    const white = off(m, 4, 180, 12);
    const red = off(m, 4, 270, 12);
    const green = off(m, 4, 60, 12);
    expect(red.luminous).toBeLessThan(white.luminous);
    expect(green.luminous).toBeLessThan(red.luminous);
    expect(SECTOR_TRANSMISSION.white).toBe(1);
    expect(SECTOR_TRANSMISSION.green).toBeLessThan(SECTOR_TRANSMISSION.red);
  });

  it('a light with no sectors says nothing about where you are', () => {
    const m = createSeamark({ kind: 'flashing' });
    const s = off(m, 4, 123);
    expect(s.sector).toBeNull();
    // `null` and not `true`: it is not saying you are safe, it is not saying
    // anything at all, and those are very different things to hand a caller.
    expect(s.safe).toBeNull();
  });

  it('sectors can be added by hand, in bearings outward from the light', () => {
    const m = createSeamark({ kind: 'harbour' });
    expect(m.sectors.length).toBe(0);
    m.sector('leading', deg(80), deg(100), 'white');
    m.sector('foul', deg(100), deg(80), 'red');
    expect(off(m, 2, 90).safe).toBe(true);
    expect(off(m, 2, 270).safe).toBe(false);
    expect(m.sectorAt(deg(90))?.name).toBe('leading');
  });

  it('bearing is measured outward from the light, clockwise from north', () => {
    const m = createSeamark({ kind: 'flashing' });
    m.object.position.set(0, 0, 0);
    // Due north of the light is −z.
    expect(m.sightedFrom(0, -1000, 4).bearing).toBeCloseTo(0, 5);
    expect(m.sightedFrom(1000, 0, 4).bearing).toBeCloseTo(Math.PI / 2, 5);
    expect(m.sightedFrom(0, 1000, 4).bearing).toBeCloseTo(Math.PI, 5);
    expect(m.sightedFrom(-1000, 0, 4).bearing).toBeCloseTo((3 * Math.PI) / 2, 5);
  });

  it('follows the tower when the tower moves', () => {
    const m = createSeamark({ kind: 'flashing' });
    m.object.position.set(500, 0, -200);
    m.object.updateMatrixWorld(true);
    const s = m.sightedFrom(500, -200 - 3000, 4);
    expect(s.distance).toBeCloseTo(3000, 0);
    expect(s.bearing).toBeCloseTo(0, 3);
  });
});

describe('when you cannot see it', () => {
  it('the fog signal answers the visibility, not the lamp', () => {
    const m = createSeamark({ kind: 'flashing' });
    m.setVisibility(10);
    let heard = false;
    for (let i = 0; i < 1200; i++) {
      m.update(0.05);
      if (m.sounding) heard = true;
    }
    expect(heard, 'she was blowing in clear weather').toBe(false);

    m.setVisibility(0.5);
    // Worked out on demand: no step needed between setting it and asking.
    let count = 0;
    for (let i = 0; i < 1200; i++) {
      m.update(0.05);
      if (m.sounding) count++;
    }
    expect(count).toBeGreaterThan(0);
    expect(m.audibleRange).toBeGreaterThan(0);
  });

  it('a bonfire has no fog signal, because it has nothing at all', () => {
    const b = createSeamark({ kind: 'bonfire' });
    expect(b.fogSignal).toBe(Infinity);
    b.setVisibility(0.2);
    b.update(1);
    expect(b.sounding).toBe(false);
    expect(b.audibleRange).toBe(0);
  });
});

describe('the picture', () => {
  it('every kind builds, with a lamp and a halo', () => {
    for (const kind of MARK_KINDS) {
      const m = createSeamark({ kind });
      expect(m.object.name).toBe(`seamark:${kind}`);
      expect(m.object.getObjectByName('seamark:lamp')).toBeTruthy();
      expect(m.object.getObjectByName('seamark:halo')).toBeTruthy();
      expect(m.slots.length).toBe(1);
      expect(m.obstacleRadius).toBeGreaterThan(0);
    }
  });

  it('the lamp is at the focal plane the range is worked out from', () => {
    // Numbers agreeing while the geometry is a storey out is the commonest
    // defect in this library, so the lamp has to BE where the arithmetic
    // says it is.
    for (const kind of MARK_KINDS) {
      const m = createSeamark({ kind });
      m.object.position.set(0, 0, 0);
      m.object.updateMatrixWorld(true);
      const lamp = m.object.getObjectByName('seamark:lamp')!;
      const y = lamp.getWorldPosition(new Vector3()).y;
      expect(Math.abs(y - m.height) / m.height, kind).toBeLessThan(0.15);
    }
  });

  it('the lamp goes dark with the character', () => {
    const m = createSeamark({ kind: 'flashing', seed: 1 });
    const halo = m.object.getObjectByName('seamark:halo')!;
    let sawLit = false;
    let sawDark = false;
    for (let i = 0; i < 600; i++) {
      m.update(0.05);
      if (m.showing) {
        sawLit = true;
        expect(halo.visible).toBe(true);
      } else {
        sawDark = true;
        expect(halo.visible).toBe(false);
      }
    }
    expect(sawLit && sawDark).toBe(true);
  });

  it('the sector chart is off until it is asked for', () => {
    const m = createSeamark({ kind: 'sectored' });
    const chart = m.object.getObjectByName('seamark:sectors')!;
    expect(chart.visible, 'nothing at sea looks like this').toBe(false);
    expect(chart.children.length).toBe(3);
    m.showSectors(true);
    expect(chart.visible).toBe(true);
    m.showSectors(false);
    expect(chart.visible).toBe(false);
  });

  it('…and a light with no sectors cannot be asked', () => {
    const m = createSeamark({ kind: 'flashing' });
    m.showSectors(true);
    expect(m.object.getObjectByName('seamark:sectors')!.visible).toBe(false);
  });

  it('a taller tower is a taller tower', () => {
    const short = createSeamark({ kind: 'flashing', height: 15 });
    const tall = createSeamark({ kind: 'flashing', height: 60 });
    expect(tall.height).toBe(60);
    expect(tall.dips(4)).toBeGreaterThan(short.dips(4));
  });
});

describe('rubbish in', () => {
  it('a NaN visibility or a zero step changes nothing', () => {
    const m = createSeamark({ kind: 'flashing' });
    const before = m.visibility;
    m.setVisibility(Number.NaN);
    expect(m.visibility).toBe(10);
    m.setVisibility(-5);
    expect(m.visibility).toBeGreaterThan(0);
    m.setVisibility(before);
    const lit = m.showing;
    m.update(0);
    m.update(-3);
    expect(m.showing).toBe(lit);
  });

  it('an observer standing on the light does not divide by nothing', () => {
    const m = createSeamark({ kind: 'flashing' });
    const s = m.sightedFrom(0, 0, 4);
    expect(s.distance).toBe(0);
    expect(Number.isFinite(s.range)).toBe(true);
    expect(s.state).toBe('showing');
    expect(s.inRange).toBe(true);
  });

  it('a negative height of eye is a height of nothing, not an error', () => {
    const m = createSeamark({ kind: 'flashing' });
    const s = m.sightedFrom(0, 100, -4);
    expect(Number.isFinite(s.geographic)).toBe(true);
    expect(s.geographic).toBeCloseTo(geographicRange(m.height, 0), 5);
  });
});
