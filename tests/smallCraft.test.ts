import { describe, it, expect } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  createSmallCraft,
  createOcean,
  livesIn,
  isBreaking,
  CRAFT_FITS,
  type CraftFit,
} from '../src';

const crewed = (fit: CraftFit, n = 3, along = 0, side = 0, extra = {}) => {
  const b = createSmallCraft({ fit, ...extra });
  for (let i = 0; i < n; i++) b.seat(`h${i}`, 85, along, side);
  return b;
};
const run = (b: ReturnType<typeof createSmallCraft>, seconds: number, dt = 0.1): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) b.update(dt);
};

describe('the ballast walks', () => {
  it('the crew are a third of her, so seating them moves everything at once', () => {
    const b = createSmallCraft({ fit: 'open' });
    const bare = { disp: b.displacement, draught: b.draught, gm: b.gm, fb: b.freeboard };
    b.seat('a', 85);
    b.seat('b', 85);
    b.seat('c', 85);
    expect(b.crew).toBe(3);
    expect(b.crewMass).toBe(255);
    expect(b.displacement).toBeCloseTo(bare.disp + 255, 6);
    expect(b.draught, 'her draught did not move').toBeGreaterThan(bare.draught * 1.5);
    expect(b.freeboard).toBeLessThan(bare.fb);
    // Her metacentric height FALLS as they board: displacement grows, and BM
    // goes as the waterplane inertia over the volume.
    expect(b.gm).toBeLessThan(bare.gm);
    b.leave('b');
    expect(b.crew).toBe(2);
    expect(b.crewMass).toBe(170);
  });

  it('reports what she is before anybody has stepped a frame', () => {
    // Classified on demand, not only in `update` — the same defect the trim
    // track had, where a ship loaded to a negative GM still said 'light'.
    const b = crewed('open');
    expect(b.state).toBe('dry');
    expect(b.gm).toBeGreaterThan(1);
    expect(b.rollPeriod).toBeLessThan(2);
  });

  it('standing up in a beamy boat barely touches her, and that is the finding', () => {
    const b = crewed('open');
    const sitting = b.gm;
    for (const h of b.hands) b.stand(h.name, true);
    expect(b.gm).toBeLessThan(sitting);
    // Four per cent. Everybody believes standing up in a boat is what capsizes
    // her; in a beamy one the waterplane inertia swamps the change in KG.
    expect(b.gm).toBeGreaterThan(sitting * 0.9);
  });

  it('…and in a narrow one it is most of what she has', () => {
    const narrow = crewed('open', 3, 0, 0, { beam: 1.05, depth: 0.5, light: 170 });
    const sitting = narrow.gm;
    for (const h of narrow.hands) narrow.stand(h.name, true);
    // Same three people, same act, and now it costs her a third of her
    // stability — because BM goes as the beam CUBED and there is not much beam.
    expect(narrow.gm).toBeLessThan(sitting * 0.75);
  });

  it('hiking multiplies whichever arm they already have', () => {
    const over = crewed('open', 3, 0, 1);
    const sitting = over.loading.list;
    expect(sitting).toBeGreaterThan(0);
    for (const h of over.hands) over.hike(h.name, 1);
    expect(over.loading.list, 'hiking out on the LOW side should be worse').toBeGreaterThan(
      sitting
    );

    // And the other way round it is the only stability she has.
    const up = crewed('open', 3, 0, -1);
    const before = up.loading.list;
    for (const h of up.hands) up.hike(h.name, 1);
    expect(up.loading.list).toBeLessThan(before);
    expect(Math.abs(up.loading.list)).toBeGreaterThan(Math.abs(before));
  });

  it('trim and list take opposite signs at the hull, and not by accident', () => {
    const b = crewed('open', 3, -0.6, 0.6);
    b.update(0.1);
    expect(b.loading.trim).toBeLessThan(0);
    expect(b.loading.list).toBeGreaterThan(0);
    expect(b.object.rotation.x).toBeCloseTo(b.loading.trim, 5);
    expect(b.object.rotation.z).toBeCloseTo(-b.loading.list, 5);
  });

  it('rubbish in does not poison her', () => {
    const b = createSmallCraft({ fit: 'open' });
    b.seat('a', Number.NaN, Number.NaN, Number.NaN);
    b.seat('b', 85, 9, -9);
    expect(Number.isFinite(b.displacement)).toBe(true);
    expect(Number.isFinite(b.gm)).toBe(true);
    // Positions are bounded: nobody sits nine boat-lengths off the bow.
    const h = b.hands.find((x) => x.name === 'b');
    expect(h?.along).toBe(1);
    expect(h?.side).toBe(-1);
    b.move('nobody', 0, 0);
    b.stand('nobody', true);
    b.hike('nobody', 1);
    b.leave('nobody');
    expect(b.crew).toBe(2);
  });
});

