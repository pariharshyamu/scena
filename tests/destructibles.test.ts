import { describe, expect, it } from 'vitest';
import { Group, Mesh, Vector3 } from 'three';
import {
  createBreakable,
  createScoreboard,
  createStumps,
  createTargetDummy,
} from '../src';

const settle = (prop: { update(dt: number): void }, seconds: number, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) prop.update(dt);
};

describe('createBreakable', () => {
  it('swaps shell for shards, flies them, settles into debris', () => {
    const crate = createBreakable('crate', { seed: 3 });
    const [shell, debris] = crate.group.children as [Group, Group];
    expect(crate.state).toBe('intact');
    expect(shell.visible).toBe(true);
    expect(debris.visible).toBe(false);

    crate.break({ x: 2, z: 1 });
    expect(crate.state).toBe('breaking');
    expect(shell.visible).toBe(false);
    expect(debris.visible).toBe(true);
    crate.break(); // already broken — nothing doubles

    settle(crate, 4);
    expect(crate.state).toBe('debris');
    for (const shard of debris.children as Mesh[]) {
      expect(shard.position.y).toBeGreaterThanOrEqual(0.049); // rested on the floor
      expect(Number.isFinite(shard.position.x + shard.position.z)).toBe(true);
    }
  });

  it('the same seed breaks into the same pieces — a replay is honest', () => {
    const run = () => {
      const pot = createBreakable('pot', { seed: 7 });
      pot.break({ x: 1, z: 0 });
      settle(pot, 2);
      return (pot.group.children[1] as Group).children.map((s) => [
        Number(s.position.x.toFixed(6)),
        Number(s.position.y.toFixed(6)),
        Number(s.position.z.toFixed(6)),
      ]);
    };
    expect(run()).toEqual(run());
  });

  it('reset puts it back in one piece, ready to break again', () => {
    const barrel = createBreakable('barrel', { seed: 5 });
    const homes = (barrel.group.children[1] as Group).children.map((s) => s.position.clone());
    barrel.break();
    settle(barrel, 2);
    barrel.reset();
    expect(barrel.state).toBe('intact');
    expect(barrel.group.children[0].visible).toBe(true);
    (barrel.group.children[1] as Group).children.forEach((shard, i) => {
      expect(shard.position.distanceTo(homes[i])).toBeLessThan(1e-9);
    });
    barrel.break();
    expect(barrel.state).toBe('breaking'); // and it breaks again
    expect(barrel.loot.y).toBeGreaterThan(0); // loot spawns inside, not underground
  });
});

describe('createTargetDummy', () => {
  it('wobbles from the blow and rings down to stillness', () => {
    const dummy = createTargetDummy({ seed: 2 });
    const pivot = dummy.group.children[0];
    dummy.hit({ x: 5, z: 0 }, 1);
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      dummy.update(1 / 30);
      peak = Math.max(peak, Math.abs(pivot.rotation.x) + Math.abs(pivot.rotation.z));
    }
    expect(peak).toBeGreaterThan(0.05); // it swung
    settle(dummy, 5);
    expect(Math.abs(pivot.rotation.x) + Math.abs(pivot.rotation.z)).toBeLessThan(0.02); // and rang down
  });

  it('topple lays it down and it stays; hits on the fallen do nothing', () => {
    const dummy = createTargetDummy();
    dummy.topple();
    settle(dummy, 2);
    const pivot = dummy.group.children[0];
    const flat = new Vector3(1, 0, 0);
    expect(pivot.quaternion.angleTo({ setFromAxisAngle: () => 0 } as never)).toBeDefined;
    expect(dummy.toppled).toBe(true);
    const down = pivot.rotation.x;
    expect(Math.abs(down)).toBeGreaterThan(1.2); // ~π/2, on the ground
    dummy.hit(flat, 3);
    settle(dummy, 0.5);
    expect(pivot.rotation.x).toBeCloseTo(down, 1); // unmoved by the kick
    dummy.reset();
    settle(dummy, 0.1);
    expect(dummy.toppled).toBe(false);
    expect(Math.abs(pivot.rotation.x)).toBeLessThan(0.05);
  });
});

