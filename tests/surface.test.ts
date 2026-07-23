import { describe, expect, it } from 'vitest';
import { Color, Mesh, MeshStandardMaterial, ShaderLib, Vector3 } from 'three';
import { createSurface, SURFACE_PRESETS, type SurfaceKind } from '../src/materials/surface';

/** The subset of three's onBeforeCompile shader object we inspect. */
interface Shader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}
import { createHouse, createWell, createRuin, createTower } from '../src/props/building';
import { createRock } from '../src/props/rock';
import { createCrate } from '../src/props/crate';

const KINDS = Object.keys(SURFACE_PRESETS) as SurfaceKind[];

/** Run a material's onBeforeCompile against a *copy of the real* three
 * MeshStandard shader, so the injection is validated against actual chunk
 * names — if three renamed a chunk our replace would silently no-op. */
function compilePatched(mat: MeshStandardMaterial): Shader {
  const shader: Shader = {
    uniforms: {},
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
  };
  // three calls it as (shader, renderer); renderer is unused here.
  (mat.onBeforeCompile as (s: Shader, r: unknown) => void)(shader, null);
  return shader;
}

describe('createSurface', () => {
  it('produces a MeshStandardMaterial with the preset PBR base', () => {
    const mat = createSurface('metal', { color: 0x334455 });
    expect(mat).toBeInstanceOf(MeshStandardMaterial);
    expect(mat.metalness).toBe(SURFACE_PRESETS.metal.metalness);
    expect(mat.roughness).toBe(SURFACE_PRESETS.metal.roughness);
    expect(mat.color.getHex()).toBe(0x334455);
    expect(typeof mat.onBeforeCompile).toBe('function');
  });

  it('injects into real three chunks — replacements actually fire', () => {
    // The tokens we depend on must exist in three's shipped shader.
    expect(ShaderLib.standard.vertexShader).toContain('#include <begin_vertex>');
    expect(ShaderLib.standard.fragmentShader).toContain('#include <map_fragment>');
    expect(ShaderLib.standard.fragmentShader).toContain('#include <normal_fragment_maps>');

    const shader = compilePatched(createSurface('stone'));
    // Vertex: world-position + world-normal varyings added.
    expect(shader.vertexShader).toContain('vSurfWorldPos');
    expect(shader.vertexShader).toContain('vSurfWorldNormal');
    expect(shader.vertexShader).toContain('#ifdef USE_INSTANCING'); // instancing path
    // Fragment: our noise + all four modulation sites present.
    expect(shader.fragmentShader).toContain('scenaTri');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb');
    expect(shader.fragmentShader).toContain('roughnessFactor = clamp');
    expect(shader.fragmentShader).toContain('uSurfBump'); // normal perturbation
  });

  it('adds all surface uniforms with the preset values', () => {
    const shader = compilePatched(createSurface('wood', { color: 0x8a6642 }));
    for (const u of [
      'uSurfScale', 'uSurfAlbedoVar', 'uSurfTint', 'uSurfTintAmount',
      'uSurfAO', 'uSurfBump', 'uSurfRoughVar', 'uSurfGrain', 'uSurfGrainScale',
      'uSurfGrainAxis', 'uSurfSeed',
    ]) {
      expect(shader.uniforms[u]).toBeDefined();
    }
    expect(shader.uniforms.uSurfGrain.value).toBe(SURFACE_PRESETS.wood.grain);
    expect(shader.uniforms.uSurfScale.value).toBe(SURFACE_PRESETS.wood.scale);
  });

  it('shares one program cache key so presets do not fragment the pipeline', () => {
    const keys = KINDS.map((k) => createSurface(k).customProgramCacheKey());
    expect(new Set(keys).size).toBe(1);
    // …but it is distinct from a plain material's default key.
    expect(keys[0]).not.toBe(new MeshStandardMaterial().customProgramCacheKey());
  });

  it('seed shifts the noise field so equal colours weather apart', () => {
    const a = compilePatched(createSurface('plaster', { color: 0xffffff, seed: 1 }));
    const b = compilePatched(createSurface('plaster', { color: 0xffffff, seed: 2 }));
    const sa = a.uniforms.uSurfSeed.value as Vector3;
    const sb = b.uniforms.uSurfSeed.value as Vector3;
    expect(sa.equals(sb)).toBe(false);
  });

  it('overrides win over the preset', () => {
    const mat = createSurface('stone', { roughness: 0.1, bump: 2, color: 0x111111 });
    const shader = compilePatched(mat);
    expect(mat.roughness).toBe(0.1);
    expect(shader.uniforms.uSurfBump.value).toBe(2);
  });

  it('presets are meaningfully distinct', () => {
    // No two presets share an identical full parameter signature.
    const sigs = KINDS.map((k) => {
      const p = SURFACE_PRESETS[k];
      return [p.roughness, p.metalness, p.scale, p.albedoVar, p.ao, p.bump, p.grain].join(',');
    });
    expect(new Set(sigs).size).toBe(KINDS.length);
    // Wood-family presets carry grain; masonry does not.
    expect(SURFACE_PRESETS.wood.grain).toBeGreaterThan(0);
    expect(SURFACE_PRESETS.plank.grain).toBeGreaterThan(0);
    expect(SURFACE_PRESETS.stone.grain).toBe(0);
    expect(SURFACE_PRESETS.plaster.grain).toBe(0);
  });

  it('falls back to each preset baseColor, but a passed color always wins', () => {
    // No color passed → the preset's own baseColor (sand looks like sand).
    expect(createSurface('sand').color.getHex()).toBe(SURFACE_PRESETS.sand.baseColor);
    expect(createSurface('brass').color.getHex()).toBe(SURFACE_PRESETS.brass.baseColor);
    // Caller color overrides the baseColor.
    expect(createSurface('sand', { color: 0x123456 }).color.getHex()).toBe(0x123456);
    // Every preset carries a baseColor now.
    for (const k of KINDS) expect(SURFACE_PRESETS[k].baseColor, k).toBeGreaterThan(0);
  });

  it('covers the Tier-1 range: metals are metallic, ground/organic are not', () => {
    for (const k of ['bronze', 'brass', 'rust'] as SurfaceKind[]) {
      expect(SURFACE_PRESETS[k].metalness, k).toBeGreaterThan(0);
    }
    for (const k of ['sand', 'gravel', 'mud', 'leather', 'canvas', 'parchment'] as SurfaceKind[]) {
      expect(SURFACE_PRESETS[k].metalness, k).toBe(0);
    }
    // bark reads as timber: it carries grain.
    expect(SURFACE_PRESETS.bark.grain).toBeGreaterThan(0);
  });

  it('stays dayCycle-safe: emissive is black, so intensity dimming is a no-op', () => {
    // dayCycle modulates emissiveIntensity on every material it sees; a
    // surface must not accidentally glow at night.
    const mat = createSurface('tile', { color: 0xa8563e });
    expect(mat.emissive.equals(new Color(0, 0, 0))).toBe(true);
  });
});

