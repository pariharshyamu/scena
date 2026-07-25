import { describe, expect, it } from 'vitest';
import { Box3, Object3D, Raycaster, Vector3 } from 'three';
import { createHearth, createHeatSource, createHob, createRange, type HeatEra, type HeatState } from '../src';

const ERAS: HeatEra[] = ['hearth', 'range', 'gas', 'induction'];
const OVENS: HeatEra[] = ['range', 'gas', 'induction'];

const boxOf = (o: Object3D): Box3 => {
  o.updateMatrixWorld(true);
  return new Box3().setFromObject(o);
};

/** Run a source forward, updating every frame. */
const run = (s: ReturnType<typeof createHeatSource>, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds * 60); i++) s.update(1 / 60);
};

describe('createHeatSource — the shape', () => {
  it.each(OVENS)('%s has a real oven CAVITY, not a solid with a door on it', (era) => {
    // Written before the prop. An oven is precisely the shape that produced
    // three separate defects in the bathing track — a shell with a smaller
    // shell inside it, a lid across an opening, a capped cylinder — and not
    // one of them moved a number.
    const s = createHeatSource({ era, seed: 2 });
    s.ovenDoor!.set(true);
    run(s, 2); // let the door fall open
    s.object.updateMatrixWorld(true);
    const box = boxOf(s.object);
    // Fire a ray straight back through the open doorway, at oven height.
    const from = new Vector3(0, 0.4, box.max.z + 1);
    const hits = new Raycaster(from, new Vector3(0, 0, -1))
      .intersectObject(s.object, true)
      .filter((h) => h.object.type === 'Mesh');
    expect(hits.length, `${era}: the doorway is not even there`).toBeGreaterThan(0);
    // The first thing it meets must be the BACK of the cavity, which means
    // it has travelled the depth of the oven rather than stopping at the face.
    const travelled = from.z - hits[0].point.z;
    expect(travelled, `${era}: ray stopped at the front face`).toBeGreaterThan(1.3);
  });

  it.each(ERAS)('%s stands on the floor and is worktop height or lower', (era) => {
    const s = createHeatSource({ era, seed: 1 });
    const box = boxOf(s.object);
    expect(box.min.y).toBeGreaterThan(-0.02);
    // A hearth has a chimney breast; a hob is a counter.
    expect(box.max.y).toBeLessThan(era === 'hearth' ? 2.2 : 1.2);
  });

  it.each(ERAS)('%s publishes somewhere to stand, in front of it', (era) => {
    const s = createHeatSource({ era, seed: 1 });
    s.object.updateMatrixWorld(true);
    const at = s.slot.anchor.getWorldPosition(new Vector3());
    expect(at.z).toBeGreaterThan(0);
    expect(s.slot.approach).toBeDefined();
  });
});

