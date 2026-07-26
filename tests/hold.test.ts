import { describe, it, expect } from 'vitest';
import { Object3D, Vector3 } from 'three';
import {
  createHold,
  createDeckedShip,
  freeSurfaceCost,
  holdPoint,
  HOLD_KINDS,
  type Hold,
  type HoldKind,
} from '../src';

const deg = (r: number): number => (r * 180) / Math.PI;

/** Load every dry hold and leave the tanks alone. */
const laden = (h: Hold, share = 0.8): void => {
  for (const c of h.compartments) {
    if (!c.liquid && c.name !== 'bilge') h.load(c.name, c.capacity * share);
  }
};

/** The world-space up vector of a named liquid surface. */
const surfaceUp = (h: Hold, name: string, root: Object3D): Vector3 => {
  root.updateMatrixWorld(true);
  const s = h.object.getObjectByName(`surface:${name}`);
  if (!s) throw new Error(`no surface ${name}`);
  return new Vector3(0, 1, 0).applyQuaternion(s.getWorldQuaternion(s.quaternion.clone()));
};

describe('the weight is not the problem — the fact that it can move is', () => {
  it('a slack tank costs her stability and a pressed-up one costs her none', () => {
    const h = createHold({ kind: 'steamer' });
    laden(h);
    const dry = h.gm;
    expect(h.freeSurface).toBe(0);

    h.load('ballast', h.at('ballast')!.capacity * 0.5);
    const slack = h.gm;
    expect(h.at('ballast')!.slack).toBe(true);
    expect(h.freeSurface, 'a slack tank cost her nothing at all').toBeGreaterThan(0.5);
    expect(slack, 'half a tank of ballast made her no worse').toBeLessThan(dry - 0.5);

    h.load('ballast', h.at('ballast')!.capacity);
    expect(h.at('ballast')!.slack).toBe(false);
    expect(h.freeSurface, 'a pressed-up tank still has a free surface').toBe(0);
    // MORE WATER, MORE STABLE. The weight went up and so did the GM, which is
    // the fact the whole module exists for.
    expect(h.gm, 'filling the tank did not put her back').toBeGreaterThan(slack + 0.5);
  });

  it('pumping her OUT takes her through the dangerous part', () => {
    const h = createHold({ kind: 'steamer' });
    laden(h);
    h.load('ballast', h.at('ballast')!.capacity);
    const pressed = h.gm;
    const seen: number[] = [];
    h.pump('ballast', 0);
    for (let i = 0; i < 40000; i++) {
      h.update(1 / 20);
      seen.push(h.gm);
    }
    const empty = h.gm;
    const worst = Math.min(...seen);
    expect(h.at('ballast')!.level).toBeLessThan(0.01);
    // Both ends are safe and the road between them is not: emptying a tank is
    // a decision with a bottom in the middle of it.
    expect(worst, 'the way out was no worse than either end').toBeLessThan(
      Math.min(pressed, empty) - 0.4
    );
  });

  it('the penalty goes as the WIDTH CUBED and not as the depth at all', () => {
    const one = freeSurfaceCost(8, 30, 2000);
    const half = freeSurfaceCost(4, 30, 2000);
    expect(one / half).toBeCloseTo(8, 5);
    // …so splitting a tank down the middle divides its cost by four.
    expect(2 * half).toBeCloseTo(one / 4, 6);
  });

  it('a liner is subdivided and a tanker is not, and it shows', () => {
    const liner = createHold({ kind: 'liner' });
    const tanker = createHold({ kind: 'tanker' });
    for (const h of [liner, tanker]) {
      for (const c of h.compartments) {
        if (c.liquid && c.name !== 'bilge') h.load(c.name, c.capacity * 0.5);
      }
    }
    // Relative to her own displacement: the liner's four narrow tanks cost her
    // almost nothing and the tanker's three full-width ones nearly cost her
    // the ship. That is the whole reason one of them carries people.
    expect(liner.freeSurface).toBeLessThan(0.2);
    expect(tanker.freeSurface).toBeGreaterThan(3);
    expect(tanker.state === 'tender' || tanker.state === 'lost').toBe(true);
  });

  it('a slack surface tilts and a pressed-up one cannot', () => {
    const ship = createDeckedShip({ era: 'steamer' });
    const h = createHold({ kind: 'steamer' });
    ship.object.add(h.object);
    laden(h);
    // Put her over to starboard so there is something to run to.
    h.unload('main', 200);
    h.load('fore', 0);
    h.load('ballast', h.at('ballast')!.capacity * 0.5);
    ship.float(() => 0);
    ship.update(1 / 60, { loading: h.loading });

    h.load('fore', 260);
    ship.update(1 / 60, { loading: h.loading });
    expect(Math.abs(h.loading.trim), 'nothing to counter-rotate').toBeGreaterThan(0.01);
    const slackUp = surfaceUp(h, 'ballast', ship.object);
    // A LIQUID STAYS LEVEL. The hull leans and the surface does not, which is
    // exactly what you see looking down a tank: level water against a tilted
    // floor, deeper on the low side.
    expect(slackUp.y, 'the surface leaned over with the ship').toBeGreaterThan(0.999);

    h.load('ballast', h.at('ballast')!.capacity);
    ship.update(1 / 60, { loading: h.loading });
    const pressedRot = h.object.getObjectByName('surface:ballast')!.rotation;
    expect(Math.abs(pressedRot.z) + Math.abs(pressedRot.x)).toBeLessThan(1e-9);
  });
});

