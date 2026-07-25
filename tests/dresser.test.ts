import { describe, expect, it } from 'vitest';
import { Box3, Object3D, Vector3 } from 'three';
import {
  createDresser,
  createCrockery,
  createKitchenware,
  createUtensil,
  stock,
  DRESSER_KINDS,
  UTENSIL_STYLES,
} from '../src';
import type { DresserKind, Storage } from '../src';

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

const run = (d: Storage, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds * 60); i++) d.update(1 / 60);
};

/** World-space box of one held item. */
const heldBox = (d: Storage, object: Object3D): Box3 => {
  d.object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
};

describe('createDresser — the shape of it', () => {
  it.each(DRESSER_KINDS)('%s fits in a room and hangs at the right height', (kind) => {
    const box = boxOf(createDresser({ kind }).object);
    expect(box.max.y).toBeLessThan(2.2);
    expect(box.min.y).toBeGreaterThan(-0.02);
    // The wall-hung kinds are UP, and their origin is still on the floor —
    // so a kitchen wall is a row of these at the same y with no arithmetic.
    if (kind === 'plateRack' || kind === 'potRail' || kind === 'wallUnit') {
      expect(box.min.y, kind).toBeGreaterThan(1.2);
    }
  });

  it.each(DRESSER_KINDS)('%s publishes spaces to put things in', (kind) => {
    const d = createDresser({ kind });
    expect(d.spaces.length).toBeGreaterThan(2);
    expect(d.free).toBe(d.spaces.length);
    expect(d.used).toBe(0);
    for (const s of d.spaces) {
      expect(s.clear, `${kind} ${s.kind} clear`).toBeGreaterThan(0.05);
      expect(s.width, `${kind} ${s.kind} width`).toBeGreaterThan(0.05);
      expect(s.held).toBeNull();
    }
  });

  it('the kinds are not the same object with different wood on it', () => {
    const kinds = (k: DresserKind): string =>
      [...new Set(createDresser({ kind: k }).spaces.map((s) => s.kind))].sort().join(',');
    expect(kinds('plateRack')).toBe('groove');
    expect(kinds('potRail')).toBe('hook');
    expect(kinds('pantry')).toBe('shelf');
    // A dresser is the one that does all of it, which is why it is furniture
    // and a wall cabinet is a box.
    expect(kinds('welsh').split(',').length).toBeGreaterThan(3);
  });

  it('is a Prop you can stand at, and the high ones do not block the floor', () => {
    for (const kind of DRESSER_KINDS) {
      const d = createDresser({ kind });
      expect(d.slots?.[0]).toBe(d.slot);
      expect(d.slot.approach).toBeDefined();
    }
    // You walk underneath a pot rail.
    expect(createDresser({ kind: 'potRail' }).obstacleRadius).toBe(0);
    expect(createDresser({ kind: 'pantry' }).obstacleRadius).toBeGreaterThan(0.2);
  });
});

describe('createDresser — HIDDEN IS LIVE', () => {
  it('a shut cupboard hides what is in it, and opening it does not', () => {
    // The distinction the whole track turns on: it is the difference between
    // a dresser and a cupboard, and a boolean snapshotted at build time
    // would report a shut pantry forever however often it was opened.
    const d = createDresser({ kind: 'pantry' });
    stock(d, createKitchenware({ count: 8 }), { seed: 1, density: 1 });
    expect(d.used).toBeGreaterThan(2);
    expect(d.shown).toBe(0);

    for (const door of d.doors) door.set(true);
    run(d, 2);
    expect(d.shown).toBe(d.used);

    for (const door of d.doors) door.set(false);
    run(d, 2);
    expect(d.shown).toBe(0);
  });

  it('one leaf open shows HALF a pantry — not all of it and not none', () => {
    const d = createDresser({ kind: 'pantry' });
    stock(d, createKitchenware({ count: 10 }), { seed: 4, density: 1 });
    d.doors[0].set(true);
    run(d, 2);
    expect(d.shown).toBeGreaterThan(0);
    expect(d.shown).toBeLessThan(d.used);
  });

  it('a dresser and a rack hide nothing at all', () => {
    for (const kind of ['welsh', 'plateRack', 'potRail'] as DresserKind[]) {
      const d = createDresser({ kind });
      stock(d, createKitchenware({ count: 10, seed: 2 }), { seed: 2, density: 1 });
      expect(d.used, kind).toBeGreaterThan(0);
      // A welsh dresser has a cupboard in its base, so some of it hides —
      // but the open shelves must not.
      const open = d.spaces.filter((s) => s.held && !s.hidden).length;
      expect(open, kind).toBeGreaterThan(0);
      if (kind !== 'welsh') expect(d.shown, kind).toBe(d.used);
    }
  });

  it('a drawer is out of sight whether or not it has a front on it', () => {
    const d = createDresser({ kind: 'welsh' });
    const drawer = d.spaces.find((s) => s.kind === 'drawer')!;
    expect(drawer).toBeDefined();
    expect(drawer.hidden).toBe(true);
    for (const door of d.doors) door.set(true);
    run(d, 2);
    expect(drawer.hidden).toBe(false);
  });
});

