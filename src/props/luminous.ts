import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RGBAFormat,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { FONT, MISSING, CAP } from '../text/font';
import type { Prop } from '../core/types';

/**
 * Luminous props — things that are lights, whether or not they get one.
 *
 * Every fixture here has three faces: a **body** (the mesh), a **glow**
 * (emissive bulb + additive halo sprite — always visible, costs nothing),
 * and a **claim** — the `{ anchor, color, intensity, radius, priority,
 * isLit }` it hands to a `LightBudget`, which may or may not grant it a
 * real PointLight. The claim's `isLit` closes over the fixture's own
 * state, so `setLit(false)` both darkens the prop *and* frees its slot in
 * the budget with no wiring.
 *
 * `setLit` is deliberately the same verb-shape a GAMA `linkMechanism`
 * boolean drives — a lever wired to a lamp is a lighting puzzle with no
 * imports between the libraries.
 */

export interface LuminousClaim {
  anchor: Object3D;
  color: number;
  intensity: number;
  radius: number;
  priority: number;
  isLit: () => boolean;
}

export interface Luminous extends Prop {
  readonly lit: boolean;
  setLit(on: boolean): void;
  /** Hand this to `createLightBudget().register(...)`. */
  claim: LuminousClaim;
  /** Fixtures with motion (twinkle, buzz, beam sweep) advance here. */
  update?(dt: number): void;
}

// ---------------------------------------------------------------------------
// The halo: one shared radial-gradient texture, built from bytes so it works
// headless and in node tests alike — no canvas, no DOM.

let haloMap: DataTexture | null = null;

function getHaloTexture(): DataTexture {
  if (haloMap) return haloMap;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(Math.sqrt(dx * dx + dy * dy) * 2, 1);
      const a = Math.pow(1 - r, 2.2);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  haloMap = new DataTexture(data, size, size, RGBAFormat);
  haloMap.needsUpdate = true;
  return haloMap;
}

/** An additive glow sprite — the light you can see from across the map. */
export function makeHalo(color: number, scale: number): Sprite {
  const sprite = new Sprite(
    new SpriteMaterial({
      map: getHaloTexture(),
      color,
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
    })
  );
  sprite.scale.setScalar(scale);
  return sprite;
}

interface GlowParts {
  bulbs: MeshStandardMaterial[];
  halos: Sprite[];
  baseEmissive: number[];
}

function makeLitness(parts: GlowParts): { lit: () => boolean; setLit: (on: boolean) => void } {
  let lit = true;
  return {
    lit: () => lit,
    setLit(on: boolean) {
      lit = on;
      parts.bulbs.forEach((m, i) => (m.emissiveIntensity = on ? parts.baseEmissive[i] : 0.04));
      for (const halo of parts.halos) halo.visible = on;
    },
  };
}

// ---------------------------------------------------------------------------
// Street light

export interface StreetLightOptions {
  style?: 'village' | 'modern';
  seed?: number;
  height?: number;
  palette?: Palette;
}

/**
 * A street light. `village` is a dark post with a lantern cage and a warm
 * mantle; `modern` is a slim pole whose arm cranes a cool flat head over
 * the road (light the +x side).
 */
