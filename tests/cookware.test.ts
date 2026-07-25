import { describe, expect, it } from 'vitest';
import { Box3, Object3D, Raycaster, Vector3 } from 'three';
import {
  COOKWARE_KINDS,
  createCookware,
  createHearth,
  createHob,
  type CookState,
  type CookwareKind,
  type HeatField,
} from '../src';

const boxOf = (o: Object3D): Box3 => {
  o.updateMatrixWorld(true);
  return new Box3().setFromObject(o);
};

/** A flat, uniform heat field — a stove with no geometry attached. */
const bench = (heat: number): HeatField => ({ heatAt: () => heat });

const run = (
  c: ReturnType<typeof createCookware>,
  seconds: number,
  heat: number | HeatField
): void => {
  for (let i = 0; i < Math.round(seconds * 60); i++) c.update(1 / 60, heat);
};

describe('createCookware — the shape', () => {
  it.each(COOKWARE_KINDS)('%s is open at the top — you can see into it', (kind) => {
    // Third track running for this test, and it has still never been wasted:
    // an open vessel is exactly the shape that produced a shell-inside-a-
    // shell, a lid over a well, and a capped drum.
    //
    // A GRID of rays, not one down the middle: a cauldron's bail and a
    // kettle's swing handle legitimately arch over the mouth, and a single
    // centre ray reports both of them as sealed. A handle blocks one ray of
    // nine; a lid blocks all nine.
    const c = createCookware({ kind, level: 0.5, seed: 2 });
    if (c.lid) {
      c.lid.set(false); // take the lid off first
      run(c, 2, 0);
    }
    c.object.updateMatrixWorld(true);
    const box = boxOf(c.object);
    const inside = new Box3().setFromObject(c.fill.object);
    const half = Math.min(inside.max.x - inside.min.x, inside.max.z - inside.min.z) / 2;
    const mid = box.min.y + (box.max.y - box.min.y) * 0.6;
    let through = 0;
    for (const dx of [-0.55, 0, 0.55]) {
      for (const dz of [-0.55, 0, 0.55]) {
        const hits = new Raycaster(
          new Vector3(inside.getCenter(new Vector3()).x + dx * half, box.max.y + 1,
            inside.getCenter(new Vector3()).z + dz * half),
          new Vector3(0, -1, 0)
        )
          .intersectObject(c.object, true)
          .filter((h) => h.object.type === 'Mesh');
        if (hits.length > 0 && hits[0].point.y < mid) through += 1;
      }
    }
    expect(through, `${kind}: only ${through}/9 rays reached the inside`).toBeGreaterThanOrEqual(6);
  });

  it('only the kinds that should have a lid have one', () => {
    expect(createCookware({ kind: 'pot' }).lid).not.toBeNull();
    expect(createCookware({ kind: 'kettle' }).lid).not.toBeNull();
    expect(createCookware({ kind: 'pan' }).lid).toBeNull();
    expect(createCookware({ kind: 'tray' }).lid).toBeNull();
  });

  it('is a Carryable, so ANIMA can pick it up with no adapter', () => {
    for (const kind of COOKWARE_KINDS) {
      const c = createCookware({ kind });
      expect(typeof c.carry).toBe('string');
      expect(c.grip).toBeDefined();
    }
  });
});

