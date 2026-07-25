import {
  AmbientLight,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  PerspectiveCamera,
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
  dress,
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
} else if (view === 'table') {
  // A single dressed tabletop, close up, so the placement can be judged
  // rather than assumed.
  scene.add(new AmbientLight(0xffffff, 1.1));
  const key = new DirectionalLight(0xffffff, 1.9);
  key.position.set(2, 5, 3);
  scene.add(key);
  const table = createTable({ style: 'trestle', seed: 2, palette });
  scene.add(table.object);
  // Tabletop-sized things. A carryable basket is 45 cm across — three of
  // them IS a full table, and a demo stocked with them says nothing about
  // the layout.
  const kit = [
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
  const t = clockDriver.elapsedTime;
  if (view === 'room') {
    camera.position.set(Math.sin(t * 0.12) * 1.1, 1.62, 2.2);
    camera.lookAt(Math.sin(t * 0.08) * 0.8, 1.45, -2.6);
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
  return {
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
