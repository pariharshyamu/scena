import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { createEffects, createMarks, createTrail } from '../src';
import type { InstancedMesh, Mesh, MeshBasicMaterial, BufferGeometry } from 'three';

const decompose = (mesh: InstancedMesh, index: number) => {
  const m = new Matrix4();
  mesh.getMatrixAt(index, m);
  const pos = new Vector3();
  const quat = new Quaternion();
  const scale = new Vector3();
  m.decompose(pos, quat, scale);
  return { pos, quat, scale };
};

// Dead slots hide behind a zero-scale matrix. Do NOT detect them with
// decompose(): three r185 guards its division by zero by reporting a
// degenerate matrix's scale as (1,1,1) — the GPU still collapses the
// instance (it multiplies the raw matrix), but a test reading decompose
// would count every dead slot as a live particle standing at the origin.
const dead = (mesh: InstancedMesh, index: number): boolean =>
  mesh.instanceMatrix.array[index * 16] === 0 &&
  mesh.instanceMatrix.array[index * 16 + 5] === 0;

const instanced = (fx: { group: { children: unknown[] } }) =>
  fx.group.children.filter(
    (c): c is InstancedMesh => (c as InstancedMesh).isInstancedMesh === true
  );

describe('createEffects', () => {
  it('a burst spends particles; time gets them all back', () => {
    const fx = createEffects({ seed: 3 });
    expect(fx.alive).toBe(0);
    fx.burst('dust', new Vector3(0, 1, 0));
    expect(fx.alive).toBe(10); // the dust voice's default count
    // Dust lives at most 0.9 s; run well past it.
    for (let i = 0; i < 40; i++) fx.update(1 / 30);
    expect(fx.alive).toBe(0);
    // And every slot in both pools is collapsed to nothing.
    for (const mesh of instanced(fx)) {
      for (let i = 0; i < mesh.count; i++) {
        expect(dead(mesh, i)).toBe(true);
      }
    }
  });

  it('a full pool recycles its oldest — alive never exceeds capacity', () => {
    const fx = createEffects({ capacity: 16, seed: 1 });
    for (let k = 0; k < 5; k++) fx.burst('dust', new Vector3());
    expect(fx.alive).toBe(16);
  });

  it('NOTHING SINKS THROUGH THE FLOOR — bouncers bounce, dust settles', () => {
    const fx = createEffects({ seed: 5, floor: 0 });
    fx.burst('debris', new Vector3(0, 0.3, 0));
    fx.burst('dust', new Vector3(0, 0.3, 0));
    for (let i = 0; i < 30; i++) {
      fx.update(1 / 60);
      for (const mesh of instanced(fx)) {
        for (let j = 0; j < mesh.count; j++) {
          if (dead(mesh, j)) continue;
          const { pos } = decompose(mesh, j);
          expect(pos.y).toBeGreaterThanOrEqual(-1e-6);
          expect(Number.isFinite(pos.x + pos.y + pos.z)).toBe(true);
        }
      }
    }
  });

  it('the direction bias sends debris the way the impact says', () => {
    const fx = createEffects({ seed: 9 });
    fx.burst('debris', new Vector3(0, 2, 0), { direction: new Vector3(1, 0, 0), spread: 0.2 });
    fx.update(0.1);
    let meanX = 0;
    let n = 0;
    for (const mesh of instanced(fx)) {
      for (let i = 0; i < mesh.count; i++) {
        if (dead(mesh, i)) continue;
        meanX += decompose(mesh, i).pos.x;
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
    expect(meanX / n).toBeGreaterThan(0.05);
  });

  it('same seed, same calls, same debris — to the matrix', () => {
    const run = () => {
      const fx = createEffects({ seed: 11 });
      fx.burst('sparks', new Vector3(1, 1, 1));
      fx.burst('confetti', new Vector3(0, 3, 0));
      for (let i = 0; i < 10; i++) fx.update(1 / 60);
      return instanced(fx).map((m) => [...m.instanceMatrix.array]);
    };
    expect(run()).toEqual(run());
  });

  it('confetti refuses a single colour', () => {
    const fx = createEffects({ seed: 2 });
    fx.burst('confetti', new Vector3());
    const [matte] = instanced(fx);
    const seen = new Set<string>();
    const colors = matte.instanceColor!;
    for (let i = 0; i < 24; i++) {
      seen.add(
        [colors.getX(i), colors.getY(i), colors.getZ(i)].map((v) => v.toFixed(2)).join(',')
      );
    }
    expect(seen.size).toBeGreaterThan(4);
  });

  it('a wild frame is clamped — a lag spike must not teleport debris', () => {
    const fx = createEffects({ seed: 4 });
    fx.burst('sparks', new Vector3(0, 5, 0));
    fx.update(10); // one absurd dt
    for (const mesh of instanced(fx)) {
      for (let i = 0; i < mesh.count; i++) {
        if (dead(mesh, i)) continue;
        const { pos } = decompose(mesh, i);
        expect(Math.abs(pos.x)).toBeLessThan(50);
        expect(Number.isFinite(pos.y)).toBe(true);
      }
    }
  });

  it('a ring grows, fades, and goes home to the pool', () => {
    const fx = createEffects();
    fx.ring(new Vector3(2, 0, 2), { radius: 2, life: 0.5 });
    const ringMesh = fx.group.children.find((c) => !(c as InstancedMesh).isInstancedMesh) as Mesh;
    expect(ringMesh.visible).toBe(true);
    fx.update(0.2);
    const early = ringMesh.scale.x;
    const earlyOpacity = (ringMesh.material as MeshBasicMaterial).opacity;
    fx.update(0.2);
    expect(ringMesh.scale.x).toBeGreaterThan(early);
    expect((ringMesh.material as MeshBasicMaterial).opacity).toBeLessThan(earlyOpacity);
    fx.update(0.2);
    expect(ringMesh.visible).toBe(false);
  });
});

describe('createTrail', () => {
  const geo = (trail: { mesh: Mesh }) => trail.mesh.geometry as BufferGeometry;

  it('draws once it has two points, tapers, and fades at the tail', () => {
    const trail = createTrail({ width: 0.4, life: 5 });
    trail.push(new Vector3(0, 0, 0));
    trail.push(new Vector3(1, 0, 0));
    trail.push(new Vector3(2, 0, 0));
    trail.update(0.016);
    expect(trail.count).toBe(3);
    expect(geo(trail).drawRange.count).toBe(12); // (3 - 1) segments × 6 indices
    const positions = geo(trail).attributes.position;
    // Head pair (newest point, index 0) sits wider than the tail pair.
    const headSpan = new Vector3(
      positions.getX(0) - positions.getX(1),
      positions.getY(0) - positions.getY(1),
      positions.getZ(0) - positions.getZ(1)
    ).length();
    const tailSpan = new Vector3(
      positions.getX(4) - positions.getX(5),
      positions.getY(4) - positions.getY(5),
      positions.getZ(4) - positions.getZ(5)
    ).length();
    expect(headSpan).toBeGreaterThan(tailSpan);
    const colors = geo(trail).attributes.color;
    expect(colors.itemSize).toBe(4); // RGBA — the fade is real vertex alpha
  });

  it('standing still adds nothing, and a stall never NaNs the ribbon', () => {
    const trail = createTrail({ minDistance: 0.1 });
    const spot = new Vector3(3, 0, 3);
    for (let i = 0; i < 10; i++) trail.push(spot);
    expect(trail.count).toBe(1);
    trail.push(new Vector3(3.5, 0, 3));
    trail.push(new Vector3(4, 0, 3));
    trail.update(0.016);
    const positions = geo(trail).attributes.position;
    for (let i = 0; i < trail.count * 6; i++) {
      expect(Number.isFinite(positions.array[i] as number)).toBe(true);
    }
  });

  it('old points age out; clear() forgets everything at once', () => {
    const trail = createTrail({ life: 0.3 });
    trail.push(new Vector3(0, 0, 0));
    trail.push(new Vector3(1, 0, 0));
    trail.update(0.4);
    expect(trail.count).toBe(0);
    expect(geo(trail).drawRange.count).toBe(0);

    trail.push(new Vector3(0, 0, 0));
    trail.push(new Vector3(1, 0, 0));
    trail.clear();
    expect(trail.count).toBe(0);
  });

  it('the ribbon never holds more than its length', () => {
    const trail = createTrail({ length: 8, life: 100 });
    for (let i = 0; i < 30; i++) trail.push(new Vector3(i, 0, 0));
    expect(trail.count).toBe(8);
  });
});

describe('createMarks', () => {
  it('a stamp appears at strength and fades to nothing over `fade`', () => {
    const marks = createMarks({ fade: 2 });
    marks.stamp('skid', new Vector3(1, 0, 1), new Vector3(1, 0, 0), { strength: 0.8 });
    expect(marks.count).toBe(1);
    const alpha = marks.mesh.geometry.getAttribute('aAlpha');
    expect(alpha.getX(0)).toBeCloseTo(0.8);
    marks.update(1);
    expect(alpha.getX(0)).toBeCloseTo(0.3, 1);
    marks.update(1.1);
    expect(marks.count).toBe(0);
    expect(alpha.getX(0)).toBe(0);
  });

  it('a skid points where the wheels were going', () => {
    const marks = createMarks();
    marks.stamp('skid', new Vector3(), new Vector3(0, 0, -1));
    const { quat } = decompose(marks.mesh, 0);
    const expected = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    expect(Math.abs(quat.dot(expected))).toBeGreaterThan(0.999);
  });

  it('every shape writes its own selector', () => {
    const marks = createMarks();
    marks.stamp('skid', new Vector3());
    marks.stamp('footprint', new Vector3(1, 0, 0));
    marks.stamp('scorch', new Vector3(2, 0, 0));
    const shape = marks.mesh.geometry.getAttribute('aShape');
    expect([shape.getX(0), shape.getX(1), shape.getX(2)]).toEqual([0, 1, 2]);
  });

  it('a full ground recycles its OLDEST mark, and count says so', () => {
    const marks = createMarks({ capacity: 8, fade: 1000 });
    for (let i = 0; i < 13; i++) {
      marks.stamp('footprint', new Vector3(i, 0, 0), new Vector3(1, 0, 0));
    }
    expect(marks.count).toBe(8);
    // The mark at x=5 (6th stamp) survived; x=4 (5th) was the last evicted.
    const positions = Array.from({ length: 8 }, (_, i) => decompose(marks.mesh, i).pos.x).sort(
      (a, b) => a - b
    );
    expect(positions[0]).toBe(5);
  });

  it('same seed, same scorch rotations; clear() wipes the ground', () => {
    const spin = () => {
      const marks = createMarks({ seed: 6 });
      marks.stamp('scorch', new Vector3());
      return decompose(marks.mesh, 0).quat.toArray();
    };
    expect(spin()).toEqual(spin());

    const marks = createMarks();
    marks.stamp('scorch', new Vector3());
    marks.clear();
    expect(marks.count).toBe(0);
    expect(dead(marks.mesh, 0)).toBe(true);
  });
});
