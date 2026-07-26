import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { Rng } from '../core/random';
import { createSurface } from '../materials/surface';
import { createSlot, type Prop } from '../core/types';
import { AIR_ABSORPTION, A_WEIGHTING, spreadingLoss, sumDecibels, type SoundField } from './sound';

/**
 * The woofer — the first prop in this library that is not all here.
 *
 * Everything else in the trilogy is simulated: a boiler makes steam out of
 * numbers this library owns, a hull floats on arithmetic, and even the PA is
 * a field computed from a power figure. Operate this and it plays **web
 * radio** — a stream from outside the process and outside the frame clock,
 * that keeps playing whether or not anybody is looking, that buffers, drops
 * and dies, and that no amount of correct local code can make reliable.
 *
 * ```ts
 * const rig = createWoofer({ seed: 7 });
 * const floor = createDanceTiles({ cols: 10, rows: 8 });
 * scene.add(rig.object, floor.object);
 *
 * // THE interaction. First touch starts the radio; the next touches tune.
 * canvas.addEventListener('pointerdown', () => rig.operate());
 *
 * game.onUpdate((t) => {
 *   rig.update(t.delta);
 *   floor.feed(rig.pulse());   // and the DJ tiles come alive
 *   floor.update(t.delta);
 * });
 * ```
 *
 * ## The dropout is the design problem
 *
 * A stream fails four ways — it takes a moment to start, it rebuffers, the
 * station dies, the CORS handshake refuses — and a dance floor that freezes
 * whenever the network hiccups is a network monitor wearing a glitter ball.
 * So the rig has a **bed**: a seeded, deterministic beat that runs under
 * everything, takes the floor whenever the stream cannot, and hands back the
 * moment it can. The states say who is driving:
 *
 * | state | who has the floor |
 * | --- | --- |
 * | `off` | nobody. The cones are still. |
 * | `demo` | the bed, by choice — no radio was asked for. |
 * | `tuning` | the bed, while the stream buffers its first seconds. |
 * | `live` | **the radio.** The one state this module cannot fake. |
 * | `holding` | the bed, because the stream stalled — and the tiles never knew. |
 *
 * `holding` is the inversion at the end of this axis, in the same shape as
 * the thermostatic mixer and the delay tower: it does not stop the dropout,
 * it stops the dropout **reaching the floor**, and the bill is paid in
 * honesty — what you are hearing is not the radio, and `state` says so.
 *
 * ## Where the pulse comes from
 *
 * Live, the pulse is measured off the actual audio with an analyser: bass /
 * mid / treble energy plus a beat detector watching for the kick. In every
 * other state it comes from the bed. Either way `pulse()` has the same shape,
 * which is the whole point — the tiles do not know, and must not know, where
 * the music is coming from.
 *
 * ## What runs where
 *
 * - **A browser, after a user gesture** — the real thing. Autoplay policy
 *   means nothing sounds until somebody interacts, which is not a bug to
 *   fight: the rig is off until somebody turns it on.
 * - **A browser, no gesture yet / headless** — `demo`. The bed drives the
 *   tiles, deterministically, so the picture is alive and verifiable with no
 *   network and no audio device.
 * - **Node (the tests)** — there is no `Audio` here at all. The bed is pure
 *   arithmetic and the whole state machine is testable through an injected
 *   fake stream.
 *
 * The default stations are SomaFM channels, which send the CORS header that
 * lets a `MediaElementAudioSourceNode` actually read the samples. Point
 * `tune()` at a station without that header and the element itself refuses
 * to load — which arrives as an error, which is a `holding`, which the floor
 * survives. That failure path is the module.
 */

/** Who currently has the floor. */
export type WooferState = 'off' | 'demo' | 'tuning' | 'live' | 'holding';

/** A web radio channel. */
export interface RadioStation {
  name: string;
  /** Stream URL. Must send CORS headers for the analyser to read anything. */
  url: string;
  /** Rough words for what plays there. */
  genre: string;
}

/**
 * SomaFM, because they are listener-supported, run for decades, and — the
 * property that matters here — send `Access-Control-Allow-Origin` on their
 * streams, so the analyser can actually see the music it is playing.
 */
