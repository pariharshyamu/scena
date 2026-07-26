import { describe, it, expect } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { createGear, createHold, listFor, GEAR_KINDS, type GearKind } from '../src';

const run = (g: ReturnType<typeof createGear>, seconds: number, dt = 0.25): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) g.update(dt);
};

/** Over the side and settled, whatever kind it is. */
const shot = (kind: GearKind, extra: Record<string, unknown> = {}) => {
  const g = createGear({ kind, ...extra });
  g.shoot();
  run(g, 400);
  return g;
};

describe('a working load pulls back', () => {
  it('nothing is on the wire until the gear is over the side', () => {
    for (const kind of GEAR_KINDS) {
      const g = createGear({ kind });
      expect(g.out, kind).toBe(0);
      expect(g.strain, kind).toBe(0);
      expect(g.moment, kind).toBe(0);
      expect(g.state, kind).toBe('stowed');
    }
  });

  it('a towed load heels her by how far round the wire has come, and by nothing else', () => {
    const g = shot('tow');
    g.setWay(4);
    g.update(0.1);

    g.setAngle(0);
    expect(g.moment, 'a wire dead astern was laying her over').toBeCloseTo(0, 6);

    g.setAngle(Math.PI / 2);
    const abeam = g.moment;
    expect(abeam).toBeGreaterThan(0);

    // …and it is a sine, so half the angle is well over half the moment.
    g.setAngle(Math.PI / 4);
    expect(g.moment).toBeCloseTo(abeam * Math.SQRT1_2, 5);

    // The other way is the other way.
    g.setAngle(-Math.PI / 2);
    expect(g.moment).toBeCloseTo(-abeam, 5);
  });

  it('the couple is against the water, not against the deck', () => {
    // Same boat, same pull, and the only difference is how deep her grip is.
    // Measured about the deck a girted tug heels about half as far as she
    // really does, and the sum comes out reassuring.
    const g = shot('tow');
    g.setWay(4);
    g.setAngle(Math.PI / 2);
    g.update(0.1);
    const lead = g.lead.position.y;
    const arm = g.moment / g.strain;
    expect(arm, 'the arm stopped at the deck').toBeGreaterThan(lead * 1.5);
  });

  it('a hanging load acts where it hangs, and a derrick swings it outboard', () => {
    const g = shot('derrick');
    g.setLoad(4);

    g.setOutreach(0);
    expect(g.moment, 'a load on her centreline was heeling her').toBeCloseTo(0, 6);

    g.setOutreach(3);
    expect(g.moment).toBeCloseTo(12, 6);
    g.setOutreach(6);
    expect(g.moment, 'the arm is the outreach, and it is linear').toBeCloseTo(24, 6);
  });
});

describe('the strain', () => {
  it('grows with the square of her way — you drive her, not the winch', () => {
    const g = shot('trawl');
    const at = (v: number): number => {
      g.setWay(v);
      g.update(0.1);
      return g.strain;
    };
    const slow = at(1);
    const half = at(2);
    const full = at(3);
    expect(half).toBeGreaterThan(slow * 1.5);
    expect(full).toBeGreaterThan(half);
  });

  it('SATURATES at her bollard pull, because a boat cannot out-pull herself', () => {
    // Written as a bare square she pulls harder than she can pull, and then
    // coming fast — which gives her all of it — makes the strain go DOWN. The
    // one event this module is about becomes a relief.
    const g = shot('trawl');
    for (const v of [0, 2, 4, 6, 10, 20]) {
      g.setWay(v);
      g.update(0.1);
      expect(g.strain, `at ${v} m/s she was out-pulling her own bollard pull`).toBeLessThanOrEqual(
        g.bollardPull + 1e-9
      );
    }
  });

  it('coming fast is the worst it ever gets under her own power', () => {
    const g = shot('trawl');
    g.setWay(3.5);
    g.update(0.1);
    const towing = g.strain;

    g.comeFast();
    g.update(0.1);
    expect(g.strain, 'a net foul of the bottom EASED her').toBeGreaterThan(towing);
    expect(g.strain).toBeCloseTo(g.bollardPull, 6);
    expect(g.state).toBe('fast');

    // …and it does not care how fast she is going, because she is not going.
    g.setWay(0);
    g.update(0.1);
    expect(g.strain).toBeCloseTo(g.bollardPull, 6);
  });

  it('a fast net will not come home, and hauling on it is how she is pulled down', () => {
    const g = shot('trawl');
    g.setWay(3);
    g.comeFast();
    g.haul();
    run(g, 900);
    expect(g.out, 'a net foul of the bottom came quietly aboard').toBeGreaterThan(0.5);
    expect(g.fast).toBe(true);

    g.slip();
    run(g, 30);
    expect(g.out).toBeCloseTo(0, 6);
    expect(g.fast).toBe(false);
  });

  it('a derrick has the weight on the hook from the first inch of the lift', () => {
    // The dangerous moment of a lift is the PICK-UP. She is not heeled a
    // little at first and a lot later; she is heeled all of it at once.
    const g = createGear({ kind: 'derrick' });
    g.setLoad(5);
    g.setOutreach(4);
    g.shoot();
    g.update(1);
    expect(g.out, 'the lift had barely started').toBeLessThan(0.1);
    expect(g.strain).toBeCloseTo(5, 6);
    const early = g.moment;
    run(g, 200);
    expect(g.out).toBeCloseTo(1, 6);
    expect(g.moment, 'the moment grew as it came up').toBeCloseTo(early, 6);
  });
});

