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
    id: 'wind',
    title: 'Wind & swaying flora',
    group: 'Worldbuilding',
    code: `// One WindField makes the whole scene breathe: a wheat field ripples,
// the trees ringing it lean their canopies, the bushes nod — all from the
// SAME gust, which travels downwind so nothing sways in lockstep. The bend
// is a vertex shader (PBR/shadows/fog survive) and it self-animates.
import { createWindField, applyWind, createTree, createBush, createGrassTuft,
         createSurface, createSky, createLightingRig, applyFog, scatter, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);
const ground = new Mesh(new PlaneGeometry(180, 180), createSurface('dirt', { color: 0x7c8a52 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);

// One field drives everything — trees, wheat and bushes share the gust.
const wind = createWindField({ direction: 28, strength: 0.42, gust: 0.75, waveLength: 4, waveSpeed: 2.6 });

// A wheat field — dense golden blades; the tight wave reads as a ripple.
const wheatPalette = { ...palette, grassHigh: 0xdcc063, grassLow: 0xc2a747,
  foliage: [0xcbb24a, 0xdcc063, 0xc0a840, 0xd3bd58] };
const wheat = scatter({
  seed: 5, area: { min: { x: -13, z: -13 }, max: { x: 13, z: 13 } },
  density: 3.0, minSpacing: 0.26,
  items: [{ create: (r) => createGrassTuft({ seed: r.int(1, 1e9), blades: 7, palette: wheatPalette }), variants: 14 }],
});
scene.add(wheat.group);
applyWind(wheat.group, { field: wind, height: 0.5, stiffness: 1.1, anchor: 0.03 });

const trees = scatter({
  seed: 8, area: { min: { x: -26, z: -26 }, max: { x: 26, z: 26 } },
  density: 0.04, minSpacing: 3,
  items: [{ create: (r) => createTree({ seed: r.int(1, 1e9), palette }), variants: 6 }],
  mask: (x, z) => Math.hypot(x, z) > 17,
});
scene.add(trees.group);
applyWind(trees.group, { field: wind, height: 4, stiffness: 2.4, anchor: 1 });

for (let i = 0; i < 6; i++) {                         // bushes, wind straight from the generator
  const b = createBush({ seed: 40 + i, wind, palette });
  const a = (i / 6) * Math.PI * 2;
  b.object.position.set(Math.cos(a) * 15.5, 0, Math.sin(a) * 15.5);
  scene.add(b.object);
}

game.onUpdate((t) => {
  const a = t.elapsed * 0.05;
  game.camera.position.set(Math.sin(a) * 15, 4, 17);
  game.camera.lookAt(0, 0.8, 0);
});
game.start();`,
  },

  {
    id: 'weather',
    title: 'Rain & snow',
    group: 'Worldbuilding',
    code: `// GPU-driven precipitation: every drop is placed in the vertex shader
// and the cloud follows the camera, so thousands of particles cost one draw
// call. Rain slants along the wind; snow drifts AND settles — the roofs and
// ground whiten as it falls, reusing the surface cap. Try type = 'rain'.
import { createPrecipitation, createWindField, createHouse, createTree,
         createSurface, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry, Color, Fog, DirectionalLight, AmbientLight } from 'three';

const type = 'snow';                              // ← change to 'rain'
const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
const sky = type === 'snow' ? 0xb0bac2 : 0x9aa6ae;
scene.background = new Color(sky);
scene.fog = new Fog(sky, type === 'snow' ? 45 : 28, type === 'snow' ? 115 : 85);
scene.add(new DirectionalLight(0xf2f4f7, 1.4), new AmbientLight(sky, 0.75));
const ground = new Mesh(new PlaneGeometry(200, 200), createSurface('dirt', { color: 0x6f6a4a }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);

[[-4, -2, 0.3], [3.5, -3, -0.5], [5, 3, 2.4], [-5, 3.5, -0.8], [0, 5, Math.PI]]
  .forEach(([x, z, ry], i) => {
    const h = createHouse({ seed: 10 + i, palette });
    h.object.position.set(x, 0, z); h.object.rotation.y = ry; scene.add(h.object);
  });
for (let i = 0; i < 5; i++) {
  const tree = createTree({ seed: 30 + i, palette });
  const a = (i / 5) * Math.PI * 2;
  tree.object.position.set(Math.cos(a) * 11, 0, Math.sin(a) * 11); scene.add(tree.object);
}

const wind = createWindField({ direction: 20, strength: type === 'snow' ? 0.5 : 0.9 });
const weather = type === 'snow'
  ? createPrecipitation({ type, wind, count: 2600, size: 6, opacity: 0.62 })
  : createPrecipitation({ type, wind });
scene.add(weather.object);
if (type === 'snow') weather.accumulate(scene, { max: 0.8, rate: 0.35, capUp: 0.3 });

game.onUpdate((t) => {
  const a = t.elapsed * 0.05;
  game.camera.position.set(Math.sin(a) * 13, 5.5, 14);
  game.camera.lookAt(0, 1.4, 0);
});
game.start();`,
  },

  {
    id: 'weathersys',
    title: 'Weather controller',
    group: 'Worldbuilding',
    code: `// One createWeather cross-fades the whole scene between named states —
// clear, overcast, fog, rain, storm, snow, blizzard — driving the wind field,
// rain & snow, fog, sky and light together. The trees share the wind, so they
// lean as it rises; storms crack with lightning. It cycles automatically.
import { createWeather, createWindField, createTerrain, createTree,
         createGrassTuft, createLightingRig, applyWind, scatter, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Color } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0xbcd4e6);
const rig = createLightingRig('overcast'); scene.add(rig.group);

const terrain = createTerrain({ seed: 5, size: 100, amplitude: 4, valleyFlatness: 0.65, palette });
scene.add(terrain.mesh);

const wind = createWindField({ direction: 40, strength: 0.15, gust: 0.5 });
const wood = scatter({
  seed: 6, area: { min: { x: -44, z: -44 }, max: { x: 44, z: 44 } },
  surface: terrain.heightAt, density: 0.02, minSpacing: 3.5,
  items: [{ create: (r) => createTree({ seed: r.int(1, 1e9), palette }), variants: 5 }],
  mask: (x, z) => Math.hypot(x, z) > 8,
});
scene.add(wood.group);
applyWind(wood.group, { field: wind, height: 4, stiffness: 1.8, anchor: 1 });

const meadow = scatter({
  seed: 7, area: { min: { x: -26, z: -26 }, max: { x: 26, z: 26 } },
  surface: terrain.heightAt, density: 0.35, minSpacing: 0.7,
  items: [{ create: (r) => createGrassTuft({ seed: r.int(1, 1e9), palette }), variants: 4 }],
});
scene.add(meadow.group);
applyWind(meadow.group, { field: wind, height: 0.5, stiffness: 1.2, anchor: 0.03 });

// The controller reuses the wind the flora is bound to, dims the rig, settles snow.
const weather = createWeather(scene, { wind, sun: rig.sun, ambient: rig.ambient, accumulateOn: scene });
const CYCLE = ['clear', 'overcast', 'fog', 'rain', 'storm', 'snow', 'blizzard'];
let ci = 0;
setInterval(() => { ci = (ci + 1) % CYCLE.length; weather.set(CYCLE[ci], { fade: 3.5 }); }, 6000);

game.onUpdate((t) => {
  const a = t.elapsed * 0.03;
  game.camera.position.set(Math.sin(a) * 30, 10, Math.cos(a) * 30);
  game.camera.lookAt(0, 4, 0);
});
game.start();`,
  },

  {
    id: 'seasons',
    title: 'Season controller',
    group: 'Worldbuilding',
    code: `// createSeasons is the weather controller's counterpart for the trees: it
// cross-fades a whole wood between spring, summer, autumn and winter by
// re-grading the canopy albedo in the shader — no geometry rebuilt, trunks
// untouched. It composes with the wind, so trees sway *and* turn. Auto-cycling.
import { createSeasons, createWindField, createTerrain, createTree,
         createLightingRig, applyWind, applyFog, scatter, treeBiome, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Color } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0xbcd6e6);
const rig = createLightingRig('golden-hour'); scene.add(rig.group);
applyFog(scene, 'haze', palette);

const terrain = createTerrain({ seed: 5, size: 100, amplitude: 3.5, valleyFlatness: 0.7, palette });
scene.add(terrain.mesh);

const wind = createWindField({ direction: 40, strength: 0.3, gust: 0.6 });
const wood = scatter({
  seed: 6, area: { min: { x: -44, z: -44 }, max: { x: 44, z: 44 } },
  surface: terrain.heightAt, density: 0.03, minSpacing: 3.4,
  items: treeBiome('temperate', { palette, variants: 5 }),
  mask: (x, z) => Math.hypot(x, z) > 6,
});
scene.add(wood.group);
applyWind(wood.group, { field: wind, height: 5, stiffness: 2, anchor: 0.8 });

// One controller re-grades every tagged canopy; only the leaves turn.
const seasons = createSeasons({ initial: 'summer' });
seasons.apply(wood.group);
const CYCLE = ['spring', 'summer', 'autumn', 'winter'];
let si = 1;
setInterval(() => { si = (si + 1) % CYCLE.length; seasons.set(CYCLE[si], { fade: 3.5 }); }, 5000);

game.onUpdate((t) => {
  const a = t.elapsed * 0.04;
  game.camera.position.set(Math.sin(a) * 32, 12, Math.cos(a) * 32);
  game.camera.lookAt(0, 4, 0);
});
game.start();`,
  },

  {
    id: 'ocean',
    title: 'Sea waves',
    group: 'Worldbuilding',
    code: `// A Gerstner-wave sea: crests peak and troughs flatten like real swell,
// with analytic normals, whitecap foam and a fresnel sky tint. It reads the
// terrain's heightAt, so it fades out over the island and foams at the shore
// — and the boat rides the swell via the SAME heightAt on the CPU.
import { createOcean, createTerrain, createSky, createLightingRig, applyFog,
         createWindField, createSurface, createTree, createRock, scatter,
         aboveWater, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, Group, BoxGeometry, CylinderGeometry } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);

const SEA = 3.2, ISLE = 38;
const terrain = createTerrain({ seed: 7, size: ISLE * 2, amplitude: 7, waterLevel: SEA, palette });
scene.add(terrain.mesh);
// Beyond the island it's open, deep sea; inside, the terrain's own coast.
const shore = (x, z) => (Math.abs(x) < ISLE && Math.abs(z) < ISLE ? terrain.heightAt(x, z) : SEA - 6);

const wind = createWindField({ direction: 35, strength: 0.4 });
const ocean = createOcean({ level: SEA, size: 320, amplitude: 0.55, choppiness: 0.8, wind, shore });
scene.add(ocean.mesh);

const island = scatter({
  seed: 3, area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
  surface: terrain.heightAt, density: 0.04, minSpacing: 2.5,
  items: [{ create: (r) => createTree({ seed: r.int(1, 1e9), palette }), weight: 3, variants: 5 },
          { create: (r) => createRock({ seed: r.int(1, 1e9), palette }) }],
  mask: aboveWater(terrain, { level: SEA }, 0.6),
});
scene.add(island.group);

// A boat that rides the swell — the buoyancy handshake.
const boat = new Group();
const hull = new Mesh(new BoxGeometry(1.5, 0.5, 3.4), createSurface('plank', { color: palette.wood }));
const mast = new Mesh(new CylinderGeometry(0.05, 0.07, 3, 6), createSurface('wood', { color: palette.woodDark }));
mast.position.set(0, 1.6, -0.2);
boat.add(hull, mast);
scene.add(boat);
const bx = 20, bz = 30;

game.onUpdate((t) => {
  boat.position.set(bx, ocean.heightAt(bx, bz), bz);
  boat.rotation.z = (ocean.heightAt(bx - 1, bz) - ocean.heightAt(bx + 1, bz)) * 0.35;
  const a = t.elapsed * 0.05;
  game.camera.position.set(Math.sin(a) * 26, SEA + 5, 44);
  game.camera.lookAt(0, SEA, 6);
});
game.start();`,
  },

  {
    id: 'sail',
    title: 'Sailing to windward',
    group: 'Worldbuilding',
    code: `// Four rigs, six hundred years apart, in ONE breeze — all trying to reach
// the same mark dead to windward. Nobody can point at it, so each sails the
// closest course her own rig will hold: layline(). The square rigger has to
// bear away seventy degrees, the Bermudan sloop only forty, and that gap is
// the entire history of getting anywhere upwind.
import { createSailRig, createWindField, createDeckedShip, createOcean,
         createSky, createLightingRig, RIG_KINDS, PALETTES } from 'scena3d';
import { Game } from 'gama3d';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);

const sea = createOcean({ amplitude: 0.5, wavelength: 26, size: 700, segments: 160 });
scene.add(sea.mesh);

// Blowing toward +x, so it comes FROM this bearing.
const wind = createWindField({ direction: 0, strength: 1, gust: 0 });
const FROM = -Math.PI / 2;

const HULLS = { square: 'carrack', lateen: 'galley', gaff: 'carrack', bermudan: 'galley' };
const fleet = RIG_KINDS.map((kind, i) => {
  const rig = createSailRig({ kind, seed: i + 2, palette, scale: 1.3 });
  rig.setWind(wind);
  const ship = createDeckedShip({ era: HULLS[kind], seed: i + 4, palette });
  // The mark is dead upwind. This is the only honest answer to "steer at it".
  ship.object.rotation.y = rig.layline(FROM, FROM + rig.noGo);
  ship.object.position.set(-60 + i * 40, 0, 0);
  ship.float((x, z) => sea.heightAt(x, z));
  rig.object.position.y = ship.decks[0].y * 0.92;
  ship.object.add(rig.object);
  scene.add(ship.object);
  return { rig, ship };
});

game.onUpdate((t) => {
  sea.update(t.delta);
  wind.update(t.delta);
  for (const { rig, ship } of fleet) {
    rig.update(t.delta);
    // No throttle anywhere: the polar decides, and where she points is why.
    ship.update(t.delta, { speed: rig.drive * 2 });
  }
  const a = t.elapsed * 0.05;
  game.camera.position.set(Math.sin(a) * 40, 34, 120);
  game.camera.lookAt(0, 8, 0);
});
game.start();`,
  },

  {
    id: 'berth',
    title: 'Alongside',
    group: 'Worldbuilding',
    code: `// A rope is a ONE-WAY constraint: it pulls, and it can never push. A
// fender is the same thing backwards. She is held in the gap between them,
// which is why a ship alongside is never quite still. The three posts are
// people standing perfectly still on three different frames — quay, gangway
// and deck — and NOTHING moves them but the ride() of what they are on.
import { createBerth, moor, createGangway, createDeckedShip, createOcean,
         createSky, createLightingRig, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, Object3D, BoxGeometry, MeshStandardMaterial, Vector3 } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);

const sea = createOcean({ amplitude: 0.28, wavelength: 30, size: 400, segments: 140 });
scene.add(sea.mesh);

const berth = createBerth({ era: 'harbour', length: 68, bollards: 6, palette });
scene.add(berth.object);

const ship = createDeckedShip({ era: 'steamer', seed: 4, palette });
ship.float((x, z) => sea.heightAt(x, z));
ship.object.position.set(11, 0, 0);
scene.add(ship.object);

const lines = moor(ship, berth, { standoff: 1.0, palette });
scene.add(lines.object);

// The brow lands on her MAIN deck — decks[0] is the topmost, which on a
// steamer is her bridge, and a gangway to the bridge is a fire escape.
const main = ship.decks.reduce((lo, d) => (d.y < lo.y ? d : lo));
const landing = new Object3D();
landing.position.set(-ship.beam * 0.45, main.y, 2);
ship.object.add(landing);
const brow = createGangway({ shore: berth.brow.anchor, ship, landing, reach: 16, palette });
scene.add(brow.object);

// Settle her before anybody steps aboard.
for (let i = 0; i < 60 * 12; i++) ship.update(1 / 60, lines.hold(1 / 60));
brow.update(1 / 60);

berth.object.updateMatrixWorld(true);
ship.object.updateMatrixWorld(true);
const ashore = berth.brow.anchor.getWorldPosition(new Vector3());
const aboard = landing.getWorldPosition(new Vector3());
const people = [];
const stand = (on, at, color) => {
  const y = on.deckAt(at.x, at.z);
  if (y === null) return;
  at.y = y;
  const post = new Mesh(new BoxGeometry(0.42, 1.75, 0.42),
    new MeshStandardMaterial({ color, flatShading: true }));
  scene.add(post);
  people.push({ on, at, post });
};
stand(berth, ashore.clone().add(new Vector3(-1.4, 0, 0)), 0xf0efe8);
stand(brow, new Vector3().lerpVectors(ashore, aboard, 0.5), 0xe0a531);
stand(ship, aboard.clone().add(new Vector3(2.2, 0, -7)), 0x4f8fd8);

game.onUpdate((t) => {
  sea.update(t.delta);
  const held = lines.hold(t.delta);
  // A swell setting in past the pierhead — something is always working her.
  held.drift.x += Math.sin(t.elapsed * 0.55) * 0.55;
  held.drift.z += Math.sin(t.elapsed * 0.31 + 1.1) * 0.5;
  ship.update(t.delta, held);
  brow.update(t.delta);
  for (const p of people) {
    p.on.ride(p.at);                       // THE ONLY thing that moves them
    const y = p.on.deckAt(p.at.x, p.at.z, p.at.y);
    if (y !== null) p.at.y = y;
    p.post.position.copy(p.at);
    p.post.position.y += 0.88;
  }
  game.camera.position.set(-8.5, 7.6, 22 + Math.sin(t.elapsed * 0.07) * 2.5);
  game.camera.lookAt(2, 1.4, -5);
});
game.start();`,
  },

  {
    id: 'oars',
    title: 'Under oars',
    group: 'Worldbuilding',
    code: `// An oar is not a throttle, it is a DUTY CYCLE: the blade is in the water
// for under half of every stroke, so thrust is a pulse and her speed surges.
// Three crews at one rate — the only difference between them is how together
// they are, and everything you can see follows from that.
import { createOarBank, createDeckedShip, createOcean, createSky,
         createLightingRig, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, MeshStandardMaterial, Vector3 } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);

const sea = createOcean({ amplitude: 0.22, wavelength: 28, size: 700, segments: 150 });
scene.add(sea.mesh);

const fleet = [1, 0.55, 0.15].map((together, i) => {
  const ship = createDeckedShip({ era: 'galley', seed: i + 6, palette });
  ship.float((x, z) => sea.heightAt(x, z));
  ship.object.position.set(-22 + i * 22, 0, -30);
  scene.add(ship.object);

  const bank = createOarBank({
    kind: 'longship', seats: 11, beam: ship.beam * 1.05,
    gunwale: 0.95, together, seed: i + 2, palette,
  });
  bank.setRate(22);
  ship.object.add(bank.object);

  // A post on the start line, so the race is a thing you can read off the
  // water rather than a number.
  const mark = new Mesh(new BoxGeometry(0.5, 3.2, 0.5),
    new MeshStandardMaterial({ color: [0x53b06a, 0xe0a531, 0xd8483a][i], flatShading: true }));
  mark.position.set(ship.object.position.x, 1.6, -30);
  scene.add(mark);
  return { ship, bank };
});

game.onUpdate((t) => {
  sea.update(t.delta);
  const mid = new Vector3();
  for (const f of fleet) {
    f.bank.update(t.delta);
    // One number wide: no throttle anywhere. If she is slow it is because
    // the blades are not going in together.
    f.ship.update(t.delta, { speed: f.bank.way, turn: f.bank.yaw * 0.25 });
    mid.add(f.ship.object.position);
  }
  mid.multiplyScalar(1 / fleet.length);
  let spread = 0;
  for (const f of fleet) spread = Math.max(spread, f.ship.object.position.distanceTo(mid));
  const back = 40 + spread * 0.95;
  game.camera.position.set(mid.x - back * 0.62, 6 + back * 0.24, mid.z + back * 0.78);
  game.camera.lookAt(mid.x, 0.5, mid.z);
});
game.start();`,
  },

  {
    id: 'sea',
    title: 'Sea state & swell',
    group: 'Worldbuilding',
    code: `// THE SEA REMEMBERS AND THE WIND DOES NOT. A wind gets up in twenty minutes;
// the sea it raises takes sixteen hours to answer and DAYS to die. Here a big
// old swell runs from the south-west, raised by a storm nobody in this scene
// will ever see, while a fresh breeze from the north-west has only begun to
// raise anything — and where the two cross the sea is confused.
//
// The clock runs at sixty times life. Bring a gale on and then take it away,
// and watch what does not happen.
import { createSeaState, createDeckedShip, createOcean, createSky,
         createLightingRig, PALETTES } from 'scena3d';
import { Game } from 'gama3d';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
// Bigger than the default camera's thousand-unit far plane.
game.camera.far = 4000;
game.camera.updateProjectionMatrix();
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);

const state = createSeaState({ kind: 'ocean' });
state.swellIn(215, 3.6, 11);   // from somewhere else, days ago
state.setWind(13, 315);        // …and a fresh breeze from here, just started

// ONE surface, driven by the state. Two would be two seas, and a boat would
// float on the one nobody can see.
const sea = createOcean({
  sea: () => state.trains, size: 1600, segments: 200, choppiness: 0.85,
});
scene.add(sea.mesh);

// The same sea is a different sea depending on what you are in.
const boats = [['galley', -110], ['carrack', -30], ['steamer', 70]].map(([era, x]) => {
  const ship = createDeckedShip({ era, seed: 31 + x, palette });
  ship.float((qx, qz) => sea.heightAt(qx, qz));
  ship.object.position.set(x, 0, -20);
  ship.object.rotation.y = 0.5;
  scene.add(ship.object);
  return { ship, x0: x, z0: -20 };
});

// Sixty seconds of wall time is an hour of weather — the thing this shows
// takes a day and a half. The boats still bob at their own speed.
const RATE = 60;
let hours = 0;
game.onUpdate((t) => {
  hours += (t.delta * RATE) / 3600;
  // A gale for sixteen hours, and then nothing at all.
  if (hours > 2 && hours < 18) state.setWind(20, 315);
  else if (hours >= 18) state.setWind(0);
  state.update(t.delta * RATE);
  sea.update(t.delta);
  for (const b of boats) {
    b.ship.update(t.delta, { speed: 0 });
    b.ship.object.position.x = b.x0;
    b.ship.object.position.z = b.z0;
  }
  // HIGH, and looking down the swell: from the deck a nine-metre sea three
  // hundred metres long is a slope of three degrees and reads as nothing.
  game.camera.position.set(-232, 96, 196);
  game.camera.lookAt(-20, 0, -28);
});
game.start();`,
  },

  {
    id: 'booth',
    title: 'The booth, web radio & DJ tiles',
    group: 'Worldbuilding',
    code: `// THE FIRST PROP IN THIS LIBRARY THAT IS NOT ALL HERE.
// Click the scene to operate the woofer: it plays REAL web radio (SomaFM),
// and every further click tunes the next channel. Under the radio runs a
// seeded BED — when the stream buffers, stalls or refuses (autoplay, CORS,
// a dead station), the bed takes the floor and the DJ tiles never know.
// The ON-AIR lamp tells the truth: green = bed, red = radio, amber = the
// radio dropped and the bed is holding.
import { createWoofer, createDanceTiles } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial,
  AmbientLight, DirectionalLight, Color } from 'three';

const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0x07080c);
scene.add(new AmbientLight(0x9aa4c0, 0.5));
const key = new DirectionalLight(0xb8c4ff, 0.7);
key.position.set(6, 12, 8);
scene.add(key);
const ground = new Mesh(new PlaneGeometry(60, 60),
  new MeshStandardMaterial({ color: 0x111318, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const rig = createWoofer({ seed: 11 });
rig.object.scale.setScalar(1.8);          // the user asked for a BIG woofer
rig.object.position.set(0, 0, -6.8);
scene.add(rig.object);

const tiles = createDanceTiles({ cols: 11, rows: 9, size: 1.0, seed: 11 });
tiles.object.position.set(0, 0, 0.8);
scene.add(tiles.object);

// A dancer, so the beat is visible even off the floor.
const dancer = new Mesh(new BoxGeometry(0.5, 1.75, 0.5),
  new MeshStandardMaterial({ color: 0x3a3f4a, flatShading: true }));
dancer.position.set(3.6, 0.875, 3.4);
scene.add(dancer);

// Auto-on: the deck idles on the bed, so the floor is alive before the
// first click. THE CLICK is the real interaction — it starts the radio.
rig.play();
window.addEventListener('pointerdown', () => rig.operate());
// TOGGLE CHANNELS: arrows walk the dial, digits 1-5 jump straight there.
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') rig.next();
  else if (e.key === 'ArrowLeft') rig.prev();
  else if (/^[1-9]$/.test(e.key)) rig.play(Number(e.key) - 1);
});
rig.onStation((s) => console.log('tuned:', s.name, '—', s.genre));

game.onUpdate((t) => {
  rig.update(t.delta);
  const pulse = rig.pulse();       // same shape whoever has the floor
  tiles.feed(pulse);
  tiles.update(t.delta);
  dancer.material.color.setRGB(
    0.23 + pulse.bass * 0.5, 0.25 + pulse.mid * 0.3, 0.29 + pulse.treble * 0.4);
  dancer.position.y = 0.875 + pulse.bass * 0.12;
  game.camera.position.set(6.5, 4.6, 9.5);
  game.camera.lookAt(-0.5, 1.2, -3);
});
game.start();`,
  },

  {
    id: 'shala',
    title: 'The shala: four rooms for one practice',
    group: 'Worldbuilding',
    code: `// THE QUIETEST GATHERING IN THIS LIBRARY: no seats, no table, no fire —
// a deck, a grid of mats, and an ORIENTATION. Surya namaskar faces the
// sun, so every shala takes a sunrise bearing and lays its student mats
// facing it, instructor out front facing back at the class. matSpots()
// hands the layout over in WORLD space, instructor first — stand an
// ANIMA YogaClass on it and the room fills (see the trilogy handshake).
// Four eras, one practice: the ashram's sandstone and columns, the
// studio's mirror and barre, the rooftop's railing and string lights,
// the retreat's bamboo pergola.
import { createShala, SHALA_ERAS } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial,
  AmbientLight, DirectionalLight, Color, Fog } from 'three';

const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0xf2e2ca);
scene.fog = new Fog(0xf2e2ca, 40, 90);
scene.add(new AmbientLight(0xfff0dc, 0.7));
const sun = new DirectionalLight(0xffd9a0, 1.15);  // surya, low in the east
sun.position.set(-20, 7, 26);
scene.add(sun);
const ground = new Mesh(new PlaneGeometry(120, 120),
  new MeshStandardMaterial({ color: 0xcdb98f, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
scene.add(ground);

// The four rooms, arranged so each catches the same dawn. Every one
// faces its own sunrise bearing — watch the mats agree with it.
const spots = [[-11, -2, 0.5], [1.5, -6, 0.15], [13.5, -1, -0.2], [3, 6, 0.35]];
SHALA_ERAS.forEach((era, i) => {
  const [x, z, sunrise] = spots[i];
  const shala = createShala({ seed: 20 + i, era, students: i === 3 ? 6 : 8,
    sunrise });
  shala.object.position.set(x, 0, z);
  scene.add(shala.object);
  // The handshake, minus the people: mark each mat spot with a pebble so
  // the world-space contract is visible. Index 0 (instructor) is darker.
  shala.matSpots().forEach((s, j) => {
    const pebble = new Mesh(new BoxGeometry(0.16, 0.05, 0.16),
      new MeshStandardMaterial({ color: j === 0 ? 0x6e4630 : 0xa08a68 }));
    pebble.position.set(s.x, shala.deckTop + 0.08, s.z);
    pebble.rotation.y = s.facing;
    scene.add(pebble);
  });
});

game.onUpdate(() => {
  game.camera.position.set(15, 11, 21);
  game.camera.lookAt(0.5, 0.4, -0.8);
});
game.start();`,
  },

  {
    id: 'bowl',
    title: 'The singing bowl & the breath pulse',
    group: 'Worldbuilding',
    code: `// THE WOOFER'S CALM OPPOSITE. The woofer publishes music as an
// AudioPulse and a floor answers; the bowl publishes BREATH — a tenth
// the frequency, no beat edge at all — and the ROOM answers: the incense
// thickens on the exhale, the lanterns brighten on the inhale and flare
// softly at the strike, settling as the note does. CLICK to strike the
// bowl: the chime is the cue to breathe in (the clock restarts at the
// inhale), and in a real browser it SOUNDS — two detuned partials whose
// beating is the "singing", synthesized in the click itself so autoplay
// policy is satisfied by construction. Headless, it rings silently.
import { createShala, createSingingBowl, createSmoke } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, CylinderGeometry, SphereGeometry,
  PlaneGeometry, MeshStandardMaterial, AmbientLight, DirectionalLight,
  PointLight, Color, Fog } from 'three';

const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0x2a2340);            // before the dawn
scene.fog = new Fog(0x2a2340, 30, 70);
scene.add(new AmbientLight(0x8d84b8, 0.5));
const moon = new DirectionalLight(0xb9c4e8, 0.35);
moon.position.set(14, 10, -8);
scene.add(moon);
const ground = new Mesh(new PlaneGeometry(90, 90),
  new MeshStandardMaterial({ color: 0x4a4258, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
scene.add(ground);

const shala = createShala({ seed: 24, era: 'retreat', students: 6,
  sunrise: 0.25 });
scene.add(shala.object);

// The bowl, on a small stand by the instructor's mat.
const stand = new Mesh(new CylinderGeometry(0.26, 0.3, 0.3, 8),
  new MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
const front = shala.matSpots()[0];
stand.position.set(front.x + 1.1, shala.deckTop + 0.15, front.z + 0.2);
scene.add(stand);
const bowl = createSingingBowl({ seed: 4, breathsPerMinute: 6 });
bowl.object.position.set(front.x + 1.1, shala.deckTop + 0.3, front.z + 0.2);
scene.add(bowl.object);
window.addEventListener('pointerdown', () => bowl.strike());
bowl.onBreath((side) => console.log('breath:', side));

// The incense: a stick whose smoke answers the EXHALE.
const stick = new Mesh(new CylinderGeometry(0.008, 0.008, 0.5, 5),
  new MeshStandardMaterial({ color: 0x3a2c22 }));
stick.position.set(front.x - 1.2, shala.deckTop + 0.25, front.z + 0.2);
stick.rotation.z = 0.06;
scene.add(stick);
const incense = createSmoke({ style: 'scorch', height: 2.2, radius: 0.1,
  seed: 9 });
incense.object.position.set(front.x - 1.2, shala.deckTop + 0.5,
  front.z + 0.2);
scene.add(incense.object);

// The lanterns: four warm globes on posts, breathing with the inhale.
const lanterns = [];
[[-3.4, -2.2], [3.4, -2.2], [-3.4, 3.4], [3.4, 3.4]].forEach(([x, z]) => {
  const post = new Mesh(new CylinderGeometry(0.04, 0.05, 1.5, 6),
    new MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
  post.position.set(x, 0.9, z);
  scene.add(post);
  const globe = new Mesh(new SphereGeometry(0.14, 8, 6),
    new MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffb35a,
      emissiveIntensity: 0.6 }));
  globe.position.set(x, 1.72, z);
  scene.add(globe);
  const light = new PointLight(0xffb35a, 2.5, 9);
  light.position.set(x, 1.75, z);
  scene.add(light);
  lanterns.push({ globe, light });
});

game.onUpdate((t) => {
  bowl.update(t.delta);
  const breath = bowl.pulse();               // the whole coupling
  // Exhale feeds the incense; the strike's ring flares the lanterns.
  const out = Math.max(0, Math.sin(breath.phase * Math.PI * 2 + Math.PI));
  incense.setRate(0.2 + out * 0.75);
  incense.update(t.delta);
  const inGlow = Math.max(0, Math.sin(breath.phase * Math.PI * 2));
  for (const { globe, light } of lanterns) {
    globe.material.emissiveIntensity = 0.45 + inGlow * 0.5 + breath.ring * 0.9;
    light.intensity = 1.8 + inGlow * 1.6 + breath.ring * 4;
  }
  game.camera.position.set(7.5, 4.4, 10.5);
  game.camera.lookAt(-0.5, 0.7, 0.6);
});
game.start();`,
  },

  {
    id: 'beach',
    title: 'Miami: the beach kit, cloth palms & clean water',
    group: 'Worldbuilding',
    code: `// MIAMI. The props that turn sand into a BEACH: pastel art-deco
// lifeguard stands (no two the same colours), rows of striped umbrellas,
// loungers with towels — and water that is actually CLEAN: turquoise in
// the shallows, deep blue out, with a crisp horizon instead of a band of
// haze. (The haze was the bug: an ocean parked at the fog's far plane
// dissolves into the sky and reads as dust.)
//
// The trees are CLOTH — every palm frond and banana leaf is driven by
// the same wave shader as the flags, each with its own phase, so nothing
// flutters in lockstep.
import { createLifeguardTower, createBeachUmbrella, createLounger,
  createPalm, createBananaTree, createSmallCraft, createOcean,
  createSurface } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, SphereGeometry, PlaneGeometry,
  MeshStandardMaterial, AmbientLight, DirectionalLight, HemisphereLight,
  Color, Fog } from 'three';

const game = new Game();                        // the GAMA camera frames it
const scene = game.world.scene;
scene.background = new Color(0x6fc6e8);         // South Beach noon
// Fog far ENOUGH: the sea has to live well inside it or it turns to dust.
scene.fog = new Fog(0x9fd8ea, 260, 900);
scene.add(new HemisphereLight(0xdff2ff, 0xe8d9a8, 0.75));
scene.add(new AmbientLight(0xffffff, 0.25));
const sun = new DirectionalLight(0xfff6e0, 1.35);
sun.position.set(-30, 40, 22);
scene.add(sun);

// THE BEACH PROFILE, shared by the sand AND the sea, so the two agree
// about the waterline: dune at the back, a berm crest, then the beach
// face diving under the water at 1 in 9. (Sand that stays flat under
// the sea is why the first build showed no water at all.)
const profile = (x, z) => {
  // Steep enough that the see-through shallows are a NARROW band: a
  // gentle face left a wide sheet of near-transparent water and the sand
  // under it read as a tongue of beach sticking into the sea.
  const face = Math.max(-4.2, Math.min(2.1, (z - 4) * 0.155));
  const dune = Math.max(0, Math.min(1, (z - 34) / 18));
  // The grain fades IN over the dry sand: a hard cutoff at the waterline
  // cut a cliff into the beach and the sea broke over it.
  const dry = Math.max(0, Math.min(1, (z - 7) / 10));
  return face + dune * dune * 2.8
    + dry * (Math.sin(x * 0.07) * 0.2 + Math.cos(z * 0.05 + x * 0.02) * 0.16);
};
const sandGeo = new PlaneGeometry(330, 220, 100, 80);
sandGeo.rotateX(-Math.PI / 2);
{
  const pos = sandGeo.getAttribute('position');
  const cols = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i) + 55;
    pos.setY(i, profile(x, z));
    // Wet sand is darker: the band the water has just left.
    // Wet sand, dark and wide enough to cover everything the swash can
    // reach — otherwise the drained beach flashes dry tan between waves.
    const wet = Math.max(0, Math.min(1, (13 - z) / 11));
    cols.push(1 - wet * 0.46, 1 - wet * 0.44, 1 - wet * 0.38);
  }
  sandGeo.setAttribute('color',
    new (Object.getPrototypeOf(pos).constructor)(new Float32Array(cols), 3));
  sandGeo.computeVertexNormals();
}
const sandMat = createSurface('sand', { seed: 4, color: 0xf3e6c4 });
sandMat.vertexColors = true;
const sand = new Mesh(sandGeo, sandMat);
sand.position.z = 55;
scene.add(sand);

// THE SEA, clean: turquoise shallows over the shelf, deep blue out, and
// shore-faded on the SAME profile, so the water dies exactly where the
// beach face rises out of it.
const ocean = createOcean({
  level: 0, size: 700, segments: 240, amplitude: 0.42, wavelength: 23,
  choppiness: 0.6, direction: 180, shore: profile,
  shallowColor: 0x51e3d6, deepColor: 0x0a6fb4, skyColor: 0x9fd8ea,
  // Breakers running in, and a waterline that runs up the sand and drains.
  surf: { breakDepth: 1.8, runUp: 0.45, period: 8, bands: 2.4 },
  // The turquoise SHELF: bright water out to 13 m of depth, which on this
  // beach face is eighty-odd metres of it — that band IS the tropics.
  shoalDepth: 13,
  // And the chop that breaks the light up into moving highlights.
  ripples: { strength: 0.4, scale: 0.8 },
  // See-through shallows: clear water IS its bottom.
  clarity: 0.8,
});
// NOT offset: the shore sampler works in the ocean's own space, so the
// plane has to sit on the same origin as the profile it fades against.
scene.add(ocean.mesh);

// THE LIFEGUARD STANDS — the signature of this beach. A row of them,
// each a different pastel pair, marching down the sand.
const kit = [];
[[-28, 9, 3], [-3, 7, 7], [25, 10, 11]].forEach(([x, z, seed]) => {
  const tower = createLifeguardTower({ seed });
  tower.object.scale.setScalar(1.25);
  tower.object.position.set(x, profile(x, z), z);
  tower.object.rotation.y = Math.PI + (x / 90);
  scene.add(tower.object);
  kit.push(tower);
});

// UMBRELLAS AND LOUNGERS: rows of them, the way a rented beach looks.
const RECLINES = ['flat', 'reading', 'upright'];
for (let row = 0; row < 3; row++) {
  for (let i = 0; i < 9; i++) {
    const x = -34 + i * 8.5 + (row % 2) * 3.6;
    const z = 14 + row * 6.5;
    const umbrella = createBeachUmbrella({ seed: row * 20 + i });
    umbrella.object.position.set(x, profile(x, z), z);
    scene.add(umbrella.object);
    kit.push(umbrella);
    for (const side of [-1.05, 1.05]) {
      const lounger = createLounger({
        seed: row * 40 + i * 3 + (side > 0 ? 1 : 0),
        recline: RECLINES[(i + row) % 3],
      });
      lounger.object.position.set(x + side, profile(x + side, z + 0.6), z + 0.6);
      lounger.object.rotation.y = Math.PI + side * 0.12;
      scene.add(lounger.object);
      kit.push(lounger);
    }
  }
}

// THE GREENERY: cloth palms along the back, bananas behind them.
[[-42, 33, 10], [-30, 31, 8.6], [-18, 33, 10.5], [-6, 31, 9],
 [6, 32, 10.2], [18, 31, 8.8], [30, 33, 10], [42, 31, 9.4]]
  .forEach(([x, z, h], i) => {
  const palm = createPalm({ seed: 60 + i, height: h, lean: 0.13 });
  palm.object.position.set(x, profile(x, z), z);
  palm.object.rotation.y = (i % 2 ? 1 : -1) * Math.PI / 2;
  scene.add(palm.object);
  kit.push(palm);
});
[[-36, 39], [-11, 40], [14, 39], [37, 40]].forEach(([x, z], i) => {
  const banana = createBananaTree({ seed: 80 + i, fruiting: i % 2 === 0 });
  banana.object.position.set(x, profile(x, z), z);
  scene.add(banana.object);
  kit.push(banana);
});

// OCEAN DRIVE: a row of pastel deco facades behind the palms — the
// eyebrow band over the windows is the whole style in one detail.
[[-36, 3], [-19, 1], [-2, 4], [15, 2], [32, 5]].forEach(([x, seed], i) => {
  const hue = [0xff9ec4, 0x6fdcd2, 0xffd166, 0xa9b8ff, 0xffab7a][i];
  const wall = new MeshStandardMaterial({ color: hue, roughness: 0.85 });
  const trim = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const storeys = 2 + (seed % 3);
  const w = 11 + (seed % 4);
  const block = new Mesh(new BoxGeometry(w, storeys * 3.4, 9), wall);
  block.position.set(x, 2.6 + storeys * 1.7, 54);
  scene.add(block);
  for (let f = 1; f <= storeys; f++) {
    const brow = new Mesh(new BoxGeometry(w + 0.9, 0.35, 9.6), trim);
    brow.position.set(x, 2.6 + f * 3.4 - 0.5, 54);
    scene.add(brow);
    for (const wx of [-0.3, 0, 0.3]) {
      const glass = new Mesh(new BoxGeometry(w * 0.2, 1.3, 0.2),
        new MeshStandardMaterial({ color: 0x2f5a72, roughness: 0.2 }));
      glass.position.set(x + wx * w, 2.6 + f * 3.4 - 1.7, 49.4);
      scene.add(glass);
    }
  }
  const parapet = new Mesh(new BoxGeometry(w * 0.35, 1.5, 9.2), wall);
  parapet.position.set(x, 2.6 + storeys * 3.4 + 0.75, 54);
  scene.add(parapet);
});

// The fishing boat, hauled up clear of the water.
const boat = createSmallCraft({ fit: 'open', length: 4.6, seed: 12 });
boat.object.position.set(34, profile(34, 8) + 0.2, 8);
boat.object.rotation.set(0, 2.5, 0.09);
scene.add(boat.object);

game.onUpdate((t) => {
  ocean.update(t.delta);
  for (const prop of kit) prop.update(t.delta);
  // FRONT VIEW, from over the water looking IN at the beach: turquoise
  // in the foreground, then the sand and its kit, the palms, and Ocean
  // Drive's pastel facades along the back.
  game.camera.position.set(0, 10.5, -34);
  game.camera.lookAt(0, 8, 36);
});
game.start();`,
  },

  {
    id: 'stacks',
    title: 'The PA, coverage & the echo',
    group: 'Worldbuilding',
    code: `// THE FIRST PROP IN THIS LIBRARY THAT REACHES THE EAR.
// Four systems, and every one has been tuned to do exactly the same job:
// cover(200, 75) — turn everything down as far as it will go and still put a
// usable 75 dB(A) two hundred metres back. Four PAs at four arbitrary volumes
// would say nothing at all.
//
// The carpet is the field, classified by what it costs the person standing
// there: grey-blue you can talk over, green you are raising your voice, amber
// you are shouting, red the day's safe dose runs out in under four hours.
import { createPA, createSky, createLightingRig, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);

// A 200 m field seen from 300 m up. THE DEFAULT FAR PLANE IS 1000 and every
// one of these would be behind it — which is how four working examples once
// rendered as an empty grey rectangle.
game.camera.far = 4000;
game.camera.updateProjectionMatrix();

const ground = new Mesh(new PlaneGeometry(1400, 700),
  new MeshStandardMaterial({ color: 0x2b3138, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, -0.05, 90);
scene.add(ground);

const rigs = [
  [-330, 'horn'], [-110, 'hifi'], [110, 'array'], [330, 'delayed'],
].map(([x0, era]) => {
  const pa = createPA({ era, x: x0, z: 0, fieldLength: 200, height: 7 });
  pa.cover(200, 75);                                   // the tuning
  pa.showCoverage(true, { width: 170, depth: 215, cell: 8 });
  scene.add(pa.object);
  // A person, walking in from the back. Blocky on purpose: at this range a
  // realistic figure is two pixels.
  const walker = new Mesh(new BoxGeometry(7, 22, 7),
    new MeshStandardMaterial({ color: 0x53b06a, flatShading: true }));
  walker.position.set(x0, 11, 200);
  scene.add(walker);
  return { pa, x0, walker };
});

let clock = 0;
game.onUpdate((t) => {
  clock = (clock + t.delta * 8) % 240;
  const z = Math.max(4, 200 - clock);
  for (const r of rigs) {
    r.pa.update(t.delta);
    r.walker.position.z = z;
    const mat = r.walker.material;
    // FOUR colours, because 'loud'/'not loud' cannot tell the person who has
    // to shout from the person who should have left twenty minutes ago.
    const s = r.pa.stateAt(r.x0, z);
    if (s === 'harmful') mat.color.setRGB(0.86, 0.19, 0.14);
    else if (s === 'shouting') mat.color.setRGB(0.88, 0.62, 0.16);
    else if (s === 'raised') mat.color.setRGB(0.24, 0.70, 0.36);
    else mat.color.setRGB(0.46, 0.53, 0.62);
  }
  game.camera.position.set(0, 330, -210);
  game.camera.lookAt(0, 0, 95);
});
game.start();`,
  },

  {
    id: 'plumbing',
    title: 'Plumbing, pressure & the scald',
    group: 'Worldbuilding',
    code: `// THE FIRST THING IN THIS LIBRARY THAT IS SOMEBODY ELSE'S FAULT.
// Everything else here is local: a boiler makes steam out of its own fire, a
// hull floats on its own displacement. A water supply is a NETWORK, and a
// network is shared.
//
// Four houses, somebody in the shower in each, set by feel to 40 C with the
// house quiet. At twelve seconds somebody else flushes the lavatory.
import { createPlumbing, createSky, createLightingRig, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Vector3, Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
const floor = new Mesh(new PlaneGeometry(80, 40),
  new MeshStandardMaterial({ color: 0x6d7a80, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const houses = [
  [-13.5, 'bucket'], [-4.5, 'gravity'], [4.5, 'mains'], [13.5, 'thermostatic'],
].map(([x, kind]) => {
  const plumb = createPlumbing({ kind, seed: 4, palette });
  plumb.object.position.set(x, 0, 0);
  scene.add(plumb.object);
  // A bathroom on the first floor. On gravity those heights are the story.
  plumb.outlet('shower', { kind: 'shower', at: new Vector3(2.6, 2.6, 0.4), height: 2.6 });
  plumb.outlet('basin', { kind: 'tap', at: new Vector3(2.2, 1.5, -1.1), height: 1.5 });
  plumb.outlet('wc', { kind: 'wc', at: new Vector3(3.1, 1.1, -1.6), height: 1.1 });
  plumb.open('shower');
  plumb.update(0.1);
  // TURNED UNTIL IT FELT RIGHT, with the house quiet — and then left alone.
  // Nobody sets a shower to 'sixty per cent hot'.
  plumb.setTarget('shower', 40);

  const post = new Mesh(new BoxGeometry(0.5, 1.75, 0.5),
    new MeshStandardMaterial({ color: 0x2ab85a, flatShading: true }));
  post.position.set(x + 2.6, 0.875, 0.4);
  scene.add(post);
  return { plumb, post };
});

let clock = 0;
let flushed = false;
game.onUpdate((t) => {
  const was = clock;
  clock += t.delta;
  if (!flushed && was < 12 && clock >= 12) {
    flushed = true;
    for (const h of houses) { h.plumb.open('wc'); h.plumb.open('basin'); }
  }
  if (flushed && clock >= 52) {
    flushed = false; clock = 0;
    for (const h of houses) { h.plumb.close('wc'); h.plumb.close('basin'); }
  }
  for (const h of houses) {
    h.plumb.update(t.delta);
    const d = h.plumb.drawAt('shower');
    const mat = h.post.material;
    // THREE COLOURS, because there are two different ways for this to go wrong
    // and they are not interchangeable. A bucket is not being judged at all.
    if (h.plumb.kind === 'bucket') mat.color.setRGB(0.55, 0.56, 0.58);
    else if (d.scalding) mat.color.setRGB(0.86, 0.19, 0.14);
    else if (!d.usable) mat.color.setRGB(0.88, 0.62, 0.16);
    else mat.color.setRGB(0.16, 0.72, 0.34);
  }
  game.camera.position.set(-1, 5.4, 17);
  game.camera.lookAt(0.8, 2.6, 0);
});
game.start();`,
  },

  {
    id: 'coast',
    title: 'Lights, sectors & the horizon',
    group: 'Worldbuilding',
    code: `// A LIGHT IS A FACT ABOUT THE OBSERVER. It does nothing where it stands;
// its whole function happens fifteen miles away in somebody else's eye.
//
// It has two ranges and you get the SMALLER: the geographic, where it drops
// below the horizon — a function of how high the lamp is and how high your eye
// is and of nothing else — and the luminous, where it gets too faint. Past the
// horizon the lamp stops mattering: multiply it by a hundred and you gain
// under two miles and then nothing at all, for ever.
import { createSeamark, createOcean, createLightingRig, NM, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Color, AmbientLight, DirectionalLight, Group, Mesh, SphereGeometry,
         BoxGeometry, MeshBasicMaterial, MeshStandardMaterial } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
// The default game camera sees a THOUSAND units. This scene is bigger than
// that, so without this the far plane quietly clips it away — a frame that
// renders, reports no error, and shows nothing.
game.camera.far = 14400;
game.camera.updateProjectionMatrix();
// NIGHT, because a light view in daylight is a view of a building.
scene.background = new Color(0x0a1622);
scene.add(new AmbientLight(0x93a9c4, 0.24));
const moon = new DirectionalLight(0xa8c0dd, 0.42);
moon.position.set(-40, 60, 30);
scene.add(moon);
void createLightingRig;

const sea = createOcean({ amplitude: 0.12, wavelength: 60, size: 9000, segments: 140 });
scene.add(sea.mesh);

// Four marks, and the axis is IDENTITY rather than power.
const marks = [
  [-980, -180, 'bonfire'], [-340, -230, 'harbour'],
  [280, -300, 'flashing'], [920, -150, 'sectored'],
].map(([x, z, kind]) => {
  const mark = createSeamark({ kind, seed: 6, palette });
  mark.object.position.set(x, 0, z);
  scene.add(mark.object);
  return mark;
});

// THE CHART, ON THE WATER — and nothing at sea looks remotely like this.
// Drawn at a twentieth, because the real arc is thirteen nautical miles long
// and the tower it comes out of is twenty-five metres tall. The ratios are
// what the picture is for: the red arc is shorter than the white one, because
// coloured glass eats three quarters of the lamp.
marks[3].showSectors(true, 0.05);

// A vessel standing in — she is the observer every number is about. Her lights
// are the size of LIGHTS and not of lamps: at a range that shows what a sector
// is, an accurate hull is twenty pixels of grey on black water.
const hull = new Group();
const deck = new Mesh(new BoxGeometry(9, 3.4, 30),
  new MeshStandardMaterial({ color: 0x30363d, flatShading: true }));
deck.position.y = 1.7;
hull.add(deck);
for (const [dx, colour] of [[-9, 0xd1443a], [9, 0x2f9d5b], [0, 0xf6f2e6]]) {
  const light = new Mesh(new SphereGeometry(dx === 0 ? 5 : 4, 10, 8),
    new MeshBasicMaterial({ color: colour }));
  light.position.set(dx, dx === 0 ? 12 : 5, dx === 0 ? -2 : 6);
  hull.add(light);
}
scene.add(hull);

let clock = 0;
game.onUpdate((t) => {
  clock += t.delta;
  for (const m of marks) m.update(t.delta);
  // She crosses out of the white fairway into the red over the rocks, which is
  // the whole of navigation reduced to a colour.
  hull.position.set(920 + Math.sin(clock * 0.06) * 520, 0, 700 + Math.cos(clock * 0.06) * 90);
  const s = marks[3].sightedFrom(hull.position.x, hull.position.z, 4);
  if (Math.floor(clock) % 5 === 0 && Math.floor(clock) !== Math.floor(clock - t.delta)) {
    console.log(s.sector ? s.sector.colour : 'none', 'safe', s.safe,
      '| range', (s.range / NM).toFixed(1), 'nm, limited by', s.limitedBy);
  }
  // There is no camera that holds a light and its range at once, so the lamps
  // are drawn as lights rather than as buildings and the sectors get the frame.
  game.camera.position.set(430, 900, 2150);
  game.camera.lookAt(430, 0, 120);
});
game.start();`,
  },

  {
    id: 'craft',
    title: 'Small craft & swamping',
    group: 'Worldbuilding',
    code: `// A SMALL BOAT IS NOT LOST TO STABILITY. SHE IS LOST TO FREEBOARD.
// And it is a runaway: water aboard means less side left, which means more
// water aboard. Nothing else in this library does that — a boiler finds a
// pressure, a sea finds a height, a hull finds a list. This one has a tipping
// point, and the threshold is twice her freeboard.
//
// Four identical boats, and the only difference is what happens to the water
// once it is in them.
import { createSmallCraft, createOcean, createSky, createLightingRig,
         livesIn, PALETTES } from 'scena3d';
import { Game } from 'gama3d';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);

// AN ORDINARY SHORT SEA — 1.1 m at 9 m long is one in eight, steep and NOT
// breaking. Nothing here is a gale; these boats are lost in weather a ship
// would not notice. The amplitude is half the height on purpose, so the water
// she is drawn on and the water \`meet\` is told about are the same water.
const H = 1.1;
const LEN = 9;
const sea = createOcean({ amplitude: H / 2, wavelength: LEN, size: 700, segments: 220 });
scene.add(sea.mesh);

const boats = [
  ['open', 11], ['buoyant', 3.5], ['selfDraining', -4], ['selfRighting', -11.5],
].map(([fit, z]) => {
  const boat = createSmallCraft({ fit, seed: 3, palette });
  boat.float((x, sz) => sea.heightAt(x, sz));
  boat.object.position.set(0, 0, z);
  scene.add(boat.object);
  // THREE UP, SPREAD ALONG HER, which is the only way any of them is
  // survivable. Heaped in the stern her transom is on the water and she is
  // shipping it standing still — \`freeboard\` is measured at her LOWEST rail.
  boat.seat('bow', 82, 0.55, 0);
  boat.seat('midships', 88, 0, 0);
  boat.seat('helm', 85, -0.5, 0);
  return { boat, z };
});

// A man in the open boat bailing as hard as anybody can bail: about two kilos
// a second, and it is not in it. A constant outflow cannot beat a growing one.
boats[0].boat.bail(2);
console.log('she can live in', livesIn(boats[0].boat.freeboard).toFixed(2), 'm');
console.log('and this sea is', H, 'm — she has', boats[0].boat.swampsIn().toFixed(0), 's');

let clock = 0;
let rolled = false;
let helped = false;
game.onUpdate((t) => {
  clock += t.delta;
  // ONE BREAKER at twenty-five seconds, and it does four different things.
  if (!rolled && clock >= 25) {
    rolled = true;
    for (const b of boats) b.boat.meet(1.5, 9);
  }
  // Hands on the gunwale for the one it is worth righting.
  if (!helped && clock >= 31) {
    helped = true;
    boats[2].boat.right();
  }
  for (const b of boats) {
    b.boat.meet(H, LEN);
    b.boat.update(t.delta);
    b.boat.object.position.set(0, b.boat.object.position.y, b.z);
  }
  // SQUARE OFF THE BEAM and high enough to see INTO them. Half a metre of
  // freeboard is the entire subject, and what is standing inside her is the
  // read — from wave height a nine-metre sea simply swallows them.
  game.camera.position.set(-17.5, 9.5, 11);
  game.camera.lookAt(-0.5, 0, -3);
});
game.start();`,
  },

  {
    id: 'gear',
    title: 'Working gear & girting',
    group: 'Worldbuilding',
    code: `// A WORKING LOAD ACTS AT THE END OF A WIRE, AND IT CAN PULL YOU OVER.
// Every other force in the boat arc acts through her centreline. This one
// does not: the further outboard and the higher it acts, the more of your own
// engine goes into laying her over instead of moving her.
//
// The same tug twice. Same gear, same load, the same snatch from a sheering
// tow in the same second — and a lever pulled on one of them.
import { createGear, createHold, createDeckedShip, createOcean, createSky,
         createLightingRig, PALETTES } from 'scena3d';
import { Game } from 'gama3d';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
// Bigger than the default camera's thousand-unit far plane.
game.camera.far = 2000;
game.camera.updateProjectionMatrix();
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);

const sea = createOcean({ amplitude: 0.3, wavelength: 34, size: 1200, segments: 180 });
scene.add(sea.mesh);

const rig = (z, releases) => {
  const ship = createDeckedShip({ era: 'carrack', seed: 6, palette });
  ship.float((x, sz) => sea.heightAt(x, sz));
  ship.object.position.set(0, 0, z);
  scene.add(ship.object);

  // Loaded down to her marks — which is also loaded down to a metacentric
  // height she can be pulled over from. An empty boat cannot be girted, and
  // an empty boat is not working.
  const hold = createHold({ kind: 'carrack', draft: ship.draft, seed: 6, palette });
  ship.object.add(hold.object);
  for (const c of hold.compartments) {
    if (!c.liquid && c.name !== 'bilge') hold.load(c.name, c.capacity);
  }

  const gear = createGear({
    kind: 'tow', beam: ship.beam, length: ship.length,
    freeboard: ship.freeboard, shot: true, seed: 6, palette,
  });
  // ON HER DECK. y = 0 in a hull is her waterline, and left there the hook is
  // a freeboard down inside her and the wire runs along the sea bed.
  const deck = ship.decks
    .filter((d) => d.name !== 'hold')
    .reduce((a, c) => (c.length > a.length ? c : a));
  gear.object.position.y = deck.y;
  ship.object.add(gear.object);
  return { ship, hold, gear, releases, over: false, pastFor: 0, z };
};
const tugs = [rig(0, true), rig(40, false)];

// The gear runs at six times life; the sea and every heel is at one to one.
let clock = 0;
game.onUpdate((t) => {
  const was = clock;
  clock += t.delta;
  for (const b of tugs) {
    if (!b.over) {
      b.gear.setWay(4.2);
      // The wire comes round: fourteen seconds from dead astern to right
      // abeam, which is about how long a sheer takes.
      b.gear.setAngle((Math.min(1, clock / 14) * Math.PI) / 2);
      // THREE TENTHS OF A SECOND to get to the release, and that is the only
      // difference between these two hulls.
      if (b.releases && was < 16.3 && clock >= 16.3) b.gear.slip();
      b.gear.update(t.delta * 6);
      // A hundred and twenty tonnes — three times what she can pull. Applied
      // on the same line it is read on: left to be decayed by \`update\` first,
      // how much survives depends on the frame time, and an event whose
      // outcome is a function of the frame rate is not an event.
      if (clock >= 16 && clock < 17.4 && b.gear.out > 0.5) b.gear.snatch(120);
      b.hold.heel('gear', b.gear.moment);
      // Past her angle of vanishing stability she is not coming back — but
      // going over takes TIME. Latched the instant \`capsized\` goes true, both
      // tugs are gone within a frame and the release is pulled on a boat that
      // is already lost.
      b.pastFor = b.hold.capsized ? b.pastFor + t.delta : 0;
      if (b.pastFor > 0.8) b.over = true;
    } else {
      b.gear.update(t.delta * 6);   // her wire is still on her
    }
    b.hold.update(t.delta);
    b.ship.update(t.delta, { speed: 0, loading: b.hold.loading });
    b.ship.object.position.set(0, b.ship.object.position.y, b.z);
  }
  // HIGH ENOUGH TO SEE HER DECK: from near the water a hull leaning forty-five
  // degrees away and one sitting up straight are both a slab with a lip on it.
  game.camera.position.set(-88, 38, 46);
  game.camera.lookAt(0, 3, 14);
});
game.start();`,
  },

  {
    id: 'liner',
    title: 'The liner',
    group: 'Worldbuilding',
    code: `// THE WHOLE BOAT ARC IN ONE HULL — and a coaster beside her in the same sea.
// A hold that trims and sinks her, a steam plant that drives her, and fins
// that take her roll out ONLY WHILE SHE IS GOING SOMEWHERE: a fin is a wing,
// so a stopped ship has no lift and rolls exactly as badly as one with none
// fitted, while still paying the drag. The posts are people standing still,
// coloured by how hard it is to stand where each of them is.
import { createDeckedShip, createHold, createSteamPlant, createStabilisers,
         createOcean, createSky, createLightingRig, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, MeshStandardMaterial, Vector3 } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
// Bigger than the default camera's thousand-unit far plane.
game.camera.far = 3840;
game.camera.updateProjectionMatrix();
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);

// A swell about half her length. At a wavelength near her own she meets it
// bow and stern at the same phase and does not pitch at all.
const sea = createOcean({ amplitude: 1.7, wavelength: 104, size: 2400, segments: 200 });
scene.add(sea.mesh);

const ship = createDeckedShip({ era: 'liner', seed: 12, palette });
ship.float((x, z) => sea.heightAt(x, z));
scene.add(ship.object);

const hold = createHold({ kind: 'liner', draft: ship.draft, seed: 9, palette });
ship.object.add(hold.object);
hold.load('main', 3800); hold.load('fore', 1400); hold.load('aft', 1200);
for (const c of hold.compartments) if (c.liquid && c.name !== 'bilge') hold.pump(c.name, 1);

const plant = createSteamPlant({ kind: 'triple', funnelHeight: 26, seed: 7, palette });
const top = ship.decks.filter((d) => d.name !== 'hold').reduce((a, b) => (b.y > a.y ? b : a));
plant.object.position.set(0, top.y, top.z + top.length * 0.1);
ship.object.add(plant.object);
plant.setDraught(1); plant.setRegulator(1); plant.setLink(0.45);

const fins = createStabilisers({ kind: 'activeFin', beam: ship.beam, deployed: true });
ship.object.add(fins.object);

// A coaster in the same sea: she is the control, and she is why a liner is
// 180 metres long.
const small = createDeckedShip({ era: 'steamer', seed: 15, palette });
small.float((x, z) => sea.heightAt(x, z));
small.object.position.set(-96, 0, -14);
scene.add(small.object);

const posts = [];
const stand = (on, x, z, y, size) => {
  const mesh = new Mesh(new BoxGeometry(size, size * 2.9, size),
    new MeshStandardMaterial({ color: 0x53b06a, flatShading: true }));
  mesh.position.set(x, y + size * 1.45, z);
  on.object.add(mesh);
  posts.push({ mesh, at: new Vector3(x, y, z), on });
};
const prom = ship.decks.reduce((lo, d) => (d.name === 'promenade' ? d : lo), ship.decks[0]);
for (const z of [0.44, 0.26, 0, -0.26, -0.44]) stand(ship, 0, ship.length * z, prom.y, 2.6);
stand(ship, -ship.beam * 0.46, 6, top.y, 2.6);
stand(ship, ship.beam * 0.46, 6, top.y, 2.6);
const sd = small.decks.filter((d) => d.name !== 'hold').reduce((a, b) => (b.length > a.length ? b : a));
for (const z of [0.4, 0, -0.4]) stand(small, 0, small.length * z, sd.y, 2.2);

game.onUpdate((t) => {
  sea.update(t.delta);
  if (plant.bed < 0.85) plant.stoke();
  plant.update(t.delta);
  hold.update(t.delta);
  fins.setWay(plant.way);          // she feeds her own stabilisers
  fins.update(t.delta);
  plant.setImmersion(hold.immersion);
  const at = [ship.object.position.x, ship.object.position.z];
  const sat = [small.object.position.x, small.object.position.z];
  ship.update(t.delta, {
    speed: Math.max(0, plant.way - fins.drag),   // comfort is not free
    drift: plant.walk, loading: hold.loading, damping: fins.damping,
  });
  small.update(t.delta, { speed: 3.4 });
  // Held on station: given way and left alone they are out of frame in
  // minutes and the comparison becomes a picture of empty sea.
  ship.object.position.x = at[0]; ship.object.position.z = at[1];
  small.object.position.x = sat[0]; small.object.position.z = sat[1];

  for (const p of posts) {
    const m = p.on.motionAt(p.at.x, p.at.z, p.at.y);
    const k = Math.max(0, Math.min(1, (m - 0.12) / 0.45));
    p.mesh.material.color.setRGB(0.16 + k * 0.8, 0.78 - k * 0.68, 0.3 - k * 0.22);
  }
  game.camera.position.set(-186, 44, 150);
  game.camera.lookAt(-38, 10, -6);
});
game.start();`,
  },

  {
    id: 'trim',
    title: 'Trim & the free surface',
    group: 'Worldbuilding',
    code: `// A HOLD FULL OF WATER IS SAFER THAN A HOLD HALF FULL OF IT. Four identical
// steamers: one light, one with her cargo forward, one with hers stowed off
// the centreline, and one loaded correctly with her ballast HALF pumped. The
// last is the one with no stability left, because a free surface costs her by
// the width of the surface cubed and not by how much liquid is in it.
import { createHold, createDeckedShip, createOcean, createSky,
         createLightingRig, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, MeshStandardMaterial } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
// Bigger than the default camera's thousand-unit far plane.
game.camera.far = 2560;
game.camera.updateProjectionMatrix();
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);

// A SLIGHT swell: the read is the steady lean a load puts on her, and a metre
// of sea puts the same amount on and takes it off twice a minute.
const sea = createOcean({ amplitude: 0.12, wavelength: 40, size: 1600, segments: 170 });
scene.add(sea.mesh);

const SET = [
  { label: 'light', colour: 0x7a8b99, cargo: {} },
  { label: 'by the head', colour: 0xd8483a, cargo: { fore: 300, main: 160 } },
  { label: 'listed', colour: 0xe0a531, cargo: { main: 380, aft: 180 }, off: 0.34 },
  { label: 'slack tanks', colour: 0x53b06a, cargo: { fore: 220, main: 300, aft: 180 } },
];

const fleet = SET.map((it, i) => {
  const ship = createDeckedShip({ era: 'steamer', seed: i + 21, palette });
  ship.float((x, z) => sea.heightAt(x, z));
  ship.object.position.set(-108 + i * 72, 0, -34);
  scene.add(ship.object);

  // HER OWN DRAFT, not the hold's load line: sinkage is measured from the
  // depth the hull was drawn to, or she floats clear of the sea.
  const hold = createHold({ kind: 'steamer', draft: ship.draft, seed: i + 5, palette });
  ship.object.add(hold.object);
  // THE SIDE IS PART OF THE STOWAGE. Move the cargo's mesh and leave its
  // tonnage on the centreline and she reads as laden with a list of 0.00°.
  for (const [name, tonnes] of Object.entries(it.cargo)) {
    hold.load(name, tonnes, it.off ?? 0);
  }
  if (it.label === 'slack tanks') hold.pump('ballast', 0.5);

  const flag = new Mesh(new BoxGeometry(0.6, 9, 0.6),
    new MeshStandardMaterial({ color: it.colour, emissive: it.colour,
      emissiveIntensity: 0.35, flatShading: true }));
  const deck = ship.decks.filter((d) => d.name !== 'hold')
    .reduce((a, b) => (b.y > a.y ? b : a));
  flag.position.set(0, deck.y + 5, 22);
  ship.object.add(flag);
  return { hold, ship, x0: ship.object.position.x, z0: ship.object.position.z };
});

game.onUpdate((t) => {
  sea.update(t.delta);
  for (const f of fleet) {
    f.hold.update(t.delta);
    // ONE OBJECT WIDE, and it is not a force: \`loading\` is a state of the
    // vessel. A drift stops when the tide slackens; a list does not.
    f.ship.update(t.delta, { loading: f.hold.loading });
    f.ship.object.position.x = f.x0;
    f.ship.object.position.z = f.z0;
  }
  game.camera.position.set(-142, 21, 92);
  game.camera.lookAt(6, 2, -34);
});
game.start();`,
  },

  {
    id: 'steam',
    title: 'Steam & cut-off',
    group: 'Worldbuilding',
    code: `// FULL AHEAD IS NOT HER FASTEST. Two identical triples: one in full gear,
// one notched up to a cut-off she can hold. The regulator spends a store the
// fire fills a hundred times slower than the engine empties it, so the ship
// that opened her up leads for a while and is then overhauled — and her gauge
// tells you why long before the distance does.
import { createSteamPlant, createDeckedShip, createOcean, createSky,
         createLightingRig, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, MeshStandardMaterial } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
// Bigger than the default camera's thousand-unit far plane.
game.camera.far = 2000;
game.camera.updateProjectionMatrix();
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);

const sea = createOcean({ amplitude: 0.24, wavelength: 32, size: 1200, segments: 170 });
scene.add(sea.mesh);

const SET = [
  { kind: 'triple', colour: 0xd8483a, link: 1 },        // full gear
  { kind: 'triple', colour: 0x53b06a, link: null },     // linkFor(3600)
  { kind: 'compound', colour: 0xe0a531, banked: true }, // simmering
  { kind: 'sidelever', colour: 0x7a8b99, cold: true },  // fires lit 20 min ago
];

const fleet = SET.map((it, i) => {
  const ship = createDeckedShip({ era: 'steamer', seed: i + 11, palette });
  ship.float((x, z) => sea.heightAt(x, z));
  ship.object.position.set(-72 + i * 48, 0, -40);
  scene.add(ship.object);

  const plant = createSteamPlant({
    kind: it.kind, pressure: it.cold ? 0 : undefined,
    funnelHeight: 15, seed: i + 3, palette,
  });
  // On deck, where you can see it — and a PADDLER low, or her wheels spin in
  // clear air a storey above the sea at exactly the right revolutions.
  const open = ship.decks.filter((d) => d.name !== 'hold');
  const deck = it.kind === 'sidelever'
    ? open.reduce((a, b) => (b.y < a.y ? b : a))
    : open.reduce((a, b) => (b.length > a.length ? b : a));
  plant.object.position.set(0, deck.y, deck.z + deck.length * 0.3);
  ship.object.add(plant.object);

  if (it.cold) { plant.setDraught(1); plant.settle(20 * 60); }
  else if (it.banked) { plant.bank(); plant.settle(12 * 3600); }
  else {
    plant.setDraught(1);
    plant.setRegulator(1);
    plant.setLink(it.link ?? plant.linkFor(3600));
  }

  const flag = new Mesh(new BoxGeometry(0.5, 7, 0.5),
    new MeshStandardMaterial({ color: it.colour, emissive: it.colour,
      emissiveIntensity: 0.3, flatShading: true }));
  flag.position.set(0, deck.y + 4.5, deck.z - deck.length * 0.34);
  ship.object.add(flag);
  return { plant, ship, x0: ship.object.position.x, z0: ship.object.position.z };
});

game.onUpdate((t) => {
  sea.update(t.delta);
  for (const f of fleet) {
    // Somebody has to keep the fires in — and on a launch this does nothing,
    // which is the whole era axis in one call.
    if (f.plant.bed < 0.85) f.plant.stoke();
    f.plant.update(t.delta);
    // Two numbers wide, and neither is a throttle.
    f.ship.update(t.delta, { speed: f.plant.way, drift: f.plant.walk });
    // …then held on station, so four ships making four different speeds can
    // share one frame instead of steaming over the horizon in ten minutes.
    f.ship.object.position.x = f.x0;
    f.ship.object.position.z = f.z0;
  }
  game.camera.position.set(-92, 26, 40);
  game.camera.lookAt(6, 12, -34);
});
game.start();`,
  },

  {
    id: 'surge',
    title: 'Storm surge',
    group: 'Worldbuilding',
    code: `// The weather controller's storminess is wired into the ocean's storm, so a
// storm whips the sea up: taller, choppier, foamier, darker waves AND a surge
// that raises the sea level (heightAt rises with it, lifting the boat). It
// cycles calm to storm. The trees share the wind, so they thrash in it too.
import { createOcean, createWeather, createWindField, createTerrain,
         createLightingRig, createSurface, createTree, createRock,
         scatter, aboveWater, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Color, Group, Mesh, BoxGeometry, CylinderGeometry } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0xaecbe0);
const rig = createLightingRig('golden-hour'); scene.add(rig.group);

const SEA = 3.2, ISLE = 30;
const terrain = createTerrain({ seed: 4, size: ISLE * 2, amplitude: 3.4, noiseScale: 22, waterLevel: SEA, palette });
scene.add(terrain.mesh);
const shore = (x, z) => (Math.abs(x) < ISLE && Math.abs(z) < ISLE ? terrain.heightAt(x, z) : SEA - 6);

// One wind, one weather controller — storminess is the seam to the sea.
const wind = createWindField({ direction: 35, strength: 0.4 });
const weather = createWeather(scene, { wind, sun: rig.sun, ambient: rig.ambient, initial: 'clear' });
const ocean = createOcean({ level: SEA, size: 320, amplitude: 0.55, choppiness: 0.8,
  wavelength: 24, wind, shore, surge: 1.6, storm: () => weather.storminess });
scene.add(ocean.mesh);

const island = scatter({
  seed: 3, area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
  surface: terrain.heightAt, density: 0.04, minSpacing: 2.5,
  items: [{ create: (r) => createTree({ seed: r.int(1, 1e9), palette }), weight: 3, variants: 5 },
          { create: (r) => createRock({ seed: r.int(1, 1e9), palette }) }],
  mask: aboveWater(terrain, { level: SEA }, 0.6),
});
scene.add(island.group);

const boat = new Group();
const w = createSurface('plank', { color: palette.wood, seed: 2 });
boat.add(new Mesh(new BoxGeometry(1.6, 0.55, 3.6), w));
const mast = new Mesh(new CylinderGeometry(0.05, 0.08, 3.2, 6), createSurface('wood', { color: palette.woodDark }));
mast.position.set(0, 1.7, -0.2); boat.add(mast);
scene.add(boat);
const bx = 18, bz = 26;

let flip = 0;
setInterval(() => { flip ^= 1; weather.set(flip ? 'storm' : 'clear', { fade: 5 }); }, 7000);

game.onUpdate((t) => {
  boat.position.set(bx, ocean.heightAt(bx, bz), bz);
  boat.rotation.z = (ocean.heightAt(bx - 1, bz) - ocean.heightAt(bx + 1, bz)) * 0.35;
  game.camera.position.set(Math.sin(t.elapsed * 0.08) * 12, SEA + 6.5, 60);
  game.camera.lookAt(0, SEA + 0.5, 20);
});
game.start();`,
  },

  {
    id: 'underwater',
    title: 'God rays, caustics & bubbles',
    group: 'Worldbuilding',
    code: `// A reef: god rays fall as crossed additive shafts, caustics dance on the
// seabed, bubble columns rise from vents, and a colour grade fades everything
// into the deep (red absorbed first) with distance & depth. Fish drift through.
import { createGodRays, createCaustics, createBubbles, createWaterGrade,
         createFlock, createRock, createSurface, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Color, Fog, Group, Mesh, PlaneGeometry, DirectionalLight, AmbientLight } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0x0e3a49);
scene.fog = new Fog(0x0e3a49, 8, 46);
scene.add(new DirectionalLight(0xbfe8f0, 1.1), new AmbientLight(0x2c6675, 0.9));

const SEABED = -6;
const seabed = new Group();
const sand = new Mesh(new PlaneGeometry(120, 120), createSurface('sand', { color: 0x7d8a76 }));
sand.rotation.x = -Math.PI / 2; sand.position.y = SEABED; seabed.add(sand);
for (let i = 0; i < 12; i++) {
  const rock = createRock({ seed: 30 + i, palette });
  const a = (i / 12) * Math.PI * 2 + i * 0.7, r = 6 + (i % 4) * 4;
  rock.object.position.set(Math.cos(a) * r, SEABED, Math.sin(a) * r);
  rock.object.scale.setScalar(1.2 + (i % 3) * 0.5);
  seabed.add(rock.object);
}
scene.add(seabed);

// Caustics + colour grade on the seabed; god rays and bubbles above it.
createCaustics({ intensity: 0.55, scale: 0.42, speed: 0.7 }).apply(seabed);
const grade = createWaterGrade({ surface: 6, color: 0x0e3a49, density: 0.03, depthDensity: 0.05, redShift: 0.7 });
grade.apply(seabed);
const rays = createGodRays({ count: 24, height: 26, width: 1.6, spread: 20, tilt: 22, opacity: 0.16, seed: 4 });
rays.object.position.y = 6; scene.add(rays.object);
scene.add(createBubbles({ count: 300, columns: 7, area: 14, floor: SEABED, rise: 11, seed: 6 }).object);

const fish = createFlock({ type: 'fish', count: 90, center: [0, -1.5, 0], bounds: [14, 3, 14], seed: 9 });
grade.apply(fish.object);
scene.add(fish.object);

game.onUpdate((t) => {
  const a = t.elapsed * 0.06;
  game.camera.position.set(Math.sin(a) * 20, 1.5, Math.cos(a) * 20);
  game.camera.lookAt(0, -2, 0);
});
game.start();`,
  },

  {
    id: 'flock',
    title: 'Flocks & schools',
    group: 'Worldbuilding',
    code: `// A boid flock — separation, alignment, cohesion + wander — drawn as one
// InstancedMesh whose wings beat in the vertex shader from a per-instance
// phase (no two flap alike). Pass 'circle' and the birds wheel around a
// point. positions[] is live, so gameplay can read the flock.
import { createFlock, createTower, createTree, createSurface,
         createLightingRig, applyFog, scatter, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry, Color } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0xaecbe0);
scene.add(createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);
const ground = new Mesh(new PlaneGeometry(240, 240), createSurface('dirt', { color: palette.grassLow }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);

scene.add(createTower({ seed: 3, height: 9, palette }).object);
const wood = scatter({
  seed: 4, area: { min: { x: -50, z: -50 }, max: { x: 50, z: 50 } },
  density: 0.03, minSpacing: 3,
  items: [{ create: (r) => createTree({ seed: r.int(1, 1e9), palette }), variants: 5 }],
  mask: (x, z) => Math.hypot(x, z) > 9,
});
scene.add(wood.group);

// Crows wheeling around the watchtower — try type:'fish' for a school.
const flock = createFlock({ type: 'birds', count: 70, center: [0, 14, 0], bounds: [20, 6, 20], circle: 15, seed: 7 });
scene.add(flock.object);

game.onUpdate((t) => {
  const a = t.elapsed * 0.04;
  game.camera.position.set(Math.sin(a) * 26, 9, Math.cos(a) * 26);
  game.camera.lookAt(0, 12, 0);
});
game.start();`,
  },

  {
    id: 'herd',
    title: 'Herds & grazing',
    group: 'Worldbuilding',
    code: `// Ground-dwelling ambient life. A boid sim steers the herd across the
// terrain (cohesion high, so they clump), feet clamped to terrain.heightAt
// every frame. They graze in place then walk on; legs stride and the head
// dips in the vertex shader, scaled by each animal's real speed.
import { createHerd, createTerrain, createTree,
         createLightingRig, applyFog, scatter, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Color, Vector3 } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0xbcd3e6);
scene.add(createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);

const terrain = createTerrain({ seed: 6, size: 120, resolution: 110,
  amplitude: 4, noiseScale: 34, valleyFlatness: 0.7, palette });
scene.add(terrain.mesh);

const wood = scatter({
  seed: 8, area: { min: { x: -56, z: -56 }, max: { x: 56, z: 56 } },
  density: 0.012, minSpacing: 4,
  items: [{ create: (r) => createTree({ seed: r.int(1, 1e9), palette }), variants: 5 }],
  mask: (x, z) => Math.hypot(x, z) > 22,
});
for (const c of wood.group.children) c.position.y = terrain.heightAt(c.position.x, c.position.z);
scene.add(wood.group);

// A herd of deer grazing — try type:'sheep' for a tighter, woollier flock.
const herd = createHerd({ type: 'deer', count: 14, center: [0, 0], radius: 18,
  ground: terrain.heightAt, seed: 3 });
scene.add(herd.object);

const focus = new Vector3();
game.onUpdate((t) => {
  focus.set(0, 0, 0);
  for (const p of herd.positions) focus.add(p);
  focus.multiplyScalar(1 / herd.count);
  const a = t.elapsed * 0.03;
  game.camera.position.set(focus.x + Math.sin(a) * 22, focus.y + 9, focus.z + Math.cos(a) * 22);
  game.camera.lookAt(focus.x, focus.y + 0.5, focus.z);
});
game.start();`,
  },

  {
    id: 'trees',
    title: 'Tree species',
    group: 'Worldbuilding',
    code: `// Thirteen seeded species from one createTree — pine, oak, cypress, birch,
// cedar, maple, sakura, palm, willow, plus the giants sequoia, banyan, baobab,
// acacia. treeBiome() picks a weighted mix by biome; blossom drifts down.
// (Try treeBiome('tropical') / 'savanna' / 'redwood' for the giants.)
import { createTree, createPrecipitation, createWindField, createLightingRig,
         createSurface, applyFog, applyWind, scatter, treeBiome, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Color, Mesh, PlaneGeometry } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0xbcd6e6);
scene.add(createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);
const ground = new Mesh(new PlaneGeometry(200, 200), createSurface('dirt', { color: palette.grassLow }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);

const wind = createWindField({ direction: 40, strength: 0.32, gust: 0.6 });

// A temperate wood + a few blossom and palm for variety, all bound to one wind.
const wood = scatter({
  seed: 5, area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
  density: 0.03, minSpacing: 3,
  items: [
    ...treeBiome('temperate', { palette }),
    { create: (r) => createTree({ species: 'sakura', seed: r.int(1, 1e9), palette }), weight: 1 },
    { create: (r) => createTree({ species: 'willow', seed: r.int(1, 1e9), palette }), weight: 1 },
  ],
});
scene.add(wood.group);
applyWind(wood.group, { field: wind, height: 5, stiffness: 2, anchor: 0.8 });

// Blossom drifting through the wood (try type:'petal', color:0xd98e3a for leaf-fall).
scene.add(createPrecipitation({ type: 'petal', wind, count: 900 }).object);

game.onUpdate((t) => {
  const a = t.elapsed * 0.05;
  game.camera.position.set(Math.sin(a) * 44, 14, Math.cos(a) * 26);
  game.camera.lookAt(0, 4, 0);
});
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
    id: 'giants',
    title: 'Giant forest impostors',
    group: 'Worldbuilding',
    code: `// treeLOD pairs a full createTree with a billboard createImpostor — a
// single camera-facing quad whose species silhouette is carved in the shader,
// no texture. A dense stand of giants keeps full geometry up close and swaps to
// billboards past the swap distance. The camera flies out and back to trip it.
import { createTerrain, createLightingRig, applyFog, createWindField,
         applyWind, scatter, treeLOD, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Color } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0xaecadf);
