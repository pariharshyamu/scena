import { describe, it, expect } from 'vitest';
import {
  AdditiveBlending,
  Box3,
  NormalBlending,
  Object3D,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import {
  createSteamPlant,
  expansionRatio,
  firesVisibleFrom,
  pressureFor,
  steamPerWork,
  tempFor,
  STEAM_KINDS,
  type SteamKind,
  type SteamPlant,
} from '../src';

const run = (p: SteamPlant, seconds: number, dt = 1 / 120): void => {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    p.stoke();
    p.update(dt);
  }
};

const materialOf = (root: Object3D): ShaderMaterial => {
  let found: ShaderMaterial | null = null;
  root.traverse((o) => {
    if ((o as Points).isPoints && !found) found = (o as Points).material as ShaderMaterial;
  });
  if (!found) throw new Error('no points material');
  return found;
};

const worldOf = (o: Object3D, root: Object3D): Vector3 => {
  root.updateMatrixWorld(true);
  return o.getWorldPosition(new Vector3());
};

describe('full ahead is not her fastest', () => {
  it.each(STEAM_KINDS)('%s: her best sustained speed is not at full gear', (kind: SteamKind) => {
    const row: Array<[number, number, number]> = [];
    for (const link of [1.0, 0.6, 0.45, 0.35, 0.25, 0.18, 0.12]) {
      const p = createSteamPlant({ kind });
      p.setDraught(1);
      p.setRegulator(1);
      p.setLink(link);
      p.settle(3 * 3600);
      row.push([link, p.way, p.pressure]);
    }
    const full = row[0];
    const best = row.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(
      best[0],
      `${kind}: full gear was her best, so the regulator is spending nothing`
    ).toBeLessThan(1.0);
    expect(best[1]).toBeGreaterThan(full[1] * 1.02);
    // And she is carrying more steam while doing it. That is the whole point:
    // it is not a speed trick, it is that the store stays full.
    expect(best[2]).toBeGreaterThan(full[2]);
  });

  it('the ship that opened her up is overtaken', () => {
    const opened = createSteamPlant({ kind: 'triple' });
    const linked = createSteamPlant({ kind: 'triple' });
    for (const p of [opened, linked]) {
      p.setDraught(1);
      p.setRegulator(1);
    }
    opened.setLink(1);
    linked.setLink(linked.linkFor(3600));
    let a = 0;
    let b = 0;
    let maxLead = 0;
    const STEP = 5;
    for (let t = 0; t < 2 * 3600; t += STEP) {
      opened.settle(STEP);
      linked.settle(STEP);
      a += opened.way * STEP;
      b += linked.way * STEP;
      maxLead = Math.max(maxLead, a - b);
    }
    expect(maxLead, 'the full-gear ship never got ahead at all').toBeGreaterThan(20);
    expect(b - a, 'and she was never caught').toBeGreaterThan(1000);
    expect(linked.pressure, 'both ships ended with the same steam').toBeGreaterThan(
      opened.pressure + 1
    );
  });

  it('she finds her own cruising speed, and there is no cruise constant', () => {
    const ends: Array<[number, number]> = [];
    for (const frac of [0.45, 0.75, 1.0]) {
      const p = createSteamPlant({ kind: 'compound', pressure: 7.0 * frac });
      p.setDraught(1);
      p.setRegulator(1);
      p.setLink(0.3);
      p.settle(5 * 3600);
      ends.push([p.way, p.pressure]);
    }
    for (const [way, bar] of ends) {
      expect(way).toBeCloseTo(ends[0][0], 1);
      expect(bar).toBeCloseTo(ends[0][1], 0);
    }
  });

  it('full ahead on a half-raised boiler is a burst of revs and then nothing', () => {
    const p = createSteamPlant({ kind: 'triple', pressure: 0 });
    p.setDraught(1);
    while (p.readiness < 0.45) p.settle(60);
    // Bank her, then open her right up: the store is all she has.
    p.bank();
    p.setRegulator(1);
    p.ahead(1);
    let peak = 0;
    let last = 0;
    let peakBar = 0;
    for (let i = 0; i < 2400; i++) {
      p.settle(1);
      peak = Math.max(peak, Math.abs(p.rev));
      peakBar = Math.max(peakBar, p.pressure);
      last = Math.abs(p.rev);
    }
    expect(peak).toBeGreaterThan(0);
    expect(last, 'she held her revs, so the store is not being spent').toBeLessThan(peak * 0.75);
    // The fire takes ten minutes to come down after you bank it, so she makes
    // a little more before she starts spending — and then she only spends.
    expect(p.pressure, 'the store never emptied').toBeLessThan(peakBar * 0.85);
  });

  it('the published rate is the one that was integrated', () => {
    for (const kind of STEAM_KINDS) {
      const p = createSteamPlant({ kind });
      p.setDraught(1);
      p.setRegulator(1);
      p.setLink(0.4);
      run(p, 30, 1 / 60);
      // …including while the link is travelling, which is where a dumped
      // term that forgot to divide by dt hides.
      p.setLink(-0.8);
      const before = p.temperature;
      const balance = (() => {
        p.update(1 / 60);
        return p.balance;
      })();
      const after = p.temperature;
      expect(after - before).toBeCloseTo(balance * (1 / 60), 6);
    }
  });
});

