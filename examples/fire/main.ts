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
  createSurface,
  createBrazier,
  createCampfire,
  createHouse,
  createStatue,
  PALETTES,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
// Dusk/night so the firelight reads.
scene.background = new Color(0x121a2a);
scene.fog = new Fog(0x121a2a, 14, 44);

const camera = new PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 200);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Faint moonlight; the fires do the real lighting.
const moon = new DirectionalLight(0x4a5a7a, 0.35);
moon.position.set(-4, 8, 3);
scene.add(moon);
scene.add(new AmbientLight(0x223044, 0.4));

const ground = new Mesh(new PlaneGeometry(120, 120), createSurface('dirt', { color: 0x4a4033 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// A campfire at the centre, a brazier either side, some props to catch light.
const campfire = createCampfire({ seed: 3, palette });
scene.add(campfire.object);

const b1 = createBrazier({ seed: 5, palette });
b1.object.position.set(-2.6, 0, 1.2);
scene.add(b1.object);
const b2 = createBrazier({ seed: 8, palette });
b2.object.position.set(2.6, 0, 1.2);
scene.add(b2.object);

const house = createHouse({ seed: 10, palette });
house.object.position.set(0, 0, -4.5);
scene.add(house.object);
const statue = createStatue({ seed: 16, figure: 'figure', palette });
statue.object.position.set(-4.5, 0, -1.5);
scene.add(statue.object);

let t = 0.3;
function frame(): void {
  t += 0.004;
  camera.position.set(Math.sin(t) * 6.5, 2.6, 7);
  camera.lookAt(0, 1.2, -0.5);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Diagnostics: report the fire's live PointLight intensity so a headless test
// can prove it flickers between frames.
(window as unknown as { fireDebug: () => unknown }).fireDebug = () => {
  const gl = renderer.getContext();
  const intensities: number[] = [];
  scene.traverse((o) => {
    if ((o as { isPointLight?: boolean }).isPointLight) {
      intensities.push(+(o as unknown as { intensity: number }).intensity.toFixed(4));
    }
  });
  return {
    drawCalls: renderer.info.render.calls,
    glError: gl.getError(),
    pointLights: intensities.length,
    intensities,
  };
};
