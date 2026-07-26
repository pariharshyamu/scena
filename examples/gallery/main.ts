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
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
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
  createIngredient,
  createDeckedShip,
  createOcean,
  createSailRig,
  createWindField,
  createBerth,
  moor,
  createGangway,
  createOarBank,
  createSteamPlant,
  createHold,
  createSmoke,
  createExtractor,
  createSmokeLayer,
  createKitchenware,
  stock,
  PREP_KINDS,
  COLD_ERAS,
  SINK_ERAS,
  DRESSER_KINDS,
  INGREDIENT_KINDS,
  EXTRACTOR_ERAS,
  SHIP_ERAS,
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
  type Ingredient,
  type DeckedShip,
  type Ocean,
  type SailRig,
  type WindField,
  type Berth,
  type Mooring,
  type Gangway,
  type Carrier,
  type OarBank,
  type SteamPlant,
  type Hold,
  type SmokeLayer,
  type Extractor,
  type SmokeSource,
  type PropSurface,
  type WallArt,
} from 'scena3d';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'room';
const pinned = params.get('t') !== null ? Number(params.get('t')) : null;
const palette = PALETTES.meadow;

/**
 * What the HUD says, for views that have outgrown the default blurb.
 *
 * A screenshot of the wrong caption is a screenshot that argues for the
 * wrong thing, and these get read back long after the session that made
 * them.
 */
const CAPTIONS: Record<string, string> = {
  trim:
    '<strong>SCENA — trim &amp; the free surface</strong><br />' +
    'Four identical steamers, loaded four ways. Grey has nothing aboard: she ' +
    'rides high, her screw is half out and she is <em>stiff</em> — an empty ' +
    'ship is not a safe ship. Red has her cargo in the fore hold and is down ' +
    'by the head; yellow has hers stowed off the centreline and is listed. ' +
    'Green is the one to look at: she is the only one with the right weight ' +
    'in the right place, and she has the least stability of the four, ' +
    'because her ballast tank is <em>half</em> pumped. A hold full of water ' +
    'is safer than a hold half full of it, and the penalty goes as the ' +
    'width of the surface <em>cubed</em>. Try ' +
    '<code>galleryTrim(1)</code> to press every tank up.',
  steam:
    '<strong>SCENA — steam</strong><br />' +
    '<em>Full ahead is not her fastest.</em> Two identical triples: the red ' +
    'one is in full gear, the green one notched up to a cut-off she can ' +
    'hold — <code>linkFor(3600)</code>. Red goes out in front and is then ' +
    'overhauled, because the regulator spends a store the fire fills a ' +
    'hundred times slower than the engine empties it. Yellow is banked: a ' +
    'wisp, a needle at half, a crank that is not turning. Grey lit her fires ' +
    'twenty minutes ago — black funnel, needle flat on its stop, dead in the ' +
    'water, because below 100 °C there is no steam to have. Try ' +
    '<code>gallerySteam(1)</code> to open them all right up.',
  oars:
    '<strong>SCENA — under oars</strong><br />' +
    'An oar is not a throttle, it is a <em>duty cycle</em>: the blade is in ' +
    'the water for under half of every stroke, so thrust is a pulse and her ' +
    'speed <em>surges</em>. Three crews, one rate — the only difference is ' +
    'how together they are. Watch the ripple run aft down the ragged one, ' +
    'and watch which boat is winning. Try <code>galleryOars(30)</code> to ' +
    'rate up, or <code>galleryOars(22, 1, 0.2)</code> to turn.',
  berth:
    '<strong>SCENA — alongside</strong><br />' +
    'A rope is a <em>one-way</em> constraint: it pulls, and it can never ' +
    'push. A fender is the same thing backwards. She is held in the gap ' +
    'between them, which is why she is never quite still. The five posts ' +
    'are people standing perfectly still — and <em>nothing</em> moves them ' +
    'but the <code>ride()</code> of whatever they are on. The one ashore ' +
    'never budges, the one on deck goes everywhere she goes, and the three ' +
    'on the brow move by fractions in between. Try ' +
    '<code>galleryMoor(0)</code> to let go.',
  sail:
    '<strong>SCENA — sail</strong><br />' +
    'Four rigs, six centuries, one breeze. The arrow is the wind. Nobody can ' +
    'sail at a mark dead to windward, so every ship here is on the closest ' +
    'course her own rig will hold — <code>layline()</code> — which is why ' +
    'they fan out: the square rigger has had to bear away seventy degrees ' +
    'and the Bermudan sloop only forty. Try ' +
    '<code>gallerySail(0)</code> in the console to put them all in irons.',
};
const hud = document.getElementById('hud');
if (hud && CAPTIONS[view]) hud.innerHTML = CAPTIONS[view];

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
const foods: Ingredient[] = [];
const vents: Extractor[] = [];
const ships: DeckedShip[] = [];
const oceans: Ocean[] = [];
/** Markers standing on decks. `at` is written by NOTHING but `ride`. */
const shipRiders: Array<{ ship: DeckedShip; at: Vector3; post: Mesh; z0: number }> = [];
const rigs: Array<{ rig: SailRig; ship: DeckedShip; label: Mesh }> = [];
/** Mast heights, mirrored from the rig table so pennants sit on top. */
const KINDS_MAST = { square: 11, lateen: 10, gaff: 12, bermudan: 13 };
let breeze: WindField | null = null;
let windVane: Mesh | null = null;
let berth: Berth | null = null;
let moored: Mooring | null = null;
let brow: Gangway | null = null;
let berthShip: DeckedShip | null = null;
const banks: Array<{ bank: OarBank; ship: DeckedShip; wake: Mesh }> = [];
/**
 * The four steam plants — in their OWN list, never in `ships`.
 *
 * `galleryStep` drives everything in `ships` at a flat five knots. Push a
 * steamer in there and she makes way at exactly the speed of a ship with no
 * engine in her, while her gauge, her crank and her funnel all report a
 * perfectly plausible plant that is doing nothing whatever.
 */
/**
 * Four hulls loaded four ways, and one lever between them.
 *
 * Held on station like the steamers: the read is how each of them SITS, and a
 * ship trimmed two degrees by the head looks exactly like a ship that is not
 * once she has steamed out of frame.
 */
const trims: Array<{
  hold: Hold;
  ship: DeckedShip;
  x0: number;
  z0: number;
  label: string;
}> = [];

const plants: Array<{
  plant: SteamPlant;
  ship: DeckedShip;
  x0: number;
  z0: number;
  made: number;
  label: string;
}> = [];
/**
 * People standing still on the three frames.
 *
 * Nothing ever writes their x/z except the `ride` of whatever they are
 * standing on. If the one on the quay stays put, the one on deck travels
 * with the ship, and the ones on the plank move by fractions in between,
 * the handshake works — and that is a thing you can watch rather than a
 * number you have to trust.
 */
