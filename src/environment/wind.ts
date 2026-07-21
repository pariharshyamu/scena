import { Mesh, type Material, type Object3D } from 'three';

/** The slice of the shader object onBeforeCompile receives. */
interface PatchableShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
}

export interface WindOptions {
  /** Sway amplitude in world units at the top of a prop. Default 0.06. */
  strength?: number;
  /** Oscillation speed. Default 1.2. */
  frequency?: number;
  /** Local height where sway begins (keeps trunks planted). Default 0.6. */
  anchorHeight?: number;
}

export interface Wind {
  /** Advance the animation. Call from your frame loop. */
  update(dt: number): void;
  /** Materials that were patched (for debugging/cleanup). */
  materials: Material[];
}

/**
 * Vertex-shader wind sway for scattered vegetation: displacement grows
 * with local height (trunk bases stay planted), phase varies per
 * instance so a forest shimmers instead of marching in step. Works on
 * meshes and InstancedMeshes; patches each unique material once via
 * onBeforeCompile.
 *
 * ```ts
 * const wind = applyWind(forest.group, { strength: 0.08 });
 * game.onUpdate((t) => wind.update(t.delta));
 * ```
 */
export function applyWind(target: Object3D, options: WindOptions = {}): Wind {
  const strength = options.strength ?? 0.06;
  const frequency = options.frequency ?? 1.2;
  const anchor = options.anchorHeight ?? 0.6;
  const time = { value: 0 };
  const patched = new Set<Material>();

  target.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (patched.has(material)) continue;
      patched.add(material);
      material.onBeforeCompile = (shader: PatchableShader) => {
        shader.uniforms.uWindTime = time;
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
             uniform float uWindTime;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             {
               float sway = max(position.y - ${anchor.toFixed(3)}, 0.0);
               float phase = 0.0;
               #ifdef USE_INSTANCING
                 phase = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 1.3;
               #endif
               float w = sin(uWindTime * ${(frequency * 2).toFixed(3)} + phase + position.y * 0.8);
               transformed.x += w * sway * ${strength.toFixed(4)} * 4.0;
               transformed.z += cos(uWindTime * ${(frequency * 1.4).toFixed(3)} + phase) * sway * ${strength.toFixed(4)} * 2.0;
             }`
          );
      };
      material.needsUpdate = true;
    }
  });

  return {
    update(dt) {
      time.value += dt;
    },
    materials: [...patched],
  };
}
