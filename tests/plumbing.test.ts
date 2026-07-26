import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  createPlumbing,
  headPressure,
  orificeFlow,
  mixedAt,
  mixFor,
  SUPPLY_KINDS,
  SCALD,
  type SupplyKind,
} from '../src';

/** A bathroom: a shower, a basin and a WC, all on the same branch. */
const bathroom = (kind: SupplyKind) => {
  const p = createPlumbing({ kind });
  p.outlet('shower', { kind: 'shower', at: new Vector3(2, 1.9, 0), height: 1.9 });
  p.outlet('basin', { kind: 'tap', at: new Vector3(-1.4, 0.9, 0.6), height: 0.9 });
  p.outlet('wc', { kind: 'wc', at: new Vector3(-1.8, 0.4, -0.8), height: 0.4 });
  return p;
};
/** Somebody in the shower, having turned it until it felt right. */
const showering = (kind: SupplyKind, want = 40) => {
  const p = bathroom(kind);
  p.open('shower');
  p.update(0.1);
  p.setTarget('shower', want);
  return p;
};
const run = (p: ReturnType<typeof createPlumbing>, seconds: number, dt = 1): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) p.update(dt);
};

describe('what you get depends on what somebody else is doing', () => {
  it('opening a second outlet takes water off the first', () => {
    const p = showering('mains');
    const alone = p.drawAt('shower')!.flow;
    p.open('basin');
    p.update(0.1);
    expect(p.drawAt('shower')!.flow, 'nothing happened to the shower').toBeLessThan(alone * 0.95);
    p.close('basin');
    p.update(0.1);
    expect(p.drawAt('shower')!.flow).toBeCloseTo(alone, 4);
  });

  it('THE SHOWER SCALDS WHEN THE LAVATORY IS FLUSHED', () => {
    // The headline, and the mechanism is not what people think: a WC draws
    // from the COLD branch only, so the cold flow through the mixer falls and
    // the hot does not. Same hot, less cold, hotter mixture.
    const p = showering('mains', 40);
    const before = p.drawAt('shower')!;
    expect(before.temp).toBeCloseTo(40, 0);
    expect(before.scalding).toBe(false);

    p.open('wc');
    p.update(0.1);
    const after = p.drawAt('shower')!;
    expect(after.temp).toBeGreaterThan(before.temp + 4);
    expect(after.temp).toBeGreaterThanOrEqual(SCALD);
    expect(after.scalding).toBe(true);
    // Nothing in the shower changed. Nobody touched the mixer.
    expect(after.hot).toBeCloseTo(before.hot, 1);
  });

  it('…and it is the COLD branch that moved, not the hot', () => {
    const p = showering('mains', 40);
    const hot = p.hotPressure;
    const cold = p.pressure;
    p.open('wc');
    p.update(0.1);
    expect(p.pressure, 'the cold did not drop').toBeLessThan(cold * 0.8);
    expect(p.hotPressure, 'the hot branch moved, and nothing was drawn from it').toBeCloseTo(
      hot,
      4
    );
  });

  it('solved as ONE supply there is no scald anywhere', () => {
    // Both branches falling together keeps the mixture where it was — which
    // is a plumbing system nobody has ever lived in. This asserts the two
    // manifolds are genuinely separate.
    const p = showering('mains', 40);
    p.open('wc');
    p.update(0.1);
    const d = p.drawAt('shower')!;
    const bothFell = mixedAt(0.6, p.hotTemp, 10, 1);
    expect(Math.abs(d.temp - bothFell)).toBeGreaterThan(3);
  });
});

