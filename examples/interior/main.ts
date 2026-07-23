import { Clock, Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createInteriorLight, createRoom, PALETTES } from 'scena3d';

const params = new URLSearchParams(location.search);
const pinned = params.get('t') !== null ? Number(params.get('t')) : null;
const palette = PALETTES.meadow;

const scene = new Scene();
scene.background = new Color(0x0a0d13); // the dark beyond the doorway

const camera = new PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 100);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// A one-room cottage: hearth on the north wall, windows east and west, a rug
// in the middle and the door opening south.
const room = createRoom(
  [
    '##H####',
    '#.....#',
    'W..~..W',
    '#.....#',
    '#T.S..#',
    '##WDW##',
  ],
  { seed: 11, palette }
);
scene.add(room.group);

// Daylight: a fake day cycle the demo drives, swinging the sun east → west.
const cycle = { sunElevation: 1, timeOfDay: 0.5 };
const light = createInteriorLight(room, { cycle, shaftStrength: 0.2 });

const setTime = (t: number): void => {
  cycle.timeOfDay = t;
  cycle.sunElevation = Math.sin(2 * Math.PI * (t - 0.25));
  light.update();
};
setTime(pinned ?? 0.34);

// Camera: standing inside by the south wall, gently swaying toward the hearth.
const clock = new Clock();
let day = pinned ?? 0.34;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (pinned === null) {
    day = (day + dt / 40) % 1; // a 40-second day
    setTime(day);
  }
  const t = clock.elapsedTime;
  camera.position.set(0.6 + Math.sin(t * 0.13) * 0.5, 1.9, 3.6);
  camera.lookAt(Math.sin(t * 0.09) * 0.8, 1.15, -3.5);
  renderer.render(scene, camera);
});

// Headless verification hook.
declare global {
  interface Window {
    interiorDebug: (t?: number) => Record<string, unknown>;
  }
}
window.interiorDebug = (t?: number) => {
  if (typeof t === 'number') setTime(t);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  let litShafts = 0;
  let dustClouds = 0;
  light.group.traverse((child) => {
    const mesh = child as { isMesh?: boolean; isPoints?: boolean; visible: boolean; geometry?: { getAttribute(name: string): unknown } };
    if (mesh.isMesh && mesh.visible && mesh.geometry?.getAttribute('aFade')) litShafts++;
    if (mesh.isPoints) dustClouds++;
  });
  return {
    glError: gl.getError(),
    timeOfDay: cycle.timeOfDay,
    sunElevation: Number(cycle.sunElevation.toFixed(3)),
    windows: room.windows.length,
    hearths: room.hearths.length,
    litShafts,
    dustClouds,
    paneIntensity: Number(room.windows[0].pane.emissiveIntensity.toFixed(3)),
    hemisphere: Number(light.hemisphere.intensity.toFixed(3)),
    obstacles: room.obstacles.length,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};