describe('the curve', () => {
  it('mid-gear makes no torque, and it is a limit not a wall', () => {
    const cuts = [0.5, 0.2, 0.1, 0.05, 0.02, 0.005];
    for (let i = 1; i < cuts.length; i++) {
      expect(expansionRatio(cuts[i])).toBeLessThan(expansionRatio(cuts[i - 1]));
      expect(expansionRatio(cuts[i])).toBeGreaterThan(0);
    }
    expect(expansionRatio(0)).toBe(0);
    expect(Number.isNaN(steamPerWork(0))).toBe(false);
    expect(steamPerWork(0)).toBe(Infinity);
  });

  it('linking up separates the two curves', () => {
    const full = 0.85;
    const linked = 0.25;
    expect(expansionRatio(linked) / expansionRatio(full)).toBeGreaterThan(0.5);
    expect(steamPerWork(linked) / steamPerWork(full)).toBeLessThan(0.55);
  });

  it('the gauge reads nothing at all below 100 °C, which is why she looks dead', () => {
    expect(pressureFor(20)).toBe(0);
    expect(pressureFor(99)).toBe(0);
    expect(pressureFor(101)).toBeGreaterThan(0);
    expect(pressureFor(tempFor(7.4))).toBeCloseTo(7.4, 6);
  });

  it.each(STEAM_KINDS)('%s: the needle sits on its stop while the funnel smokes', (kind: SteamKind) => {
    const p = createSteamPlant({ kind, pressure: 0 });
    p.setDraught(1);
    const notice = p.noticeFor(p.working);
    expect(Number.isFinite(notice)).toBe(true);
    let dead = 0;
    let t = 0;
    const STEP = notice / 400;
    while (t < notice * 1.4 && p.pressure < p.working) {
      p.settle(STEP);
      t += STEP;
      if (p.pressure === 0) dead += STEP;
    }
    // The needle has not stirred for a big fraction of a coal light-up while
    // the fire is roaring and the funnel is black — and a launch, which asks
    // nothing of anybody, gives you almost no warning at all.
    const share = dead / t;
    if (kind === 'launch') expect(share).toBeLessThan(0.32);
    else expect(share, `${kind}: the needle moved straight away`).toBeGreaterThan(0.32);
    expect(p.temperature).toBeGreaterThan(100);
  });

  it('noticeFor is the time it actually takes', () => {
    for (const kind of STEAM_KINDS) {
      const p = createSteamPlant({ kind, pressure: 0 });
      p.setDraught(1);
      const notice = p.noticeFor(p.working);
      p.settle(notice);
      const ratio = p.pressure / p.working;
      expect(ratio, `${kind}: notice and integrator disagree`).toBeGreaterThan(0.9);
      expect(ratio, `${kind}: notice and integrator disagree`).toBeLessThan(1.1);
    }
  });

  it('noticeFor is infinite exactly where reach says it is', () => {
    for (const kind of STEAM_KINDS) {
      // From cold, so she is BELOW what a banked fire can ever reach — ask
      // above it from above it and the honest answer is 0, not Infinity.
      const p = createSteamPlant({ kind, pressure: 0 });
      p.bank();
      p.settle(3600);
      const reach = p.reach;
      expect(reach).toBeGreaterThan(0);
      expect(p.noticeFor(reach + 0.5)).toBe(Infinity);
      expect(Number.isFinite(p.noticeFor(Math.max(0.05, reach - 0.5)))).toBe(true);
    }
  });

  it('reach is computed and not written down', () => {
    for (const kind of STEAM_KINDS) {
      const p = createSteamPlant({ kind });
      p.bank();
      p.settle(1800);
      const said = p.reach;
      // A banked boiler drifts down over DAYS — the time constant is the
      // lagging, and that is the point of banking. Keep coal in her while she
      // does it, or the number this measures is the size of her bunkers.
      for (let i = 0; i < 20; i++) {
        p.bunker();
        p.settle(10 * 3600);
      }
      // The early promise was made on a clean boiler and this is a fouled one:
      // 200 hours of firing lays down scale, `reach` knows about the scale she
      // HAS, and the two agree exactly at the end. A written-down table row
      // could not do that, which is the whole point.
      expect(
        Math.abs(p.pressure - p.reach) / p.reach,
        `${kind}: the banked hold is not the equilibrium`
      ).toBeLessThan(0.03);
      expect(Math.abs(p.pressure - said) / said, `${kind}: reach was nowhere near`).toBeLessThan(
        0.12
      );
      expect(p.scale, `${kind}: 200 hours of firing left her clean`).toBeGreaterThan(0);
    }
  });

  it.each(STEAM_KINDS)('%s: she takes longer to go cold than she took to light', (kind: SteamKind) => {
    const cold = createSteamPlant({ kind, pressure: 0 });
    cold.setDraught(1);
    const light = cold.noticeFor(cold.working);

    const hot = createSteamPlant({ kind });
    hot.setDraught(0);
    let t = 0;
    while (t < 96 * 3600 && hot.pressure > hot.low) {
      hot.settle(60);
      t += 60;
    }
    expect(t, `${kind}: she cools faster than she heats, with no fire under her`).toBeGreaterThan(
      light
    );
  });
});

