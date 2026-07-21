/**
 * Theme palettes: one coherent set of colors shared by every generator,
 * so procedural props look like a matched set rather than a junk drawer.
 * Pass `palette` to any generator to restyle it; whole scenes retheme by
 * building with a different palette.
 */
export interface Palette {
  foliage: number[];
  trunk: number;
  rock: number[];
  wood: number;
  woodDark: number;
  metal: number;
  lampGlow: number;
  grassLow: number;
  grassHigh: number;
  cliff: number;
  peak: number;
  skyTop: number;
  skyBottom: number;
  fog: number;
}

export const PALETTES: Record<'meadow' | 'autumn' | 'dusk', Palette> = {
  meadow: {
    foliage: [0x2f9e57, 0x37b26a, 0x2a8f4f, 0x45b878],
    trunk: 0x6b4a33,
    rock: [0x8a8f98, 0x767c86, 0x9aa0a8],
    wood: 0x8a6642,
    woodDark: 0x6b4a33,
    metal: 0x3d4451,
    lampGlow: 0xffd889,
    grassLow: 0x3f9d5a,
    grassHigh: 0x6fae66,
    cliff: 0x7d7a72,
    peak: 0xe8ecef,
    skyTop: 0x3d70b8,
    skyBottom: 0xbfd9e8,
    fog: 0xb8cfdd,
  },
  autumn: {
    foliage: [0xc9752f, 0xd98e3a, 0xb35c2a, 0xe0a545],
    trunk: 0x5d4030,
    rock: [0x8d8578, 0x776f63, 0x9c948a],
    wood: 0x7d5a3a,
    woodDark: 0x5d4030,
    metal: 0x463f3a,
    lampGlow: 0xffc571,
    grassLow: 0x9d8a3f,
    grassHigh: 0xb59b4a,
    cliff: 0x82746a,
    peak: 0xe3ded4,
    skyTop: 0x8e6ca8,
    skyBottom: 0xe8c9a8,
    fog: 0xd9c1a8,
  },
  dusk: {
    foliage: [0x1f5e46, 0x24684f, 0x1a5240, 0x2d7458],
    trunk: 0x413147,
    rock: [0x565672, 0x484861, 0x646484],
    wood: 0x5d4a63,
    woodDark: 0x413147,
    metal: 0x2b2b3d,
    lampGlow: 0xffb35c,
    grassLow: 0x2d6b52,
    grassHigh: 0x3d7a5e,
    cliff: 0x52516b,
    peak: 0xb8b8d9,
    skyTop: 0x1d2145,
    skyBottom: 0xc96a4a,
    fog: 0x6a5a7a,
  },
};

export const DEFAULT_PALETTE: Palette = PALETTES.meadow;
