import { describe, expect, it } from 'vitest';
import { Box3, Object3D, Vector3 } from 'three';
import { createColdStore, createFridge, createLarder, spoilRate, COLD_ERAS } from '../src';
import type { ColdEra, ColdStore } from '../src';

const boxOf = (o: Object3D): Box3 => {
  o.updateMatrixWorld(true);
  const box = new Box3();
  o.traverse((c) => {
    if (c.type === 'Mesh' && !(c as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) {
      box.expandByObject(c);
    }
  });
  return box;
};

const run = (s: ColdStore, seconds: number, dt = 1 / 60): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) s.update(dt);
};

/** A point on the middle shelf, in world space. */
const inside = (s: ColdStore): Vector3 => {
  s.object.updateMatrixWorld(true);
  const shelf = s.shelves[Math.floor(s.shelves.length / 2)];
  return shelf.anchor.getWorldPosition(new Vector3()).add(new Vector3(0, 0.05, 0));
};

describe('createColdStore — the shape of it', () => {
  it.each(COLD_ERAS)('%s is a CAVITY, not a painted box', (era) => {
    // The defect that has bitten the pot, the pool, the oven and the bath.
    // A cabinet with no inside has nowhere to put the food, and the moment
    // the door swings the render shows a slab where the shelves should be.
    const s = createColdStore({ era, seed: 3 });
    const at = inside(s);
    expect(s.chillAt(at.x, at.y, at.z), `${era} has no interior`).toBeLessThan(s.ambient - 1);
  });

  it.each(COLD_ERAS)('%s stands on the floor at a sensible height', (era) => {
    const box = boxOf(createColdStore({ era, seed: 1 }).object);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.max.y).toBeLessThan(1.85);
    expect(box.max.y).toBeGreaterThan(1.0);
  });

  it.each(COLD_ERAS)('%s publishes shelves you can reach and dress', (era) => {
    const s = createColdStore({ era, seed: 2 });
    expect(s.shelves.length).toBeGreaterThan(1);
    // Also as `surfaces`, so `dress` fills it with no special case.
    expect(s.surfaces).toBe(s.shelves);
    s.object.updateMatrixWorld(true);
    for (const shelf of s.shelves) {
      const y = shelf.anchor.getWorldPosition(new Vector3()).y;
      expect(y, `${era}`).toBeGreaterThan(0.1);
      expect(y, `${era}`).toBeLessThan(1.7);
      expect(shelf.width).toBeGreaterThan(0.3);
      expect(shelf.depth).toBeGreaterThan(0.2);
    }
  });

  it('the door swings, and it is the door that moves', () => {
    const s = createFridge({ seed: 1 });
    s.object.updateMatrixWorld(true);
    expect(s.door.state).toBe(0);
    s.door.toggle();
    run(s, 2);
    expect(s.door.open).toBe(true);
    expect(s.door.state).toBeGreaterThan(0.9);
    expect(Math.abs(s.door.object.rotation.y)).toBeGreaterThan(1.5);
    s.door.set(false);
    run(s, 3);
    expect(Math.abs(s.door.object.rotation.y)).toBeLessThan(0.05);
  });

  it('outside the cabinet is just the room', () => {
    const s = createFridge({ ambient: 22 });
    expect(s.chillAt(0, 1, 3)).toBe(22);
    expect(s.keepAt(0, 1, 3)).toBeCloseTo(spoilRate(22), 5);
    // And it follows the cabinet around rather than living at the origin.
    s.object.position.set(5, 0, -4);
    const at = inside(s);
    expect(s.chillAt(at.x, at.y, at.z)).toBeLessThan(10);
    expect(s.chillAt(0, 1, 0)).toBe(22);
  });
});

