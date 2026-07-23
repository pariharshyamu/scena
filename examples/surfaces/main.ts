import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
import {
  createSurface,
  SURFACE_PRESETS,
  createHouse,
  createWell,
  createRock,
  createCrate,
  PALETTES,
  type SurfaceKind,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
scene.background = new Color(0x9fb8cc);
scene.fog = new Fog(0x9fb8cc, 26, 60);

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

// Raking key light so the shader relief (bump) actually reads.
const sun = new DirectionalLight(0xfff2df, 2.4);
sun.position.set(-6, 7, 4);
scene.add(sun);
scene.add(new AmbientLight(0x9fb8cc, 0.6));

// Ground.
const ground = new Mesh(new BoxGeometry(80, 1, 80), createSurface('dirt', { color: 0x6f5a3f }));
ground.position.y = -0.5;
scene.add(ground);

// The whole surface palette as a grid of sample blocks — one BoxGeometry
// each, no colours passed (every preset carries its own baseColor), all the
// detail generated in-shader. Metals get a sphere to show their highlight.
const KINDS = Object.keys(SURFACE_PRESETS) as SurfaceKind[];
const METALS = new Set<SurfaceKind>(['metal', 'rust', 'bronze', 'brass']);
const PER_ROW = 8;
KINDS.forEach((kind, i) => {
  const col = i % PER_ROW;
  const row = Math.floor(i / PER_ROW);
  const geo = METALS.has(kind) ? new SphereGeometry(0.9, 24, 18) : new BoxGeometry(1.7, 1.7, 1.7);
  const mesh = new Mesh(geo, createSurface(kind, { seed: i + 1 }));
  mesh.position.set((col - (PER_ROW - 1) / 2) * 2.4, 0.9, -2.5 - row * 2.5);
  scene.add(mesh);
});

// The upgraded props, showing the surfaces on real geometry.
const house = createHouse({ seed: 7, palette });
house.object.position.set(-4.5, 0, 3.5);
scene.add(house.object);

const well = createWell({ seed: 3, palette });
well.object.position.set(1, 0, 4);
scene.add(well.object);

const rock = createRock({ seed: 11, palette });
rock.object.position.set(4, 0, 3.5);
rock.object.scale.setScalar(2.2);
scene.add(rock.object);

const crate = createCrate({ seed: 5, palette });
crate.object.position.set(6.5, 0, 4.5);
crate.object.scale.setScalar(1.6);
scene.add(crate.object);

const view = new URLSearchParams(location.search).get('view');

// A slow orbit so relief catches the light from many angles.
let t = 0;
function frame(): void {
  t += 0.005;
  if (view === 'grid') {
    camera.position.set(Math.sin(t * 0.4) * 6, 8.5, 6);
    camera.lookAt(0, 0.9, -5.5);
  } else {
    camera.position.set(Math.sin(t) * 17, 7, 12 + Math.cos(t) * 4);
    camera.lookAt(0, 1, -2);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Diagnostics for automated verification.
(window as unknown as { surfDebug: () => unknown }).surfDebug = () => {
  const gl = renderer.getContext();
  return {
    presets: Object.keys(SURFACE_PRESETS),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    programs: renderer.info.programs?.length ?? 0,
    glError: gl.getError(),
    frames: Math.round(t / 0.005),
  };
};