describe('the machine, in world space', () => {
  /** Track a named subtree's world-space extent over a revolution. */
  const sweepY = (p: SteamPlant, pick: (o: Object3D) => boolean, revs = 1): number => {
    const box = new Box3();
    const found: Object3D[] = [];
    p.object.traverse((o) => {
      if (pick(o)) found.push(o);
    });
    expect(found.length).toBeGreaterThan(0);
    const steps = 240 * revs;
    for (let i = 0; i <= steps; i++) {
      p.update(1 / 240);
      p.object.updateMatrixWorld(true);
      for (const o of found) box.expandByPoint(o.getWorldPosition(new Vector3()));
    }
    return box.max.y - box.min.y;
  };

  it.each(STEAM_KINDS)('%s: the crosshead travels exactly one stroke', (kind: SteamKind) => {
    const strokes: Record<SteamKind, number> = {
      sidelever: 1.68,
      compound: 0.6,
      triple: 0.99,
      launch: 0.2,
    };
    const p = createSteamPlant({ kind });
    p.setDraught(1);
    p.setRegulator(1);
    p.setLink(1);
    // Get her turning first: a stationary crosshead sweeps nothing and would
    // pass a test written as "no more than one stroke".
    run(p, 60, 1 / 60);
    const travel = sweepY(p, (o) => o.name === 'crosshead', 2);
    expect(travel, `${kind}: crosshead travel is not the stroke`).toBeCloseTo(strokes[kind], 2);
  });

  it('the connecting rod closes, over the whole revolution', () => {
    for (const kind of STEAM_KINDS) {
      const p = createSteamPlant({ kind });
      p.setDraught(1);
      p.setRegulator(1);
      p.setLink(1);
      run(p, 60, 1 / 60);
      const heads: Object3D[] = [];
      const pins: Object3D[] = [];
      p.object.traverse((o) => {
        if (o.name === 'crosshead') heads.push(o);
        if (o.name === 'crankpin') pins.push(o);
      });
      expect(heads.length).toBe(pins.length);
      const seen: number[] = [];
      for (let i = 0; i < 180; i++) {
        p.update(1 / 240);
        p.object.updateMatrixWorld(true);
        seen.push(worldOf(heads[0], p.object).distanceTo(worldOf(pins[0], p.object)));
      }
      const lo = Math.min(...seen);
      const hi = Math.max(...seen);
      expect(hi - lo, `${kind}: the connecting rod stretches by ${(hi - lo).toFixed(3)} m`).toBeLessThan(
        0.004
      );
    }
  });

  it('the die block is in the middle of the link when she makes no torque', () => {
    const p = createSteamPlant({ kind: 'triple' });
    p.setDraught(1);
    p.setRegulator(1);
    const die = p.object.getObjectByName('dieBlock');
    expect(die).toBeTruthy();
    const rows: Array<{ link: number; y: number; tq: number }> = [];
    for (let i = 0; i <= 20; i++) {
      const link = 1 - (i / 20) * 2;
      const q = createSteamPlant({ kind: 'triple' });
      q.setDraught(1);
      q.setRegulator(1);
      q.setLink(link);
      run(q, 20, 1 / 60);
      const d = q.object.getObjectByName('dieBlock')!;
      q.object.updateMatrixWorld(true);
      rows.push({ link, y: d.position.y, tq: Math.abs(q.torque) });
    }
    const flattestGeometry = rows.reduce((a, b) => (Math.abs(b.y) < Math.abs(a.y) ? b : a));
    const flattestTorque = rows.reduce((a, b) => (b.tq < a.tq ? b : a));
    // If these two disagree, one of the geometry and the physics is decoration.
    expect(flattestGeometry.link).toBeCloseTo(flattestTorque.link, 1);
    expect(Math.abs(flattestGeometry.y)).toBeLessThan(0.01);
  });

  it.each(STEAM_KINDS)('%s: she stops on dead centre iff she has one cylinder', (kind: SteamKind) => {
    const stuck: number[] = [];
    for (let i = 0; i < 36; i++) {
      const at = (i / 36) * Math.PI * 2;
      const p = createSteamPlant({ kind, crank: at });
      p.setDraught(1);
      p.setRegulator(1);
      p.setLink(1);
      const pin = p.object.getObjectByName('crankpin')!;
      const was = worldOf(pin, p.object).clone();
      run(p, 20, 1 / 60);
      const now = worldOf(pin, p.object);
      // An rpm of zero also passes on a plant that never got steam, so the
      // claim is about the crankpin not having MOVED.
      if (Math.abs(p.rev) < 0.01 && now.distanceTo(was) < 0.001) stuck.push(i);
    }
    if (kind === 'launch') {
      expect(stuck.length, 'a single-cylinder engine that cannot stall').toBeGreaterThan(0);
    } else {
      expect(stuck.length, `${kind}: a multi-cylinder engine stalled on centre`).toBe(0);
    }
  });

  it('a stalled launch goes as soon as you bar her over', () => {
    const p = createSteamPlant({ kind: 'launch', crank: 0 });
    p.setDraught(1);
    p.setRegulator(1);
    p.setLink(1);
    run(p, 15, 1 / 60);
    expect(p.onCentre, 'a single cylinder parked on centre started itself').toBe(true);
    p.barOver();
    run(p, 5, 1 / 60);
    expect(Math.abs(p.rev), 'barring her over did nothing').toBeGreaterThan(0.05);
    expect(p.onCentre).toBe(false);
  });

  it('the torque ripple is one cylinder and smooth is three', () => {
    const ripple = (kind: SteamKind): number => {
      const p = createSteamPlant({ kind });
      p.setDraught(1);
      p.setRegulator(1);
      p.setLink(0.6);
      run(p, 90, 1 / 60);
      let peak = 0;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < 600; i++) {
        p.update(1 / 240);
        const t = Math.abs(p.torque);
        peak = Math.max(peak, t);
        sum += t;
        n++;
      }
      return peak / (sum / n);
    };
    expect(ripple('launch')).toBeGreaterThan(1.4);
    expect(ripple('triple')).toBeLessThan(1.25);
  });
});