describe('what happens to the person in the shower', () => {
  it('a bucket has no network, so there is nothing to share', () => {
    const p = bathroom('bucket');
    p.open('shower');
    p.open('wc');
    p.update(0.1);
    const d = p.drawAt('shower')!;
    expect(d.flow).toBe(0);
    expect(p.pressure).toBe(0);
    // It is the only supply here that cannot scald anybody.
    expect(d.scalding).toBe(false);
    p.pour('shower', 12);
    expect(p.poured).toBe(12);
  });

  it('gravity takes the FLOW away', () => {
    const p = showering('gravity', 40);
    const alone = p.drawAt('shower')!;
    expect(alone.usable).toBe(true);
    p.open('basin');
    p.open('wc');
    p.outlet('kitchen', { kind: 'tap' });
    p.open('kitchen');
    p.update(0.1);
    const busy = p.drawAt('shower')!;
    expect(busy.flow).toBeLessThan(alone.flow);
    // A third of a bar has nothing to spare, so the same busy house that a
    // mains supply shrugs off puts this one under what is worth standing in —
    // and it does it without ever going anywhere near scalding.
    expect(busy.usable).toBe(false);
    expect(busy.scalding, 'a gravity system scalded somebody').toBe(false);

    const m = showering('mains', 40);
    m.open('basin');
    m.open('wc');
    m.outlet('kitchen', { kind: 'tap' });
    m.open('kitchen');
    m.update(0.1);
    expect(m.drawAt('shower')!.usable, 'the same demand starved a mains supply').toBe(true);
  });

  it('mains takes the TEMPERATURE away instead — it has flow to spare', () => {
    const p = showering('mains', 40);
    p.open('wc');
    p.update(0.1);
    const d = p.drawAt('shower')!;
    expect(d.usable, 'there was still plenty of water').toBe(true);
    expect(d.scalding).toBe(true);
  });

  it('thermostatic gives up flow rather than temperature', () => {
    const p = showering('thermostatic', 40);
    const alone = p.drawAt('shower')!;
    p.open('wc');
    p.update(0.1);
    const after = p.drawAt('shower')!;
    expect(after.temp).toBeCloseTo(alone.temp, 1);
    expect(after.scalding).toBe(false);
    // It does not stop the contention — it stops it reaching you, and the
    // bill is paid in flow.
    expect(after.flow).toBeLessThan(alone.flow * 0.8);
    expect(p.pressure).toBeLessThan(2);
  });

  it('and it shuts off rather than hand somebody the cylinder', () => {
    const p = showering('thermostatic', 40);
    p.close('shower');
    // Everything else in the house wide open: no cold left for the mixer.
    p.open('basin', 1);
    p.open('wc', 1);
    p.outlet('outside', { kind: 'bath' });
    p.open('outside', 1);
    p.open('shower');
    p.update(0.1);
    const d = p.drawAt('shower')!;
    expect(d.scalding, 'a thermostatic mixer delivered scalding water').toBe(false);
  });

  it('a plain mains mixer does the opposite in the same conditions', () => {
    const p = showering('mains', 40);
    p.outlet('outside', { kind: 'bath' });
    p.open('basin', 1);
    p.open('wc', 1);
    p.open('outside', 1);
    p.update(0.1);
    // It does not reach the cylinder temperature — with everything in the
    // house open the hot branch is dragged down too — but it is a long way
    // from the forty degrees it was set to, and the thermostatic one is not.
    expect(p.drawAt('shower')!.temp).toBeGreaterThan(43);
    const t = createPlumbing({ kind: 'thermostatic' });
    t.outlet('shower', { kind: 'shower' });
    t.outlet('outside', { kind: 'bath' });
    t.open('shower');
    t.update(0.1);
    t.setTarget('shower', 40);
    t.open('outside', 1);
    t.update(0.1);
    expect(t.drawAt('shower')!.temp).toBeLessThan(41);
  });
});

describe('the arithmetic of a mixer', () => {
  it('mixedAt is the sum, and it runs to the cylinder temperature', () => {
    expect(mixedAt(0.6, 60, 10, 1)).toBeCloseTo(40, 6);
    expect(mixedAt(0.6, 60, 10, 0.55)).toBeGreaterThan(SCALD);
    // The cold fails entirely and you are standing under the cylinder.
    expect(mixedAt(0.6, 60, 10, 0)).toBeCloseTo(60, 6);
    expect(mixedAt(0, 60, 10, 1)).toBeCloseTo(10, 6);
  });

  it('mixFor inverts it', () => {
    expect(mixFor(40, 60, 10)).toBeCloseTo(0.6, 6);
    expect(mixedAt(mixFor(38, 60, 12), 60, 12)).toBeCloseTo(38, 6);
    expect(mixFor(40, 40, 40)).toBe(0);
  });

  it('setTarget sets it by feel, for the house as it is at that moment', () => {
    // Nobody turns a shower to 'sixty per cent hot'. The setting is right for
    // the conditions it was made in and for no others — which is the whole
    // failure, and calibrating by mix fraction hides it.
    const p = showering('mains', 42);
    expect(p.drawAt('shower')!.temp).toBeCloseTo(42, 0);
    const quiet = p.drawAt('shower')!.temp;
    p.open('wc');
    p.update(0.1);
    expect(p.drawAt('shower')!.temp).toBeGreaterThan(quiet);
  });

  it('a WC has no mixer and ignores anybody who says it has', () => {
    const p = bathroom('mains');
    p.setMix('wc', 1);
    p.setTarget('wc', 60);
    p.open('wc');
    p.update(0.1);
    const d = p.drawAt('wc')!;
    expect(d.hot).toBe(0);
    expect(d.temp).toBeCloseTo(10, 6);
  });
});

