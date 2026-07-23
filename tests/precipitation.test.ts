import { describe, expect, it } from 'vitest';
import { Color, Group, LineSegments, Mesh, Points, Vector2 } from 'three';
import { createPrecipitation } from '../src/environment/precipitation';
import { createWindField } from '../src/environment/wind';
import { createSurface } from '../src/materials/surface';

describe('createPrecipitation', () => {
  it('rain is line-segment streaks; snow is soft points', () => {
    const rain = createPrecipitation({ type: 'rain', count: 100 });
    expect(rain.object).toBeInstanceOf(LineSegments);
    expect(rain.object.geometry.getAttribute('position').count).toBe(200); // head + tail
    expect(rain.object.geometry.getAttribute('aEnd')).toBeDefined();

    const snow = createPrecipitation({ type: 'snow', count: 100 });
    expect(snow.object).toBeInstanceOf(Points);
    expect(snow.object.geometry.getAttribute('position').count).toBe(100);
  });

  it('petals are spinning, fluttering points that only snow-style settle is refused', () => {
    const petal = createPrecipitation({ type: 'petal', count: 80 });
    expect(petal.object).toBeInstanceOf(Points);
    expect(petal.object.geometry.getAttribute('position').count).toBe(80);
    expect(petal.material.vertexShader).toContain('vSpin'); // petals spin
    expect(petal.material.fragmentShader).toContain('mat2(cs'); // rotated oval petal
    // Default blossom-pink tint, and a lazy fall.
    expect((petal.material.uniforms.uColor.value as Color).getHexString()).toBe('f3c1d6');
    expect(petal.material.uniforms.uFall.value).toBeLessThan(3);
    // Petals don't accumulate (only snow does) — accumulate is a no-op that returns self.
    expect(petal.accumulate({ traverse() {} } as unknown as Group)).toBe(petal);
  });

  it('the material is an unlit, transparent, non-depth-writing shader', () => {
    const rain = createPrecipitation({ count: 10 });
    expect(rain.material.transparent).toBe(true);
    expect(rain.material.depthWrite).toBe(false);
    expect(rain.material.uniforms.uTime).toBeDefined();
    expect(rain.material.uniforms.uArea).toBeDefined();
    // Follows the camera → never frustum-culled.
    expect(rain.object.frustumCulled).toBe(false);
  });

  it('setIntensity clamps to 0..1 and drives the uniform', () => {
    const rain = createPrecipitation({ count: 10 });
    rain.setIntensity(0.4);
    expect(rain.material.uniforms.uIntensity.value).toBe(0.4);
    rain.setIntensity(9);
    expect(rain.material.uniforms.uIntensity.value).toBe(1);
    rain.setIntensity(-1);
    expect(rain.material.uniforms.uIntensity.value).toBe(0);
  });

  it('self-animates: onBeforeRender is wired; update(dt) advances the clock', () => {
    const rain = createPrecipitation({ count: 10 });
    expect(typeof rain.object.onBeforeRender).toBe('function');
    rain.update(0.5);
    rain.update(0.5);
    expect(rain.material.uniforms.uTime.value).toBeCloseTo(1, 6);
  });

  it('reads a WindField: the fall leans along the wind', () => {
    const wind = createWindField({ direction: 0, strength: 0.5 });
    const rain = createPrecipitation({ count: 10, wind, windInfluence: 10 });
    rain.update(0.1);
    const w = rain.material.uniforms.uWind.value as Vector2;
    // direction +X, strength 0.5, influence 10 → uWind ≈ (5, 0).
    expect(w.x).toBeCloseTo(5, 3);
    expect(w.y).toBeCloseTo(0, 5);
  });
});

describe('snow accumulation', () => {
  it('settles a cap onto plain surfaces below, ramping over time', () => {
    const roof = new Mesh();
    roof.material = createSurface('tile', { color: 0xa8563e });
    const group = new Group();
    group.add(roof);
    const cap = (roof.material.userData as { scenaSurface: { uSurfCap: { value: number }; uSurfCapColor: { value: Color } } })
      .scenaSurface;
    expect(cap.uSurfCap.value).toBe(0);

    const snow = createPrecipitation({ type: 'snow', count: 10 });
    snow.accumulate(group, { color: 0xffffff, max: 0.8, rate: 0.1 });

    snow.update(1); // 1s at rate 0.1 → cap ~0.1, and the cap is painted white
    expect(cap.uSurfCapColor.value.getHex()).toBe(0xffffff);
    expect(cap.uSurfCap.value).toBeGreaterThan(0);
    expect(cap.uSurfCap.value).toBeLessThanOrEqual(0.8);
  });

  it('rain never accumulates (accumulate is a no-op)', () => {
    const roof = new Mesh();
    roof.material = createSurface('tile');
    const group = new Group();
    group.add(roof);
    const rain = createPrecipitation({ type: 'rain', count: 10 });
    rain.accumulate(group);
    rain.update(5);
    const cap = (roof.material.userData as { scenaSurface: { uSurfCap: { value: number } } }).scenaSurface;
    expect(cap.uSurfCap.value).toBe(0);
  });

  it('leaves already-capped surfaces (snow/moss presets) alone', () => {
    const snowy = new Mesh();
    snowy.material = createSurface('snow'); // preset already has a cap
    const group = new Group();
    group.add(snowy);
    const cap = (snowy.material.userData as { scenaSurface: { uSurfCap: { value: number } } }).scenaSurface;
    const before = cap.uSurfCap.value;
    createPrecipitation({ type: 'snow', count: 10 }).accumulate(group).update(2);
    expect(cap.uSurfCap.value).toBe(before); // untouched
  });
});
