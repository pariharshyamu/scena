import { describe, expect, it } from 'vitest';
import { MeshStandardMaterial, ShaderLib, Vector2 } from 'three';
import { createWindField, applyWind } from '../src/environment/wind';
import { createSurface } from '../src/materials/surface';
import { createTree } from '../src/props/tree';
import { createGrassTuft } from '../src/props/grass';

interface Shader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

/** Run a material's onBeforeCompile against a copy of the real three shader. */
function compile(mat: MeshStandardMaterial): Shader {
  const shader: Shader = {
    uniforms: {},
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
  };
  (mat.onBeforeCompile as (s: Shader, r: unknown) => void)(shader, null);
  return shader;
}

describe('createWindField', () => {
  it('exposes shared uniforms and a normalized direction', () => {
    const wind = createWindField({ direction: 90, strength: 0.4 });
    expect(wind.uniforms.uWindDir).toBeDefined();
    expect(wind.uniforms.uWindStrength.value).toBe(0.4);
    // 90° → +Z.
    expect((wind.direction as Vector2).x).toBeCloseTo(0, 5);
    expect((wind.direction as Vector2).y).toBeCloseTo(1, 5);
    expect(wind.direction.length()).toBeCloseTo(1, 6);
  });

  it('binds a material: injects the vertex bend and a composable cache key', () => {
    const wind = createWindField();
    const mat = new MeshStandardMaterial();
    wind.bind(mat, { height: 4, anchor: 1 });
    const shader = compile(mat);
    // Vertex bend wired into the real begin_vertex chunk.
    expect(ShaderLib.standard.vertexShader).toContain('#include <begin_vertex>');
    expect(shader.vertexShader).toContain('uWindDir');
    expect(shader.vertexShader).toContain('transformed +=');
    // Per-material + shared uniforms present.
    expect(shader.uniforms.uWindHeight.value).toBe(4);
    expect(shader.uniforms.uWindAnchor.value).toBe(1);
    expect(shader.uniforms.uWindTime).toBe(wind.uniforms.uWindTime); // shared object
    // Key ends in the wind tag and differs from an unbound material's key.
    expect(mat.customProgramCacheKey().endsWith('|scena-wind-v1')).toBe(true);
    expect(mat.customProgramCacheKey()).not.toBe(new MeshStandardMaterial().customProgramCacheKey());
  });

  it('composes with a surface material — distinct program from either alone', () => {
    const surf = createSurface('bark', { color: 0x5a4535 });
    const wind = createWindField();
    wind.bind(surf, { height: 4 });
    const shader = compile(surf);
    // Both patches fired: wind bend AND surface noise.
    expect(shader.vertexShader).toContain('uWindDir');
    expect(shader.vertexShader).toContain('vSurfWorldPos');
    // Cache key nests both, so it can't collide with surface-only or plain+wind.
    expect(surf.customProgramCacheKey()).toBe('scena-surface-v5|scena-wind-v1');
    expect(surf.customProgramCacheKey()).not.toBe(new MeshStandardMaterial().customProgramCacheKey());
  });

  it('bind is idempotent — a material is never double-patched', () => {
    const wind = createWindField();
    const mat = new MeshStandardMaterial();
    wind.bind(mat);
    wind.bind(mat);
    expect(wind.materials.filter((m) => m === mat).length).toBe(1);
  });

  it('setDirection / setStrength update the shared uniforms live', () => {
    const wind = createWindField({ direction: 0, strength: 0.2 });
    wind.setStrength(0.55).setDirection(180);
    expect(wind.uniforms.uWindStrength.value).toBe(0.55);
    expect((wind.direction as Vector2).x).toBeCloseTo(-1, 5);
  });

  it('sample() gives a CPU wind vector along the wind, varying with place & time', () => {
    const wind = createWindField({ direction: 0, strength: 0.5, gust: 0.8 });
    const a = wind.sample(0, 0, 0);
    const b = wind.sample(3, 0, 0); // downwind → different gust phase
    const c = wind.sample(0, 0, 1); // later → different phase
    expect(a.y).toBeCloseTo(0, 6); // direction is +X, so no Z component
    expect(a.x).not.toBe(b.x);
    expect(a.x).not.toBe(c.x);
  });

  it('update(dt) advances the clock (manual mode)', () => {
    const wind = createWindField();
    expect(wind.uniforms.uWindTime.value).toBe(0);
    wind.update(0.5);
    wind.update(0.5);
    expect(wind.uniforms.uWindTime.value).toBeCloseTo(1, 6);
  });
});

describe('wind-driven flora', () => {
  it('a tree built with wind binds its foliage (canopy) but not the trunk', () => {
    const wind = createWindField();
    const before = wind.materials.length;
    createTree({ seed: 3, wind });
    // Exactly one material (the foliage) got bound; the trunk stayed planted.
    expect(wind.materials.length).toBe(before + 1);
    expect(wind.materials[wind.materials.length - 1].customProgramCacheKey()).toContain('scena-wind-v1');
  });

  it('grass tufts sway when given a wind field', () => {
    const wind = createWindField();
    createGrassTuft({ seed: 5, wind });
    expect(wind.materials.length).toBeGreaterThan(0);
  });
});

describe('applyWind (one-call path)', () => {
  it('returns a field, patches materials, and stays update()-compatible', () => {
    const tree = createTree({ seed: 1 });
    const wind = applyWind(tree.object, { strength: 0.3, height: 4, anchor: 1 });
    expect(wind.materials.length).toBeGreaterThan(0);
    for (const m of wind.materials) expect(m.onBeforeCompile).toBeTypeOf('function');
    wind.update(0.5); // no throw; advances internally
    expect(wind.uniforms.uWindTime.value).toBeCloseTo(0.5, 6);
    // The returned field can be sampled and shared.
    expect(wind.sample(0, 0)).toBeInstanceOf(Vector2);
  });
});