describe('the fire, the funnel and the valve', () => {
  it('the fire and the pressure are different numbers, and the funnel reads the fire', () => {
    const p = createSteamPlant({ kind: 'triple' });
    p.setDraught(1);
    p.setRegulator(1);
    p.setLink(1);
    run(p, 240, 1 / 30);
    let sawFallingWhileRoaring = false;
    let bar = p.pressure;
    for (let i = 0; i < 600; i++) {
      run(p, 1, 1 / 30);
      if (p.firing > 0.9 && p.pressure < bar) sawFallingWhileRoaring = true;
      bar = p.pressure;
    }
    expect(
      sawFallingWhileRoaring,
      'the fire flat out and the needle falling never happened, so raised and engine are one term'
    ).toBe(true);
    // And the plume follows the fire, not the boiler: shut her in and the
    // pressure climbs while the smoke does not change.
    const smokeWas = p.plumes[0].rate;
    const barWas = p.pressure;
    p.setRegulator(0);
    run(p, 240, 1 / 30);
    expect(p.pressure).toBeGreaterThan(barWas);
    expect(p.plumes[0].rate).toBeCloseTo(smokeWas, 1);
  });

  it('the black plume is a stoke, not a throttle', () => {
    const p = createSteamPlant({ kind: 'compound' });
    p.setDraught(1);
    run(p, 300, 1 / 30);
    // A steady fire makes soot and not grease — once the last shovelful has
    // finished smoking, which takes a minute and a half.
    for (let i = 0; i < 300 * 30; i++) p.update(1 / 30);
    expect(p.plumes[1].rate).toBeLessThan(0.1);
    p.stoke();
    for (let i = 0; i < 90; i++) p.update(1 / 30);
    expect(p.plumes[1].rate, 'a fresh shovelful made no black smoke').toBeGreaterThan(0.4);
  });

  it('a launch does not show', () => {
    const p = createSteamPlant({ kind: 'launch', pressure: 0 });
    p.setDraught(1);
    for (let i = 0; i < 60; i++) {
      // …and stoking her is a silent no-op, which IS the era axis.
      p.stoke();
      run(p, 20, 1 / 30);
      expect(p.plumes[1].rate).toBeLessThan(0.05);
    }
    expect(p.bed).toBe(1);
  });

  it('the plumes are the colours they claim, and the feather is the one that is not', () => {
    const p = createSteamPlant({ kind: 'triple' });
    const soot = materialOf(p.plumes[0].object);
    const grease = materialOf(p.plumes[1].object);
    const feather = materialOf(p.feather.object);
    // Additive can only ADD light: near-black funnel smoke drawn that way is
    // invisible while `rate` reads perfectly.
    expect(soot.blending).toBe(NormalBlending);
    expect(grease.blending).toBe(NormalBlending);
    expect(feather.blending).toBe(AdditiveBlending);
    const a = soot.uniforms.uColour.value;
    const b = grease.uniforms.uColour.value;
    expect(a.equals(b), 'the two plumes are the same colour, so style is only a label').toBe(false);
  });

  it('the plumes are stepped exactly once', () => {
    const solo = createSteamPlant({ kind: 'triple', seed: 4 });
    const handed = createSteamPlant({ kind: 'triple', seed: 4 });
    expect(solo.stepsPlumes).toBe(true);
    const layer = {
      added: [] as Array<{ update(dt: number): void }>,
      add(s: { update(dt: number): void }) {
        this.added.push(s);
      },
    };
    handed.plumesInto(layer as never);
    expect(handed.stepsPlumes).toBe(false);
    expect(layer.added.length).toBe(2);
    for (const p of [solo, handed]) {
      p.setDraught(1);
    }
    for (let i = 0; i < 120; i++) {
      solo.update(1 / 60);
      handed.update(1 / 60);
      // The layer is what steps them now, exactly as SmokeLayer.update would.
      for (const s of layer.added) s.update(1 / 60);
    }
    expect(handed.plumes[0].rate).toBeCloseTo(solo.plumes[0].rate, 5);
  });

  it('the safety valve lifts and sits, and the cap is an object not a clamp', () => {
    for (const kind of STEAM_KINDS) {
      const p = createSteamPlant({ kind });
      p.setDraught(1);
      let lifts = 0;
      let was = false;
      let shortest = Infinity;
      let cur = 0;
      for (let i = 0; i < 2 * 3600 * 5; i++) {
        p.stoke();
        p.update(0.2);
        if (p.blowing) cur += 0.2;
        else if (was) {
          shortest = Math.min(shortest, cur);
          cur = 0;
        }
        if (p.blowing && !was) lifts++;
        was = p.blowing;
      }
      expect(lifts, `${kind}: the valve never lifted`).toBeGreaterThanOrEqual(4);
      expect(shortest, `${kind}: the valve chattered`).toBeGreaterThan(3);
    }
    // Wire it shut and she goes straight past the red line and keeps climbing.
    const shut = createSteamPlant({ kind: 'triple', reliefArea: 0 });
    shut.setDraught(1);
    for (let i = 0; i < 4 * 3600; i++) {
      shut.stoke();
      shut.settle(1);
    }
    expect(shut.pressure, 'a Math.min would have parked her on blowOff').toBeGreaterThan(
      shut.blowOff + 3
    );
  });

  it('a banked fire still costs coal and still holds her', () => {
    for (const kind of STEAM_KINDS) {
      const p = createSteamPlant({ kind });
      p.bank();
      const fuelWas = p.fuel;
      p.settle(8 * 3600);
      expect(p.readiness, `${kind}: a banked boiler went cold`).toBeGreaterThan(0.3);
      expect(p.fuel, `${kind}: banking her was free`).toBeLessThan(fuelWas);
    }
  });

  it('stoking costs her steam', () => {
    const p = createSteamPlant({ kind: 'triple' });
    p.setDraught(1);
    run(p, 600, 1 / 30);
    const shut = p.balance;
    p.fireDoor.set(true);
    run(p, 60, 1 / 30);
    expect(p.fireDoor.open).toBe(true);
    expect(p.balance, 'opening the fire door was free').toBeLessThan(shut);
    p.fireDoor.set(false);
    run(p, 120, 1 / 30);
    expect(p.balance).toBeGreaterThan(p.balance - 1e-9);
  });
});

