import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import {
  createWindField,
  applyWind,
  createSurface,
  createTree,
  createBush,
  createGrassTuft,
  scatter,
  PALETTES,
  type Palette,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
scene.background = new Color(0xaecbe0);
scene.fog = new Fog(0xaecbe0, 30, 80);

const camera = new PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 300);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const sun = new DirectionalLight(0xfff2df, 2.3);
sun.position.set(-5, 8, 4);
scene.add(sun);
scene.add(new AmbientLight(0xaecbe0, 0.6));

const ground = new Mesh(new PlaneGeometry(180, 180), createSurface('dirt', { color: 0x7c8a52 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// One wind field drives everything, so a single gust crosses the whole scene.
const wind = createWindField({ direction: 28, strength: 0.42, gust: 0.75, waveLength: 4, waveSpeed: 2.6 });

// A wheat field: dense golden blades. A tight wave length makes the travelling
// gust read as a ripple crossing the field.
const wheatPalette: Palette = {
  ...palette,
  grassHigh: 0xdcc063,
  grassLow: 0xc2a747,
  foliage: [0xcbb24a, 0xdcc063, 0xc0a840, 0xd3bd58],
};
const wheat = scatter({
  seed: 5,
  area: { min: { x: -13, z: -13 }, max: { x: 13, z: 13 } },
  density: 3.2,
  minSpacing: 0.24,
  items: [{ create: (r) => createGrassTuft({ seed: r.int(1, 1e9), blades: 7, palette: wheatPalette }), variants: 14 }],
});
scene.add(wheat.group);
applyWind(wheat.group, { field: wind, height: 0.5, stiffness: 1.1, anchor: 0.03 });

// Trees ringing the field — same field, so their canopies lean with the wheat.
const trees = scatter({
  seed: 8,
  area: { min: { x: -26, z: -26 }, max: { x: 26, z: 26 } },
  density: 0.04,
  minSpacing: 3,
  items: [{ create: (r) => createTree({ seed: r.int(1, 1e9), palette }), variants: 6 }],
  mask: (x, z) => Math.hypot(x, z) > 17,
});
scene.add(trees.group);
applyWind(trees.group, { field: wind, height: 4, stiffness: 2.4, anchor: 1 });

// A few bushes built with wind straight from the generator.
for (let i = 0; i < 6; i++) {
  const b = createBush({ seed: 40 + i, wind, palette });
  const a = (i / 6) * Math.PI * 2;
  b.object.position.set(Math.cos(a) * 15.5, 0, Math.sin(a) * 15.5);
  scene.add(b.object);
}

const view = new URLSearchParams(location.search).get('view');

let t = 0;
function frame(): void {
  t += 0.004;
  if (view === 'field') {
    camera.position.set(Math.sin(t * 0.3) * 8, 1.6, 12);
    camera.lookAt(0, 0.6, 0);
  } else {
    camera.position.set(Math.sin(t * 0.3) * 16, 7, 18);
    camera.lookAt(0, 1, 0);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { windDebug: () => unknown }).windDebug = () => {
  const gl = renderer.getContext();
  const s = wind.sample(6, 2) as Vector2;
  return {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    glError: gl.getError(),
    boundMaterials: wind.materials.length,
    windTime: +(wind.uniforms.uWindTime.value as number).toFixed(3),
    sample: [+s.x.toFixed(3), +s.y.toFixed(3)],
  };
};
