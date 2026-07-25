import { describe, expect, it } from 'vitest';
import { Box3, Object3D } from 'three';
import { createWashUp, createDishwasher, createKitchenSink, SINK_ERAS } from '../src';
import type { SinkEra, WashUp } from '../src';

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

const run = (s: WashUp, seconds: number, working = true, dt = 1 / 60): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) s.update(dt, working);
};

/** A sink with a full bowl of fresh hot water, ready to go. */
const ready = (era: SinkEra, dirty = 10): WashUp => {
  const s = createWashUp({ era, dirty, seed: 2 });
  s.fill(1, 1);
  return s;
};

const HAND: SinkEra[] = ['trough', 'scullery', 'sink'];

describe('createWashUp — the shape of it', () => {
  it.each(SINK_ERAS)('%s stands on the floor at working height', (era) => {
    const box = boxOf(createWashUp({ era }).object);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.max.y).toBeLessThan(1.3);
    expect(box.max.y).toBeGreaterThan(0.7);
  });

  it.each(SINK_ERAS)('%s is a WorkStation, so the Track C machinery just works', (era) => {
    const s = createWashUp({ era });
    expect(typeof s.action).toBe('string');
    expect(s.tool).toBeDefined();
    expect(s.slots?.[0]).toBe(s.slot);
    expect(s.slot.approach).toBeDefined();
    expect(s.slot.loop).toBe(s.action);
  });

  it.each(SINK_ERAS)('%s holds a bounded queue and will not take more', (era) => {
    const s = createWashUp({ era });
    expect(s.dirty).toBe(0);
    expect(s.load(3)).toBe(3);
    expect(s.dirty).toBe(3);
    // Overfilling returns what it actually took, rather than silently
    // swallowing the rest.
    const took = s.load(9999);
    expect(took).toBe(s.capacity - 3);
    expect(s.dirty).toBe(s.capacity);
    expect(s.load(1)).toBe(0);
  });

  it('only the plumbed eras have taps, and only the machine has a door', () => {
    expect(createWashUp({ era: 'trough' }).taps).toHaveLength(0);
    expect(createWashUp({ era: 'sink' }).taps.length).toBeGreaterThan(0);
    for (const era of HAND) expect(createWashUp({ era }).door, era).toBeNull();
    expect(createDishwasher().door).not.toBeNull();
    // And a trough has nowhere to stack anything, which is why washing at
    // one is a chore rather than a production line.
    expect(createWashUp({ era: 'trough' }).board).toBeNull();
    expect(createKitchenSink().board).not.toBeNull();
    expect(createKitchenSink().surfaces).toHaveLength(1);
  });
});

describe('createWashUp — NO WATER, NO WASHING-UP', () => {
  it.each(HAND)('%s does nothing at all with a dry bowl', (era) => {
    const s = createWashUp({ era, dirty: 6 });
    expect(s.water).toBe(0);
    let yields = 0;
    s.onYield = () => (yields += 1);
    run(s, 30);
    expect(s.dirty, era).toBe(6);
    expect(yields, era).toBe(0);
  });

  it.each(HAND)('%s does nothing while nobody is working it', (era) => {
    const s = ready(era, 6);
    run(s, 30, false);
    expect(s.dirty, era).toBe(6);
  });

  it('and starts the moment the water arrives', () => {
    const s = createWashUp({ era: 'sink', dirty: 6 });
    run(s, 10);
    expect(s.dirty).toBe(6);
    s.fill(1, 1);
    run(s, 10);
    expect(s.dirty).toBeLessThan(6);
  });

  it('the tap fills it, and a scullery tap is COLD', () => {
    const modern = createKitchenSink({ era: 'sink' });
    modern.taps[0].set(true);
    run(modern, 8, false);
    expect(modern.water).toBeGreaterThan(0.6);
    expect(modern.hot, 'a mixer with no hot in it').toBeGreaterThan(0.6);

    // The era, not a detail: a butler sink's tap is cold, and hot water is
    // something you carry over from the stove.
    const butler = createKitchenSink({ era: 'scullery' });
    butler.taps[0].set(true);
    run(butler, 8, false);
    expect(butler.water).toBeGreaterThan(0.6);
    expect(butler.hot, 'a scullery tap ran hot').toBeLessThan(0.2);
  });
});

