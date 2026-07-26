import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { BERTH_ERAS, createBerth, createDeckedShip, createGangway, moor } from '../src';
import type { Berth, DeckedShip, Mooring } from '../src';

const calm = () => () => 0;

/**
 * A ship lying off a harbour wall, ready to be hauled in.
 *
 * The berth's face is its local +x plane, so a ship out at +x is out in the
 * fairway and one at -x has driven through the masonry.
 */
function alongside(
  options: {
    era?: Berth['era'];
    off?: number;
    ship?: DeckedShip['era'];
    lines?: number;
    standoff?: number;
  } = {}
) {
  const berth = createBerth({ era: options.era ?? 'harbour', length: 46, seed: 3 });
  const ship = createDeckedShip({ era: options.ship ?? 'steamer', seed: 4 });
  ship.float(calm());
  // Lying parallel to the wall, a few metres off it.
  ship.object.position.set(options.off ?? 8, 0, 0);
  ship.object.rotation.y = 0;
  ship.update(1 / 60);
  const lines = moor(ship, berth, { lines: options.lines, standoff: options.standoff });
  return { berth, ship, lines };
}

const run = (ship: DeckedShip, lines: Mooring, seconds: number, dt = 1 / 60): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) ship.update(dt, lines.hold(dt));
};

/** Where her inboard side is, relative to the quay face. */
const gapOf = (ship: DeckedShip, berth: Berth): number => {
  ship.object.updateWorldMatrix(true, false);
  const side = ship.object.localToWorld(new Vector3(-ship.beam * 0.5, 0, 0));
  return berth.clearance(side.x, side.z);
};

describe('createBerth — a wall to lie alongside', () => {
  it.each(BERTH_ERAS)('%s knows which side the water is on', (era) => {
    const berth = createBerth({ era });
    expect(berth.clearance(10, 0), `${era}: the harbour read as inside the wall`).toBeGreaterThan(0);
    expect(berth.clearance(-3, 0), `${era}: the masonry read as open water`).toBeLessThan(0);
    expect(berth.faceNormal().x).toBeCloseTo(1, 5);
  });

  it('turns with the prop rather than living on the world axis', () => {
    // A quay you can only build facing +x is a backdrop.
    const berth = createBerth();
    berth.object.rotation.y = Math.PI / 2;
    berth.object.position.set(20, 0, -5);
    expect(berth.faceNormal().z).toBeCloseTo(-1, 4);
    // Out along the new normal is clear water; the other way is stone.
    expect(berth.clearance(20, -25)).toBeGreaterThan(0);
    expect(berth.clearance(20, 5)).toBeLessThan(0);
  });

  it.each(BERTH_ERAS)('%s has somewhere to make fast and something to lean on', (era) => {
    const berth = createBerth({ era, bollards: 5 });
    expect(berth.bollards).toHaveLength(5);
    expect(berth.fenders.length).toBeGreaterThan(1);
    berth.object.updateMatrixWorld(true);
    for (const b of berth.bollards) {
      const at = b.anchor.getWorldPosition(new Vector3());
      // On the coping, not in the water and not buried in the wall.
      expect(at.y, era).toBeCloseTo(berth.height, 5);
      expect(at.x, era).toBeLessThan(0);
    }
  });

  it('THE COPING IS GROUND, and it is a frame like any other', () => {
    // Quay, gangway and deck all publish the same three functions. Fixed
    // ground is just the one whose delta is the identity — which is the
    // reason walking ashore needs no special case anywhere.
    const berth = createBerth({ era: 'quay' });
    expect(berth.deckAt(-2, 0)).toBeCloseTo(berth.height, 5);
    expect(berth.deckAt(6, 0), 'you could stand on the harbour').toBeNull();
    expect(berth.deckAt(-2, 200), 'the quay ran to the horizon').toBeNull();
    expect(berth.normalAt(-2, 0).y).toBeCloseTo(1, 5);
    const standing = new Vector3(-2, 3.4, 0);
    expect(berth.ride(standing.clone())).toEqual(standing);
  });

  it('the wall goes down INTO the water, not just up from it', () => {
    // A face that stops at the waterline is a shelf, and a hull moored
    // against a shelf has daylight under the thing it is leaning on.
    const berth = createBerth({ era: 'harbour' });
    berth.object.updateMatrixWorld(true);
    let lowest = Infinity;
    berth.object.traverse((o) => {
      const m = o as { isMesh?: boolean; geometry?: { boundingBox?: unknown } };
      if (!m.isMesh) return;
      lowest = Math.min(lowest, o.getWorldPosition(new Vector3()).y);
    });
    expect(lowest).toBeLessThan(-1);
  });
});