describe('createScoreboard', () => {
  it('shows a clamped value and FLIPS the changed digits only', () => {
    const board = createScoreboard({ digits: 3 });
    // Slots are the Group children holding a digit mesh each.
    const slots = board.group.children.filter(
      (c) => c.children.length === 1 && (c.children[0] as Mesh).isMesh
    );
    expect(slots.length).toBe(3);
    const initialGeoms = slots.map((s) => (s.children[0] as Mesh).geometry);

    board.set(42);
    expect(board.value).toBe(42);
    settle(board, 1);
    const after = slots.map((s) => (s.children[0] as Mesh).geometry);
    expect(after[0]).toBe(initialGeoms[0]); // leading 0 → 0: untouched
    expect(after[1]).not.toBe(initialGeoms[1]); // 0 → 4
    expect(after[2]).not.toBe(initialGeoms[2]); // 0 → 2
    for (const slot of slots) expect(Math.abs(slot.rotation.x)).toBeLessThan(1e-6); // flips ended flat

    board.set(99999);
    expect(board.value).toBe(999); // clamped to the digits
    board.set(NaN);
    expect(board.value).toBe(0);
  });

  it('mid-flip the slot is visibly turning', () => {
    const board = createScoreboard({ digits: 2 });
    const slot = board.group.children.find(
      (c) => c.children.length === 1 && (c.children[0] as Mesh).isMesh
    )!;
    board.set(90); // changes the first digit
    board.update(0.1); // ~a third through the 0.28 s flip
    expect(Math.abs(slot.rotation.x)).toBeGreaterThan(0.3);
  });
});

describe('createStumps', () => {
  it('THE BAILS FLY: off their perch, through the air, onto the ground', () => {
    const stumps = createStumps({ seed: 4 });
    const bails = stumps.group.children.slice(3) as Mesh[];
    const homes = bails.map((b) => b.position.clone());

    stumps.strike({ x: 0, z: 1 }, 1);
    expect(stumps.struck).toBe(true);
    settle(stumps, 0.15);
    // Airborne: away from the perch, still above ground.
    expect(bails[0].position.distanceTo(homes[0])).toBeGreaterThan(0.05);

    settle(stumps, 4);
    for (const bail of bails) {
      expect(bail.position.y).toBeLessThanOrEqual(0.013); // landed
      expect(Number.isFinite(bail.position.x + bail.position.z)).toBe(true);
    }
    // The two bails did not fly identically — one drawn twice reads fake.
    expect(bails[0].position.distanceTo(bails[1].position)).toBeGreaterThan(0.05);
    // And at least one stump leans.
    const leans = (stumps.group.children.slice(0, 3) as Mesh[]).map((s) => Math.abs(s.rotation.x));
    expect(Math.max(...leans)).toBeGreaterThan(0.2);
  });

  it('a second ball changes nothing; reset rebuilds the wicket', () => {
    const stumps = createStumps({ seed: 6 });
    const bails = stumps.group.children.slice(3) as Mesh[];
    const homes = bails.map((b) => b.position.clone());
    stumps.strike();
    settle(stumps, 1);
    const mid = bails[0].position.clone();
    stumps.strike({ x: 5, z: 5 }, 2); // ignored — already struck
    settle(stumps, 0.001);
    expect(bails[0].position.distanceTo(mid)).toBeLessThan(0.05);

    stumps.reset();
    expect(stumps.struck).toBe(false);
    bails.forEach((bail, i) => expect(bail.position.distanceTo(homes[i])).toBeLessThan(1e-9));
    const uprights = (stumps.group.children.slice(0, 3) as Mesh[]).map((s) => s.rotation.x);
    for (const lean of uprights) expect(Math.abs(lean)).toBeLessThan(1e-6);
  });

  it('same seed, same wicket falling the same way', () => {
    const fall = () => {
      const stumps = createStumps({ seed: 9 });
      stumps.strike({ x: 0.3, z: 1 }, 1.2);
      settle(stumps, 3);
      return (stumps.group.children.slice(3) as Mesh[]).map((b) => [
        Number(b.position.x.toFixed(6)),
        Number(b.position.z.toFixed(6)),
      ]);
    };
    expect(fall()).toEqual(fall());
  });
});
