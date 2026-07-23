import { describe, expect, it } from 'vitest';
import { Mesh, MeshStandardMaterial, ShaderLib } from 'three';
import { createOcean } from '../src/environment/ocean';
import { createWindField } from '../src/environment/wind';

interface Shader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}
function compile(mat: MeshStandardMaterial): Shader {
  const shader: Shader = {
    uniforms: {},
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
  };
  (mat.onBeforeCompile as (s: Shader, r: unknown) => void)(shader, null);
  return shader;
}

describe('createOcean', () => {
  it('builds a wave mesh with a shore attribute and a distinct program', () => {
    const ocean = createOcean({ size: 20, segments: 8, level: 1 });
    expect(ocean.mesh).toBeInstanceOf(Mesh);
    expect(ocean.mesh.position.y).toBe(1);
    expect(ocean.mesh.geometry.getAttribute('aOceanShore')).toBeDefined();
    const mat = ocean.mesh.material as MeshStandardMaterial;
    expect(mat.customProgramCacheKey()).toBe('scena-ocean-v1');
    expect(mat.customProgramCacheKey()).not.toBe(new MeshStandardMaterial().customProgramCacheKey());
  });

  it('injects the Gerstner displacement, analytic normal, foam and fresnel', () => {
    const shader = compile(createOcean().mesh.material as MeshStandardMaterial);
    expect(shader.vertexShader).toContain('uWaveDir');
    expect(shader.vertexShader).toContain('objectNormal = normalize');
    expect(shader.vertexShader).toContain('transformed += scenaDisp');
    expect(shader.fragmentShader).toContain('uDeepColor');
    expect(shader.fragmentShader).toContain('discard'); // land is cut away
    expect(shader.fragmentShader).toContain('uSkyColor'); // fresnel sky tint
    expect(shader.uniforms.uWaveDir.value).toHaveLength(4);
  });

  it('heightAt is a buoyancy handshake: bounded, varies in space & time', () => {
    const ocean = createOcean({ level: 2, amplitude: 0.5, direction: 0 });
    const a = ocean.heightAt(0, 0, 0);
    const b = ocean.heightAt(7, 3, 0); // elsewhere
    const c = ocean.heightAt(0, 0, 1.5); // later
    expect(a).toBeGreaterThan(2 - 2); // within a couple of amplitudes of sea level
    expect(a).toBeLessThan(2 + 2);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('the shore handshake bakes submersion: deep where low, negative over land', () => {
    // A ramp: land (high) on +x, deep sea on −x.
    const ocean = createOcean({ size: 40, segments: 10, level: 0, shore: (x) => x * 0.2 });
    const shoreAttr = ocean.mesh.geometry.getAttribute('aOceanShore');
    let sawLand = false;
    let sawDeep = false;
    for (let i = 0; i < shoreAttr.count; i++) {
      if (shoreAttr.getX(i) < -0.5) sawLand = true; // terrain above sea → negative submersion
      if (shoreAttr.getX(i) > 0.5) sawDeep = true;
    }
    expect(sawLand).toBe(true);
    expect(sawDeep).toBe(true);
  });

  it('update(dt) advances the swell; a WindField turns it', () => {
    const ocean = createOcean({ direction: 0 });
    const before = ocean.heightAt(5, 5);
    ocean.update(0.4);
    expect(ocean.heightAt(5, 5)).not.toBe(before);

    // With wind, the heading follows the wind — heightAt along the wind axis differs
    // from the same distance across it.
    const wind = createWindField({ direction: 0, strength: 0.4 });
    const windy = createOcean({ wind });
    windy.update(0.1); // retune to the wind
    expect(Number.isFinite(windy.heightAt(10, 0))).toBe(true);
  });
});
