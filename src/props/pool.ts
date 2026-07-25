import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface, type SurfaceKind } from '../materials/surface';
import {
  addApproach,
  createSlot,
  type Prop,
  type PropSlot,
  type WaterBody,
} from '../core/types';

/**
 * Swimming pools.
 *
 * The prop is the easy half. A pool is a hole with walls, and the trilogy
 * has built holes before — the mistakes are already catalogued: build the
 * shell as **walls around a floor**, never as a solid with a smaller solid
 * inside it; frame the coping, never slab it; and remember a default
 * `CylinderGeometry` has a lid on it.
 *
 * What a pool has that a tub does not is a **floor that slopes**, and that
 * one difference is what makes it a gameplay prop rather than a big bath.
 * `depthAt` is the whole handshake: ANIMA asks how deep the water is where
 * a body is standing, and decides for itself whether that body wades or
 * swims. A pool with one depth everywhere cannot pose the question, which
 * is why the shallow and deep ends are not decoration.
 *
 * ```ts
 * const pool = createPool({ style: 'lido' });
 * scene.add(pool.object);
 * game.onUpdate((t) => pool.update(t.delta));
 * pool.depthAt(swimmer.x, swimmer.z);   // ANIMA's Swimming reads this
 * ```
 */

export type PoolStyle =
  /** A small stone plunge bath: steep sides, one depth, steps all round. */
  | 'plunge'
  /** A mosaic-lined bathing hall pool, shallow and wide. */
  | 'bathhouse'
  /** A mid-century tiled lido: lanes, a sloping floor, a board at the deep end. */
  | 'lido'
  /** A modern deck-level pool with a spill edge. */
  | 'infinity';

interface StyleSpec {
  length: number;
  width: number;
  shallow: number;
  deep: number;
  /** How far the water sits below the coping. An infinity edge is brim-full. */
  freeboard: number;
  lining: SurfaceKind;
  liningColor: number;
  deck: SurfaceKind;
  deckColor: number;
  water: number;
  lanes: number;
  ladder: boolean;
  board: boolean;
  /** Paved apron beyond the coping. */
  apron: number;
}

const STYLES: Record<PoolStyle, StyleSpec> = {
  plunge: {
    length: 3.2, width: 2.4, shallow: 1.1, deep: 1.25, freeboard: 0.14,
    lining: 'ashlar', liningColor: 0xa8a094, deck: 'stone', deckColor: 0x9c948a,
    water: 0x2f6d7a, lanes: 0, ladder: false, board: false, apron: 0.9,
  },
  bathhouse: {
    length: 6.0, width: 4.0, shallow: 0.9, deep: 1.2, freeboard: 0.12,
    lining: 'mosaic', liningColor: 0x3f7fae, deck: 'marble', deckColor: 0xd8d2c4,
    water: 0x2c7d94, lanes: 0, ladder: false, board: false, apron: 1.4,
  },
  lido: {
    length: 12.0, width: 6.0, shallow: 0.95, deep: 2.4, freeboard: 0.12,
    lining: 'floortile', liningColor: 0xdcdfe2, deck: 'concrete', deckColor: 0xc6c2b8,
    water: 0x2b83a6, lanes: 4, ladder: true, board: true, apron: 1.8,
  },
  infinity: {
    length: 8.0, width: 3.4, shallow: 1.3, deep: 1.5, freeboard: 0.015,
    lining: 'porcelain', liningColor: 0x39434a, deck: 'teak', deckColor: 0x8a6a47,
    water: 0x1f5f74, lanes: 0, ladder: true, board: false, apron: 1.2,
  },
};

