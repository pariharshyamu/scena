import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { drive, finish, makeBurst, workSlot, type WorkStation } from './workstations';

/**
 * Preparation: the two-handed half of a kitchen.
 *
 * Every work loop the trilogy has so far is **one-handed or symmetric** — an
 * axe, a pick, a saw, a spoon. Preparing food is neither. One hand does the
 * work and the other **steadies it and gets out of the way**, and that
 * asymmetry is the entire read: a cook chopping an onion with two identical
 * hands is a cook hammering an onion.
 *
 * So a prep station publishes two anchors rather than one:
 *
 * ```ts
 * station.work   // where the knife, pestle or handle is
 * station.guide  // where the other hand holds the thing steady
 * ```
 *
 * ANIMA's `Prepping` poses to that pair. It is the same division of labour
 * as `heatAt` and `depthAt`: SCENA says where things are, ANIMA decides what
 * a body does about it.
 *
 * ```ts
 * const board = createPrepStation({ kind: 'board' });
 * board.onYield = (n) => console.log('chopped', n);
 * game.onUpdate((t) => board.update(t.delta, cook.working));
 * ```
 */

export type PrepKind =
  /** A chopping board with a knife and something to cut. */
  | 'board'
  /** A mortar and pestle: one hand braces the bowl, the other grinds. */
  | 'mortar'
  /** A hand quern — two stones and a crank. Turning it must be visible. */
  | 'quern'
  /** A dough trough: both hands push, out of phase. */
  | 'trough'
  /** A mixing bowl held at an angle while the other hand whisks. */
  | 'bowl';

/**
 * A station a cook works at with **both hands doing different things**.
 *
 * `work` and `guide` are the pair. Everything else is the `WorkStation`
 * contract from the rhythmic-work track, so these drop into the same
 * machinery, the same slots and the same yield loop.
 */
export interface PrepStation extends WorkStation {
  kind: PrepKind;
  /** Where the working hand is — knife, pestle, crank handle. */
  work: Object3D;
  /** Where the steadying hand is — on the food, the rim, the bowl. */
  guide: Object3D;
  /** How much is left to prepare, 1 → 0. Refill with `load`. */
  readonly remaining: number;
  /** Put more on the board. */
  load(amount?: number): void;
}

export interface PrepOptions {
  kind?: PrepKind;
  /** How many cycles a full load takes. Default 8. */
  batch?: number;
  seed?: number;
  palette?: Palette;
}

interface KindSpec {
  /** The ANIMA loop name a worker plays here. */
  action: string;
  /** Seconds per cycle. */
  cycle: number;
  /** Where in the cycle the thing actually happens. */
  impact: number;
  /** Working surface height. */
  bench: number;
}

const KINDS: Record<PrepKind, KindSpec> = {
  board: { action: 'chopBoard', cycle: 0.55, impact: 0.55, bench: 0.92 },
  mortar: { action: 'grind', cycle: 1.1, impact: 0.5, bench: 0.92 },
  quern: { action: 'crank', cycle: 1.6, impact: 0.9, bench: 0.78 },
  trough: { action: 'knead', cycle: 1.5, impact: 0.6, bench: 0.86 },
  bowl: { action: 'whisk', cycle: 0.8, impact: 0.9, bench: 0.92 },
};