const standers: Array<{ on: Carrier; at: Vector3; post: Mesh; carried: number }> = [];
let heave = 0;
const UP = new Vector3(0, 1, 0);
const plumes: SmokeSource[] = [];
let smokeRoom: SmokeLayer | null = null;
let foodChill: ColdStore | null = null;
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

} else if (view === 'larder') {
  // Ten ingredients in two rows on a bench: whole at the back, prepped at
  // the front, all ageing. And a fridge beside them holding a third set,
  // which is the whole handshake in one picture — the ones inside keep and
  // the ones on the bench do not.
  scene.add(new AmbientLight(0xffffff, 0.55));
  const iKey = new DirectionalLight(0xffffff, 1.1);
  iKey.position.set(3, 7, 5);
  scene.add(iKey);
  const iFloor = new Mesh(
    new PlaneGeometry(30, 30),
    new MeshStandardMaterial({ color: 0x4e4a44, roughness: 0.9 })
  );
  iFloor.rotation.x = -Math.PI / 2;
  scene.add(iFloor);

  const benchTop = 0.9;
  const slab = new Mesh(
    new BoxGeometry(3.4, 0.07, 0.7),
    new MeshStandardMaterial({ color: 0x7a736a, roughness: 0.8 })
  );
  slab.position.set(-0.6, benchTop - 0.035, 0);
  scene.add(slab);
  INGREDIENT_KINDS.forEach((kind, i) => {
    for (const row of [0, 1]) {
      const food = createIngredient({ kind, seed: i * 3 + row, palette });
      // Front row chopped: prepping is what puts a thing on a clock, so the
      // two rows diverge on their own without anything driving them.
      if (row === 1) food.prep();
      food.object.position.set(-2.15 + i * 0.31, benchTop, row === 0 ? -0.16 : 0.16);
      scene.add(food.object);
      foods.push(food);
    }
  });

  foodChill = createColdStore({ era: 'fridge', seed: 4, ambient: 22, palette });
  foodChill.object.position.set(2.0, 0, 0);
  foodChill.door.set(true);
  scene.add(foodChill.object);
  colds.push(foodChill);
  foodChill.object.updateMatrixWorld(true);
  INGREDIENT_KINDS.slice(0, 4).forEach((kind, i) => {
    const shelf = foodChill!.shelves[Math.min(i, foodChill!.shelves.length - 1)];
    // WHOLE, matching the bench's back row exactly. Chopping these as well
    // would move two variables at once and the picture would prove nothing.
    const food = createIngredient({ kind, seed: 40 + i, palette });
    const at = shelf.anchor.getWorldPosition(new Vector3());
    food.object.position.set(at.x + (i % 2 ? 0.09 : -0.09), at.y, at.z);
    scene.add(food.object);
    foods.push(food);
  });

} else if (view === 'smoke') {
  // Four eras of extraction, each with its own plume under it, in one room
  // whose ceiling layer they all share. The point of the row is that a
  // plume under a hood barely reaches the ceiling and a plume under a hole
  // in the roof mostly does — and, behind all of it, that this is the only
  // thing in the library drawn with NormalBlending, because additive smoke
  // is steam.
  scene.add(new AmbientLight(0xffffff, 0.62));
  const sKey = new DirectionalLight(0xffffff, 1.1);
  sKey.position.set(3, 7, 4);
  scene.add(sKey);
  // A pale back wall, so the smoke has something to be dark AGAINST. On the
  // black gallery background an additive plume and a normal-blended one are
  // indistinguishable, which would defeat the entire view.
  const wall = new Mesh(
    new BoxGeometry(11, 3.2, 0.12),
    new MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.95 })
  );
  wall.position.set(0, 1.6, -1.6);
  scene.add(wall);
  const sFloor = new Mesh(
    new PlaneGeometry(30, 30),
    new MeshStandardMaterial({ color: 0x8a857c, roughness: 0.95 })
  );
  sFloor.rotation.x = -Math.PI / 2;
  scene.add(sFloor);

  // A ceiling. The layer needs something to hang under, and a smoke hole
  // with no roof to be a hole in is a wooden pergola hovering in mid-air.
  const ceiling = new Mesh(
    new BoxGeometry(11, 0.1, 3.4),
    new MeshStandardMaterial({ color: 0xcfcac1, roughness: 0.95 })
  );
  ceiling.position.set(0, 2.95, -0.4);
  scene.add(ceiling);

  smokeRoom = createSmokeLayer({ width: 10, depth: 3, height: 2.9, alarmY: 2.6 });
  smokeRoom.object.position.set(0, 0, -0.4);
  scene.add(smokeRoom.object);

  const styles = ['wood', 'soot', 'grease', 'scorch'] as const;
  EXTRACTOR_ERAS.forEach((era, i) => {
    const x = -3.6 + i * 2.4;
    const vent = createExtractor({ era, seed: i + 2, palette });
    vent.object.position.set(x, 0, -0.5);
    vent.setPower(1);
    scene.add(vent.object);
    vents.push(vent);
    smokeRoom!.vent(vent);

    // Under the mouth the extractor publishes — not the origin, which is on
    // its front face.
    vent.object.updateMatrixWorld(true);
    const m = vent.mouth.getWorldPosition(new Vector3());
    const plume = createSmoke({ style: styles[i], seed: i + 5, height: 1.9 });
    plume.setRate(1);
    plume.object.position.set(m.x, 0.9, m.z);
    scene.add(plume.object);
    plumes.push(plume);
    smokeRoom!.add(plume);

    // A bench for each plume to be coming off, because smoke rising out of
    // thin air is a bug report.
    const bench = new Mesh(
      new BoxGeometry(1.0, 0.08, 0.6),
      new MeshStandardMaterial({ color: 0x6e675e, roughness: 0.85 })
    );
    bench.position.set(m.x, 0.86, m.z);
    scene.add(bench);
  });

} else if (view === 'ship') {
  // Four eras of deck, all making way through the same swell, each with a
  // marker standing on it that is NEVER moved by anything but `ride`. If the
  // markers stay on their ships, the handshake works; if they trail off
  // astern, it does not — and that is a thing you can see rather than a
  // number you have to trust.
  scene.add(new AmbientLight(0xffffff, 0.6));
  const shipKey = new DirectionalLight(0xffffff, 1.15);
  shipKey.position.set(4, 9, 6);
  scene.add(shipKey);
  const sea = createOcean({ amplitude: 0.85, wavelength: 24, size: 900, segments: 220 });
  scene.add(sea.mesh);
  oceans.push(sea);

  SHIP_ERAS.forEach((era, i) => {
    const ship = createDeckedShip({ era, seed: i + 3, palette });
    ship.object.position.set(-95 + i * 70, 0, 0);
    ship.float((x, z) => sea.heightAt(x, z));
    scene.add(ship.object);
    ships.push(ship);

    // One marker per deck, standing still. Nothing ever writes their x/z
    // except `ride`.
    ship.update(1 / 60, {});
    for (const deck of ship.decks) {
      if (deck.name === 'hold') continue;
      const at = new Vector3(ship.object.position.x, 0, ship.object.position.z + deck.z);
      const y = ship.deckAt(at.x, at.z);
      if (y === null) continue;
      at.y = y;
      const post = new Mesh(
        new BoxGeometry(0.5, 1.8, 0.5),
        new MeshStandardMaterial({ color: 0xd8483a, flatShading: true })
      );
      post.name = `rider:${era}:${deck.name}`;
      scene.add(post);
      shipRiders.push({ ship, at, post, z0: at.z - ship.object.position.z });
    }
  });

} else if (view === 'sail') {
  // Four rigs, six hundred years apart, in ONE breeze — and each one steered
  // to the closest course it can actually hold. That last clause is the whole
  // view: they are not on four arbitrary headings, they are each on the
  // heading `layline` gave them for the same upwind mark, which is why they
  // fan out. The square rigger is pointing nearly across the picture and the
  // Bermudan sloop is pointing almost at it.
  // Daylight, and a sky to put it in. The gallery's near-black background is
  // right for a room and wrong for the open sea: it turns white canvas grey
  // and makes a fine breezy morning look like a shipwreck at midnight.
  scene.background = new Color(0x8fb4d6);
  // The gallery's camera is built for a sitting room and clips at a hundred
  // metres. A fleet works to windward on courses seventy degrees apart and
  // is past that inside a minute — at which point the ships vanish while
  // every number about them stays perfectly correct, which is the most
  // expensive failure mode in this whole library.
  camera.far = 2200;
  camera.near = 0.5;
  camera.updateProjectionMatrix();
  scene.add(new AmbientLight(0xffffff, 0.9));
  const sailKey = new DirectionalLight(0xffffff, 1.9);
  sailKey.position.set(-14, 16, 9);
  scene.add(sailKey);
  const sea = createOcean({ amplitude: 0.5, wavelength: 26, size: 700, segments: 180 });
  scene.add(sea.mesh);
  oceans.push(sea);

  // Blowing toward +x, so it comes FROM -x. Gust 0 so a screenshot is not a
  // lottery over which frame caught the lull.
  breeze = createWindField({ direction: 0, strength: 1, gust: 0 });
  const windFrom = -Math.PI / 2;

  // Each rig on the hull it belongs to, and sized to it — a square course on
  // a carrack, a lateen yard on a galley.
  const FLEET = [
    { kind: 'square' as const, era: 'carrack' as const, scale: 1.5 },
    { kind: 'lateen' as const, era: 'galley' as const, scale: 1.4 },
    { kind: 'gaff' as const, era: 'carrack' as const, scale: 1.3 },
    { kind: 'bermudan' as const, era: 'galley' as const, scale: 1.15 },
  ];

  // Build the rigs FIRST, because where each ship goes depends on where she
  // has to point, and that is `layline`'s answer rather than mine.
  const built = FLEET.map(({ kind, era, scale: rigScale }, i) => {
    const rig = createSailRig({ kind, seed: i + 2, palette, scale: rigScale });
    rig.setWind(breeze!);
    // The mark is dead to windward. Nobody can sail at it; everybody sails
    // as near to it as their own rig allows.
    return { kind, era, rigScale, rig, heading: rig.layline(windFrom, windFrom + rig.noGo), i };
  });

  // Lay the fleet out ACROSS the camera's line of sight, which is across the
  // course they are all steering — not along the world's x axis. Strung out
  // on the axis the camera looks down, four ships are one ship with three
  // hidden behind it, and the first cut of this view was exactly that.
  const meanHeading = built.reduce((a, b) => a + b.heading, 0) / built.length;
  const along = new Vector3(Math.sin(meanHeading), 0, Math.cos(meanHeading));

  built.forEach(({ kind, era, rigScale, rig, heading, i }) => {
    const ship = createDeckedShip({ era, seed: i + 4, palette });
    ship.object.position.copy(along).multiplyScalar((i - 1.5) * 42);
    ship.object.rotation.y = heading;
    ship.float((x, z) => sea.heightAt(x, z));
    scene.add(ship.object);
    ships.push(ship);

    rig.object.position.y = ship.decks[0].y * 0.92;
    ship.object.add(rig.object);

    // A pennant at the masthead so the picture says which rig is which
    // without anybody having to count sails.
    const label = new Mesh(
      new BoxGeometry(1.1, 1.1, 1.1),
      new MeshStandardMaterial({
        color: [0xd8483a, 0xe0a531, 0x53b06a, 0x4f8fd8][i],
        emissive: [0x3a0f0a, 0x3a2a06, 0x0d2a15, 0x0c1e35][i],
        flatShading: true,
      })
    );
    label.position.set(0, rig.object.position.y + KINDS_MAST[kind] * rigScale + 0.8, 0);
    ship.object.add(label);
    rigs.push({ rig, ship, label });
  });

  // Which way the wind is blowing, made of something you can see. A scene
  // about the angle to the wind with no wind in it is four boats on a pond.
  //
  // Lying FLAT on the water, not standing up in the sky: the camera moves
  // round the fleet to keep the canvas broadside, so anything upright ends
  // up end-on sooner or later — an arrow in the sky was a thumbtack in two
  // shots out of four. Seen from above, a flat one always reads.
  const vaneMat = new MeshStandardMaterial({
    color: 0xf6f2e8, emissive: 0x515b66, roughness: 0.9, flatShading: true,
  });
  windVane = new Mesh(new BoxGeometry(34, 0.5, 3.4), vaneMat);
  scene.add(windVane);
  const head = new Mesh(new CylinderGeometry(0, 5.5, 11, 3), vaneMat);
  head.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
  head.position.set(22, 0, 0);
  windVane.add(head);

} else if (view === 'oars') {
  // Three longships, three crews, one rate. The only thing different about
  // them is how TOGETHER they are — and everything you can see follows from
  // that: the spread of the blades, the ripple running aft down the boat,
  // and how far up the water each of them has got.
  scene.background = new Color(0x9dbad2);
  camera.far = 1400;
  camera.updateProjectionMatrix();
  scene.add(new AmbientLight(0xffffff, 0.88));
  const key = new DirectionalLight(0xffffff, 1.75);
  key.position.set(-8, 15, 10);
  scene.add(key);
  const sea = createOcean({ amplitude: 0.22, wavelength: 28, size: 900, segments: 170 });
  scene.add(sea.mesh);
  oceans.push(sea);

  [1, 0.55, 0.15].forEach((together, i) => {
    const ship = createDeckedShip({ era: 'galley', seed: i + 6, palette });
    ship.float((x, z) => sea.heightAt(x, z));
    ship.object.position.set(-22 + i * 22, 0, -30);
    scene.add(ship.object);

    const bank = createOarBank({
      kind: 'longship',
      seats: 11,
      beam: ship.beam * 1.05,
      gunwale: 0.95,
      together,
      seed: i + 2,
      palette,
    });
    bank.setRate(22);
    ship.object.add(bank.object);

    // A marker astern of each: how far she has come. Nothing sets its z but
    // the ship's own start line, so the three of them are a race result you
    // can read off the water.
    const wake = new Mesh(
      new BoxGeometry(0.5, 3.2, 0.5),
      new MeshStandardMaterial({
        color: [0x53b06a, 0xe0a531, 0xd8483a][i],
        emissive: [0x0d2a15, 0x3a2a06, 0x3a0f0a][i],
        flatShading: true,
      })
    );
    wake.position.set(ship.object.position.x, 1.6, -30);
    void wake;
    scene.add(wake);
    banks.push({ bank, ship, wake });
  });

} else if (view === 'trim') {
  // FOUR STEAMERS, IDENTICAL, LOADED FOUR WAYS.
  //
  //   A  light        — nothing aboard, riding high, screw half out, and STIFF
  //   B  down by head — the whole cargo in the fore hold
  //   C  listed       — the same tonnage, and all of it out to starboard
  //   D  slack tanks  — properly loaded, and her ballast half pumped
  //
  // D is the one to look at. She is the only one carrying the right weight in
  // the right place, and she is the one with no stability left — because a
  // hundred and thirty tonnes of water free to run the width of her costs her
  // more than any of the other three paid.
  scene.background = new Color(0x9dbad2);
  camera.far = 2200;
  camera.updateProjectionMatrix();
  scene.add(new AmbientLight(0xffffff, 0.88));
  const key = new DirectionalLight(0xffffff, 1.7);
  key.position.set(-9, 16, 11);
  scene.add(key);
  // A SLIGHT swell, on purpose. The read here is the STEADY lean a load puts
  // on her, and a metre of sea puts the same amount on and takes it off again
  // twice a minute — four ships pitching is four ships you cannot compare.
  const sea = createOcean({ amplitude: 0.12, wavelength: 40, size: 1600, segments: 190 });
  scene.add(sea.mesh);
  oceans.push(sea);

  const SET: Array<{ label: string; colour: number; cargo: Record<string, number>; off?: number }> = [
    { label: 'light', colour: 0x7a8b99, cargo: {} },
    { label: 'by the head', colour: 0xd8483a, cargo: { fore: 300, main: 160 } },
    { label: 'listed', colour: 0xe0a531, cargo: { main: 380, aft: 180 }, off: 0.34 },
    { label: 'slack tanks', colour: 0x53b06a, cargo: { fore: 220, main: 300, aft: 180 } },
  ];

  SET.forEach((it, i) => {
    const ship = createDeckedShip({ era: 'steamer', seed: i + 21, palette });
    ship.float((x, z) => sea.heightAt(x, z));
    // Clear of one another: they are 58 m long, and at 44 m centres four
    // hulls seen from any quarter are one long smear of black.
    // ABREAST, and well apart. Stepping them back in z as well puts them
    // along the camera's own axis and the near one hides the other three;
    // 72 m centres on 58 m hulls, seen from off the quarter, keeps all four
    // clear while showing both her trim and her heel at once.
    ship.object.position.set(-108 + i * 72, 0, -34);
    scene.add(ship.object);

    // HER OWN DRAFT, not the hold's load line. Sinkage has to be measured
    // from the depth the hull mesh was drawn to, or she floats a metre
    // clear of the sea at every load with every number correct.
    const hold = createHold({ kind: 'steamer', draft: ship.draft, seed: i + 5, palette });
    ship.object.add(hold.object);
    // Loaded through `load` and never through `cargo`, because THE SIDE IS
    // PART OF THE STOWAGE. The first cut of this view moved the yellow ship's
    // cargo geometry out to starboard and left her tonnage on the centreline:
    // she looked laden, her holds looked wrong, and her list read 0.00°.
    for (const [name, tonnes] of Object.entries(it.cargo)) {
      hold.load(name, tonnes as number, it.off ?? 0);
    }
    if (it.label === 'slack tanks') hold.pump('ballast', 0.5);

    const flag = new Mesh(
      new BoxGeometry(0.6, 9, 0.6),
      new MeshStandardMaterial({
        color: it.colour,
        emissive: it.colour,
        emissiveIntensity: 0.35,
        flatShading: true,
      })
    );
    const deck = ship.decks.filter((d) => d.name !== 'hold').reduce((a, b) => (b.y > a.y ? b : a));
    flag.position.set(0, deck.y + 5, 22);
    ship.object.add(flag);

    trims.push({
      hold,
      ship,
      x0: ship.object.position.x,
      z0: ship.object.position.z,
      label: it.label,
    });
  });

} else if (view === 'steam') {
  // Four plants, three decisions and one state.
  //
  //   A  triple, FULL GEAR      — opened right up, and she will be beaten
  //   B  triple, linkFor(1 h)   — notched up to a cut-off she can hold
  //   C  compound, BANKED       — a wisp, a needle at half, a still crank
  //   D  sidelever, COLD        — fires lit twenty minutes ago, dead in the water
  //
  // The whole module is in the gap between A and B, and the only way to see
  // it is to let them run: A goes out in front and is then overhauled while
  // her gauge sags and B's does not. The marker astern of each is where she
  // started, so the race is a thing on the water rather than a number.
  scene.background = new Color(0x9dbad2);
  // Four ships that draw apart over two hours, plus a sixteen-metre funnel on
  // each: the far plane is the reason four correct plants render as an empty
  // sea, and this view is the third time in this file.
  camera.far = 2600;
  camera.updateProjectionMatrix();
  scene.add(new AmbientLight(0xffffff, 0.86));
  const key = new DirectionalLight(0xffffff, 1.7);
  key.position.set(-10, 18, 12);
  scene.add(key);
  const sea = createOcean({ amplitude: 0.24, wavelength: 32, size: 1600, segments: 190 });
  scene.add(sea.mesh);
  oceans.push(sea);

  const SET: Array<{
    kind: 'sidelever' | 'compound' | 'triple' | 'launch';
    label: string;
    colour: number;
    cold?: boolean;
    banked?: boolean;
    linked?: boolean;
  }> = [
    { kind: 'triple', label: 'full gear', colour: 0xd8483a },
    { kind: 'triple', label: 'notched up', colour: 0x53b06a, linked: true },
    { kind: 'compound', label: 'banked', colour: 0xe0a531, banked: true },
    { kind: 'sidelever', label: 'cold', colour: 0x7a8b99, cold: true },
  ];

  SET.forEach((it, i) => {
    const ship = createDeckedShip({ era: 'steamer', seed: i + 11, palette });
    ship.float((x, z) => sea.heightAt(x, z));
    ship.object.position.set(-72 + i * 48, 0, -40);
    scene.add(ship.object);

    const plant = createSteamPlant({
      kind: it.kind,
      pressure: it.cold ? 0 : undefined,
      funnelHeight: 15,
      seed: i + 3,
      palette,
    });
    // ON THE UPPER DECK, WELL FORWARD — not where an engine actually lives.
    //
    // Her lowest deck is the honest place for a boiler and it is also inside
    // the hull, behind the deckhouse, under the bulwark: the first cut of this
    // view put it there and rendered a funnel sticking out of a black slab,
    // with four and a half metres of boiler, a crankshaft and three cylinder
    // blocks all correctly built and entirely invisible. The plant goes
    // wherever the caller puts it; here it is on deck because the point of
    // this view is the machine.
    // The longest deck she has that is not her hold, and a berth on it with
    // room fore and aft: the plant is eleven metres long, and hung off the
    // end of a short deck it stands in mid-air over the sea while every
    // number about it is right.
    const open = ship.decks.filter((d) => d.name !== 'hold');
    // A PADDLER WANTS HER PLANT LOW. Her wheels are on the ends of the same
    // shaft the engine turns, so a sidelever set up on the boat deck spins two
    // three-metre wheels in clear air a storey above the sea, at exactly the
    // revolutions the model says — the geometry a metre out while every number
    // agrees. Screw ships do not care.
    const deck = it.kind === 'sidelever'
      ? open.reduce((a, b) => (b.y < a.y ? b : a))
      : open.reduce((a, b) => (b.length > a.length ? b : a));
    plant.object.position.set(0, deck.y, deck.z + deck.length * 0.3);
    ship.object.add(plant.object);

    if (it.cold) {
      // Fires lit twenty minutes ago: the funnel is already smoking and the
      // needle has not stirred, because there is no steam below 100 °C.
      plant.setDraught(1);
      plant.settle(20 * 60);
    } else if (it.banked) {
      plant.bank();
      // Long enough to ARRIVE. A banked boiler drifts down over hours, and a
      // ship banked for one of them is still showing very nearly working
      // pressure — which looks exactly like a ship with steam up.
      for (let k = 0; k < 12; k++) {
        plant.bunker();
        plant.settle(4 * 3600);
      }
    } else {
      plant.setDraught(1);
      plant.setRegulator(1);
      plant.setLink(it.linked ? plant.linkFor(3600) : 1);
    }

    // A coloured staff at her stem, so the four are tellable apart in a still
    // and the caption can name them.
    const flag = new Mesh(
      new BoxGeometry(0.5, 7.0, 0.5),
      new MeshStandardMaterial({
        color: it.colour,
        emissive: it.colour,
        emissiveIntensity: 0.3,
        flatShading: true,
      })
    );
    flag.position.set(0, deck.y + 4.5, deck.z - deck.length * 0.34);
    ship.object.add(flag);
    plants.push({
      plant,
      ship,
      x0: ship.object.position.x,
      z0: ship.object.position.z,
      made: 0,
      label: it.label,
    });
  });

} else if (view === 'berth') {
  // A steamer lying alongside a harbour wall, working against her lines in a
  // slight swell, with the brow over. The five posts are the whole view:
  // NOTHING moves them except the `ride` of the thing each is standing on.
  // One on the quay, one on her deck, three spaced along the gangway — and
  // if the middle one does not move by half of what the deck one does, the
  // frames are not blending and somebody is being dragged into the harbour.
  scene.background = new Color(0x9ab6cf);
  camera.far = 900;
  camera.updateProjectionMatrix();
  scene.add(new AmbientLight(0xffffff, 0.85));
  const key = new DirectionalLight(0xffffff, 1.7);
  key.position.set(-9, 14, 7);
  scene.add(key);

  const sea = createOcean({ amplitude: 0.28, wavelength: 30, size: 500, segments: 150 });
  scene.add(sea.mesh);
  oceans.push(sea);

  berth = createBerth({ era: 'harbour', length: 68, bollards: 6, seed: 5, palette });
  scene.add(berth.object);

  berthShip = createDeckedShip({ era: 'steamer', seed: 4, palette });
  berthShip.float((x, z) => sea.heightAt(x, z));
  berthShip.object.position.set(11, 0, 0);
  scene.add(berthShip.object);
  // NOT into `ships`. That list is driven at five knots by `galleryStep`,
  // and a moored ship steamed along her own quay while every number about
  // the mooring stayed perfectly plausible — her lines held her off the
  // wall the whole way.

  moored = moor(berthShip, berth, { standoff: 1.0, seed: 2, palette });
  scene.add(moored.object);

  // The brow lands on her MAIN deck — `decks[0]` is the topmost, which on a
  // steamer is her bridge, and a gangway to the bridge is a fire escape.
  const main = berthShip.decks.reduce((lo, d) => (d.y < lo.y ? d : lo));
  const landing = new Object3D();
  landing.position.set(-berthShip.beam * 0.45, main.y, 2);
  berthShip.object.add(landing);
  brow = createGangway({ shore: berth.brow.anchor, ship: berthShip, landing, reach: 16, seed: 3, palette });
  scene.add(brow.object);

  // Settle her before anybody steps aboard.
  for (let i = 0; i < 60 * 12; i++) berthShip.update(1 / 60, moored.hold(1 / 60));
  brow.update(1 / 60);

  berth.object.updateMatrixWorld(true);
  berthShip.object.updateMatrixWorld(true);
  const ashore = berth.brow.anchor.getWorldPosition(new Vector3());
  const aboard = landing.getWorldPosition(new Vector3());
  const post = (on: Carrier, at: Vector3, color: number): void => {
    const y = on.deckAt(at.x, at.z);
    if (y === null) return;
    at.y = y;
    const m = new Mesh(
      new BoxGeometry(0.42, 1.75, 0.42),
      new MeshStandardMaterial({ color, flatShading: true })
    );
    scene.add(m);
    standers.push({ on, at, post: m, carried: 0 });
  };
  post(berth, ashore.clone().add(new Vector3(-1.4, 0, 0)), 0xf0efe8);
  for (const t of [0.2, 0.5, 0.8]) {
    post(
      brow,
      new Vector3().lerpVectors(ashore, aboard, t),
      [0x53b06a, 0xe0a531, 0xd8483a][[0.2, 0.5, 0.8].indexOf(t)]
    );
  }
  post(berthShip, aboard.clone().add(new Vector3(2.2, 0, -7)), 0x4f8fd8);

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
  if (view === 'ship') {
    for (const o of oceans) o.update(dt);
    for (const s2 of ships) s2.update(dt, { speed: 5 });
    for (const r of shipRiders) {
      // THE HANDSHAKE, and the only thing that moves these markers:
      r.ship.ride(r.at);
      const y = r.ship.deckAt(r.at.x, r.at.z, r.at.y);
      if (y !== null) r.at.y = y;
      r.post.position.copy(r.at);
      r.post.position.y += 0.9;
      // Stand square to the deck rather than to the world.
      const n = r.ship.normalAt(r.at.x, r.at.z);
      r.post.quaternion.setFromUnitVectors(UP, n);
    }
  }
  if (view === 'smoke') {
    for (const v of vents) v.update(dt, 1);
    smokeRoom?.update(dt);
  }
  if (view === 'sail') {
    for (const o of oceans) o.update(dt);
    stepSail(dt);
  }
  if (view === 'berth') {
    for (const o of oceans) o.update(dt);
    stepBerth(dt);
  }
  if (view === 'oars') {
    for (const o of oceans) o.update(dt);
    stepOars(dt);
  }
  if (view === 'steam') {
    for (const o of oceans) o.update(dt);
    stepSteam(dt);
  }
  if (view === 'trim') {
    for (const o of oceans) o.update(dt);
    stepTrim(dt);
  }
  if (view === 'larder') {
    for (const st of colds) st.update(dt);
    for (const f of foods) f.update(dt, foodChill ?? undefined);
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
  } else if (view === 'larder') {
    camera.position.set(Math.sin(t * 0.1) * 0.9, 1.42, 2.4);
    camera.lookAt(-0.3, 0.92, 0);
  } else if (view === 'smoke') {
    camera.position.set(Math.sin(t * 0.08) * 1.2, 1.75, 5.4);
    camera.lookAt(0, 1.5, -0.6);
  } else if (view === 'oars') {
    placeOarCamera();
  } else if (view === 'steam') {
    placeSteamCamera();
  } else if (view === 'trim') {
    placeTrimCamera();
  } else if (view === 'berth') {
    // Along the quay and slightly above it, so the gap between hull and wall
    // — the thing the whole track is about — is a gap you can see.
    placeBerthCamera();
    camera.position.z += Math.sin(t * 0.07) * 2.5;
    camera.lookAt(2.0, 1.4, -5);
  } else if (view === 'sail') {
    placeSailCamera();
  } else if (view === 'ship') {
    const lead = ships[1];
    const f = lead ? lead.object.position : new Vector3();
    camera.position.set(f.x + 22, 14, f.z - 26);
    camera.lookAt(f.x, 3, f.z);
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

/**
 * The bearing from which the fleet is showing the most canvas.
 *
 * Measured off the sails' own world normals rather than reasoned about from
 * the trim, so it stays right for rigs whose geometry I have not thought
 * about — a square yard braced up and a boom squared off want opposite
 * answers and both come out of the same sweep.
 */
const broadsideOn = (fallback: number): number => {
  const normal = new Vector3();
  const view = new Vector3();
  const faces: Array<{ n: Vector3; area: number }> = [];
  for (const { rig } of rigs) {
    rig.object.updateWorldMatrix(true, true);
    rig.object.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || m.geometry?.type !== 'PlaneGeometry' || !m.visible) return;
      const p = (m.geometry as PlaneGeometry).parameters;
      m.getWorldScale(view);
      faces.push({
        n: normal.set(0, 0, 1).applyQuaternion(m.getWorldQuaternion(new Quaternion())).clone(),
        area: p.width * p.height * view.x * view.y,
      });
    });
  }
  if (!faces.length) return fallback + Math.PI / 2;
  let best = fallback + Math.PI / 2;
  let most = -1;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    // Looking from `a` toward the fleet.
    view.set(-Math.sin(a), 0, -Math.cos(a));
    let seen = 0;
    for (const f of faces) seen += Math.abs(f.n.dot(view)) * f.area;
    if (seen > most) {
      most = seen;
      best = a;
    }
  }
  return best;
};

