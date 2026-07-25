import { describe, expect, it } from 'vitest';
import { Box3, Group, Mesh, Vector2 } from 'three';
import { createSailRig, createWindField, noGoDegrees, RIG_KINDS } from '../src';
import type { RigKind, SailRig, WindSource } from '../src';

/**
 * A steady breeze blowing toward +x, strength 1 — deterministic, and with
 * exactly the shape `createWindField` publishes, so if this drives the rig
 * the real field does.
 */
const breeze = (mag = 1): WindSource => ({ sample: () => new Vector2(mag, 0) });

/**
 * A heading that puts the ship at `angle` off the wind.
 *
 * With the breeze blowing toward +x it comes FROM bearing -π/2, and the
 * hull's heading is its own rotation about y — so this is the one bit of
 * bookkeeping every test below needs and none of them should repeat.
 * `side` flips her onto the other tack at the same angle to the wind.
 */
const headFor = (angle: number, side: 1 | -1 = 1): number => side * angle - Math.PI / 2;

const run = (rig: SailRig, seconds: number, dt = 1 / 60): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) rig.update(dt);
};

/** Point her at `angle` off the wind and let everything settle. */
function sailing(kind: RigKind, angle: number, opts: { side?: 1 | -1; set?: number } = {}) {
  const rig = createSailRig({ kind, set: opts.set });
  rig.setWind(breeze());
  rig.object.rotation.y = headFor(angle, opts.side ?? 1);
  run(rig, 4);
  return rig;
}

/** Every piece of canvas in a rig, found the way a renderer would see it. */
const canvasOf = (rig: SailRig): Mesh[] => {
  const out: Mesh[] = [];
  rig.object.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && m.geometry?.type === 'PlaneGeometry') out.push(m);
  });
  return out;
};

/** The world-space box every sail in a rig occupies. */
const canvasBox = (rig: SailRig): Box3 => {
  rig.object.updateMatrixWorld(true);
  const box = new Box3();
  for (const sail of canvasOf(rig)) box.union(new Box3().setFromObject(sail));
  return box;
};

/**
 * A rig sailing, then sheeted hard amidships, so what is measured is how
 * the canvas is BENT rather than where the sheet happens to have let it.
 */
function sheetedIn(kind: RigKind, opts: { set?: number } = {}) {
  const rig = sailing(kind, Math.PI / 2, opts);
  rig.object.getObjectByName('spar')!.rotation.y = 0;
  const box = canvasBox(rig);
  return {
    rig,
    box,
    ratio: (box.max.z - box.min.z) / (box.max.x - box.min.x),
  };
}

