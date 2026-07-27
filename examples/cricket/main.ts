import { Clock, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import {
  applyFog,
  createBat,
  createCricketBall,
  createCricketGround,
  createLightingRig,
  createSky,
  createTree,
  PALETTES,
  PITCH_LENGTH,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 900);
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

const ground = createCricketGround({ seed: 3, boundary: 62 });
scene.add(ground.object);

// A ring of trees outside the rope, so the ground reads as a ground.
for (let i = 0; i < 22; i++) {
  const a = (i / 22) * Math.PI * 2;
  const tree = createTree({ seed: 40 + i, species: i % 3 === 0 ? 'pine' : 'oak', palette });
  tree.object.position.set(Math.cos(a) * 74, 0, Math.sin(a) * 74);
  scene.add(tree.object);
}

// The gear, standing at the striker's end.
const bat = createBat({ seed: 4 });
bat.object.position.copy(ground.strikerEnd).add(new Vector3(0.55, 0, 0));
bat.object.rotation.z = 0.3;
scene.add(bat.object);

const ball = createCricketBall({ seed: 2 });
scene.add(ball.object);

// A delivery on a loop: released at the bowler's end, pitching short of a
// length, taking the top of off — and the bails go.
const RELEASE = new Vector3(0, 2.1, PITCH_LENGTH / 2 - 0.4);
const vel = new Vector3();
let bounced = false;
let wait = 0;

const release = (): void => {
  ball.object.position.copy(RELEASE);
  // Aimed to pitch 5 m short of the stumps.
  const flight = (RELEASE.z + PITCH_LENGTH / 2 - 5) / 26;
  vel.set(0, (0.036 - RELEASE.y) / flight + 0.5 * 9.8 * flight, -26);
  bounced = false;
};
release();

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  ground.update(dt);
  if (wait > 0) {
    wait -= dt;
    if (wait <= 0) {
      ground.resetWicket();
      release();
    }
  } else {
    vel.y -= 9.8 * dt;
    ball.object.position.addScaledVector(vel, dt);
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
  const t = clock.elapsedTime;
  camera.position.set(Math.sin(t * 0.09) * 4, 2.6, PITCH_LENGTH / 2 + 6);
  camera.lookAt(0, 0.7, -PITCH_LENGTH / 2 + 1);
  renderer.render(scene, camera);
});

// Headless verification hook.
declare global {
  interface Window {
    cricketDebug: () => Record<string, unknown>;
  }
}
window.cricketDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    pitchLength: +ground.stumpsAt(-1).distanceTo(ground.stumpsAt(1)).toFixed(3),
    striker: ground.strikerEnd.toArray().map((n) => +n.toFixed(2)),
    ball: ball.object.position.toArray().map((n) => +n.toFixed(2)),
    overRope: ground.isBoundary(0, 63),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};