describe('she is not lost to stability, she is lost to freeboard', () => {
  it('keeps a positive GM all the way to the gunwale', () => {
    // The whole point, and the opposite of what the free-surface sum out of
    // `createHold` said when it was applied to a rounded hull: it gave a
    // NEGATIVE metacentric height from two buckets of water.
    const b = crewed('open');
    b.meet(3);
    let sawNegative = false;
    let filled = false;
    for (let i = 0; i < 4000; i++) {
      b.update(0.05);
      if (b.gm <= 0) sawNegative = true;
      if (b.water >= b.capacity * 0.9) {
        filled = true;
        break;
      }
    }
    expect(filled, 'she never filled').toBe(true);
    expect(sawNegative, 'she lost her stability before she lost her freeboard').toBe(false);
  });

  it('the free surface is real, and it is not the thing that kills her', () => {
    const b = crewed('open');
    expect(b.freeSurface).toBe(0);
    b.meet(3);
    // Up to the point her gunwale goes under she still has stability to spare.
    // The free surface does finally beat her — but only when she is COMPLETELY
    // full, by which time she is already foundering and it decides nothing.
    let checked = false;
    for (let i = 0; i < 4000; i++) {
      b.update(0.05);
      if (b.water >= b.capacity * 0.9) {
        expect(b.freeSurface, 'water in her cost nothing at all').toBeGreaterThan(0.05);
        expect(b.freeSurface).toBeLessThan(b.solidGm);
        expect(b.gm).toBeGreaterThan(0);
        checked = true;
        break;
      }
    }
    expect(checked).toBe(true);
  });

  it('a wedge section, not a box: a little water is deep and narrow', () => {
    // Taken as a box the depth comes out four times too small and the free
    // surface with it, which is exactly how the first draft got it wrong.
    const b = crewed('open');
    b.meet(1.2);
    run(b, 10);
    const some = { water: b.water, fs: b.freeSurface };
    expect(some.water).toBeGreaterThan(5);
    run(b, 25);
    expect(b.water).toBeGreaterThan(some.water * 3);
    // The free surface grows with the WIDTH the water reaches, so it grows
    // much more slowly than the water does.
    expect(b.freeSurface).toBeGreaterThan(some.fs);
    expect(b.freeSurface).toBeLessThan(some.fs * (b.water / some.water));
  });

  it('the roll period is never, not a hundred and eighteen seconds', () => {
    const b = crewed('open');
    expect(b.rollPeriod).toBeLessThan(2);
    b.meet(4);
    run(b, 400);
    if (b.gm <= 0.02) expect(b.rollPeriod).toBe(Infinity);
  });
});