describe('height is pressure', () => {
  it('head is the only thing a gravity outlet has', () => {
    expect(headPressure(8)).toBeCloseTo(0.785, 3);
    expect(headPressure(0)).toBe(0);
    expect(headPressure(-4)).toBe(0);
    expect(orificeFlow(8.49, 2)).toBeCloseTo(12, 1);
    expect(orificeFlow(8.49, 0)).toBe(0);
  });

  it('the same house gives a different shower on each floor', () => {
    const at = (height: number) => {
      const p = createPlumbing({ kind: 'gravity' });
      p.outlet('s', { kind: 'shower', height });
      p.open('s');
      p.update(0.1);
      return p.drawAt('s')!;
    };
    const ground = at(0);
    const first = at(2.7);
    const second = at(5.4);
    expect(ground.flow).toBeGreaterThan(first.flow);
    expect(first.flow).toBeGreaterThan(second.flow);
    expect(ground.usable).toBe(true);
    expect(second.usable, 'the top floor got a usable shower off a loft cistern').toBe(false);
  });

  it('above the cistern there is nothing at all', () => {
    const p = createPlumbing({ kind: 'gravity', head: 8 });
    p.outlet('loft', { kind: 'shower', height: 9 });
    p.open('loft');
    p.update(0.1);
    expect(p.drawAt('loft')!.flow).toBe(0);
    expect(p.drawAt('loft')!.pressure).toBe(0);
  });

  it('the pressure reported is the one AT the outlet', () => {
    // The manifold reads backwards: raise an outlet and it draws less, so the
    // manifold pressure goes UP while the shower gets worse.
    const p = createPlumbing({ kind: 'gravity' });
    p.outlet('low', { kind: 'shower', height: 0 });
    p.outlet('high', { kind: 'shower', height: 6 });
    p.open('low');
    p.open('high');
    p.update(0.1);
    expect(p.drawAt('high')!.pressure).toBeLessThan(p.drawAt('low')!.pressure);
  });

  it('height does not matter on mains, which is why people fit a pump', () => {
    const at = (height: number) => {
      const p = createPlumbing({ kind: 'mains' });
      p.outlet('s', { kind: 'shower', height });
      p.open('s');
      p.update(0.1);
      return p.drawAt('s')!.flow;
    };
    expect(at(5.4) / at(0)).toBeGreaterThan(0.85);
  });
});

