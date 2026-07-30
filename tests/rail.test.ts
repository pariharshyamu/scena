import { describe, expect, it } from 'vitest';
import { Vector3, type InstancedMesh, type Mesh } from 'three';
import { createSurface, SURFACE_PRESETS } from '../src';
import { createTrack } from '../src/environment/track';
import { createStationPlatform } from '../src/props/platform';
import {
  createCarriage,
  createConsist,
  createLocomotive,
  createWagon,
} from '../src/props/rollingstock';

const STRAIGHT = [new Vector3(0, 0, 0), new Vector3(100, 0, 0), new Vector3(200, 0, 0)];
const BENT = [
  new Vector3(0, 0, 0),
  new Vector3(200, 0, 0),
  new Vector3(400, 0, 120),
  new Vector3(700, 0, 120),
];

const draws = (object: { traverse(fn: (o: unknown) => void): void }): number => {
  let n = 0;
  object.traverse((o) => {
    if ((o as Mesh).isMesh) n++;
  });
  return n;
};

describe('createTrack', () => {
  it('is four draw calls however long it is', () => {
    // The whole reason sleepers are instanced. A kilometre at 0.65 m spacing
    // is over 1,500 of them, and a Mesh each would be 1,500 draw calls for
    // something nobody looks at directly.
    const short = createTrack(STRAIGHT);
    const long = createTrack(BENT);
    expect(draws(short.object)).toBe(4);
    expect(draws(long.object)).toBe(4);

    let sleepers = 0;
    long.object.traverse((o) => {
      const m = o as InstancedMesh;
      if (m.isInstancedMesh) sleepers += m.count;
    });
    expect(sleepers).toBeGreaterThan(1000);
  });

  it('`at` measures DISTANCE, not curve parameter', () => {
    // The defect this exists to prevent: `CatmullRomCurve3.getPoint(t)` walks
    // the curve's parameter, so equal steps in `t` cover unequal ground and a
    // train driven on it speeds up and slows down round every bend.
    const line = createTrack(BENT);
    let worst = 0;
    for (let d = 0; d + 10 <= line.length; d += 10) {
      const gap = line.at(d).position.distanceTo(line.at(d + 10).position);
      worst = Math.max(worst, Math.abs(gap - 10) / 10);
    }
    expect(worst).toBeLessThan(0.01); // measured 0.024%
  });

  it('reports its own resampling error, and it is small', () => {
    // three.js builds its arc-length table from `arcLengthDivisions`, default
    // 200. On a 737 m line that is one entry every 3.7 m and the "equally
    // spaced" points came out 8.3% uneven — measured, then fixed by scaling
    // the table with the line. This is the guard on that fix.
    expect(createTrack(BENT).distanceError).toBeLessThan(0.01);
  });

  it('clamps at the buffers rather than extrapolating', () => {
    const line = createTrack(STRAIGHT);
    expect(line.at(-500).position.distanceTo(line.at(0).position)).toBeCloseTo(0, 6);
    expect(
      line.at(line.length + 500).position.distanceTo(line.at(line.length).position)
    ).toBeCloseTo(0, 6);
  });

  it('wraps on a loop instead of clamping', () => {
    const ring = createTrack(
      [new Vector3(-60, 0, 0), new Vector3(0, 0, 60), new Vector3(60, 0, 0), new Vector3(0, 0, -60)],
      { loop: true }
    );
    expect(ring.at(ring.length + 12).position.distanceTo(ring.at(12).position)).toBeLessThan(0.05);
  });
});