scene.add(createLightingRig('golden-hour').group);
const terrain = createTerrain({ seed: 7, size: 300, amplitude: 8, valleyFlatness: 0.6, palette });
scene.add(terrain.mesh);
applyFog(scene, 'haze', palette);

const wind = createWindField({ direction: 40, strength: 0.25, gust: 0.5 });
const forest = scatter({
  seed: 9,
  area: { min: { x: -140, z: -140 }, max: { x: 140, z: 140 } },
  surface: terrain.heightAt, density: 0.02, minSpacing: 6,
  items: [
    treeLOD('sequoia', { palette, weight: 2 }),   // towering redwoods
    treeLOD('pine', { palette, weight: 4 }),
    treeLOD('cypress', { palette, weight: 2 }),
  ],
  lod: { distance: 90, tileSize: 28 },
});
scene.add(forest.group);
applyWind(forest.group, { field: wind, height: 8, stiffness: 2.4, anchor: 1 });

game.onUpdate((t) => {
  const R = 130 + Math.sin(t.elapsed * 0.12) * 95;
  const a = t.elapsed * 0.07;
  game.camera.position.set(Math.cos(a) * R, 26, Math.sin(a) * R);
  game.camera.lookAt(0, 12, 0);
  forest.update(game.camera);            // drive the billboard swap
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
// bytes: createSurface patches a MeshStandardMaterial with triplanar noise —
// 32 presets from stone and sand to brick, snow-capped rock and glowing lava,
// all generated in the shader. No textures fetched, every prop unique, each
// preset carries its own colour, and full PBR lighting, fog and shadows
// survive because it stays a standard material.
import { createSurface, SURFACE_PRESETS, createHouse, createWell, createRock,
         createSky, createLightingRig, applyFog, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, SphereGeometry, PlaneGeometry, MeshStandardMaterial,
         IcosahedronGeometry, ConeGeometry } from 'three';

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

// Tier-2 tiling at architectural scale — a brick wall between ashlar pillars
// on a cobblestone floor. The grid is world-space, so the boxes align into
// continuous masonry instead of obvious repeats.
const wall = new Mesh(new BoxGeometry(6, 2.6, 0.4), createSurface('brick', { seed: 2 }));
wall.position.set(0, 1.3, -12);
scene.add(wall);
[-3.1, 3.1].forEach((dx) => {
  const pillar = new Mesh(new BoxGeometry(0.8, 3.2, 0.8), createSurface('ashlar', { seed: 4 }));
  pillar.position.set(dx, 1.6, -12);
  scene.add(pillar);
});
const cobbles = new Mesh(new BoxGeometry(8, 0.3, 4), createSurface('cobblestone', { seed: 6 }));
cobbles.position.set(0, 0.15, -9.8);
scene.add(cobbles);

// Tier-3 cap & glow: a snow-capped crag, a mossy boulder, a lava chunk with
// molten cracks and a glowing crystal. Snow settles on the up-faces; the glow
// is additive, so it reads day or night.
const snowy = new Mesh(new IcosahedronGeometry(1.1, 1), createSurface('snow', { seed: 3 }));
snowy.position.set(-6, 1, 8);
const mossy = new Mesh(new IcosahedronGeometry(1.1, 1), createSurface('moss', { seed: 8 }));
mossy.position.set(-2.5, 1, 8);
const lavaRock = new Mesh(new IcosahedronGeometry(1.1, 1), createSurface('lava', { seed: 5 }));
lavaRock.position.set(1, 1, 8);
const crystal = new Mesh(new ConeGeometry(0.5, 1.8, 5), createSurface('crystal', { seed: 9 }));
crystal.position.set(4.2, 0.9, 8);
scene.add(snowy, mossy, lavaRock, crystal);

${orbit(20, 11, 0.05)}
game.start();`,
  },

  {
    id: 'modern',
    title: 'Modern materials & glass',
    group: 'Props',
    code: `// The Tier-4 surfaces: fair-faced concrete with shutter joints, marble,
// terrazzo, brushed steel, chrome, powder-coat, corten, teak, porcelain,
// mosaic with accent chips, chevron parquet and patterned cement tiles —
// plus createGlass: fresnel panes with a built-in sky reflection that the
// day cycle ignites warm at dusk. Change timeOfDay to 0.95 for night.
import { createSurface, createGlass, createSky, createLightingRig, applyFog,
         createDayCycle, createRailing, createGate, createPergola, createPlanter,
         PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, Group, BoxGeometry, PlaneGeometry } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
const sky = createSky({ palette });
const rig = createLightingRig('day');
scene.add(sky.mesh, rig.group);
applyFog(scene, 'clear', palette);

const ground = new Mesh(new PlaneGeometry(90, 60), createSurface('concrete'));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Wall panels — one per machined kind.
const walls = ['concrete', 'paint', 'marble', 'steel', 'chrome',
               'paintedMetal', 'corten', 'teak', 'porcelain', 'mosaic'];
walls.forEach((kind, i) => {
  const panel = new Mesh(new BoxGeometry(2.6, 3.2, 0.3),
    createSurface(kind, { seed: 10 + i }));
  panel.position.set(-14.85 + i * 3.3, 1.6, -6);
  scene.add(panel);
});

// Floor slabs — the pattern kinds laid flat.
['marble', 'terrazzo', 'parquet', 'patternedTile', 'mosaic'].forEach((kind, i) => {
  const slab = new Mesh(new BoxGeometry(4.4, 0.12, 4.4),
    createSurface(kind, { seed: 30 + i }));
  slab.position.set(-9.6 + i * 4.8, 0.06, 0.5);
  scene.add(slab);
});

// A glass pavilion: clear, bronze and frosted panes that glow at night.
const pavilion = new Group();
const frame = createSurface('paintedMetal', { color: 0x2c3238 });
[createGlass({ nightGlow: true }),
 createGlass({ tint: 0xc8a878, nightGlow: true }),
 createGlass({ frosted: true, nightGlow: true })].forEach((glass, i) => {
  const pane = new Mesh(new BoxGeometry(2.2, 2.6, 0.05), glass);
  pane.position.set(-2.6 + i * 2.6, 1.5, 0);
  pavilion.add(pane);
  [-1.15, 1.15].forEach((dx) => {
    const post = new Mesh(new BoxGeometry(0.12, 2.8, 0.12), frame);
    post.position.set(-2.6 + i * 2.6 + dx, 1.4, 0);
    pavilion.add(post);
  });
});
pavilion.position.set(1.5, 0, 5.5);
scene.add(pavilion);

// The component strip: four railing styles, a gate that swings itself,
// a teak pergola flanked by corten planters.
['bars', 'cable', 'glass', 'panel'].forEach((style, i) => {
  const railing = createRailing({ style, length: 3.4, seed: 40 + i });
  railing.object.position.set(-12.5 + i * 3.8, 0, 9.5);
  scene.add(railing.object);
});
const gate = createGate({ style: 'slat', width: 3, seed: 44, palette });
gate.object.position.set(6.5, 0, 9.8);
scene.add(gate.object);
const pergola = createPergola({ seed: 48 });
pergola.object.position.set(9.5, 0, 1.5);
scene.add(pergola.object);
[-1.4, 1.4].forEach((dx, i) => {
  const planter = createPlanter({ seed: 50 + i, palette });
  planter.object.position.set(9.5 + dx, 0, 1.5);
  planter.object.rotation.y = Math.PI / 2;
  scene.add(planter.object);
});

const cycle = createDayCycle({ sky, rig, scene, lamps: [pavilion, gate.object], palette,
  dayLength: 40, timeOfDay: 0.42 });
game.onUpdate((t) => {
  cycle.update(t.delta);
  gate.setOpen(0.5 + 0.5 * Math.sin(t.elapsed * 0.4));
  game.camera.position.set(Math.sin(t.elapsed * 0.06) * 12, 5.2, 16.5);
  game.camera.lookAt(-1, 1.2, 0);
});
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
    id: 'skyline',
    title: 'Downtown skyline',
    group: 'Settlement',
    code: `// createHighrise: a multi-storey tower whose cost does NOT scale
// with height — windows, frames and floor bands are InstancedMeshes, so
// 26 floors draw like 6. Occupied windows (a seeded occupancy mask) are
// nightGlow glass: set timeOfDay to 0.95 and the skyline lights itself.
import { createHighrise, createSky, createSurface, createLightingRig,
         applyFog, createDayCycle, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry } from 'three';

const palette = PALETTES.urban;
const game = new Game();
const scene = game.world.scene;
const sky = createSky({ palette });
const rig = createLightingRig('day');
scene.add(sky.mesh, rig.group);
applyFog(scene, 'haze', palette);
const plaza = new Mesh(new PlaneGeometry(300, 300), createSurface('concrete'));
plaza.rotation.x = -Math.PI / 2;
scene.add(plaza);

const towers = [
  { seed: 11, floors: 22, x: 0, z: -30 },
  { seed: 23, floors: 15, x: -26, z: -18 },
  { seed: 31, floors: 10, x: 24, z: -16 },
  { seed: 44, floors: 17, x: -12, z: -48 },
  { seed: 57, floors: 8, x: 22, z: -42 },
].map(({ seed, floors, x, z }) => {
  const tower = createHighrise({ seed, floors, palette });
  tower.object.position.set(x, 0, z);
  scene.add(tower.object);
  return tower;
});
console.log('windows:', towers.reduce((a, t) => a + t.windowCount, 0),
  '· lit tonight:', towers.reduce((a, t) => a + t.litCount, 0));

const cycle = createDayCycle({ sky, rig, scene,
  lamps: towers.map((t) => t.object),
  palette, dayLength: 60, timeOfDay: 0.45 });
game.onUpdate((t) => {
  cycle.update(t.delta);
  game.camera.position.set(Math.sin(t.elapsed * 0.04) * 60, 24, 75);
  game.camera.lookAt(0, 18, -28);
});
game.start();`,
  },

  {
    id: 'bungalow',
    title: 'Modern bungalows',
    group: 'Settlement',
    code: `// createBungalow masses a seeded modern villa from the Tier-4
// materials: a cantilevered concrete upper box over a rendered ground
// floor, floor-to-ceiling glazing, teak or stone accents, a balcony
// railing, entry canopy and corten planter. All glazing is nightGlow —
// set timeOfDay to 0.95 and the street lights itself window by window.
import { createBungalow, createGate, createTree, createSky, createSurface,
         createLightingRig, applyFog, createDayCycle, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry } from 'three';

const palette = PALETTES.urban;
const game = new Game();
const scene = game.world.scene;
const sky = createSky({ palette });
const rig = createLightingRig('day');
scene.add(sky.mesh, rig.group);
applyFog(scene, 'haze', palette);
const court = new Mesh(new PlaneGeometry(140, 140), createSurface('concrete'));
court.rotation.x = -Math.PI / 2;
scene.add(court);

const villas = [
  { seed: 11, x: -16, z: -14, ry: 0.25 },
  { seed: 23, x: 4, z: -18, ry: -0.1 },
  { seed: 37, x: 20, z: -6, ry: -0.7 },
  { seed: 45, x: -22, z: 6, ry: 0.9 },
].map(({ seed, x, z, ry }) => {
  const villa = createBungalow({ seed, palette });
  villa.object.position.set(x, 0, z);
  villa.object.rotation.y = ry;
  scene.add(villa.object);
  return villa;
});

const gate = createGate({ style: 'slat', width: 3, seed: 60, palette });
gate.object.position.set(-12, 0, -6);
gate.object.rotation.y = 0.25;
scene.add(gate.object);

[[-4, -8], [14, 2], [-14, 12]].forEach(([x, z], i) => {
  const tree = createTree({ species: 'maple', seed: 70 + i, height: 5.2, palette });
  tree.object.position.set(x, 0, z);
  scene.add(tree.object);
});

const cycle = createDayCycle({ sky, rig, scene,
  lamps: [...villas.map((v) => v.object), gate.object],
  palette, dayLength: 70, timeOfDay: 0.42 });
game.onUpdate((t) => {
  cycle.update(t.delta);
  gate.setOpen(0.5 + 0.5 * Math.sin(t.elapsed * 0.3));
  game.camera.position.set(Math.sin(t.elapsed * 0.05) * 26, 7.5, 26);
  game.camera.lookAt(-2, 2.2, -6);
});
game.start();`,
  },

  {
    id: 'interior',
    title: 'A cottage interior',
    group: 'Settlement',
    code: `// createRoom takes the kit grid indoors — plastered walls over
// floorboards under a beamed ceiling, windows that know which way they
// face, and a burning hearth — while createInteriorLight pours dusty
// daylight shafts through the sun-facing windows, swinging east to west
// as the day cycles. furnishRoom then dresses it for a role and returns
// sit/sleep/work/hearth markers for agents. Try role = 'tavern',
// 'smithy', 'bakery', 'weaver', 'study' or 'barracks'.
import { createRoom, createInteriorLight, furnishRoom, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Color } from 'three';

const role = 'cottage';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.background = new Color(0x0a0d13);

const room = createRoom([
  '##H######',
  '#.......#',
  'W...~...W',
  '#.......#',
  '#.......#',
  '##WDW####',
], { seed: 11, palette });
scene.add(room.group);

const furnished = furnishRoom(room, { role, seed: 6, palette });
console.log(role, '· furniture:', furnished.props.length,
  '· markers:', Object.entries(furnished.markers)
    .map(([k, v]) => k + ':' + v.length).join(' '));

// A little day the demo drives: sun east at dawn, west at dusk.
const cycle = { sunElevation: 1, timeOfDay: 0.5 };
const light = createInteriorLight(room, { cycle, shaftStrength: 0.2 });

let day = 0.34;
game.onUpdate((t) => {
  day = (day + t.delta / 40) % 1;              // a 40-second day
  cycle.timeOfDay = day;
  cycle.sunElevation = Math.sin(2 * Math.PI * (day - 0.25));
  light.update();
  game.camera.position.set(0.6 + Math.sin(t.elapsed * 0.13) * 0.5, 1.9, 3.6);
  game.camera.lookAt(Math.sin(t.elapsed * 0.09) * 0.8, 1.15, -3.5);
});
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

const wind = applyWind(green.group, { strength: 0.3, height: 3, anchor: 0.3 });
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
  {
    id: 'cricket',
    title: 'The cricket ground',
    group: 'Props',
    code: `// A cricket field is mostly EMPTY, and the emptiness is measured: a
// 22-yard strip, stumps 28 inches tall, the popping crease four feet in
// front, a rope 62 metres out. The stripes are what make it read as a
// ground — a mown outfield has direction and scale; a green disc has
// neither. breakWicket() throws the bails and they fall where they land.
import { createCricketGround, createBat, createCricketBall, createTree,
         createSky, createLightingRig, applyFog, PALETTES,
         PITCH_LENGTH } from 'scena3d';
import { Game } from 'gama3d';
import { Vector3 } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'clear', palette);

const ground = createCricketGround({ seed: 3, boundary: 62 });
scene.add(ground.object);
for (let i = 0; i < 22; i++) {
  const a = (i / 22) * Math.PI * 2;
  const tree = createTree({ seed: 40 + i, species: i % 3 === 0 ? 'pine' : 'oak', palette });
  tree.object.position.set(Math.cos(a) * 74, 0, Math.sin(a) * 74);
  scene.add(tree.object);
}

const bat = createBat({ seed: 4 });
bat.object.position.copy(ground.strikerEnd).add(new Vector3(0.55, 0, 0));
bat.object.rotation.z = 0.3;
scene.add(bat.object);

// A delivery on a loop: released at the bowler's end, pitching short of a
// length, taking the top of off — and the bails go.
const ball = createCricketBall({ seed: 2 });
scene.add(ball.object);
const RELEASE = new Vector3(0, 2.1, PITCH_LENGTH / 2 - 0.4);
const vel = new Vector3();
let bounced = false;
let wait = 0;
const release = () => {
  ball.object.position.copy(RELEASE);
  const flight = (RELEASE.z + PITCH_LENGTH / 2 - 5) / 26;
  vel.set(0, (0.036 - RELEASE.y) / flight + 0.5 * 9.8 * flight, -26);
  bounced = false;
};
release();

game.onUpdate((t) => {
  ground.update(t.delta);
  if (wait > 0) {
    wait -= t.delta;
    if (wait <= 0) { ground.resetWicket(); release(); }
  } else {
    vel.y -= 9.8 * t.delta;
    ball.object.position.addScaledVector(vel, t.delta);
    if (!bounced && ball.object.position.y <= 0.036) {
      bounced = true;
      ball.object.position.y = 0.036;
      vel.y = Math.abs(vel.y) * 0.55;
      vel.z *= 0.86;
    }
    if (ball.object.position.z <= -PITCH_LENGTH / 2) {
      ground.breakWicket(-1);
      wait = 2.4;
    }
  }
  // Down the pitch from behind the bowler's arm, drifting square.
  const a = t.elapsed * 0.09;
  game.camera.position.set(Math.sin(a) * 4, 2.6, PITCH_LENGTH / 2 + 6);
  game.camera.lookAt(0, 0.7, -PITCH_LENGTH / 2 + 1);
});
game.start();`,
  },
  {
    id: 'wear',
    title: 'Wear: rain on everything',
    group: 'Worldbuilding',
    code: `// WET IS A STATE, NOT A KIND. Every one of the 46 surface presets can be
// rained on, and the catalogue does not grow by one entry to allow it.
// Front rank DRY, back rank SOAKED — the same six presets, so the pairs
// are directly comparable.
//
// Water fills from the BOTTOM: wetness is a level, not a multiply, so a
// light shower puts dark glossy water in the mortar joints and the
// hollows and leaves the faces dry. And it darkens by how POROUS the
// surface is — the cobbles and the sandstone go nearly black, the glaze
// and the marble barely move at all.
import { createSurface, createPrecipitation, createSky, createLightingRig,
         applyFog, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, PlaneGeometry } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'clear', palette);

