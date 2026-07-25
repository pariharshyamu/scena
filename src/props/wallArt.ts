import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createPicture, pickPictureStyle, type Picture, type PictureStyle } from '../materials/picture';
import type { Prop } from '../core/types';

/**
 * Wall art — the things that go on a wall so it stops being plaster.
 *
 * Every room built with this kit so far has had bare walls, and in every
 * screenshot that is the loudest thing wrong with it: furniture, characters
 * and lighting all read, and then the background is a flat sheet of colour
 * that no inhabited room has ever had.
 *
 * All of these share one convention, the same one `createFixture` uses: the
 * **origin sits at the wall face and the art faces +z**, centred. So placing
 * one is a position and nothing else — and `hangOn` does even that for you.
 *
 * ```ts
 * const picture = createPainting({ width: 0.7, style: 'landscape', seed: 4 });
 * hangOn(room.walls[2], picture, { height: 1.55, seed: 4 });
 * ```
 */
export interface WallArt extends Prop {
  /** Overall size including the frame, in metres. */
  width: number;
  height: number;
  /** The image, on the pieces that carry one. */
  picture?: Picture;
}

/**
 * Frame profiles.
 *
 * - `none` — a stretched canvas with its edges showing. Modern, cheap, right.
 * - `thin` — a narrow dark moulding. The safe default for prints and photos.
 * - `wide` — a broad flat face, painted. Reads as a gallery print.
 * - `ornate` — stepped gilt. The only one with any real geometry in it.
 * - `box` — a deep shadow box with the image recessed.
 * - `clip` — no frame at all: a bare sheet with four small clips.
 */
export type FrameStyle = 'none' | 'thin' | 'wide' | 'ornate' | 'box' | 'clip';

interface FrameSpec {
  /** Moulding face width. */
  face: number;
  /** How far the frame stands off the wall. */
  depth: number;
  /** How far the image sits behind the front of the frame. */
  recess: number;
}

const FRAMES: Record<FrameStyle, FrameSpec> = {
  // A negative recess on the bare canvas: the image has to sit PROUD of the
  // stretcher body, not flush with its front face. Flush means the body wins
  // the depth test and the picture disappears entirely behind a blank slab.
  none: { face: 0, depth: 0.035, recess: -0.0015 },
  thin: { face: 0.022, depth: 0.032, recess: 0.012 },
  wide: { face: 0.062, depth: 0.042, recess: 0.016 },
  ornate: { face: 0.055, depth: 0.05, recess: 0.018 },
  box: { face: 0.03, depth: 0.09, recess: 0.062 },
  clip: { face: 0, depth: 0.006, recess: 0 },
};

export interface PaintingOptions {
  /** Image width in metres (excluding the frame). Default 0.62. */
  width?: number;
  /** Image height. Defaults to a seeded portrait/landscape proportion. */
  height?: number;
  /** What it is a picture of. Defaults to a seeded pick. */
  style?: PictureStyle;
  /** Moulding. Default 'thin'. */
  frame?: FrameStyle;
  /** Frame colour. Defaults to gilt for `ornate`, dark wood otherwise. */
  frameColor?: number;
  /** Yellowing and darkened varnish (0–1). Default 0.25. */
  age?: number;
  /** A glass front that catches highlights. Default false for paintings. */
  glazed?: boolean;
  /** An inset mount board between frame and image, in metres. Default 0. */
  mount?: number;
  seed?: number;
  palette?: Palette;
}