/**
 * One tick under oars.
 *
 * The handshake is one number wide: the bank works out the stroke and hands
 * back `way`, and the hull is given that and nothing else. There is no
 * throttle anywhere — if she is slow it is because the blades are not going
 * in together.
 */
const stepOars = (dt: number): void => {
  for (const { bank, ship } of banks) {
    bank.update(dt);
    ship.update(dt, { speed: bank.way, turn: bank.yaw * 0.25 });
  }
};

/**
 * One tick of four differently loaded hulls.
 *
 * The handshake is one object wide and it is not a force: `loading` is a
 * STATE of the vessel. A drift stops when the tide slackens; a list does not.
 */
const stepTrim = (dt: number): void => {
  for (const t of trims) {
    t.hold.update(dt);
    t.ship.update(dt, { loading: t.hold.loading });
    // Held on station, like the steamers — nothing here is a race.
    t.ship.object.position.x = t.x0;
    t.ship.object.position.z = t.z0;
  }
};

/**
 * Frame the four from off the bow quarter, and LOW.
 *
 * The whole read is how each of them is sitting in the water. From above, a
 * two-degree list and a level ship are the same picture.
 */
const placeTrimCamera = (): void => {
  if (!trims.length) return;
  camera.position.set(-142, 21, 92);
  camera.lookAt(6, 2, -34);
};

