import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Object3D, Vector3 } from 'three';
import {
  ALL_PICTURE_STYLES,
  PLANT_SPECIES,
  createCurtains,
  createCushion,
  createHangingPlant,
  createPicture,
  createPinboard,
  createPlant,
  createPoster,
  createStickyNotes,
  createThrow,
  createWhiteboard,
  createWindowBox,
} from '../src';

const boxOf = (object: Object3D): Box3 => {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
};
const sizeOf = (object: Object3D): Vector3 => boxOf(object).getSize(new Vector3());

// --- M: plants -----------------------------------------------------------

describe('createPlant', () => {
  it.each(PLANT_SPECIES)('%s stands on y = 0 in its pot', (species) => {
    const plant = createPlant({ species, seed: 3 });
    const box = boxOf(plant.object);
    expect(box.min.y).toBeGreaterThan(-0.004);
    expect(box.max.y).toBeGreaterThan(0.08);
  });

  it('every species has a distinct silhouette', () => {
    // The whole trap: six species that are all "green ball on a stalk" in six
    // different greens is one plant six times, and colour cannot rescue it.
    // Compare the SHAPE — how tall against how wide, and how the mass is
    // distributed up the height.
    const shapes = PLANT_SPECIES.map((species) => {
      const plant = createPlant({ species, seed: 4, pot: false });
      const box = boxOf(plant.object);
      const size = box.getSize(new Vector3());
      const slenderness = size.y / Math.max(size.x, size.z, 1e-4);
      // Where is the mass? Average the y of every child, normalised.
      const ys = plant.object.children.flatMap((c) => c.children.map((g) => g.position.y));
      const mean = ys.length ? ys.reduce((a, y) => a + y, 0) / ys.length : 0;
      return { species, slenderness, lift: mean / Math.max(size.y, 1e-4) };
    });
    for (const a of shapes) {
      for (const b of shapes) {
        if (a.species === b.species) continue;
        const differs =
          Math.abs(a.slenderness - b.slenderness) > 0.25 || Math.abs(a.lift - b.lift) > 0.12;
        expect(differs, `${a.species} and ${b.species} have the same silhouette`).toBe(true);
      }
    }
  });

  it('a trailing plant actually trails below its own crown', () => {
    const plant = createPlant({ species: 'trailing', seed: 5, pot: false, drop: 0.3 });
    const foliage = plant.object.children.find((c) => c.name === 'foliage')!;
    const ys = foliage.children.map((c) => c.position.y);
    // Something has to hang below the soil line, or it is a fern.
    expect(Math.min(...ys)).toBeLessThan(0);
  });

  it('a cactus has no leaves and a ficus has a bare trunk', () => {
    const cactus = createPlant({ species: 'cactus', seed: 2, pot: false });
    const foliage = (p: { object: Object3D }): Object3D =>
      p.object.children.find((c) => c.name === 'foliage')!;
    // A cactus is a column: few parts, all of them thick.
    expect(foliage(cactus).children.length).toBeLessThan(8);

    const ficus = createPlant({ species: 'ficus', seed: 2, pot: false });
    const parts = foliage(ficus).children.map((c) => boxOf(c));
    const trunk = parts.reduce((lowest, b) => (b.min.y < lowest.min.y ? b : lowest));
    const canopy = parts.reduce((highest, b) => (b.max.y > highest.max.y ? b : highest));
    // The trunk must be visible below the canopy, or it is a bush.
    expect(canopy.min.y).toBeGreaterThan(trunk.min.y + 0.05);
  });

  it('is a houseplant, not a tree', () => {
    for (const species of PLANT_SPECIES) {
      const size = sizeOf(createPlant({ species, seed: 6 }).object);
      expect(size.y).toBeLessThan(1.3);
      expect(Math.max(size.x, size.z)).toBeLessThan(1.0);
    }
  });

  it('no two plants of a species are the same plant', () => {
    const heights = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      heights.add(createPlant({ species: 'fern', seed }).height.toFixed(4));
    }
    expect(heights.size).toBe(10);
  });

  it('pots come from the lathe, not from a box', () => {
    const plant = createPlant({ species: 'snake', seed: 1 });
    const pot = plant.object.children.find((c) => c.name.startsWith('vessel'));
    expect(pot).toBeDefined();
  });
});

