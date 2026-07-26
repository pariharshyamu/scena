import { describe, it, expect } from 'vitest';
import type { Mesh } from 'three';
import {
  createPA,
  spreadingLoss,
  barrierLoss,
  exposureLimit,
  earshot,
  loudnessState,
  sumDecibels,
  AIR_ABSORPTION,
  A_WEIGHTING,
  BAND_HZ,
  SPEED_OF_SOUND,
  QUIET,
  SHOUTING,
  HARMFUL,
  type PAEra,
} from '../src';

const ERAS: PAEra[] = ['horn', 'hifi', 'array', 'delayed'];

/** Every era, tuned to put 75 dB(A) at the back of a 200 m field. */
const tuned = (era: PAEra) => {
  const pa = createPA({ era, fieldLength: 200 });
  pa.cover(200, 75);
  return pa;
};

describe('the physics, standing alone', () => {
  it('a point source loses 6 dB per doubling', () => {
    const a = spreadingLoss(10, 0, 'mid');
    const b = spreadingLoss(20, 0, 'mid');
    expect(b - a).toBeCloseTo(6.02, 1);
  });

  it('a line source loses 3 dB per doubling, inside its near field', () => {
    // A 6 m hang holds 1 kHz cylindrical out to about 52 m.
    const a = spreadingLoss(10, 6, 'mid');
    const b = spreadingLoss(20, 6, 'mid');
    expect(b - a).toBeCloseTo(3.01, 1);
  });

  it('and reverts to 6 dB per doubling past it', () => {
    const a = spreadingLoss(200, 6, 'mid');
    const b = spreadingLoss(400, 6, 'mid');
    expect(b - a).toBeCloseTo(6.02, 1);
  });

  it('the near field is shorter for bass than for treble', () => {
    // The single least intuitive fact about a line array: it holds the top up
    // and drops the bottom, so the back of the field is thin, not just quiet.
    const nearField = (band: 'bass' | 'mid' | 'treble') =>
      (6 * 6 * BAND_HZ[band]) / (2 * SPEED_OF_SOUND);
    expect(nearField('bass')).toBeLessThan(10);
    expect(nearField('treble')).toBeGreaterThan(200);
  });

  it('air eats the top and leaves the bottom', () => {
    expect(AIR_ABSORPTION.treble / AIR_ABSORPTION.bass).toBeGreaterThan(30);
    // Over 800 m: bass loses about 3 dB, treble loses 120.
    expect(AIR_ABSORPTION.bass * 800).toBeLessThan(4);
    expect(AIR_ABSORPTION.treble * 800).toBeGreaterThan(100);
  });

  it('A-weighting discounts exactly the band that carries', () => {
    expect(A_WEIGHTING.bass).toBeLessThan(-15);
    expect(A_WEIGHTING.mid).toBe(0);
  });

  it('sums decibels by energy, not arithmetic', () => {
    // Two equal sources are 3 dB louder, not twice as loud and not 6 dB.
    expect(sumDecibels([90, 90])).toBeCloseTo(93.01, 1);
    expect(sumDecibels([90, 70])).toBeCloseTo(90.04, 1);
  });

  it('a barrier stops treble and lets bass round it', () => {
    const bass = barrierLoss(0.3, 'bass', true);
    const treble = barrierLoss(0.3, 'treble', true);
    expect(treble).toBeGreaterThan(bass + 8);
  });

  it('and does nothing at all once the ear can see well over it', () => {
    expect(barrierLoss(2, 'treble', false)).toBe(0);
    expect(barrierLoss(2, 'bass', false)).toBe(0);
  });

  it('but still shades the bass from just inside line of sight', () => {
    // Clear of the wall is not clear of the first Fresnel zone.
    expect(barrierLoss(0.02, 'bass', false)).toBeGreaterThan(2);
    expect(barrierLoss(0.02, 'treble', false)).toBe(0);
  });

  it('exposure halves every 3 dB', () => {
    expect(exposureLimit(85)).toBeCloseTo(8 * 3600, 0);
    expect(exposureLimit(88)).toBeCloseTo(4 * 3600, 0);
    expect(exposureLimit(100)).toBeCloseTo(15 * 60, 0);
    expect(exposureLimit(115)).toBeLessThan(60);
  });

  it('earshot is metres, and it collapses', () => {
    expect(earshot(58)).toBeGreaterThan(3);
    expect(earshot(95)).toBeLessThan(0.2);
  });

  it('classifies in what it costs the person, not the amplifier', () => {
    expect(loudnessState(50)).toBe('quiet');
    expect(loudnessState(70)).toBe('raised');
    expect(loudnessState(82)).toBe('shouting');
    expect(loudnessState(95)).toBe('harmful');
    expect(loudnessState(QUIET)).toBe('raised');
    expect(loudnessState(SHOUTING)).toBe('shouting');
    expect(loudnessState(HARMFUL)).toBe('harmful');
  });
});

