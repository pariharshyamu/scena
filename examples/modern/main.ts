import {
  BoxGeometry,
  Clock,
  Group,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  applyFog,
  createDayCycle,
  createGlass,
  createLightingRig,
  createSky,
  createSurface,
  PALETTES,
  type SurfaceKind,
} from 'scena3d';

const params = new URLSearchParams(location.search);
const fixedT = params.get('t');
const palette = PALETTES.meadow;

const scene = new Scene();
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 800);
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
applyFog(scene, 'clear', palette);

// Concrete plaza floor.
const ground = new Mesh(new PlaneGeometry(90, 60), createSurface('concrete', { seed: 1 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---- the wall gallery: one panel per modern kind ------------------------
const WALL_KINDS: SurfaceKind[] = [
  'concrete', 'paint', 'marble', 'steel', 'chrome', 'paintedMetal', 'corten', 'teak', 'porcelain', 'mosaic',
];
const panelGeo = new BoxGeometry(2.6, 3.2, 0.3);
WALL_KINDS.forEach((kind, i) => {
  const panel = new Mesh(panelGeo, createSurface(kind, { seed: 10 + i }));
  panel.position.set(-14.85 + i * 3.3, 1.6, -6);
  scene.add(panel);
});

// ---- the floor gallery: pattern kinds laid flat -------------------------
const FLOOR_KINDS: SurfaceKind[] = ['marble', 'terrazzo', 'parquet', 'patternedTile', 'mosaic'];
const slabGeo = new BoxGeometry(4.4, 0.12, 4.4);
FLOOR_KINDS.forEach((kind, i) => {
  const slab = new Mesh(slabGeo, createSurface(kind, { seed: 30 + i }));
  slab.position.set(-9.6 + i * 4.8, 0.06, 0.5);
  scene.add(slab);
});

// ---- the glass pavilion: clear / bronze / frosted, glowing at dusk ------
const pavilion = new Group();
const frame = createSurface('paintedMetal', { color: 0x2c3238, seed: 5 });
const paneGeo = new BoxGeometry(2.2, 2.6, 0.05);
const panes = [
  createGlass({ nightGlow: true }),
  createGlass({ tint: 0xc8a878, nightGlow: true }), // bronze
  createGlass({ frosted: true, nightGlow: true }),
];
panes.forEach((glass, i) => {
  const x = -2.6 + i * 2.6;
  const pane = new Mesh(paneGeo, glass);
  pane.position.set(x, 1.5, 0);
  pavilion.add(pane);
  for (const side of [-1.15, 1.15]) {
    const post = new Mesh(new BoxGeometry(0.12, 2.8, 0.12), frame);
    post.position.set(x + side, 1.4, 0);
    pavilion.add(post);
  }
});
const header = new Mesh(new BoxGeometry(8, 0.18, 0.2), frame);
header.position.set(0, 2.9, 0);
pavilion.add(header);
pavilion.position.set(1.5, 0, 5.5);
scene.add(pavilion);

// The day cycle owns sun/sky/fog and adopts the glass as dusk-lit windows.
const cycle = createDayCycle({
  sky, rig, scene,
  lamps: [pavilion],
  palette,
  dayLength: 60,
  timeOfDay: fixedT ? parseFloat(fixedT) : 0.42,
});

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!fixedT) cycle.update(dt);
  const e = clock.elapsedTime;
  camera.position.set(Math.sin(e * 0.06) * 10, 3.4, 13 + Math.cos(e * 0.06) * 2);
  camera.lookAt(0, 1.4, -2);
  renderer.render(scene, camera);
});

// Headless verification hook.
declare global {
  interface Window {
    modernDebug: (t?: number) => Record<string, unknown>;
  }
}
window.modernDebug = (t?: number) => {
  if (typeof t === 'number') cycle.set(t);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    timeOfDay: cycle.timeOfDay,
    wallPanels: WALL_KINDS.length,
    floorSlabs: FLOOR_KINDS.length,
    paneOpacities: panes.map((p) => +p.opacity.toFixed(2)),
    paneEmissive: panes.map((p) => +p.emissiveIntensity.toFixed(2)),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};