const floor = new Mesh(new PlaneGeometry(60, 60),
  createSurface('concrete', { seed: 2, color: 0x8d8d88 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
scene.add(floor);

// No metals here: chrome and steel need an environment map to reflect,
// and a wet mirror with nothing to mirror is just a darker mirror.
const KINDS = ['cobblestone', 'plaster', 'brick', 'sandstone', 'glaze', 'marble'];
KINDS.forEach((kind, i) => {
  for (const wet of [0, 0.92]) {
    const slab = new Mesh(new BoxGeometry(1.5, 1.5, 0.45),
      createSurface(kind, { seed: 7 + i, wet }));
    slab.position.set((i - 2.5) * 1.85, 0.75, wet > 0 ? -3.2 : 2.4);
    scene.add(slab);
  }
});

// And the wiring: real rain, soaking the floor and drying it again.
// soak() is rain's counterpart to snow's accumulate(). Drying is a fifth
// of the wetting rate, because a street that goes dry the moment the rain
// stops reads as a bug rather than as weather.
const rain = createPrecipitation({ type: 'rain', count: 2600, area: [40, 26, 40] });
scene.add(rain.object);
rain.soak(floor, { max: 0.95, rate: 0.3, dry: 0.06 });

game.onUpdate((t) => {
  rain.setIntensity(t.elapsed % 24 < 12 ? 1 : 0);
  rain.update(t.delta);
  game.camera.position.set(Math.sin(t.elapsed * 0.1) * 3, 6.4, 10.5);
  game.camera.lookAt(0, 0.2, -0.4);
});
game.start();`,
  },
  {
    id: 'industrial',
    title: 'The industrial six',
    group: 'Worldbuilding',
    code: `// Six kinds, four new pieces of shader — all off by default, all costing
// one compare when they are.
//
//   ribs      parallel ridges in the FACE's plane (a world axis is no use:
//             two of them collapse onto the same direction on a wall, which
//             turns a crossed tread plate back into plain stripes)
//   speck     hard-edged aggregate — asphalt is stones in tar, and stones
//             have edges, where smooth fbm just reads as mottling
//   cells     warped Voronoi: the zinc spangle and basalt's columnar
//             jointing are one function two orders of magnitude apart
//   crust     verdigris, rust, lichen — and it takes the METALNESS with it,
//             which is the difference between patina and green paint
import { createSurface, createSky, createLightingRig, applyFog,
         PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, BoxGeometry, PlaneGeometry } from 'three';

const palette = PALETTES.urban;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'clear', palette);

// The road IS the asphalt sample: aggregate only reads at a grazing angle.
const road = new Mesh(new PlaneGeometry(70, 70), createSurface('asphalt', { seed: 3 }));
road.rotation.x = -Math.PI / 2;
scene.add(road);

// Tall slabs, so the corrugation and the basalt columns have room to run.
const KINDS = ['corrugatedIron', 'diamondPlate', 'galvanised', 'copperPatina', 'basalt'];
KINDS.forEach((kind, i) => {
  const panel = new Mesh(new BoxGeometry(1.7, 2.6, 0.5),
    createSurface(kind, { seed: 5 + i }));
  panel.position.set((i - 2) * 2.1, 1.3, 0);
  scene.add(panel);
});

game.onUpdate((t) => {
  game.camera.position.set(Math.sin(t.elapsed * 0.14) * 3.4, 2.5, 8.4);
  game.camera.lookAt(0, 1.25, 0);
});
game.start();`,
  },
  {
    id: 'physical',
    title: 'The physical tier',
    group: 'Worldbuilding',
    code: `// Six light responses MeshStandardMaterial has no term for at all —
// the only kinds in the catalogue that build a MeshPhysicalMaterial.
//
//   velvet        sheen        dark head-on, bright at every grazing edge
//   silk          anisotropy   a stretched highlight, not a round one
//   brushedMetal  anisotropy   the linisher went one way
//   nacre         iridescence  thin-film: hue depends on thickness and angle
//   ice           transmission light goes THROUGH (three renders twice)
//   gemstone      dispersion   a different IOR per wavelength: white light
//                              in, colour out — why stones are cut at all
//
// Spheres, not boxes: sheen and anisotropy are about the way a highlight
// WRAPS, and a flat face has nothing to wrap around. The gemstone is the
// exception — the facets are half of what makes a cut stone read as one.
import { createSurface, createSky, createLightingRig, applyFog,
         PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { BoxGeometry, Mesh, OctahedronGeometry, PlaneGeometry,
         SphereGeometry, TorusKnotGeometry } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'clear', palette);

const floor = new Mesh(new PlaneGeometry(60, 60),
  createSurface('slate', { seed: 4, color: 0x6f7378 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const KINDS = ['velvet', 'silk', 'brushedMetal', 'nacre', 'ice', 'gemstone'];
const ball = new SphereGeometry(0.62, 40, 28);
const gem = new OctahedronGeometry(0.8, 0);
// ONE row, not two: stacked front-to-back, any camera low enough to see
// the panel hides the back row behind the front one, and any camera high
// enough to separate the rows puts floor behind everything instead.
const meshes = KINDS.map((kind, i) => {
  const mesh = new Mesh(kind === 'gemstone' ? gem : ball,
    createSurface(kind, { seed: 3 + i }));
  mesh.position.set((i - 2.5) * 1.45, 0.85, 0);
  scene.add(mesh);
  return mesh;
});

// A STRIPED LIGHT PANEL BEHIND THE ROW, and it is not decoration.
// Transmission needs a subject to distort, and dispersion needs a hard
// EDGE — separating colours out of a smooth sky gradient separates
// nothing. Bright bars with dark gaps give the whole row edges to work
// with, and they backlight the velvet, which is where a sheen rim reads
// best anyway.
for (let k = 0; k < 9; k++) {
  const bar = new Mesh(new BoxGeometry(0.7, 3.4, 0.2),
    createSurface('crystal', { seed: 5 + k }));
  bar.position.set((k - 4) * 1.15, 1.7, -5);
  scene.add(bar);
}

// A solid object behind the ice too, so its transmission has a shape to
// bend and not only stripes.
const knot = new Mesh(new TorusKnotGeometry(0.42, 0.14, 90, 12),
  createSurface('brass', { seed: 9 }));
knot.position.set(2.17, 0.9, -2.3);
scene.add(knot);

game.onUpdate((t) => {
  knot.rotation.y = t.elapsed * 0.5;
  // The gem turns: dispersion is view-dependent, so a still stone hides it.
  meshes[5].rotation.set(0.35, t.elapsed * 0.6, 0);
  game.camera.position.set(Math.sin(t.elapsed * 0.15), 1.7, 13.9);
  game.camera.lookAt(0, 0.9, 0);
});
game.start();`,
  },
  {
    id: 'environment',
    title: 'Metal that is actually metal',
    group: 'Worldbuilding',
    code: `// BACK ROW reflects, FRONT ROW does not. Same scene, same lights, same
// presets — one property of difference.
//
// A metal has no diffuse colour: everything you see on it is a
// reflection, so a metal with nothing to reflect renders BLACK.
// createSky draws a gradient dome and that does not help — a dome is
// geometry, and three cannot reflect geometry. Reflection needs an
// environment MAP, so this paints the same gradient the sky is drawing
// into a tiny equirect texture, sun and all. Nothing is fetched.
//
// createEnvironmentMap rather than applyEnvironment, because
// scene.environment cannot be opted out of by a single material: three
// overwrites material.envMapIntensity with scene.environmentIntensity
// for anything with no envMap of its own. Handing the map out by hand is
// the only way to have one row reflect and the other not.
import { applyFog, createEnvironmentMap, createLightingRig, createSky,
         createSurface, PALETTES } from 'scena3d';
import { Game } from 'gama3d';
import { Mesh, PlaneGeometry, SphereGeometry } from 'three';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;

const rig = createLightingRig('day');
// An environment is ambient light WITH A DIRECTION, so it does the job
// the rig's flat AmbientLight stands in for. Leave both at full strength
// and the scene washes out.
rig.ambient.intensity *= 0.4;
scene.add(createSky({ palette }).mesh, rig.group);
applyFog(scene, 'clear', palette);
const envMap = createEnvironmentMap({ palette, sun: rig.sun });

const floor = new Mesh(new PlaneGeometry(60, 60),
  createSurface('slate', { seed: 4, color: 0x74787e }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const KINDS = ['chrome', 'steel', 'brass', 'galvanised', 'nacre'];
KINDS.forEach((kind, i) => {
  for (const reflects of [true, false]) {
    const mat = createSurface(kind, { seed: 3 + i });
    if (reflects) mat.envMap = envMap;
    const ball = new Mesh(new SphereGeometry(0.62, 40, 28), mat);
    ball.position.set((i - 2) * 1.55, 0.75, reflects ? -1.8 : 1.5);
    scene.add(ball);
  }
});

game.onUpdate((t) => {
  game.camera.position.set(Math.sin(t.elapsed * 0.12) * 1.4, 3.4, 7.6);
  game.camera.lookAt(0, 0.5, -0.2);
});
game.start();`,
  },
  {
    id: 'feel',
    title: 'Game feel: effects, trails, marks',
    group: 'Living world',
    code: `// THE WORLD REACTS, AND THE WORLD REMEMBERS. Three systems:
// createEffects (bursts and rings — dust, sparks, debris, splash,
// confetti; two draw calls however many are in flight), createTrail (a
// ribbon with real per-vertex alpha), and createMarks (skids, footprints
// and scorches — ONE instanced draw call, shape and fade chosen per
// instance in the shader).
//
// The kart skids only where the ellipse turns hard: a mark records
// something that HAPPENED, not something placed.
import { applyFog, createEffects, createLightingRig, createMarks,
         createSky, createSurface, createTrail, PALETTES } from 'scena3d';
import { BoxGeometry, ConeGeometry, Mesh, PerspectiveCamera,
         PlaneGeometry, Scene, SphereGeometry, Vector3,
         WebGLRenderer } from 'three';

const palette = PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'clear', palette);

const floor = new Mesh(new PlaneGeometry(60, 60),
  createSurface('slate', { seed: 4, color: 0x707880 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const fx = createEffects({ seed: 7 });
const marks = createMarks({ seed: 2, fade: 22 });
const trail = createTrail({ color: 0x8fd0ff, width: 0.34, life: 0.8 });
scene.add(fx.group, marks.mesh, trail.mesh);

const kart = new Mesh(new BoxGeometry(0.8, 0.4, 0.5),
  createSurface('paint', { seed: 8, color: 0x2f6fd0 }));
kart.position.y = 0.25;
scene.add(kart);
const kartPos = new Vector3(), kartDir = new Vector3();
let lastSkid = new Vector3(1e9, 0, 0);

const ball = new Mesh(new SphereGeometry(0.45, 24, 16),
  createSurface('terracotta', { seed: 5 }));
scene.add(ball);
let wasAirborne = false;

const grinder = new Mesh(new ConeGeometry(0.5, 1.1, 6),
  createSurface('steel', { seed: 6 }));
grinder.position.set(4.4, 0.55, -2.9);
scene.add(grinder);
let nextSpark = 0.8, nextScorch = 5, nextConfetti = 3;
let walked = 0, leftFoot = false;
const walkerPos = new Vector3(), walkerDir = new Vector3();

// r185 deprecates THREE.Clock; the loop's own timestamp is all we need.
let last = 0;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(Math.max(t - last, 0), 0.1);
  last = t;

  // Kart on an ellipse: tight at the ends, easy on the straights.
  const a = t * 0.9;
  kartPos.set(Math.sin(a) * 5.0, 0.25, Math.cos(a) * 2.8);
  kartDir.set(Math.cos(a) * 5.0, 0, -Math.sin(a) * 2.8).normalize();
  kart.position.copy(kartPos);
  kart.rotation.y = Math.atan2(kartDir.x, kartDir.z) + Math.PI / 2;
  trail.push(kartPos);
  if (Math.abs(Math.sin(a)) > 0.82 && kartPos.distanceTo(lastSkid) > 0.45) {
    marks.stamp('skid', kartPos, kartDir, { length: 1.1, strength: 0.6 });
    lastSkid = lastSkid.copy(kartPos);
  }

  // The ball raises dust and a shock ring where it lands.
  const height = Math.abs(Math.sin(t * 2.4)) * 2.2;
  ball.position.set(-3.6 + Math.sin(t * 0.35) * 1.2, 0.45 + height, 2.2);
  const airborne = height > 0.05;
  if (wasAirborne && !airborne) {
    fx.burst('dust', ball.position, { direction: new Vector3(0, 1, 0) });
    fx.ring(new Vector3(ball.position.x, 0.02, ball.position.z), { radius: 1.2 });
  }
  wasAirborne = airborne;

  if (t > nextSpark) {
    nextSpark += 0.9;
    fx.burst('sparks', new Vector3(4.4, 1.15, -2.9),
      { direction: new Vector3(-0.6, 0.8, 0.3) });
  }
  if (t > nextScorch) {
    nextScorch += 7;
    marks.stamp('scorch', new Vector3(4.4 - Math.sin(t) * 1.2, 0, -1.9));
  }

  // An invisible walker circles the grinder, feet alternating.
  walked += dt * 1.3;
  const wa = walked / 2.2;
  walkerPos.set(4.4 + Math.cos(wa) * 2.0, 0, -2.9 + Math.sin(wa) * 2.0);
  walkerDir.set(-Math.sin(wa), 0, Math.cos(wa));
  if (walked % 0.55 < dt * 1.3) {
    leftFoot = !leftFoot;
    const side = new Vector3(-walkerDir.z, 0, walkerDir.x)
      .multiplyScalar(leftFoot ? 0.09 : -0.09);
    marks.stamp('footprint', walkerPos.clone().add(side), walkerDir);
  }

  if (t > nextConfetti) {
    nextConfetti += 4.5;
    fx.burst('confetti', new Vector3(0, 3.2, 0));
  }

  fx.update(dt);
  marks.update(dt);
  trail.update(dt);

  camera.position.set(Math.sin(t * 0.1) * 2.0, 8.6, 13.6);
  camera.lookAt(0, 0, -0.4);
  renderer.render(scene, camera);
});

window.feelDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    alive: fx.alive,
    marks: marks.count,
    trailPoints: trail.count,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};`,
  },
  {
    id: 'arcade',
    title: 'Pickups & markers',
    group: 'Living world',
    code: `// THE FURNITURE OF A GAME LOOP. createPickupField puts fourteen
// coins in ONE draw call; the runner's loop is four honest lines per
// coin — proximity against the trigger ({center, radius}, structurally
// GAMA's Obstacle), collect on touch, respawn on a timer. The gem is
// the gemstone surface earning its keep as the obviously-valuable one;
// the checkpoint cycles its three states; the zone fills; the beacon
// breathes; the chequered gate waits.
import {
  CylinderGeometry,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  applyFog,
  createBeacon,
  createCheckpoint,
  createEffects,
  createFinishGate,
  createLightingRig,
  createPickup,
  createPickupField,
  createSky,
  createSurface,
  createZone,
  PALETTES,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'clear', palette);

const floor = new Mesh(
  new PlaneGeometry(60, 60),
  createSurface('slate', { seed: 4, color: 0x6f7680 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// THE COIN RING: fourteen coins, one draw call. A runner laps them and the
// game loop below does what game loops do — proximity test against each
// coin's trigger, collect on touch, respawn on a timer.
const COINS = 14;
const RING = 5;
const coinSpots = Array.from({ length: COINS }, (_, i) => {
  const a = (i / COINS) * Math.PI * 2;
  return new Vector3(Math.cos(a) * RING, 0.85, Math.sin(a) * RING);
});
const coins = createPickupField('coin', coinSpots, { seed: 3 });
scene.add(coins.mesh);
const pendingRespawns = [];

const runner = new Mesh(
  new SphereGeometry(0.42, 20, 14),
  createSurface('paint', { seed: 8, color: 0x2f6fd0 })
);
scene.add(runner);

// THE GEM on a pedestal — the gemstone surface earning its keep as the
// obviously-valuable one. Collected on a timer; confetti says why it matters.
const pedestal = new Mesh(new CylinderGeometry(0.5, 0.62, 0.7, 10), createSurface('marble', { seed: 5 }));
pedestal.position.y = 0.35;
scene.add(pedestal);
const gem = createPickup('gem', { seed: 7, scale: 1.4 });
gem.group.position.set(0, 1.15, 0);
scene.add(gem.group);
let gemRespawnAt = Infinity;
let nextGemTake = 5;

// THE MARKERS, cycling so every state is on display.
const checkpoint = createCheckpoint({ seed: 2, width: 4 });
checkpoint.group.position.set(0, 0, -8.5);
scene.add(checkpoint.group);
const CHECK_STATES = ['upcoming', 'active', 'passed'];
let checkIndex = 0;
let nextCheckFlip = 3;

const zone = createZone({ seed: 6, radius: 2.4, color: 0xf3c94e });
zone.group.position.set(-6.8, 0, 3);
scene.add(zone.group);

const beacon = createBeacon({ seed: 9, height: 10, color: 0x53c7f0 });
beacon.group.position.set(-5.5, 0, -5.5);
scene.add(beacon.group);

const gate = createFinishGate({ seed: 11, width: 6 });
gate.group.position.set(0, 0, 9.5);
scene.add(gate.group);

// 0.93's effects close the loop: rings on coin pickups, confetti on the gem.
const fx = createEffects({ seed: 12 });
scene.add(fx.group);

let collectedTotal = 0;
let last = 0;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(Math.max(t - last, 0), 0.1);
  last = t;

  // The runner laps; the "game loop" is four honest lines per coin.
  const a = t * 0.85;
  runner.position.set(Math.cos(a) * RING, 0.55, Math.sin(a) * RING);
  for (const trigger of coins.triggers) {
    if (!coins.isActive(trigger.index)) continue;
    if (runner.position.distanceTo(trigger.center) < trigger.radius + 0.42) {
      coins.collect(trigger.index);
      collectedTotal++;
      pendingRespawns.push({ index: trigger.index, at: t + 3 });
      fx.ring(new Vector3(trigger.center.x, 0.04, trigger.center.z), {
        radius: 0.9,
        color: 0xf3c94e,
      });
    }
  }
  while (pendingRespawns.length && pendingRespawns[0].at <= t) {
    coins.respawn(pendingRespawns.shift().index);
  }

  // The gem: taken on a timer, celebrated, returned.
  if (t > nextGemTake && gem.state === 'idle') {
    nextGemTake = t + 8;
    gem.collect();
    gemRespawnAt = t + 1.2;
    fx.burst('confetti', new Vector3(0, 2.6, 0));
  }
  if (t > gemRespawnAt) {
    gemRespawnAt = Infinity;
    gem.respawn();
  }

  if (t > nextCheckFlip) {
    nextCheckFlip = t + 3;
    checkIndex = (checkIndex + 1) % CHECK_STATES.length;
    checkpoint.setState(CHECK_STATES[checkIndex]);
  }
  zone.setProgress(0.5 + 0.5 * Math.sin(t * 0.7));

  coins.update(dt);
  gem.update(dt);
  checkpoint.update(dt);
  zone.update(dt);
  beacon.update(dt);
  gate.update(dt);
  fx.update(dt);

  camera.position.set(Math.sin(t * 0.09) * 4, 8.2, 14.2);
  camera.lookAt(0, 0.8, 0);
  renderer.render(scene, camera);
});

window.arcadeDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    coinsRemaining: coins.remaining,
    collectedTotal,
    gemState: gem.state,
    checkpointState: checkpoint.state,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};`,
  },
  {
    id: 'gauntlet',
    title: 'Hazards & the pressure plate',
    group: 'Living world',
    code: `// WHERE MOVEMENT ITSELF IS THE GAME. A rider crosses the moving
// platform (its delta is EXACTLY what a rider adds to stay aboard); the
// crumbling slab shudders its warning before it drops; the pad squashes
// and launches the ball; the pendulum owns its arc; the spikes snap out
// fast and withdraw slowly (the tell); the conveyor walks its crate;
// and the pressure plate — GAMA's MechanismSource, structurally —
// raises the gate whenever the patroller stands on it.
import { applyFog, createBouncePad, createConveyor,
         createCrumblingPlatform, createLightingRig, createPendulum,
         createPlatform, createPressurePlate, createSky, createSpikeTrap,
         createSurface, PALETTES } from 'scena3d';
import { BoxGeometry, Mesh, PerspectiveCamera, PlaneGeometry, Scene,
         SphereGeometry, Vector3, WebGLRenderer } from 'three';

const palette = PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'clear', palette);
const floor = new Mesh(new PlaneGeometry(60, 60),
  createSurface('slate', { seed: 4, color: 0x6f7680 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// The moving platform, with a rider that stays aboard by adding delta.
const platform = createPlatform({ motion: 'linear', seed: 3,
  from: new Vector3(-6, 0.9, -3), to: new Vector3(-1.5, 0.9, -3), period: 5 });
scene.add(platform.group);
const rider = new Mesh(new BoxGeometry(0.5, 0.5, 0.5),
  createSurface('paint', { seed: 8, color: 0x2f6fd0 }));
scene.add(rider);

const crumble = createCrumblingPlatform({ seed: 5, delay: 0.8, respawn: 2.5 });
crumble.group.position.set(1.5, 0.9, -3);
scene.add(crumble.group);

const pad = createBouncePad({ seed: 6, strength: 9 });
pad.group.position.set(5, 0, -3);
scene.add(pad.group);
const ball = new Mesh(new SphereGeometry(0.35, 18, 12),
  createSurface('terracotta', { seed: 7 }));
scene.add(ball);
let ballV = 0, ballY = 3;

const pendulum = createPendulum({ seed: 9, length: 3.2, period: 2.4 });
pendulum.group.position.set(-4.5, 4.6, 2.5);
scene.add(pendulum.group);
const beam = new Mesh(new BoxGeometry(3.2, 0.18, 0.18),
  createSurface('wood', { seed: 10 }));
beam.position.set(-4.5, 4.7, 2.5);
scene.add(beam);

const spikes = createSpikeTrap({ seed: 11, period: 2.6 });
spikes.group.position.set(-0.5, 0, 2.5);
scene.add(spikes.group);

const belt = createConveyor({ seed: 12, length: 5, speed: 1.2 });
belt.group.position.set(4.5, 0, 2.5);
scene.add(belt.group);
const crate = new Mesh(new BoxGeometry(0.6, 0.6, 0.6),
  createSurface('plank', { seed: 13 }));
scene.add(crate);
let crateX = -2.2;

// THE PLATE AND THE GATE. In a real game gama3d's linkMechanism does
// this wiring; here the gate reads plate.open directly.
const plate = createPressurePlate({ seed: 14 });
plate.group.position.set(-1.5, 0, 6.5);
scene.add(plate.group);
const gate = new Mesh(new BoxGeometry(2.4, 2.2, 0.24),
  createSurface('galvanised', { seed: 15 }));
gate.position.set(1.5, 1.1, 6.5);
scene.add(gate);
let gateLift = 0;

// The patroller that works the plate.
const patroller = new Mesh(new BoxGeometry(0.45, 0.9, 0.45),
  createSurface('paint', { seed: 16, color: 0x34d399 }));
scene.add(patroller);

let last = 0, crumbleTimer = 0;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(Math.max(t - last, 0), 0.1);
  last = t;

  platform.update(dt);
  rider.position.copy(platform.group.position);
  rider.position.y += platform.top + 0.25;

  crumble.update(dt);
  crumbleTimer += dt;
  if (crumbleTimer > 5.5 && crumble.state === 'solid') {
    crumbleTimer = 0;
    crumble.disturb(); // someone stepped on it
  }

  // The ball and the pad: gravity down, bounce() when they meet.
  ballV -= 9.8 * dt;
  ballY += ballV * dt;
  if (ballY < 0.75 && ballV < 0) ballV = pad.bounce() * 0.55;
  ball.position.set(5, ballY, -3);
  pad.update(dt);

  pendulum.update(dt);
  spikes.update(dt);

  belt.update(dt);
  crateX += belt.velocity.x * dt;
  if (crateX > 2.2) crateX = -2.2;
  crate.position.set(4.5 + crateX, 0.52, 2.5);

  // The patroller paces over the plate and away; the gate follows.
  const px = -1.5 + Math.sin(t * 0.5) * 2.6;
  patroller.position.set(px, 0.45, 6.5);
  const onPlate = Math.abs(px - plate.group.position.x) < plate.trigger.radius;
  plate.occupy(onPlate ? 1 : 0);
  plate.update(dt);
  gateLift += ((plate.open ? 1.8 : 0) - gateLift) * Math.min(dt * 3, 1);
  gate.position.y = 1.1 + gateLift;

  camera.position.set(Math.sin(t * 0.08) * 3, 7.6, 13.2);
  camera.lookAt(0, 0.8, 1);
  renderer.render(scene, camera);
});

window.gauntletDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    crumbleState: crumble.state,
    spikesOut: spikes.dangerous,
    plateOpen: plate.open,
    gateLift: Number(gateLift.toFixed(2)),
    beltVx: Number(belt.velocity.x.toFixed(2)),
    drawCalls: renderer.info.render.calls,
  };
};`,
  },
  {
    id: 'smash',
    title: 'Destructibles & the scoreboard',
    group: 'Living world',
    code: `// FEEDBACK BY COMING APART. Every few seconds the unseen striker takes
// another breakable — shell swaps for its seeded pre-fractured shards,
// a coin appears where the loot marker says, and the scoreboard FLIPS
// up the count (the vector font's first job with moving parts). The
// dummy takes its knocks and rings down; and at the wicket, the single
// most satisfying piece of feedback in cricket finally happens here:
// THE BAILS FLY.
import { applyFog, createBreakable, createEffects, createLightingRig,
         createPickup, createScoreboard, createSky, createStumps,
         createSurface, createTargetDummy, PALETTES } from 'scena3d';
import { Box3, BoxGeometry, Mesh, PerspectiveCamera, PlaneGeometry, Scene,
         Vector3, WebGLRenderer } from 'three';

const palette = PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'clear', palette);
const floor = new Mesh(new PlaneGeometry(60, 60),
  createSurface('moss', { seed: 4 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const fx = createEffects({ seed: 3 });
scene.add(fx.group);

// The row of victims.
const breakables = [
  createBreakable('crate', { seed: 5 }),
  createBreakable('barrel', { seed: 6 }),
  createBreakable('pot', { seed: 7 }),
  createBreakable('crate', { seed: 8 }),
];
breakables.forEach((b, i) => {
  b.group.position.set(-4.5 + i * 3, 0, -1);
  scene.add(b.group);
});
// Loot: a coin waits hidden inside each, appears when the shards fly.
const loots = breakables.map((b, i) => {
  const coin = createPickup('coin', { seed: 20 + i });
  coin.group.position.copy(b.group.position).add(b.loot);
  coin.collect(); // start hidden
  coin.update(1);
  scene.add(coin.group);
  return coin;
});

const board = createScoreboard({ seed: 9, digits: 3 });
board.group.position.set(0, 0, -6.5);
scene.add(board.group);

const dummy = createTargetDummy({ seed: 10 });
dummy.group.position.set(4.2, 0, 1.6);
scene.add(dummy.group);

const stumps = createStumps({ seed: 11 });
stumps.group.position.set(-3.2, 0, 1.8);
scene.add(stumps.group);

let smashed = 0, nextSmash = 2, nextHit = 1.3, nextBall = 4, resetAt = Infinity;
let last = 0;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(Math.max(t - last, 0), 0.1);
  last = t;

  // The striker works down the row.
  if (t > nextSmash) {
    nextSmash = t + 2.6;
    const next = breakables.find((b) => b.state === 'intact');
    if (next) {
      next.break({ x: 1.5, z: -1 });
      smashed++;
      board.set(smashed);
      loots[breakables.indexOf(next)].respawn(); // the coin appears
      fx.burst('debris', next.group.position.clone().setY(0.6));
      fx.burst('dust', next.group.position.clone().setY(0.4));
    } else if (resetAt === Infinity) {
      resetAt = t + 3;
    }
  }
  if (t > resetAt) {
    resetAt = Infinity;
    for (const b of breakables) b.reset();
    for (const c of loots) { if (c.state === 'idle') c.collect(); }
    stumps.reset();
  }

  if (t > nextHit) {
    nextHit = t + 1.9;
    dummy.hit({ x: 4.2 + Math.sin(t), z: 6 }, 0.8 + Math.sin(t * 0.7) * 0.4);
    fx.burst('dust', dummy.group.position.clone().setY(1.2), { count: 4 });
  }

  if (t > nextBall && !stumps.struck) {
    stumps.strike({ x: 0.2, z: 1 }, 1.1);
    fx.ring(stumps.group.position.clone().setY(0.02), { radius: 0.9 });
  }

  for (const b of breakables) b.update(dt);
  for (const c of loots) c.update(dt);
  board.update(dt);
  dummy.update(dt);
  stumps.update(dt);
  fx.update(dt);

  camera.position.set(Math.sin(t * 0.09) * 3, 5.2, 9.8);
  camera.lookAt(0, 0.7, -0.8);
  renderer.render(scene, camera);
});

window.smashDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    smashed,
    boardValue: board.value,
    states: breakables.map((b) => b.state),
    bailsFlown: stumps.struck,
    drawCalls: renderer.info.render.calls,
  };
};`,
  },
  {
    id: 'dusk',
    title: 'Night falls on Main Street',
    group: 'Living world',
    code: `// THE LIGHT BUDGET AT DUSK. Thirteen fixtures claim a real light;
// SIX exist. Every fixture keeps its cheap glow (emissive + additive
// halo) always — the budget grants the real PointLights to the best
// claims near the camera, hysteretically, so panning never strobes.
// Watch the day cycle drop the sun: the PHOTOCELL trips and the street
// ripples alight lamp by lamp (seeded stagger — never all at once),
// the neon buzzes its one bad letter, and the beacon starts its sweep.
import { applyFog, createBungalow, createDayCycle, createLightBudget,
         createLanternLight, createLightingRig, createNeonSign,
         createPhotocell, createRevolvingBeacon, createSky,
         createStreetLight, createStringLights, createSurface,
         PALETTES } from 'scena3d';
import { Box3, BoxGeometry, Mesh, PerspectiveCamera, PlaneGeometry, Scene,
         Vector3, WebGLRenderer } from 'three';

const palette = PALETTES.urban;
const scene = new Scene();
const camera = new PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const sky = createSky({ palette });
const rig = createLightingRig('day');
scene.add(sky.mesh, rig.group);
applyFog(scene, 'haze', palette);

const ground = new Mesh(new PlaneGeometry(90, 50),
  createSurface('concrete', { seed: 3 }));
ground.rotation.x = -Math.PI / 2;
const road = new Mesh(new BoxGeometry(90, 0.05, 7),
  createSurface('asphalt', { seed: 4 }));
road.position.set(0, 0.026, 0);
scene.add(ground, road);

// The street: three homes on the far side (their window panes are
// nightGlow materials, so the day cycle warms them after dark).
const homes = [[-16, 11], [1, 12], [17, 13]].map(([x, seed], i) => {
  const home = createBungalow({ seed, floors: i === 1 ? 2 : 1, palette });
  home.object.position.set(x, 0, -10.5);
  scene.add(home.object);
  return home;
});

// ---- The fixtures. Every one glows for free; each CLAIMS a real light.
const fixtures = [];
for (let i = 0; i < 6; i++) {
  const lamp = createStreetLight({ style: 'modern', seed: 20 + i });
  lamp.object.position.set(-17.5 + i * 7, 0, 4);
  lamp.object.rotation.y = Math.PI / 2; // arm cranes over the road
  fixtures.push(lamp);
}
const porchA = createLanternLight({ seed: 8 });
porchA.object.position.set(-14.2, 0.9, -7.4);
const porchB = createLanternLight({ seed: 9 });
porchB.object.position.set(15.1, 0.9, -7.4);
fixtures.push(porchA, porchB);

const open = createNeonSign('OPEN', { color: 0x53f0c7, height: 0.42, seed: 5 });
open.object.position.set(1, 2.6, -6.8);
const motel = createNeonSign('MOTEL', { color: 0xff4fa3, height: 0.6, seed: 6 });
motel.object.position.set(17, 3.3, -6.9);
fixtures.push(open, motel);

for (const x of [-8, 9]) {
  const strand = createStringLights({ span: 11, sag: 0.7, count: 15,
    seed: 30 + x });
  strand.object.position.set(x, 3.6, -1.5);
  strand.object.rotation.y = Math.PI / 2; // strung across the street
  fixtures.push(strand);
}

const beacon = createRevolvingBeacon({ height: 5, seed: 2 });
beacon.object.position.set(30, 0, -16);
fixtures.push(beacon);
for (const f of fixtures) scene.add(f.object);

// ---- The budget: 13 claims, 6 real lights, spent near the camera.
const budget = createLightBudget({ max: 6 });
scene.add(budget.group);
for (const f of fixtures) budget.register(f.claim);

// ---- Dusk falls fast (36 s days), and the photocell trips the street.
const cycle = createDayCycle({ sky, rig, scene, lamps: homes,
  dayLength: 36, timeOfDay: 0.62 });
const cell = createPhotocell(cycle, fixtures, { seed: 9, spread: 4 });

let last = 0;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(Math.max(t - last, 0), 0.1);
  last = t;

  cycle.update(dt);
  cell.update(dt);
  for (const f of fixtures) f.update?.(dt);

  camera.position.set(Math.sin(t * 0.045) * 11, 4.4, 11.5);
  camera.lookAt(Math.sin(t * 0.045) * 5, 1.6, -4);
  budget.update(camera.position); // the scarce lights follow the view
  renderer.render(scene, camera);
});