describe('a rope is a ONE-WAY constraint', () => {
  it('PULLS WHEN IT IS TAUT AND DOES NOTHING WHEN IT IS SLACK', () => {
    // Not a spring. A spring hauls her back in when she comes closer than
    // her scope and shoves her out when she goes away, and no rope has ever
    // done either. This is the whole model.
    const { ship, lines } = alongside({ off: 9 });
    const line = lines.lines[0];
    line.set(200); // miles of slack
    ship.update(1 / 60, lines.hold(1 / 60));
    expect(line.tension).toBe(0);
    expect(line.taut).toBe(false);

    line.set(1); // bar-taut
    ship.update(1 / 60, lines.hold(1 / 60));
    expect(line.tension).toBeGreaterThan(0);
    expect(line.taut).toBe(true);
  });

  it('and there is NO scope at which it pushes her away', () => {
    // Sweep every setting from bar-taut to acres of slack, well clear of the
    // fenders so the rope is the only thing acting. A spring would change
    // sign somewhere in here. A rope never does: it is either hauling her
    // toward the wall or doing nothing whatever.
    for (let scope = 0.5; scope < 44; scope += 0.5) {
      const fresh = alongside({ off: 30, lines: 1, standoff: 30 });
      const line = fresh.lines.lines[0];
      line.set(scope);
      const held = fresh.lines.hold(1 / 60);
      expect(held.drift.x, `scope ${scope} shoved her off the wall`).toBeLessThanOrEqual(1e-9);
      if (scope > 40) expect(line.tension, `scope ${scope}`).toBe(0);
    }
  });

  it('heave and pay out actually move her', () => {
    const { berth, ship, lines } = alongside({ off: 12, standoff: 6 });
    run(ship, lines, 12);
    const lyingOff = gapOf(ship, berth);
    for (const l of lines.lines) l.heave(4);
    run(ship, lines, 12);
    expect(gapOf(ship, berth), 'heaving in did nothing').toBeLessThan(lyingOff - 1);
  });

  it('LET GO AND SHE IS FREE — the pull stops at once', () => {
    const { ship, lines } = alongside({ off: 14, standoff: 0.5 });
    run(ship, lines, 3);
    expect(lines.lines.some((l) => l.taut)).toBe(true);
    lines.cast();
    lines.hold(1 / 60);
    for (const l of lines.lines) {
      expect(l.tension).toBe(0);
      expect(l.fast).toBe(false);
    }
    // She keeps the way she had on — a ship does — but nothing is adding to
    // it any more, so it dies away instead of holding her.
    const justAfter = Math.abs(lines.hold(1 / 60).drift.x);
    run(ship, lines, 10);
    expect(Math.abs(lines.hold(1 / 60).drift.x)).toBeLessThan(justAfter * 0.2 + 0.01);
  });

  it('a bow line swings the bow, because it is not made fast to her middle', () => {
    const { ship, lines } = alongside({ off: 10, lines: 0 });
    const bowLead = new Object3D();
    bowLead.position.set(-ship.beam * 0.5, 0.4, ship.length * 0.45);
    ship.object.add(bowLead);
    const line = lines.add(bowLead, createBerth().bollards[0].anchor, 1);
    const held = lines.hold(1 / 60);
    expect(line.taut).toBe(true);
    expect(Math.abs(held.turn ?? 0), 'a bow rope did not swing her at all').toBeGreaterThan(1e-4);
  });
});

