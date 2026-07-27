import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DataTexture,
  FloatType,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  RedFormat,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import type { Prop } from '../core/types';

/**
 * The beach — the line where the water was a moment ago.
 *
 * Dry sand is terrain and the sea already ships; what makes a beach READ
 * is the strip between them. This prop owns that strip: the **swash** —
 * the tongue of water that runs up the sand and drains back — and the
 * memory it leaves. Sand where the water has just been is mirror-wet; it
 * dries through dark, damp and dry over half a minute; each retreat
 * strands a lace of foam at its high point; and the whole record is
 * queryable as **`wetAt(x, z)`** — the fifth spatial field, after
 * `depthAt`, `heatAt`, `chillAt` and `smokeAt`.
 *
 * ```ts
 * const beach = createBeach({ seed: 7, width: 46 });
 * scene.add(beach.object);
 * const ocean = createOcean({ shore: beach.heightAt, wind });   // compose
 * game.onUpdate((t) => beach.update(t.delta));
 * ```
 *
 * ## One water, two directions
 *
 * The beach does not own the sea — it *asks* it. Pass any
 * `water(x, z, time)` (structurally `Ocean.heightAt`) and the swash runs
 * on the real swell; pass nothing and a seeded built-in swell drives it —
 * progressive along the shore (tongues run diagonally, as they do) and
 * modulated into **sets**, because waves arrive in families. Either way
 * the beach hands its `heightAt` back to the ocean's `shore` option, so
 * the two agree about where the land is. Neither imports the other.
 *
 * ## The sand remembers
 *
 * `stamp(x, z)` presses a mark into the sand — a footprint, a paw, a
 * dropped coconut. **Only wet sand takes a print** (try stamping dry dune
 * and it simply doesn't), and the next tongue that crosses a print wipes
 * it. Wire ANIMA's `loco.onFootstep` to `stamp` and characters write
 * their path along the beach while the sea edits it — that one coupling
 * is worth more than any ten props.
 *
 * `wrackLine()` reports the session's high-water mark per shore segment —
 * where the tide leaves its shells and kelp, and where 0.82's scatter
 * will put them.
 *
 * Local frame: X runs along the shore, +Z is seaward, the still-water
 * line sits at `z0` (about a sixth of the depth seaward of centre). All
 * public queries are **world-space** and ride the prop's transform.
 */

export interface BeachOptions {
  seed?: number;
  /** Metres of shoreline (local X). Default 40. */
  width?: number;
  /** Cross-shore extent (local Z). Default 24. */
  depth?: number;
  /** Still-water level, world Y. Default 0. */
  level?: number;
  /** Height of the back dune above sea level. Default 1.6. */
  duneHeight?: number;
  /** Seconds fully-wet sand takes to dry. Default 30. */
  dryTime?: number;
  /**
   * Water height at a world point and time — structurally `Ocean.heightAt`.
   * Default: a seeded built-in swell with along-shore progression and sets.
   */
  water?: (x: number, z: number, time: number) => number;
}

export interface Beach extends Prop {
  /** Sand height at a world point — hand this to `createOcean({ shore })`. */
  heightAt(x: number, z: number): number;
  /** How wet the sand is at a world point, 0..1. The fifth field. */
  wetAt(x: number, z: number): number;
  /** The water edge's current position at shore coordinate x, as a world point. */
  reachAt(x: number): { x: number; z: number };
  /**
   * Press a mark into the sand. Only wet sand (wetAt > 0.15) takes a
   * print; returns whether it took. The next tongue over it wipes it.
   */
  stamp(x: number, z: number, r?: number): boolean;
  /** Prints currently in the sand. */
  readonly stamps: number;
  /** Foam scraps currently stranded. */
  readonly foam: number;
  /** The session's high-water mark, one world point per shore segment. */
  wrackLine(): Array<{ x: number; z: number }>;
  update(dt: number): void;
}

const SEGS = 48; // along-shore swash segments
const CELLS = 48; // cross-shore wetness cells (full depth)
const MAX_FOAM = 96;
const MAX_STAMPS = 220;
/** Foreshore slope: 1 in 12 — a walkable, dissipative beach. */
const SLOPE = 0.084;
/** Swash momentum: the tongue runs further than the static intersection. */
const RUNUP = 1.6;

