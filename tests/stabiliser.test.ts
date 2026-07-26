import { describe, it, expect } from 'vitest';
import {
  createStabilisers,
  createDeckedShip,
  createOcean,
  dampingAt,
  STABILISER_KINDS,
  type StabiliserKind,
} from '../src';

const runOut = (s: ReturnType<typeof createStabilisers>): void => {
  s.deploy(true);
  for (let i = 0; i < 400; i++) s.update(1);
};

describe('the only thing here that stops working when you stop', () => {
  it('a fin is a wing: no way, no lift, no stabiliser', () => {
    const fins = createStabilisers({ kind: 'activeFin' });
    runOut(fins);
    expect(fins.out).toBeCloseTo(1, 6);

    fins.setWay(0);
    fins.update(1 / 60);
    expect(fins.damping, 'a stopped ship was still being steadied').toBeLessThan(0.01);
    expect(fins.biting).toBe(false);

    fins.setWay(10);
    fins.update(1 / 60);
    expect(fins.damping).toBeGreaterThan(fins.rated * 0.7);
    expect(fins.biting).toBe(true);
    // …and she is still carrying them while they do nothing, which is the
    // whole complaint: the drag does not stop when the lift does.
    fins.setWay(0);
    fins.update(1 / 60);
    expect(fins.drag).toBeGreaterThan(0);
  });

  it('lift goes as the SQUARE of the speed, so it is a knee and not a cliff', () => {
    const half = dampingAt('activeFin', 3.8);
    const rated = dampingAt('activeFin', 1e6);
    // At her biting speed she is managing half of what she is rated at, by
    // construction — and the curve either side of it is smooth.
    expect(half / rated).toBeCloseTo(0.5, 2);
    const climb = [0, 1, 2, 4, 8, 16].map((v) => dampingAt('activeFin', v));
    for (let i = 1; i < climb.length; i++) expect(climb[i]).toBeGreaterThan(climb[i - 1]);
    // No step anywhere: the biggest jump between neighbouring samples must be
    // a fraction of the range, or she goes from rolling to steady in a frame.
    const steps = climb.slice(1).map((v, i) => v - climb[i]);
    expect(Math.max(...steps)).toBeLessThan(rated * 0.45);
  });

  it('a bilge keel does not care, and a gyro does not either', () => {
    for (const kind of ['bilgeKeel', 'gyro'] as StabiliserKind[]) {
      const s = createStabilisers({ kind });
      runOut(s);
      s.setWay(0);
      s.update(1 / 60);
      const stopped = s.damping;
      s.setWay(12);
      s.update(1 / 60);
      expect(s.damping, `${kind}: it wanted way after all`).toBeCloseTo(stopped, 6);
      expect(stopped).toBeGreaterThan(0.2);
    }
  });

  it('deploying a bilge keel is a silent no-op, and that IS the era axis', () => {
    const keel = createStabilisers({ kind: 'bilgeKeel' });
    expect(keel.out).toBe(1);
    keel.deploy(false);
    for (let i = 0; i < 400; i++) keel.update(1);
    expect(keel.out, 'it housed a thing welded to her hull').toBe(1);
    expect(keel.ordered).toBe(true);

    // And a fin most certainly is not welded on.
    const fin = createStabilisers({ kind: 'fin' });
    expect(fin.out).toBe(0);
    fin.deploy(true);
    fin.update(1);
    expect(fin.out).toBeGreaterThan(0);
    expect(fin.out, 'they ran out in a second').toBeLessThan(0.2);
  });

  it('comfort is not free, and the bill is in metres a second', () => {
    for (const kind of STABILISER_KINDS) {
      const s = createStabilisers({ kind });
      s.setWay(9);
      for (let i = 0; i < 400; i++) s.update(1);
      const housed = s.drag;
      runOut(s);
      expect(s.drag, `${kind}: running them out was free`).toBeGreaterThanOrEqual(housed);
    }
    // A gyro is the one that costs her nothing at all — because it is not in
    // the water.
    const gyro = createStabilisers({ kind: 'gyro' });
    runOut(gyro);
    gyro.setWay(9);
    gyro.update(1 / 60);
    expect(gyro.drag).toBe(0);

    const fins = createStabilisers({ kind: 'activeFin' });
    fins.setWay(9);
    for (let i = 0; i < 400; i++) fins.update(1);
    const housed = fins.drag;
    runOut(fins);
    expect(fins.drag).toBeGreaterThan(housed * 3);
  });

  it('running them out takes long enough to be a decision', () => {
    const fins = createStabilisers({ kind: 'activeFin' });
    fins.deploy(true);
    let t = 0;
    while (fins.out < 0.99 && t < 600) {
      fins.update(1);
      t += 1;
    }
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThan(120);
  });

  it('the published curve is the one it actually runs on', () => {
    for (const kind of STABILISER_KINDS) {
      const s = createStabilisers({ kind });
      runOut(s);
      for (const v of [0, 2, 5, 9, 14]) {
        s.setWay(v);
        s.update(1 / 60);
        expect(s.damping, `${kind} at ${v}`).toBeCloseTo(dampingAt(kind, v), 6);
      }
    }
  });
});

