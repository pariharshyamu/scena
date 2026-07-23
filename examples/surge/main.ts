import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  createOcean,
  createWeather,
  createWindField,
  createTerrain,
  createLightingRig,
  createSurface,
  createTree,
  createRock,
  scatter,
  aboveWater,
  PALETTES,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
scene.background = new Color(0xaecbe0);

const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 600);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const rig = createLightingRig('golden-hour');
scene.add(rig.group);

const SEA = 3.2;
const ISLE = 30;
// A low, gentle coast — mostly sand and shallow dunes — so the open sea and its
// surge are the subject, not a mountain.
const terrain = createTerrain({ seed: 4, size: ISLE * 2, amplitude: 3.4, noiseScale: 22, waterLevel: SEA, palette });
scene.add(terrain.mesh);
const shore = (x: number, z: number): number =>
  Math.abs(x) < ISLE && Math.abs(z) < ISLE ? terrain.heightAt(x, z) : SEA - 6;

// The shared wind, and the weather controller that drives it. `storminess` is
// the live, cross-faded sea-roughness we hand to the ocean.
const wind = createWindField({ direction: 35, strength: 0.4 });
const weather = createWeather(scene, { wind, sun: rig.sun, ambient: rig.ambient, initial: 'clear' });

const ocean = createOcean({
  level: SEA,
  size: 320,
  amplitude: 0.55,
  choppiness: 0.8,
  wavelength: 24,
  wind,
  shore,
  surge: 1.6,
  storm: () => weather.storminess, // ← the wiring
});
scene.add(ocean.mesh);

// Trees & rocks on the dry island, bound to the same wind so they thrash in the storm.
const island = scatter({
  seed: 3,
  area: { min: { x: -50, z: -50 }, max: { x: 50, z: 50 } },
  surface: terrain.heightAt,
  density: 0.045,
  minSpacing: 2.5,
  items: [
    { create: (r) => createTree({ seed: r.int(1, 1e9), palette }), weight: 3, variants: 5 },
    { create: (r) => createRock({ seed: r.int(1, 1e9), palette }) },
  ],
  mask: aboveWater(terrain, { level: SEA }, 0.6),
});
scene.add(island.group);

// A boat that rides the swell — and the surge lifts it as the storm builds.
const boat = new Group();
const woodMat = createSurface('plank', { color: palette.wood, seed: 2 });
const hull = new Mesh(new BoxGeometry(1.6, 0.55, 3.6), woodMat);
hull.position.y = 0.12;
const mast = new Mesh(new CylinderGeometry(0.05, 0.08, 3.2, 6), createSurface('wood', { color: palette.woodDark }));
mast.position.set(0, 1.7, -0.2);
const sail = new Mesh(new BoxGeometry(0.06, 1.9, 1.7), createSurface('canvas', { color: 0xe8e0cc }));
sail.position.set(0, 1.8, -0.2);
boat.add(hull, mast, sail);
scene.add(boat);
const bx = 18;
const bz = 26;

// Cycle calm ↔ storm so the surge is easy to watch.
const CYCLE = ['clear', 'overcast', 'storm', 'storm', 'overcast'] as const;
let ci = 0;
const stateEl = document.getElementById('state')!;
function next(): void {
  ci = (ci + 1) % CYCLE.length;
  weather.set(CYCLE[ci], { fade: 5 });
  stateEl.textContent = CYCLE[ci];
  setTimeout(next, 6500);
}
setTimeout(next, 4500);

let t = 0;
function frame(): void {
  t += 0.005;
  boat.position.set(bx, ocean.heightAt(bx, bz), bz);
  const hX = ocean.heightAt(bx + 1, bz);
  const hZ = ocean.heightAt(bx, bz + 1);
  boat.rotation.z = (ocean.heightAt(bx - 1, bz) - hX) * 0.35;
  boat.rotation.x = (hZ - ocean.heightAt(bx, bz - 1)) * 0.35;
  // Sit out on the open water and look back at the low coast, so the waves
  // (and the surge flooding the beach) fill the foreground.
  camera.position.set(Math.sin(t * 0.12) * 12, SEA + 6.5, 60);
  camera.lookAt(0, SEA + 0.5, 20);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { surgeDebug: (s?: string) => unknown }).surgeDebug = (setTo?: string) => {
  if (setTo) {
    weather.set(setTo, { fade: 0.001 });
    stateEl.textContent = setTo;
  }
  const gl = renderer.getContext();
  return {
    state: weather.state,
    glError: gl.getError(),
    storminess: +weather.storminess.toFixed(3),
    seaLevel: +ocean.mesh.position.y.toFixed(3),
    boatY: +boat.position.y.toFixed(3),
    waveAt00: +ocean.heightAt(0, 0).toFixed(3),
  };
};
