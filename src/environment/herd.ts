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

export type HerdType = 'deer' | 'sheep';

export interface HerdOptions {
  /** deer (tall, slender, antlered) or sheep (short, woolly, tight flock). Default 'deer'. */
  type?: HerdType;
  /** How many. Default 12 (deer) / 16 (sheep). */
  count?: number;
  /** Where the herd grazes, world XZ (y is taken from the ground). Default [0, 0]. */
  center?: [number, number];
  /** Half-extents of the roaming area in XZ, or one number for a square. Default 18. */
  radius?: [number, number] | number;
  /** Ground-height handshake — `terrain.heightAt`. Feet clamp to it every frame. Default flat 0. */
  ground?: (x: number, z: number) => number;
  /** Cruise speed while walking, m/s. Default 2.2 (deer) / 1.4 (sheep). */
  speed?: number;
  /** Body length, metres. Default 1 (deer) / 0.85 (sheep). */
  size?: number;
  /** Body colour. Default 0xa9855a deer / 0xe7e2d6 sheep. */
  color?: number;
  /** Fraction of time spent grazing (head down, still), 0–1. Default 0.6 (deer) / 0.75 (sheep). */
  grazing?: number;
  /** How strongly the body tips to follow the slope, 0–1. Default 0.6. */
  slopeAlign?: number;
  /** Steering weights. */
  separation?: number;
  alignment?: number;
  cohesion?: number;
  seed?: number;
}

export interface Herd {
  /** The instanced herd — add it to the scene. Self-animates. */
  object: InstancedMesh;
  count: number;
  /** Live animal positions (world space) — for gameplay: spook them, count them, herd them. */
  positions: readonly Vector3[];
  /** Move the roaming area's centre in XZ (the herd drifts to follow). */
  setCenter(x: number, z: number): void;
  /** Advance manually instead of self-driving (for deterministic loops). */
  update(dt: number): void;
}

// --- creature geometry ---------------------------------------------------
//
// A quadruped built from boxes. Every vertex carries a small gait rig:
//   aHipY/aHipZ  — the pivot a leg swings about (for a body vertex this is the
//                  vertex's own y/z, so the swing rotation is a no-op),
//   aLegPhase    — 0 or π, the two diagonal trot pairs,
//   aHead        — head/antler weight, for the grazing head-dip.
// Legs swing about the hip in the vertex shader; the body bobs; the head dips
// when the animal is grazing. No skeleton, no clips — it's all one attribute set.

interface Build {
  pos: number[];
  hipY: number[];
  hipZ: number[];
  legPhase: number[];
  head: number[];
  col: number[];
}

function newBuild(): Build {
  return { pos: [], hipY: [], hipZ: [], legPhase: [], head: [], col: [] };
}

interface BoxOpts {
  /** If set, the box is a swinging leg pivoting about this (y, z). */
  hip?: [number, number];
  legPhase?: number;
  head?: number;
  color: [number, number, number];
}

/** Emit a box (min→max corners) as 12 flat-shaded triangles with the gait rig. */
function box(
  b: Build,
  min: [number, number, number],
  max: [number, number, number],
  o: BoxOpts
): void {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  // 8 corners
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], // back (-z)
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], // front (+z)
  ];
  // prettier-ignore
  const faces = [
    [0, 1, 2], [0, 2, 3], // -z
    [5, 4, 7], [5, 7, 6], // +z
    [4, 0, 3], [4, 3, 7], // -x
    [1, 5, 6], [1, 6, 2], // +x
    [3, 2, 6], [3, 6, 7], // +y
    [4, 5, 1], [4, 1, 0], // -y
  ];
  for (const f of faces) {
    for (const idx of f) {
      const p = v[idx];
      b.pos.push(p[0], p[1], p[2]);
      if (o.hip) {
        b.hipY.push(o.hip[0]);
        b.hipZ.push(o.hip[1]);
      } else {
        b.hipY.push(p[1]); // rigid: pivot = self → no swing
        b.hipZ.push(p[2]);
      }
      b.legPhase.push(o.legPhase ?? 0);
      b.head.push(o.head ?? 0);
      b.col.push(o.color[0], o.color[1], o.color[2]);
    }
  }
}

/**
 * A quadruped facing +Z, standing on y = 0 (feet at the origin plane). `size`
 * scales the whole body; deer are lankier and antlered, sheep are stout and
 * woolly.
 */
