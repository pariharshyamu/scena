import { describe, expect, it } from 'vitest';
import { Box3, Object3D, Vector3 } from 'three';
import {
  createIngredient,
  createColdStore,
  keepsFor,
  INGREDIENT_KINDS,
  spoilRate,
} from '../src';
import type { Ingredient, IngredientKind } from '../src';

const boxOf = (o: Object3D): Box3 => {
  o.updateMatrixWorld(true);
  const box = new Box3();
  o.traverse((c) => {
    if (c.type === 'Mesh' && c.visible) box.expandByObject(c);
  });
  return box;
};

const run = (i: Ingredient, seconds: number, chill?: number, dt = 1 / 30): void => {
  for (let n = 0; n < Math.round(seconds / dt); n++) i.update(dt, chill);
};

describe('createIngredient — the thing itself', () => {
  it.each(INGREDIENT_KINDS)('%s is a Carryable that sits on its base', (kind) => {
    const i = createIngredient({ kind });
    expect(i.carry).toBeDefined();
    expect(i.obstacleRadius).toBe(0);
    const box = boxOf(i.object);
    expect(box.min.y).toBeGreaterThan(-0.01);
    expect(box.max.y).toBeLessThan(0.25);
    expect(box.max.y).toBeGreaterThan(0.01);
  });

  it('starts fresh and whole unless told otherwise', () => {
    const i = createIngredient({ kind: 'onion' });
    expect(i.form).toBe('whole');
    expect(i.state).toBe('fresh');
    expect(i.freshness).toBe(1);
    expect(i.spoiled).toBe(false);

    const old = createIngredient({ kind: 'onion', freshness: 0.2, form: 'prepped' });
    expect(old.form).toBe('prepped');
    expect(old.state).toBe('tired');
  });

  it('prepping is ONE WAY, and not available on something already gone', () => {
    const i = createIngredient({ kind: 'carrot' });
    expect(i.prep()).toBe(true);
    expect(i.form).toBe('prepped');
    expect(i.prep(), 'chopped it twice').toBe(false);

    // Chopping a rotten onion gives you rotten chopped onion, which no
    // recipe wants and no player meant to make.
    const gone = createIngredient({ kind: 'carrot', freshness: 0 });
    expect(gone.spoiled).toBe(true);
    expect(gone.prep()).toBe(false);
    expect(gone.form).toBe('whole');
  });

  it('the cut version is DIFFERENT GEOMETRY, not the same mesh recoloured', () => {
    const i = createIngredient({ kind: 'potato', seed: 3 });
    const count = (): number => {
      let n = 0;
      i.object.traverse((c) => {
        if ((c as { isMesh?: boolean }).isMesh && c.visible && c.parent?.visible) n += 1;
      });
      return n;
    };
    const whole = count();
    i.prep();
    expect(count(), 'a chopped potato looks exactly like a whole one').toBeGreaterThan(whole);
  });
});

describe('createIngredient — the clock', () => {
  it('goes off over time, and says so before it is too late', () => {
    const i = createIngredient({ kind: 'fish' });
    const seen: string[] = [];
    i.onState = (s) => seen.push(s);
    run(i, 200);
    expect(i.freshness).toBeLessThan(1);
    expect(seen).toContain('tired');
    run(i, 200);
    expect(i.spoiled).toBe(true);
    expect(i.state).toBe('spoiled');
    expect(seen).toContain('spoiled');
    // Once, not once per frame.
    expect(seen.filter((s) => s === 'spoiled')).toHaveLength(1);
  });

  it('and stops there — spoiled is terminal', () => {
    const i = createIngredient({ kind: 'fish', freshness: 0.01 });
    run(i, 500);
    expect(i.freshness).toBe(0);
    run(i, 500);
    expect(i.freshness).toBe(0);
    expect(i.shelfLife).toBe(0);
  });

  it('PREPPING SOMETHING PUTS IT ON A CLOCK', () => {
    // The one place the two axes touch, and the rule that makes a kitchen a
    // planning problem rather than a sequence: a whole onion keeps for
    // weeks, a chopped one keeps for a day.
    const whole = createIngredient({ kind: 'onion' });
    const cut = createIngredient({ kind: 'onion' });
    cut.prep();
    run(whole, 120);
    run(cut, 120);
    expect(1 - cut.freshness).toBeGreaterThan((1 - whole.freshness) * 3);
    expect(keepsFor('onion', 'prepped')).toBeLessThan(keepsFor('onion') / 3);
  });

  it('a fish and a potato are not the same object with different meshes', () => {
    // One of them you can leave in a corner for the whole game; the other is
    // a timer that started when you picked it up.
    expect(keepsFor('potato')).toBeGreaterThan(keepsFor('fish') * 5);
    const fish = createIngredient({ kind: 'fish' });
    const potato = createIngredient({ kind: 'potato' });
    run(fish, 130);
    run(potato, 130);
    expect(fish.spoiled).toBe(true);
    expect(potato.state).toBe('fresh');
  });

  it('shelfLife answers in seconds, at the rate it is going off NOW', () => {
    const i = createIngredient({ kind: 'meat' });
    run(i, 1);
    expect(i.shelfLife).toBeGreaterThan(150);
    expect(i.shelfLife).toBeLessThan(200);
    i.prep();
    run(i, 1);
    // Cut, the same meat has a third of the life left.
    expect(i.shelfLife).toBeLessThan(70);
  });
});

