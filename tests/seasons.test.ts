import { describe, expect, it } from 'vitest';
import { MeshStandardMaterial } from 'three';
import { createSeasons } from '../src/environment/seasons';
import { createTree } from '../src/props/tree';

describe('createSeasons', () => {
  it('starts settled on its initial season and exposes shared grade uniforms', () => {
    const s = createSeasons({ initial: 'summer' });
    expect(s.season).toBe('summer');
    // Summer is the neutral baseline — no tint, unit saturation/brightness.
    expect(s.uniforms.uSeasonTintAmt.value).toBeCloseTo(0);
    expect(s.uniforms.uSeasonSat.value).toBeCloseTo(1);
    expect(s.uniforms.uSeasonBright.value).toBeCloseTo(1);
  });

  it('binds a material once (idempotent) and composes onto its cache key', () => {
    const s = createSeasons();
    const m = new MeshStandardMaterial();
    const baseKey = m.customProgramCacheKey();
    s.bind(m).bind(m); // twice
    expect(s.materials.length).toBe(1);
    expect(m.customProgramCacheKey().endsWith('|scena-season-v1')).toBe(true);
    expect(m.customProgramCacheKey()).not.toBe(baseKey);
    // The patch injects the season grade into the fragment shader.
    const shader = { uniforms: {}, fragmentShader: '#include <common>\n#include <color_fragment>' } as unknown as {
      uniforms: Record<string, unknown>;
      fragmentShader: string;
    };
    (m.onBeforeCompile as (s: unknown, r: unknown) => void)(shader, undefined);
    expect(shader.fragmentShader).toContain('uSeasonTint');
    expect('uSeasonSat' in shader.uniforms).toBe(true);
  });

  it('apply() re-grades only tagged foliage, leaving the trunk untouched', () => {
    const oak = createTree({ species: 'oak', seed: 3 });
    const s = createSeasons();
    s.apply(oak.object);
    // The oak has one foliage material (tagged) and one trunk material (not).
    expect(s.materials.length).toBe(1);
    expect((s.materials[0].userData as { scenaFoliage?: boolean }).scenaFoliage).toBe(true);
  });

  it('cross-fades toward autumn: tint amount rises, brightness settles at the target', () => {
    const s = createSeasons({ initial: 'summer' });
    s.set('autumn', { fade: 4 });
    for (let i = 0; i < 100; i++) s.update(0.05); // ~5s, past the fade
    expect(s.season).toBe('autumn');
    expect(s.uniforms.uSeasonTintAmt.value).toBeCloseTo(0.62, 1);
    expect(s.uniforms.uSeasonBright.value).toBeCloseTo(0.95, 1);
  });

  it('is a genuine fade — partway through, the grade sits between the two seasons', () => {
    const s = createSeasons({ initial: 'summer' });
    s.set('winter', { fade: 4 });
    for (let i = 0; i < 20; i++) s.update(0.05); // 1s of a 4s fade
    const sat = s.uniforms.uSeasonSat.value as number;
    // Summer sat 1.0 → winter sat 0.35; midway it's between.
    expect(sat).toBeLessThan(1);
    expect(sat).toBeGreaterThan(0.35);
  });

  it('honours custom grade overrides', () => {
    const s = createSeasons({ initial: 'summer', grades: { autumn: { brightness: 0.5 } } });
    s.set('autumn', { fade: 1 });
    for (let i = 0; i < 40; i++) s.update(0.05);
    expect(s.uniforms.uSeasonBright.value).toBeCloseTo(0.5, 1);
  });
});