describe('createHangingPlant', () => {
  it('hangs BELOW its fixing point', () => {
    // Same convention as the tapestry's rod: a hanging thing is placed by
    // where it hangs from.
    const plant = createHangingPlant({ seed: 3, cord: 0.3 });
    const box = boxOf(plant.object);
    expect(box.max.y).toBeLessThan(0.02);
    expect(box.min.y).toBeLessThan(-0.3);
  });
});

describe('createWindowBox', () => {
  it('mixes upright and trailing planting', () => {
    const trough = createWindowBox({ seed: 4, length: 0.9 });
    const names = trough.object.children
      .filter((c) => c.name.startsWith('plant-'))
      .map((c) => c.name);
    expect(names.length).toBeGreaterThan(2);
    // A trough of one species is a hedge.
    expect(new Set(names).size).toBeGreaterThan(1);
  });
});

// --- O: soft furnishing --------------------------------------------------

describe('createCurtains', () => {
  it('hangs below the rail', () => {
    const c = createCurtains({ width: 1.2, drop: 1.6, seed: 2 });
    const box = boxOf(c.object);
    expect(box.max.y).toBeLessThan(0.05);
    expect(box.min.y).toBeLessThan(-1.5);
  });

  it('is pleated, not a flat sheet', () => {
    // A panel cut flat is a bedsheet nailed to the wall however well it moves.
    const c = createCurtains({ width: 1.2, drop: 1.6, seed: 2 });
    const panel = c.object.children.find((ch) => ch.name === 'panel') as Mesh;
    const pos = panel.geometry.attributes.position;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      lo = Math.min(lo, pos.getZ(i));
      hi = Math.max(hi, pos.getZ(i));
    }
    expect(hi - lo).toBeGreaterThan(0.02);
  });

  it('the cloth is wider than the gap it covers', () => {
    const c = createCurtains({ width: 1.2, style: 'closed', seed: 1 });
    const panel = c.object.children.find((ch) => ch.name === 'panel') as Mesh;
    const size = new Box3().setFromObject(panel).getSize(new Vector3());
    // Two panels covering 1.2 m: each is gathered from more cloth than that.
    expect(size.x).toBeGreaterThan(1.2 / 2);
  });

  it('actually moves when updated, and only then', () => {
    const c = createCurtains({ seed: 3 });
    const panel = c.object.children.find((ch) => ch.name === 'panel') as Mesh;
    const uniforms = (panel.material as unknown as { userData: { waveUniforms: { uTime: { value: number } } } })
      .userData.waveUniforms;
    expect(uniforms.uTime.value).toBe(0);
    c.update(0.5);
    expect(uniforms.uTime.value).toBeCloseTo(0.5, 6);
  });

  it('the two panels do not wave in lockstep', () => {
    const c = createCurtains({ style: 'closed', seed: 7 });
    const panels = c.object.children.filter((ch) => ch.name === 'panel') as Mesh[];
    expect(panels.length).toBe(2);
    const phase = (m: Mesh): number =>
      (m.material as unknown as { userData: { waveUniforms: { uPhase: { value: number } } } }).userData
        .waveUniforms.uPhase.value;
    expect(phase(panels[0])).not.toBe(phase(panels[1]));
  });

  it('a sheer panel is one see-through piece across the whole opening', () => {
    const c = createCurtains({ style: 'sheer', width: 1.0, seed: 1 });
    const panels = c.object.children.filter((ch) => ch.name === 'panel') as Mesh[];
    expect(panels.length).toBe(1);
    expect((panels[0].material as unknown as { transparent: boolean }).transparent).toBe(true);
  });
});

