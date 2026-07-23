import { describe, expect, it } from 'vitest';
import { InstancedMesh, MeshStandardMaterial, ShaderLib, Vector3 } from 'three';
import { createFlock } from '../src/environment/flock';

interface Shader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
}
function compile(mat: MeshStandardMaterial): Shader {
  const shader: Shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader };
  (mat.onBeforeCompile as (s: Shader, r: unknown) => void)(shader, null);
  return shader;
}

describe('createFlock', () => {
  it('builds one InstancedMesh with a per-instance flap phase', () => {
    const flock = createFlock({ type: 'birds', count: 40, seed: 1 });
    expect(flock.object).toBeInstanceOf(InstancedMesh);
    expect(flock.object.count).toBe(40);
    expect(flock.positions).toHaveLength(40);
    expect(flock.object.geometry.getAttribute('aPhase').count).toBe(40); // instanced
    expect(flock.object.geometry.getAttribute('aFlap')).toBeDefined();
  });

  it('the material beats wings/tail in the vertex shader, its own program', () => {
    const flock = createFlock({ type: 'fish', count: 10 });
    const mat = flock.object.material as MeshStandardMaterial;
    const shader = compile(mat);
    expect(shader.vertexShader).toContain('aFlap');
    expect(shader.vertexShader).toContain('sin(uTime * uFlapSpeed');
    expect(shader.uniforms.uFishMode.value).toBe(1); // fish sway mode
    expect(mat.customProgramCacheKey()).toBe('scena-flock-v1');
    expect(mat.customProgramCacheKey()).not.toBe(new MeshStandardMaterial().customProgramCacheKey());
  });

  it('is deterministic per seed and starts inside the volume', () => {
    const a = createFlock({ seed: 7, count: 30, center: [0, 10, 0], bounds: 5 });
    const b = createFlock({ seed: 7, count: 30, center: [0, 10, 0], bounds: 5 });
    expect(a.positions[0].toArray()).toEqual(b.positions[0].toArray());
    for (const p of a.positions) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(5.001);
      expect(Math.abs(p.y - 10)).toBeLessThanOrEqual(5.001);
    }
  });

  it('the boids move when stepped, and stay finite', () => {
    const flock = createFlock({ seed: 2, count: 30, speed: 6 });
    const before = flock.positions[0].clone();
    flock.update(0.1);
    flock.update(0.1);
    expect(flock.positions[0].distanceTo(before)).toBeGreaterThan(0);
    for (const p of flock.positions) {
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
    }
  });

  it('a wandering flock is held near its volume (soft bounds pull it back)', () => {
    const flock = createFlock({ seed: 3, count: 40, center: [0, 12, 0], bounds: [10, 4, 10], speed: 8 });
    for (let i = 0; i < 200; i++) flock.update(0.05); // ~10s
    const centre = new Vector3();
    for (const p of flock.positions) centre.add(p);
    centre.multiplyScalar(1 / flock.count);
    // The flock's centre of mass should not have wandered far from its volume.
    expect(centre.distanceTo(new Vector3(0, 12, 0))).toBeLessThan(14);
  });
});
