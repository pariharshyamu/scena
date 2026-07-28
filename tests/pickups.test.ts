import { describe, expect, it } from 'vitest';
import { Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, Vector3 } from 'three';
import {
  createBeacon,
  createCheckpoint,
  createFinishGate,
  createPickup,
  createPickupField,
  createZone,
  type PickupKind,
} from '../src';

const KINDS: PickupKind[] = ['coin', 'gem', 'key', 'heart', 'star', 'orb', 'potion'];

describe('createPickup', () => {
  it('every kind builds a body, and the trigger is live and finite', () => {
    for (const kind of KINDS) {
      const pickup = createPickup(kind, { seed: 3 });
      expect(pickup.group.children[0].children.length, kind).toBeGreaterThan(0);
      expect(pickup.trigger.radius, kind).toBeGreaterThan(0.2);
      // The centre is a LIVE reference — move the prop, the trigger follows.
      pickup.group.position.set(7, 1, -2);
      expect(pickup.trigger.center.x).toBe(7);
      pickup.update(0.5);
      expect(Number.isFinite(pickup.group.children[0].position.y)).toBe(true);
    }
  });

  it('the gem is the gemstone payoff — transmissive, dispersive, faceted', () => {
    const gem = createPickup('gem');
    const mesh = gem.group.children[0].children[0] as Mesh;
    const material = mesh.material as MeshPhysicalMaterial;
    expect(material.transmission).toBeGreaterThan(0);
    expect(material.dispersion).toBeGreaterThan(0);
  });

  it('collect pops out, respawn shimmers back, and the states refuse nonsense', () => {
    const coin = createPickup('coin');
    expect(coin.respawn()).toBe(0); // not collected yet — nothing to respawn
    const out = coin.collect();
    expect(out).toBeCloseTo(0.35);
    expect(coin.collect()).toBe(0); // already collecting
    expect(coin.state).toBe('collecting');
    coin.update(out + 0.01);
    expect(coin.state).toBe('collected');
    expect(coin.group.children[0].visible).toBe(false);

    const back = coin.respawn();
    expect(back).toBeCloseTo(0.45);
    coin.update(back + 0.01);
    expect(coin.state).toBe('idle');
    expect(coin.group.children[0].visible).toBe(true);
    expect(coin.group.children[0].scale.x).toBeCloseTo(1, 5);
  });

  it('a field of coins must never tick in lockstep — phases are seeded apart', () => {
    const a = createPickup('coin', { seed: 1 });
    const b = createPickup('coin', { seed: 2 });
    a.update(0.3);
    b.update(0.3);
    const spinnerA = a.group.children[0];
    const spinnerB = b.group.children[0];
    expect(spinnerA.rotation.y).not.toBeCloseTo(spinnerB.rotation.y, 3);
    // And the same seed is the same coin, exactly.
    const c = createPickup('coin', { seed: 1 });
    c.update(0.3);
    expect(spinnerA.rotation.y).toBeCloseTo(c.group.children[0].rotation.y, 12);
  });
});

