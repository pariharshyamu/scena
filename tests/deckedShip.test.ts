import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createDeckedShip, createOcean, SHIP_ERAS } from '../src';
import type { DeckedShip } from '../src';

/** A flat calm — the sea sampler that isolates motion from waves. */
const calm = () => () => 0;

/** A steady swell that does not need an Ocean, for deterministic tests. */
const swell = (amp = 0.8, len = 18) => (x: number, z: number) =>
  Math.sin((x + z) / len) * amp;

const run = (s: DeckedShip, seconds: number, input = {}, dt = 1 / 60): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) s.update(dt, input);
};

const topDeck = (s: DeckedShip) => s.decks[0];

describe('createDeckedShip — the deck is somewhere to stand', () => {
  it.each(SHIP_ERAS)('%s publishes decks with a walkable surface', (era) => {
    const s = createDeckedShip({ era });
    s.float(calm());
    s.update(1 / 60);
    expect(s.decks.length).toBeGreaterThan(0);
    const d = topDeck(s);
    const y = s.deckAt(0, d.z);
    expect(y, `${era}: nothing underfoot amidships`).not.toBeNull();
    expect(y!).toBeGreaterThan(0);
  });

  it.each(SHIP_ERAS)('%s reports NULL off the side, which is how you test aboard', (era) => {
    const s = createDeckedShip({ era });
    s.float(calm());
    s.update(1 / 60);
    expect(s.deckAt(s.beam * 4, 0), `${era}`).toBeNull();
    expect(s.deckAt(0, s.length * 2), `${era}`).toBeNull();
  });

  it('follows the ship around rather than living at the origin', () => {
    const s = createDeckedShip({ era: 'carrack' });
    s.float(calm());
    s.update(1 / 60);
    expect(s.deckAt(0, 0)).not.toBeNull();
    s.object.position.set(300, 0, -120);
    s.update(1 / 60);
    expect(s.deckAt(0, 0)).toBeNull();
    expect(s.deckAt(300, -120)).not.toBeNull();
  });

  it('picks the deck NEAREST BELOW you, so the hold is not the poop', () => {
    // Stacked decks are the reason `near` exists: without it a sailor in the
    // hold is answered with the highest surface over his head and pops out
    // on the poop.
    const s = createDeckedShip({ era: 'carrack' });
    s.float(calm());
    s.update(1 / 60);
    const hold = s.decks.find((d) => d.name === 'hold')!;
    const waist = s.decks.find((d) => d.name === 'waist')!;
    expect(hold.y).toBeLessThan(waist.y);
    const above = s.deckAt(0, hold.z)!;
    const below = s.deckAt(0, hold.z, hold.y + 0.2)!;
    expect(above).toBeGreaterThan(below);
    expect(below).toBeCloseTo(hold.y, 1);
  });

  it('a companionway joins the levels it says it does', () => {
    const s = createDeckedShip({ era: 'steamer' });
    s.object.updateMatrixWorld(true);
    expect(s.ladders.length).toBeGreaterThan(0);
    for (const ladder of s.ladders) {
      const bottom = ladder.bottom.getWorldPosition(new Vector3());
      const top = ladder.top.getWorldPosition(new Vector3());
      expect(top.y).toBeGreaterThan(bottom.y + 0.5);
      expect(ladder.rungSpacing).toBeGreaterThan(0.1);
      expect(ladder.rungSpacing).toBeLessThan(0.5);
    }
  });
});

