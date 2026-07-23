import { Clock, Mesh, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import {
  applyFog,
  createBungalow,
  createDayCycle,
  createGate,
  createLightingRig,
  createSky,
  createSurface,
  createTree,
  PALETTES,
} from 'scena3d';

const params = new URLSearchParams(location.search);
const fixedT = params.get('t');
const palette = PALETTES.urban;

const scene = new Scene();
const camera = new PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 800);
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

const court = new Mesh(new PlaneGeometry(140, 140), createSurface('concrete', { seed: 1 }));
court.rotation.x = -Math.PI / 2;
scene.add(court);

// ---- the cul-de-sac: four villas facing the court -----------------------
const villas = [
  { seed: 11, x: -16, z: -14, ry: 0.25 },
  { seed: 23, x: 4, z: -18, ry: -0.1 },
  { seed: 37, x: 20, z: -6, ry: -0.7 },
  { seed: 45, x: -22, z: 6, ry: 0.9 },
].map(({ seed, x, z, ry }) => {
  const villa = createBungalow({ seed, palette });
  villa.object.position.set(x, 0, z);
  villa.object.rotation.y = ry;
  scene.add(villa.object);
  return villa;
});
// One single-storey villa to show the massing range.
const low = createBungalow({ seed: 52, floors: 1, palette });
low.object.position.set(30, 0, 14);
low.object.rotation.y = -2.2;
scene.add(low.object);
villas.push(low);

// Driveway gates at two plots.
const gates = [
  { style: 'slat' as const, x: -12, z: -6, ry: 0.25 },
  { style: 'panel' as const, x: 12, z: -12.5, ry: -0.1 },
].map(({ style, x, z, ry }, i) => {
  const gate = createGate({ style, width: 3, seed: 60 + i, palette });
  gate.object.position.set(x, 0, z);
  gate.object.rotation.y = ry;
  scene.add(gate.object);
  return gate;
});

// Clipped street trees.
[[-4, -8], [14, 2], [-14, 12], [2, -4]].forEach(([x, z], i) => {
  const tree = createTree({ species: 'maple', seed: 70 + i, height: 5.2, palette });
  tree.object.position.set(x, 0, z);
  scene.add(tree.object);
});

// The day cycle adopts every villa's glazing and the gate lamps.
const cycle = createDayCycle({
  sky, rig, scene,
  lamps: [...villas.map((v) => v.object), ...gates.map((g) => g.object)],
  palette,
  dayLength: 70,
  timeOfDay: fixedT ? parseFloat(fixedT) : 0.42,
});

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!fixedT) cycle.update(dt);
  const e = clock.elapsedTime;
  gates[0].setOpen(0.5 + 0.5 * Math.sin(e * 0.3));
  camera.position.set(Math.sin(e * 0.05) * 26, 7.5, 26 + Math.cos(e * 0.05) * 6);
  camera.lookAt(-2, 2.2, -6);
  renderer.render(scene, camera);
});

// Headless verification hook.
declare global {
  interface Window {
    bungalowDebug: (t?: number) => Record<string, unknown>;
  }
}
window.bungalowDebug = (t?: number) => {
  if (typeof t === 'number') cycle.set(t);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const paneIntensities = villas.flatMap((v) => v.panes.map((p) => p.emissiveIntensity));
  return {
    glError: gl.getError(),
    timeOfDay: cycle.timeOfDay,
    villas: villas.length,
    panes: paneIntensities.length,
    paneAvg: +(paneIntensities.reduce((a, b) => a + b, 0) / paneIntensities.length).toFixed(3),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};