describe('the polar — a curve, not a throttle', () => {
  it.each(RIG_KINDS)('%s makes EXACTLY NOTHING inside the no-go', (kind) => {
    // A wall, not a gentle slope. If pinching up merely costs you something
    // then a helmsman gets away with it, an AI steers straight at its target
    // through the wind at a small discount, and the entire constraint this
    // track exists for evaporates.
    const rig = createSailRig({ kind });
    for (let a = 0; a < rig.noGo - 1e-6; a += rig.noGo / 40) {
      expect(rig.driveAt(a), `${kind} at ${a.toFixed(2)}rad`).toBe(0);
    }
    expect(rig.driveAt(rig.noGo - 0.001)).toBe(0);
    expect(rig.driveAt(rig.noGo + 0.05), `${kind} never starts drawing`).toBeGreaterThan(0);
  });

  it.each(RIG_KINDS)('%s does not care which side the wind is on', (kind) => {
    const rig = createSailRig({ kind });
    for (const a of [0.4, 1.1, 1.9, 2.7, Math.PI]) {
      expect(rig.driveAt(-a)).toBeCloseTo(rig.driveAt(a), 10);
    }
  });

  it('THE FOUR RIGS ARE FOUR DIFFERENT CURVES, not one curve rescaled', () => {
    // If this were a reskin every kind would peak in the same place and the
    // era axis would be decoration. It is the shape that changes.
    const peak = (kind: RigKind): number => {
      const rig = createSailRig({ kind });
      let best = 0;
      let at = 0;
      for (let a = 0; a <= Math.PI + 1e-9; a += Math.PI / 180) {
        if (rig.driveAt(a) > best) {
          best = rig.driveAt(a);
          at = a;
        }
      }
      return at;
    };
    // A square sail's best point of sailing is dead astern — she is a bag
    // being pushed, and she is magnificent at it.
    expect(peak('square')).toBeCloseTo(Math.PI, 1);
    // Everything fore-and-aft peaks on a reach, well forward of a run.
    for (const kind of ['lateen', 'gaff', 'bermudan'] as RigKind[]) {
      expect(peak(kind), kind).toBeGreaterThan(1.2);
      expect(peak(kind), kind).toBeLessThan(2.3);
    }
  });

  it('A SQUARE RIG CANNOT WORK TO WINDWARD AND A BERMUDAN CAN', () => {
    // Sixty degrees off the wind: the first is stopped dead, the last is
    // making five-sixths of her best. Six hundred years of rig development
    // in one column of numbers.
    const at60 = (kind: RigKind) => createSailRig({ kind }).driveAt((60 * Math.PI) / 180);
    expect(at60('square')).toBe(0);
    expect(at60('lateen')).toBeGreaterThan(0.4);
    expect(at60('gaff')).toBeGreaterThan(at60('lateen'));
    expect(at60('bermudan')).toBeGreaterThan(at60('gaff'));
    // …and the trade runs the other way. Dead downwind the square sail wins.
    const run180 = (kind: RigKind) => createSailRig({ kind }).driveAt(Math.PI);
    expect(run180('square')).toBeGreaterThan(run180('bermudan') * 2);
  });

  it('the no-go narrows era by era, which is the whole story', () => {
    const angles = RIG_KINDS.map(noGoDegrees);
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i], RIG_KINDS[i]).toBeLessThan(angles[i - 1]);
    }
    // And they are plausible numbers, not decoration: ~70° for a square rig
    // down to ~40° for a modern sloop.
    expect(angles[0]).toBeGreaterThan(60);
    expect(angles[angles.length - 1]).toBeLessThan(45);
  });
});

