import {
  AmbientLight,
  Box3,
  BoxGeometry,
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
  createPool,
  createHeatSource,
  createCookware,
  createPrepStation,
  createColdStore,
  createWashUp,
  createDresser,
  createKitchenware,
  stock,
  PREP_KINDS,
  COLD_ERAS,
  SINK_ERAS,
  DRESSER_KINDS,
  COOKWARE_KINDS,
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
  type Pool,
  type HeatSource,
  type HeatEra,
  type Cookware,
  type PrepStation,
  type Jacuzzi,
  type Basin,
  type ColdStore,
  type WashUp,
  type Storage,
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
const pools: Pool[] = [];
const stoves: HeatSource[] = [];
const pans: Cookware[] = [];
const preps: PrepStation[] = [];
const colds: ColdStore[] = [];
const washes: WashUp[] = [];
const dressers: Storage[] = [];
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
} else if (view === 'pool') {
  // Four pools in a row. There is deliberately NO ground plane: a pool is a
  // hole, and a solid floor laid across one is a lid over it — the first
  // render of this view was four empty frames lying on the tarmac. Each pool
  // brings its own apron, and here they butt together into one deck.
  scene.add(new AmbientLight(0xffffff, 0.55));
  const poolKey = new DirectionalLight(0xffffff, 1.35);
  poolKey.position.set(4, 9, 5);
  scene.add(poolKey);

  const lido = createPool({ style: 'lido', seed: 2, palette });
  scene.add(lido.object);
  const plunge = createPool({ style: 'plunge', seed: 3, palette });
  plunge.object.position.set(-10.6, 0, 0);
  scene.add(plunge.object);
  const bathhouse = createPool({ style: 'bathhouse', seed: 4, palette });
  bathhouse.object.position.set(-10.6, 0, 7.6);
  scene.add(bathhouse.object);
  const infinity = createPool({ style: 'infinity', seed: 5, palette });
  infinity.object.position.set(1.5, 0, 8.2);
  scene.add(infinity.object);
  pools.push(lido, plunge, bathhouse, infinity);
  for (const p of pools) {
    const m = p.object.children.find((c) => c.name === 'surface');
    if (m) m.onAfterRender = () => { m.userData.drawn = ((m.userData.drawn as number) ?? 0) + 1; };
  }
  // Something in the water, so the ripples have a reason to exist.
  lido.disturb(-2, 1, 1.2);
  lido.disturb(3, -1.4, 0.9);
  bathhouse.disturb(-10.6, 7.6, 1.2);

} else if (view === 'heat') {
  // Four eras of cooking heat side by side, all lit. The point of the row is
  // that they are not the same object with different textures: one has no
  // dial at all, one has a single damper, and two have a knob per ring.
  scene.add(new AmbientLight(0xffffff, 0.42));
  const heatKey = new DirectionalLight(0xffffff, 0.95);
  heatKey.position.set(3, 7, 5);
  scene.add(heatKey);
  const heatFloor = new Mesh(
    new PlaneGeometry(30, 30),
    new MeshStandardMaterial({ color: 0x4e4a45, roughness: 0.9 })
  );
  heatFloor.rotation.x = -Math.PI / 2;
  scene.add(heatFloor);
  const eras: HeatEra[] = ['hearth', 'range', 'gas', 'induction'];
  eras.forEach((era, i) => {
    const stove = createHeatSource({ era, seed: i + 3, palette });
    stove.object.position.set(-3.4 + i * 2.3, 0, 0);
    stove.setPower(1);
    scene.add(stove.object);
    stoves.push(stove);
  });

  // One pot on each stove, reading the field at its own position — and a
  // bench row in front showing every kind at a different stage of cooking.
  stoves.forEach((stove, i) => {
    const kind = i === 0 ? 'cauldron' : i === 1 ? 'pot' : i === 2 ? 'pan' : 'kettle';
    const w = createCookware({ kind, seed: i + 5, palette });
    w.add(0.9, { cookFor: i === 0 ? 90 : 45 });
    if (w.lid) w.lid.set(i === 1);
    if (i === 0) {
      // Hung on the crane hook: the medieval way, and the reason heat is a
      // field rather than a property of the stove.
      stove.zones[0].anchor.add(w.object);
    } else {
      // updateMatrixWorld FIRST. getWorldPosition on a freshly added object
      // returns whatever the stale matrix says, so every pan came out
      // hovering beside its stove rather than on the ring.
      stove.object.updateMatrixWorld(true);
      const zone = stove.zones[0].anchor.getWorldPosition(new Vector3());
      w.object.position.copy(zone);
      scene.add(w.object);
    }
    pans.push(w);
  });
  // A bench for the row to stand on, because a pan floating at worktop
  // height with nothing under it is a pan floating in mid-air.
  const benchTop = 0.86;
  const benchSlab = new Mesh(
    new BoxGeometry(4.0, 0.08, 0.6),
    new MeshStandardMaterial({ color: 0x6d6862, roughness: 0.8 })
  );
  benchSlab.position.set(0, benchTop - 0.04, 2.3);
  scene.add(benchSlab);
  COOKWARE_KINDS.forEach((kind, i) => {
    const w = createCookware({ kind, seed: i + 20, palette });
    w.add(0.8, { cookFor: 20 + i * 30 });
    if (w.lid) w.lid.set(false);
    w.object.position.set(-1.6 + i * 0.8, benchTop, 2.3);
    scene.add(w.object);
    pans.push(w);
  });

} else if (view === 'prep') {
  // Five prep stations in a row, all being worked. Each one publishes TWO
  // hand anchors, which is the whole point: one hand works and the other
  // holds the thing still.
  scene.add(new AmbientLight(0xffffff, 0.62));
  const prepKey = new DirectionalLight(0xffffff, 1.15);
  prepKey.position.set(3, 7, 5);
  scene.add(prepKey);
  const prepFloor = new Mesh(
    new PlaneGeometry(30, 30),
    new MeshStandardMaterial({ color: 0x5d5852, roughness: 0.9 })
  );
  prepFloor.rotation.x = -Math.PI / 2;
  scene.add(prepFloor);
  PREP_KINDS.forEach((kind, i) => {
    const st = createPrepStation({ kind, seed: i + 4, batch: 400, palette });
    st.object.position.set(-2.8 + i * 1.4, 0, 0);
    scene.add(st.object);
    preps.push(st);
  });

} else if (view === 'cold') {
  // Four eras of cold storage, all with their doors hanging open — because
  // the inside is the prop. A cold store photographed shut is a cupboard.
  scene.add(new AmbientLight(0xffffff, 0.42));
  const coldKey = new DirectionalLight(0xffffff, 1.0);
  coldKey.position.set(3, 7, 5);
  scene.add(coldKey);
  const coldFloor = new Mesh(
    new PlaneGeometry(30, 30),
    new MeshStandardMaterial({ color: 0x4a4742, roughness: 0.9 })
  );
  coldFloor.rotation.x = -Math.PI / 2;
  scene.add(coldFloor);
  COLD_ERAS.forEach((era, i) => {
    const store = createColdStore({ era, seed: i + 2, ambient: 22, palette });
    store.object.position.set(-2.6 + i * 1.75, 0, 0);
    // Standing open, which is also the only way to see the ice melt and the
    // frost creep — and, conveniently, the state that breaks all four.
    store.door.set(true);
    scene.add(store.object);
    colds.push(store);
    // Something on the middle shelf, so 'inside' has a subject.
    store.object.updateMatrixWorld(true);
    const shelf = store.shelves[Math.floor(store.shelves.length / 2)];
    const jar = createVessel({
      // Short things: the shelves in a small cabinet do not have the
      // headroom for a bottle, and one placed there goes straight through
      // the board above it.
      style: i % 2 === 0 ? 'jug' : 'bowl',
      seed: i + 9,
      palette,
    });
    jar.object.position.copy(shelf.anchor.getWorldPosition(new Vector3()));
    scene.add(jar.object);
  });

} else if (view === 'sink') {
  // Four eras of washing-up, all loaded and all being worked. The row is the
  // argument: a trough with no tap and nowhere to stack, a butler sink whose
  // tap runs cold, a double bowl with a drainer, and a machine that needs
  // nobody standing at it at all.
  scene.add(new AmbientLight(0xffffff, 0.46));
  const sinkKey = new DirectionalLight(0xffffff, 1.05);
  sinkKey.position.set(3, 7, 5);
  scene.add(sinkKey);
  const sinkFloor = new Mesh(
    new PlaneGeometry(30, 30),
    new MeshStandardMaterial({ color: 0x504a44, roughness: 0.9 })
  );
  sinkFloor.rotation.x = -Math.PI / 2;
  scene.add(sinkFloor);
  SINK_ERAS.forEach((era, i) => {
    const w = createWashUp({ era, seed: i + 3, palette });
    w.object.position.set(-2.6 + i * 1.75, 0, 0);
    scene.add(w.object);
    // Loaded, watered and part-way through — a sink photographed empty is a
    // worktop with a hole in it.
    w.load(era === 'dishwasher' ? 9 : 7);
    if (era !== 'dishwasher') w.fill(0.85, era === 'scullery' ? 0.35 : 0.95);
    else w.start();
    washes.push(w);
  });

} else if (view === 'dresser') {
  // Five kinds of kitchen storage, all stocked. The row is the argument:
  // three of them display what they hold and two of them hide it, and that
  // is the difference between furniture and a box on a wall.
  scene.add(new AmbientLight(0xffffff, 0.5));
  const dKey = new DirectionalLight(0xffffff, 1.0);
  dKey.position.set(3, 7, 5);
  scene.add(dKey);
  const dFloor = new Mesh(
    new PlaneGeometry(30, 30),
    new MeshStandardMaterial({ color: 0x4c4741, roughness: 0.9 })
  );
  dFloor.rotation.x = -Math.PI / 2;
  scene.add(dFloor);
  DRESSER_KINDS.forEach((kind, i) => {
    const d = createDresser({ kind, seed: i + 2, palette });
    d.object.position.set(-3.1 + i * 1.6, 0, 0);
    scene.add(d.object);
    stock(d, createKitchenware({ count: 26, seed: i + 5, palette }), { seed: i + 5 });
    // Doors open, because a stocked cupboard photographed shut is a cupboard.
    for (const door of d.doors) door.set(true);
    dressers.push(d);
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
  if (view === 'pool') {
    for (const p of pools) p.update(dt);
  }
  if (view === 'heat') {
    for (const st of stoves) st.update(dt);
    for (let i = 0; i < pans.length; i++) {
      // The four on the stoves read their own stove; the bench row is fed a
      // steady bench heat so it shows the states side by side.
      pans[i].update(dt, i < stoves.length ? stoves[i] : 0.7);
    }
  }
  if (view === 'prep') {
    for (const st of preps) st.update(dt, true);
  }
  if (view === 'cold') {
    for (const st of colds) st.update(dt);
  }
  if (view === 'sink') {
    for (const w of washes) w.update(dt, true);
  }
  if (view === 'dresser') {
    for (const d of dressers) d.update(dt);
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
  } else if (view === 'pool') {
    camera.position.set(Math.sin(t * 0.08) * 3, 6.0, 12);
    camera.lookAt(0, -0.4, 0);
  } else if (view === 'heat') {
    camera.position.set(Math.sin(t * 0.1) * 1.6, 1.75, 4.2);
    camera.lookAt(0, 0.7, 0);
  } else if (view === 'prep') {
    camera.position.set(Math.sin(t * 0.1) * 1.2, 1.5, 2.6);
    camera.lookAt(0, 0.95, 0);
  } else if (view === 'cold') {
    camera.position.set(Math.sin(t * 0.1) * 1.4, 1.5, 3.6);
    camera.lookAt(0, 0.85, 0);
  } else if (view === 'sink') {
    camera.position.set(Math.sin(t * 0.1) * 1.3, 1.45, 3.2);
    camera.lookAt(0, 0.8, 0);
  } else if (view === 'dresser') {
    camera.position.set(Math.sin(t * 0.1) * 1.4, 1.55, 4.0);
    camera.lookAt(0, 1.2, 0);
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
    galleryWater: (on: number) => void;
    galleryBath: (on: number) => void;
    galleryStep: (dt: number) => void;
    galleryDoors: (open: number) => void;
    gallerySinks: (fresh: number) => void;
    galleryShut: (shut: number) => void;
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
/**
 * Advance the simulation WITHOUT drawing.
 *
 * This used to render on every step, which made stepping a minute of stove
 * time into a minute of SwiftShader wall clock for pictures nobody looked
 * at. Stepping and drawing are different jobs: `galleryLook` and
 * `galleryDebug` both render, and a screenshot always follows one of them.
 */
window.galleryStep = (dt: number) => {
  // Everything that has an update must be listed HERE too, not only in the
  // animation loop: galleryStep is what the headless runs drive, so a prop
  // missing from this list reports perfectly plausible numbers for a system
  // nobody ever stepped.
  for (const st of stoves) st.update(dt);
  for (const pl of pools) pl.update(dt);
  for (let i = 0; i < pans.length; i++) pans[i].update(dt, i < stoves.length ? stoves[i] : 0.7);
  for (const st of preps) st.update(dt, true);
  for (const st of colds) st.update(dt);
  for (const w of washes) w.update(dt, true);
  for (const d of dressers) d.update(dt);
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
};

/** Shut every dresser door, for the headless run. */
window.galleryShut = (shut: number) => {
  for (const d of dressers) for (const door of d.doors) door.set(shut < 0.5);
};

/** Refill every sink and open the machine, for the headless run. */
window.gallerySinks = (fresh: number) => {
  for (const w of washes) {
    if (w.era === 'dishwasher') w.door?.set(fresh > 0.5);
    else if (fresh > 0.5) {
      w.empty();
      w.fill(0.9, 1);
      w.load(6);
    }
  }
};

/** Open or shut every cold store, for the headless run. */
window.galleryDoors = (open: number) => {
  for (const st of colds) st.door.set(open > 0.5);
};

/** Drive the bathroom, for the headless run. */
window.galleryWater = (on: number) => {
  for (const p of pools) {
    const m = p.object.children.find((c) => c.name === 'surface');
    if (m) m.visible = on > 0.5;
  }
  renderer.render(scene, camera);
};
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
    preps: preps.map((st) => ({
      kind: st.kind,
      action: st.action,
      remaining: Number(st.remaining.toFixed(2)),
      progress: Number(st.progress.toFixed(2)),
      gap: Number(
        st.work.getWorldPosition(new Vector3())
          .distanceTo(st.guide.getWorldPosition(new Vector3())).toFixed(3)
      ),
    })),
    cold: colds.map((st) => {
      st.object.updateMatrixWorld(true);
      const shelf = st.shelves[Math.floor(st.shelves.length / 2)].anchor
        .getWorldPosition(new Vector3());
      const out = shelf.clone().add(new Vector3(0, 0, 1.5));
      return {
        era: st.era,
        state: st.state,
        temp: Number(st.temperature.toFixed(2)),
        setpoint: st.setpoint,
        running: st.running,
        ice: Number(st.ice.toFixed(3)),
        frost: Number(st.frost.toFixed(3)),
        door: Number(st.door.state.toFixed(2)),
        ajar: Number(st.ajar.toFixed(1)),
        // Inside vs a metre and a half out in the room: if these two read the
        // same the cavity is not where the geometry is.
        inside: Number(st.chillAt(shelf.x, shelf.y, shelf.z).toFixed(2)),
        outside: Number(st.chillAt(out.x, out.y, out.z).toFixed(2)),
        keeps: Number(st.keepAt(shelf.x, shelf.y, shelf.z).toFixed(3)),
        light: st.light ? Number(st.light.intensity.toFixed(2)) : null,
      };
    }),
    dressers: dressers.map((d) => ({
      kind: d.kind,
      spaces: d.spaces.length,
      used: d.used,
      free: d.free,
      shown: d.shown,
      doors: d.doors.length,
      surfaces: d.surfaces.length,
      byKind: [...new Set(d.spaces.map((sp) => sp.kind))].sort().join(','),
    })),
    sinks: washes.map((w) => ({
      era: w.era,
      dirty: w.dirty,
      clean: w.clean,
      water: Number(w.water.toFixed(2)),
      soil: Number(w.soil.toFixed(2)),
      hot: Number(w.hot.toFixed(2)),
      progress: Number(w.progress.toFixed(2)),
      running: w.running,
      cycle: Number(w.cycle.toFixed(2)),
      taps: w.taps.length,
      board: w.board !== null,
      steam: Number(w.steam.density.toFixed(2)),
    })),
    pans: pans.map((w) => ({
      kind: w.kind,
      state: w.state,
      temp: Number(w.temperature.toFixed(2)),
      level: Number(w.level.toFixed(2)),
      progress: Number(w.progress.toFixed(2)),
      boiling: w.boiling,
      steam: Number(w.steam.density.toFixed(2)),
    })),
    heat: stoves.map((st) => ({
      era: st.era,
      state: st.state,
      temp: Number(st.temperature.toFixed(2)),
      fuel: Number(st.fuel.toFixed(2)),
      burnsFuel: st.burnsFuel,
      zones: st.zones.map((z) => `${z.kind}:${z.heat.toFixed(2)}`),
      knobs: st.control ? Number(st.control.object.rotation.z.toFixed(2)) : null,
    })),
    pool: pools.map((p) => ({
      style: p.style,
      surfaceY: Number(p.surfaceY.toFixed(3)),
      shallow: Number(p.depthAt(p.object.position.x - p.length / 2 + 0.2, p.object.position.z).toFixed(2)),
      deep: Number(p.depthAt(p.object.position.x + p.length / 2 - 0.2, p.object.position.z).toFixed(2)),
      outside: p.depthAt(p.object.position.x + p.length, p.object.position.z),
      ladder: p.ladder !== null,
      edges: p.edges.length,
      water: (() => {
        const m = p.object.children.find((c) => c.name === 'surface') as
          | (import('three').Mesh & { material: import('three').MeshStandardMaterial })
          | undefined;
        if (!m) return 'missing';
        return {
          visible: m.visible,
          drawn: (m.userData.drawn as number) ?? 0,
          opacity: m.material.opacity,
          transparent: m.material.transparent,
          color: m.material.color.getHexString(),
          y: Number(m.getWorldPosition(new Vector3()).y.toFixed(3)),
        };
      })(),
    })),
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
