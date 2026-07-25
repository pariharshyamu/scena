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
];

export function findExample(id: string): Example {
  return EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0];
}
