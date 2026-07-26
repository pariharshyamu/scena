import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createOarBank, oarGripAt, OAR_KINDS } from '../src';
import type { OarBank } from '../src';

const run = (bank: OarBank, seconds: number, dt = 1 / 120): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) bank.update(dt);
};

/** Every value of `thrust` over `seconds`, sampled every frame. */
const trace = (bank: OarBank, seconds: number, dt = 1 / 120): number[] => {
  const out: number[] = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    bank.update(dt);
    out.push(bank.thrust);
  }
  return out;
};

/** One full stroke's worth of a reading, at a known rate. */
const overOneStroke = (bank: OarBank, read: () => number, dt = 1 / 240): number[] => {
  const out: number[] = [];
  const frames = Math.round(60 / bank.rate / dt);
  for (let i = 0; i < frames; i++) {
    bank.update(dt);
    out.push(read());
  }
  return out;
};

describe('an oar is a DUTY CYCLE, not a throttle', () => {
  it.each(OAR_KINDS)('%s: THRUST IS ZERO FOR MOST OF EVERY STROKE', (kind) => {
    // The whole track. A blade is in the water for well under half a stroke
    // and out of it for the rest, so the thrust is a pulse — and a model
    // that reports the average is an engine with a wooden skin on it.
    const bank = createOarBank({ kind, seats: 4, together: 1 });
    const t = overOneStroke(bank, () => bank.thrust);
    const dead = t.filter((v) => v <= 0.001).length / t.length;
    expect(dead, `${kind}: she was pushing the whole time`).toBeGreaterThan(0.45);
    expect(dead, `${kind}: she never pushed at all`).toBeLessThan(0.75);
    // The claim is the SHAPE — a real pulse with real dead time — not a
    // particular magnitude. How big the pulse is depends on how fast she is
    // already going, which is the slip term doing its job.
    expect(Math.max(...t), `${kind}: no drive anywhere`).toBeGreaterThan(0.35);
  });

  it('and the RECOVERY IS THE LONGER HALF', () => {
    // Not a symmetric crank. This is what separates rowing from a
    // windscreen wiper, and it is why the blade has to come out.
    for (const kind of OAR_KINDS) {
      const bank = createOarBank({ kind, seats: 3, together: 1 });
      const buried = overOneStroke(bank, () => (bank.oars[0].buried ? 1 : 0));
      const share = buried.reduce((a, b) => a + b, 0) / buried.length;
      expect(share, `${kind}`).toBeLessThan(0.45);
      expect(share, `${kind}`).toBeGreaterThan(0.3);
    }
  });

  it('THE BLADE COMES OUT OF THE WATER on the way forward', () => {
    // Scything back through the sea in both directions is a boat that
    // should be going nowhere, and it is the single most obvious tell.
    // Measured as the blade's WORLD HEIGHT against the waterline, not as a
    // rotation — the first version of this checked an angle, which passed
    // happily while every loom lay dead horizontal and the whole bank swept
    // about in mid-air a metre above the sea.
    const bank = createOarBank({ kind: 'longship', seats: 2, gunwale: 1.0, together: 1 });
    const oar = bank.oars.find((o) => o.side === 1)!;
    let tip: { getWorldPosition(v: Vector3): Vector3 } | null = null;
    let furthest = -1;
    oar.object.traverse((o) => {
      const m = o as { isMesh?: boolean };
      if (!m.isMesh) return;
      const r = Math.abs(o.position.x);
      if (r > furthest) {
        furthest = r;
        tip = o as unknown as typeof tip;
      }
    });
    const samples: Array<{ buried: boolean; y: number }> = [];
    const frames = Math.round(60 / bank.rate / (1 / 240));
    for (let i = 0; i < frames; i++) {
      bank.update(1 / 240);
      bank.object.updateMatrixWorld(true);
      samples.push({ buried: oar.buried, y: tip!.getWorldPosition(new Vector3()).y });
    }
    const inWater = samples.filter((s) => s.buried).map((s) => s.y);
    const clear = samples.filter((s) => !s.buried).map((s) => s.y);
    // Through the drive it is UNDER the waterline…
    expect(Math.max(...inWater), 'the blade drove through the air').toBeLessThan(0);
    // …and on the way forward it is out of it.
    expect(Math.max(...clear), 'the blade never came clear').toBeGreaterThan(0.2);
  });

  it('SO HER SPEED SURGES — drive, coast, drive, coast', () => {
    // The payoff, and the reason `way` exists at all. Hand a hull the
    // instantaneous thrust and she stops dead twice a second; integrate it
    // and you get the lurch you can feel from the deck without seeing an
    // oar go by.
    const bank = createOarBank({ kind: 'galley', seats: 8, together: 1 });
    bank.setRate(26);
    run(bank, 20);
    const way = overOneStroke(bank, () => bank.way);
    const low = Math.min(...way);
    const high = Math.max(...way);
    expect(low, 'she stopped dead between strokes').toBeGreaterThan(0.5);
    expect(high - low, 'she travelled at a perfectly steady speed')
      .toBeGreaterThan(high * 0.06);
  });

  it('…and the surge is AT THE STROKE RATE', () => {
    // Twice the rate would be a wobble in the model rather than a stroke.
    const bank = createOarBank({ kind: 'longship', seats: 6, together: 1 });
    bank.setRate(24);
    run(bank, 25);
    const way = trace(bank, 20, 1 / 120).map(() => bank.way);
    const seconds = 20;
    const series: number[] = [];
    for (let i = 0; i < seconds * 120; i++) {
      bank.update(1 / 120);
      series.push(bank.way);
    }
    // Count how many times it crosses its own mean going upward.
    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    let crossings = 0;
    for (let i = 1; i < series.length; i++) {
      if (series[i - 1] <= mean && series[i] > mean) crossings++;
    }
    // 24 spm over 20 s is 8 strokes.
    expect(crossings).toBeGreaterThanOrEqual(6);
    expect(crossings).toBeLessThanOrEqual(10);
    void way;
  });

  it('rate actually sets the rate, and is capped', () => {
    const bank = createOarBank({ kind: 'racing', seats: 4 });
    bank.setRate(1000);
    expect(bank.rate).toBeLessThanOrEqual(44);
    bank.setRate(20);
    expect(bank.rate).toBe(20);
    // One minute at twenty strokes a minute is twenty catches.
    let catches = 0;
    let was = bank.phase;
    for (let i = 0; i < 60 * 120; i++) {
      bank.update(1 / 120);
      if (bank.phase < was) catches++;
      was = bank.phase;
    }
    expect(catches).toBeGreaterThanOrEqual(19);
    expect(catches).toBeLessThanOrEqual(21);
  });

  it('a faster rate puts more way on her', () => {
    const at = (spm: number): number => {
      const bank = createOarBank({ kind: 'longship', seats: 6, together: 1 });
      bank.setRate(spm);
      run(bank, 30);
      const way = overOneStroke(bank, () => bank.way);
      return way.reduce((a, b) => a + b, 0) / way.length;
    };
    expect(at(28)).toBeGreaterThan(at(14) * 1.4);
  });
});

