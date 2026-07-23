import { describe, expect, it } from 'vitest';
import { Box3, Group, Mesh, Vector3 } from 'three';
import { buildTextGeometry, measureText } from '../src/text/textGeometry';
import { FONT } from '../src/text/font';
import { createSign } from '../src/props/sign';

type Obj = { traverse(cb: (o: unknown) => void): void };

function meshCount(object: Obj): number {
  let n = 0;
  object.traverse((o) => {
    if (o instanceof Mesh) n++;
  });
  return n;
}

function triCount(object: Obj): number {
  let n = 0;
  object.traverse((o) => {
    if (o instanceof Mesh) {
      const idx = o.geometry.getIndex();
      if (idx) n += idx.count / 3;
    }
  });
  return n;
}

describe('vector font', () => {
  it('covers the letters, digits and punctuation a signpost needs', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      expect(FONT[ch], ch).toBeDefined();
      expect(FONT[ch].advance).toBeGreaterThan(0);
    }
    for (const ch of ".,'\"!?-&:/() ") {
      expect(FONT[ch], `punct ${JSON.stringify(ch)}`).toBeDefined();
    }
  });
});

describe('buildTextGeometry', () => {
  it('produces indexed relief geometry with real triangles', () => {
    const { geometry } = buildTextGeometry('HAVEN');
    const pos = geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
    expect(geometry.getIndex()!.count % 3).toBe(0);
    // Relief stands off the board in +Z.
    const box = new Box3().setFromBufferAttribute(pos as never);
    expect(box.max.z).toBeGreaterThan(0);
  });

  it('measures proportionally: longer strings are wider', () => {
    const short = measureText('II');
    const long = measureText('WWWW');
    expect(long).toBeGreaterThan(short);
    // measureText agrees with the built geometry's reported width.
    expect(buildTextGeometry('HAVENBROOK').width).toBeCloseTo(measureText('HAVENBROOK'), 5);
  });

  it('scales with size and centres by default (x spans ±width/2)', () => {
    const big = buildTextGeometry('OAK', { size: 1 });
    const small = buildTextGeometry('OAK', { size: 0.5 });
    expect(big.width).toBeCloseTo(small.width * 2, 5);
    const box = new Box3().setFromBufferAttribute(big.geometry.getAttribute('position') as never);
    expect(box.min.x).toBeLessThan(0);
    expect(box.max.x).toBeGreaterThan(0);
    expect(box.min.x + box.max.x).toBeCloseTo(0, 1); // symmetric about origin
  });

  it('left align starts at x≈0; unknown chars advance without throwing', () => {
    const left = buildTextGeometry('MARKET', { align: 'left' });
    const box = new Box3().setFromBufferAttribute(left.geometry.getAttribute('position') as never);
    expect(box.min.x).toBeGreaterThanOrEqual(-0.15); // only the stroke half-width spills left of x=0
    expect(() => buildTextGeometry('a~z#')).not.toThrow(); // lowercase maps to caps; ~,# advance
  });
});

describe('createSign', () => {
  it('is deterministic per seed', () => {
    expect(meshCount(createSign({ seed: 42 }).object)).toBe(meshCount(createSign({ seed: 42 }).object));
  });

  it.each(['post', 'hanging', 'fingerpost', 'milestone'] as const)(
    'builds a lettered %s with carved geometry and a footprint',
    (kind) => {
      const sign = createSign({ kind, seed: 5, text: 'HAVENBROOK' });
      expect(sign.object).toBeInstanceOf(Group);
      expect(sign.object.name).toBe('sign');
      expect(meshCount(sign.object)).toBeGreaterThan(1);
      // Lettering means lots of little relief triangles.
      expect(triCount(sign.object)).toBeGreaterThan(200);
      expect(sign.obstacleRadius).toBeGreaterThan(0);
    }
  );

  it('post sign letters on both faces (front +Z and back −Z)', () => {
    const sign = createSign({ kind: 'post', seed: 2, text: 'MILLFORD' });
    const zs: number[] = [];
    sign.object.traverse((o) => {
      if (o instanceof Mesh && o.geometry.getIndex() && o.geometry.getIndex()!.count > 300) {
        zs.push(o.position.z);
      }
    });
    expect(zs.some((z) => z > 0)).toBe(true);
    expect(zs.some((z) => z < 0)).toBe(true);
  });

  it('a wider name makes a wider board', () => {
    const bbox = (text: string) => {
      const b = new Box3().setFromObject(createSign({ kind: 'post', seed: 1, text }).object);
      return b.getSize(new Vector3()).x;
    };
    expect(bbox('WESTWATCH HARBOUR')).toBeGreaterThan(bbox('OX'));
  });

  it('fingerpost carries one arm per direction, and text sets the arm length', () => {
    const sign = createSign({
      kind: 'fingerpost',
      seed: 3,
      directions: [{ text: 'MARKET', angle: 0 }, { text: 'THE HARBOUR ROAD', angle: 1.5 }],
    });
    // Two named arms → two boards longer than the plain post.
    let longArms = 0;
    sign.object.traverse((o) => {
      if (o instanceof Mesh && o.geometry.getIndex() && o.geometry.getIndex()!.count > 300) longArms++;
    });
    expect(longArms).toBeGreaterThanOrEqual(2);
  });

  it('hanging sign self-animates: a mesh driver swings the named pivot', () => {
    const sign = createSign({ kind: 'hanging', seed: 8, text: 'THE FORGE' });
    const pivot = sign.object.getObjectByName('signPivot');
    expect(pivot).toBeDefined();
    // The driver rides a rendered mesh (not the Group pivot, which never gets
    // onBeforeRender), and swings the pivot above it.
    let driver: ((a: unknown, b: unknown, c: unknown) => void) | undefined;
    sign.object.traverse((o) => {
      const cb = (o as { onBeforeRender?: unknown }).onBeforeRender;
      if (o instanceof Mesh && typeof cb === 'function') driver = cb as never;
    });
    expect(driver).toBeDefined();
    driver!(null, null, null);
    expect(Number.isFinite(pivot!.rotation.z)).toBe(true);
  });
});