export interface PoolOptions {
  style?: PoolStyle;
  /** Long axis (x), metres. Defaults per style. */
  length?: number;
  /** Short axis (z), metres. Defaults per style. */
  width?: number;
  /** Water depth at the -x end. Defaults per style. */
  shallow?: number;
  /** Water depth at the +x end. Defaults per style. */
  deep?: number;
  /** Lane markings on the floor. Defaults per style; 0 turns them off. */
  lanes?: number;
  /**
   * Paved apron around the coping, metres. Defaults per style; 0 for none.
   *
   * A pool is a **hole**, and a hole cannot be dropped onto a solid ground
   * plane — the ground is a lid over it, and every pool in the first render
   * of this prop was an empty frame lying on the tarmac for exactly that
   * reason. The apron is the prop bringing its own surround, so it reads
   * correctly the moment it is added to a scene; a caller with real ground
   * still has to leave a hole for it.
   */
  deck?: number;
  seed?: number;
  palette?: Palette;
}

/**
 * Anything with a bottom, a top and rungs — structurally ANIMA's
 * `Climbable`, the same contract `createLadder` publishes.
 */
export interface PoolLadder {
  bottom: Object3D;
  top: Object3D;
  rungSpacing: number;
}

export interface Pool extends Prop, WaterBody {
  style: PoolStyle;
  /** Water depth at each end, in metres. */
  shallow: number;
  deep: number;
  length: number;
  width: number;
  /** Standing on the deck at the top of the steps, facing the water. */
  entry: PropSlot;
  /** A pool ladder at the deep end, on the styles that have one. */
  ladder: PoolLadder | null;
  /** The end of the springboard, on the styles that have one. */
  board: PropSlot | null;
  /** Sitting on the edge with your legs in — the most-used pool pose there is. */
  edges: PropSlot[];
  update(dt: number): void;
}

/** How many ripple sources the surface shader tracks at once. */
const RIPPLES = 4;

/** Blend two packed hex colours, `t` of the way from `a` to `b`. */
function mixHex(a: number, b: number, t: number): number {
  const lerp = (shift: number): number =>
    Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) << shift;
  return lerp(16) | lerp(8) | lerp(0);
}

/**
 * The lining shader reads a vertex's height **in the pool's space** to decide
 * what is underwater, so every mesh it is applied to has to be authored in
 * that space: transforms baked into the geometry, meshes left at the origin.
 *
 * Position a lined mesh the ordinary way and the varying carries the *mesh's*
 * own local y instead — a wall centred on its own middle reports heights
 * either side of zero however deep it is sunk, so the waterline lands
 * halfway up every wall independently and the caustics climb the coping.
 */

/**
 * The lining shader: what is underwater looks underwater.
 *
 * Two effects, both keyed off the object-space height against the
 * waterline, because the alternative — tinting the whole mesh — makes the
 * part of the wall *above* the water look wet as well, and a pool whose dry
 * coping is the same colour as its floor reads as a painted trench.
 *
 * The caustics are the part that does the work. A still blue rectangle is a
 * blue rectangle at any level of tinting; a floor with a moving net of
 * light on it is underwater even in a screenshot.
 */
