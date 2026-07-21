import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';

export interface SkyOptions {
  topColor?: number;
  bottomColor?: number;
  radius?: number;
  palette?: Palette;
}

export interface Sky {
  mesh: Mesh;
  setColors(top: number, bottom: number): void;
}

/**
 * A gradient sky dome (vertical color blend on an inverted sphere).
 * Colors default to the palette, so themed scenes get matching skies.
 */
export function createSky(options: SkyOptions = {}): Sky {
  const palette = options.palette ?? DEFAULT_PALETTE;
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new Color(options.topColor ?? palette.skyTop) },
      bottomColor: { value: new Color(options.bottomColor ?? palette.skyBottom) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorld;
      void main() {
        float t = clamp(normalize(vWorld).y * 0.5 + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottomColor, topColor, pow(t, 0.8)), 1.0);
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(options.radius ?? 400, 16, 12), material);
  mesh.name = 'sky';

  return {
    mesh,
    setColors(top, bottom) {
      (material.uniforms.topColor.value as Color).setHex(top);
      (material.uniforms.bottomColor.value as Color).setHex(bottom);
    },
  };
}
