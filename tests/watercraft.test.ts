import { describe, expect, it } from 'vitest';
import { createBoat, createShip } from '../src';

describe('watercraft', () => {
  it('rides bound water: height, pitch and roll follow the samples', () => {
    const boat = createBoat({ seed: 3 });
    boat.update(0.1); // no water bound: no-op
    expect(boat.object.position.y).toBe(0);
    // A tilted "sea": higher toward +z (bow-up) and +x.
    boat.float((x, z) => 0.5 + 0.1 * z + 0.06 * x);
    boat.update(0.1);
    expect(boat.object.position.y).toBeGreaterThan(0.3); // floated up
    expect(boat.object.rotation.x).toBeLessThan(-0.02); // bow-up pitch
    expect(Math.abs(boat.object.rotation.z)).toBeGreaterThan(0.01); // heel
  });

  it('helm slots seat the crew (boat sits, ship drives)', () => {
    const boat = createBoat();
    expect(boat.slots!.map((s) => s.kind)).toEqual(['helm', 'passenger']);
    expect(boat.slots![0].pose).toBe('sit');
    const ship = createShip();
    expect(ship.slots![0].pose).toBe('drive');
    expect(ship.slots![0].anchor.position.y).toBeGreaterThan(2.5); // on the bridge
    expect(ship.obstacleRadius).toBeGreaterThan(boat.obstacleRadius * 2);
  });

  it('is seed-deterministic', () => {
    const a = createShip({ seed: 9 });
    const b = createShip({ seed: 9 });
    expect(a.object.children.length).toBe(b.object.children.length);
  });
});
