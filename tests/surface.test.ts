import { describe, expect, it } from 'vitest';
import { Color, Mesh, MeshStandardMaterial, ShaderLib, Vector3 } from 'three';
import { createSurface, SURFACE_PRESETS, type SurfaceKind } from '../src/materials/surface';

/** The subset of three's onBeforeCompile shader object we inspect. */
interface Shader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}
import { createHouse, createWell, createRuin, createTower } from '../src/props/building';
import { createRock } from '../src/props/rock';
import { createCrate } from '../src/props/crate';

const KINDS = Object.keys(SURFACE_PRESETS) as SurfaceKind[];

/** Run a material's onBeforeCompile against a *copy of the real* three
 * MeshStandard shader, so the injection is validated against actual chunk
 * names — if three renamed a chunk our replace would silently no-op. */
function compilePatched(mat: MeshStandardMaterial): Shader {
  const shader: Shader = {
    uniforms: {},
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
  };
  // three calls it as (shader, renderer); renderer is unused here.
  (mat.onBeforeCompile as (s: Shader, r: unknown) => void)(shader, null);
  return shader;
}

describe('createSurface', () => {
  it('produces a MeshStandardMaterial with the preset PBR base', () => {
    const mat = createSurface('metal', { color: 0x334455 });
    expect(mat).toBeInstanceOf(MeshStandardMaterial);
    expect(mat.metalness).toBe(SURFACE_PRESETS.metal.metalness);
    expect(mat.roughness).toBe(SURFACE_PRESETS.metal.roughness);
    expect(mat.color.getHex()).toBe(0x334455);
    expect(typeof mat.onBeforeCompile).toBe('function');
  });

  it('injects into real three chunks — replacements actually fire', () => {
    // The tokens we depend on must exist in three's shipped shader.
    expect(ShaderLib.standard.vertexShader).toContain('#include <begin_vertex>');
    expect(ShaderLib.standard.fragmentShader).toContain('#include <map_fragment>');
    expect(ShaderLib.standard.fragmentShader).toContain('#include <normal_fragment_maps>');

    const shader = compilePatched(createSurface('stone'));
    // Vertex: world-position + world-normal varyings added.
    expect(shader.vertexShader).toContain('vSurfWorldPos');
    expect(shader.vertexShader).toContain('vSurfWorldNormal');
    expect(shader.vertexShader).toContain('#ifdef USE_INSTANCING'); // instancing path
    // Fragment: our noise + all four modulation sites present.
    expect(shader.fragmentShader).toContain('scenaTri');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb');
    expect(shader.fragmentShader).toContain('roughnessFactor = clamp');
    expect(shader.fragmentShader).toContain('uSurfBump'); // normal perturbation
  });

  it('adds all surface uniforms with the preset values', () => {
    const shader = compilePatched(createSurface('wood', { color: 0x8a6642 }));
    for (const u of [
      'uSurfScale', 'uSurfAlbedoVar', 'uSurfTint', 'uSurfTintAmount',
      'uSurfAO', 'uSurfBump', 'uSurfRoughVar', 'uSurfGrain', 'uSurfGrainScale',
      'uSurfGrainAxis', 'uSurfSeed',
    ]) {
      expect(shader.uniforms[u]).toBeDefined();
    }
    expect(shader.uniforms.uSurfGrain.value).toBe(SURFACE_PRESETS.wood.grain);
    expect(shader.uniforms.uSurfScale.value).toBe(SURFACE_PRESETS.wood.scale);
  });

  it('shares one program cache key so presets do not fragment the pipeline', () => {
    const keys = KINDS.map((k) => createSurface(k).customProgramCacheKey());
    expect(new Set(keys).size).toBe(1);
    // …but it is distinct from a plain material's default key.
    expect(keys[0]).not.toBe(new MeshStandardMaterial().customProgramCacheKey());
  });

  it('seed shifts the noise field so equal colours weather apart', () => {
    const a = compilePatched(createSurface('plaster', { color: 0xffffff, seed: 1 }));
    const b = compilePatched(createSurface('plaster', { color: 0xffffff, seed: 2 }));
    const sa = a.uniforms.uSurfSeed.value as Vector3;
    const sb = b.uniforms.uSurfSeed.value as Vector3;
    expect(sa.equals(sb)).toBe(false);
  });

  it('overrides win over the preset', () => {
    const mat = createSurface('stone', { roughness: 0.1, bump: 2, color: 0x111111 });
    const shader = compilePatched(mat);
    expect(mat.roughness).toBe(0.1);
    expect(shader.uniforms.uSurfBump.value).toBe(2);
  });

  it('presets are meaningfully distinct', () => {
    // No two presets share an identical full parameter signature.
    const sigs = KINDS.map((k) => {
      const p = SURFACE_PRESETS[k];
      return [p.roughness, p.metalness, p.scale, p.albedoVar, p.ao, p.bump, p.grain].join(',');
    });
    expect(new Set(sigs).size).toBe(KINDS.length);
    // Wood-family presets carry grain; masonry does not.
    expect(SURFACE_PRESETS.wood.grain).toBeGreaterThan(0);
    expect(SURFACE_PRESETS.plank.grain).toBeGreaterThan(0);
    expect(SURFACE_PRESETS.stone.grain).toBe(0);
    expect(SURFACE_PRESETS.plaster.grain).toBe(0);
  });

  it('falls back to each preset baseColor, but a passed color always wins', () => {
    // No color passed → the preset's own baseColor (sand looks like sand).
    expect(createSurface('sand').color.getHex()).toBe(SURFACE_PRESETS.sand.baseColor);
    expect(createSurface('brass').color.getHex()).toBe(SURFACE_PRESETS.brass.baseColor);
    // Caller color overrides the baseColor.
    expect(createSurface('sand', { color: 0x123456 }).color.getHex()).toBe(0x123456);
    // Every preset carries a baseColor now.
    for (const k of KINDS) expect(SURFACE_PRESETS[k].baseColor, k).toBeGreaterThan(0);
  });

  it('covers the Tier-1 range: metals are metallic, ground/organic are not', () => {
    for (const k of ['bronze', 'brass', 'rust'] as SurfaceKind[]) {
      expect(SURFACE_PRESETS[k].metalness, k).toBeGreaterThan(0);
    }
    for (const k of ['sand', 'gravel', 'mud', 'leather', 'canvas', 'parchment'] as SurfaceKind[]) {
      expect(SURFACE_PRESETS[k].metalness, k).toBe(0);
    }
    // bark reads as timber: it carries grain.
    expect(SURFACE_PRESETS.bark.grain).toBeGreaterThan(0);
  });

  it('adds the masonry-tiling uniforms; tile presets enable the grid, others do not', () => {
    const shader = compilePatched(createSurface('brick'));
    for (const u of ['uSurfTile', 'uSurfTileSize', 'uSurfMortar', 'uSurfTileBond', 'uSurfMortarColor']) {
      expect(shader.uniforms[u], u).toBeDefined();
    }
    // Tiled presets turn the grid on…
    for (const k of ['brick', 'cobblestone', 'ashlar', 'floortile', 'shingle'] as SurfaceKind[]) {
      expect(SURFACE_PRESETS[k].tile, k).toBe(1);
      expect(SURFACE_PRESETS[k].tileW, k).toBeGreaterThan(0);
    }
    // …and cobblestone is the domed one.
    expect(SURFACE_PRESETS.cobblestone.round).toBe(1);
    expect(SURFACE_PRESETS.brick.round).toBe(0);
    // Non-tiled presets leave it off → the uniform defaults to 0 (grid a no-op).
    expect(SURFACE_PRESETS.stone.tile).toBeUndefined();
    expect(compilePatched(createSurface('stone')).uniforms.uSurfTile.value).toBe(0);
    // The grid source is present, and it feeds relief + roughness + albedo.
    expect(shader.fragmentShader).toContain('scenaTile');
    expect(shader.fragmentShader).toContain('uSurfMortarColor');
  });

  it('tiling is opt-in on any surface via overrides', () => {
    const plain = compilePatched(createSurface('sandstone'));
    const tiled = compilePatched(createSurface('sandstone', { tile: 1, tileW: 0.6 }));
    expect(plain.uniforms.uSurfTile.value).toBe(0);
    expect(tiled.uniforms.uSurfTile.value).toBe(1);
    expect((tiled.uniforms.uSurfTileSize.value as { x: number }).x).toBe(0.6);
  });

  it('adds cap + glow uniforms; snow/moss cap, lava/crystal glow, others off', () => {
    const shader = compilePatched(createSurface('snow'));
    for (const u of ['uSurfCap', 'uSurfCapColor', 'uSurfCapUp', 'uSurfGlow', 'uSurfGlowColor', 'uSurfGlowThresh']) {
      expect(shader.uniforms[u], u).toBeDefined();
    }
    expect(SURFACE_PRESETS.snow.cap).toBeGreaterThan(0);
    expect(SURFACE_PRESETS.moss.cap).toBeGreaterThan(0);
    expect(SURFACE_PRESETS.lava.glow).toBeGreaterThan(0);
    expect(SURFACE_PRESETS.crystal.glow).toBeGreaterThan(0);
    // A plain stone has neither.
    expect(compilePatched(createSurface('stone')).uniforms.uSurfCap.value).toBe(0);
    expect(compilePatched(createSurface('stone')).uniforms.uSurfGlow.value).toBe(0);
    // The features are wired into the fragment shader.
    expect(shader.fragmentShader).toContain('scenaCapMask');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += uSurfGlowColor');
  });

  it('cap & glow are opt-in on any surface via overrides', () => {
    const snowyRoof = compilePatched(createSurface('tile', { cap: 0.9, capColor: 0xffffff }));
    expect(snowyRoof.uniforms.uSurfCap.value).toBe(0.9);
    const glowStone = compilePatched(createSurface('stone', { glow: 2, glowColor: 0xff5a1e }));
    expect(glowStone.uniforms.uSurfGlow.value).toBe(2);
  });

  it('stays dayCycle-safe: emissive is black even for glowing lava', () => {
    // dayCycle modulates emissiveIntensity on every material it sees; a surface
    // must not accidentally glow at night — and lava's glow lives outside
    // material.emissive, so even it reports black and the cycle can't dim it.
    expect(createSurface('tile', { color: 0xa8563e }).emissive.equals(new Color(0, 0, 0))).toBe(true);
    expect(createSurface('lava').emissive.equals(new Color(0, 0, 0))).toBe(true);
  });
});

