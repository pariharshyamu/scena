import { describe, it, expect } from 'vitest';
import {
  createWoofer,
  createDanceTiles,
  bedPulse,
  RADIO_STATIONS,
  type RadioMedia,
  type Woofer,
} from '../src';

/**
 * A stream that does what it is told — the seam the module was designed
 * around. Real streams differ from this only in being worse.
 */
function fakeRadio() {
  const handlers: Record<string, Array<() => void>> = { playing: [], waiting: [], error: [] };
  let playResolve: 'ok' | 'reject' = 'ok';
  let live: { bass: number; mid: number; treble: number } | null = null;
  const media: RadioMedia = {
    tuned: undefined as string | undefined,
    tune(url: string) {
      (media as { tuned?: string }).tuned = url;
    },
    play: () => (playResolve === 'ok' ? Promise.resolve() : Promise.reject(new Error('no'))),
    pause() {
      live = null;
    },
    on(ev, cb) {
      handlers[ev].push(cb);
    },
    bands: () => live,
  } as RadioMedia & { tuned?: string };
  return {
    media,
    emit: (ev: 'playing' | 'waiting' | 'error') => handlers[ev].forEach((cb) => cb()),
    setBands: (b: typeof live) => {
      live = b;
    },
    rejectPlay: () => {
      playResolve = 'reject';
    },
    tunedTo: () => (media as { tuned?: string }).tuned,
  };
}