export const RADIO_STATIONS: RadioStation[] = [
  { name: 'Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3', genre: 'ambient beats' },
  { name: 'Beat Blender', url: 'https://ice1.somafm.com/beatblender-128-mp3', genre: 'deep house' },
  { name: 'DEF CON Radio', url: 'https://ice1.somafm.com/defcon-128-mp3', genre: 'hacker electronica' },
  { name: 'The Trip', url: 'https://ice1.somafm.com/thetrip-128-mp3', genre: 'progressive house' },
  { name: 'Drone Zone', url: 'https://ice1.somafm.com/dronezone-128-mp3', genre: 'atmospheres' },
];

/** One reading of the music, wherever it is coming from. */
export interface AudioPulse {
  /** Band energies, 0–1. */
  bass: number;
  mid: number;
  treble: number;
  /** True on the frame a kick landed. */
  beat: boolean;
  /** Estimated tempo, beats per minute. 0 until there is one. */
  bpm: number;
}

/**
 * The seam a live stream plugs in through — and the seam a test fakes.
 *
 * Everything above this line is deterministic and runs anywhere; only an
 * implementation of this interface ever touches the network or an audio
 * device. If the module needed a real stream to be exercised, the module
 * would be designed wrong.
 */
export interface RadioMedia {
  /** Point at a stream and start loading. */
  tune(url: string): void;
  /** Try to start. Rejects when autoplay policy or the network says no. */
  play(): Promise<void>;
  pause(): void;
  /** 'playing' | 'waiting' | 'error' — the three transitions that matter. */
  on(event: 'playing' | 'waiting' | 'error', cb: () => void): void;
  /** Measured band energies, or null while there is nothing to measure. */
  bands(): { bass: number; mid: number; treble: number } | null;
}

export interface WooferOptions {
  seed?: number;
  /** Stations `operate()` cycles through. Default: `RADIO_STATIONS`. */
  stations?: RadioStation[];
  /** Bed tempo, BPM. Default seeded 118–128. */
  bpm?: number;
  /** On-axis dB at 1 m when flat out, for `levelAt`. Default 106. */
  power?: number;
  /** Inject a stream implementation (tests). Default: Web Audio, if present. */
  media?: RadioMedia;
}

export interface Woofer extends Prop, SoundField {
  readonly state: WooferState;
  readonly stations: RadioStation[];
  /** The station tuned, or null before the first `play`. */
  readonly station: RadioStation | null;
  /** Bed tempo (and the reported bpm while the bed drives). */
  readonly bpm: number;

  /**
   * THE interaction. Off → start the radio; playing → tune the next station.
   * Wire this to the click/use — it is what a person does to a sound system.
   */
  operate(): void;
  /** Start the radio (or the bed, where there is no radio to be had). */
  play(station?: RadioStation | number): void;
  /** Silence, and the cones stop. */
  stop(): void;
  /** Next station round the dial. */
  tune(): void;
  /** The dial, both ways. `next()` is `tune()` with its partner. */
  next(): void;
  prev(): void;
  /** Fired whenever the tuned station changes. Returns the unsubscribe. */
  onStation(cb: (station: RadioStation) => void): () => void;

  /** The music, now. Same shape whoever has the floor. */
  pulse(): AudioPulse;
  /** Overall drive 0–1 — feed it to a PA's `setProgram`. */
  level(): number;
  /** dB(A) at a world point, while she plays. The AQ handshake, kept. */
  levelAt(x: number, z: number): number;
  /** Fired on every kick. Returns the unsubscribe. */
  onBeat(cb: () => void): () => void;

  update(dt: number): void;
}

// ---------------------------------------------------------------------------
// The bed: a deterministic groove
// ---------------------------------------------------------------------------

/**
 * Four to the floor, hats on the off-beat, a mid line that moves — all a pure
 * function of accumulated time, so the same seed is the same night out and a
 * headless verifier sees the same frames a browser does.
 */
