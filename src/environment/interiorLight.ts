import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  HemisphereLight,
  Mesh,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import type { Room, RoomWindow } from '../kits/room';

export interface InteriorSun {
  /** Sun elevation in [-1, 1] — same scale as `DayCycle.sunElevation`. */
  elevation: number;
  /**
   * Compass angle of the sun in radians: 0 = +z, π/2 = +x, -π/2 = -x.
   * Default 0.35 (a pleasant morning slant).
   */
  azimuth?: number;
}

export interface InteriorLightOptions {
  /**
   * A `DayCycle` (or anything with `sunElevation` + `timeOfDay`) to follow:
   * each `update()` re-aims the shafts and re-grades the fill from it.
   */
  cycle?: { readonly sunElevation: number; timeOfDay: number };
  /** Static sun when no cycle is bound. Default { elevation: 0.75, azimuth: 0.35 }. */
  sun?: InteriorSun;
  /** Peak shaft opacity (0-1). Default 0.16. */
  shaftStrength?: number;
  /** Dust motes drifting in each shaft. Default 26; 0 disables. */
  dust?: number;
  palette?: Palette;
}

export interface InteriorLight {
  /** Already added to `room.group` (shafts are room-local). */
  group: Group;
  /** The ambient fill — exposed for manual grading. */
  hemisphere: HemisphereLight;
  /** Aim the sun by hand (ignores any bound cycle until the next update). */
  setSun(sun: InteriorSun): void;
  /** Re-read the bound day cycle, if any. Call from the game loop. */
  update(dt?: number): void;
}

const SHAFT_VERT = /* glsl */ `
attribute float aFade;
varying float vFade;
void main() {
  vFade = aFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SHAFT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying float vFade;
void main() {
  float alpha = uStrength * (1.0 - vFade * 0.85);
  gl_FragColor = vec4(uColor, alpha);
}`;