describe('a fender is the same thing backwards', () => {
  it('PUSHES A HULL OFF AND HAS NEVER ONCE PULLED ONE IN', () => {
    const driven = alongside({ off: 8 });
    driven.lines.cast(); // ropes out of it entirely
    // Drive her through the wall, which nothing else in the scene prevents.
    driven.ship.object.position.x = -1;
    driven.ship.update(1 / 60);
    expect(gapOf(driven.ship, driven.berth)).toBeLessThan(0);
    expect(driven.lines.hold(1 / 60).drift.x, 'the fenders let her through the masonry')
      .toBeGreaterThan(0);

    // …and out in the fairway, with no line on her, they do nothing at all.
    const clear = alongside({ off: 30, lines: 0 });
    for (let i = 0; i < 30; i++) clear.ship.update(1 / 60, clear.lines.hold(1 / 60));
    const held = clear.lines.hold(1 / 60);
    expect(Math.abs(held.drift.x), 'a fender reached out and grabbed her').toBeLessThan(0.01);
    expect(Math.abs(held.drift.z)).toBeLessThan(0.01);
  });

  it('she comes to rest touching them, and stays there', () => {
    const { berth, ship, lines } = alongside({ off: 9, standoff: 0.2 });
    run(ship, lines, 30);
    const gap = gapOf(ship, berth);
    expect(gap, 'she ended up inside the quay').toBeGreaterThan(-0.6);
    expect(gap, 'she never came alongside at all').toBeLessThan(2.5);
    expect(lines.alongside).toBe(true);
  });

  it('AND SHE STOPS RINGING — two one-way constraints would oscillate forever', () => {
    // A rope that only pulls and a fender that only pushes, with nothing
    // between them, hammer the wall indefinitely. A hull in water does not.
    const { ship, lines } = alongside({ off: 11, standoff: 0.3 });
    run(ship, lines, 8);
    const early = lines.surge;
    run(ship, lines, 25);
    expect(lines.surge, 'she was still ranging about after half a minute')
      .toBeLessThan(Math.max(0.05, early * 0.5));
    expect(lines.surge).toBeLessThan(0.06);
  });

  it('with no lines on her at all she just lies there', () => {
    const { berth, ship, lines } = alongside({ off: 7, lines: 0 });
    const before = gapOf(ship, berth);
    run(ship, lines, 6);
    expect(gapOf(ship, berth)).toBeCloseTo(before, 1);
    expect(lines.alongside).toBe(false);
  });

  it('SPRINGS ARE WHAT STOP HER RANGING FORE AND AFT', () => {
    // Head and stern ropes alone hold her off the wall and leave her free to
    // surge the length of her own lines. It is the crossed springs that stop
    // that, and it is the single most-watched, least-modelled fact about a
    // ship alongside.
    const drift = (lineCount: number): number => {
      const { ship, lines } = alongside({ off: 7, lines: lineCount, standoff: 0.3 });
      run(ship, lines, 4);
      const z0 = ship.object.position.z;
      // Something shoves her along the quay — a tide, a tug, a gust.
      for (let i = 0; i < 60 * 6; i++) {
        const held = lines.hold(1 / 60);
        held.drift.z += 2.2;
        ship.update(1 / 60, held);
      }
      return Math.abs(ship.object.position.z - z0);
    };
    const withSprings = drift(4);
    const without = drift(2);
    expect(withSprings, 'the springs did not hold her').toBeLessThan(without * 0.8);
  });
});