describe('createColdStore — THE DOOR IS THE MECHANIC', () => {
  it.each(COLD_ERAS)('%s loses its cold with the door hanging open', (era) => {
    const s = createColdStore({ era, ambient: 20, seed: 1 });
    run(s, 5);
    const shut = s.temperature;
    s.door.set(true);
    run(s, 45);
    expect(s.temperature, `${era} did not care about the door`).toBeGreaterThan(shut + 3);
  });

  it('and gets it back once the door is shut', () => {
    const s = createFridge({ ambient: 20 });
    s.door.set(true);
    run(s, 40);
    const warm = s.temperature;
    s.door.set(false);
    run(s, 60);
    expect(s.temperature).toBeLessThan(warm - 5);
    expect(s.temperature).toBeLessThan(6);
  });

  it('AN OPEN £900 FRIDGE IS BARELY BETTER THAN A STONE CUPBOARD', () => {
    // The lesson the whole track is built around: the machinery only ever
    // buys you anything while the box is shut.
    const fridge = createFridge({ ambient: 24 });
    const larder = createLarder({ ambient: 24 });
    run(fridge, 5);
    run(larder, 5);
    const shutGap = larder.temperature - fridge.temperature;
    fridge.door.set(true);
    larder.door.set(true);
    run(fridge, 90);
    run(larder, 90);
    const openGap = larder.temperature - fridge.temperature;
    expect(shutGap).toBeGreaterThan(6);
    expect(openGap).toBeLessThan(shutGap * 0.6);
  });

  it('the alarm fires once per opening, not once per frame', () => {
    const s = createFridge();
    let alarms = 0;
    s.onAlarm = () => (alarms += 1);
    s.door.set(true);
    run(s, 60);
    expect(alarms).toBe(1);
    expect(s.ajar).toBeGreaterThan(55);
    s.door.set(false);
    run(s, 5);
    expect(s.ajar).toBe(0);
    s.door.set(true);
    run(s, 60);
    expect(alarms).toBe(2);
  });

  it('the light comes on with the door and goes off with it', () => {
    const s = createFridge();
    expect(s.light).not.toBeNull();
    run(s, 1);
    expect(s.light!.intensity).toBeCloseTo(0, 3);
    s.door.set(true);
    run(s, 2);
    expect(s.light!.intensity).toBeGreaterThan(1);
    s.door.set(false);
    run(s, 3);
    expect(s.light!.intensity).toBeLessThan(0.05);
    // And a stone larder has no bulb in it.
    expect(createLarder().light).toBeNull();
  });
});

describe('createColdStore — what each era makes you do', () => {
  it('a LARDER is only ever as good as the day', () => {
    // No mechanism, so it tracks the room. On a hot day it does nothing,
    // which is the entire reason the icebox was invented.
    const cool = createLarder({ ambient: 8 });
    const hot = createLarder({ ambient: 32 });
    run(cool, 400);
    run(hot, 400);
    expect(cool.temperature).toBeLessThan(4);
    expect(hot.temperature).toBeGreaterThan(24);
    // It never runs anything, and there is nothing to restock.
    expect(hot.running).toBe(false);
    hot.restock();
    expect(hot.ice).toBe(1);
  });

  it('a larder follows the room when the room changes', () => {
    const s = createLarder({ ambient: 10 });
    run(s, 400);
    const cold = s.temperature;
    s.ambient = 30;
    run(s, 400);
    expect(s.temperature).toBeGreaterThan(cold + 15);
  });

  it('an ICEBOX spends its block, and spends it faster with the door open', () => {
    const shut = createColdStore({ era: 'icebox', ambient: 22, seed: 1 });
    const open = createColdStore({ era: 'icebox', ambient: 22, seed: 1 });
    run(shut, 120);
    open.door.set(true);
    run(open, 120);
    expect(shut.ice).toBeLessThan(1);
    // Compare what MELTED, not what is left: early on both blocks are mostly
    // there, and a ratio of the remainders hides a threefold difference.
    expect(1 - open.ice, 'an open icebox melted no faster').toBeGreaterThan((1 - shut.ice) * 1.8);
  });

  it('no ice, no cold — and a fresh block brings it back', () => {
    const s = createColdStore({ era: 'icebox', ambient: 22, iced: false });
    expect(s.ice).toBe(0);
    run(s, 200);
    expect(s.temperature, 'it chilled with an empty ice rack').toBeGreaterThan(18);
    s.restock();
    expect(s.ice).toBe(1);
    run(s, 200);
    expect(s.temperature).toBeLessThan(12);
  });

  it('a FRIDGE cycles its compressor rather than running flat out', () => {
    const s = createFridge({ ambient: 20 });
    const flips: boolean[] = [];
    let last = s.running;
    for (let i = 0; i < 60 * 300; i++) {
      s.update(1 / 60);
      if (s.running !== last) {
        flips.push(s.running);
        last = s.running;
      }
    }
    expect(flips.filter((f) => f).length, 'never switched on').toBeGreaterThan(2);
    expect(flips.filter((f) => !f).length, 'never switched off').toBeGreaterThan(2);
    // And it held its setpoint the whole time.
    expect(s.temperature).toBeLessThan(6);
    expect(s.temperature).toBeGreaterThan(2.5);
  });

  it('a FREEZER ices itself up, and a furred coil never stops running', () => {
    const s = createFridge({ era: 'freezer', ambient: 20 });
    expect(s.frost).toBe(0);
    run(s, 300);
    expect(s.frost).toBeGreaterThan(0.02);

    // Two identical freezers, both left standing open long enough to fur up.
    const iced = createFridge({ era: 'freezer', ambient: 20, seed: 4 });
    const clean = createFridge({ era: 'freezer', ambient: 20, seed: 4 });
    for (const f of [iced, clean]) {
      f.door.set(true);
      run(f, 30);
      f.door.set(false);
      run(f, 3);
    }
    expect(iced.frost).toBeGreaterThan(0.5);
    clean.defrost();
    expect(clean.frost).toBe(0);

    // Frost does NOT stop a freezer freezing — that was the first version of
    // this test and it was measuring the wrong thing, because both of them
    // get there in the end. What it costs is time and current.
    const recover = (f: ColdStore): number => {
      let t = 0;
      while (t < 600 && f.temperature > -15) {
        f.update(1 / 60);
        t += 1 / 60;
      }
      return t;
    };
    expect(recover(iced), 'frost cost it nothing').toBeGreaterThan(recover(clean) * 1.5);

    const duty = (f: ColdStore): number => {
      let on = 0;
      for (let i = 0; i < 60 * 300; i++) {
        f.update(1 / 60);
        if (f.running) on += 1;
      }
      return on / (60 * 300);
    };
    expect(duty(iced)).toBeGreaterThan(duty(clean) * 1.5);
  });

  it('only the eras with a coil frost up', () => {
    for (const era of ['larder', 'icebox'] as ColdEra[]) {
      const s = createColdStore({ era });
      s.door.set(true);
      run(s, 200);
      expect(s.frost, era).toBe(0);
    }
  });
});

