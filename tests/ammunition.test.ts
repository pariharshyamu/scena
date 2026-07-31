import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import {
  AMMO,
  AMMO_KINDS,
  ballisticsOf,
  createAmmoBox,
  createBelt,
  createCasing,
  createMagazine,
  createQuiver,
  createRack,
  createReady,
  createRound,
  describeAmmo,
  roundTriangles,
  type AmmoKind,
  type Countable,
} from '../src/props/ammunition';

/** Meshes the renderer submits — an InstancedMesh counts once, as it draws. */
const draws = (c: { object: { traverse(fn: (o: unknown) => void): void } }): number => {
  let n = 0;
  c.object.traverse((o) => {
    if ((o as Mesh).isMesh) n++;
  });
  return n;
};

/**
 * How many rounds are actually VISIBLE — instances that are not zero-scaled.
 *
 * Read straight off the matrix elements rather than via `Matrix4.decompose`.
 * Decompose on a SINGULAR matrix divides by a zero scale, and what it leaves
 * in the output is not something to build an assertion on; the basis vectors
 * being all-zero is the same fact with no arithmetic in the way.
 */
const visible = (c: Countable): number => {
  let most = 0;
  const m = new Matrix4();
  c.object.traverse((o) => {
    const im = o as InstancedMesh;
    if (!im.isInstancedMesh) return;
    let on = 0;
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m);
      const basis = Math.abs(m.elements[0]) + Math.abs(m.elements[1]) + Math.abs(m.elements[2]) +
        Math.abs(m.elements[4]) + Math.abs(m.elements[5]) + Math.abs(m.elements[6]) +
        Math.abs(m.elements[8]) + Math.abs(m.elements[9]) + Math.abs(m.elements[10]);
      if (basis > 1e-6) on++;
    }
    most = Math.max(most, on);
  });
  return most;
};

describe('the table', () => {
  it('covers every kind it declares', () => {
    expect(AMMO_KINDS.length).toBe(new Set(AMMO_KINDS).size);
    for (const kind of AMMO_KINDS) expect(AMMO[kind], kind).toBeDefined();
    expect(Object.keys(AMMO).sort()).toEqual([...AMMO_KINDS].sort());
  });

  it('is dimensionally sane on every kind', () => {
    for (const kind of AMMO_KINDS) {
      const s = AMMO[kind];
      expect(s.calibre, kind).toBeGreaterThan(0);
      // A round is never narrower than it is... well, a sling stone is a
      // sphere, so length >= calibre rather than strictly greater.
      expect(s.length, kind).toBeGreaterThanOrEqual(s.calibre);
      expect(s.mass, kind).toBeGreaterThan(0);
      expect(s.muzzle, kind).toBeGreaterThanOrEqual(0);
      expect(s.perContainer, kind).toBeGreaterThan(0);
    }
  });

  it('orders by calibre the way the real world does', () => {
    // If this ever inverts, the derived containers invert with it and a 5.56
    // magazine comes out bigger than a 120 mm rack.
    expect(AMMO.rifle.calibre).toBeLessThan(AMMO.pistol.calibre);
    expect(AMMO.pistol.calibre).toBeLessThan(AMMO['heavy-mg'].calibre);
    expect(AMMO['heavy-mg'].calibre).toBeLessThan(AMMO.autocannon.calibre);
    expect(AMMO.autocannon.calibre).toBeLessThan(AMMO.tank.calibre);
    expect(AMMO.tank.calibre).toBeLessThan(AMMO.artillery.calibre);
    expect(AMMO.artillery.calibre).toBeLessThan(AMMO.torpedo.calibre);
  });

  it('describes itself in one line', () => {
    expect(describeAmmo('rifle')).toContain('5.56');
    expect(describeAmmo('rifle')).toContain('920 m/s');
    // Not gun-launched says so rather than claiming 0 m/s as a speed.
    expect(describeAmmo('bomb')).toContain('not gun-launched');
  });
});