function quadrupedGeometry(type: HerdType, size: number): { geo: BufferGeometry; stand: number } {
  const s = size;
  const b = newBuild();
  const deer = type === 'deer';

  // Two-tone: a darker face/legs against the body colour (baked as a vertex-
  // colour multiplier; the material carries the actual body hue).
  const BODY: [number, number, number] = [1, 1, 1];
  const DARK: [number, number, number] = deer ? [0.55, 0.5, 0.45] : [0.32, 0.3, 0.32];

  const legLen = (deer ? 0.62 : 0.42) * s;
  const legR = (deer ? 0.05 : 0.06) * s;
  const bodyY = legLen; // torso underside
  const bodyH = (deer ? 0.34 : 0.42) * s;
  const bodyHalfX = (deer ? 0.16 : 0.2) * s;
  const bodyHalfZ = (deer ? 0.5 : 0.42) * s;
  const stand = legLen; // origin sits legLen above the ground plane

  // Torso.
  box(b, [-bodyHalfX, bodyY, -bodyHalfZ], [bodyHalfX, bodyY + bodyH, bodyHalfZ], { color: BODY });

  // Legs — four thin boxes, diagonal trot pairs (FL+BR phase 0, FR+BL phase π).
  const lx = bodyHalfX - legR;
  const lz = bodyHalfZ - legR * 1.4;
  const legs: Array<[number, number, number]> = [
    [-lx, lz, 0], // FL  (front-left,  +z)
    [lx, lz, Math.PI], // FR
    [-lx, -lz, Math.PI], // BL
    [lx, -lz, 0], // BR  (back-right)
  ];
  for (const [x, z, phase] of legs) {
    box(b, [x - legR, 0, z - legR], [x + legR, bodyY + 0.02 * s, z + legR], {
      hip: [bodyY, z],
      legPhase: phase,
      color: DARK,
    });
  }

  // Neck + head at the front (+z), lifted; carries aHead for the graze-dip.
  const neckZ = bodyHalfZ;
  const neckTop = bodyY + bodyH + (deer ? 0.32 : 0.14) * s;
  box(
    b,
    [-bodyHalfX * 0.6, bodyY + bodyH * 0.4, neckZ - 0.02 * s],
    [bodyHalfX * 0.6, neckTop, neckZ + (deer ? 0.12 : 0.16) * s],
    { head: 0.6, color: BODY }
  );
  // Head.
  const hz0 = neckZ + (deer ? 0.06 : 0.1) * s;
  const hz1 = hz0 + (deer ? 0.26 : 0.24) * s;
  const hy0 = neckTop - (deer ? 0.16 : 0.16) * s;
  const hy1 = neckTop + (deer ? 0.1 : 0.06) * s;
  box(b, [-bodyHalfX * 0.55, hy0, hz0], [bodyHalfX * 0.55, hy1, hz1], { head: 1, color: DARK });

  if (deer) {
    // A pair of simple antlers — thin angled boxes off the head, head-weighted.
    const ax = bodyHalfX * 0.4;
    const ay = hy1;
    const az = hz1 - 0.06 * s;
    for (const sgn of [-1, 1]) {
      box(
        b,
        [sgn * ax - 0.02 * s, ay, az - 0.02 * s],
        [sgn * ax + 0.02 * s, ay + 0.3 * s, az + 0.02 * s],
        { head: 1, color: DARK }
      );
      box(
        b,
        [sgn * ax - 0.02 * s, ay + 0.24 * s, az - 0.18 * s],
        [sgn * ax + 0.02 * s, ay + 0.28 * s, az + 0.02 * s],
        { head: 1, color: DARK }
      );
    }
  } else {
    // Sheep: a woolly crown lump on top of the torso for a rounder profile.
    box(
      b,
      [-bodyHalfX * 1.05, bodyY + bodyH * 0.7, -bodyHalfZ * 0.7],
      [bodyHalfX * 1.05, bodyY + bodyH + 0.12 * s, bodyHalfZ * 0.55],
      { color: BODY }
    );
  }

  // Tail (-z).
  box(
    b,
    [-0.04 * s, bodyY + bodyH * 0.5, -bodyHalfZ - (deer ? 0.12 : 0.08) * s],
    [0.04 * s, bodyY + bodyH * 0.85, -bodyHalfZ],
    { color: deer ? BODY : DARK }
  );

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3));
  geo.setAttribute('aHipY', new BufferAttribute(new Float32Array(b.hipY), 1));
  geo.setAttribute('aHipZ', new BufferAttribute(new Float32Array(b.hipZ), 1));
  geo.setAttribute('aLegPhase', new BufferAttribute(new Float32Array(b.legPhase), 1));
  geo.setAttribute('aHead', new BufferAttribute(new Float32Array(b.head), 1));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(b.col), 3));
  geo.computeVertexNormals();
  return { geo, stand };
}

// --- material: leg gait + head dip in the vertex shader ------------------

