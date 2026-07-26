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
  createStabilisers,
  createSeaState,
  createGear,
  createBoat,
  createSmallCraft,
  livesIn,
  listFor,
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
  type Stabilisers,
  type SeaState,
  type Gear,
  type SmallCraft,
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
  sea:
    '<strong>SCENA — sea state</strong><br />' +
    '<em>The sea remembers and the wind does not.</em> A wind gets up in ' +
    'twenty minutes; the sea it raises takes sixteen hours to answer, and ' +
    'days to die. So the sea you are in is almost never the sea the wind you ' +
    'can feel would make. Here a big old swell is running from the ' +
    'south-west, raised by a storm nobody in this scene will ever see, while ' +
    'a fresh breeze from the north-west has only begun to raise anything — ' +
    'and where the two cross, the sea is <em>confused</em>. The clock runs at ' +
    'sixty times life. Try <code>gallerySeaWind(20, 315)</code> to bring a ' +
    'gale on, then <code>gallerySeaWind(0)</code> to take it away: the sea ' +
    'does not go with it.',
  craft:
    '<strong>SCENA — small craft</strong><br />' +
    'Four identical boats in one sea, and the only difference between them is ' +
    'what happens to the water once it is aboard. The sea is 1.1 m at 9 m ' +
    'long: steep, ordinary, and <em>not</em> breaking. Nothing here is a gale ' +
    '— these boats are lost in weather a ship would not notice. A small boat ' +
    'is not lost to <em>stability</em>, she is lost to <em>freeboard</em>, and ' +
    'it is a runaway: water aboard means less side left, which means more ' +
    'water aboard. Nearest is an open boat with a man bailing as hard as ' +
    'anybody can bail, and it makes no difference at all. Next has buoyancy ' +
    'tanks and fills at the same rate — buoyancy buys no seconds whatever — ' +
    'and is still floating at the end of it with everybody hanging onto her. ' +
    'Third has holes in her transom and never fills, because the water goes ' +
    'out faster than it comes in. Furthest is ballasted. At twenty-five ' +
    'seconds one breaker comes through and rolls all four, and it does four ' +
    'different things: the open boat is gone, the buoyant one lies on her ' +
    'side afloat, the third is got back up by her crew and empties herself, ' +
    'and the ballasted one comes back up with nobody doing anything at all. ' +
    'Try <code>galleryCraftReport()</code>, or ' +
    '<code>galleryCraftSea(0.8)</code> — under twice her freeboard, nothing ' +
    'happens to any of them.',
  gear:
    '<strong>SCENA — working gear</strong><br />' +
    'Every other force in the boat arc acts through her centreline. A working ' +
    'load does not: it acts at the end of a wire, and the further outboard ' +
    'and the higher that point is, the more of your own engine goes into ' +
    'laying her over instead of moving her. The two nearest hulls are the ' +
    'same tug twice — same gear, same load, and the same snatch from a ' +
    'sheering tow in the same second. One of them slipped the wire and one ' +
    'of them did not, and that is the only difference there is. Beyond them, ' +
    'a derrick with eighteen tonnes swung right outboard, on which ' +
    '<code>slip()</code> does nothing at all because the weight has to be ' +
    'put down somewhere; and a trawler whose net came fast on the bottom, ' +
    'which will not lay a 290-tonne hull over — a trawler is pulled down by ' +
    'the stern, not heeled. The small boat in front is carrying the same ' +
    'three hundred kilos of pots that none of the big hulls would notice, ' +
    'and it has her at twelve degrees. The gear runs at six times life; the ' +
    'sea and every heel in the picture are at one to one. Try ' +
    '<code>galleryGearReport()</code>.',
  liner:
    '<strong>SCENA — the liner</strong><br />' +
    'The whole boat arc in one hull: a hold that trims and sinks her, a ' +
    'steam plant that drives her, and fin stabilisers that take her roll out ' +
    '— <em>and only while she is going somewhere</em>. A fin is a wing; stop ' +
    'her and there is no water going past it, so she rolls exactly as badly ' +
    'as a ship with none fitted while still paying the drag. The posts are ' +
    'people standing perfectly still, coloured by how hard it is to stand ' +
    'where each of them is: green amidships and low, red at the stem and out ' +
    'on the bridge wings. That is the whole layout of a passenger ship, and ' +
    'it falls out of two lever arms rather than a price list. Try ' +
    '<code>gallerySteady(0)</code> to house the fins, or ' +
    '<code>galleryLinerWay(0)</code> to stop her — the fins are still out, ' +
    'and they have stopped working.',
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
/**
 * The sea, and the fact that it does not forget.
 *
 * One state, one ocean driven by it, and three boats of different sizes on it
 * — because the same sea is a different sea depending on what you are in.
 */
let seaState: {
  sea: SeaState;
  boats: Array<{ ship: DeckedShip; x0: number; z0: number; label: string }>;
  clock: number;
} | null = null;

/**
 * The liner, and everything the boat arc built, in one hull.
 *
 * Her hold trims her and sinks her; her plant drives her; her fins take her
 * roll out — and only while she is going somewhere. The posts are where the
 * field is drawn: they are coloured by `motionAt`, which is what makes the
 * quietest berth on the ship a thing you can SEE rather than a claim.
 */
let liner: {
  ship: DeckedShip;
  hold: Hold;
  plant: SteamPlant;
  fins: Stabilisers;
  x0: number;
  z0: number;
  posts: Array<{ mesh: Mesh; at: Vector3; label: string }>;
  small: DeckedShip;
  smallPosts: Array<{ mesh: Mesh; at: Vector3; label: string }>;
} | null = null;

/**
 * Four identical small boats in one sea, differing only in what happens to the
 * water once it is in them.
 *
 * Sized differently they would not be comparable and the axis would be a
 * catalogue instead of an argument — the same reason `?view=trim` is four
 * identical steamers. The read is a still frame: two of them are full and one
 * of those has gone, one is sitting at a level she found for herself, and one
 * has been rolled right over and come back up on her own.
 */
