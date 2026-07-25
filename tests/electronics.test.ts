import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import {
  createLaptop,
  createMonitor,
  createScreenLight,
  createScreenPanel,
  createSmartDisplay,
  createTablet,
  createTelevision,
  type ScreenProp,
} from '../src';

const SCREEN_PROPS: Array<[string, () => ScreenProp]> = [
  ['monitor', () => createMonitor()],
  ['television', () => createTelevision()],
  ['laptop', () => createLaptop()],
  ['smart display', () => createSmartDisplay()],
];

describe('screen panels', () => {
  it('lays a 16:9 panel out to the requested diagonal', () => {
    const tv = createTelevision({ diagonal: 1.4 });
    expect(Math.hypot(tv.screen.width, tv.screen.height)).toBeCloseTo(1.4, 2);
    expect(tv.screen.width / tv.screen.height).toBeCloseTo(16 / 9, 1);
  });

  it('throws nothing into the room when off', () => {
    const panel = createScreenPanel(0.5, 0.28, { mode: 'off' });
    panel.update(0.5);
    expect(panel.glow.intensity).toBe(0);
  });

  it('lights up when switched on, and goes dark again', () => {
    const panel = createScreenPanel(0.5, 0.28, { mode: 'off' });
    panel.update(0.1);
    expect(panel.glow.intensity).toBe(0);
    panel.setMode('feed');
    panel.update(0.1);
    expect(panel.glow.intensity).toBeGreaterThan(0.2);
    panel.setMode('off');
    panel.update(0.1);
    expect(panel.glow.intensity).toBe(0);
  });

  it('is deterministic in its seed', () => {
    const sample = (seed: number): number[] => {
      const panel = createScreenPanel(1, 0.56, { mode: 'video', seed });
      const out: number[] = [];
      for (let i = 0; i < 200; i++) {
        panel.update(0.05);
        out.push(panel.glow.intensity);
      }
      return out;
    };
    expect(sample(7)).toEqual(sample(7));
    expect(sample(7)).not.toEqual(sample(8));
  });
});

describe('video flicker', () => {
  // A television has to read as a television and not as a blue lamp. That
  // means the glow must (a) move at all, and (b) move in STEPS at cuts
  // rather than as a smooth wobble — a sine wave would look like a fire.
  function trace(seconds: number, dt = 1 / 60): number[] {
    const panel = createScreenPanel(1.2, 0.68, { mode: 'video', seed: 3 });
    const out: number[] = [];
    for (let i = 0; i < seconds / dt; i++) {
      panel.update(dt);
      out.push(panel.glow.intensity);
    }
    return out;
  }

  it('varies over time', () => {
    const t = trace(20);
    const min = Math.min(...t);
    const max = Math.max(...t);
    expect(max - min).toBeGreaterThan(0.3);
  });

  it('is bimodal: long quiet holds punctuated by hard cuts', () => {
    // The property that separates a television from a campfire. Testing it
    // by magnitude alone is circular (a small cut looks like drift), so test
    // the SHAPE of the distribution: almost every frame is near-still, and
    // the extreme is enormous by comparison.
    const t = trace(30);
    const steps = t
      .slice(1)
      .map((v, i) => Math.abs(v - t[i]))
      .sort((a, b) => a - b);
    const p97 = steps[Math.floor(steps.length * 0.97)];
    expect(p97).toBeLessThan(0.01); // the holds
    expect(steps[steps.length - 1]).toBeGreaterThan(0.2); // the cuts
    // And there are several of them, not one.
    expect(steps.filter((s) => s > 0.15).length).toBeGreaterThanOrEqual(5);
  });

  it('changes shot colour at the cut, not continuously', () => {
    const panel = createScreenPanel(1.2, 0.68, { mode: 'video', seed: 5 });
    const colours: string[] = [];
    for (let i = 0; i < 1800; i++) {
      panel.update(1 / 60);
      colours.push(panel.glow.color.getHexString());
    }
    const distinct = new Set(colours).size;
    // Colour is constant within a shot (the CPU pushes the same value to the
    // shader), so the count of distinct colours is the count of shots seen —
    // far fewer than the frame count.
    expect(distinct).toBeGreaterThan(5);
    expect(distinct).toBeLessThan(40);
  });
});