describe('the gangway — where two frames blend', () => {
  const rigged = (options: { off?: number } = {}) => {
    const { berth, ship, lines } = alongside({ off: options.off ?? 6, standoff: 0.3 });
    run(ship, lines, 20);
    // The main deck — the one a brow actually lands on. `decks[0]` is the
    // topmost, which for a steamer is her bridge.
    const main = ship.decks.reduce((lo, d) => (d.y < lo.y ? d : lo));
    const landing = new Object3D();
    landing.position.set(-ship.beam * 0.45, main.y, 0);
    ship.object.add(landing);
    const brow = createGangway({ shore: berth.brow.anchor, ship, landing, reach: 14 });
    brow.update(1 / 60);
    return { berth, ship, lines, brow, landing };
  };

  it('spans from the quay to the deck, and slopes', () => {
    const { berth, ship, brow } = rigged();
    expect(brow.rigged).toBe(true);
    expect(brow.span).toBeGreaterThan(1);
    // The steamer's main deck is well above a harbour wall's coping.
    expect(Math.min(...ship.decks.map((d) => d.y))).toBeGreaterThan(berth.height);
    expect(brow.angle, 'it lay dead flat between two different heights')
      .toBeGreaterThan(0.05);
  });

  it('is ground you can stand on, and only where the plank is', () => {
    const { berth, brow } = rigged();
    berth.object.updateMatrixWorld(true);
    const shore = berth.brow.anchor.getWorldPosition(new Vector3());
    expect(brow.deckAt(shore.x, shore.z), 'nothing underfoot at the shore end').not.toBeNull();
    expect(brow.deckAt(shore.x, shore.z + 40), 'the plank reached across the harbour').toBeNull();
    expect(brow.normalAt(shore.x, shore.z).length()).toBeCloseTo(1, 5);
  });

  it('and it is TILTED, which is what makes a body lean going up it', () => {
    const { berth, brow } = rigged();
    const shore = berth.brow.anchor.getWorldPosition(new Vector3());
    const n = brow.normalAt(shore.x, shore.z);
    expect(n.y).toBeLessThan(0.999);
    expect(n.y).toBeGreaterThan(0.7);
  });

  it('CARRIES YOU IN PROPORTION TO HOW FAR ABOARD YOU ARE', () => {
    // The one idea in the whole prop. Carry somebody all the way and they
    // are dragged off the quay; carry them not at all and the ship leaves
    // without them halfway across.
    const { berth, ship, brow, landing } = rigged();

    // Move the ship along the quay by a known amount, then re-rig — so the
    // points sampled below are on the plank as it is NOW. Sampling where it
    // used to be puts them in the water beside it and `ride` correctly
    // declines to carry them, which looks exactly like the bug.
    ship.update(1 / 60, { drift: { x: 0, z: 60 } });
    brow.update(1 / 60);

    const shore = berth.brow.anchor.getWorldPosition(new Vector3());
    const aboard = landing.getWorldPosition(new Vector3());
    const moved = (t: number): number => {
      const p = new Vector3().lerpVectors(shore, aboard, t);
      const y = brow.deckAt(p.x, p.z);
      expect(y, `nothing underfoot ${t} of the way across`).not.toBeNull();
      p.y = y!;
      const before = p.clone();
      brow.ride(p);
      return p.distanceTo(before);
    };
    const atShore = moved(0.02);
    const middle = moved(0.5);
    const atShip = moved(0.98);

    expect(atShore, 'somebody at the shore end was dragged off the quay').toBeLessThan(0.05);
    expect(atShip, 'somebody standing aboard was left behind').toBeGreaterThan(0.5);
    expect(middle).toBeGreaterThan(atShore + 0.1);
    expect(middle).toBeLessThan(atShip - 0.1);
    // …and it really is proportional, not a two-step.
    expect(middle).toBeCloseTo(atShip * 0.5, 1);
  });

  it('the ship end matches what the DECK would have done', () => {
    const { ship, brow, landing } = rigged();
    ship.object.updateMatrixWorld(true);
    const aboard = landing.getWorldPosition(new Vector3());
    ship.update(1 / 60, { drift: { x: 0, z: 40 } });
    brow.update(1 / 60);
    const onBrow = aboard.clone();
    onBrow.y = brow.deckAt(onBrow.x, onBrow.z) ?? onBrow.y;
    const onDeck = onBrow.clone();
    brow.ride(onBrow);
    ship.ride(onDeck);
    expect(onBrow.distanceTo(onDeck), 'the two frames disagreed where they meet')
      .toBeLessThan(0.1);
  });

  it('COMES OFF when she ranges too far — a gangway is not a bridge', () => {
    const { ship, brow } = rigged();
    expect(brow.rigged).toBe(true);
    ship.object.position.x += 40;
    brow.update(1 / 60);
    expect(brow.rigged, 'it stretched across forty metres of harbour').toBe(false);
    expect(brow.deckAt(0, 0), 'you could still walk on it').toBeNull();
    expect(brow.object.visible).toBe(false);
  });

  it('and can be taken in and put back over', () => {
    const { brow } = rigged();
    brow.raise();
    expect(brow.rigged).toBe(false);
    expect(brow.object.visible).toBe(false);
    brow.lower();
    expect(brow.rigged).toBe(true);
    expect(brow.object.visible).toBe(true);
  });

  it('follows her as she works against her lines', () => {
    const { ship, lines, brow } = rigged();
    const spans: number[] = [];
    for (let i = 0; i < 60 * 4; i++) {
      const held = lines.hold(1 / 60);
      held.drift.x += Math.sin(i / 24) * 1.6;
      ship.update(1 / 60, held);
      brow.update(1 / 60);
      spans.push(brow.span);
    }
    expect(Math.max(...spans) - Math.min(...spans), 'it stayed a fixed length')
      .toBeGreaterThan(0.2);
  });
});