/**
 * One tick of four steam plants.
 *
 * The handshake is two numbers wide and neither is a throttle: `way` goes
 * into the hull's speed and `walk` into its drift. Nothing else passes, and
 * SCENA's ship knows nothing at all about boilers.
 *
 * Somebody has to keep the fires in, and he throws coal on WHEN THE BED IS
 * DOWN rather than every frame. Stoke on every tick and `green` never decays,
 * so all four funnels stream the black puff of a fresh shovelful for ever and
 * the one read that separates a working stokehold from a hard-driven one is
 * gone — while `firing`, `bed` and every other number stay perfectly right.
 */
const stepSteam = (dt: number): void => {
  for (const st of plants) {
    // A GOOD fireman keeps his bed up. Let it burn down to half and the
    // firing rate averages well under what the damper is calling for, and
    // the cold ship's light-up quietly stops happening at all.
    if (st.plant.bed < 0.85) st.plant.stoke();
    st.plant.update(dt);
    st.ship.update(dt, { speed: st.plant.way, drift: st.plant.walk });
    // …AND THEN HELD ON STATION.
    //
    // Four ships making four different speeds cannot share a frame. Ten
    // minutes in, the two triples are a kilometre from the two that are not
    // moving, the camera pulls back far enough to hold them all, and the view
    // is an empty sea with four perfectly correct plants somewhere in it —
    // which is precisely what the first cut of this view rendered.
    //
    // So she steams: the hull is handed `way` and `walk` and works out her own
    // motion from them, which is the whole handshake. Then she is put back.
    // `made` is the distance she really covered, integrated from the same
    // number, and it is what the report publishes.
    st.made += st.plant.way * dt;
    st.ship.object.position.x = st.x0;
    st.ship.object.position.z = st.z0;
  }
};

