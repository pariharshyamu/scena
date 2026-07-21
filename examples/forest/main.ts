import { Box3, Vector3 } from 'three';
import {
  createTerrain,
  createSky,
  createLightingRig,
  applyFog,
  createTree,
  createRock,
  createCrate,
  createLamp,
  createFence,
  scatter,
  PALETTES,
} from 'scena3d';
import { Game, MotionAgent, FollowPath, Path, ObstacleAvoidance, Separation } from 'gama3d';
import { createFlock, createCapsulePerson } from 'gama3d/templates';

const palette = PALETTES.meadow;
const game = new Game();
const scene = game.world.scene;

// --- The world (SCENA): terrain, sky, light, fog — all from one seed.
const terrain = createTerrain({ seed: 20, size: 90, amplitude: 5, palette });
scene.add(terrain.mesh);
const sky = createSky({ palette });
scene.add(sky.mesh);
scene.add(createLightingRig('golden-hour').group);
applyFog(scene, 'haze', palette);

// --- The forest: trees + rocks scattered with clumping, kept out of camp.
const CAMP = new Vector3(0, 0, 0);
CAMP.y = terrain.heightAt(0, 0);
const forest = scatter({
  seed: 21,
  area: { min: { x: -40, z: -40 }, max: { x: 40, z: 40 } },
  surface: terrain.heightAt,
  density: 0.055,
  minSpacing: 1.6,
  items: [
    { create: (rng) => createTree({ seed: rng.int(1, 1e9), palette }), weight: 4, variants: 6 },
    { create: (rng) => createRock({ seed: rng.int(1, 1e9), palette }), weight: 1 },
  ],
  mask: (_x, _z, y) => y < 3.6, // keep peaks bare
  keepOut: [{ center: { x: CAMP.x, z: CAMP.z }, radius: 9 }],
});
scene.add(forest.group);

// --- The camp: crates, lamps and a fence line in the clearing.
const placeProp = (prop: { object: { position: Vector3; rotation: { y: number } } }, x: number, z: number, rotY = 0) => {
  prop.object.position.set(x, terrain.heightAt(x, z), z);
  prop.object.rotation.y = rotY;
  scene.add(prop.object as never);
};
placeProp(createCrate({ seed: 2, palette }), 1.4, -1.2);
placeProp(createCrate({ seed: 3, size: 0.8, palette }), 2.3, -0.6, 0.8);
placeProp(createLamp({ seed: 4, light: true, palette }), -1.8, 1.4);
placeProp(createLamp({ seed: 5, light: true, palette }), 3, 2.2);
placeProp(createFence({ seed: 6, length: 7, palette }), 0, 4.4);

// --- Life (GAMA): wardens patrol a loop through the forest, dodging
// trees via the forest's own obstacle metadata; birds flock overhead.
const routePoints = [
  new Vector3(-16, 0, -12), new Vector3(14, 0, -16),
  new Vector3(20, 0, 10), new Vector3(-4, 0, 18), new Vector3(-20, 0, 6),
].map((p) => p.setY(terrain.heightAt(p.x, p.z)));

const wardens: MotionAgent[] = [];
for (let i = 0; i < 3; i++) {
  const warden = game.world.spawn(`warden-${i}`);
  warden.add(createCapsulePerson([0x60a5fa, 0xf87171, 0xfbbf24][i]));
  const path = new Path(routePoints.map((p) => p.clone()), true);
  for (let s = 0; s < i * 2 - 0; s++) path.advance();
  warden.position.copy(path.current());
  const agent = warden.addComponent(new MotionAgent({ maxSpeed: 4.5, maxForce: 30, planar: true }));
  agent.addBehavior(new FollowPath(path, 1.5));
  agent.addBehavior(new ObstacleAvoidance(() => forest.obstacles, 3.5, 0.5), 2.5);
  agent.addBehavior(new Separation(() => wardens, 1.6), 1.2);
  wardens.push(agent);
}
// Clamp wardens to the terrain: SCENA's height function IS the ground truth.
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
  const t = time.elapsed * 0.05;
  game.camera.position.set(
    CAMP.x + Math.cos(t) * 34,
    CAMP.y + 17,
    CAMP.z + Math.sin(t) * 34
  );
  game.camera.lookAt(CAMP.x, CAMP.y + 2, CAMP.z);
});

game.start();
