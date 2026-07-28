import {
  Clock,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
import {
  applyFog,
  createEnvironmentMap,
  createLightingRig,
  createSky,
  createSurface,
  PALETTES,
  type SurfaceKind,
} from 'scena3d';

const palette = PALETTES.meadow;
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

const rig = createLightingRig('day');
// AN ENVIRONMENT IS AMBIENT LIGHT WITH A DIRECTION, so it does the job the
// rig's flat AmbientLight is standing in for. Leave both at full strength
// and the scene washes out.
rig.ambient.intensity *= 0.4;
scene.add(createSky({ palette }).mesh, rig.group);
applyFog(scene, 'clear', palette);
// NOT applyEnvironment here: `scene.environment` cannot be opted out of by
// a single material — three overwrites material.envMapIntensity with
// scene.environmentIntensity for anything without an envMap of its own. So
// this builds the map and hands it out by hand, which is the only way to
// have one row reflect and the other not.
const envMap = createEnvironmentMap({ palette, sun: rig.sun });

const floor = new Mesh(
  new PlaneGeometry(60, 60),
  createSurface('slate', { seed: 4, color: 0x74787e })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const KINDS: SurfaceKind[] = ['chrome', 'steel', 'brass', 'galvanised', 'nacre'];
const balls: Mesh[] = [];
KINDS.forEach((kind, i) => {
  for (const reflects of [true, false]) {
    const mat = createSurface(kind, { seed: 3 + i });
    // Back row reflects, front row does not. For a metal that is the whole
    // difference between being a material and being a black ball: its
    // entire specular comes from the environment.
    if (reflects) mat.envMap = envMap;
    const ball = new Mesh(new SphereGeometry(0.62, 40, 28), mat);
    ball.position.set((i - 2) * 1.55, 0.75, reflects ? -1.8 : 1.5);
    scene.add(ball);
    balls.push(ball);
  }
});

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const t = clock.elapsedTime;
  camera.position.set(Math.sin(t * 0.12) * 1.4, 3.4, 7.6);
  camera.lookAt(0, 0.5, -0.2);
  renderer.render(scene, camera);
});

// Headless verification hook.
declare global {
  interface Window {
    environmentDebug: () => Record<string, unknown>;
  }
}
window.environmentDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    sceneEnvironment: scene.environment !== null,
    reflecting: balls.filter((b) => (b.material as MeshStandardMaterial).envMap !== null).length,
    plain: balls.filter((b) => (b.material as MeshStandardMaterial).envMap === null).length,
    kinds: KINDS,
    triangles: renderer.info.render.triangles,
  };
};
