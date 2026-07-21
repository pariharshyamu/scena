import { Box3, Vector3 } from 'three';
import {
  createTerrain,
  createSky,
  createLightingRig,
  applyFog,
  createDayCycle,
  createWater,
  aboveWater,
  applyWind,
  createPath,
  createTree,
  createRock,
  createGrassTuft,
  createBush,
  createCrate,
  createLamp,
  scatter,
  PALETTES,
  type Prop,
} from 'scena3d';
import { Game, MotionAgent, FollowPath, Path, ObstacleAvoidance, Separation } from 'gama3d';
import { createFlock, createCapsulePerson } from 'gama3d/templates';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;

// --- The world (SCENA): terrain with a lake, sky, light, fog.
const WATER_LEVEL = 0.22;
const terrain = createTerrain({ seed: 20, size: 90, amplitude: 5, waterLevel: WATER_LEVEL, palette });
scene.add(terrain.mesh);
const water = createWater({ level: WATER_LEVEL, size: 120, palette });
scene.add(water.mesh);
const sky = createSky({ palette });
scene.add(sky.mesh);
const rig = createLightingRig('day');
scene.add(rig.group);
applyFog(scene, 'haze', palette);
game.onUpdate((t) => water.update(t.delta));

// --- A dirt road looping through the forest — ONE authored curve that is
// simultaneously the visual ribbon, scatter keep-out, and patrol route.
const road = createPath(
  [
    { x: -18, z: -10 }, { x: 0, z: -16 }, { x: 16, z: -6 },
    { x: 14, z: 12 }, { x: -2, z: 14 }, { x: -20, z: 6 },
  ],
  { surface: terrain.heightAt, width: 2.2, loop: true, palette }
);
scene.add(road.mesh);

// --- The camp in the road's embrace: crates + lamps.
const CAMP = new Vector3(0, terrain.heightAt(0, 0), 0);
const lamps: Prop[] = [];
const place = (prop: Prop, x: number, z: number, rotY = 0): Prop => {
  prop.object.position.set(x, terrain.heightAt(x, z), z);
  prop.object.rotation.y = rotY;
  scene.add(prop.object);
  return prop;
};
place(createCrate({ seed: 2, palette }), 1.4, -1.2);
place(createCrate({ seed: 3, size: 0.8, palette }), 2.3, -0.6, 0.8);
lamps.push(place(createLamp({ seed: 4, light: true, palette }), -1.8, 1.4));
lamps.push(place(createLamp({ seed: 5, light: true, palette }), 3, 2.2));
lamps.push(place(createLamp({ seed: 6, light: true, palette }), 0.5, -14.5));

// --- Day-night cycle: one parameter drives sun, sky, fog and the lamps.
// Deep-linkable time of day: ?t=0.85 freezes the cycle at that moment.
const fixedTime = new URLSearchParams(location.search).get('t');
const cycle = createDayCycle({
  sky,
  rig,
  scene,
  lamps,
  palette,
  dayLength: 40, // fast days for the demo
  timeOfDay: fixedTime ? parseFloat(fixedTime) : 0.42,
});
if (!fixedTime) game.onUpdate((t) => cycle.update(t.delta));

// --- The forest: trees + rocks + bushes, ashore, off the road, out of camp.
const dryLand = aboveWater(terrain, water, 0.3);
const forest = scatter({
  seed: 21,
  area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
  surface: terrain.heightAt,
  density: 0.05,
  minSpacing: 1.6,
  items: [
    { create: (rng) => createTree({ seed: rng.int(1, 1e9), palette }), weight: 4, variants: 6 },
    { create: (rng) => createRock({ seed: rng.int(1, 1e9), palette }), weight: 1 },
    { create: (rng) => createBush({ seed: rng.int(1, 1e9), palette }), weight: 1 },
  ],
  mask: (x, z, y) => y < 3.6 && dryLand(x, z),
  keepOut: [{ center: { x: CAMP.x, z: CAMP.z }, radius: 8 }, ...road.keepOut],
});
scene.add(forest.group);

// --- Grass everywhere it makes sense (walk-through; excluded from road).
const grass = scatter({
  seed: 22,
  area: { min: { x: -38, z: -38 }, max: { x: 38, z: 38 } },
  surface: terrain.heightAt,
  density: 0.14,
  minSpacing: 0.7,
  items: [{ create: (rng) => createGrassTuft({ seed: rng.int(1, 1e9), palette }), variants: 8 }],
  mask: (x, z, y) => y < 3.4 && dryLand(x, z) && !road.contains(x, z),
});
scene.add(grass.group);

// --- Wind over everything green.
const wind = applyWind(forest.group, { strength: 0.05 });
const grassWind = applyWind(grass.group, { strength: 0.1, anchorHeight: 0 });
game.onUpdate((t) => {
  wind.update(t.delta);
  grassWind.update(t.delta);
});

// --- Life (GAMA): wardens patrol THE ROAD (its route is their Path),
// dodging trees via the forest's obstacle metadata.
const wardens: MotionAgent[] = [];
for (let i = 0; i < 3; i++) {
  const warden = game.world.spawn(`warden-${i}`);
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
  for (const agent of wardens) {
    const p = agent.owner.position;
    p.y = terrain.heightAt(p.x, p.z);
  }
});

createFlock(game, {
  count: 70,
  bounds: new Box3(new Vector3(-30, 8, -30), new Vector3(30, 18, 30)),
  color: 0x223047,
});

// --- Camera: slow orbit over the camp.
game.onUpdate((time) => {
  const t = time.elapsed * 0.045;
  game.camera.position.set(CAMP.x + Math.cos(t) * 33, CAMP.y + 16, CAMP.z + Math.sin(t) * 33);
  game.camera.lookAt(CAMP.x, CAMP.y + 2, CAMP.z);
});

game.start();