describe('createIngredient — THE HANDSHAKE, which is the point of the track', () => {
  it('reads a ChillField at its own position, like Cookware reads heat', () => {
    const fridge = createColdStore({ era: 'fridge', ambient: 20 });
    for (let n = 0; n < 60 * 20; n++) fridge.update(1 / 60);
    fridge.object.updateMatrixWorld(true);
    const shelf = fridge.shelves[1].anchor.getWorldPosition(new Vector3());

    const inside = createIngredient({ kind: 'meat' });
    inside.object.position.copy(shelf).add(new Vector3(0, 0.04, 0));
    const out = createIngredient({ kind: 'meat' });
    out.object.position.set(0, 0.9, 3);

    for (let n = 0; n < 30 * 120; n++) {
      fridge.update(1 / 30);
      inside.update(1 / 30, fridge);
      out.update(1 / 30, fridge);
    }
    expect(out.freshness, 'the one on the bench kept perfectly').toBeLessThan(0.6);
    expect(inside.freshness, 'the fridge did nothing').toBeGreaterThan(out.freshness + 0.2);
  });

  it('MOVING IT INTO THE FRIDGE IS ALL IT TAKES', () => {
    // Nothing is told about anything. The ingredient samples the field where
    // it is standing, so a hand carrying it across the kitchen is the entire
    // gameplay wiring.
    const fridge = createColdStore({ era: 'fridge', ambient: 20 });
    for (let n = 0; n < 60 * 20; n++) fridge.update(1 / 60);
    fridge.object.updateMatrixWorld(true);
    const shelf = fridge.shelves[1].anchor.getWorldPosition(new Vector3());

    const i = createIngredient({ kind: 'fish' });
    i.object.position.set(0, 0.9, 3);
    const step = (seconds: number): number => {
      const before = i.freshness;
      for (let n = 0; n < 30 * seconds; n++) {
        fridge.update(1 / 30);
        i.update(1 / 30, fridge);
      }
      return before - i.freshness;
    };
    const onBench = step(20);
    i.object.position.copy(shelf).add(new Vector3(0, 0.04, 0));
    const inFridge = step(20);
    expect(onBench).toBeGreaterThan(0);
    expect(inFridge, 'the fridge made no difference').toBeLessThan(onBench * 0.6);
  });

  it('a freezer very nearly stops the clock', () => {
    const freezer = createColdStore({ era: 'freezer', ambient: 20 });
    for (let n = 0; n < 60 * 30; n++) freezer.update(1 / 60);
    freezer.object.updateMatrixWorld(true);
    const shelf = freezer.shelves[1].anchor.getWorldPosition(new Vector3());
    const i = createIngredient({ kind: 'fish' });
    i.object.position.copy(shelf).add(new Vector3(0, 0.04, 0));
    for (let n = 0; n < 30 * 400; n++) {
      freezer.update(1 / 30);
      i.update(1 / 30, freezer);
    }
    // On the bench this fish would have been gone three times over.
    expect(i.state).toBe('fresh');
    expect(i.freshness).toBeGreaterThan(0.9);
    expect(i.shelfLife).toBeGreaterThan(keepsFor('fish') * 5);
  });

  it('also takes a plain rate, so a test or a HUD needs no cold store', () => {
    const fast = createIngredient({ kind: 'bread' });
    const slow = createIngredient({ kind: 'bread' });
    run(fast, 100, 1);
    run(slow, 100, 0.25);
    expect(1 - fast.freshness).toBeGreaterThan((1 - slow.freshness) * 3);
    // And 0 stops it dead, which is what spoilRate reports below freezing.
    const frozen = createIngredient({ kind: 'bread' });
    run(frozen, 1000, 0);
    expect(frozen.freshness).toBe(1);
    expect(spoilRate(-18)).toBeLessThan(0.01);
  });
});

describe('createIngredient — it SHOWS what it says', () => {
  it.each(['onion', 'cabbage', 'meat'] as IngredientKind[])(
    '%s changes colour as it goes off',
    (kind) => {
      // A green cabbage that reports itself rotten is worse than no state.
      const colourOf = (i: Ingredient): number[] => {
        let out: number[] = [];
        i.object.traverse((c) => {
          const m = (c as { material?: { color?: { r: number; g: number; b: number } } }).material;
          if (!out.length && m?.color && c.visible) out = [m.color.r, m.color.g, m.color.b];
        });
        return out;
      };
      const i = createIngredient({ kind });
      const fresh = colourOf(i);
      run(i, keepsFor(kind) * 0.9);
      const rotten = colourOf(i);
      expect(i.freshness).toBeLessThan(0.2);
      const drop = (a: number[], b: number[]): number =>
        Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      expect(drop(fresh, rotten), `${kind} looks identical rotten`).toBeGreaterThan(0.05);
    }
  );

  it('and shrinks, because everything that goes off loses water', () => {
    const i = createIngredient({ kind: 'cabbage' });
    const before = boxOf(i.object).getSize(new Vector3()).y;
    run(i, keepsFor('cabbage') * 0.95);
    const after = boxOf(i.object).getSize(new Vector3()).y;
    expect(after).toBeLessThan(before * 0.95);
  });
});
