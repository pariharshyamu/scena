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
  createPrecipitation,
  createSky,
  createSurface,
  PALETTES,
  type SurfaceKind,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
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

// Six presets that wet very differently: porous stone, plaster and sand go
// almost black, sealed glaze and marble barely move, and the tiling kinds
// show the joints filling first. (No metals here — chrome and steel need an
// environment map to reflect, and this scene has none.)
const KINDS: SurfaceKind[] = ['cobblestone', 'plaster', 'brick', 'sandstone', 'glaze', 'marble'];

const floor = new Mesh(
  new PlaneGeometry(60, 60),
  createSurface('concrete', { seed: 2, color: 0x8d8d88 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
scene.add(floor);

// Front row dry, back row soaked — one frame, direct comparison.
const soaked: Mesh[] = [];
KINDS.forEach((kind, i) => {
  for (const wet of [0, 0.92]) {
    const slab = new Mesh(
      new BoxGeometry(1.5, 1.5, 0.45),
      createSurface(kind, { seed: 7 + i, wet })
    );
    // Dry rank in front, soaked rank well behind it, with daylight between
    // them — the whole point of the shot is that the pairs are comparable.
    slab.position.set((i - 2.5) * 1.85, 0.75, wet > 0 ? -3.2 : 2.4);
    scene.add(slab);
    if (wet > 0) soaked.push(slab);
  }
});

// And the wiring: real rain, soaking the floor and drying it again.
const rain = createPrecipitation({ type: 'rain', count: 2600, area: [40, 26, 40] });
scene.add(rain.object);
rain.soak(floor, { max: 0.95, rate: 0.3, dry: 0.06 });

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  // A shower that comes and goes, so the floor darkens and dries on a loop.
  rain.setIntensity(t % 24 < 12 ? 1 : 0);
  rain.update(dt);
  camera.position.set(Math.sin(t * 0.1) * 3, 6.4, 10.5);
  camera.lookAt(0, 0.2, -0.4);
  renderer.render(scene, camera);
});

// Headless verification hook.
declare global {
  interface Window {
    wearDebug: () => Record<string, unknown>;
  }
}
window.wearDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const u = (m: Mesh): number =>
    (m.material as unknown as { userData: { scenaSurface: { uSurfWet: { value: number } } } })
      .userData.scenaSurface.uSurfWet.value;
  return {
    glError: gl.getError(),
    soakedWet: soaked.map((m) => +u(m).toFixed(2)),
    floorWet: +u(floor).toFixed(3),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};
