import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
} from 'three';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

/**
 * A pressure gauge — the first instrument in SCENA.
 *
 * Everything else in this library is a thing. This is a thing that *tells you
 * about* another thing, and the difference shows up in two places.
 *
 * The first is that a gauge is a **readout, not a Manipulable**. It has no
 * `open` and no `toggle`, because you cannot operate a gauge — you can only
 * read it. Its one input is a number and its one output is where the needle
 * happens to be, which lags behind because a real Bourdon tube has a spring
 * and a linkage in it.
 *
 * The second is subtler and it is the whole reason this is its own file. A
 * dial with a full ring of marks on it is a **clock**, and no amount of
 * captioning it "boiler pressure" will stop a viewer reading it as one. What
 * makes a disc read as an instrument is the **270° sweep with a dead zone at
 * the bottom** — the needle goes round most of the way and then stops, which
 * a clock never does — plus a red band at each end for the two numbers that
 * matter, and a needle that is off-centre, asymmetric and the wrong colour
 * for a clock hand.
 *
 * ```ts
 * const gauge = createPressureGauge({ max: 16, redline: 13.2, lowMark: 5 });
 * pipe.add(gauge.object);
 * game.onUpdate((t) => {
 *   gauge.setValue(plant.pressure);
 *   gauge.update(t.delta);
 * });
 * ```
 *
 * It faces **+z with its origin at the mounting face**, the fixtures/wallArt
 * convention, so the caller rotates it onto whatever it is standing on.
 */
export interface PressureGauge extends Prop {
  /** Where the needle IS, in bar. Eases toward `target`. */
  readonly value: number;
  /** Where it has been told to go. */
  readonly target: number;
  setValue(bar: number): void;
  /** Past the upper red band. Lights the pip beside the dial. */
  readonly overRange: boolean;
  /** Below the lower red arc — she has not enough to work with. */
  readonly low: boolean;
  update(dt: number): void;
}

export interface PressureGaugeOptions {
  /** Dial radius. Default 0.16. */
  radius?: number;
  /** Full scale, bar. Default 16. */
  max?: number;
  /** Where the upper red band starts. Default 0.82 × max. */
  redline?: number;
  /** Where the lower red arc ends. Default 0.25 × max. */
  lowMark?: number;
  /** Numbered marks around the sweep. Default 11. */
  ticks?: number;
  /** Starting reading. Default 0. */
  value?: number;
  seed?: number;
  palette?: Palette;
}

