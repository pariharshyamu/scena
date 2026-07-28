import { describe, expect, it } from 'vitest';
import {
  DataTexture,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Scene,
  Vector3,
} from 'three';
import { applyEnvironment, createEnvironmentMap } from '../src/environment/environment';
import { PALETTES } from '../src/core/palette';

/** Read one texel of the equirect back as [r, g, b]. */
function texel(tex: DataTexture, x: number, y: number): [number, number, number] {
  const w = tex.image.width;
  const d = tex.image.data as unknown as Float32Array;
  const i = (y * w + x) * 4;
  return [d[i], d[i + 1], d[i + 2]];
}

/** The direction a texel of an equirect looks in. */
function direction(tex: DataTexture, x: number, y: number): Vector3 {
  const w = tex.image.width;
  const h = tex.image.height;
  const phi = ((y + 0.5) / h) * Math.PI;
  const theta = ((x + 0.5) / w) * Math.PI * 2;
  return new Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
}

describe('applyEnvironment', () => {
  it('builds a map three can PMREM, and hangs it on the scene', () => {
    const scene = new Scene();
    const env = applyEnvironment(scene, { palette: PALETTES.meadow });
    expect(env.texture).toBeInstanceOf(DataTexture);
    // Equirect + reflection mapping is the one form three knows how to
    // filter into a PMREM chain. Any other mapping and it is ignored.
    expect(env.texture.mapping).toBe(EquirectangularReflectionMapping);
    expect(scene.environment).toBe(env.texture);
    expect(env.texture.image.width).toBe(128);
    expect(env.texture.image.height).toBe(64);
  });

  it('NOTHING IS FETCHED: it is pixels, computed', () => {
    // The whole library's bet is that no scene ever waits on a network
    // request, and an environment map is the most tempting place to break
    // that. This one is a Float32Array.
    const env = applyEnvironment(new Scene(), {});
    expect(env.texture.image.data).toBeInstanceOf(Float32Array);
    expect(env.texture.image.data.length).toBe(128 * 64 * 4);
  });

  it('SKY ABOVE, GROUND BELOW — and the ground half is the point', () => {
    // A hemisphere map leaves the underside of everything metal a black
    // hole. Light bounces; it does not stop at the horizon.
    const env = applyEnvironment(new Scene(), {
      top: 0x0000ff,
      horizon: 0xffffff,
      ground: 0xff0000,
      sun: null,
    });
    const w = env.texture.image.width;
    const h = env.texture.image.height;
    const [, , zenithB] = texel(env.texture, w >> 1, 0);
    const [nadirR] = texel(env.texture, w >> 1, h - 1);
    const middle = texel(env.texture, w >> 1, h >> 1);
    expect(zenithB).toBeGreaterThan(0.8);          // blue at the top
    expect(nadirR).toBeGreaterThan(0.8);           // red underneath
    expect(Math.min(...middle)).toBeGreaterThan(0.7); // white at the horizon
  });

  it('THE SUN LANDS WHERE THE RIG PUT IT', () => {
    // A sky with no sun in it gives polished metal an even sheen and no
    // highlight, which reads as plastic. And a highlight in the wrong place
    // is worse than none, because it disagrees with every shadow.
    const light = new DirectionalLight(0xffffff, 1);
    light.position.set(30, 45, 20);
    const env = applyEnvironment(new Scene(), { sun: light, sunIntensity: 8 });
    const tex = env.texture;
    const w = tex.image.width;
    const h = tex.image.height;

    let best = -1;
    let at = new Vector3();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const lum = texel(tex, x, y).reduce((a, v) => a + v, 0);
        if (lum > best) {
          best = lum;
          at = direction(tex, x, y);
        }
      }
    }
    const want = light.position.clone().normalize();
    // The brightest texel in the sky is the sun, within one texel's arc.
    expect(at.angleTo(want)).toBeLessThan(0.1);
    // And it is genuinely brighter than the sky around it.
    expect(best).toBeGreaterThan(6);
  });

  it('no sun means no hot spot at all', () => {
    const env = applyEnvironment(new Scene(), { sun: null });
    const tex = env.texture;
    let brightest = 0;
    for (let y = 0; y < tex.image.height; y++) {
      for (let x = 0; x < tex.image.width; x++) {
        brightest = Math.max(brightest, Math.max(...texel(tex, x, y)));
      }
    }
    expect(brightest).toBeLessThan(1.01);   // sky colours, nothing burning
  });

  it('takes a bare direction as well as a light', () => {
    const fromLight = applyEnvironment(new Scene(), {
      sun: (() => {
        const l = new DirectionalLight();
        l.position.set(0, 10, 0);
        return l;
      })(),
    });
    const fromVector = applyEnvironment(new Scene(), { sun: new Vector3(0, 1, 0) });
    const a = texel(fromLight.texture, 4, 0);
    const b = texel(fromVector.texture, 4, 0);
    expect(a[0]).toBeCloseTo(b[0], 5);
  });

  it('drives scene.environmentIntensity, and refresh re-paints in place', () => {
    const scene = new Scene();
    const env = applyEnvironment(scene, { top: 0x000000, intensity: 0.4 });
    expect(scene.environmentIntensity).toBe(0.4);
    const before = texel(env.texture, 4, 0);

    env.refresh({ top: 0xffffff, intensity: 1.2 });
    expect(scene.environmentIntensity).toBe(1.2);
    expect(scene.environment).toBe(env.texture);   // the handle stays valid
    const after = texel(env.texture, 4, 0);
    expect(after[0]).toBeGreaterThan(before[0]);
  });

  it('refresh keeps whatever it was not told to change', () => {
    const env = applyEnvironment(new Scene(), { ground: 0xff0000, sun: null });
    const h = env.texture.image.height;
    const nadirBefore = texel(env.texture, 4, h - 1);
    env.refresh({ top: 0x00ff00 });
    const nadirAfter = texel(env.texture, 4, h - 1);
    expect(nadirAfter[0]).toBeCloseTo(nadirBefore[0], 5);
  });

  it('dispose takes it off the scene', () => {
    const scene = new Scene();
    const env = applyEnvironment(scene);
    expect(scene.environment).not.toBe(null);
    env.dispose();
    expect(scene.environment).toBe(null);
  });

  it('is deterministic: the same options paint the same pixels', () => {
    const a = applyEnvironment(new Scene(), { palette: PALETTES.dusk, size: 32 });
    const b = applyEnvironment(new Scene(), { palette: PALETTES.dusk, size: 32 });
    expect(Array.from(a.texture.image.data as unknown as Float32Array)).toEqual(
      Array.from(b.texture.image.data as unknown as Float32Array)
    );
  });
});

describe('createEnvironmentMap', () => {
  it('is the same map, without touching the scene', () => {
    // The reason this is separate: scene.environment cannot be opted out of
    // by a single material. three overwrites material.envMapIntensity with
    // scene.environmentIntensity for anything with no envMap of its own, so
    // a per-material envMap is the ONLY way to have one thing reflect and
    // another not.
    const scene = new Scene();
    const map = createEnvironmentMap({ palette: PALETTES.meadow, sun: null });
    expect(map).toBeInstanceOf(DataTexture);
    expect(map.mapping).toBe(EquirectangularReflectionMapping);
    expect(scene.environment).toBe(null);

    const applied = applyEnvironment(new Scene(), { palette: PALETTES.meadow, sun: null });
    expect(Array.from(map.image.data as unknown as Float32Array)).toEqual(
      Array.from(applied.texture.image.data as unknown as Float32Array)
    );
  });

  it('honours size, and stays an equirect (2:1)', () => {
    for (const size of [32, 64, 256]) {
      const map = createEnvironmentMap({ size });
      expect(map.image.width, `${size}`).toBe(size);
      expect(map.image.height, `${size}`).toBe(size >> 1);
    }
  });
});