describe('layline — the function the track exists for', () => {
  const rigAt = (kind: RigKind = 'gaff'): SailRig => {
    const rig = createSailRig({ kind });
    rig.setWind(breeze());
    return rig;
  };
  /** The bearing the wind is coming from, for a breeze blowing toward +x. */
  const FROM = -Math.PI / 2;

  it('hands back a sailable bearing UNCHANGED', () => {
    const rig = rigAt();
    for (const off of [1.0, 1.6, 2.4, Math.PI]) {
      const bearing = FROM + off;
      expect(rig.layline(bearing), `${off}rad off the wind`).toBeCloseTo(bearing, 6);
    }
  });

  it('REFUSES TO POINT AT A TARGET DEAD UPWIND, and says where to point instead', () => {
    // Every steering system in the trilogy knows how to face a target and
    // drive. This is the one place that answer is wrong, and the answer it
    // gives instead is a course you can actually sail.
    const rig = rigAt('bermudan');
    const dead = FROM; // straight into it
    const steer = rig.layline(dead);
    expect(steer, 'it steered straight into the wind').not.toBeCloseTo(dead, 3);
    const off = Math.abs(((steer - FROM + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    // As close to the wind as she will lie, and NOT one float's width closer.
    // A layline laid exactly on the boundary is a course that makes no
    // ground at all — you hand a helmsman a heading and he sails it and
    // stops, which is pinching, and it is the failure this margin exists to
    // prevent.
    expect(off, 'the course it gave back was itself unsailable').toBeGreaterThan(rig.noGo);
    expect(off, 'it threw away ground it did not have to').toBeLessThan(rig.noGo + 0.1);
    expect(rig.driveAt(off), 'she would not move on the course it chose').toBeGreaterThan(0);
  });

  it('picks the tack nearer to where she is already pointing', () => {
    // Otherwise choosing a tack is a coin toss, and a ship crossing a lake
    // gybes back and forth for no reason.
    const rig = rigAt('gaff');
    const dead = FROM;
    const onPort = rig.layline(dead, FROM + rig.noGo + 0.3);
    const onStbd = rig.layline(dead, FROM - rig.noGo - 0.3);
    expect(onPort).not.toBeCloseTo(onStbd, 3);
    expect(Math.sign(((onPort - FROM + Math.PI * 3) % (Math.PI * 2)) - Math.PI)).toBe(1);
    expect(Math.sign(((onStbd - FROM + Math.PI * 3) % (Math.PI * 2)) - Math.PI)).toBe(-1);
  });

  it('a square rig has to bear away much further than a sloop for the same target', () => {
    const dead = FROM;
    const spread = (kind: RigKind) => {
      const rig = rigAt(kind);
      const steer = rig.layline(dead, dead);
      return Math.abs(((steer - FROM + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    };
    expect(spread('square')).toBeGreaterThan(spread('bermudan') * 1.5);
  });

  it('gives up gracefully in a flat calm rather than inventing a course', () => {
    const rig = createSailRig({ kind: 'gaff' });
    expect(rig.layline(1.2), 'no wind bound at all').toBeCloseTo(1.2, 6);
    rig.setWind({ sample: () => new Vector2(0, 0) });
    expect(rig.layline(1.2), 'a dead calm').toBeCloseTo(1.2, 6);
  });
});

describe('sailing her', () => {
  it('IN IRONS: pointed at the wind she stops and the canvas shakes', () => {
    for (const kind of RIG_KINDS) {
      const rig = sailing(kind, 0.1);
      expect(rig.drive, `${kind} sailed straight into the wind`).toBe(0);
      expect(rig.luffing, `${kind} sat there drawing nicely in irons`).toBe(true);
      expect(rig.windAngle).toBeLessThan(0.2);
    }
  });

  it('bears away out of irons and fills again', () => {
    const rig = createSailRig({ kind: 'bermudan' });
    rig.setWind(breeze());
    rig.object.rotation.y = headFor(0.1);
    run(rig, 2);
    expect(rig.luffing).toBe(true);
    rig.object.rotation.y = headFor(1.6);
    run(rig, 2);
    expect(rig.luffing, 'still flogging on a beam reach').toBe(false);
    expect(rig.drive).toBeGreaterThan(0.8);
  });

  it('reads its heading from the WORLD, so it works parented to a hull', () => {
    // The rig knows nothing about the ship it is bolted to — it reads its
    // own world matrix. Turn the hull and the sail knows.
    const hull = new Group();
    const rig = createSailRig({ kind: 'gaff' });
    hull.add(rig.object);
    rig.setWind(breeze());
    hull.rotation.y = headFor(0.1);
    run(rig, 2);
    expect(rig.drive, 'the hull turned into the wind and nothing happened').toBe(0);
    hull.rotation.y = headFor(Math.PI / 2);
    run(rig, 2);
    expect(rig.drive).toBeGreaterThan(0.8);
  });

  it('drive scales with how much canvas is set', () => {
    const full = sailing('gaff', Math.PI / 2);
    const reefed = sailing('gaff', Math.PI / 2, { set: 0.4 });
    expect(reefed.drive).toBeLessThan(full.drive * 0.5);
    expect(reefed.drive).toBeGreaterThan(0);
    full.reef(0.6);
    run(full, 1);
    expect(full.set).toBeCloseTo(0.4, 6);
    expect(full.drive).toBeCloseTo(reefed.drive, 6);
  });

  it('furled altogether, she is stopped and flogging whatever the course', () => {
    const rig = sailing('bermudan', Math.PI / 2, { set: 0 });
    expect(rig.drive).toBe(0);
    expect(rig.luffing).toBe(true);
  });

  it('drive scales with the strength of the breeze', () => {
    const stiff = createSailRig({ kind: 'gaff' });
    const light = createSailRig({ kind: 'gaff' });
    stiff.setWind(breeze(1));
    light.setWind(breeze(0.3));
    for (const rig of [stiff, light]) {
      rig.object.rotation.y = headFor(Math.PI / 2);
      run(rig, 3);
    }
    expect(light.drive).toBeCloseTo(stiff.drive * 0.3, 5);
  });

  it('works against a real WindField, not just a test stub', () => {
    const wind = createWindField({ direction: 0, strength: 1, gust: 0 });
    const rig = createSailRig({ kind: 'lateen' });
    rig.setWind(wind);
    rig.object.rotation.y = headFor(2.1);
    run(rig, 3);
    expect(rig.drive).toBeGreaterThan(0.5);
    expect(rig.luffing).toBe(false);
  });
});

describe('heel — not a fraction of drive', () => {
  /** Sideways force per unit of forward force, at `angle` off the wind. */
  const ratio = (kind: RigKind, angle: number): number => {
    const rig = sailing(kind, angle);
    return rig.heelForce / rig.drive;
  };

  it.each(RIG_KINDS)('%s: RUNNING DEAD BEFORE IT SHE DOES NOT HEEL AT ALL', (kind) => {
    // However hard she is driving. A model that multiplies drive by a
    // constant cannot say this, and it is the single most recognisable fact
    // about a ship under sail: she stands up downwind and lies over upwind.
    const rig = sailing(kind, Math.PI);
    expect(rig.drive, `${kind} was not even driving`).toBeGreaterThan(0.3);
    expect(rig.heelForce, `${kind} heeled while running square`).toBeLessThan(0.02);
  });

  it.each(RIG_KINDS)('%s: the heel-to-drive ratio falls away as she bears off', (kind) => {
    const rig = createSailRig({ kind });
    const hard = ratio(kind, rig.noGo + 0.08);
    const broad = ratio(kind, 2.4);
    expect(hard, `${kind}`).toBeGreaterThan(broad * 1.5);
    expect(broad, `${kind}`).toBeGreaterThan(0);
  });

  it('HARD ON THE WIND A SLOOP HEELS FURTHER THAN SHE GOES', () => {
    const rig = sailing('bermudan', 0.75);
    expect(rig.drive).toBeGreaterThan(0.2);
    expect(rig.heelForce).toBeGreaterThan(rig.drive * 1.5);
  });

  it('THE MOST PRESSED SHE EVER IS, IS A CLOSE REACH', () => {
    // Not close-hauled, where the intuition puts it — up there she is
    // heeled but barely driving — and obviously not running. It falls out
    // of the two curves multiplied together rather than being written down
    // anywhere, which is the test worth having: a peak nobody chose.
    const peakOf = (kind: RigKind) => {
      let best = -1;
      let at = 0;
      for (let a = 0.05; a <= Math.PI; a += 0.05) {
        const h = sailing(kind, a).heelForce;
        if (h > best) {
          best = h;
          at = a;
        }
      }
      return { at, best };
    };
    const peaks = RIG_KINDS.map((k) => ({ kind: k, ...peakOf(k) }));
    for (const p of peaks) {
      const rig = createSailRig({ kind: p.kind });
      expect(p.at, `${p.kind} was most pressed hard on the wind`).toBeGreaterThan(rig.noGo);
      expect(p.at, `${p.kind} was most pressed dead downwind`).toBeLessThan(2.9);
      expect(p.best, `${p.kind} never loaded up at all`).toBeGreaterThan(0.1);
      // And it stays inside the published range even at its worst.
      expect(p.best, `${p.kind} exceeded its own contract`).toBeLessThanOrEqual(1);
    }
    // …and where that peak sits moves AFT the older the rig, because a
    // square sail makes nothing at all up near the wind to be pressed by.
    const square = peaks.find((p) => p.kind === 'square')!;
    expect(square.at, 'a square rigger was most pressed on a close reach').toBeGreaterThan(Math.PI / 2);
    for (const kind of ['lateen', 'gaff', 'bermudan'] as RigKind[]) {
      expect(peaks.find((p) => p.kind === kind)!.at, kind).toBeLessThan(Math.PI / 2);
    }
  });

  it('a square rigger stands up to it better than a sloop', () => {
    const box = sailing('square', 1.4);
    const sloop = sailing('bermudan', 1.4);
    expect(box.heelForce / box.drive).toBeLessThan(sloop.heelForce / sloop.drive);
  });

  it('never reports force from sails that are not drawing', () => {
    const rig = sailing('lateen', 0.2);
    expect(rig.drive).toBe(0);
    expect(rig.heelForce).toBe(0);
  });
});

describe('the read — a rig you can see working', () => {
  it('THE BOOM CROSSES THE DECK WHEN SHE GOES ABOUT', () => {
    // A rig whose sails do not move when you change course has a picture of
    // a sail on it. The boom going over is how a player knows a gybe
    // happened without being told.
    const rig = createSailRig({ kind: 'gaff' });
    rig.setWind(breeze());
    const spar = rig.object.getObjectByName('spar')!;
    rig.object.rotation.y = headFor(2.2, 1);
    run(rig, 5);
    const port = spar.rotation.y;
    rig.object.rotation.y = headFor(2.2, -1);
    run(rig, 5);
    const starboard = spar.rotation.y;
    expect(Math.sign(port)).toBe(-Math.sign(starboard));
    expect(Math.abs(port)).toBeGreaterThan(0.5);
  });

  it('and it eases across rather than snapping', () => {
    const rig = createSailRig({ kind: 'bermudan' });
    rig.setWind(breeze());
    const spar = rig.object.getObjectByName('spar')!;
    rig.object.rotation.y = headFor(2.2, 1);
    run(rig, 5);
    const before = spar.rotation.y;
    rig.object.rotation.y = headFor(2.2, -1);
    rig.update(1 / 60);
    expect(Math.abs(spar.rotation.y - before), 'it teleported').toBeLessThan(0.1);
  });

  it('square yards brace round instead of swinging out to one side', () => {
    // Not the same motion at all — a yard is square across the ship and gets
    // angled to meet the wind, it does not stream off the quarter.
    const rig = createSailRig({ kind: 'square' });
    rig.setWind(breeze());
    const spar = rig.object.getObjectByName('spar')!;
    rig.object.rotation.y = headFor(Math.PI);
    run(rig, 5);
    expect(Math.abs(spar.rotation.y), 'braced round while running square').toBeLessThan(0.05);
    rig.object.rotation.y = headFor(1.5);
    run(rig, 5);
    expect(Math.abs(spar.rotation.y), 'never braced up at all').toBeGreaterThan(0.2);
  });

  it('FURLED CANVAS COMES DOWN TO ITS SPAR, it does not shrink in mid-air', () => {
    // Scaling a sail about its middle leaves a reefed mainsail floating
    // clear of its own boom with a gap of daylight under it.
    for (const kind of RIG_KINDS) {
      const a = sheetedIn(kind).box;
      const b = sheetedIn(kind, { set: 0.3 }).box;
      expect(b.max.y - b.min.y, `${kind} did not shorten`).toBeLessThan(a.max.y - a.min.y);
      // The edge bent to the spar stays exactly where it was.
      const kept = kind === 'square' ? Math.abs(b.max.y - a.max.y) : Math.abs(b.min.y - a.min.y);
      expect(kept, `${kind} floated off its spar`).toBeLessThan(0.05);
    }
  });

  it('canvas disappears entirely when it is stowed', () => {
    const rig = sailing('gaff', Math.PI / 2, { set: 0 });
    expect(canvasOf(rig).every((m) => !m.visible)).toBe(true);
  });

  it.each(RIG_KINDS)('%s: the sail is where the spar is, and above the deck', (kind) => {
    const rig = sailing(kind, Math.PI / 2);
    rig.object.updateMatrixWorld(true);
    const sails = canvasOf(rig);
    expect(sails.length).toBeGreaterThan(0);
    for (const sail of sails) {
      const box = new Box3().setFromObject(sail);
      expect(box.min.y, `${kind}: canvas through the deck`).toBeGreaterThan(-0.5);
      expect(box.max.y, `${kind}: canvas off the top of the mast`).toBeLessThan(16);
    }
  });

  it('a fore-and-aft rig hangs its canvas FORE AND AFT, not across the ship', () => {
    // A lateen sail rigged athwartships is just a square sail on the skew,
    // and the entire reason the Mediterranean could sail to windward is
    // that it is not one.
    //
    // Measured with the spar sheeted amidships — a boom swung out on a
    // reach has a large athwartships extent no matter how it is rigged, and
    // measuring THAT is measuring the sheet, not the rig.
    for (const kind of ['lateen', 'gaff', 'bermudan'] as RigKind[]) {
      expect(sheetedIn(kind).ratio, `${kind} was rigged across the ship`).toBeGreaterThan(2);
    }
    // …and a square sail is the opposite, which is what makes it square.
    expect(sheetedIn('square').ratio).toBeLessThan(0.5);
  });

  it.each(RIG_KINDS)('%s is walk-through — it is rigging, not an obstacle', (kind) => {
    expect(createSailRig({ kind }).obstacleRadius).toBe(0);
  });
});