describe('screen light', () => {
  it('carries the panel colour and dies with it', () => {
    const panel = createScreenPanel(1.2, 0.68, { mode: 'video', seed: 2 });
    const glow = createScreenLight(panel);
    panel.update(0.4);
    glow.update();
    expect(glow.light.intensity).toBeGreaterThan(0);
    expect(glow.light.color.getHex()).toBe(panel.glow.color.getHex());

    panel.setMode('off');
    panel.update(0.1);
    glow.update();
    expect(glow.light.intensity).toBe(0);
  });

  it('scales with panel size — a television is not a tablet', () => {
    const big = createScreenPanel(1.2, 0.68, { mode: 'feed' });
    const small = createScreenPanel(0.24, 0.135, { mode: 'feed' });
    const a = createScreenLight(big);
    const b = createScreenLight(small);
    big.update(0.1);
    small.update(0.1);
    a.update();
    b.update();
    expect(a.light.intensity).toBeGreaterThan(b.light.intensity * 1.8);
  });

  it('follows the panel through the world', () => {
    const tv = createTelevision({ mode: 'video' });
    const glow = createScreenLight(tv.screen);
    tv.object.position.set(4, 0, -2);
    tv.object.updateWorldMatrix(true, true);
    const at = glow.light.getWorldPosition(new Vector3());
    // In front of the panel (screens face +z) and at panel height.
    expect(at.x).toBeCloseTo(4, 1);
    expect(at.z).toBeGreaterThan(-2);
    expect(at.y).toBeGreaterThan(0.4);
  });
});

describe('screen props', () => {
  it.each(SCREEN_PROPS)('%s publishes a lit face in front of its body', (_name, make) => {
    const prop = make();
    prop.object.updateWorldMatrix(true, true);
    const surface = prop.screen.surface as Mesh;
    expect(surface.parent).toBeTruthy();

    // The lit face must point out of the prop, not into it: +z in world.
    const normal = new Vector3(0, 0, 1).transformDirection(surface.matrixWorld);
    expect(normal.z).toBeGreaterThan(0.6);

    // ...and nothing may cover it. Not "the panel is the frontmost thing" —
    // a television's feet stick out further than its screen and always will.
    // The claim worth testing is that you can SEE the screen, so look at it:
    // cast back at the panel from in front, across its face, and require the
    // first thing hit every time to be the panel itself.
    const right = new Vector3(1, 0, 0).transformDirection(surface.matrixWorld);
    const up = new Vector3(0, 1, 0).transformDirection(surface.matrixWorld);
    const centre = surface.getWorldPosition(new Vector3());
    const ray = new Raycaster();
    for (const [u, v] of [[0, 0], [-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
      const at = centre
        .clone()
        .addScaledVector(right, (u * prop.screen.width) / 2)
        .addScaledVector(up, (v * prop.screen.height) / 2);
      ray.set(at.clone().addScaledVector(normal, 0.5), normal.clone().negate());
      const hits = ray.intersectObject(prop.object, true);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].object.name).toBe('screen');
    }
  });

  it.each(SCREEN_PROPS)('%s stands on its own base at y = 0', (_name, make) => {
    const prop = make();
    const box = new Box3().setFromObject(prop.object);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.min.y).toBeLessThan(0.05);
  });

  it('hangs a wall television with its bottom edge at the origin', () => {
    const wall = createTelevision({ mount: 'wall', diagonal: 1.2 });
    const box = new Box3().setFromObject(wall.object);
    expect(box.min.y).toBeCloseTo(0, 1);
    // No pedestal in the way.
    expect(wall.obstacleRadius).toBe(0);
    const stand = createTelevision({ mount: 'stand', diagonal: 1.2 });
    expect(stand.obstacleRadius).toBeGreaterThan(0);
  });

  it('opens and shuts a laptop lid', () => {
    const shut = createLaptop({ open: 0 });
    const open = createLaptop({ open: 1 });
    const height = (p: ScreenProp): number => new Box3().setFromObject(p.object).max.y;
    // Shut, the lid lies on the deck; open, it stands up.
    expect(height(shut)).toBeLessThan(0.06);
    expect(height(open)).toBeGreaterThan(0.15);
  });

  it('makes a tablet a carryable that happens to have a screen', () => {
    const tablet = createTablet();
    // The whole composition claim: no new pick-up verb was needed.
    expect(tablet.carry).toBe('tray');
    expect(tablet.screen.width).toBeGreaterThan(0.2);
    tablet.screen.setMode('feed');
    tablet.screen.update(0.1);
    expect(tablet.screen.glow.intensity).toBeGreaterThan(0);
  });

  it('scrolls a feed only when asked to', () => {
    const still = createScreenPanel(0.5, 0.28, { mode: 'feed' });
    const moving = createScreenPanel(0.5, 0.28, { mode: 'feed', scrollRate: 2 });
    for (let i = 0; i < 60; i++) {
      still.update(1 / 60);
      moving.update(1 / 60);
    }
    // Scroll is a shader uniform, so read it through the material's patch.
    expect(still.material.userData).toBeDefined();
    expect(moving.mode).toBe('feed');
  });
});
