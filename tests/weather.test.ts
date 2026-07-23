import { describe, expect, it } from 'vitest';
import { AmbientLight, Color, DirectionalLight, Fog, Scene } from 'three';
import { createWeather } from '../src/environment/weather';

describe('createWeather', () => {
  it('sets up wind, rain, snow and manages the scene fog + background', () => {
    const scene = new Scene();
    scene.background = new Color(0x000000);
    const w = createWeather(scene, { initial: 'clear' });
    expect(w.wind).toBeDefined();
    expect(w.rain.object.parent).toBe(scene);
    expect(w.snow.object.parent).toBe(scene);
    expect(scene.fog).toBeInstanceOf(Fog);
    // Initial state applied: clear = no precipitation.
    expect(w.rain.material.uniforms.uIntensity.value).toBeCloseTo(0);
    expect(w.snow.material.uniforms.uIntensity.value).toBeCloseTo(0);
    expect(w.state).toBe('clear');
  });

  it('cross-fades to a storm: wind rises, rain fills in, fog closes and darkens', () => {
    const scene = new Scene();
    scene.background = new Color(0xbcd4e6);
    const w = createWeather(scene, { initial: 'clear' });
    const fog = scene.fog as Fog;
    const farClear = fog.far;
    w.set('storm', { fade: 4 });
    for (let i = 0; i < 100; i++) w.update(0.05); // ~5s, past the fade
    expect(w.state).toBe('storm');
    expect(w.wind.strength).toBeCloseTo(0.9, 1); // storm wind
    expect(w.rain.material.uniforms.uIntensity.value).toBeCloseTo(1, 1);
    expect(fog.far).toBeLessThan(farClear); // fog closed in
    // Background darkened from the clear sky toward the storm grey.
    const bg = scene.background as Color;
    expect(bg.getHexString()).not.toBe('bcd4e6');
  });

  it('is a genuine fade — partway through, values sit between the two states', () => {
    const scene = new Scene();
    const w = createWeather(scene, { initial: 'clear' });
    w.set('storm', { fade: 4 });
    for (let i = 0; i < 20; i++) w.update(0.05); // 1s of a 4s fade
    const s = w.wind.strength;
    expect(s).toBeGreaterThan(0.15); // above clear
    expect(s).toBeLessThan(0.9); // below storm
  });

  it('dims the sun and ambient in a storm, relative to the rig they were set up with', () => {
    const scene = new Scene();
    const sun = new DirectionalLight(0xffffff, 1.2);
    const ambient = new AmbientLight(0xffffff, 0.8);
    const w = createWeather(scene, { sun, ambient });
    w.set('storm', { fade: 2 });
    for (let i = 0; i < 80; i++) w.update(0.05);
    // storm light = 0.4 (plus transient lightning flashes we can't time here);
    // the average is clearly dimmer than the full-sun the rig started with.
    let sum = 0;
    for (let i = 0; i < 40; i++) {
      w.update(0.05);
      sum += sun.intensity;
    }
    expect(sum / 40).toBeLessThan(1.2); // dimmer than the 1.2 it began at
  });

  it('exposes a cross-faded storminess for wiring an ocean surge', () => {
    const scene = new Scene();
    const w = createWeather(scene, { initial: 'clear' });
    expect(w.storminess).toBeCloseTo(0.05, 1); // calm sea when clear
    w.set('storm', { fade: 4 });
    for (let i = 0; i < 10; i++) w.update(0.05); // 0.5s in — partway
    const mid = w.storminess;
    expect(mid).toBeGreaterThan(0.05);
    expect(mid).toBeLessThan(1);
    for (let i = 0; i < 100; i++) w.update(0.05); // settle
    expect(w.storminess).toBeCloseTo(1, 1); // full storm sea
  });

  it('honours custom / overridden states', () => {
    const scene = new Scene();
    const w = createWeather(scene, {
      initial: 'clear',
      states: { squall: { wind: 1.3, gust: 1, rain: 0.9, snow: 0, fogColor: 0x333333, fogNear: 8, fogFar: 40, sky: 0x333333, light: 0.35 } },
    });
    w.set('squall', { fade: 1 });
    for (let i = 0; i < 40; i++) w.update(0.05);
    expect(w.state).toBe('squall');
    expect(w.wind.strength).toBeCloseTo(1.3, 1);
  });
});