/** Build the four bars of a moulding around a `w` × `h` opening. */
function buildFrame(
  group: Group,
  w: number,
  h: number,
  spec: FrameSpec,
  material: MeshStandardMaterial,
  steps = 1
): void {
  if (spec.face <= 0) return;
  // The moulding fills the band between the opening and `face` beyond it.
  // Split that band into concentric rings — each a proper ring that abuts
  // its neighbours rather than overlapping them, so the frame's outer edge
  // stays where `face` says it is however many steps it has. Stepping by
  // scaling the whole frame instead grows it with every ring, and an ornate
  // frame ends up swamping the picture it is around.
  const bandW = spec.face / steps;
  for (let s = 0; s < steps; s++) {
    const hx = w / 2 + bandW * s;
    const hy = h / 2 + bandW * s;
    // Deepest at the outside, stepping down toward the picture — which is
    // the direction real mouldings run, and the only reason the steps read
    // as relief rather than as stripes.
    const depth = spec.depth * (0.45 + (0.55 * (s + 1)) / steps);
    for (const sign of [-1, 1]) {
      const rail = new Mesh(new BoxGeometry((hx + bandW) * 2, bandW, depth), material);
      rail.position.set(0, sign * (hy + bandW / 2), depth / 2);
      group.add(rail);
      const stile = new Mesh(new BoxGeometry(bandW, hy * 2, depth), material);
      stile.position.set(sign * (hx + bandW / 2), 0, depth / 2);
      group.add(stile);
    }
  }
}

/**
 * A picture on a wall.
 *
 * The proportion is seeded rather than square, because a wall of squares is
 * as obviously generated as a wall of identical images. Portrait and
 * landscape formats both turn up, and the `style` follows the format when
 * it is not asked for — a portrait picture in a landscape frame is a tell.
 */
export function createPainting(options: PaintingOptions = {}): WallArt {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const frameStyle = options.frame ?? 'thin';
  const spec = FRAMES[frameStyle];

  const w = options.width ?? rng.range(0.4, 0.9);
  // Formats people actually hang: a few standard ratios, upright or across.
  const ratio = rng.pick([1.34, 1.5, 1.25, 1.62]);
  const upright = options.height === undefined && rng.next() < 0.42;
  const h = options.height ?? (upright ? w * ratio : w / ratio);

  const style = options.style ?? (upright && rng.next() < 0.6 ? 'portrait' : pickPictureStyle(seed));
  const mount = options.mount ?? 0;

  const group = new Group();
  group.name = `painting-${style}`;

  const picture = createPicture(w, h, { style, seed, age: options.age ?? 0.25 });
  const canvas = new Mesh(new PlaneGeometry(w, h), picture.material);
  canvas.name = 'picture';
  canvas.position.z = spec.depth - spec.recess;
  group.add(canvas);

  if (mount > 0) {
    // Mount board: a pale border between image and moulding. At distance it
    // is what separates a framed thing from a coloured rectangle, and it is
    // one quad.
    const board = new Mesh(
      new PlaneGeometry(w + mount * 2, h + mount * 2),
      new MeshStandardMaterial({ color: 0xece7dd, roughness: 0.95 })
    );
    board.position.z = canvas.position.z - 0.002;
    group.add(board);
  }
  const openW = w + mount * 2;
  const openH = h + mount * 2;

  if (frameStyle === 'none') {
    // A stretched canvas: the sides are visible, so it needs a body.
    const body = new Mesh(
      new BoxGeometry(w, h, spec.depth),
      new MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9, flatShading: true })
    );
    body.position.z = spec.depth / 2;
    group.add(body);
  } else if (frameStyle === 'clip') {
    const clipMat = new MeshStandardMaterial({ color: 0x9aa2aa, roughness: 0.4, metalness: 0.6 });
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const clip = new Mesh(new BoxGeometry(0.024, 0.014, 0.012), clipMat);
        clip.position.set(sx * (w / 2 - 0.02), sy * (h / 2 - 0.008), 0.008);
        group.add(clip);
      }
    }
  } else {
    const gilt = frameStyle === 'ornate';
    // Plain gold rather than the `brass` surface: that shader's grain is
    // scaled for a gate or a bell, and on a 2 cm moulding it reads as animated
    // yellow static.
    const frameMat = gilt
      ? new MeshStandardMaterial({
          color: options.frameColor ?? 0xc0a052,
          roughness: 0.42,
          metalness: 0.55,
          flatShading: true,
        })
      : createSurface('wood', {
          color: options.frameColor ?? new Color(palette.woodDark).getHex(),
          roughness: 0.6,
          seed,
        });
    buildFrame(group, openW, openH, spec, frameMat, gilt ? 3 : 1);
    if (frameStyle === 'box') {
      // A shadow box needs a back, or you see the wall through the recess.
      const back = new Mesh(
        new PlaneGeometry(openW, openH),
        new MeshStandardMaterial({ color: 0x1b1a18, roughness: 0.95 })
      );
      back.position.z = 0.001;
      group.add(back);
    }
  }

  if (options.glazed) addGlazing(group, openW, openH, spec.depth);

  const outer = spec.face * 2;
  return {
    object: group,
    obstacleRadius: 0,
    width: openW + outer,
    height: openH + outer,
    picture,
  };
}