describe('the runaway', () => {
  it('water aboard means less freeboard means more water aboard', () => {
    const b = crewed('open');
    b.meet(1.5);
    const first = b.boarding;
    const fb = b.freeboard;
    run(b, 8);
    expect(b.freeboard, 'she took water and sat no lower').toBeLessThan(fb);
    expect(b.boarding, 'the rate did not grow — this is not a runaway').toBeGreaterThan(first);
    // Everything else in this library settles. This one accelerates.
    const second = b.boarding;
    run(b, 8);
    expect(b.boarding - second).toBeGreaterThan(0);
  });

  it('has a tipping point, and it is twice her freeboard', () => {
    const b = crewed('open');
    const limit = livesIn(b.freeboard);
    expect(limit).toBeCloseTo(b.freeboard * 2, 6);

    b.meet(limit * 0.85);
    expect(b.swampsIn(), 'she drowned in a sea she can live in').toBe(Infinity);
    expect(b.boarding).toBe(0);

    b.meet(limit * 1.15);
    const t = b.swampsIn();
    expect(t).toBeLessThan(200);
    expect(t).toBeGreaterThan(0);
  });

  it('the worse the sea the faster, and it is not linear', () => {
    const at = (h: number): number => {
      const b = crewed('open');
      b.meet(h);
      return b.swampsIn();
    };
    const mild = at(1.0);
    const bad = at(1.5);
    const awful = at(2.2);
    expect(mild).toBeGreaterThan(bad);
    expect(bad).toBeGreaterThan(awful);
    expect(awful).toBeLessThan(mild / 3);
  });

  it('YOU CANNOT BAIL YOUR WAY OUT OF IT', () => {
    // The single most important number in the module. A man with a bucket
    // moves about 2 kg/s and the sea is putting thirty times that aboard.
    const bailingAt = (rate: number): number => {
      const b = crewed('open');
      b.meet(1.5);
      b.bail(rate);
      return b.swampsIn();
    };
    const nobody = bailingAt(0);
    const bucket = bailingAt(2);
    const pump = bailingAt(1.5);
    expect(bucket).toBeLessThan(nobody * 1.12);
    expect(pump).toBeLessThan(nobody * 1.12);
    // …and it takes an absurd rate to buy even half again as long.
    expect(bailingAt(30)).toBeGreaterThan(nobody);
    expect(bailingAt(30)).toBeLessThan(nobody * 2);
  });

  it('where they sit decides what sea she can live in', () => {
    const spread = crewed('open', 3, 0, 0);
    const aft = crewed('open', 3, -0.9, 0);
    const heaped = crewed('open', 3, -0.8, 0.9);

    expect(livesIn(spread.freeboard)).toBeGreaterThan(0.9);
    // Three people crammed into her last metre put her quarter on the water,
    // and she is shipping it standing still. This is how boats are swamped
    // from astern.
    expect(aft.freeboard, 'her transom was still above water').toBeLessThan(0.05);
    expect(livesIn(aft.freeboard)).toBeLessThan(livesIn(spread.freeboard) / 4);

    spread.meet(1.0);
    aft.meet(1.0);
    heaped.meet(1.0);
    expect(aft.swampsIn()).toBeLessThan(spread.swampsIn());
    expect(heaped.swampsIn()).toBeLessThan(aft.swampsIn());
  });

  it('freeboard is measured at her LOWEST rail, not amidships', () => {
    // Without that the crew's position feeds nothing and a boat with four
    // people in the stern is as safe as an empty one.
    const level = crewed('open', 3, 0, 0);
    const listed = crewed('open', 3, 0, 1);
    expect(listed.draught).toBeCloseTo(level.draught, 6);
    expect(listed.freeboard, 'listing her cost no freeboard at all').toBeLessThan(
      level.freeboard - 0.05
    );
  });

  it('swamping says whether the loop has started', () => {
    const b = crewed('selfDraining');
    b.meet(1.5);
    run(b, 30);
    expect(b.swamping, 'a self-draining boat was losing the race').toBe(false);
    expect(b.draining).toBeGreaterThan(0);

    const open = crewed('open');
    open.meet(1.5);
    expect(open.swamping).toBe(true);
    open.bail(2);
    expect(open.swamping, 'a bucket won the race').toBe(true);
  });
});

