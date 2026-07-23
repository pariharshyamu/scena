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
  createCladding,
  createDayCycle,
  createGate,
  createGlass,
  createLightingRig,
  createModernWindow,
  createPergola,
  createPlanter,
  createRailing,
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

// ---- the component strip: railings, gate, cladding, pergola -------------
(['bars', 'cable', 'glass', 'panel'] as const).forEach((style, i) => {
  const railing = createRailing({ style, length: 3.4, seed: 40 + i });
  railing.object.position.set(-12.5 + i * 3.8, 0, 9.5);
  scene.add(railing.object);
});
const gate = createGate({ style: 'slat', width: 3, open: 0.35, seed: 44, palette });
gate.object.position.set(6.5, 0, 9.8);
scene.add(gate.object);
const win = createModernWindow({ style: 'sliding', width: 2.2, seed: 45 });
win.object.position.set(12, 0, 6);
scene.add(win.object);
const cladA = createCladding({ style: 'slats', width: 2.6, seed: 46 });
cladA.object.position.set(-16.5, 0, 2);
cladA.object.rotation.y = 0.6;
scene.add(cladA.object);
const cladB = createCladding({ style: 'stone', width: 2.6, seed: 47 });
cladB.object.position.set(-16.9, 0, 5.4);
cladB.object.rotation.y = 0.6;
scene.add(cladB.object);
const pergola = createPergola({ seed: 48 });
pergola.object.position.set(9.5, 0, 1.5);
scene.add(pergola.object);
[[-1.4, 0], [1.4, 0]].forEach(([dx, dz], i) => {
  const planter = createPlanter({ seed: 50 + i, palette });
  planter.object.position.set(9.5 + dx, 0, 1.5 + dz);
  planter.object.rotation.y = Math.PI / 2;
  scene.add(planter.object);
});

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
  gate.setOpen(0.5 + 0.5 * Math.sin(e * 0.4)); // the gate swings on its own
  camera.position.set(Math.sin(e * 0.06) * 12, 5.2, 16.5);
  camera.lookAt(-1, 1.2, 0);
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
    slidingPane: win.pane.transparent,
    railings: 4,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};