describe('ballistics', () => {
  it('hands a projectile system exactly what it needs', () => {
    for (const kind of AMMO_KINDS) {
      const b = ballisticsOf(kind);
      expect(b.speed, kind).toBe(AMMO[kind].muzzle);
      expect(b.mass, kind).toBe(AMMO[kind].mass);
      expect(b.color, kind).toBe(AMMO[kind].color);
      expect(b.perContainer, kind).toBe(AMMO[kind].perContainer);
      // Readable at range. A true-to-life 5.56 mm tracer is one pixel.
      expect(b.size, kind).toBeGreaterThanOrEqual(0.05);
    }
  });

  it('drops everything unpowered at the same g', () => {
    // The most common lie in game ballistics is that a bullet falls less than
    // a cannonball. It does not; it is just in the air for less time, and
    // that falls out of `speed` on its own.
    for (const kind of ['pistol', 'rifle', 'tank', 'cannonball', 'arrow', 'bomb'] as AmmoKind[]) {
      expect(ballisticsOf(kind).gravity, kind).toBeCloseTo(9.81, 5);
    }
  });

  it('lets powered and guided rounds off that hook', () => {
    expect(ballisticsOf('rocket').gravity).toBeLessThan(9.81);
    expect(ballisticsOf('rocket').gravity).toBeGreaterThan(0);
    // Guided: whatever flies it owns its path entirely.
    expect(ballisticsOf('missile').gravity).toBe(0);
    expect(ballisticsOf('torpedo').gravity).toBe(0);
  });

  it('scales the tracer with the calibre', () => {
    expect(ballisticsOf('heavy-mg').size).toBeGreaterThan(ballisticsOf('rifle').size);
    expect(ballisticsOf('artillery').size).toBeGreaterThan(ballisticsOf('autocannon').size);
  });
});

describe('a round', () => {
  it('builds for every kind, along +Z from the origin', () => {
    for (const kind of AMMO_KINDS) {
      const r = createRound(kind);
      expect(draws(r), kind).toBeGreaterThan(0);
      expect(r.length, kind).toBeCloseTo(AMMO[kind].length, 6);
      expect(r.kind, kind).toBe(kind);
    }
  });

  it('is cheap enough to have a hundred of', () => {
    for (const kind of AMMO_KINDS) {
      expect(roundTriangles(kind), kind).toBeLessThan(260);
    }
  });

  it('decides one hand or two from the round, not from a flag', () => {
    expect(createRound('pistol').carry).toBe('side');
    expect(createRound('grenade').carry).toBe('side');
    expect(createRound('artillery').carry).toBe('crate');
    expect(createRound('torpedo').carry).toBe('crate');
  });

  it('scales', () => {
    expect(createRound('rifle', { scale: 10 }).length).toBeCloseTo(AMMO.rifle.length * 10, 6);
  });
});

describe('counting', () => {
  const containers = (): Array<[string, Countable]> => [
    ['magazine', createMagazine('rifle')],
    ['belt', createBelt('heavy-mg', { capacity: 24 })],
    ['quiver', createQuiver('arrow')],
    ['rack', createRack('artillery')],
    ['box', createAmmoBox('grenade', { open: true })],
  ];

  it('starts full and empties to nothing', () => {
    for (const [name, c] of containers()) {
      expect(c.count, name).toBe(c.capacity);
      expect(visible(c), name).toBe(c.capacity);
      c.setCount(0);
      expect(c.count, name).toBe(0);
      expect(visible(c), name).toBe(0);
    }
  });

  it('shows exactly the number it claims', () => {
    for (const [name, c] of containers()) {
      for (const n of [1, Math.floor(c.capacity / 2), c.capacity - 1]) {
        c.setCount(n);
        expect(visible(c), `${name} @${n}`).toBe(n);
      }
    }
  });

  it('clamps rather than throwing', () => {
    for (const [name, c] of containers()) {
      expect(c.setCount(-5), name).toBe(0);
      expect(c.setCount(c.capacity + 99), name).toBe(c.capacity);
    }
  });

  it('consumes one at a time and reports when it is dry', () => {
    const mag = createMagazine('pistol');
    const start = mag.count;
    for (let i = 0; i < start; i++) expect(mag.consume()).toBe(true);
    expect(mag.count).toBe(0);
    expect(mag.consume()).toBe(false);
  });

  it('COSTS THE SAME EMPTY AS FULL', () => {
    // The whole reason the rounds are instanced. If emptying a belt changed
    // the draw count, a firefight would be a performance cliff and every
    // gunner in it would be a different price.
    for (const [name, c] of containers()) {
      const full = draws(c);
      c.setCount(0);
      expect(draws(c), `${name} emptied`).toBe(full);
      c.setCount(c.capacity);
      expect(draws(c), `${name} refilled`).toBe(full);
    }
  });

  it('draws a hundred-round belt in single figures', () => {
    const belt = createBelt('heavy-mg');
    expect(belt.capacity).toBe(100);
    expect(draws(belt)).toBeLessThan(10);
  });
});

