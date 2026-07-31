import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import {
  AMMO,
  AMMO_KINDS,
  ballisticsOf,
  chargeVelocity,
  createAmmoDump,
  createBandolier,
  createCharge,
  createLoader,
  createPowderKeg,
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
 * Only the meshes named `counted`. A bandolier's strap and a belt's links are
 * instanced too, and taking the max across everything counted 24 strap
 * segments as 24 rounds on a twelve-loop bandolier.
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
    if (!im.isInstancedMesh || im.name !== 'counted') return;
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
      // A stand of grape is the heaviest at 312 — three balls, a spindle and
      // a base plate — and a hundred of those is 31k triangles, which is a
      // machine-gun position's worth of litter and nothing to worry about.
      expect(roundTriangles(kind), kind).toBeLessThan(340);
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


describe('loaders — the state between the crate and the weapon', () => {
  it('builds all three styles, counting', () => {
    for (const style of ['stripper', 'speedloader', 'en-bloc'] as const) {
      const l = createLoader('rifle', { style });
      expect(l.style, style).toBe(style);
      expect(l.count, style).toBe(l.capacity);
      expect(visible(l), style).toBe(l.capacity);
      l.setCount(2);
      expect(visible(l), style).toBe(2);
    }
  });

  it('holds what a clip holds, not what the magazine under it takes', () => {
    // A stripper clip is 5 rounds whether it is feeding a 5-round Mauser or a
    // 30-round magazine, so the capacity cannot come from the kind.
    expect(createLoader('rifle', { style: 'stripper' }).capacity).toBe(5);
    expect(AMMO.rifle.perContainer).toBe(30);
    expect(createLoader('pistol', { style: 'speedloader' }).capacity).toBe(6);
    expect(createLoader('rifle', { style: 'en-bloc' }).capacity).toBe(8);
  });

  it('sizes the speedloader ring from the rounds', () => {
    // A .38 loader and a 12-gauge one are different objects, and neither was
    // drawn: the ring's circumference is the rounds laid round it.
    const small = createLoader('pistol', { style: 'speedloader' });
    const big = createLoader('shotgun', { style: 'speedloader' });
    expect(big.obstacleRadius).toBeGreaterThan(small.obstacleRadius);
  });

  it('costs the same empty as full, like every other container', () => {
    const l = createLoader('rifle', { style: 'stripper' });
    const full = draws(l);
    l.setCount(0);
    expect(draws(l)).toBe(full);
  });
});

describe('a bandolier', () => {
  it('is worn, and says where', () => {
    const b = createBandolier('shotgun', { loops: 12 });
    expect(b.socket).toBe('chest');
    expect(b.capacity).toBe(12);
    expect(visible(b)).toBe(12);
  });

  it('empties like anything else', () => {
    const b = createBandolier('rifle', { loops: 10 });
    for (let i = 0; i < 10; i++) expect(b.consume()).toBe(true);
    expect(b.consume()).toBe(false);
    expect(visible(b)).toBe(0);
  });

  it('drapes rather than running straight', () => {
    // A straight strap is the tell that this was drawn instead of laid out.
    const sagged = createBandolier('rifle', { loops: 9, sag: 0.2 });
    const flat = createBandolier('rifle', { loops: 9, sag: 0 });
    const lowest = (c: ReturnType<typeof createBandolier>): number => {
      let y = Infinity;
      const m = new Matrix4();
      c.object.traverse((o) => {
        const im = o as InstancedMesh;
        if (!im.isInstancedMesh) return;
        for (let i = 0; i < im.count; i++) {
          im.getMatrixAt(i, m);
          if (im.name === 'counted' && Math.abs(m.elements[0]) > 1e-6) {
          y = Math.min(y, m.elements[13]);
        }
        }
      });
      return y;
    };
    expect(lowest(sagged)).toBeLessThan(lowest(flat) - 0.1);
  });
});

describe('propellant', () => {
  it('exists only for bag-loaded kinds', () => {
    // Asking for a charge for a rifle round is asking for something that does
    // not exist. Inventing one would be the same lie as inventing brass for a
    // caseless round.
    expect(createCharge('artillery').capacity).toBeGreaterThan(0);
    expect(createCharge('rifle').capacity).toBe(0);
    expect(createCharge('rifle').consume()).toBe(false);
  });

  it('shows the increments it is loaded with', () => {
    const c = createCharge('artillery', { capacity: 7, increments: 4 });
    expect(c.count).toBe(4);
    expect(visible(c)).toBe(4);
  });

  it('is a SQUARE ROOT, not a slider', () => {
    // Muzzle energy goes with the propellant burnt and velocity with its
    // square root, so a half charge is 71% of full velocity and not 50%.
    // Linear here is the difference between artillery and a volume knob.
    const full = chargeVelocity('artillery', 7);
    const half = chargeVelocity('artillery', 3.5);
    expect(full).toBe(AMMO.artillery.muzzle);
    expect(half / full).toBeCloseTo(Math.SQRT1_2, 3);
    expect(chargeVelocity('artillery', 0)).toBe(0);
  });

  it('reaches ballisticsOf, so the two cannot drift', () => {
    expect(ballisticsOf('artillery', { increments: 3.5 }).speed).toBeCloseTo(
      chargeVelocity('artillery', 3.5),
      6
    );
    // A cartridge kind ignores it — its propellant is not a gunner's decision.
    expect(ballisticsOf('rifle', { increments: 1 }).speed).toBe(AMMO.rifle.muzzle);
  });

  it('builds a keg, hooped', () => {
    expect(draws(createPowderKeg())).toBeGreaterThan(1);
    expect(draws(createPowderKeg({ open: true }))).toBeGreaterThan(draws(createPowderKeg()));
  });
});

describe('an ammunition dump', () => {
  it('is pallet scale and still single figures', () => {
    // Thirty-six wooden crates is thirty-six draws if a level loops them, and
    // that is the trap this function exists to close.
    for (const kind of ['rifle', 'artillery', 'cannonball'] as AmmoKind[]) {
      const dump = createAmmoDump(kind, { seed: 2 });
      expect(dump.crates, kind).toBe(36);
      expect(dump.rounds, kind).toBeGreaterThan(0);
      expect(draws(dump), kind).toBeLessThan(10);
    }
  });

  it('scales with what it is asked for', () => {
    const small = createAmmoDump('rifle', { pallets: 2, perPallet: 3 });
    const big = createAmmoDump('rifle', { pallets: 8, perPallet: 8 });
    expect(small.crates).toBe(6);
    expect(big.crates).toBe(64);
    // ...and NOT in draw calls, which is the whole point.
    expect(draws(big)).toBeLessThanOrEqual(draws(small) + 1);
  });

  it('is deterministic for a seed', () => {
    const a = createAmmoDump('rifle', { seed: 9 });
    const b = createAmmoDump('rifle', { seed: 9 });
    expect(a.crates).toBe(b.crates);
    expect(a.obstacleRadius).toBeCloseTo(b.obstacleRadius, 9);
  });

  it('stands the propellant beside the kinds that load separately', () => {
    // A dump of 155 mm shells with no charge bags is showing half of what it
    // takes to fire one.
    expect(draws(createAmmoDump('artillery', { seed: 3 }))).toBeGreaterThan(
      draws(createAmmoDump('tank', { seed: 3 }))
    );
  });
});

describe('the smoothbore loads', () => {
  it('share a bore with round shot and are nothing like it', () => {
    expect(AMMO.canister.calibre).toBe(AMMO.cannonball.calibre);
    expect(AMMO.grapeshot.calibre).toBe(AMMO.cannonball.calibre);
    // Lighter loads, and slower for it — a tin of balls is a poor gas seal.
    expect(AMMO.canister.mass).toBeLessThan(AMMO.cannonball.mass);
    expect(AMMO.canister.muzzle).toBeLessThan(AMMO.cannonball.muzzle);
  });

  it('build, and look like themselves', () => {
    for (const kind of ['canister', 'grapeshot', 'rifle-grenade'] as AmmoKind[]) {
      expect(draws(createRound(kind)), kind).toBeGreaterThan(1);
      expect(createCasing(kind).object.children.length, kind).toBe(0);
    }
  });
});

describe('spent links', () => {
  it('come with the brass on belt-fed kinds and nowhere else', () => {
    // A machine-gun position without links is one where somebody swept up
    // half the floor.
    expect(draws(createCasing('heavy-mg', { count: 20 }))).toBe(2);
    expect(draws(createCasing('rifle', { count: 20 }))).toBe(1);
  });
});
