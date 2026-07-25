import {
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { HeatField } from './heat';
import { addApproach, createSlot, type Prop, type PropSlot } from '../core/types';

/**
 * Smoke, and getting rid of it.
 *
 * This track exists because of one fact about the steam in `waterworks`:
 * it is drawn with **additive blending**, and its fragment shader writes
 * white. Additive can only ever *add* light. It is not that the steam is
 * the wrong colour for smoke — it is that no choice of colour or opacity in
 * an additive pass can produce something that makes the wall behind it
 * darker, and a plume that brightens what it covers is steam whatever you
 * call it. Smoke needs its own material, and that is the whole reason this
 * is a file rather than a parameter.
 *
 * The second thing smoke does that nothing else in the library does is
 * **stratify**. Heat is a field over a surface, cold is a field inside a
 * box, water is a depth — smoke is a **layer that fills a room from the
 * ceiling down**, so the reading depends on how high up you ask:
 *
 * ```ts
 * smokeAt(x, y, z): number   // 0–1, and y is the interesting argument
 * ```
 *
 * Thick at the ceiling long before it is anything at head height, which is
 * why extractors are mounted high, why you crawl, and why an alarm on the
 * ceiling goes off before anybody in the room notices.
 *
 * ```ts
 * const room = createSmokeLayer({ width: 5, depth: 4, height: 2.6 });
 * room.add(createSmoke({ style: 'grease' }));
 * room.vent(createExtractor({ era: 'hood' }));
 * game.onUpdate((t) => room.update(t.delta));
 * room.smokeAt(cook.x, 1.6, cook.z);   // can he still see?
 * ```
 */

export type SmokeStyle =
  /** Pale wood smoke, from a hearth. */
  | 'wood'
  /** Grey soot — a stove that needs its damper opening. */
  | 'soot'
  /** Near-black grease smoke. A pan that has caught. */
  | 'grease'
  /** Thin blue haze — something scorching, not yet burning. */
  | 'scorch';

/**
 * How thick the smoke is at a point, in **world** coordinates.
 *
 * The fourth spatial handshake, after `depthAt`, `heatAt` and `chillAt`, and
 * the first one where **y is the interesting argument**. The others are
 * about where you are standing; this one is about how tall you are.
 */
export interface SmokeField {
  /** 0 (clear) to 1 (solid) at a world point. 0 anywhere outside the room. */
  smokeAt(x: number, y: number, z: number): number;
}

export interface SmokeOptions {
  style?: SmokeStyle;
  /** How high the plume climbs before it joins the layer. Default 1.4. */
  height?: number;
  /** Radius at the base. Default 0.16. */
  radius?: number;
  /** Puffs. Default 18. */
  count?: number;
  /** m³ of smoke a second at full rate. Default per style. */
  output?: number;
  seed?: number;
}

export interface SmokeSource extends Prop {
  style: SmokeStyle;
  /** How hard it is smoking, 0–1. Eases toward the target. */
  readonly rate: number;
  setRate(rate: number): void;
  /** What it is putting into the room right now, m³/s. */
  readonly output: number;
  update(dt: number): void;
}

interface StyleSpec {
  colour: number;
  /** Peak opacity of a single puff. */
  opacity: number;
  output: number;
  /** How fast it climbs. */
  lift: number;
}

const STYLES: Record<SmokeStyle, StyleSpec> = {
  wood: { colour: 0x9a948c, opacity: 0.26, output: 0.35, lift: 1.0 },
  soot: { colour: 0x5c5854, opacity: 0.36, output: 0.6, lift: 0.85 },
  grease: { colour: 0x24211e, opacity: 0.5, output: 1.1, lift: 0.7 },
  scorch: { colour: 0x8f96a4, opacity: 0.17, output: 0.18, lift: 1.25 },
};

const SMOKE_VERT = /* glsl */ `
attribute float aPhase;
attribute float aSpeed;
attribute float aRad;
attribute float aAng;
uniform float uTime;
uniform float uHeight;
uniform float uRadius;
uniform float uSize;
varying float vLife;
void main() {
  float life = fract(uTime * aSpeed + aPhase);
  vLife = life;
  // Smoke accelerates AWAY from the source and then slows, unlike steam,
  // which drifts. The curl term is bigger too — it churns.
  float rise = pow(life, 0.72);
  // Grows, but not into a fog bank. The first version spread to nearly half
  // a metre and every plume read as a smudge on the wall rather than as
  // something rising off a pan.
  float rad = aRad * uRadius * (0.3 + rise * 1.45);
  float curl = life * 2.6 + aPhase * 6.283;
  vec3 p = vec3(cos(aAng + curl) * rad, rise * uHeight, sin(aAng + curl) * rad);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (1.0 + life * 2.6) * (240.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

/**
 * The fragment stage, and the point of the whole file.
 *
 * It writes the smoke's **own colour**, not white, and the material is
 * `NormalBlending` — so the puff composites toward that colour and the wall
 * behind it gets darker. Under `AdditiveBlending` this exact shader would
 * still brighten the wall, because additive adds; a black puff would simply
 * be invisible and a grey one would be a grey glow.
 */
const SMOKE_FRAG = /* glsl */ `
uniform float uDensity;
uniform vec3 uColour;
uniform float uOpacity;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  // Fades in fast and out slowly: smoke thins as it spreads rather than
  // stopping.
  float fade = min(1.0, vLife * 6.0) * (1.0 - vLife) * (1.0 - vLife);
  gl_FragColor = vec4(uColour, (1.0 - d * 2.0) * fade * uOpacity * uDensity);
}`;

/** A plume. */
export function createSmoke(options: SmokeOptions = {}): SmokeSource {
  const style = options.style ?? 'soot';
  const spec = STYLES[style];
  const rng = new Rng(options.seed ?? 1);
  const count = options.count ?? 18;
  const radius = options.radius ?? 0.16;
  const height = options.height ?? 1.4;
  const full = options.output ?? spec.output;

  const pos = new Float32Array(count * 3);
  const aPhase = new Float32Array(count);
  const aSpeed = new Float32Array(count);
  const aRad = new Float32Array(count);
  const aAng = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    aPhase[i] = rng.next();
    aSpeed[i] = rng.range(0.14, 0.3) * spec.lift;
    aRad[i] = rng.range(0.15, 1);
    aAng[i] = rng.range(0, Math.PI * 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('aPhase', new BufferAttribute(aPhase, 1));
  geometry.setAttribute('aSpeed', new BufferAttribute(aSpeed, 1));
  geometry.setAttribute('aRad', new BufferAttribute(aRad, 1));
  geometry.setAttribute('aAng', new BufferAttribute(aAng, 1));

  const uniforms = {
    uTime: { value: 0 },
    uHeight: { value: height },
    uRadius: { value: radius },
    uSize: { value: 1.5 },
    uDensity: { value: 0 },
    uColour: { value: new Color(spec.colour) },
    uOpacity: { value: spec.opacity },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    transparent: true,
    depthWrite: false,
    // NOT AdditiveBlending. See the note on the fragment shader — this one
    // line is the difference between smoke and steam.
    blending: NormalBlending,
  });
  const mesh = new Points(geometry, material);
  mesh.frustumCulled = false;

  const group = new Group();
  group.name = `smoke-${style}`;
  group.add(mesh);

  let rate = 0;
  let target = 0;

  const api: SmokeSource = {
    object: group,
    obstacleRadius: 0,
    style,
    get rate() {
      return rate;
    },
    get output() {
      return full * rate;
    },
    setRate(v: number) {
      target = Math.max(0, Math.min(1, v));
    },
    update(dt: number) {
      if (dt <= 0) return;
      // Builds fast and dies slowly. A fire that stops smoking the instant
      // you close the damper is a switch.
      const speed = target > rate ? 1.4 : 0.35;
      rate += (target - rate) * Math.min(1, dt * speed);
      uniforms.uTime.value += dt;
      uniforms.uDensity.value = rate;
      group.visible = rate > 0.004;
    },
  };
  return api;
}

// ------------------------------------------------------------- extraction

export type ExtractorEra =
  /** A hole in the roof with a louvre over it. Only helps what is under it. */
  | 'hole'
  /** A masonry flue. Its draw depends on how hot the fire below it is. */
  | 'chimney'
  /** A canopy hood with a fan, over a hob. Its filter clogs. */
  | 'hood'
  /** A slot that rises out of the worktop and pulls sideways. */
  | 'downdraft';

/** The fan — structurally a `Manipulable`, like every switch in the library. */
export interface ExtractorFan {
  readonly state: number;
  readonly open: boolean;
  toggle(): boolean;
  set(target: number | boolean): void;
  update(dt: number): void;
  onChange?: (open: boolean) => void;
  object: Object3D;
}

export interface Extractor extends Prop {
  era: ExtractorEra;
  /**
   * The opening — where it actually catches, and what you stand the pan
   * under.
   *
   * Published for the same reason the stove publishes `zones` and the prep
   * bench publishes `work`: the prop's origin is on its front face, and a
   * caller measuring from there is measuring from the one point beneath a
   * canopy that a fire never is. Nobody should have to guess.
   */
  mouth: Object3D;
  /**
   * How much of a plume at a world point it intercepts **before the smoke
   * ever reaches the room**, 0–1.
   *
   * The half of extraction that matters. A hood over the hob catches the pan
   * that has caught fire; the same hood does nothing at all about a pan on
   * the other side of the kitchen, however hard the fan runs.
   */
  catches(x: number, z: number): number;
  /** What it clears from the room's standing layer, m³/s, right now. */
  readonly draw: number;
  /** Demand, 0–1. Fixed at 1 on the eras with no controls. */
  readonly power: number;
  setPower(level: number | boolean): void;
  fan: ExtractorFan | null;
  /** Grease in the filter, 0 (clean) to 1 (blocked). It chokes the draw. */
  readonly clogged: number;
  clean(): void;
  slot: PropSlot;
  /**
   * Advance it. Pass the heat below it: a **cold flue does not draw**, which
   * is why a fire smokes into the room when you first light it.
   */
  update(dt: number, heat?: HeatField | number): void;
}

interface EraSpec {
  /** Peak share of a plume caught, directly underneath. */
  capture: number;
  /** How far that reaches, in metres. */
  reach: number;
  /** m³/s cleared from the standing layer at full power. */
  draw: number;
  /** Does its performance depend on the fire being hot? */
  thermal: boolean;
  hasFan: boolean;
  /** Filter blocking per second while running. */
  clogRate: number;
  width: number;
  depth: number;
  /** Height of the mouth above the floor. */
  mouth: number;
}

/**
 * The era table.
 *
 * `reach` is the column that decides everything. A smoke hole has a huge
 * capture directly beneath it and a reach of half a metre, so a medieval
 * hall is smoky **everywhere except under the hole** — you do not move the
 * hole, you move the fire. A hood has a smaller peak and four times the
 * reach, which is what a kitchen you can stand in actually needs.
 */
const ERAS: Record<ExtractorEra, EraSpec> = {
  hole: {
    capture: 0.55, reach: 0.55, draw: 0.015, thermal: true, hasFan: false,
    clogRate: 0, width: 0.9, depth: 0.9, mouth: 2.6,
  },
  chimney: {
    capture: 0.88, reach: 0.75, draw: 0.05, thermal: true, hasFan: false,
    clogRate: 0, width: 1.3, depth: 0.8, mouth: 1.55,
  },
  hood: {
    capture: 0.82, reach: 1.05, draw: 0.18, thermal: false, hasFan: true,
    clogRate: 0.004, width: 0.9, depth: 0.52, mouth: 1.5,
  },
  downdraft: {
    capture: 0.9, reach: 0.42, draw: 0.12, thermal: false, hasFan: true,
    clogRate: 0.006, width: 0.78, depth: 0.1, mouth: 1.05,
  },
};

/**
 * A note on the `draw` column, which was wrong by a factor of five.
 *
 * The first table gave a hood 0.9 m³/s of room-scavenging — more than a
 * smoking pan produces — so the extractor cleared the room no matter where
 * the pan was standing, and the entire distinction the track is built on
 * quietly stopped existing. Every test about capture still passed, because
 * they tested `catches` directly.
 *
 * Scavenging a standing layer through one small opening is SLOW. Catching a
 * plume that is rising straight into that opening is fast. Keeping the
 * second number much larger than the first is the only reason it matters
 * that the hood is over the hob.
 */

export interface ExtractorOptions {
  era?: ExtractorEra;
  seed?: number;
  palette?: Palette;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (t: number): number => t * t * (3 - 2 * t);

function makeFan(blades: Group, speed = 2.5): ExtractorFan {
  let target = 0;
  let state = 0;
  const api: ExtractorFan = {
    object: blades,
    get state() {
      return state;
    },
    get open() {
      return target > 0.5;
    },
    toggle() {
      const next = !(target > 0.5);
      api.set(next);
      return next;
    },
    set(value: number | boolean) {
      const was = target > 0.5;
      target = typeof value === 'boolean' ? (value ? 1 : 0) : clamp01(value);
      if (was !== target > 0.5) api.onChange?.(target > 0.5);
    },
    update(dt: number) {
      state += (target - state) * Math.min(1, dt * speed);
      // A fan you cannot see turning is a fan that is off. Blades that
      // spin about their own axis are invisible on a symmetric disc, so
      // there is an odd number of them and one is marked.
      blades.rotation.y += dt * state * 22;
    },
  };
  return api;
}

/** A smoke hole, flue, hood or downdraft vent. */
export function createExtractor(options: ExtractorOptions = {}): Extractor {
  const era = options.era ?? 'hood';
  const spec = ERAS[era];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  void rng;
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = `extract-${era}`;

  const W = spec.width;
  const D = spec.depth;
  const M = spec.mouth;

  const shell =
    era === 'hole'
      ? createSurface('plank', { seed, color: palette.woodDark })
      : era === 'chimney'
        ? createSurface('plaster', { seed, color: 0xd8d0c0 })
        : createSurface('steel', { seed, metalness: 0.42, roughness: 0.34 });
  const dark = new MeshStandardMaterial({ color: 0x33383c, roughness: 0.6, metalness: 0.4 });

  let fan: ExtractorFan | null = null;
  let filterMat: MeshStandardMaterial | null = null;

  if (era === 'hole') {
    // A louvred lantern over an opening: four posts and a little cap, with
    // the opening left OPEN. A solid cap over a solid ceiling is a box.
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as Array<[number, number]>) {
      const post = new Mesh(new BoxGeometry(0.06, 0.42, 0.06), shell);
      post.position.set((sx * W) / 2, M + 0.21, -D / 2 + (sz * D) / 2);
      group.add(post);
    }
    for (const s of [-1, 1]) {
      const slope = new Mesh(new BoxGeometry(W + 0.24, 0.05, D * 0.72), shell);
      slope.position.set(0, M + 0.5, -D / 2 + s * D * 0.3);
      slope.rotation.x = s * 0.42;
      group.add(slope);
    }
    const kerb = new Mesh(new BoxGeometry(W + 0.1, 0.05, D + 0.1), shell);
    kerb.position.set(0, M, -D / 2);
    group.add(kerb);
  } else if (era === 'chimney') {
    // A tapering canopy over a hearth. Walls, not a wedge — you stand under
    // it and look up the flue.
    for (const s of [-1, 1]) {
      const cheek = new Mesh(new BoxGeometry(0.06, 0.65, D), shell);
      cheek.position.set((s * W) / 2, M + 0.32, -D / 2);
      cheek.rotation.z = -s * 0.34;
      group.add(cheek);
    }
    const hoodBack = new Mesh(new BoxGeometry(W, 0.7, 0.06), shell);
    hoodBack.position.set(0, M + 0.35, -D + 0.03);
    group.add(hoodBack);
    const front = new Mesh(new BoxGeometry(W * 0.98, 0.68, 0.05), shell);
    front.position.set(0, M + 0.34, 0);
    front.rotation.x = -0.3;
    group.add(front);
    const flue = new Mesh(new CylinderGeometry(0.22, 0.3, 1.0, 8, 1, true), shell);
    flue.material.side = DoubleSide;
    flue.position.set(0, M + 1.15, -D / 2);
    group.add(flue);
    const lintel = new Mesh(new BoxGeometry(W + 0.14, 0.12, D + 0.08), shell);
    lintel.position.set(0, M - 0.05, -D / 2);
    group.add(lintel);
  } else if (era === 'hood') {
    const canopy = new Mesh(new BoxGeometry(W, 0.12, D), shell);
    canopy.position.set(0, M + 0.06, -D / 2);
    group.add(canopy);
    for (const s of [-1, 1]) {
      const skirt = new Mesh(new BoxGeometry(0.03, 0.16, D), shell);
      skirt.position.set((s * W) / 2, M - 0.05, -D / 2);
      skirt.rotation.z = s * 0.22;
      group.add(skirt);
    }
    const chase = new Mesh(new BoxGeometry(W * 0.32, 0.65, D * 0.5), shell);
    chase.position.set(0, M + 0.45, -D * 0.7);
    group.add(chase);
    // The filter, and its colour IS the clog reading — nothing else about a
    // blocked extractor is visible at all.
    filterMat = new MeshStandardMaterial({ color: 0xc4cad0, roughness: 0.5, metalness: 0.5 });
    const filter = new Mesh(new BoxGeometry(W * 0.82, 0.014, D * 0.72), filterMat);
    filter.position.set(0, M - 0.005, -D / 2);
    group.add(filter);
    const blades = new Group();
    blades.position.set(0, M + 0.09, -D / 2);
    group.add(blades);
    for (let i = 0; i < 5; i++) {
      const blade = new Mesh(new BoxGeometry(0.16, 0.006, 0.05), dark);
      blade.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.09, 0, Math.sin((i / 5) * Math.PI * 2) * 0.09);
      blade.rotation.y = (i / 5) * Math.PI * 2;
      blade.rotation.z = 0.35;
      if (i === 0) blade.material = new MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.6 });
      blades.add(blade);
    }
    fan = makeFan(blades);
  } else {
    // A slot that RISES out of the worktop. It is a Manipulable and its
    // whole read is that it is up.
    const riser = new Group();
    riser.position.set(0, M - 0.06, -D / 2);
    group.add(riser);
    const panel = new Mesh(new BoxGeometry(W, 0.42, 0.05), shell);
    panel.position.y = 0.21;
    riser.add(panel);
    filterMat = new MeshStandardMaterial({ color: 0xb8bfc6, roughness: 0.5, metalness: 0.55 });
    const grille = new Mesh(new BoxGeometry(W * 0.86, 0.3, 0.012), filterMat);
    grille.position.set(0, 0.21, 0.032);
    riser.add(grille);
    const slot = new Mesh(new BoxGeometry(W + 0.05, 0.05, D + 0.06), dark);
    slot.position.set(0, M - 0.06, -D / 2);
    group.add(slot);
    let state = 0;
    let target = 0;
    const api: ExtractorFan = {
      object: riser,
      get state() {
        return state;
      },
      get open() {
        return target > 0.5;
      },
      toggle() {
        const next = !(target > 0.5);
        api.set(next);
        return next;
      },
      set(value: number | boolean) {
        const was = target > 0.5;
        target = typeof value === 'boolean' ? (value ? 1 : 0) : clamp01(value);
        if (was !== target > 0.5) api.onChange?.(target > 0.5);
      },
      update(dt: number) {
        state += (target - state) * Math.min(1, dt * 2.2);
        riser.position.y = M - 0.06 + smooth(state) * 0.4;
        riser.visible = state > 0.01;
      },
    };
    fan = api;
  }

  const mouth = new Object3D();
  mouth.name = 'mouth';
  mouth.position.set(0, M, -D / 2);
  group.add(mouth);

  const standAt = createSlot('vent', 'work', group, 0, 0, 0.6, Math.PI);
  addApproach(standAt, group, 0.5, 'behind');

  // ---- state -------------------------------------------------------------
  let power = spec.hasFan ? 0 : 1;
  let clogged = 0;
  let heatNow = 1;
  const probe = new Vector3();
  const world = new Vector3();

  /**
   * How well it is working right now, 0–1.
   *
   * Three multiplied terms, and each one is a different way for an
   * extractor to be useless: switched off, blocked, or — on the eras with
   * no fan — attached to a fire that has not got going yet.
   */
  const efficiency = (): number => {
    const running = spec.hasFan ? (fan ? Math.max(power, fan.state) : power) : 1;
    const flow = 1 - clogged * 0.85;
    const lift = spec.thermal ? 0.22 + heatNow * 0.78 : 1;
    return clamp01(running * flow * lift);
  };

  const api: Extractor = {
    object: group,
    // You stand under a hood and a smoke hole; a chimney breast is masonry.
    obstacleRadius: era === 'chimney' ? W * 0.4 : 0,
    era,
    fan,
    mouth,
    slot: standAt,
    slots: [standAt],
    get power() {
      return spec.hasFan ? power : 1;
    },
    get clogged() {
      return clogged;
    },
    get draw() {
      return spec.draw * efficiency();
    },
    setPower(level: number | boolean) {
      const v = typeof level === 'boolean' ? (level ? 1 : 0) : clamp01(level);
      // A no-op where there is nothing to switch, and that IS the era axis:
      // the same call runs a hood and does nothing to a hole in the roof.
      if (!spec.hasFan) return;
      power = v;
      fan?.set(v);
    },
    clean() {
      clogged = 0;
    },
    catches(x: number, z: number) {
      group.updateWorldMatrix(true, false);
      world.set(0, 0, -D / 2);
      group.localToWorld(world);
      const d = Math.hypot(world.x - x, world.z - z);
      if (d > spec.reach) return 0;
      // Falls off toward the edge rather than stopping at it, so moving the
      // pan under the hood actually does something.
      return spec.capture * (1 - (d / spec.reach) ** 2) * efficiency();
    },
    update(dt: number, heat?: HeatField | number) {
      if (dt <= 0) return;
      fan?.update(dt);
      if (typeof heat === 'number') heatNow = clamp01(heat);
      else if (heat) {
        // Under the MOUTH, not at the origin. The origin is on the front
        // face, which is the one place beneath a canopy that a fire never
        // is — sampling there reads 0 for a hearth roaring half a metre
        // behind it, and the flue never learns the fire is lit.
        group.updateWorldMatrix(true, false);
        probe.set(0, 0, -D / 2);
        group.localToWorld(probe);
        heatNow = clamp01(heat.heatAt(probe.x, probe.z));
      } else if (spec.thermal) {
        // Nothing told us about the fire. Assume there is one — a flue with
        // no `heat` argument should work, not silently stop drawing.
        heatNow = 1;
      }
      if (spec.clogRate > 0) {
        clogged = clamp01(clogged + dt * spec.clogRate * (spec.hasFan ? Math.max(power, 0.1) : 1));
      }
      if (filterMat) {
        // Clean steel through to black grease.
        const t = clogged;
        filterMat.color.setRGB(0.77 - t * 0.62, 0.79 - t * 0.66, 0.82 - t * 0.7);
        filterMat.roughness = 0.5 + t * 0.45;
        filterMat.metalness = 0.5 - t * 0.42;
      }
    },
  };
  return api;
}

// ------------------------------------------------------------- the layer

export interface SmokeLayerOptions {
  /** Room footprint, metres. */
  width?: number;
  depth?: number;
  /** Floor to ceiling. Default 2.6. */
  height?: number;
  /**
   * How thick the layer has to get at `alarmY` before the alarm sounds.
   * Default 0.35. 0 disables it.
   */
  alarmAt?: number;
  /** Where the alarm is listening, metres above the floor. Default 2.3. */
  alarmY?: number;
  /** How fast it leaks out through doors and gaps, per second. Default 0.02. */
  leak?: number;
  seed?: number;
  palette?: Palette;
}

export interface SmokeLayer extends Prop, SmokeField {
  /** How much is in the room, 0 (clear) to 1 (solid). */
  readonly level: number;
  /** How far the layer has come DOWN from the ceiling, in metres. */
  readonly descent: number;
  /** World Y of the underside of the layer. Everything above it is in it. */
  readonly baseY: number;
  /** Sources feeding it. */
  add(source: SmokeSource): void;
  /** Extractors fighting it. */
  vent(extractor: Extractor): void;
  /** Clear the room — throw the windows open. */
  clear(): void;
  smokeAt(x: number, y: number, z: number): number;
  /** Fires once when it gets thick at `alarmY`; re-arms once it clears. */
  onAlarm?: (sounding: boolean) => void;
  update(dt: number): void;
}

/**
 * The room's standing smoke.
 *
 * A source puts smoke in, an extractor takes it out, and this is the thing
 * they argue over. The origin is on the floor at the centre of the
 * footprint — a room, not a prop, so it is placed like a rug.
 */
export function createSmokeLayer(options: SmokeLayerOptions = {}): SmokeLayer {
  const W = options.width ?? 5;
  const D = options.depth ?? 4;
  const H = options.height ?? 2.6;
  const alarmAt = options.alarmAt ?? 0.35;
  const alarmY = options.alarmY ?? 2.3;
  const leak = options.leak ?? 0.02;

  const group = new Group();
  group.name = 'smoke-layer';

  /**
   * The visible layer: ONE box with a vertical alpha gradient, scaled to
   * span from the ceiling down to the underside.
   *
   * The first version was a stack of seven thin sheets, on the theory that
   * lower ones fading in later would give the underside a soft edge. Viewed
   * from across the room it was seven hard edges instead of one — a set of
   * horizontal stripes, which is the shelf problem seven times over rather
   * than a fix for it. A gradient in the shader is one draw call and has no
   * edges to be hard.
   */
  const layerMat = new MeshStandardMaterial({
    color: 0x3c3a37,
    roughness: 1,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });
  layerMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSmokeY;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vSmokeY = position.y + 0.5;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSmokeY;')
      .replace(
        '#include <dithering_fragment>',
        // Solid at the ceiling, gone at the underside. Squared, so the last
        // stretch fades out rather than stopping.
        '#include <dithering_fragment>\n  float sm = smoothstep(0.0, 0.5, vSmokeY);\n  gl_FragColor.a *= sm * sm;'
      );
  };
  layerMat.customProgramCacheKey = () => 'scenaSmokeLayer';
  const slab = new Mesh(new BoxGeometry(W * 0.995, 1, D * 0.995), layerMat);
  slab.renderOrder = 3;
  slab.visible = false;
  group.add(slab);

  const sources: SmokeSource[] = [];
  const vents: Extractor[] = [];
  let smoke = 0;
  let sounding = false;
  const local = new Vector3();

  const volume = W * D * H;

  const api: SmokeLayer = {
    object: group,
    obstacleRadius: 0,
    add(source: SmokeSource) {
      sources.push(source);
    },
    vent(extractor: Extractor) {
      vents.push(extractor);
    },
    clear() {
      smoke = 0;
    },
    get level() {
      return clamp01(smoke / volume);
    },
    get descent() {
      // Descends FIRST and thickens after. A layer whose thickness and
      // density are the same number can only ever be one reading, and the
      // whole point of smoke is that it reaches your head before it fills
      // the room.
      return Math.min(H, clamp01((smoke / volume) * 1.6) * H);
    },
    get baseY() {
      return group.position.y + H - api.descent;
    },
    smokeAt(x: number, y: number, z: number) {
      if (smoke <= 0) return 0;
      group.updateWorldMatrix(true, false);
      local.set(x, y, z);
      group.worldToLocal(local);
      if (Math.abs(local.x) > W / 2 || Math.abs(local.z) > D / 2) return 0;
      if (local.y > H + 0.2 || local.y < -0.1) return 0;
      const base = H - api.descent;
      const strength = clamp01(smoke / volume);
      if (local.y >= base) {
        // Inside the layer: densest at the ceiling, softening toward the
        // underside so there is no hard line to walk through.
        const up = api.descent <= 1e-4 ? 1 : clamp01((local.y - base) / Math.max(0.25, api.descent));
        return strength * (0.35 + 0.65 * up);
      }
      // Below it. Real smoke is not perfectly stratified — a little hangs
      // about, and more of it the fuller the room is.
      return strength * strength * 0.18;
    },
    update(dt: number) {
      if (dt <= 0) return;

      for (const source of sources) {
        source.update(dt);
        if (source.output <= 0) continue;
        source.object.updateWorldMatrix(true, false);
        const at = source.object.getWorldPosition(new Vector3());
        // How much of THIS plume is caught before it ever reaches the room.
        // Several extractors do not stack past 1 — two hoods over one pan
        // cannot catch 160% of it.
        let caught = 0;
        for (const vent of vents) caught = Math.max(caught, vent.catches(at.x, at.z));
        smoke += source.output * (1 - clamp01(caught)) * dt;
      }

      // …and what the extractors scavenge from the standing layer, which is
      // a different job from catching a plume and is why they are two
      // numbers. A hood clears a smoky room slowly; it catches the pan
      // under it almost completely.
      let pulled = 0;
      for (const vent of vents) pulled += vent.draw;
      smoke = Math.max(0, smoke - pulled * dt - smoke * leak * dt);

      // ---- reads --------------------------------------------------------
      const descent = api.descent;
      const strength = clamp01(smoke / volume);
      const thickness = Math.max(0.02, descent);
      slab.scale.set(1, thickness, 1);
      slab.position.set(0, H - thickness / 2, 0);
      layerMat.opacity = Math.min(0.72, strength * 1.15);
      slab.visible = layerMat.opacity > 0.005;

      if (alarmAt > 0) {
        const head = api.smokeAt(group.position.x, group.position.y + alarmY, group.position.z);
        if (!sounding && head > alarmAt) {
          sounding = true;
          api.onAlarm?.(true);
        } else if (sounding && head < alarmAt * 0.6) {
          sounding = false;
          api.onAlarm?.(false);
        }
      }
    },
  };
  return api;
}

export const SMOKE_STYLES: SmokeStyle[] = ['wood', 'soot', 'grease', 'scorch'];
export const EXTRACTOR_ERAS: ExtractorEra[] = ['hole', 'chimney', 'hood', 'downdraft'];
