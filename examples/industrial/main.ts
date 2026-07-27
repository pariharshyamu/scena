import {
  BoxGeometry,
  Clock,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  applyFog,
  createLightingRig,
  createSky,
  createSurface,
  PALETTES,
  type SurfaceKind,
} from 'scena3d';

const palette = PALETTES.urban;
const scene = new Scene();
const camera = new PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'clear', palette);

// The road IS the asphalt sample: a road you look at edge-on tells you
// nothing, and the aggregate only reads at a grazing angle.
const road = new Mesh(new PlaneGeometry(70, 70), createSurface('asphalt', { seed: 3 }));
road.rotation.x = -Math.PI / 2;
scene.add(road);

const KINDS: SurfaceKind[] = [
  'corrugatedIron',
  'diamondPlate',
  'galvanised',
  'copperPatina',
  'basalt',
];
const panels = KINDS.map((kind, i) => {
  // Tall slabs, so the corrugation and the basalt columns have room to run.
  const panel = new Mesh(new BoxGeometry(1.7, 2.6, 0.5), createSurface(kind, { seed: 5 + i }));
  panel.position.set((i - 2) * 2.1, 1.3, 0);
  scene.add(panel);
  return panel;
});

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const t = clock.elapsedTime;
  camera.position.set(Math.sin(t * 0.14) * 3.4, 2.5, 8.4);
  camera.lookAt(0, 1.25, 0);
  renderer.render(scene, camera);
});

// Headless verification hook.
declare global {
  interface Window {
    industrialDebug: () => Record<string, unknown>;
  }
}
window.industrialDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    kinds: KINDS,
    panels: panels.length,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};