export function createBeach(options: BeachOptions = {}): Beach {
  const rng = new Rng(options.seed ?? 1);
  const width = options.width ?? 40;
  const depth = options.depth ?? 24;
  const level = options.level ?? 0;
  const duneH = options.duneHeight ?? 1.6;
  const dryTime = Math.max(1, options.dryTime ?? 30);
  const z0 = depth / 6; // still-water line, local

  // The built-in swell: two progressive components + a slow set envelope.
  const a1 = 0.1 + rng.next() * 0.08;
  const a2 = 0.05 + rng.next() * 0.05;
  const p1 = rng.next() * Math.PI * 2;
  const p2 = rng.next() * Math.PI * 2;
  const defaultSwell = (x: number, _z: number, t: number): number => {
    const set = 1 + 0.5 * Math.sin((t * Math.PI * 2) / 47 + p2);
    return (
      set *
      (a1 * Math.sin((t * Math.PI * 2) / 6.1 - x * 0.35 + p1) +
        a2 * Math.sin((t * Math.PI * 2) / 9.7 + x * 0.21 + p2))
    );
  };
  const water = options.water ?? defaultSwell;

  // --- The sand: a berm profile, dune at -Z, foreshore running under the sea.
  const profile = (z: number): number => {
    const fore = level + (z0 - z) * SLOPE;
    const duneT = Math.min(1, Math.max(0, (z0 - 7 - z) / 8));
    return fore + duneH * duneT * duneT * (3 - 2 * duneT);
  };

  const group = new Group();
  group.name = 'beach';

  const sandGeo = new PlaneGeometry(width, depth, 64, 48);
  sandGeo.rotateX(-Math.PI / 2);
  {
    const pos = sandGeo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, profile(pos.getZ(i)));
    }
    sandGeo.computeVertexNormals();
  }

  // --- The wetness record: one scalar per cell, uploaded as a texture the
  // sand shader reads. `lastCovered` is the whole simulation state.
  const lastCovered = new Float32Array(SEGS * CELLS).fill(-1e9);
  const wetData = new Float32Array(SEGS * CELLS);
  const wetTex = new DataTexture(wetData, SEGS, CELLS, RedFormat, FloatType);
  wetTex.magFilter = NearestFilter;
  wetTex.minFilter = NearestFilter;

  // Fully matte: at 0.95 a low sun still drags a glitter path up dry sand
  // (found by probe screenshots, invariant to the sheen band). Dry sand
  // scatters; only the WET record is allowed any shine.
  const sandMat = new MeshStandardMaterial({
    color: 0xdbc79d,
    roughness: 1,
    metalness: 0,
  });
  sandMat.defines = { USE_UV: '' };
  sandMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = { value: wetTex };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D uWet;'
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  // The plane is rotated flat, which flips v: dune is v=1, sea is v=0.
  float scWet = texture2D(uWet, vec2(vUv.x, 1.0 - vUv.y)).r;
  // Wet sand is darker and slightly warmer; the sheen band is near-mirror.
  diffuseColor.rgb *= 1.0 - 0.42 * scWet;
  diffuseColor.rgb += vec3(0.02, 0.012, 0.0) * scWet;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
  // Sheen only where the water JUST was, and matte enough that the sun's
  // reflection is a gleam, not a nova — found by screenshot, as ever.
  float scSheen = smoothstep(0.82, 1.0, scWet);
  roughnessFactor = mix(roughnessFactor, 0.22, scSheen);`
      );
  };
  const sand = new Mesh(sandGeo, sandMat);
  sand.name = 'sand';
  group.add(sand);

  // --- The tongue: a strip whose front edge IS the current reach.
  const swashGeo = new BufferGeometry();
  {
    const verts = new Float32Array((SEGS + 1) * 2 * 3);
    const cols = new Float32Array((SEGS + 1) * 2 * 3);
    const idx: number[] = [];
    for (let i = 0; i < SEGS; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    swashGeo.setAttribute('position', new BufferAttribute(verts, 3));
    swashGeo.setAttribute('color', new BufferAttribute(cols, 3));
    swashGeo.setIndex(idx);
  }
  // Matte and modest: a specular white sheet under a low sun reads as a
  // glare bomb, not water. The film keeps its shine in the SAND's sheen
  // band; the sheet itself is just a soft milky wash.
  const swashMat = new MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.32,
    roughness: 0.6,
    depthWrite: false,
  });
  const swash = new Mesh(swashGeo, swashMat);
  swash.name = 'swash';
  group.add(swash);

  // --- Foam scraps: the lace the retreat strands, popping over seconds.
  const foamMesh = new InstancedMesh(
    new CircleGeometry(0.22, 8).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.85 }),
    MAX_FOAM
  );
  foamMesh.name = 'foam';
  foamMesh.count = 0;
  group.add(foamMesh);
  interface Scrap {
    x: number;
    z: number;
    born: number;
    size: number;
  }
  const scraps: Scrap[] = [];

  // --- Prints: only wet sand takes them; the next tongue wipes them.
  const stampMesh = new InstancedMesh(
    new CircleGeometry(1, 9).rotateX(-Math.PI / 2),
    // Darker than the WET sand around it, or a print reads as a bright dot.
    new MeshStandardMaterial({ color: 0x63523c, roughness: 1 }),
    MAX_STAMPS
  );
  stampMesh.name = 'stamps';
  stampMesh.count = 0;
  group.add(stampMesh);
  interface Print {
    x: number;
    z: number;
    r: number;
    /** 1 while set; ramps to 0 while a tongue washes it. */
    life: number;
    washing: boolean;
  }
  const prints: Print[] = [];

  // --- Swash state.
  let time = 0;
  const reach = new Float32Array(SEGS).fill(z0);
  const minReachEver = new Float32Array(SEGS).fill(z0);
  /** Per-segment retreat bookkeeping for foam. */
  const excursion = new Float32Array(SEGS).fill(z0);
  const lastFoamAt = new Float32Array(SEGS).fill(-1e9);
  const retreating = new Uint8Array(SEGS);

  const segX = (i: number): number => -width / 2 + ((i + 0.5) * width) / SEGS;
  const segOf = (x: number): number =>
    Math.max(0, Math.min(SEGS - 1, Math.floor(((x + width / 2) / width) * SEGS)));
  const cellOf = (z: number): number =>
    Math.max(0, Math.min(CELLS - 1, Math.floor(((z + depth / 2) / depth) * CELLS)));
  const cellZ = (k: number): number => -depth / 2 + ((k + 0.5) * depth) / CELLS;

  const world = new Vector3();
  const inverse = new Matrix4();
  const toLocal = (x: number, z: number): { x: number; z: number } => {
    group.updateWorldMatrix(true, false);
    inverse.copy(group.matrixWorld).invert();
    world.set(x, 0, z).applyMatrix4(inverse);
    return { x: world.x, z: world.z };
  };
  const toWorld = (x: number, z: number): { x: number; z: number } => {
    group.updateWorldMatrix(true, false);
    world.set(x, 0, z).applyMatrix4(group.matrixWorld);
    return { x: world.x, z: world.z };
  };

  const wetOfCell = (i: number, k: number): number => {
    if (cellZ(k) >= reach[i]) return 1; // under the water right now
    const age = time - lastCovered[k * SEGS + i];
    return Math.max(0, 1 - age / dryTime);
  };

  const dummy = new Matrix4();

  const rebuildFoam = (): void => {
    foamMesh.count = scraps.length;
    for (let s = 0; s < scraps.length; s++) {
      const scrap = scraps[s];
      const age = time - scrap.born;
      const k = Math.max(0.001, scrap.size * (1 - age / 4.5));
      dummy.makeScale(k, 1, k * 0.55);
      dummy.setPosition(scrap.x, profile(scrap.z) + 0.015, scrap.z);
      foamMesh.setMatrixAt(s, dummy);
    }
    foamMesh.instanceMatrix.needsUpdate = true;
  };

  const rebuildStamps = (): void => {
    stampMesh.count = prints.length;
    for (let s = 0; s < prints.length; s++) {
      const print = prints[s];
      const k = print.r * print.life;
      dummy.makeScale(Math.max(0.001, k), 1, Math.max(0.001, k * 0.7));
      dummy.setPosition(print.x, profile(print.z) + 0.008, print.z);
      stampMesh.setMatrixAt(s, dummy);
    }
    stampMesh.instanceMatrix.needsUpdate = true;
  };

  return {
    object: group,
    obstacleRadius: 0,

    heightAt(x: number, z: number): number {
      // The FIELD extends the coast forever; only the mesh is bounded.
      // (An -Infinity here once reached the ocean's shore attribute and
      // rendered as a glowing smeared sliver — fields must stay finite.)
      const p = toLocal(x, z);
      return profile(p.z);
    },

    wetAt(x: number, z: number): number {
      const p = toLocal(x, z);
      if (Math.abs(p.x) > width / 2 || Math.abs(p.z) > depth / 2) return 0;
      return wetOfCell(segOf(p.x), cellOf(p.z));
    },

    reachAt(x: number): { x: number; z: number } {
      const p = toLocal(x, 0);
      const i = segOf(p.x);
      return toWorld(segX(i), reach[i]);
    },

    stamp(x: number, z: number, r = 0.11): boolean {
      const p = toLocal(x, z);
      if (Math.abs(p.x) > width / 2 || Math.abs(p.z) > depth / 2) return false;
      const i = segOf(p.x);
      // Dry sand takes no print — and neither does open water.
      if (wetOfCell(i, cellOf(p.z)) < 0.15) return false;
      if (p.z >= reach[i]) return false;
      if (prints.length >= MAX_STAMPS) prints.shift();
      prints.push({ x: p.x, z: p.z, r, life: 1, washing: false });
      rebuildStamps();
      return true;
    },

    get stamps(): number {
      return prints.length;
    },

    get foam(): number {
      return scraps.length;
    },

    wrackLine(): Array<{ x: number; z: number }> {
      const line: Array<{ x: number; z: number }> = [];
      for (let i = 0; i < SEGS; i++) line.push(toWorld(segX(i), minReachEver[i]));
      return line;
    },

    update(dt: number): void {
      time += dt;
      group.updateWorldMatrix(true, false);

      const swashPos = swashGeo.getAttribute('position');
      const swashCol = swashGeo.getAttribute('color');

      for (let i = 0; i < SEGS; i++) {
        const shorePoint = toWorld(segX(i), z0);
        const wave = water(shorePoint.x, shorePoint.z, time) - level;
        // Momentum carries the tongue past the static intersection; the
        // backwash bares extra sand below the still-water line.
        const excursionZ =
          wave >= 0 ? z0 - (wave * RUNUP) / SLOPE : z0 + (-wave * 0.8) / SLOPE;
        const target = Math.max(z0 - 6.4, Math.min(depth / 2 - 0.4, excursionZ));
        const prev = reach[i];
        // The edge chases its target — water has inertia even here.
        reach[i] = prev + (target - prev) * Math.min(1, dt * 2.6);

        if (reach[i] < minReachEver[i]) minReachEver[i] = reach[i];

        // Foam: the moment a run-up turns, strand a scrap at its high point.
        if (reach[i] < excursion[i]) {
          excursion[i] = reach[i];
          retreating[i] = 0;
        } else if (
          !retreating[i] &&
          reach[i] > excursion[i] + 0.25 &&
          z0 - excursion[i] > 0.7 &&
          time - lastFoamAt[i] > 2.4
        ) {
          retreating[i] = 1;
          lastFoamAt[i] = time;
          excursion[i] = reach[i];
          if (scraps.length >= MAX_FOAM) scraps.shift();
          scraps.push({
            x: segX(i) + (rng.next() - 0.5) * (width / SEGS),
            z: excursion[i] - 0.1,
            born: time,
            size: 0.6 + rng.next() * 0.8,
          });
        } else if (retreating[i]) {
          excursion[i] = reach[i];
        }

        // Everything seaward of the edge is covered NOW.
        for (let k = cellOf(reach[i]); k < CELLS; k++) {
          lastCovered[k * SEGS + i] = time;
        }
      }

      // Write the strip in a second tidy pass (verts are shared per column).
      for (let c = 0; c <= SEGS; c++) {
        const i = Math.min(SEGS - 1, Math.max(0, c - 0));
        const iL = Math.max(0, c - 1);
        const r = c === 0 ? reach[0] : c === SEGS ? reach[SEGS - 1] : (reach[i] + reach[iL]) / 2;
        const x = -width / 2 + (c * width) / SEGS;
        const front = c * 2;
        const back = c * 2 + 1;
        swashPos.setXYZ(front, x, profile(r) + 0.02, r);
        swashPos.setXYZ(back, x, profile(r + 2.6) + 0.012, r + 2.6);
        swashCol.setXYZ(front, 0.9, 0.95, 0.95);
        swashCol.setXYZ(back, 0.62, 0.72, 0.74);
      }
      swashPos.needsUpdate = true;
      swashCol.needsUpdate = true;
      swashGeo.computeVertexNormals();

      // Dying foam.
      for (let s = scraps.length - 1; s >= 0; s--) {
        if (time - scraps[s].born > 4.5) scraps.splice(s, 1);
      }
      rebuildFoam();

      // Prints: a tongue over a print washes it out.
      let stampsDirty = false;
      for (let s = prints.length - 1; s >= 0; s--) {
        const print = prints[s];
        if (!print.washing && print.z >= reach[segOf(print.x)] - 0.05) {
          print.washing = true;
        }
        if (print.washing) {
          print.life -= dt / 0.7;
          stampsDirty = true;
          if (print.life <= 0) prints.splice(s, 1);
        }
      }
      if (stampsDirty) rebuildStamps();

      // Refresh the wetness record the shader reads.
      for (let i = 0; i < SEGS; i++) {
        for (let k = 0; k < CELLS; k++) {
          wetData[k * SEGS + i] = wetOfCell(i, k);
        }
      }
      wetTex.needsUpdate = true;
    },
  };
}
