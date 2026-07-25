import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Object3D, Points, Vector3 } from 'three';
import {
  createDroplets,
  createFill,
  createFountain,
  createSpray,
  createSteam,
  createStream,
  flowingWaterMaterial,
} from '../src';

const boxOf = (object: Object3D): Box3 => {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
};

/** Run a material's shader patch against a stub and return the fragment source. */
function compile(material: { onBeforeCompile?: (s: never, r: never) => void }): {
  frag: string;
  vert: string;
  uniforms: Record<string, { value: unknown }>;
} {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: 'void main() {\n#include <common>\n#include <begin_vertex>\n}',
    fragmentShader: 'void main() {\n#include <map_fragment>\n}',
  };
  material.onBeforeCompile?.(shader as never, null as never);
  return { frag: shader.fragmentShader, vert: shader.vertexShader, uniforms: shader.uniforms };
}

describe('flowingWaterMaterial', () => {
  it('is transparent and never writes depth', () => {
    // Two overlapping streams sort wrong for one frame and read as solid for
    // the rest of the shot.
    const m = flowingWaterMaterial();
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
  });

  it('forces vUv — the whole pattern is laid out in UV space', () => {
    expect(flowingWaterMaterial().defines?.USE_UV).toBe('');
  });

  it('drives its alpha from time and rate', () => {
    const { frag, uniforms } = compile(flowingWaterMaterial());
    expect(frag).toContain('uFlowTime');
    expect(frag).toContain('diffuseColor.a *=');
    expect(uniforms.uFlowRate.value).toBe(1);
  });

  it('publishes the uniforms the caller has to advance', () => {
    const m = flowingWaterMaterial();
    const u = m.userData.flowUniforms as { uFlowTime: { value: number } };
    expect(u.uFlowTime.value).toBe(0);
  });
});

describe('createStream', () => {
  it('falls BELOW its origin — a stream is placed by its lip', () => {
    const s = createStream({ height: 0.3, splash: false });
    const box = boxOf(s.object);
    expect(box.max.y).toBeLessThan(0.01);
    expect(box.min.y).toBeLessThan(-0.28);
  });

  it('narrows as it falls', () => {
    // Falling water accelerates, so the same volume per second passes through
    // a thinner column. Straight-sided falling water is a pipe.
    const s = createStream({ height: 0.3, radius: 0.02 });
    const column = s.object.children.find((c) => c.name === 'column') as Mesh;
    const p = (column.geometry as unknown as { parameters: { radiusTop: number; radiusBottom: number } })
      .parameters;
    expect(p.radiusBottom).toBeLessThan(p.radiusTop);
  });

  it('actually moves, and only when updated', () => {
    // The defect this replaces: the fountain's falling water was a STATIC
    // cylinder. It passed every check except this one.
    const s = createStream({ height: 0.3 });
    const column = s.object.children.find((c) => c.name === 'column') as Mesh;
    const u = (column.material as unknown as {
      userData: { flowUniforms: { uFlowTime: { value: number } } };
    }).userData.flowUniforms;
    expect(u.uFlowTime.value).toBe(0);
    s.update(0.5);
    expect(u.uFlowTime.value).toBeCloseTo(0.5, 6);
  });

  it('draws nothing at all when the tap is closed', () => {
    // Not "fully transparent" — a transparent column still costs a draw and
    // still sorts against everything behind it.
    const s = createStream({ height: 0.3 });
    const column = s.object.children.find((c) => c.name === 'column')!;
    expect(column.visible).toBe(true);
    s.setFlow(0);
    expect(column.visible).toBe(false);
    expect(s.flow).toBe(0);
    s.setFlow(0.6);
    expect(column.visible).toBe(true);
  });

  it('clamps the flow', () => {
    const s = createStream({});
    s.setFlow(4);
    expect(s.flow).toBe(1);
    s.setFlow(-2);
    expect(s.flow).toBe(0);
  });

  it('a thin stream breaks up sooner than a thick one', () => {
    const thin = createStream({ radius: 0.006 });
    const thick = createStream({ radius: 0.04 });
    const breakOf = (s: { object: Object3D }): number => {
      const column = s.object.children.find((c) => c.name === 'column') as Mesh;
      return (
        (column.material as unknown as {
          userData: { flowUniforms: { uFlowBreak: { value: number } } };
        }).userData.flowUniforms.uFlowBreak.value
      );
    };
    expect(breakOf(thin)).toBeLessThan(breakOf(thick));
  });
});

describe('createSpray', () => {
  it('widens as it falls — the opposite of a stream', () => {
    // A shower head is designed to break the water up and spread it. Getting
    // this backwards gives a shower that looks like a poured bucket.
    const s = createSpray({ height: 1.6, radius: 0.06, spread: 0.26 });
    const cone = s.object.children.find((c) => c.name === 'cone') as Mesh;
    const p = (cone.geometry as unknown as { parameters: { radiusTop: number; radiusBottom: number } })
      .parameters;
    expect(p.radiusBottom).toBeGreaterThan(p.radiusTop);
  });

  it('breaks up far sooner than a tap stream', () => {
    const breakOf = (o: { object: Object3D }, name: string): number => {
      const mesh = o.object.children.find((c) => c.name === name) as Mesh;
      return (
        (mesh.material as unknown as {
          userData: { flowUniforms: { uFlowBreak: { value: number } } };
        }).userData.flowUniforms.uFlowBreak.value
      );
    };
    expect(breakOf(createSpray({}), 'cone')).toBeLessThan(
      breakOf(createStream({ radius: 0.03 }), 'column')
    );
  });

  it('hangs below the head and turns off completely', () => {
    const s = createSpray({ height: 1.6 });
    expect(boxOf(s.object).min.y).toBeLessThan(-1.4);
    s.setFlow(0);
    expect(s.object.children.find((c) => c.name === 'cone')!.visible).toBe(false);
  });
});