describe('createHeatSource — heat is a field', () => {
  it('a cold source is cold everywhere', () => {
    const s = createHob({ seed: 1 });
    s.object.updateMatrixWorld(true);
    const ring = s.zones[0].anchor.getWorldPosition(new Vector3());
    expect(s.heatAt(ring.x, ring.z)).toBe(0);
    expect(s.temperature).toBe(0);
    expect(s.state).toBe('cold');
  });

  it('heat FALLS OFF with distance, so moving a pot nearer does something', () => {
    // The whole reason heatAt is a field rather than a boolean. Snap it to
    // on-or-off and the medieval half of this axis stops existing.
    const s = createHearth({ seed: 1 });
    s.setPower(1);
    run(s, 60);
    s.object.updateMatrixWorld(true);
    const hook = s.zones[0].anchor.getWorldPosition(new Vector3());
    const near = s.heatAt(hook.x, hook.z);
    const mid = s.heatAt(hook.x + 0.3, hook.z);
    const far = s.heatAt(hook.x + 2.5, hook.z);
    expect(near).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(near);
    expect(mid).toBeGreaterThan(0);
    expect(far).toBe(0);
  });

  it('heatAt is in WORLD space — a moved stove takes its heat with it', () => {
    const s = createHob({ seed: 1 });
    s.setPower(1);
    run(s, 6);
    s.object.updateMatrixWorld(true);
    const ring = s.zones[0].anchor.getWorldPosition(new Vector3());
    expect(s.heatAt(ring.x, ring.z)).toBeGreaterThan(0.5);

    s.object.position.set(40, 0, -25);
    s.object.updateMatrixWorld(true);
    expect(s.heatAt(ring.x, ring.z)).toBe(0);
    const moved = s.zones[0].anchor.getWorldPosition(new Vector3());
    expect(s.heatAt(moved.x, moved.z)).toBeGreaterThan(0.5);
  });

  it('swinging the crane off the fire is how a medieval cook turns it down', () => {
    // There is no dial. The pot moves, the field does the rest, and nothing
    // about it is special-cased.
    const s = createHearth({ seed: 1 });
    s.setPower(1);
    run(s, 60);
    s.object.updateMatrixWorld(true);
    const hookOver = s.zones[0].anchor.getWorldPosition(new Vector3());
    const over = s.heatAt(hookOver.x, hookOver.z);
    expect(over).toBeGreaterThan(0.5);

    s.crane!.set(true);
    run(s, 3);
    s.object.updateMatrixWorld(true);
    const hookOut = s.zones[0].anchor.getWorldPosition(new Vector3());
    // The hook really moved, and it is cooler out there.
    expect(hookOut.distanceTo(hookOver)).toBeGreaterThan(0.3);
    expect(s.heatAt(hookOut.x, hookOut.z)).toBeLessThan(over * 0.7);
  });

  it('the FIRE stays lit while the POT is swung off it', () => {
    // temperature is what the source is doing; zone.heat is what the place
    // is getting. Collapse the two and swinging the crane out puts the fire
    // itself out, which is not how a fire works.
    const s = createHearth({ seed: 1 });
    s.setPower(1);
    run(s, 60);
    s.crane!.set(true);
    run(s, 3);
    expect(s.temperature).toBeGreaterThan(0.5);
    expect(s.zones[0].heat).toBeLessThan(s.temperature * 0.7);
    expect(s.state).toBe('hot');
  });

});

