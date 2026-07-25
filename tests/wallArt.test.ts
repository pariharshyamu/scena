import { describe, expect, it } from 'vitest';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import {
  PICTURE_STYLES,
  createFramedPhoto,
  createMirror,
  createPainting,
  createPicture,
  createRoom,
  createTapestry,
  createWallAnchor,
  createWallClock,
  hangGallery,
  hangOn,
  type FrameStyle,
  type PictureStyle,
} from '../src';

/** Run a material's onBeforeCompile against a stub and return the result. */
function compile(material: MeshStandardMaterial): { frag: string; uniforms: Record<string, { value: unknown }> } {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: 'void main() {}',
    fragmentShader: [
      'void main() {',
      '#include <map_fragment>',
      '#include <emissivemap_fragment>',
      '}',
    ].join('\n'),
  };
  material.onBeforeCompile?.(shader as never, null as never);
  return { frag: shader.fragmentShader, uniforms: shader.uniforms };
}

const ALL: PictureStyle[] = [...PICTURE_STYLES, 'mirror'];

describe('picture material', () => {
  it.each(ALL)('%s patches base colour, never emissive', (style) => {
    const pic = createPicture(0.6, 0.4, { style });
    const { frag } = compile(pic.material);
    // The whole distinction between a picture and a screen. A picture that
    // writes emissive glows in the dark and ignores the day cycle, which is
    // the loudest possible tell that a wall is decorated with screenshots.
    const mapAt = frag.indexOf('#include <map_fragment>');
    const emissiveAt = frag.indexOf('#include <emissivemap_fragment>');
    expect(frag.slice(mapAt, emissiveAt)).toContain('diffuseColor.rgb');
    expect(frag.slice(emissiveAt)).not.toContain('picCol');
    expect(frag).not.toContain('totalEmissiveRadiance +=');
  });

  it('forces vUv, or the whole layout has nothing to lay out against', () => {
    const pic = createPicture(0.6, 0.4, {});
    expect(pic.material.defines?.USE_UV).toBe('');
  });

  it('has a shader branch for every style, and they differ', () => {
    const ids = new Set(
      ALL.map((style) => compile(createPicture(1, 1, { style }).material).uniforms.uPicStyle.value)
    );
    expect(ids.size).toBe(ALL.length);
  });

  it('is matte except the mirror', () => {
    expect(createPicture(1, 1, { style: 'landscape' }).material.roughness).toBeGreaterThan(0.5);
    expect(createPicture(1, 1, { style: 'mirror' }).material.roughness).toBeLessThan(0.2);
  });

  it('passes its own aspect through, so shapes inside stay round', () => {
    const { uniforms } = compile(createPicture(1.6, 0.4, {}).material);
    expect(uniforms.uPicStyle).toBeDefined();
    expect(uniforms.uPicAspect.value).toBeCloseTo(4, 5);
  });
});

const FRAMES: FrameStyle[] = ['none', 'thin', 'wide', 'ornate', 'box', 'clip'];

