import { Color, MeshPhysicalMaterial, MeshStandardMaterial, Vector2, Vector3 } from 'three';

/**
 * Procedural surface materials — the reason low-poly SCENA props can look
 * richer than a downloaded GLTF at a fraction of the bytes.
 *
 * A downloaded model ships baked albedo/normal/roughness textures (often
 * megabytes). Here the same detail — weathered stone, wood grain, mottled
 * plaster, thatch, tile — is generated in the shader from triplanar value
 * noise, so nothing is fetched and every prop is unique. The result is a
 * plain `MeshStandardMaterial` with an `onBeforeCompile` patch, so it keeps
 * three's full PBR lighting, shadows, fog, tone-mapping, and SCENA's
 * day/night emissive dimming — none of which a raw `ShaderMaterial` would.
 *
 * ```ts
 * const mat = createSurface('stone', { color: 0x8a8f98 });
 * mesh.material = mat;                       // that's it
 * ```
 *
 * Triplanar means no UVs are needed (a `BoxGeometry` has none worth using),
 * and because the noise is sampled in world space a wall built from several
 * abutting boxes reads as one continuous stone face with no visible seams.
 */
export type SurfaceKind =
  | 'plaster'
  | 'stone'
  | 'wood'
  | 'plank'
  | 'thatch'
  | 'tile'
  | 'metal'
  | 'dirt'
  // Tier 1 — ground & terrain
  | 'sand'
  | 'gravel'
  | 'mud'
  // Tier 1 — stone & masonry
  | 'sandstone'
  | 'granite'
  | 'slate'
  // Tier 1 — organic
  | 'bark'
  | 'leather'
  | 'canvas'
  | 'parchment'
  | 'terracotta'
  | 'bone'
  // Tier 1 — metals
  | 'rust'
  | 'bronze'
  | 'brass'
  // Tier 2 — masonry tiling
  | 'brick'
  | 'cobblestone'
  | 'ashlar'
  | 'floortile'
  | 'shingle'
  // Tier 3 — cap & glow
  | 'snow'
  | 'moss'
  | 'lava'
  | 'crystal'
  // Tier 4 — modern & machined
  | 'concrete'
  | 'paint'
  | 'marble'
  | 'terrazzo'
  | 'steel'
  | 'chrome'
  | 'paintedMetal'
  | 'corten'
  | 'teak'
  | 'porcelain'
  | 'glaze'
  | 'mosaic'
  | 'parquet'
  | 'patternedTile'
  // Tier 5 — industrial
  | 'corrugatedIron'
  | 'asphalt'
  | 'diamondPlate'
  | 'galvanised'
  | 'copperPatina'
  | 'basalt'
  // Tier 6 — physical (MeshPhysicalMaterial; see `physical`)
  | 'velvet'
  | 'silk'
  | 'brushedMetal'
  | 'nacre'
  | 'ice'
  | 'gemstone';

export interface SurfaceParams {
  /**
   * Natural base colour for this kind (hex int). Used when the caller passes
   * no `color`, so `createSurface('sand')` looks like sand out of the box.
   * A caller's `color` always wins.
   */
  baseColor?: number;
  /** PBR base roughness. */
  roughness: number;
  /** PBR metalness. */
  metalness: number;
  /** Noise frequency in world units (higher = finer grain). */
  scale: number;
  /** How strongly the fine noise lightens/darkens the albedo (0–1). */
  albedoVar: number;
  /** Secondary colour blended into cavities, as a hex int. */
  tint: number;
  /** How much of `tint` shows in cavities (0–1). */
  tintAmount: number;
  /** Low-frequency cavity darkening — the baked-AO look (0–1). */
  ao: number;
  /** Surface relief strength (normal perturbation from the noise). */
  bump: number;
  /** Roughness variation added from the noise (0–1). */
  roughVar: number;
  /** Anisotropic grain strength for wood-like surfaces (0 = none). */
  grain: number;
  /** Grain ring frequency. */
  grainScale: number;
  /** World axis the grain runs along. */
  grainAxis: Vector3;
  /** flatShading default for this kind. */
  flat: boolean;

  // --- masonry tiling (all optional; `tile: 0` — the default — disables it) ---
  /** Tiling strength (0 off, 1 full). Turns on the brick/tile grid. */
  tile?: number;
  /** Cell width in world metres (the length of a brick/tile). */
  tileW?: number;
  /** Cell height in world metres (the course height). */
  tileH?: number;
  /** Mortar-joint width in world metres. */
  mortar?: number;
  /** Row offset: 0 = aligned grid, 1 = half-cell running bond. */
  bond?: number;
  /** Cell profile: 0 = flat tiles, 1 = domed cobbles. */
  round?: number;
  /** Per-cell brightness/roughness jitter (0–1), so no two read alike. */
  tileJitter?: number;
  /** Mortar-joint colour, as a hex int. */
  mortarColor?: number;
  /** Groove relief strength for the joints (normal perturbation). */
  tileRelief?: number;
  /** Fraction of cells painted solid `tint` (mosaic accent chips, 0–1). */
  tileTint?: number;
  /** 1 = shear alternate column bands ±45° — chevron/herringbone parquet. */
  chevron?: number;
  /** Per-cell ring + dot motif painted in `tint` (patterned cement tiles). */
  motif?: number;

  // --- snow / moss cap (settles on up-facing faces; `cap: 0` disables it) ---
  /** Cap strength (0 off, 1 full) — snow, moss, dust on the tops. */
  cap?: number;
  /** Cap colour, as a hex int (white snow, green moss…). */
  capColor?: number;
  /** How up-facing a face must be before the cap takes (0 everywhere … 1 only dead-level tops). */
  capUp?: number;
  /** Softness of the cap edge (bigger = more gradual). */
  capSharp?: number;
  /** Roughness inside the capped area (fresh snow reads matte/bright). */
  capRough?: number;

  // --- physical: light responses MeshStandardMaterial cannot produce -----
  /**
   * Build a `MeshPhysicalMaterial` instead of a `MeshStandardMaterial`.
   *
   * Some surfaces are defined by a light response the standard model has no
   * term for at all — the retroreflective rim of velvet, the stretched
   * highlight on silk, the thin-film hue shift on a shell, light going
   * THROUGH ice. None of those can be faked with albedo and roughness.
   *
   * It costs: a physical material is a bigger shader, and `transmission` in
   * particular makes three render the scene a second time into a buffer. Use
   * it on OBJECTS, not on facades — which is exactly why `createGlass` fakes
   * its glass rather than transmitting it.
   */
  physical?: boolean;
  /** Sheen strength — velvet, felt, wool. The rim IS the material. */
  sheen?: number;
  /** Sheen colour, as a hex int. */
  sheenColor?: number;
  /** Sheen roughness. */
  sheenRough?: number;
  /**
   * Anisotropy strength: a stretched highlight instead of a round one.
   * Silk, brushed metal, carbon fibre. NOTE it follows the geometry's UVs,
   * so a mesh with no UV attribute will not show it.
   */
  anisotropy?: number;
  /** Which way the grain runs, in radians. */
  anisotropyRotation?: number;
  /** Thin-film iridescence — nacre, beetle shell, oil on water. */
  iridescence?: number;
  /** Iridescent film IOR. */
  iridescenceIOR?: number;
  /** Film thickness range in nanometres, [min, max]. */
  iridescenceThickness?: [number, number];
  /** Transmission: light passing THROUGH. Expensive — see `physical`. */
  transmission?: number;
  /** How thick the volume is, for transmission. */
  thickness?: number;
  /** Index of refraction (water 1.33, ice 1.31, glass 1.5, diamond 2.42). */
  ior?: number;
  /**
   * Chromatic dispersion: how far apart the red and blue refractions fall.
   *
   * A real transparent solid has a DIFFERENT index of refraction for every
   * wavelength, which is why a cut stone throws colour and a window does not.
   * three refracts red, green and blue separately over
   * `ior ± (ior - 1) * 0.025 * dispersion`, so the spread grows with the IOR
   * as well — 0 is a plain glass, 10 on a diamond-grade IOR is a gemstone.
   *
   * Needs `transmission` and a non-zero `thickness`: with nothing passing
   * through the volume there is nothing to split. Costs a third transmission
   * sample per pixel.
   */
  dispersion?: number;
  /** Colour light picks up on its way through, as a hex int. */
  attenuationColor?: number;
  /** How far light travels before it is fully attenuated, in metres. */
  attenuationDistance?: number;