window.duskDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    timeOfDay: Number(cycle.timeOfDay.toFixed(3)),
    sunElevation: Number(cycle.sunElevation.toFixed(3)),
    cell: cell.state,
    pending: cell.pending,
    granted: budget.active,
    lit: fixtures.filter((f) => f.lit).length,
    fixtures: fixtures.length,
    drawCalls: renderer.info.render.calls,
  };
};`,
  },
  {
    id: 'tempest',
    title: 'Tempest & the fireworks after',
    group: 'Living world',
    code: `// THE SKY'S DRAMA, in a loop: sixteen seconds of STORM — rain,
// seeded forked bolts, a two-pulse flash driven through ambient, sky
// and fog (and decayed back to EXACTLY where they were), thunder
// arriving late in proportion to distance — then the clouds part and
// the FIREWORKS answer: seeded rockets, spherical shells drooping
// under gravity, one InstancedMesh for the whole finale.
import { applyFog, createBungalow, createFireworks, createLightning,
         createLightingRig, createPrecipitation, createSky,
         createSurface, PALETTES } from 'scena3d';
import { Mesh, PerspectiveCamera, PlaneGeometry, Scene,
         WebGLRenderer } from 'three';

const palette = PALETTES.dusk;
const scene = new Scene();
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const sky = createSky({ topColor: 0x171a2e, bottomColor: 0x2c2438 });
const rig = createLightingRig('night');
scene.add(sky.mesh, rig.group);
applyFog(scene, 'haze', palette);
scene.background = null; // the sky dome is the backdrop; fog flashes instead