export function createStreetLight(options: StreetLightOptions = {}): Luminous {
  const style = options.style ?? 'village';
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const group = new Group();
  group.name = `street-light-${style}`;
  const metal = new MeshStandardMaterial({
    color: style === 'village' ? 0x2c2f34 : 0x8b939c,
    flatShading: true,
    roughness: 0.6,
  });
  const glow = style === 'village' ? palette.lampGlow : 0xdfe8ff;
  const height = options.height ?? (style === 'village' ? rng.range(2.7, 3.1) : rng.range(4.2, 4.8));

  const bulbMat = new MeshStandardMaterial({
    color: glow,
    emissive: glow,
    emissiveIntensity: 1.8,
  });
  const anchor = new Object3D();
  let haloScale = 1.6;

  if (style === 'village') {
    const post = new Mesh(new CylinderGeometry(0.045, 0.075, height, 6), metal);
    post.position.y = height / 2;
    const cage = new Mesh(new BoxGeometry(0.3, 0.34, 0.3), metal);
    cage.position.y = height + 0.12;
    const roof = new Mesh(new ConeGeometry(0.26, 0.18, 4), metal);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = height + 0.36;
    const mantle = new Mesh(new SphereGeometry(0.09, 8, 6), bulbMat);
    mantle.position.y = height + 0.1;
    anchor.position.set(0, height + 0.05, 0);
    group.add(post, cage, roof, mantle);
  } else {
    const pole = new Mesh(new CylinderGeometry(0.055, 0.08, height, 8), metal);
    pole.position.y = height / 2;
    const arm = new Mesh(new BoxGeometry(1.3, 0.07, 0.09), metal);
    arm.position.set(0.6, height - 0.03, 0);
    const head = new Mesh(new BoxGeometry(0.62, 0.09, 0.2), metal);
    head.position.set(1.15, height - 0.08, 0);
    const panel = new Mesh(new BoxGeometry(0.54, 0.03, 0.14), bulbMat);
    panel.position.set(1.15, height - 0.13, 0);
    anchor.position.set(1.15, height - 0.35, 0);
    haloScale = 2.0;
    group.add(pole, arm, head, panel);
  }

  const halo = makeHalo(glow, haloScale);
  halo.position.copy(anchor.position);
  group.add(halo, anchor);

  const litness = makeLitness({ bulbs: [bulbMat], halos: [halo], baseEmissive: [1.8] });
  return {
    object: group,
    obstacleRadius: 0.25,
    get lit() {
      return litness.lit();
    },
    setLit: litness.setLit,
    claim: {
      anchor,
      color: glow,
      intensity: style === 'village' ? 5 : 7,
      radius: style === 'village' ? 10 : 14,
      priority: 1,
      isLit: litness.lit,
    },
  };
}

// ---------------------------------------------------------------------------
// Lantern

export interface LanternLightOptions {
  /** Hanging (hook at the origin, lantern below) or standing on its base. */
  hanging?: boolean;
  seed?: number;
  color?: number;
  palette?: Palette;
}

/** A small warm lantern — the light a hand, a porch or a market stall carries. */
export function createLanternLight(options: LanternLightOptions = {}): Luminous {
  const rng = new Rng(options.seed ?? 1);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const color = options.color ?? palette.lampGlow;
  const group = new Group();
  group.name = 'lantern';
  const metal = new MeshStandardMaterial({ color: 0x33373d, flatShading: true, roughness: 0.55 });

  const body = new Group();
  const cage = new Mesh(new BoxGeometry(0.16, 0.2, 0.16), metal);
  cage.position.y = 0.13;
  const cap = new Mesh(new ConeGeometry(0.13, 0.09, 4), metal);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = 0.27;
  const base = new Mesh(new BoxGeometry(0.14, 0.03, 0.14), metal);
  base.position.y = 0.015;
  const bulbMat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.9 });
  const flame = new Mesh(new SphereGeometry(0.05, 6, 5), bulbMat);
  flame.position.y = 0.13;
  flame.scale.y = rng.range(1.1, 1.35);
  const halo = makeHalo(color, 0.9);
  halo.position.y = 0.13;
  body.add(cage, cap, base, flame, halo);

  const anchor = new Object3D();
  if (options.hanging) {
    // Origin is the hook; the lantern swings just below it.
    body.position.y = -0.34;
    const loop = new Mesh(new CylinderGeometry(0.025, 0.025, 0.05, 6), metal);
    loop.position.y = -0.03;
    group.add(loop);
    anchor.position.set(0, -0.21, 0);
  } else {
    anchor.position.set(0, 0.13, 0);
  }
  group.add(body, anchor);

  const litness = makeLitness({ bulbs: [bulbMat], halos: [halo], baseEmissive: [1.9] });
  return {
    object: group,
    obstacleRadius: 0.1,
    get lit() {
      return litness.lit();
    },
    setLit: litness.setLit,
    claim: { anchor, color, intensity: 2.6, radius: 6, priority: 0.8, isLit: litness.lit },
  };
}

// ---------------------------------------------------------------------------
// Neon sign

export interface NeonSignOptions {
  color?: number;
  /** Cap height of the letters, metres. Default 0.5. */
  height?: number;
  seed?: number;
  /** Mount a dark backboard behind the tubes. Default true. */
  backboard?: boolean;
}

export interface NeonSign extends Luminous {
  /** Tube segments built — a legibility smoke signal for tests. */
  segments: number;
}

/**
 * A neon sign: the vector font's glyph strokes re-materialized as glowing
 * tube runs. One seeded letter *buzzes* — every real neon sign has one —
 * dipping and reigniting on its own nervous rhythm in `update(dt)`.
 * Authored facing +z with the origin at the sign's center.
 */