describe('the field', () => {
  it('falls off down the axis', () => {
    const pa = createPA({ era: 'array' });
    const near = pa.levelAt(0, 10);
    const far = pa.levelAt(0, 200);
    expect(near).toBeGreaterThan(far + 15);
  });

  it('never falls below the ambient', () => {
    const pa = createPA({ era: 'hifi', ambient: 45 });
    expect(pa.levelAt(0, 20000)).toBeCloseTo(45, 1);
  });

  it('goes silent when the programme does — and only then', () => {
    const pa = createPA({ era: 'array', ambient: 40 });
    const on = pa.levelAt(0, 50);
    pa.setProgram(0);
    expect(pa.levelAt(0, 50)).toBeCloseTo(40, 3);
    pa.setProgram(0.5);
    // Half the drive is 6 dB down, not half the decibels.
    expect(pa.levelAt(0, 50)).toBeCloseTo(on - 6, 0);
  });

  it('is quieter off to the side', () => {
    const pa = createPA({ era: 'horn' });
    const onAxis = pa.levelAt(0, 60);
    const off = pa.levelAt(60 * Math.sin(1.05), 60 * Math.cos(1.05));
    expect(off).toBeLessThan(onAxis - 10);
  });

  it('and a horn is far more directional than a stack', () => {
    const at60 = (era: PAEra) => {
      const pa = createPA({ era });
      const on = pa.levelAt(0, 60);
      const off = pa.levelAt(60 * Math.sin(1.05), 60 * Math.cos(1.05));
      return on - off;
    };
    expect(at60('horn')).toBeGreaterThan(at60('hifi') + 8);
  });

  it('turns with its facing', () => {
    const straight = createPA({ era: 'array' });
    const turned = createPA({ era: 'array', facing: Math.PI / 2 });
    expect(turned.levelAt(100, 0)).toBeCloseTo(straight.levelAt(0, 100), 3);
  });

  it('moves with its origin', () => {
    const here = createPA({ era: 'array' });
    const there = createPA({ era: 'array', x: 500, z: -300 });
    expect(there.levelAt(500, -200)).toBeCloseTo(here.levelAt(0, 100), 3);
  });
});

