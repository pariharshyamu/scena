import { Color, DoubleSide, MeshStandardMaterial } from 'three';

/**
 * The shared cloth-wave material behind flags, banners and bunting: a plain
 * flat-shaded MeshStandardMaterial whose vertices are rippled in the shader
 * by a travelling fold that grows from the fixed edge (x = 0) to the free fly
 * (x = freeLen), droops under gravity, and shortens as it slackens. Because
 * it stays a standard material, PBR lighting, fog and flatShading (which
 * relights the folds from the displaced positions) all keep working.
 *
 * Phase comes either from a uniform (one flag) or a per-vertex `aPhase`
 * attribute (a whole string of bunting in one draw call), so a row never
 * waves in lockstep. The `uTime` uniform is exposed on
 * `material.userData.waveUniforms` for the caller to advance from the render
 * loop.
 */
export interface ClothWaveOptions {
  /** Length from the fixed edge to the free fly (local +X). */
  freeLen: number;
  /** Span across the cloth (local Y). */
  crossLen: number;
  /** Ripple amplitude. */
  amp: number;
  /** Number of folds along the free length. */
  waves: number;
  /** Wave travel speed. */
  speed: number;
  /** Gravity droop toward the fly (0 for cloth that already hangs). */
  sag: number;
  /** Fixed phase offset (ignored when perVertexPhase is set). */
  phase?: number;
  /** Take the phase from a per-vertex `aPhase` attribute instead. */
  perVertexPhase?: boolean;
  /** Program cache key — keeps this family from colliding with other patches. */
  cacheKey: string;
  /** Read a baked per-vertex `color` attribute (heraldic devices). */
  vertexColors?: boolean;
  /** Base colour when not vertex-coloured. */
  color?: number | Color;
  roughness?: number;
}

export function wavingClothMaterial(o: ClothWaveOptions): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: o.color ?? 0xffffff,
    vertexColors: o.vertexColors ?? false,
    flatShading: true,
    side: DoubleSide,
    roughness: o.roughness ?? 0.92,
    metalness: 0,
  });

  const uniforms: Record<string, { value: number }> = {
    uTime: { value: 0 },
    uAmp: { value: o.amp },
    uFreeLen: { value: o.freeLen },
    uCrossLen: { value: o.crossLen },
    uWaves: { value: o.waves },
    uSpeed: { value: o.speed },
    uSag: { value: o.sag },
  };
  if (!o.perVertexPhase) uniforms.uPhase = { value: o.phase ?? 0 };

  const phaseDecl = o.perVertexPhase ? 'attribute float aPhase;' : '';
  const uniformList = o.perVertexPhase
    ? 'uniform float uTime, uAmp, uFreeLen, uCrossLen, uWaves, uSpeed, uSag;'
    : 'uniform float uTime, uAmp, uFreeLen, uCrossLen, uWaves, uSpeed, uSag, uPhase;';
  const phaseExpr = o.perVertexPhase ? 'aPhase' : 'uPhase';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${phaseDecl}\n${uniformList}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float uf = clamp(position.x / uFreeLen, 0.0, 1.0);   // 0 fixed → 1 fly
          float vc = position.y / uCrossLen + 0.5;              // 0..1 across
          float base = uf * uWaves - uTime * uSpeed + ${phaseExpr};
          float a = uAmp * uf;                                  // pinned at the fixed edge
          float z = a * (sin(base + vc * 1.7) + 0.35 * sin(base * 2.3 + vc * 3.1 + 1.0));
          transformed.z += z;
          transformed.y -= uSag * uf * uf;                      // gravity droop
          transformed.x -= uAmp * 0.25 * uf * (1.0 - cos(base));// slack shortening
        }`
      );
    // flatShading recomputes normals from the displaced positions, so the
    // folds are lit correctly with no analytic-normal maths.
  };
  material.customProgramCacheKey = () => o.cacheKey;
  material.userData.waveUniforms = uniforms;

  return material;
}
