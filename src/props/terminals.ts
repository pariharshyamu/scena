import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createScreenPanel, type ScreenMode, type ScreenPanel } from '../materials/screen';
import { addApproach, createSlot, type Prop, type PropSlot } from '../core/types';

/**
 * Terminals — the machines you have to queue for.
 *
 * These are the first props in the kit that a character does not simply walk
 * up to and use: there may already be somebody at it, and a second person has
 * to wait. So besides the usual slot, every terminal publishes a **line** —
 * an anchor at the head of the queue, with the queue running back along its
 * local -z.
 *
 * ```ts
 * const atm = createTerminal({ style: 'atm' });
 * const queue = new Queue({ service: 14, spacing: atm.spacing });
 * // distance from GAMA's Queue -> a world position on the line
 * const at = atm.line.localToWorld(new Vector3(0, 0, -queue.distanceOf(person)));
 * ```
 *
 * That pairing is the whole handshake: SCENA says where the line is, GAMA
 * says who is where along it, and neither imports the other.
 */
export interface Terminal extends Prop {
  /** The machine's display. */
  screen: ScreenPanel;
  /** Where the user stands to operate it. */
  slot: PropSlot;
  /**
   * Head of the queue. The line runs BACK along this anchor's local -z, so a
   * distance `d` from a queue maps to `line.localToWorld(new Vector3(0,0,-d))`.
   * It faces the machine, so a character copying its rotation faces the right
   * way while they wait.
   */
  line: Object3D;
  /** Suggested metres between people in the line. */
  spacing: number;
}

export type TerminalStyle = 'atm' | 'kiosk' | 'vending';

export interface TerminalOptions {
  style?: TerminalStyle;
  seed?: number;
  /** What the display shows. Defaults suit the style (an ATM shows a keypad). */
  mode?: ScreenMode;
  palette?: Palette;
  /** Metres between people queueing. Default 0.62. */
  spacing?: number;
}

const DEFAULT_MODE: Record<TerminalStyle, ScreenMode> = {
  atm: 'keypad',
  kiosk: 'map',
  vending: 'home',
};

function shell(palette: Palette, tint: number, rough = 0.55): MeshStandardMaterial {
  // Light grey, deliberately. Started near-black, which looked fine as a
  // colour swatch and rendered outdoors as a featureless black slab — none
  // of the hood, shelf or slots that say "cash machine" survived. Public
  // machines are pale for exactly this reason: they have to read at a
  // glance from across a concourse.
  const base = new Color(0xa8b0b8).lerp(new Color(palette.metal), tint * 0.5);
  return createSurface('paintedMetal', { color: base.getHex(), roughness: rough });
}

/**
 * A machine with a screen, a place to stand, and a queue behind it.
 *
 * - `atm` — a wall unit with a hooded screen at eye height and a keypad shelf.
 * - `kiosk` — a freestanding pillar with the screen raked back to be read
 *   standing over it.
 * - `vending` — a glass-fronted cabinet with a small screen and a delivery
 *   flap at knee height.
 */
