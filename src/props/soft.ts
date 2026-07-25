import {
  BoxGeometry,
  Color,
  DoubleSide,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  TorusGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { wavingClothMaterial } from '../materials/clothWave';
import type { Prop } from '../core/types';

/**
 * Soft furnishing — curtains, cushions, throws.
 *
 * Curtains are the highest-value item in the whole decoration set and cost
 * almost nothing, because the hard part is already built: `clothWave` has
 * driven the flags, banners and bunting since 0.9. A curtain is that same
 * material stood on its end — fixed along the top edge, free at the hem —
 * and a curtain stirring in a draught is one of the very few things that
 * makes an interior read as *alive* rather than as a photograph of one.
 *
 * ```ts
 * const curtains = createCurtains({ width: 1.2, drop: 1.6, seed: 3 });
 * window.add(curtains.object);
 * game.onUpdate((t) => curtains.update(t.delta));
 * ```
 */

export type CurtainStyle =
  /** Two panels drawn back to either side. */
  | 'open'
  /** Two panels meeting in the middle. */
  | 'closed'
  /** A single sheer panel across the whole opening. */
  | 'sheer';

export interface CurtainsOptions {
  /** Width of the opening being dressed, in metres. Default 1.2. */
  width?: number;
  /** Drop from the rail to the hem. Default 1.6. */
  drop?: number;
  style?: CurtainStyle;
  /** Cloth colour. Defaults to a seeded pick. */
  color?: number;
  /** Show the rail and rings. Default true. */
  rail?: boolean;
  /** How hard the draught blows, 0–1. Default 0.5. */
  stir?: number;
  seed?: number;
  palette?: Palette;
}

export interface Curtains extends Prop {
  /** Advance the stir. Nothing moves without this. */
  update(dt: number): void;
  width: number;
  drop: number;
}

/**
 * Curtains at a window.
 *
 * The origin is at the **rail**, centred, with everything hanging below —
 * the same convention as the tapestry, and for the same reason: a hanging
 * thing is placed by where it hangs from.
 */
export function createCurtains(options: CurtainsOptions = {}): Curtains {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const width = options.width ?? 1.2;
  const drop = options.drop ?? 1.6;
  const style = options.style ?? 'open';
  const stir = options.stir ?? 0.5;

  const group = new Group();
  group.name = `curtains-${style}`;
  const sheer = style === 'sheer';
  const base = new Color(
    options.color ??
      rng.pick([0xb8ae9a, 0x8d9aa6, 0xa8927e, 0x94a08c, new Color(palette.wall).getHex()])
  );

  const panels = sheer ? 1 : 2;
  // A drawn-back panel is gathered to about a third of the opening; a closed
  // one covers half of it each. Either way the cloth is WIDER than the space
  // it covers, because a curtain is pleated — a panel cut to the exact
  // opening is a bedsheet nailed to the wall.
  const cover = sheer ? width : style === 'open' ? width * 0.32 : width * 0.52;
  const cloth = cover * 1.5;

  const updates: Array<{ uTime: { value: number } }> = [];

  for (let i = 0; i < panels; i++) {
    const side = panels === 1 ? 0 : i === 0 ? -1 : 1;
    // The cloth material ripples along its local +X from a fixed edge at
    // x = 0. A curtain is fixed at the TOP, so the panel is built with +X
    // running down the drop and then turned to stand up.
    const material = wavingClothMaterial({
      freeLen: drop,
      crossLen: cloth,
      amp: (sheer ? 0.05 : 0.03) * stir,
      waves: 1.4 + rng.range(-0.3, 0.3),
      speed: 0.5 + rng.range(-0.15, 0.15),
      // Zero: this cloth already hangs, and sag pulls toward the free edge,
      // which for a curtain is straight down. Adding gravity to gravity
      // stretches the hem into a spike.
      sag: 0,
      phase: rng.next() * 6.28,
      cacheKey: 'scenaCurtain',
      color: base.clone().offsetHSL(0, 0, rng.range(-0.04, 0.04)).getHex(),
      roughness: 0.95,
    });
    if (sheer) {
      material.transparent = true;
      material.opacity = 0.42;
    }

    const segsX = 14;
    const segsY = Math.max(6, Math.round(cloth / 0.06));
    const geometry = new PlaneGeometry(drop, cloth, segsX, segsY);
    // Move the fixed edge to x = 0, which is where the wave expects it.
    geometry.translate(drop / 2, 0, 0);
    // Pleats: a standing ripple across the width, baked in, deepening a
    // little toward the hem. This is what the wave rides on top of, and
    // without it a curtain is a flat sheet however well it moves.
    const pos = geometry.attributes.position;
    const folds = Math.max(3, Math.round(cover / 0.09));
    for (let v = 0; v < pos.count; v++) {
      const down = pos.getX(v) / drop;
      const across = pos.getY(v) / cloth + 0.5;
      pos.setZ(v, Math.sin(across * Math.PI * 2 * folds) * cover * 0.055 * (0.6 + down * 0.5));
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();

    const panel = new Mesh(geometry, material);
    panel.name = 'panel';
    // +x down, +y across.
    panel.rotation.z = -Math.PI / 2;
    panel.position.set(side * (width / 2 - cover / 2), -0.02, 0);
    group.add(panel);
    updates.push(material.userData.waveUniforms as { uTime: { value: number } });
  }

  if (options.rail ?? true) {
    const metal = new MeshStandardMaterial({ color: 0x8d8578, roughness: 0.45, metalness: 0.6 });
    const rod = new Mesh(new CylinderGeometry(0.012, 0.012, width + 0.18, 8), metal);
    rod.rotation.z = Math.PI / 2;
    group.add(rod);
    for (const s of [-1, 1]) {
      const finial = new Mesh(new CylinderGeometry(0.022, 0.022, 0.024, 8), metal);
      finial.rotation.z = Math.PI / 2;
      finial.position.x = s * (width / 2 + 0.1);
      group.add(finial);
    }
    // Rings, spaced across whatever the cloth actually covers.
    const rings = Math.max(4, Math.round(width / 0.14));
    for (let i = 0; i < rings; i++) {
      const t = (i + 0.5) / rings;
      const ring = new Mesh(new TorusGeometry(0.017, 0.004, 4, 10), metal);
      ring.position.set(-width / 2 + t * width, -0.014, 0);
      group.add(ring);
    }
  }

  return {
    object: group,
    obstacleRadius: 0,
    width,
    drop,
    update(dt: number) {
      for (const u of updates) u.uTime.value += dt;
    },
  };
}

export interface CushionOptions {
  /** Edge length in metres. Default 0.4. */
  size?: number;
  color?: number;
  seed?: number;
  palette?: Palette;
}

/**
 * A cushion.
 *
 * A box is a brick. What makes a cushion is that it is **fatter in the
 * middle than at the corners**, so the geometry is a box with its corner
 * vertices pulled in and its face centres pushed out.
 */
export function createCushion(options: CushionOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const size = (options.size ?? 0.4) * rng.range(0.88, 1.12);
  const thick = size * rng.range(0.26, 0.36);

  const group = new Group();
  group.name = 'cushion';
  // An EVEN segment count, so there is a vertex at the centre of each face to
  // plump. With three there is no middle, and the cushion comes out a box
  // with slightly rounded corners.
  const geometry = new BoxGeometry(size, thick, size * rng.range(0.9, 1.05), 4, 2, 4);
  const pos = geometry.attributes.position;
  const half = size / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // How near the middle of the face is this vertex? Corners get squeezed,
    // the middle gets plumped.
    const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
    const plump = 1 - edge * edge;
    pos.setY(i, y * (1 + plump * 0.55));
    pos.setX(i, x * (1 - plump * 0.06));
    pos.setZ(i, z * (1 - plump * 0.06));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const colour = new Color(
    options.color ?? rng.pick([0x8d6a5a, 0x6b7d8a, 0x9a8a6b, 0x7d6b7a, new Color(palette.roof).getHex()])
  );
  // Flat-shaded plain colour, not the `canvas` surface: that shader's grain
  // is scaled for a tent or a sack, and on a 40 cm cushion it reads as
  // sandstone. Faceting the plumped geometry is what says "soft" here.
  const cushion = new Mesh(
    geometry,
    new MeshStandardMaterial({ color: colour.getHex(), roughness: 0.95, flatShading: true })
  );
  cushion.position.y = (thick * 1.55) / 2;
  cushion.rotation.y = rng.range(-0.3, 0.3);
  group.add(cushion);
  return { object: group, obstacleRadius: 0 };
}

export interface ThrowOptions {
  /** How wide the throw lies. Default 0.9. */
  width?: number;
  /** How far it hangs down the front of whatever it is over. Default 0.35. */
  hang?: number;
  color?: number;
  seed?: number;
  palette?: Palette;
}

/**
 * A throw or blanket draped over an edge: flat along the top, folding over,
 * then hanging down the front with the hem uneven.
 *
 * The origin is the top surface it lies on, so it drops straight onto the
 * end of a bed or the arm of a sofa.
 */
export function createThrow(options: ThrowOptions = {}): Prop {
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const width = options.width ?? 0.9;
  const hang = options.hang ?? 0.35;
  const lie = width * rng.range(0.4, 0.55);

  const group = new Group();
  group.name = 'throw';
  const colour = new Color(
    options.color ?? rng.pick([0x8a7d6b, 0x6b7a8a, 0x9a8578, 0x7a8a70, new Color(palette.wall).getHex()])
  );
  const material = new MeshStandardMaterial({
    color: colour.getHex(),
    roughness: 0.96,
    flatShading: true,
  });

  const segs = 10;
  const geometry = new PlaneGeometry(width, lie + hang, 4, segs);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const along = pos.getY(i) + (lie + hang) / 2; // 0 at the hanging hem
    let y: number;
    let z: number;
    if (along < hang) {
      // The hanging part: straight down the front face.
      y = along - hang;
      z = lie / 2;
    } else {
      // The lying part: flat along the top, folding over the edge.
      const on = along - hang;
      y = -Math.max(0, 0.02 - on) * 0.5;
      z = lie / 2 - on;
    }
    // A rumple across the width, and an uneven hem — a throw with a straight
    // edge is a tablecloth.
    const ripple = Math.sin((x / width) * Math.PI * 5 + seed) * 0.012;
    pos.setXYZ(i, x, y + ripple + (along < hang ? 0 : 0.008), z + ripple * 0.6);
    if (along < 0.02) pos.setY(i, y - Math.abs(Math.sin(x * 9 + seed)) * 0.03);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const cloth = new Mesh(geometry, material);
  // The underside of the fold is in shot the moment the camera drops below
  // the edge it is draped over.
  cloth.material.side = DoubleSide;
  cloth.name = 'cloth';
  group.add(cloth);
  return { object: group, obstacleRadius: 0 };
}