describe('spoilRate — the freshness clock', () => {
  it('is 1 on the bench and falls all the way down', () => {
    expect(spoilRate(20)).toBeCloseTo(1, 5);
    for (let t = 30; t > -25; t -= 1) {
      expect(spoilRate(t), `${t}`).toBeLessThan(spoilRate(t + 1));
    }
  });

  it('treats freezing as a PHASE CHANGE, not just colder', () => {
    // Q10 alone would make a freezer twelve times better than a worktop,
    // which is nonsense — frozen food keeps for a year.
    const q10Only = Math.pow(2, (-18 - 20) / 10);
    expect(spoilRate(-18)).toBeLessThan(q10Only * 0.2);
    expect(spoilRate(-18)).toBeLessThan(0.01);
    // And it is smooth across zero, so a fridge hovering there does not
    // flicker between two regimes.
    expect(Math.abs(spoilRate(0.05) - spoilRate(-0.05))).toBeLessThan(0.01);
  });

  it('ranks the eras the way history does', () => {
    const at = (era: ColdEra): number => {
      const s = createColdStore({ era, ambient: 20 });
      run(s, 400);
      const p = inside(s);
      return s.keepAt(p.x, p.y, p.z);
    };
    const bench = spoilRate(20);
    const larder = at('larder');
    const icebox = at('icebox');
    const fridge = at('fridge');
    const freezer = at('freezer');
    expect(larder).toBeLessThan(bench);
    expect(icebox).toBeLessThan(larder);
    expect(fridge).toBeLessThan(icebox);
    expect(freezer).toBeLessThan(fridge * 0.1);
  });
});

describe('createColdStore — the state machine', () => {
  it('runs the stove’s four states backwards', () => {
    const s = createFridge({ ambient: 20, cold: false });
    const seen: string[] = [];
    s.onState = (st) => seen.push(st);
    // Classified at construction, so it does not claim to be cold until
    // something has stepped it.
    expect(s.state).toBe('warm');
    expect(createFridge({ ambient: 20 }).state).toBe('cold');
    run(s, 120);
    expect(seen).toContain('chilling');
    expect(s.state).toBe('cold');
    s.door.set(true);
    run(s, 60);
    expect(seen).toContain('warming');
  });

  it('is a Prop with an obstacle and a place to stand', () => {
    for (const era of COLD_ERAS) {
      const s = createColdStore({ era });
      expect(s.obstacleRadius).toBeGreaterThan(0.2);
      expect(s.slots?.[0]).toBe(s.slot);
      expect(s.slot.approach).toBeDefined();
      // In front of it, out in the room, not inside the cabinet.
      expect(s.slot.anchor.position.z).toBeGreaterThan(0.3);
    }
  });
});