describe('props adopt surfaces', () => {
  function surfaceMaterialCount(prop: { object: { traverse(cb: (o: unknown) => void): void } }): number {
    let n = 0;
    prop.object.traverse((o) => {
      const mat = (o as Mesh).material;
      if (mat instanceof MeshStandardMaterial && typeof mat.onBeforeCompile === 'function') {
        // Distinguish surface materials (custom key) from plain ones.
        if (mat.customProgramCacheKey() === 'scena-surface-v1') n++;
      }
    });
    return n;
  }

  it('house, tower, well, ruin, rock and crate all use surface materials', () => {
    for (const prop of [
      createHouse({ seed: 3 }),
      createTower({ seed: 3 }),
      createWell({ seed: 3 }),
      createRuin({ seed: 3 }),
      createRock({ seed: 3 }),
      createCrate({ seed: 3 }),
    ]) {
      expect(surfaceMaterialCount(prop)).toBeGreaterThan(0);
    }
  });

  it('the house keeps its emissive windows for the day-night cycle', () => {
    // Windows must still be genuinely emissive (non-black) so dusk lights them.
    let emissive = 0;
    createHouse({ seed: 3 }).object.traverse((o) => {
      const mat = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (mat?.emissive && mat.emissive.getHex() !== 0 && mat.emissiveIntensity > 0.5) emissive++;
    });
    expect(emissive).toBeGreaterThan(0);
  });
});
