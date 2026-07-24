import { Clock, Mesh, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import {
  applyFog,
  createBike,
  createCar,
  createLightingRig,
  createSky,
  createSurface,
  createTractor,
  createTruck,
  PALETTES,
  type VehicleProp,
} from 'scena3d';

const palette = PALETTES.urban;
const scene = new Scene();
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 800);
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
const court = new Mesh(new PlaneGeometry(120, 120), createSurface('concrete', { seed: 1 }));
court.rotation.x = -Math.PI / 2;
scene.add(court);

// Parked: tractor and truck.
const tractor = createTractor({ seed: 5, palette });
tractor.object.position.set(-9, 0, -6);
tractor.object.rotation.y = 0.7;
scene.add(tractor.object);
const truck = createTruck({ seed: 6, palette });
truck.object.position.set(9, 0, -8);
truck.object.rotation.y = -0.5;
scene.add(truck.object);

// Lapping: the car (outer ring) and the bike (inner ring, opposite way).
interface Lap {
  vehicle: VehicleProp;
  radius: number;
  speed: number;
  direction: 1 | -1;
  angle: number;
}
const car = createCar({ seed: 7, palette });
scene.add(car.object);
const bike = createBike({ seed: 8, palette });
scene.add(bike.object);
const laps: Lap[] = [
  { vehicle: car, radius: 13, speed: 6, direction: 1, angle: 0 },
  { vehicle: bike, radius: 7, speed: 3.2, direction: -1, angle: Math.PI },
];

const clock = new Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  for (const lap of laps) {
    lap.angle += (lap.direction * lap.speed * dt) / lap.radius;
    const { vehicle, radius, angle, direction } = lap;
    vehicle.object.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    // Facing the direction of travel (tangent), steering into the circle.
    vehicle.object.rotation.y = -angle + (direction === 1 ? 0 : Math.PI);
    vehicle.update(dt, { speed: lap.speed, steer: 0.32 * direction });
  }
  tractor.update(dt, { speed: 0, steer: 0 });
  truck.update(dt, { speed: 0, steer: 0 });
  const t = clock.elapsedTime;
  camera.position.set(Math.sin(t * 0.07) * 22, 8.5, 24);
  camera.lookAt(0, 0.8, -2);
  renderer.render(scene, camera);
});

// Headless verification hook.
declare global {
  interface Window {
    vehiclesDebug: () => Record<string, unknown>;
  }
}
window.vehiclesDebug = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  return {
    glError: gl.getError(),
    carPos: car.object.position.toArray().map((n) => +n.toFixed(2)),
    bikeLean: +bike.object.rotation.z.toFixed(3),
    driverSlots: [car, bike, tractor, truck].map((v) => v.slots![0].pose),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};
