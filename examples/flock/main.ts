import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  createFlock,
  createTower,
  createTree,
  createRock,
  createSurface,
  createLightingRig,
  applyFog,
  scatter,
  PALETTES,
} from 'scena3d';

const type = (new URLSearchParams(location.search).get('type') as 'birds' | 'fish') ?? 'birds';
const palette = PALETTES.meadow;
const scene = new Scene();

const camera = new PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let flock: ReturnType<typeof createFlock>;

if (type === 'fish') {
  // Underwater: a blue-green haze and a school swimming past.
  scene.background = new Color(0x123f4e);
  scene.fog = new Fog(0x123f4e, 6, 34);
  scene.add(new DirectionalLight(0x9fd0dd, 1.3), new AmbientLight(0x2a6f80, 0.9));
  const bed = new Mesh(new PlaneGeometry(120, 120), createSurface('sand', { color: 0x6a7a72 }));
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = -6;
  scene.add(bed);
  for (let i = 0; i < 8; i++) {
    const rock = createRock({ seed: 20 + i, palette });
    const a = (i / 8) * Math.PI * 2;
    rock.object.position.set(Math.cos(a) * 12, -6, Math.sin(a) * 12);
    rock.object.scale.setScalar(1.5);
    scene.add(rock.object);
  }
  flock = createFlock({ type: 'fish', count: 90, center: [0, -1.5, 0], bounds: [12, 3.5, 12], seed: 5 });
} else {
  // Sky: birds wheel around a watchtower over a wood.
  scene.add(createLightingRig('golden-hour').group);
  scene.background = new Color(0xaecbe0);
  applyFog(scene, 'haze', palette);
  const ground = new Mesh(new PlaneGeometry(240, 240), createSurface('dirt', { color: palette.grassLow }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const tower = createTower({ seed: 3, height: 9, palette });
  scene.add(tower.object);
  const wood = scatter({
    seed: 4,
    area: { min: { x: -50, z: -50 }, max: { x: 50, z: 50 } },
    density: 0.03,
    minSpacing: 3,
    items: [{ create: (r) => createTree({ seed: r.int(1, 1e9), palette }), variants: 5 }],
    mask: (x, z) => Math.hypot(x, z) > 9,
  });
  scene.add(wood.group);
  flock = createFlock({ type: 'birds', count: 70, center: [0, 14, 0], bounds: [20, 6, 20], circle: 15, seed: 7 });
}
scene.add(flock.object);

const focus = type === 'fish' ? new Vector3(0, -1.5, 0) : new Vector3(0, 12, 0);

let t = 0;
function frame(): void {
  t += 0.004;
  if (type === 'fish') {
    camera.position.set(Math.sin(t * 0.4) * 14, 1, Math.cos(t * 0.4) * 14);
    camera.lookAt(focus);
  } else {
    camera.position.set(Math.sin(t * 0.3) * 26, 9, Math.cos(t * 0.3) * 26);
    camera.lookAt(focus);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { flockDebug: () => unknown }).flockDebug = () => {
  const gl = renderer.getContext();
  const p = flock.positions[0];
  return {
    type,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    glError: gl.getError(),
    boids: flock.count,
    boid0: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
  };
};