export function bedPulse(t: number, bpm: number): { bass: number; mid: number; treble: number } {
  const beats = (t * bpm) / 60;
  const inBeat = beats % 1;
  const bar = Math.floor(beats / 4);
  // The kick: a sharp attack that has mostly died by the off-beat.
  const kick = Math.exp(-inBeat * 6.5);
  // Every fourth bar the kick drops out for the last beat — a fill, and a
  // test that the beat detector recovers rather than free-wheeling.
  const drop = bar % 4 === 3 && beats % 4 >= 3;
  const bass = drop ? 0.12 : 0.2 + 0.8 * kick;
  const hat = Math.exp(-((beats + 0.5) % 1) * 9);
  const treble = 0.08 + 0.55 * hat + (drop ? 0.3 : 0);
  const mid = clamp01(
    0.34 + 0.2 * Math.sin(t * 0.9) + 0.14 * Math.sin(beats * Math.PI * 0.5) + 0.08 * Math.sin(t * 2.63)
  );
  return { bass: clamp01(bass), mid, treble: clamp01(treble) };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------
// The beat detector
// ---------------------------------------------------------------------------

/**
 * A kick is bass energy standing clear of its own recent average. The
 * detector is shared by every source — the bed does not get to *announce*
 * its beats, it has to be heard, or `live` and `demo` would disagree about
 * what a beat is.
 */
function makeBeatDetector() {
  const window: number[] = [];
  let sinceBeat = Infinity;
  const gaps: number[] = [];
  let lastAt = -1;
  let clock = 0;
  return {
    step(bass: number, dt: number): boolean {
      clock += dt;
      sinceBeat += dt;
      window.push(bass);
      if (window.length > 45) window.shift();
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      // Clear of the average, loud in its own right, and not an echo of the
      // kick we just counted: a refractory quarter-second, or 240 BPM would
      // read as 480.
      const isBeat = bass > mean * 1.3 && bass > 0.45 && sinceBeat > 0.25;
      if (isBeat) {
        if (lastAt >= 0) {
          gaps.push(clock - lastAt);
          if (gaps.length > 8) gaps.shift();
        }
        lastAt = clock;
        sinceBeat = 0;
      }
      return isBeat;
    },
    bpm(): number {
      if (gaps.length < 3) return 0;
      const sorted = [...gaps].sort((a, b) => a - b);
      return 60 / sorted[Math.floor(sorted.length / 2)];
    },
  };
}

// ---------------------------------------------------------------------------
// The default RadioMedia: Web Audio, when the world has it
// ---------------------------------------------------------------------------

/** Build the real thing, or null where there is no audio to be had. */
function makeWebRadio(): RadioMedia | null {
  const g = globalThis as {
    Audio?: new () => HTMLAudioElement;
    AudioContext?: new () => AudioContext;
  };
  if (!g.Audio || !g.AudioContext) return null;
  const el = new g.Audio();
  el.crossOrigin = 'anonymous';
  el.preload = 'auto';
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let data: Uint8Array | null = null;

  const ensureGraph = () => {
    if (ctx) return;
    // The graph is built lazily, inside the first play() — which is inside a
    // user gesture, which is the only place an AudioContext may start.
    ctx = new g.AudioContext!();
    const src = ctx.createMediaElementSource(el);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    data = new Uint8Array(analyser.frequencyBinCount);
  };

  const bandOf = (lo: number, hi: number): number => {
    if (!ctx || !analyser || !data) return 0;
    const hz = ctx.sampleRate / 2 / data.length;
    const a = Math.max(0, Math.floor(lo / hz));
    const b = Math.min(data.length - 1, Math.ceil(hi / hz));
    let sum = 0;
    for (let i = a; i <= b; i++) sum += data[i];
    return clamp01(sum / ((b - a + 1) * 255) * 1.6);
  };

  return {
    tune(url) {
      el.src = url;
      el.load();
    },
    async play() {
      ensureGraph();
      await ctx!.resume();
      await el.play();
    },
    pause() {
      el.pause();
    },
    on(event, cb) {
      // 'stalled' and 'waiting' are the same fact at different layers.
      el.addEventListener(event, cb);
      if (event === 'waiting') el.addEventListener('stalled', cb);
    },
    bands() {
      if (!analyser || !data || el.paused) return null;
      analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
      return { bass: bandOf(35, 180), mid: bandOf(180, 2000), treble: bandOf(2000, 9000) };
    },
  };
}

// ---------------------------------------------------------------------------
// The prop
// ---------------------------------------------------------------------------

export function createWoofer(options: WooferOptions = {}): Woofer {
  const rng = new Rng(options.seed ?? 1);
  const stations = options.stations ?? RADIO_STATIONS;
  const bpm = options.bpm ?? rng.int(118, 128);
  const power = options.power ?? 106;
  // `media` may be injected (tests), found (browser), or absent (Node) — and
  // everything below has to be indifferent to which.
  const media = options.media ?? makeWebRadio() ?? undefined;

  let state: WooferState = 'off';
  let stationIdx = -1;
  let elapsed = 0;
  let last: AudioPulse = { bass: 0, mid: 0, treble: 0, beat: false, bpm: 0 };
  const detector = makeBeatDetector();
  const beatCbs = new Set<() => void>();
  const stationCbs = new Set<(s: RadioStation) => void>();

  if (media) {
    media.on('playing', () => {
      if (state === 'tuning' || state === 'holding') state = 'live';
    });
    // Both of these mean the same thing to the floor: the bed takes over.
    // A stall hands back on 'playing'; an error waits for the next tune.
    media.on('waiting', () => {
      if (state === 'live') state = 'holding';
    });
    media.on('error', () => {
      if (state !== 'off' && state !== 'demo') state = 'holding';
    });
  }

  // -- visuals -------------------------------------------------------------

  const group = new Group();
  const cabinetMat = createSurface('paintedMetal', { baseColor: 0x181a1e });
  const grilleMat = createSurface('metal', { baseColor: 0x24262c });
  const coneMat = new MeshStandardMaterial({ color: 0x2e3138, roughness: 0.65, flatShading: true });
  const capMat = new MeshStandardMaterial({ color: 0x101114, roughness: 0.4, metalness: 0.35 });
  const trimMat = new MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.5, metalness: 0.6 });
  const lampMat = new MeshBasicMaterial({ color: 0x22252a });

  // The cabinet: fridge-sized, because the user asked for a BIG woofer and a
  // hi-fi bookshelf box reads as furniture.
  const W = 1.7;
  const H = 1.9;
  const D = 0.95;
  const cabinet = new Mesh(new BoxGeometry(W, H, D), cabinetMat);
  cabinet.position.y = H / 2;
  group.add(cabinet);
  const face = new Mesh(new BoxGeometry(W * 0.92, H * 0.92, 0.03), grilleMat);
  face.position.set(0, H / 2, D / 2 + 0.016);
  group.add(face);

  // Two drivers, and the cones PUMP — scale is cheap and reads at any range.
  const cones: Mesh[] = [];
  for (const [cy, r] of [
    [H * 0.66, 0.52],
    [H * 0.27, 0.34],
  ] as const) {
    const ring = new Mesh(new TorusGeometry(r, 0.045, 8, 28), trimMat);
    ring.position.set(0, cy, D / 2 + 0.04);
    group.add(ring);
    const cone = new Mesh(new ConeGeometry(r * 0.96, 0.26, 28, 1, true), coneMat);
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, cy, D / 2 + 0.04);
    group.add(cone);
    const cap = new Mesh(new SphereGeometry(r * 0.24, 12, 8), capMat);
    cap.position.set(0, cy, D / 2 + 0.1);
    group.add(cap);
    cones.push(cone, cap);
  }

  // A bass port either side of the big driver, and an ON-AIR lamp.
  for (const side of [-1, 1]) {
    const port = new Mesh(new CircleGeometry(0.09, 16), capMat);
    port.position.set(side * W * 0.36, H * 0.9, D / 2 + 0.035);
    group.add(port);
  }
  const lamp = new Mesh(new BoxGeometry(0.3, 0.07, 0.03), lampMat);
  lamp.position.set(0, H + 0.001 - 0.06, D / 2 + 0.02);
  group.add(lamp);

  // THE CHANNEL SELECTOR: one LED per station across the top of the cabinet,
  // the tuned one lit. A dial you can read from across the room — because a
  // toggle whose current position is invisible is a coin, not a control.
  const ledGeo = new BoxGeometry(0.09, 0.05, 0.02);
  const leds: MeshBasicMaterial[] = [];
  {
    const n = stations.length;
    for (let i = 0; i < n; i++) {
      const mat = new MeshBasicMaterial({ color: 0x2a2d33 });
      const led = new Mesh(ledGeo, mat);
      led.position.set((i - (n - 1) / 2) * 0.16, H - 0.18, D / 2 + 0.02);
      group.add(led);
      leds.push(mat);
    }
  }
  const feet = new Mesh(new CylinderGeometry(0.05, 0.06, 0.06, 8), capMat);
  feet.position.set(0, 0.03, 0);
  group.add(feet);

  const slot = createSlot('operate', 'operate', group, 0, 0, D / 2 + 0.8, Math.PI);

  // -- behaviour -----------------------------------------------------------

  const play = (which?: RadioStation | number): void => {
    const before = stationIdx;
    if (typeof which === 'number') stationIdx = ((which % stations.length) + stations.length) % stations.length;
    else if (which) stationIdx = Math.max(0, stations.indexOf(which));
    else if (stationIdx < 0) stationIdx = 0;
    if (stationIdx !== before && stationIdx >= 0)
      for (const cb of stationCbs) cb(stations[stationIdx]);
    if (!media || stations.length === 0) {
      // Nowhere for a stream to come from: the bed IS the show, and says so.
      state = 'demo';
      return;
    }
    state = 'tuning';
    media.tune(stations[stationIdx].url);
    // A rejected play() is autoplay policy or a dead stream — same answer:
    // the bed holds the floor and the state does not lie about it.
    media.play().catch(() => {
      if (state === 'tuning') state = 'holding';
    });
  };

  const woofer: Woofer = {
    object: group,
    obstacleRadius: Math.hypot(W, D) / 2 + 0.1,
    slots: [slot],
    get state() {
      return state;
    },
    stations,
    get station() {
      return stationIdx >= 0 ? stations[stationIdx] : null;
    },
    bpm,

    operate() {
      if (state === 'off') play();
      else woofer.tune();
    },
    play,
    stop() {
      media?.pause();
      state = 'off';
      last = { bass: 0, mid: 0, treble: 0, beat: false, bpm: 0 };
    },
    tune() {
      if (stations.length === 0) return;
      play((stationIdx < 0 ? 0 : stationIdx + 1) % stations.length);
    },
    next() {
      woofer.tune();
    },
    prev() {
      if (stations.length === 0) return;
      play(stationIdx < 0 ? stations.length - 1 : stationIdx - 1 + stations.length);
    },
    onStation(cb) {
      stationCbs.add(cb);
      return () => stationCbs.delete(cb);
    },

    pulse: () => last,
    level: () => clamp01(last.bass * 0.55 + last.mid * 0.3 + last.treble * 0.15),
    levelAt(x, z) {
      const drive = woofer.level();
      if (drive <= 0.001) return 0;
      const dx = x - group.position.x;
      const dz = z - group.position.z;
      const r = Math.max(1, Math.hypot(dx, dz));
      // A single cabinet is the simplest case AQ models: a point source, with
      // the woofer's own balance for a spectrum. Same physics, same units, so
      // a GAMA agent can treat a party and a festival as one kind of fact.
      const dB = (band: 'bass' | 'mid' | 'treble', at: number) =>
        power + 20 * Math.log10(Math.max(0.02, at * drive)) - spreadingLoss(r, 0, band) - AIR_ABSORPTION[band] * r;
      return sumDecibels([
        dB('bass', last.bass) + A_WEIGHTING.bass,
        dB('mid', last.mid) + A_WEIGHTING.mid,
        dB('treble', last.treble) + A_WEIGHTING.treble,
      ]);
    },
    onBeat(cb) {
      beatCbs.add(cb);
      return () => beatCbs.delete(cb);
    },

    update(dt) {
      if (state === 'off') {
        for (const c of cones) c.scale.setScalar(1);
        lampMat.color.setHex(0x22252a);
        leds.forEach((m) => m.color.setHex(0x2a2d33));
        return;
      }
      leds.forEach((m, i) => m.color.setHex(i === stationIdx ? 0x4ad0ff : 0x2a2d33));
      elapsed += dt;
      // WHO HAS THE FLOOR. Live asks the stream; if the analyser has nothing
      // yet (first buffers), the bed covers the gap without a state change.
      const liveBands = state === 'live' ? media?.bands() ?? null : null;
      const bands = liveBands ?? bedPulse(elapsed, bpm);
      const beat = detector.step(bands.bass, dt);
      last = {
        ...bands,
        beat,
        bpm: state === 'live' ? detector.bpm() : bpm,
      };
      if (beat) for (const cb of beatCbs) cb();

      // The cones pump with the bass, the lamp says who is driving.
      const pump = 1 + last.bass * 0.16;
      for (const c of cones) c.scale.setScalar(pump);
      lampMat.color.setHex(
        state === 'live' ? 0xe0483a : state === 'holding' ? 0xe0a83a : 0x3ac06a
      );
    },
  };

  return woofer;
}

