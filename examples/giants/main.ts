import {
  Color,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  createImpostor,
  treeLOD,
  createTerrain,
  createLightingRig,
  createSurface,
  applyFog,
  applyWind,
  createWindField,
  scatter,
  PALETTES,
} from 'scena3d';

const params = new URLSearchParams(location.search);
// ?solo=1 shows a lineup of bare impostors so the silhouettes read on their own.
const solo = params.get('solo') === '1';
const palette = PALETTES.meadow;

const scene = new Scene();
scene.background = new Color(0xaecadf);

const camera = new PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 800);
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
if (!solo) applyFog(scene, 'haze', palette);

let forest: ReturnType<typeof scatter> | null = null;

if (solo) {
  // A bare lineup: one impostor of each giant species, no full trees — so the
  // carved silhouettes are unmistakable. Sized to sit together despite the
  // sequoia towering, so scale it down for the lineup.
  const ground = new Mesh(new PlaneGeometry(300, 300), createSurface('dirt', { color: palette.grassLow }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const SOLO = ['sequoia', 'pine', 'cypress', 'banyan', 'baobab', 'acacia'] as const;
  SOLO.forEach((species, i) => {
    // Normalise heights so the lineup fits one frame (the sequoia towers otherwise).
    const imp = createImpostor({ species, seed: 10 + i, palette, height: species === 'sequoia' ? 20 : 15 });
    imp.object.position.x = (i - 2.5) * 16;
    scene.add(imp.object);
  });
} else {
  const terrain = createTerrain({ seed: 7, size: 300, amplitude: 8, valleyFlatness: 0.6, palette });
  scene.add(terrain.mesh);

  const wind = createWindField({ direction: 40, strength: 0.25, gust: 0.5 });

  // A dense redwood stand: sequoias towering over pines & cedars, every species
  // paired with its billboard impostor for the far LOD.
  forest = scatter({
    seed: 9,
    area: { min: { x: -140, z: -140 }, max: { x: 140, z: 140 } },
    surface: terrain.heightAt,
    density: 0.02,
    minSpacing: 6,
    items: [
      treeLOD('sequoia', { palette, weight: 2 }),
      treeLOD('pine', { palette, weight: 4 }),
      treeLOD('cypress', { palette, weight: 2 }),
    ],
    lod: { distance: 90, tileSize: 28 },
  });
  scene.add(forest.group);
  applyWind(forest.group, { field: wind, height: 8, stiffness: 2.4, anchor: 1 });
}

let t = 0;
function frame(): void {
  if (solo) {
    // A fixed, close vantage so the carved silhouettes read head-on.
    camera.position.set(0, 9, 62);
    camera.lookAt(0, 8, 0);
  } else {
    t += 0.0015;
    // Fly out to ~220 and back to ~40 so tiles cross the 90-unit swap distance.
    const R = 130 + Math.sin(t) * 95;
    camera.position.set(Math.cos(t * 0.6) * R, 26 + Math.sin(t) * 6, Math.sin(t * 0.6) * R);
    camera.lookAt(0, 12, 0);
    if (forest?.update) forest.update(camera);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Headless probe: place the camera at a given distance, tally near/far tiles,
// and report the impostor draw-call count.
(window as unknown as { giantDebug: (dist?: number) => unknown }).giantDebug = (dist) => {
  if (forest?.update && dist !== undefined) {
    camera.position.set(0, 26, dist);
    camera.lookAt(0, 12, 0);
    forest.update(camera);
  }
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  let nearVisible = 0;
  let farVisible = 0;
  if (forest?.tiles) {
    for (const tile of forest.tiles) {
      if (tile.near.visible) nearVisible++;
      if (tile.far.visible) farVisible++;
    }
  }
  return {
    mode: solo ? 'solo' : 'forest',
    tiles: forest?.tiles?.length ?? 0,
    nearVisible,
    farVisible,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    glError: gl.getError(),
  };
};