describe('distance is a filter, not a volume knob', () => {
  it('takes the treble first and the bass last', () => {
    const pa = createPA({ era: 'array' });
    const near = pa.bandsAt(0, 3);
    const far = pa.bandsAt(0, 400);
    const lostBass = near.bass - far.bass;
    const lostTreble = near.treble - far.treble;
    expect(lostTreble).toBeGreaterThan(lostBass + 35);
  });

  it('so a distant PA is a thud', () => {
    const pa = createPA({ era: 'array' });
    const near = pa.bandsAt(0, 3);
    const far = pa.bandsAt(0, 600);
    // Close up the three bands are within a few dB of each other…
    expect(Math.abs(near.bass - near.treble)).toBeLessThan(4);
    // …and a long way off the bass is what is left.
    expect(far.bass).toBeGreaterThan(far.treble + 15);
  });

  it('which one number could never say', () => {
    // Two points at the same dB(A) with completely different sound.
    const pa = createPA({ era: 'array' });
    let a = 0;
    for (let z = 5; z < 900; z += 1) {
      if (Math.abs(pa.levelAt(0, z) - 70) < 0.4) { a = z; break; }
    }
    const off = createPA({ era: 'array' });
    off.setPower('mains', 118 - 30);
    let b = 0;
    for (let z = 5; z < 900; z += 1) {
      if (Math.abs(off.levelAt(0, z) - 70) < 0.4) { b = z; break; }
    }
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(Math.abs(pa.levelAt(0, a) - off.levelAt(0, b))).toBeLessThan(1);
    // Same loudness, and the far one has lost its top.
    expect(pa.bandsAt(0, a).treble).toBeLessThan(off.bandsAt(0, b).treble - 10);
  });

  it('a horn has no bass at any distance', () => {
    const horn = createPA({ era: 'horn' });
    const hifi = createPA({ era: 'hifi' });
    for (const z of [5, 50, 200]) {
      const h = horn.bandsAt(0, z);
      expect(h.mid - h.bass).toBeGreaterThan(20);
      const f = hifi.bandsAt(0, z);
      expect(f.mid - f.bass).toBeLessThan(6);
    }
  });
});

describe('barriers', () => {
  const walled = (height: number) => {
    const pa = createPA({ era: 'array' });
    if (height > 0) pa.barrier('wall', { x1: -40, z1: 50, x2: 40, z2: 50, height });
    return pa;
  };

  it('a wall in the way takes the top off', () => {
    const clear = walled(0).bandsAt(0, 60);
    const shut = walled(5).bandsAt(0, 60);
    expect(clear.treble - shut.treble).toBeGreaterThan(clear.bass - shut.bass + 8);
  });

  it('a wall out of the way does nothing', () => {
    const pa = createPA({ era: 'array' });
    const clear = pa.levelAt(0, 60);
    pa.barrier('aside', { x1: 20, z1: 50, x2: 60, z2: 50, height: 8 });
    expect(pa.levelAt(0, 60)).toBeCloseTo(clear, 6);
  });

  it('a taller wall takes more', () => {
    const levels = [1, 3, 5, 8].map((h) => walled(h).levelAt(0, 60));
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThan(levels[i - 1]);
  });

  it('and forgetting it puts the sound back', () => {
    const pa = createPA({ era: 'array' });
    const clear = pa.levelAt(0, 60);
    pa.barrier('wall', { x1: -40, z1: 50, x2: 40, z2: 50, height: 8 });
    expect(pa.levelAt(0, 60)).toBeLessThan(clear - 15);
    pa.clearBarrier('wall');
    expect(pa.levelAt(0, 60)).toBeCloseTo(clear, 6);
  });

  it('shadows every source independently', () => {
    // The wall stands between the mains and the ear. The tower is past it, so
    // nothing is between them, and one barrier must not attenuate both.
    const pa = createPA({ era: 'array' });
    pa.tower('fill', { x: 0, z: 90, power: 100 });
    const before = pa.arrivalsAt(0, 100);
    pa.barrier('wall', { x1: -40, z1: 50, x2: 40, z2: 50, height: 9 });
    const after = pa.arrivalsAt(0, 100);
    const of = (as: typeof before, n: string) => as.find((a) => a.name === n)!.level;
    expect(of(before, 'mains') - of(after, 'mains')).toBeGreaterThan(10);
    expect(of(before, 'fill')).toBeCloseTo(of(after, 'fill'), 6);
  });
});

