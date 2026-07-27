import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

/**
 * The cricket ground, and the gear.
 *
 * A cricket field is mostly EMPTY, and the emptiness is measured: a
 * 22-yard strip, creases painted at fixed distances from the stumps, and
 * a boundary a long way further out than anyone expects. Getting those
 * numbers right is what makes a ground read as a cricket ground rather
 * than a green circle with sticks in it, so this file works in the
 * game's own units — yards and inches, converted once — and every
 * distance below is the real one.
 *
 * ```ts
 * const ground = createCricketGround({ seed: 3 });
 * scene.add(ground.object);
 * ground.strikerEnd;    // where the batter stands
 * ground.bowlerEnd;     // where the run-up starts
 * ground.stumpsAt(-1);  // the stumps a delivery is aimed at
 * ```
 */

const YARD = 0.9144;
const INCH = 0.0254;
/** The pitch: 22 yards stump to stump, 10 feet wide. */
export const PITCH_LENGTH = 22 * YARD;
export const PITCH_WIDTH = 3.05;
/** Stumps: 28 inches tall, 9 inches across all three. */
export const STUMP_HEIGHT = 28 * INCH;
export const STUMP_SPREAD = 9 * INCH;
/** The popping crease is 4 feet in front of the stumps. */
export const CREASE_FRONT = 4 * 0.3048;

export interface CricketGroundOptions {
  seed?: number;
  /** Boundary radius in metres. Default 62 — a real, big field. */
  boundary?: number;
  /** Grass colour. Default a mown green. */
  grass?: number;
  /** Width of the mower's stripes, metres. Default 7. */
  stripe?: number;
}

export interface CricketGround extends Prop {
  /** Where the batter on strike stands (world space, on the crease). */
  readonly strikerEnd: Vector3;
  /** Where the non-striker / bowler's end is. */
  readonly bowlerEnd: Vector3;
  /** Boundary radius, metres. */
  readonly boundary: number;
  /**
   * The base of the stumps at one end: `-1` is the striker's (the end
   * being bowled AT), `+1` the bowler's.
   */
  stumpsAt(end: -1 | 1): Vector3;
  /** True when a point has crossed the rope. */
  isBoundary(x: number, z: number): boolean;
  /** Knock the bails off the striker's stumps — a wicket, visibly. */
  breakWicket(end?: -1 | 1): void;
  /** Put them back for the next batter. */
  resetWicket(): void;
  update(dt: number): void;
}

interface Bail {
  mesh: Mesh;
  home: Vector3;
  vel: Vector3;
  spin: number;
  flying: boolean;
}

