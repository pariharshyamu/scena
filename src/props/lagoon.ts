import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import type { Prop } from '../core/types';

/**
 * The lagoon — the turquoise pool the postcard is actually of.
 *
 * Not surf: a big, calm, SWIMMABLE basin of clear water — the sheltered
 * pool behind the reef, with the open ocean out on the horizon where it
 * belongs. The build is three honest layers: a sandy **bowl** (visible
 * through the water, because clear water IS its bottom), a **surface**
 * whose colour runs pale at the rim to deep turquoise over the middle,
 * gently rippling, and **fish** — small, colourful, and busy, each on a
 * seeded circuit of its own, wiggling as it goes.
 *
 * ```ts
 * const lagoon = createLagoon({ seed: 7, radius: 9 });
 * scene.add(lagoon.object);
 * game.onUpdate((t) => lagoon.update(t.delta));
 * ```
 *
 * ## Swimmers drop straight in
 *
 * The lagoon is structurally ANIMA's `WaterBody` — `surfaceY`,
 * `depthAt(x, z)`, `disturb()` — so a `Swimming` character needs no
 * adapter at all: hand them the lagoon and they swim in it. `depthAt` is
 * world-space and rides the prop's transform, like every SCENA field.
 *
 * The outline is organic — a seeded radial wobble, never a circle — and
 * the bowl is deepest a little off-centre, the way real lagoons are.
 */

export interface LagoonOptions {
  seed?: number;
  /** Mean radius of the pool, metres. Default 9. */
  radius?: number;
  /** Depth at the deep point, metres. Default 1.8. */
  depth?: number;
  /** Water level, local Y. Default 0. */
  level?: number;
  /** Fish in the water. Default 14. */
  fish?: number;
}

export interface Lagoon extends Prop {
  /** ANIMA `WaterBody`, structurally: the water's local surface height. */
  surfaceY: number;
  /** Water depth at a world point, metres; 0 outside the pool. */
  depthAt(x: number, z: number): number;
  /** A ripple hook (a swimmer's kick). Accepted, gently ignored for now. */
  disturb(x: number, z: number, strength?: number): void;
  update(dt: number): void;
}

const FISH_COLORS = [0xe8722c, 0x2f7fd4, 0xe8c832, 0xd44a6a, 0x35c0b0, 0xf0f0e8];

