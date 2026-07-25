import { describe, expect, it } from 'vitest';
import { AdditiveBlending, NormalBlending, Object3D, ShaderMaterial, Vector3 } from 'three';
import {
  createSmoke,
  createExtractor,
  createSmokeLayer,
  createSteam,
  createHeatSource,
  SMOKE_STYLES,
  EXTRACTOR_ERAS,
} from '../src';
import type { SmokeLayer, SmokeSource } from '../src';

const materialOf = (o: Object3D): ShaderMaterial => {
  let found: ShaderMaterial | null = null;
  o.traverse((c) => {
    const m = (c as { material?: unknown }).material;
    if (!found && m instanceof ShaderMaterial) found = m;
  });
  return found!;
};

const run = (layer: SmokeLayer, seconds: number, dt = 1 / 30): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) layer.update(dt);
};

const room = (o: Parameters<typeof createSmokeLayer>[0] = {}): SmokeLayer =>
  createSmokeLayer({ width: 5, depth: 4, height: 2.6, ...o });

describe('createSmoke — the reason this file exists', () => {
  it('IS NOT ADDITIVE, and the steam it is not is', () => {
    // Additive can only ever ADD light. No choice of colour or opacity in an
    // additive pass produces something that makes the wall behind it darker,
    // so a plume drawn that way is steam whatever you call it.
    expect(materialOf(createSteam().object).blending).toBe(AdditiveBlending);
    expect(materialOf(createSmoke().object).blending).toBe(NormalBlending);
  });

  it('and writes its own colour rather than white', () => {
    const grease = materialOf(createSmoke({ style: 'grease' }).object);
    const wood = materialOf(createSmoke({ style: 'wood' }).object);
    const g = grease.uniforms.uColour.value;
    const w = wood.uniforms.uColour.value;
    // Grease smoke is nearly black; wood smoke is pale. Under additive
    // blending the first of those would simply be invisible.
    // Compared to each other rather than to an absolute: three.js converts
    // an sRGB hex to linear on the way in, so every one of these numbers is
    // about half what the hex literal looks like.
    expect(g.r + g.g + g.b).toBeLessThan(0.2);
    expect(w.r + w.g + w.b).toBeGreaterThan((g.r + g.g + g.b) * 6);
    expect(grease.fragmentShader).not.toMatch(/vec4\(1\.0, 1\.0, 1\.0/);
  });

  it.each(SMOKE_STYLES)('%s builds fast and dies slowly', (style) => {
    const s = createSmoke({ style });
    expect(s.rate).toBe(0);
    expect(s.output).toBe(0);
    s.setRate(1);
    for (let i = 0; i < 60; i++) s.update(1 / 60);
    expect(s.rate, style).toBeGreaterThan(0.6);
    const lit = s.rate;
    s.setRate(0);
    for (let i = 0; i < 30; i++) s.update(1 / 60);
    // Still going half a second after the damper shut — a fire that stops
    // smoking the instant you close it is a switch.
    expect(s.rate, style).toBeGreaterThan(0.1);
    expect(s.rate).toBeLessThan(lit);
  });

  it('a grease fire puts out far more than a scorching pan', () => {
    const grease = createSmoke({ style: 'grease' });
    const scorch = createSmoke({ style: 'scorch' });
    for (const s of [grease, scorch]) {
      s.setRate(1);
      for (let i = 0; i < 300; i++) s.update(1 / 60);
    }
    expect(grease.output).toBeGreaterThan(scorch.output * 4);
  });
});

describe('createSmokeLayer — IT FILLS FROM THE CEILING DOWN', () => {
  const smoking = (): { layer: SmokeLayer; source: SmokeSource } => {
    const layer = room();
    const source = createSmoke({ style: 'soot' });
    source.setRate(1);
    layer.add(source);
    return { layer, source };
  };

  it('is thick at the ceiling long before it is anything at head height', () => {
    // The whole track. Heat is a field over a surface and cold is a field
    // in a box; this is the first one where y is the interesting argument.
    const { layer } = smoking();
    run(layer, 12);
    const ceiling = layer.smokeAt(0, 2.5, 0);
    const head = layer.smokeAt(0, 1.6, 0);
    const floor = layer.smokeAt(0, 0.2, 0);
    expect(ceiling).toBeGreaterThan(0.1);
    expect(head, 'it filled the room like a bathtub').toBeLessThan(ceiling * 0.5);
    // Below the layer the residual is even — that IS what stratified means,
    // and a gradient down there would be a room filling like a bathtub.
    expect(floor).toBeLessThanOrEqual(head);
    expect(floor).toBeLessThan(ceiling * 0.5);
  });

  it('and it comes down as it builds', () => {
    const { layer } = smoking();
    run(layer, 8);
    const early = layer.baseY;
    expect(early).toBeLessThan(2.6);
    run(layer, 70);
    expect(layer.baseY, 'the layer never descended').toBeLessThan(early - 0.3);
    expect(layer.smokeAt(0, 1.6, 0)).toBeGreaterThan(0.2);
  });

  it('is nothing at all outside the room', () => {
    const { layer } = smoking();
    run(layer, 40);
    expect(layer.smokeAt(0, 2.5, 0)).toBeGreaterThan(0.1);
    expect(layer.smokeAt(9, 2.5, 0)).toBe(0);
    expect(layer.smokeAt(0, 2.5, 9)).toBe(0);
    // …and it follows the room around rather than living at the origin.
    layer.object.position.set(20, 0, 0);
    expect(layer.smokeAt(0, 2.5, 0)).toBe(0);
    expect(layer.smokeAt(20, 2.5, 0)).toBeGreaterThan(0.1);
  });

  it('clears when the source stops, and clears at once if you open a window', () => {
    const { layer, source } = smoking();
    run(layer, 40);
    const full = layer.level;
    expect(full).toBeGreaterThan(0.05);
    source.setRate(0);
    run(layer, 200);
    expect(layer.level).toBeLessThan(full * 0.6);
    layer.clear();
    expect(layer.level).toBe(0);
    expect(layer.smokeAt(0, 2.5, 0)).toBe(0);
  });

  it('THE ALARM IS ON THE CEILING, so it goes off before anybody notices', () => {
    const { layer } = smoking();
    const log: boolean[] = [];
    layer.onAlarm = (on) => log.push(on);
    run(layer, 60);
    expect(log).toEqual([true]);
    // At the moment it sounded, the room was still perfectly usable.
    expect(layer.smokeAt(0, 1.6, 0)).toBeLessThan(layer.smokeAt(0, 2.3, 0));
  });

  it('and re-arms once the room is cleared, without chattering', () => {
    const { layer, source } = smoking();
    const log: boolean[] = [];
    layer.onAlarm = (on) => log.push(on);
    run(layer, 90);
    source.setRate(0);
    run(layer, 400);
    expect(log).toEqual([true, false]);
    source.setRate(1);
    run(layer, 90);
    expect(log).toEqual([true, false, true]);
  });
});

describe('createExtractor — two jobs, and they are not the same job', () => {
  it.each(EXTRACTOR_ERAS)('%s catches most under it and nothing across the room', (era) => {
    // A hood over the hob catches the pan that has caught fire; the same
    // hood does nothing about a pan on the other side of the kitchen,
    // however hard the fan runs.
    const e = createExtractor({ era });
    e.setPower(1);
    for (let i = 0; i < 120; i++) e.update(1 / 60, 1);
    // Under the MOUTH, which is what it publishes an anchor for.
    e.object.updateMatrixWorld(true);
    const at = e.mouth.getWorldPosition(new Vector3());
    expect(e.catches(at.x, at.z), era).toBeGreaterThan(0.5);
    expect(e.catches(4, 0), era).toBe(0);
  });

  it('a smoke hole has a huge capture and almost no reach', () => {
    // Which is why a medieval hall is smoky everywhere except under the
    // hole: you do not move the hole, you move the fire.
    const hole = createExtractor({ era: 'hole' });
    const hood = createExtractor({ era: 'hood' });
    hood.setPower(1);
    for (const e of [hole, hood]) for (let i = 0; i < 200; i++) e.update(1 / 60, 1);
    expect(hole.catches(0.9, 0), 'a hole reached across the room').toBe(0);
    expect(hood.catches(0.9, 0)).toBeGreaterThan(0.05);
    // And a hole barely scavenges the standing layer at all.
    expect(hood.draw).toBeGreaterThan(hole.draw * 8);
  });

  it('A COLD FLUE DOES NOT DRAW', () => {
    // Which is why a fire smokes into the room when you first light it.
    const cold = createExtractor({ era: 'chimney' });
    const hot = createExtractor({ era: 'chimney' });
    for (let i = 0; i < 120; i++) {
      cold.update(1 / 60, 0);
      hot.update(1 / 60, 1);
    }
    expect(cold.catches(0, 0)).toBeGreaterThan(0);
    expect(hot.catches(0, 0)).toBeGreaterThan(cold.catches(0, 0) * 3);
    expect(hot.draw).toBeGreaterThan(cold.draw * 3);
  });

  it('reads a real HeatField under its mouth', () => {
    // A chimney over a hearth — the pairing that actually existed, and the
    // one that catches the probe being taken at the origin: the origin is
    // the front lip of the canopy, which is the one place under it that a
    // fire never is.
    const stove = createHeatSource({ era: 'hearth' });
    const flue = createExtractor({ era: 'chimney' });
    flue.object.updateMatrixWorld(true);
    const at = flue.mouth.getWorldPosition(new Vector3());
    for (let i = 0; i < 120; i++) {
      stove.update(1 / 60);
      flue.update(1 / 60, stove);
    }
    const off = flue.catches(at.x, at.z);
    stove.setPower(1);
    // A hearth takes twenty-two seconds to come up, and that is the number
    // the heat track chose on purpose.
    for (let i = 0; i < 60 * 60; i++) {
      stove.update(1 / 60);
      flue.update(1 / 60, stove);
    }
    expect(stove.temperature).toBeGreaterThan(0.8);
    expect(flue.catches(at.x, at.z), 'lighting the fire did not help the flue')
      .toBeGreaterThan(off * 1.5);
  });

  it('a fan is a Manipulable, and there is nothing to switch on a hole', () => {
    const hood = createExtractor({ era: 'hood' });
    expect(hood.fan).not.toBeNull();
    expect(hood.draw).toBe(0);
    hood.setPower(true);
    for (let i = 0; i < 120; i++) hood.update(1 / 60);
    expect(hood.draw).toBeGreaterThan(0.1);
    expect(hood.power).toBe(1);

    const hole = createExtractor({ era: 'hole' });
    expect(hole.fan).toBeNull();
    // A no-op where there is nothing to switch — the same call runs a hood
    // and does nothing to a hole in the roof.
    hole.setPower(0);
    expect(hole.power).toBe(1);
    expect(hole.draw).toBeGreaterThan(0);
  });

  it('the filter clogs, chokes it, and can be cleaned', () => {
    const hood = createExtractor({ era: 'hood' });
    hood.setPower(1);
    for (let i = 0; i < 120; i++) hood.update(1 / 60);
    const fresh = hood.draw;
    expect(hood.clogged).toBeLessThan(0.05);

    for (let i = 0; i < 60 * 200; i++) hood.update(1 / 60);
    expect(hood.clogged, 'it never clogged').toBeGreaterThan(0.5);
    expect(hood.draw, 'a blocked filter cost it nothing').toBeLessThan(fresh * 0.6);
    // …and it catches less over the pan too, not only in the room.
    const choked = hood.catches(0, 0);
    hood.clean();
    expect(hood.clogged).toBe(0);
    hood.update(1 / 60);
    expect(hood.draw).toBeGreaterThanOrEqual(fresh);
    expect(hood.catches(0, 0)).toBeGreaterThan(choked * 1.4);
  });

  it('only the eras with a filter clog at all', () => {
    for (const era of ['hole', 'chimney'] as const) {
      const e = createExtractor({ era });
      for (let i = 0; i < 60 * 600; i++) e.update(1 / 60, 1);
      expect(e.clogged, era).toBe(0);
    }
  });
});

describe('createSmokeLayer — sources against extractors', () => {
  const scene = (era: 'hole' | 'chimney' | 'hood' | 'downdraft') => {
    const layer = room();
    const source = createSmoke({ style: 'soot' });
    source.setRate(1);
    layer.add(source);
    const vent = createExtractor({ era });
    vent.setPower(1);
    layer.vent(vent);
    return { layer, source, vent };
  };

  it('an extractor over the pan keeps the room usable', () => {
    const bare = room();
    const s = createSmoke({ style: 'soot' });
    s.setRate(1);
    bare.add(s);
    const { layer, vent } = scene('hood');
    for (let i = 0; i < 30 * 90; i++) {
      bare.update(1 / 30);
      vent.update(1 / 30, 1);
      layer.update(1 / 30);
    }
    expect(bare.smokeAt(0, 1.6, 0)).toBeGreaterThan(0.2);
    expect(layer.smokeAt(0, 1.6, 0), 'the hood did nothing').toBeLessThan(
      bare.smokeAt(0, 1.6, 0) * 0.35
    );
  });

  it('MOVE THE PAN OUT FROM UNDER IT AND IT STOPS HELPING', () => {
    // TWO scenes, not one hood run twice. Running the same hood through both
    // halves let its filter clog for the whole of the first ninety seconds,
    // so the second half was measuring a blocked extractor and came out
    // BACKWARDS — the pan under the hood filled the room faster than the
    // pan across the kitchen.
    const at = (x: number): number => {
      const { layer, vent, source } = scene('hood');
      vent.object.updateMatrixWorld(true);
      const m = vent.mouth.getWorldPosition(new Vector3());
      source.object.position.set(m.x + x, 0.9, m.z);
      for (let i = 0; i < 30 * 90; i++) {
        vent.update(1 / 30, 1);
        layer.update(1 / 30);
      }
      return layer.level;
    };
    const under = at(0);
    const away = at(3.5);
    expect(away, 'nothing accumulated even with no extraction').toBeGreaterThan(0.1);
    expect(under, 'position made no difference at all').toBeLessThan(away * 0.35);
  });

  it('two hoods over one pan do not catch 160% of it', () => {
    const layer = room();
    const source = createSmoke({ style: 'soot' });
    source.setRate(1);
    layer.add(source);
    for (let i = 0; i < 2; i++) {
      const v = createExtractor({ era: 'hood', seed: i });
      v.setPower(1);
      layer.vent(v);
    }
    for (let i = 0; i < 30 * 60; i++) layer.update(1 / 30);
    // Still climbing, not going negative.
    expect(layer.level).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(layer.level)).toBe(true);
  });

  it('switching the fan OFF lets the room fill again', () => {
    const { layer, vent } = scene('hood');
    for (let i = 0; i < 30 * 60; i++) {
      vent.update(1 / 30, 1);
      layer.update(1 / 30);
    }
    const held = layer.level;
    expect(held, 'the hood was not keeping up in the first place').toBeLessThan(0.1);
    vent.setPower(0);
    for (let i = 0; i < 30 * 90; i++) {
      vent.update(1 / 30, 1);
      layer.update(1 / 30);
    }
    expect(layer.level).toBeGreaterThan(0.15);
  });
});

describe('the props themselves', () => {
  it.each(EXTRACTOR_ERAS)('%s hangs at a sensible height with somewhere to stand', (era) => {
    const e = createExtractor({ era });
    expect(e.slots?.[0]).toBe(e.slot);
    expect(e.slot.approach).toBeDefined();
  });

  it('you walk under a hood and a smoke hole', () => {
    expect(createExtractor({ era: 'hood' }).obstacleRadius).toBe(0);
    expect(createExtractor({ era: 'hole' }).obstacleRadius).toBe(0);
    expect(createExtractor({ era: 'chimney' }).obstacleRadius).toBeGreaterThan(0.2);
  });

  it('a plume is walk-through and costs nothing when it is off', () => {
    const s = createSmoke();
    expect(s.obstacleRadius).toBe(0);
    s.update(1 / 60);
    expect(s.object.visible).toBe(false);
    s.setRate(1);
    for (let i = 0; i < 30; i++) s.update(1 / 60);
    expect(s.object.visible).toBe(true);
  });
});