export function createNeonSign(text: string, options: NeonSignOptions = {}): NeonSign {
  const color = options.color ?? 0xff4fa3;
  const height = options.height ?? 0.5;
  const rng = new Rng(options.seed ?? 1);
  const scale = height / CAP;
  const tracking = 1.6;

  const group = new Group();
  group.name = `neon-${text}`;

  const steady = new MeshStandardMaterial({ color: 0x1a1216, emissive: color, emissiveIntensity: 2.3 });
  const buzzy = steady.clone();
  const glyphs = [...text.toUpperCase()].map((ch) => FONT[ch] ?? MISSING);
  const buzzIndex = glyphs.length > 1 ? rng.int(0, glyphs.length - 1) : -1;

  // Lay the tubes: a thin cylinder per stroke segment, a bead per joint.
  const tube = 0.028;
  const jointGeometry = new SphereGeometry(tube, 6, 5);
  const a = new Vector3();
  const b = new Vector3();
  let pen = 0;
  let segments = 0;
  glyphs.forEach((glyph, gi) => {
    const material = gi === buzzIndex ? buzzy : steady;
    for (const stroke of glyph.strokes) {
      for (let i = 0; i + 3 < stroke.length; i += 2) {
        a.set(pen + stroke[i] * scale, stroke[i + 1] * scale, 0);
        b.set(pen + stroke[i + 2] * scale, stroke[i + 3] * scale, 0);
        const length = a.distanceTo(b);
        if (length < 1e-5) continue;
        const segment = new Mesh(new CylinderGeometry(tube, tube, length, 6), material);
        segment.position.copy(a).add(b).multiplyScalar(0.5);
        segment.rotation.z = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
        group.add(segment);
        segments++;
        const joint = new Mesh(jointGeometry, material);
        joint.position.copy(b);
        group.add(joint);
      }
    }
    pen += (glyph.advance + tracking) * scale;
  });

  const width = Math.max(pen - tracking * scale, scale);
  // Center the run on the origin.
  for (const child of [...group.children]) child.position.x -= width / 2;

  if (options.backboard !== false) {
    const board = new Mesh(
      new BoxGeometry(width + height * 0.5, height * 1.7, 0.05),
      new MeshStandardMaterial({ color: 0x14171c, roughness: 0.85 })
    );
    board.position.set(0, height * 0.5, -0.05);
    group.add(board);
  }

  const halo = makeHalo(color, Math.max(width, height) * 1.15);
  halo.position.set(0, height * 0.5, 0.1);
  group.add(halo);

  const anchor = new Object3D();
  anchor.position.set(0, height * 0.5, 0.35);
  group.add(anchor);

  const litness = makeLitness({
    bulbs: [steady, buzzy],
    halos: [halo],
    baseEmissive: [2.3, 2.3],
  });
  let clock = rng.range(0, 10);
  return {
    object: group,
    obstacleRadius: 0,
    get lit() {
      return litness.lit();
    },
    setLit: litness.setLit,
    update(dt: number) {
      if (!litness.lit()) return;
      clock += Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      // The nervous rhythm: mostly on, occasional sputters, never periodic-looking.
      const w = Math.sin(clock * 7.3) * Math.sin(clock * 12.7) * Math.sin(clock * 0.83);
      buzzy.emissiveIntensity = w > 0.42 ? 0.25 : 2.3;
    },
    claim: {
      anchor,
      color,
      intensity: 2.2,
      radius: 6,
      priority: 1.2,
      isLit: litness.lit,
    },
    segments,
  };
}

// ---------------------------------------------------------------------------
// String lights

export interface StringLightsOptions {
  /** Horizontal span between the two hang points, metres. Default 6. */
  span?: number;
  /** How far the middle droops. Default 0.45. */
  sag?: number;
  count?: number;
  /** Bulb colors, cycled. Default a warm festival mix. */
  colors?: number[];
  seed?: number;
  /** Bulbs breathe brightness in update(dt). Default true. */
  twinkle?: boolean;
}

const FESTIVAL = [0xffd889, 0xff9d5c, 0x9dd1ff, 0xffe1f2, 0xb8ffc8];

/**
 * A sagging run of festival bulbs. Authored along local x, hang points at
 * (±span/2, 0, 0) — position and rotate the group to string it between
 * anything. Bulbs are one InstancedMesh with per-instance color; `update`
 * makes them breathe out of phase.
 */