const run = (w: Woofer, seconds: number, hz = 60): void => {
  for (let i = 0; i < seconds * hz; i++) w.update(1 / hz);
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the bed', () => {
  it('is deterministic: the same second is the same music', () => {
    expect(bedPulse(12.34, 124)).toEqual(bedPulse(12.34, 124));
  });

  it('kicks four to the floor', () => {
    // Bass at the top of a beat towers over bass just before the next one.
    const spb = 60 / 120;
    expect(bedPulse(8 * spb + 0.01, 120).bass).toBeGreaterThan(0.9);
    expect(bedPulse(9 * spb - 0.05, 120).bass).toBeLessThan(0.45);
  });

  it('puts the hats on the off-beat', () => {
    const spb = 60 / 120;
    const onBeat = bedPulse(8 * spb + 0.01, 120).treble;
    const offBeat = bedPulse(8.5 * spb + 0.01 * 0, 120).treble;
    expect(offBeat).toBeGreaterThan(onBeat);
  });

  it('drops the kick for the fill bar', () => {
    // Bar 3 (0-indexed), beat 3.x: the drop the detector must survive.
    const spb = 60 / 120;
    expect(bedPulse((3 * 4 + 3.1) * spb, 120).bass).toBeLessThan(0.2);
  });

  it('every band stays in [0, 1]', () => {
    for (let t = 0; t < 30; t += 0.037) {
      const p = bedPulse(t, 126);
      for (const v of [p.bass, p.mid, p.treble]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('off, and what off means', () => {
  it('starts off, silent and still', () => {
    const w = createWoofer({ seed: 3 });
    expect(w.state).toBe('off');
    run(w, 1);
    expect(w.pulse()).toEqual({ bass: 0, mid: 0, treble: 0, beat: false, bpm: 0 });
    expect(w.level()).toBe(0);
  });

  it('a silent woofer has no field at all', () => {
    const w = createWoofer({ seed: 3 });
    expect(w.levelAt(0, 5)).toBe(0);
  });

  it('stop() silences an operating rig', () => {
    const w = createWoofer({ seed: 3 });
    w.operate();
    run(w, 2);
    expect(w.level()).toBeGreaterThan(0);
    w.stop();
    expect(w.state).toBe('off');
    expect(w.level()).toBe(0);
  });
});

describe('operate — the interaction', () => {
  it('with no audio device in the world, operate() plays the bed and says so', () => {
    // Node has no Audio and none was injected: 'demo', not a crash and not a lie.
    const w = createWoofer({ seed: 3 });
    w.operate();
    expect(w.state).toBe('demo');
    run(w, 1);
    expect(w.level()).toBeGreaterThan(0);
  });

  it('first operate starts the radio, later operates tune round the dial', () => {
    const r = fakeRadio();
    const w = createWoofer({ seed: 3, media: r.media });
    w.operate();
    expect(w.state).toBe('tuning');
    expect(r.tunedTo()).toBe(RADIO_STATIONS[0].url);
    w.operate();
    expect(r.tunedTo()).toBe(RADIO_STATIONS[1].url);
    w.operate();
    expect(r.tunedTo()).toBe(RADIO_STATIONS[2].url);
  });

  it('the dial wraps: one start plus a full lap is back where you began', () => {
    const r = fakeRadio();
    const w = createWoofer({ seed: 3, media: r.media });
    for (let i = 0; i <= RADIO_STATIONS.length; i++) w.operate();
    expect(r.tunedTo()).toBe(RADIO_STATIONS[0].url);
  });

  it('play(n) and play(station) both tune', () => {
    const r = fakeRadio();
    const w = createWoofer({ seed: 3, media: r.media });
    w.play(2);
    expect(w.station).toBe(RADIO_STATIONS[2]);
    w.play(RADIO_STATIONS[4]);
    expect(w.station).toBe(RADIO_STATIONS[4]);
    expect(r.tunedTo()).toBe(RADIO_STATIONS[4].url);
  });

  it('custom station lists are respected', () => {
    const mine = [{ name: 'Mine', url: 'https://example.test/s', genre: 'test' }];
    const r = fakeRadio();
    const w = createWoofer({ stations: mine, media: r.media });
    w.operate();
    expect(r.tunedTo()).toBe('https://example.test/s');
    expect(w.stations).toBe(mine);
  });
});

describe('the state machine: who has the floor', () => {
  it('tuning → live when the stream actually plays', () => {
    const r = fakeRadio();
    const w = createWoofer({ media: r.media });
    w.operate();
    expect(w.state).toBe('tuning');
    r.emit('playing');
    expect(w.state).toBe('live');
  });

  it('live → holding on a stall, and back on recovery', () => {
    const r = fakeRadio();
    const w = createWoofer({ media: r.media });
    w.operate();
    r.emit('playing');
    r.emit('waiting');
    expect(w.state).toBe('holding');
    r.emit('playing');
    expect(w.state).toBe('live');
  });

  it('a dead stream is a holding, not a crash', () => {
    const r = fakeRadio();
    const w = createWoofer({ media: r.media });
    w.operate();
    r.emit('error');
    expect(w.state).toBe('holding');
  });

  it('a refused play() (autoplay policy) is a holding too', async () => {
    const r = fakeRadio();
    r.rejectPlay();
    const w = createWoofer({ media: r.media });
    w.operate();
    await flush();
    expect(w.state).toBe('holding');
  });

  it('THE floor never stops: holding still pulses', () => {
    const r = fakeRadio();
    const w = createWoofer({ media: r.media });
    w.operate();
    r.emit('playing');
    r.emit('waiting');
    run(w, 2);
    expect(w.level()).toBeGreaterThan(0.1);
  });

  it('live reads the stream, not the bed', () => {
    const r = fakeRadio();
    const w = createWoofer({ media: r.media });
    w.operate();
    r.emit('playing');
    r.setBands({ bass: 0.9, mid: 0.1, treble: 0.05 });
    w.update(1 / 60);
    expect(w.pulse().bass).toBe(0.9);
    expect(w.pulse().mid).toBe(0.1);
  });

  it('live with an empty analyser is covered by the bed without a state change', () => {
    // The first seconds of a stream: playing has fired, the FFT still reads
    // nothing. The floor must not go dark while the state must not lie.
    const r = fakeRadio();
    const w = createWoofer({ media: r.media });
    w.operate();
    r.emit('playing');
    r.setBands(null);
    run(w, 1);
    expect(w.state).toBe('live');
    expect(w.level()).toBeGreaterThan(0);
  });
});

describe('the pulse', () => {
  it('beats arrive at the bed tempo', () => {
    const w = createWoofer({ seed: 5, bpm: 120 });
    w.operate();
    let beats = 0;
    w.onBeat(() => beats++);
    run(w, 10);
    // 120 BPM for 10 s = 20 beats, minus the fill-bar drops (1 in 16).
    expect(beats).toBeGreaterThan(14);
    expect(beats).toBeLessThan(23);
  });

  it('reports the bed bpm while the bed drives', () => {
    const w = createWoofer({ seed: 5, bpm: 124 });
    w.operate();
    run(w, 2);
    expect(w.pulse().bpm).toBe(124);
  });

  it('onBeat unsubscribes', () => {
    const w = createWoofer({ seed: 5, bpm: 120 });
    w.operate();
    let beats = 0;
    const off = w.onBeat(() => beats++);
    run(w, 4);
    const seen = beats;
    expect(seen).toBeGreaterThan(0);
    off();
    run(w, 4);
    expect(beats).toBe(seen);
  });

  it('two rigs with one seed are the same night out', () => {
    const a = createWoofer({ seed: 9 });
    const b = createWoofer({ seed: 9 });
    a.operate();
    b.operate();
    run(a, 3.7);
    run(b, 3.7);
    expect(a.pulse()).toEqual(b.pulse());
  });

  it('the field falls off with distance and dies with the music', () => {
    const w = createWoofer({ seed: 5 });
    w.operate();
    run(w, 1.02);
    const near = w.levelAt(0, 3);
    const far = w.levelAt(0, 60);
    expect(near).toBeGreaterThan(far + 15);
    w.stop();
    expect(w.levelAt(0, 3)).toBe(0);
  });
});

describe('the DJ tiles', () => {
  const playing = (seconds: number, seed = 4) => {
    const w = createWoofer({ seed, bpm: 122 });
    const tiles = createDanceTiles({ cols: 8, rows: 8, seed });
    w.operate();
    for (let i = 0; i < seconds * 60; i++) {
      w.update(1 / 60);
      tiles.feed(w.pulse());
      tiles.update(1 / 60);
    }
    return tiles;
  };

  it('start dark and inactive', () => {
    const tiles = createDanceTiles({ cols: 6, rows: 6 });
    expect(tiles.activated).toBe(false);
    tiles.update(0.5);
    expect(tiles.litCount()).toBe(0);
  });

  it('a silent pulse does not activate them', () => {
    const tiles = createDanceTiles({ cols: 6, rows: 6 });
    tiles.feed({ bass: 0, mid: 0, treble: 0, beat: false, bpm: 0 });
    expect(tiles.activated).toBe(false);
  });

  it('ACTIVATE when the woofer is operated', () => {
    const tiles = playing(2);
    expect(tiles.activated).toBe(true);
    expect(tiles.litCount()).toBeGreaterThan(0);
  });

  it('a beat lights a ring of tiles at once', () => {
    const tiles = createDanceTiles({ cols: 9, rows: 9 });
    tiles.feed({ bass: 1, mid: 0.4, treble: 0.1, beat: true, bpm: 120 });
    tiles.update(1 / 60);
    // The ring starts at the centre: a burst, immediately.
    expect(tiles.litCount()).toBeGreaterThanOrEqual(1);
    const before = tiles.litCount();
    for (let i = 0; i < 20; i++) tiles.update(1 / 60);
    // …and has swept outward through more tiles than it started with.
    expect(tiles.litCount()).toBeGreaterThan(before);
  });

  it('the floor decays back toward its idle glow', () => {
    const tiles = createDanceTiles({ cols: 9, rows: 9 });
    tiles.feed({ bass: 1, mid: 0.3, treble: 0.9, beat: true, bpm: 120 });
    for (let i = 0; i < 30; i++) tiles.update(1 / 60);
    const lit = tiles.litCount();
    for (let i = 0; i < 300; i++) tiles.update(1 / 60);
    expect(tiles.litCount()).toBeLessThan(Math.max(1, lit));
  });

  it('the grid is the size it was asked to be', () => {
    const tiles = createDanceTiles({ cols: 5, rows: 3 });
    expect(tiles.object.children.length).toBe(15);
  });

  it('tiles know nothing about the radio: a holding looks like a set', () => {
    // Same coupling either way — feed(pulse). This is the whole design.
    const r = fakeRadio();
    const w = createWoofer({ media: r.media, seed: 4 });
    const tiles = createDanceTiles({ cols: 8, rows: 8, seed: 4 });
    w.operate();
    r.emit('playing');
    r.emit('waiting'); // the stream stalls; the bed holds
    for (let i = 0; i < 180; i++) {
      w.update(1 / 60);
      tiles.feed(w.pulse());
      tiles.update(1 / 60);
    }
    expect(w.state).toBe('holding');
    expect(tiles.activated).toBe(true);
    expect(tiles.litCount()).toBeGreaterThan(0);
  });
});

describe('the prop', () => {
  it('is big, solid and operable', () => {
    const w = createWoofer();
    expect(w.obstacleRadius).toBeGreaterThan(0.8);
    expect(w.slots?.[0].kind).toBe('operate');
    expect(w.object.children.length).toBeGreaterThan(5);
  });

  it('stations ship with CORS-friendly defaults', () => {
    expect(RADIO_STATIONS.length).toBeGreaterThanOrEqual(4);
    for (const s of RADIO_STATIONS) {
      expect(s.url.startsWith('https://')).toBe(true);
      expect(s.name.length).toBeGreaterThan(0);
    }
  });
});
