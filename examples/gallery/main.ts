import {
  AmbientLight,
  Box3,
  CylinderGeometry,
  Clock,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  PALETTES,
  PICTURE_STYLES,
  createBasket,
  createCandle,
  createFramedPhoto,
  createLantern,
  createPhone,
  createSack,
  createTable,
  createTablet,
  createVessel,
  createClutter,
  createPlant,
  createHangingPlant,
  createWindowBox,
  createCurtains,
  createCushion,
  createThrow,
  createStream,
  createSpray,
  createFill,
  createSteam,
  createShower,
  createTub,
  createJacuzzi,
  createBasin,
  BASIN_ERAS,
  createPinboard,
  createWhiteboard,
  createPoster,
  createStickyNotes,
  PLANT_SPECIES,
  VESSEL_STYLES,
  dress,
  placeOn,
  createInteriorLight,
  createMirror,
  createPainting,
  createRoom,
  createTapestry,
  createWallAnchor,
  createWallClock,
  furnishRoom,
  hangGallery,
  hangOn,
  type FrameStyle,
  type PictureStyle,
  type ClutterTheme,
  type Curtains,
  type Stream,
  type Spray,
  type Fill,
  type Steam,
  type Shower,
  type Tub,
  type Jacuzzi,
  type Basin,
  type PropSurface,
  type WallArt,
} from 'scena3d';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'room';
const pinned = params.get('t') !== null ? Number(params.get('t')) : null;
const palette = PALETTES.meadow;

const scene = new Scene();
scene.background = new Color(0x0a0d13);

const camera = new PerspectiveCamera(56, innerWidth / innerHeight, 0.1, 100);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// A domestic room, at domestic scale. KIT_UNIT is 2 m, which builds a warehouse
// when what you want is a sitting room.
const room = createRoom(
  [
    '#######',
    '#.....#',
    'W..~..W',
    '#.....#',
    '##D####',
  ],
  { seed: 11, unit: 1.2, wallHeight: 2.6, palette }
);
const furnished = furnishRoom(room, { role: 'study', seed: 6, palette });

const cycle = { sunElevation: 1, timeOfDay: 0.5 };
const light = createInteriorLight(room, { cycle, shaftStrength: 0.2 });
const setTime = (t: number): void => {
  cycle.timeOfDay = t;
  cycle.sunElevation = Math.sin(2 * Math.PI * (t - 0.25));
  light.update();
};

if (view === 'room') {
  scene.add(room.group);
} else if (view === 'swatches') {
  // Swatches get flat even light and nothing else in the scene. Judging a
  // picture shader inside a dim interior tells you about the interior.
  scene.add(new AmbientLight(0xffffff, 1.5));
  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 4, 6);
  scene.add(key);
}

// --- the decoration -----------------------------------------------------

const hung: WallArt[] = [];
const clocks: ReturnType<typeof createWallClock>[] = [];
let galleryCount = 0;
let dressed = 0;
let surfaces = 0;
let dressedSurface: PropSurface | null = null;
let curtains: Curtains | null = null;
const stirs: Curtains[] = [];
const streams: Stream[] = [];
let basin: Fill | null = null;
let shower: Spray | null = null;
let steam: Steam | null = null;
let tap = 1;
const showers: Shower[] = [];
const tubs: Tub[] = [];
const basins: Basin[] = [];
let shower2: Shower | null = null;
let tub: Tub | null = null;
let jacuzzi: Jacuzzi | null = null;