describe('createConsist', () => {
  const train = () =>
    createConsist(createTrack(BENT), [
      createLocomotive({ seed: 1 }),
      createCarriage({ seed: 2 }),
      createCarriage({ seed: 3 }),
    ]);

  it('spaces vehicles by their own length plus the coupling', () => {
    const t = train();
    t.place(300);
    const [a, b, c] = t.vehicles;
    const ab = a.object.position.distanceTo(b.object.position);
    const expected = a.length / 2 + 0.6 + b.length / 2;
    // On a curve the straight-line gap is slightly under the along-track gap,
    // which is correct — that is a chord across a bend, not an error.
    expect(ab).toBeGreaterThan(expected * 0.97);
    expect(ab).toBeLessThan(expected * 1.001);
    expect(c.object.position.distanceTo(b.object.position)).toBeGreaterThan(0);
  });

  it('faces each vehicle along its BOGIE CHORD, not the tangent at its centre', () => {
    // The claim the whole module rests on. On a bend the two differ; if they
    // did not, this test would pass on a consist that ignored bogies entirely,
    // so it also asserts the difference is real.
    const track = createTrack(BENT);
    const carriage = createCarriage({ seed: 5 });
    const t = createConsist(track, [carriage]);

    // Find a distance where the track is genuinely curving.
    let bend = 0;
    let worstTurn = 0;
    for (let d = 40; d < track.length - 40; d += 5) {
      const turn = track.at(d - 20).tangent.angleTo(track.at(d + 20).tangent);
      if (turn > worstTurn) {
        worstTurn = turn;
        bend = d;
      }
    }
    expect(worstTurn).toBeGreaterThan(0.1); // the fixture really does bend

    t.place(bend + carriage.length / 2);
    const half = carriage.bogieSpacing / 2;
    const centre = bend + carriage.length / 2 - carriage.length / 2;
    const front = track.at(centre + half).position;
    const back = track.at(centre - half).position;

    // The body sits on the bogie midpoint…
    const mid = front.clone().lerp(back, 0.5);
    expect(carriage.object.position.distanceTo(mid)).toBeLessThan(1e-6);

    // …and faces the chord, which differs from the centre tangent on a bend.
    const chord = front.clone().sub(back).normalize();
    const chordYaw = Math.atan2(chord.x, chord.z);
    const tangentYaw = Math.atan2(track.at(centre).tangent.x, track.at(centre).tangent.z);
    // The body is authored facing −Z, so its rotated −Z axis IS the direction
    // of travel, and that must be the chord.
    const forward = new Vector3(0, 0, -1).applyQuaternion(carriage.object.quaternion);
    expect(forward.angleTo(chord)).toBeLessThan(1e-6);
    expect(Math.abs(chordYaw - tangentYaw)).toBeGreaterThan(1e-4);
  });

  it('rolls the wheels by DISTANCE, so they cannot slip', () => {
    // The rail version of foot skate: a wheel spun on a timer slides whenever
    // the train changes speed, and no still frame shows it.
    const track = createTrack(STRAIGHT);
    const carriage = createCarriage({ seed: 9 });
    const t = createConsist(track, [carriage]);
    const wheelOf = () =>
      carriage.wheels[0].children.find((c) => c.name === 'wheel')!.rotation.y;

    t.place(50);
    const a = wheelOf();
    t.place(50 + 3);
    const turned = Math.abs(wheelOf() - a);
    // 3 m of travel on a 0.45 m wheel is 3 / 0.45 radians.
    expect(turned).toBeCloseTo(3 / carriage.wheelRadius, 6);
  });

  it('puts the FRONT of the train at the requested distance', () => {
    // Because a station stop is "the front at the stopping mark", which is
    // what a driver aims at and what a platform is measured from.
    const track = createTrack(STRAIGHT);
    const t = createConsist(track, [createLocomotive({ seed: 1 }), createCarriage({ seed: 2 })]);
    t.place(120);
    const nose = t.vehicles[0].object.position;
    expect(nose.distanceTo(track.at(120 - t.vehicles[0].length / 2).position)).toBeLessThan(0.05);
  });

  it('reports where its doors are, for a platform to align to', () => {
    const track = createTrack(STRAIGHT);
    const t = createConsist(track, [createCarriage({ seed: 2 }), createCarriage({ seed: 3 })]);
    t.place(100);
    const doors = t.doorPositions();
    expect(doors).toHaveLength(4); // two carriages, two doors each
    for (const d of doors) expect(Number.isFinite(d.x)).toBe(true);
    // Doors sit along the train, so they must be spread out along it.
    const zs = doors.map((d) => d.x).sort((a, b) => a - b);
    expect(zs[zs.length - 1] - zs[0]).toBeGreaterThan(20);
  });

  it('a goods wagon has no doors to align and no seats to sit in', () => {
    const wagon = createWagon({ seed: 4, kind: 'open' });
    expect(wagon.doors).toHaveLength(0);
    expect(wagon.slots ?? []).toHaveLength(0);
    expect(wagon.length).toBeGreaterThan(0);
  });

  it('mixes passenger and goods stock in one train', () => {
    const track = createTrack(STRAIGHT);
    const t = createConsist(track, [
      createLocomotive({ seed: 1 }),
      createWagon({ seed: 2, kind: 'van' }),
      createWagon({ seed: 3, kind: 'flat' }),
      createCarriage({ seed: 4 }),
    ]);
    t.place(150);
    expect(t.length).toBeGreaterThan(50);
    expect(t.doorPositions()).toHaveLength(2); // only the carriage has doors
  });
});