describe('they take the roll out and leave the pitch', () => {
  it('damping touches her roll and nothing else', () => {
    const sea = createOcean({ amplitude: 1.6, wavelength: 120, size: 900, segments: 110 });
    const bare = createDeckedShip({ era: 'steamer', seed: 3 });
    const steady = createDeckedShip({ era: 'steamer', seed: 3 });
    for (const s of [bare, steady]) s.float((x, z) => sea.heightAt(x, z));

    let bareRoll = 0;
    let steadyRoll = 0;
    let barePitch = 0;
    let steadyPitch = 0;
    for (let i = 0; i < 60 * 120; i++) {
      sea.update(1 / 60);
      bare.update(1 / 60, { speed: 5 });
      steady.update(1 / 60, { speed: 5, damping: 0.9 });
      bareRoll = Math.max(bareRoll, Math.abs(bare.roll));
      steadyRoll = Math.max(steadyRoll, Math.abs(steady.roll));
      barePitch = Math.max(barePitch, Math.abs(bare.pitch));
      steadyPitch = Math.max(steadyPitch, Math.abs(steady.pitch));
    }
    expect(steadyRoll, 'the fins did nothing for her roll').toBeLessThan(bareRoll * 0.4);
    // AND THE PITCH IS UNTOUCHED. A stabilised ship in a head sea is exactly
    // as unpleasant as an unstabilised one, and that is the commonest
    // complaint about fins rather than a simplification.
    expect(steadyPitch).toBeCloseTo(barePitch, 5);
  });
});

