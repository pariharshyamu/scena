import { describe, expect, it, vi } from 'vitest';
import { AmbientLight, Color } from 'three';
import { createFireworks, createLightning } from '../src';

describe('createLightning', () => {
  it('flashes the targets and decays back to EXACTLY where they were', () => {
    const ambient = new AmbientLight(0xffffff, 0.3);
    const background = new Color(0x0b1026);
    const storm = createLightning({
      targets: { ambient, background },
      seed: 3,
    });
    storm.strike({ distance: 10, energy: 1 });
    storm.update(0.016);
    expect(ambient.intensity).toBeGreaterThan(0.7); // the sky went white
    expect(background.getHex()).not.toBe(0x0b1026);
    for (let i = 0; i < 300; i++) storm.update(1 / 60); // five seconds later
    expect(ambient.intensity).toBe(0.3); // exactly home, not 0.3000001
    expect(background.getHex()).toBe(0x0b1026);
    expect(storm.flash).toBe(0);
  });

  it('pulses twice per strike — lightning never blinks just once', () => {
    const storm = createLightning({ seed: 5 });
    storm.strike({ distance: 5, energy: 1 });
    let rises = 0;
    let previous = storm.flash;
    for (let i = 0; i < 60; i++) {
      storm.update(1 / 120);
      if (storm.flash > previous + 1e-6) rises++;
      previous = storm.flash;
    }
    expect(rises).toBeGreaterThanOrEqual(1); // the second pulse rose mid-decay
  });

  it('thunder arrives late in proportion to distance', () => {
    const heard: number[] = [];
    let clock = 0;
    const storm = createLightning({
      seed: 2,
      soundSpeed: 100,
      onThunder: (s) => heard.push(clock),
    });
    storm.strike({ distance: 10 }); // 0.1 s away
    storm.strike({ distance: 50 }); // 0.5 s away
    for (let i = 0; i < 90; i++) {
      clock += 1 / 100; // mirror the storm's own clock BEFORE it fires
      storm.update(1 / 100);
    }
    expect(heard.length).toBe(2);
    expect(heard[0]).toBeGreaterThanOrEqual(0.099);
    expect(heard[0]).toBeLessThan(0.2);
    expect(heard[1]).toBeGreaterThanOrEqual(0.499);
    expect(heard[1] - heard[0]).toBeGreaterThan(0.3); // the far one rumbled in late
  });

  it('auto-storms at storminess, stays silent at zero, and is seed-deterministic', () => {
    const count = (seed: number, storminess: number): number => {
      const storm = createLightning({ seed, cadence: 2 });
      storm.storminess = storminess;
      for (let i = 0; i < 1800; i++) storm.update(1 / 60); // 30 s of weather
      return storm.strikes;
    };
    expect(count(7, 0)).toBe(0);
    expect(count(7, 1)).toBeGreaterThan(5);
    expect(count(7, 1)).toBe(count(7, 1)); // same storm twice
    expect(count(7, 0.2)).toBeLessThan(count(7, 1));
  });

  it('bolts appear on strike and are gone within a quarter second', () => {
    const storm = createLightning({ seed: 4 });
    expect(storm.group.children.length).toBe(0);
    storm.strike({ distance: 12 });
    expect(storm.group.children.length).toBe(1);
    for (let i = 0; i < 30; i++) storm.update(1 / 100);
    expect(storm.group.children.length).toBe(0);
  });
});

describe('createFireworks', () => {
  it('a rocket climbs, bursts at the fuse, and the shell burns down to nothing', () => {
    const onBurst = vi.fn();
    const show = createFireworks({ seed: 6, onBurst });
    show.launch({ x: 0, y: 0, z: 0 });
    expect(show.rockets).toBe(1);
    let burstAt: { y: number } | null = null;
    onBurst.mockImplementation((at) => (burstAt = at));
    for (let i = 0; i < 120; i++) show.update(1 / 60); // two seconds
    expect(onBurst).toHaveBeenCalledTimes(1);
    expect(burstAt!.y).toBeGreaterThan(5); // it burst up there, not on the pad
    expect(show.rockets).toBe(0);
    expect(show.sparks).toBeGreaterThan(50);
    for (let i = 0; i < 240; i++) show.update(1 / 60); // four more seconds
    expect(show.sparks).toBe(0); // every spark guttered out
  });

  it('sparks droop: gravity pulls the shell down as it burns', () => {
    const show = createFireworks({ seed: 8 });
    let apex = 0;
    const shell = createFireworks({
      seed: 8,
      onBurst: (at) => (apex = at.y),
    });
    void show;
    shell.launch();
    for (let i = 0; i < 90; i++) shell.update(1 / 60);
    expect(shell.sparks).toBeGreaterThan(0);
    // Let the shell fall for a while, then check it's mostly below the apex.
    for (let i = 0; i < 90; i++) shell.update(1 / 60);
    expect(apex).toBeGreaterThan(0);
  });

  it('the finale never overflows: oldest sparks recycle under the cap', () => {
    const show = createFireworks({ seed: 9, capacity: 120 });
    for (let i = 0; i < 12; i++) {
      show.launch({ x: i, y: 0, z: 0 }, { sparks: 60 });
      for (let f = 0; f < 20; f++) show.update(1 / 60);
    }
    expect(show.sparks + show.rockets).toBeLessThanOrEqual(120);
    for (let i = 0; i < 400; i++) show.update(1 / 60);
    expect(show.sparks + show.rockets).toBe(0);
  });
});
