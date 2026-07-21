import { Box3, Vector3 } from 'three';
import { buildScene, assembleKit, PALETTES, type SceneManifest } from 'scena3d';
import { Game, MotionAgent, FollowPath, Path, ObstacleAvoidance, Separation } from 'gama3d';
import { createFlock, createCapsulePerson } from 'gama3d/templates';

// ---------------------------------------------------------------------------
// The whole world is this one JSON object: store it, diff it, ship it over
// the network, hand it to a level editor. buildScene() does the wiring the
// forest demo does by hand (shores, road keep-outs, village clearing, lamps
// into the day cycle).
// ---------------------------------------------------------------------------
const manifest: SceneManifest = {
  seed: 18,
  palette: 'autumn',
  terrain: { size: 90, amplitude: 5 },
  water: { level: 0.25 },
  fog: 'haze',
  dayCycle: { dayLength: 40, timeOfDay: 0.42 },
  paths: [
    {
      points: [
        { x: -18, z: -10 }, { x: 0, z: -16 }, { x: 16, z: -6 },
        { x: 14, z: 12 }, { x: -2, z: 14 }, { x: -20, z: 6 },
      ],
      width: 2.2,
      loop: true,
    },
  ],
  village: { radius: 9, houses: 5 },
  scatters: [
    {
      density: 0.05,
      minSpacing: 1.6,
      items: [
        { type: 'tree', weight: 4, variants: 6 },
        { type: 'rock' },
        { type: 'bush' },
      ],
      maxHeight: 3.6,
      lod: { distance: 34, tileSize: 14 }, // far tiles become single cones
    },
    {
      density: 0.14,
      minSpacing: 0.7,
      items: [{ type: 'grass', variants: 8 }],
      maxHeight: 3.4,
    },
  ],
};

const game = new Game();
const params = new URLSearchParams(location.search);
const fixedTime = params.get('t');
const cameraStart = parseFloat(params.get('cam') ?? '0'); // orbit start angle
if (fixedTime) {
  manifest.dayCycle = { dayLength: 1e9, timeOfDay: parseFloat(fixedTime) };
}
const world = buildScene(manifest, game.world.scene);
game.onUpdate((t) => world.update(t.delta));

// --- A hilltop fort from an ASCII kit map — snapped to the KIT_UNIT grid.
const fort = assembleKit(
  [
    '#########',
    '#...T...#',
    '#.......#',
    'D...S...#',
    '#.......#',
    '#...T...#',
    '#########',
  ],
  { palette: PALETTES.autumn, torchLights: 2 }
);
const FORT = { x: 30, z: 26 };
fort.group.position.set(FORT.x, world.heightAt(FORT.x, FORT.z), FORT.z);
game.world.scene.add(fort.group);
const fortObstacles = fort.obstacles.map((o) => ({
  center: o.center.clone().add(fort.group.position),
  radius: o.radius,
}));

// --- Life (GAMA): wardens patrol the manifest's road, avoiding everything
// the manifest reported as an obstacle (village, forest, fort walls).
const obstacles = [...world.obstacles, ...fortObstacles];
const road = world.paths[0];
const wardens: MotionAgent[] = [];
for (let i = 0; i < 3; i++) {
  const warden = game.world.spawn(`warden-${i}`);
  warden.add(createCapsulePerson([0x60a5fa, 0xf87171, 0xfbbf24][i]));
  const patrol = new Path(road.route.map((p) => p.clone()), true);
  for (let s = 0; s < (i * road.route.length) / 3; s++) patrol.advance();
  warden.position.copy(patrol.current());
  const agent = warden.addComponent(new MotionAgent({ maxSpeed: 4.5, maxForce: 30, planar: true }));
  agent.addBehavior(new FollowPath(patrol, 1.6));
  agent.addBehavior(new ObstacleAvoidance(() => obstacles, 3.5, 0.5), 2.5);
  agent.addBehavior(new Separation(() => wardens, 1.6), 1.2);
  wardens.push(agent);
}
game.onUpdate(() => {
  for (const agent of wardens) {
    const p = agent.owner.position;
    p.y = world.heightAt(p.x, p.z);
  }
});

createFlock(game, {
  count: 60,
  bounds: new Box3(new Vector3(-30, 8, -30), new Vector3(30, 18, 30)),
  color: 0x2c2437,
});

// --- Camera: slow orbit; drives the LOD tiles too.
game.onUpdate((time) => {
  const t = cameraStart + time.elapsed * 0.045;
  const y = world.heightAt(0, 0);
  game.camera.position.set(Math.cos(t) * 34, y + 17, Math.sin(t) * 34);
  game.camera.lookAt(0, y + 2, 0);
  for (const s of world.scatters) s.update?.(game.camera);
});

game.start();