describe('motion is a field, and it is why the good cabins are amidships', () => {
  const liven = (era: 'galley' | 'liner', speed = 6) => {
    const sea = createOcean({ amplitude: 1.4, wavelength: 165, size: 900, segments: 110 });
    const ship = createDeckedShip({ era });
    ship.float((x, z) => sea.heightAt(x, z));
    for (let i = 0; i < 60 * 90; i++) {
      sea.update(1 / 60);
      ship.update(1 / 60, { speed });
    }
    return ship;
  };

  it('the quietest place aboard is amidships and low', () => {
    const ship = liven('liner');
    const mid = ship.motionAt(0, 0, 0);
    const bow = ship.motionAt(0, ship.length * 0.45, 0);
    const stern = ship.motionAt(0, -ship.length * 0.45, 0);
    const high = ship.motionAt(0, 0, ship.freeboard + 9);
    const wing = ship.motionAt(ship.beam * 0.5, 0, ship.freeboard + 9);

    expect(bow, 'her bow is no livelier than the middle of her').toBeGreaterThan(mid);
    expect(stern).toBeGreaterThan(mid);
    expect(high, 'height cost nothing').toBeGreaterThan(mid);
    expect(wing, 'the bridge wing is as quiet as the centreline').toBeGreaterThan(high);
    // The best berth on the ship, and nobody wrote it down: it fell out of
    // two lever arms.
    for (const p of [bow, stern, high, wing]) expect(mid).toBeLessThan(p);
  });

  it('a liner is quieter than an open boat EVERYWHERE, not on average', () => {
    const galley = liven('galley');
    const liner = liven('liner');
    const places: Array<[number, number, number]> = [
      [0, 0, 0],
      [0, 8, 0],
      [0, -8, 0],
      [1.4, 0, 2],
    ];
    for (const [x, z, y] of places) {
      expect(
        liner.motionAt(x, z, y),
        `at ${x},${z},${y} the liner was the livelier of the two`
      ).toBeLessThan(galley.motionAt(x, z, y));
    }
  });

  it('heaveAt is honestly vertical, so height does not enter it', () => {
    const ship = liven('liner');
    expect(ship.heaveAt(0, 20, 0)).toBeCloseTo(ship.heaveAt(0, 20, 30), 9);
    // …and motionAt is not, because being high up throws you sideways and a
    // vertical speed has no way of saying so.
    expect(ship.motionAt(0, 20, 30)).toBeGreaterThan(ship.motionAt(0, 20, 0));
  });

  it('it never saturates, so a gale is worse than a swell', () => {
    const swell = liven('galley', 3);
    const gale = (() => {
      const sea = createOcean({ amplitude: 3.4, wavelength: 60, size: 900, segments: 110 });
      const ship = createDeckedShip({ era: 'galley' });
      ship.float((x, z) => sea.heightAt(x, z));
      for (let i = 0; i < 60 * 90; i++) {
        sea.update(1 / 60);
        ship.update(1 / 60, { speed: 3 });
      }
      return ship;
    })();
    // A clamp would have said these were the same, because both are past 1.
    expect(gale.motionAt(0, 8, 3)).toBeGreaterThan(swell.motionAt(0, 8, 3));
    expect(gale.motionAt(0, 8, 3)).toBeLessThan(1);
  });

  it('steadying her shows up where it should and nowhere else', () => {
    const sea = createOcean({ amplitude: 1.6, wavelength: 130, size: 900, segments: 110 });
    const bare = createDeckedShip({ era: 'liner', seed: 4 });
    const steady = createDeckedShip({ era: 'liner', seed: 4 });
    for (const s of [bare, steady]) s.float((x, z) => sea.heightAt(x, z));
    for (let i = 0; i < 60 * 150; i++) {
      sea.update(1 / 60);
      bare.update(1 / 60, { speed: 9 });
      steady.update(1 / 60, { speed: 9, damping: 0.9 });
    }
    const wing: [number, number, number] = [bare.beam * 0.5, 0, bare.freeboard + 9];
    const bow: [number, number, number] = [0, bare.length * 0.45, 0];
    // The bridge wing is where the roll lives, so that is where the fins show.
    expect(steady.motionAt(...wing)).toBeLessThan(bare.motionAt(...wing));
    // The bow is where the PITCH lives, and they do nothing for it.
    expect(steady.motionAt(...bow)).toBeCloseTo(bare.motionAt(...bow), 2);
  });
});

describe('structure', () => {
  it('has the shape every other prop in this library has', () => {
    for (const kind of STABILISER_KINDS) {
      const s = createStabilisers({ kind });
      expect(s.obstacleRadius).toBe(0);
      expect(s.kind).toBe(kind);
      expect(s.object.name).toContain(kind);
      expect(s.rated).toBeGreaterThan(0);
    }
  });

  it('survives being handed nonsense', () => {
    const s = createStabilisers({ kind: 'activeFin' });
    s.update(0);
    s.update(-1);
    s.setWay(Number.NaN);
    expect(s.way).toBe(0);
    s.setWay(-8);
    expect(s.way).toBe(8);
    expect(Number.isFinite(s.damping)).toBe(true);
    expect(Number.isFinite(s.drag)).toBe(true);
  });
});
