import {
  Color,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  createHerd,
  createTerrain,
  createTree,
  createLightingRig,
  applyFog,
  scatter,
  PALETTES,
} from 'scena3d';

const type = (new URLSearchParams(location.search).get('type') as 'deer' | 'sheep') ?? 'deer';
const palette = PALETTES.meadow;
const scene = new Scene();
scene.background = new Color(0xbcd3e6);

const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const rig = createLightingRig('golden-hour');
rig.sun.castShadow = true;
scene.add(rig.group);
applyFog(scene, 'haze', palette);

// Rolling meadow — gentle, so the herd has room to graze.
const terrain = createTerrain({
  seed: 6,
  size: 120,
  resolution: 120,
  amplitude: 4,
  noiseScale: 34,
  valleyFlatness: 0.7,
  palette,
});
terrain.mesh.receiveShadow = true;
scene.add(terrain.mesh);

// A scatter of trees around the edges, kept clear of the grazing ground.
const wood = scatter({
  seed: 8,
  area: { min: { x: -56, z: -56 }, max: { x: 56, z: 56 } },
  density: 0.012,
  minSpacing: 4,
  items: [{ create: (r) => createTree({ seed: r.int(1, 1e9), palette }), variants: 5 }],
  mask: (x, z) => Math.hypot(x, z) > 22,
});
for (const child of wood.group.children) {
  child.position.y = terrain.heightAt(child.position.x, child.position.z);
}
scene.add(wood.group);

const herd =
  type === 'sheep'
    ? createHerd({ type: 'sheep', count: 20, center: [0, 0], radius: 16, ground: terrain.heightAt, seed: 5 })
    : createHerd({ type: 'deer', count: 14, center: [0, 0], radius: 18, ground: terrain.heightAt, seed: 3 });
scene.add(herd.object);

const focus = new Vector3(0, 0, 0);
let t = 0;
function frame(): void {
  t += 0.0025;
  // Track the herd's centre of mass and orbit it slowly.
  focus.set(0, 0, 0);
  for (const p of herd.positions) focus.add(p);
  focus.multiplyScalar(1 / herd.count);
  camera.position.set(focus.x + Math.sin(t) * 22, focus.y + 9, focus.z + Math.cos(t) * 22);
  camera.lookAt(focus.x, focus.y + 0.5, focus.z);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { herdDebug: () => unknown }).herdDebug = () => {
  const gl = renderer.getContext();
  const p = herd.positions[0];
  return {
    type,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    glError: gl.getError(),
    animals: herd.count,
    animal0: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
    grounded: +(p.y - terrain.heightAt(p.x, p.z)).toFixed(3),
  };
};