/**
 * Frame the three boats from ahead and to one side.
 *
 * From dead abeam the near boat hides the other two; from dead ahead the
 * blades are edge-on. Off the bow at an angle is the only place all three
 * banks are visible sweeping.
 */
const placeOarCamera = (): void => {
  if (!banks.length) return;
  const mid = new Vector3();
  for (const b of banks) mid.add(b.ship.object.position);
  mid.multiplyScalar(1 / banks.length);
  let spread = 0;
  for (const b of banks) spread = Math.max(spread, b.ship.object.position.distanceTo(mid));
  const back = 40 + spread * 0.95;
  camera.position.set(mid.x - back * 0.62, 6 + back * 0.24, mid.z + back * 0.78);
  camera.lookAt(mid.x, 0.5, mid.z);
};

/**
 * Frame the four steamers from off the bow quarter.
 *
 * FIXED, because they are held on station — and close enough that a funnel,
 * a gauge and a crank are things you can see rather than four specks on a
 * kilometre of water.
 */
const placeSteamCamera = (): void => {
  if (!plants.length) return;
  camera.position.set(-92, 26, 40);
  camera.lookAt(6, 12, -34);
};

/** Frame the berth. Shared by the render loop and `galleryDebug`. */
const placeBerthCamera = (): void => {
  // Close in on the brow and the gap, from over the quay. The whole track is
  // about a few metres of water and a plank across it, and a view that takes
  // in the whole berth shows neither.
  // Low, close to the face and looking ALONG it — the gap between hull and
  // wall is a slot a metre wide, and from anywhere above it the ship's own
  // bulwark covers it up. Two cuts of this view showed a hull apparently
  // welded to the coping.
  camera.position.set(-8.5, 7.6, 22);
  camera.lookAt(2.0, 1.4, -5);
};