describe('where you put it, not how much of it', () => {
  it('the same tonnage forward and aft trims her opposite ways, equally', () => {
    const fore = createHold({ kind: 'steamer' });
    const aft = createHold({ kind: 'steamer' });
    fore.load('fore', 200);
    aft.load('aft', 200);
    expect(fore.loading.trim).toBeGreaterThan(0.005);
    expect(aft.loading.trim).toBeLessThan(-0.005);
    // Her holds are not symmetric about midships, so this is a ratio and not
    // an equality — but it is the same order, and it is opposite.
    expect(Math.abs(fore.loading.trim / aft.loading.trim)).toBeGreaterThan(0.5);
    expect(Math.abs(fore.loading.trim / aft.loading.trim)).toBeLessThan(2);
    // And the same weight amidships does nothing at all.
    const mid = createHold({ kind: 'steamer' });
    mid.load('main', 200);
    expect(Math.abs(mid.loading.trim)).toBeLessThan(1e-9);
  });

  it('positive trim is down by the head, and the hull agrees', () => {
    const ship = createDeckedShip({ era: 'steamer' });
    ship.float(() => 0);
    ship.update(1 / 60, {});
    const level = ship.object.localToWorld(new Vector3(0, 0, 20)).y;
    ship.update(1 / 60, { loading: { trim: 0.08 } });
    const down = ship.object.localToWorld(new Vector3(0, 0, 20)).y;
    const stern = ship.object.localToWorld(new Vector3(0, 0, -20)).y;
    expect(stern, 'her stern did not come up as her bow went down').toBeGreaterThan(level);
    // The BOW, not the number. A sign error here reads back out of the model
    // perfectly and puts her stem in the air.
    expect(down, 'down by the head lifted her bow').toBeLessThan(level - 0.5);
  });

  it('a list to starboard puts her starboard side down', () => {
    const ship = createDeckedShip({ era: 'steamer' });
    ship.float(() => 0);
    ship.update(1 / 60, { loading: { list: 0.1 } });
    const stbd = ship.object.localToWorld(new Vector3(4, 0, 0)).y;
    const port = ship.object.localToWorld(new Vector3(-4, 0, 0)).y;
    expect(stbd).toBeLessThan(port);
  });

  it('cargo stowed to one side lists her, and the geometry goes with it', () => {
    const h = createHold({ kind: 'steamer' });
    h.load('main', 300, 0);
    expect(Math.abs(h.loading.list)).toBeLessThan(1e-9);
    const centred = h.object.getObjectByName('stow:main')!.position.x;
    expect(centred).toBeCloseTo(0, 6);

    const g = createHold({ kind: 'steamer' });
    g.load('main', 300, 1);
    expect(g.at('main')!.offset).toBeGreaterThan(1);
    expect(g.loading.list, 'stowing her cargo hard to starboard did nothing').toBeGreaterThan(
      0.05
    );
    // The cargo has to BE there, not merely be counted there. Moving the mesh
    // and leaving the tonnage on the centreline reads as a laden ship with a
    // list of exactly zero.
    expect(g.object.getObjectByName('stow:main')!.position.x).toBeCloseTo(
      g.at('main')!.offset,
      6
    );
    // A liquid finds its own level and cannot be stowed anywhere.
    const t = createHold({ kind: 'steamer' });
    t.load('ballast', 100, 1);
    expect(t.at('ballast')!.offset).toBe(0);
  });

  it('there is an angle past which she does not come back', () => {
    const h = createHold({ kind: 'steamer' });
    h.load('main', 380, 1);
    h.load('fore', 300, 1);
    // GZ = GM·sin θ, so there is a moment she cannot answer at all — and an
    // `atan` would have returned a perfectly serene eighty-four degrees.
    expect(h.capsized).toBe(true);
    expect(Math.abs(h.loading.list)).toBeCloseTo(h.vanishing, 6);
    expect(h.state).toBe('lost');
    expect(h.gm, 'she went over with plenty of stability and nothing to use it on').toBeGreaterThan(
      0
    );
  });

  it('a tonne athwartships does far more than a tonne fore and aft', () => {
    const h = createHold({ kind: 'liner' });
    laden(h, 0.5);
    h.load('ballastS1', 400);
    h.load('ballastS2', 400);
    const list = Math.abs(h.loading.list);
    const g = createHold({ kind: 'liner' });
    laden(g, 0.5);
    g.load('fore', 800);
    const trim = Math.abs(g.loading.trim);
    // She is long and she is not wide: the longitudinal metacentric height is
    // an order up on the transverse one, and that is why nobody worries about
    // trim and everybody worries about list.
    expect(list).toBeGreaterThan(trim * 3);
  });

  it('SHE IS IN THE WATER, at every load, and that is measured off the hull', () => {
    // The claim nothing else here makes: not that the numbers agree with each
    // other, but that the mesh is wet. A hold measuring its sinkage from its
    // own load line while the hull was drawn to a different one lifts the
    // whole ship clear of the sea, at every load, with every number correct.
    const ship = createDeckedShip({ era: 'steamer' });
    expect(ship.draft).toBeGreaterThan(0);
    const h = createHold({ kind: 'steamer', draft: ship.draft });
    ship.object.add(h.object);
    ship.float(() => 0);

    for (const load of [0, 0.3, 0.8, 1]) {
      const g = createHold({ kind: 'steamer', draft: ship.draft });
      laden(g, load);
      const s2 = createDeckedShip({ era: 'steamer' });
      s2.float(() => 0);
      for (let i = 0; i < 240; i++) s2.update(1 / 60, { loading: g.loading });
      s2.object.updateMatrixWorld(true);
      // Her keel, in world space. The sea is at zero.
      const keel = s2.object.localToWorld(new Vector3(0, -s2.draft, 0)).y;
      expect(keel, `at ${load} of capacity her keel is out of the water`).toBeLessThan(-0.05);
      // …and her main deck is NOT under it.
      const deck = s2.object.localToWorld(new Vector3(0, s2.freeboard, 0)).y;
      expect(deck, `at ${load} of capacity her deck is awash`).toBeGreaterThan(0.05);
      // How deep she floats is how deep she floats: keel to the sea.
      expect(-keel).toBeCloseTo(g.draught, 1);
    }
  });

  it('sinkage is real metres and it comes off her freeboard', () => {
    const h = createHold({ kind: 'steamer' });
    const light = h.draught;
    const board = h.freeboard;
    laden(h);
    expect(h.draught).toBeGreaterThan(light + 1);
    expect(h.freeboard).toBeLessThan(board - 1);
    expect(h.loading.sink).toBeCloseTo(h.draught - 3.6, 5);
    // …and against a hull's datum instead, it is measured from THAT.
    const g = createHold({ kind: 'steamer', draft: 2.6 });
    laden(g);
    expect(g.loading.sink).toBeCloseTo(g.draught - 2.6, 5);
    expect(h.toMarks).toBeGreaterThan(0.5);
  });
});