describe('the store empties faster than it fills', () => {
  it('it does not cool — it runs out', () => {
    const p = createPlumbing({ kind: 'mains', cylinder: 120, heater: 3 });
    p.outlet('s', { kind: 'shower' });
    p.open('s');
    p.update(0.1);
    p.setTarget('s', 40);
    p.setHeater(false);

    const warm = p.drawAt('s')!.temp;
    run(p, 300);
    // Five minutes in and it is exactly as hot as it was. A stirred tank would
    // have faded by a third by now.
    expect(p.drawAt('s')!.temp).toBeCloseTo(warm, 1);
    expect(p.hot).toBeLessThan(120);
    expect(p.hot).toBeGreaterThan(50);

    run(p, 1200);
    expect(p.hot).toBe(0);
    expect(p.drawAt('s')!.temp).toBeCloseTo(10, 0);
    // …and the flow never changed. It is not that less is coming out.
    expect(p.drawAt('s')!.flow).toBeGreaterThan(5);
  });

  it('hotLastsFor is honest about when it stops being warm enough', () => {
    const p = createPlumbing({ kind: 'mains', cylinder: 120, heater: 3 });
    p.outlet('s', { kind: 'shower' });
    p.open('s');
    p.update(0.1);
    p.setTarget('s', 40);
    const said = p.hotLastsFor();
    expect(said).toBeGreaterThan(15 * 60);
    expect(said).toBeLessThan(30 * 60);

    // Asking does not spend any of it.
    const before = p.hot;
    p.hotLastsFor();
    expect(p.hot).toBeCloseTo(before, 6);

    run(p, said);
    expect(p.drawAt('s')!.temp).toBeLessThan(36);
  });

  it('nothing drawing hot means it lasts for ever', () => {
    const p = bathroom('mains');
    expect(p.hotLastsFor()).toBe(Infinity);
    p.open('wc');
    p.update(0.1);
    expect(p.hotLastsFor(), 'a WC drew on the cylinder').toBe(Infinity);
  });

  it('and the immersion fills it seven times slower than a shower empties it', () => {
    const p = createPlumbing({ kind: 'mains', cylinder: 120, heater: 3 });
    p.outlet('s', { kind: 'shower' });
    p.open('s');
    p.update(0.1);
    p.setTarget('s', 40);
    expect(p.reheatTakes() / 60).toBeCloseTo(140, -1);
    expect(p.reheatTakes()).toBeGreaterThan(p.hotLastsFor() * 5);
    // The steam plant again, in a different trade.
    expect(createPlumbing({ heater: 0 }).reheatTakes()).toBe(Infinity);
  });

  it('a bigger cylinder lasts longer and takes longer', () => {
    const small = createPlumbing({ cylinder: 60 });
    const big = createPlumbing({ cylinder: 240 });
    expect(big.hot).toBe(240);
    expect(big.reheatTakes()).toBeCloseTo(small.reheatTakes() * 4, 3);
  });
});

describe('what the supply is being asked to do', () => {
  it('runs idle → easy → strained → starved', () => {
    const p = bathroom('mains');
    expect(p.state).toBe('idle');
    p.open('shower');
    p.update(0.1);
    expect(p.state).toBe('easy');
    p.open('basin');
    p.open('wc');
    p.update(0.1);
    expect(p.state).toBe('strained');

    const g = bathroom('gravity');
    g.open('shower');
    g.open('basin');
    g.open('wc');
    g.outlet('kitchen', { kind: 'tap' });
    g.open('kitchen');
    g.update(0.1);
    expect(g.state).toBe('starved');
  });

  it('is worked out on demand, not left over from last frame', () => {
    const p = bathroom('mains');
    p.open('shower');
    expect(p.state, 'it answered about a tap nobody had opened yet').not.toBe('idle');
  });

  it('demand is what is actually leaving, not what was asked for', () => {
    const p = bathroom('mains');
    expect(p.demand).toBe(0);
    p.open('shower');
    p.update(0.1);
    const one = p.demand;
    p.open('basin');
    p.update(0.1);
    expect(p.demand).toBeGreaterThan(one);
    // …and less than the two of them would draw alone, because they share.
    const alone = createPlumbing({ kind: 'mains' });
    alone.outlet('b', { kind: 'tap' });
    alone.open('b');
    alone.update(0.1);
    expect(p.demand).toBeLessThan(one + alone.demand);
  });

  it('reports state changes', () => {
    const seen: string[] = [];
    const p = bathroom('mains');
    p.onState = (s) => seen.push(s);
    p.open('shower');
    p.update(0.1);
    p.open('basin');
    p.open('wc');
    p.update(0.1);
    p.close('shower');
    p.close('basin');
    p.close('wc');
    p.update(0.1);
    expect(seen).toEqual(['easy', 'strained', 'idle']);
  });
});