describe('stock — putting things AWAY', () => {
  it('actually seats things, and leaves gaps on purpose', () => {
    // A dresser with something in every space is a shop.
    const d = createDresser({ kind: 'welsh' });
    const placed = stock(d, createKitchenware({ count: 40, seed: 5 }), { seed: 5 });
    expect(placed.length).toBeGreaterThan(3);
    expect(d.used).toBe(placed.length);
    expect(d.free, 'it filled every single space').toBeGreaterThan(0);
    expect(placed.length).toBeLessThan(d.spaces.length);
  });

  it('everything it seats is inside the dresser, not floating beside it', () => {
    for (const kind of DRESSER_KINDS) {
      const d = createDresser({ kind, seed: 3 });
      const placed = stock(d, createKitchenware({ count: 24, seed: 6 }), { seed: 6, density: 1 });
      expect(placed.length, kind).toBeGreaterThan(0);
      const shell = boxOf(d.object);
      for (const item of placed) {
        const at = heldBox(d, item).getCenter(new Vector3());
        expect(at.y, `${kind}: something is off the shelf`).toBeGreaterThan(shell.min.y - 0.35);
        expect(at.y, `${kind}`).toBeLessThan(shell.max.y + 0.1);
        expect(Math.abs(at.x), `${kind}: something is beside it`).toBeLessThan(shell.max.x + 0.2);
      }
    }
  });

  it('A PLATE IN A RACK STANDS ON EDGE', () => {
    // Laid flat it is a plate on a shelf and the rack might as well not be
    // there — the reason `groove` is its own kind rather than a flag.
    const rack = createDresser({ kind: 'plateRack' });
    const plate = createCrockery({ style: 'plate', seed: 2 });
    const space = rack.put(plate, 'groove');
    expect(space).not.toBeNull();
    const box = heldBox(rack, plate.object);
    const size = box.getSize(new Vector3());
    // A plate is 18 cm across and 1.3 cm thick. On edge it is TALL, and it
    // is thin ACROSS the rack — one slot wide, not lying over several.
    expect(size.y).toBeGreaterThan(0.1);
    expect(size.x).toBeLessThan(0.06);
  });

  it('and a stack on a shelf does not', () => {
    const d = createDresser({ kind: 'pantry' });
    const stackOf = createCrockery({ style: 'stack', count: 4, seed: 2 });
    d.put(stackOf, 'shelf');
    const size = heldBox(d, stackOf.object).getSize(new Vector3());
    expect(size.y).toBeLessThan(size.x);
  });

  it('A HUNG THING HANGS BY ITS TOP', () => {
    const rail = createDresser({ kind: 'potRail' });
    const hook = rail.spaces[0];
    const tool = createUtensil({ style: 'ladle', seed: 1 });
    expect(rail.put(tool, 'hook')).not.toBeNull();
    rail.object.updateMatrixWorld(true);
    const box = heldBox(rail, tool.object);
    const anchorY = hook.anchor.getWorldPosition(new Vector3()).y;
    // Its top is at the hook and the rest of it is below — not its base at
    // the hook with the ladle sticking up into the ceiling.
    expect(box.max.y).toBeCloseTo(anchorY, 1);
    expect(box.min.y).toBeLessThan(anchorY - 0.05);
  });

  it('a pot rail takes the TOOLS and refuses the crockery', () => {
    // Nobody hangs plates from a rail, and nothing had to be told that: a
    // hook's width is the spacing between hooks, and a stack of plates is
    // wider than it.
    const rail = createDresser({ kind: 'potRail' });
    const placed = stock(rail, createKitchenware({ count: 24, seed: 8 }), { seed: 8, density: 1 });
    expect(placed.length).toBeGreaterThan(2);
    for (const o of placed) expect(o.name.startsWith('utensil'), o.name).toBe(true);
  });

  it('nothing is placed perfectly square', () => {
    // A row of pans all hanging plumb is a shop display.
    const rail = createDresser({ kind: 'potRail' });
    const placed = stock(rail, createKitchenware({ count: 24, seed: 8 }), { seed: 8, density: 1 });
    expect(placed.length).toBeGreaterThan(2);
    const yaws = placed.map((o) => Math.abs(o.rotation.y));
    expect(Math.max(...yaws)).toBeGreaterThan(0.02);
    expect(new Set(yaws.map((y) => y.toFixed(3))).size, 'every one identical').toBeGreaterThan(1);
  });

  it('refuses what will not fit rather than cramming it', () => {
    const rack = createDresser({ kind: 'plateRack' });
    const giant = new Object3D();
    const mesh = createCrockery({ style: 'stack', count: 30 }).object;
    mesh.scale.setScalar(6);
    giant.add(mesh);
    expect(rack.put(giant)).toBeNull();
    expect(rack.used).toBe(0);
  });

  it('takes things back out again', () => {
    const d = createDresser({ kind: 'welsh' });
    const item = createCrockery({ style: 'plate', seed: 1 });
    const space = d.put(item)!;
    expect(space).not.toBeNull();
    expect(d.used).toBe(1);
    expect(d.take(space)).toBe(item.object);
    expect(d.used).toBe(0);
    expect(space.held).toBeNull();
    expect(d.take(space)).toBeNull();
  });

  it('respects `only`, so a rail can be filled with tools and nothing else', () => {
    const d = createDresser({ kind: 'welsh' });
    stock(d, createKitchenware({ count: 20, seed: 9 }), { seed: 9, only: ['hook'], density: 1 });
    expect(d.used).toBeGreaterThan(0);
    for (const s of d.spaces) if (s.held) expect(s.kind).toBe('hook');
  });

  it('a welsh dresser also has surfaces you can `dress` the ordinary way', () => {
    const d = createDresser({ kind: 'welsh' });
    expect(d.surfaces.length).toBeGreaterThan(2);
    for (const s of d.surfaces) {
      expect(s.width).toBeGreaterThan(0.2);
      expect(s.depth).toBeGreaterThan(0.1);
    }
  });
});