describe('createWashUp — THE WATER DECIDES THE RATE', () => {
  it('fresh hot water washes far faster than cold grey water', () => {
    // The whole track. Every other work loop in the library grinds at a
    // fixed rate forever; this one is a product of what is in the bowl.
    const hot = createWashUp({ era: 'sink', dirty: 16, seed: 1 });
    hot.fill(1, 1);
    const cold = createWashUp({ era: 'sink', dirty: 16, seed: 1 });
    cold.fill(1, 0);
    run(hot, 12);
    run(cold, 12);
    expect(16 - hot.dirty).toBeGreaterThan((16 - cold.dirty) * 1.5);
  });

  it('the water gets dirtier with every single thing washed', () => {
    const s = ready('sink', 16);
    expect(s.soil).toBe(0);
    const seen: number[] = [];
    s.onYield = () => seen.push(s.soil);
    run(s, 20);
    expect(seen.length).toBeGreaterThan(3);
    // Monotonic, one step at a time.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
  });

  it('and a tired bowl slows right down', () => {
    // Timed rather than counted: over a fixed window the difference is two
    // or three whole plates, and an integer comparison that close is a coin
    // toss. What the claim actually is, is that each one takes LONGER.
    const s = ready('sink', 16);
    const at: Record<number, number> = {};
    let t = 0;
    s.onYield = (n) => (at[n] = t);
    while (t < 200 && s.dirty > 0) {
      s.update(1 / 60);
      t += 1 / 60;
    }
    expect(at[4]).toBeDefined();
    expect(at[16]).toBeDefined();
    const firstFour = at[4] - 0;
    const lastFour = at[16] - at[12];
    expect(lastFour, 'a filthy bowl washed as fast as a fresh one')
      .toBeGreaterThan(firstFour * 1.6);
  });

  it('EMPTYING AND REFILLING BEATS TOPPING UP', () => {
    // The decision the track exists to pose. Topping up mixes, so it helps a
    // little; starting again resets both the dirt and the heat.
    const build = (): WashUp => {
      const s = createWashUp({ era: 'sink', dirty: 16, seed: 5 });
      s.fill(1, 1);
      run(s, 14);
      return s;
    };
    const topUp = build();
    const restart = build();
    expect(topUp.dirty).toBe(restart.dirty);

    topUp.fill(0.4, 1);
    restart.empty();
    restart.fill(1, 1);
    expect(restart.soil).toBe(0);
    expect(topUp.soil, 'topping up did nothing at all').toBeLessThan(1);
    expect(topUp.soil, 'topping up cleaned it completely').toBeGreaterThan(0);

    const before = [topUp.dirty, restart.dirty];
    run(topUp, 10);
    run(restart, 10);
    expect(before[1] - restart.dirty).toBeGreaterThan(before[0] - topUp.dirty);
  });

  it('the water goes cold on its own, fastest in a stone trough', () => {
    const trough = createWashUp({ era: 'trough' });
    trough.fill(1, 1);
    const sink = createWashUp({ era: 'sink' });
    sink.fill(1, 1);
    run(trough, 10, false);
    run(sink, 10, false);
    expect(trough.hot).toBeLessThan(sink.hot);
    expect(sink.hot).toBeLessThan(1);
  });

  it('washing uses the water up, so a bowlful is finite', () => {
    const s = ready('trough', 8);
    run(s, 60);
    expect(s.water).toBeLessThan(0.5);
    // It ran out before it got through the pile — which is the trough.
    expect(s.dirty).toBeGreaterThan(0);
  });

  it('clean things pile up on the board, and can be taken away', () => {
    const s = ready('sink', 8);
    run(s, 12);
    expect(s.clean).toBeGreaterThan(1);
    const had = s.clean;
    expect(s.collect(2)).toBe(2);
    expect(s.clean).toBe(had - 2);
    expect(s.collect()).toBe(had - 2);
    expect(s.clean).toBe(0);
    expect(s.collect()).toBe(0);
  });
});

