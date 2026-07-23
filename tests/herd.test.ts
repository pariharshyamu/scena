import { describe, expect, it } from 'vitest';
import { InstancedMesh, MeshStandardMaterial, ShaderLib, Vector3 } from 'three';
import { createHerd } from '../src/environment/herd';

interface Shader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
}
function compile(mat: MeshStandardMaterial): Shader {
  const shader: Shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader };
  (mat.onBeforeCompile as (s: Shader, r: unknown) => void)(shader, null);
  return shader;
}

describe('createHerd', () => {
  it('builds one InstancedMesh with the per-instance gait rig', () => {
    const herd = createHerd({ type: 'deer', count: 10, seed: 1 });
    expect(herd.object).toBeInstanceOf(InstancedMesh);
    expect(herd.object.count).toBe(10);
    expect(herd.positions).toHaveLength(10);
    // Per-instance gait phase + live movement amount are instanced attributes.
    expect(herd.object.geometry.getAttribute('aPhase').count).toBe(10);
    expect(herd.object.geometry.getAttribute('aMove').count).toBe(10);
    // Per-vertex leg rig.
    expect(herd.object.geometry.getAttribute('aHipY')).toBeDefined();
    expect(herd.object.geometry.getAttribute('aLegPhase')).toBeDefined();
    expect(herd.object.geometry.getAttribute('aHead')).toBeDefined();
  });

  it('the material strides legs and dips the head in its own vertex program', () => {
    const herd = createHerd({ type: 'sheep', count: 8 });
    const mat = herd.object.material as MeshStandardMaterial;
    const shader = compile(mat);
    expect(shader.vertexShader).toContain('aLegPhase');
    expect(shader.vertexShader).toContain('uGaitSpeed');
    expect(shader.vertexShader).toContain('aHead'); // graze dip
    expect(mat.customProgramCacheKey()).toBe('scena-herd-v1');
    expect(mat.customProgramCacheKey()).not.toBe(new MeshStandardMaterial().customProgramCacheKey());
  });

  it('clamps every animal to the ground handshake', () => {
    const ground = (x: number, z: number): number => Math.sin(x * 0.2) + Math.cos(z * 0.2) + 5;
    const herd = createHerd({ count: 12, seed: 4, ground });
    // Standing height is constant, so (y - ground) is the same for every animal.
    const offsets = herd.positions.map((p) => p.y - ground(p.x, p.z));
    for (const o of offsets) expect(o).toBeCloseTo(offsets[0], 5);
    expect(offsets[0]).toBeGreaterThan(0); // feet on the ground, body above
    // Still clamped after walking over the varying ground.
    for (let i = 0; i < 30; i++) herd.update(0.05);
    for (const p of herd.positions) expect(p.y).toBeCloseTo(ground(p.x, p.z) + offsets[0], 4);
  });

  it('is deterministic per seed and the animals move when stepped', () => {
    const a = createHerd({ seed: 7, count: 10 });
    const b = createHerd({ seed: 7, count: 10 });
    expect(a.positions[0].toArray()).toEqual(b.positions[0].toArray());
    const before = a.positions.map((p) => p.clone());
    for (let i = 0; i < 40; i++) a.update(0.05);
    let moved = 0;
    for (let i = 0; i < a.count; i++) if (a.positions[i].distanceTo(before[i]) > 0.01) moved++;
    expect(moved).toBeGreaterThan(0); // at least some walk (others may be grazing)
    for (const p of a.positions) expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
  });

  it('a wandering herd is held near its grazing ground', () => {
    const herd = createHerd({ seed: 3, count: 14, center: [0, 0], radius: [10, 10], speed: 2 });
    for (let i = 0; i < 400; i++) herd.update(0.05); // ~20s
    const centre = new Vector3();
    for (const p of herd.positions) centre.add(p);
    centre.multiplyScalar(1 / herd.count);
    expect(Math.hypot(centre.x, centre.z)).toBeLessThan(12);
  });
});