describe('derivation', () => {
  it('makes a bigger calibre a bigger container, without being told', () => {
    const size = (c: Countable): number => {
      const box = new Vector3();
      c.object.updateWorldMatrix(true, true);
      let max = 0;
      c.object.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh && !(m as unknown as InstancedMesh).isInstancedMesh) return;
        m.geometry.computeBoundingBox();
        m.geometry.boundingBox!.getSize(box);
        max = Math.max(max, box.length());
      });
      return max;
    };
    // Same container type, same count, different calibre.
    const light = createBelt('heavy-mg', { capacity: 20 });
    const heavy = createBelt('autocannon', { capacity: 20 });
    expect(size(heavy)).toBeGreaterThan(size(light));
  });

  it('picks the container the kind actually ships in', () => {
    for (const kind of AMMO_KINDS) {
      const ready = createReady(kind);
      expect(ready.kind, kind).toBe(kind);
      expect(ready.capacity, kind).toBeGreaterThan(0);
      expect(ready.object.name, kind).toContain(AMMO[kind].container === 'box' ? 'ammobox' : AMMO[kind].container);
    }
  });
});

describe('spent brass', () => {
  it('scatters cases for anything that has one', () => {
    for (const kind of AMMO_KINDS) {
      const litter = createCasing(kind, { count: 12 });
      const has = AMMO[kind].case !== 'none' && AMMO[kind].case !== 'bagged';
      expect(draws(litter) > 0, `${kind} (${AMMO[kind].case})`).toBe(has);
    }
  });

  it('ejects nothing for a caseless round rather than inventing litter', () => {
    // A mortar bomb, an arrow and a grenade leave no brass. Scattering some
    // anyway is the kind of detail that reads as wrong to anyone who knows.
    for (const kind of ['mortar', 'arrow', 'grenade', 'artillery'] as AmmoKind[]) {
      expect(draws(createCasing(kind)), kind).toBe(0);
    }
  });

  it('is deterministic for a seed', () => {
    const at = (seed: number): number[] => {
      const p = createCasing('rifle', { seed, count: 6 });
      const out: number[] = [];
      const m = new Matrix4();
      p.object.traverse((o) => {
        const im = o as InstancedMesh;
        if (!im.isInstancedMesh) return;
        for (let i = 0; i < im.count; i++) {
          im.getMatrixAt(i, m);
          out.push(m.elements[12], m.elements[14]);
        }
      });
      return out;
    };
    expect(at(4)).toEqual(at(4));
    expect(at(4)).not.toEqual(at(5));
  });
});

describe('a sealed crate', () => {
  it('costs nothing for contents nobody can see', () => {
    const sealed = createAmmoBox('rifle');
    const open = createAmmoBox('rifle', { open: true });
    expect(draws(sealed)).toBeLessThan(draws(open));
    // It still knows what is in it.
    expect(sealed.capacity).toBe(AMMO.rifle.perContainer * 2);
  });
});
