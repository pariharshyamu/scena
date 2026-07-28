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
  type CheckpointState,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 900);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
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
const pendingRespawns: Array<{ index: number; at: number }> = [];

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
const CHECK_STATES: CheckpointState[] = ['upcoming', 'active', 'passed'];
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
    coins.respawn(pendingRespawns.shift()!.index);
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

// Headless verification hook.
declare global {
  interface Window {
    arcadeDebug: () => Record<string, unknown>;
  }
}
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
};