describe('what happens after she fills', () => {
  it('an open boat founders and there is nothing left', () => {
    const b = crewed('open');
    b.meet(2.2);
    run(b, 60);
    expect(b.state).toBe('gone');
    expect(b.water).toBeCloseTo(b.capacity, 0);
    expect(b.freeboard, 'her gunwale was still above the sea').toBeLessThan(0);
  });

  it('buoyancy buys NO SECONDS, and changes everything about the end of them', () => {
    const open = crewed('open');
    const buoyant = crewed('buoyant');
    open.meet(1.5);
    buoyant.meet(1.5);
    // She fills marginally SOONER, because the tanks take up room the water
    // would have had. The usual claim for buoyancy is that it buys you time
    // and it does not buy a second.
    expect(buoyant.swampsIn()).toBeLessThanOrEqual(open.swampsIn());

    run(open, 60);
    run(buoyant, 60);
    expect(open.state).toBe('gone');
    expect(buoyant.state, 'she went under with tanks in her').toBe('awash');
    expect(buoyant.gm, 'floating awash with no stability is not floating').toBeGreaterThan(0);
  });

  it('freeing ports break the loop rather than slowing it', () => {
    const b = crewed('selfDraining');
    b.meet(1.5);
    expect(b.swampsIn()).toBe(Infinity);
    run(b, 200);
    // She finds a level and sits at it all day — which is the difference
    // between fixing the problem and surviving it.
    const settled = b.water;
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThan(b.capacity * 0.5);
    run(b, 200);
    expect(b.water).toBeCloseTo(settled, 0);
    expect(b.freeboard).toBeGreaterThan(0.2);
  });

  it('and a self-righting boat comes back with nobody doing anything', () => {
    const b = crewed('selfRighting');
    b.capsize();
    expect(b.capsized).toBe(true);
    run(b, 2);
    expect(b.capsized, 'she came up instantly, which is not righting').toBe(true);
    run(b, 6);
    expect(b.capsized).toBe(false);
    // …and then drains herself.
    b.meet(0);
    run(b, 60);
    expect(b.state).toBe('dry');
  });

  it('every other fit stays where it was put', () => {
    for (const fit of ['open', 'buoyant', 'selfDraining'] as CraftFit[]) {
      const b = crewed(fit);
      b.capsize();
      run(b, 120);
      expect(b.capsized, `${fit} righted herself`).toBe(true);
    }
  });

  it('a boat on her side is not dry, however little water is in her', () => {
    const b = crewed('selfDraining');
    b.capsize();
    run(b, 120);
    expect(b.draining, 'her freeing ports worked upside down').toBe(0);
    expect(b.state).toBe('awash');
  });

  it('coming back up is not the same as being all right', () => {
    const open = crewed('open');
    open.capsize();
    open.right();
    expect(open.capsized).toBe(false);
    expect(open.water, 'she came up empty').toBeGreaterThan(open.capacity * 0.8);

    const drains = crewed('selfDraining');
    drains.capsize();
    drains.right();
    drains.meet(0);
    run(drains, 80);
    expect(drains.water).toBeLessThan(10);
    expect(drains.state).toBe('dry');
  });

  it('self-righting costs her: she is a worse boat every other day of the year', () => {
    const plain = crewed('selfDraining');
    const righting = crewed('selfRighting');
    expect(righting.displacement).toBeGreaterThan(plain.displacement);
    expect(righting.freeboard, 'the ballast was free').toBeLessThan(plain.freeboard);
    expect(righting.gm).toBeLessThan(plain.gm);
    expect(livesIn(righting.freeboard)).toBeLessThan(livesIn(plain.freeboard));
  });
});

describe('a breaker does not care what her GM is', () => {
  it('steeper than one in seven is a wall rather than a slope', () => {
    expect(isBreaking(1, 8)).toBe(false);
    expect(isBreaking(1, 6)).toBe(true);
    expect(isBreaking(1, 0)).toBe(false);
  });

  it('and taller than six tenths of her beam rolls her, whatever her stability', () => {
    const under = crewed('open');
    expect(under.gm).toBeGreaterThan(3);
    under.meet(0.6 * under.beam - 0.2, 6);
    expect(under.breaking).toBe(true);
    expect(under.capsized, 'a small breaker rolled a very stiff boat').toBe(false);

    const over = crewed('open');
    over.meet(0.6 * over.beam + 0.1, 6);
    expect(over.capsized).toBe(true);
  });

  it('a big sea that is NOT breaking does not roll her, it fills her', () => {
    const b = crewed('open');
    b.meet(2.4, 90);
    expect(b.breaking).toBe(false);
    expect(b.capsized).toBe(false);
    run(b, 40);
    expect(b.state).toBe('gone');
  });

  it('a wide boat takes a bigger breaker, and that is the only defence there is', () => {
    const narrow = crewed('open', 3, 0, 0, { beam: 1.2 });
    const wide = crewed('open', 3, 0, 0, { beam: 2.6 });
    narrow.meet(1.0, 6);
    wide.meet(1.0, 6);
    expect(narrow.capsized).toBe(true);
    expect(wide.capsized).toBe(false);
  });
});

