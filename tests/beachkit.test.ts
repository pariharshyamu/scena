import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  createLifeguardTower,
  createBeachUmbrella,
  createLounger,
  MIAMI_COLORS,
} from '../src';

const run = (prop: { update(dt: number): void }, seconds: number): void => {
  for (let i = 0; i < seconds * 30; i++) prop.update(1 / 30);
};

describe('the lifeguard tower', () => {
  it('stands on stilts with a deck, a roof and a way up', () => {
    const tower = createLifeguardTower({ seed: 3 });
    const deck = tower.object.getObjectByName('deck')!;
    const roof = tower.object.getObjectByName('roof')!;
    expect(deck).toBeDefined();
    expect(deck.position.y).toBeGreaterThan(1.4);
    expect(roof.position.y).toBeGreaterThan(deck.position.y + 1);
    expect(tower.obstacleRadius).toBeGreaterThan(1);
  });

  it('seats a lifeguard on the deck, with an approach', () => {
    const tower = createLifeguardTower({ seed: 3, height: 2 });
    const slot = tower.slots![0];
    expect(slot.kind).toBe('watch');
    expect(slot.approach).toBeDefined();
    const p = slot.anchor.getWorldPosition(new Vector3());
    expect(p.y).toBeGreaterThan(1.9); // up on the deck, not on the sand
    const a = slot.approach!.getWorldPosition(new Vector3());
    expect(Math.hypot(a.x - p.x, a.z - p.z)).toBeGreaterThan(1); // stand off, then climb
  });

  it('wears Miami: a pastel body and a DIFFERENT pastel trim', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const tower = createLifeguardTower({ seed });
      const colors = new Set<number>();
      tower.object.traverse((o) => {
        const mat = (o as import('three').Mesh).material as
          | import('three').MeshStandardMaterial
          | undefined;
        if (mat && 'color' in mat) colors.add(mat.color.getHex());
      });
      const pastels = [...colors].filter((c) => MIAMI_COLORS.includes(c));
      expect(pastels.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('flies a pennant that is cloth, and it moves', () => {
    const tower = createLifeguardTower({ seed: 3, pennant: true });
    const flag = tower.object.getObjectByName('pennant') as import('three').Mesh;
    expect(flag).toBeDefined();
    const mat = flag.material as import('three').MeshStandardMaterial;
    const uniforms = mat.userData.waveUniforms as { uTime: { value: number } };
    const before = uniforms.uTime.value;
    run(tower, 1);
    expect(uniforms.uTime.value).toBeGreaterThan(before);
    expect(createLifeguardTower({ seed: 3, pennant: false }).object.getObjectByName('pennant'))
      .toBeUndefined();
  });
});

describe('the beach umbrella', () => {
  it('is a striped canopy on a pole, buried in the sand', () => {
    const umbrella = createBeachUmbrella({ seed: 4, colors: [0x35cfc9, 0xff6f91] });
    const canopy = umbrella.object.getObjectByName('canopy') as import('three').Mesh;
    expect(canopy).toBeDefined();
    const colors = canopy.geometry.getAttribute('color');
    // Alternating gores: exactly two distinct rim colours.
    const seen = new Set<string>();
    for (let i = 1; i < colors.count; i++) {
      seen.add(`${colors.getX(i).toFixed(3)},${colors.getY(i).toFixed(3)}`);
    }
    expect(seen.size).toBe(2);
  });

  it('never stops moving, and never much', () => {
    const umbrella = createBeachUmbrella({ seed: 4, tilt: 0.1 });
    const lean = umbrella.object.children[0];
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 20 * 30; i++) {
      umbrella.update(1 / 30);
      min = Math.min(min, lean.rotation.z);
      max = Math.max(max, lean.rotation.z);
    }
    expect(max - min).toBeGreaterThan(0.01);
    expect(max - min).toBeLessThan(0.09);
    expect((min + max) / 2).toBeCloseTo(0.1, 1); // it sways ABOUT its lean
  });

  it('leans: nobody plants a parasol plumb', () => {
    const tilts = Array.from({ length: 6 }, (_, i) =>
      createBeachUmbrella({ seed: i + 1 }).object.children[0].rotation.z
    );
    expect(tilts.every((t) => Math.abs(t) > 0.001)).toBe(true);
    expect(new Set(tilts.map((t) => t.toFixed(4))).size).toBe(6);
  });
});

describe('the lounger', () => {
  it('reclines to its preset, and the presets differ', () => {
    const flat = createLounger({ seed: 5, recline: 'flat' });
    const reading = createLounger({ seed: 5, recline: 'reading' });
    const upright = createLounger({ seed: 5, recline: 'upright' });
    const back = (l: typeof flat) => l.object.getObjectByName('back')!.rotation.x;
    expect(back(flat)).toBeLessThan(back(reading));
    expect(back(reading)).toBeLessThan(back(upright));
    expect(back(flat)).toBeLessThan(0.15);
  });

  it('offers a body a place to lie, with an approach beside it', () => {
    const flat = createLounger({ seed: 5, recline: 'flat' });
    expect(flat.slots![0].pose).toBe('sleep');
    expect(createLounger({ seed: 5, recline: 'upright' }).slots![0].pose).toBe('sit');
    expect(flat.slots![0].approach).toBeDefined();
  });

  it('has a slatted bed, and sometimes a towel', () => {
    const withTowel = createLounger({ seed: 5, towel: true });
    expect(withTowel.object.getObjectByName('bed')!.children.length).toBeGreaterThan(4);
    expect(withTowel.object.getObjectByName('towel')).toBeDefined();
    expect(createLounger({ seed: 5, towel: false }).object.getObjectByName('towel')).toBeUndefined();
  });

  it('is deterministic across the kit', () => {
    const build = (seed: number) => [
      createLifeguardTower({ seed }),
      createBeachUmbrella({ seed }),
      createLounger({ seed }),
    ];
    const a = build(12);
    const b = build(12);
    a.forEach((prop, i) => {
      let ca = 0;
      let cb = 0;
      prop.object.traverse(() => ca++);
      b[i].object.traverse(() => cb++);
      expect(ca).toBe(cb);
    });
  });
});
