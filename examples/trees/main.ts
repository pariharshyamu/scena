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
  createPrecipitation,
  createWindField,
  createLightingRig,
  createSurface,
  applyFog,
  applyWind,
  scatter,
  treeBiome,
  TREE_SPECIES,
  PALETTES,
  type TreeSpecies,
  type TreeSeason,
  type TreeBiome,
} from 'scena3d';

const params = new URLSearchParams(location.search);
const scatterMode = params.get('scatter') === '1';
const biome = params.get('biome') as TreeBiome | null;
const season = (params.get('season') as TreeSeason) ?? 'spring';
// The lineup shows the garden-scale species; the giants (sequoia…acacia) tower,
// so they get their own scale-context via ?scatter=1 or ?biome=redwood.
const GARDEN: TreeSpecies[] = ['pine', 'oak', 'cypress', 'birch', 'cedar', 'maple', 'sakura', 'palm', 'willow'];
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

const wide = scatterMode || !!biome;

if (biome) {
  // A biome preset: one word picks a weighted species mix (redwood towers with
  // sequoias, tropical is palms + banyan, savanna is acacia + baobab…).
  const wood = scatter({
    seed: 5,
    area: { min: { x: -50, z: -50 }, max: { x: 50, z: 50 } },
    density: biome === 'redwood' ? 0.012 : 0.03,
    minSpacing: biome === 'redwood' ? 6 : 3,
    items: treeBiome(biome, { palette, season }),
  });
  scene.add(wood.group);
  applyWind(wood.group, { field: wind, height: 6, stiffness: 2.2, anchor: 1 });
} else if (scatterMode) {
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
  // A labelled lineup: back row = meadow, front row = autumn, one of each garden species.
  GARDEN.forEach((species, i) => {
    const x = (i - (GARDEN.length - 1) / 2) * 6;
    for (const [z, pal] of [[-3, palette], [7, PALETTES.autumn]] as const) {
      const tree = createTree({ species, seed: 100 + i, palette: pal, season, wind });
      tree.object.position.set(x, 0, z);
      tree.object.traverse((o) => {
        if (o instanceof Mesh) o.castShadow = true;
      });
      scene.add(tree.object);
    }
  });
  // Blossom drifting down when the cherries are in bloom.
  if (season === 'spring') {
    const petals = createPrecipitation({ type: 'petal', wind, count: 900, area: [60, 24, 40] });
    scene.add(petals.object);
  }
}

const tall = biome === 'redwood';
let t = 0;
function frame(): void {
  t += 0.0016;
  const R = tall ? 58 : wide ? 44 : 34;
  camera.position.set(Math.sin(t) * R, tall ? 20 : wide ? 14 : 9, Math.cos(t) * R * 0.6 + (wide ? 0 : 26));
  camera.lookAt(0, tall ? 12 : 4, wide ? 0 : 2);
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