export function createTerminal(options: TerminalOptions = {}): Terminal {
  const style = options.style ?? 'atm';
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;
  const spacing = options.spacing ?? 0.62;
  const mode = options.mode ?? DEFAULT_MODE[style];

  const group = new Group();
  group.name = `terminal-${style}`;
  const body = shell(palette, 0.25);
  const dark = new MeshStandardMaterial({ color: 0x1a1d23, roughness: 0.75, flatShading: true });

  let screen: ScreenPanel;
  let standAt = 0.85;
  let radius = 0.5;

  if (style === 'atm') {
    // A cash machine reads from its hood and its two slots. The screen is
    // set BACK under the hood — that recess is most of what says "ATM".
    const cabinet = new Mesh(new BoxGeometry(0.92, 1.95, 0.34), body);
    cabinet.position.set(0, 0.975, -0.17);
    group.add(cabinet);

    const hood = new Mesh(new BoxGeometry(0.98, 0.06, 0.26), shell(palette, 0.1));
    hood.position.set(0, 1.62, 0.12);
    group.add(hood);
    for (const s of [-1, 1]) {
      const cheek = new Mesh(new BoxGeometry(0.05, 0.34, 0.26), shell(palette, 0.1));
      cheek.position.set(s * 0.465, 1.45, 0.12);
      group.add(cheek);
    }

    const face = new Group();
    face.position.set(0, 1.42, 0.005);
    face.rotation.x = -0.18; // raked so a standing adult reads it
    group.add(face);
    screen = createScreenPanel(0.32, 0.24, { mode, seed, brightness: 0.9, accent: 0x59b0ff });
    const panel = new Mesh(new PlaneGeometry(0.32, 0.24), screen.material);
    panel.name = 'screen';
    face.add(panel);
    screen.surface = panel;

    // Keypad shelf, card slot, cash slot — the three things hands go to.
    const shelf = new Mesh(new BoxGeometry(0.62, 0.04, 0.22), shell(palette, 0.35));
    shelf.position.set(0, 1.06, 0.1);
    shelf.rotation.x = -0.3;
    group.add(shelf);
    const keys = new Mesh(new BoxGeometry(0.3, 0.012, 0.16), dark);
    keys.position.set(-0.1, 1.09, 0.11);
    keys.rotation.x = -0.3;
    group.add(keys);
    const card = new Mesh(new BoxGeometry(0.11, 0.02, 0.03), dark);
    card.position.set(0.3, 1.2, 0.17);
    group.add(card);
    const cash = new Mesh(new BoxGeometry(0.26, 0.03, 0.03), dark);
    cash.position.set(0, 0.86, 0.17);
    group.add(cash);
    standAt = 0.72;
    radius = 0.55;
  } else if (style === 'kiosk') {
    const plinth = new Mesh(new BoxGeometry(0.66, 0.09, 0.5), shell(palette, 0.4));
    plinth.position.set(0, 0.045, 0);
    group.add(plinth);
    const post = new Mesh(new BoxGeometry(0.5, 1.02, 0.3), body);
    post.position.set(0, 0.6, -0.05);
    group.add(post);

    const face = new Group();
    face.position.set(0, 1.18, 0.02);
    face.rotation.x = -0.55; // a kiosk is read from above, so it lies well back
    group.add(face);
    screen = createScreenPanel(0.42, 0.3, { mode, seed, brightness: 0.95, accent: 0x4de0b0 });
    const panel = new Mesh(new PlaneGeometry(0.42, 0.3), screen.material);
    panel.name = 'screen';
    face.add(panel);
    screen.surface = panel;
    const rim = new Mesh(new BoxGeometry(0.5, 0.38, 0.07), shell(palette, 0.15));
    rim.position.set(0, 1.16, -0.03);
    rim.rotation.x = -0.55;
    group.add(rim);
    standAt = 0.65;
    radius = 0.42;
  } else {
    // Vending: a lit cabinet of goods, which is the point of it, plus a
    // small screen and a flap you bend down to.
    const cabinet = new Mesh(new BoxGeometry(1.02, 1.92, 0.72), body);
    cabinet.position.set(0, 0.96, -0.36);
    group.add(cabinet);
    const glass = new Mesh(new BoxGeometry(0.82, 1.3, 0.02), new MeshStandardMaterial({
      color: 0x9fd0e0,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.3,
    }));
    glass.position.set(-0.06, 1.16, 0.005);
    group.add(glass);
    // Rows of product, seeded so no two machines are stocked alike.
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        const item = new Mesh(
          new BoxGeometry(0.13, 0.16, 0.09),
          new MeshStandardMaterial({
            color: new Color().setHSL(rng.next(), 0.55, 0.5).getHex(),
            roughness: 0.6,
            flatShading: true,
          })
        );
        item.position.set(-0.36 + col * 0.2, 0.62 + row * 0.24, -0.1);
        // A machine is never quite full.
        if (rng.next() > 0.12) group.add(item);
      }
    }
    screen = createScreenPanel(0.2, 0.14, { mode, seed, brightness: 0.8, accent: 0xffb54d });
    const panel = new Mesh(new PlaneGeometry(0.2, 0.14), screen.material);
    panel.name = 'screen';
    panel.position.set(0.37, 1.52, 0.008);
    group.add(panel);
    screen.surface = panel;
    const flap = new Mesh(new BoxGeometry(0.42, 0.16, 0.03), dark);
    flap.position.set(-0.06, 0.36, 0.005);
    group.add(flap);
    standAt = 0.78;
    radius = 0.62;
  }

  // Where the user stands: in front, facing the machine. Slot anchors face
  // their own +z, so a user at +z facing the machine at the origin is turned
  // through half a turn.
  const slot = createSlot('operate', 'stand', group, 0, 0, standAt, Math.PI);
  addApproach(slot, group, 0.55, 'behind');

  // The head of the queue sits just behind the user, facing the same way, and
  // the line runs back along its -z (which, turned around, is away from the
  // machine).
  const line = new Object3D();
  line.name = 'queue';
  line.position.set(0, 0, standAt + 0.28);
  line.rotation.y = Math.PI;
  group.add(line);

  return { object: group, obstacleRadius: radius, screen, slot, slots: [slot], line, spacing };
}