function lineWater(
  material: MeshStandardMaterial,
  uniforms: Record<string, { value: number }>,
  key: string
): void {
  const patched = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    patched?.(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vPoolPos;\nvarying vec3 vPoolNrm;'
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPoolPos = position;\nvPoolNrm = normal;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vPoolPos;
         varying vec3 vPoolNrm;
         uniform float uPoolTime;
         uniform float uPoolWaterY;
         uniform float uPoolCaustic;
         uniform float uPoolLane;`
      )
      .replace(
        // AFTER the tiling, not before it. createSurface patches map_fragment
        // and then keeps working on diffuseColor for another twenty lines —
        // mortar joints, cavity tint, per-cell jitter — so caustics injected
        // at map_fragment are painted over by the grout of the very tiles
        // they are supposed to be dancing on. emissivemap_fragment is the
        // first hook after all of that, and diffuseColor is still in scope.
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         {
           // Underwater fraction. A hard step banding across a sloping floor
           // is visible as a stair; the smoothstep is 4 cm of waterline.
           float sub = smoothstep(uPoolWaterY + 0.02, uPoolWaterY - 0.02, vPoolPos.y);
           // Lane markings, drawn INTO the lining rather than laid on it as
           // strips of geometry, so they follow the slope of the floor exactly
           // and stop dead at the waterline like paint does.
           float lane = 0.0;
           if (uPoolLane > 0.0) {
             float band = abs(fract(vPoolPos.z / uPoolLane + 0.5) - 0.5) * uPoolLane;
             // Only along the floor, and only under water.
             lane = (1.0 - smoothstep(0.05, 0.10, band))
                  * smoothstep(uPoolWaterY - 0.35, uPoolWaterY - 0.9, vPoolPos.y);
           }
           // Caustics: two interference fields multiplied together. The
           // product is what gives the branching net; either field on its own
           // is a corrugation. Cell size matters as much as the shape — at a
           // two-metre wavelength this reads as a dirty floor.
           vec2 q = vPoolPos.xz * 6.0;
           float t = uPoolTime;
           float a = sin(q.x * 1.1 + t * 1.5) + sin(q.y * 1.3 - t * 1.2)
                   + sin((q.x + q.y) * 0.7 + t * 0.9);
           float b = sin((q.x - q.y) * 0.9 - t * 1.1) + sin(q.y * 0.8 + t * 0.6)
                   + sin(q.x * 0.6 - t * 0.8);
           // Bright along the ZERO SET of the product, not at its peaks. The
           // zero set of a*b is the union of two families of curves, which is
           // a net; thresholding the peaks instead lights up the extrema and
           // gives a field of round blobs that reads as a dirty floor.
           float net = pow(1.0 - clamp(abs(a * b) * 0.5, 0.0, 1.0), 3.0);
           // Depth tint, then the light, then the paint. Painting the lanes
           // BEFORE the caustics loses them entirely: an additive net at full
           // strength washes a dark line straight out, and a lane pool with no
           // lanes in it is just a pool.
           diffuseColor.rgb *= mix(1.0, 0.62, sub);
           // Caustics are projected straight down, so on a near-vertical
           // wall the pattern barely changes over its whole height and comes
           // out as vertical streaks. Fade them towards the walls: the light
           // pools on the floor anyway, and a wall gets a wash, not a net.
           float up = mix(0.22, 1.0, clamp(vPoolNrm.y, 0.0, 1.0));
           diffuseColor.rgb += net * sub * up * uPoolCaustic * vec3(0.36, 0.62, 0.66)
                             * (1.0 - lane * 0.65);
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.13, 0.21), lane * 0.85);
         }`
      );
  };
  material.customProgramCacheKey = () => key;
}

