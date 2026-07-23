import { Clock, Mesh, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import {
  applyFog,
  createBungalow,
  createDayCycle,
  createHighrise,
  createLightingRig,
  createSky,
  createSurface,
  PALETTES,
} from 'scena3d';

const params = new URLSearchParams(location.search);
const fixedT = params.get('t');
const palette = PALETTES.urban;

const scene = new Scene();
const camera = new PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const sky = createSky({ palette });
scene.add(sky.mesh);
const rig = createLightingRig('day');
scene.add(rig.group);
applyFog(scene, 'haze', palette);

const plaza = new Mesh(new PlaneGeometry(300, 300), createSurface('concrete', { seed: 1 }));
plaza.rotation.x = -Math.PI / 2;
scene.add(plaza);

// ---- downtown: a cluster of towers, heights and facades varied ----------
const towers = [
  { seed: 11, floors: 22, x: 0, z: -30 },
  { seed: 23, floors: 15, x: -26, z: -18 },
  { seed: 31, floors: 10, x: 24, z: -16 },
  { seed: 44, floors: 17, x: -12, z: -48 },
  { seed: 57, floors: 8, x: 22, z: -42 },
  { seed: 63, floors: 12, x: 44, z: -30 },
].map(({ seed, floors, x, z }) => {
  const tower = createHighrise({ seed, floors, palette });
  tower.object.position.set(x, 0, z);
  tower.object.rotation.y = (seed % 7) * 0.1;
  scene.add(tower.object);
  return tower;
});

// One day cycle owns the whole district: sun, sky, fog — and every lit pane.
const lamps = towers.map((t) => t.object);

// A low-rise fringe: bungalows in the towers' shadow.
[[-40, 4, 0.5], [-24, 10, 0.1], [40, 2, -0.6]].forEach(([x, z, ry], i) => {
  const villa = createBungalow({ seed: 80 + i, palette });
  villa.object.position.set(x, 0, z);
  villa.object.rotation.y = ry;
  scene.add(villa.object);
  lamps.push(villa.object);
});
const cycle = createDayCycle({
  sky, rig, scene,
  lamps: lamps as never[],
  palette,
  dayLength: 80,
  timeOfDay: fixedT ? parseFloat(fixedT) : 0.45,
});

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!fixedT) cycle.update(dt);
  const e = clock.elapsedTime;
  camera.position.set(Math.sin(e * 0.04) * 60, 22 + Math.sin(e * 0.07) * 6, 75);
  camera.lookAt(0, 18, -28);
  renderer.render(scene, camera);
});

// Headless verification hook.
declare global {
  interface Window {
    skylineDebug: (t?: number) => Record<string, unknown>;
  }
}
window.skylineDebug = (t?: number) => {
  if (typeof t === 'number') cycle.set(t);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    timeOfDay: cycle.timeOfDay,
    towers: towers.length,
    windows: towers.reduce((a, t) => a + t.windowCount, 0),
    litWindows: towers.reduce((a, t) => a + t.litCount, 0),
    litEmissive: +towers[0].litPanes.emissiveIntensity.toFixed(3),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};