describe('the picture', () => {
  it('every kind builds, and only the piped ones have pipes', () => {
    for (const kind of SUPPLY_KINDS) {
      const p = createPlumbing({ kind });
      p.outlet('s', { kind: 'shower', at: new Vector3(2, 1.9, 0) });
      expect(p.object.name).toBe(`plumbing:${kind}`);
      const pipes = p.object.getObjectByName('plumbing:pipes')!;
      expect(pipes).toBeTruthy();
      expect(pipes.children.length).toBe(kind === 'bucket' ? 0 : 1);
      expect(p.slots.length).toBe(1);
    }
  });

  it('THE CISTERN IS DRAWN WHERE THE HEAD SAYS IT IS', () => {
    // This is the one prop in the library whose pressure IS its geometry, so
    // the two had better agree — a cistern drawn at a convenient height with
    // the pressure worked out from a different number is the same defect as a
    // lamp that is not at its focal plane.
    for (const head of [4, 8, 12]) {
      const p = createPlumbing({ kind: 'gravity', head });
      p.outlet('s', { kind: 'shower', height: 0 });
      p.open('s');
      p.update(0.1);
      // With nothing drawing, the pressure at an outlet on the floor IS the
      // head. Open a tap and it falls, which is a different claim.
      p.close('s');
      p.update(0.1);
      expect(p.drawAt('s')!.pressure).toBeCloseTo(headPressure(head), 3);
      p.open('s');
      p.update(0.1);
      expect(p.drawAt('s')!.pressure).toBeLessThan(headPressure(head));
      const box = p.object.children.find(
        (c) => Math.abs(c.position.y - (head - 0.2)) < 0.01 && c.position.x < 0
      );
      expect(box, `no cistern at ${head} m`).toBeTruthy();
    }
  });

  it('a pipe is drawn to each outlet that says where it is', () => {
    const p = createPlumbing({ kind: 'mains' });
    p.outlet('near', { kind: 'tap', at: new Vector3(1, 0.9, 0) });
    p.outlet('far', { kind: 'shower', at: new Vector3(6, 2.1, 3) });
    p.outlet('nowhere', { kind: 'tap' });
    const pipes = p.object.getObjectByName('plumbing:pipes')!;
    expect(pipes.children.length, 'an outlet with no position got a pipe').toBe(2);
    const near = pipes.getObjectByName('plumbing:pipe:near') as never as {
      scale: { y: number };
    };
    const far = pipes.getObjectByName('plumbing:pipe:far') as never as { scale: { y: number } };
    expect(far.scale.y).toBeGreaterThan(near.scale.y);
  });

  it('the pipes say which of them is working', () => {
    const p = createPlumbing({ kind: 'mains' });
    p.outlet('s', { kind: 'shower', at: new Vector3(2, 1.9, 0), mix: 1 });
    const pipe = p.object.getObjectByName('plumbing:pipe:s') as never as {
      material: { color: { getHex(): number }; emissive: { getHex(): number } };
    };
    const shut = pipe.material.emissive.getHex();
    p.open('s');
    p.update(0.1);
    expect(pipe.material.emissive.getHex(), 'a running pipe looked shut').not.toBe(shut);
  });
});

describe('rubbish in', () => {
  it('unknown outlets are ignored rather than fatal', () => {
    const p = bathroom('mains');
    p.open('nobody');
    p.close('nobody');
    p.setMix('nobody', 1);
    p.setTarget('nobody', 40);
    expect(p.drawAt('nobody')).toBeNull();
    expect(p.outlets).toEqual(['shower', 'basin', 'wc']);
  });

  it('NaN in does not poison the network', () => {
    const p = bathroom('mains');
    p.open('shower', Number.NaN);
    p.setMix('shower', Number.NaN);
    p.setTarget('shower', Number.NaN);
    p.pour('shower', Number.NaN);
    p.update(0.1);
    expect(Number.isFinite(p.pressure)).toBe(true);
    expect(Number.isFinite(p.drawAt('shower')!.temp)).toBe(true);
    expect(p.poured).toBe(0);
  });

  it('a zero or negative step does nothing', () => {
    const p = showering('mains');
    run(p, 60);
    const hot = p.hot;
    p.update(0);
    p.update(-5);
    expect(p.hot).toBe(hot);
  });

  it('opening past one is opening', () => {
    const p = bathroom('mains');
    p.open('shower', 4);
    p.update(0.1);
    expect(p.drawAt('shower')!.open).toBe(1);
  });
});