const ground = new Mesh(new PlaneGeometry(90, 60),
  createSurface('moss', { seed: 6 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
for (const [x, seed] of [[-13, 21], [3, 22], [16, 23]]) {
  const home = createBungalow({ seed, floors: 1, palette });
  home.object.position.set(x, 0, -13);
  scene.add(home.object);
}

// ---- The storm.
const rain = createPrecipitation({ type: 'rain', count: 4200 });
scene.add(rain.object);
let thunders = 0;
const storm = createLightning({
  seed: 5,
  targets: { ambient: rig.ambient, fog: scene.fog },
  cadence: 3.5,
  soundSpeed: 60,
  onThunder: () => thunders++,
});
scene.add(storm.group);

// ---- The show.
let bursts = 0;
const show = createFireworks({ seed: 11, onBurst: () => bursts++ });
scene.add(show.group);

// ---- The loop: storm → the clouds part → fireworks → again.
let phase = 'storm', phaseClock = 0, launchClock = 0;
let last = 0;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(Math.max(t - last, 0), 0.1);
  last = t;
  phaseClock += dt;

  if (phase === 'storm') {
    storm.storminess = Math.min(phaseClock / 3, 1);
    rain.setIntensity(Math.min(phaseClock / 3, 1));
    if (phaseClock > 16) { phase = 'clearing'; phaseClock = 0; }
  } else if (phase === 'clearing') {
    storm.storminess = 0;
    rain.setIntensity(Math.max(1 - phaseClock / 2.5, 0));
    if (phaseClock > 3) { phase = 'show'; phaseClock = 0; launchClock = 0; }
  } else {
    launchClock -= dt;
    if (launchClock <= 0 && phaseClock < 10) {
      launchClock = 0.9;
      show.launch({ x: -6 + (bursts % 3) * 6, y: 0, z: -2 });
    }
    if (phaseClock > 14) { phase = 'storm'; phaseClock = 0; }
  }

  storm.update(dt);
  rain.update(dt);
  show.update(dt);

  camera.position.set(Math.sin(t * 0.04) * 6, 5.5, 17);
  camera.lookAt(0, 5, -6);
  renderer.render(scene, camera);
});

window.tempestDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    phase,
    flash: Number(storm.flash.toFixed(3)),
    strikes: storm.strikes,
    thunders,
    bursts,
    rockets: show.rockets,
    sparks: show.sparks,
    ambient: Number(rig.ambient.intensity.toFixed(3)),
    drawCalls: renderer.info.render.calls,
  };
};
window.tempestStrike = () => storm.strike({ distance: 8, energy: 1 });`,
  },
  {
    id: 'grove',
    title: 'The sunbeam grove',
    group: 'Living world',
    code: `// ATMOSPHERE YOU CAN SEE. God rays slant through the canopy — every