const PATCH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const PATCH_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float alpha = uStrength * smoothstep(1.0, 0.15, d);
  gl_FragColor = vec4(uColor, alpha);
}`;

const DUST_VERT = /* glsl */ `
attribute vec3 aCell;   // (across, up, along) in [0,1] within the shaft prism
attribute float aPhase;
uniform vec3 uP;        // window opening center
uniform vec3 uR;        // right axis * opening width
uniform vec3 uUp;       // up axis * opening height
uniform vec3 uL;        // light direction * shaft length
uniform float uTime;
varying float vTwinkle;
void main() {
  vec3 p = uP + uR * (aCell.x - 0.5) + uUp * (aCell.y - 0.5) + uL * aCell.z;
  p.x += sin(uTime * 0.4 + aPhase * 6.28) * 0.06;
  p.y += sin(uTime * 0.27 + aPhase * 9.4) * 0.05;
  p.z += cos(uTime * 0.33 + aPhase * 7.7) * 0.06;
  vTwinkle = (0.55 + 0.45 * sin(uTime * 1.7 + aPhase * 12.0)) * (1.0 - aCell.z * 0.7);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = 26.0 / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const DUST_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying float vTwinkle;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor, uStrength * vTwinkle * (1.0 - d * 2.0));
}`;

const MAX_SHAFT_LENGTH = 9;

interface Shaft {
  window: RoomWindow;
  mesh: Mesh;
  positions: Float32Array;
  patch: Mesh;
  shaftU: { uColor: { value: Color }; uStrength: { value: number } };
  patchU: { uColor: { value: Color }; uStrength: { value: number } };
  dustU: {
    uP: { value: Vector3 };
    uR: { value: Vector3 };
    uUp: { value: Vector3 };
    uL: { value: Vector3 };
    uTime: { value: number };
    uColor: { value: Color };
    uStrength: { value: number };
  } | null;
}

/**
 * Interior daylight for a `createRoom` interior: a palette-tinted hemisphere
 * fill (warm floor bounce under a cool ceiling), a volumetric-looking light
 * shaft through every sun-facing window — angled by the sun, landing in a
 * soft pool on the floor, with dust motes drifting through it — and the
 * window panes brightening at noon and going dark at night.
 *
 * No real lights beyond the single hemisphere: shafts and patches are unlit
 * additive quads, so the whole effect costs a handful of draw calls. Real
 * point lights stay a budget the room controls (`hearthLight`, torches).
 *
 * ```ts
 * const light = createInteriorLight(room, { cycle });   // follows the day
 * game.onUpdate(() => light.update());                  // dusk = shafts die
 * ```
 *
 * The group is added to `room.group` automatically (shafts are room-local),
 * so `room.setActive(false)` hides the light rig too.
 */
export function createInteriorLight(room: Room, options: InteriorLightOptions = {}): InteriorLight {
  const palette = options.palette ?? DEFAULT_PALETTE;
  const shaftStrength = options.shaftStrength ?? 0.16;
  const dustCount = options.dust ?? 26;
  const cycle = options.cycle;

  const group = new Group();
  group.name = 'interiorLight';

  // Ambient fill: sky tint from above, warm wood bounce from below.
  const ground = new Color(palette.wood).lerp(new Color(0xffffff), 0.2);
  const hemisphere = new HemisphereLight(palette.skyBottom, ground, 0.55);
  group.add(hemisphere);

  const warm = new Color(0xffd9a0);
  const pale = new Color(0xfff3df);
  const nightPane = new Color(0x141c30);
  const dayPane = new Color(palette.skyBottom);

  const shafts: Shaft[] = room.windows.map((window) => {
    // A skewed prism: the window quad swept along the light direction to the
    // floor. 8 vertices, updated on the CPU whenever the sun moves.
    const positions = new Float32Array(8 * 3);
    const fades = new Float32Array(8);
    fades.fill(0, 0, 4);
    fades.fill(1, 4, 8);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aFade', new BufferAttribute(fades, 1));
    // Quads between window verts (0-3) and landing verts (4-7); windows are
    // corners in the order (-r,-u) (r,-u) (r,u) (-r,u).
    geometry.setIndex([
      0, 1, 5, 0, 5, 4, // bottom sheet
      2, 3, 7, 2, 7, 6, // top sheet
      1, 2, 6, 1, 6, 5, // side
      3, 0, 4, 3, 4, 7, // side
      4, 5, 6, 4, 6, 7, // landing cap
    ]);
    const shaftU = { uColor: { value: warm.clone() }, uStrength: { value: 0 } };
    const material = new ShaderMaterial({
      uniforms: shaftU,
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: 2, // DoubleSide — visible from any angle inside the room
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    group.add(mesh);

    // The pool of light where the shaft lands.
    const patchU = { uColor: { value: warm.clone() }, uStrength: { value: 0 } };
    const patchGeo = new BufferGeometry();
    patchGeo.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]), 3)
    );
    patchGeo.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    patchGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const patch = new Mesh(
      patchGeo,
      new ShaderMaterial({
        uniforms: patchU,
        vertexShader: PATCH_VERT,
        fragmentShader: PATCH_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      })
    );
    patch.frustumCulled = false;
    group.add(patch);

    // Dust motes drifting inside the prism.
    let dustU: Shaft['dustU'] = null;
    if (dustCount > 0) {
      const cells = new Float32Array(dustCount * 3);
      const phases = new Float32Array(dustCount);
      for (let i = 0; i < dustCount; i++) {
        cells[i * 3] = (i * 0.618033) % 1;
        cells[i * 3 + 1] = (i * 0.754877) % 1;
        cells[i * 3 + 2] = (i * 0.569840) % 1;
        phases[i] = (i * 0.414213) % 1;
      }
      const dustGeo = new BufferGeometry();
      dustGeo.setAttribute('position', new BufferAttribute(new Float32Array(dustCount * 3), 3));
      dustGeo.setAttribute('aCell', new BufferAttribute(cells, 3));
      dustGeo.setAttribute('aPhase', new BufferAttribute(phases, 1));
      dustU = {
        uP: { value: window.position.clone() },
        uR: { value: new Vector3() },
        uUp: { value: new Vector3() },
        uL: { value: new Vector3() },
        uTime: { value: 0 },
        uColor: { value: pale.clone() },
        uStrength: { value: 0 },
      };
      const dust = new Points(
        dustGeo,
        new ShaderMaterial({
          uniforms: dustU,
          vertexShader: DUST_VERT,
          fragmentShader: DUST_FRAG,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        })
      );
      dust.frustumCulled = false;
      group.add(dust);
    }
    return { window, mesh, positions, patch, shaftU, patchU, dustU };
  });

  // The dust clock self-drives from the render loop, like every SCENA flame.
  if (shafts.length > 0 && dustCount > 0) {
    shafts[0].mesh.onBeforeRender = () => {
      const t = performance.now() * 0.001;
      for (const shaft of shafts) if (shaft.dustU) shaft.dustU.uTime.value = t;
    };
  }

  const up = new Vector3(0, 1, 0);
  const setSun = ({ elevation, azimuth = 0.35 }: InteriorSun): void => {
    const day = Math.max(0, Math.min(1, elevation));
    hemisphere.intensity = 0.18 + 0.55 * day;
    hemisphere.color.copy(dayPane).lerp(nightPane, 1 - day);

    // Sun direction (toward the sun) and light travel direction into rooms.
    // The apparent elevation is capped short of the zenith so a noon sun still
    // slants through windows instead of vanishing straight overhead.
    const el = Math.asin(Math.min(0.88, Math.max(0.02, day)));
    const sunDir = new Vector3(
      Math.sin(azimuth) * Math.cos(el),
      Math.sin(el),
      Math.cos(azimuth) * Math.cos(el)
    );
    const travel = sunDir.clone().negate();
    const color = warm.clone().lerp(pale, day);

    for (const shaft of shafts) {
      const { window } = shaft;
      window.pane.emissiveIntensity = 0.12 + 1.15 * day;
      window.pane.emissive.copy(dayPane).lerp(nightPane, 1 - day);
      window.pane.color.copy(window.pane.emissive);

      // Only windows the sun actually shines through get a shaft.
      const admit = travel.dot(window.normal);
      const strength = shaftStrength * Math.min(1, admit * 2.5) * Math.min(1, day * 3);
      const lit = strength > 0.005;
      shaft.mesh.visible = lit;
      shaft.patch.visible = lit;
      shaft.shaftU.uStrength.value = Math.max(0, strength);
      shaft.shaftU.uColor.value.copy(color);
      shaft.patchU.uStrength.value = Math.max(0, strength) * 1.4;
      shaft.patchU.uColor.value.copy(color);
      if (shaft.dustU) {
        shaft.dustU.uStrength.value = lit ? Math.min(0.5, strength * 3) : 0;
        shaft.dustU.uColor.value.copy(color);
      }
      if (!lit) continue;

      const right = new Vector3().crossVectors(up, window.normal).normalize();
      const halfR = right.clone().multiplyScalar(window.width / 2);
      const halfU = up.clone().multiplyScalar(window.height / 2);
      const corners = [
        window.position.clone().sub(halfR).sub(halfU),
        window.position.clone().add(halfR).sub(halfU),
        window.position.clone().add(halfR).add(halfU),
        window.position.clone().sub(halfR).add(halfU),
      ];
      const landingSum = new Vector3();
      let maxLen = 0;
      corners.forEach((corner, i) => {
        shaft.positions[i * 3] = corner.x;
        shaft.positions[i * 3 + 1] = corner.y;
        shaft.positions[i * 3 + 2] = corner.z;
        const t = Math.min(MAX_SHAFT_LENGTH, (corner.y - 0.03) / Math.max(0.05, -travel.y));
        maxLen = Math.max(maxLen, t);
        const landing = corner.clone().addScaledVector(travel, t);
        shaft.positions[(i + 4) * 3] = landing.x;
        shaft.positions[(i + 4) * 3 + 1] = landing.y;
        shaft.positions[(i + 4) * 3 + 2] = landing.z;
        landingSum.add(landing);
      });
      (shaft.mesh.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;

      const landingCenter = landingSum.multiplyScalar(0.25);
      shaft.patch.visible = lit && landingCenter.y < 0.4;
      shaft.patch.position.set(landingCenter.x, 0.035, landingCenter.z);
      // Low sun drags the pool longer along the light's floor direction.
      const stretch = 1.2 + (1 - Math.abs(travel.y)) * 1.4;
      shaft.patch.scale.set(window.width * 1.5, 1, window.width * stretch);
      shaft.patch.rotation.set(0, Math.atan2(travel.x, travel.z), 0);

      if (shaft.dustU) {
        shaft.dustU.uP.value.copy(window.position);
        shaft.dustU.uR.value.copy(right).multiplyScalar(window.width);
        shaft.dustU.uUp.value.copy(up).multiplyScalar(window.height);
        shaft.dustU.uL.value.copy(travel).multiplyScalar(maxLen);
      }
    }
  };

  setSun(options.sun ?? (cycle ? sunFromCycle(cycle) : { elevation: 0.75, azimuth: 0.35 }));
  room.group.add(group);

  return {
    group,
    hemisphere,
    setSun,
    update() {
      if (cycle) setSun(sunFromCycle(cycle));
    },
  };
}

/** Map a day cycle's time to a sweeping azimuth: east at dawn, west at dusk. */
function sunFromCycle(cycle: { readonly sunElevation: number; timeOfDay: number }): InteriorSun {
  const progress = (cycle.timeOfDay - 0.25) / 0.5; // 0 dawn → 1 dusk
  return {
    elevation: cycle.sunElevation,
    azimuth: (0.5 - Math.max(0, Math.min(1, progress))) * Math.PI,
  };
}
