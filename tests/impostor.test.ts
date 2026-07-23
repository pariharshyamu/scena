import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { createImpostor, treeLOD } from '../src/props/impostor';
import { scatter } from '../src/scatter/scatter';

describe('createImpostor', () => {
  it('builds a single-quad billboard with a patched, cache-keyed material', () => {
    const imp = createImpostor({ species: 'sequoia', seed: 3 });
    let meshes = 0;
    let mat: MeshBasicMaterial | null = null;
    imp.object.traverse((o) => {
      if (o instanceof Mesh) {
        meshes++;
        mat = o.material as MeshBasicMaterial;
      }
    });
    expect(meshes).toBe(1);
    expect(mat!).toBeInstanceOf(MeshBasicMaterial);
    expect(mat!.customProgramCacheKey()).toBe('scena-impostor-v1');
    // The billboard reaches past its origin, so it opts out of frustum culling.
    expect((imp.object.children[0] as Mesh).frustumCulled).toBe(false);
  });

  it('injects the billboard expansion and silhouette carving into the shader', () => {
    const imp = createImpostor({ species: 'acacia' });
    const mat = (imp.object.children[0] as Mesh).material as MeshBasicMaterial;
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>',
    } as unknown as { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string };
    (mat.onBeforeCompile as (s: unknown) => void)(shader);
    expect(shader.vertexShader).toContain('gl_Position = projectionMatrix * mvPosition');
    expect(shader.vertexShader).toContain('vImpUv');
    expect(shader.fragmentShader).toContain('discard');
    expect('uImpFoliage' in shader.uniforms).toBe(true);
  });

  it('carries a steering footprint that scales with a giant species height', () => {
    const seq = createImpostor({ species: 'sequoia' }); // height ~27, trunk radius = h*0.06
    expect(seq.obstacleRadius).toBeCloseTo(27 * 0.06, 1);
    // A taller sequoia presents a bigger footprint (height-scaled, like the tree).
    const taller = createImpostor({ species: 'sequoia', height: 40 });
    expect(taller.obstacleRadius).toBeGreaterThan(seq.obstacleRadius);
    // A banyan's vast crown steers far wider than a sequoia's slim trunk.
    const banyan = createImpostor({ species: 'banyan' });
    expect(banyan.obstacleRadius).toBeGreaterThan(seq.obstacleRadius);
  });

  it('honours explicit size and colour overrides', () => {
    const imp = createImpostor({ height: 10, width: 4, foliage: 0x112233, trunk: 0x445566 });
    const mat = (imp.object.children[0] as Mesh).material as MeshBasicMaterial;
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
    (mat.onBeforeCompile as (s: unknown) => void)(shader);
    expect((shader.uniforms.uImpHeight as { value: number }).value).toBe(10);
    expect((shader.uniforms.uImpWidth as { value: number }).value).toBe(4);
  });
});

describe('treeLOD', () => {
  it('produces a scatter item with both a full and a far (impostor) factory', () => {
    const item = treeLOD('sequoia', { weight: 2, variants: 3 });
    expect(item.weight).toBe(2);
    expect(item.variants).toBe(3);
    expect(typeof item.create).toBe('function');
    expect(typeof item.createFar).toBe('function');
  });

  it('drives scatter LOD: near tiles hold full trees, far tiles hold billboards, and update swaps', () => {
    const forest = scatter({
      seed: 4,
      area: { min: { x: -60, z: -60 }, max: { x: 60, z: 60 } },
      density: 0.008,
      minSpacing: 7,
      items: [treeLOD('sequoia', {}), treeLOD('pine', { weight: 3 })],
      lod: { distance: 80, tileSize: 24 },
    });
    expect(forest.tiles && forest.tiles.length).toBeGreaterThan(0);
    expect(typeof forest.update).toBe('function');

    // Camera far away → every tile should be showing its billboard (far) group.
    forest.update!({ position: new Vector3(1000, 20, 1000) });
    const anyFarVisible = forest.tiles!.some((t) => t.far.visible && !t.near.visible);
    expect(anyFarVisible).toBe(true);

    // Camera in the middle → near tiles come back.
    forest.update!({ position: new Vector3(0, 20, 0) });
    const anyNearVisible = forest.tiles!.some((t) => t.near.visible && !t.far.visible);
    expect(anyNearVisible).toBe(true);
  });
});