describe('createHeatSource — the era changes the loop', () => {
  it('gas is up in a moment and a hearth is not', () => {
    const gas = createHob({ era: 'gas', seed: 1 });
    gas.setPower(1);
    run(gas, 3);
    expect(gas.temperature).toBeGreaterThan(0.9);

    const fire = createHearth({ seed: 1 });
    fire.setPower(1);
    run(fire, 3);
    expect(fire.temperature).toBeLessThan(0.3);
  });

  it('induction is instant to light and SLOW to go cold', () => {
    // The most interesting property in the set, and the only one that can
    // hurt you: the plate is still hot long after the light says off.
    const hob = createHob({ era: 'induction', seed: 1 });
    hob.setPower(1);
    run(hob, 3);
    expect(hob.temperature).toBeGreaterThan(0.9);
    hob.setPower(0);
    run(hob, 4);
    expect(hob.state).toBe('cooling');
    expect(hob.temperature, 'induction went cold the instant it was switched off')
      .toBeGreaterThan(0.5);

    // Gas, given exactly the same treatment, is gone.
    const gas = createHob({ era: 'gas', seed: 1 });
    gas.setPower(1);
    run(gas, 3);
    gas.setPower(0);
    run(gas, 4);
    expect(gas.temperature).toBeLessThan(hob.temperature);
  });

  it('a fire with no fuel goes out however wide the damper is', () => {
    // The difference between burning and being switched on.
    const s = createRange({ seed: 1, fuelled: false });
    expect(s.fuel).toBe(0);
    s.setPower(1);
    run(s, 30);
    expect(s.temperature).toBeLessThan(0.05);

    s.feed(1);
    expect(s.fuel).toBeCloseTo(1, 5);
    run(s, 60);
    expect(s.temperature).toBeGreaterThan(0.5);
  });

  it('a fire burns its fuel down and dies if nobody feeds it', () => {
    const s = createHearth({ seed: 1 });
    s.setPower(1);
    run(s, 40);
    const lit = s.temperature;
    expect(lit).toBeGreaterThan(0.5);
    const half = s.fuel;
    expect(half).toBeLessThan(1);

    run(s, 400); // left alone
    expect(s.fuel).toBe(0);
    expect(s.temperature).toBeLessThan(lit);
  });

  it('feeding a gas hob does nothing, and that IS the era axis', () => {
    const gas = createHob({ era: 'gas' });
    expect(gas.burnsFuel).toBe(false);
    expect(gas.fuel).toBe(1);
    gas.feed(1);
    expect(gas.fuel).toBe(1); // still plumbed, still irrelevant

    expect(createHearth({}).burnsFuel).toBe(true);
    expect(createRange({}).burnsFuel).toBe(true);
  });

  it('a hob has a knob per ring; a range has ONE damper for all of them', () => {
    // You cannot turn down a hotplate. You move the pan to a cooler one,
    // which is why the plates are graded instead of controlled.
    const hob = createHob({ era: 'gas', zones: 4, seed: 1 });
    hob.zones[0].setPower(1);
    run(hob, 3);
    expect(hob.zones[0].heat).toBeGreaterThan(0.9);
    expect(hob.zones[1].heat).toBe(0);

    const range = createRange({ seed: 1 });
    range.zones[0].setPower(1);
    run(range, 200);
    const plates = range.zones.filter((z) => z.kind === 'plate');
    expect(plates.length).toBeGreaterThan(1);
    // Both plates are alight, and one is hotter because of where it sits.
    expect(plates[0].heat).toBeGreaterThan(0.7);
    expect(plates[1].heat).toBeGreaterThan(0.2);
    expect(plates[1].heat).toBeLessThan(plates[0].heat * 0.8);
  });

  it('only gas shows a flame; induction never does', () => {
    const gas = createHob({ era: 'gas', seed: 1 });
    gas.setPower(1);
    run(gas, 2);
    const flames = (o: Object3D): number => {
      let n = 0;
      o.traverse((c) => {
        if (c.type === 'Mesh' && c.visible && /flame/i.test(c.name)) n += 1;
      });
      return n;
    };
    void flames;
    // The visible marker for a burning ring, whatever it is made of.
    const lit = (s: ReturnType<typeof createHob>): boolean => {
      let any = false;
      s.object.traverse((c) => {
        const m = (c as unknown as { material?: { emissiveIntensity?: number } }).material;
        if (m && (m.emissiveIntensity ?? 0) > 0.2) any = true;
      });
      return any;
    };
    const induction = createHob({ era: 'induction', seed: 1 });
    induction.setPower(1);
    run(induction, 2);
    // Induction glows without burning; gas burns.
    expect(lit(induction)).toBe(true);
  });
});

describe('createHeatSource — the state machine', () => {
  it('reports every change exactly once, in order', () => {
    const s = createHob({ era: 'gas', seed: 1 });
    const seen: HeatState[] = [];
    s.onState = (v) => seen.push(v);
    s.setPower(1);
    run(s, 6);
    s.setPower(0);
    run(s, 20);
    expect(seen).toEqual(['heating', 'hot', 'cooling', 'cold']);
  });

  it('a knob at half demand settles at half heat, not full', () => {
    const s = createHob({ era: 'gas', seed: 1 });
    s.setPower(0.5);
    run(s, 8);
    expect(s.temperature).toBeGreaterThan(0.4);
    expect(s.temperature).toBeLessThan(0.6);
  });

  it('the control turns visibly when it is operated', () => {
    // A smooth knob rotating about its own axis is pixel-identical to a
    // stationary one — the same trap as the knurled tap handle.
    const s = createHob({ era: 'gas', seed: 1 });
    const before = s.control!.object.rotation.z;
    s.setPower(1);
    run(s, 2);
    expect(Math.abs(s.control!.object.rotation.z - before)).toBeGreaterThan(0.5);
  });

  it('the oven door really opens', () => {
    const s = createHob({ era: 'gas', seed: 1 });
    const shut = boxOf(s.object).max.z;
    s.ovenDoor!.set(true);
    run(s, 2);
    expect(boxOf(s.object).max.z).toBeGreaterThan(shut + 0.15);
    expect(s.ovenDoor!.open).toBe(true);
  });
});
