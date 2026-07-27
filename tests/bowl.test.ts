import { describe, it, expect } from 'vitest';
import { createSingingBowl } from '../src';

const run = (bowl: ReturnType<typeof createSingingBowl>, seconds: number): void => {
  for (let i = 0; i < seconds * 60; i++) bowl.update(1 / 60);
};

describe('the singing bowl', () => {
  it('builds the bowl, the cushion and the mallet', () => {
    const bowl = createSingingBowl({ seed: 4 });
    for (const name of ['bowl', 'cushion', 'mallet']) {
      expect(bowl.object.getObjectByName(name), name).toBeDefined();
    }
    expect(bowl.obstacleRadius).toBeGreaterThan(0);
  });

  it('keeps a breath: the phase paces at the asked rate and wraps', () => {
    const bowl = createSingingBowl({ seed: 4, breathsPerMinute: 30 });
    const p0 = bowl.pulse().phase;
    run(bowl, 1); // half a breath at 30 bpm
    const p1 = bowl.pulse().phase;
    expect(((p1 - p0 + 1) % 1)).toBeCloseTo(0.5, 1);
    expect(bowl.pulse().rate).toBe(30);
    // Inhale is the first half, exhale the second — by definition.
    const probe = createSingingBowl({ seed: 4, breathsPerMinute: 30 });
    probe.strike(); // phase → 0
    run(probe, 0.5);
    expect(probe.pulse().inhale).toBe(true);
    run(probe, 1);
    expect(probe.pulse().inhale).toBe(false);
  });

  it('the chime is the cue to breathe IN: a strike restarts the breath', () => {
    const bowl = createSingingBowl({ seed: 4, breathsPerMinute: 30 });
    run(bowl, 1.4);
    expect(bowl.pulse().phase).toBeGreaterThan(0.05);
    bowl.strike();
    expect(bowl.pulse().phase).toBe(0);
    expect(bowl.pulse().inhale).toBe(true);
  });

  it('rings long and dies slow — the decay IS the instrument', () => {
    const bowl = createSingingBowl({ seed: 4 });
    expect(bowl.ringing).toBe(0);
    bowl.strike();
    expect(bowl.ringing).toBe(1);
    run(bowl, 6);
    const mid = bowl.ringing;
    expect(mid).toBeGreaterThan(0.4); // still singing after six seconds
    run(bowl, 24);
    expect(bowl.ringing).toBeLessThan(0.15); // …but not after thirty
    expect(bowl.ringing).toBeGreaterThanOrEqual(0);
    run(bowl, 120);
    expect(bowl.ringing).toBe(0); // silence is reachable, exactly
  });

  it('the rim shivers while the note lasts, and settles when it dies', () => {
    const bowl = createSingingBowl({ seed: 4 });
    const rim = bowl.object.getObjectByName('bowl')!;
    bowl.strike();
    let shivered = 0;
    for (let i = 0; i < 60; i++) {
      bowl.update(1 / 60);
      shivered = Math.max(shivered, Math.abs(rim.scale.x - 1));
    }
    expect(shivered).toBeGreaterThan(0.002);
    run(bowl, 200);
    expect(Math.abs(rim.scale.x - 1)).toBeLessThan(1e-4);
  });

  it('a soft strike rings softer, and re-strikes never exceed full', () => {
    const bowl = createSingingBowl({ seed: 4 });
    bowl.strike(0.4);
    expect(bowl.ringing).toBeCloseTo(0.4, 5);
    bowl.strike(1);
    bowl.strike(1);
    expect(bowl.ringing).toBe(1);
    // A soft tap never STEALS ring from a note already singing louder.
    run(bowl, 2);
    const before = bowl.ringing;
    bowl.strike(0.1);
    expect(bowl.ringing).toBeGreaterThanOrEqual(before);
  });

  it('publishes the turns: inhale and exhale alternate at the paced rate', () => {
    const bowl = createSingingBowl({ seed: 4, breathsPerMinute: 30 });
    bowl.strike(); // aligns to inhale, fires one
    const events: string[] = [];
    const off = bowl.onBreath((side) => events.push(side));
    run(bowl, 10.1); // ~5 breaths at 2 s each
    expect(events.length).toBeGreaterThanOrEqual(9);
    expect(events.length).toBeLessThanOrEqual(11);
    for (let i = 1; i < events.length; i++) expect(events[i]).not.toBe(events[i - 1]);
    off();
    const n = events.length;
    run(bowl, 2);
    expect(events.length).toBe(n);
  });

  it('onStrike hears every strike; unsubscribe is honoured', () => {
    const bowl = createSingingBowl({ seed: 4 });
    let strikes = 0;
    const off = bowl.onStrike(() => strikes++);
    bowl.strike();
    bowl.strike(0.5);
    expect(strikes).toBe(2);
    off();
    bowl.strike();
    expect(strikes).toBe(2);
  });

  it('strikes silently where there is no AudioContext — never throws', () => {
    const bowl = createSingingBowl({ seed: 4 });
    expect(() => {
      bowl.strike();
      bowl.update(1 / 60);
      bowl.strike(0.7);
    }).not.toThrow();
    const muted = createSingingBowl({ seed: 4, mute: true });
    expect(() => muted.strike()).not.toThrow();
  });

  it('each seed casts its own bowl, in a mid-bowl register', () => {
    const a = createSingingBowl({ seed: 7 });
    const b = createSingingBowl({ seed: 7 });
    const c = createSingingBowl({ seed: 8 });
    expect(a.frequency).toBe(b.frequency);
    expect(a.frequency).not.toBe(c.frequency);
    expect(a.frequency).toBeGreaterThanOrEqual(200);
    expect(a.frequency).toBeLessThanOrEqual(320);
    expect(createSingingBowl({ seed: 1, frequency: 440 }).frequency).toBe(440);
  });

  it('the pulse is the whole handshake: { phase, inhale, rate, ring }', () => {
    const bowl = createSingingBowl({ seed: 4 });
    bowl.strike(0.8);
    run(bowl, 1);
    const pulse = bowl.pulse();
    expect(Object.keys(pulse).sort()).toEqual(['inhale', 'phase', 'rate', 'ring']);
    expect(pulse.ring).toBeGreaterThan(0.5);
    expect(pulse.ring).toBeLessThan(1);
  });
});
