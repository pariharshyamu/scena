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
  createStall,
  createStatue,
  PALETTES,
  type StallGoods,
  type StatueFigure,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
scene.background = new Color(0x9fb8cc);
scene.fog = new Fog(0x9fb8cc, 34, 80);

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
sun.position.set(-7, 9, 5);
scene.add(sun);
scene.add(new AmbientLight(0x9fb8cc, 0.62));

const ground = new Mesh(new PlaneGeometry(120, 120), createSurface('dirt', { color: 0x8a7250 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const statuesOnly = new URLSearchParams(location.search).get('view') === 'statues';

// Every statue figure, ending with a patinated bronze.
const figures: Array<[StatueFigure, 'stone' | 'bronze']> = [
  ['obelisk', 'stone'], ['figure', 'stone'], ['orb', 'stone'],
  ['bust', 'stone'], ['beast', 'stone'], ['figure', 'bronze'],
];
figures.forEach(([figure, material], i) => {
  const statue = createStatue({ seed: 30 + i, figure, material, palette });
  statue.object.position.set((i - 2.5) * 3.4, 0, statuesOnly ? 0 : -4);
  scene.add(statue.object);
});

// A market row: one stall of every trade, counters facing the camera.
if (!statuesOnly) {
  const trades: StallGoods[] = ['produce', 'pottery', 'bakery', 'textiles'];
  trades.forEach((goods, i) => {
    const stall = createStall({ seed: 10 + i, goods, palette });
    stall.object.position.set((i - 1.5) * 4.0, 0, 3.5);
    scene.add(stall.object);
  });
}

let t = 0.2;
function frame(): void {
  t += 0.004;
  if (statuesOnly) {
    camera.position.set(Math.sin(t) * 12, 4.2, 12 + Math.cos(t) * 3);
    camera.lookAt(0, 1.8, 0);
  } else {
    camera.position.set(Math.sin(t) * 6, 5.2, 15 + Math.cos(t) * 2);
    camera.lookAt(0, 1.4, 0);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { marketDebug: () => unknown }).marketDebug = () => {
  const gl = renderer.getContext();
  return {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    glError: gl.getError(),
    frames: Math.round((t - 0.2) / 0.004),
  };
};
