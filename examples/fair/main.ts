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
  createBunting,
  createFountain,
  createCart,
  createStall,
  PALETTES,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
scene.background = new Color(0xaecbe0);
scene.fog = new Fog(0xaecbe0, 34, 80);

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

const sun = new DirectionalLight(0xfff2df, 2.2);
sun.position.set(-6, 9, 5);
scene.add(sun);
scene.add(new AmbientLight(0xaecbe0, 0.65));

const ground = new Mesh(new PlaneGeometry(140, 140), createSurface('dirt', { color: 0x8a7a58 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const view = new URLSearchParams(location.search).get('view');

// The fountain as the square's centrepiece.
const fountain = createFountain({ seed: 4, palette });
scene.add(fountain.object);

// Bunting strung between poles, framing the square.
for (let i = 0; i < 3; i++) {
  const bunting = createBunting({ seed: 10 + i, span: 5.5, palette });
  bunting.object.position.set((i - 1) * 6, 0, -6);
  scene.add(bunting.object);
}

// Carts and a stall around the edge.
const cart1 = createCart({ seed: 2, style: 'wagon', cargo: 'barrels', palette });
cart1.object.position.set(-5.5, 0, 3);
cart1.object.rotation.y = 0.6;
scene.add(cart1.object);

const cart2 = createCart({ seed: 7, style: 'cart', cargo: 'crates', palette });
cart2.object.position.set(5, 0, 2.5);
cart2.object.rotation.y = -1.1;
scene.add(cart2.object);

const cart3 = createCart({ seed: 9, style: 'wagon', cargo: 'hay', palette });
cart3.object.position.set(0, 0, 6);
cart3.object.rotation.y = Math.PI;
scene.add(cart3.object);

const stall = createStall({ seed: 15, goods: 'produce', palette });
stall.object.position.set(6.5, 0, -3);
stall.object.rotation.y = -1.4;
scene.add(stall.object);

// Carts-only or fountain-only close-ups for verification.
if (view === 'carts') {
  cart1.object.position.set(-2.8, 0, 0); cart1.object.rotation.y = 0.5;
  cart2.object.position.set(0.2, 0, 0); cart2.object.rotation.y = 0.5;
  cart3.object.position.set(3.2, 0, 0); cart3.object.rotation.y = 0.5;
}

let t = 0.2;
function frame(): void {
  t += 0.004;
  if (view === 'carts') {
    camera.position.set(Math.sin(t) * 5, 2.4, 6);
    camera.lookAt(0, 0.6, 0);
  } else if (view === 'fountain') {
    camera.position.set(Math.sin(t) * 4, 2.2, 5);
    camera.lookAt(0, 1.3, 0);
  } else {
    camera.position.set(Math.sin(t * 0.6) * 10, 5, 12);
    camera.lookAt(0, 1.4, 0);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { fairDebug: () => unknown }).fairDebug = () => {
  const gl = renderer.getContext();
  // Sample the fountain water's first vertex Y and a bunting flag clock.
  let waveClock = -1;
  scene.traverse((o) => {
    const m = (o as Mesh).material as { userData?: { waveUniforms?: { uTime: { value: number } } } } | undefined;
    if (waveClock < 0 && m?.userData?.waveUniforms) waveClock = m.userData.waveUniforms.uTime.value;
  });
  return {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    glError: gl.getError(),
    buntingWaveClock: +waveClock.toFixed(3),
  };
};