describe('it takes several bodies AGREEING', () => {
  it('THE STROKE PROPAGATES DOWN THE BOAT', () => {
    // Nobody watches the coxswain. They watch the blade in front, so every
    // seat is a little later than the one ahead of it — and a bank where
    // `phaseAt` is the same number for everybody is a machine, not a crew.
    const ragged = createOarBank({ kind: 'longship', seats: 8, together: 0.3 });
    run(ragged, 3);
    const spread = Math.abs(ragged.phaseAt(0) - ragged.phaseAt(7));
    expect(spread, 'the whole crew moved as one machine').toBeGreaterThan(0.02);
    // …and a good crew closes it right up.
    const tight = createOarBank({ kind: 'longship', seats: 8, together: 1 });
    run(tight, 3);
    expect(Math.abs(tight.phaseAt(0) - tight.phaseAt(7))).toBeLessThan(0.005);
  });

  it('A RAGGED CREW MAKES LESS WAY, and nobody applied a penalty', () => {
    // It falls out of averaging the oars: blades that go in at different
    // moments do not add up. There is no `together` term anywhere in the
    // thrust — only in when each blade enters.
    const meanWay = (together: number): number => {
      const bank = createOarBank({ kind: 'longship', seats: 8, together, seed: 4 });
      bank.setRate(24);
      run(bank, 40);
      const way = overOneStroke(bank, () => bank.way);
      return way.reduce((a, b) => a + b, 0) / way.length;
    };
    const asOne = meanWay(1);
    const shambles = meanWay(0.1);
    expect(shambles, 'a shambles rowed as fast as a good crew').toBeLessThan(asOne * 0.95);
    expect(shambles, 'a bad crew went backwards').toBeGreaterThan(0);
  });

  it('and a ragged crew never all has its blades in at once', () => {
    const buriedTogether = (together: number): number => {
      const bank = createOarBank({ kind: 'galley', seats: 8, together, seed: 7 });
      let best = 0;
      for (let i = 0; i < 1200; i++) {
        bank.update(1 / 120);
        best = Math.max(best, bank.oars.filter((o) => o.buried).length / bank.oars.length);
      }
      return best;
    };
    expect(buriedTogether(1)).toBeGreaterThan(0.99);
    expect(buriedTogether(0.1), 'a shambles caught perfectly together').toBeLessThan(0.99);
  });

  it('every seat is somewhere different in the same one stroke', () => {
    const bank = createOarBank({ kind: 'galley', seats: 6, together: 0.4 });
    run(bank, 2.4);
    const seen = new Set(bank.oars.map((o) => o.phase.toFixed(3)));
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('catching a crab', () => {
  it('IS WORSE THAN NOT ROWING AT ALL', () => {
    // The blade is caught flat and being dragged through the water. A model
    // that just zeroes that oar has the boat politely ignore it.
    const bank = createOarBank({ kind: 'longship', seats: 6, together: 1 });
    run(bank, 20);
    const before = overOneStroke(bank, () => bank.way);
    const cruising = before.reduce((a, b) => a + b, 0) / before.length;
    bank.crab(2);
    expect(bank.crabbing).toBeGreaterThan(0);
    const fouled = bank.oars.find((o) => o.crabbing)!;
    run(bank, 0.3);
    expect(fouled.thrust, 'a fouled blade was quietly ignored').toBeLessThan(0);
    run(bank, 1.2);
    const after = overOneStroke(bank, () => bank.way);
    const slowed = after.reduce((a, b) => a + b, 0) / after.length;
    expect(slowed, 'catching a crab cost her nothing').toBeLessThan(cruising);
  });

  it('SLEWS HER, because it is one blade and not both', () => {
    const bank = createOarBank({ kind: 'longship', seats: 6, together: 1 });
    run(bank, 12);
    const straight = Math.abs(bank.yaw);
    bank.crab(1);
    run(bank, 0.4);
    expect(Math.abs(bank.yaw), 'a crab did not swing her at all').toBeGreaterThan(straight);
  });

  it('and she recovers from it', () => {
    const bank = createOarBank({ kind: 'longship', seats: 4, together: 1 });
    bank.crab(0);
    expect(bank.crabbing).toBeGreaterThan(0);
    run(bank, 4);
    expect(bank.crabbing).toBe(0);
    expect(bank.oars.every((o) => !o.crabbing)).toBe(true);
  });
});

describe('working the boat', () => {
  it('PULLING HARDER ONE SIDE TURNS HER', () => {
    // The reason a rowed boat needs no rudder, and the reason a galley can
    // spin in her own length.
    const bank = createOarBank({ kind: 'galley', seats: 6, together: 1 });
    bank.setEffort(1, 1);
    run(bank, 12);
    const straight = overOneStroke(bank, () => bank.yaw);
    expect(Math.max(...straight.map(Math.abs)), 'she wandered rowing evenly')
      .toBeLessThan(0.05);

    bank.setEffort(1, 0.2);
    run(bank, 6);
    const turning = overOneStroke(bank, () => bank.yaw);
    expect(Math.min(...turning), 'pulling harder to port did not swing her')
      .toBeLessThan(-0.1);
  });

  it('BACKING WATER drives her astern', () => {
    const bank = createOarBank({ kind: 'skiff', seats: 1, together: 1 });
    run(bank, 15);
    expect(bank.way).toBeGreaterThan(0.2);
    bank.setEffort(-1);
    run(bank, 15);
    expect(bank.way, 'backing water carried her forward').toBeLessThan(0);
  });

  it('one side backing and the other pulling spins her on the spot', () => {
    const ahead = createOarBank({ kind: 'galley', seats: 6, together: 1 });
    run(ahead, 25);
    const cruise = overOneStroke(ahead, () => ahead.way);
    const cruising = cruise.reduce((a, b) => a + b, 0) / cruise.length;

    const bank = createOarBank({ kind: 'galley', seats: 6, together: 1 });
    bank.setEffort(1, -1);
    run(bank, 25);
    const spin = overOneStroke(bank, () => bank.yaw);
    const way = overOneStroke(bank, () => bank.way);
    expect(Math.max(...spin.map(Math.abs)), 'she did not turn').toBeGreaterThan(0.2);
    const mean = way.reduce((a, b) => a + b, 0) / way.length;
    // Measured against what she does rowing both sides ahead, rather than
    // against a number picked out of the air.
    expect(Math.abs(mean), 'she charged off while spinning').toBeLessThan(cruising * 0.35);
  });

  it('SHIP OARS and she stops rowing but keeps her way for a bit', () => {
    const bank = createOarBank({ kind: 'longship', seats: 6, together: 1 });
    run(bank, 25);
    // A mean over one stroke, not a single sample — she surges, so one
    // reading is a lottery over where in the cycle it landed.
    const before = overOneStroke(bank, () => bank.way);
    const cruising = before.reduce((a, b) => a + b, 0) / before.length;
    expect(cruising).toBeGreaterThan(0.5);
    bank.ship();
    expect(bank.rowing).toBe(false);
    run(bank, 0.4);
    expect(bank.thrust).toBe(0);
    expect(bank.way, 'she stopped like a dropped brick').toBeGreaterThan(cruising * 0.5);
    run(bank, 12);
    expect(bank.way, 'she coasted for ever').toBeLessThan(cruising * 0.1);
    bank.out();
    run(bank, 25);
    const again = overOneStroke(bank, () => bank.way);
    expect(again.reduce((a, b) => a + b, 0) / again.length).toBeGreaterThan(cruising * 0.9);
  });

  it('a shipped bank holds its blades still', () => {
    const bank = createOarBank({ kind: 'longship', seats: 3 });
    bank.ship();
    run(bank, 1);
    const y = bank.oars.map((o) => o.object.parent!.rotation.y);
    run(bank, 2);
    bank.oars.forEach((o, i) => expect(o.object.parent!.rotation.y).toBeCloseTo(y[i], 6));
  });
});

describe('the shape of it', () => {
  it.each(OAR_KINDS)('%s builds a bank with oars both sides', (kind) => {
    const bank = createOarBank({ kind, seats: 5 });
    expect(bank.oars).toHaveLength(10);
    expect(bank.oars.filter((o) => o.side === -1)).toHaveLength(5);
    expect(bank.oars.filter((o) => o.side === 1)).toHaveLength(5);
    expect(bank.seats).toHaveLength(10);
    expect(bank.obstacleRadius).toBe(0);
  });

  it('a sculling boat can have one side only', () => {
    const bank = createOarBank({ kind: 'skiff', seats: 2, sides: 1 });
    expect(bank.oars).toHaveLength(2);
    expect(bank.oars.every((o) => o.side === -1)).toBe(true);
  });

  it('AN OAR IS A LEVER — most of it is outboard of the rowlock', () => {
    // A paddle has its blade at the end of a stick you hold in the middle.
    // An oar is pivoted a third of the way along, and that is why one man
    // can move a longship.
    const bank = createOarBank({ kind: 'longship', seats: 1, beam: 4 });
    bank.update(1 / 60);
    bank.object.updateMatrixWorld(true);
    const oar = bank.oars.find((o) => o.side === 1)!;
    const rowlock = oar.object.parent!.getWorldPosition(new Vector3());
    const handle = oar.grip.getWorldPosition(new Vector3());
    const blade = new Vector3();
    oar.object.traverse((o) => {
      const m = o as { isMesh?: boolean };
      if (m.isMesh) {
        const at = o.getWorldPosition(new Vector3());
        if (at.distanceTo(rowlock) > blade.distanceTo(rowlock)) blade.copy(at);
      }
    });
    expect(blade.distanceTo(rowlock)).toBeGreaterThan(handle.distanceTo(rowlock) * 1.6);
  });

  it('the grips MOVE, and they sweep through the boat', () => {
    const bank = createOarBank({ kind: 'longship', seats: 2, together: 1 });
    const path: Vector3[] = [];
    for (let i = 0; i < 240; i++) {
      bank.update(1 / 120);
      bank.object.updateMatrixWorld(true);
      path.push(bank.oars[0].grip.getWorldPosition(new Vector3()));
    }
    let spread = 0;
    for (const a of path) for (const b of path) spread = Math.max(spread, a.distanceTo(b));
    expect(spread, 'the handles never moved').toBeGreaterThan(0.4);
    expect(spread, 'the handles swept across the whole boat').toBeLessThan(3);
  });

  it('every seat has somewhere to sit, on the boat rather than in the sea', () => {
    const bank = createOarBank({ kind: 'galley', seats: 4, beam: 5, gunwale: 1.2 });
    bank.object.updateMatrixWorld(true);
    for (const oar of bank.oars) {
      const at = oar.seatSlot.anchor.getWorldPosition(new Vector3());
      // Inboard of his own rowlock, and below the gunwale.
      expect(Math.abs(at.x)).toBeLessThan(2.5);
      expect(at.y).toBeLessThan(1.2);
      expect(oar.seatSlot.kind).toBe('row');
    }
  });

  it('oarGripAt agrees with the phase about where the hands go', () => {
    // The published handshake for anything that wants to build a body to
    // the oar rather than reach for it.
    const at = (p: number) => oarGripAt(p);
    // Hands furthest forward at the catch, closest at the finish.
    expect(at(0).z).toBeGreaterThan(at(0.39).z);
    expect(at(0.39).z).toBeLessThan(0);
    // …and back out again through the recovery.
    expect(at(0.9).z).toBeGreaterThan(at(0.5).z);
    // Never below the thwart.
    for (let p = 0; p < 1; p += 0.02) expect(at(p).y).toBeGreaterThan(0.3);
  });
});