describe('the handshakes', () => {
  it('the sea state goes in with nothing imported either way', () => {
    // `boat.meet(sea.windSea.height, sea.windSea.length)` — two numbers.
    const b = crewed('open');
    b.meet(1.3, 8);
    expect(b.sea).toBe(1.3);
    expect(b.breaking).toBe(true);
  });

  it('she publishes a Loading, the same object a hold does', () => {
    const b = crewed('open', 3, -0.5, 0.5);
    const l = b.loading;
    expect(typeof l.trim).toBe('number');
    expect(typeof l.list).toBe('number');
    expect(typeof l.sink).toBe('number');
    expect(typeof l.stiffness).toBe('number');
    expect(l.sink).toBeGreaterThan(0);
  });

  it('people can stand in her, and outside her sheer there is no deck', () => {
    const b = crewed('open');
    b.object.position.set(20, 0, -6);
    b.object.updateMatrixWorld(true);
    const inside = b.deckAt(20, -6);
    expect(inside).not.toBeNull();
    // Outside her sheer is how you find out somebody has gone over the side,
    // with no separate test for it.
    expect(b.deckAt(20 + b.beam, -6)).toBeNull();
    expect(b.deckAt(20, -6 + b.length)).toBeNull();

    const n = b.normalAt(20, -6);
    expect(n.length()).toBeCloseTo(1, 5);
  });

  it('rides a real ocean and floats at her own draught', () => {
    const sea = createOcean({ amplitude: 0.2, wavelength: 24, size: 200, segments: 40 });
    const b = crewed('open');
    b.float((x, z) => sea.heightAt(x, z));
    b.object.position.set(4, 0, 3);
    run(b, 4);
    const here = sea.heightAt(4, 3);
    // Her origin is her keel-to-waterline datum, so she sits a draught below
    // the surface she is on.
    expect(b.object.position.y).toBeLessThan(here);
    expect(here - b.object.position.y).toBeCloseTo(b.draught, 1);
  });
});

describe('the picture', () => {
  it('the water is inside her, and there is none of it when she is dry', () => {
    const b = crewed('open');
    const pond = b.object.getObjectByName('craft:water')!;
    expect(pond).toBeTruthy();
    expect(pond.visible).toBe(false);

    b.meet(2);
    run(b, 20);
    expect(pond.visible).toBe(true);
    // It stands in her, not over her: no deeper than her side and no wider
    // than her beam.
    expect(pond.scale.y).toBeGreaterThan(0.02);
    expect(pond.scale.y).toBeLessThanOrEqual(b.depth + 1e-6);
    expect(pond.scale.x).toBeLessThanOrEqual(b.beam + 1e-6);
    expect(pond.position.y).toBeCloseTo(pond.scale.y / 2, 5);
  });

  it('THE SURFACE OF WATER IS LEVEL, whatever she is doing', () => {
    // It is a child of the hull, so left alone it heels with her — a slab of
    // sea tilted inside a tilted boat, which is the one thing water never does.
    const b = crewed('open', 3, 0, 1);
    b.meet(2);
    run(b, 20);
    b.object.updateMatrixWorld(true);
    const pond = b.object.getObjectByName('craft:water')!;
    expect(Math.abs(b.object.rotation.z), 'she is not even heeled').toBeGreaterThan(0.05);

    const up = new Vector3(0, 1, 0).applyQuaternion(pond.getWorldQuaternion(new Quaternion()));
    expect(up.y, 'the water in her was tilted').toBeGreaterThan(0.999);
  });

  it('it deepens and widens as she fills, because her section is a wedge', () => {
    const b = crewed('open');
    const pond = b.object.getObjectByName('craft:water')!;
    b.meet(2.4);
    run(b, 10);
    const early = { d: pond.scale.y, w: pond.scale.x };
    run(b, 40);
    expect(pond.scale.y).toBeGreaterThan(early.d);
    expect(pond.scale.x, 'the water got deeper without getting wider').toBeGreaterThan(early.w);
  });

  it('a capsized boat lies on her side and the water in her is not drawn', () => {
    const b = crewed('open');
    b.capsize();
    b.update(0.1);
    expect(Math.abs(b.object.rotation.z)).toBeGreaterThan(1.5);
    expect(b.object.getObjectByName('craft:water')!.visible).toBe(false);
  });

  it('every fit builds, and only some of them have ports and ballast', () => {
    for (const fit of CRAFT_FITS) {
      const b = createSmallCraft({ fit });
      expect(b.object.name).toBe(`craft:${fit}`);
      expect(b.object.children.length).toBeGreaterThan(0);
      expect(b.slots.length).toBe(1);
      expect(b.obstacleRadius).toBeGreaterThan(0);
    }
    // Same hull, four fits: the only thing that changes is what happens to the
    // water, which is why the axis is an argument rather than a catalogue.
    const open = createSmallCraft({ fit: 'open' });
    const tanks = createSmallCraft({ fit: 'buoyant' });
    expect(tanks.length).toBe(open.length);
    expect(tanks.beam).toBe(open.beam);
    expect(tanks.capacity, 'the tanks took up no room').toBeLessThan(open.capacity);
  });

  it('a zero or negative step does nothing at all', () => {
    const b = crewed('open');
    b.meet(2);
    const w = b.water;
    b.update(0);
    b.update(-5);
    expect(b.water).toBe(w);
  });
});