/** A bench, board, mortar, quern or trough — somewhere to prepare food. */
export function createPrepStation(options: PrepOptions = {}): PrepStation {
  const kind = options.kind ?? 'board';
  const spec = KINDS[kind];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const batch = options.batch ?? 8;

  const group = new Group();
  group.name = `prep-${kind}`;
  const wood = createSurface('wood', { color: palette.wood, seed });
  const dark = createSurface('wood', { color: palette.woodDark, seed: seed + 1 });
  const stone = createSurface('granite', { color: 0x8d8b86, seed: seed + 2 });
  const steel = new MeshStandardMaterial({ color: 0xc6ccd2, roughness: 0.25, metalness: 0.8 });

  // A bench for everything except the quern, which stands on its own legs.
  if (kind !== 'quern') {
    const top = new Mesh(new BoxGeometry(1.1, 0.06, 0.62), wood);
    top.position.y = spec.bench - 0.03;
    group.add(top);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new Mesh(new BoxGeometry(0.07, spec.bench - 0.06, 0.07), dark);
        leg.position.set(sx * 0.48, (spec.bench - 0.06) / 2, sz * 0.24);
        group.add(leg);
      }
    }
  }

  const work = new Object3D();
  work.name = 'prep:work';
  const guide = new Object3D();
  guide.name = 'prep:guide';
  group.add(work, guide);

  /** Whatever moves once per cycle — the knife, the pestle, the crank. */
  let mover: Object3D | null = null;
  let tool: Object3D = new Group();
  const bursts = [];

  if (kind === 'board') {
    const board = new Mesh(new BoxGeometry(0.42, 0.022, 0.3), dark);
    board.position.set(0.05, spec.bench + 0.011, 0.02);
    group.add(board);
    // Something to cut, in a row, so the guide hand has a reason to retreat.
    for (let i = 0; i < 5; i++) {
      const piece = new Mesh(
        new CylinderGeometry(0.028, 0.028, 0.02, 8),
        new MeshStandardMaterial({ color: 0xe4d9a8, roughness: 0.75, flatShading: true })
      );
      piece.rotation.x = Math.PI / 2;
      piece.position.set(-0.09 + i * 0.035, spec.bench + 0.032, 0.02);
      group.add(piece);
    }
    const knife = new Group();
    const blade = new Mesh(new BoxGeometry(0.18, 0.005, 0.045), steel);
    blade.position.set(0.09, 0, 0);
    const grip = new Mesh(new CylinderGeometry(0.012, 0.014, 0.09, 6), dark);
    grip.rotation.z = Math.PI / 2;
    knife.add(blade, grip);
    knife.position.set(0.06, spec.bench + 0.05, 0.02);
    group.add(knife);
    mover = knife;
    tool = knife;
    work.position.set(0.06, spec.bench + 0.06, 0.02);
    guide.position.set(-0.13, spec.bench + 0.05, 0.02);
  } else if (kind === 'mortar') {
    const bowl = new Mesh(new CylinderGeometry(0.11, 0.075, 0.1, 14), stone);
    bowl.position.set(0, spec.bench + 0.05, 0);
    group.add(bowl);
    const hollow = new Mesh(
      new CylinderGeometry(0.085, 0.05, 0.07, 14, 1, true),
      stone
    );
    hollow.material.side = 2; // seen from inside
    hollow.position.set(0, spec.bench + 0.07, 0);
    group.add(hollow);
    const pestle = new Group();
    const shaft = new Mesh(new CylinderGeometry(0.017, 0.026, 0.13, 8), stone);
    const head = new Mesh(new SphereGeometry(0.028, 8, 6), stone);
    head.position.y = -0.065;
    pestle.add(shaft, head);
    pestle.position.set(0.01, spec.bench + 0.14, 0);
    group.add(pestle);
    mover = pestle;
    tool = pestle;
    work.position.set(0.01, spec.bench + 0.18, 0);
    // The bracing hand is on the RIM, and it barely moves. That stillness is
    // the read: a mortar that is not being held down slides across the bench.
    guide.position.set(-0.11, spec.bench + 0.09, 0.01);
  } else if (kind === 'quern') {
    const base = new Mesh(new CylinderGeometry(0.24, 0.28, spec.bench - 0.14, 12), dark);
    base.position.y = (spec.bench - 0.14) / 2;
    group.add(base);
    const bed = new Mesh(new CylinderGeometry(0.26, 0.26, 0.06, 16), stone);
    bed.position.y = spec.bench - 0.11;
    group.add(bed);
    const runner = new Group();
    const upper = new Mesh(new CylinderGeometry(0.25, 0.25, 0.07, 16), stone);
    runner.add(upper);
    // The handle IS the tell. A smooth stone turning about its own axis is
    // pixel-identical to a stationary one — the knurled-knob trap, third
    // time — so the crank stands proud and sweeps a visible circle.
    const peg = new Mesh(new CylinderGeometry(0.016, 0.016, 0.16, 6), dark);
    peg.position.set(0.17, 0.11, 0);
    runner.add(peg);
    const knob = new Mesh(new SphereGeometry(0.026, 8, 6), dark);
    knob.position.set(0.17, 0.2, 0);
    runner.add(knob);
    runner.position.y = spec.bench - 0.04;
    group.add(runner);
    mover = runner;
    tool = knob;
    work.position.set(0.17, spec.bench + 0.16, 0);
    // Both hands are on a quern, but only one turns: the other steadies the
    // bed stone.
    guide.position.set(-0.2, spec.bench - 0.05, 0.05);
  } else if (kind === 'trough') {
    const trough = new Mesh(new BoxGeometry(0.5, 0.1, 0.34), wood);
    trough.position.set(0, spec.bench + 0.05, 0);
    group.add(trough);
    const dough = new Mesh(
      new SphereGeometry(0.11, 10, 7),
      new MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9, flatShading: true })
    );
    dough.scale.set(1, 0.55, 0.85);
    dough.position.set(0, spec.bench + 0.11, 0);
    group.add(dough);
    mover = dough;
    tool = dough;
    // Both hands work, half a cycle apart, which is its own kind of
    // asymmetry: at any instant one is pushing and the other is drawing back.
    work.position.set(0.07, spec.bench + 0.17, 0.04);
    guide.position.set(-0.08, spec.bench + 0.17, -0.02);
  } else {
    const bowl = new Mesh(new CylinderGeometry(0.15, 0.09, 0.12, 16, 1, true), wood);
    bowl.material.side = 2;
    const bowlGroup = new Group();
    bowlGroup.add(bowl);
    const base = new Mesh(new CylinderGeometry(0.09, 0.09, 0.008, 16), wood);
    base.position.y = -0.06;
    bowlGroup.add(base);
    // Tilted, because a bowl you are whisking in is always tipped toward you.
    bowlGroup.rotation.x = -0.32;
    bowlGroup.position.set(-0.02, spec.bench + 0.09, 0.02);
    group.add(bowlGroup);
    const whisk = new Group();
    const handle = new Mesh(new CylinderGeometry(0.011, 0.013, 0.11, 6), dark);
    handle.position.y = 0.06;
    whisk.add(handle);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      const loop = new Mesh(new TorusGeometry(0.026, 0.0025, 3, 10, Math.PI), steel);
      loop.rotation.set(0, a, 0);
      loop.position.y = -0.02;
      whisk.add(loop);
    }
    whisk.position.set(0.02, spec.bench + 0.15, 0.05);
    group.add(whisk);
    mover = whisk;
    tool = whisk;
    work.position.set(0.02, spec.bench + 0.22, 0.05);
    guide.position.set(-0.15, spec.bench + 0.1, 0.04);
  }

  // Something flies off each cycle: chips, flour, dust.
  const spray = makeBurst(rng, {
    origin: new Vector3(0, spec.bench + 0.06, 0.02),
    color: kind === 'quern' || kind === 'trough' ? 0xe8dcc0 : 0xd8cfa8,
    count: 14,
    size: 0.016,
    speed: kind === 'board' ? 1.0 : 0.6,
    up: 0.9,
    life: 0.5,
  });
  group.add(spray.mesh);
  bursts.push(spray);

  let remaining = 1;
  const core = drive(
    spec.action,
    spec.cycle,
    spec.impact,
    () => {
      spray.emit(kind === 'board' ? 10 : 6);
      remaining = Math.max(0, remaining - 1 / batch);
    },
    bursts
  );

  // The station's own motion, layered on top of the shared driver.
  const baseUpdate = core.update.bind(core);
  let clock = 0;
  core.update = (dt: number, working = true) => {
    // Nothing left to prepare means nothing happens, however hard the cook
    // works. An empty board that still throws chips is a board with a hole
    // in the loop.
    baseUpdate(dt, working && remaining > 0);
    if (dt <= 0) return;
    if (working && remaining > 0) clock += dt;
    const p = (clock / spec.cycle) % 1;
    if (!mover) return;
    if (kind === 'board') {
      // Slow lift, fast fall — a knife does not float down.
      const lift = p < 0.6 ? Math.sin((Math.PI / 2) * (p / 0.6)) : Math.max(0, 1 - (p - 0.6) / 0.14);
      mover.position.y = spec.bench + 0.03 + lift * 0.11;
      mover.rotation.z = lift * 0.22;
    } else if (kind === 'mortar') {
      mover.position.y = spec.bench + 0.13 + Math.abs(Math.sin(Math.PI * p)) * 0.03;
      mover.position.x = 0.01 + Math.cos(Math.PI * 2 * p) * 0.018;
      mover.position.z = Math.sin(Math.PI * 2 * p) * 0.018;
    } else if (kind === 'quern') {
      mover.rotation.y = clock * (Math.PI * 2) / spec.cycle;
    } else if (kind === 'trough') {
      mover.position.z = Math.sin(Math.PI * 2 * p) * 0.03;
      mover.scale.set(1 + Math.sin(Math.PI * 2 * p) * 0.06, 0.55, 0.85);
    } else {
      mover.rotation.z = Math.sin(Math.PI * 2 * p) * 0.3;
      mover.position.x = 0.02 + Math.cos(Math.PI * 2 * p) * 0.02;
      mover.position.z = 0.05 + Math.sin(Math.PI * 2 * p) * 0.02;
    }
  };

  const slot = workSlot(spec.action, group, 0, spec.bench * 0 + 0.55, Math.PI);
  const station = finish(group, 0.55, slot, tool, core) as PrepStation;
  station.kind = kind;
  station.work = work;
  station.guide = guide;
  Object.defineProperty(station, 'remaining', { get: () => remaining });
  station.load = (amount = 1) => {
    remaining = Math.min(1, remaining + amount);
  };
  return station;
}

export const PREP_KINDS: PrepKind[] = ['board', 'mortar', 'quern', 'trough', 'bowl'];