describe('the era axis', () => {
  it('a sidelever is governed by her regulator and a triple by her gear', () => {
    const best = (kind: SteamKind, what: 'link' | 'reg'): number => {
      let top = 0;
      for (const v of [1.0, 0.7, 0.5, 0.35, 0.25, 0.18, 0.12]) {
        const p = createSteamPlant({ kind });
        p.setDraught(1);
        p.setRegulator(what === 'reg' ? v : 1);
        p.setLink(what === 'link' ? v : 1);
        p.settle(3 * 3600);
        top = Math.max(top, p.way);
      }
      return top;
    };
    const fullOf = (kind: SteamKind): number => {
      const p = createSteamPlant({ kind });
      p.setDraught(1);
      p.setRegulator(1);
      p.setLink(1);
      p.settle(3 * 3600);
      return p.way;
    };
    const tripleFull = fullOf('triple');
    const sideFull = fullOf('sidelever');
    const tripleGear = best('triple', 'link') / tripleFull - 1;
    const sideGear = best('sidelever', 'link') / sideFull - 1;
    // gearShape is the column that decides this. Harmonise it toward 1.0
    // across the kinds "for tidiness" and the sidelever becomes a slow triple.
    expect(tripleGear, 'the triple gained nothing from being notched up').toBeGreaterThan(0.15);
    expect(sideGear, 'the sidelever behaves like a triple').toBeLessThan(tripleGear / 2);
  });

  it('notice spans the whole era axis, and the big boilers are the slow ones', () => {
    const notice: Record<string, number> = {};
    for (const kind of STEAM_KINDS) {
      const p = createSteamPlant({ kind, pressure: 0 });
      p.setDraught(1);
      notice[kind] = p.noticeFor(p.working);
    }
    // The same water and iron that makes a triple slow to raise makes her slow
    // to go cold — which is why ships banked their fires rather than draw them.
    expect(notice.triple).toBeGreaterThan(notice.compound);
    expect(notice.compound).toBeGreaterThan(notice.sidelever);
    expect(notice.sidelever).toBeGreaterThan(notice.launch);
    expect(notice.triple / notice.launch).toBeGreaterThan(20);
  });

  it('shutting her in before you reverse costs nothing, and not doing it costs steam', () => {
    const careful = createSteamPlant({ kind: 'triple' });
    const careless = createSteamPlant({ kind: 'triple' });
    for (const p of [careful, careless]) {
      p.setDraught(1);
      p.setRegulator(1);
      p.setLink(1);
      run(p, 300, 1 / 60);
    }
    careful.setRegulator(0);
    careful.astern(1);
    run(careful, 30, 1 / 60);
    careful.setRegulator(1);
    run(careful, 60, 1 / 60);

    careless.astern(1);
    run(careless, 90, 1 / 60);

    expect(
      careful.pressure - careless.pressure,
      'swinging the reverser under steam was free'
    ).toBeGreaterThan(0.15);
    // …and she took longer to get the link across, because it travels heavier.
    expect(Math.abs(careless.link)).toBeLessThanOrEqual(Math.abs(careful.link) + 1e-9);
  });

  it('the screw races when she lifts it', () => {
    const p = createSteamPlant({ kind: 'triple' });
    p.setDraught(1);
    p.setRegulator(1);
    p.setLink(0.5);
    run(p, 600, 1 / 60);
    const revWas = Math.abs(p.rev);
    const thrustWas = Math.abs(p.thrust);
    p.setImmersion(0.15);
    run(p, 20, 1 / 60);
    expect(Math.abs(p.rev) / revWas, 'she did not race').toBeGreaterThan(1.4);
    expect(Math.abs(p.thrust)).toBeLessThan(thrustWas * 0.7);
  });

  it('she walks her stern to port going astern and barely at all ahead', () => {
    const p = createSteamPlant({ kind: 'triple' });
    p.setDraught(1);
    p.setRegulator(1);
    p.setLink(1);
    run(p, 400, 1 / 60);
    const ahead = Math.hypot(p.walk.x, p.walk.z);
    p.astern(1);
    run(p, 400, 1 / 60);
    const astern = Math.hypot(p.walk.x, p.walk.z);
    expect(astern).toBeGreaterThan(ahead * 2);
    // A walk computed in the hull frame and never rotated passes at heading 0
    // and is wrong everywhere else.
    const before = { x: p.walk.x, z: p.walk.z };
    p.object.rotation.y = Math.PI / 2;
    p.object.updateMatrixWorld(true);
    run(p, 1, 1 / 60);
    expect(
      Math.abs(p.walk.z - before.z) + Math.abs(p.walk.x - before.x),
      'the walk did not follow her heading'
    ).toBeGreaterThan(Math.abs(before.x) * 0.5);
  });
});