// NOT BREAKING, and still fatal — which is the point. 1.1 m at 9 m is one in
// eight, an ordinary short sea, and it is over her freeboard doubled.
let CRAFT_H = 1.1;
let CRAFT_L = 9;
/** The one breaker, and the four different things it does to them. */
let craftRolled = false;
let craftHelped = false;

const craft: Array<{
  boat: SmallCraft;
  label: string;
  x0: number;
  z0: number;
}> = [];
let craftClock = 0;

/**
 * The working boats, and the only view in the arc where a boat is lost.
 *
 * Four hulls, four wires, one clock. Two of them are the same tug rigged the
 * same way and given the same snatch in the same second, and the only
 * difference between them is whether anybody pulls the release — which is the
 * whole argument for a towing hook that opens.
 *
 * `over` is a LATCH. Past the angle of vanishing stability she is not coming
 * back, and the hold solves an equilibrium rather than remembering one, so
 * when the surge decays it would quietly stand her up again and the
 * screenshot would be of two upright tugs and no story.
 */
const boats: Array<{
  ship: DeckedShip;
  hold: Hold;
  gear: Gear;
  label: string;
  /** Does anybody pull the release on this one? */
  releases: boolean;
  over: boolean;
  /** Seconds she has been past her angle of vanishing stability. */
  pastFor: number;
  /** Her tow is sheering off across her, right now. */
  sheering: boolean;
  x0: number;
  z0: number;
}> = [];
/** The same string of pots, on something a string of pots is heavy for. */
let creel: { gear: Gear; cradle: Object3D } | null = null;
let gearClock = 0;

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

} else if (view === 'sea') {
  // THE SEA REMEMBERS AND THE WIND DOES NOT.
  //
  // A gale gets up and blows for a day; the sea takes sixteen hours to answer
  // it. Then the wind drops flat calm in ten minutes — and the sea does not
  // go anywhere. It stops being wind sea, becomes swell, and is still running
  // at four metres a day later under a sky with nothing in it.
  //
  // The view starts in the middle of that: a big old swell from the south-west
  // that nothing here raised, and a fresh breeze from the north-west that has
  // only just begun to raise anything. The two cross, and where they cross the
  // sea is CONFUSED, which is the dangerous one.
  scene.background = new Color(0xa8bccd);
  camera.far = 3000;
  camera.updateProjectionMatrix();
  scene.add(new AmbientLight(0xffffff, 0.84));
  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(-16, 20, 14);
  scene.add(key);

  const st = createSeaState({ kind: 'ocean' });
  // Raised by a storm a thousand miles away that nobody in this scene will
  // ever see. That is the whole idea: it did not come from the weather here.
  st.swellIn(215, 3.6, 11);
  st.setWind(13, 315);

  // ONE surface, driven by the state. Two would be two seas, and a boat would
  // float on the one nobody can see.
  const sea = createOcean({
    sea: () => st.trains,
    size: 1600,
    segments: 220,
    choppiness: 0.85,
  });
  scene.add(sea.mesh);
  oceans.push(sea);

  const boats: Array<{ ship: DeckedShip; x0: number; z0: number; label: string }> = [];
  const SET: Array<[typeof SHIP_ERAS[number], number, string]> = [
    ['galley', -110, 'open boat'],
    ['carrack', -30, 'carrack'],
    ['steamer', 70, 'steamer'],
  ];
  for (const [era, x, label] of SET) {
    const ship = createDeckedShip({ era, seed: 31 + x, palette });
    ship.float((qx, qz) => sea.heightAt(qx, qz));
    ship.object.position.set(x, 0, -20);
    ship.object.rotation.y = 0.5;
    scene.add(ship.object);
    boats.push({ ship, x0: x, z0: -20, label });
  }
  seaState = { sea: st, boats, clock: 0 };

} else if (view === 'craft') {
  // FOUR IDENTICAL BOATS IN ONE SEA, and the only difference between them is
  // what happens to the water once it is aboard.
  //
  //   A  open          — nothing at all, and a man bailing with a bucket
  //   B  buoyant       — tanks under the benches
  //   C  selfDraining  — a sole above the waterline and holes in the transom
  //   D  selfRighting  — ballast on the keel, and she comes back on her own
  //
  // A is gone inside half a minute. B fills at exactly the same rate, because
  // buoyancy buys no seconds whatever — and is still floating at the end of it,
  // awash, with everybody hanging onto her. C never fills at all, because the
  // water goes out faster than it comes in. D is rolled right over and comes
  // back up with nobody aboard doing anything, which is where the crew stops
  // being her stability and where the whole boat arc ends.
  scene.background = new Color(0x8ea9c2);
  camera.far = 1200;
  camera.updateProjectionMatrix();
  scene.add(new AmbientLight(0xffffff, 0.85));
  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(-12, 18, 14);
  scene.add(key);

  // A SHORT SEA, AND NOT A BIG ONE. 1.1 m at 9 m long is one in eight — steep,
  // ordinary, and not breaking. That is the whole point of the view: nothing
  // here is a gale, and these boats are lost in weather a ship would not
  // notice.
  //
  // The amplitude is HALF the height on purpose, so the water she is drawn on
  // and the water `meet` is told about are the same water. Tuned separately
  // they drift apart and the boat is filling from a sea nobody can see — which
  // is exactly what the ocean did in the sea-state track.
  const sea = createOcean({
    amplitude: CRAFT_H / 2, wavelength: CRAFT_L, size: 700, segments: 240,
  });
  scene.add(sea.mesh);
  oceans.push(sea);

  const put = (
    z: number,
    fit: 'open' | 'buoyant' | 'selfDraining' | 'selfRighting',
    label: string,
    seed: number
  ): void => {
    const boat = createSmallCraft({ fit, seed, palette });
    boat.float((sx, sz) => sea.heightAt(sx, sz));
    boat.object.position.set(0, 0, z);
    scene.add(boat.object);
    // THREE UP, SPREAD ALONG HER, which is the only way any of them is
    // survivable at all. Heaped in the stern her transom is on the water and
    // she is shipping it standing still.
    boat.seat('bow', 82, 0.55, 0);
    boat.seat('midships', 88, 0, 0);
    boat.seat('helm', 85, -0.5, 0);
    craft.push({ boat, label, x0: 0, z0: z });
  };

  put(11, 'open', 'open — bailing', 3);
  put(3.5, 'buoyant', 'buoyancy tanks', 5);
  put(-4, 'selfDraining', 'freeing ports', 7);
  put(-11.5, 'selfRighting', 'ballasted, self-righting', 9);

  // …and a man in the open boat bailing as hard as anybody can bail, which is
  // about two kilos a second and is not in it.
  craft[0].boat.bail(2);

} else if (view === 'gear') {
  // FOUR BOATS, FOUR WIRES, AND ONE OF THEM IS LOST.
  //
  //   A  trawl   — a net astern, and it comes fast on the bottom
  //   B  tow     — girted, snatched, and SLIPPED
  //   C  tow     — girted, snatched, and nobody at the release
  //   D  derrick — a weight swung out on a boom, and no way to let go at all
  //
  // B and C are the same hull, the same gear, the same load, the same second.
  // The only difference is a lever, and after twenty-five seconds one of them
  // is working and the other is on her beam ends — which is why every tug
  // ever built has a hook that opens and why that is the only verb on this
  // object that exists because of a way of dying.
  scene.background = new Color(0x8faec8);
  camera.far = 3000;
  camera.updateProjectionMatrix();
  scene.add(new AmbientLight(0xffffff, 0.84));
  const key = new DirectionalLight(0xffffff, 1.7);
  key.position.set(-18, 26, 20);
  scene.add(key);

  // A short sea. These are small craft, and a swell of a liner's wavelength
  // would lift all four together and take the heel out of the picture.
  const sea = createOcean({ amplitude: 0.3, wavelength: 34, size: 1600, segments: 200 });
  scene.add(sea.mesh);
  oceans.push(sea);

  const rig = (
    x: number,
    z: number,
    kind: 'trawl' | 'tow' | 'derrick',
    label: string,
    releases: boolean,
    seed: number
  ): void => {
    const ship = createDeckedShip({ era: 'carrack', seed, palette });
    ship.float((sx, sz) => sea.heightAt(sx, sz));
    ship.object.position.set(x, 0, z);
    scene.add(ship.object);

    // LOADED DOWN TO HER MARKS, which is also loaded down to a metacentric
    // height she can be pulled over from. An empty boat cannot be girted and
    // an empty boat is not working.
    const hold = createHold({ kind: 'carrack', draft: ship.draft, seed, palette });
    ship.object.add(hold.object);
    for (const c of hold.compartments) if (!c.liquid && c.name !== 'bilge') hold.load(c.name, c.capacity);

    // The gear takes HER dimensions, so every lever arm in it is a distance
    // on this hull rather than a number out of a table.
    const gear = createGear({
      kind,
      beam: ship.beam,
      length: ship.length,
      freeboard: ship.freeboard,
      shot: true,
      seed,
      palette,
    });
    // ON HER DECK. y = 0 in a hull is her waterline; left there, the gallows
    // stand inside her and the wire runs along the sea bed.
    const deck = ship.decks
      .filter((d) => d.name !== 'hold')
      .reduce((a, c) => (c.length > a.length ? c : a));
    gear.object.position.y = deck.y;
    ship.object.add(gear.object);
    if (kind === 'derrick') {
      gear.setLoad(18);
      gear.setOutreach(0);
    }
    boats.push({ ship, hold, gear, label, releases, over: false, pastFor: 0, sheering: false, x0: x, z0: z });
  };

  // GROUPED, not ruled out in a line. The two tugs are side by side and at
  // the same range because they are the comparison; the other two sit back
  // and off to one side. And both tugs are at the right-hand end, because a
  // tow streams a hundred and fifty metres of wire abeam and it has to go
  // somewhere that is not through another boat.
  // SPREAD ALONG THEIR OWN HEADING, with the camera off the port beam.
  //
  // Ranked across the frame instead, every hull is bow-on and a boat lying at
  // forty-five degrees looks exactly like a boat sitting up straight — the one
  // thing this view exists to show is the one thing that framing hides. And
  // broadside on the port side means every wire streams to starboard, away
  // from the camera and out of the picture, instead of through the boat next
  // door.
  rig(0, 42, 'trawl', 'trawler', true, 3);
  rig(2, 2, 'derrick', 'derrick', true, 9);
  rig(0, -74, 'tow', 'tug — slips', true, 6);
  rig(2, -36, 'tow', 'tug — does not', false, 6);

  // AND THE SAME STRING OF POTS ON A BOAT A STRING OF POTS IS HEAVY FOR.
  //
  // Three hundred kilos over the rail is nothing to a twenty-six metre hull
  // and it is most of what a creel boat has. The list is the same arithmetic
  // — `listFor(moment, displacement, gm)` — done on five tonnes instead of
  // two hundred and ninety, and it is the difference between a thing you can
  // ignore and a thing that drowns people every winter.
  const bx = -48;
  const bz = -6;
  const cradle = new Object3D();
  cradle.position.set(bx, 0, bz);
  scene.add(cradle);
  const skiff = createBoat({ seed: 4, palette });
  // Her sampler is offset to where she actually is, so she rides the wave
  // under her rather than the wave under the origin of her cradle.
  skiff.float((sx, sz) => sea.heightAt(sx + bx, sz + bz));
  cradle.add(skiff.object);
  const pots = createGear({ kind: 'pots', shot: true, seed: 4, palette });
  skiff.object.add(pots.object);
  creel = { gear: pots, cradle };

} else if (view === 'liner') {
  // THE PAYOFF. One ship, and every track in the boat arc doing its job at
  // once: a hold that trims and sinks her, a plant that drives her, fins that
  // steady her — and a field over her decks saying how hard it is to stand up
  // in each place, which is the only one of the four you cannot photograph.
  //
  // So it is drawn. The posts are people standing perfectly still, coloured
  // by `motionAt` where each of them is: green amidships and low, red at the
  // bow and out on the bridge wings. That is not a decoration, it is the
  // entire layout of a passenger ship, and it falls out of two lever arms.
  scene.background = new Color(0x9cb8d0);
  camera.far = 3000;
  camera.updateProjectionMatrix();
  scene.add(new AmbientLight(0xffffff, 0.86));
  const key = new DirectionalLight(0xffffff, 1.75);
  key.position.set(-14, 22, 16);
  scene.add(key);
  // A swell about half her length. At a wavelength near her own she takes it
  // bow and stern at the same phase and does not pitch at all — correct, and
  // a picture of a ship noticing nothing is a picture of nothing.
  const sea = createOcean({ amplitude: 1.7, wavelength: 104, size: 2400, segments: 220 });
  scene.add(sea.mesh);
  oceans.push(sea);

  const ship = createDeckedShip({ era: 'liner', seed: 12, palette });
  ship.float((x, z) => sea.heightAt(x, z));
  ship.object.position.set(0, 0, 0);
  scene.add(ship.object);

  const hold = createHold({ kind: 'liner', draft: ship.draft, seed: 9, palette });
  ship.object.add(hold.object);
  hold.load('main', 3800);
  hold.load('fore', 1400);
  hold.load('aft', 1200);
  // PRESSED UP, not half. Four narrow tanks cost her almost nothing even
  // slack, which is exactly why she is the ship people sleep on — but there
  // is no reason to pay even that.
  for (const c of hold.compartments) if (c.liquid && c.name !== 'bilge') hold.pump(c.name, 1);

  const plant = createSteamPlant({ kind: 'triple', funnelHeight: 26, seed: 7, palette });
  const top = ship.decks.filter((d) => d.name !== 'hold').reduce((a, b) => (b.y > a.y ? b : a));
  plant.object.position.set(0, top.y, top.z + top.length * 0.1);
  ship.object.add(plant.object);
  plant.setDraught(1);
  plant.setRegulator(1);
  plant.setLink(0.45);

  const fins = createStabilisers({
    kind: 'activeFin',
    beam: ship.beam,
    deployed: true,
    seed: 4,
    palette,
  });
  ship.object.add(fins.object);

  // Where people stand. Along her length on the promenade, and out on the
  // wings of the highest deck she has.
  const prom = ship.decks.reduce((lo, d) => (d.name === 'promenade' ? d : lo), ship.decks[0]);
  const posts: Array<{ mesh: Mesh; at: Vector3; label: string }> = [];
  const stand = (x: number, z: number, y: number, label: string): void => {
    const mesh = new Mesh(
      // BIG. A field drawn in colour is unreadable at a range where a 180 m
      // ship fits in the frame unless the swatch is a few metres across.
      new BoxGeometry(2.6, 7.5, 2.6),
      new MeshStandardMaterial({ color: 0x53b06a, emissive: 0x0a0a0a, flatShading: true })
    );
    mesh.position.set(x, y + 3.75, z);
    ship.object.add(mesh);
    posts.push({ mesh, at: new Vector3(x, y, z), label });
  };
  for (const [z, name] of [
    [ship.length * 0.44, 'stem'],
    [ship.length * 0.26, 'fore'],
    [0, 'amidships'],
    [-ship.length * 0.26, 'aft'],
    [-ship.length * 0.44, 'stern'],
  ] as Array<[number, string]>) {
    stand(0, z, prom.y, name);
  }
  stand(-ship.beam * 0.46, 6, top.y, 'port wing');
  stand(ship.beam * 0.46, 6, top.y, 'stbd wing');
  stand(0, 6, top.y, 'monkey island');

  // AND A COASTER IN THE SAME SEA. One number over one ship is a number; the
  // same number over two ships in one swell is the reason liners are 180 m
  // long. Her posts are the same posts, and nothing about them is different.
  const small = createDeckedShip({ era: 'steamer', seed: 15, palette });
  small.float((x, z) => sea.heightAt(x, z));
  small.object.position.set(-96, 0, -14);
  small.object.rotation.y = 0.13;
  scene.add(small.object);
  const smallDeck = small.decks
    .filter((d) => d.name !== 'hold')
    .reduce((a, b) => (b.length > a.length ? b : a));
  const smallPosts: Array<{ mesh: Mesh; at: Vector3; label: string }> = [];
  for (const [z, name] of [
    [small.length * 0.4, 'coaster stem'],
    [0, 'coaster amidships'],
    [-small.length * 0.4, 'coaster stern'],
  ] as Array<[number, string]>) {
    const mesh = new Mesh(
      new BoxGeometry(2.2, 6.0, 2.2),
      new MeshStandardMaterial({ color: 0x53b06a, emissive: 0x0a0a0a, flatShading: true })
    );
    mesh.position.set(0, smallDeck.y + 3.0, z);
    small.object.add(mesh);
    smallPosts.push({ mesh, at: new Vector3(0, smallDeck.y, z), label: name });
  }

  liner = { ship, hold, plant, fins, x0: 0, z0: 0, posts, small, smallPosts };

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
  if (view === 'liner') {
    for (const o of oceans) o.update(dt);
    stepLiner(dt);
  }
  if (view === 'sea') {
    for (const o of oceans) o.update(dt);
    stepSea(dt);
  }
  if (view === 'gear') {
    for (const o of oceans) o.update(dt);
    stepGear(dt);
  }
  if (view === 'craft') {
    for (const o of oceans) o.update(dt);
    stepCraft(dt);
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
  } else if (view === 'liner') {
    placeLinerCamera();
  } else if (view === 'sea') {
    placeSeaCamera();
  } else if (view === 'gear') {
    placeGearCamera();
  } else if (view === 'craft') {
    placeCraftCamera();
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
 * One tick of the sea, at SIXTY TIMES life.
 *
 * The thing this view is about takes a day and a half, and a gallery nobody
 * watches for a day and a half has to be given a clock of its own. Sixty
 * seconds of wall time is an hour of weather; the boats still move at their
 * own speed, because a hull bobbing at 60× reads as a bug.
 */
const SEA_RATE = 60;
const stepSea = (dt: number): void => {
  if (!seaState) return;
  seaState.clock += dt * SEA_RATE;
  seaState.sea.update(dt * SEA_RATE);
  for (const b of seaState.boats) {
    b.ship.update(dt, { speed: 0 });
    b.ship.object.position.x = b.x0;
    b.ship.object.position.z = b.z0;
  }
};

/**
 * HIGH, and looking down the swell.
 *
 * From the deck a big ocean swell reads as nothing at all, and honestly so: a
 * nine-metre sea three hundred metres long is a slope of three degrees. From
 * fifteen metres up the water in this view was flat while the model and the
 * mesh both correctly said nine metres. What you can see from up here is the
 * INTERFERENCE — two trains crossing at sixty degrees, which is the thing
 * this view exists to show and which no low camera can frame.
 */
const placeSeaCamera = (): void => {
  if (!seaState) return;
  camera.position.set(-232, 96, 196);
  camera.lookAt(-20, 0, -28);
};

/**
 * One tick of the whole boat arc.
 *
 * Four modules, four handshakes, and not one of them a throttle: the hold
 * hands the hull a `loading`, the plant hands it a `way`, the fins hand it a
 * `damping` — and the fins take their own input from the plant, because a
 * wing with no water going past it is a bracket. The colour on the posts is
 * `motionAt` at each of them, which is the fourth field in the trilogy.
 */
const stepLiner = (dt: number): void => {
  if (!liner) return;
  const { ship, hold, plant, fins, posts } = liner;
  if (plant.bed < 0.85) plant.stoke();
  plant.update(dt);
  hold.update(dt);
  // SHE FEEDS HER OWN STABILISERS. Nothing else in this file has a loop in it.
  fins.setWay(plant.way);
  fins.update(dt);
  plant.setImmersion(hold.immersion);
  ship.update(dt, {
    // Comfort is not free, and this is where the bill is paid.
    speed: Math.max(0, plant.way - fins.drag),
    drift: plant.walk,
    loading: hold.loading,
    damping: fins.damping,
  });
  // Held on station, like the others: she does 20 knots and the read is what
  // is happening ON her.
  ship.object.position.x = liner.x0;
  ship.object.position.z = liner.z0;

  // The coaster: same sea, same posts, no fins and no hold — she is the
  // control, and she is why the liner is 180 metres long. HELD ON STATION
  // like everything else in this file; given way and left alone she is two
  // kilometres downwind inside ten minutes and the comparison is a screenshot
  // of one ship.
  const sx = liner.small.object.position.x;
  const sz = liner.small.object.position.z;
  liner.small.update(dt, { speed: 3.4 });
  liner.small.object.position.x = sx;
  liner.small.object.position.z = sz;

  // ONE scale for both ships. Two ranges, each normalised to its own hull,
  // would make a coaster in a gale and a liner in a millpond the same colour
  // and quietly delete the comparison the view exists for.
  const paint = (list: typeof posts, on: DeckedShip): void => {
    for (const p of list) {
      const m = on.motionAt(p.at.x, p.at.z, p.at.y);
      // Green where she is quiet, red where she is not. A scalar field has no
      // other way of being in a photograph, and the caption says so.
      // A FIXED scale, and one that spreads the band this actually lives in:
      // quiet is around 0.15 and appalling is around 0.6, so a plain 0..1 ramp
      // paints the whole ship the same olive and the field disappears into it.
      const t = Math.max(0, Math.min(1, (m - 0.12) / 0.45));
      const mat = p.mesh.material as MeshStandardMaterial;
      mat.color.setRGB(0.16 + t * 0.8, 0.78 - t * 0.68, 0.3 - t * 0.22);
      mat.emissive.setRGB(t * 0.5, (1 - t) * 0.26, 0.02);
    }
  };
  paint(posts, ship);
  paint(liner.smallPosts, liner.small);
};

/**
 * One tick of four small boats in the same steep sea.
 *
 * `meet(height, length)` is the whole handshake into the sea state — two
 * numbers, and she works out for herself whether it is breaking. There is no
 * clock trick here and no rate multiplier: an open boat really is gone in half
 * a minute, and that is why the view needs no speeding up.
 */
const stepCraft = (dt: number): void => {
  if (!craft.length) return;
  craftClock += dt;
  // ONE BREAKER, at twenty-five seconds, and it does four different things.
  //
  // By then the open boat has already foundered, the buoyant one is floating
  // awash and the two with ports have found a level and are dry. The breaker
  // rolls all four — a sea steeper than one in seven and taller than six tenths
  // of her beam does that whatever her stability is — and then: the open boat
  // is gone, the buoyant one lies on her side afloat, the self-draining one is
  // got back up BY HER CREW and empties herself, and the ballasted one comes
  // back up with nobody doing anything at all. That is the axis, in one event.
  if (!craftRolled && craftClock >= 25) {
    craftRolled = true;
    for (const c of craft) c.boat.meet(1.5, 9);
  }
  if (!craftHelped && craftClock >= 31) {
    craftHelped = true;
    // Hands on the gunwale. She has the buoyancy to be worth righting and the
    // ports to be worth anything once she is — which the boat next to her,
    // with tanks and no ports, has not.
    const drains = craft.find((c) => c.boat.fit === 'selfDraining');
    drains?.boat.right();
  }
  for (const c of craft) {
    const { boat } = c;
    boat.meet(CRAFT_H, CRAFT_L);
    boat.update(dt);
    // Held on station, like every other hull in this file.
    boat.object.position.x = c.x0;
    boat.object.position.z = c.z0;
  }
};

/**
 * Frame the four from off the beam and LOW.
 *
 * Half a metre of freeboard is the entire subject. From above, a boat with her
 * gunwale awash and a boat sitting up dry are the same outline with a different
 * colour in the middle of it.
 */
const placeCraftCamera = (): void => {
  if (!craft.length) return;
  // SQUARE OFF THE BEAM, and high enough to see INTO them — half a metre of
  // freeboard is the entire subject and what is standing inside her is the
  // read. Angled down the row they rank in depth, overlap, and come out as
  // wreckage rather than as four boats; down at wave height a nine-metre sea
  // simply swallows them.
  camera.position.set(-17.5, 9.5, 11);
  camera.lookAt(-0.5, 0, -3);
};

/**
 * One tick of four working boats, on a clock six times life.
 *
 * The gear runs fast and the sea does not. Shooting a trawl takes two real
 * minutes and getting it back takes five, which are honest numbers and which
 * make a sixty-second demonstration impossible; the hulls, the swell and
 * every heel in the picture are at one to one.
 *
 * The whole handshake is one line: `hold.heel('gear', gear.moment)`. A wire
 * outside the ship becomes a tonne-metre on her deck, and from there it is
 * the identical arithmetic that capsizes a badly stowed steamer, down to the
 * same angle of vanishing stability.
 */
const GEAR_RATE = 6;
const GEAR_CYCLE = 40;
const gearFired = new Set<string>();
const stepGear = (dt: number): void => {
  if (!boats.length) return;
  const was = gearClock;
  gearClock += dt;
  /** Did this instant just go past? Once per cycle, however coarse the step. */
  const at = (t: number): boolean => was < t && gearClock >= t;
  const once = (name: string, t: number): boolean => {
    if (!at(t) || gearFired.has(name)) return false;
    gearFired.add(name);
    return true;
  };

  for (const b of boats) {
    const { gear, hold, ship } = b;

    if (!b.over) {
      if (gear.kind === 'trawl') {
        gear.setWay(3.4);
        // Not quite dead astern — a net tows a little off the quarter, because
        // that is where the gallows is. And once it is foul of the bottom the
        // boat keeps going and the wire comes round onto her quarter, which is
        // the only thing about coming fast that shows in a photograph. Her
        // nine tonnes of bollard pull will not lay a 290-tonne hull over; a
        // trawler is not lost by heeling, she is pulled down by the stern.
        gear.setAngle(gear.fast ? 0.22 + Math.min(1, (gearClock - 10) / 4) * 0.74 : 0.22);
        if (once('fast', 10)) gear.comeFast();
        if (once('trawlSlip', 17.6)) gear.slip();
      } else if (gear.kind === 'tow') {
        gear.setWay(4.2);
        // THE WIRE COMES ROUND. Fourteen seconds from dead astern to right
        // abeam, which is about how long a sheer takes.
        gear.setAngle((Math.min(1, gearClock / 14) * Math.PI) / 2);
        // Held on, because a tow does not snatch once and let go — she sheers,
        // and stays out there.
        b.sheering = gearClock >= 16 && gearClock < 17.4;
        // THREE TENTHS OF A SECOND to get to the release. That is the whole
        // difference between these two hulls.
        if (b.releases && once('towSlip', 16.3)) {
          gear.slip();
          b.sheering = false;
        }
      } else {
        // The boom swings out with eighteen tonnes on it, and `slip` is called
        // on it like everything else and does nothing whatever. That no-op is
        // the era axis: the most capable gear here is the one with no way
        // out, and the weight has to be put down somewhere.
        gear.setOutreach(Math.min(1, gearClock / 14) * ship.beam * 0.9);
        if (once('derrickSlip', 20)) gear.slip();
      }
      // A HUNDRED AND TWENTY TONNES — three times what this tug can pull, and
      // that is the point of it: her own gear at its absolute worst gave her
      // nine degrees.
      //
      // Applied on the same line it is read on, and not a step before it. Left
      // to be decayed by `update` first, how much of it survives depends on
      // the frame time, and this load is only just over what she can answer —
      // so at 1/30 s she went over and at 1/10 s she did not. An event whose
      // outcome is a function of the frame rate is not an event.
      if (b.sheering) gear.snatch(120);
      hold.heel('gear', gear.moment);

      // …and once she is past it she is not coming back.
      //
      // But going over TAKES TIME, and that is not a nicety here — it is the
      // whole view. Latched the instant `capsized` goes true, both tugs are
      // gone within a frame of the snatch, the release is pulled on a boat
      // that is already lost, and the picture is of two hulls on their beam
      // ends with nothing to tell them apart. She has to be past it and STAY
      // past it. The hold solves an equilibrium rather than remembering one,
      // so without the latch the surge decays and she stands smartly back up.
      b.pastFor = hold.capsized ? b.pastFor + dt : 0;
      if (b.pastFor > 0.8) b.over = true;
    }

    // HER WIRE STAYS ON HER. The gear steps whether she is lost or not: the
    // moment stops being handed to the hold, but the wire has to be placed
    // every frame or it hangs in the air where she was two seconds ago. And
    // her way is left where it was, because the wire holding a capsized tug
    // over is bar-taut and not a slack rope lying on the water.
    gear.update(dt * GEAR_RATE);

    hold.update(dt);
    ship.update(dt, { speed: 0, loading: hold.loading });
    // Held on station, like every other hull in this file.
    ship.object.position.x = b.x0;
    ship.object.position.z = b.z0;
  }

  if (creel) {
    creel.gear.update(dt * GEAR_RATE);
    // THE SAME STRING OF POTS, and this is what it does to five tonnes. Same
    // sum the hold does; the only thing that changed is what it is done to.
    // Sign to match the hull: `rotation.z = roll − list`.
    creel.cradle.rotation.z = -listFor(creel.gear.moment, 5, 0.6);
  }

  if (gearClock >= GEAR_CYCLE) {
    gearClock = 0;
    gearFired.clear();
    for (const b of boats) {
      // The one that went over stays gone. Nothing re-rigs her.
      if (b.over) continue;
      b.gear.clear();
      b.gear.shoot();
      b.gear.setAngle(0);
      if (b.gear.kind === 'derrick') b.gear.setOutreach(0);
    }
  }
};

/**
 * Frame the four from off the bow quarter and LOW.
 *
 * The read is which of them is lying over, and from above a boat on her beam
 * ends and a boat sitting up straight are very nearly the same picture.
 */
const placeGearCamera = (): void => {
  if (!boats.length) return;
  // HIGH ENOUGH TO SEE HER DECK. From near the water a hull leaning forty-five
  // degrees away and a hull sitting up straight are both a flat slab with a
  // lip on it, and the whole read is which is which.
  // AND OFF THE AXIS THE WIRES RUN DOWN. Square on the port beam, every wire
  // and every derrick boom points straight away from the camera and
  // foreshortens to nothing — four boats and not a wire in the picture, which
  // is the one thing in it.
  camera.position.set(-96, 40, 30);
  camera.lookAt(2, 3, -22);
};

/** Frame her from off the bow quarter and LOW, so the swell is a swell. */
const placeLinerCamera = (): void => {
  if (!liner) return;
  camera.position.set(-186, 44, 150);
  camera.lookAt(-38, 10, -6);
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
    gallerySeaWind: (speed: number, from?: number) => void;
    gallerySeaSwell: (from: number, height: number, period?: number) => void;
    gallerySeaReport: () => Record<string, unknown>;
    gallerySteady: (out: number) => void;
    galleryLinerWay: (fraction: number) => void;
    galleryLinerReport: () => Record<string, unknown>;
    galleryGearReport: () => Record<string, unknown>;
    galleryCraftReport: () => Record<string, unknown>;
    galleryCraftSea: (height: number, length?: number) => void;
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
  stepLiner(dt);
  stepSea(dt);
  stepGear(dt);
  stepCraft(dt);
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

/** Order a wind: m/s and the direction it blows FROM. */
window.gallerySeaWind = (speed: number, from?: number) => {
  seaState?.sea.setWind(speed, from);
};

/** Send a swell in from a storm nobody here will see. */
window.gallerySeaSwell = (from: number, height: number, period = 14) => {
  seaState?.sea.swellIn(from, height, period);
};

/**
 * What the sea is doing, and what it remembers.
 *
 * `spread` is measured off the actual SURFACE — the range of `heightAt` over
 * a grid — because a sea state whose numbers are right and whose water is
 * flat is the failure this whole library keeps finding.
 */
window.gallerySeaReport = () => {
  if (!seaState) return {};
  const { sea, boats, clock } = seaState;
  const ocean = oceans[0];
  let lo = Infinity;
  let hi = -Infinity;
  if (ocean) {
    for (let i = 0; i < 900; i++) {
      const y = ocean.heightAt(((i % 30) - 15) * 24, (Math.floor(i / 30) - 15) * 24);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  }
  return {
    hours: Number((clock / 3600).toFixed(2)),
    wind: Number(sea.wind.toFixed(1)),
    windFrom: Number(sea.windFrom.toFixed(0)),
    state: sea.state,
    height: Number(sea.height.toFixed(2)),
    limit: Number(sea.limit.toFixed(2)),
    douglas: sea.douglas,
    confusion: Number(sea.confusion.toFixed(2)),
    windSea: {
      h: Number(sea.windSea.height.toFixed(2)),
      t: Number(sea.windSea.period.toFixed(1)),
      from: Number(sea.windSea.from.toFixed(0)),
    },
    swell: {
      h: Number(sea.swell.height.toFixed(2)),
      t: Number(sea.swell.period.toFixed(1)),
      from: Number(sea.swell.from.toFixed(0)),
      len: Number(sea.swell.length.toFixed(0)),
    },
    buildingHours: Number.isFinite(sea.building) ? Number((sea.building / 3600).toFixed(1)) : 'never',
    // Measured off the water, not off the model.
    surfaceSpread: Number.isFinite(hi - lo) ? Number((hi - lo).toFixed(2)) : 0,
    boats: boats.map((b) => ({
      at: b.label,
      motion: Number(b.ship.motion.toFixed(3)),
      pitchDeg: Number(((b.ship.pitch * 180) / Math.PI).toFixed(2)),
      rollDeg: Number(((b.ship.roll * 180) / Math.PI).toFixed(2)),
    })),
  };
};

/** Run her fins out, or house them. */
window.gallerySteady = (out: number) => {
  liner?.fins.deploy(out > 0.5);
};

/** Order her a speed: the regulator, and therefore the fins, follow it. */
window.galleryLinerWay = (fraction: number) => {
  if (!liner) return;
  liner.plant.setRegulator(Math.max(0, Math.min(1, fraction)));
  liner.plant.setLink(fraction > 0.02 ? 0.45 : 0);
};

/**
 * Four boats, one sea, and what each of them is doing about it.
 *
 * `swampsIn` is the number the whole track is about: seconds until she is
 * full, which is not the same as seconds until she is lost — read `state` for
 * that, and the difference between the two is the entire era axis.
 */
window.galleryCraftReport = () => {
  if (!craft.length) return {};
  const deg = (r: number): number => Number(((r * 180) / Math.PI).toFixed(2));
  return {
    clock: Number(craftClock.toFixed(1)),
    seaM: CRAFT_H,
    seaLengthM: CRAFT_L,
    steepness: `1 in ${(CRAFT_L / CRAFT_H).toFixed(1)}`,
    boats: craft.map((c) => ({
      at: c.label,
      fit: c.boat.fit,
      state: c.boat.state,
      crew: c.boat.crew,
      waterKg: Number(c.boat.water.toFixed(0)),
      capacityKg: Number(c.boat.capacity.toFixed(0)),
      fullPct: Number(((c.boat.water / c.boat.capacity) * 100).toFixed(0)),
      freeboardM: Number(c.boat.freeboard.toFixed(3)),
      // The sea she could live in, from her freeboard alone — and it mentions
      // her length, her engine, her crew and her stability nowhere.
      livesInM: Number(livesIn(c.boat.freeboard).toFixed(2)),
      boardingKgS: Number(c.boat.boarding.toFixed(1)),
      bailingKgS: Number(c.boat.bailing.toFixed(1)),
      drainingKgS: Number(c.boat.draining.toFixed(1)),
      swamping: c.boat.swamping,
      swampsInS: c.boat.swampsIn() === Infinity ? 'never' : Number(c.boat.swampsIn().toFixed(0)),
      gm: Number(c.boat.gm.toFixed(2)),
      freeSurface: Number(c.boat.freeSurface.toFixed(2)),
      rollPeriodS: c.boat.rollPeriod === Infinity ? 'never' : Number(c.boat.rollPeriod.toFixed(2)),
      trimDeg: deg(c.boat.loading.trim),
      listDeg: deg(c.boat.loading.list),
      capsized: c.boat.capsized,
      // What the hull is SHOWING, not what the model worked out.
      hullRollDeg: deg(c.boat.object.rotation.z),
    })),
  };
};

/** Put a different sea on all four and empty them, to watch the threshold. */
window.galleryCraftSea = (height: number, length = CRAFT_L) => {
  if (!craft.length) return;
  CRAFT_H = Math.max(0, height);
  CRAFT_L = Math.max(0.1, length);
  craftClock = 0;
  craftRolled = false;
  craftHelped = false;
  for (const c of craft) {
    if (c.boat.capsized) c.boat.right();
    c.boat.dry();
  }
};

/**
 * Four wires and what each of them is doing to the boat it is made fast to.
 *
 * `moment` is the handshake and `list` is what the hull did with it — and the
 * two tugs are the same row twice, with one word different.
 */
window.galleryGearReport = () => {
  if (!boats.length) return {};
  const deg = (r: number): number => Number(((r * 180) / Math.PI).toFixed(2));
  return {
    clock: Number(gearClock.toFixed(1)),
    boats: boats.map((b) => ({
      at: b.label,
      state: b.gear.state,
      out: Number(b.gear.out.toFixed(2)),
      wireDeg: deg(b.gear.angle),
      strainT: Number(b.gear.strain.toFixed(1)),
      surgeT: Number(b.gear.surge.toFixed(1)),
      momentTm: Number(b.gear.moment.toFixed(0)),
      girting: b.gear.girting,
      fast: b.gear.fast,
      dragMs: Number(b.gear.drag.toFixed(2)),
      dispT: Number(b.hold.displacement.toFixed(0)),
      gm: Number(b.hold.gm.toFixed(2)),
      listDeg: deg(b.hold.loading.list),
      vanishingDeg: deg(b.hold.vanishing),
      capsized: b.hold.capsized,
      lostForGood: b.over,
      pastFor: Number(b.pastFor.toFixed(2)),
      // What the hull is actually SHOWING, not what the hold worked out.
      hullRollDeg: deg(b.ship.object.rotation.z),
    })),
    creel: creel
      ? {
          strainT: Number(creel.gear.strain.toFixed(2)),
          momentTm: Number(creel.gear.moment.toFixed(2)),
          // The same moment, on five tonnes instead of two hundred and ninety.
          listDeg: deg(listFor(creel.gear.moment, 5, 0.6)),
          onACarrackDeg: deg(listFor(creel.gear.moment, 290, 2.23)),
        }
      : null,
  };
};

/**
 * What is happening on her, and where.
 *
 * `motionAt` per post is the point: one ship, one sea, one instant, and eight
 * different answers to "how hard is it to stand up".
 */
window.galleryLinerReport = () => {
  if (!liner) return {};
  const { ship, hold, plant, fins, posts } = liner;
  return {
    knots: Number((ship ? plant.way * 1.94384 : 0).toFixed(2)),
    coaster: liner.smallPosts.map((p) => ({
      at: p.label,
      motion: Number(liner!.small.motionAt(p.at.x, p.at.z, p.at.y).toFixed(3)),
    })),
    bar: Number(plant.pressure.toFixed(1)),
    draught: Number(hold.draught.toFixed(2)),
    gm: Number(hold.gm.toFixed(2)),
    trimDeg: Number(((hold.loading.trim * 180) / Math.PI).toFixed(2)),
    immersion: Number(hold.immersion.toFixed(2)),
    finsOut: Number(fins.out.toFixed(2)),
    damping: Number(fins.damping.toFixed(2)),
    finDrag: Number(fins.drag.toFixed(2)),
    biting: fins.biting,
    rollDeg: Number(((ship.roll * 180) / Math.PI).toFixed(2)),
    pitchDeg: Number(((ship.pitch * 180) / Math.PI).toFixed(2)),
    motion: Number(ship.motion.toFixed(3)),
    where: posts.map((p) => ({
      at: p.label,
      motion: Number(ship.motionAt(p.at.x, p.at.z, p.at.y).toFixed(3)),
      heave: Number(ship.heaveAt(p.at.x, p.at.z, p.at.y).toFixed(3)),
    })),
  };
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
  if (view === 'liner') placeLinerCamera();
  if (view === 'sea') placeSeaCamera();
  if (view === 'gear') placeGearCamera();
  if (view === 'craft') placeCraftCamera();
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