describe('createCushion', () => {
  it('is plumper in the middle than at its corners', () => {
    // A box is a brick.
    const cushion = createCushion({ size: 0.4, seed: 2 });
    const mesh = cushion.object.children[0] as Mesh;
    const pos = mesh.geometry.attributes.position;
    let corner = 0;
    let middle = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i));
      const z = Math.abs(pos.getZ(i));
      const y = Math.abs(pos.getY(i));
      if (x > 0.18 && z > 0.18) corner = Math.max(corner, y);
      if (x < 0.02 && z < 0.02) middle = Math.max(middle, y);
    }
    expect(middle).toBeGreaterThan(corner * 1.2);
  });

  it('sits on the surface', () => {
    expect(boxOf(createCushion({ seed: 4 }).object).min.y).toBeGreaterThan(-0.002);
  });
});

describe('createThrow', () => {
  it('lies flat on top and hangs down the front', () => {
    const t = createThrow({ width: 0.9, hang: 0.35, seed: 2 });
    const box = boxOf(t.object);
    // Down the front, not up in the air.
    expect(box.min.y).toBeLessThan(-0.3);
    expect(box.max.y).toBeLessThan(0.06);
  });

  it('has an uneven hem', () => {
    const t = createThrow({ seed: 3 });
    const cloth = t.object.children.find((c) => c.name === 'cloth') as Mesh;
    const pos = cloth.geometry.attributes.position;
    const lowest: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < -0.3) lowest.push(pos.getY(i));
    }
    expect(lowest.length).toBeGreaterThan(2);
    // A straight edge is a tablecloth.
    expect(Math.max(...lowest) - Math.min(...lowest)).toBeGreaterThan(0.004);
  });
});

// --- P: paper ------------------------------------------------------------

/** Run a picture material's shader patch against a stub. */
function compile(material: { onBeforeCompile?: (s: never, r: never) => void }): string {
  const shader = {
    uniforms: {},
    vertexShader: '',
    fragmentShader: 'void main() {\n#include <map_fragment>\n#include <emissivemap_fragment>\n}',
  };
  material.onBeforeCompile?.(shader as never, null as never);
  return shader.fragmentShader;
}

describe('poster and notice picture styles', () => {
  it('every style still has its own branch', () => {
    expect(ALL_PICTURE_STYLES).toContain('poster');
    expect(ALL_PICTURE_STYLES).toContain('notice');
    const frag = compile(createPicture(1, 1, { style: 'poster' }).material);
    expect(frag).toContain('picPoster');
    expect(frag).toContain('picNotice');
  });

  it('paper is not varnished canvas', () => {
    const poster = createPicture(1, 1, { style: 'poster' });
    const oil = createPicture(1, 1, { style: 'landscape' });
    expect(poster.material.roughness).toBeGreaterThan(oil.material.roughness);
  });

  it('still writes base colour, never emissive', () => {
    for (const style of ['poster', 'notice'] as const) {
      const frag = compile(createPicture(1, 1, { style }).material);
      const mapAt = frag.indexOf('#include <map_fragment>');
      const emissiveAt = frag.indexOf('#include <emissivemap_fragment>');
      expect(frag.slice(mapAt, emissiveAt)).toContain('diffuseColor.rgb');
    }
  });
});

describe('createPoster', () => {
  it('lies on the wall face with fixings at its corners', () => {
    const poster = createPoster({ width: 0.5, height: 0.7, seed: 2 });
    const box = boxOf(poster.object);
    expect(box.min.z).toBeGreaterThan(-0.001);
    expect(box.max.z).toBeLessThan(0.02);
    expect(poster.object.children.length).toBe(5); // sheet + four fixings
  });

  it('tape is crooked, pins are not', () => {
    const taped = createPoster({ seed: 3, taped: true });
    const pinned = createPoster({ seed: 3 });
    const rolls = (p: { object: Object3D }): number[] =>
      p.object.children.slice(1).map((c) => c.rotation.z);
    expect(rolls(taped).some((r) => r !== 0)).toBe(true);
    expect(rolls(pinned).every((r) => r === 0)).toBe(true);
  });
});

