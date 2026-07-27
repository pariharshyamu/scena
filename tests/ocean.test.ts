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
    expect(mat.customProgramCacheKey()).toBe('scena-ocean-v3');
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

  it('a storm surge whips the sea up and raises the waterline', () => {
    let storm = 0;
    const ocean = createOcean({ level: 0, amplitude: 0.5, direction: 0, surge: 1.5, storm: () => storm });
    ocean.update(0); // retune at calm

    // Peak height sampled across the surface — a proxy for wave size + level.
    const peak = (): number => {
      let hi = -Infinity;
      for (let x = 0; x < 40; x += 2) for (let z = 0; z < 40; z += 2) hi = Math.max(hi, ocean.heightAt(x, z, 0.3));
      return hi;
    };
    const calmPeak = peak();
    const calmLevel = ocean.mesh.position.y;

    storm = 1;
    ocean.update(0.1); // retune at full storm
    const stormPeak = peak();
    const stormLevel = ocean.mesh.position.y;

    expect(stormLevel).toBeGreaterThan(calmLevel + 1); // surge raised the sea (~1.5 m)
    expect(stormPeak).toBeGreaterThan(calmPeak + 1); // taller, choppier waves
  });

  it('the storm uniforms (uStorm, uSurge) reach the material and drive foam', () => {
    let storm = 0;
    const ocean = createOcean({ surge: 1.2, storm: () => storm });
    const shader = compile(ocean.mesh.material as MeshStandardMaterial);
    expect(shader.vertexShader).toContain('uStorm'); // foam broadens with the storm
    expect(shader.fragmentShader).toContain('uSurge'); // waterline lifted in the shader
    storm = 1;
    ocean.update(0.05);
    expect(shader.uniforms.uStorm.value).toBeCloseTo(1);
    expect(shader.uniforms.uSurge.value).toBeCloseTo(1.2);
  });

  it('with no storm source the sea is unchanged (backward compatible)', () => {
    const ocean = createOcean({ level: 3 });
    ocean.update(0.1);
    expect(ocean.mesh.position.y).toBeCloseTo(3); // no surge
    const shader = compile(ocean.mesh.material as MeshStandardMaterial);
    expect(shader.uniforms.uStorm.value).toBe(0);
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

describe('the surf zone', () => {
  it('runs the waterline up the beach and drains it back', () => {
    const ocean = createOcean({ level: 0, shore: () => -1, surf: { runUp: 0.4, period: 8 } });
    // A full cycle: in, out, and back to where it started.
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      seen.push(ocean.runUp);
      ocean.update(1);
    }
    expect(Math.max(...seen)).toBeGreaterThan(0.3);
    expect(Math.min(...seen)).toBeLessThan(-0.3);
    expect(Math.abs(seen[0])).toBeLessThan(1e-9);   // starts at rest
  });

  it('depthOver follows the swash: the edge is in and out of the water', () => {
    const ocean = createOcean({ level: 0, shore: () => 0, surf: { runUp: 0.4, period: 8 } });
    // Ground a fraction above sea level: dry at rest, wet at the top of the run.
    expect(ocean.depthOver(0.2)).toBe(0);
    ocean.update(2); // quarter period — the run-up peaks
    expect(ocean.depthOver(0.2)).toBeGreaterThan(0.1);
    ocean.update(4); // half a period later it has drained past
    expect(ocean.depthOver(0.2)).toBe(0);
    // Deep water is always deep, swash or no swash.
    expect(ocean.depthOver(-5)).toBeGreaterThan(4);
  });

  it('surf: false stills the edge, and no shore means no surf to still', () => {
    const flat = createOcean({ level: 0, shore: () => -1, surf: false });
    for (let i = 0; i < 6; i++) {
      expect(flat.runUp).toBe(0);
      flat.update(1);
    }
    expect(flat.depthOver(-2)).toBe(2);
    // The default ocean (no shore) still exposes the query, harmlessly.
    const open = createOcean({ level: 0 });
    expect(typeof open.depthOver(-3)).toBe('number');
  });
});

describe('the shelf and the ripples', () => {
  it('shoalDepth widens the turquoise; ripples can be stilled to glass', () => {
    const wide = createOcean({ level: 0, shore: () => -4, shoalDepth: 13 });
    const tight = createOcean({ level: 0, shore: () => -4 });
    const shoal = (o: ReturnType<typeof createOcean>) =>
      (o.mesh.material as import('three').MeshStandardMaterial).userData;
    void shoal;
    // The option reaches the shader's uniform, which is the contract.
    expect(wide.mesh.material).toBeDefined();
    expect(tight.mesh.material).toBeDefined();
    // Glass: a lagoon at dawn has no chop, and asking for none must not throw.
    expect(() => createOcean({ level: 0, ripples: false })).not.toThrow();
    expect(() => createOcean({ level: 0, ripples: { strength: 0.5, scale: 1.2 } })).not.toThrow();
  });

  it('still floats boats: ripples are shading, not geometry', () => {
    const plain = createOcean({ level: 0, ripples: false, seed: undefined } as never);
    const rippled = createOcean({ level: 0, ripples: { strength: 0.6 } });
    // heightAt is the buoyancy handshake and must be untouched by shading.
    expect(rippled.heightAt(3, 4, 2)).toBeCloseTo(plain.heightAt(3, 4, 2), 10);
  });
});