/** A sheet of glass across the front. Catches highlights; occludes nothing. */
function addGlazing(group: Group, w: number, h: number, depth: number): void {
  const glass = new Mesh(
    new PlaneGeometry(w, h),
    new MeshStandardMaterial({
      color: 0xdce6ec,
      roughness: 0.04,
      metalness: 0.1,
      transparent: true,
      opacity: 0.11,
    })
  );
  glass.name = 'glazing';
  glass.position.z = depth + 0.001;
  group.add(glass);
}

export interface FramedPhotoOptions {
  /** Long edge in metres. Default 0.16 — a photo is small. */
  size?: number;
  style?: PictureStyle;
  /** Add a hinged back strut so it stands on a surface instead of hanging. */
  standing?: boolean;
  seed?: number;
  palette?: Palette;
}

/**
 * A framed photograph: small, glazed, with a mount board.
 *
 * With `standing` its origin moves to the **base** rather than the wall face,
 * because a photo on a shelf is placed on the floor of that shelf and a photo
 * on a wall is placed on the wall. Getting that wrong buries it half a frame
 * into whatever it sits on.
 */
export function createFramedPhoto(options: FramedPhotoOptions = {}): WallArt {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const size = options.size ?? 0.16;
  const upright = rng.next() < 0.55;
  const w = upright ? size / 1.34 : size;
  const h = upright ? size : size / 1.34;

  const art = createPainting({
    width: w,
    height: h,
    style: options.style ?? 'photo',
    frame: 'thin',
    frameColor: rng.pick([0x2b2724, 0x8d7a5f, 0xc9c4bc]),
    glazed: true,
    mount: size * 0.09,
    age: 0.08,
    seed,
    palette: options.palette,
  });

  if (options.standing) {
    // Lift it so the origin is at the base, then prop it up at a slight lean.
    const stood = new Group();
    stood.name = 'framedPhoto';
    const lean = 0.16;
    art.object.rotation.x = lean;
    art.object.position.set(0, art.height / 2, 0);
    stood.add(art.object);
    const strut = new Mesh(
      new BoxGeometry(0.02, art.height * 0.7, 0.004),
      new MeshStandardMaterial({ color: 0x3a342c, roughness: 0.8 })
    );
    strut.position.set(0, art.height * 0.34, -art.height * 0.16);
    strut.rotation.x = -0.42;
    stood.add(strut);
    return { object: stood, obstacleRadius: 0, width: art.width, height: art.height, picture: art.picture };
  }
  return art;
}

export interface MirrorOptions {
  /** Glass width. Default 0.5. */
  width?: number;
  /** Glass height. Default 0.72. */
  height?: number;
  frame?: FrameStyle;
  frameColor?: number;
  seed?: number;
  palette?: Palette;
}

/**
 * A wall mirror.
 *
 * The glass is painted, not reflective — see `PictureStyle.mirror`. A real
 * one is a second render pass each, and a metal surface without an
 * environment map is simply black.
 */
export function createMirror(options: MirrorOptions = {}): WallArt {
  return createPainting({
    width: options.width ?? 0.5,
    height: options.height ?? 0.72,
    style: 'mirror',
    frame: options.frame ?? 'ornate',
    frameColor: options.frameColor,
    age: 0,
    seed: options.seed ?? 1,
    palette: options.palette,
  });
}