export function createStringLights(options: StringLightsOptions = {}): Luminous {
  const span = options.span ?? 6;
  const sag = options.sag ?? 0.45;
  const count = Math.max(options.count ?? 11, 2);
  const colors = options.colors ?? FESTIVAL;
  const rng = new Rng(options.seed ?? 1);
  const twinkle = options.twinkle !== false;

  const group = new Group();
  group.name = 'string-lights';
  const droop = (u: number): number => -4 * sag * u * (1 - u);

  // The wire: short dark cylinders chasing the parabola.
  const wireMaterial = new MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.8 });
  const wireSegments = 16;
  const a = new Vector3();
  const b = new Vector3();
  for (let i = 0; i < wireSegments; i++) {
    const u0 = i / wireSegments;
    const u1 = (i + 1) / wireSegments;
    a.set((u0 - 0.5) * span, droop(u0), 0);
    b.set((u1 - 0.5) * span, droop(u1), 0);
    const length = a.distanceTo(b);
    const segment = new Mesh(new CylinderGeometry(0.008, 0.008, length, 4), wireMaterial);
    segment.position.copy(a).add(b).multiplyScalar(0.5);
    segment.rotation.z = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
    group.add(segment);
  }

  // The bulbs: basic material so they read as sources, not surfaces.
  const bulbs = new InstancedMesh(
    new SphereGeometry(0.05, 6, 5),
    new MeshBasicMaterial({ color: 0xffffff }),
    count
  );
  const dummy = new Object3D();
  const base: Color[] = [];
  const phase: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count;
    dummy.position.set((u - 0.5) * span, droop(u) - 0.07, 0);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
    const color = new Color(colors[i % colors.length]);
    base.push(color);
    phase.push(rng.range(0, Math.PI * 2));
    bulbs.setColorAt(i, color);
  }
  bulbs.instanceMatrix.needsUpdate = true;
  if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  group.add(bulbs);

  const halo = makeHalo(0xffd9a0, span * 0.45);
  halo.material.opacity = 0.22;
  halo.position.y = droop(0.5) - 0.05;
  group.add(halo);

  const anchor = new Object3D();
  anchor.position.set(0, droop(0.5) - 0.2, 0);
  group.add(anchor);

  let lit = true;
  const scratch = new Color();
  const paint = (time: number): void => {
    for (let i = 0; i < count; i++) {
      if (!lit) {
        scratch.setHex(0x15171a);
      } else {
        const breathe = twinkle ? 0.72 + 0.28 * Math.sin(time * 2.1 + phase[i]) : 1;
        scratch.copy(base[i]).multiplyScalar(breathe);
      }
      bulbs.setColorAt(i, scratch);
    }
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  };
  let clock = rng.range(0, 10);

  return {
    object: group,
    obstacleRadius: 0,
    get lit() {
      return lit;
    },
    setLit(on: boolean) {
      lit = on;
      halo.visible = on;
      paint(clock);
    },
    update(dt: number) {
      if (!lit || !twinkle) return;
      clock += Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      paint(clock);
    },
    claim: {
      anchor,
      color: 0xffd9a0,
      intensity: 1.8,
      radius: 7,
      priority: 0.7,
      isLit: () => lit,
    },
  };
}

// ---------------------------------------------------------------------------
// Beacon

export interface RevolvingBeaconOptions {
  /** Height of the head above the origin. Default 3.5. */
  height?: number;
  color?: number;
  /** Beam revolutions per second. Default 0.15. */
  speed?: number;
  seed?: number;
}

/**
 * A rotating beacon — the lighthouse move at any scale. Two opposed
 * additive beam cones sweep with the head; the volumetric look is just
 * geometry, no shader tricks. Feed `update(dt)` to turn it.
 */