if (view === 'room') {
  // The longest clear run gets the salon hang: six pieces, graded, off a
  // shared spine, none of them level.
  const long = room.walls[0];
  const set = Array.from({ length: 6 }, (_, i) => createPainting({ seed: i + 3, palette }));
  galleryCount = hangGallery(long, set, { seed: 5, height: 1.5, gap: 0.11 }).length;
  hung.push(...set.slice(0, galleryCount));

  // The wall behind: one large piece on its own, hung a touch high the way a
  // single picture over a fireplace always is.
  const facing = room.walls.find((w) => w.normal.dot(long.normal) < -0.5) ?? room.walls[1];
  const big = createPainting({
    width: 0.95,
    style: 'landscape',
    frame: 'ornate',
    age: 0.55,
    seed: 21,
    palette,
  });
  hangOn(facing, big, { height: 1.62, along: -0.4, seed: 21 });
  hung.push(big);

  const clock = createWallClock({ diameter: 0.28, time: 10.17, rate: 60 });
  hangOn(facing, clock, { height: 1.95, along: 0.85, tilt: 0 });
  clocks.push(clock);
  hung.push(clock);

  // The side walls: a mirror opposite the window, and a hanging.
  const sides = room.walls.filter((w) => Math.abs(w.normal.x) > 0.5);
  if (sides[0]) {
    const mirror = createMirror({ width: 0.44, height: 0.66, seed: 4, palette });
    hangOn(sides[0], mirror, { height: 1.5, seed: 4 });
    hung.push(mirror);
  }
  if (sides[1]) {
    const tapestry = createTapestry({ width: 0.75, height: 1.1, seed: 8, palette });
    // The rod is the anchor, so this height is the rod, not the middle.
    hangOn(sides[1], tapestry, { height: 2.15, seed: 8, tilt: 0.012 });
    hung.push(tapestry);
  }

  // Every flat surface the furnishing left gets dressed. This is the other
  // half of the job: a room with pictures up and bare tables is still a show
  // home.
  let n = 0;
  for (const prop of furnished.props) {
    for (const surface of prop.surfaces ?? []) {
      n++;
      const kit = [
        createCandle({ seed: n * 3 }),
        createBasket({ seed: n * 5 }),
        createFramedPhoto({ seed: n * 7, standing: true, size: 0.15 }),
        createCandle({ seed: n * 11 }),
        createBasket({ seed: n * 13 }),
      ];
      dressed += dress(surface, kit, { seed: n, density: 0.42 }).length;
      surfaces++;
    }
  }
} else if (view === 'bath') {
  // A bathroom: a shower warming up, a tub filling, a hot tub with the jets
  // on, and a basin of each era.
  scene.add(new AmbientLight(0xffffff, 0.6));
  const key = new DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 6, 4);
  scene.add(key);
  const floor = new Mesh(
    new PlaneGeometry(16, 16),
    new MeshStandardMaterial({ color: 0x6a6560, roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  shower2 = createShower({ style: 'enclosure', seed: 2, warmUp: 3, palette });
  shower2.object.position.set(-2.4, 0, 0);
  scene.add(shower2.object);
  const overBath = createShower({ style: 'overBath', seed: 5, warmUp: 2, palette });
  overBath.object.position.set(-1.1, 0, 1.6);
  scene.add(overBath.object);
  showers.push(shower2, overBath);

  tub = createTub({ style: 'clawfoot', seed: 3, rate: 0.5, palette });
  tub.object.position.set(-0.1, 0, -0.4);
  scene.add(tub.object);
  const sunken = createTub({ style: 'sunken', seed: 4, palette });
  sunken.object.position.set(1.9, 0, 1.5);
  sunken.pour(0.9);
  scene.add(sunken.object);
  tubs.push(tub, sunken);

  jacuzzi = createJacuzzi({ seats: 5, radius: 1.0, seed: 6, palette });
  jacuzzi.object.position.set(2.4, 0, -1.2);
  jacuzzi.setJets(1);
  scene.add(jacuzzi.object);

  BASIN_ERAS.forEach((era, i) => {
    const b = createBasin({ era, seed: i + 2, rate: 0.35, palette });
    b.object.position.set(-1.4 + i * 1.3, 0, -2.4);
    scene.add(b.object);
    basins.push(b);
  });
} else if (view === 'water') {
  // Streams, a shower, a filling basin and steam, lit flatly. A water shader
  // that compiles is not water that moves — this is the only way to know.
  scene.add(new AmbientLight(0xffffff, 0.55));
  const key = new DirectionalLight(0xffffff, 1.3);
  key.position.set(2, 5, 4);
  scene.add(key);
  const floor = new Mesh(
    new PlaneGeometry(14, 14),
    new MeshStandardMaterial({ color: 0x5d5a56, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Four streams, thin to thick, so the break-up difference is visible.
  [0.005, 0.012, 0.024, 0.045].forEach((radius, i) => {
    const spout = new Mesh(
      new CylinderGeometry(radius * 1.6, radius * 1.6, 0.05, 8),
      new MeshStandardMaterial({ color: 0x9aa2aa, roughness: 0.3, metalness: 0.7 })
    );
    spout.position.set(-1.5 + i * 0.42, 1.05, 0);
    scene.add(spout);
    const stream = createStream({ height: 0.6, radius, seed: i + 2, palette });
    stream.object.position.set(-1.5 + i * 0.42, 1.02, 0);
    scene.add(stream.object);
    streams.push(stream);
  });

  // A basin that fills while the tap runs.
  const bowl = createVessel({ style: 'bowl', height: 0.34, seed: 3, palette });
  bowl.object.position.set(0.9, 0.4, 0);
  scene.add(bowl.object);
  // The fill radius has to match the container's INTERIOR at the level the
  // water reaches, not its widest point — a bowl flares, so a disc cut to the
  // rim pokes out through the sides as a blue band around the outside.
  basin = createFill({ radius: bowl.radius * 0.6, depth: bowl.height * 0.55, palette });
  basin.object.position.set(0.9, 0.4 + bowl.height * 0.28, 0);
  scene.add(basin.object);

  // A shower, running.
  shower = createSpray({ height: 1.7, radius: 0.07, spread: 0.3, seed: 4, palette });
  shower.object.position.set(2.2, 1.95, 0);
  scene.add(shower.object);
  steam = createSteam({ radius: 0.4, height: 1.6, seed: 5 });
  steam.object.position.set(2.2, 0.1, 0);
  steam.setTarget(1);
  scene.add(steam.object);
} else if (view === 'decor') {
  // M, O and P side by side: every plant species, curtains that stir, and
  // the paper. Flat light, nothing else in the scene.
  scene.add(new AmbientLight(0xffffff, 0.5));
  const key = new DirectionalLight(0xffffff, 1.15);
  key.position.set(2, 5, 4);
  scene.add(key);
  const floor = new Mesh(
    new PlaneGeometry(12, 12),
    new MeshStandardMaterial({ color: 0x6b6055, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  PLANT_SPECIES.forEach((species, i) => {
    const plant = createPlant({ species, seed: i + 3, palette });
    plant.object.position.set((i - (PLANT_SPECIES.length - 1) / 2) * 0.62, 0, 0.5);
    scene.add(plant.object);
  });
  const basket = createHangingPlant({ seed: 4, palette });
  basket.object.position.set(-2.3, 1.9, 0.5);
  scene.add(basket.object);
  const trough = createWindowBox({ seed: 6, length: 0.9, palette });
  trough.object.position.set(2.3, 0, 0.5);
  scene.add(trough.object);

  curtains = createCurtains({ width: 1.5, drop: 1.7, style: 'closed', seed: 3, palette });
  curtains.object.position.set(-1.5, 2.1, -0.6);
  scene.add(curtains.object);
  const sheer = createCurtains({ width: 1.2, drop: 1.5, style: 'sheer', seed: 5, palette });
  sheer.object.position.set(0.4, 2.1, -0.6);
  scene.add(sheer.object);
  stirs.push(curtains, sheer);

  const cushion = createCushion({ seed: 2, palette });
  cushion.object.position.set(1.8, 0, -0.2);
  scene.add(cushion.object);
  const rug = createThrow({ seed: 3, palette });
  rug.object.position.set(2.6, 0.42, -0.2);
  scene.add(rug.object);

  const wall = createWallAnchor(scene, 0, 0, -1.2, 0, 8, 3);
  hangOn(wall, createPinboard({ seed: 4, palette }), { height: 1.5, along: 2.3, tilt: 0.015 });
  hangOn(wall, createWhiteboard({ seed: 2 }), { height: 1.5, along: 3.6, tilt: 0 });
  hangOn(wall, createPoster({ seed: 3, taped: true, palette }), { height: 1.5, along: -2.6 });
  hangOn(wall, createPoster({ seed: 8, style: 'notice', palette }), { height: 1.5, along: -3.3 });
  hangOn(wall, createStickyNotes({ seed: 5, count: 7 }), { height: 1.1, along: -2.0, tilt: 0 });
} else if (view === 'clutter') {
  // Every vessel style, and a dressed table of clutter beside them, lit
  // flatly. A lathe profile passes a raycast test and still renders as an
  // egg; this is the only way to know.
  // Modest, or everything clips to white and every surface reads as the same
  // washed-out cream.
  scene.add(new AmbientLight(0xffffff, 0.5));
  const key = new DirectionalLight(0xffffff, 1.15);
  key.position.set(2, 5, 3);
  scene.add(key);
  const shelf = createTable({ style: 'trestle', seed: 2, palette });
  scene.add(shelf.object);
  VESSEL_STYLES.forEach((style, i) => {
    const v = createVessel({ style, seed: i + 2, palette });
    placeOn(shelf.surfaces![0], v, {
      along: (i - (VESSEL_STYLES.length - 1) / 2) * 0.23,
      across: 0.18,
      turn: 0.2,
    });
  });
  const themed = createClutter({
    theme: (params.get('theme') as ClutterTheme) ?? 'study',
    count: 8,
    seed: 3,
    palette,
  });
  themed.forEach((p, i) => {
    placeOn(shelf.surfaces![0], p, {
      along: (i - (themed.length - 1) / 2) * 0.24,
      across: -0.22,
      turn: 0.25,
    });
  });
  dressed = VESSEL_STYLES.length + themed.length;
  surfaces = 1;
  dressedSurface = shelf.surfaces![0];
} else if (view === 'table') {
  // A single dressed tabletop, close up, so the placement can be judged
  // rather than assumed.
  scene.add(new AmbientLight(0xffffff, 0.5));
  const key = new DirectionalLight(0xffffff, 1.15);
  key.position.set(2, 5, 3);
  scene.add(key);
  const table = createTable({ style: 'trestle', seed: 2, palette });
  scene.add(table.object);
  // Tabletop-sized things. A carryable basket is 45 cm across — three of
  // them IS a full table, and a demo stocked with them says nothing about
  // the layout.
  const kit = [
    ...createClutter({ theme: 'domestic', count: 6, seed: 3, palette }),
    createCandle({ seed: 1 }),
    createFramedPhoto({ seed: 3, standing: true, size: 0.17 }),
    createCandle({ seed: 4 }),
    createLantern({ seed: 7 }),
    createCandle({ seed: 8 }),
    createFramedPhoto({ seed: 12, standing: true, size: 0.13 }),
    createPhone({ seed: 2 }),
    createTablet({ seed: 6 }),
    createBasket({ seed: 2 }),
    createSack({ seed: 5 }),
  ];
  dressed = dress(table.surfaces![0], kit, { seed: 4, density: 0.55 }).length;
  surfaces = 1;
  dressedSurface = table.surfaces![0];
} else {
  // Swatches: every picture style across every frame, lit flatly, so the
  // shader can be judged rather than guessed at. Tests pass on mush.
  const board = createWallAnchor(scene, 0, 0, 0, 0, 20, 20);
  const frames: FrameStyle[] = ['none', 'thin', 'wide', 'ornate', 'box', 'clip'];
  const styles: PictureStyle[] = [...PICTURE_STYLES, 'mirror'];
  styles.forEach((style, col) => {
    frames.forEach((frame, row) => {
      const art = createPainting({
        width: 0.5,
        height: 0.36,
        style,
        frame,
        seed: col * 7 + row + 1,
        age: row * 0.16,
        glazed: frame === 'thin',
        palette,
      });
      hangOn(board, art, {
        along: (col - (styles.length - 1) / 2) * 0.62,
        height: 1.4 - row * 0.46,
        tilt: 0,
      });
      hung.push(art);
    });
  });
}

setTime(pinned ?? 0.5);

const clockDriver = new Clock();
let day = pinned ?? 0.5;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clockDriver.getDelta(), 0.1);
  if (pinned === null && view === 'room') {
    day = (day + dt / 60) % 1;
    setTime(day);
  }
  for (const c of clocks) c.update(dt);
  for (const c of stirs) c.update(dt);
  if (view === 'bath') {
    for (const s of showers) s.update(dt);
    for (const t2 of tubs) t2.update(dt);
    jacuzzi?.update(dt);
    for (const b of basins) b.update(dt);
  }
  if (view === 'water') {
    for (const s of streams) s.update(dt);
    shower?.update(dt);
    steam?.update(dt);
    // The basin fills while the taps run, then drains, then fills again — so
    // a screenshot at any moment catches it doing something.
    if (basin) {
      basin.fillBy(tap * dt * 0.22 - (tap > 0 ? 0 : dt * 0.3));
      basin.update(dt);
    }
  }
  const t = clockDriver.elapsedTime;
  if (view === 'room') {
    camera.position.set(Math.sin(t * 0.12) * 1.1, 1.62, 2.2);
    camera.lookAt(Math.sin(t * 0.08) * 0.8, 1.45, -2.6);
  } else if (view === 'bath') {
    camera.position.set(Math.sin(t * 0.08) * 1.4, 1.9, 4.6);
    camera.lookAt(0.2, 0.9, -0.4);
  } else if (view === 'water') {
    camera.position.set(Math.sin(t * 0.09) * 0.8, 1.3, 3.1);
    camera.lookAt(0.3, 0.95, 0);
  } else if (view === 'decor') {
    camera.position.set(Math.sin(t * 0.1) * 1.2, 1.4, 3.4);
    camera.lookAt(0, 1.1, -0.3);
  } else if (view === 'clutter') {
    camera.position.set(0, 1.15, 1.55);
    camera.lookAt(0, 0.82, 0);
  } else if (view === 'table') {
    camera.position.set(Math.sin(t * 0.2) * 0.8, 1.28, 1.5);
    camera.lookAt(0, 0.78, 0);
  } else {
    camera.position.set(0, 0.28, 2.9);
    camera.lookAt(0, 0.28, 0);
  }
  renderer.render(scene, camera);
});

// --- headless verification ---------------------------------------------

declare global {
  interface Window {
    galleryDebug: (t?: number) => Record<string, unknown>;
    galleryLook: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => void;
    galleryProbe: (x: number, y: number, w: number, h: number) => Record<string, unknown>;
    galleryTap: (open: number) => void;
    galleryBath: (on: number) => void;
    galleryStep: (dt: number) => void;
  }
}

/**
 * Sample real rendered pixels in a normalised box.
 *
 * Read straight out of the GL context in the same tick as the draw. Copying
 * the canvas with `drawImage` afterwards returns black — the drawing buffer
 * is cleared once the frame is composited unless `preserveDrawingBuffer` is
 * on, and a probe that always reports zero looks exactly like a shader that
 * draws nothing.
 */
/**
 * Advance everything by `dt` and render one frame.
 *
 * `galleryLook` stops the animation loop, so anything probed after it is a
 * frozen frame — two samples come back identical and the water looks static
 * whether it is or not.
 */
window.galleryStep = (dt: number) => {
  for (const s of streams) s.update(dt);
  for (const s of showers) s.update(dt);
  for (const t2 of tubs) t2.update(dt);
  jacuzzi?.update(dt);
  for (const b of basins) b.update(dt);
  shower?.update(dt);
  steam?.update(dt);
  for (const c of stirs) c.update(dt);
  for (const c of clocks) c.update(dt);
  if (basin) {
    basin.fillBy(tap * dt * 0.22);
    basin.update(dt);
  }
  renderer.render(scene, camera);
};

/** Drive the bathroom, for the headless run. */
window.galleryBath = (on: number) => {
  for (const s of showers) s.setRunning(on > 0.5);
  for (const t2 of tubs) for (const tp of t2.taps) tp.set(on > 0.5);
  jacuzzi?.setJets(on);
  for (const b of basins) for (const tp of b.taps) tp.set(on > 0.5);
};

/** Turn the taps and the shower on or off, for the headless run. */
window.galleryTap = (open: number) => {
  tap = open;
  for (const s of streams) s.setFlow(open);
  shower?.setFlow(open);
  steam?.setTarget(open > 0.5 ? 1 : 0);
};

window.galleryProbe = (x, y, w, h) => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const size = renderer.getDrawingBufferSize(new Vector2());
  const px = Math.round(x * size.x);
  // readPixels has its origin at the BOTTOM left.
  const py = Math.round((1 - y - h) * size.y);
  const pw = Math.max(1, Math.round(w * size.x));
  const ph = Math.max(1, Math.round(h * size.y));
  const buf = new Uint8Array(pw * ph * 4);
  gl.readPixels(px, py, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let r = 0;
  let g = 0;
  let b = 0;
  const lums: number[] = [];
  for (let i = 0; i < buf.length; i += 4) {
    r += buf[i];
    g += buf[i + 1];
    b += buf[i + 2];
    lums.push(0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]);
  }
  const n = lums.length;
  const mean = lums.reduce((a, v) => a + v, 0) / n;
  const sd = Math.sqrt(lums.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  // A coarse signature across the box. The MEAN cannot tell a moving pattern
  // from a still one — the average of a travelling texture barely changes —
  // so sample a grid and let the caller diff two frames cell by cell.
  const cells = 24;
  const signature: number[] = [];
  for (let c = 0; c < cells; c++) {
    const y0 = Math.floor((c / cells) * ph);
    const y1 = Math.max(y0 + 1, Math.floor(((c + 1) / cells) * ph));
    let sum = 0;
    let cn = 0;
    for (let py2 = y0; py2 < y1; py2++) {
      for (let px2 = 0; px2 < pw; px2++) {
        const i = (py2 * pw + px2) * 4;
        sum += 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
        cn++;
      }
    }
    signature.push(Math.round((sum / Math.max(1, cn)) * 10) / 10);
  }
  return {
    signature,
    rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
    lum: Math.round(mean),
    variation: Math.round(sd * 10) / 10,
    range: [Math.round(Math.min(...lums)), Math.round(Math.max(...lums))],
  };
};
window.galleryLook = (x, y, z, tx, ty, tz) => {
  renderer.setAnimationLoop(null);
  camera.position.set(x, y, z);
  camera.lookAt(tx, ty, tz);
  renderer.render(scene, camera);
};
window.galleryDebug = (t?: number) => {
  if (typeof t === 'number') setTime(t);
  renderer.render(scene, camera);
  const gl = renderer.getContext();

  // Where things actually ended up in the world, not where the layout meant
  // to put them. A picture inside the masonry passes every unit test.
  room.group.updateMatrixWorld(true);
  const placed = hung.map((art) => {
    const at = art.object.getWorldPosition(new Vector3());
    const facing = art.object.getWorldDirection(new Vector3());
    const front = at.clone().addScaledVector(facing, 0.5);
    return {
      name: art.object.name,
      y: Number(at.y.toFixed(3)),
      roll: Number(art.object.rotation.z.toFixed(4)),
      // Standing half a metre off the picture, am I on open floor?
      inRoom: view === 'room' ? room.floorAt(front.x, front.z) : true,
    };
  });

  return {
    glError: gl.getError(),
    view,
    timeOfDay: Number(cycle.timeOfDay.toFixed(3)),
    walls: room.walls.map((w) => ({
      length: Number(w.length.toFixed(2)),
      normal: [w.normal.x, w.normal.z],
    })),
    galleryCount,
    stirring: stirs.length,
    bath: {
      showers: showers.map((s) => ({ state: s.state, spray: Number(s.spray.flow.toFixed(2)), steam: Number(s.steam.density.toFixed(3)) })),
      tubs: tubs.map((t2) => Number(t2.fill.level.toFixed(3))),
      jets: jacuzzi ? jacuzzi.jets : null,
      jacuzziSeats: jacuzzi ? jacuzzi.seats.length : null,
      basins: basins.map((b) => ({ era: b.era, taps: b.taps.length, level: Number(b.fill.level.toFixed(3)) })),
    },
    water: {
      tap: Number(tap.toFixed(2)),
      streams: streams.length,
      streamFlow: streams[0] ? Number(streams[0].flow.toFixed(2)) : null,
      basinLevel: basin ? Number(basin.level.toFixed(3)) : null,
      showerFlow: shower ? Number(shower.flow.toFixed(2)) : null,
      steam: steam ? Number(steam.density.toFixed(3)) : null,
    },
    curtainTime: curtains
      ? Number(
          (
            (curtains.object.children.find((c) => c.name === 'panel') as unknown as {
              material: { userData: { waveUniforms: { uTime: { value: number } } } };
            }).material.userData.waveUniforms.uTime.value
          ).toFixed(3)
        )
      : null,
    surfaces,
    dressed,
    // What is actually sitting on the dressed surface, in ITS space — the
    // only way to see whether things are on the top or through it.
    onTop: dressedSurface
      ? dressedSurface.anchor.children.map((child) => {
          const box = new Box3().setFromObject(child);
          const local = dressedSurface!.anchor.worldToLocal(box.min.clone());
          return {
            sunk: Number(local.y.toFixed(4)),
            turn: Number(child.rotation.y.toFixed(3)),
            x: Number(child.position.x.toFixed(3)),
            z: Number(child.position.z.toFixed(3)),
          };
        })
      : null,
    hung: placed.length,
    facingIntoRoom: placed.filter((p) => p.inRoom).length,
    level: placed.filter((p) => p.roll === 0).length,
    clockTime: clocks[0] ? Number(clocks[0].time.toFixed(3)) : null,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  };
};