describe('createPainting', () => {
  it.each(FRAMES)('%s frame sits on the wall face, facing out', (frame) => {
    const art = createPainting({ frame, width: 0.6, height: 0.4, seed: 2 });
    const box = new Box3().setFromObject(art.object);
    // Origin at the wall face: nothing behind it.
    expect(box.min.z).toBeGreaterThan(-0.002);
    // And it does not project like a shelf.
    expect(box.max.z).toBeLessThan(0.12);
  });

  it.each(FRAMES)('%s reports a size that includes its own moulding', (frame) => {
    const art = createPainting({ frame, width: 0.6, height: 0.4, seed: 2 });
    const box = new Box3().setFromObject(art.object);
    expect(art.width).toBeGreaterThanOrEqual(0.6 - 1e-6);
    expect(art.height).toBeGreaterThanOrEqual(0.4 - 1e-6);
    // Reported size must match what is actually there, or a gallery lays out
    // against numbers that do not describe the objects it is arranging.
    expect(art.width).toBeCloseTo(box.max.x - box.min.x, 2);
    expect(art.height).toBeCloseTo(box.max.y - box.min.y, 2);
  });

  it('is not a wall of squares', () => {
    const ratios = new Set<string>();
    let upright = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const art = createPainting({ seed });
      ratios.add((art.width / art.height).toFixed(2));
      if (art.height > art.width) upright++;
    }
    expect(ratios.size).toBeGreaterThan(8);
    // Both formats turn up. All-landscape is as obviously generated as
    // all-square.
    expect(upright).toBeGreaterThan(2);
    expect(upright).toBeLessThan(22);
  });

  it('picks varied subjects across seeds', () => {
    const styles = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) styles.add(createPainting({ seed }).object.name);
    expect(styles.size).toBeGreaterThan(3);
  });

  it('a mount board widens the opening and sits behind the image', () => {
    const bare = createPainting({ width: 0.4, height: 0.3, frame: 'thin', mount: 0 });
    const matted = createPainting({ width: 0.4, height: 0.3, frame: 'thin', mount: 0.05 });
    expect(matted.width).toBeCloseTo(bare.width + 0.1, 5);
    const picture = matted.object.children.find((c) => c.name === 'picture') as Mesh;
    const board = matted.object.children.find(
      (c) => c instanceof Mesh && c !== picture && (c.material as MeshStandardMaterial).color?.getHex() === 0xece7dd
    ) as Mesh;
    expect(board).toBeDefined();
    expect(board.position.z).toBeLessThan(picture.position.z);
  });

  it('glazing goes in front of the image and is see-through', () => {
    const art = createPainting({ width: 0.4, height: 0.3, glazed: true });
    const glass = art.object.children.find((c) => c.name === 'glazing') as Mesh;
    const picture = art.object.children.find((c) => c.name === 'picture') as Mesh;
    expect(glass.position.z).toBeGreaterThan(picture.position.z);
    expect((glass.material as MeshStandardMaterial).transparent).toBe(true);
  });

  it('an ornate frame is stepped, not one flat band of gold', () => {
    const plain = createPainting({ frame: 'wide', width: 0.5, height: 0.4 });
    const ornate = createPainting({ frame: 'ornate', width: 0.5, height: 0.4 });
    const bars = (g: Group): number => g.children.filter((c) => c instanceof Mesh).length;
    expect(bars(ornate.object)).toBeGreaterThan(bars(plain.object));
  });

  it('a box frame has a back, or you see the wall through the recess', () => {
    const art = createPainting({ frame: 'box', width: 0.4, height: 0.3 });
    const picture = art.object.children.find((c) => c.name === 'picture') as Mesh;
    const behind = art.object.children.filter(
      (c) => c instanceof Mesh && c.position.z < picture.position.z - 0.01
    );
    expect(behind.length).toBeGreaterThan(0);
  });
});

describe('createFramedPhoto', () => {
  it('is small and glazed', () => {
    const photo = createFramedPhoto({ seed: 3 });
    expect(Math.max(photo.width, photo.height)).toBeLessThan(0.25);
    expect(photo.object.children.some((c) => c.name === 'glazing')).toBe(true);
  });

  it('standing moves the origin to the base, not the centre', () => {
    const hung = createFramedPhoto({ seed: 3 });
    const stood = createFramedPhoto({ seed: 3, standing: true });
    const hungBox = new Box3().setFromObject(hung.object);
    const stoodBox = new Box3().setFromObject(stood.object);
    // Hanging: centred on the origin. Standing: sitting on it — otherwise it
    // is buried half a frame deep in whatever shelf it is put on.
    expect(hungBox.min.y).toBeLessThan(-0.02);
    expect(stoodBox.min.y).toBeGreaterThan(-0.03);
    expect(stoodBox.max.y).toBeGreaterThan(0.05);
  });
});

