import {
  Color,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  createWeather,
  createWindField,
  createTerrain,
  createTree,
  createGrassTuft,
  createLightingRig,
  applyWind,
  scatter,
  PALETTES,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
scene.background = new Color(0xbcd4e6);

const camera = new PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const rig = createLightingRig('overcast');
scene.add(rig.group);

const terrain = createTerrain({ seed: 5, size: 100, resolution: 100, amplitude: 4, valleyFlatness: 0.65, palette });
scene.add(terrain.mesh);

// The shared wind field — the weather controller will drive its strength.
const wind = createWindField({ direction: 40, strength: 0.15, gust: 0.5 });

const wood = scatter({
  seed: 6,
  area: { min: { x: -44, z: -44 }, max: { x: 44, z: 44 } },
  surface: terrain.heightAt,
  density: 0.02,
  minSpacing: 3.5,
  items: [{ create: (r) => createTree({ seed: r.int(1, 1e9), palette }), variants: 5 }],
  mask: (x, z) => Math.hypot(x, z) > 8,
});
scene.add(wood.group);
applyWind(wood.group, { field: wind, height: 4, stiffness: 1.8, anchor: 1 });

const meadow = scatter({
  seed: 7,
  area: { min: { x: -26, z: -26 }, max: { x: 26, z: 26 } },
  surface: terrain.heightAt,
  density: 0.35,
  minSpacing: 0.7,
  items: [{ create: (r) => createGrassTuft({ seed: r.int(1, 1e9), palette }), variants: 4 }],
});
scene.add(meadow.group);
applyWind(meadow.group, { field: wind, height: 0.5, stiffness: 1.2, anchor: 0.03 });

// The controller: reuse the wind flora is bound to, dim the rig, settle snow.
const weather = createWeather(scene, {
  wind,
  sun: rig.sun,
  ambient: rig.ambient,
  accumulateOn: scene,
  initial: 'clear',
});

// Cycle through the states on a timer.
const CYCLE = ['clear', 'overcast', 'fog', 'rain', 'storm', 'snow', 'blizzard'] as const;
let ci = 0;
const stateEl = document.getElementById('state')!;
function next(): void {
  ci = (ci + 1) % CYCLE.length;
  weather.set(CYCLE[ci], { fade: 3.5 });
  stateEl.textContent = CYCLE[ci];
  setTimeout(next, 6000);
}
setTimeout(next, 4000);

let t = 0;
function frame(): void {
  t += 0.0016;
  camera.position.set(Math.sin(t) * 30, 10, Math.cos(t) * 30);
  camera.lookAt(0, 4, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { weatherDebug: (s?: string) => unknown }).weatherDebug = (setTo?: string) => {
  if (setTo) {
    weather.set(setTo, { fade: 0.001 });
    stateEl.textContent = setTo;
  }
  const gl = renderer.getContext();
  const fog = scene.fog as unknown as { far: number };
  return {
    state: weather.state,
    glError: gl.getError(),
    windStrength: +weather.wind.strength.toFixed(3),
    rain: +(weather.rain.material.uniforms.uIntensity.value as number).toFixed(2),
    snow: +(weather.snow.material.uniforms.uIntensity.value as number).toFixed(2),
    fogFar: +fog.far.toFixed(1),
    sky: (scene.background as Color).getHexString(),
    sun: +rig.sun.intensity.toFixed(2),
  };
};