describe('an empty ship is not a safe ship', () => {
  it.each(HOLD_KINDS)('%s: light she is stiff, laden she is not', (kind: HoldKind) => {
    const h = createHold({ kind });
    const lightGm = h.gm;
    const lightRoll = h.rollPeriod;
    expect(h.state).toBe('light');
    if (kind === 'tanker') {
      for (const c of h.compartments) {
        if (c.liquid && c.name !== 'bilge') h.load(c.name, c.capacity);
      }
    } else {
      laden(h);
    }
    expect(h.gm, `${kind}: loading her did not settle her down`).toBeLessThan(lightGm);
    // A short roll period is a violent one. Light, she snaps back.
    expect(h.rollPeriod).toBeGreaterThan(lightRoll);
    expect(h.state).toBe('laden');
  });

  it('a stiff ship answers the sea faster, and the hull knows it', () => {
    const h = createHold({ kind: 'steamer' });
    expect(h.state).toBe('light');
    const stiff = h.loading.stiffness;
    laden(h);
    expect(h.loading.stiffness, 'loading her did not slow her down').toBeLessThan(stiff);
    expect(stiff).toBeGreaterThan(1.0);
  });

  it('a light ship races her screw', () => {
    const h = createHold({ kind: 'steamer' });
    expect(h.immersion).toBeLessThan(0.35);
    laden(h);
    expect(h.immersion).toBeGreaterThan(0.7);
  });

  it('a ship with no positive stability has no roll period at all', () => {
    const h = createHold({ kind: 'tanker' });
    for (const c of h.compartments) {
      if (c.liquid && c.name !== 'bilge') h.load(c.name, c.capacity * 0.5);
    }
    // Take her the rest of the way with a wide slack bilge.
    h.holed(60);
    for (let i = 0; i < 400; i++) h.update(1);
    if (h.gm <= 0) {
      expect(h.rollPeriod, 'a clamped square root reported "very slow" for "never"').toBe(
        Infinity
      );
      expect(h.lolling).toBe(true);
      expect(h.state).toBe('lost');
    } else {
      expect(Number.isFinite(h.rollPeriod)).toBe(true);
    }
  });
});

