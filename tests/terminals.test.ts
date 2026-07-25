import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { createTerminal, type Terminal, type TerminalStyle } from '../src';

const STYLES: TerminalStyle[] = ['atm', 'kiosk', 'vending'];
const world = (t: Terminal, o: { getWorldPosition: (v: Vector3) => Vector3 }): Vector3 => {
  t.object.updateWorldMatrix(true, true);
  return o.getWorldPosition(new Vector3());
};

describe('terminals', () => {
  it.each(STYLES)('%s stands on the floor and blocks the way', (style) => {
    const t = createTerminal({ style });
    const box = new Box3().setFromObject(t.object);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.min.y).toBeLessThan(0.06);
    expect(box.max.y).toBeGreaterThan(1.0);
    expect(t.obstacleRadius).toBeGreaterThan(0.3);
  });

  it.each(STYLES)('%s puts the user in front of it, facing it', (style) => {
    const t = createTerminal({ style });
    const at = world(t, t.slot.anchor);
    // In front (+z of the machine) and on the floor.
    expect(at.z).toBeGreaterThan(0.4);
    expect(at.y).toBeCloseTo(0, 2);
    // Facing the machine: the slot's +z points back at the origin.
    const facing = new Vector3(0, 0, 1).transformDirection(t.slot.anchor.matrixWorld);
    expect(facing.z).toBeLessThan(-0.8);
  });

  it.each(STYLES)('%s shows a screen the user can actually see', (style) => {
    const t = createTerminal({ style });
    t.object.updateWorldMatrix(true, true);
    const surface = t.screen.surface as Mesh;
    const normal = new Vector3(0, 0, 1).transformDirection(surface.matrixWorld);
    // Pointing out of the machine, toward whoever is standing at it.
    expect(normal.z).toBeGreaterThan(0.5);
    // Nothing in front of it: look at the screen from where the user stands.
    const centre = world(t, surface);
    const eye = centre.clone().addScaledVector(normal, 0.45);
    const hits = new Raycaster(eye, normal.clone().negate()).intersectObject(t.object, true);
    expect(hits[0]?.object.name).toBe('screen');
  });

  it.each(STYLES)('%s runs its queue back AWAY from the machine', (style) => {
    const t = createTerminal({ style });
    t.object.updateWorldMatrix(true, true);
    const head = world(t, t.line);
    // Each step back along the line's -z must get further from the machine.
    const machine = world(t, t.object);
    let last = head.distanceTo(machine);
    for (let d = 0.5; d <= 3; d += 0.5) {
      const at = t.line.localToWorld(new Vector3(0, 0, -d));
      const away = at.distanceTo(machine);
      expect(away).toBeGreaterThan(last);
      last = away;
    }
  });

  it.each(STYLES)('%s starts its queue behind the person being served', (style) => {
    const t = createTerminal({ style });
    t.object.updateWorldMatrix(true, true);
    const user = world(t, t.slot.anchor);
    const head = world(t, t.line);
    expect(head.z).toBeGreaterThan(user.z);
    // ...but not so far back that the first waiter is in another postcode.
    expect(head.z - user.z).toBeLessThan(0.6);
  });

  it('faces the queue at the machine, so waiters are not looking backwards', () => {
    const t = createTerminal({ style: 'atm' });
    t.object.updateWorldMatrix(true, true);
    const facing = new Vector3(0, 0, 1).transformDirection(t.line.matrixWorld);
    expect(facing.z).toBeLessThan(-0.8);
  });

  it('gives an ATM a keypad and a kiosk a map, unless told otherwise', () => {
    expect(createTerminal({ style: 'atm' }).screen.mode).toBe('keypad');
    expect(createTerminal({ style: 'kiosk' }).screen.mode).toBe('map');
    expect(createTerminal({ style: 'atm', mode: 'call' }).screen.mode).toBe('call');
  });

  it('stocks two vending machines differently', () => {
    // Counting meshes is not enough — two seeds can drop the same NUMBER of
    // items by coincidence, which they duly did. Compare what is actually
    // seeded: the goods themselves.
    const stock = (seed: number): string => {
      const out: string[] = [];
      createTerminal({ style: 'vending', seed }).object.traverse((o) => {
        const m = (o as Mesh).material as { color?: { getHexString(): string } } | undefined;
        if (m?.color) out.push(m.color.getHexString());
      });
      return out.join(',');
    };
    expect(stock(1)).toBe(stock(1));
    expect(stock(1)).not.toBe(stock(9));
  });

  it('publishes the slot through the standard Prop channel too', () => {
    const t = createTerminal({ style: 'kiosk' });
    expect(t.slots).toHaveLength(1);
    expect(t.slots?.[0]).toBe(t.slot);
    expect(t.slot.approach).toBeDefined();
  });

  it('survives being moved and turned', () => {
    const t = createTerminal({ style: 'atm' });
    t.object.position.set(5, 0, -3);
    t.object.rotation.y = Math.PI / 2;
    t.object.updateWorldMatrix(true, true);
    const user = world(t, t.slot.anchor);
    // Rotated a quarter turn, "in front" is now +x.
    expect(user.x).toBeGreaterThan(5.3);
    expect(user.z).toBeCloseTo(-3, 1);
    const back = t.line.localToWorld(new Vector3(0, 0, -2));
    expect(back.x).toBeGreaterThan(user.x);
  });
});