  // --- ribs: parallel ridges (opt-in; `ribs: 0` — the default — is flat) ---
  /** Ridge relief strength (0 off). Corrugated sheet, fluting, tread plate. */
  ribs?: number;
  /** Ridges per world metre. */
  ribScale?: number;
  /**
   * 1 = turn the ridges through 90° on the face. Ribs are laid out in the
   * FACE's own plane, not along a world axis: two world axes that differ in
   * space collapse onto the same direction once projected onto a wall, which
   * turned a crossed tread plate back into plain stripes.
   */
  ribTurn?: number;
  /** 1 = a second set crossed over the first: the diamond studs of tread plate. */
  ribCross?: number;

  // --- aggregate: hard-edged chips (opt-in; `speck: 0` — the default — off) ---
  /**
   * Chip contrast. The rest of the shader runs on smooth fbm, which reads as
   * mottling; asphalt is STONES IN TAR, and stones have edges.
   */
  speck?: number;
  /** Chips per world metre. */
  speckScale?: number;

  // --- cells: warped Voronoi (opt-in; `cells: 0` — the default — off) ---
  /**
   * Cell strength. Irregular polygons: the columnar jointing of basalt and
   * the zinc spangle on galvanised steel are the same function at two very
   * different scales.
   */
  cells?: number;
  /** Cells per world metre. */
  cellScale?: number;
  /** How dark and deep the seams between cells run (0–1). */
  cellEdge?: number;
  /** Per-cell brightness jitter (0–1). */
  cellJitter?: number;
  /**
   * 1 = lay the cells out in PLAN and extrude them vertically, whatever the
   * face is pointing at. That is what columnar jointing is — a crazy paving
   * seen from above, pulled up into columns — and projecting it per-face
   * instead gives blotches on a wall rather than columns in a cliff.
   */
  cellPlan?: number;

  // --- crust: a mineral layer (opt-in; `crust: 0` — the default — off) ---
  /**
   * How much crust has grown: verdigris on copper, a rust bloom, lichen.
   * It takes in the cavities and on the up-facing side, and it is a CRUST,
   * not a tint — wherever it takes hold the metalness goes with it, because
   * a mineral scab does not reflect like the metal underneath.
   */
  crust?: number;
  /** Crust colour, as a hex int (verdigris green, rust orange…). */
  crustColor?: number;
  /** Roughness inside the crust. */
  crustRough?: number;

  // --- wear: water (opt-in; `wet: 0` — the default — is bone dry) ---
  /**
   * How wet the surface is: 0 dry, 1 running with water.
   *
   * This is a STATE, not a kind. Every one of the presets above can be
   * rained on, and water behaves the same way on all of them — it darkens
   * the albedo, collapses the roughness to a film, and, most of all, it
   * POOLS: at a light wetting only the hollows and the mortar joints are
   * dark and glossy, and the face only sheets over when it is properly
   * raining.
   */
  wet?: number;
  /**
   * How well water clings to vertical faces: 0 = only the tops ever get
   * wet, 1 = a wall wets as fast as a floor. Default 0.55 — rain falls
   * down, so a sill soaks while the wall under it is merely damp. Sealed,
   * shedding surfaces (glass, glaze, chrome) want less; things that wick
   * (plaster, concrete, canvas) want more.
   */
  wetCling?: number;

  // --- emissive glow (opt-in; `glow: 0` — the default — keeps it dark) ---
  /** Glow strength added straight to emissive radiance (lava, crystal, runes). */
  glow?: number;
  /** Glow colour, as a hex int. */
  glowColor?: number;
  /** How much of the surface glows: low = only the deep cracks, high = most of it. */
  glowThreshold?: number;
}

const V = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