export function createLagoon(options: LagoonOptions = {}): Lagoon {
  const rng = new Rng(options.seed ?? 1);
  const R = options.radius ?? 9;
  const maxDepth = options.depth ?? 1.8;
  const level = options.level ?? 0;
  const fishCount = Math.max(0, options.fish ?? 14);

  // The outline: a seeded wobble, so no two lagoons are the same pool.
  const p3 = rng.next() * Math.PI * 2;
  const p5 = rng.next() * Math.PI * 2;
  const w3 = rng.range(0.1, 0.18);
  const w5 = rng.range(0.05, 0.1);
  const rim = (theta: number): number =>
    R * (1 + w3 * Math.sin(3 * theta + p3) + w5 * Math.sin(5 * theta + p5));
  // Deepest a little off-centre, the way real pools are.
  const deepX = rng.range(-0.25, 0.25) * R;
  const deepZ = rng.range(-0.25, 0.25) * R;
  const depthLocal = (x: number, z: number): number => {
    const theta = Math.atan2(z, x);
    const edge = rim(theta);
    const d = Math.hypot(x, z);
    if (d >= edge) return 0;
    const toDeep = Math.hypot(x - deepX, z - deepZ) / (edge * 1.05);
    const bowl = Math.pow(Math.max(0, 1 - toDeep), 0.9);
    // Shallow shelf at the rim, bowl toward the deep point.
    const shelf = Math.pow(1 - d / edge, 0.55);
    return maxDepth * Math.min(1, bowl * 0.75 + shelf * 0.45);
  };

  const group = new Group();
  group.name = 'lagoon';

  // --- Fan discs for the bowl and the surface, on the same outline.
  const RINGS = 9;
  const SPOKES = 40;
  const SPOKES_APRON = 40;
  const buildDisc = (
    yAt: (x: number, z: number, edgeT: number) => number,
    colorAt: (x: number, z: number, edgeT: number) => [number, number, number]
  ): BufferGeometry => {
    const verts: number[] = [0, yAt(0, 0, 0), 0];
    const cols: number[] = [...colorAt(0, 0, 0)];
    const idx: number[] = [];
    for (let ring = 1; ring <= RINGS; ring++) {
      const t = ring / RINGS;
      for (let s = 0; s < SPOKES; s++) {
        const theta = (s / SPOKES) * Math.PI * 2;
        const x = Math.cos(theta) * rim(theta) * t;
        const z = Math.sin(theta) * rim(theta) * t;
        verts.push(x, yAt(x, z, t), z);
        cols.push(...colorAt(x, z, t));
      }
    }
    const at = (ring: number, s: number): number =>
      ring === 0 ? 0 : 1 + (ring - 1) * SPOKES + (s % SPOKES);
    for (let s = 0; s < SPOKES; s++) idx.push(0, at(1, s + 1), at(1, s));
    for (let ring = 1; ring < RINGS; ring++) {
      for (let s = 0; s < SPOKES; s++) {
        const a = at(ring, s);
        const b = at(ring, s + 1);
        const c = at(ring + 1, s);
        const d = at(ring + 1, s + 1);
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };

  // The bowl: pale wet sand, darkening slightly with depth.
  const sandShallow = new Color(0xd8c398);
  const sandDeep = new Color(0xb09a72);
  const bottom = new Mesh(
    buildDisc(
      (x, z) => level - depthLocal(x, z) - 0.02,
      (x, z) => {
        const t = depthLocal(x, z) / maxDepth;
        const c = sandShallow.clone().lerp(sandDeep, t);
        return [c.r, c.g, c.b];
      }
    ),
    new MeshStandardMaterial({ vertexColors: true, roughness: 1 })
  );
  bottom.name = 'bottom';
  group.add(bottom);

  // The water: rim-pale to mid-deep turquoise, translucent so the bowl
  // and the fish show through — clear water IS its bottom.
  // A sand APRON around the pool: a low berm rising just past the rim and
  // falling away outside, so the lagoon seats into ANY ground plane with
  // no coplanar seam to z-fight (the mottled-water bug, by screenshot).
  {
    const verts: number[] = [];
    const cols: number[] = [];
    const idx: number[] = [];
    const RADII = [1.0, 1.12, 1.45];
    const YS = [-0.02, 0.06, -0.12];
    const apronIn = new Color(0xdcc79b);
    const apronOut = new Color(0xe2cf9f);
    for (let ring = 0; ring < RADII.length; ring++) {
      for (let s = 0; s < SPOKES_APRON; s++) {
        const theta = (s / SPOKES_APRON) * Math.PI * 2;
        const r = rim(theta) * RADII[ring];
        verts.push(Math.cos(theta) * r, level + YS[ring], Math.sin(theta) * r);
        const c = ring === 0 ? apronIn : apronOut;
        cols.push(c.r, c.g, c.b);
      }
    }
    for (let ring = 0; ring < RADII.length - 1; ring++) {
      for (let s = 0; s < SPOKES_APRON; s++) {
        const a = ring * SPOKES_APRON + s;
        const b = ring * SPOKES_APRON + ((s + 1) % SPOKES_APRON);
        const c = (ring + 1) * SPOKES_APRON + s;
        const d = (ring + 1) * SPOKES_APRON + ((s + 1) % SPOKES_APRON);
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const apron = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    apron.name = 'apron';
    group.add(apron);
  }

  const rimColor = new Color(0xaef2e4);
  const deepColor = new Color(0x1fa8b0);
  const water = new Mesh(
    buildDisc(
      () => level,
      (x, z) => {
        const t = Math.min(1, (depthLocal(x, z) / maxDepth) * 1.25);
        const c = rimColor.clone().lerp(deepColor, Math.pow(t, 0.8));
        return [c.r, c.g, c.b];
      }
    ),
    new MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      roughness: 0.12,
      metalness: 0,
      side: DoubleSide,
      depthWrite: false,
    })
  );
  water.name = 'water';
  group.add(water);
  const waterPos = water.geometry.getAttribute('position');
  const waterRest = (waterPos.array as Float32Array).slice();

  // --- The fish: each on a seeded circuit, wiggling as it goes.
  interface Fish {
    node: Group;
    cx: number;
    cz: number;
    orbit: number;
    swimY: number;
    speed: number;
    phase: number;
    wiggle: number;
  }
  const fishGroup = new Group();
  fishGroup.name = 'fish';
  group.add(fishGroup);
  const fishes: Fish[] = [];
  for (let i = 0; i < fishCount; i++) {
    const color = FISH_COLORS[Math.floor(rng.next() * FISH_COLORS.length)];
    const mat = new MeshStandardMaterial({ color, roughness: 0.5, flatShading: true });
    const node = new Group();
    // A fish in four boxes: body, nose, tail fin, top fin.
    const bodyMesh = new Mesh(new BoxGeometry(0.2, 0.08, 0.035), mat);
    const nose = new Mesh(new BoxGeometry(0.06, 0.05, 0.028), mat);
    nose.position.x = 0.12;
    const tailMat = new MeshStandardMaterial({
      color: new Color(color).offsetHSL(0.04, 0, -0.08).getHex(),
      roughness: 0.5,
      flatShading: true,
    });
    const tail = new Mesh(new BoxGeometry(0.07, 0.06, 0.012), tailMat);
    tail.position.x = -0.13;
    const fin = new Mesh(new BoxGeometry(0.07, 0.04, 0.012), tailMat);
    fin.position.y = 0.055;
    node.add(bodyMesh, nose, tail, fin);
    fishGroup.add(node);
    // The circuit: an ellipse of its own, safely inside the rim shelf.
    const a = rng.next() * Math.PI * 2;
    const cd = rng.next() * 0.35 * R;
    const d = depthLocal(Math.cos(a) * cd, Math.sin(a) * cd);
    fishes.push({
      node,
      cx: Math.cos(a) * cd,
      cz: Math.sin(a) * cd,
      // Never an orbit that grazes the rim: home is the middle of the pool.
      orbit: Math.min(rng.range(0.18, 0.42) * R, 0.66 * R - cd),
      swimY: level - Math.min(d * 0.7, rng.range(0.35, 1.1)),
      speed: rng.range(0.25, 0.6) * (rng.next() < 0.5 ? 1 : -1),
      phase: rng.next() * Math.PI * 2,
      wiggle: rng.range(5, 8),
    });
  }

  let time = rng.next() * 20;
  const world = new Vector3();
  const inverse = new Matrix4();

  return {
    object: group,
    obstacleRadius: 0,
    surfaceY: level,

    depthAt(x: number, z: number): number {
      group.updateWorldMatrix(true, false);
      inverse.copy(group.matrixWorld).invert();
      world.set(x, 0, z).applyMatrix4(inverse);
      return depthLocal(world.x, world.z);
    },

    disturb(): void {
      // A swimmer's kick. The surface is already alive; accepted quietly.
    },

    update(dt: number): void {
      time += dt;
      // The surface breathes: two slow crossing ripples, centimetres tall.
      for (let i = 0; i < waterPos.count; i++) {
        const x = waterRest[i * 3];
        const z = waterRest[i * 3 + 2];
        waterPos.setY(
          i,
          level +
            0.02 * Math.sin(x * 0.9 + time * 1.1) +
            0.015 * Math.sin(z * 1.3 - time * 0.8 + 1.7)
        );
      }
      waterPos.needsUpdate = true;

      for (const fish of fishes) {
        const t = time * fish.speed + fish.phase;
        const x = fish.cx + Math.cos(t) * fish.orbit;
        const z = fish.cz + Math.sin(t) * fish.orbit * 0.75;
        // A fish follows the sand up over the shelf and never beaches:
        // preferred depth, clamped inside [just under the surface, just
        // above the bottom] wherever the circuit has taken it.
        const d = depthLocal(x, z);
        const y = Math.max(fish.swimY + Math.sin(t * 2.3) * 0.05, -(Math.max(0.12, d) - 0.07));
        fish.node.position.set(x, Math.min(-0.06, y), z);
        // Face travel, wiggle the tail-end via a little yaw shimmy.
        const heading = Math.atan2(
          Math.cos(t) * fish.orbit * 0.75 * Math.sign(fish.speed),
          -Math.sin(t) * fish.orbit * Math.sign(fish.speed)
        );
        fish.node.rotation.y = heading + Math.sin(time * fish.wiggle) * 0.18;
      }
    },
  };
}