describe('createPlatform', () => {
  /** The train this platform is built for, and the platform built for it. */
  const station = (trackPoints = STRAIGHT) => {
    const track = createTrack(trackPoints);
    const train = createConsist(track, [
      createLocomotive({ seed: 1 }),
      createCarriage({ seed: 2 }),
      createCarriage({ seed: 3 }),
    ]);
    // Door offsets measured from the train's FRONT, which is what the
    // platform's stop mark is expressed in.
    const offsets: number[] = [];
    let run = 0;
    for (const v of train.vehicles) {
      for (const d of v.doors) offsets.push(-(run + v.length / 2 + d));
      run += v.length + 0.6;
    }
    const platform = createStationPlatform(track, {
      from: 60,
      to: 60 + train.length + 14,
      name: 'HAVENBROOK',
      doorOffsets: offsets,
    });
    return { track, train, platform };
  };

  it('a train stopped on the mark lands its doors on the markings', () => {
    // THE number. A platform is easy to build wrong in a way no screenshot
    // shows: the train stops, the doors open, and they are two metres past
    // the markings. Held to 10 cm.
    const { train, platform } = station();
    train.place(platform.stopMark);
    const doors = train.doorPositions();
    expect(doors).toHaveLength(platform.doorMarks.length);
    let worst = 0;
    for (const [i, door] of doors.entries()) {
      // Compare along the platform only — the door is on the carriage side,
      // the marking is on the paving, so they are never at the same point.
      const mark = platform.doorMarks[i];
      worst = Math.max(worst, Math.abs(door.x - mark.x));
    }
    expect(worst).toBeLessThan(0.1);
  });

  it('holds alignment on a curve too', () => {
    // Where it would go wrong: on a bend the doors sit off the chord, and a
    // platform laid to the centreline drifts away from them.
    const { train, platform } = station(BENT);
    train.place(platform.stopMark);
    const doors = train.doorPositions();
    let worst = 0;
    for (const [i, door] of doors.entries()) {
      worst = Math.max(worst, door.distanceTo(platform.doorMarks[i]));
    }
    // Looser than the straight case and honestly so: a rigid carriage on a
    // curve genuinely stands off the platform, which is why real ones have a
    // gap you are warned to mind.
    expect(worst).toBeLessThan(2.5);
  });

  it('stops a train short of the far end rather than at the ramp', () => {
    const { platform } = station();
    expect(platform.stopMark).toBeLessThan(platform.to);
    expect(platform.stopMark).toBeGreaterThan(platform.from);
  });

  it('is instanced, so a long platform is not a long draw list', () => {
    const track = createTrack(BENT);
    const short = createStationPlatform(track, { from: 10, to: 40 });
    const long = createStationPlatform(track, { from: 10, to: 400 });
    // A 390 m platform must not cost thirteen times a 30 m one.
    expect(draws(long.object)).toBeLessThanOrEqual(draws(short.object) + 1);
  });

  it('carries the station name and somewhere to sit', () => {
    const { platform } = station();
    let named = false;
    platform.object.traverse((o) => {
      if ((o as Mesh).name === 'station-name') named = true;
    });
    expect(named).toBe(true);
    expect(platform.slots.length).toBeGreaterThan(0);
  });
});

describe('the grass surface', () => {
  it('exists, because `createGrass` does', () => {
    // Reaching for `createSurface('grass')` when a `createGrass` prop exists
    // is the obvious move, and it used to throw — the ground under a field
    // had no name. Found by writing the railway example and hitting it.
    expect(SURFACE_PRESETS.grass).toBeDefined();
    expect(createSurface('grass')).toBeDefined();
  });

  it('is green, where moss is grey', () => {
    // The trap it replaces: `moss` is a grey-green cap that grows ON stone,
    // and using it as a lawn gives a field the colour of a damp wall.
    const grass = SURFACE_PRESETS.grass.baseColor!;
    const moss = SURFACE_PRESETS.moss.baseColor!;
    const green = (c: number) => ((c >> 8) & 0xff) - (((c >> 16) & 0xff) + (c & 0xff)) / 2;
    expect(green(grass)).toBeGreaterThan(20); // genuinely green
    expect(green(grass)).toBeGreaterThan(green(moss));
  });

  it('has blade grain, and no stone cap', () => {
    const grass = SURFACE_PRESETS.grass;
    expect(grass.grain).toBeGreaterThan(0); // directional streaking
    expect(grass.cap ?? 0).toBe(0); // it IS the ground, it does not sit on it
  });
});
