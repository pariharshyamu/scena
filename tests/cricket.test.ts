import { describe, it, expect } from 'vitest';
import {
  createCricketGround,
  createBat,
  createCricketBall,
  PITCH_LENGTH,
  STUMP_HEIGHT,
} from '../src';

describe('the cricket ground', () => {
  it('measures the pitch the way the laws do', () => {
    // 22 yards stump to stump, and stumps 28 inches tall.
    expect(PITCH_LENGTH).toBeCloseTo(20.12, 2);
    expect(STUMP_HEIGHT).toBeCloseTo(0.711, 3);
    const ground = createCricketGround({ seed: 3 });
    const a = ground.stumpsAt(-1);
    const b = ground.stumpsAt(1);
    expect(a.distanceTo(b)).toBeCloseTo(PITCH_LENGTH, 3);
  });

  it('puts the batter on the crease, in front of the stumps', () => {
    const ground = createCricketGround({ seed: 3 });
    const striker = ground.strikerEnd;
    const stumps = ground.stumpsAt(-1);
    // Four feet in front, on the batting side of the wicket.
    expect(striker.z - stumps.z).toBeCloseTo(1.219, 2);
    // And the two ends face each other down the strip.
    expect(ground.bowlerEnd.z).toBeGreaterThan(ground.strikerEnd.z);
  });

  it('knows where the rope is, in world space', () => {
    const ground = createCricketGround({ seed: 3, boundary: 60 });
    expect(ground.isBoundary(0, 0)).toBe(false);
    expect(ground.isBoundary(0, 59.5)).toBe(false);
    expect(ground.isBoundary(0, 61)).toBe(true);
    // Move the ground and the rope moves with it.
    ground.object.position.set(100, 0, 0);
    ground.object.updateWorldMatrix(true, false);
    expect(ground.isBoundary(0, 61)).toBe(true);   // now 100 m away
    expect(ground.isBoundary(100, 30)).toBe(false);
  });

  it('THE BAILS FLY, and settle, and can be put back', () => {
    const ground = createCricketGround({ seed: 3 });
    const bail = ground.object.getObjectByName('stumps-striker')!.children.find(
      (c) => (c as { geometry?: { type?: string } }).geometry?.type === 'CylinderGeometry'
        && c.position.y > STUMP_HEIGHT
    )!;
    const restY = bail.position.y;
    ground.breakWicket(-1);
    for (let i = 0; i < 6; i++) ground.update(1 / 60);
    expect(bail.position.y).toBeGreaterThan(restY);   // up and away
    for (let i = 0; i < 240; i++) ground.update(1 / 60);
    expect(bail.position.y).toBeLessThan(restY);      // and down on the turf
    ground.resetWicket();
    expect(bail.position.y).toBeCloseTo(restY, 6);
  });

  it('breaking one end leaves the other end standing', () => {
    const ground = createCricketGround({ seed: 3 });
    const far = ground.object.getObjectByName('stumps-bowler')!;
    const bail = far.children.find((c) => c.position.y > STUMP_HEIGHT)!;
    const restY = bail.position.y;
    ground.breakWicket(-1);
    for (let i = 0; i < 30; i++) ground.update(1 / 60);
    expect(bail.position.y).toBeCloseTo(restY, 6);
  });

  it('is a field, not an obstacle, and is deterministic', () => {
    const a = createCricketGround({ seed: 11 });
    const b = createCricketGround({ seed: 11 });
    expect(a.obstacleRadius).toBe(0);
    let ca = 0;
    let cb = 0;
    a.object.traverse(() => ca++);
    b.object.traverse(() => cb++);
    expect(ca).toBe(cb);
    expect(a.object.getObjectByName('pitch')).toBeDefined();
    expect(a.object.getObjectByName('boundary')).toBeDefined();
  });
});

describe('the gear', () => {
  it('a bat has a blade, a swell and a bound handle', () => {
    const bat = createBat({ seed: 4 });
    let meshes = 0;
    bat.object.traverse((o) => {
      if ((o as { isMesh?: boolean }).isMesh) meshes++;
    });
    // face + swell + handle + five grip bands
    expect(meshes).toBe(8);
  });

  it('a ball is 72 mm with a seam', () => {
    const ball = createCricketBall({ seed: 2 });
    expect(ball.obstacleRadius).toBeCloseTo(0.036, 3);
    expect(ball.marker).toBeDefined();
    let meshes = 0;
    ball.object.traverse((o) => {
      if ((o as { isMesh?: boolean }).isMesh) meshes++;
    });
    expect(meshes).toBe(2);   // leather and seam
  });
});
