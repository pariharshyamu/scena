import {
  BoxGeometry,
  Clock,
  Mesh,
  MeshPhysicalMaterial,
  OctahedronGeometry,
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
//
// The exception is the gemstone, which gets an octahedron — the facets are
// half of what makes a cut stone read as one, and a smooth ball of the same
// material just looks like a marble.
const KINDS: SurfaceKind[] = [
  'velvet', 'silk', 'brushedMetal', 'nacre', 'ice', 'gemstone',
];
const ball = new SphereGeometry(0.62, 40, 28);
const gem = new OctahedronGeometry(0.8, 0);
// ONE row, not two. Stacked front-to-back, any camera low enough to see the
// panel behind them hides the back row behind the front one, and any camera
// high enough to separate the rows puts floor behind everything instead.
const balls = KINDS.map((kind, i) => {
  const mesh = new Mesh(kind === 'gemstone' ? gem : ball, createSurface(kind, { seed: 3 + i }));
  mesh.position.set((i - 2.5) * 1.45, 0.85, 0);
  scene.add(mesh);
  return mesh;
});

// A STRIPED LIGHT PANEL BEHIND THE ROW, and it is not decoration.
//
// Every term in this tier is about what light does on its way past a
// surface, and two of them need something specific behind the object to do
// it to: transmission needs a subject to distort, and dispersion needs a
// hard EDGE — separating colours out of a smooth sky gradient separates
// nothing. Bright bars with dark gaps give the whole row edges to work
// with, and they backlight the velvet, which is where a sheen rim reads
// best anyway.
for (let k = 0; k < 9; k++) {
  const bar = new Mesh(new BoxGeometry(0.7, 3.4, 0.2), createSurface('crystal', { seed: 5 + k }));
  bar.position.set((k - 4) * 1.15, 1.7, -5);
  scene.add(bar);
}

// A solid object behind the ice as well, so its transmission has a shape to
// bend and not only stripes.
const knot = new Mesh(
  new TorusKnotGeometry(0.42, 0.14, 90, 12),
  createSurface('brass', { seed: 9 })
);
knot.position.set(2.17, 0.9, -2.3);
scene.add(knot);

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const t = clock.elapsedTime;
  knot.rotation.y = t * 0.5;
  // The gem turns: dispersion is view-dependent, so a still stone hides it.
  balls[5].rotation.set(0.35, t * 0.6, 0);
  camera.position.set(Math.sin(t * 0.15), 1.7, 13.9);
  camera.lookAt(0, 0.9, 0);
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
    dispersion: mat(5).dispersion,
    gemIor: mat(5).ior,
    programs: renderer.info.programs?.length ?? -1,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};