/**
 * One tick alongside.
 *
 * Order matters and it is the same order as at sea: the mooring works out
 * what the ropes and fenders are doing, `update` applies ALL of it, and only
 * then does anybody standing on her get carried. Ride before update and the
 * crew are moved by last frame's motion.
 */
const stepBerth = (dt: number): void => {
  if (!moored || !berthShip) return;
  heave += dt;
  const held = moored.hold(dt);
  // Something is always working her: a swell setting in past the pierhead.
  held.drift.x += Math.sin(heave * 0.55) * 0.55;
  held.drift.z += Math.sin(heave * 0.31 + 1.1) * 0.5;
  // Let go and the tide sets her off the wall. Nothing is holding her —
  // which is the point of letting go, and is what takes the brow with it.
  if (berth && !moored.lines.some((l) => l.fast)) {
    const off = berth.faceNormal(new Vector3());
    held.drift.x += off.x * 1.1;
    held.drift.z += off.z * 1.1;
  }
  berthShip.update(dt, held);
  brow?.update(dt);
  for (const s of standers) {
    // THE ONLY thing that moves them.
    const was = s.at.clone();
    s.on.ride(s.at);
    s.carried = Math.max(s.carried * 0.985, s.at.distanceTo(was) / Math.max(dt, 1e-4));
    const y = s.on.deckAt(s.at.x, s.at.z, s.at.y);
    if (y !== null) s.at.y = y;
    s.post.position.copy(s.at);
    s.post.position.y += 0.88;
    s.post.quaternion.setFromUnitVectors(UP, s.on.normalAt(s.at.x, s.at.z));
    s.post.visible = y !== null;
  }
};

/**
 * Frame the fleet, wherever their own courses have taken them.
 *
 * Called from the render loop AND from `galleryDebug`, which is the whole
 * reason it is a function: a headless run steps a minute of sailing inside
 * one `evaluate` with no frames in between, and a camera that is only moved
 * by the render loop is then aimed at where the ships used to be. The first
 * screenshot off this view was an empty sea for exactly that reason.
 */
const placeSailCamera = (): void => {
  if (!rigs.length) return;
  const mid = new Vector3();
  for (const r of rigs) mid.add(r.ship.object.position);
  mid.multiplyScalar(1 / rigs.length);
  let heading = 0;
  let spread = 0;
  for (const r of rigs) {
    heading += r.ship.object.rotation.y / rigs.length;
    spread = Math.max(spread, r.ship.object.position.distanceTo(mid));
  }
  // Stand where the CANVAS is widest, rather than at a fixed angle off the
  // bow. A sail seen end-on is an invisible sail, and where end-on is moves
  // with the point of sailing: close-hauled the booms are sheeted in along
  // the hull and you want to be on her beam, dead downwind they are squared
  // right out and the beam is the one place you see nothing. Two cuts of
  // this view were tuned to one of those and broken for the other, so this
  // one asks the sails: sweep the horizon and stand where their normals
  // face you.
  const beam = broadsideOn(heading);
  const back = 44 + spread * 1.35;
  camera.position.set(mid.x + Math.sin(beam) * back, 14 + back * 0.16, mid.z + Math.cos(beam) * back);
  camera.lookAt(mid.x, 9, mid.z);
  // Straight over the fleet, so the wind is in shot whatever the framing.
  // In the foreground, between the viewer and the fleet. Parked to windward
  // it ended up at the horizon and behind a hull, which is a wind arrow
  // nobody can see. It still points the true direction — only where it is
  // drawn is chosen for the camera.
  if (windVane) {
    windVane.position.set(
      mid.x + Math.sin(beam) * back * 0.42,
      1.4,
      mid.z + Math.cos(beam) * back * 0.42
    );
  }
};