export function createRevolvingBeacon(options: RevolvingBeaconOptions = {}): Luminous {
  const height = options.height ?? 3.5;
  const color = options.color ?? 0xfff2c8;
  const speed = (options.speed ?? 0.15) * Math.PI * 2;
  const group = new Group();
  group.name = 'beacon';

  const tower = new Mesh(
    new CylinderGeometry(0.32, 0.45, height, 8),
    new MeshStandardMaterial({ color: 0x9aa2ac, flatShading: true, roughness: 0.7 })
  );
  tower.position.y = height / 2;
  const cap = new Mesh(
    new ConeGeometry(0.4, 0.3, 8),
    new MeshStandardMaterial({ color: 0x3a3f46, flatShading: true })
  );
  cap.position.y = height + 0.42;
  group.add(tower, cap);

  const head = new Group();
  head.position.y = height + 0.18;
  const lensMat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4 });
  const lens = new Mesh(new SphereGeometry(0.16, 10, 8), lensMat);
  head.add(lens);
  const beamMaterial = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.16,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const beamLength = 7;
  for (const dir of [1, -1]) {
    const beam = new Mesh(new ConeGeometry(0.55, beamLength, 10, 1, true), beamMaterial);
    beam.rotation.z = (dir * Math.PI) / 2;
    beam.position.x = (dir * beamLength) / 2;
    head.add(beam);
  }
  const halo = makeHalo(color, 1.4);
  head.add(halo);
  group.add(head);

  const anchor = new Object3D();
  anchor.position.y = height + 0.18;
  group.add(anchor);

  const litness = makeLitness({ bulbs: [lensMat], halos: [halo], baseEmissive: [2.4] });
  const rng = new Rng(options.seed ?? 1);
  head.rotation.y = rng.range(0, Math.PI * 2);
  return {
    object: group,
    obstacleRadius: 0.5,
    get lit() {
      return litness.lit();
    },
    setLit(on: boolean) {
      litness.setLit(on);
      for (const child of head.children) {
        if ((child as Mesh).material === beamMaterial) child.visible = on;
      }
    },
    update(dt: number) {
      if (!litness.lit()) return;
      head.rotation.y += (Number.isFinite(dt) ? Math.max(dt, 0) : 0) * speed;
    },
    claim: { anchor, color, intensity: 3, radius: 15, priority: 1.4, isLit: litness.lit },
  };
}

// ---------------------------------------------------------------------------
// Photocell

export interface PhotocellOptions {
  seed?: number;
  /** Longest ignition straggle after dusk, seconds. Default 3. */
  spread?: number;
  /** Sun elevation where dusk trips. Default 0.04 (just above the horizon). */
  threshold?: number;
}

export interface Photocell {
  /** 'day' | 'night' — which side of dusk the cell believes it is. */
  readonly state: 'day' | 'night';
  /** Switch orders scheduled but not yet fired. */
  readonly pending: number;
  update(dt: number): void;
}

/**
 * The photocell — why streets ripple alight instead of blinking on as one.
 *
 * Watches anything with a `sunElevation` (a `DayCycle`, structurally) and
 * flips each fixture's `setLit` when dusk or dawn trips, each after its own
 * seeded delay within `spread`. The thresholds are hysteretic — dusk trips
 * a touch above the horizon, dawn well after — so a sun grazing the
 * threshold can't make the street flap.
 */
export function createPhotocell(
  sky: { sunElevation: number },
  fixtures: ReadonlyArray<{ setLit(on: boolean): void }>,
  options: PhotocellOptions = {}
): Photocell {
  const seed = options.seed ?? 1;
  const spread = Math.max(options.spread ?? 3, 0);
  const threshold = options.threshold ?? 0.04;

  let state: 'day' | 'night' = sky.sunElevation < threshold ? 'night' : 'day';
  let clock = 0;
  let transitions = 0;
  const pending: Array<{ at: number; on: boolean; fixture: { setLit(on: boolean): void } }> = [];

  const schedule = (on: boolean): void => {
    transitions++;
    const rng = new Rng(seed + transitions * 101);
    pending.length = 0;
    for (const fixture of fixtures) {
      pending.push({ at: clock + rng.range(0, spread), on, fixture });
    }
    pending.sort((a, b) => a.at - b.at);
  };
  // Apply the initial belief immediately, no straggle.
  for (const fixture of fixtures) fixture.setLit(state === 'night');

  return {
    get state() {
      return state;
    },
    get pending() {
      return pending.length;
    },
    update(dt: number) {
      clock += Number.isFinite(dt) ? Math.max(dt, 0) : 0;
      const elevation = sky.sunElevation;
      if (state === 'day' && elevation < threshold) {
        state = 'night';
        schedule(true);
      } else if (state === 'night' && elevation > threshold + 0.08) {
        state = 'day';
        schedule(false);
      }
      while (pending.length && pending[0].at <= clock) {
        const order = pending.shift()!;
        order.fixture.setLit(order.on);
      }
    },
  };
}