describe('girting, and the reason there is a slip()', () => {
  it('a wire abeam with weight on it, and her rudder cannot answer it', () => {
    const g = shot('tow');
    g.setWay(4);

    g.setAngle(0);
    g.update(0.1);
    expect(g.girting, 'dead astern was girting her').toBe(false);

    g.setAngle(Math.PI / 2);
    g.update(0.1);
    expect(g.girting).toBe(true);

    // Weight matters as much as angle. Lying stopped with the wire abeam is
    // uncomfortable and survivable.
    g.setWay(0);
    g.update(0.1);
    expect(g.girting, 'a slack wire abeam was girting her').toBe(false);
  });

  it('a hanging load cannot girt her — it is a different sum', () => {
    for (const kind of ['pots', 'derrick'] as GearKind[]) {
      const g = shot(kind);
      g.setWay(4);
      g.setAngle(Math.PI / 2);
      g.update(0.1);
      expect(g.girting, kind).toBe(false);
    }
  });

  it('a tow hook opens NOW and a trawl takes long enough to matter', () => {
    const letGo = (kind: GearKind): number => {
      const g = shot(kind);
      g.setWay(4);
      let t = 0;
      g.slip();
      while (g.out > 1e-6 && t < 120) {
        g.update(0.1);
        t += 0.1;
      }
      return t;
    };
    const tow = letGo('tow');
    const trawl = letGo('trawl');
    expect(tow).toBeLessThan(1);
    expect(trawl).toBeGreaterThan(tow * 5);
  });

  it('a derrick cannot let go at all, and the no-op is the point', () => {
    const g = shot('derrick');
    g.setLoad(6);
    g.setOutreach(5);
    const before = g.moment;
    g.slip();
    run(g, 60);
    expect(g.out, 'a derrick dropped its load on the deck below').toBeCloseTo(1, 6);
    expect(g.moment).toBeCloseTo(before, 6);
  });

  it('slipping takes the strain, the moment and the surge with it', () => {
    const g = shot('tow');
    g.setWay(5);
    g.setAngle(1.2);
    g.snatch(80);
    g.update(0.1);
    expect(g.moment).toBeGreaterThan(50);

    g.slip();
    run(g, 5);
    expect(g.strain).toBe(0);
    expect(g.moment).toBe(0);
    expect(g.surge).toBe(0);
    expect(g.state).toBe('stowed');
  });
});

describe('the other end pulls, and that is what kills her', () => {
  it('her own gear at its worst gives her a heel she can live with', () => {
    // This is the whole reason a tug carries a hook that opens rather than
    // more beam. Nothing she can do to herself is enough.
    const g = shot('tow');
    g.setWay(6);
    g.setAngle(Math.PI / 2);
    g.update(0.1);
    const list = (listFor(g.moment, 400, 1.2) * 180) / Math.PI;
    // Twenty-odd degrees, and that is the honest number — a tug's own pull
    // right abeam lays her a long way over and does not put her under. Which
    // is exactly why a tow that can add four times it is fatal.
    expect(list, 'her own bollard pull abeam should not be a capsize').toBeLessThan(32);
    expect(list).toBeGreaterThan(8);
  });

  it('a snatch is several times anything she could put on it herself', () => {
    const g = shot('tow');
    g.setWay(4);
    g.setAngle(Math.PI / 2);
    g.update(0.1);
    const own = g.strain;

    g.snatch(140);
    g.update(0.01);
    expect(g.strain).toBeGreaterThan(own * 4);

    const list = (listFor(g.moment, 400, 1.2) * 180) / Math.PI;
    expect(list, 'a sheering tow could not put her over').toBeGreaterThan(35);
  });

  it('and it is over in seconds, which is the problem with it', () => {
    const g = shot('tow');
    g.snatch(100);
    g.update(0.01);
    expect(g.surge).toBeGreaterThan(99);
    run(g, 10, 0.1);
    expect(g.surge, 'the surge was still on the wire ten seconds later').toBeLessThan(3);
    run(g, 30, 0.1);
    expect(g.surge).toBe(0);
  });

  it('two snatches are a snatch, not the sum of two', () => {
    const g = shot('tow');
    g.snatch(60);
    g.snatch(40);
    g.update(0.01);
    expect(g.surge).toBeLessThan(61);
    expect(g.surge).toBeGreaterThan(59);
  });

  it('nothing is on the wire when the gear is in', () => {
    const g = createGear({ kind: 'tow' });
    g.snatch(200);
    g.update(0.01);
    expect(g.surge).toBe(0);
    expect(g.strain).toBe(0);
  });
});