/**
 * Sail the rigged fleet one tick.
 *
 * The handshake in four lines: the wind is a field, the rig reads it, the
 * DRIVE comes out of the polar, and the hull is given that and nothing else.
 * No throttle anywhere — if a ship is not moving it is because of where she
 * is pointing.
 */
const stepSail = (dt: number): void => {
  breeze?.update(dt);
  for (const { rig, ship, label } of rigs) {
    rig.update(dt);
    // Slow on purpose: these four are on divergent courses and at any real
    // hull speed they are out of one frame inside a minute.
    ship.update(dt, { speed: rig.drive * 0.8 });
    // The masthead pennant dips as she heels — a read on the number that has
    // no other way of being seen.
    label.rotation.z = -rig.heelForce * 0.5;
  }
};

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
    gallerySail: (mode: number, set?: number) => void;
    gallerySailReport: () => Array<Record<string, unknown>>;
    galleryMoor: (fast: number) => void;
    galleryBerthReport: () => Record<string, unknown>;
    galleryOars: (rate: number, port?: number, starboard?: number) => void;
    galleryOarReport: () => Array<Record<string, unknown>>;
    gallerySteam: (link: number, regulator?: number) => void;
    gallerySteamFire: (draught: number) => void;
    gallerySteamReport: () => Array<Record<string, unknown>>;
    gallerySteamParts: () => Record<string, unknown>;
    galleryTrim: (level: number) => void;
    galleryTrimHole: (rate: number) => void;
    galleryTrimReport: () => Array<Record<string, unknown>>;
    gallerySailPositions: () => Record<string, unknown>;
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
  for (const f of foods) f.update(dt, foodChill ?? undefined);
  for (const o of oceans) o.update(dt);
  for (const s2 of ships) s2.update(dt, { speed: 5 });
  for (const r of shipRiders) {
    r.ship.ride(r.at);
    const y = r.ship.deckAt(r.at.x, r.at.z, r.at.y);
    if (y !== null) r.at.y = y;
    r.post.position.copy(r.at);
    r.post.position.y += 0.9;
    r.post.quaternion.setFromUnitVectors(UP, r.ship.normalAt(r.at.x, r.at.z));
  }
  for (const v of vents) v.update(dt, 1);
  smokeRoom?.update(dt);
  stepSail(dt);
  stepBerth(dt);
  stepOars(dt);
  stepSteam(dt);
  stepTrim(dt);
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

/**
 * Steer the fleet, for the headless run.
 *
 * 0 = straight at the wind (in irons, every sail flogging), 1 = each ship's
 * own layline to the same upwind mark, 2 = dead before it. `set` shortens
 * sail. Three settings, because the claims are about the difference between
 * them and a single screenshot cannot show a difference.
 */
window.gallerySail = (mode: number, set = 1) => {
  const from = -Math.PI / 2;
  for (const { rig, ship } of rigs) {
    rig.setSail(set);
    ship.object.rotation.y =
      mode < 0.5 ? from : mode < 1.5 ? rig.layline(from, from + rig.noGo) : from + Math.PI;
  }
};

/**
 * What every rig thinks it is doing, next to where its canvas actually is.
 *
 * Both halves matter and they have caught different bugs: numbers that look
 * right while a sail is rigged the wrong way across the ship, and canvas
 * that looks right while nothing is reading the wind.
 */
window.gallerySailReport = () =>
  rigs.map(({ rig, ship }) => {
    ship.object.updateMatrixWorld(true);
    const box = new Box3();
    rig.object.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.geometry?.type === 'PlaneGeometry' && m.visible) {
        box.union(new Box3().setFromObject(m));
      }
    });
    return {
      kind: rig.kind,
      off: Number(((rig.windAngle * 180) / Math.PI).toFixed(1)),
      drive: Number(rig.drive.toFixed(3)),
      heel: Number(rig.heelForce.toFixed(3)),
      luffing: rig.luffing,
      canvasY: box.isEmpty() ? null : [Number(box.min.y.toFixed(2)), Number(box.max.y.toFixed(2))],
      speed: Number(ship.object.position.length().toFixed(1)),
    };
  });

window.gallerySailPositions = () => {
  placeSailCamera();
  camera.updateMatrixWorld(true);
  const p = new Vector3();
  return {
    camera: camera.position.toArray().map((n) => Number(n.toFixed(1))),
    ships: rigs.map((r) => r.ship.object.position.toArray().map((n) => Number(n.toFixed(1)))),
    ndc: rigs.map((r) => {
      p.copy(r.ship.object.position).project(camera);
      return p.toArray().map((n) => Number(n.toFixed(2)));
    }),
    vane: windVane ? windVane.position.toArray().map((n) => Number(n.toFixed(1))) : null,
  };
};

/** The smallest arc of the cycle containing every one of these phases. */
const circularSpread = (phases: number[]): number => {
  const sorted = [...phases].sort((a, b) => a - b);
  let widest = 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = sorted[(i + 1) % sorted.length] + (i === sorted.length - 1 ? 1 : 0);
    widest = Math.max(widest, next - sorted[i]);
  }
  return Math.max(0, 1 - widest);
};

/** Set the rate, or pull one side harder, for the headless run. */
window.galleryOars = (rate: number, port = 1, starboard = port) => {
  for (const { bank } of banks) {
    bank.setRate(rate);
    bank.setEffort(port, starboard);
  }
};

/** What the three crews are doing, and how far it has got them. */
window.galleryOarReport = () =>
  banks.map(({ bank, ship, wake }) => ({
    together: Number(bank.together.toFixed(2)),
    rate: bank.rate,
    thrust: Number(bank.thrust.toFixed(3)),
    way: Number(bank.way.toFixed(3)),
    // The spread of the bank right now: 0 is one blade, 0.5 is a shambles.
    // The smallest arc that holds every blade — circular, because phases
    // wrap and a plain max-minus-min reports a crew that straddles the
    // catch as nearly a whole stroke apart when it is a hair.
    spread: Number(circularSpread(bank.oars.map((o) => o.phase)).toFixed(3)),
    buried: bank.oars.filter((o) => o.buried).length,
    of: bank.oars.length,
    made: Number((ship.object.position.z - wake.position.z).toFixed(1)),
  }));

/**
 * Where the plant's parts actually ARE, in world space.
 *
 * Every screenshot of this view so far has had a white box in it that nobody
 * could name from the code, and an engine that should have been four metres
 * tall and was nowhere. Guessing at a render is how a metre of error survives
 * six correct numbers.
 */
window.gallerySteamParts = () => {
  const first = plants[0];
  if (!first) return {};
  first.ship.object.updateMatrixWorld(true);
  const out: Record<string, unknown> = {};
  const box = (o: Object3D): number[] => {
    const b = new Box3().setFromObject(o);
    return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((n) => +n.toFixed(2));
  };
  out.ship = box(first.ship.object);
  out.plant = box(first.plant.object);
  for (const name of ['crosshead', 'crankpin', 'dieBlock', 'firebox:fire', 'gauge']) {
    const o = first.plant.object.getObjectByName(name);
    out[name] = o ? box(o) : 'MISSING';
  }
  const kids: string[] = [];
  first.plant.object.children.forEach((c, i) => {
    const b = new Box3().setFromObject(c);
    const size = b.getSize(new Vector3());
    if (size.length() > 2) {
      kids.push(
        `${i}:${c.type}${c.name ? '/' + c.name : ''} ` +
          `${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)} @y${b.min.y.toFixed(1)}`
      );
    }
  });
  out.big = kids;
  return out;
};

/** Pump every tank in the trim view to the same level. */
window.galleryTrim = (level: number) => {
  for (const t of trims) {
    for (const c of t.hold.compartments) {
      if (c.liquid && c.name !== 'bilge') t.hold.pump(c.name, level);
    }
  }
};