describe('createWashUp — the machine takes the loop away', () => {
  it('does not run with the door open, or empty, or twice', () => {
    const d = createDishwasher();
    expect(d.start(), 'started empty').toBe(false);
    d.load(6);
    d.door!.set(true);
    run(d, 2, false);
    expect(d.start(), 'started with the door open').toBe(false);
    d.door!.set(false);
    run(d, 2, false);
    expect(d.start()).toBe(true);
    expect(d.start(), 'started twice').toBe(false);
    expect(d.running).toBe(true);
  });

  it('runs a cycle on its own — nobody has to stand there', () => {
    const d = createDishwasher({ dirty: 8 });
    let done = 0;
    d.onDone = () => (done += 1);
    d.start();
    // `working` false: the entire point of a machine.
    run(d, 20, false);
    expect(d.cycle).toBeGreaterThan(0.3);
    expect(d.dirty, 'it finished early').toBe(8);
    run(d, 40, false);
    expect(done).toBe(1);
    expect(d.dirty).toBe(0);
    expect(d.clean).toBe(8);
    expect(d.running).toBe(false);
  });

  it('OPENING IT MID-CYCLE ABORTS — half-washed is dirty', () => {
    const d = createDishwasher({ dirty: 8 });
    d.start();
    run(d, 30, false);
    expect(d.running).toBe(true);
    d.door!.set(true);
    run(d, 2, false);
    expect(d.running).toBe(false);
    expect(d.cycle).toBe(0);
    expect(d.dirty).toBe(8);
    expect(d.clean).toBe(0);
  });

  it('needs no water, no soap and no scrubbing', () => {
    const d = createDishwasher({ dirty: 4 });
    expect(d.taps).toHaveLength(0);
    d.start();
    run(d, 60, false);
    expect(d.clean).toBe(4);
    // It never dirtied a bowl of water, because it has no bowl.
    expect(d.soil).toBe(0);
    expect(d.water).toBe(0);
  });

  it('the rack comes OUT with the door', () => {
    // A machine whose door drops to reveal a black hole is a cupboard with
    // a hinge on it.
    const d = createDishwasher({ dirty: 6 });
    d.object.updateMatrixWorld(true);
    const rack = d.object.children.find((c) => c.children.length > 12 && c.type === 'Group');
    expect(rack).toBeDefined();
    const shut = rack!.position.z;
    d.door!.set(true);
    run(d, 3, false);
    expect(rack!.position.z).toBeGreaterThan(shut + 0.2);
    expect(Math.abs(d.door!.object.rotation.x)).toBeGreaterThan(1.3);
  });
});

describe('createWashUp — it actually shows what it is doing', () => {
  it.each(HAND)('%s shows the dirty pile going down and the clean one coming up', (era) => {
    // Numbers that nothing on screen reflects are numbers, not a prop.
    const s = ready(era, 6);
    const visible = (): { dirty: number; clean: number } => {
      s.object.updateMatrixWorld(true);
      let d = 0;
      let c = 0;
      s.object.traverse((o) => {
        if (!(o as { isMesh?: boolean }).isMesh || !o.visible) return;
        // Plates are the only cylinders in the prop.
        const g = (o as unknown as { geometry?: { type?: string } }).geometry;
        if (g?.type !== 'CylinderGeometry') return;
        if (o.position.y > s.object.position.y + 0.85) c += 1;
        else d += 1;
      });
      return { dirty: d, clean: c };
    };
    // One frame first: nothing is shown until something has stepped it, so
    // measuring the 'before' cold reads zero of everything and the test
    // passes for the wrong reason.
    run(s, 0.02);
    const before = visible();
    run(s, 14);
    const after = visible();
    expect(s.dirty, era).toBeLessThan(6);
    expect(after.dirty, `${era}: the pile never went down`).toBeLessThan(before.dirty);
  });

  it('the water GOES GREY, which is the only thing that says "change me"', () => {
    const s = ready('sink', 16);
    const colourOf = (): number[] => {
      let out: number[] = [];
      s.object.traverse((o) => {
        if (o.name === 'fill') {
          o.traverse((c) => {
            const m = (c as { material?: { color?: { r: number; g: number; b: number } } }).material;
            if (m?.color) out = [m.color.r, m.color.g, m.color.b];
          });
        }
      });
      return out;
    };
    run(s, 1);
    const fresh = colourOf();
    expect(fresh).toHaveLength(3);
    run(s, 25);
    const tired = colourOf();
    expect(s.soil).toBeGreaterThan(0.3);
    // Redder and less blue: grey, and then frankly brown.
    expect(tired[0]).toBeGreaterThan(fresh[0]);
    expect(tired[2]).toBeLessThan(fresh[2]);
  });

  it('steams while the water is hot and stops when it is not', () => {
    const s = ready('sink', 4);
    run(s, 3, false);
    expect(s.steam.density).toBeGreaterThan(0.05);
    s.empty();
    run(s, 15, false);
    expect(s.steam.density).toBeLessThan(0.05);
  });
});