describe('what it costs her', () => {
  it('a towed net takes a real bite out of her speed and a derrick takes none', () => {
    const net = shot('trawl');
    net.setWay(3.5);
    net.update(0.1);
    expect(net.drag).toBeGreaterThan(0.5);

    const boom = shot('derrick');
    boom.setWay(3.5);
    boom.update(0.1);
    expect(boom.drag, 'a boom in the air was slowing her down').toBe(0);
  });

  it('a snatch can stop her dead, and never takes more than her way', () => {
    const g = shot('tow');
    g.setWay(4);
    g.snatch(400);
    g.update(0.01);
    expect(g.drag).toBeLessThanOrEqual(4);
    expect(g.drag).toBeGreaterThan(3);
  });
});

describe('the handshake into the hold', () => {
  it('gear capsizes her through the same arithmetic a bad stow does', () => {
    const hold = createHold({ kind: 'steamer' });
    expect(hold.capsized).toBe(false);
    expect(hold.loading.list).toBeCloseTo(0, 6);

    const rising: number[] = [];
    for (const m of [200, 600, 1200]) {
      hold.heel('gear', m);
      rising.push(hold.loading.list);
    }
    expect(rising[0]).toBeGreaterThan(0);
    expect(rising[1]).toBeGreaterThan(rising[0]);
    expect(rising[2]).toBeGreaterThan(rising[1]);
    expect(hold.capsized).toBe(false);

    hold.heel('gear', 4000);
    expect(hold.capsized, 'she took four thousand tonne-metres and stood up').toBe(true);
    expect(Math.abs(hold.loading.list)).toBeCloseTo(hold.vanishing, 6);
  });

  it('it comes off again by name, and several can be live at once', () => {
    const hold = createHold({ kind: 'steamer' });
    hold.heel('gear', 400);
    hold.heel('deckload', -400);
    expect(hold.loading.list, 'two equal and opposite moments left her over').toBeCloseTo(0, 6);

    hold.heel('deckload', 0);
    expect(hold.loading.list).toBeGreaterThan(0);
    hold.heel('gear', 0);
    expect(hold.loading.list).toBeCloseTo(0, 6);
  });

  it('a live gear moment drives the hold, and slipping stands her back up', () => {
    const hold = createHold({ kind: 'steamer' });
    const g = shot('tow', { beam: 9, length: 26 });
    g.setWay(5);
    g.setAngle(Math.PI / 2);
    g.snatch(180);
    g.update(0.01);
    hold.heel('gear', g.moment);
    const over = Math.abs(hold.loading.list);
    expect(over).toBeGreaterThan(0.02);

    g.slip();
    run(g, 5);
    hold.heel('gear', g.moment);
    expect(hold.loading.list).toBeCloseTo(0, 6);
  });

  it('listFor is the sum the hold does', () => {
    const hold = createHold({ kind: 'steamer' });
    for (const m of [100, 400, 900]) {
      hold.heel('gear', m);
      expect(listFor(m, hold.displacement, hold.gm, hold.vanishing)).toBeCloseTo(
        hold.loading.list,
        6
      );
    }
  });

  it('listFor gives up at the angle of vanishing stability, not at ninety degrees', () => {
    expect(listFor(1e9, 500, 1.2, 0.7)).toBeCloseTo(0.7, 6);
    expect(listFor(-1e9, 500, 1.2, 0.7)).toBeCloseTo(-0.7, 6);
    // No metacentric height is no equilibrium at all.
    expect(listFor(1, 500, 0, 0.7)).toBeCloseTo(0.7, 6);
  });
});