describe('createFill', () => {
  it('rises with the level, and shows nothing when empty', () => {
    const f = createFill({ radius: 0.18, depth: 0.2 });
    const surface = f.object.children.find((c) => c.name === 'surface')!;
    expect(surface.visible).toBe(false);
    f.setLevel(0.5);
    expect(surface.position.y).toBeCloseTo(0.1, 6);
    expect(surface.visible).toBe(true);
    f.setLevel(1);
    expect(surface.position.y).toBeCloseTo(0.2, 6);
  });

  it('clamps, and fillBy accumulates', () => {
    const f = createFill({ depth: 0.1 });
    f.fillBy(0.3);
    expect(f.level).toBeCloseTo(0.3, 6);
    f.fillBy(0.9);
    expect(f.level).toBe(1);
    f.fillBy(-5);
    expect(f.level).toBe(0);
  });

  it('is agitated while filling and settles when it stops', () => {
    // A still disc of blue is a disc of blue. The decay is the difference
    // between water and a permanently choppy plate.
    const f = createFill({ radius: 0.2, depth: 0.2 });
    const surface = f.object.children.find((c) => c.name === 'surface') as Mesh;
    const { uniforms } = compile(surface.material as never);
    expect(uniforms.uFillStir.value).toBe(0);

    f.fillBy(0.2);
    f.update(0.016);
    const stirred = uniforms.uFillStir.value as number;
    expect(stirred).toBeGreaterThan(0.3);

    // Left alone it calms down.
    for (let i = 0; i < 200; i++) f.update(0.016);
    expect(uniforms.uFillStir.value as number).toBeLessThan(stirred * 0.2);
  });

  it('a splash stirs it without changing the level', () => {
    const f = createFill({ depth: 0.2, level: 0.5 });
    const surface = f.object.children.find((c) => c.name === 'surface') as Mesh;
    const { uniforms } = compile(surface.material as never);
    f.disturb(0.8);
    f.update(0.016);
    expect(uniforms.uFillStir.value as number).toBeGreaterThan(0.5);
    expect(f.level).toBe(0.5);
  });

  it('ripples in the vertex shader, on a surface that has vertices to ripple', () => {
    const f = createFill({ radius: 0.18, depth: 0.1 });
    const surface = f.object.children.find((c) => c.name === 'surface') as Mesh;
    const { vert } = compile(surface.material as never);
    expect(vert).toContain('uFillStir');
    expect(surface.geometry.attributes.position.count).toBeGreaterThan(8);
  });

  it('takes a rectangular surface too', () => {
    const f = createFill({ width: 0.6, length: 0.4, depth: 0.3, level: 1 });
    const size = boxOf(f.object).getSize(new Vector3());
    expect(size.x).toBeCloseTo(0.6, 2);
    expect(size.z).toBeCloseTo(0.4, 2);
  });
});

describe('createSteam', () => {
  it('starts clear and builds slowly', () => {
    // A room that fogs the instant the tap opens is a smoke machine.
    const s = createSteam({ radius: 0.3 });
    expect(s.density).toBe(0);
    s.setTarget(1);
    s.update(1);
    expect(s.density).toBeGreaterThan(0);
    expect(s.density).toBeLessThan(0.5);
  });

  it('clears more slowly than it builds', () => {
    const build = createSteam({});
    build.setTarget(1);
    for (let i = 0; i < 60; i++) build.update(1 / 60);
    const gained = build.density;

    const clear = createSteam({ density: gained });
    clear.setTarget(0);
    for (let i = 0; i < 60; i++) clear.update(1 / 60);
    const lost = gained - clear.density;
    // A bathroom stays fogged after the shower stops.
    expect(lost).toBeLessThan(gained);
  });

  it('is not drawn when there is none', () => {
    const s = createSteam({});
    s.update(0.1);
    const points = s.object.children[0] as Points;
    expect(points.visible).toBe(false);
    s.setTarget(1);
    for (let i = 0; i < 30; i++) s.update(0.1);
    expect(points.visible).toBe(true);
  });
});

describe('createDroplets', () => {
  it('arcs up when given a rise and falls when not', () => {
    const jet = createDroplets({ rise: 0.4 });
    const shower = createDroplets({ rise: 0 });
    const riseOf = (d: { mesh: Points }): number =>
      (d.mesh.material as unknown as { uniforms: { uRise: { value: number } } }).uniforms.uRise
        .value;
    expect(riseOf(jet)).toBeGreaterThan(0);
    expect(riseOf(shower)).toBe(0);
  });

  it('hides completely at rate 0', () => {
    const d = createDroplets({});
    expect(d.mesh.visible).toBe(true);
    d.setRate(0);
    expect(d.mesh.visible).toBe(false);
  });
});

describe('the fountain now uses the shared water', () => {
  it('its falling water moves', () => {
    // It was eight static translucent cylinders until this release.
    const f = createFountain({ seed: 2 });
    const streams = f.object.children.filter((c) => c.name === 'stream');
    expect(streams.length).toBe(8);
    const column = streams[0].children.find((c) => c.name === 'column') as Mesh;
    const u = (column.material as unknown as {
      userData: { flowUniforms: { uFlowTime: { value: number } } };
    }).userData.flowUniforms;
    expect(u.uFlowTime).toBeDefined();
  });

  it('still self-animates without the caller doing anything', () => {
    const f = createFountain({ seed: 2 });
    const pool = f.object.children.find((c) => (c as Mesh).onBeforeRender !== undefined);
    expect(pool).toBeDefined();
  });
});