describe('RIDE — the whole track', () => {
  it('CARRIES A STANDING POINT ALONG WITH THE SHIP', () => {
    // The fact that breaks every controller in the trilogy: a character
    // standing perfectly still has to change world position anyway.
    const s = createDeckedShip({ era: 'steamer' });
    s.float(calm());
    const sailor = new Vector3(0, 0, 0);
    s.update(1 / 60, { speed: 6 });
    sailor.set(0, s.deckAt(0, 0)!, 0);
    const startedAt = sailor.clone();

    for (let i = 0; i < 60 * 5; i++) {
      s.update(1 / 60, { speed: 6 });
      s.ride(sailor);
    }
    // Five seconds at six metres a second.
    expect(sailor.z - startedAt.z).toBeGreaterThan(25);
    expect(sailor.z - startedAt.z).toBeLessThan(35);
    // …and he is still standing on the deck, not trailing behind it.
    expect(s.deckAt(sailor.x, sailor.z)).not.toBeNull();
  });

  it('and WITHOUT it he walks out through the stern', () => {
    const s = createDeckedShip({ era: 'steamer' });
    s.float(calm());
    s.update(1 / 60, { speed: 6 });
    const sailor = new Vector3(0, s.deckAt(0, 0)!, 0);
    for (let i = 0; i < 60 * 6; i++) s.update(1 / 60, { speed: 6 });
    // He never moved, so the ship left without him.
    expect(s.deckAt(sailor.x, sailor.z), 'the ship stayed under him').toBeNull();
  });

  it('carries him round a turn as well as along a straight', () => {
    // Translation alone would be a subtraction. It is a matrix because the
    // ship rotates too, and a man standing on the bow of a turning ship
    // travels sideways without taking a step.
    const s = createDeckedShip({ era: 'steamer' });
    s.float(calm());
    s.update(1 / 60);
    const bow = new Vector3(0, s.deckAt(0, 20)!, 20);
    const start = bow.clone();
    for (let i = 0; i < 60 * 4; i++) {
      s.update(1 / 60, { speed: 0, turn: 0.25 });
      s.ride(bow);
    }
    // A quarter of a turn at the bow: he has swung a long way sideways with
    // the ship going nowhere at all.
    expect(Math.abs(bow.x - start.x)).toBeGreaterThan(8);
    expect(s.deckAt(bow.x, bow.z), 'he fell off the turn').not.toBeNull();
  });

  it('does nothing at all to a ship that is not moving', () => {
    const s = createDeckedShip({ era: 'liner' });
    s.float(calm());
    run(s, 2);
    const at = new Vector3(2, s.deckAt(2, 0)!, 0);
    const before = at.clone();
    run(s, 3);
    s.ride(at);
    expect(at.distanceTo(before)).toBeLessThan(0.01);
  });

  it('rides the heave too, not only the way through the water', () => {
    const s = createDeckedShip({ era: 'galley' });
    s.float(swell(1.2, 14));
    run(s, 3);
    const at = new Vector3(0, s.deckAt(0, 0)!, 0);
    let lowest = at.y;
    let highest = at.y;
    for (let i = 0; i < 60 * 6; i++) {
      s.update(1 / 60, { speed: 3 });
      s.ride(at);
      lowest = Math.min(lowest, at.y);
      highest = Math.max(highest, at.y);
    }
    expect(highest - lowest, 'the deck never lifted him').toBeGreaterThan(0.3);
  });
});