describe('the kitchen kit', () => {
  it.each(UTENSIL_STYLES)('%s is built HANDLE UP, so it hangs and stands the same way', (style) => {
    // One model works both hung and put down, and `stock` needs no per-prop
    // hook point to hang it by.
    const u = createUtensil({ style, seed: 3 });
    const box = boxOf(u.object);
    expect(box.max.y).toBeGreaterThan(0.15);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(u.carry).toBe('side');
  });

  it('crockery stacks are taller the more of them there are', () => {
    const one = boxOf(createCrockery({ style: 'stack', count: 1 }).object);
    const six = boxOf(createCrockery({ style: 'stack', count: 6 }).object);
    expect(six.max.y).toBeGreaterThan(one.max.y + 0.04);
  });

  it('is mostly crockery with a few tools in it, not a hardware display', () => {
    const kit = createKitchenware({ count: 60, seed: 11 });
    const tools = kit.filter((k) => k.object.name.startsWith('utensil')).length;
    expect(tools).toBeGreaterThan(8);
    expect(tools, 'more tools than plates').toBeLessThan(kit.length / 2);
  });

  it('is seeded, so the same kitchen comes back the same', () => {
    const a = createKitchenware({ count: 12, seed: 7 }).map((k) => k.object.name);
    const b = createKitchenware({ count: 12, seed: 7 }).map((k) => k.object.name);
    const c = createKitchenware({ count: 12, seed: 8 }).map((k) => k.object.name);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