describe('createCookware — the pan has its own temperature', () => {
  it('food does not start cooking the moment the ring is lit', () => {
    // Drive progress straight off heatAt and everything cooks the instant it
    // is put down, which is a timer, not a stove.
    const pan = createCookware({ kind: 'pan', seed: 1 });
    pan.add(1, { cookFor: 20 });
    pan.update(1 / 60, bench(1));
    expect(pan.temperature).toBeLessThan(0.05);
    expect(pan.progress).toBe(0);
    expect(pan.state).toBe('raw');
  });

  it('a cauldron takes far longer to come up than a frying pan', () => {
    // Mass is the whole difference between searing and putting a stew on.
    const pan = createCookware({ kind: 'pan', seed: 1 });
    const cauldron = createCookware({ kind: 'cauldron', seed: 1 });
    run(pan, 6, bench(1));
    run(cauldron, 6, bench(1));
    expect(pan.temperature).toBeGreaterThan(0.6);
    expect(cauldron.temperature).toBeLessThan(0.3);
  });

  it('a pan taken off the heat cools down again', () => {
    const pan = createCookware({ kind: 'pan', seed: 1 });
    run(pan, 12, bench(1));
    const hot = pan.temperature;
    expect(hot).toBeGreaterThan(0.8);
    run(pan, 20, bench(0));
    expect(pan.temperature).toBeLessThan(hot * 0.4);
  });

  it('it reads the field at its OWN position, so moving it matters', () => {
    // The whole reason update takes the stove rather than a number.
    const stove = createHob({ era: 'gas', seed: 1 });
    stove.setPower(1);
    for (let i = 0; i < 240; i++) stove.update(1 / 60);
    stove.object.updateMatrixWorld(true);
    const ring = stove.zones[0].anchor.getWorldPosition(new Vector3());

    const pan = createCookware({ kind: 'pan', seed: 1 });
    pan.object.position.copy(ring);
    run(pan, 10, stove);
    expect(pan.temperature).toBeGreaterThan(0.7);

    // Slide it onto the worktop and it stops cooking.
    pan.object.position.set(ring.x + 3, ring.y, ring.z);
    run(pan, 20, stove);
    expect(pan.temperature).toBeLessThan(0.3);
  });
});

describe('createCookware — contents', () => {
  it('goes raw → cooking → done → burnt, reporting each once', () => {
    const pan = createCookware({ kind: 'pan', seed: 1 });
    const seen: CookState[] = [];
    pan.onState = (s) => seen.push(s);
    pan.add(1, { cookFor: 10 });
    run(pan, 120, bench(0.75));
    expect(seen).toEqual(['cooking', 'done', 'burnt']);
    expect(pan.state).toBe('burnt');
  });

  it('an empty pan never cooks anything, however hot it gets', () => {
    const pan = createCookware({ kind: 'pan', seed: 1 });
    run(pan, 60, bench(1));
    expect(pan.temperature).toBeGreaterThan(0.9);
    expect(pan.progress).toBe(0);
    expect(pan.state).toBe('raw');
  });

  it('barely warm does nothing at all', () => {
    const pan = createCookware({ kind: 'pan', seed: 1 });
    pan.add(1, { cookFor: 10 });
    run(pan, 60, bench(0.2));
    expect(pan.progress).toBe(0);
    expect(pan.state).toBe('raw');
  });

  it('WATER BOILS AWAY, and a pot that goes dry burns', () => {
    // The rule that turns "wait for the bar to fill" into something you have
    // to watch.
    const pot = createCookware({ kind: 'pot', level: 0.5, seed: 1 });
    pot.lid!.set(false);
    run(pot, 4, 0);
    const start = pot.level;
    run(pot, 90, bench(1));
    expect(pot.level).toBeLessThan(start);
    run(pot, 400, bench(1));
    expect(pot.level).toBe(0);
    expect(pot.state).toBe('burnt');
  });

  it('a lid keeps the heat in and the water down', () => {
    const make = (lidOn: boolean) => {
      const pot = createCookware({ kind: 'pot', level: 0.9, seed: 1 });
      pot.lid!.set(lidOn);
      run(pot, 60, bench(0.85));
      return pot;
    };
    const covered = make(true);
    const open = make(false);
    // Hotter with it on...
    expect(covered.temperature).toBeGreaterThan(open.temperature);
    // ...and less of it boiled away.
    expect(covered.level).toBeGreaterThan(open.level);
  });

  it('emptying it resets the batch', () => {
    const pan = createCookware({ kind: 'pan', seed: 1 });
    pan.add(1, { cookFor: 5 });
    run(pan, 30, bench(0.8));
    expect(pan.state).not.toBe('raw');
    pan.empty();
    expect(pan.level).toBe(0);
    expect(pan.progress).toBe(0);
    expect(pan.state).toBe('raw');
  });

  it('the contents DARKEN as they cook — the only thing read across a room', () => {
    const pan = createCookware({ kind: 'pan', seed: 1 });
    // Below the boil, so nothing dries out and the sample really is
    // mid-cook: a frying pan at full heat boils dry in half a minute and
    // burns, which is correct and useless for measuring a colour ramp.
    pan.add(1, { cookFor: 200 });
    const surface = pan.fill.object.children.find((c) => c.name === 'surface') as unknown as {
      material: { color: { getHex(): number; r: number; g: number; b: number } };
    };
    pan.update(1 / 60, 0);
    const raw = surface.material.color.r + surface.material.color.g + surface.material.color.b;
    run(pan, 100, bench(0.45));
    expect(pan.state).toBe('cooking'); // genuinely mid-cook, not already gone
    const cooked = surface.material.color.r + surface.material.color.g + surface.material.color.b;
    expect(cooked).toBeLessThan(raw);
    run(pan, 500, bench(0.9));
    expect(pan.state).toBe('burnt');
    const burnt = surface.material.color.r + surface.material.color.g + surface.material.color.b;
    expect(burnt).toBeLessThan(cooked * 0.5);
  });
});