describe('createPickupField', () => {
  const ring = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return new Vector3(Math.cos(a) * 5, 0.8, Math.sin(a) * 5);
    });

  const scaleAt = (field: { mesh: { getMatrixAt(i: number, m: Matrix4): void } }, i: number) => {
    const m = new Matrix4();
    field.mesh.getMatrixAt(i, m);
    // r185 decompose reports zero matrices as scale 1 — read the raw column.
    return Math.hypot(m.elements[0], m.elements[1], m.elements[2]);
  };

  it('one draw call, per-index accounting, and the collected collapse', () => {
    const field = createPickupField('coin', ring(12), { seed: 4 });
    expect(field.mesh.count).toBe(12);
    expect(field.remaining).toBe(12);
    expect(field.triggers[3].index).toBe(3);

    expect(field.collect(3)).toBeCloseTo(0.35);
    expect(field.collect(3)).toBe(0); // already going
    expect(field.remaining).toBe(11);
    field.update(0.4);
    expect(field.isActive(3)).toBe(false);
    expect(scaleAt(field, 3)).toBeLessThan(0.01);
    expect(scaleAt(field, 4)).toBeGreaterThan(0.5); // its neighbour idles on

    expect(field.respawn(3)).toBeCloseTo(0.45);
    field.update(0.5);
    expect(field.remaining).toBe(12);
    expect(field.isActive(3)).toBe(true);
  });

  it('instances idle out of phase, deterministically', () => {
    const field = createPickupField('gem', ring(6), { seed: 9 });
    field.update(0.25);
    const a = new Matrix4();
    const b = new Matrix4();
    field.mesh.getMatrixAt(0, a);
    field.mesh.getMatrixAt(1, b);
    expect(a.elements).not.toEqual(b.elements);

    const again = createPickupField('gem', ring(6), { seed: 9 });
    again.update(0.25);
    const c = new Matrix4();
    again.mesh.getMatrixAt(0, c);
    expect([...c.elements]).toEqual([...a.elements]);
  });

  it('refuses composite bodies loudly — a field cannot instance a heart', () => {
    expect(() => createPickupField('heart', ring(3))).toThrow(/composite/);
  });
});

describe('markers', () => {
  it('a checkpoint pulses when upcoming, brightens when active, greens when passed', () => {
    const checkpoint = createCheckpoint({ width: 5 });
    expect(checkpoint.trigger.radius).toBe(2.5);
    const strip = checkpoint.group.children.find(
      (c) => (c as Mesh).material instanceof MeshBasicMaterial
    ) as Mesh;
    const material = strip.material as MeshBasicMaterial;

    checkpoint.update(0.3);
    const pulseA = material.opacity;
    checkpoint.update(0.7);
    expect(material.opacity).not.toBeCloseTo(pulseA, 3); // it breathes

    checkpoint.setState('active');
    checkpoint.update(0.01);
    expect(material.opacity).toBeGreaterThan(0.75);

    checkpoint.setState('passed');
    checkpoint.update(0.01);
    expect(material.color.getHex()).toBe(0x4caf6e);
    expect(material.opacity).toBeLessThan(0.5);
  });

  it('a zone turns its dashes and fills with progress, clamped', () => {
    const zone = createZone({ radius: 3 });
    expect(zone.trigger.radius).toBe(3);
    const dashes = zone.group.children[0];
    zone.update(0); // establish the seeded start phase…
    const start = dashes.rotation.y;
    zone.update(1); // …then a second of turning is 0.6 rad on top of it
    expect(dashes.rotation.y - start).toBeCloseTo(0.6);
    const fill = zone.group.children[1] as Mesh;
    zone.setProgress(0.5);
    expect(fill.scale.x).toBeCloseTo(0.5);
    zone.setProgress(7);
    expect(fill.scale.x).toBe(1);
    zone.setProgress(NaN);
    expect(fill.scale.x).toBeCloseTo(0.001);
  });

  it('a beacon breathes without ever going non-finite', () => {
    const beacon = createBeacon({ height: 6 });
    for (let i = 0; i < 50; i++) beacon.update(0.1);
    const shaft = beacon.group.children[0] as Mesh;
    expect(Number.isFinite(shaft.scale.x)).toBe(true);
    expect(shaft.scale.x).toBeGreaterThan(0.6);
    expect(shaft.scale.x).toBeLessThanOrEqual(1.001);
  });

  it('the finish gate chequers every cell exactly once', () => {
    const gate = createFinishGate({ width: 6 });
    const [whites, blacks] = gate.group.children.slice(2) as unknown as [
      { count: number },
      { count: number },
    ];
    const columns = Math.max(Math.round(6 / 0.45), 6);
    expect(whites.count + blacks.count).toBe(2 * columns);
    expect(Math.abs(whites.count - blacks.count)).toBeLessThanOrEqual(1);
  });
});