/** A pool. The origin is at the centre, at **deck** level. */
export function createPool(options: PoolOptions = {}): Pool {
  const style = options.style ?? 'lido';
  const spec = STYLES[style];
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const length = options.length ?? spec.length;
  const width = options.width ?? spec.width;
  const shallow = options.shallow ?? spec.shallow;
  const deep = options.deep ?? spec.deep;
  const lanes = options.lanes ?? spec.lanes;
  const apron = Math.max(0, options.deck ?? spec.apron);

  const group = new Group();
  group.name = `pool-${style}`;

  // Local geometry. The deck is y = 0, the water sits `freeboard` below it,
  // and the floor is another `depth` below the water.
  const waterY = -spec.freeboard;
  const depthAt = (x: number): number => {
    const u = Math.min(1, Math.max(0, x / length + 0.5));
    return shallow + (deep - shallow) * u;
  };
  const floorAt = (x: number): number => waterY - depthAt(x);
  const deepest = Math.max(shallow, deep);

  const uniforms = {
    uPoolTime: { value: 0 },
    uPoolWaterY: { value: waterY },
    uPoolCaustic: { value: 0.85 },
    uPoolLane: { value: lanes > 0 ? width / lanes : 0 },
  };

  const lining = createSurface(spec.lining, { color: spec.liningColor, seed });
  lineWater(lining, uniforms, `scenaPoolLining-${spec.lining}`);

  // --- The tank: four walls round a sloping floor. Not a solid with a
  // smaller solid inside it, which is invisible, and not a box with a lid.
  const t = 0.22;
  const wallH = deepest + 0.4;
  for (const [w, d, x, z] of [
    [length + t * 2, t, 0, -(width + t) / 2],
    [length + t * 2, t, 0, (width + t) / 2],
    [t, width, -(length + t) / 2, 0],
    [t, width, (length + t) / 2, 0],
  ] as Array<[number, number, number, number]>) {
    const geom = new BoxGeometry(w, wallH, d);
    geom.translate(x, -wallH / 2, z); // baked, not positioned — see lineWater
    group.add(new Mesh(geom, lining));
  }

  // The floor really slopes: a plane with its vertices dropped onto the
  // depth profile. A flat floor with a "deep end" written in the docs is the
  // version that fails the moment anyone walks into it.
  const floorGeom = new PlaneGeometry(length, width, 16, 8);
  const pos = floorGeom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // Pre-rotation the plane lies in XY, so its x is the pool's x and its
    // own z is the height that becomes world y once it is laid flat.
    pos.setZ(i, floorAt(pos.getX(i)));
  }
  floorGeom.rotateX(-Math.PI / 2); // baked, not a mesh rotation
  floorGeom.computeVertexNormals();
  const floor = new Mesh(floorGeom, lining);
  floor.name = 'floor';
  group.add(floor);

  // --- Coping: a FRAME, for the same reason the sunken tub's is. A slab
  // across the footprint is a lid over the pool.
  const deckMat = createSurface(spec.deck, { color: spec.deckColor, seed: seed + 1 });
  const cope = style === 'infinity' ? 0.3 : 0.36;
  for (const [w, d, x, z] of [
    [length + cope * 2, cope, 0, -(width + cope) / 2],
    [length + cope * 2, cope, 0, (width + cope) / 2],
    [cope, width, -(length + cope) / 2, 0],
    [cope, width, (length + cope) / 2, 0],
  ] as Array<[number, number, number, number]>) {
    const slab = new Mesh(new BoxGeometry(w, 0.08, d), deckMat);
    slab.position.set(x, -0.04, z);
    group.add(slab);
  }

  // The apron. A frame again, for the third time in two tracks: a slab across
  // the footprint would be a lid on the pool.
  if (apron > 0) {
    const ol = length + cope * 2;
    const ow = width + cope * 2;
    for (const [w, d, x, z] of [
      [ol + apron * 2, apron, 0, -(ow + apron) / 2],
      [ol + apron * 2, apron, 0, (ow + apron) / 2],
      [apron, ow, -(ol + apron) / 2, 0],
      [apron, ow, (ol + apron) / 2, 0],
    ] as Array<[number, number, number, number]>) {
      const paving = new Mesh(new BoxGeometry(w, 0.06, d), deckMat);
      paving.position.set(x, -0.05, z);
      group.add(paving);
    }
  }

  // --- The water. A big plane with a travelling chop plus ripple rings that
  // spread from wherever something disturbed it.
  const ripples: number[] = [];
  for (let i = 0; i < RIPPLES; i++) ripples.push(0, 0, -99, 0);
  const surfaceUniforms = {
    uPoolTime: uniforms.uPoolTime,
    uRipples: { value: ripples },
    uShallow: { value: shallow },
    uDeep: { value: deep },
    uLen: { value: length },
  };
  const waterMat = new MeshStandardMaterial({
    // The style's tint is the deliberate one — a plunge bath in shadow and a
    // lit lido are not the same colour of water — but a scene-wide palette
    // still gets a say, so the pool belongs to the world it is dropped in.
    color: mixHex(spec.water, palette.water, 0.25),
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    roughness: 0.06,
    metalness: 0.3,
    side: DoubleSide,
  });
  waterMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, surfaceUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec2 vPoolSurf;
         uniform float uPoolTime;
         uniform vec4 uRipples[${RIPPLES}];`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           vPoolSurf = position.xy;
           // Ambient chop, always there — a mirror-flat pool is a mirror.
           float chop = sin(position.x * 2.1 + uPoolTime * 1.4)
                      * cos(position.y * 2.7 - uPoolTime * 1.1);
           transformed.z += chop * 0.012;
           // Ripple rings. Each source carries where it was struck, when, and
           // how hard; the ring travels outward and fades with both distance
           // and age, which is the difference between a splash and a texture.
           for (int i = 0; i < ${RIPPLES}; i++) {
             vec4 r = uRipples[i];
             float age = uPoolTime - r.z;
             if (age < 0.0 || age > 4.0) continue;
             float dist = length(position.xy - r.xy);
             float front = age * 1.9;
             float ring = sin((dist - front) * 9.0);
             float near = exp(-abs(dist - front) * 2.2);
             transformed.z += ring * near * r.w * 0.05 * (1.0 - age / 4.0);
           }
         }`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec2 vPoolSurf;
         uniform float uShallow;
         uniform float uDeep;
         uniform float uLen;`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         {
           // THE deep end. A pool whose water is one flat colour has a deep
           // end only in the documentation — from above, depth is read almost
           // entirely off how much of the floor you can still see through the
           // water, so the alpha has to follow the floor rather than sit at a
           // constant. This is the single change that made the prop read as a
           // pool rather than a blue rectangle.
           float dep = mix(uShallow, uDeep, clamp(vPoolSurf.x / uLen + 0.5, 0.0, 1.0));
           float murk = smoothstep(0.5, 2.6, dep);
           diffuseColor.a *= mix(0.62, 0.97, murk);
           diffuseColor.rgb *= mix(1.18, 0.52, murk);
         }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         {
           // Fresnel. Without it there is no evidence a surface is there at
           // all: you see straight through to the tiles and the pool reads as
           // a dry tank painted blue. Water announces itself by going bright
           // and opaque at a glancing angle, which is why a pool looks like
           // glass from the far end and like nothing from directly above.
           float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 4.0);
           totalEmissiveRadiance += vec3(0.20, 0.27, 0.31) * fres;
           diffuseColor.a = clamp(diffuseColor.a + fres * 0.5, 0.0, 1.0);
         }`
      );
  };
  waterMat.customProgramCacheKey = () => 'scenaPoolSurface';
  const surface = new Mesh(new PlaneGeometry(length, width, 48, 24), waterMat);
  surface.name = 'surface';
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = waterY;
  group.add(surface);

  // --- Steps down into the shallow end.
  const stepCount = Math.max(2, Math.round(shallow / 0.3));
  const stepW = Math.min(width * 0.55, 1.6);
  for (let i = 0; i < stepCount; i++) {
    const y = -((i + 1) / stepCount) * shallow;
    const geom = new BoxGeometry(0.34, 0.09, stepW);
    geom.translate(-length / 2 + 0.17 + i * 0.34, waterY + y + 0.045, 0);
    group.add(new Mesh(geom, lining));
  }

  const entry = createSlot('poolEntry', 'stand', group, -length / 2 - cope * 0.6, 0, 0, Math.PI / 2);
  addApproach(entry, group, 0.8, 'behind');

  // --- A ladder at the deep end, publishing ANIMA's Climbable contract, so
  // getting out of a pool is the ladder code that already exists.
  let ladder: PoolLadder | null = null;
  if (spec.ladder) {
    const chrome = new MeshStandardMaterial({ color: 0xc4cace, roughness: 0.2, metalness: 0.85 });
    const rungSpacing = 0.3;
    const top = 0.85;
    const foot = floorAt(length / 2 - 0.3) + 0.1;
    const lg = new Group();
    lg.name = 'pool:ladder';
    lg.position.set(length / 2 - 0.45, 0, width / 2 - 0.28);
    // Facing the water, so a climber on `bottom` is looking at the rungs.
    lg.rotation.y = Math.PI;
    group.add(lg);
    for (const sx of [-1, 1]) {
      const rail = new Mesh(
        new CylinderGeometry(0.024, 0.024, top - foot, 8),
        chrome
      );
      rail.position.set(sx * 0.22, (top + foot) / 2, 0);
      lg.add(rail);
      // The grab handle above the deck — the bit you actually haul on.
      const bend = new Mesh(new CylinderGeometry(0.024, 0.024, 0.3, 8), chrome);
      bend.rotation.z = Math.PI / 2;
      bend.position.set(sx * 0.22, top, -0.15);
      lg.add(bend);
    }
    for (let y = foot + rungSpacing; y < 0; y += rungSpacing) {
      const rung = new Mesh(new CylinderGeometry(0.018, 0.018, 0.44, 8), chrome);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, y, 0);
      lg.add(rung);
    }
    const bottom = new Object3D();
    bottom.name = 'ladder:bottom';
    bottom.position.set(0, foot, 0);
    lg.add(bottom);
    const topAnchor = new Object3D();
    topAnchor.name = 'ladder:top';
    topAnchor.position.set(0, 0, -0.4);
    lg.add(topAnchor);
    ladder = { bottom, top: topAnchor, rungSpacing };
  }

  // --- Springboard over the deep end.
  let board: PropSlot | null = null;
  if (spec.board) {
    const bg = new Group();
    bg.name = 'pool:board';
    bg.position.set(length / 2 + cope * 0.5, 0, 0);
    group.add(bg);
    const plinth = new Mesh(
      new BoxGeometry(0.4, 0.55, 0.5),
      createSurface('paintedMetal', { color: 0xb8bcc0, seed: seed + 2 })
    );
    plinth.position.y = 0.275;
    bg.add(plinth);
    const plank = new Mesh(
      new BoxGeometry(1.9, 0.06, 0.44),
      createSurface('paintedMetal', { color: 0xe8e4d8, seed: seed + 3 })
    );
    // Cantilevered OVER the water, not sitting beside it.
    plank.position.set(-0.75, 0.56, 0);
    bg.add(plank);
    board = createSlot('dive', 'stand', bg, -1.5, 0.59, 0, Math.PI / 2);
    addApproach(board, bg, 1.4, 'behind');
  }

  // --- Sitting on the edge with your legs in the water. This is the pose
  // people in pools are actually in most of the time.
  const edges: PropSlot[] = [];
  const perSide = style === 'plunge' ? 1 : 2;
  for (const sz of [-1, 1]) {
    for (let i = 0; i < perSide; i++) {
      const x = perSide === 1 ? 0 : (i / (perSide - 1) - 0.5) * length * 0.5;
      const seat = createSlot(
        'poolEdge',
        'sitLow',
        group,
        x + rng.range(-0.2, 0.2),
        0.04,
        sz * (width / 2 + cope * 0.4),
        // Facing IN over the water. A slot anchor faces its own +z, so an
        // edge seat placed without turning it sits everyone facing the car
        // park.
        sz > 0 ? Math.PI : 0
      );
      addApproach(seat, group, 0.7, 'behind');
      edges.push(seat);
    }
  }

  const local = new Vector3();
  let nextRipple = 0;
  let time = 0;

  return {
    object: group,
    obstacleRadius: 0,
    style,
    shallow,
    deep,
    length,
    width,
    entry,
    ladder,
    board,
    edges,
    slots: [entry, ...edges, ...(board ? [board] : [])],
    get surfaceY() {
      group.updateWorldMatrix(true, false);
      return group.localToWorld(new Vector3(0, waterY, 0)).y;
    },
    depthAt(x: number, z: number) {
      group.updateWorldMatrix(true, false);
      local.set(x, 0, z);
      group.worldToLocal(local);
      // Outside the tank there is no water, which is what makes this the
      // whole "am I swimming" test on ANIMA's side.
      if (Math.abs(local.x) > length / 2 || Math.abs(local.z) > width / 2) return 0;
      return depthAt(local.x);
    },
    disturb(x: number, z: number, strength = 1) {
      group.updateWorldMatrix(true, false);
      local.set(x, 0, z);
      group.worldToLocal(local);
      // The plane is authored in XY and laid flat, so its own y is the pool's
      // z — and it is NEGATED by the -90 degree rotation about x.
      const at = nextRipple * 4;
      ripples[at] = local.x;
      ripples[at + 1] = -local.z;
      ripples[at + 2] = time;
      ripples[at + 3] = Math.min(1.5, strength);
      nextRipple = (nextRipple + 1) % RIPPLES;
    },
    update(dt: number) {
      if (dt <= 0) return;
      time += dt;
      uniforms.uPoolTime.value = time;
    },
  };
}