export const SURFACE_PRESETS: Record<SurfaceKind, SurfaceParams> = {
  // Lime-washed cottage walls: soft warm mottle, gentle relief.
  plaster: {
    baseColor: 0xd9ccb0,
    roughness: 0.92, metalness: 0, scale: 3.4, albedoVar: 0.14, tint: 0x9c8f74,
    tintAmount: 0.12, ao: 0.18, bump: 0.15, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Rough weathered stone: strong cavity AO + mossy tint, pitted relief.
  stone: {
    baseColor: 0x8a8f98,
    roughness: 0.96, metalness: 0, scale: 2.6, albedoVar: 0.26, tint: 0x5c6b44,
    tintAmount: 0.16, ao: 0.34, bump: 0.42, roughVar: 0.14, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Structural timber: pronounced grain rings darkening the albedo.
  wood: {
    baseColor: 0x8a6642,
    roughness: 0.82, metalness: 0, scale: 5.5, albedoVar: 0.12, tint: 0x3a2a1c,
    tintAmount: 0.14, ao: 0.16, bump: 0.12, roughVar: 0.12, grain: 0.55,
    grainScale: 3.2, grainAxis: V(0, 1, 0), flat: true,
  },
  // Sawn planks: finer, straighter grain, a touch smoother.
  plank: {
    baseColor: 0x9a7a52,
    roughness: 0.78, metalness: 0, scale: 6.5, albedoVar: 0.1, tint: 0x40301f,
    tintAmount: 0.1, ao: 0.12, bump: 0.1, roughVar: 0.1, grain: 0.4,
    grainScale: 5.0, grainAxis: V(1, 0, 0), flat: true,
  },
  // Straw thatch: busy fibrous streaking, high roughness, deep shadowing.
  thatch: {
    baseColor: 0xb39a5c,
    roughness: 0.98, metalness: 0, scale: 9.0, albedoVar: 0.3, tint: 0x6a5324,
    tintAmount: 0.2, ao: 0.28, bump: 0.3, roughVar: 0.08, grain: 0.35,
    grainScale: 8.0, grainAxis: V(0, 0, 1), flat: true,
  },
  // Clay roof tiles: regular ridged rows, warm cavity tint.
  tile: {
    baseColor: 0xa8563e,
    roughness: 0.7, metalness: 0, scale: 4.0, albedoVar: 0.14, tint: 0x6e2f22,
    tintAmount: 0.16, ao: 0.24, bump: 0.34, roughVar: 0.1, grain: 0.6,
    grainScale: 6.0, grainAxis: V(1, 0, 0), flat: true,
  },
  // Aged iron/bronze: mild mottle, low roughness variance, metallic.
  metal: {
    baseColor: 0x3d4451,
    roughness: 0.52, metalness: 0.85, scale: 4.5, albedoVar: 0.16, tint: 0x2a2118,
    tintAmount: 0.18, ao: 0.22, bump: 0.16, roughVar: 0.2, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Packed earth: broad soft variation, strong low-frequency patches.
  dirt: {
    baseColor: 0x8a7a58,
    roughness: 1.0, metalness: 0, scale: 2.0, albedoVar: 0.22, tint: 0x4a3524,
    tintAmount: 0.2, ao: 0.3, bump: 0.1, roughVar: 0.05, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },

  // --- Tier 1: ground & terrain -----------------------------------------
  // Fine granular sand with soft wind ripples; smooth-shaded dunes.
  sand: {
    baseColor: 0xcbb98a,
    roughness: 1.0, metalness: 0, scale: 7.0, albedoVar: 0.16, tint: 0x9c8048,
    tintAmount: 0.14, ao: 0.14, bump: 0.14, roughVar: 0.06, grain: 0.18,
    grainScale: 3.0, grainAxis: V(1, 0, 0), flat: false,
  },
  // Loose gravel / riverbed: chunky faceted stones, strong relief.
  gravel: {
    baseColor: 0x9a948a,
    roughness: 0.95, metalness: 0, scale: 5.5, albedoVar: 0.3, tint: 0x605a4f,
    tintAmount: 0.18, ao: 0.32, bump: 0.5, roughVar: 0.16, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Wet churned mud: darkened patches with a damp sheen (lower roughness).
  mud: {
    baseColor: 0x4a3826,
    roughness: 0.6, metalness: 0, scale: 2.4, albedoVar: 0.2, tint: 0x241708,
    tintAmount: 0.3, ao: 0.34, bump: 0.16, roughVar: 0.24, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },

  // --- Tier 1: stone & masonry ------------------------------------------
  // Warm sandstone: soft, faintly streaked, gentle relief — temples, cliffs.
  sandstone: {
    baseColor: 0xc9a06a,
    roughness: 0.9, metalness: 0, scale: 3.4, albedoVar: 0.18, tint: 0x8a6a3c,
    tintAmount: 0.16, ao: 0.22, bump: 0.24, roughVar: 0.1, grain: 0.22,
    grainScale: 2.4, grainAxis: V(0, 1, 0), flat: true,
  },
  // Speckled granite: fine mineral fleck, low relief, a hint of polish.
  granite: {
    baseColor: 0x8e8a94,
    roughness: 0.58, metalness: 0, scale: 9.0, albedoVar: 0.34, tint: 0x45414d,
    tintAmount: 0.14, ao: 0.14, bump: 0.12, roughVar: 0.2, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Dark slate: blue-grey cleavage plates, low roughness, subtle streaks.
  slate: {
    baseColor: 0x50565e,
    roughness: 0.55, metalness: 0, scale: 3.0, albedoVar: 0.14, tint: 0x2c3540,
    tintAmount: 0.2, ao: 0.2, bump: 0.18, roughVar: 0.12, grain: 0.2,
    grainScale: 3.0, grainAxis: V(1, 0, 0), flat: true,
  },

  // --- Tier 1: organic --------------------------------------------------
  // Tree bark: deep vertical ridges (grain rings around the trunk axis).
  bark: {
    baseColor: 0x5a4535,
    roughness: 0.92, metalness: 0, scale: 6.0, albedoVar: 0.2, tint: 0x2a1c10,
    tintAmount: 0.2, ao: 0.26, bump: 0.45, roughVar: 0.12, grain: 0.7,
    grainScale: 5.5, grainAxis: V(0, 1, 0), flat: true,
  },
  // Leather / hide: soft mottled grain with a gentle sheen — straps, armour.
  leather: {
    baseColor: 0x6a4630,
    roughness: 0.62, metalness: 0, scale: 5.0, albedoVar: 0.16, tint: 0x2e1a0f,
    tintAmount: 0.22, ao: 0.2, bump: 0.18, roughVar: 0.12, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },
  // Woven canvas: fine directional weave, matte — tents, sails, sacks.
  canvas: {
    baseColor: 0xcabd9c,
    roughness: 0.95, metalness: 0, scale: 11.0, albedoVar: 0.14, tint: 0x8a7a5c,
    tintAmount: 0.12, ao: 0.14, bump: 0.12, roughVar: 0.06, grain: 0.3,
    grainScale: 12.0, grainAxis: V(1, 0, 0), flat: false,
  },
  // Aged parchment: near-white with soft foxing stains — signs, scrolls.
  parchment: {
    baseColor: 0xe0d4b0,
    roughness: 0.9, metalness: 0, scale: 3.0, albedoVar: 0.12, tint: 0x9a8558,
    tintAmount: 0.18, ao: 0.16, bump: 0.08, roughVar: 0.06, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },
  // Unglazed terracotta: warm clay, smooth, low relief — pots, urns.
  terracotta: {
    baseColor: 0xb5623a,
    roughness: 0.72, metalness: 0, scale: 4.0, albedoVar: 0.12, tint: 0x7a3a20,
    tintAmount: 0.16, ao: 0.16, bump: 0.14, roughVar: 0.08, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },
  // Weathered bone / ivory: off-white with cavity staining — ossuaries, décor.
  bone: {
    baseColor: 0xdcd2ba,
    roughness: 0.55, metalness: 0, scale: 6.0, albedoVar: 0.14, tint: 0x8a7f66,
    tintAmount: 0.2, ao: 0.22, bump: 0.12, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },

  // --- Tier 1: metals ---------------------------------------------------
  // Rusted iron: patchy orange corrosion, part-metallic, high roughness spread.
  rust: {
    baseColor: 0x8a4a2c,
    roughness: 0.85, metalness: 0.25, scale: 4.0, albedoVar: 0.28, tint: 0x5a2a12,
    tintAmount: 0.3, ao: 0.26, bump: 0.28, roughVar: 0.3, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Bronze: warm dark metal with patina in the cavities — bells, statues.
  bronze: {
    baseColor: 0x9a6a3a,
    roughness: 0.44, metalness: 0.9, scale: 4.5, albedoVar: 0.16, tint: 0x3a2410,
    tintAmount: 0.24, ao: 0.22, bump: 0.16, roughVar: 0.18, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },
  // Brass: brighter warm metal, smoother and shinier — fittings, instruments.
  brass: {
    baseColor: 0xc9a24a,
    roughness: 0.34, metalness: 0.95, scale: 5.0, albedoVar: 0.12, tint: 0x6a4a12,
    tintAmount: 0.16, ao: 0.16, bump: 0.1, roughVar: 0.14, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
  },

  // --- Tier 2: masonry tiling -------------------------------------------
  // Fired brick in running bond: long thin courses, pale mortar, bricks that
  // each weather a little differently.
  brick: {
    baseColor: 0x9e4a34,
    roughness: 0.86, metalness: 0, scale: 6.0, albedoVar: 0.14, tint: 0x5a2418,
    tintAmount: 0.16, ao: 0.2, bump: 0.1, roughVar: 0.12, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    tile: 1, tileW: 0.25, tileH: 0.085, mortar: 0.014, bond: 1, round: 0,
    tileJitter: 0.18, mortarColor: 0xb3a892, tileRelief: 0.06,
  },
  // Rounded cobblestones: small domed setts, wide earthy joints, heavy
  // per-stone variation — streets and courtyards.
  cobblestone: {
    baseColor: 0x8a8f98,
    roughness: 0.9, metalness: 0, scale: 5.0, albedoVar: 0.2, tint: 0x4a4436,
    tintAmount: 0.18, ao: 0.28, bump: 0.2, roughVar: 0.14, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    tile: 1, tileW: 0.17, tileH: 0.15, mortar: 0.03, bond: 1, round: 1,
    tileJitter: 0.24, mortarColor: 0x35322b, tileRelief: 0.13,
  },
  // Ashlar: large squared blocks, tight fine joints — castle and keep walls.
  ashlar: {
    baseColor: 0xb9b2a4,
    roughness: 0.9, metalness: 0, scale: 3.0, albedoVar: 0.16, tint: 0x7a725f,
    tintAmount: 0.16, ao: 0.2, bump: 0.12, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    tile: 1, tileW: 0.55, tileH: 0.32, mortar: 0.02, bond: 0.5, round: 0,
    tileJitter: 0.1, mortarColor: 0x857e6f, tileRelief: 0.05,
  },
  // Floor tiles: an aligned grid of square flags, dark grout, low relief —
  // halls and plazas.
  floortile: {
    baseColor: 0x6a6e72,
    roughness: 0.5, metalness: 0, scale: 4.0, albedoVar: 0.12, tint: 0x33363a,
    tintAmount: 0.16, ao: 0.16, bump: 0.08, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    tile: 1, tileW: 0.4, tileH: 0.4, mortar: 0.014, bond: 0, round: 0,
    tileJitter: 0.12, mortarColor: 0x2a2a2c, tileRelief: 0.045,
  },
  // Wooden shingles: overlapping courses with grain, deep shadow lines —
  // roofs and spires.
  shingle: {
    baseColor: 0x6b4a33,
    roughness: 0.85, metalness: 0, scale: 6.0, albedoVar: 0.16, tint: 0x2e2012,
    tintAmount: 0.18, ao: 0.24, bump: 0.12, roughVar: 0.12, grain: 0.32,
    grainScale: 6.0, grainAxis: V(0, 1, 0), flat: true,
    tile: 1, tileW: 0.2, tileH: 0.13, mortar: 0.012, bond: 1, round: 0,
    tileJitter: 0.2, mortarColor: 0x241811, tileRelief: 0.09,
  },

  // --- Tier 3: cap & glow -----------------------------------------------
  // Snow settled on cold rock: white on every up-facing face, grey stone on
  // the sides, its edge broken by the noise. Cap works on any surface.
  snow: {
    baseColor: 0x9aa0a8,
    roughness: 0.9, metalness: 0, scale: 4.0, albedoVar: 0.14, tint: 0x6a7280,
    tintAmount: 0.14, ao: 0.2, bump: 0.24, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    cap: 0.95, capColor: 0xf4f8fc, capUp: 0.12, capSharp: 0.32, capRough: 0.9,
  },
  // Moss creeping over a boulder: grey stone with green growth on the tops
  // and shoulders, thicker (lower capUp) than snow.
  moss: {
    baseColor: 0x8a8f88,
    roughness: 0.94, metalness: 0, scale: 3.5, albedoVar: 0.2, tint: 0x4a5240,
    tintAmount: 0.16, ao: 0.28, bump: 0.34, roughVar: 0.12, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    cap: 0.74, capColor: 0x40592a, capUp: 0.34, capSharp: 0.3, capRough: 0.96,
  },
  // Cooling lava: dark basalt crust with molten orange glowing up through the
  // cracks. The glow burns constant, day or night.
  lava: {
    baseColor: 0x2a1712,
    roughness: 0.88, metalness: 0, scale: 3.2, albedoVar: 0.18, tint: 0x120806,
    tintAmount: 0.26, ao: 0.34, bump: 0.5, roughVar: 0.14, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    glow: 2.6, glowColor: 0xff5a1e, glowThreshold: 0.3,
  },
  // Glowing crystal: faceted blue mineral lit from within — most of the face
  // emits, the deepest cavities darkest.
  crystal: {
    baseColor: 0x3a5c8a,
    roughness: 0.22, metalness: 0, scale: 5.0, albedoVar: 0.14, tint: 0x1a2f52,
    tintAmount: 0.2, ao: 0.16, bump: 0.3, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    glow: 1.5, glowColor: 0x6fd6ff, glowThreshold: 0.72,
  },

  // --- Tier 4: modern & machined ----------------------------------------
  // Fair-faced concrete: near-even grey with fine mottle and shutter-panel
  // joint lines (the tiling grid, dialed way down) — the modern wall.
  concrete: {
    baseColor: 0xb5b3ac,
    roughness: 0.88, metalness: 0, scale: 3.0, albedoVar: 0.08, tint: 0x8a887f,
    tintAmount: 0.08, ao: 0.12, bump: 0.06, roughVar: 0.08, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    tile: 1, tileW: 1.2, tileH: 0.6, mortar: 0.006, bond: 0, round: 0,
    tileJitter: 0.05, mortarColor: 0x9a9891, tileRelief: 0.03,
  },
  // Modern painted render: almost flat, just enough micro-variation to be a
  // material at all. Colour it anything; satin sheen.
  paint: {
    baseColor: 0xdedbd2,
    roughness: 0.6, metalness: 0, scale: 6.0, albedoVar: 0.04, tint: 0xb8b4a8,
    tintAmount: 0.05, ao: 0.05, bump: 0.02, roughVar: 0.05, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },
  // Polished marble: near-white slab, dark warped veins (the grain rings at a
  // very low frequency), glossy — lobby floors and counters.
  marble: {
    baseColor: 0xe8e6e0,
    roughness: 0.22, metalness: 0, scale: 1.6, albedoVar: 0.08, tint: 0x7a8494,
    tintAmount: 0.12, ao: 0.08, bump: 0.04, roughVar: 0.08, grain: 0.5,
    grainScale: 0.7, grainAxis: V(0.35, 1, 0.2), flat: false,
  },
  // Terrazzo: a cement field packed with tiny per-cell chips, a share of them
  // in the accent tint — the classic speckled floor.
  terrazzo: {
    baseColor: 0xd8d2c6,
    roughness: 0.35, metalness: 0, scale: 10.0, albedoVar: 0.1, tint: 0x6a604f,
    tintAmount: 0.04, ao: 0.06, bump: 0.03, roughVar: 0.08, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    tile: 1, tileW: 0.045, tileH: 0.045, mortar: 0.01, bond: 0, round: 1,
    tileJitter: 0.35, mortarColor: 0xcfc9bd, tileRelief: 0.02, tileTint: 0.18,
  },
  // Brushed stainless steel: fine directional streaks (the grain machinery
  // pointed at metal), cool and semi-gloss — railings, kick plates.
  steel: {
    baseColor: 0xaeb4bc,
    roughness: 0.38, metalness: 0.92, scale: 8.0, albedoVar: 0.06, tint: 0x6a707a,
    tintAmount: 0.08, ao: 0.06, bump: 0.03, roughVar: 0.18, grain: 0.3,
    grainScale: 26.0, grainAxis: V(1, 0, 0), flat: false,
  },
  // Chrome: near-mirror metal — fittings and trim. (Stylized: no envmap, the
  // lighting rig does the selling.)
  chrome: {
    baseColor: 0xc9ced4,
    roughness: 0.08, metalness: 1.0, scale: 5.0, albedoVar: 0.04, tint: 0x8a9098,
    tintAmount: 0.05, ao: 0.04, bump: 0.01, roughVar: 0.05, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },
  // Powder-coated metal: coloured semi-gloss with a whisper of orange peel —
  // gates, frames, railings. Colour it from the palette.
  paintedMetal: {
    baseColor: 0x44505c,
    roughness: 0.42, metalness: 0.35, scale: 14.0, albedoVar: 0.04, tint: 0x222a30,
    tintAmount: 0.06, ao: 0.06, bump: 0.04, roughVar: 0.08, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },
  // Corten weathering steel: the even architectural oxide bloom, warmer and
  // calmer than 'rust' — feature walls and planters.
  corten: {
    baseColor: 0x9a5a34,
    roughness: 0.82, metalness: 0.18, scale: 3.2, albedoVar: 0.16, tint: 0x5a2e16,
    tintAmount: 0.22, ao: 0.16, bump: 0.1, roughVar: 0.18, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },
  // Oiled teak: warm decking/furniture wood under a varnish sheen.
  teak: {
    baseColor: 0x8a5c36,
    roughness: 0.3, metalness: 0, scale: 6.0, albedoVar: 0.08, tint: 0x3c2614,
    tintAmount: 0.12, ao: 0.1, bump: 0.05, roughVar: 0.08, grain: 0.45,
    grainScale: 4.5, grainAxis: V(1, 0, 0), flat: false,
  },
  // Large-format porcelain: big glossy slabs, hairline grout, offset courses.
  porcelain: {
    baseColor: 0xd9d6cf,
    roughness: 0.18, metalness: 0, scale: 3.0, albedoVar: 0.05, tint: 0x9a968c,
    tintAmount: 0.06, ao: 0.08, bump: 0.03, roughVar: 0.06, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    tile: 1, tileW: 1.2, tileH: 0.6, mortar: 0.005, bond: 0.5, round: 0,
    tileJitter: 0.06, mortarColor: 0xb0aca2, tileRelief: 0.03,
  },
  // Vitreous glaze: sanitaryware. Note it is NOT 'porcelain' — that preset is
  // large-format porcelain FLOOR TILE, complete with grout, and a bath shell
  // built from it comes out looking like a tiled box rather than one fired
  // piece. Glaze is a single unbroken skin: glossy, almost no variation, and
  // no tiling at all.
  glaze: {
    baseColor: 0xf2f0ea,
    roughness: 0.12, metalness: 0, scale: 5.0, albedoVar: 0.02, tint: 0xc8c6be,
    tintAmount: 0.05, ao: 0.07, bump: 0.008, roughVar: 0.03, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
  },
  // Glass mosaic: tiny gridded tesserae, strong per-chip variation, a share of
  // accent-tint chips, pale grout — pools and feature walls.
  mosaic: {
    baseColor: 0x3f7fae,
    roughness: 0.25, metalness: 0, scale: 8.0, albedoVar: 0.08, tint: 0x1d4e74,
    tintAmount: 0.05, ao: 0.08, bump: 0.04, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    tile: 1, tileW: 0.055, tileH: 0.055, mortar: 0.006, bond: 0, round: 0,
    tileJitter: 0.3, mortarColor: 0xd8d4c8, tileRelief: 0.05, tileTint: 0.3,
  },
  // Chevron parquet: narrow varnished planks laid in alternating ±45° bands.
  parquet: {
    baseColor: 0x9a6b40,
    roughness: 0.32, metalness: 0, scale: 6.0, albedoVar: 0.07, tint: 0x4a2f18,
    tintAmount: 0.1, ao: 0.08, bump: 0.04, roughVar: 0.08, grain: 0.3,
    grainScale: 7.0, grainAxis: V(1, 0, 0), flat: false,
    tile: 1, tileW: 0.5, tileH: 0.09, mortar: 0.006, bond: 0, round: 0,
    tileJitter: 0.14, mortarColor: 0x5a3b22, tileRelief: 0.04, chevron: 1,
  },
  // Patterned cement tiles: a cream field, each tile stamped with a ring-and-
  // dot motif in the tint colour — verandas, courtyards, feature floors.
  patternedTile: {
    baseColor: 0xdcd7c9,
    roughness: 0.3, metalness: 0, scale: 3.0, albedoVar: 0.05, tint: 0x365f74,
    tintAmount: 0.04, ao: 0.08, bump: 0.03, roughVar: 0.06, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    tile: 1, tileW: 0.33, tileH: 0.33, mortar: 0.008, bond: 0, round: 0,
    tileJitter: 0.05, mortarColor: 0xa9a396, tileRelief: 0.035, motif: 0.9,
  },

  // --- Tier 5: industrial ------------------------------------------------
  // Sheet steel rolled into a wave, galvanised, and left out in the rain.
  // The corrugation is the ONLY reason a flat plane reads as a roof from
  // fifty metres, and it is why this is the most recognisable industrial
  // material there is: a shanty wall, a barn, a lock-up, a site hoarding.
  corrugatedIron: {
    baseColor: 0x9aa2a6,
    roughness: 0.58, metalness: 0.5, scale: 9, albedoVar: 0.1, tint: 0x6a5545,
    tintAmount: 0.16, ao: 0.16, bump: 0.35, roughVar: 0.18, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    ribs: 1, ribScale: 5,
    // Rust takes in the valleys, where the water sits — but a sheet that is
    // more rust than iron reads as rust, not as a roof.
    crust: 0.3, crustColor: 0x8a4a26, crustRough: 0.95,
  },
  // Stones in tar. The chips are the point: a smooth mottle is mud, and
  // the reason a road reads as a road at all is that it is visibly made of
  // gravel somebody poured glue over.
  asphalt: {
    baseColor: 0x3b3b3e,
    roughness: 0.93, metalness: 0, scale: 14, albedoVar: 0.1, tint: 0x1e1e20,
    tintAmount: 0.18, ao: 0.2, bump: 0.4, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    speck: 0.42, speckScale: 40,
  },
  // Tread plate: raised studs in a diamond lattice, so a gantry floor has
  // grip and a stair tread reads as a stair tread.
  diamondPlate: {
    baseColor: 0x8d9399,
    roughness: 0.44, metalness: 0.55, scale: 12, albedoVar: 0.05, tint: 0x5c6166,
    tintAmount: 0.1, ao: 0.1, bump: 0.5, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    ribs: 1, ribScale: 6, ribCross: 1,
  },
  // THE SPANGLE is the whole material: hot-dip galvanising freezes into
  // visible zinc crystals, each catching the light its own way, and no
  // other metal has that.
  galvanised: {
    baseColor: 0xa9b1b5,
    roughness: 0.46, metalness: 0.5, scale: 3.5, albedoVar: 0.04, tint: 0x7d868b,
    tintAmount: 0.06, ao: 0.05, bump: 0.1, roughVar: 0.05, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    // Grains you can SEE, each catching the light its own way. Real spangle
    // is millimetres, but a crystal too small to resolve is not a crystal —
    // it is per-pixel noise, and on a metal that is a sparkling mess.
    cells: 1, cellScale: 6, cellEdge: 0.22, cellJitter: 0.4,
  },
  // Copper does not stay copper. Verdigris grows in the cavities and on
  // the up-facing side, and where it grows the metal is gone — which is
  // why a green roof is matte and a copper one is not.
  copperPatina: {
    baseColor: 0x9c5b34,
    roughness: 0.42, metalness: 0.75, scale: 6, albedoVar: 0.08, tint: 0x6b3a1f,
    tintAmount: 0.12, ao: 0.14, bump: 0.2, roughVar: 0.12, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    crust: 0.95, crustColor: 0x4fa88a, crustRough: 0.92,
  },
  // Columnar jointing: lava that cooled slowly and cracked into polygons,
  // then stood up as columns. Laid out in PLAN and extruded, because that
  // is what the rock actually did.
  basalt: {
    baseColor: 0x54585e,
    roughness: 0.86, metalness: 0.04, scale: 3, albedoVar: 0.06, tint: 0x2b2e33,
    tintAmount: 0.12, ao: 0.16, bump: 0.5, roughVar: 0.1, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    cells: 1, cellScale: 3.2, cellEdge: 0.85, cellJitter: 0.16, cellPlan: 1,
  },

  // --- Tier 6: physical --------------------------------------------------
  // Each of these is defined by a light response the standard model has no
  // term for. They are the one part of the catalogue that costs more than a
  // MeshStandardMaterial, and they are worth it only because nothing else
  // gets you there.

  // THE RIM IS THE MATERIAL. Velvet is dark where you look straight at it
  // and bright at every grazing edge, because the pile scatters sideways —
  // and no amount of albedo and roughness produces that.
  velvet: {
    baseColor: 0x6d1730,
    roughness: 0.92, metalness: 0, scale: 7, albedoVar: 0.05, tint: 0x3a0a19,
    tintAmount: 0.14, ao: 0.12, bump: 0.015, roughVar: 0.03, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    physical: true, sheen: 1, sheenColor: 0xd8869c, sheenRough: 0.32,
  },
  // A stretched highlight instead of a round one: the thread runs one way,
  // so the light does too.
  silk: {
    baseColor: 0xc9b7d8,
    roughness: 0.2, metalness: 0.05, scale: 6, albedoVar: 0.04, tint: 0x8f7fa6,
    tintAmount: 0.08, ao: 0.06, bump: 0.01, roughVar: 0.02, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    physical: true, anisotropy: 0.9, anisotropyRotation: 0,
    sheen: 0.35, sheenColor: 0xffffff, sheenRough: 0.2,
  },
  // The linisher went one way. Brushed aluminium, a kitchen front, a lift
  // door — the streak is the only thing separating it from plain steel.
  brushedMetal: {
    baseColor: 0xb4b9be,
    roughness: 0.34, metalness: 0.7, scale: 5, albedoVar: 0.02, tint: 0x8b9196,
    tintAmount: 0.04, ao: 0.03, bump: 0.008, roughVar: 0.02, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    physical: true, anisotropy: 0.95, anisotropyRotation: Math.PI / 2,
  },
  // Thin-film interference: the hue depends on how thick the film is and
  // which way you are looking, which is why a shell has no fixed colour.
  nacre: {
    baseColor: 0xdcd8d0,
    roughness: 0.12, metalness: 0.2, scale: 4, albedoVar: 0.04, tint: 0xa8b0c0,
    tintAmount: 0.18, ao: 0.05, bump: 0.02, roughVar: 0.02, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    // Low metalness on purpose. Iridescence is strongest over a metallic
    // F0, but a metal with no environment map to reflect renders as dead
    // grey — so the film sits over a pale pearl instead, and a thick one
    // (a high IOR) makes the highlight visibly COLOURED rather than white.
    physical: true, iridescence: 1, iridescenceIOR: 2.4,
    iridescenceThickness: [300, 900],
  },
  // Light goes THROUGH. The cells are the fracture planes inside it — ice
  // is not clear, it is full of the cracks it froze around.
  ice: {
    baseColor: 0xcfe8f2,
    roughness: 0.13, metalness: 0, scale: 2.5, albedoVar: 0.05, tint: 0x7fb4cc,
    tintAmount: 0.14, ao: 0.08, bump: 0.06, roughVar: 0.03, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: false,
    cells: 1, cellScale: 1.8, cellEdge: 0.22, cellJitter: 0.08,
    physical: true, transmission: 0.85, thickness: 0.5, ior: 1.31,
    attenuationColor: 0x9fd4e8, attenuationDistance: 1.4,
  },
  // WHY A STONE IS CUT AT ALL. Glass and diamond are both transparent; the
  // difference you can see across a room is that diamond has a different
  // index of refraction for every wavelength, so the white light that goes
  // in comes out separated. Facets exist to make that happen more often.
  //
  // Both halves of that are here. `dispersion` does the splitting — and the
  // spread scales with the IOR, so a gem-grade 2.2 throws far more colour
  // than a window's 1.5 at the same setting. `flat: true` does the facets:
  // flat shading on a low-poly solid IS a cut stone, and the coarse cells
  // are the inclusions that stop it looking like moulded acrylic.
  gemstone: {
    baseColor: 0xe6f4ff,
    roughness: 0.03, metalness: 0, scale: 3.5, albedoVar: 0.03, tint: 0x8fc2e8,
    tintAmount: 0.08, ao: 0.02, bump: 0, roughVar: 0.015, grain: 0,
    grainScale: 1, grainAxis: V(0, 1, 0), flat: true,
    cells: 0.5, cellScale: 2.2, cellEdge: 0.12, cellJitter: 0.25,
    // A long attenuation distance on purpose. The colour is supposed to come
    // OUT of the stone, and one that swallows the light on its way through
    // is a dark blob whatever the IOR is doing.
    physical: true, transmission: 1, thickness: 0.55, ior: 2.2, dispersion: 14,
    attenuationColor: 0xb8e4ff, attenuationDistance: 2.4,
  },
};

export interface SurfaceOptions extends Partial<SurfaceParams> {
  /** Base colour (hex int or three Color). Defaults to a neutral grey. */
  color?: number | Color;
  /**
   * Seed offset so two props with the same colour still weather
   * differently. Any number; shifts the noise field.
   */
  seed?: number;
}

// ---- GLSL --------------------------------------------------------------

const NOISE_GLSL = /* glsl */ `
// World-space coordinates get large (props far from the origin, plus the seed
// offset), and mobile GPUs default the fragment stage to mediump — where
// fract() of a big number loses precision and the noise/grain visibly swims.
// Force highp on the world varyings and the noise maths so it stays put.
varying highp vec3 vSurfWorldPos;
varying highp vec3 vSurfWorldNormal;
uniform highp vec3 uSurfSeed;
uniform float uSurfScale;
uniform float uSurfAlbedoVar;
uniform vec3  uSurfTint;
uniform float uSurfTintAmount;
uniform float uSurfAO;
uniform float uSurfBump;
uniform float uSurfRoughVar;
uniform float uSurfGrain;
uniform float uSurfGrainScale;
uniform vec3  uSurfGrainAxis;
uniform float uSurfTile;
uniform highp vec2 uSurfTileSize;
uniform float uSurfMortar;
uniform float uSurfTileBond;
uniform float uSurfTileRound;
uniform float uSurfTileJitter;
uniform vec3  uSurfMortarColor;
uniform float uSurfTileRelief;
uniform float uSurfTileTint;
uniform float uSurfTileChevron;
uniform float uSurfTileMotif;
uniform float uSurfCap;
uniform vec3  uSurfCapColor;
uniform float uSurfCapUp;
uniform float uSurfCapSharp;
uniform float uSurfCapRough;
uniform float uSurfGlow;
uniform vec3  uSurfGlowColor;
uniform float uSurfGlowThresh;
uniform float uSurfWet;
uniform float uSurfWetCling;
uniform float uSurfRibs;
uniform float uSurfRibScale;
uniform float uSurfRibTurn;
uniform float uSurfRibCross;
uniform float uSurfSpeck;
uniform float uSurfSpeckScale;
uniform float uSurfCells;
uniform float uSurfCellScale;
uniform float uSurfCellEdge;
uniform float uSurfCellJitter;
uniform float uSurfCellPlan;
uniform float uSurfCrust;
uniform vec3  uSurfCrustColor;
uniform float uSurfCrustRough;

float scenaHash13(highp vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float scenaVNoise(highp vec3 x){
  highp vec3 i = floor(x); highp vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = scenaHash13(i + vec3(0.0,0.0,0.0));
  float n100 = scenaHash13(i + vec3(1.0,0.0,0.0));
  float n010 = scenaHash13(i + vec3(0.0,1.0,0.0));
  float n110 = scenaHash13(i + vec3(1.0,1.0,0.0));
  float n001 = scenaHash13(i + vec3(0.0,0.0,1.0));
  float n101 = scenaHash13(i + vec3(1.0,0.0,1.0));
  float n011 = scenaHash13(i + vec3(0.0,1.0,1.0));
  float n111 = scenaHash13(i + vec3(1.0,1.0,1.0));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float scenaFbm(highp vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++){ s += a * scenaVNoise(p); p *= 2.02; a *= 0.5; }
  return s;
}
// Triplanar fbm: blend three axis-projected samples by the world normal, so
// box faces need no UVs and adjacent boxes share one continuous field.
float scenaTri(highp vec3 wp, vec3 wn, float scale){
  highp vec3 p = wp * scale + uSurfSeed;
  vec3 w = abs(normalize(wn)); w = pow(w, vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
  return scenaFbm(p.yzx) * w.x + scenaFbm(p.zxy) * w.y + scenaFbm(p.xyz) * w.z;
}
// Concentric grain rings around the grain axis, warped by noise.
float scenaGrain(highp vec3 wp){
  highp vec3 ax = normalize(uSurfGrainAxis);
  highp float along = dot(wp, ax);
  highp vec3 perp = wp - ax * along;
  highp float rings = length(perp) * uSurfGrainScale + scenaFbm(wp * uSurfGrainScale * 0.4) * 2.0;
  return abs(fract(rings) - 0.5) * 2.0; // triangle wave 0..1
}
// A masonry grid on the dominant-axis face (so box walls/floors/roofs get a
// clean 2D pattern and abutting boxes align). Running-bond rows, mortar bands
// and per-cell jitter. Returns: x = mortar mask (1 in the joint), y = per-cell
// hash (0..1), z = surface height (tile face high → joint low), w = the domed
// stone height for cobbles.
vec4 scenaTile(highp vec3 wp, vec3 wn){
  vec3 an = abs(normalize(wn));
  highp vec2 uv;
  if (an.x >= an.y && an.x >= an.z) uv = wp.zy;
  else if (an.y >= an.x && an.y >= an.z) uv = wp.xz;
  else uv = wp.xy;
  uv += uSurfSeed.xy;
  highp vec2 ts = max(uSurfTileSize, vec2(1e-3));
  // Chevron parquet: shear alternate column bands ±45° (about each band's own
  // centre, so the offset stays small and mediump-safe far from the origin).
  if (uSurfTileChevron > 0.5) {
    highp float band = floor(uv.x / ts.x);
    highp float local = uv.x - (band + 0.5) * ts.x;
    uv.y += (mod(band, 2.0) * 2.0 - 1.0) * local;
  }
  highp float row = floor(uv.y / ts.y);
  highp float bond = mod(row, 2.0) * uSurfTileBond * 0.5;
  highp float cxf = uv.x / ts.x + bond;
  highp float col = floor(cxf);
  highp vec2 cell = vec2(col, row);
  highp float fx = fract(cxf);
  highp float fy = fract(uv.y / ts.y);
  // Distance to the nearest cell edge, in world units → mortar band.
  float ex = min(fx, 1.0 - fx) * ts.x;
  float ey = min(fy, 1.0 - fy) * ts.y;
  float edge = min(ex, ey);
  float m = max(uSurfMortar, 1e-4);
  float mortar = 1.0 - smoothstep(m, m * 1.7, edge);
  // Domed profile for cobbles: peaks at the cell centre, falls to the joint.
  float dome = clamp(1.0 - length(vec2(fx - 0.5, fy - 0.5)) * 2.0, 0.0, 1.0);
  float flatH = 1.0 - mortar;
  float height = mix(flatH, dome * (1.0 - mortar), uSurfTileRound);
  float h = scenaHash13(vec3(cell + vec2(3.1, 7.3), 5.0));
  return vec4(mortar, h, height, dome);
}
// Snow / moss cap: settles on up-facing surfaces, its edge broken up by the
// noise the shader already sampled (no extra noise cost). Returns 0..1.
float scenaCapMask(vec3 wn, float breakup){
  float up = normalize(wn).y * 0.5 + 0.5;      // 0 (down) .. 1 (up)
  float s = max(uSurfCapSharp, 1e-3);
  return clamp(smoothstep(uSurfCapUp - s, uSurfCapUp + s, up + (breakup - 0.5) * 0.6), 0.0, 1.0);
}
// Parallel ridges along an axis — a corrugated sheet. Crossed with a second
// set, the two lattices intersect in isolated studs: tread plate.
float scenaRibs(highp vec3 wp, vec3 wn){
  if (uSurfRibs <= 0.0) return 0.0;
  // In the FACE's own plane, like the masonry grid. A world axis is no use
  // here: on a wall, two different world axes project onto the same
  // direction, which turns a crossed tread plate back into plain stripes.
  vec3 an = abs(normalize(wn));
  highp vec2 uv;
  if (an.x >= an.y && an.x >= an.z) uv = wp.zy;
  else if (an.y >= an.x && an.y >= an.z) uv = wp.xz;
  else uv = wp.xy;
  uv = (uSurfRibTurn > 0.5 ? uv.yx : uv) * uSurfRibScale;
  float r = abs(fract(uv.x) - 0.5) * 2.0;
  if (uSurfRibCross > 0.5) {
    // Two sets at ±45° IN THAT PLANE. MIN, not max: crossed ridges are high
    // together only where they actually cross, and that is a field of studs
    // rather than a waffle grid.
    highp vec2 d = vec2(uv.x + uv.y, uv.x - uv.y) * 0.7071;
    r = min(abs(fract(d.x) - 0.5), abs(fract(d.y) - 0.5)) * 2.0;
  }
  return r * r * (3.0 - 2.0 * r);   // round the triangle off
}
// Aggregate. Everything else in this shader runs on smooth fbm, which reads
// as mottling; asphalt is STONES IN TAR, and stones have edges.
float scenaSpeck(highp vec3 wp){
  if (uSurfSpeck <= 0.0) return 0.5;
  return scenaHash13(floor(wp * uSurfSpeckScale + uSurfSeed));
}
// Warped Voronoi. Returns x = per-cell hash, y = distance to the nearest
// seam (0 on it). Basalt's columnar jointing and the zinc spangle on
// galvanised steel are this one function two orders of magnitude apart.
vec2 scenaCells(highp vec3 wp, vec3 wn){
  if (uSurfCells <= 0.0) return vec2(0.5, 1.0);
  highp vec2 uv;
  if (uSurfCellPlan > 0.5) {
    // Columnar jointing is a crazy paving seen from ABOVE, pulled up into
    // columns — so it is laid out in plan whatever the face is pointing at.
    uv = wp.xz;
  } else {
    vec3 an = abs(normalize(wn));
    if (an.x >= an.y && an.x >= an.z) uv = wp.zy;
    else if (an.y >= an.x && an.y >= an.z) uv = wp.xz;
    else uv = wp.xy;
  }
  uv = uv * uSurfCellScale + uSurfSeed.xy;
  highp vec2 g = floor(uv);
  highp vec2 f = uv - g;
  float d1 = 8.0, d2 = 8.0, id = 0.5;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      float h = scenaHash13(vec3(g + o, 11.0));
      vec2 seed = o + vec2(h, fract(h * 37.31));
      float d = length(seed - f);
      if (d < d1) { d2 = d1; d1 = d; id = h; }
      else if (d < d2) { d2 = d; }
    }
  }
  // d2 - d1 is 0 exactly on the boundary between two cells and grows inward,
  // which is a seam that does not care how big the cells are.
  return vec2(id, clamp(d2 - d1, 0.0, 1.0));
}
// A mineral crust — verdigris, a rust bloom, lichen — taking hold in the
// cavities and on the up-facing side.
float scenaCrustMask(vec3 wn, float low){
  if (uSurfCrust <= 0.0) return 0.0;
  float up = normalize(wn).y * 0.5 + 0.5;
  return clamp(smoothstep(0.66, 0.28, low) * uSurfCrust * mix(0.5, 1.0, up), 0.0, 1.0);
}
// WATER FILLS FROM THE BOTTOM. Wetness is a LEVEL, not a multiply: every
// point has a height (the surface's own low-frequency band, with the
// mortar joints counted as the lowest ground there is), and it is wet when
// the level is above it. That is what makes a light shower read as dark
// glossy lines in the joints and hollows while the faces stay dry, and a
// downpour sheet the whole wall — from one scalar.
//
// The level is lower on a vertical face than a horizontal one, because
// rain falls down: a sill soaks while the wall beneath it is merely damp.
float scenaWetMask(vec3 wn, float low, float mortar){
  if (uSurfWet <= 0.0) return 0.0;
  float up = normalize(wn).y * 0.5 + 0.5;
  float level = uSurfWet * mix(clamp(uSurfWetCling, 0.0, 1.0), 1.0, up) * 1.4 - 0.2;
  float height = min(low, 1.0 - mortar);
  return clamp(smoothstep(height - 0.2, height + 0.2, level), 0.0, 1.0);
}
`;

function vertexPatch(src: string): string {
  return src
    .replace(
      '#include <common>',
      '#include <common>\nvarying highp vec3 vSurfWorldPos;\nvarying highp vec3 vSurfWorldNormal;'
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec4 scenaWP = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          scenaWP = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        vSurfWorldPos = scenaWP.xyz;
      }`
    )
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      {
        vec3 scenaON = objectNormal;
        #ifdef USE_INSTANCING
          scenaON = mat3(instanceMatrix) * scenaON;
        #endif
        vSurfWorldNormal = normalize(mat3(modelMatrix) * scenaON);
      }`
    );
}

function fragmentPatch(src: string): string {
  return src
    .replace('#include <common>', '#include <common>\n' + NOISE_GLSL)
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float scenaN   = scenaTri(vSurfWorldPos, vSurfWorldNormal, uSurfScale);
      float scenaLow = scenaTri(vSurfWorldPos, vSurfWorldNormal, uSurfScale * 0.25);
      float scenaG   = scenaGrain(vSurfWorldPos);
      float scenaRib = scenaRibs(vSurfWorldPos, vSurfWorldNormal);
      float scenaSp  = scenaSpeck(vSurfWorldPos);
      vec2  scenaC   = scenaCells(vSurfWorldPos, vSurfWorldNormal);
      // Seam mask: 1 on the join between two cells, 0 inside one.
      float scenaSeam = (1.0 - smoothstep(0.0, 0.085, scenaC.y)) * uSurfCells;
      // masonry grid (no-op when uSurfTile == 0)
      vec4  scenaT   = scenaTile(vSurfWorldPos, vSurfWorldNormal);
      float scenaMortar = scenaT.x * uSurfTile;
      // fine mottle
      diffuseColor.rgb *= 1.0 + (scenaN - 0.5) * uSurfAlbedoVar;
      // per-cell brightness jitter, so no two bricks/stones read the same
      diffuseColor.rgb *= 1.0 + uSurfTileJitter * (scenaT.y - 0.5) * uSurfTile;
      // cavity ambient occlusion (dark where the low band is low)
      diffuseColor.rgb *= 1.0 - uSurfAO * (1.0 - scenaLow);
      // cavity tint
      diffuseColor.rgb = mix(diffuseColor.rgb, uSurfTint, uSurfTintAmount * (1.0 - scenaLow));
      // grain darkening (no-op when uSurfGrain == 0)
      diffuseColor.rgb *= 1.0 - uSurfGrain * scenaG * 0.5;
      // aggregate chips — hard-edged, unlike everything else here
      diffuseColor.rgb *= 1.0 + (scenaSp - 0.5) * uSurfSpeck;
      // cells: each one its own shade, and the seams between them dark
      diffuseColor.rgb *= 1.0 + (scenaC.x - 0.5) * uSurfCellJitter * uSurfCells;
      diffuseColor.rgb *= 1.0 - scenaSeam * uSurfCellEdge;
      // the ridge valleys hold shadow the lighting alone will not give them
      diffuseColor.rgb *= 1.0 - uSurfRibs * (1.0 - scenaRib) * 0.22;
      // accent cells (mosaic chips) painted solid tint — a no-op at 0
      float scenaAccent = uSurfTile * uSurfTileTint;
      diffuseColor.rgb = mix(diffuseColor.rgb, uSurfTint, step(scenaT.y, scenaAccent) * uSurfTile);
      // per-cell ring + dot motif (patterned cement tiles) — a no-op at 0
      float scenaMotifM = smoothstep(0.40, 0.47, scenaT.w) - smoothstep(0.60, 0.68, scenaT.w)
        + smoothstep(0.86, 0.93, scenaT.w);
      diffuseColor.rgb = mix(diffuseColor.rgb, uSurfTint,
        clamp(scenaMotifM, 0.0, 1.0) * uSurfTileMotif * uSurfTile);
      // recessed mortar joint: to the mortar colour, shadowed in the groove
      diffuseColor.rgb = mix(diffuseColor.rgb, uSurfMortarColor, scenaMortar);
      diffuseColor.rgb *= 1.0 - 0.35 * scenaMortar;
      // snow / moss cap settling on the up-facing faces (over the mortar too)
      float scenaCapM = scenaCapMask(vSurfWorldNormal, scenaN) * uSurfCap;
      diffuseColor.rgb = mix(diffuseColor.rgb, uSurfCapColor, scenaCapM);
      // WET. Water darkens a surface because it fills the pores: light gets
      // in, scatters, and comes back out with less of it. So POROUS things
      // darken hard and sealed ones barely change — a wet flagstone is
      // almost black, wet chrome is just chrome — and metal, which has no
      // subsurface to wet, does not darken at all.
      // A CRUST, not a tint: verdigris, rust bloom, lichen. It goes over
      // everything above it, because it grew on top of all of it.
      float scenaCrustM = scenaCrustMask(vSurfWorldNormal, scenaLow);
      diffuseColor.rgb = mix(diffuseColor.rgb, uSurfCrustColor, scenaCrustM);
      float scenaWetM = scenaWetMask(vSurfWorldNormal, scenaLow, scenaMortar);
      float scenaPorous = (1.0 - clamp(metalness, 0.0, 1.0)) * clamp(roughness, 0.0, 1.0);
      diffuseColor.rgb *= mix(1.0, mix(0.93, 0.45, scenaPorous), scenaWetM);`
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (scenaN - 0.5) * uSurfRoughVar + uSurfGrain * scenaG * 0.12
        + scenaMortar * 0.25 + (scenaT.y - 0.5) * uSurfTileJitter * 0.3 * uSurfTile, 0.04, 1.0);
      roughnessFactor = clamp(roughnessFactor + (scenaSp - 0.5) * uSurfSpeck * 0.35
        + scenaSeam * 0.2, 0.04, 1.0);
      roughnessFactor = mix(roughnessFactor, uSurfCrustRough, scenaCrustM);
      roughnessFactor = mix(roughnessFactor, uSurfCapRough, scenaCapM);
      // A film of water is a mirror, whatever is underneath it.
      roughnessFactor = mix(roughnessFactor, 0.05, scenaWetM * 0.92);`
    )
    .replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
      // A mineral scab does not reflect like the metal it grew on, so where
      // the crust has taken hold the metal is simply not there any more.
      // This is the difference between patina and green paint.
      metalnessFactor = mix(metalnessFactor, 0.0, scenaCrustM);`
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // three's perturbNormalArb, in view space, driven by the noise height
        // plus the tile relief (a step down into each mortar joint).
        // Standing water fills the micro-relief, so the bump flattens out
        // under it — the puddle is smooth even where the stone is not.
        float scenaH = (scenaN + uSurfGrain * scenaG * 0.5 + scenaT.z * uSurfTile * uSurfTileRelief
          + scenaRib * uSurfRibs * 0.9 + scenaC.y * uSurfCells * uSurfCellEdge * 0.5)
          * (1.0 - scenaWetM * 0.7);
        vec3 sX = dFdx(-vViewPosition);
        vec3 sY = dFdy(-vViewPosition);
        vec3 sN = normal;
        vec3 R1 = cross(sY, sN);
        vec3 R2 = cross(sN, sX);
        float det = dot(sX, R1);
        vec3 grad = sign(det) * (dFdx(scenaH) * R1 + dFdy(scenaH) * R2);
        normal = normalize(abs(det) * sN - uSurfBump * grad);
      }`
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        // Procedural glow (lava cracks, crystal): drawn straight into the
        // emissive radiance, NOT via material.emissive — so it burns constant
        // and the day/night cycle (which scales emissiveIntensity) can't dim
        // it. A no-op when uSurfGlow == 0. Glow fills the low-noise areas.
        float scenaGlow = smoothstep(uSurfGlowThresh + 0.16, uSurfGlowThresh - 0.16, scenaLow) * uSurfGlow;
        totalEmissiveRadiance += uSurfGlowColor * scenaGlow;
      }`
    );
}

/**
 * Build a procedural surface material. Pass a preset name for the defaults,
 * plus any overrides (colour, roughness, bump, seed, …).
 */
export function createSurface(kind: SurfaceKind, options: SurfaceOptions = {}): MeshStandardMaterial {
  const preset = SURFACE_PRESETS[kind];
  const p: SurfaceParams = { ...preset, ...options };
  const seed = options.seed ?? 0;

  const base = {
    color: options.color ?? preset.baseColor ?? 0x9a9a9a,
    roughness: p.roughness,
    metalness: p.metalness,
    flatShading: p.flat,
  };
  // A MeshPhysicalMaterial only when the preset genuinely needs one. It is a
  // bigger shader, and `transmission` makes three render the scene a second
  // time — so the other 52 kinds keep the cheap material they have always had.
  const material: MeshStandardMaterial = p.physical
    ? new MeshPhysicalMaterial({
        ...base,
        ...(p.sheen === undefined ? {} : {
          sheen: p.sheen,
          sheenColor: new Color(p.sheenColor ?? 0xffffff),
          sheenRoughness: p.sheenRough ?? 0.3,
        }),
        ...(p.anisotropy === undefined ? {} : {
          anisotropy: p.anisotropy,
          anisotropyRotation: p.anisotropyRotation ?? 0,
        }),
        ...(p.iridescence === undefined ? {} : {
          iridescence: p.iridescence,
          iridescenceIOR: p.iridescenceIOR ?? 1.3,
          iridescenceThicknessRange: p.iridescenceThickness ?? [100, 400],
        }),
        ...(p.transmission === undefined ? {} : {
          transmission: p.transmission,
          thickness: p.thickness ?? 0.5,
          ior: p.ior ?? 1.5,
          // Only when asked for: three compiles USE_DISPERSION the moment
          // this crosses zero, and that is three transmission samples a
          // pixel instead of one.
          ...(p.dispersion ? { dispersion: p.dispersion } : {}),
          ...(p.attenuationColor === undefined ? {} : {
            attenuationColor: new Color(p.attenuationColor),
            attenuationDistance: p.attenuationDistance ?? 1,
          }),
        }),
      })
    : new MeshStandardMaterial(base);

  const uniforms = {
    uSurfScale: { value: p.scale },
    uSurfAlbedoVar: { value: p.albedoVar },
    uSurfTint: { value: new Color(p.tint) },
    uSurfTintAmount: { value: p.tintAmount },
    uSurfAO: { value: p.ao },
    uSurfBump: { value: p.bump },
    uSurfRoughVar: { value: p.roughVar },
    uSurfGrain: { value: p.grain },
    uSurfGrainScale: { value: p.grainScale },
    uSurfGrainAxis: { value: p.grainAxis.clone().normalize() },
    // A large, seed-driven world-space offset so equal colours weather apart.
    uSurfSeed: {
      value: new Vector3(
        Math.sin(seed * 12.9898) * 43.75,
        Math.cos(seed * 78.233) * 51.13,
        Math.sin(seed * 37.719) * 29.41
      ),
    },
    // Masonry tiling (uSurfTile 0 disables the whole grid at no visual cost).
    uSurfTile: { value: p.tile ?? 0 },
    uSurfTileSize: { value: new Vector2(p.tileW ?? 0.25, p.tileH ?? 0.1) },
    uSurfMortar: { value: p.mortar ?? 0.014 },
    uSurfTileBond: { value: p.bond ?? 1 },
    uSurfTileRound: { value: p.round ?? 0 },
    uSurfTileJitter: { value: p.tileJitter ?? 0.12 },
    uSurfMortarColor: { value: new Color(p.mortarColor ?? 0x3a3a3a) },
    uSurfTileRelief: { value: p.tileRelief ?? 0.06 },
    uSurfTileTint: { value: p.tileTint ?? 0 },
    uSurfTileChevron: { value: p.chevron ?? 0 },
    uSurfTileMotif: { value: p.motif ?? 0 },
    // Snow/moss cap (uSurfCap 0 disables it).
    uSurfCap: { value: p.cap ?? 0 },
    uSurfCapColor: { value: new Color(p.capColor ?? 0xf2f6fa) },
    uSurfCapUp: { value: p.capUp ?? 0.5 },
    uSurfCapSharp: { value: p.capSharp ?? 0.28 },
    uSurfCapRough: { value: p.capRough ?? 0.88 },
    // Emissive glow (uSurfGlow 0 keeps it dark, day-cycle-safe).
    uSurfGlow: { value: p.glow ?? 0 },
    uSurfGlowColor: { value: new Color(p.glowColor ?? 0xff6a2a) },
    uSurfGlowThresh: { value: p.glowThreshold ?? 0.45 },
    // Wear: water (uSurfWet 0 is bone dry and costs one compare).
    uSurfWet: { value: p.wet ?? 0 },
    uSurfWetCling: { value: p.wetCling ?? 0.55 },
    // Ribs, aggregate, cells and crust (each 0 = off, and off costs a compare).
    uSurfRibs: { value: p.ribs ?? 0 },
    uSurfRibScale: { value: p.ribScale ?? 8 },
    uSurfRibTurn: { value: p.ribTurn ?? 0 },
    uSurfRibCross: { value: p.ribCross ?? 0 },
    uSurfSpeck: { value: p.speck ?? 0 },
    uSurfSpeckScale: { value: p.speckScale ?? 40 },
    uSurfCells: { value: p.cells ?? 0 },
    uSurfCellScale: { value: p.cellScale ?? 4 },
    uSurfCellEdge: { value: p.cellEdge ?? 0.4 },
    uSurfCellJitter: { value: p.cellJitter ?? 0.18 },
    uSurfCellPlan: { value: p.cellPlan ?? 0 },
    uSurfCrust: { value: p.crust ?? 0 },
    uSurfCrustColor: { value: new Color(p.crustColor ?? 0x4fa88a) },
    uSurfCrustRough: { value: p.crustRough ?? 0.9 },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = vertexPatch(shader.vertexShader);
    shader.fragmentShader = fragmentPatch(shader.fragmentShader);
    // Keep the live shader so weather can drive uniforms after compilation —
    // the object three actually uploads from, not just our pre-compile copy.
    (material.userData as { scenaShader?: typeof shader }).scenaShader = shader;
  };
  // All surface materials inject identical source (uniforms carry the
  // differences), so one cache key groups them — and, crucially, keeps them
  // from colliding with a plain MeshStandardMaterial that has matching base
  // params but no injection. three still appends its own feature key, so
  // flat/smooth/instanced variants stay separate programs.
  const cacheKey = p.physical ? 'scena-surface-v5-physical' : 'scena-surface-v5';
  material.customProgramCacheKey = () => cacheKey;

  // Expose the live uniforms so weather can drive them after the fact — e.g.
  // snow settling ramps uSurfCap, rain darkens/glosses via the same handles.
  (material.userData as { scenaSurface?: typeof uniforms }).scenaSurface = uniforms;

  return material;
}