describe('the sea gets in faster than the pump gets it out', () => {
  it('a hole beats the bilge pump, which is why you go for the hole', () => {
    const h = createHold({ kind: 'steamer' });
    laden(h, 0.5);
    h.holed(0.4);
    h.pumpBilge(true);
    expect(h.pumping).toBe(true);
    for (let i = 0; i < 600; i++) h.update(1 / 10);
    expect(h.bilge, 'the pump held it, so nothing is at stake').toBeGreaterThan(5);
    const rising = h.bilge;
    h.holed(0);
    for (let i = 0; i < 600; i++) h.update(1 / 10);
    expect(h.bilge, 'stopping the leak did not let her gain on it').toBeLessThan(rising);
  });

  it('bilge water is the widest free surface she has', () => {
    const h = createHold({ kind: 'steamer' });
    laden(h);
    const dry = h.gm;
    h.holed(0.5);
    for (let i = 0; i < 400; i++) h.update(1 / 5);
    // Forty tonnes of water in the bottom is not the problem. Forty tonnes of
    // water free to run the full width of her is.
    expect(h.bilge).toBeGreaterThan(20);
    expect(h.freeSurface).toBeGreaterThan(0.3);
    expect(h.gm).toBeLessThan(dry - 0.3);
  });
});

describe('what you can do about it', () => {
  it('a carrack has no pumps and her cargo moves at walking pace', () => {
    const h = createHold({ kind: 'carrack' });
    h.load('hold', 100);
    // Nothing to pump: every compartment she has is dry.
    expect(h.compartments.filter((c) => c.liquid && c.name !== 'bilge').length).toBe(0);
    h.pump('hold', 1);
    expect(h.at('hold')!.load).toBe(100);
  });

  it('shifting cargo takes time, and that is the era axis', () => {
    const h = createHold({ kind: 'steamer' });
    h.load('fore', 200);
    const asked = h.shift('fore', 'aft', 100);
    expect(asked).toBe(100);
    // Not instantly. A gang moving cargo by hand is minutes a tonne, and it
    // is the whole difference between a hold and a ballast tank.
    h.update(1);
    expect(h.at('aft')!.load).toBeGreaterThan(0);
    expect(h.at('aft')!.load).toBeLessThan(10);
    for (let i = 0; i < 4000; i++) h.update(1);
    expect(h.at('aft')!.load).toBeCloseTo(100, 1);
    expect(h.at('fore')!.load).toBeCloseTo(100, 1);
  });

  it('the pumps are quicker than the gang by a wide margin', () => {
    const a = createHold({ kind: 'steamer' });
    a.pump('ballast', 1);
    let pumped = 0;
    while (a.at('ballast')!.level < 0.99 && pumped < 100000) {
      a.update(0.5);
      pumped += 0.5;
    }
    const b = createHold({ kind: 'steamer' });
    b.load('fore', 260);
    b.shift('fore', 'aft', 260);
    let shifted = 0;
    while (b.at('aft')!.load < 259 && shifted < 100000) {
      b.update(0.5);
      shifted += 0.5;
    }
    expect(pumped).toBeLessThan(shifted / 4);
  });

  it('a hold takes what will fit and hands back the rest', () => {
    const h = createHold({ kind: 'carrack' });
    const over = h.load('hold', 1e6);
    expect(over).toBeGreaterThan(0);
    expect(h.at('hold')!.level).toBeCloseTo(1, 6);
    expect(h.unload('hold', 1e6)).toBeCloseTo(h.at('hold')!.capacity, 6);
    expect(h.load('nowhere', 10)).toBe(10);
    expect(h.unload('nowhere', 10)).toBe(0);
  });
});

