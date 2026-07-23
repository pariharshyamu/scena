import { describe, expect, it } from 'vitest';
import { Mesh, MeshStandardMaterial, PlaneGeometry, ShaderLib } from 'three';
import { createGodRays, createCaustics } from '../src/environment/underwater';
import { createSurface } from '../src/materials/surface';

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

describe('createGodRays', () => {
  it('builds one additive shaft mesh with the ray rig', () => {
    const rays = createGodRays({ count: 12, seed: 2 });
    expect(rays.object).toBeInstanceOf(Mesh);
    expect(rays.object.frustumCulled).toBe(false);
    // Two crossed quads (8 verts, 4 tris = 12 indices) per shaft.
    expect(rays.object.geometry.getAttribute('position').count).toBe(12 * 8);
    expect(rays.object.geometry.getIndex()!.count).toBe(12 * 12);
    expect(rays.object.geometry.getAttribute('aRayV')).toBeDefined();
    expect(rays.material.transparent).toBe(true);
    expect(rays.material.depthWrite).toBe(false);
  });

  it('the shaft shader wavers and fades from the surface', () => {
    const rays = createGodRays({ count: 4 });
    expect(rays.material.vertexShader).toContain('uSway');
    expect(rays.material.fragmentShader).toContain('uOpacity');
    rays.setOpacity(0.3);
    expect(rays.material.uniforms.uOpacity.value).toBeCloseTo(0.3);
    const before = rays.material.uniforms.uTime.value as number;
    rays.update(1);
    expect(rays.material.uniforms.uTime.value).toBeGreaterThan(before);
  });
});

describe('createCaustics', () => {
  it('patches a plain material to add a caustic network to emissive, its own program', () => {
    const mat = new MeshStandardMaterial();
    const caustics = createCaustics({ intensity: 0.4 });
    caustics.bind(mat);
    const shader = compile(mat);
    expect(shader.vertexShader).toContain('vCausticWorld');
    expect(shader.fragmentShader).toContain('scenaCaustics');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance +=');
    expect(shader.uniforms.uCausticIntensity.value).toBeCloseTo(0.4);
    expect(mat.customProgramCacheKey().endsWith('|scena-caustics-v1')).toBe(true);
    expect(mat.customProgramCacheKey()).not.toBe(new MeshStandardMaterial().customProgramCacheKey());
  });

  it('composes with a SCENA surface material (distinct program, both patches present)', () => {
    const mat = createSurface('sand');
    const baseKey = mat.customProgramCacheKey();
    const caustics = createCaustics();
    caustics.bind(mat);
    // Distinct program: surface + caustics, not surface alone.
    expect(mat.customProgramCacheKey()).toBe(baseKey + '|scena-caustics-v1');
    expect(mat.customProgramCacheKey()).not.toBe(baseKey);
    const shader = compile(mat);
    expect(shader.fragmentShader).toContain('scenaCaustics'); // caustics patch ran
    expect(shader.vertexShader).toContain('vSurfWorldPos'); // surface patch also ran
  });

  it('bind is idempotent per material', () => {
    const mat = new MeshStandardMaterial();
    const caustics = createCaustics();
    caustics.bind(mat).bind(mat).bind(mat);
    expect(caustics.materials).toHaveLength(1);
  });

  it('apply binds every material under a target and drives the clock', () => {
    const seabed = new Mesh(new PlaneGeometry(4, 4), createSurface('sand'));
    const caustics = createCaustics();
    caustics.apply(seabed);
    expect(caustics.materials.length).toBeGreaterThanOrEqual(1);
    const before = caustics.uniforms.uCausticTime.value as number;
    caustics.update(0.5);
    expect(caustics.uniforms.uCausticTime.value).toBeGreaterThan(before);
  });
});