describe('createCookware — steam and the kettle', () => {
  it('steams while it boils and stops once it has burnt dry', () => {
    const pot = createCookware({ kind: 'pot', seed: 1 });
    pot.add(0.95, { cookFor: 600 }); // a long braise, so it is the WATER on trial
    pot.lid!.set(false);
    run(pot, 60, bench(1));
    expect(pot.boiling).toBe(true);
    const wet = pot.steam.density;
    expect(wet).toBeGreaterThan(0.3);
    run(pot, 500, bench(1));
    expect(pot.level).toBe(0);
    expect(pot.steam.density).toBeLessThan(wet);
  });

  it('a kettle whistles once, and again only after it has been taken off', () => {
    const kettle = createCookware({ kind: 'kettle', level: 0.8, seed: 1 });
    let whistles = 0;
    kettle.onWhistle = () => (whistles += 1);
    run(kettle, 60, bench(1));
    expect(kettle.whistling).toBe(true);
    expect(whistles).toBe(1);
    run(kettle, 20, bench(1));
    expect(whistles).toBe(1); // still one, not one per frame

    run(kettle, 60, bench(0));
    expect(kettle.whistling).toBe(false);
    run(kettle, 60, bench(1));
    expect(whistles).toBe(2);
  });

  it('nothing whistles except a kettle', () => {
    for (const kind of COOKWARE_KINDS.filter((k) => k !== 'kettle') as CookwareKind[]) {
      const c = createCookware({ kind, level: 0.8, seed: 1 });
      run(c, 90, bench(1));
      expect(c.whistling, `${kind} whistled`).toBe(false);
    }
  });
});

describe('createCookware — on a real stove', () => {
  it('a cauldron on the crane cooks, and stops when it is swung off', () => {
    // The whole track in one test: SCENA answers where the heat is, the pot
    // reads it at its own position, and the medieval control is moving it.
    const hearth = createHearth({ seed: 1 });
    hearth.setPower(1);
    for (let i = 0; i < 60 * 60; i++) hearth.update(1 / 60);
    hearth.object.updateMatrixWorld(true);

    const pot = createCookware({ kind: 'cauldron', level: 1, seed: 1 });
    pot.add(1, { cookFor: 30 });
    // Hang it on the hook.
    const hook = hearth.zones[0];
    hook.anchor.add(pot.object);
    run(pot, 120, hearth);
    expect(pot.temperature).toBeGreaterThan(0.5);
    const cooking = pot.progress;
    expect(cooking).toBeGreaterThan(0.1);

    // Swing it out over the flagstones. It does not go cold — it is still
    // beside a lit fire — but it comes off the boil, which is the point.
    const overFire = pot.temperature;
    hearth.crane!.set(true);
    for (let i = 0; i < 180; i++) hearth.update(1 / 60);
    run(pot, 300, hearth);
    expect(pot.temperature).toBeLessThan(overFire * 0.8);
    expect(hearth.temperature).toBeGreaterThan(0.9); // and the fire is fine
  });
});