describe('numerics, structure and the shape of the thing', () => {
  it.each(STEAM_KINDS)('%s: a huge dt lands where the small ones did', (kind: SteamKind) => {
    const fine = createSteamPlant({ kind, seed: 3 });
    const coarse = createSteamPlant({ kind, seed: 3 });
    for (const p of [fine, coarse]) {
      p.setDraught(1);
      p.setRegulator(1);
      p.setLink(0.5);
    }
    for (let i = 0; i < 900 * 50; i++) {
      fine.stoke();
      fine.update(0.02);
    }
    for (let i = 0; i < 225; i++) {
      coarse.stoke();
      coarse.update(4.0);
    }
    expect(Number.isNaN(coarse.pressure)).toBe(false);
    expect(coarse.temperature).toBeGreaterThan(-273);
    expect(coarse.pressure).toBeCloseTo(fine.pressure, 0);
  });

  it('she never lies before her first step', () => {
    expect(createSteamPlant({ pressure: 0 }).state).toBe('cold');
    expect(createSteamPlant().state).toBe('up');
    const p = createSteamPlant({ pressure: 0 });
    p.setDraught(1);
    p.update(1 / 60);
    expect(p.state, 'the fire is lit and she still says cold').toBe('raising');
  });

  it("'falling' is reachable at full pressure with the fire roaring", () => {
    const p = createSteamPlant({ kind: 'triple' });
    const seen: string[] = [];
    p.onState = (s) => seen.push(s);
    p.setDraught(1);
    p.setRegulator(1);
    p.setLink(1);
    run(p, 900, 1 / 30);
    expect(seen).toContain('falling');
    expect(p.firing).toBeGreaterThan(0.9);
  });

  it('a plant sitting at its equilibrium does not chatter', () => {
    const p = createSteamPlant({ kind: 'compound' });
    p.setDraught(1);
    p.setRegulator(1);
    p.setLink(0.3);
    run(p, 3600, 1 / 20);
    let flips = 0;
    p.onState = () => flips++;
    run(p, 1800, 1 / 20);
    expect(flips).toBeLessThan(6);
  });

  it('linkFor hands back a setting she will actually keep', () => {
    for (const kind of STEAM_KINDS) {
      const p = createSteamPlant({ kind });
      p.setDraught(1);
      p.setRegulator(1);
      const gear = p.linkFor(2 * 3600);
      expect(Math.abs(gear)).toBeLessThanOrEqual(1);
      if (gear === 0) continue;
      p.setLink(gear);
      p.settle(2 * 3600);
      expect(p.pressure, `${kind}: linkFor promised a gear she could not hold`).toBeGreaterThan(
        p.low * 0.95
      );
    }
  });

  it('endurance and holdsFor are the same integrator', () => {
    const p = createSteamPlant({ kind: 'compound' });
    p.setDraught(0.2);
    p.setRegulator(1);
    p.setLink(0.5);
    expect(p.endurance).toBe(p.holdsFor(p.low));
  });

  it('the boiler is a hole, and you can see the fire through the door', () => {
    const p = createSteamPlant({ kind: 'triple' });
    p.setDraught(1);
    p.fireDoor.set(true);
    run(p, 5, 1 / 30);
    expect(firesVisibleFrom(p), 'the firebox is a closed drum').toBe(true);
  });

  it('has the shape every other prop in this library has', () => {
    const p = createSteamPlant({ kind: 'triple' });
    expect(p.obstacleRadius).toBe(0);
    expect(p.slots).toEqual([p.stokehold, p.platform]);
    expect(p.stokehold.approach).toBeTruthy();
    expect(p.plumes.length).toBe(2);
    expect(p.gauge.object.parent).toBeTruthy();
    let inside = false;
    p.object.traverse((o) => {
      if (o === p.gauge.object) inside = true;
    });
    expect(inside, 'the gauge is not in the plant').toBe(true);
    expect(p.funnelTop.parent).toBeTruthy();
  });

  it('settle emits endpoints only, and says so', () => {
    const p = createSteamPlant({ kind: 'triple', pressure: 0 });
    const seen: string[] = [];
    p.onState = (s) => seen.push(s);
    p.setDraught(1);
    p.settle(12 * 3600);
    // A twelve-hour light-up passes through 'raising' and lands on 'up'; a
    // fast-forward reports where it landed and not the road.
    expect(seen.length).toBeLessThanOrEqual(2);
    // She is at her working pressure and STILL raising — the fire is flat out
    // and heading for the safety valve. 'up' is about the balance, not the
    // needle.
    expect(p.pressure).toBeGreaterThanOrEqual(p.working);
    expect(p.state).toBe('raising');
  });

  it('survives being handed nonsense', () => {
    const p = createSteamPlant({ kind: 'launch' });
    p.update(0);
    p.update(-1);
    p.settle(0);
    p.setDraught(9);
    expect(p.draught).toBe(1);
    p.setDraught(-3);
    expect(p.draught).toBe(0);
    p.setLink(12);
    expect(p.linkOrder).toBe(1);
    p.setImmersion(-1);
    expect(p.immersion).toBe(0);
    expect(Number.isFinite(p.pressure)).toBe(true);
  });
});