describe('props adopt surfaces', () => {
  function surfaceMaterialCount(prop: { object: { traverse(cb: (o: unknown) => void): void } }): number {
    let n = 0;
    prop.object.traverse((o) => {
      const mat = (o as Mesh).material;
      if (mat instanceof MeshStandardMaterial && typeof mat.onBeforeCompile === 'function') {
        // Distinguish surface materials (custom key) from plain ones.
        if (mat.customProgramCacheKey() === 'scena-surface-v3') n++;
      }
    });
    return n;
  }

  it('house, tower, well, ruin, rock and crate all use surface materials', () => {
    for (const prop of [
      createHouse({ seed: 3 }),
      createTower({ seed: 3 }),
      createWell({ seed: 3 }),
      createRuin({ seed: 3 }),
      createRock({ seed: 3 }),
      createCrate({ seed: 3 }),
    ]) {
      expect(surfaceMaterialCount(prop)).toBeGreaterThan(0);
    }
  });

  it('the house keeps its emissive windows for the day-night cycle', () => {
    // Windows must still be genuinely emissive (non-black) so dusk lights them.
    let emissive = 0;
    createHouse({ seed: 3 }).object.traverse((o) => {
      const mat = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (mat?.emissive && mat.emissive.getHex() !== 0 && mat.emissiveIntensity > 0.5) emissive++;
    });
    expect(emissive).toBeGreaterThan(0);
  });
});

