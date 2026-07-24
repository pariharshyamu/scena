import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import {
  createCrate,
  createBarrel,
  createBasket,
  createSack,
  createLantern,
  type Carryable,
} from '../src';

const size = (c: Carryable): Vector3 =>
  new Box3().setFromObject(c.object).getSize(new Vector3());

describe('carryables', () => {
  it('every carryable declares a carry style and a grip', () => {
    const all: Array<[Carryable, string]> = [
      [createCrate(), 'crate'],
      [createBarrel(), 'crate'],
      [createBasket(), 'side'],
      [createSack(), 'shoulder'],
      [createLantern(), 'side'],
    ];
    for (const [c, style] of all) {
      expect(c.carry).toBe(style);
      expect(c.grip).toBeDefined();
      expect(size(c).y).toBeGreaterThan(0.1); // it renders as a solid thing
    }
  });

  it('origins sit at the base (ground-placeable), grips lift the hold point', () => {
    const barrel = createBarrel();
    const box = new Box3().setFromObject(barrel.object);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.02); // base at ~y=0
    // The hold point is offset up into the body, not at the floor.
    expect(barrel.grip!.y).toBeLessThan(0);
    expect(Math.abs(barrel.grip!.y!)).toBeLessThan(box.max.y);
  });

  it('is deterministic per seed', () => {
    const a = createBasket({ seed: 5 });
    const b = createBasket({ seed: 5 });
    const layout = (c: Carryable) =>
      c.object.children.map((ch) => ch.position.toArray().map((n) => n.toFixed(3)).join()).join('|');
    expect(layout(a)).toBe(layout(b));
    expect(layout(createBasket({ seed: 6 }))).not.toBe(layout(a));
  });

  it('the lantern glows (emissive glass)', () => {
    const lantern = createLantern({ glow: 0xffcc66 });
    let emissive = false;
    lantern.object.traverse((o) => {
      const m = (o as { material?: { emissiveIntensity?: number } }).material;
      if (m && (m.emissiveIntensity ?? 0) > 0) emissive = true;
    });
    expect(emissive).toBe(true);
  });
});