export interface WallClock extends WallArt {
  /** Advance the hands. */
  update(dt: number): void;
  /** Set the displayed time. Seconds are optional. */
  setTime(hours: number, minutes: number, seconds?: number): void;
  /** The displayed time in hours since midnight. */
  readonly time: number;
}

export interface WallClockOptions {
  /** Face diameter. Default 0.3. */
  diameter?: number;
  /** Starting time, hours since midnight. Default 10.17 (a photogenic 10:10). */
  time?: number;
  /**
   * How fast the hands run relative to real time. Default 60 — one minute of
   * clock per second, so a clock is visibly moving in a demo. Set 1 for real
   * time, 0 to stop it.
   */
  rate?: number;
  /** Include a sweeping second hand. Default true. */
  seconds?: boolean;
  frameColor?: number;
  seed?: number;
}

/**
 * A wall clock — the only piece here that moves, and worth the geometry for
 * exactly that reason. A room where nothing at all changes reads as a
 * photograph; one ticking hand is enough to break that.
 */
export function createWallClock(options: WallClockOptions = {}): WallClock {
  const d = options.diameter ?? 0.3;
  const r = d / 2;
  const rate = options.rate ?? 60;
  const withSeconds = options.seconds ?? true;
  const seed = options.seed ?? 1;

  const group = new Group();
  group.name = 'wallClock';
  const case_ = createSurface('paintedMetal', {
    color: options.frameColor ?? 0x2c2f33,
    roughness: 0.5,
    seed,
  });
  const rim = new Mesh(new CylinderGeometry(r, r, 0.038, 28), case_);
  rim.rotation.x = Math.PI / 2;
  rim.position.z = 0.019;
  group.add(rim);
  const face = new Mesh(
    new CylinderGeometry(r * 0.93, r * 0.93, 0.004, 28),
    new MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.85 })
  );
  face.rotation.x = Math.PI / 2;
  face.position.z = 0.039;
  group.add(face);

  // Hour marks. Twelve of them, with the quarters longer — the difference is
  // what makes a disc read as a clock rather than as a plate.
  const markMat = new MeshStandardMaterial({ color: 0x24272b, roughness: 0.7 });
  for (let i = 0; i < 12; i++) {
    const quarter = i % 3 === 0;
    const len = quarter ? r * 0.17 : r * 0.09;
    const mark = new Mesh(new BoxGeometry(quarter ? 0.011 : 0.006, len, 0.002), markMat);
    const a = (i / 12) * Math.PI * 2;
    const at = r * 0.82 - len / 2;
    mark.position.set(Math.sin(a) * at, Math.cos(a) * at, 0.0415);
    mark.rotation.z = -a;
    group.add(mark);
  }

  // Hands are pivoted at the centre and built pointing +y, so setting the
  // rotation to -angle runs them clockwise.
  const hand = (length: number, wide: number, z: number, color: number): Object3D => {
    const pivot = new Object3D();
    pivot.position.z = z;
    const bar = new Mesh(new BoxGeometry(wide, length, 0.003), new MeshStandardMaterial({
      color,
      roughness: 0.6,
    }));
    // Offset so the pivot sits near the tail, not the middle.
    bar.position.y = length / 2 - length * 0.14;
    pivot.add(bar);
    group.add(pivot);
    return pivot;
  };
  const hourHand = hand(r * 0.52, 0.011, 0.0425, 0x24272b);
  const minuteHand = hand(r * 0.78, 0.008, 0.0435, 0x24272b);
  const secondHand = withSeconds ? hand(r * 0.84, 0.003, 0.0445, 0xc0392b) : null;
  const boss = new Mesh(new CylinderGeometry(0.008, 0.008, 0.004, 12), markMat);
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.045;
  group.add(boss);

  let time = options.time ?? 10.17;
  const applyTime = (): void => {
    const hours = ((time % 12) + 12) % 12;
    hourHand.rotation.z = -(hours / 12) * Math.PI * 2;
    const minutes = (hours * 60) % 60;
    minuteHand.rotation.z = -(minutes / 60) * Math.PI * 2;
    if (secondHand) {
      const secs = (minutes * 60) % 60;
      secondHand.rotation.z = -(secs / 60) * Math.PI * 2;
    }
  };
  applyTime();

  return {
    object: group,
    obstacleRadius: 0,
    width: d,
    height: d,
    get time() {
      return time;
    },
    setTime(hours: number, minutes: number, seconds = 0) {
      time = hours + minutes / 60 + seconds / 3600;
      applyTime();
    },
    update(dt: number) {
      if (rate === 0) return;
      time += (dt * rate) / 3600;
      applyTime();
    },
  };
}