describe('shooting and hauling', () => {
  it('takes as long as it takes, and hauling is the slow half', () => {
    for (const kind of GEAR_KINDS) {
      const g = createGear({ kind });
      g.shoot();
      let t = 0;
      while (g.out < 1 - 1e-9 && t < 2000) {
        g.update(0.5);
        t += 0.5;
      }
      expect(g.out, kind).toBeCloseTo(1, 6);
      expect(g.state, kind).toBe('working');

      g.haul();
      let back = 0;
      while (g.out > 1e-9 && back < 4000) {
        g.update(0.5);
        back += 0.5;
      }
      expect(g.state, kind).toBe('stowed');
      if (kind !== 'derrick') {
        expect(back, `${kind} came home as fast as it went out`).toBeGreaterThan(t);
      }
    }
  });

  it('reports shooting on the way out and working at the end of it', () => {
    const seen: string[] = [];
    const g = createGear({ kind: 'trawl' });
    g.onState = (s) => seen.push(s);
    g.shoot();
    run(g, 400);
    g.haul();
    run(g, 600);
    expect(seen).toEqual(['shooting', 'working', 'shooting', 'stowed']);
  });

  it('starts over the side when it is told to', () => {
    const g = createGear({ kind: 'trawl', shot: true });
    expect(g.out).toBe(1);
    expect(g.state).toBe('working');
    expect(g.strain).toBeGreaterThan(0);
  });
});

describe('the picture', () => {
  it("the derrick's head is where the arm says it is", () => {
    // The boom SLEWS: it stows fore-and-aft and swings outboard, so the angle
    // comes out of a cosine. Taken as an arcsine the head travels AFT while
    // the number says outboard, and the one distance the whole module turns
    // on is the one distance the picture does not show.
    const g = shot('derrick');
    const boom = g.object.getObjectByName('gear:boom');
    const load = g.object.getObjectByName('gear:load');
    expect(boom).toBeTruthy();
    expect(load).toBeTruthy();
    const spar = boom!.children[0]!;

    for (const reach of [0, 3, 6]) {
      g.setOutreach(reach);
      g.update(0.1);
      g.object.updateMatrixWorld(true);
      const tip = spar.localToWorld(
        new Vector3((spar as never as { geometry: { parameters: { width: number } } }).geometry
          .parameters.width / 2, 0, 0)
      );
      expect(tip.x, `the boom head was not ${reach} m outboard`).toBeCloseTo(g.outreach, 4);
      expect(load!.position.x, 'the load was not under the head').toBeCloseTo(tip.x, 4);
      expect(load!.position.z).toBeCloseTo(tip.z, 4);
      expect(load!.position.y, 'the load was not below the head').toBeLessThan(tip.y);
    }
  });

  it('the load is in the water and the wire reaches it', () => {
    const g = shot('trawl', { freeboard: 2.2 });
    const load = g.object.getObjectByName('gear:load')!;
    const wire = g.object.getObjectByName('gear:wire')!;
    expect(load.visible).toBe(true);
    expect(load.position.y, 'the net was being towed through the air').toBeLessThan(-1);

    // The wire is a cylinder aimed end to end, so its length is the span.
    const span = load.position.distanceTo(g.lead.position);
    expect(wire.scale.y).toBeCloseTo(span, 3);
    expect(wire.position.distanceTo(load.position)).toBeCloseTo(span / 2, 3);
  });

  it('the wire streams out on the angle it is given', () => {
    const g = shot('trawl');
    const load = g.object.getObjectByName('gear:load')!;
    g.setAngle(0);
    g.update(0.1);
    expect(load.position.x).toBeCloseTo(g.lead.position.x, 4);
    const astern = load.position.z;

    g.setAngle(Math.PI / 2);
    g.update(0.1);
    expect(load.position.x, 'the wire did not come round').toBeGreaterThan(20);
    expect(load.position.z, 'a wire right abeam was still astern').toBeGreaterThan(astern);
  });

  it('the gear disappears when it is inboard', () => {
    const g = createGear({ kind: 'trawl' });
    g.update(0.1);
    expect(g.object.getObjectByName('gear:load')!.visible).toBe(false);
    expect(g.object.getObjectByName('gear:wire')!.visible).toBe(false);
  });
});