describe('what it costs to stand there', () => {
  it('walks quiet → raised → shouting → harmful as you go forward', () => {
    const pa = createPA({ era: 'array' });
    const seen: string[] = [];
    for (let z = 900; z >= 3; z -= 1) {
      const s = pa.stateAt(0, z);
      if (seen[seen.length - 1] !== s) seen.push(s);
    }
    expect(seen).toEqual(['quiet', 'raised', 'shouting', 'harmful']);
  });

  it('earshot collapses to nothing at the barrier', () => {
    const pa = createPA({ era: 'array' });
    expect(pa.earshotAt(0, 3)).toBeLessThan(0.2);
    expect(pa.earshotAt(0, 400)).toBeGreaterThan(1);
  });

  it('and exposure is measured in the evening you were going to have', () => {
    const pa = createPA({ era: 'array' });
    expect(pa.exposureAt(0, 3)).toBeLessThan(10 * 60);
    expect(pa.exposureAt(0, 500)).toBeGreaterThan(8 * 3600);
  });

  it('asking does not change anything', () => {
    const pa = createPA({ era: 'array' });
    const before = pa.levelAt(0, 50);
    pa.exposureAt(0, 50);
    pa.earshotAt(0, 50);
    pa.echoAt(0, 50);
    pa.bandsAt(0, 50);
    expect(pa.levelAt(0, 50)).toBe(before);
  });
});

describe('the era axis: what the front row pays for the back row', () => {
  it('every era covers the field it was tuned for', () => {
    for (const era of ERAS) {
      const pa = tuned(era);
      expect(pa.levelAt(0, 200)).toBeGreaterThan(74.5);
    }
  });

  it('and the front row pays less the further down the axis you go', () => {
    const front = ERAS.map((era) => tuned(era).frontRow());
    // horn ≈ hifi (both point sources), array better, delayed far better.
    expect(front[2]).toBeLessThan(front[1] - 6);
    expect(front[3]).toBeLessThan(front[2] - 8);
  });

  it('which is a difference measured in hours, not decibels', () => {
    const hifi = tuned('hifi');
    const delayed = tuned('delayed');
    expect(exposureLimit(hifi.frontRow())).toBeLessThan(60);
    expect(exposureLimit(delayed.frontRow())).toBeGreaterThan(30 * 60);
  });

  it('the inversion is not more power — it is less', () => {
    // The delayed system's mains are turned DOWN, and everybody still hears.
    const array = tuned('array');
    const delayed = tuned('delayed');
    const power = (pa: ReturnType<typeof tuned>) =>
      pa.arrivalsAt(0, 1).find((a) => a.name === 'mains')!.level;
    expect(power(delayed)).toBeLessThan(power(array) - 8);
    expect(delayed.levelAt(0, 200)).toBeGreaterThan(74.5);
  });

  it('more towers flatten the field further', () => {
    const ripple = (towers: number) => {
      const pa = createPA({ era: 'delayed', towers, fieldLength: 200 });
      pa.cover(200, 75);
      const ls: number[] = [];
      for (let z = 3; z <= 200; z += 2) ls.push(pa.levelAt(0, z));
      return Math.max(...ls) - Math.min(...ls);
    };
    expect(ripple(4)).toBeLessThan(ripple(1) - 8);
  });

  it('a line array beats a stack because of the near field, not the power', () => {
    const stack = createPA({ era: 'hifi', power: 118 });
    const hang = createPA({ era: 'array', power: 118 });
    // Same amplifier. Over the same ten-fold range the stack loses twice as
    // much, because a cylinder's surface grows with r and a sphere's with r².
    const dropped = (pa: typeof stack) => pa.levelAt(0, 10) - pa.levelAt(0, 100);
    expect(dropped(stack)).toBeGreaterThan(20);
    expect(dropped(hang)).toBeLessThan(dropped(stack) - 5);
    expect(hang.levelAt(0, 100)).toBeGreaterThan(stack.levelAt(0, 100) + 8);
  });
});

