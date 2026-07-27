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

describe('rain soaks, and it dries again', () => {
  const wetOf = (m: unknown) =>
    (m as { userData: { scenaSurface: { uSurfWet: { value: number }; uSurfWetCling: { value: number } } } })
      .userData.scenaSurface;

  const scene = () => {
    const road = new Mesh();
    road.material = createSurface('cobblestone');
    const group = new Group();
    group.add(road);
    return { road, group };
  };

  it('wets the surfaces below it, up to the rain it is actually raining', () => {
    const { road, group } = scene();
    expect(wetOf(road.material).uSurfWet.value).toBe(0);

    const rain = createPrecipitation({ type: 'rain', count: 10 });
    rain.setIntensity(1);
    rain.soak(group, { max: 0.9, rate: 0.2, cling: 0.4 });

    rain.update(1);
    const after1s = wetOf(road.material).uSurfWet.value;
    expect(after1s).toBeGreaterThan(0.1);
    expect(after1s).toBeLessThanOrEqual(0.9);
    expect(wetOf(road.material).uSurfWetCling.value).toBe(0.4);

    // It saturates at `max` and goes no further, however long it rains.
    rain.update(60);
    expect(wetOf(road.material).uSurfWet.value).toBeCloseTo(0.9, 5);
  });

  it('DRYING IS SLOWER THAN WETTING — the street stays dark after the rain', () => {
    const { road, group } = scene();
    const rain = createPrecipitation({ type: 'rain', count: 10 });
    rain.setIntensity(1);
    rain.soak(group, { max: 0.9, rate: 0.2, dry: 0.02 });
    rain.update(10);
    const soaked = wetOf(road.material).uSurfWet.value;
    expect(soaked).toBeCloseTo(0.9, 5);

    // The rain stops. Ten seconds of drying must not undo ten of soaking.
    rain.setIntensity(0);
    rain.update(10);
    const drying = wetOf(road.material).uSurfWet.value;
    expect(drying).toBeLessThan(soaked);
    expect(drying).toBeGreaterThan(0.5);

    // …but it does get there in the end.
    rain.update(200);
    expect(wetOf(road.material).uSurfWet.value).toBeCloseTo(0, 5);
  });

  it('follows the weather down as well as up, without being asked twice', () => {
    const { road, group } = scene();
    const rain = createPrecipitation({ type: 'rain', count: 10 });
    rain.setIntensity(1);
    rain.soak(group, { max: 1, rate: 0.5, dry: 0.5 });
    rain.update(4);
    expect(wetOf(road.material).uSurfWet.value).toBeCloseTo(1, 5);
    // Easing off to a drizzle settles at the drizzle's level, not at zero.
    rain.setIntensity(0.3);
    rain.update(10);
    expect(wetOf(road.material).uSurfWet.value).toBeCloseTo(0.3, 5);
  });

  it('only rain wets things: snow and petals refuse', () => {
    for (const type of ['snow', 'petal'] as const) {
      const { road, group } = scene();
      const p = createPrecipitation({ type, count: 10 });
      p.setIntensity(1);
      p.soak(group);
      p.update(5);
      expect(wetOf(road.material).uSurfWet.value, type).toBe(0);
    }
  });

  it('wets ANY surface, capped or not — a mossy wall gets wet too', () => {
    const mossy = new Mesh();
    mossy.material = createSurface('moss');
    const group = new Group();
    group.add(mossy);
    const rain = createPrecipitation({ type: 'rain', count: 10 });
    rain.setIntensity(1);
    rain.soak(group, { rate: 0.5 });
    rain.update(2);
    expect(wetOf(mossy.material).uSurfWet.value).toBeGreaterThan(0.5);
  });
});