// beam and its crossed cards merged into ONE draw call — with dust
// motes forever falling down the light and never arriving. At the
// spring, the OTHER trick from the same family: caustics, patched
// into the pool bed's material, dancing on the sand regardless of
// the hour. Neither reads as an effect; both read as morning.
import { applyFog, createCaustics, createLightingRig, createLightShafts,
         createSky, createSurface, createTree, PALETTES } from 'scena3d';
import { CircleGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera,
         PlaneGeometry, Scene, WebGLRenderer } from 'three';

const palette = PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const rig = createLightingRig('golden-hour');
rig.ambient.intensity = 0.32; // dim clearing — the shafts are the light
rig.sun.intensity = 0.7;
scene.add(createSky({ palette }).mesh, rig.group);
applyFog(scene, 'haze', palette);

const ground = new Mesh(new PlaneGeometry(60, 60),
  createSurface('moss', { seed: 12 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// The ring of trees the light comes through.
for (let i = 0; i < 11; i++) {
  const angle = (i / 11) * Math.PI * 2;
  const r = 11 + (i % 3) * 2.5;
  const tree = createTree({ seed: 40 + i, palette });
  tree.object.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
  scene.add(tree.object);
}

// ---- The beams and their dust.
const shafts = createLightShafts({ count: 8, area: 7, length: 5.5,
  dust: 22, seed: 4, tilt: 0.38, azimuth: 0.9 });
scene.add(shafts.group);

// ---- The spring: a sand bed with caustics, under a skin of water.
const bed = new Mesh(new CircleGeometry(3.2, 28),
  createSurface('sand', { seed: 7 }));
bed.rotation.x = -Math.PI / 2;
bed.position.set(2.5, 0.02, 3);
scene.add(bed);
const caustics = createCaustics({ intensity: 0.65, scale: 1.4 });
caustics.bind(bed.material);
const skin = new Mesh(new CircleGeometry(3.2, 28),
  new MeshStandardMaterial({ color: 0x2e6f86, transparent: true,
    opacity: 0.35, roughness: 0.15 }));
skin.rotation.x = -Math.PI / 2;
skin.position.set(2.5, 0.14, 3);
scene.add(skin);

let last = 0;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(Math.max(t - last, 0), 0.1);
  last = t;
  shafts.update(dt);
  caustics.update(dt);
  camera.position.set(Math.sin(t * 0.05) * 8, 3.1, Math.cos(t * 0.05) * 8 + 1);
  camera.lookAt(0, 1.2, 0);
  renderer.render(scene, camera);
});

window.groveDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const motes = shafts.group.children.find((c) => c.isPoints);
  const p = motes.geometry.getAttribute('position');
  return {
    glError: gl.getError(),
    strength: Number(shafts.strength.toFixed(3)),
    mote0: [p.getX(0), p.getY(0), p.getZ(0)].map((v) => Number(v.toFixed(3))),
    causticTime: Number(caustics.uniforms.uCausticTime.value.toFixed(2)),
    drawCalls: renderer.info.render.calls,
  };
};`,
  },
  {
    id: 'railway',
    title: 'The branch line: track, consist & platform',
    group: 'Living world',
    code: `// RAIL IS THE ONE VEHICLE CLASS THAT DOES NOT STEER. A train's whole