describe('reach and the front row', () => {
  it('reach is where it stops being worth listening to', () => {
    const pa = createPA({ era: 'array' });
    const r = pa.reach(QUIET);
    expect(pa.levelAt(0, r * 0.95)).toBeGreaterThan(QUIET);
    expect(pa.levelAt(0, r * 1.1)).toBeLessThan(QUIET);
  });

  it('and a bigger target is a shorter reach', () => {
    const pa = createPA({ era: 'array' });
    expect(pa.reach(90)).toBeLessThan(pa.reach(70));
  });

  it('turning it up buys reach expensively', () => {
    const pa = createPA({ era: 'array', power: 112 });
    const before = pa.reach(75);
    pa.setPower('mains', 118);
    // Six decibels — four times the amplifier — for well under double.
    expect(pa.reach(75) / before).toBeLessThan(2.1);
    expect(pa.reach(75)).toBeGreaterThan(before);
  });
});

describe('the bill for delay towers is time', () => {
  const field = () => {
    const pa = createPA({ era: 'delayed', towers: 2, fieldLength: 200 });
    pa.cover(200, 75);
    return pa;
  };

  it('aligned, the people a tower is for hear one source', () => {
    const pa = field();
    pa.alignDelays(0.012);
    // Downfield of each tower — everybody it was put there to cover.
    for (let z = 70; z <= 120; z += 2) expect(pa.echoAt(0, z).state).not.toBe('echo');
    for (let z = 140; z <= 200; z += 2) expect(pa.echoAt(0, z).state).not.toBe('echo');
    // …and the towers really are audible: somewhere the arrivals fuse.
    const states = [];
    for (let z = 70; z <= 200; z += 2) states.push(pa.echoAt(0, z).state);
    expect(states).toContain('fused');
  });

  it('and the people just behind one hear it twice, however well aligned', () => {
    // A tower is delayed for the crowd in front of it. Stand seven metres
    // short of it and its sound is fifty milliseconds late for you — which is
    // not a tuning error, it is what a delay tower is, and it is why they go
    // in the aisles.
    const pa = field();
    pa.alignDelays(0.012);
    expect(pa.echoAt(0, 60).state).toBe('echo');
    expect(pa.echoAt(0, 125).state).toBe('echo');
  });

  it('but two towers aligned to the mains still comb against each other', () => {
    // Each is right against the mains and neither was ever asked about the
    // other, so somewhere downfield their own arrivals land a millisecond
    // apart. Correct alignment is not the same as no interference.
    const pa = field();
    pa.alignDelays(0.012);
    const states = [];
    for (let z = 10; z <= 200; z += 2) states.push(pa.echoAt(0, z).state);
    expect(states).toContain('comb');
  });

  it('aligned to the arithmetic and no further, they comb', () => {
    const pa = field();
    pa.alignDelays(0);
    const readings = [100, 120, 180].map((z) => pa.echoAt(0, z));
    expect(readings.some((r) => r.state === 'comb')).toBe(true);
    // Not an echo — a filter. The spread is under five milliseconds.
    for (const r of readings) expect(r.spread).toBeLessThan(5);
  });

  it('and wrong by a tenth of a second, everybody hears it twice', () => {
    const pa = field();
    pa.alignDelays(0.25);
    const states = [100, 120].map((z) => pa.echoAt(0, z).state);
    expect(states).toContain('echo');
  });

  it('an early tower is just as bad as a late one', () => {
    const pa = field();
    pa.setDelay('tower1', 0);
    expect(pa.echoAt(0, 100).spread).toBeGreaterThan(40);
  });

  it('delays are never negative', () => {
    const pa = field();
    pa.setDelay('tower1', -5);
    expect(pa.arrivalsAt(0, 100).every((a) => a.arrival >= 0)).toBe(true);
  });

  it('and a system with one source cannot echo at all', () => {
    const pa = createPA({ era: 'array' });
    expect(pa.echoAt(0, 100)).toEqual({ spread: 0, state: 'clean', arrivals: 1 });
  });

  it('alignDelays scales with distance, not with a constant', () => {
    const pa = field();
    pa.alignDelays(0.012);
    const one = pa.arrivalsAt(0, 67).find((a) => a.name === 'tower1')!;
    const two = pa.arrivalsAt(0, 133).find((a) => a.name === 'tower2')!;
    expect(two.arrival).toBeGreaterThan(one.arrival);
  });
});