describe('createPinboard', () => {
  it('overlaps what is pinned to it', () => {
    // The overlap IS the prop. Neatly spaced non-touching notes is a
    // spreadsheet.
    const board = createPinboard({ width: 0.8, height: 0.6, count: 7, seed: 4 });
    const notes = board.object.children.filter((c) => c instanceof Mesh && c.rotation.z !== 0);
    expect(notes.length).toBeGreaterThan(4);
    let overlaps = 0;
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const a = new Box3().setFromObject(notes[i]);
        const b = new Box3().setFromObject(notes[j]);
        if (a.max.x > b.min.x && b.max.x > a.min.x && a.max.y > b.min.y && b.max.y > a.min.y) {
          overlaps++;
        }
      }
    }
    expect(overlaps).toBeGreaterThan(0);
  });

  it('keeps everything on the board', () => {
    const board = createPinboard({ width: 0.8, height: 0.6, count: 7, seed: 4 });
    const size = sizeOf(board.object);
    expect(size.x).toBeLessThan(0.9);
    expect(size.y).toBeLessThan(0.7);
  });

  it('stacks its notes in z so the ones on top really are', () => {
    const board = createPinboard({ count: 6, seed: 2 });
    const zs = board.object.children
      .filter((c) => c.rotation.z !== 0)
      .map((c) => c.position.z);
    expect(new Set(zs.map((z) => z.toFixed(5))).size).toBe(zs.length);
  });
});

describe('createWhiteboard', () => {
  it('has a pen tray with pens on it, below the board', () => {
    const wb = createWhiteboard({ seed: 1, height: 0.8 });
    const pens = wb.object.children.filter(
      (c) => c instanceof Mesh && c.position.y < -0.4 && c.position.z > 0.03
    );
    expect(pens.length).toBeGreaterThanOrEqual(3);
  });

  it('leaves a blank patch — nobody ever fills one', () => {
    const busy = createWhiteboard({ seed: 2, fill: 1 });
    const sparse = createWhiteboard({ seed: 2, fill: 0.2 });
    expect(busy.object.children.length).toBeGreaterThan(sparse.object.children.length);
  });

  it('writes with strokes, and every stroke is flat on the board', () => {
    const wb = createWhiteboard({ seed: 3 });
    const marks = wb.object.children.filter((c) => (c as Mesh).position.z === 0.0195);
    expect(marks.length).toBeGreaterThan(4);
    for (const m of marks) {
      const size = new Box3().setFromObject(m).getSize(new Vector3());
      // Strokes, not glyphs: nothing here is letter-shaped or letter-sized.
      expect(Math.min(size.x, size.y)).toBeLessThan(0.02);
    }
  });
});

describe('createStickyNotes', () => {
  it('clusters rather than scattering evenly', () => {
    const notes = createStickyNotes({ count: 6, seed: 5, width: 0.4, height: 0.3 });
    const squares = notes.object.children.filter((c) => c.rotation.z !== 0 && c.position.z < 0.005);
    const xs = squares.map((c) => c.position.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.4);
  });

  it('sits flat on the wall face', () => {
    const box = boxOf(createStickyNotes({ seed: 2 }).object);
    expect(box.min.z).toBeGreaterThan(-0.001);
    expect(box.max.z).toBeLessThan(0.01);
  });

  it('nothing on a note is big enough to be mistaken for a letter', () => {
    const notes = createStickyNotes({ count: 4, size: 0.075, seed: 1 });
    for (const child of notes.object.children) {
      const size = new Box3().setFromObject(child).getSize(new Vector3());
      expect(Math.max(size.x, size.y)).toBeLessThan(0.1);
    }
  });
});