// position is ONE NUMBER - how far along the track - and track.at(d)
// turns that number into a place and a facing. Everything else here
// follows from it: the consist, the wheel roll, the station stop.
//
// Watch the carriages on the bend. Each sits on the MIDPOINT of its two
// bogies and faces the CHORD between them, not the tangent at its
// centre - the difference between a train and a string of boxes
// shrink-wrapped to a spline.
//
// The yellow markings are where the doors are expected to land. The
// train stops on its mark and they line up to a few centimetres.
import { createTrack, createStationPlatform, createLocomotive, createCarriage,
         createConsist, createSky, createLightingRig, applyFog, createSurface,
         createTree, PALETTES } from 'scena3d';
import { Mesh, PlaneGeometry, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

const palette = PALETTES.meadow;
const scene = new Scene();
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'haze', palette);

const ground = new Mesh(new PlaneGeometry(1400, 1400), createSurface('grass', { seed: 2 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// The line: a straight, a sweeping right-hander, another straight.
const line = createTrack([
  { x: -320, z: -40 }, { x: -80, z: -40 },
  { x: 90, z: 60 }, { x: 340, z: 60 },
]);
scene.add(line.object);

const train = createConsist(line, [
  createLocomotive({ seed: 4 }),
  createCarriage({ seed: 11 }),
  createCarriage({ seed: 12 }),
  createCarriage({ seed: 13 }),
]);
scene.add(train.object);

// Door offsets measured back from the train's front - what the platform
// puts its markings at.
const offsets = [];
let run = 0;
for (const v of train.vehicles) {
  for (const d of v.doors) offsets.push(-(run + v.length / 2 + d));
  run += v.length + 0.6;
}
const platform = createStationPlatform(line, {
  from: 150, to: 150 + train.length + 16,
  name: 'HAVENBROOK', doorOffsets: offsets, side: 'left',
});
scene.add(platform.object);

for (let i = 0; i < 14; i++) {
  const t = createTree({ species: 'oak', seed: 40 + i, height: 7 + (i % 3), palette });
  t.object.position.set(-300 + i * 46, 0, i % 2 ? -95 : 120);
  scene.add(t.object);
}

// The whole simulation: one scalar, eased to a stop on the mark, a dwell,
// then away again. A real driver gets a brake curve; this is its shape.
// It starts on the approach, not at the far end of the line: the whole
// point of the demo is the arrival, and a visitor should not have to wait
// out 240 m of straight track to see it.
const STOP = platform.stopMark;
const START = STOP - 95;
let distance = START, dwell = 0;
const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 2000);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const remaining = STOP - distance;
  if (remaining > 0.05) {
    distance += Math.max(1.5, Math.min(22, remaining * 0.28)) * dt;
  } else if (dwell < 5) {
    dwell += dt;
  } else {
    distance += Math.min(20, (distance - STOP) * 0.5 + 2) * dt;
    if (distance > line.length - 6) { distance = START; dwell = 0; }
  }
  train.place(distance);

  const view = line.at(STOP + 26);
  camera.position.set(view.position.x - 26, 11, view.position.z - 32);
  camera.lookAt(train.vehicles[0].object.position);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
  },
  {
    id: 'airfield',
    title: 'The airfield: circuits & the windsock',
    group: 'Living world',
    code: `// THE VEHICLE KIT GROWS WINGS. A trainer flies the traffic pattern on
// a closed loop — takeoff roll, climb-out, downwind, final, touchdown,
// around again — banking with the curve, propeller blurring into a
// disc at full power and back into blades at idle. The windsock is
// INSTRUMENTATION: it reads the actual WindField, which veers slowly,
// and the sock swings and droops to match. An airliner waits on the
// apron, strobes popping. Runway 27's far end reads 09, because that
// is what runways do.
import { applyFog, createHangar, createLightingRig, createPlane,
         createRunway, createSky, createSurface, createWindField,
         createWindsock, PALETTES } from 'scena3d';
import { CatmullRomCurve3, Mesh, PerspectiveCamera, PlaneGeometry,
         Scene, Vector3, WebGLRenderer } from 'three';

const palette = PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'haze', palette);
const grass = new Mesh(new PlaneGeometry(160, 120),
  createSurface('moss', { seed: 8 }));
grass.rotation.x = -Math.PI / 2;
scene.add(grass);

// ---- The field.
const runway = createRunway({ length: 64, width: 8, number: 27, seed: 2 });
scene.add(runway.object);
const hangar = createHangar({ seed: 5 });
hangar.object.position.set(-16, 0, -14);
hangar.object.rotation.y = 0.4;
scene.add(hangar.object);
const sock = createWindsock({ seed: 4 });
sock.object.position.set(9, 0, -20);
scene.add(sock.object);
const wind = createWindField({ direction: 30, strength: 0.55 });

// The airliner on the apron, strobes running.
const airliner = createPlane({ style: 'airliner', seed: 9 });
airliner.object.position.set(-24, 0, 12);
airliner.object.rotation.y = 1.1;
scene.add(airliner.object);

// ---- The trainer and its never-ending circuit.
const trainer = createPlane({ style: 'prop', seed: 7, color: 0xc23b3b });
scene.add(trainer.object);
const CIRCUIT = new CatmullRomCurve3([
  new Vector3(0, 0.1, -26),    // holding at the threshold
  new Vector3(0, 0.15, -6),    // the roll
  new Vector3(0, 1.6, 12),     // rotate
  new Vector3(0, 9, 30),       // climb-out
  new Vector3(16, 14, 40),     // crosswind turn
  new Vector3(30, 16, 12),     // downwind
  new Vector3(30, 15, -26),    //
  new Vector3(16, 11, -48),    // base
  new Vector3(2, 5, -46),      // final
  new Vector3(0, 1.1, -36),    // short final
], true, 'catmullrom', 0.35);
const LAPLEN = CIRCUIT.getLength();
let u = 0, laps = 0;
const pos = new Vector3(), ahead = new Vector3(), delta = new Vector3();

let last = 0;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(Math.max(t - last, 0), 0.1);
  last = t;

  // The wind veers, the sock reports.
  wind.setDirection(30 + t * 4);
  sock.update(dt, wind);

  // Fly the loop at constant path speed; altitude tells the story.
  const speed = 16;
  const prev = u;
  u = (u + (speed * dt) / LAPLEN) % 1;
  if (u < prev) laps++;
  CIRCUIT.getPointAt(u, pos);
  CIRCUIT.getPointAt((u + 0.012) % 1, ahead);
  trainer.object.position.copy(pos);
  trainer.object.lookAt(ahead);
  // Bank into the turn: roll from how hard the heading is changing.
  delta.subVectors(ahead, pos);
  const heading = Math.atan2(delta.x, delta.z);
  CIRCUIT.getPointAt((u + 0.03) % 1, delta);
  delta.sub(ahead);
  const headingAhead = Math.atan2(delta.x, delta.z);
  let turn = headingAhead - heading;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  trainer.object.rotateZ(-turn * 6);

  const climbing = ahead.y - pos.y;
  const throttle = pos.y < 0.5 && climbing < 0.02 ? 0.85 : // the roll
    climbing > 0.01 ? 0.95 : climbing < -0.01 ? 0.25 : 0.6;
  trainer.update(dt, { throttle,
    pitch: Math.min(Math.max(climbing * 6, -1), 1),
    roll: Math.min(Math.max(-turn * 10, -1), 1) });
  airliner.update(dt, { throttle: 0 });

  camera.position.set(-34, 18, 42);
  camera.lookAt(pos.x * 0.4 + 4, pos.y * 0.4 + 2, pos.z * 0.4 - 4);
  renderer.render(scene, camera);
});

window.airfieldDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    u: Number(u.toFixed(3)),
    laps,
    alt: Number(trainer.object.position.y.toFixed(2)),
    sockAngle: Number(sock.angle.toFixed(3)),
    sockDroop: Number(sock.droop.toFixed(3)),
    reciprocal: runway.reciprocal,
    drawCalls: renderer.info.render.calls,
  };
};`,
  },
  {
    id: 'heliport',
    title: 'Night ops at the heliport',
    group: 'Living world',
    code: `// THE HELICOPTER'S NIGHT SHIFT. Spool up (rotors take their time and
// the blades DROOP until they fly), lift from the H, orbit the pad
// with the nose searchlight sweeping the ground — its claim outranks
// the street lamps, so the LightBudget hands it a real light the
// moment it switches on — then settle back onto the pad and wind
// down. Watch the blur discs come and go with the spool.
import { applyFog, createHelicopter, createHelipad, createHangar,
         createLightBudget, createLightingRig, createSky,
         createStreetLight, createSurface, PALETTES } from 'scena3d';
import { Box3, BoxGeometry, Mesh, PerspectiveCamera, PlaneGeometry, Scene,
         Vector3, WebGLRenderer } from 'three';

const palette = PALETTES.dusk;
const scene = new Scene();
const camera = new PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const sky = createSky({ topColor: 0x0b1026, bottomColor: 0x2c2438 });
const rig = createLightingRig('night');
rig.ambient.intensity = 0.22;
scene.add(sky.mesh, rig.group);
applyFog(scene, 'haze', palette);
const apron = new Mesh(new PlaneGeometry(70, 60),
  createSurface('concrete', { seed: 3 }));
apron.rotation.x = -Math.PI / 2;
scene.add(apron);

const pad = createHelipad({ radius: 3.4, seed: 2 });
scene.add(pad.object);
const hangar = createHangar({ seed: 7 });
hangar.object.position.set(-14, 0, -10);
hangar.object.rotation.y = 0.5;
scene.add(hangar.object);

// Two apron lamps and the budget the searchlight will raid.
const budget = createLightBudget({ max: 3 });
scene.add(budget.group);
const lamps = [[-8, 6], [9, -7]].map(([x, z]) => {
  const lamp = createStreetLight({ style: 'modern', seed: 20 + x });
  lamp.object.position.set(x, 0, z);
  scene.add(lamp.object);
  budget.register(lamp.claim);
  return lamp;
});

const heli = createHelicopter({ seed: 4, color: 0xd8a13a });
scene.add(heli.object);
for (const claim of heli.claims) budget.register(claim);

// ---- The night shift, phase by phase.
let phase = 'spool', clock = 0, orbitAngle = 0;
const heliPos = new Vector3(0, 0, 0);

let last = 0;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(Math.max(t - last, 0), 0.1);
  last = t;
  clock += dt;

  let rotor = 0, light = false, cyclicRoll = 0;
  if (phase === 'spool') {
    rotor = 1;
    if (heli.rotor > 0.95) { phase = 'lift'; clock = 0; }
  } else if (phase === 'lift') {
    rotor = 1;
    heliPos.y = Math.min(heliPos.y + 2.2 * dt, 9);
    if (heliPos.y >= 9) { phase = 'orbit'; clock = 0; }
  } else if (phase === 'orbit') {
    rotor = 1; light = true; cyclicRoll = 0.6;
    orbitAngle += dt * 0.45;
    heliPos.x = Math.sin(orbitAngle) * 10;
    heliPos.z = Math.cos(orbitAngle) * 10;
    heli.object.rotation.y = orbitAngle + Math.PI / 2; // nose along the orbit
    // The searchlight holds the PAD while the ship circles it.
    heli.searchlight.rotation.y = Math.PI / 2 + Math.sin(clock * 0.8) * 0.35;
    if (clock > 14) { phase = 'return'; clock = 0; }
  } else if (phase === 'return') {
    rotor = 1; light = true;
    heliPos.x += (0 - heliPos.x) * Math.min(dt * 1.2, 1);
    heliPos.z += (0 - heliPos.z) * Math.min(dt * 1.2, 1);
    if (Math.abs(heliPos.x) < 0.3 && Math.abs(heliPos.z) < 0.3) {
      phase = 'land'; clock = 0; }
  } else if (phase === 'land') {
    rotor = 0.9;
    heliPos.y = Math.max(heliPos.y - 1.6 * dt, 0);
    if (heliPos.y <= 0) { phase = 'cool'; clock = 0; }
  } else {
    rotor = 0; light = false;
    if (heli.rotor < 0.03 && clock > 2) { phase = 'spool'; clock = 0; }
  }

  heli.object.position.copy(heliPos);
  heli.object.position.y += 0.15; // skids on the pad, not in it
  heli.update(dt, { rotor, light, cyclicRoll });
  budget.update(camera.position);

  camera.position.set(Math.sin(t * 0.06) * 16, 7.5, Math.cos(t * 0.06) * 16);
  camera.lookAt(heliPos.x * 0.5, Math.max(heliPos.y * 0.7, 1.2), heliPos.z * 0.5);
  renderer.render(scene, camera);
});

window.heliportDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    phase,
    rotor: Number(heli.rotor.toFixed(2)),
    alt: Number(heliPos.y.toFixed(1)),
    light: heli.searchlightOn,
    granted: budget.active,
    drawCalls: renderer.info.render.calls,
  };
};`,
  },
  {
    id: 'jets',
    title: 'Jets: the flypast',
    group: 'Living world',
    code: `// THE FAST MOVERS. Two delta-wing fighters fly the display circuit in
// echelon — elevons mixing pitch and roll with the curve, gear folding
// after the low pass, AFTERBURNERS lighting in the climb (watch the
// flame breathe — it has its own seeded nerve). On each lap the lead
// clears a hardpoint: the round leaves the rail with a burst, because
// the missile a game flies should be the missile the wing stops
// carrying. GAMA's Missiles takes the pose from launchFrom() verbatim.
import { applyFog, createEffects, createFighterJet, createLightingRig,
         createRunway, createSky, createSurface, PALETTES } from 'scena3d';
import { CatmullRomCurve3, Mesh, PerspectiveCamera, PlaneGeometry,
         Scene, Vector3, WebGLRenderer } from 'three';

const palette = PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'haze', palette);
const grass = new Mesh(new PlaneGeometry(220, 160),
  createSurface('moss', { seed: 5 }));
grass.rotation.x = -Math.PI / 2;
scene.add(grass);
scene.add(createRunway({ length: 70, width: 9, number: 9, seed: 3 }).object);
const fx = createEffects({ seed: 8 });
scene.add(fx.group);

const lead = createFighterJet({ seed: 7, color: 0x5d6a78 });
const wing = createFighterJet({ seed: 8, color: 0x3a4550 });
scene.add(lead.object, wing.object);

// The display line: low pass down the runway, pull up, wide return.
const LOOP = new CatmullRomCurve3([
  new Vector3(0, 3, -60),
  new Vector3(0, 2.2, 0),      // the low pass
  new Vector3(0, 3.5, 40),
  new Vector3(-8, 16, 75),     // the pull — burners
  new Vector3(-40, 26, 60),
  new Vector3(-60, 28, 0),
  new Vector3(-40, 22, -70),
  new Vector3(-6, 10, -85),
], true, 'catmullrom', 0.4);
const LEN = LOOP.getLength();
let u = 0, laps = 0, fired = false;
const pos = new Vector3(), ahead = new Vector3(), wpos = new Vector3();

let last = 0;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(Math.max(t - last, 0), 0.1);
  last = t;

  const prev = u;
  u = (u + (34 * dt) / LEN) % 1;
  if (u < prev) { laps++; lead.rearm(); fired = false; }
  LOOP.getPointAt(u, pos);
  LOOP.getPointAt((u + 0.01) % 1, ahead);

  const climbing = ahead.y - pos.y;
  const throttle = climbing > 0.08 ? 0.95 : 0.65; // burners in the pull
  const gearDown = pos.y < 6 && !climbing;

  const place = (jet, at, look) => {
    jet.object.position.copy(at);
    jet.object.lookAt(look);
  };
  place(lead, pos, ahead);
  // Wingman: echelon right, a length back and a wing out.
  LOOP.getPointAt((u - 0.012 + 1) % 1, wpos);
  wpos.x += 7; wpos.y += 1.5;
  const wlook = ahead.clone(); wlook.x += 7; wlook.y += 1.5;
  place(wing, wpos, wlook);

  // Elevons follow the curve's bend.
  LOOP.getPointAt((u + 0.03) % 1, wlook);
  const turn = Math.atan2(wlook.x - ahead.x, wlook.z - ahead.z) -
               Math.atan2(ahead.x - pos.x, ahead.z - pos.z);
  const roll = Math.min(Math.max(-turn * 6, -1), 1);
  lead.update(dt, { throttle, gearDown, roll,
    pitch: Math.min(Math.max(climbing * 4, -1), 1) });
  wing.update(dt, { throttle, gearDown, roll: roll * 0.9,
    pitch: Math.min(Math.max(climbing * 4, -1), 1) });

  // Top of the pull: the lead clears a rail.
  if (!fired && u > 0.45 && u < 0.55) {
    fired = true;
    const launch = lead.launchFrom(laps % 2);
    if (launch) fx.burst('sparks', launch.position);
  }

  camera.position.set(34, 14, 30);
  camera.lookAt(pos.x, Math.max(pos.y, 2), pos.z);
  fx.update(dt);
  renderer.render(scene, camera);
});

window.jetsDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    u: Number(u.toFixed(3)),
    laps,
    alt: Number(lead.object.position.y.toFixed(1)),
    armed: lead.armed,
    drawCalls: renderer.info.render.calls,
  };
};`,
  },
  {
    id: 'ammunition',
    title: 'Ammunition: one table, four states',
    group: 'Living world',
    code: `// THE SUPPLY CHAIN, NOT A SHELF OF MODELS.
//
// A round is never just a round. The same cartridge is a thing in a crate, a
// thing in a belt, a thing in a hand and a case on the floor — and every one
// of those is DERIVED from a single measured spec per kind. The magazine is
// as long as its rounds are; the belt's link pitch is the case head; the
// crate's stack falls out of its inside dimensions divided by the round.
//
// Front row: one round of each of the nineteen kinds, to scale with each
// other. Real calibres, so the 5.56 next to the 155 mm is the actual ratio.
// Behind: the ready state each kind really ships in — magazine, belt,
// quiver, rack or open box, chosen by createReady() rather than by the
// caller. The 100-round belt on the left is THREE draw calls.
//
// Watch the belts and magazines empty and refill. setCount() rewrites
// instance matrices, so an empty container costs exactly what a full one
// does — which is what lets a game put one on every gunner in a firefight.
import { AMMO, AMMO_KINDS, applyFog, ballisticsOf, createCasing,
         createLightingRig, createReady, createRound, createSky,
         createSurface, describeAmmo, PALETTES } from 'scena3d';
import { Box3, BoxGeometry, Mesh, PerspectiveCamera, PlaneGeometry, Scene,
         Vector3, WebGLRenderer } from 'three';

const palette = PALETTES.urban ?? PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(48, innerWidth / innerHeight, 0.05, 400);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(createSky({ palette }).mesh, createLightingRig('day').group);
applyFog(scene, 'haze', palette);

const floor = new Mesh(new PlaneGeometry(120, 120),
  createSurface('concrete', { seed: 4 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// ── One station per kind, in a grid ──────────────────────────────────
// Small arms are millimetres and a torpedo is six metres, so each station
// normalises its round to a common APPARENT size and the true figures are
// what \`describeAmmo\` prints. The shape is what the row is for — a spitzer
// bullet, a crimped hull, a sub-calibre dart, a fletched shaft — and the
// shape is the part that is not being scaled away.
const ready = [];
const COLS = 5;
const PITCH = 2.6;
for (let i = 0; i < AMMO_KINDS.length; i++) {
  const kind = AMMO_KINDS[i];
  const spec = AMMO[kind];
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const px = (col - (COLS - 1) / 2) * PITCH;
  const pz = (row - 1.5) * PITCH;

  // A plinth, so nothing floats and the grid reads as a display.
  const plinth = new Mesh(new BoxGeometry(2.1, 0.34, 2.1),
    createSurface('concrete', { seed: 9 }));
  plinth.position.set(px, 0.17, pz);
  scene.add(plinth);

  // The round, stood on end, all of them the same height on screen.
  const round = createRound(kind, { scale: 0.62 / spec.length });
  round.object.position.set(px - 0.62, 0.34, pz + 0.55);
  round.object.rotation.x = -Math.PI / 2;
  scene.add(round.object);

  // The ready state this kind actually ships in — magazine, belt, quiver,
  // rack or open box — chosen by createReady, not by this loop.
  //
  // Fitted by its own MEASURED bounds rather than by the round's length. A
  // 100-link belt and a 4-cell torpedo cradle are both "made of long rounds"
  // and are nothing like each other in size, so scaling either by its round
  // put one through the floor and the other off the plinth.
  const box = createReady(kind);
  const bounds = new Box3().setFromObject(box.object);
  const size = bounds.getSize(new Vector3());
  box.object.scale.setScalar(1.15 / Math.max(0.001, Math.max(size.x, size.y, size.z)));
  box.object.position.set(px + 0.35, 0.34, pz - 0.1);
  scene.add(box.object);
  ready.push(box);

  // And the brass it leaves behind, for the kinds that leave any. A mortar
  // bomb and an arrow leave none, and the scene shows that by showing none.
  const brass = createCasing(kind, { seed: 3, count: 16, spread: 0.3, scale: 3.2 });
  brass.object.position.set(px - 0.55, 0.34, pz - 0.62);
  scene.add(brass.object);
}

// ── Firing ────────────────────────────────────────────────────────────
// Every container drains at a rate taken from its own ballistics, so the
// belt-fed kinds empty fast and the racked ones do not — the same numbers
// that decide how the rounds FLY decide how quickly they run out.
const rate = ready.map((c) => {
  const b = ballisticsOf(c.kind);
  return Math.max(0.6, c.capacity / (b.speed > 800 ? 4 : b.speed > 300 ? 9 : 16));
});
const level = ready.map((c) => c.capacity);

let t = 0;
let last = performance.now() / 1000;
function frame() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - last);
  last = now;
  t += dt;

  for (let i = 0; i < ready.length; i++) {
    level[i] -= rate[i] * dt;
    if (level[i] <= 0) level[i] = ready[i].capacity;   // reload
    ready[i].setCount(level[i]);
  }

  // A slow orbit over the grid.
  const a = t * 0.11;
  camera.position.set(Math.sin(a) * 4.2, 7.6, 12.6 + Math.cos(a) * 1.4);
  camera.lookAt(0, 0.5, 0.1);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.ammoDebug = () => ({
  kinds: AMMO_KINDS.length,
  // The claim the scene is making, in numbers: every container is instanced,
  // so the whole wall of ammunition is a couple of draws per kind.
  draws: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  loaded: ready.map((c) => c.count),
  capacities: ready.map((c) => c.capacity),
  // Muzzle velocity straight from the same table that shaped the models.
  fastest: describeAmmo(
    AMMO_KINDS.reduce((a, b) => (AMMO[a].muzzle > AMMO[b].muzzle ? a : b))
  ),
});
`,
  },
];


export function findExample(id: string): Example {
  return EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0];
}