describe('structure, states and the shape of the thing', () => {
  it('she tells you when she has gone, and only once', () => {
    const h = createHold({ kind: 'steamer' });
    const seen: string[] = [];
    h.onState = (s) => seen.push(s);
    laden(h);
    expect(seen).toContain('laden');
    // Overload her until there is no side left.
    expect(h.state).toBe('laden');
    // She cannot be loaded to destruction — her holds and her marks agree, and
    // that is the point of marks. She can be FLOODED to it, with slack tanks.
    h.pump('ballast', 0.5);
    // A SLOW leak, not a fast one. Fill the bilge right up and it stops being
    // slack — a compartment pressed solid has no surface either — so the
    // dangerous amount of water in her is a partial one, and it always is.
    h.holed(0.25);
    for (let i = 0; i < 3000; i++) h.update(0.2);
    expect(h.at('bilge')!.slack, 'she flooded solid instead of half full').toBe(true);
    expect(h.freeSurface).toBeGreaterThan(1.5);
    expect(h.state === 'lost' || h.state === 'tender').toBe(true);
    // The classifier must not chatter: no state may appear twice in a row.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('the state is right the moment she is loaded, not the next frame', () => {
    const h = createHold({ kind: 'steamer' });
    expect(h.state).toBe('light');
    laden(h);
    // No update() anywhere. Loading her IS the event, and a state that waits
    // for a frame reports 'light' for a ship that is already down to her marks.
    expect(h.state).toBe('laden');
  });

  it('a compartment is a hole, and its floor is under its contents', () => {
    const h = createHold({ kind: 'steamer' });
    h.load('main', 200);
    h.load('ballast', h.at('ballast')!.capacity * 0.4);
    h.object.updateMatrixWorld(true);
    const c = h.at('main')!;
    const surface = h.object.getObjectByName('surface:ballast')!;
    const b = h.at('ballast')!;
    // The liquid sits between its own floor and its own deckhead — not in the
    // hull's floor, and not through the tank top.
    expect(surface.position.y).toBeGreaterThan(-b.floor - 1e-6);
    expect(surface.position.y).toBeLessThan(-b.floor + b.depth + 1e-6);
    // …and the double bottom is UNDER the hold standing on it.
    expect(b.floor).toBeGreaterThan(c.floor);
    // The cargo shows in courses from the floor up rather than all at once.
    // It lives in its own group so it can be stowed off the centreline — and
    // `compartment:main`'s own children are the five bulkheads around it.
    const stack = h.object.getObjectByName('stow:main')!;
    const boxes = stack.children.filter((o) => (o as { isMesh?: boolean }).isMesh);
    const shown = boxes.filter((o) => o.visible);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(boxes.length);
    const lowest = Math.min(...shown.map((o) => o.position.y));
    const highestHidden = Math.max(
      ...boxes.filter((o) => !o.visible).map((o) => o.position.y)
    );
    expect(lowest, 'she loaded from the top down').toBeLessThan(highestHidden);
  });

  it('the load line stays put and the sea comes up it', () => {
    const h = createHold({ kind: 'steamer' });
    const marks = h.object.getObjectByName('loadline')!;
    const light = marks.position.y;
    laden(h);
    // The marks are painted on: in the hull's frame they move DOWN by exactly
    // as much as she sank, so in the world they stay where they were and the
    // waterline climbs them.
    expect(marks.position.y).toBeCloseTo(-h.loading.sink, 6);
    expect(marks.position.y, 'the marks did not come down as she sank').toBeLessThan(light);
  });

  it('has the shape every other prop in this library has', () => {
    const h = createHold({ kind: 'liner' });
    expect(h.obstacleRadius).toBe(0);
    expect(h.slots).toEqual([h.hatch]);
    expect(h.hatch.approach).toBeTruthy();
    expect(h.at('main')).toBeTruthy();
    expect(h.at('nothing')).toBeUndefined();
    expect(h.compartments.some((c) => c.name === 'bilge')).toBe(true);
    const p = holdPoint(h, 'main');
    expect(Number.isFinite(p.y)).toBe(true);
    expect(holdPoint(h, 'nothing').lengthSq()).toBe(0);
  });

  it('survives being handed nonsense', () => {
    const h = createHold({ kind: 'steamer' });
    h.update(0);
    h.update(-1);
    h.load('main', -5);
    h.unload('main', -5);
    h.pump('ballast', 12);
    expect(h.at('ballast')!.level).toBeLessThanOrEqual(1);
    h.pump('main', 0.5);
    expect(h.at('main')!.load).toBe(0);
    h.shift('main', 'main', 10);
    h.holed(-3);
    expect(Number.isFinite(h.gm)).toBe(true);
    expect(Number.isFinite(h.draught)).toBe(true);
  });

  it('a caller can start her loaded', () => {
    const h = createHold({ kind: 'steamer', cargo: { fore: 200, ballast: 260 } });
    expect(h.at('fore')!.load).toBeCloseTo(200, 3);
    expect(h.at('ballast')!.level).toBeCloseTo(1, 3);
    expect(deg(h.loading.trim)).toBeGreaterThan(0.1);
  });
});
