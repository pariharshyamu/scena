import {
  Color,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  createTree,
  createSeasons,
  createWindField,
  createLightingRig,
  createSurface,
  applyFog,
  applyWind,
  scatter,
  treeBiome,
  PALETTES,
  type Season,
} from 'scena3d';

const params = new URLSearchParams(location.search);
const startSeason = (params.get('season') as Season) ?? 'summer';
const palette = PALETTES.meadow;

const scene = new Scene();
scene.background = new Color(0xbcd6e6);

const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const rig = createLightingRig('golden-hour');
rig.sun.castShadow = true;
scene.add(rig.group);
applyFog(scene, 'haze', palette);

const ground = new Mesh(new PlaneGeometry(240, 240), createSurface('dirt', { color: palette.grassLow }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const wind = createWindField({ direction: 40, strength: 0.3, gust: 0.6 });

// A mixed temperate wood — deciduous species that read a season well.
const wood = scatter({
  seed: 5,
  area: { min: { x: -46, z: -46 }, max: { x: 46, z: 46 } },
  density: 0.03,
  minSpacing: 3.4,
  items: treeBiome('temperate', { palette, variants: 5 }),
});
scene.add(wood.group);
applyWind(wood.group, { field: wind, height: 5, stiffness: 2, anchor: 0.8 });

// A couple of standalone specimens near the camera to read the grade up close.
[[-6, 20], [7, 18]].forEach(([x, z], i) => {
  const tree = createTree({ species: i === 0 ? 'maple' : 'oak', seed: 200 + i, palette, wind });
  tree.object.position.set(x, 0, z);
  tree.object.traverse((o) => { if (o instanceof Mesh) o.castShadow = true; });
  scene.add(tree.object);
});

// The season controller: re-grade every tagged canopy in the scene, then drive it.
const seasons = createSeasons({ initial: startSeason });
seasons.apply(scene);

// Auto-cycle spring → summer → autumn → winter.
const CYCLE: Season[] = ['spring', 'summer', 'autumn', 'winter'];
let idx = CYCLE.indexOf(startSeason);
if (idx < 0) idx = 1;
let sinceSwitch = 0;
const HOLD = 5; // seconds per season

let t = 0;
let lastMs = performance.now();
function frame(): void {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastMs) * 0.001);
  lastMs = now;
  sinceSwitch += dt;
  if (sinceSwitch > HOLD) {
    sinceSwitch = 0;
    idx = (idx + 1) % CYCLE.length;
    seasons.set(CYCLE[idx], { fade: 3.5 });
  }

  t += 0.0016;
  const R = 52;
  camera.position.set(Math.sin(t) * R, 16, Math.cos(t) * R * 0.6 + 12);
  camera.lookAt(0, 5, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Headless probe: force a season and read back the shared grade uniforms.
(window as unknown as { seasonDebug: (s?: Season) => unknown }).seasonDebug = (force) => {
  if (force) {
    seasons.set(force, { fade: 0.001 });
    for (let i = 0; i < 20; i++) seasons.update(0.05); // settle instantly
  }
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const u = seasons.uniforms;
  const tint = u.uSeasonTint.value as Color;
  return {
    season: seasons.season,
    graded: seasons.materials.length,
    tint: '#' + tint.getHexString(),
    tintAmount: (u.uSeasonTintAmt.value as number).toFixed(3),
    saturation: (u.uSeasonSat.value as number).toFixed(3),
    brightness: (u.uSeasonBright.value as number).toFixed(3),
    drawCalls: renderer.info.render.calls,
    glError: gl.getError(),
  };
};
