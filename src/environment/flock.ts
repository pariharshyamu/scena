import {
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/random';

export type FlockType = 'birds' | 'fish';

export interface FlockOptions {
  /** birds (fly, wings flap) or fish (swim, tail sways). Default 'birds'. */
  type?: FlockType;
  /** How many. Default 60 (birds) / 80 (fish). */
  count?: number;
  /** Centre of the volume the flock roams, world space. Default [0, 12, 0] birds / [0, 2, 0] fish. */
  center?: [number, number, number];
  /** Half-extents of that volume (a box), or one number for a cube. Default [26, 6, 26]. */
  bounds?: [number, number, number] | number;
  /** Cruise speed, m/s. Default 7 (birds) / 3 (fish). */
  speed?: number;
  /** Creature length, metres. Default 0.5 (birds) / 0.4 (fish). */
  size?: number;
  /** Body colour. Default 0x2b2b30 birds / 0x6a86a0 fish. */
  color?: number;
  /** Wing-beat / tail-beat rate. Default 9 (birds) / 5 (fish). */
  beat?: number;
  /** Steering weights. */
  separation?: number;
  alignment?: number;
  cohesion?: number;
  /** Wheel around the centre at this radius (birds circling a tower). Off by default. */
  circle?: number;
  seed?: number;
}

export interface Flock {
  /** The instanced flock — add it to the scene. Self-animates. */
  object: InstancedMesh;
  count: number;
  /** Live boid positions (world space) — for gameplay: scare them, follow one, etc. */
  positions: readonly Vector3[];
  /** Move the roaming volume's centre (the flock drifts to follow). */
  setCenter(x: number, y: number, z: number): void;
  /** Advance manually instead of self-driving (for deterministic loops). */
  update(dt: number): void;
}

// --- creature geometry ---------------------------------------------------

/** A low-poly bird: a dart body and two triangular wings. `aFlap` is signed by
 *  side and grows to the tips, so the shader beats the wings up together. */
function birdGeometry(size: number): BufferGeometry {
  const s = size;
  // prettier-ignore
  const tris: Array<[number, number, number, number]> = [
    // body (aFlap 0): thin diamond along +Z
    [0, 0, 0.55 * s, 0], [0, 0.09 * s, -0.2 * s, 0], [0.05 * s, 0, -0.15 * s, 0],
    [0, 0, 0.55 * s, 0], [-0.05 * s, 0, -0.15 * s, 0], [0, 0.09 * s, -0.2 * s, 0],
    [0, 0, 0.55 * s, 0], [0.05 * s, 0, -0.15 * s, 0], [0, -0.05 * s, -0.18 * s, 0],
    [0, 0, 0.55 * s, 0], [0, -0.05 * s, -0.18 * s, 0], [-0.05 * s, 0, -0.15 * s, 0],
    [0, 0, -0.5 * s, 0], [0, 0.09 * s, -0.2 * s, 0], [0, -0.05 * s, -0.18 * s, 0],
    // right wing (aFlap +): root → tip → back
    [0.04 * s, 0, 0.08 * s, 0.3], [0.95 * s, 0.02 * s, -0.1 * s, 1.0], [0.04 * s, 0, -0.28 * s, 0.3],
    // left wing (aFlap −)
    [-0.04 * s, 0, 0.08 * s, -0.3], [-0.04 * s, 0, -0.28 * s, -0.3], [-0.95 * s, 0.02 * s, -0.1 * s, -1.0],
  ];
  return meshFromTris(tris);
}

/** A low-poly fish: an elongated body and a tail fin. `aFlap` grows toward the
 *  tail, so the shader sways it side to side like a swimming wave. */
function fishGeometry(size: number): BufferGeometry {
  const s = size;
  // prettier-ignore
  const tris: Array<[number, number, number, number]> = [
    // body octahedron-ish along Z (head +Z)
    [0, 0, 0.7 * s, 0], [0.13 * s, 0, 0, 0], [0, 0.16 * s, 0, 0],
    [0, 0, 0.7 * s, 0], [0, 0.16 * s, 0, 0], [-0.13 * s, 0, 0, 0],
    [0, 0, 0.7 * s, 0], [0, -0.14 * s, 0, 0], [0.13 * s, 0, 0, 0],
    [0, 0, 0.7 * s, 0], [-0.13 * s, 0, 0, 0], [0, -0.14 * s, 0, 0],
    [0, 0, -0.5 * s, 0.55], [0, 0.16 * s, 0, 0], [0.13 * s, 0, 0, 0],
    [0, 0, -0.5 * s, 0.55], [-0.13 * s, 0, 0, 0], [0, 0.16 * s, 0, 0],
    [0, 0, -0.5 * s, 0.55], [0.13 * s, 0, 0, 0], [0, -0.14 * s, 0, 0],
    [0, 0, -0.5 * s, 0.55], [0, -0.14 * s, 0, 0], [-0.13 * s, 0, 0, 0],
    // tail fin (aFlap 1): sways most
    [0, 0, -0.5 * s, 0.7], [0, 0.24 * s, -0.85 * s, 1.0], [0, -0.22 * s, -0.85 * s, 1.0],
  ];
  return meshFromTris(tris);
}

function meshFromTris(tris: Array<[number, number, number, number]>): BufferGeometry {
  const n = tris.length;
  const pos = new Float32Array(n * 3);
  const flap = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = tris[i][0];
    pos[i * 3 + 1] = tris[i][1];
    pos[i * 3 + 2] = tris[i][2];
    flap[i] = tris[i][3];
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aFlap', new BufferAttribute(flap, 1));
  geo.computeVertexNormals();
  return geo;
}

// --- material: vertex flap + per-instance phase --------------------------

function flockMaterial(color: number, beat: number, fish: boolean): {
  material: MeshStandardMaterial;
  uniforms: { uTime: { value: number } };
} {
  const uniforms = {
    uTime: { value: 0 },
    uFlapSpeed: { value: beat },
    uFlapAmp: { value: fish ? 0.6 : 0.9 },
    uFishMode: { value: fish ? 1 : 0 },
  };
  const material = new MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, flatShading: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aFlap;
         attribute float aPhase;
         uniform float uTime, uFlapSpeed, uFlapAmp, uFishMode;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           float wave = sin(uTime * uFlapSpeed + aPhase) * uFlapAmp;
           float ang = wave * aFlap;
           float c = cos(ang), s = sin(ang);
           if (uFishMode > 0.5) transformed.xz = mat2(c, -s, s, c) * transformed.xz;
           else                 transformed.xy = mat2(c, -s, s, c) * transformed.xy;
         }`
      );
  };
  material.customProgramCacheKey = () => 'scena-flock-v1';
  return { material, uniforms };
}

function nowSeconds(): number {
  return typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
}

/**
 * A flock of birds or a school of fish — the thing that makes a sky or a sea
 * feel *alive*. A lightweight boid simulation (separation, alignment, cohesion,
 * plus soft bounds and a little wander) steers every creature on the CPU, and
 * the whole flock draws as **one InstancedMesh** whose wings beat (or tail
 * sways) in the vertex shader from a per-instance phase — so no two flap in
 * lockstep. It self-animates from the render loop; pass `circle` and the birds
 * wheel around the centre like crows over a tower.
 *
 * `positions` exposes the live boids, so gameplay can read them — scatter the
 * flock when an NPC gets close, or have a cat watch one fish.
 *
 * ```ts
 * const crows = createFlock({ type: 'birds', center: [0, 16, 0], circle: 14 });
 * scene.add(crows.object);
 * ```
 */
export function createFlock(options: FlockOptions = {}): Flock {
  const type = options.type ?? 'birds';
  const fish = type === 'fish';
  const count = options.count ?? (fish ? 80 : 60);
  const center = new Vector3(...(options.center ?? (fish ? [0, 2, 0] : [0, 12, 0])));
  const b = options.bounds ?? [26, 6, 26];
  const bounds = new Vector3(...(typeof b === 'number' ? [b, b, b] : b));
  const speed = options.speed ?? (fish ? 3 : 7);
  const size = options.size ?? (fish ? 0.4 : 0.5);
  const beat = options.beat ?? (fish ? 5 : 9);
  const wSep = options.separation ?? 1.5;
  const wAli = options.alignment ?? 1;
  const wCoh = options.cohesion ?? 0.9;
  const circle = options.circle ?? 0;
  const rng = new Rng(options.seed ?? 1);

  const geometry = fish ? fishGeometry(size) : birdGeometry(size);
  const { material, uniforms } = flockMaterial(options.color ?? (fish ? 0x6a86a0 : 0x2b2b30), beat, fish);

  // Per-instance flap phase so the beat is desynchronised.
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) phases[i] = rng.range(0, Math.PI * 2);
  geometry.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1));

  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = `flock-${type}`;
  mesh.frustumCulled = false;

  // Boid state.
  const pos: Vector3[] = [];
  const vel: Vector3[] = [];
  for (let i = 0; i < count; i++) {
    pos.push(
      new Vector3(
        center.x + rng.range(-bounds.x, bounds.x),
        center.y + rng.range(-bounds.y, bounds.y),
        center.z + rng.range(-bounds.z, bounds.z)
      )
    );
    const v = new Vector3(rng.range(-1, 1), rng.range(-0.3, 0.3), rng.range(-1, 1));
    if (v.lengthSq() < 1e-4) v.set(1, 0, 0);
    vel.push(v.setLength(speed));
  }

  const m = new Matrix4();
  const sep = new Vector3();
  const ali = new Vector3();
  const coh = new Vector3();
  const acc = new Vector3();
  const tmp = new Vector3();
  const xAxis = new Vector3();
  const yAxis = new Vector3();
  const UP = new Vector3(0, 1, 0);
  const neighbor = 4.5;
  const sepDist = fish ? 1.2 : 2.0;

  const writeMatrices = (): void => {
    for (let i = 0; i < count; i++) {
      const p = pos[i];
      const v = vel[i];
      // Orient +Z along velocity; build an orthonormal basis.
      const z = tmp.copy(v).normalize();
      xAxis.copy(UP).cross(z);
      if (xAxis.lengthSq() < 1e-5) xAxis.set(1, 0, 0);
      xAxis.normalize();
      yAxis.copy(z).cross(xAxis).normalize();
      m.makeBasis(xAxis, yAxis, z);
      m.setPosition(p.x, p.y, p.z);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  writeMatrices();

  let manual = false;
  let last = nowSeconds();

  const step = (dt: number): void => {
    dt = Math.min(0.05, Math.max(0, dt));
    for (let i = 0; i < count; i++) {
      const p = pos[i];
      const v = vel[i];
      sep.set(0, 0, 0);
      ali.set(0, 0, 0);
      coh.set(0, 0, 0);
      let near = 0;
      for (let j = 0; j < count; j++) {
        if (j === i) continue;
        const q = pos[j];
        const d = p.distanceTo(q);
        if (d < neighbor) {
          ali.add(vel[j]);
          coh.add(q);
          near++;
          if (d < sepDist && d > 1e-4) {
            tmp.copy(p).sub(q).multiplyScalar(1 / (d * d));
            sep.add(tmp);
          }
        }
      }
      acc.set(0, 0, 0);
      if (near > 0) {
        ali.multiplyScalar(1 / near).setLength(speed).sub(v).multiplyScalar(wAli);
        coh.multiplyScalar(1 / near).sub(p).multiplyScalar(wCoh * 0.5);
        acc.add(ali).add(coh);
      }
      if (sep.lengthSq() > 0) acc.add(sep.setLength(speed).multiplyScalar(wSep));

      // Soft bounds: steer back toward the centre near the walls.
      tmp.copy(center).sub(p);
      tmp.x = Math.abs(p.x - center.x) > bounds.x * 0.85 ? tmp.x : 0;
      tmp.y = Math.abs(p.y - center.y) > bounds.y * 0.85 ? tmp.y : 0;
      tmp.z = Math.abs(p.z - center.z) > bounds.z * 0.85 ? tmp.z : 0;
      acc.add(tmp.multiplyScalar(2.2));

      // Wheel around the centre (birds circling a tower).
      if (circle > 0) {
        const rx = p.x - center.x;
        const rz = p.z - center.z;
        const r = Math.hypot(rx, rz) || 1e-3;
        acc.x += (-rz / r) * speed * 1.2 + (rx / r) * (circle - r) * 0.4; // tangent + radius hold
        acc.z += (rx / r) * speed * 1.2 + (rz / r) * (circle - r) * 0.4;
        acc.y += (center.y - p.y) * 0.6; // hold height
      }

      // Wander.
      acc.x += rng.range(-1, 1) * speed * 0.4;
      acc.y += rng.range(-1, 1) * speed * (fish ? 0.15 : 0.2);
      acc.z += rng.range(-1, 1) * speed * 0.4;

      v.addScaledVector(acc, dt);
      // Keep birds moving; clamp to a speed band.
      const sp = v.length();
      if (sp > speed * 1.5) v.setLength(speed * 1.5);
      else if (sp < speed * 0.6) v.setLength(speed * 0.6);
      p.addScaledVector(v, dt);
    }
    writeMatrices();
  };

  mesh.onBeforeRender = () => {
    if (!manual) {
      const t = nowSeconds();
      uniforms.uTime.value = t % 1000;
      step(t - last);
      last = t;
    }
  };

  return {
    object: mesh,
    count,
    positions: pos,
    setCenter(x, y, z) {
      center.set(x, y, z);
    },
    update(dt) {
      manual = true;
      uniforms.uTime.value += dt;
      step(dt);
    },
  };
}
