import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  createOcean,
  createTerrain,
  createSky,
  createLightingRig,
  applyFog,
  createWindField,
  createSurface,
  createTree,
  createRock,
  scatter,
  aboveWater,
  PALETTES,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
scene.background = new Color(0xaecbe0);

const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 600);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(createSky({ palette }).mesh, createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);

// A compact island: terrain whose low ground sits below sea level → a coast.
const SEA = 3.2;
const ISLE = 38; // island half-extent; open sea beyond
const terrain = createTerrain({ seed: 7, size: ISLE * 2, amplitude: 7, waterLevel: SEA, palette });
scene.add(terrain.mesh);

// Beyond the island it's open, deep sea; inside, the terrain's own coastline.
const shore = (x: number, z: number): number =>
  Math.abs(x) < ISLE && Math.abs(z) < ISLE ? terrain.heightAt(x, z) : SEA - 6;

// The sea. `shore` is the terrain handshake: the ocean fades out over land and
// foams along the waterline. A WindField turns the swell downwind.
const wind = createWindField({ direction: 35, strength: 0.4 });
const ocean = createOcean({
  level: SEA,
  size: 320,
  amplitude: 0.55,
  choppiness: 0.8,
  wavelength: 24,
  wind,
  shore,
});
scene.add(ocean.mesh);

// A few trees & rocks on the dry part of the island.
const island = scatter({
  seed: 3,
  area: { min: { x: -50, z: -50 }, max: { x: 50, z: 50 } },
  surface: terrain.heightAt,
  density: 0.04,
  minSpacing: 2.5,
  items: [
    { create: (r) => createTree({ seed: r.int(1, 1e9), palette }), weight: 3, variants: 5 },
    { create: (r) => createRock({ seed: r.int(1, 1e9), palette }) },
  ],
  mask: aboveWater(terrain, { level: SEA }, 0.6),
});
scene.add(island.group);

// A little boat that rides the swell — the buoyancy handshake in action.
function makeBoat(): Group {
  const g = new Group();
  const wood = createSurface('plank', { color: palette.wood, seed: 2 });
  const hull = new Mesh(new BoxGeometry(1.5, 0.5, 3.4), wood);
  hull.position.y = 0.1;
  hull.scale.set(1, 1, 1);
  g.add(hull);
  const prow = new Mesh(new CylinderGeometry(0.0, 0.75, 1.2, 4), wood);
  prow.rotation.x = Math.PI / 2;
  prow.position.set(0, 0.1, 2.2);
  prow.scale.x = 0.55;
  g.add(prow);
  const mast = new Mesh(new CylinderGeometry(0.05, 0.07, 3, 6), createSurface('wood', { color: palette.woodDark }));
  mast.position.set(0, 1.6, -0.2);
  g.add(mast);
  const sail = new Mesh(new BoxGeometry(0.06, 1.8, 1.6), createSurface('canvas', { color: 0xe8e0cc }));
  sail.position.set(0, 1.7, -0.2);
  g.add(sail);
  return g;
}
const boat = makeBoat();
scene.add(boat);
const bx = 20; // out on the open sea, off the coast
const bz = 30;

const view = new URLSearchParams(location.search).get('view');

let t = 0;
function frame(): void {
  t += 0.005;
  // Ride the swell: sit on the wave height, roll & pitch with its slope.
  boat.position.set(bx, ocean.heightAt(bx, bz), bz);
  const hX = ocean.heightAt(bx + 1, bz);
  const hZ = ocean.heightAt(bx, bz + 1);
  boat.rotation.z = (ocean.heightAt(bx - 1, bz) - hX) * 0.35;
  boat.rotation.x = (hZ - ocean.heightAt(bx, bz - 1)) * 0.35;

  if (view === 'boat') {
    camera.position.set(bx + Math.sin(t * 0.5) * 5, SEA + 2.2, bz + 7);
    camera.lookAt(bx - 6, SEA + 0.4, bz - 10);
  } else {
    camera.position.set(Math.sin(t * 0.25) * 30, SEA + 6, 48);
    camera.lookAt(0, SEA, 6);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { oceanDebug: () => unknown }).oceanDebug = () => {
  const gl = renderer.getContext();
  return {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    glError: gl.getError(),
    boatY: +boat.position.y.toFixed(3),
    waveAt00: +ocean.heightAt(0, 0).toFixed(3),
  };
};
