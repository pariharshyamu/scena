import { describe, expect, it } from 'vitest';
import { Box3, Mesh, MeshStandardMaterial, Points, TorusGeometry } from 'three';
import { createBunting } from '../src/props/bunting';
import { createFountain } from '../src/props/fountain';
import { createCart, type CartCargo } from '../src/props/cart';

type Obj = { traverse(cb: (o: unknown) => void): void };

function meshCount(object: Obj): number {
  let n = 0;
  object.traverse((o) => {
    if (o instanceof Mesh) n++;
  });
  return n;
}

/** Call every mesh's onBeforeRender (self-animation drivers advance clocks). */
function pumpRenderLoop(object: Obj): void {
  object.traverse((o) => {
    const fn = (o as Mesh).onBeforeRender as ((...a: unknown[]) => void) | undefined;
    if (typeof fn === 'function') fn();
  });
}

describe('createBunting', () => {
  it('is deterministic per seed', () => {
    expect(meshCount(createBunting({ seed: 42 }).object)).toBe(meshCount(createBunting({ seed: 42 }).object));
  });

  it('builds two poles, a rope and a row of flaglets', () => {
    const b = createBunting({ seed: 5, flags: 8 });
    expect(b.object.name).toBe('bunting');
    // 2 poles + 1 rope + 8 flaglets.
    expect(meshCount(b.object)).toBe(11);
    expect(b.obstacleRadius).toBe(0); // decorative, strung overhead
    // Flaglets ride the shared cloth-wave program.
    let waveMats = 0;
    b.object.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (m?.customProgramCacheKey?.() === 'scena-bunting-v1') waveMats++;
    });
    expect(waveMats).toBe(8);
  });

  it('self-animates: pumping the loop advances the flaglet clocks', () => {
    const b = createBunting({ seed: 3, flags: 6 });
    const clock = (): number => {
      let v = -1;
      b.object.traverse((o) => {
        const m = (o as Mesh).material as { userData?: { waveUniforms?: { uTime: { value: number } } } } | undefined;
        if (v < 0 && m?.userData?.waveUniforms) v = m.userData.waveUniforms.uTime.value;
      });
      return v;
    };
    expect(clock()).toBe(0);
    pumpRenderLoop(b.object);
    expect(clock()).toBeGreaterThan(0);
  });
});

describe('createFountain', () => {
  it('is deterministic per seed', () => {
    expect(meshCount(createFountain({ seed: 11 }).object)).toBe(meshCount(createFountain({ seed: 11 }).object));
  });

  it('builds a basin, two water pools, a centre statue and a spray', () => {
    const f = createFountain({ seed: 4 });
    expect(f.object.name).toBe('fountain');
    let waters = 0;
    let statue = false;
    let spray = false;
    f.object.traverse((o) => {
      if ((o as Mesh).name === 'water') waters++;
      if ((o as { name?: string }).name === 'statue') statue = true;
      if (o instanceof Points) spray = true;
    });
    expect(waters).toBe(2); // lower pool + upper bowl (createWater tie-in)
    expect(statue).toBe(true);
    expect(spray).toBe(true);
    expect(f.obstacleRadius).toBeGreaterThan(1);
  });

  it('self-animates the water and spray from the render loop', () => {
    const f = createFountain({ seed: 6 });
    let sprayU: { uTime: { value: number } } | undefined;
    f.object.traverse((o) => {
      const m = (o as Points).material as { uniforms?: { uTime: { value: number } } } | undefined;
      if (o instanceof Points && m?.uniforms) sprayU = m.uniforms as { uTime: { value: number } };
    });
    expect(sprayU!.uTime.value).toBe(0);
    pumpRenderLoop(f.object);
    expect(sprayU!.uTime.value).toBeGreaterThan(0);
  });
});

describe('createCart', () => {
  function tyreCount(object: Obj): number {
    let n = 0;
    object.traverse((o) => {
      if ((o as Mesh).geometry instanceof TorusGeometry) n++;
    });
    return n;
  }

  it('is deterministic per seed', () => {
    expect(meshCount(createCart({ seed: 42 }).object)).toBe(meshCount(createCart({ seed: 42 }).object));
  });

  it('a wagon has four wheels, a hand cart two', () => {
    // Each wheel is a tyre torus + a felloe torus = 2 tori per wheel.
    expect(tyreCount(createCart({ seed: 1, style: 'wagon' }).object)).toBe(8);
    expect(tyreCount(createCart({ seed: 1, style: 'cart' }).object)).toBe(4);
  });

  it('loads every cargo kind and stays deterministic', () => {
    for (const cargo of ['empty', 'crates', 'barrels', 'sacks', 'hay'] as CartCargo[]) {
      const a = createCart({ seed: 8, style: 'wagon', cargo });
      const b = createCart({ seed: 8, style: 'wagon', cargo });
      expect(meshCount(a.object)).toBe(meshCount(b.object));
      expect(a.object.name).toBe('cart');
    }
    // A loaded cart has more meshes than an empty one.
    expect(meshCount(createCart({ seed: 8, style: 'wagon', cargo: 'barrels' }).object)).toBeGreaterThan(
      meshCount(createCart({ seed: 8, style: 'wagon', cargo: 'empty' }).object)
    );
  });

  it('rests on the ground with a blocking footprint', () => {
    const cart = createCart({ seed: 5, style: 'wagon' });
    const box = new Box3().setFromObject(cart.object);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.05);
    expect(cart.obstacleRadius).toBeGreaterThan(1);
  });
});