describe('the object', () => {
  it('is a prop with a footprint', () => {
    const pa = createPA({ era: 'array' });
    expect(pa.object.children.length).toBeGreaterThan(0);
    expect(pa.obstacleRadius).toBeGreaterThan(0);
  });

  it('names its sources, mains first', () => {
    const pa = createPA({ era: 'delayed', towers: 2 });
    expect(pa.names[0]).toBe('mains');
    expect(pa.names).toContain('tower1');
    expect(pa.names).toContain('tower2');
  });

  it('a tower adds geometry where it was asked for', () => {
    const pa = createPA({ era: 'array', x: 10, z: -4 });
    const before = pa.object.children.length;
    pa.tower('fill', { x: 10, z: 96 });
    expect(pa.object.children.length).toBe(before + 1);
    // 100 m down the axis from a PA at z = −4.
    const added = pa.object.children[pa.object.children.length - 1];
    expect(added.position.z).toBeCloseTo(100, 3);
    expect(added.position.x).toBeCloseTo(0, 3);
  });

  it('places towers correctly under a rotated PA', () => {
    const pa = createPA({ era: 'array', facing: Math.PI / 2, x: 0, z: 0 });
    pa.tower('fill', { x: 80, z: 0 });
    const added = pa.object.children[pa.object.children.length - 1];
    // The group is rotated 90°, so the tower's local position is +z.
    expect(added.position.z).toBeCloseTo(80, 3);
    expect(added.position.x).toBeCloseTo(0, 3);
  });

  it('updates without touching the field', () => {
    const pa = createPA({ era: 'array' });
    const before = pa.levelAt(0, 80);
    for (let i = 0; i < 200; i++) pa.update(1 / 60);
    expect(pa.levelAt(0, 80)).toBe(before);
  });

  it('paints coverage on demand and takes it away again', () => {
    const pa = createPA({ era: 'array' });
    const bare = pa.object.children.length;
    pa.showCoverage(true, { width: 60, depth: 100, cell: 10 });
    expect(pa.object.children.length).toBe(bare + 1);
    pa.showCoverage(false);
    expect(pa.object.children.length).toBe(bare);
  });

  it('the painted grid says the same thing the field does', () => {
    const pa = createPA({ era: 'array' });
    pa.showCoverage(true, { width: 40, depth: 200, cell: 20 });
    const grid = pa.object.children[pa.object.children.length - 1] as unknown as Mesh;
    // Six vertices per cell, 2 across by 10 deep.
    expect(grid.geometry.getAttribute('position').count).toBe(2 * 10 * 6);
  });
});

describe('covering a field', () => {
  it('sizes every source for the end of its own zone', () => {
    const pa = createPA({ era: 'delayed', towers: 2, fieldLength: 200 });
    pa.cover(200, 78);
    for (let z = 5; z <= 200; z += 5) expect(pa.levelAt(0, z)).toBeGreaterThan(77.5);
  });

  it('a longer field costs the front row', () => {
    const near = createPA({ era: 'array' });
    near.cover(80, 75);
    const far = createPA({ era: 'array' });
    far.cover(400, 75);
    expect(far.frontRow()).toBeGreaterThan(near.frontRow() + 6);
  });

  it('and a higher target costs it too', () => {
    const quiet = createPA({ era: 'array' });
    quiet.cover(200, 70);
    const loud = createPA({ era: 'array' });
    loud.cover(200, 85);
    expect(loud.frontRow()).toBeCloseTo(quiet.frontRow() + 15, 0);
  });

  it('is idempotent', () => {
    const pa = createPA({ era: 'delayed', towers: 2, fieldLength: 200 });
    pa.cover(200, 75);
    const once = pa.frontRow();
    pa.cover(200, 75);
    expect(pa.frontRow()).toBeCloseTo(once, 3);
  });
});