describe('createMirror', () => {
  it('is glass, not canvas, and is not a black rectangle', () => {
    const mirror = createMirror({ seed: 1 });
    expect(mirror.picture?.style).toBe('mirror');
    expect(mirror.picture!.material.roughness).toBeLessThan(0.2);
    expect(mirror.picture!.material.metalness).toBeGreaterThan(0.2);
  });
});

describe('createWallClock', () => {
  /** World position of the tip of a hand, for measuring where it points. */
  const tipOf = (clock: { object: Object3D }, index: number): Vector3 => {
    clock.object.updateMatrixWorld(true);
    const pivots = clock.object.children.filter(
      (c) => !(c instanceof Mesh) || c.children.length > 0
    );
    const pivot = pivots[index];
    const bar = pivot.children[0];
    return bar.getWorldPosition(new Vector3());
  };

  it('points its hands at the time it is told', () => {
    const clock = createWallClock({ rate: 0 });
    clock.setTime(3, 0);
    // 3 o'clock: the hour hand points along +x, the minute hand straight up.
    const hour = tipOf(clock, 0);
    const minute = tipOf(clock, 1);
    expect(hour.x).toBeGreaterThan(0.02);
    expect(Math.abs(hour.y)).toBeLessThan(0.01);
    expect(minute.y).toBeGreaterThan(0.02);
    expect(Math.abs(minute.x)).toBeLessThan(0.01);
  });

  it('the hands actually move, and by different amounts', () => {
    const clock = createWallClock({ rate: 60 });
    clock.setTime(10, 10);
    const before = [tipOf(clock, 0).clone(), tipOf(clock, 1).clone(), tipOf(clock, 2).clone()];
    // A quarter turn of the second hand. A full minute would take it all the
    // way round and back to where it started, and the test would report a
    // stopped clock — the same aliasing that hid the typing keystrokes.
    for (let i = 0; i < 15; i++) clock.update(1 / 60);
    const after = [tipOf(clock, 0), tipOf(clock, 1), tipOf(clock, 2)];
    const moved = before.map((p, i) => p.distanceTo(after[i]));
    // Second hand furthest, then minute, then hour — a clock whose hands all
    // move together is a fan.
    expect(moved[2]).toBeGreaterThan(moved[1]);
    expect(moved[1]).toBeGreaterThan(moved[0]);
    expect(moved[0]).toBeGreaterThan(0);
  });

  it('advances an hour of clock per minute at the default rate', () => {
    const clock = createWallClock({ time: 0 });
    for (let i = 0; i < 60; i++) clock.update(1);
    expect(clock.time).toBeCloseTo(1, 3);
  });

  it('rate 0 freezes it', () => {
    const clock = createWallClock({ time: 4, rate: 0 });
    for (let i = 0; i < 60; i++) clock.update(1);
    expect(clock.time).toBe(4);
  });
});

describe('createTapestry', () => {
  it('hangs BELOW its origin — the rod is the anchor, not the middle', () => {
    const tap = createTapestry({ height: 1.4, seed: 2 });
    const box = new Box3().setFromObject(tap.object);
    expect(box.max.y).toBeLessThan(0.08);
    expect(box.min.y).toBeLessThan(-1.3);
  });

  it('sags away from the wall instead of lying flat against it', () => {
    const tap = createTapestry({ seed: 2 });
    const cloth = tap.object.children.find((c) => c.name === 'cloth') as Mesh;
    const pos = cloth.geometry.attributes.position;
    const zs: number[] = [];
    for (let i = 0; i < pos.count; i++) zs.push(pos.getZ(i));
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.02);
  });
});