describe('rubbish in', () => {
  it('a NaN way, angle, outreach or load does not poison her', () => {
    const g = shot('tow');
    g.setWay(Number.NaN);
    g.setAngle(Number.NaN);
    g.update(0.1);
    expect(Number.isFinite(g.strain)).toBe(true);
    expect(Number.isFinite(g.moment)).toBe(true);

    const d = shot('derrick');
    d.setOutreach(Number.POSITIVE_INFINITY);
    d.setLoad(Number.NaN);
    d.update(0.1);
    expect(Number.isFinite(d.moment)).toBe(true);
    expect(d.outreach).toBeGreaterThanOrEqual(0);
  });

  it('the angle is bounded — a wire cannot come round forward of abeam', () => {
    const g = shot('tow');
    g.setAngle(Math.PI);
    expect(g.angle).toBeCloseTo(Math.PI / 2, 6);
    g.setAngle(-Math.PI);
    expect(g.angle).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('a zero or negative step does nothing at all', () => {
    const g = shot('trawl');
    const before = g.out;
    g.haul();
    g.update(0);
    g.update(-5);
    expect(g.out).toBe(before);
  });
});

describe('the load is in the world, not on her deck', () => {
  /** Lay a hull over, hard, and see where her gear ends up. */
  const heeled = (kind: GearKind, radians: number) => {
    const hull = new Object3D();
    hull.rotation.z = radians;
    const g = shot(kind);
    hull.add(g.object);
    // Her working deck, so the sums below are heights above the water.
    g.object.position.y = 2.1;
    hull.updateMatrixWorld(true);
    g.update(0.1);
    hull.updateMatrixWorld(true);
    return { g, hull };
  };

  it('a towed load stays in the water however far over she goes', () => {
    // A hundred and fifty metres of wire is a rigid child of the hull, and
    // rolled forty-five degrees its far end is a hundred metres UNDER the sea.
    // She carries her own net around the sky and the picture of a girted tug
    // has no wire in it at all.
    const upright = heeled('tow', 0);
    upright.g.setAngle(Math.PI / 2);
    upright.g.update(0.1);
    upright.hull.updateMatrixWorld(true);
    const flat = upright.g.object
      .getObjectByName('gear:load')!
      .getWorldPosition(new Vector3());

    const over = heeled('tow', -0.78);
    over.g.setAngle(Math.PI / 2);
    over.g.update(0.1);
    over.hull.updateMatrixWorld(true);
    const laid = over.g.object.getObjectByName('gear:load')!.getWorldPosition(new Vector3());

    expect(Math.abs(flat.y), 'the load was not at the surface to begin with').toBeLessThan(0.6);
    expect(
      Math.abs(laid.y),
      `a boat at 45° towed her net ${laid.y.toFixed(1)} m out of the water`
    ).toBeLessThan(0.6);
    // …and it is still about the same distance from her, not swung up into the
    // air. A couple of metres in a hundred and fifty is the geometry of tipping
    // the lead over; a hundred metres is the bug.
    expect(Math.abs(laid.length() - flat.length())).toBeLessThan(5);
  });

  it('a hanging load hangs plumb, which is why it swings out over her side', () => {
    const upright = heeled('derrick', 0);
    upright.g.setOutreach(6);
    upright.g.update(0.1);
    upright.hull.updateMatrixWorld(true);
    // The boom's HEAD, not its pivot — the pivot is on the centreline and the
    // whole point of a derrick is that its head is not.
    const tipOf = (g: ReturnType<typeof createGear>): Vector3 => {
      const spar = g.object.getObjectByName('gear:boom')!.children[0]!;
      const w = (spar as never as { geometry: { parameters: { width: number } } }).geometry
        .parameters.width;
      return spar.localToWorld(new Vector3(w / 2, 0, 0));
    };
    const head = tipOf(upright.g);
    const hook = upright.g.object.getObjectByName('gear:load')!.getWorldPosition(new Vector3());
    expect(hook.y, 'the load was not below the boom').toBeLessThan(head.y);

    const over = heeled('derrick', -0.5);
    over.g.setOutreach(6);
    over.g.update(0.1);
    over.hull.updateMatrixWorld(true);
    const oHead = tipOf(over.g);
    const oHook = over.g.object.getObjectByName('gear:load')!.getWorldPosition(new Vector3());
    // Straight down from wherever the head has got to — the horizontal offset
    // between head and hook is zero whatever she is doing.
    expect(Math.abs(oHook.x - oHead.x), 'the load swung with the deck instead of hanging').toBeLessThan(
      1.2
    );
    expect(oHook.y).toBeLessThan(oHead.y);
  });
});