describe('wear: water', () => {
  it('EVERY preset is bone dry out of the box', () => {
    // A state that defaulted to anything but off would silently restyle all
    // 46 kinds and every prop already built on them.
    for (const kind of KINDS) {
      const u = compilePatched(createSurface(kind)).uniforms;
      expect(u.uSurfWet.value, kind).toBe(0);
    }
  });

  it('takes a level, and a cling for vertical faces', () => {
    const u = compilePatched(createSurface('stone', { wet: 0.8, wetCling: 0.2 })).uniforms;
    expect(u.uSurfWet.value).toBe(0.8);
    expect(u.uSurfWetCling.value).toBe(0.2);
    expect(compilePatched(createSurface('stone')).uniforms.uSurfWetCling.value).toBe(0.55);
  });

  it('WET IS NOT JUST DARKER: it changes albedo, roughness AND relief', () => {
    // Darkening alone is the cheap version — a wet surface is also glossy,
    // and the water fills the micro-relief it is standing in.
    const frag = compilePatched(createSurface('brick', { wet: 0.5 })).fragmentShader;
    const [beforeRough, afterRough] = frag.split('#include <roughnessmap_fragment>');
    const [, afterNormal] = frag.split('#include <normal_fragment_maps>');
    expect(beforeRough).toContain('scenaWetMask');          // albedo stage
    expect(beforeRough).toContain('diffuseColor.rgb *= mix(1.0, mix(0.93, 0.45, scenaPorous), scenaWetM)');
    expect(afterRough).toContain('roughnessFactor = mix(roughnessFactor, 0.05, scenaWetM');
    expect(afterNormal).toContain('1.0 - scenaWetM * 0.7');
  });

  it('leans on uniforms three actually declares', () => {
    // The darkening is scaled by how porous the surface is, which reads
    // three's own `roughness` and `metalness` uniforms. If either were ever
    // renamed the shader would fail to compile — in a browser that is a
    // black mesh, not an exception, so it is worth asserting here.
    expect(ShaderLib.standard.fragmentShader).toContain('uniform float roughness;');
    expect(ShaderLib.standard.fragmentShader).toContain('uniform float metalness;');
  });

  it('water fills from the BOTTOM: the level is compared against a height', () => {
    const frag = compilePatched(createSurface('cobblestone', { wet: 0.3 })).fragmentShader;
    // The mask is a level test against the surface's own low band, with the
    // mortar joints counted as the lowest ground there is — that is what
    // makes a light shower wet the joints and leave the faces dry.
    expect(frag).toContain('float height = min(low, 1.0 - mortar);');
    expect(frag).toContain('smoothstep(height - 0.2, height + 0.2, level)');
    // And it is free when dry.
    expect(frag).toContain('if (uSurfWet <= 0.0) return 0.0;');
  });

  it('the uniforms are exposed live, so weather can drive them', () => {
    const mat = createSurface('concrete');
    const u = (mat.userData as { scenaSurface: Record<string, { value: unknown }> }).scenaSurface;
    expect(u.uSurfWet.value).toBe(0);
    expect(u.uSurfWetCling.value).toBe(0.55);
  });
});
