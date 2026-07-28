import {
  BoxGeometry,
  ConeGeometry,
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
  createEffects,
  createLightingRig,
  createMarks,
  createSky,
  createSurface,
  createTrail,
  PALETTES,
} from 'scena3d';

const palette = PALETTES.meadow;
const scene = new Scene();
const camera = new PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 900);
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
  createSurface('slate', { seed: 4, color: 0x707880 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// The three systems under test.
const fx = createEffects({ seed: 7 });
const marks = createMarks({ seed: 2, fade: 22 });
const trail = createTrail({ color: 0x8fd0ff, width: 0.34, life: 0.8 });
scene.add(fx.group, marks.mesh, trail.mesh);

// THE KART writes its cornering on the ground. It laps an ellipse, so one
// end is a tight corner and the other a straight — skids appear where the
// turn is hard and stop where it is not, which is the whole point of a
// mark: it records something that HAPPENED, not something placed.
const kart = new Mesh(new BoxGeometry(0.8, 0.4, 0.5), createSurface('paint', { seed: 8, color: 0x2f6fd0 }));
kart.position.y = 0.25;
scene.add(kart);
const kartPos = new Vector3();
const kartDir = new Vector3();
let lastSkid = new Vector3(1e9, 0, 0);

// THE BALL raises dust where it lands.
const ball = new Mesh(new SphereGeometry(0.45, 24, 16), createSurface('terracotta', { seed: 5 }));
scene.add(ball);
let wasAirborne = false;

// THE GRINDER throws sparks; now and then it burns a scorch into the ground.
const grinder = new Mesh(new ConeGeometry(0.5, 1.1, 6), createSurface('steel', { seed: 6 }));
grinder.position.set(4.4, 0.55, -2.9);
scene.add(grinder);
let nextSpark = 0.8;
let nextScorch = 5;

// FOOTPRINTS: an invisible walker circles the grinder, feet alternating
// either side of its path.
let walked = 0;
let leftFoot = false;
const walkerPos = new Vector3();
const walkerDir = new Vector3();

let nextConfetti = 3;

// r185 deprecates THREE.Clock; the loop's own timestamp is all we need.
let last = 0;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(Math.max(t - last, 0), 0.1);
  last = t;

  // Kart on an ellipse: tight at ±x, easy on the straights.
  const a = t * 0.9;
  kartPos.set(Math.sin(a) * 5.0, 0.25, Math.cos(a) * 2.8);
  kartDir.set(Math.cos(a) * 5.0, 0, -Math.sin(a) * 2.8).normalize();
  kart.position.copy(kartPos);
  kart.rotation.y = Math.atan2(kartDir.x, kartDir.z) + Math.PI / 2;
  trail.push(kartPos);
  // Curvature of the ellipse is highest where |sin| ≈ 1 — skid there.
  const cornering = Math.abs(Math.sin(a));
  if (cornering > 0.82 && kartPos.distanceTo(lastSkid) > 0.45) {
    marks.stamp('skid', kartPos, kartDir, { length: 1.1, strength: 0.6 });
    lastSkid = lastSkid.copy(kartPos);
  }

  // Ball on a decaying-free bounce: height is |sin|, squashed near ground.
  const phase = t * 2.4;
  const height = Math.abs(Math.sin(phase)) * 2.2;
  ball.position.set(-3.6 + Math.sin(t * 0.35) * 1.2, 0.45 + height, 2.2);
  const airborne = height > 0.05;
  if (wasAirborne && !airborne) {
    fx.burst('dust', ball.position, { direction: new Vector3(0, 1, 0) });
    fx.ring(new Vector3(ball.position.x, 0.02, ball.position.z), { radius: 1.2 });
  }
  wasAirborne = airborne;

  // Sparks off the grinder tip, biased outward.
  if (t > nextSpark) {
    nextSpark += 0.9;
    fx.burst('sparks', new Vector3(4.4, 1.15, -2.9), {
      direction: new Vector3(-0.6, 0.8, 0.3),
    });
  }
  if (t > nextScorch) {
    nextScorch += 7;
    marks.stamp('scorch', new Vector3(4.4 - Math.sin(t) * 1.2, 0, -1.9));
  }

  // The walker's footprints, alternating either side of the path.
  walked += dt * 1.3;
  const wa = walked / 2.2;
  walkerPos.set(4.4 + Math.cos(wa) * 2.0, 0, -2.9 + Math.sin(wa) * 2.0);
  walkerDir.set(-Math.sin(wa), 0, Math.cos(wa));
  if (walked % 0.55 < dt * 1.3) {
    leftFoot = !leftFoot;
    const side = new Vector3(-walkerDir.z, 0, walkerDir.x).multiplyScalar(leftFoot ? 0.09 : -0.09);
    marks.stamp('footprint', walkerPos.clone().add(side), walkerDir);
  }

  // And every few seconds, a reason to celebrate.
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

// Headless verification hook.
declare global {
  interface Window {
    feelDebug: () => Record<string, unknown>;
  }
}
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
};