describe('the whole handshake', () => {
  it('quay, gangway and deck are the SAME THREE FUNCTIONS', () => {
    // Structural, as ever — and the reason a controller that rides whatever
    // it is standing on can be handed any of the three and never ask which.
    const { berth, ship, brow } = (() => {
      const r = createBerth({ era: 'quay' });
      const s = createDeckedShip({ era: 'liner', seed: 2 });
      s.float(calm());
      s.object.position.set(16, 0, 0);
      s.update(1 / 60);
      const main = s.decks.reduce((lo, d) => (d.y < lo.y ? d : lo));
      const landing = new Object3D();
      landing.position.set(-s.beam * 0.45, main.y, 0);
      s.object.add(landing);
      return { berth: r, ship: s, brow: createGangway({ shore: r.brow.anchor, ship: s, landing, reach: 40 }) };
    })();
    for (const frame of [berth, ship, brow]) {
      expect(typeof frame.deckAt).toBe('function');
      expect(typeof frame.normalAt).toBe('function');
      expect(typeof frame.ride).toBe('function');
    }
  });

  it('a moored ship is still a deck people can stand on', () => {
    const { ship, lines } = alongside({ off: 8, standoff: 0.3 });
    run(ship, lines, 20);
    const y = ship.deckAt(ship.object.position.x, ship.object.position.z);
    expect(y).not.toBeNull();
    expect(y!).toBeGreaterThan(0);
  });

  it('and `drift` goes through update, so she carries her crew sideways', () => {
    // The reason mooring forces are an input rather than a write to
    // `position`: everything `ride` does depends on the frame delta
    // covering ALL of a frame's movement.
    const ship = createDeckedShip({ era: 'steamer', seed: 9 });
    ship.float(calm());
    ship.update(1 / 60);
    const sailor = new Vector3(0, ship.deckAt(0, 0)!, 0);
    for (let i = 0; i < 60; i++) {
      ship.update(1 / 60, { drift: { x: 4, z: 0 } });
      ship.ride(sailor);
    }
    expect(sailor.x, 'she was warped sideways and left him behind').toBeGreaterThan(3);
    expect(ship.deckAt(sailor.x, sailor.z)).not.toBeNull();
  });
});