describe('hangOn', () => {
  const wallOf = (length = 4, height = 3) => {
    const parent = new Group();
    return { parent, wall: createWallAnchor(parent, 0, 0, -2, 0, length, height) };
  };

  it('places at the asked-for height and parents into the wall', () => {
    const { wall } = wallOf();
    const art = createPainting({ seed: 1 });
    hangOn(wall, art, { height: 1.55, seed: 1 });
    expect(art.object.parent).toBe(wall.anchor);
    expect(art.object.position.y).toBeCloseTo(1.55, 6);
  });

  it('nothing hangs level', () => {
    const { wall } = wallOf();
    const rolls = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const art = createPainting({ seed });
      hangOn(wall, art, { seed });
      expect(art.object.rotation.z).not.toBe(0);
      expect(Math.abs(art.object.rotation.z)).toBeLessThan(0.021);
      rolls.add(art.object.rotation.z.toFixed(5));
    }
    expect(rolls.size).toBe(10);
  });

  it('the crookedness is ROLL, not yaw or pitch', () => {
    // A picture hangs from one point and swings in its own plane. Tilting in
    // any other axis drives a corner into the plaster.
    const { wall } = wallOf();
    const art = createPainting({ seed: 4 });
    hangOn(wall, art, { seed: 4 });
    expect(art.object.rotation.y).toBe(0);
    expect(art.object.rotation.x).toBe(0);
  });

  it('tilt 0 is exactly level, for things that are screwed on', () => {
    const { wall } = wallOf();
    const clock = createWallClock();
    hangOn(wall, clock, { tilt: 0 });
    expect(clock.object.rotation.z).toBe(0);
  });

  it('puts the art INSIDE the room, facing the floor it overlooks', () => {
    // The failure this exists to prevent: an anchor whose +z points into the
    // masonry hangs every picture inside the wall, and nothing about the
    // library state says so.
    const parent = new Group();
    const wall = createWallAnchor(parent, 0, 0, -2, 0, 4, 3);
    const art = createPainting({ seed: 1 });
    hangOn(wall, art, { height: 1.5 });
    parent.updateMatrixWorld(true);
    const at = art.object.getWorldPosition(new Vector3());
    expect(at.z).toBeGreaterThan(-2);
    const facing = art.object.getWorldDirection(new Vector3());
    expect(facing.z).toBeGreaterThan(0.9);
  });
});

describe('hangGallery', () => {
  const wallOf = (length: number) => {
    const parent = new Group();
    return { parent, wall: createWallAnchor(parent, 0, 0, 0, 0, length, 3) };
  };

  it('stays on the wall and does not overlap itself', () => {
    const { wall } = wallOf(4);
    const items = Array.from({ length: 6 }, (_, i) => createPainting({ seed: i + 1 }));
    const placed = hangGallery(wall, items, { seed: 5 });
    expect(placed.length).toBeGreaterThan(3);

    // Measure real spans, not the numbers the layout used.
    const spans = placed
      .map((o, i) => {
        const w = items[items.findIndex((it) => it.object === o)].width;
        return { lo: o.position.x - w / 2, hi: o.position.x + w / 2 };
      })
      .sort((a, b) => a.lo - b.lo);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].lo).toBeGreaterThanOrEqual(spans[i - 1].hi - 1e-9);
    }
    expect(spans[0].lo).toBeGreaterThanOrEqual(-wall.length / 2 - 1e-6);
    expect(spans[spans.length - 1].hi).toBeLessThanOrEqual(wall.length / 2 + 1e-6);
  });

  it('leaves off what will not fit rather than cramming it in', () => {
    const { wall } = wallOf(1.0);
    const items = Array.from({ length: 8 }, (_, i) => createPainting({ seed: i + 1, width: 0.6 }));
    const placed = hangGallery(wall, items, { seed: 2 });
    expect(placed.length).toBeLessThan(8);
    expect(placed.length).toBeGreaterThan(0);
    // The ones left off were never parented, so nothing is hidden inside a wall.
    for (const item of items.slice(placed.length)) expect(item.object.parent).toBeNull();
  });

  it('is a composition, not a row: uneven gaps and varied heights', () => {
    const { wall } = wallOf(6);
    const items = Array.from({ length: 6 }, (_, i) => createPainting({ seed: i + 1 }));
    const placed = hangGallery(wall, items, { seed: 9 });
    const ys = new Set(placed.map((o) => o.position.y.toFixed(3)));
    expect(ys.size).toBeGreaterThan(3);
    const xs = placed.map((o) => o.position.x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    const spread = Math.max(...gaps) - Math.min(...gaps);
    expect(spread).toBeGreaterThan(0.02);
  });

  it('measures raw Object3Ds from their bounds', () => {
    const { wall } = wallOf(4);
    const blocks = Array.from(
      { length: 3 },
      () => new Mesh(new BoxGeometry(0.5, 0.5, 0.02)) as Object3D
    );
    const placed = hangGallery(wall, blocks, { seed: 1 });
    expect(placed.length).toBe(3);
  });
});