describe('the sea decides how hard it is to stand up', () => {
  it('MOTION IS THE RATE, NOT THE ANGLE', () => {
    // A ship heeled steadily at ten degrees under sail is easy to walk on;
    // the same ten degrees arriving twice a second is not, and a number
    // taken off the angle cannot tell those two apart.
    // A sea that is a constant SLOPE: the ship sits permanently canted over
    // and never moves. Setting the rotation by hand would not do — `update`
    // owns the attitude and would wipe it on the next frame, which is right.
    const heeled = createDeckedShip({ era: 'carrack' });
    heeled.float((x) => x * 0.12);
    run(heeled, 12);
    const steady = heeled.motion;
    expect(Math.abs(heeled.roll), 'it never heeled at all').toBeGreaterThan(0.05);
    expect(steady, 'a steady list read as heavy weather').toBeLessThan(0.05);

    const lively = createDeckedShip({ era: 'carrack' });
    lively.float(swell(1.4, 9));
    run(lively, 8, { speed: 7 });
    // Comparable angles — the swell actually rolls it slightly harder — and
    // an order of magnitude apart on the number that matters. Which is the
    // point: the angle tells you nothing about whether you can stand up.
    expect(Math.abs(lively.roll)).toBeGreaterThan(0.05);
    expect(lively.motion, 'a ship punching into a swell felt like a mill pond')
      .toBeGreaterThan(Math.max(steady * 10, 0.05));
  });

  it('a galley is thrown about and a liner is not', () => {
    const sea = swell(1.1, 20);
    const galley = createDeckedShip({ era: 'galley' });
    const liner = createDeckedShip({ era: 'liner' });
    for (const s of [galley, liner]) {
      s.float(sea);
      run(s, 10, { speed: 5 });
    }
    expect(Math.abs(galley.roll)).toBeGreaterThan(Math.abs(liner.roll) * 3);
    expect(galley.motion, 'the liner was as lively as an open boat')
      .toBeGreaterThan(liner.motion + 0.02);
  });

  it('and a flat calm is a flat calm for everybody', () => {
    for (const era of SHIP_ERAS) {
      const s = createDeckedShip({ era });
      s.float(calm());
      run(s, 6, { speed: 4 });
      expect(Math.abs(s.roll), era).toBeLessThan(0.01);
      expect(s.motion, era).toBeLessThan(0.05);
    }
  });

  it('the deck normal LEANS WITH THE SHIP — it is not (0,1,0) at sea', () => {
    const s = createDeckedShip({ era: 'galley' });
    s.float(swell(1.4, 11));
    let mostTilted = 1;
    for (let i = 0; i < 60 * 8; i++) {
      s.update(1 / 60, { speed: 6 });
      mostTilted = Math.min(mostTilted, s.normalAt(0, 0).y);
    }
    expect(mostTilted, 'the deck stayed dead level in a seaway').toBeLessThan(0.995);
    // …and it stays a unit vector while it does it.
    expect(s.normalAt(0, 0).length()).toBeCloseTo(1, 5);
  });

  it('works against a real Ocean, not just a test sampler', () => {
    const ocean = createOcean({ amplitude: 0.9, wavelength: 22 });
    const s = createDeckedShip({ era: 'carrack' });
    s.float((x, z) => ocean.heightAt(x, z));
    for (let i = 0; i < 60 * 8; i++) {
      ocean.update(1 / 60);
      s.update(1 / 60, { speed: 5 });
    }
    expect(Number.isFinite(s.object.position.y)).toBe(true);
    expect(s.motion).toBeGreaterThan(0);
    expect(s.deckAt(s.object.position.x, s.object.position.z)).not.toBeNull();
  });
});

describe('the shape of it', () => {
  it.each(SHIP_ERAS)('%s is walk-through, because it is the ground', (era) => {
    // A vessel is not something you steer around on land. Leaving an
    // obstacle radius on it would make agents avoid the thing they are
    // supposed to be standing on.
    expect(createDeckedShip({ era }).obstacleRadius).toBe(0);
  });

  it.each(SHIP_ERAS)('%s has a helm somebody can reach', (era) => {
    const s = createDeckedShip({ era });
    expect(s.slots?.[0]).toBe(s.helm);
    expect(s.helm.approach).toBeDefined();
    s.object.updateMatrixWorld(true);
    const at = s.helm.anchor.getWorldPosition(new Vector3());
    // On a deck, not in the bilges or up in the rigging.
    expect(at.y, era).toBeGreaterThan(0.5);
    expect(at.y, era).toBeLessThan(26);
  });

  it('gets bigger with the era, and that is the whole point of a liner', () => {
    const sizes = SHIP_ERAS.map((era) => createDeckedShip({ era }).length);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    const liner = createDeckedShip({ era: 'liner' });
    expect(liner.decks.length).toBeGreaterThan(3);
  });
});