/** Where the needle starts and how far round it goes: 270°, gap at the bottom. */
const SWEEP_FROM = -0.75 * Math.PI;
const SWEEP = 1.5 * Math.PI;

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export function createPressureGauge(options: PressureGaugeOptions = {}): PressureGauge {
  const r = options.radius ?? 0.16;
  const max = Math.max(0.1, options.max ?? 16);
  const redline = options.redline ?? max * 0.82;
  const lowMark = options.lowMark ?? max * 0.25;
  const ticks = Math.max(2, Math.round(options.ticks ?? 11));
  const seed = options.seed ?? 1;
  const palette = options.palette ?? DEFAULT_PALETTE;
  void palette;

  const group = new Group();
  group.name = 'gauge';

  const brass = createSurface('brass', { seed });
  const dark = new MeshStandardMaterial({ color: 0x24272b, roughness: 0.7 });
  const red = new MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });

  // Case: a ring standing off the mounting face, so the dial is a recess and
  // not a sticker. Depth first, everything else stacked forward of it.
  const bezel = new Mesh(new CylinderGeometry(r, r * 1.04, 0.042, 24, 1, true), brass);
  bezel.rotation.x = Math.PI / 2;
  bezel.position.z = 0.021;
  group.add(bezel);
  const back = new Mesh(new CylinderGeometry(r * 1.04, r * 1.04, 0.008, 24), brass);
  back.rotation.x = Math.PI / 2;
  group.add(back);

  const face = new Mesh(
    new CylinderGeometry(r * 0.96, r * 0.96, 0.004, 24),
    new MeshStandardMaterial({ color: 0xe8e3d6, roughness: 0.85 })
  );
  face.rotation.x = Math.PI / 2;
  face.position.z = 0.034;
  group.add(face);

  // The marks. A clock's hour loop with the full circle swapped for the
  // 270° sweep — the arc IS the instrument, and closing it makes a clock.
  for (let i = 0; i < ticks; i++) {
    const major = i % 2 === 0;
    const len = major ? r * 0.17 : r * 0.09;
    const mark = new Mesh(new BoxGeometry(major ? 0.005 : 0.003, len, 0.002), dark);
    const a = SWEEP_FROM + (i / (ticks - 1)) * SWEEP;
    const at = r * 0.8 - len / 2;
    mark.position.set(Math.sin(a) * at, Math.cos(a) * at, 0.0365);
    mark.rotation.z = -a;
    group.add(mark);
  }

  // Two red bands: one from the bottom of the scale up to `lowMark`, one from
  // `redline` to full. TorusGeometry's arc runs anticlockwise from +x, so a
  // band is placed by rotating its start onto the sweep.
  const band = (from: number, to: number): void => {
    const a0 = SWEEP_FROM + clamp01(from / max) * SWEEP;
    const a1 = SWEEP_FROM + clamp01(to / max) * SWEEP;
    const arc = Math.abs(a1 - a0);
    if (arc < 1e-3) return;
    const ring = new Mesh(new TorusGeometry(r * 0.86, 0.004, 4, 16, arc), red);
    // The dial's zero is +y and it runs clockwise; the torus starts at +x and
    // runs anticlockwise. Mirror in x, then bring the start onto a0.
    ring.scale.x = -1;
    ring.rotation.z = Math.PI / 2 + a0;
    ring.position.z = 0.0365;
    group.add(ring);
  };
  band(0, lowMark);
  band(redline, max);

  // The needle. Pivoted near its tail so the counterweight end shows, built
  // pointing +y so a negative rotation.z sweeps clockwise, and red — the
  // clock's *second* hand colour, which is the one nobody uses for the time.
  const pivot = new Object3D();
  pivot.position.z = 0.038;
  const needleLen = r * 0.84;
  const needle = new Mesh(new BoxGeometry(0.006, needleLen, 0.003), red);
  // Named, so a test can find the needle by identity rather than by colour —
  // the red bands on the rim are the same red and they never move.
  needle.name = 'gauge:needle';
  needle.position.y = needleLen / 2 - needleLen * 0.14;
  pivot.add(needle);
  group.add(pivot);
  const boss = new Mesh(new CylinderGeometry(0.009, 0.009, 0.005, 12), dark);
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.0405;
  group.add(boss);

  // The over-range pip, beside the dial rather than on it: an instrument that
  // changes colour is a warning light, and a warning light is a separate lamp.
  const pipMat = new MeshStandardMaterial({
    color: 0x5a2018,
    emissive: 0xc0392b,
    emissiveIntensity: 0,
    roughness: 0.5,
  });
  const pip = new Mesh(new CylinderGeometry(0.018, 0.018, 0.012, 12), pipMat);
  pip.rotation.x = Math.PI / 2;
  pip.position.set(0, -r * 1.22, 0.012);
  group.add(pip);

  let value = clamp01((options.value ?? 0) / max) * max;
  let target = value;

  const place = (): void => {
    pivot.rotation.z = -(SWEEP_FROM + clamp01(value / max) * SWEEP);
    pipMat.emissiveIntensity = value >= redline ? 1.4 : 0;
  };
  place();

  return {
    object: group,
    // A dial on a bulkhead is not something you steer around.
    obstacleRadius: 0,
    get value() {
      return value;
    },
    get target() {
      return target;
    },
    setValue(bar: number) {
      target = Number.isFinite(bar) ? bar : 0;
    },
    get overRange() {
      return value >= redline;
    },
    get low() {
      return value <= lowMark;
    },
    update(dt: number) {
      if (dt <= 0) return;
      // A Bourdon tube has a spring and a linkage in it, so the needle
      // asymptotes rather than arriving. Exponential, and never tested for
      // equality anywhere.
      value += (target - value) * Math.min(1, dt * 6);
      place();
    },
  };
}
