import {
  Color,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  createTree,
  createWindField,
  createLightingRig,
  createSurface,
  applyFog,
  applyWind,
  scatter,
  TREE_SPECIES,
  PALETTES,
  type TreeSpecies,
} from 'scena3d';

const scatterMode = new URLSearchParams(location.search).get('scatter') === '1';
const palette = PALETTES.meadow;
const scene = new Scene();
scene.background = new Color(0xbcd6e6);

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

const ground = new Mesh(new PlaneGeometry(200, 200), createSurface('dirt', { color: palette.grassLow }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const wind = createWindField({ direction: 40, strength: 0.32, gust: 0.6 });

if (scatterMode) {
  // A mixed wood: every species scattered together, all bound to one wind.
  const wood = scatter({
    seed: 5,
    area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
    density: 0.03,
    minSpacing: 3,
    items: TREE_SPECIES.map((species) => ({
      create: (r) => createTree({ species, seed: r.int(1, 1e9), palette }),
      variants: 4,
    })),
  });
  scene.add(wood.group);
  applyWind(wood.group, { field: wind, height: 5, stiffness: 2, anchor: 0.8 });
} else {
  // A labelled lineup: back row = meadow, front row = autumn, one of each species.
  TREE_SPECIES.forEach((species, i) => {
    const x = (i - (TREE_SPECIES.length - 1) / 2) * 6;
    for (const [z, pal] of [[-3, palette], [6, PALETTES.autumn]] as const) {
      const tree = createTree({ species, seed: 100 + i, palette: pal, wind });
      tree.object.position.set(x, 0, z);
      tree.object.traverse((o) => {
        if (o instanceof Mesh) o.castShadow = true;
      });
      scene.add(tree.object);
    }
  });
}

let t = 0;
function frame(): void {
  t += 0.0016;
  const R = scatterMode ? 44 : 24;
  camera.position.set(Math.sin(t) * R, scatterMode ? 14 : 7, Math.cos(t) * R * 0.6 + (scatterMode ? 0 : 20));
  camera.lookAt(0, scatterMode ? 4 : 3.5, scatterMode ? 0 : 1.5);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { treeDebug: () => unknown }).treeDebug = () => {
  const gl = renderer.getContext();
  const counts: Record<string, number> = {};
  scene.traverse((o) => {
    if (o.name.startsWith('tree-')) counts[o.name] = (counts[o.name] ?? 0) + 1;
  });
  return {
    mode: scatterMode ? 'scatter' : 'lineup',
    species: (TREE_SPECIES as readonly TreeSpecies[]).join(','),
    treeGroups: Object.keys(counts).length,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    glError: gl.getError(),
  };
};