// ---------------------------------------------------------------------------
// The DJ tiles
// ---------------------------------------------------------------------------

export interface DanceTilesOptions {
  seed?: number;
  cols?: number;
  rows?: number;
  /** Tile pitch, metres. Default 0.9. */
  size?: number;
}

export interface DanceTiles {
  object: Group;
  /** True once something has fed it a live pulse. */
  readonly activated: boolean;
  /** Hand the floor this frame's music. */
  feed(pulse: AudioPulse): void;
  /** Fade the lit pattern along. Call every frame. */
  update(dt: number): void;
  /** How many tiles are lit past half right now. */
  litCount(): number;
}

/**
 * The floor the woofer is for. A grid of emissive tiles: the kick throws a
 * ring out from the centre, the treble sparkles the corners, the mid sets
 * how warm the floor idles. It knows nothing about radios, networks or
 * states — it eats `AudioPulse` and that is the entire coupling, which is
 * why a dropout upstream never reaches it.
 */
export function createDanceTiles(options: DanceTilesOptions = {}): DanceTiles {
  const rng = new Rng(options.seed ?? 1);
  const cols = options.cols ?? 8;
  const rows = options.rows ?? 8;
  const size = options.size ?? 0.9;

  const group = new Group();
  const geo = new BoxGeometry(size * 0.92, 0.06, size * 0.92);
  interface Tile {
    mesh: Mesh;
    mat: MeshStandardMaterial;
    /** 0–1 light level, decaying. */
    lit: number;
    hue: number;
    ring: number;
  }
  const tiles: Tile[] = [];
  const cx = (cols - 1) / 2;
  const cz = (rows - 1) / 2;
  const maxRing = Math.hypot(cx, cz);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mat = new MeshStandardMaterial({
        color: 0x15171b,
        emissive: 0x000000,
        roughness: 0.35,
        metalness: 0.1,
        flatShading: true,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.set((c - cx) * size, 0.03, (r - cz) * size);
      group.add(mesh);
      tiles.push({ mesh, mat, lit: 0, hue: rng.next(), ring: Math.hypot(c - cx, r - cz) });
    }
  }

  let activated = false;
  let ringFront = -1; // beat rings travel outward; negative = no ring running
  let warmth = 0;
  let hueBase = rng.next();

  const paint = (t: Tile) => {
    // Hue drifts with the night; brightness is the tile's own decay.
    const h = (hueBase + t.hue * 0.14 + t.ring * 0.04) % 1;
    const v = t.lit;
    // Cheap HSV→RGB, saturated: a dance floor is not tasteful.
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const q = 1 - f;
    const [r, g, b] = [
      [1, f, 0], [q, 1, 0], [0, 1, f], [0, q, 1], [f, 0, 1], [1, 0, q],
    ][i % 6];
    t.mat.emissive.setRGB(r * v, g * v, b * v);
    t.mat.color.setRGB(0.08 + r * v * 0.25, 0.08 + g * v * 0.25, 0.09 + b * v * 0.25);
  };

  return {
    object: group,
    get activated() {
      return activated;
    },
    feed(pulse) {
      const energy = pulse.bass + pulse.mid + pulse.treble;
      if (energy <= 0.02) return;
      activated = true;
      warmth = pulse.mid;
      if (pulse.beat) {
        ringFront = 0;
        hueBase = (hueBase + 0.07) % 1;
      }
      // Treble sparkles: a few random tiles flare, more when the hats are hot.
      const sparks = Math.floor(pulse.treble * 4);
      for (let i = 0; i < sparks; i++) {
        const t = tiles[rng.int(0, tiles.length - 1)];
        t.lit = Math.max(t.lit, 0.65 + pulse.treble * 0.35);
      }
    },
    update(dt) {
      if (ringFront >= 0) {
        // The kick's ring sweeps outward at eight tiles a second.
        ringFront += dt * 8;
        for (const t of tiles) {
          if (Math.abs(t.ring - ringFront) < 0.75) t.lit = Math.max(t.lit, 1);
        }
        if (ringFront > maxRing + 1) ringFront = -1;
      }
      const floorGlow = activated ? 0.05 + warmth * 0.1 : 0;
      for (const t of tiles) {
        t.lit = Math.max(floorGlow, t.lit - dt * 2.4);
        paint(t);
      }
    },
    litCount: () => tiles.reduce((n, t) => n + (t.lit > 0.5 ? 1 : 0), 0),
  };
}
