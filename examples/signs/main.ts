import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import { createSign, buildTextGeometry, createSurface, PALETTES } from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
scene.background = new Color(0xaecbe0);
scene.fog = new Fog(0xaecbe0, 40, 90);

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
sun.position.set(-5, 9, 6);
scene.add(sun);
scene.add(new AmbientLight(0xaecbe0, 0.6));

const ground = new Mesh(new PlaneGeometry(160, 160), createSurface('dirt', { color: palette.grassLow }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const view = new URLSearchParams(location.search).get('view') ?? 'orbit';

// The town's own signpost.
const townSign = createSign({ kind: 'post', text: 'HAVENBROOK', seed: 1, palette });
townSign.object.position.set(-4.5, 0, 0);
townSign.object.rotation.y = 0.25;
scene.add(townSign.object);

// A swaying shop sign.
const shop = createSign({ kind: 'hanging', text: 'THE FORGE', seed: 4, palette });
shop.object.position.set(-1.4, 0, 0.5);
scene.add(shop.object);

// A fingerpost pointing the way.
const finger = createSign({
  kind: 'fingerpost',
  seed: 6,
  palette,
  directions: [
    { text: 'MARKET', angle: 0.2 },
    { text: 'HARBOUR', angle: 2.3 },
    { text: 'THE MILL', angle: 4.1 },
  ],
});
finger.object.position.set(2.2, 0, 0);
scene.add(finger.object);

// A carved stone milestone.
const stone = createSign({ kind: 'milestone', text: 'GREYMOOR 3', seed: 9, palette });
stone.object.position.set(5, 0, 0.8);
stone.object.rotation.y = -0.3;
scene.add(stone.object);

// The public text API used directly: a big carved title floating over the row,
// proving lettering isn't locked inside createSign.
const title = new Mesh(
  buildTextGeometry('WELCOME', { size: 0.9, weight: 0.18, align: 'center' }).geometry,
  new MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.7, flatShading: true })
);
title.position.set(0, 3.4, -3);
scene.add(title);

let t = 0.1;
function frame(): void {
  t += 0.004;
  if (view === 'front') {
    camera.position.set(-4.5 + Math.sin(t * 0.5) * 1.5, 1.7, 4);
    camera.lookAt(-4.5, 1.5, 0);
  } else if (view === 'finger') {
    camera.position.set(2.2 + Math.sin(t * 0.5) * 1.2, 2.6, 4);
    camera.lookAt(2.2, 2.4, 0);
  } else {
    camera.position.set(Math.sin(t * 0.4) * 4, 2.4, 8.5);
    camera.lookAt(0.2, 1.6, 0);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { signDebug: () => unknown }).signDebug = () => {
  const gl = renderer.getContext();
  // The hanging sign's pivot swings; sample its z to prove animation.
  const pivot = shop.object.getObjectByName('signPivot');
  const swing = pivot ? pivot.rotation.z : 0;
  return {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    glError: gl.getError(),
    shopSwing: +swing.toFixed(4),
  };
};