describe('room walls', () => {
  const MAP = ['#####', '#...#', '#...#', '##D##'];

  it('merges cells into runs instead of one panel per block', () => {
    const room = createRoom(MAP, { unit: 1 });
    // Four sides, minus the doorway which splits the south run in two.
    expect(room.walls.length).toBeGreaterThanOrEqual(4);
    // The long runs are the full interior width, not 1 m cells.
    expect(room.walls[0].length).toBeGreaterThanOrEqual(3);
  });

  it('every anchor faces into the room, never into the masonry', () => {
    // Three separate demos this session seated a character with their back to
    // the thing they were meant to face, all because an anchor's +z was
    // pointing the wrong way. This is that test.
    const room = createRoom(MAP, { unit: 1 });
    room.group.updateMatrixWorld(true);
    for (const wall of room.walls) {
      const forward = wall.anchor.getWorldDirection(new Vector3());
      expect(forward.dot(wall.normal)).toBeGreaterThan(0.99);
      // A step along the normal from the face must land on open floor.
      const inside = wall.position.clone().addScaledVector(wall.normal, 0.5);
      expect(room.floorAt(inside.x, inside.z)).toBe(true);
    }
  });

  it("the anchor's +x runs along the wall, so a gallery walks it", () => {
    const room = createRoom(MAP, { unit: 1 });
    room.group.updateMatrixWorld(true);
    for (const wall of room.walls) {
      const right = new Vector3(1, 0, 0).applyQuaternion(
        wall.anchor.getWorldQuaternion(new Quaternion())
      );
      // Along the wall means perpendicular to its normal, and horizontal.
      expect(Math.abs(right.dot(wall.normal))).toBeLessThan(1e-6);
      expect(Math.abs(right.y)).toBeLessThan(1e-6);
    }
  });

  it('a window splits a run — you cannot hang a picture over glass', () => {
    const solid = createRoom(['#####', '#...#', '#####'], { unit: 1 });
    const glazed = createRoom(['##W##', '#...#', '#####'], { unit: 1 });
    const northSolid = solid.walls.filter((w) => w.normal.z > 0.5);
    const northGlazed = glazed.walls.filter((w) => w.normal.z > 0.5);
    expect(northSolid.length).toBe(1);
    expect(northSolid[0].length).toBe(3);
    // The 3 m run becomes two 1 m runs with the window between them.
    expect(northGlazed.length).toBe(2);
    for (const w of northGlazed) expect(w.length).toBe(1);
  });

  it('art hung on a room wall ends up inside the room', () => {
    const room = createRoom(MAP, { unit: 1 });
    const wall = room.walls[0];
    const art = createPainting({ width: 0.5, height: 0.4, seed: 2 });
    hangOn(wall, art, { height: 1.5 });
    room.group.updateMatrixWorld(true);
    const at = art.object.getWorldPosition(new Vector3());
    expect(at.y).toBeCloseTo(1.5, 5);
    // Standing back from the picture along its own facing must be open floor.
    const facing = art.object.getWorldDirection(new Vector3());
    const viewer = at.clone().addScaledVector(facing, 0.6);
    expect(room.floorAt(viewer.x, viewer.z)).toBe(true);
  });
});
