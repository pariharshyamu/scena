import { describe, expect, it } from 'vitest';
import { AdditiveBlending, Box3, Mesh, PointLight, Points, ShaderMaterial } from 'three';
import { createBrazier, createCampfire } from '../src/props/fire';

type Obj = { traverse(cb: (o: unknown) => void): void };

function meshCount(object: Obj): number {
  let n = 0;
  object.traverse((o) => {
    if (o instanceof Mesh) n++;
  });
  return n;
}

function pointLights(object: Obj): PointLight[] {
  const out: PointLight[] = [];
  object.traverse((o) => {
    if (o instanceof PointLight) out.push(o);
  });
  return out;
}

/** The flame Mesh — a ShaderMaterial with the uHot uniform — carries the driver. */
function flameMesh(object: Obj): Mesh {
  let found: Mesh | undefined;
  object.traverse((o) => {
    const m = (o as Mesh).material as ShaderMaterial | undefined;
    if (o instanceof Mesh && (m as ShaderMaterial)?.uniforms?.uHot) found = o as Mesh;
  });
  if (!found) throw new Error('no flame mesh');
  return found;
}

function emberPoints(object: Obj): Points | undefined {
  let found: Points | undefined;
  object.traverse((o) => {
    if (o instanceof Points) found = o as Points;
  });
  return found;
}

describe.each([
  ['brazier', createBrazier],
  ['campfire', createCampfire],
] as const)('createFire: %s', (name, make) => {
  it('is deterministic per seed', () => {
    expect(meshCount(make({ seed: 42 }).object)).toBe(meshCount(make({ seed: 42 }).object));
  });

  it('builds a flame (additive, unlit), embers and glowing coals', () => {
    const fire = make({ seed: 7 });
    expect(fire.object.name).toBe(name);
    const flame = flameMesh(fire.object);
    const mat = flame.material as ShaderMaterial;
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(emberPoints(fire.object)).toBeDefined();
    // A glowing coal: emissive, non-black, bright.
    let coal = false;
    fire.object.traverse((o) => {
      const m = (o as Mesh).material as { emissive?: { getHex(): number }; emissiveIntensity?: number } | undefined;
      if (m?.emissive && m.emissive.getHex() !== 0 && (m.emissiveIntensity ?? 0) > 0.5) coal = true;
    });
    expect(coal).toBe(true);
    expect(fire.obstacleRadius).toBeGreaterThan(0);
  });

  it('adds a flickering PointLight by default; light:false omits it', () => {
    expect(pointLights(make({ seed: 3 }).object).length).toBe(1);
    expect(pointLights(make({ seed: 3, light: false }).object).length).toBe(0);
  });

  it('self-animates: onBeforeRender advances the flame clock, flickers light & coals', () => {
    const fire = make({ seed: 9 });
    const flame = flameMesh(fire.object);
    const mat = flame.material as ShaderMaterial;
    const light = pointLights(fire.object)[0];
    const baseIntensity = light.intensity;

    // Capture a coal's emissive intensity.
    let coalMat: { emissiveIntensity: number } | undefined;
    fire.object.traverse((o) => {
      const m = (o as Mesh).material as { emissive?: { getHex(): number }; emissiveIntensity?: number } | undefined;
      if (!coalMat && m?.emissive && m.emissive.getHex() !== 0) coalMat = m as { emissiveIntensity: number };
    });
    const baseCoal = coalMat!.emissiveIntensity;

    expect(mat.uniforms.uTime.value).toBe(0);
    (flame.onBeforeRender as () => void)();

    expect(mat.uniforms.uTime.value).toBeGreaterThan(0);
    // The light and coals now sit at a flickered level, not their base.
    expect(light.intensity).not.toBe(baseIntensity);
    expect(coalMat!.emissiveIntensity).not.toBe(baseCoal);
    // Flicker stays in a sane positive band.
    expect(light.intensity).toBeGreaterThan(0);
    expect(light.intensity).toBeLessThan(baseIntensity * 1.2);
  });

  it('rests on the ground', () => {
    const box = new Box3().setFromObject(make({ seed: 5 }).object);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.2); // logs may rest in a shallow pit
  });
});

describe('fire variety', () => {
  it('a brazier stands taller than a campfire is wide-set (distinct silhouettes)', () => {
    const brazier = new Box3().setFromObject(createBrazier({ seed: 2 }).object);
    const campfire = new Box3().setFromObject(createCampfire({ seed: 2 }).object);
    // Brazier lifts its bowl off the ground; campfire spreads a stone ring.
    expect(brazier.max.y).toBeGreaterThan(1.2);
    expect(campfire.max.x - campfire.min.x).toBeGreaterThan(1.2);
  });
});
