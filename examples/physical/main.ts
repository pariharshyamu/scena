import {
  Clock,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  TorusKnotGeometry,
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

const palette = PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 900);
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

const floor = new Mesh(
  new PlaneGeometry(60, 60),
  createSurface('slate', { seed: 4, color: 0x6f7378 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Spheres, not boxes: a sheen rim and an anisotropic streak are about the
// way the highlight WRAPS, and a flat face has nothing to wrap around.
const KINDS: SurfaceKind[] = ['velvet', 'silk', 'brushedMetal', 'nacre', 'ice'];
const balls = KINDS.map((kind, i) => {
  const ball = new Mesh(new SphereGeometry(0.62, 40, 28), createSurface(kind, { seed: 3 + i }));
  ball.position.set((i - 2) * 1.55, 0.75, 0);
  scene.add(ball);
  return ball;
});

// Something behind the ice, so transmission has something to distort.
const knot = new Mesh(
  new TorusKnotGeometry(0.42, 0.14, 90, 12),
  createSurface('brass', { seed: 9 })
);
knot.position.set(3.1, 0.78, -1.9);
scene.add(knot);

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const t = clock.elapsedTime;
  knot.rotation.y = t * 0.5;
  camera.position.set(Math.sin(t * 0.15) * 1.4, 1.5, 7.6);
  camera.lookAt(0, 0.74, 0);
  renderer.render(scene, camera);
});

// Headless verification hook.
declare global {
  interface Window {
    physicalDebug: () => Record<string, unknown>;
  }
}
window.physicalDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const mat = (i: number) => balls[i].material as MeshPhysicalMaterial;
  return {
    glError: gl.getError(),
    sheen: mat(0).sheen,
    anisotropy: mat(1).anisotropy,
    iridescence: mat(3).iridescence,
    transmission: mat(4).transmission,
    programs: renderer.info.programs?.length ?? -1,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};
