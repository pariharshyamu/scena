import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  createPrecipitation,
  createWindField,
  createHouse,
  createTree,
  createSurface,
  PALETTES,
} from 'scena3d';

const type = (new URLSearchParams(location.search).get('type') as 'rain' | 'snow') ?? 'snow';
const palette = PALETTES.meadow;
const scene = new Scene();
// Overcast mood: a desaturated grey sky and a far, soft fog. Snow needs a
// slightly darker sky so the white flakes read against it.
const skyColor = type === 'snow' ? 0xb0bac2 : 0x9aa6ae;
scene.background = new Color(skyColor);
scene.fog = new Fog(skyColor, type === 'snow' ? 45 : 28, type === 'snow' ? 115 : 85);

const camera = new PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 300);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const sun = new DirectionalLight(0xf2f4f7, type === 'snow' ? 1.5 : 1.2);
sun.position.set(-4, 8, 5);
scene.add(sun);
scene.add(new AmbientLight(skyColor, 0.75));

const ground = new Mesh(new PlaneGeometry(200, 200), createSurface('dirt', { color: 0x6f6a4a }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// A little hamlet — the roofs and ground are what the snow settles on.
const houses = [
  [-4, -2, 0.3], [3.5, -3, -0.5], [5, 3, 2.4], [-5, 3.5, -0.8], [0, 5, Math.PI],
] as const;
houses.forEach(([x, z, ry], i) => {
  const h = createHouse({ seed: 10 + i, palette });
  h.object.position.set(x, 0, z);
  h.object.rotation.y = ry;
  scene.add(h.object);
});
for (let i = 0; i < 5; i++) {
  const tree = createTree({ seed: 30 + i, palette });
  const a = (i / 5) * Math.PI * 2;
  tree.object.position.set(Math.cos(a) * 11, 0, Math.sin(a) * 11);
  scene.add(tree.object);
}

// Weather. A light wind slants the fall; snow settles onto the hamlet.
const wind = createWindField({ direction: 20, strength: type === 'snow' ? 0.5 : 0.9 });
const weather =
  type === 'snow'
    ? createPrecipitation({ type, wind, count: 2600, size: 6, opacity: 0.62 })
    : createPrecipitation({ type, wind });
scene.add(weather.object);
// Snow settles on the up-facing faces — roofs and ground whiten, walls keep
// only a dusting (their steep normals barely collect).
if (type === 'snow') weather.accumulate(scene, { max: 0.8, rate: 0.6, capUp: 0.3 });

let t = 0;
function frame(): void {
  t += 0.004;
  camera.position.set(Math.sin(t * 0.4) * 13, 5.5, 14);
  camera.lookAt(0, 1.4, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { weatherDebug: () => unknown }).weatherDebug = () => {
  const gl = renderer.getContext();
  let cap = -1;
  scene.traverse((o) => {
    const u = ((o as Mesh).material as { userData?: { scenaSurface?: { uSurfCap: { value: number } } } })?.userData
      ?.scenaSurface;
    if (u) cap = Math.max(cap, u.uSurfCap.value);
  });
  return {
    type,
    drawCalls: renderer.info.render.calls,
    particles: weather.object.geometry.getAttribute('position').count,
    glError: gl.getError(),
    time: +(weather.material.uniforms.uTime.value as number).toFixed(3),
    snowCap: +cap.toFixed(3),
  };
};
