import { describe, expect, it } from 'vitest';
import { Box3, Object3D, Raycaster, Vector3 } from 'three';
import { createPool, type PoolStyle } from '../src';

const STYLES: PoolStyle[] = ['plunge', 'bathhouse', 'lido', 'infinity'];

const boxOf = (object: Object3D): Box3 => {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
};

/** First solid thing a ray straight down meets — effects filtered out. */
const under = (pool: ReturnType<typeof createPool>, x: number, z: number) => {
  pool.object.updateMatrixWorld(true);
  return new Raycaster(new Vector3(x, 40, z), new Vector3(0, -1, 0))
    .intersectObject(pool.object, true)
    .filter((h) => h.object.type === 'Mesh');
};

describe('createPool', () => {
  it.each(STYLES)('%s is a hole, not a slab — the water is what you see', (style) => {
    // Written BEFORE the prop, because every defect in the bathing track was
    // a solid where a hole belonged and not one of them moved a number: a
    // shell with a smaller shell inside it, a deck slab that capped its own
    // well, a capped cylinder with the entire pool under the lid.
    const pool = createPool({ style, seed: 2 });
    const first = under(pool, 0, 0)[0];
    expect(first, `${style}: nothing under the ray`).toBeDefined();
    expect(first!.object.name, `${style}: hit something above the water`).toBe('surface');
  });

  it.each(STYLES)('%s goes DOWN from the deck', (style) => {
    const pool = createPool({ style, seed: 1 });
    const box = boxOf(pool.object);
    expect(box.min.y).toBeLessThan(-0.8);
    // And nothing but the board and the ladder handles stands proud of it.
    expect(box.max.y).toBeLessThan(1.1);
  });

  it('the floor actually slopes — a deep end you can measure', () => {
    // A "deep end" that only exists in the docs is the version that fails
    // the moment a swimmer walks into it.
    const pool = createPool({ style: 'lido', length: 12, shallow: 0.9, deep: 2.4, seed: 1 });
    expect(pool.depthAt(-6, 0)).toBeCloseTo(0.9, 5);
    expect(pool.depthAt(6, 0)).toBeCloseTo(2.4, 5);
    expect(pool.depthAt(0, 0)).toBeCloseTo(1.65, 1);

    // And the geometry agrees with the number, which is the part that is
    // easy to let drift.
    const shallowHit = under(pool, -5.9, 0).find((h) => h.object.name === 'floor');
    const deepHit = under(pool, 5.9, 0).find((h) => h.object.name === 'floor');
    expect(shallowHit).toBeDefined();
    expect(deepHit).toBeDefined();
    expect(shallowHit!.point.y - deepHit!.point.y).toBeCloseTo(1.475, 1);
  });

  it('there is no water outside the pool', () => {
    // depthAt returning 0 outside is the whole "am I swimming" test on
    // ANIMA's side, so an out-of-bounds reading that is merely shallow would
    // put a character breaststroking across the car park.
    const pool = createPool({ style: 'lido', length: 12, width: 6 });
    expect(pool.depthAt(0, 0)).toBeGreaterThan(0.5);
    expect(pool.depthAt(20, 0)).toBe(0);
    expect(pool.depthAt(0, 20)).toBe(0);
    expect(pool.depthAt(-30, -30)).toBe(0);
  });

  it('depthAt and surfaceY are in WORLD space — a moved pool moves its water', () => {
    const pool = createPool({ style: 'lido', length: 12, width: 6 });
    const restY = pool.surfaceY;
    expect(pool.depthAt(0, 0)).toBeGreaterThan(0.5);

    pool.object.position.set(50, 3, -20);
    pool.object.updateMatrixWorld(true);
    expect(pool.surfaceY).toBeCloseTo(restY + 3, 5);
    // The water went with it.
    expect(pool.depthAt(0, 0)).toBe(0);
    expect(pool.depthAt(50, -20)).toBeGreaterThan(0.5);
  });

  it('a rotated pool still knows where its own deep end is', () => {
    // worldToLocal, not a subtraction. A quarter turn swaps the axes, and a
    // pool that reports its length along world x after being turned is a
    // swimmer walking into a wall.
    const pool = createPool({ style: 'lido', length: 12, width: 6, shallow: 0.9, deep: 2.4 });
    pool.object.rotation.y = Math.PI / 2;
    pool.object.updateMatrixWorld(true);
    // Local +x (the deep end) now points along world -z.
    expect(pool.depthAt(0, -6)).toBeCloseTo(2.4, 5);
    expect(pool.depthAt(0, 6)).toBeCloseTo(0.9, 5);
    expect(pool.depthAt(5.5, 0)).toBe(0);
  });

  it('the water surface sits below the coping, and an infinity pool is brim-full', () => {
    const lido = createPool({ style: 'lido' });
    expect(lido.surfaceY).toBeLessThan(-0.05);
    const infinity = createPool({ style: 'infinity' });
    expect(infinity.surfaceY).toBeGreaterThan(-0.05);
  });

  it('only the styles that should have a ladder and a board have them', () => {
    expect(createPool({ style: 'plunge' }).ladder).toBeNull();
    expect(createPool({ style: 'bathhouse' }).board).toBeNull();
    const lido = createPool({ style: 'lido' });
    expect(lido.ladder).not.toBeNull();
    expect(lido.board).not.toBeNull();
  });

  it('the ladder is a Climbable, and it reaches the floor of the deep end', () => {
    // Structurally ANIMA's Climbable, exactly like createLadder, so getting
    // out of a pool is the climb code that already exists.
    const pool = createPool({ style: 'lido', seed: 1 });
    pool.object.updateMatrixWorld(true);
    const ladder = pool.ladder!;
    expect(ladder.rungSpacing).toBeGreaterThan(0.2);
    const bottom = ladder.bottom.getWorldPosition(new Vector3());
    const top = ladder.top.getWorldPosition(new Vector3());
    expect(top.y).toBeGreaterThan(bottom.y);
    // It starts under water and ends on the deck.
    expect(bottom.y).toBeLessThan(pool.surfaceY);
    expect(top.y).toBeGreaterThan(pool.surfaceY);
    // And it is at the deep end, where a ladder is needed.
    expect(bottom.x).toBeGreaterThan(0);
  });

  it('the springboard hangs OVER the water', () => {
    // A board beside the pool is a diving accident.
    const pool = createPool({ style: 'lido', length: 12, seed: 1 });
    pool.object.updateMatrixWorld(true);
    const at = pool.board!.anchor.getWorldPosition(new Vector3());
    expect(Math.abs(at.x)).toBeLessThan(12 / 2);
    expect(pool.depthAt(at.x, at.z)).toBeGreaterThan(1.5);
  });

  it('every edge seat faces the water', () => {
    // A slot anchor faces its own +z, so seats placed round a rim without
    // turning them sit everyone facing away from the pool.
    const pool = createPool({ style: 'lido', seed: 3 });
    pool.object.updateMatrixWorld(true);
    for (const seat of pool.edges) {
      const at = seat.anchor.getWorldPosition(new Vector3());
      const facing = seat.anchor.getWorldDirection(new Vector3()).setY(0).normalize();
      // Not "points at the centre" — a seat along a 12 m edge legitimately
      // faces across the pool rather than at the middle of it. The property
      // that matters is that there is WATER in front of it.
      const ahead = at.clone().addScaledVector(facing, 1);
      expect(pool.depthAt(ahead.x, ahead.z)).toBeGreaterThan(0);
      expect(pool.depthAt(at.x, at.z)).toBe(0); // and dry ground under them
    }
  });

  it('the entry steps are at the SHALLOW end', () => {
    const pool = createPool({ style: 'lido', length: 12, shallow: 0.9, deep: 2.4 });
    pool.object.updateMatrixWorld(true);
    const at = pool.entry.anchor.getWorldPosition(new Vector3());
    expect(at.x).toBeLessThan(0);
    expect(pool.entry.approach).toBeDefined();
  });

  it('a disturbance is remembered, and the oldest one is the one that goes', () => {
    // A single ripple slot means the second swimmer erases the first.
    const pool = createPool({ style: 'lido', seed: 1 });
    const shader = {
      uniforms: {} as Record<string, { value: number[] }>,
      vertexShader: 'void main() {\n#include <common>\n#include <begin_vertex>\n}',
      fragmentShader: 'void main() {}',
    };
    const surface = pool.object.children.find((c) => c.name === 'surface')!;
    (surface as unknown as { material: { onBeforeCompile: (s: never) => void } })
      .material.onBeforeCompile(shader as never);

    pool.update(1);
    pool.disturb(1, 0, 1);
    pool.disturb(2, 0, 1);
    const ripples = shader.uniforms.uRipples.value;
    expect(ripples[0]).toBeCloseTo(1, 5);
    expect(ripples[4]).toBeCloseTo(2, 5);
    // Stamped with the time they happened, so the ring can travel and fade.
    expect(ripples[2]).toBeCloseTo(1, 5);
  });

  it('a disturbance lands where it was asked for, in the surface plane', () => {
    // The plane is authored in XY and laid flat by a -90 degree rotation
    // about x, which NEGATES z. Skip that and every ripple appears mirrored
    // across the pool from whatever caused it.
    const pool = createPool({ style: 'lido', seed: 1 });
    const shader = {
      uniforms: {} as Record<string, { value: number[] }>,
      vertexShader: 'void main() {\n#include <common>\n#include <begin_vertex>\n}',
      fragmentShader: 'void main() {}',
    };
    const surface = pool.object.children.find((c) => c.name === 'surface')!;
    (surface as unknown as { material: { onBeforeCompile: (s: never) => void } })
      .material.onBeforeCompile(shader as never);
    pool.disturb(0, 2, 1);
    const ripples = shader.uniforms.uRipples.value;
    // Feed the stored value back through the mesh's own transform and it has
    // to come out where the caller asked.
    const back = new Vector3(ripples[0], ripples[1], 0);
    surface.updateMatrixWorld(true);
    surface.localToWorld(back);
    expect(back.x).toBeCloseTo(0, 5);
    expect(back.z).toBeCloseTo(2, 5);
  });
});
