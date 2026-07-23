import { describe, expect, it } from 'vitest';
import { Mesh, MeshStandardMaterial, PlaneGeometry, Points, ShaderLib } from 'three';
import { createGodRays, createCaustics, createBubbles, createWaterGrade } from '../src/environment/underwater';
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

describe('createBubbles', () => {
  it('builds a Points cloud of bubbles with a rise rig', () => {
    const bubbles = createBubbles({ count: 120, columns: 5, seed: 3 });
    expect(bubbles.object).toBeInstanceOf(Points);
    expect(bubbles.object.frustumCulled).toBe(false);
    expect(bubbles.object.geometry.getAttribute('position').count).toBe(120);
    expect(bubbles.object.geometry.getAttribute('aPhase').count).toBe(120);
    expect(bubbles.object.geometry.getAttribute('aScale')).toBeDefined();
    expect(bubbles.material.transparent).toBe(true);
    expect(bubbles.material.depthWrite).toBe(false);
  });

  it('rise & pop live in the vertex shader, and it advances', () => {
    const bubbles = createBubbles({ count: 30 });
    expect(bubbles.material.vertexShader).toContain('uRise');
    expect(bubbles.material.vertexShader).toContain('gl_PointSize');
    const before = bubbles.material.uniforms.uTime.value as number;
    bubbles.update(1);
    expect(bubbles.material.uniforms.uTime.value).toBeGreaterThan(before);
  });

  it('honours explicit vent sources (columns anchored in world XZ)', () => {
    const bubbles = createBubbles({ count: 4, sources: [[5, -3]], seed: 1 });
    const p = bubbles.object.geometry.getAttribute('position');
    // Every bubble sits near the single vent (± the small jitter).
    for (let i = 0; i < p.count; i++) {
      expect(Math.abs(p.getX(i) - 5)).toBeLessThan(0.5);
      expect(Math.abs(p.getZ(i) + 3)).toBeLessThan(0.5);
    }
  });
});

describe('createWaterGrade', () => {
  function compileStd(mat: MeshStandardMaterial): Shader {
    const shader: Shader = {
      uniforms: {},
      vertexShader: ShaderLib.standard.vertexShader,
      fragmentShader: ShaderLib.standard.fragmentShader,
    };
    (mat.onBeforeCompile as (s: Shader, r: unknown) => void)(shader, null);
    return shader;
  }

  it('patches a material with per-channel extinction toward the water colour', () => {
    const mat = new MeshStandardMaterial();
    const grade = createWaterGrade({ density: 0.03 });
    grade.bind(mat);
    const shader = compileStd(mat);
    expect(shader.vertexShader).toContain('vWaterWorld'); // world pos for depth
    expect(shader.fragmentShader).toContain('exp(-sigma'); // Beer-Lambert extinction
    expect(shader.fragmentShader).toContain('uWaterColor');
    expect(shader.uniforms.uWaterDensity.value).toBeCloseTo(0.03);
    expect(mat.customProgramCacheKey().endsWith('|scena-watergrade-v1')).toBe(true);
  });

  it('composes with a surface (and even caustics) as distinct programs', () => {
    const mat = createSurface('sand');
    const baseKey = mat.customProgramCacheKey();
    createCaustics().bind(mat);
    createWaterGrade().bind(mat);
    expect(mat.customProgramCacheKey()).toBe(baseKey + '|scena-caustics-v1|scena-watergrade-v1');
    const shader = compileStd(mat);
    expect(shader.vertexShader).toContain('vSurfWorldPos'); // surface
    expect(shader.fragmentShader).toContain('scenaCaustics'); // caustics
    expect(shader.fragmentShader).toContain('exp(-sigma'); // grade
  });

  it('bind is idempotent and apply grades every material under a target', () => {
    const mat = new MeshStandardMaterial();
    const grade = createWaterGrade();
    grade.bind(mat).bind(mat);
    expect(grade.materials).toHaveLength(1);
    const seabed = new Mesh(new PlaneGeometry(4, 4), createSurface('sand'));
    createWaterGrade().apply(seabed);
    expect((seabed.material as MeshStandardMaterial).customProgramCacheKey().endsWith('|scena-watergrade-v1')).toBe(true);
  });
});
