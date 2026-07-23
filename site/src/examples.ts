export interface Example {
  id: string;
  title: string;
  group: string;
  code: string;
}

// Shared orbit-camera prelude, inlined into each example so every one is
// fully self-contained and copy-pasteable.
const orbit = (radius = 30, height = 16, speed = 0.05) =>
  `game.onUpdate((t) => {
  const a = t.elapsed * ${speed};
  game.camera.position.set(Math.cos(a) * ${radius}, ${height}, Math.sin(a) * ${radius});
  game.camera.lookAt(0, 2, 0);
});`;

export const EXAMPLES: Example[] = [
  {
    id: 'world',
    title: 'Terrain, sky & light',
    group: 'Worldbuilding',
    code: `// A complete outdoor stage in a few calls: seeded low-poly terrain
// (with an exact analytic heightAt), a gradient sky dome, a lighting
// rig preset and matching fog. Change the seed — same world, elsewhere.
import { createTerrain, createSky, createLightingRig, applyFog, PALETTES } from 'scena3d';
import { Game } from 'gama3d';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;

const terrain = createTerrain({ seed: 7, size: 90, amplitude: 6, palette });
scene.add(terrain.mesh);
scene.add(createSky({ palette }).mesh);
scene.add(createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);

// heightAt is the same function that built the mesh — never disagrees.
console.log('height at origin:', terrain.heightAt(0, 0).toFixed(2));

${orbit(36, 18)}
game.start();`,
  },

  {
    id: 'forest',
    title: 'Scatter a forest',
    group: 'Worldbuilding',
    code: `// Empty plane → forest in one call. Density noise gives natural
// clumps and clearings, a spatial hash enforces spacing, and the whole
// forest renders as a handful of InstancedMeshes.
import { createTerrain, createSky, createLightingRig, applyFog,
         createTree, createRock, createBush, scatter, PALETTES } from 'scena3d';
import { Game } from 'gama3d';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;

const terrain = createTerrain({ seed: 20, size: 90, amplitude: 5, palette });
scene.add(terrain.mesh, createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'haze', palette);

const forest = scatter({
  seed: 21,
  area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
  surface: terrain.heightAt,           // exact — trees sit on the ground
  density: 0.06,
  minSpacing: 1.5,
  items: [
    { create: (rng) => createTree({ seed: rng.int(1, 1e9), palette }), weight: 4, variants: 6 },
    { create: (rng) => createRock({ seed: rng.int(1, 1e9), palette }) },
    { create: (rng) => createBush({ seed: rng.int(1, 1e9), palette }) },
  ],
  mask: (x, z, y) => y < 3.6,          // keep the peaks bare
  keepOut: [{ center: { x: 0, z: 0 }, radius: 10 }],  // a clearing
});
scene.add(forest.group);
console.log(forest.count, 'props,', forest.obstacles.length, 'obstacles');

${orbit(34, 17)}
game.start();`,
  },

  {
    id: 'lod',
    title: 'Scatter LOD tiles',
    group: 'Worldbuilding',
    code: `// Opt-in LOD: placements bucket into tiles; tiles beyond 'distance'
// swap full trees for each item's createFar variant (here: one cone).
// Watch trees pop between detail levels as the camera sweeps.
import { createTerrain, createSky, createLightingRig, applyFog,
         createTree, scatter, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, MeshStandardMaterial, CylinderGeometry, Group } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
const terrain = createTerrain({ seed: 9, size: 120, amplitude: 4, palette });
scene.add(terrain.mesh, createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'haze', palette);

const forest = scatter({
  seed: 5,
  area: { min: { x: -55, z: -55 }, max: { x: 55, z: 55 } },
  surface: terrain.heightAt,
  density: 0.08,
  items: [{
    create: (rng) => createTree({ seed: rng.int(1, 1e9), palette }),
    createFar: (rng) => {                  // far stand-in: a single cone
      const g = new Group();
      const cone = new Mesh(new CylinderGeometry(0, 1.2, 3.2, 5),
        new MeshStandardMaterial({ color: 0x2f9e57, flatShading: true }));
      cone.position.y = 1.9;
      g.add(cone);
      return { object: g, obstacleRadius: 0 };
    },
  }],
  lod: { distance: 26, tileSize: 12 },
});
scene.add(forest.group);
console.log(forest.tiles.length, 'LOD tiles');

game.onUpdate((t) => {
  const a = t.elapsed * 0.07;
  game.camera.position.set(Math.cos(a) * 30, 10, Math.sin(a) * 30);
  game.camera.lookAt(Math.cos(a + 1.2) * 20, 2, Math.sin(a + 1.2) * 20);
  forest.update(game.camera);            // drive the tile swap
});
game.start();`,
  },

  {
    id: 'props',
    title: 'Prop gallery',
    group: 'Props',
    code: `// Every generator, one of each. All seeded (same seed = same prop),
// all palette-themed, all reporting an obstacleRadius for steering.
import { createTree, createRock, createCrate, createFence, createLamp,
         createBush, createGrassTuft, createHouse, createTower, createWell,
         createRuin, createStall, createStatue, createBanner, createCampfire,
         createFountain, createCart, createLightingRig, createSky, applyFog,
         PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry, MeshStandardMaterial } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'haze', palette);
const ground = new Mesh(new PlaneGeometry(80, 80),
  new MeshStandardMaterial({ color: 0x3f9d5a }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const props = [
  createTree({ seed: 3, palette }),   createTree({ seed: 4, style: 'oak', palette }),
  createRock({ seed: 5, palette }),   createCrate({ seed: 6, palette }),
  createLamp({ seed: 7, light: true, palette }), createBush({ seed: 8, palette }),
  createWell({ seed: 9, palette }),   createHouse({ seed: 10, palette }),
  createTower({ seed: 11, palette }), createRuin({ seed: 12, palette }),
  createStall({ seed: 15, palette }), createStatue({ seed: 16, figure: 'beast', palette }),
  createBanner({ seed: 17, style: 'flag', palette }), createBanner({ seed: 18, style: 'banner', palette }),
  createCampfire({ seed: 19, palette }), createFountain({ seed: 20, palette }),
  createCart({ seed: 21, style: 'wagon', cargo: 'barrels', palette }),
  createFence({ seed: 13, length: 4, palette }), createGrassTuft({ seed: 14, palette }),
];
props.forEach((prop, i) => {
  prop.object.position.set((i % 4) * 8 - 12, 0, Math.floor(i / 4) * 9 - 9);
  scene.add(prop.object);
});

${orbit(26, 14, 0.06)}
game.start();`,
  },

  {
    id: 'surfaces',
    title: 'Procedural surfaces',
    group: 'Props',
    code: `// Why SCENA props can out-look a downloaded GLTF at a fraction of the
// bytes: createSurface patches a MeshStandardMaterial with triplanar noise,
// so weathered stone, sand, bark, canvas, terracotta, bronze and 17 more are
// generated in the shader — no textures fetched, every prop unique, and each
// preset carries its own colour. Full PBR lighting, fog and shadows survive
// because it stays a standard material.
import { createSurface, SURFACE_PRESETS, createHouse, createWell, createRock,
         createSky, createLightingRig, applyFog, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, SphereGeometry, PlaneGeometry, MeshStandardMaterial } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);
const ground = new Mesh(new PlaneGeometry(80, 80), createSurface('dirt'));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// The whole palette as a grid — one primitive per preset, no colours passed
// (each carries its own baseColor), all the detail in the shader.
const kinds = Object.keys(SURFACE_PRESETS);
const metals = new Set(['metal', 'rust', 'bronze', 'brass']);
const perRow = 8;
kinds.forEach((kind, i) => {
  const col = i % perRow, row = Math.floor(i / perRow);
  const geo = metals.has(kind) ? new SphereGeometry(0.95, 24, 18) : new BoxGeometry(1.8, 1.8, 1.8);
  const mesh = new Mesh(geo, createSurface(kind, { seed: i + 1 }));
  mesh.position.set((col - (perRow - 1) / 2) * 2.5, 1, -3 - row * 2.6);
  scene.add(mesh);
});

// The same surfaces on real props.
const props = [createHouse({ seed: 7, palette }), createWell({ seed: 3, palette }),
               createRock({ seed: 11, palette })];
props.forEach((p, i) => { p.object.position.set(i * 6 - 6, 0, 4); scene.add(p.object); });

${orbit(20, 11, 0.05)}
game.start();`,
  },

  {
    id: 'market',
    title: 'A market & its statues',
    group: 'Props',
    code: `// Two lifelike prop families: market stalls — striped canvas awnings
// over plank counters, stocked by trade (produce, pottery, bakery,
// textiles) — and statues: five figures (obelisk, robed figure, orb, bust,
// guardian beast) on stepped pedestals, in weathered stone or bronze.
import { createStall, createStatue, createSurface, createSky,
         createLightingRig, applyFog, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);
const ground = new Mesh(new PlaneGeometry(90, 90), createSurface('dirt', { color: 0x8a7250 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const trades = ['produce', 'pottery', 'bakery', 'textiles'];
trades.forEach((goods, i) => {
  const stall = createStall({ seed: 10 + i, goods, palette });
  stall.object.position.set((i - 1.5) * 4, 0, 4);
  scene.add(stall.object);
});

const figures = ['obelisk', 'figure', 'orb', 'bust', 'beast'];
figures.forEach((figure, i) => {
  const statue = createStatue({ seed: 30 + i, figure, palette });
  statue.object.position.set((i - 2) * 3.4, 0, -4);
  scene.add(statue.object);
});
scene.add((() => { const s = createStatue({ seed: 99, figure: 'figure', material: 'bronze', palette });
  s.object.position.set(6.8, 0, -4); return s.object; })());

${orbit(18, 8, 0.05)}
game.start();`,
  },

  {
    id: 'banners',
    title: 'Flags & banners (waving)',
    group: 'Props',
    code: `// Real cloth, not a stiff board: each flag is a subdivided plane rippled
// by a GPU vertex wave — a travelling fold that grows toward the fly, droops
// under gravity, and carries a seeded phase so no two wave alike. Heraldic
// devices are baked as vertex colours (no textures). They animate themselves
// from the render loop, so this needs no per-frame code at all.
import { createBanner, createSurface, createSky, createLightingRig,
         applyFog, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);
const ground = new Mesh(new PlaneGeometry(90, 90), createSurface('dirt', { color: 0x7f6a4a }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const styles = ['flag', 'banner', 'pennant'];
const patterns = ['cross', 'saltire', 'bands', 'diamond', 'bicolor', 'stripes'];
patterns.forEach((pattern, i) => {
  const banner = createBanner({ seed: 10 + i, style: styles[i % 3], pattern, palette });
  banner.object.position.set((i - 2.5) * 3.4, 0, 0);
  banner.object.rotation.y = -0.5;
  scene.add(banner.object);
});

${orbit(15, 6, 0.04)}
game.start();`,
  },

  {
    id: 'fire',
    title: 'Braziers & campfires',
    group: 'Props',
    code: `// Fire at dusk: each flame is a particle-ish cluster of tongues rippling
// in the shader, with rising embers, glowing coals and a flickering warm
// PointLight that spills onto everything nearby. Entirely self-animating —
// no per-frame code — so a fire just burns wherever you drop it.
import { createCampfire, createBrazier, createHouse, createSurface,
         PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry, Color, Fog, DirectionalLight, AmbientLight } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0x121a2a);
scene.fog = new Fog(0x121a2a, 14, 44);
scene.add(new DirectionalLight(0x4a5a7a, 0.35), new AmbientLight(0x223044, 0.4));
const ground = new Mesh(new PlaneGeometry(120, 120), createSurface('dirt', { color: 0x4a4033 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

scene.add(createCampfire({ seed: 3, palette }).object);
const b1 = createBrazier({ seed: 5, palette }); b1.object.position.set(-2.6, 0, 1.2);
const b2 = createBrazier({ seed: 8, palette }); b2.object.position.set(2.6, 0, 1.2);
scene.add(b1.object, b2.object);
const house = createHouse({ seed: 10, palette }); house.object.position.set(0, 0, -4.5);
scene.add(house.object);

game.onUpdate((t) => {
  const a = t.elapsed * 0.05;
  game.camera.position.set(Math.cos(a) * 7, 2.6, Math.sin(a) * 7);
  game.camera.lookAt(0, 1.2, -0.5);
});
game.start();`,
  },

  {
    id: 'fair',
    title: 'A village fair',
    group: 'Props',
    code: `// Three lifelike props together: a tiered stone fountain with animated
// water (SCENA's createWater, self-driven), festive bunting fluttering on
// the flag cloth-wave, and loaded carts & wagons. The fountain and bunting
// animate themselves — no update loop needed for them.
import { createFountain, createBunting, createCart, createStall,
         createSurface, createSky, createLightingRig, applyFog, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);
const ground = new Mesh(new PlaneGeometry(120, 120), createSurface('dirt', { color: 0x8a7a58 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

scene.add(createFountain({ seed: 4, palette }).object);
for (let i = 0; i < 3; i++) {
  const b = createBunting({ seed: 10 + i, span: 5.5, palette });
  b.object.position.set((i - 1) * 6, 0, -6);
  scene.add(b.object);
}
const c1 = createCart({ seed: 2, style: 'wagon', cargo: 'barrels', palette });
c1.object.position.set(-5.5, 0, 3); c1.object.rotation.y = 0.6;
const c2 = createCart({ seed: 7, style: 'cart', cargo: 'crates', palette });
c2.object.position.set(5, 0, 2.5); c2.object.rotation.y = -1.1;
const c3 = createCart({ seed: 9, style: 'wagon', cargo: 'hay', palette });
c3.object.position.set(0, 0, 6); c3.object.rotation.y = Math.PI;
scene.add(c1.object, c2.object, c3.object);
const stall = createStall({ seed: 15, goods: 'produce', palette });
stall.object.position.set(6.5, 0, -3); stall.object.rotation.y = -1.4;
scene.add(stall.object);

game.onUpdate((t) => {
  const a = t.elapsed * 0.09;
  game.camera.position.set(Math.sin(a) * 11, 5.5, 13);
  game.camera.lookAt(0, 1.4, 0);
});
game.start();`,
  },

  {
    id: 'signs',
    title: 'Signposts & stylised text',
    group: 'Props',
    code: `// Real, legible lettering carved from an embedded vector font — no
// textures, no font files, no loaders, so it renders anywhere. createSign
// gives you a post board, a swaying hanging shop sign, a fingerpost that
// points the way, and a carved stone milestone. buildTextGeometry is the
// same lettering exposed directly, to label any prop you like.
import { createSign, buildTextGeometry, createSurface, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry, Color, Fog, DirectionalLight, AmbientLight,
         MeshStandardMaterial, Group, BoxGeometry, CylinderGeometry } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0xaecbe0);
scene.fog = new Fog(0xaecbe0, 40, 90);
scene.add(new DirectionalLight(0xfff2df, 2.3), new AmbientLight(0xaecbe0, 0.6));
const ground = new Mesh(new PlaneGeometry(160, 160), createSurface('dirt', { color: palette.grassLow }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const town = createSign({ kind: 'post', text: 'HAVENBROOK', seed: 1, palette });
town.object.position.set(-4.5, 0, 0); town.object.rotation.y = 0.25;

const shop = createSign({ kind: 'hanging', text: 'THE FORGE', seed: 4, palette });
shop.object.position.set(-1.4, 0, 0.5);

const finger = createSign({ kind: 'fingerpost', seed: 6, palette, directions: [
  { text: 'MARKET', angle: 0.2 }, { text: 'HARBOUR', angle: 2.3 }, { text: 'THE MILL', angle: 4.1 },
] });
finger.object.position.set(2.2, 0, 0);

const stone = createSign({ kind: 'milestone', text: 'GREYMOOR 3', seed: 9, palette });
stone.object.position.set(5, 0, 0.8); stone.object.rotation.y = -0.3;
scene.add(town.object, shop.object, finger.object, stone.object);

// The text API used directly: a WELCOME plaque built by hand — dark panel
// behind bright letters — proving lettering isn't locked inside createSign.
const welcome = buildTextGeometry('WELCOME', { size: 0.68 });
const arch = new Group();
const pw = welcome.width + 0.9, ph = 1.15;
const plaque = new Mesh(new BoxGeometry(pw, ph, 0.12), createSurface('plank', { color: palette.wood, seed: 21 }));
const backing = new Mesh(new BoxGeometry(pw - 0.2, ph - 0.2, 0.03),
  new MeshStandardMaterial({ color: 0x22392e, roughness: 0.62 }));
backing.position.z = 0.075;
const title = new Mesh(welcome.geometry, new MeshStandardMaterial({
  color: 0xf3e2a8, roughness: 0.55, emissive: 0x4a4020, emissiveIntensity: 0.3 }));
title.position.z = 0.1;
arch.add(plaque, backing, title);
arch.position.set(0, 3.3, -3);
for (const dx of [-pw / 2 + 0.1, pw / 2 - 0.1]) {
  const leg = new Mesh(new CylinderGeometry(0.07, 0.085, 3.3 + ph / 2, 9),
    createSurface('wood', { color: palette.woodDark, seed: 22 }));
  leg.position.set(dx, (3.3 + ph / 2) / 2 - 3.3, -0.01);
  arch.add(leg);
}
scene.add(arch);

game.onUpdate((t) => {
  const a = t.elapsed * 0.07;
  game.camera.position.set(Math.sin(a) * 4, 2.4, 8.5);
  game.camera.lookAt(0.2, 1.6, 0);
});
game.start();`,
  },

  {
    id: 'palettes',
    title: 'Retheme with palettes',
    group: 'Props',
    code: `// One palette system themes every generator: the same four seeds,
// grown in all four themes. Retheme a whole world by changing one word.
import { createTree, createHouse, createLightingRig, createSky,
         applyFog, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry, MeshStandardMaterial } from 'three';

const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette: PALETTES.meadow }).mesh, createLightingRig('day').group);
applyFog(scene, 'haze', PALETTES.meadow);

Object.entries(PALETTES).forEach(([name, palette], row) => {
  const z = row * 9 - 13;
  const ground = new Mesh(new PlaneGeometry(46, 8.6),
    new MeshStandardMaterial({ color: palette.grassLow }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = z;
  scene.add(ground);
  const house = createHouse({ seed: 5, palette });
  house.object.position.set(-14, 0, z);
  scene.add(house.object);
  for (let i = 0; i < 4; i++) {
    const tree = createTree({ seed: 30 + i, palette });
    tree.object.position.set(i * 7 - 4, 0, z);
    scene.add(tree.object);
  }
  console.log(name, 'row at z =', z);
});

${orbit(30, 20, 0.04)}
game.start();`,
  },

  {
    id: 'village',
    title: 'A seeded village',
    group: 'Settlement',
    code: `// A hamlet from one call: well-anchored plaza, houses facing inward,
// street lamps, a watchtower, a ruin — plus the gameplay handshake
// (obstacles, keepOut, lamps). Change the seed for a different village.
import { createTerrain, createSky, createLightingRig, applyFog,
         createVillage, createDayCycle, PALETTES } from 'scena3d';
import { Game } from 'gama3d';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;

const terrain = createTerrain({ seed: 18, size: 90, amplitude: 5, palette });
const sky = createSky({ palette });
const rig = createLightingRig('day');
scene.add(terrain.mesh, sky.mesh, rig.group);
applyFog(scene, 'haze', palette);

const village = createVillage({
  seed: 30, radius: 9, houses: 5,
  surface: terrain.heightAt,
  palette,
});
scene.add(village.group);

// Freeze the cycle at golden hour so the windows just start to glow.
const cycle = createDayCycle({ sky, rig, scene, lamps: village.lamps, palette,
  timeOfDay: 0.74 });
console.log('sun elevation:', cycle.sunElevation.toFixed(2));

${orbit(26, 13, 0.045)}
game.start();`,
  },

  {
    id: 'kit',
    title: 'An ASCII fort (kits)',
    group: 'Settlement',
    code: `// Interiors and compounds from ASCII: every character is one
// KIT_UNIT cell — walls '#', floors '.', doorways 'D', torches 'T',
// spawns 'S'. Walls+floors render as just two InstancedMeshes.
import { assembleKit, createLightingRig, createSky, applyFog, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry, MeshStandardMaterial } from 'three';

const palette = PALETTES.dusk;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('night').group);
applyFog(scene, 'thick', palette);
const ground = new Mesh(new PlaneGeometry(70, 70),
  new MeshStandardMaterial({ color: 0x2d3b4e }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.21;
scene.add(ground);

const fort = assembleKit([
  '###########',
  '#....#....#',
  '#.T..#..T.#',
  '#....D....#',
  '##D####...#',
  '#....#.S..#',
  '#.T..D....#',
  '#....#..T.#',
  '###########',
], { palette, torchLights: 4 });
scene.add(fort.group);
console.log('spawns:', fort.spawns.length,
  '· walkable at spawn:', fort.floorAt(fort.spawns[0].x, fort.spawns[0].z));

${orbit(17, 12, 0.05)}
game.start();`,
  },

  {
    id: 'living',
    title: 'Water, wind & the day cycle',
    group: 'Living world',
    code: `// The living-world trio: an animated lake with sandy shores, wind
// swaying every scattered plant (a vertex-shader patch on the instanced
// meshes), and a fast day-night cycle driving sun, sky and fog.
import { createTerrain, createSky, createLightingRig, applyFog, createWater,
         aboveWater, applyWind, createDayCycle, createTree, createGrassTuft,
         scatter, PALETTES } from 'scena3d';
import { Game } from 'gama3d';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;

const LEVEL = 0.9;
const terrain = createTerrain({ seed: 3, size: 90, amplitude: 5,
  waterLevel: LEVEL, palette });
const water = createWater({ level: LEVEL, size: 120, palette });
const sky = createSky({ palette });
const rig = createLightingRig('day');
scene.add(terrain.mesh, water.mesh, sky.mesh, rig.group);
applyFog(scene, 'haze', palette);

const dry = aboveWater(terrain, water, 0.3);
const green = scatter({
  seed: 4,
  area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
  surface: terrain.heightAt,
  density: 0.09,
  items: [
    { create: (rng) => createTree({ seed: rng.int(1, 1e9), palette }), weight: 1 },
    { create: (rng) => createGrassTuft({ seed: rng.int(1, 1e9), palette }), weight: 3, variants: 8 },
  ],
  mask: (x, z, y) => y < 3.6 && dry(x, z),   // nothing grows underwater
});
scene.add(green.group);

const wind = applyWind(green.group, { strength: 0.08 });
const cycle = createDayCycle({ sky, rig, scene, palette, dayLength: 24 });
game.onUpdate((t) => { water.update(t.delta); wind.update(t.delta); cycle.update(t.delta); });

${orbit(34, 16)}
game.start();`,
  },

  {
    id: 'path',
    title: 'A road & its wardens',
    group: 'Living world',
    code: `// The SCENA handshake, live: ONE authored polyline becomes the dirt
// ribbon, the scatter keep-out AND the patrol route; the forest's
// obstacle metadata feeds GAMA's ObstacleAvoidance. Neither library
// imports the other — the shapes are structural.
import { createTerrain, createSky, createLightingRig, applyFog, createPath,
         createTree, scatter, PALETTES } from 'scena3d';
import { Game, MotionAgent, FollowPath, Path, ObstacleAvoidance, Separation } from 'gama3d';
import { createCapsulePerson } from 'gama3d/templates';

const palette = PALETTES.autumn;
const game = new Game();
const scene = game.world.scene;
const terrain = createTerrain({ seed: 18, size: 90, amplitude: 5, palette });
scene.add(terrain.mesh, createSky({ palette }).mesh, createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);

const road = createPath(
  [{ x: -18, z: -10 }, { x: 0, z: -16 }, { x: 16, z: -6 },
   { x: 14, z: 12 }, { x: -2, z: 14 }, { x: -20, z: 6 }],
  { surface: terrain.heightAt, width: 2.2, loop: true, palette });
scene.add(road.mesh);

const forest = scatter({
  seed: 21,
  area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
  surface: terrain.heightAt,
  density: 0.05, minSpacing: 1.6,
  items: [{ create: (rng) => createTree({ seed: rng.int(1, 1e9), palette }), variants: 6 }],
  mask: (x, z, y) => y < 3.6,
  keepOut: road.keepOut,               // nothing grows on the road
});
scene.add(forest.group);

const wardens = [];
for (let i = 0; i < 3; i++) {
  const warden = game.world.spawn('warden');
  warden.add(createCapsulePerson([0x60a5fa, 0xf87171, 0xfbbf24][i]));
  const patrol = new Path(road.route.map((p) => p.clone()), true);
  for (let s = 0; s < (i * road.route.length) / 3; s++) patrol.advance();
  warden.position.copy(patrol.current());
  const agent = warden.addComponent(new MotionAgent({ maxSpeed: 4.5, maxForce: 30, planar: true }));
  agent.addBehavior(new FollowPath(patrol, 1.6));
  agent.addBehavior(new ObstacleAvoidance(() => forest.obstacles, 3.5, 0.5), 2.5);
  agent.addBehavior(new Separation(() => wardens, 1.6), 1.2);
  wardens.push(agent);
}
game.onUpdate(() => {
  for (const a of wardens) a.owner.position.y = terrain.heightAt(a.owner.position.x, a.owner.position.z);
});

${orbit(30, 15)}
game.start();`,
  },

  {
    id: 'manifest',
    title: 'A world from JSON',
    group: 'Manifests',
    code: `// The entire world below is ONE plain-JSON object — storable,
// diffable, network-shippable. buildScene() does all the cross-feature
// wiring: scatters stay ashore/off-road/out of the village, and the
// village's windows + lamps feed the day cycle. Edit the JSON and re-run.
import { buildScene } from 'scena3d';
import { Game } from 'gama3d';

const game = new Game();
const world = buildScene({
  seed: 18,
  palette: 'autumn',
  terrain: { size: 90, amplitude: 5 },
  water: { level: 0.25 },
  dayCycle: { dayLength: 30, timeOfDay: 0.35 },
  paths: [{ points: [
    { x: -18, z: -10 }, { x: 0, z: -16 }, { x: 16, z: -6 },
    { x: 14, z: 12 }, { x: -2, z: 14 }, { x: -20, z: 6 }], loop: true, width: 2.2 }],
  village: { radius: 9, houses: 5 },
  scatters: [
    { density: 0.05, minSpacing: 1.6, maxHeight: 3.6,
      items: [{ type: 'tree', weight: 4, variants: 6 }, { type: 'rock' }, { type: 'bush' }] },
    { density: 0.12, minSpacing: 0.7, maxHeight: 3.4, items: [{ type: 'grass', variants: 8 }] },
  ],
}, game.world.scene);

game.onUpdate((t) => world.update(t.delta));
console.log(world.obstacles.length, 'obstacles ready for GAMA steering');

${orbit(33, 16, 0.045)}
game.start();`,
  },
];

export function findExample(id: string): Example {
  return EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0];
}