export function createCricketGround(options: CricketGroundOptions = {}): CricketGround {
  const rng = new Rng(options.seed ?? 1);
  const boundary = options.boundary ?? 62;
  const group = new Group();
  group.name = 'cricket-ground';

  // --- The outfield. THE STRIPES ARE THE GROUND: a cricket field without
  // the mower's alternating bands reads as a green disc, and no amount of
  // correct geometry fixes that.
  const turf = createSurface('dirt', {
    seed: options.seed ?? 1,
    color: options.grass ?? 0x4f8a3c,
  });
  const cut = options.stripe ?? 7;
  const inner = turf.onBeforeCompile;
  const innerKey = turf.customProgramCacheKey;
  turf.onBeforeCompile = (shader, renderer) => {
    inner?.call(turf, shader, renderer);
    shader.uniforms.uCut = { value: cut };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTurf;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTurf = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTurf;\nuniform float uCut;'
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Mown bands, and the roller's sheen: a stripe is light because the
        // grass is lying away from you, so it brightens and it flattens.
        float band = floor(vTurf.z / uCut);
        float away = mod(band, 2.0) < 1.0 ? 1.0 : 0.0;
        diffuseColor.rgb *= mix(0.88, 1.12, away);`
      );
  };
  turf.customProgramCacheKey = () => `${innerKey ? innerKey.call(turf) : ''}|stripe`;

  const outfield = new Mesh(
    new CylinderGeometry(boundary + 6, boundary + 6, 0.1, 64),
    turf
  );
  outfield.name = 'outfield';
  outfield.position.y = -0.05;
  group.add(outfield);

  // The thirty-yard circle, painted the way a limited-overs ground paints it.
  const circle = new Mesh(
    new RingGeometry(27.2, 27.4, 72).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.95 })
  );
  circle.name = 'infield-circle';
  circle.position.y = 0.012;
  group.add(circle);

  // --- The rope: the line everything is measured against.
  const rope = new Mesh(
    new RingGeometry(boundary - 0.35, boundary, 64).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.9 })
  );
  rope.name = 'boundary';
  rope.position.y = 0.02;
  group.add(rope);

  // --- The strip. Worn, pale, and the only bare earth on the field.
  const pitch = new Mesh(
    new BoxGeometry(PITCH_WIDTH, 0.04, PITCH_LENGTH + 3),
    createSurface('sand', { seed: 7, color: 0xb9a179 })
  );
  pitch.name = 'pitch';
  pitch.position.y = 0.02;
  group.add(pitch);
  // The worn middle: where a season of bowlers has taken the grass off.
  const worn = new Mesh(
    new BoxGeometry(1.15, 0.005, PITCH_LENGTH - 3),
    new MeshStandardMaterial({ color: 0xa78f68, roughness: 1 })
  );
  worn.position.y = 0.041;
  group.add(worn);

  const paint = new MeshStandardMaterial({ color: 0xf6f4ec, roughness: 0.95 });
  const line = (w: number, l: number, x: number, z: number): void => {
    const m = new Mesh(new BoxGeometry(w, 0.01, l), paint);
    m.position.set(x, 0.045, z);
    group.add(m);
  };

  // --- Stumps, bails and creases at both ends.
  const bails: Bail[] = [];
  const stumpsBase: Record<number, Vector3> = {};
  const wood = createSurface('wood', { seed: 3, color: 0xe8dcc0 });
  for (const end of [-1, 1] as const) {
    const z = (end * PITCH_LENGTH) / 2;
    stumpsBase[end] = new Vector3(0, 0, z);
    const set = new Group();
    set.name = end === -1 ? 'stumps-striker' : 'stumps-bowler';
    for (let i = -1; i <= 1; i++) {
      const stump = new Mesh(
        new CylinderGeometry(0.018, 0.018, STUMP_HEIGHT, 7),
        wood
      );
      stump.position.set((i * STUMP_SPREAD) / 2, STUMP_HEIGHT / 2, z);
      set.add(stump);
    }
    for (const side of [-1, 1]) {
      const bail = new Mesh(new CylinderGeometry(0.011, 0.011, STUMP_SPREAD / 2 + 0.02, 6), wood);
      bail.rotation.z = Math.PI / 2;
      const home = new Vector3((side * STUMP_SPREAD) / 4, STUMP_HEIGHT + 0.012, z);
      bail.position.copy(home);
      set.add(bail);
      bails.push({
        mesh: bail,
        home,
        vel: new Vector3(),
        spin: 0,
        flying: false,
      });
    }
    group.add(set);
    // The popping crease in front, the bowling crease through the stumps,
    // and the return creases running back from both.
    line(PITCH_WIDTH, 0.05, 0, z - end * CREASE_FRONT);
    line(PITCH_WIDTH, 0.05, 0, z);
    for (const side of [-1, 1]) {
      line(0.05, 1.32, (side * 4 * 0.3048), z - end * 0.66);
    }
  }

  // A couple of seeded worn patches where bowlers land.
  for (const end of [-1, 1]) {
    const scuff = new Mesh(
      new BoxGeometry(0.5 + rng.next() * 0.3, 0.005, 0.7),
      new MeshStandardMaterial({ color: 0xb59a6d, roughness: 1 })
    );
    scuff.position.set(rng.range(-0.4, 0.4), 0.043, end * (PITCH_LENGTH / 2 - 2.6));
    group.add(scuff);
  }

  const striker = new Vector3(0, 0, -PITCH_LENGTH / 2 + CREASE_FRONT);
  const bowler = new Vector3(0, 0, PITCH_LENGTH / 2 - CREASE_FRONT);
  const world = new Vector3();

  return {
    object: group,
    obstacleRadius: 0,
    boundary,
    get strikerEnd() {
      return striker.clone().applyMatrix4(group.matrixWorld);
    },
    get bowlerEnd() {
      return bowler.clone().applyMatrix4(group.matrixWorld);
    },
    stumpsAt(end: -1 | 1): Vector3 {
      group.updateWorldMatrix(true, false);
      return world.copy(stumpsBase[end]).applyMatrix4(group.matrixWorld).clone();
    },
    isBoundary(x: number, z: number): boolean {
      group.updateWorldMatrix(true, false);
      const c = new Vector3(0, 0, 0).applyMatrix4(group.matrixWorld);
      return Math.hypot(x - c.x, z - c.z) >= boundary;
    },
    breakWicket(end: -1 | 1 = -1): void {
      // The bails fly. It is the only moment in cricket that announces
      // itself, and a wicket without it is a scoreboard update.
      const z = (end * PITCH_LENGTH) / 2;
      for (const bail of bails) {
        if (Math.abs(bail.home.z - z) > 0.01 || bail.flying) continue;
        bail.flying = true;
        bail.vel.set(rng.range(-1.4, 1.4), rng.range(2.2, 3.4), -end * rng.range(1.5, 3));
        bail.spin = rng.range(-12, 12);
      }
    },
    resetWicket(): void {
      for (const bail of bails) {
        bail.flying = false;
        bail.vel.set(0, 0, 0);
        bail.mesh.position.copy(bail.home);
        bail.mesh.rotation.set(0, 0, Math.PI / 2);
      }
    },
    update(dt: number): void {
      for (const bail of bails) {
        if (!bail.flying) continue;
        bail.vel.y -= 9.8 * dt;
        bail.mesh.position.addScaledVector(bail.vel, dt);
        bail.mesh.rotation.x += bail.spin * dt;
        if (bail.mesh.position.y <= 0.012) {
          bail.mesh.position.y = 0.012;
          bail.vel.multiplyScalar(0);
          bail.spin = 0;
          bail.flying = false;
        }
      }
    },
  };
}

export interface BatOptions {
  seed?: number;
  /** Blade length, metres. Default 0.58 (a full-size bat is ~0.85 overall). */
  blade?: number;
}

/** A bat: willow blade, shoulders, splice and a bound handle. */
export function createBat(options: BatOptions = {}): Prop {
  const blade = options.blade ?? 0.58;
  const group = new Group();
  group.name = 'bat';
  const willow = createSurface('wood', { seed: options.seed ?? 1, color: 0xe6d8b4 });
  const face = new Mesh(new BoxGeometry(0.108, blade, 0.042), willow);
  face.position.y = blade / 2;
  group.add(face);
  // The swell: a bat is thicker at the bottom, and it is why it drives.
  const swell = new Mesh(new BoxGeometry(0.104, blade * 0.42, 0.026), willow);
  swell.position.set(0, blade * 0.26, -0.03);
  group.add(swell);
  const handle = new Mesh(
    new CylinderGeometry(0.017, 0.019, 0.3, 8),
    new MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.95 })
  );
  handle.position.y = blade + 0.14;
  group.add(handle);
  for (let i = 0; i < 5; i++) {
    const grip = new Mesh(
      new CylinderGeometry(0.0192, 0.0192, 0.012, 8),
      new MeshStandardMaterial({ color: 0xc0392b, roughness: 0.9 })
    );
    grip.position.y = blade + 0.04 + i * 0.055;
    group.add(grip);
  }
  return { object: group, obstacleRadius: 0.12 };
}

export interface CricketBallProp extends Prop {
  /** The ball's own marker so a game can parent effects to it. */
  readonly marker: Object3D;
}

/** A cricket ball: 72 mm, red, with a proud stitched seam. */
export function createCricketBall(options: { seed?: number; color?: number } = {}): CricketBallProp {
  const group = new Group();
  group.name = 'cricket-ball';
  const r = 0.036;
  const leather = new MeshStandardMaterial({
    color: options.color ?? 0xa02020,
    roughness: 0.45,
    flatShading: true,
  });
  const body = new Mesh(new SphereGeometry(r, 12, 10), leather);
  group.add(body);
  // The seam: six stitches proud of the leather, on one great circle.
  const seam = new Mesh(
    new CylinderGeometry(r * 1.02, r * 1.02, 0.006, 16, 1, true),
    new MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.9 })
  );
  seam.rotation.x = Math.PI / 2;
  group.add(seam);
  const marker = new Object3D();
  group.add(marker);
  return { object: group, obstacleRadius: r, marker };
}