/** Hole them all, or stop the leak. */
window.galleryTrimHole = (rate: number) => {
  for (const t of trims) {
    t.hold.holed(rate);
    t.hold.pumpBilge(rate > 0);
  }
};

/**
 * How each of the four is sitting, and why.
 *
 * `heel` is measured off the HULL rather than read back out of the hold —
 * a world-space up vector against a plumb one — because every number here
 * agreeing with itself is exactly the failure this class of bug hides in.
 */
window.galleryTrimReport = () =>
  trims.map(({ hold, ship, label }) => {
    ship.object.updateMatrixWorld(true);
    const up = new Vector3(0, 1, 0).applyQuaternion(
      ship.object.getWorldQuaternion(new Quaternion())
    );
    const bow = ship.object.localToWorld(new Vector3(0, 0, 20));
    const stern = ship.object.localToWorld(new Vector3(0, 0, -20));
    return {
      label,
      state: hold.state,
      dwt: Number(hold.deadweight.toFixed(0)),
      draught: Number(hold.draught.toFixed(2)),
      toMarks: Number(hold.toMarks.toFixed(2)),
      gm: Number(hold.gm.toFixed(2)),
      solidGm: Number(hold.solidGm.toFixed(2)),
      freeSurface: Number(hold.freeSurface.toFixed(2)),
      roll: Number.isFinite(hold.rollPeriod) ? Number(hold.rollPeriod.toFixed(1)) : 'never',
      trimDeg: Number(((hold.loading.trim * 180) / Math.PI).toFixed(2)),
      listDeg: Number(((hold.loading.list * 180) / Math.PI).toFixed(2)),
      immersion: Number(hold.immersion.toFixed(2)),
      lolling: hold.lolling,
      slack: hold.compartments.filter((c) => c.slack).map((c) => c.name),
      // Measured off the meshes, not off the model.
      heelDeg: Number(((Math.acos(Math.min(1, up.y)) * 180) / Math.PI).toFixed(2)),
      bowDown: Number((stern.y - bow.y).toFixed(2)),
    };
  });

/** Put all four in the same gear, for the headless run. */
window.gallerySteam = (link: number, regulator = 1) => {
  for (const { plant } of plants) {
    plant.setRegulator(regulator);
    plant.setLink(link);
  }
};

/** Damper on all four: 0 draws the fires, 1 is flat out. */
window.gallerySteamFire = (draught: number) => {
  for (const { plant } of plants) plant.setDraught(draught);
};

/**
 * What the four plants are doing, and how far it has got them.
 *
 * `made` is real metres, integrated from the same `way` the hull is handed —
 * published beside the model's own scalars for exactly the class of bug where
 * every number is right and the meshes are a metre above the sea.
 */
window.gallerySteamReport = () =>
  plants.map(({ plant, made, label }) => ({
    label,
    kind: plant.kind,
    state: plant.state,
    bar: Number(plant.pressure.toFixed(2)),
    of: plant.working,
    balance: Number(plant.balance.toExponential(2)),
    readiness: Number(plant.readiness.toFixed(2)),
    firing: Number(plant.firing.toFixed(2)),
    link: Number(plant.link.toFixed(2)),
    cutoff: Number(plant.cutoff.toFixed(3)),
    rpm: Number((plant.rev * 60).toFixed(1)),
    knots: Number((plant.way * 1.94384).toFixed(2)),
    blowing: plant.blowing,
    onCentre: plant.onCentre,
    soot: Number(plant.plumes[0].rate.toFixed(2)),
    grease: Number(plant.plumes[1].rate.toFixed(2)),
    needle: Number(plant.gauge.value.toFixed(2)),
    endurance: Number((plant.endurance / 3600).toFixed(1)),
    made: Number(made.toFixed(1)),
  }));

/** Make her fast or let her go, for the headless run. */
window.galleryMoor = (fast: number) => {
  if (!moored) return;
  if (fast > 0.5) for (const l of moored.lines) l.makeFast();
  else moored.cast();
};

/**
 * Who moved, and by how much.
 *
 * The numbers behind the five posts. `carried` is the distance each one was
 * shifted by its own frame's `ride` over the last few seconds — which for
 * the quay must be zero, for the deck must be everything, and on the plank
 * must land in between in order.
 */
window.galleryBerthReport = () => ({
  gap: moored ? Number(moored.gap.toFixed(3)) : null,
  surge: moored ? Number(moored.surge.toFixed(3)) : null,
  alongside: moored?.alongside ?? null,
  tension: moored ? moored.lines.map((l) => Number(l.tension.toFixed(3))) : null,
  brow: brow
    ? { rigged: brow.rigged, span: Number(brow.span.toFixed(2)), angle: Number(brow.angle.toFixed(3)) }
    : null,
  carried: standers.map((s) => Number(s.carried.toFixed(3))),
  posts: standers.map((s) => [Number(s.at.x.toFixed(2)), Number(s.at.z.toFixed(2)), s.post.visible]),
});

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
  if (view === 'sail') placeSailCamera();
  if (view === 'berth') placeBerthCamera();
  if (view === 'oars') placeOarCamera();
  if (view === 'steam') placeSteamCamera();
  if (view === 'trim') placeTrimCamera();
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
    ships: ships.map((sh) => ({
      era: sh.era,
      decks: sh.decks.length,
      ladders: sh.ladders.length,
      pitch: Number(sh.pitch.toFixed(3)),
      roll: Number(sh.roll.toFixed(3)),
      motion: Number(sh.motion.toFixed(3)),
      z: Number(sh.object.position.z.toFixed(1)),
    })),
    // Every marker's distance from the deck it started on. If `ride` works
    // these stay ~0 forever; if it does not they grow without bound.
    riders: shipRiders.map((r) => ({
      on: r.post.name,
      aboard: r.ship.deckAt(r.at.x, r.at.z, r.at.y) !== null,
      lag: Number(Math.abs(r.at.z - r.ship.object.position.z - r.z0).toFixed(2)),
    })),
    smoke: smokeRoom === null ? null : {
      level: Number(smokeRoom.level.toFixed(3)),
      descent: Number(smokeRoom.descent.toFixed(2)),
      baseY: Number(smokeRoom.baseY.toFixed(2)),
      ceiling: Number(smokeRoom.smokeAt(0, 2.7, -0.4).toFixed(3)),
      head: Number(smokeRoom.smokeAt(0, 1.6, -0.4).toFixed(3)),
      knee: Number(smokeRoom.smokeAt(0, 0.4, -0.4).toFixed(3)),
      outside: smokeRoom.smokeAt(0, 1.6, 9),
    },
    vents: vents.map((v) => {
      v.object.updateMatrixWorld(true);
      const m = v.mouth.getWorldPosition(new Vector3());
      return {
        era: v.era,
        draw: Number(v.draw.toFixed(3)),
        clogged: Number(v.clogged.toFixed(3)),
        fan: v.fan !== null,
        // How much of the plume standing right under it never gets out.
        catches: Number(v.catches(m.x, m.z).toFixed(3)),
        acrossTheRoom: Number(v.catches(m.x + 3, m.z).toFixed(3)),
      };
    }),
    foods: foods.map((f) => {
      f.object.updateWorldMatrix(true, false);
      const at = f.object.getWorldPosition(new Vector3());
      return {
        kind: f.kind,
        form: f.form,
        state: f.state,
        fresh: Number(f.freshness.toFixed(3)),
        life: f.shelfLife === Infinity ? 'inf' : Math.round(f.shelfLife),
        // Where it is standing decides how fast it is going off — nothing
        // else was ever told which of these is in the fridge.
        keeps: foodChill ? Number(foodChill.keepAt(at.x, at.y, at.z).toFixed(3)) : 1,
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
