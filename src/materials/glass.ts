import { Color, MeshStandardMaterial } from 'three';

/**
 * Stylized architectural glass — the facade material for modern windows,
 * balustrades, doors and curtain walls.
 *
 * Real transmission is far too heavy for whole facades, so this is a
 * transparent `MeshStandardMaterial` with two shader tricks patched in:
 *
 * - **Fresnel opacity**: face-on the pane stays see-through; edge-on it
 *   turns opaque and reflective, exactly how glass reads in life.
 * - **A procedural sky streak**: the reflected view direction samples a tiny
 *   built-in sky gradient, so panes carry a believable reflection with no
 *   environment map, no cube camera, no setup.
 *
 * `nightGlow` follows the house-window convention: the material's emissive
 * is set at the intensity `createDayCycle` scans for, so listing the mesh
 * (or its building) in the cycle's `lamps` makes the glass ignite at dusk —
 * the classic lit-window skyline, free.
 */
export interface GlassOptions {
  /** Glass tint. Default a cool clear blue-grey. */
  tint?: number | Color;
  /** Face-on opacity (0–1). Default 0.24 (clear); frosted overrides higher. */
  opacity?: number;
  /** Milky translucent finish: higher opacity, rough, muted reflection. */
  frosted?: boolean;
  /** Sky-reflection strength (0–1). Default 0.55. */
  reflect?: number;
  /**
   * Warm interior glow for `createDayCycle` to ignite at dusk (adds an
   * emissive at lamp-scan intensity). Default false.
   */
  nightGlow?: boolean;
  /** Sky gradient the reflection samples: zenith / horizon colours. */
  sky?: number;
  horizon?: number;
}

const GLASS_FRAG_ALPHA = /* glsl */ `
  // Fresnel: see-through face-on, mirror-like edge-on.
  vec3 scenaV = normalize(vViewPosition);
  float scenaFresnel = pow(1.0 - clamp(dot(normal, scenaV), 0.0, 1.0), 3.0);
  diffuseColor.a = clamp(uGlassOpacity + (1.0 - uGlassOpacity) * scenaFresnel, 0.0, 1.0);
`;

const GLASS_FRAG_SKY = /* glsl */ `
  {
    // Reflect the view ray and sample a tiny procedural sky by its height —
    // an environment map's worth of "glassiness" for two mixes. View-space
    // reflection is fine at this stylization level.
    vec3 scenaR = reflect(-scenaV, normal);
    float scenaUp = clamp(scenaR.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 scenaSky = mix(uGlassHorizon, uGlassSky, scenaUp);
    totalEmissiveRadiance += scenaSky * uGlassReflect * (0.25 + 0.75 * scenaFresnel);
  }
`;

export function createGlass(options: GlassOptions = {}): MeshStandardMaterial {
  const frosted = options.frosted ?? false;
  const tint = new Color(options.tint ?? 0x9fc4d8);
  const opacity = options.opacity ?? (frosted ? 0.62 : 0.24);
  const reflect = (options.reflect ?? 0.55) * (frosted ? 0.35 : 1);

  const material = new MeshStandardMaterial({
    color: tint,
    roughness: frosted ? 0.55 : 0.08,
    metalness: 0.1,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  if (options.nightGlow) {
    // The lamp-scan convention: emissiveIntensity > 0.5 means "adopt me" —
    // createDayCycle dims it by day and ignites it at night.
    material.emissive.set(0xffc978);
    material.emissiveIntensity = 1.1;
  }

  const uniforms = {
    uGlassOpacity: { value: opacity },
    uGlassReflect: { value: reflect },
    uGlassSky: { value: new Color(options.sky ?? 0x87a8c8) },
    uGlassHorizon: { value: new Color(options.horizon ?? 0xd8e2e8) },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uGlassOpacity;
        uniform float uGlassReflect;
        uniform vec3 uGlassSky;
        uniform vec3 uGlassHorizon;`
      )
      // After the normal is final, before lighting: fresnel drives alpha…
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + GLASS_FRAG_ALPHA)
      // …and the sky streak lands with the emissive term.
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLASS_FRAG_SKY);
  };
  material.customProgramCacheKey = () => 'scena-glass-v1';
  (material.userData as { scenaGlass?: typeof uniforms }).scenaGlass = uniforms;

  return material;
}
