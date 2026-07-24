import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { createBike, createCar, createTractor, createTruck } from '../src';

const spinOf = (vehicle: { object: Object3D }): number[] => {
  const angles: number[] = [];
  vehicle.object.traverse((node) => {
    // spin pivots are the Object3D children of steering pivots holding meshes
    if (node.children.length >= 2 && node.parent && node.parent.children.length === 1) {
      angles.push(node.rotation.x);
    }
  });
  return angles;
};

describe('vehicles', () => {
  it('wheels spin with speed, fronts steer, the wheel twirls', () => {
    const car = createCar({ seed: 3 });
    const before = spinOf(car);
    car.update(0.5, { speed: 4, steer: 0.3 });
    const after = spinOf(car);
    expect(after.some((a, i) => Math.abs(a - before[i]) > 0.5)).toBe(true);
    // Two front pivots yawed to the steer angle.
    let steered = 0;
    car.object.traverse((n) => {
      if (Math.abs(n.rotation.y - 0.3) < 1e-6) steered++;
    });
    expect(steered).toBe(2);
  });

  it('driver slots are drive-posed and GRIPS-placed', () => {
    const car = createCar({ seed: 1 });
    expect(car.slots!.map((s) => s.kind)).toEqual(['driver', 'passenger']);
    expect(car.slots![0].pose).toBe('drive');
    expect(car.slots![1].pose).toBe('sit');
    const truck = createTruck({ seed: 2 });
    expect(truck.slots![0].pose).toBe('drive');
    expect(truck.slots![0].anchor.position.y).toBeGreaterThan(0.5); // high cab
    const tractor = createTractor({ seed: 2 });
    expect(tractor.slots![0].pose).toBe('drive');
  });

  it('the bike carries a cycle slot, cranks its pedals and leans', () => {
    const bike = createBike({ seed: 4 });
    expect(bike.slots![0].pose).toBe('cycle');
    bike.update(0.4, { speed: 3, steer: 0.4 });
    expect(bike.object.rotation.z).toBeLessThan(-0.05); // leaning in
    bike.update(0.4, { speed: 3, steer: 0 });
    expect(Math.abs(bike.object.rotation.z)).toBeLessThan(1e-6);
  });

  it('footprints scale with the vehicle', () => {
    expect(createBike().obstacleRadius).toBeLessThan(createCar().obstacleRadius);
    expect(createCar().obstacleRadius).toBeLessThan(createTruck().obstacleRadius);
  });
});
