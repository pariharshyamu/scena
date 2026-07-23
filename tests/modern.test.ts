import { describe, expect, it } from 'vitest';
import { MeshStandardMaterial, ShaderLib } from 'three';
import { createGlass, createSurface, SURFACE_PRESETS } from '../src';

interface Shader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

function compilePatched(mat: MeshStandardMaterial): Shader {
  const shader: Shader = {
    uniforms: {},
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
  };
  (mat.onBeforeCompile as (s: Shader, r: unknown) => void)(shader, null);
  return shader;
}

describe('modern surface tier', () => {
  it('ships the thirteen modern kinds', () => {
    for (const kind of [
      'concrete', 'paint', 'marble', 'terrazzo', 'steel', 'chrome', 'paintedMetal',
      'corten', 'teak', 'porcelain', 'mosaic', 'parquet', 'patternedTile',
    ] as const) {
      expect(SURFACE_PRESETS[kind]).toBeDefined();
      expect(createSurface(kind)).toBeInstanceOf(MeshStandardMaterial);
    }
  });

  it('machined kinds are smoother than their medieval cousins', () => {
    expect(SURFACE_PRESETS.marble.roughness).toBeLessThan(SURFACE_PRESETS.stone.roughness);
    expect(SURFACE_PRESETS.porcelain.roughness).toBeLessThan(SURFACE_PRESETS.floortile.roughness);
    expect(SURFACE_PRESETS.teak.roughness).toBeLessThan(SURFACE_PRESETS.wood.roughness);
    expect(SURFACE_PRESETS.steel.metalness).toBeGreaterThan(0.8);
    expect(SURFACE_PRESETS.chrome.roughness).toBeLessThan(0.1);
    // Paint is nearly featureless — that restraint IS the preset.
    expect(SURFACE_PRESETS.paint.albedoVar).toBeLessThan(0.06);
    expect(SURFACE_PRESETS.paint.bump).toBeLessThan(0.05);
  });

  it('wires the new pattern uniforms (chevron, accent chips, motif)', () => {
    const parquet = compilePatched(createSurface('parquet'));
    expect(parquet.uniforms.uSurfTileChevron.value).toBe(1);
    const mosaic = compilePatched(createSurface('mosaic'));
    expect(mosaic.uniforms.uSurfTileTint.value).toBeGreaterThan(0);
    const patterned = compilePatched(createSurface('patternedTile'));
    expect(patterned.uniforms.uSurfTileMotif.value).toBeGreaterThan(0);
    // And a legacy kind keeps them all off.
    const brick = compilePatched(createSurface('brick'));
    expect(brick.uniforms.uSurfTileChevron.value).toBe(0);
    expect(brick.uniforms.uSurfTileTint.value).toBe(0);
    expect(brick.uniforms.uSurfTileMotif.value).toBe(0);
    // The shader source actually contains the new machinery.
    expect(parquet.fragmentShader).toContain('uSurfTileChevron');
    expect(parquet.fragmentShader).toContain('scenaMotifM');
  });

  it('concrete and porcelain use panel joints, terrazzo uses tiny chips', () => {
    expect(SURFACE_PRESETS.concrete.tile).toBe(1);
    expect(SURFACE_PRESETS.concrete.tileW!).toBeGreaterThan(1);
    expect(SURFACE_PRESETS.terrazzo.tileW!).toBeLessThan(0.06);
    expect(SURFACE_PRESETS.terrazzo.tileTint!).toBeGreaterThan(0);
  });
});

describe('createGlass', () => {
  it('is a transparent standard material with fresnel + sky patched in', () => {
    const glass = createGlass();
    expect(glass.transparent).toBe(true);
    expect(glass.opacity).toBeLessThan(0.5);
    expect(glass.depthWrite).toBe(false);
    const shader = compilePatched(glass);
    expect(shader.fragmentShader).toContain('scenaFresnel');
    expect(shader.fragmentShader).toContain('uGlassSky');
    expect(shader.uniforms.uGlassOpacity.value).toBe(glass.opacity);
    expect(glass.customProgramCacheKey()).toBe('scena-glass-v1');
  });

  it('frosted glass is milkier, rougher and quieter', () => {
    const clear = createGlass();
    const frosted = createGlass({ frosted: true });
    expect(frosted.opacity).toBeGreaterThan(clear.opacity);
    expect(frosted.roughness).toBeGreaterThan(clear.roughness);
    const cu = compilePatched(clear).uniforms.uGlassReflect.value as number;
    const fu = compilePatched(frosted).uniforms.uGlassReflect.value as number;
    expect(fu).toBeLessThan(cu);
  });

  it('nightGlow puts the emissive at day-cycle lamp-scan intensity', () => {
    const plain = createGlass();
    expect(plain.emissiveIntensity <= 0.5 || plain.emissive.getHex() === 0).toBe(true);
    const glowing = createGlass({ nightGlow: true });
    // createDayCycle adopts emissives with intensity > 0.5 from its lamps list.
    expect(glowing.emissiveIntensity).toBeGreaterThan(0.5);
    expect(glowing.emissive.getHex()).not.toBe(0);
  });
});