export interface TapestryOptions {
  /** Cloth width. Default 0.9. */
  width?: number;
  /** Cloth drop. Default 1.4. */
  height?: number;
  /** Hang it from a visible rod. Default true. */
  rod?: boolean;
  seed?: number;
  palette?: Palette;
}

/**
 * A hanging cloth: tapestry, wall rug, banner-on-a-wall.
 *
 * The origin is at the wall face level with the **rod**, so the cloth drops
 * below it — which is how a hanging is actually positioned. Everything else
 * here is centred on itself; this one is not, and it would be wrong if it
 * were.
 */
export function createTapestry(options: TapestryOptions = {}): WallArt {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const w = options.width ?? 0.9;
  const h = options.height ?? 1.4;

  const group = new Group();
  group.name = 'tapestry';

  // Woven bands rather than a picture: a tapestry read from across a hall is
  // horizontal colour, and the pattern shader already does that far better
  // than a plane of one colour.
  const base = new Color(palette.wall).lerp(new Color(rng.pick([0x7d3b3b, 0x2f4a6b, 0x4a5a35, 0x6b4a2f])), 0.75);
  const cloth = createSurface('canvas', { color: base.getHex(), roughness: 0.95, seed });
  const segments = 7;
  const panel = new Mesh(new PlaneGeometry(w, h, 1, segments), cloth);
  // Sag: the cloth bows away from the wall toward the middle of its drop.
  const pos = panel.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = 1 - (y + h / 2) / h; // 0 at the rod, 1 at the hem
    pos.setZ(i, Math.sin(t * Math.PI) * 0.035 + t * 0.012);
  }
  pos.needsUpdate = true;
  panel.geometry.computeVertexNormals();
  panel.name = 'cloth';
  panel.position.set(0, -h / 2 - 0.03, 0.02);
  group.add(panel);

  // Bands of a second colour across the drop — the pattern that says "woven".
  const bandMat = new MeshStandardMaterial({
    color: base.clone().offsetHSL(0.06, 0.05, 0.14).getHex(),
    roughness: 0.95,
    flatShading: true,
  });
  const bands = 2 + Math.floor(rng.next() * 3);
  for (let i = 0; i < bands; i++) {
    const at = -0.12 - ((i + 0.7) / bands) * (h - 0.2);
    const band = new Mesh(new PlaneGeometry(w * 0.96, h * rng.range(0.03, 0.07)), bandMat);
    band.position.set(0, at, 0.055 + i * 0.0005);
    group.add(band);
  }

  if (options.rod ?? true) {
    const rod = new Mesh(
      new CylinderGeometry(0.016, 0.016, w + 0.12, 10),
      createSurface('wood', { color: palette.woodDark, seed: seed + 1 })
    );
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, 0, 0.03);
    group.add(rod);
    for (const s of [-1, 1]) {
      const finial = new Mesh(
        new CylinderGeometry(0.026, 0.026, 0.02, 10),
        new MeshStandardMaterial({ color: 0xb8983f, roughness: 0.4, metalness: 0.6 })
      );
      finial.rotation.z = Math.PI / 2;
      finial.position.set(s * (w / 2 + 0.07), 0, 0.03);
      group.add(finial);
    }
  }

  return { object: group, obstacleRadius: 0, width: w, height: h };
}