function herdMaterial(color: number, gaitSpeed: number): {
  material: MeshStandardMaterial;
  uniforms: { uTime: { value: number } };
} {
  const uniforms = {
    uTime: { value: 0 },
    uGaitSpeed: { value: gaitSpeed },
    uSwingAmp: { value: 0.7 },
    uBobAmp: { value: 0.03 },
    uGrazeDip: { value: 0.28 },
  };
  const material = new MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aHipY;
         attribute float aHipZ;
         attribute float aLegPhase;
         attribute float aHead;
         attribute float aPhase;
         attribute float aMove;
         uniform float uTime, uGaitSpeed, uSwingAmp, uBobAmp, uGrazeDip;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           float t = uTime * uGaitSpeed + aPhase;
           // Legs swing about the hip (rotate y/z about the pivot), scaled by
           // how fast the animal is actually moving.
           float swing = sin(t + aLegPhase) * uSwingAmp * aMove;
           float ly = transformed.y - aHipY;
           float lz = transformed.z - aHipZ;
           float c = cos(swing), sn = sin(swing);
           transformed.y = aHipY + (c * ly - sn * lz);
           transformed.z = aHipZ + (sn * ly + c * lz);
           // Body bob at twice stride, only while walking.
           transformed.y += sin(t * 2.0) * uBobAmp * aMove;
           // Head dips to graze when standing still.
           float graze = (1.0 - aMove) * (0.5 + 0.5 * sin(uTime * 1.3 + aPhase));
           transformed.y -= aHead * graze * uGrazeDip;
           transformed.z += aHead * graze * uGrazeDip * 0.6;
         }`
      );
  };
  material.customProgramCacheKey = () => 'scena-herd-v1';
  return { material, uniforms };
}

function nowSeconds(): number {
  return typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
}

/**
 * A herd of deer or a flock of sheep — ground-dwelling ambient life. A boid
 * simulation steers every animal across the XZ plane (herds clump, so cohesion
 * runs high), while their feet clamp to the terrain every frame through the
 * `ground` handshake (`terrain.heightAt`). Animals graze in place — head down,
 * legs still — then walk a few steps and graze again. The whole herd draws as
 * **one InstancedMesh** whose legs stride and head dips in the vertex shader,
 * scaled by each animal's real speed, so a walking deer strides and a grazing
 * one nibbles. It self-animates from the render loop.
 *
 * `positions` exposes the live animals, so gameplay can read them — spook the
 * herd, count the flock, or wire the leader to a GAMA agent.
 *
 * ```ts
 * const terrain = createTerrain({ seed: 3 });
 * const deer = createHerd({ type: 'deer', center: [0, 0], ground: terrain.heightAt });
 * scene.add(terrain.mesh, deer.object);
 * ```
 */
export function createHerd(options: HerdOptions = {}): Herd {
  const type = options.type ?? 'deer';
  const sheep = type === 'sheep';
  const count = options.count ?? (sheep ? 16 : 12);
  const c = options.center ?? [0, 0];
  const center = { x: c[0], z: c[1] };
  const r = options.radius ?? 18;
  const radius = typeof r === 'number' ? { x: r, z: r } : { x: r[0], z: r[1] };
  const ground = options.ground ?? (() => 0);
  const speed = options.speed ?? (sheep ? 1.4 : 2.2);
  const size = options.size ?? (sheep ? 0.85 : 1);
  const grazing = options.grazing ?? (sheep ? 0.75 : 0.6);
  const slopeAlign = options.slopeAlign ?? 0.6;
  const wSep = options.separation ?? 1.6;
  const wAli = options.alignment ?? 0.7;
  const wCoh = options.cohesion ?? (sheep ? 1.6 : 1.1);
  const rng = new Rng(options.seed ?? 1);

  const { geo, stand } = quadrupedGeometry(type, size);
  const { material, uniforms } = herdMaterial(options.color ?? (sheep ? 0xe7e2d6 : 0xa9855a), sheep ? 5 : 6);

  // Per-instance gait phase (desync) and live movement amount (gait/graze).
  const phases = new Float32Array(count);
  const move = new Float32Array(count);
  for (let i = 0; i < count; i++) phases[i] = rng.range(0, Math.PI * 2);
  geo.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1));
  const moveAttr = new InstancedBufferAttribute(move, 1);
  moveAttr.setUsage(0x88e8 /* DYNAMIC_DRAW */);
  geo.setAttribute('aMove', moveAttr);

  const mesh = new InstancedMesh(geo, material, count);
  mesh.name = `herd-${type}`;
  mesh.castShadow = true;
  mesh.frustumCulled = false;

  // Boid state (XZ plane; y is clamped to the ground).
  const pos: Vector3[] = [];
  const vel: Vector3[] = [];
  const graze: number[] = []; // seconds left in the current graze pause
  for (let i = 0; i < count; i++) {
    const x = center.x + rng.range(-radius.x, radius.x);
    const z = center.z + rng.range(-radius.z, radius.z);
    pos.push(new Vector3(x, ground(x, z) + stand, z));
    const a = rng.range(0, Math.PI * 2);
    vel.push(new Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(speed));
    graze.push(rng.range(0, 4));
  }

  const m = new Matrix4();
  const sep = new Vector3();
  const ali = new Vector3();
  const coh = new Vector3();
  const acc = new Vector3();
  const tmp = new Vector3();
  const fwd = new Vector3();
  const up = new Vector3();
  const right = new Vector3();
  const upWorld = new Vector3(0, 1, 0);
  const gn = new Vector3();
  const neighbor = sheep ? 5 : 7;
  const sepDist = sheep ? 1.1 : 1.6;

  const groundNormal = (x: number, z: number): Vector3 => {
    const e = 0.6;
    const hl = ground(x - e, z);
    const hr = ground(x + e, z);
    const hd = ground(x, z - e);
    const hu = ground(x, z + e);
    return gn.set(hl - hr, 2 * e, hd - hu).normalize();
  };

  const writeMatrices = (): void => {
    for (let i = 0; i < count; i++) {
      const p = pos[i];
      const v = vel[i];
      // Forward from velocity, flattened to the ground plane.
      fwd.set(v.x, 0, v.z);
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
      fwd.normalize();
      // Up leans toward the terrain normal on slopes.
      up.copy(upWorld).lerp(groundNormal(p.x, p.z), slopeAlign).normalize();
      right.copy(up).cross(fwd);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      up.copy(fwd).cross(right).normalize(); // re-orthogonalise
      m.makeBasis(right, up, fwd);
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

      // Grazing rhythm: count down the pause, then flip state.
      graze[i] -= dt;
      const isGrazing = graze[i] > 0;
      if (graze[i] < -0.01) {
        // Choose the next state: graze for a while, or walk for a while.
        graze[i] = rng.next() < grazing ? rng.range(2.5, 6) : -rng.range(2, 4.5);
      }

      sep.set(0, 0, 0);
      ali.set(0, 0, 0);
      coh.set(0, 0, 0);
      let near = 0;
      for (let j = 0; j < count; j++) {
        if (j === i) continue;
        const q = pos[j];
        const dx = p.x - q.x;
        const dz = p.z - q.z;
        const d = Math.hypot(dx, dz);
        if (d < neighbor) {
          ali.add(vel[j]);
          coh.add(q);
          near++;
          if (d < sepDist && d > 1e-4) {
            sep.x += dx / (d * d);
            sep.z += dz / (d * d);
          }
        }
      }

      acc.set(0, 0, 0);
      if (!isGrazing) {
        if (near > 0) {
          ali.multiplyScalar(1 / near);
          ali.y = 0;
          if (ali.lengthSq() > 1e-6) ali.setLength(speed).sub(v).multiplyScalar(wAli);
          acc.add(ali);
          coh.multiplyScalar(1 / near);
          tmp.set(coh.x - p.x, 0, coh.z - p.z).multiplyScalar(wCoh * 0.4);
          acc.add(tmp);
        }
        if (sep.lengthSq() > 0) {
          sep.y = 0;
          acc.add(sep.setLength(speed).multiplyScalar(wSep));
        }
        // Soft bounds pull strays back toward the grazing ground.
        tmp.set(center.x - p.x, 0, center.z - p.z);
        tmp.x = Math.abs(p.x - center.x) > radius.x * 0.85 ? tmp.x : 0;
        tmp.z = Math.abs(p.z - center.z) > radius.z * 0.85 ? tmp.z : 0;
        acc.add(tmp.multiplyScalar(1.6));
        // A little wander.
        acc.x += rng.range(-1, 1) * speed * 0.5;
        acc.z += rng.range(-1, 1) * speed * 0.5;
      }

      v.addScaledVector(acc, dt);
      v.y = 0;
      if (isGrazing) {
        v.multiplyScalar(Math.max(0, 1 - dt * 6)); // brake to a standstill
      } else {
        const sp = Math.hypot(v.x, v.z);
        if (sp > speed * 1.4) v.setLength(speed * 1.4);
        else if (sp < speed * 0.5) {
          if (sp < 1e-4) v.set(rng.range(-1, 1), 0, rng.range(-1, 1));
          v.setLength(speed * 0.5);
        }
      }
      p.x += v.x * dt;
      p.z += v.z * dt;
      p.y = ground(p.x, p.z) + stand; // clamp feet to the terrain

      // Smooth the per-instance movement amount that drives the gait/graze.
      const target = Math.min(1, Math.hypot(v.x, v.z) / (speed * 0.9));
      move[i] += (target - move[i]) * Math.min(1, dt * 5);
    }
    moveAttr.needsUpdate = true;
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
    setCenter(x, z) {
      center.x = x;
      center.z = z;
    },
    update(dt) {
      manual = true;
      uniforms.uTime.value += dt;
      step(dt);
    },
  };
}
