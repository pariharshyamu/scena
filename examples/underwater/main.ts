import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Group,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  createGodRays,
  createCaustics,
  createBubbles,
  createWaterGrade,
  createFlock,
  createRock,
  createSurface,
  PALETTES,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
// A blue-green haze that swallows distance — the classic underwater look.
scene.background = new Color(0x0e3a49);
scene.fog = new Fog(0x0e3a49, 8, 46);

const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(new DirectionalLight(0xbfe8f0, 1.1), new AmbientLight(0x2c6675, 0.9));

const SEABED = -6;

// The seabed: sand + scattered rocks, all catching the caustics.
const seabed = new Group();
const sand = new Mesh(new PlaneGeometry(120, 120, 1, 1), createSurface('sand', { color: 0x7d8a76 }));
sand.rotation.x = -Math.PI / 2;
sand.position.y = SEABED;
seabed.add(sand);
for (let i = 0; i < 12; i++) {
  const rock = createRock({ seed: 30 + i, palette });
  const a = (i / 12) * Math.PI * 2 + i * 0.7;
  const r = 6 + (i % 4) * 4;
  rock.object.position.set(Math.cos(a) * r, SEABED, Math.sin(a) * r);
  rock.object.scale.setScalar(1.2 + (i % 3) * 0.5);
  seabed.add(rock.object);
}
scene.add(seabed);

// Caustics: the moving light net, projected onto the sand and rocks.
const caustics = createCaustics({ intensity: 0.55, scale: 0.42, speed: 0.7 });
caustics.apply(seabed);

// Colour grade: everything fades into the deep with distance & depth (red goes
// first), so the reef sinks into the blue instead of staying flatly lit.
const grade = createWaterGrade({ surface: 6, color: 0x0e3a49, density: 0.03, depthDensity: 0.05, redShift: 0.7 });
grade.apply(seabed);

// God rays streaming down from the surface above.
const rays = createGodRays({ count: 24, height: 26, width: 1.6, spread: 20, tilt: 22, opacity: 0.16, seed: 4 });
rays.object.position.y = 6; // the (unseen) surface, well above the bed
scene.add(rays.object);

// Bubble columns rising from vents among the rocks.
const bubbles = createBubbles({ count: 300, columns: 7, area: 14, floor: SEABED, rise: 11, seed: 6 });
scene.add(bubbles.object);

// A school drifting through the shafts (also graded into the deep).
const fish = createFlock({ type: 'fish', count: 90, center: [0, -1.5, 0], bounds: [14, 3, 14], seed: 9 });
grade.apply(fish.object);
scene.add(fish.object);

const focus = new Vector3(0, -2, 0);
let t = 0;
function frame(): void {
  t += 0.0022;
  camera.position.set(Math.sin(t) * 20, 1.5 + Math.sin(t * 0.6) * 2, Math.cos(t) * 20);
  camera.lookAt(focus);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { uwDebug: () => unknown }).uwDebug = () => {
  const gl = renderer.getContext();
  const p = fish.positions[0];
  return {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    glError: gl.getError(),
    rayTime: +(rays.material.uniforms.uTime.value as number).toFixed(2),
    causticTime: +(caustics.uniforms.uCausticTime.value as number).toFixed(2),
    bubbleTime: +(bubbles.material.uniforms.uTime.value as number).toFixed(2),
    graded: grade.materials.length,
    fish0: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
  };
};
