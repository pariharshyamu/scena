import { describe, expect, it } from 'vitest';
import { Box3, DoubleSide, Mesh, MeshStandardMaterial, ShaderLib } from 'three';
import { createBanner, type BannerStyle, type BannerPattern } from '../src/props/banner';

interface Shader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

interface WaveMat extends MeshStandardMaterial {
  userData: { waveUniforms?: { uTime: { value: number } } };
}

function clothMesh(prop: { object: { traverse(cb: (o: unknown) => void): void } }): Mesh {
  let found: Mesh | undefined;
  prop.object.traverse((o) => {
    const m = (o as Mesh).material as WaveMat | undefined;
    if (m?.userData?.waveUniforms) found = o as Mesh;
  });
  if (!found) throw new Error('no cloth mesh');
  return found;
}

function meshCount(object: { traverse(cb: (o: unknown) => void): void }): number {
  let n = 0;
  object.traverse((o) => {
    if (o instanceof Mesh) n++;
  });
  return n;
}

const STYLES: BannerStyle[] = ['flag', 'banner', 'pennant'];
const PATTERNS: BannerPattern[] = ['solid', 'bands', 'stripes', 'bicolor', 'cross', 'saltire', 'diamond'];

describe('createBanner', () => {
  it('is deterministic per seed', () => {
    const a = createBanner({ seed: 42 });
    const b = createBanner({ seed: 42 });
    expect(meshCount(a.object)).toBe(meshCount(b.object));
    expect(a.obstacleRadius).toBe(b.obstacleRadius);
  });

  it('builds every style with a pole, finial and cloth', () => {
    for (const style of STYLES) {
      const banner = createBanner({ seed: 7, style });
      expect(banner.object.name).toBe('banner');
      expect(meshCount(banner.object)).toBeGreaterThanOrEqual(4);
      const cloth = clothMesh(banner);
      const mat = cloth.material as WaveMat;
      expect(mat.vertexColors).toBe(true);
      expect(mat.side).toBe(DoubleSide);
      expect(mat.flatShading).toBe(true);
      // Cloth carries baked per-vertex colours (the heraldic device).
      expect(cloth.geometry.getAttribute('color')).toBeDefined();
    }
  });

  it('every heraldic pattern bakes colours without error', () => {
    for (const pattern of PATTERNS) {
      const banner = createBanner({ seed: 6, style: 'flag', pattern });
      expect(clothMesh(banner).geometry.getAttribute('color').count).toBeGreaterThan(0);
    }
  });

  it('the cloth material is a distinct program from surfaces and plain', () => {
    const mat = clothMesh(createBanner({ seed: 1, style: 'flag' })).material as MeshStandardMaterial;
    const key = mat.customProgramCacheKey();
    expect(key).toBe('scena-banner-v1');
    expect(key).not.toBe(new MeshStandardMaterial().customProgramCacheKey());
  });

  it('injects a vertex wave into the real three shader', () => {
    const mat = clothMesh(createBanner({ seed: 3, style: 'flag' })).material as MeshStandardMaterial;
    expect(ShaderLib.standard.vertexShader).toContain('#include <begin_vertex>');
    const shader: Shader = {
      uniforms: {},
      vertexShader: ShaderLib.standard.vertexShader,
      fragmentShader: ShaderLib.standard.fragmentShader,
    };
    (mat.onBeforeCompile as (s: Shader, r: unknown) => void)(shader, null);
    expect(shader.vertexShader).toContain('transformed.z += z'); // the ripple
    expect(shader.uniforms.uTime).toBeDefined();
    expect(shader.uniforms.uAmp).toBeDefined();
    expect(shader.uniforms.uPhase).toBeDefined();
  });

  it('self-animates: onBeforeRender advances the shared wave clock', () => {
    const cloth = clothMesh(createBanner({ seed: 9, style: 'pennant' }));
    const mat = cloth.material as WaveMat;
    expect(mat.userData.waveUniforms!.uTime.value).toBe(0);
    expect(typeof cloth.onBeforeRender).toBe('function');
    // three calls it just before drawing; here we invoke it directly.
    (cloth.onBeforeRender as () => void)();
    expect(mat.userData.waveUniforms!.uTime.value).toBeGreaterThan(0);
  });

  it('seeds distinct wave phases so a row does not wave in lockstep', () => {
    const uPhase = (seed: number): number => {
      const mat = clothMesh(createBanner({ seed, style: 'flag' })).material as MeshStandardMaterial;
      const shader: Shader = {
        uniforms: {},
        vertexShader: ShaderLib.standard.vertexShader,
        fragmentShader: ShaderLib.standard.fragmentShader,
      };
      (mat.onBeforeCompile as (s: Shader, r: unknown) => void)(shader, null);
      return shader.uniforms.uPhase.value as number;
    };
    expect(uPhase(1)).not.toBe(uPhase(4));
  });

  it('honours explicit tinctures in the baked colours', () => {
    const banner = createBanner({ seed: 2, style: 'flag', pattern: 'bicolor', colors: [0xff0000, 0x0000ff] });
    const colorAttr = clothMesh(banner).geometry.getAttribute('color');
    let sawRed = false;
    let sawBlue = false;
    for (let i = 0; i < colorAttr.count; i++) {
      if (colorAttr.getX(i) > 0.9 && colorAttr.getY(i) < 0.1 && colorAttr.getZ(i) < 0.1) sawRed = true;
      if (colorAttr.getZ(i) > 0.9 && colorAttr.getX(i) < 0.1 && colorAttr.getY(i) < 0.1) sawBlue = true;
    }
    expect(sawRed && sawBlue).toBe(true);
  });

  it('stands on the ground (pole base at y = 0)', () => {
    const box = new Box3().setFromObject(createBanner({ seed: 5, style: 'banner' }).object);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.15);
    expect(box.min.y).toBeLessThan(0.3);
  });
});
