import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { Rng } from '../core/random';
import { createSurface } from '../materials/surface';
import type { Prop } from '../core/types';

/**
 * Ammunition — the whole supply chain, not a shelf of models.
 *
 * A round is never just a round. The same cartridge is a thing in a crate, a
 * thing in a magazine, a thing in a hand and a case on the floor, and a game
 * that wants ammunition wants all four or none of them. So this module is
 * organised by STATE rather than by object:
 *
 *   stored   `createAmmoBox`   — sealed or open, rounds visible inside
 *   ready    `createMagazine`  `createBelt`  `createQuiver`  `createRack`
 *   carried  `createRound`     — one, `Holdable`, in a hand
 *   spent    `createCasing`    — brass on the ground, links, an empty box
 *
 * and every one of them is DERIVED from a single measured spec per kind. The
 * magazine is as long as its rounds are, the belt's link pitch is the case
 * head diameter, the crate's stack count falls out of the crate's inside
 * dimensions divided by the round. Author forty models by hand and forty
 * models drift; author one table and a 12.7 mm belt is visibly heavier than a
 * 5.56 mm one because it *is*.
 *
 * ## The handshake that matters
 *
 * `ballisticsOf(kind)` returns exactly what GAMA's `Projectiles` and
 * `Missiles` want — muzzle velocity, drop, tracer size and colour. The same
 * table that decides how long the cartridge model is decides how fast it
 * flies and how far it falls. That is the point of putting them together:
 * a game cannot make the prop and the projectile disagree, because there is
 * only one number.
 *
 * ```ts
 * const b = ballisticsOf('rifle');
 * const shots = new Projectiles({ gravity: b.gravity, size: b.size, color: b.color });
 * shots.fire(muzzle, aim.multiplyScalar(b.speed));
 * mag.setCount(mag.count - 1);            // the belt/magazine visibly empties
 * ```
 *
 * ## Instancing is not an optimisation here, it is the feature
 *
 * A 200-link belt is 200 rounds. Built as meshes that is 400 draw calls for
 * one prop and the geometry gate refuses it — correctly. Every container
 * renders its rounds as ONE `InstancedMesh` per part, and `setCount` rewrites
 * instance matrices rather than adding or removing anything. A magazine that
 * empties therefore costs the same as a full one, which is what lets a game
 * put a belt on every gunner in a firefight.
 */

/** A quantity of one kind of ammunition, in the state a game finds it in. */
export type AmmoKind =
  // Small arms — carried by a person, fed from magazines and belts.
  | 'pistol'
  | 'rifle'
  | 'shotgun'
  | 'heavy-mg'
  // Crew-served and vehicle weapons — fed by hand from racks and boxes.
  | 'autocannon'
  | 'tank'
  | 'artillery'
  | 'mortar'
  // Aviation and naval ordnance — hung, racked or tubed, never "loaded".
  | 'rocket'
  | 'missile'
  | 'bomb'
  | 'torpedo'
  | 'depth-charge'
  // Thrown.
  | 'grenade'
  // Pre-modern. The same four states, a thousand years earlier.
  | 'arrow'
  | 'bolt'
  | 'sling'
  | 'cannonball'
  | 'ballista';

export const AMMO_KINDS: AmmoKind[] = [
  'pistol', 'rifle', 'shotgun', 'heavy-mg',
  'autocannon', 'tank', 'artillery', 'mortar',
  'rocket', 'missile', 'bomb', 'torpedo', 'depth-charge',
  'grenade',
  'arrow', 'bolt', 'sling', 'cannonball', 'ballista',
];

/**
 * How a round is put together, which decides how it is drawn.
 *
 * `case` is the material story and `head` is the silhouette, and they are
 * separate because they vary independently: a tank round is a brass case with
 * a fin-stabilised dart in it, an artillery shell is a bagged charge with no
 * case at all, and a crossbow bolt is neither.
 */
export type CaseKind = 'brass' | 'steel' | 'plastic' | 'bagged' | 'none';
export type HeadKind =
  | 'spitzer'   // pointed jacketed bullet
  | 'ball'      // round-nose
  | 'shot'      // a shotgun's crimped plastic hull
  | 'dart'      // fin-stabilised sub-calibre penetrator
  | 'shell'     // ogive artillery/tank shell
  | 'finned'    // mortar bomb, aircraft bomb, torpedo
  | 'sphere'    // cannonball, sling stone, grenade body
  | 'shaft';    // arrow, bolt, ballista bolt

/** Everything about one kind, measured once. */
export interface AmmoSpec {
  /** Projectile diameter, metres. The number everything else is scaled from. */
  calibre: number;
  /** Overall length of the complete round, metres. */
  length: number;
  /** Mass of the complete round, kilograms. */
  mass: number;
  /**
   * Muzzle velocity, m/s. Zero for anything not launched from a barrel — a
   * bomb is dropped, a grenade is thrown, a depth charge is rolled. A game
   * reading zero here is being told "you supply the launch", which is the
   * honest answer rather than a made-up number.
   */
  muzzle: number;
  case: CaseKind;
  head: HeadKind;
  /** How many fit in one standard container of the kind below. */
  perContainer: number;
  /** Which ready-state container this kind actually ships in. */
  container: 'magazine' | 'belt' | 'quiver' | 'rack' | 'box';
  /** Tracer / body colour, for both the model and the projectile. */
  color: number;
  label: string;
}

/**
 * The table.
 *
 * Real calibres and real masses, because the whole value of deriving the
 * containers is lost if the source numbers are invented: a 12.7 mm belt is
 * supposed to look punishing next to a 5.56 mm one, and it only does if the
 * two are actually 12.7 and 5.56.
 *
 * Muzzle velocities are the honest ones too — an APFSDS dart really does
 * leave a tank gun at 1750 m/s, and a game that gives it 300 because that
 * looked nice in the editor has thrown away the only reason to have a table.
 */
export const AMMO: Record<AmmoKind, AmmoSpec> = {
  pistol: {
    calibre: 0.009, length: 0.0295, mass: 0.012, muzzle: 375,
    case: 'brass', head: 'ball', perContainer: 15, container: 'magazine',
    color: 0xc9a227, label: '9×19 mm pistol',
  },
  rifle: {
    calibre: 0.00556, length: 0.0575, mass: 0.012, muzzle: 920,
    case: 'brass', head: 'spitzer', perContainer: 30, container: 'magazine',
    color: 0xc9a227, label: '5.56×45 mm rifle',
  },
  shotgun: {
    calibre: 0.01852, length: 0.0700, mass: 0.045, muzzle: 400,
    case: 'plastic', head: 'shot', perContainer: 8, container: 'magazine',
    color: 0xb03a2e, label: '12-gauge shell',
  },
  'heavy-mg': {
    calibre: 0.0127, length: 0.1384, mass: 0.117, muzzle: 890,
    case: 'brass', head: 'spitzer', perContainer: 100, container: 'belt',
    color: 0xb8952f, label: '12.7×99 mm heavy MG',
  },
  autocannon: {
    calibre: 0.030, length: 0.290, mass: 0.84, muzzle: 1080,
    case: 'steel', head: 'shell', perContainer: 60, container: 'belt',
    color: 0x8a8f98, label: '30 mm autocannon',
  },
  tank: {
    calibre: 0.120, length: 0.982, mass: 21.0, muzzle: 1750,
    case: 'steel', head: 'dart', perContainer: 6, container: 'rack',
    color: 0x6f7680, label: '120 mm APFSDS',
  },
  artillery: {
    calibre: 0.155, length: 0.860, mass: 43.5, muzzle: 827,
    case: 'bagged', head: 'shell', perContainer: 8, container: 'rack',
    color: 0x5f6a52, label: '155 mm howitzer shell',
  },
  mortar: {
    calibre: 0.081, length: 0.480, mass: 4.2, muzzle: 260,
    case: 'none', head: 'finned', perContainer: 6, container: 'box',
    color: 0x4f5b45, label: '81 mm mortar bomb',
  },
  rocket: {
    calibre: 0.070, length: 1.060, mass: 11.0, muzzle: 700,
    case: 'none', head: 'finned', perContainer: 19, container: 'rack',
    color: 0x6b6f5c, label: '70 mm folding-fin rocket',
  },
  missile: {
    calibre: 0.178, length: 2.870, mass: 86.0, muzzle: 0,
    case: 'none', head: 'finned', perContainer: 4, container: 'rack',
    color: 0xd8d5cc, label: 'air-to-air missile',
  },
  bomb: {
    calibre: 0.273, length: 2.210, mass: 227.0, muzzle: 0,
    case: 'none', head: 'finned', perContainer: 6, container: 'rack',
    color: 0x5c6b52, label: '500 lb general-purpose bomb',
  },
  torpedo: {
    calibre: 0.533, length: 6.400, mass: 1600.0, muzzle: 0,
    case: 'none', head: 'finned', perContainer: 4, container: 'rack',
    color: 0x3f4a52, label: '533 mm heavyweight torpedo',
  },
  'depth-charge': {
    calibre: 0.450, length: 0.710, mass: 190.0, muzzle: 0,
    case: 'none', head: 'shell', perContainer: 8, container: 'rack',
    color: 0x39434a, label: 'depth charge',
  },
  grenade: {
    calibre: 0.058, length: 0.099, mass: 0.4, muzzle: 0,
    case: 'none', head: 'sphere', perContainer: 6, container: 'box',
    color: 0x4a5340, label: 'fragmentation grenade',
  },
  arrow: {
    calibre: 0.008, length: 0.750, mass: 0.030, muzzle: 55,
    case: 'none', head: 'shaft', perContainer: 24, container: 'quiver',
    color: 0x8a6a43, label: 'arrow',
  },
  bolt: {
    calibre: 0.009, length: 0.330, mass: 0.055, muzzle: 90,
    case: 'none', head: 'shaft', perContainer: 18, container: 'quiver',
    color: 0x7d6039, label: 'crossbow bolt',
  },
  sling: {
    calibre: 0.035, length: 0.035, mass: 0.050, muzzle: 40,
    case: 'none', head: 'sphere', perContainer: 20, container: 'box',
    color: 0x8c8878, label: 'sling stone',
  },
  cannonball: {
    calibre: 0.110, length: 0.110, mass: 5.4, muzzle: 340,
    case: 'none', head: 'sphere', perContainer: 12, container: 'rack',
    color: 0x3a3d42, label: 'round shot',
  },
  ballista: {
    calibre: 0.030, length: 1.300, mass: 1.1, muzzle: 90,
    case: 'none', head: 'shaft', perContainer: 10, container: 'quiver',
    color: 0x6f5a3a, label: 'ballista bolt',
  },
};

/**
 * What a projectile system needs, from the same table that shaped the model.
 *
 * Structurally what GAMA's `Projectiles` options and `fire()` want, and
 * deliberately not an import of them — the trilogy composes on shapes, not
 * packages. A game that never draws a single round can still use this to make
 * its shots behave like the calibre it claims they are.
 */
export interface Ballistics {
  /** Muzzle velocity, m/s. Zero means this is not launched from a barrel. */
  speed: number;
  /** Downward pull to fly it under, m/s². */
  gravity: number;
  /** A sensible tracer radius: visible, and proportional to the calibre. */
  size: number;
  color: number;
  mass: number;
  /** Rounds in one full standard container. */
  perContainer: number;
}

/**
 * Ballistics for a kind.
 *
 * `gravity` is the interesting one. Everything unpowered gets 9.81 — a bullet
 * drops exactly as hard as a cannonball does, and pretending otherwise is the
 * single most common lie in game ballistics. What differs is TIME OF FLIGHT,
 * and that falls out of `speed` on its own. Powered rounds are the exception
 * and get a reduced figure, because a rocket under thrust genuinely does not
 * fall like a stone; a missile with its own guidance gets zero, since whatever
 * flies it owns its path.
 */
export function ballisticsOf(kind: AmmoKind): Ballistics {
  const spec = AMMO[kind];
  const powered = kind === 'rocket' || kind === 'missile' || kind === 'torpedo';
  return {
    speed: spec.muzzle,
    gravity: kind === 'missile' || kind === 'torpedo' ? 0 : powered ? 3.2 : 9.81,
    // Real calibres are millimetres and a true-to-life 5.56 mm tracer is one
    // pixel at any useful range, so a floor is needed. It has to be a floor
    // PLUS a proportion, not a `Math.max` of the two: a max flattens every
    // small arm in the set to exactly the same size, which is the whole range
    // a player is ever asked to tell apart. Written as a max first, and the
    // test that says a 12.7 draws bigger than a 5.56 caught it — the comment
    // claimed the behaviour the code did not have.
    size: 0.05 + spec.calibre * 0.6,
    color: spec.color,
    mass: spec.mass,
    perContainer: spec.perContainer,
  };
}

/** A one-line description, for editors, tooltips and debug overlays. */
export function describeAmmo(kind: AmmoKind): string {
  const s = AMMO[kind];
  const v = s.muzzle > 0 ? `${s.muzzle} m/s` : 'not gun-launched';
  return `${s.label} — ${(s.calibre * 1000).toFixed(1)} mm, ${s.mass} kg, ${v}, ${s.perContainer} per ${s.container}`;
}

// ── materials ────────────────────────────────────────────────────────────
// One cache per (kind, role). Two magazines of the same calibre share every
// material they have; the geometry gate counts distinct material OBJECTS, and
// a set this size would otherwise allocate hundreds of identical ones.

const materials = new Map<string, MeshStandardMaterial>();
const shared = (key: string, make: () => MeshStandardMaterial): MeshStandardMaterial => {
  let m = materials.get(key);
  if (!m) {
    m = make();
    materials.set(key, m);
  }
  return m;
};

const CASE_COLOR: Record<CaseKind, number> = {
  brass: 0xc9a227,
  steel: 0x8a8f98,
  plastic: 0xb03a2e,
  bagged: 0xd8d2bd,
  none: 0x6f7680,
};

const caseMaterial = (c: CaseKind): MeshStandardMaterial =>
  shared(`case:${c}`, () =>
    new MeshStandardMaterial({
      color: CASE_COLOR[c],
      // Brass and steel are the only genuinely specular things here. A cloth
      // powder bag and a plastic hull are not, and giving all five the same
      // finish is what makes a set like this read as one grey mass.
      metalness: c === 'brass' || c === 'steel' ? 0.85 : 0.05,
      roughness: c === 'brass' ? 0.28 : c === 'steel' ? 0.38 : c === 'bagged' ? 0.92 : 0.7,
    })
  );

const bodyMaterial = (kind: AmmoKind): MeshStandardMaterial =>
  shared(`body:${kind}`, () =>
    new MeshStandardMaterial({
      color: AMMO[kind].color,
      metalness: AMMO[kind].head === 'shaft' ? 0.05 : 0.55,
      roughness: AMMO[kind].head === 'shaft' ? 0.85 : 0.5,
    })
  );

const TIP = 0xb5651d; // copper jacket / driving band
const tipMaterial = (): MeshStandardMaterial =>
  shared('tip', () => new MeshStandardMaterial({ color: TIP, metalness: 0.8, roughness: 0.35 }));

const steelMaterial = (): MeshStandardMaterial =>
  shared('steel', () => new MeshStandardMaterial({ color: 0x55595f, metalness: 0.8, roughness: 0.45 }));

const fletchMaterial = (): MeshStandardMaterial =>
  shared('fletch', () => new MeshStandardMaterial({ color: 0xd8d4c8, metalness: 0, roughness: 0.95 }));

// ── the round itself ─────────────────────────────────────────────────────

/**
 * The parts of one round, as geometry and a material, in Z-forward layout.
 *
 * Returned as parts rather than a mesh because EVERY container needs them
 * instanced: a belt draws its hundred rounds as one InstancedMesh per part,
 * and it can only do that if the parts are separable and shared. Building a
 * round as a finished `Group` and cloning it per link is the version of this
 * module that the geometry gate rejects.
 */
interface RoundParts {
  geometry: BufferGeometry;
  material: Material;
  /** Offset along +Z from the round's base. */
  z: number;
  /** Rotation to apply, if the part is not a Z-aligned cylinder. */
  tilt?: Quaternion;
}

const geometries = new Map<string, BufferGeometry>();
const geo = <T extends BufferGeometry>(key: string, make: () => T): T => {
  let g = geometries.get(key) as T | undefined;
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g;
};

/** Z-forward: `CylinderGeometry` builds along Y, so everything is tipped. */
const LIE = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);

function roundParts(kind: AmmoKind): RoundParts[] {
  const s = AMMO[kind];
  const r = s.calibre / 2;
  const L = s.length;
  const parts: RoundParts[] = [];
  const seg = s.calibre > 0.05 ? 12 : 8;

  switch (s.head) {
    case 'spitzer':
    case 'ball': {
      // Case, then the shoulder, then the bullet. The case is most of the
      // length of a rifle round and almost none of a pistol round, which is
      // the whole visual difference between the two.
      const caseLen = kind === 'pistol' ? L * 0.64 : L * 0.72;
      const bulletLen = L - caseLen;
      parts.push({
        geometry: geo(`case:${kind}`, () => new CylinderGeometry(r * 1.08, r * 1.14, caseLen, seg)),
        material: caseMaterial(s.case),
        z: caseLen / 2,
        tilt: LIE,
      });
      parts.push({
        geometry: geo(`bullet:${kind}`, () =>
          s.head === 'spitzer'
            ? new ConeGeometry(r, bulletLen, seg)
            : new CylinderGeometry(r * 0.72, r, bulletLen, seg)
        ),
        material: tipMaterial(),
        z: caseLen + bulletLen / 2,
        tilt: LIE,
      });
      break;
    }
    case 'shot': {
      // A hull and a brass head — the two-tone that makes a shotgun shell
      // instantly recognisable at any distance.
      const headLen = L * 0.16;
      parts.push({
        geometry: geo(`hull:${kind}`, () => new CylinderGeometry(r, r, L - headLen, seg)),
        material: caseMaterial('plastic'),
        z: headLen + (L - headLen) / 2,
        tilt: LIE,
      });
      parts.push({
        geometry: geo(`shead:${kind}`, () => new CylinderGeometry(r * 1.05, r * 1.05, headLen, seg)),
        material: caseMaterial('brass'),
        z: headLen / 2,
        tilt: LIE,
      });
      break;
    }
    case 'dart': {
      // A big case with a thin sub-calibre dart in it. The dart being much
      // narrower than the bore is the entire point of the round and the only
      // thing that tells it apart from a shell.
      const caseLen = L * 0.62;
      parts.push({
        geometry: geo(`case:${kind}`, () => new CylinderGeometry(r * 0.98, r, caseLen, seg)),
        material: caseMaterial(s.case),
        z: caseLen / 2,
        tilt: LIE,
      });
      parts.push({
        geometry: geo(`dart:${kind}`, () => new CylinderGeometry(r * 0.22, r * 0.26, L - caseLen, seg)),
        material: steelMaterial(),
        z: caseLen + (L - caseLen) / 2,
        tilt: LIE,
      });
      parts.push({
        geometry: geo(`darttip:${kind}`, () => new ConeGeometry(r * 0.22, L * 0.09, seg)),
        material: steelMaterial(),
        z: L + L * 0.045,
        tilt: LIE,
      });
      break;
    }
    case 'shell': {
      const bodyLen = L * 0.72;
      parts.push({
        geometry: geo(`sbody:${kind}`, () => new CylinderGeometry(r, r, bodyLen, seg)),
        material: bodyMaterial(kind),
        z: bodyLen / 2,
        tilt: LIE,
      });
      parts.push({
        geometry: geo(`sogive:${kind}`, () => new ConeGeometry(r, L - bodyLen, seg)),
        material: bodyMaterial(kind),
        z: bodyLen + (L - bodyLen) / 2,
        tilt: LIE,
      });
      // The driving band: a copper ring near the base. It is 3 mm of geometry
      // and it is the difference between "a shell" and "a grey cylinder".
      parts.push({
        geometry: geo(`band:${kind}`, () => new CylinderGeometry(r * 1.06, r * 1.06, L * 0.045, seg)),
        material: tipMaterial(),
        z: bodyLen * 0.18,
        tilt: LIE,
      });
      break;
    }
    case 'finned': {
      const bodyLen = L * 0.66;
      const noseLen = L * 0.2;
      parts.push({
        geometry: geo(`fbody:${kind}`, () => new CylinderGeometry(r, r, bodyLen, seg)),
        material: bodyMaterial(kind),
        z: L - bodyLen / 2 - noseLen,
        tilt: LIE,
      });
      parts.push({
        geometry: geo(`fnose:${kind}`, () => new ConeGeometry(r, noseLen, seg)),
        material: bodyMaterial(kind),
        z: L - noseLen / 2,
        tilt: LIE,
      });
      // Four fins at the tail, as one cross-shaped part so the instancing
      // stays at one draw rather than four.
      parts.push({
        geometry: geo(`fins:${kind}`, () => new BoxGeometry(r * 2.6, r * 0.12, L * 0.16)),
        material: steelMaterial(),
        z: L * 0.09,
      });
      parts.push({
        geometry: geo(`finsB:${kind}`, () => new BoxGeometry(r * 0.12, r * 2.6, L * 0.16)),
        material: steelMaterial(),
        z: L * 0.09,
      });
      break;
    }
    case 'sphere': {
      parts.push({
        geometry: geo(`ball:${kind}`, () => new SphereGeometry(r, seg, Math.max(6, seg - 2))),
        material: bodyMaterial(kind),
        z: r,
      });
      if (kind === 'grenade') {
        // The spoon and the ring. Without them a grenade is a pebble.
        parts.push({
          geometry: geo('spoon', () => new BoxGeometry(r * 0.3, r * 0.16, r * 1.8)),
          material: steelMaterial(),
          z: r,
        });
      }
      break;
    }
    case 'shaft': {
      const shaftLen = L * 0.86;
      parts.push({
        geometry: geo(`shaft:${kind}`, () => new CylinderGeometry(r * 0.5, r * 0.5, shaftLen, 6)),
        material: bodyMaterial(kind),
        z: shaftLen / 2,
        tilt: LIE,
      });
      parts.push({
        geometry: geo(`head:${kind}`, () => new ConeGeometry(r, L * 0.1, 6)),
        material: steelMaterial(),
        z: shaftLen + L * 0.05,
        tilt: LIE,
      });
      // Fletching. A crossbow bolt and a ballista bolt have it too — they are
      // not miniature spears, they are short arrows.
      parts.push({
        geometry: geo(`fletch:${kind}`, () => new BoxGeometry(r * 2.4, r * 0.1, L * 0.13)),
        material: fletchMaterial(),
        z: L * 0.08,
      });
      break;
    }
  }
  return parts;
}

/** Triangles in one round, for anyone budgeting a container. */
export function roundTriangles(kind: AmmoKind): number {
  return roundParts(kind).reduce((n, p) => n + (p.geometry.index?.count ?? 0) / 3, 0);
}

// ── the four states ──────────────────────────────────────────────────────

export interface RoundOptions {
  seed?: number;
  /** Scale the whole round. Real calibres are small; a HUD wants them bigger. */
  scale?: number;
}

/**
 * One round, `Holdable` and `Prop`.
 *
 * Laid out along +Z with its base at the origin, so a game can point it the
 * way it is going without an offset, and ANIMA's `Carry` can hold it.
 */
export interface Round extends Prop {
  kind: AmmoKind;
  /** ANIMA's `Holdable` carry style — small rounds go in one hand. */
  carry: 'side' | 'crate';
  /** Length along +Z, after scale. */
  length: number;
  ballistics: Ballistics;
}

export function createRound(kind: AmmoKind, options: RoundOptions = {}): Round {
  const scale = options.scale ?? 1;
  const group = new Group();
  group.name = `round-${kind}`;
  const parts = roundParts(kind);
  for (const part of parts) {
    const mesh = new Mesh(part.geometry, part.material);
    mesh.position.z = part.z;
    if (part.tilt) mesh.quaternion.copy(part.tilt);
    mesh.castShadow = true;
    group.add(mesh);
  }
  group.scale.setScalar(scale);
  const s = AMMO[kind];
  return {
    object: group,
    kind,
    // A torpedo is not going in anybody's hand. The threshold is the same one
    // ANIMA uses to decide a two-handed carry, expressed here in metres of
    // round rather than as a guess per kind.
    carry: s.length > 0.6 || s.mass > 12 ? 'crate' : 'side',
    length: s.length * scale,
    obstacleRadius: s.length > 1 ? (s.length * scale) / 2 : 0,
    ballistics: ballisticsOf(kind),
  };
}

/**
 * Anything holding a countable number of rounds.
 *
 * A magazine, a belt, a quiver and a shell rack are the same object as far as
 * a game is concerned: they hold N of something, N goes down, and the model
 * has to show it. One interface, so a HUD or a reload routine written against
 * a rifle magazine works on a howitzer's ready rack without knowing.
 */
export interface Countable extends Prop {
  kind: AmmoKind;
  readonly capacity: number;
  readonly count: number;
  /** Show `n` rounds. Clamped to `[0, capacity]`. Returns the count set. */
  setCount(n: number): number;
  /** Take one. Returns whether there was one to take. */
  consume(): boolean;
}

/**
 * Lay out `capacity` rounds and be able to hide any suffix of them.
 *
 * The one piece of machinery every container shares. Each part of the round
 * becomes one `InstancedMesh` of `capacity` instances; hiding a round means
 * writing a zero-scale matrix, so the draw count never changes and neither
 * does the allocation. `setCount` is a matrix write and an
 * `instanceMatrix.needsUpdate`, which is why a belt can empty every frame.
 */
function stack(
  parent: Group,
  kind: AmmoKind,
  capacity: number,
  place: (i: number, out: Object3D) => void
): (n: number) => void {
  const parts = roundParts(kind);
  const meshes: InstancedMesh[] = [];
  for (const part of parts) {
    const im = new InstancedMesh(part.geometry, part.material, Math.max(1, capacity));
    im.frustumCulled = false;
    im.castShadow = true;
    parent.add(im);
    meshes.push(im);
  }
  const slot = new Object3D();
  const partNode = new Object3D();
  const hidden = new Matrix4().makeScale(0, 0, 0);
  // Scratch, not a clone per part per round. `setCount` runs on every shot
  // fired; a 100-link belt of three-part rounds allocating a Matrix4 each
  // would be 300 objects a trigger pull, which is a garbage collector's
  // problem in exactly the frame a player is looking at.
  const composed = new Matrix4();
  const write = (n: number): void => {
    for (let i = 0; i < capacity; i++) {
      const on = i < n;
      slot.position.set(0, 0, 0);
      // `.rotation`, not `.quaternion` — a placer that sets a single Euler
      // axis (`out.rotation.z = …`, which the belt does) leaves the other two
      // holding the PREVIOUS round's values, and the Euler's onChange writes
      // all three back into the quaternion. Resetting the quaternion alone
      // looks like it clears the pose and does not.
      slot.rotation.set(0, 0, 0);
      slot.scale.setScalar(1);
      if (on) place(i, slot);
      slot.updateMatrix();
      for (let p = 0; p < parts.length; p++) {
        if (!on) {
          meshes[p].setMatrixAt(i, hidden);
          continue;
        }
        partNode.position.set(0, 0, parts[p].z);
        if (parts[p].tilt) partNode.quaternion.copy(parts[p].tilt!);
        else partNode.quaternion.identity();
        partNode.scale.setScalar(1);
        partNode.updateMatrix();
        meshes[p].setMatrixAt(i, composed.copy(slot.matrix).multiply(partNode.matrix));
      }
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  };
  return write;
}

/** Wrap a layout into the `Countable` contract. */
function countable(
  group: Group,
  kind: AmmoKind,
  capacity: number,
  write: (n: number) => void,
  obstacleRadius: number,
  start: number
): Countable {
  let count = Math.max(0, Math.min(capacity, start));
  write(count);
  return {
    object: group,
    kind,
    capacity,
    get count() {
      return count;
    },
    setCount(n: number) {
      const next = Math.max(0, Math.min(capacity, Math.round(n)));
      if (next !== count) {
        count = next;
        write(count);
      }
      return count;
    },
    consume() {
      if (count <= 0) return false;
      count--;
      write(count);
      return true;
    },
    obstacleRadius,
  };
}

export interface ContainerOptions {
  seed?: number;
  /** How many rounds to start with. Default: full. */
  count?: number;
  /** Override the container's capacity. Default: the kind's `perContainer`. */
  capacity?: number;
  scale?: number;
}

/**
 * A box magazine — the small-arms one, rounds staggered in a column.
 *
 * The body is sized from the rounds rather than the other way round: a
 * 30-round 5.56 magazine and an 8-round 12-gauge tube come out visibly
 * different because their contents are, and neither was drawn by hand.
 */
export function createMagazine(kind: AmmoKind, options: ContainerOptions = {}): Countable {
  const s = AMMO[kind];
  const capacity = options.capacity ?? s.perContainer;
  const scale = options.scale ?? 1;
  const group = new Group();
  group.name = `magazine-${kind}`;

  const pitch = s.calibre * 1.16;
  const stackHeight = pitch * Math.ceil(capacity / 2) + s.calibre;
  const shell = new Mesh(
    geo(`magshell:${kind}:${capacity}`, () =>
      new BoxGeometry(s.calibre * 1.5, stackHeight, s.length * 1.06)
    ),
    steelMaterial()
  );
  shell.position.y = stackHeight / 2 - stackHeight;
  shell.castShadow = true;
  group.add(shell);

  // Rounds ride nose-forward in a double stack, alternating side to side.
  const write = stack(group, kind, capacity, (i, out) => {
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    out.position.set(side * s.calibre * 0.22, -row * pitch, -s.length / 2);
  });

  group.scale.setScalar(scale);
  return countable(group, kind, capacity, write, s.length * 0.5 * scale, options.count ?? capacity);
}

export interface BeltOptions extends ContainerOptions {
  /** Curve the belt into a hanging catenary. Default true. */
  drape?: boolean;
}

/**
 * A linked belt — machine-gun and autocannon feed.
 *
 * The link pitch is the case head diameter, so a 12.7 mm belt is genuinely
 * 40% coarser than a 5.56 one. `setCount` feeds it: rounds disappear from the
 * front, which is the direction a belt actually empties.
 */
export function createBelt(kind: AmmoKind, options: BeltOptions = {}): Countable {
  const s = AMMO[kind];
  const capacity = options.capacity ?? s.perContainer;
  const scale = options.scale ?? 1;
  const drape = options.drape ?? true;
  const group = new Group();
  group.name = `belt-${kind}`;

  const pitch = s.calibre * 1.35;
  const span = pitch * capacity;
  // A hanging belt is a catenary, and a straight one is the tell that an
  // ammunition set was drawn rather than laid out. Approximated as a
  // parabola, which is indistinguishable over this span and far cheaper.
  const sag = drape ? span * 0.16 : 0;
  const at = (i: number): { x: number; y: number; slope: number } => {
    const u = capacity <= 1 ? 0 : (i / (capacity - 1)) * 2 - 1; // -1..1
    return { x: (u * span) / 2, y: -sag * (1 - u * u), slope: drape ? 2 * sag * u / (span / 2) : 0 };
  };

  const write = stack(group, kind, capacity, (i, out) => {
    const p = at(i);
    out.position.set(p.x, p.y, -s.length / 2);
    // Rounds hang perpendicular to the belt, so they fan out around the
    // curve. A belt whose rounds all point the same way looks like a comb.
    out.rotation.z = Math.atan(p.slope);
  });

  // The links themselves — one instanced mesh, sharing the belt's own layout.
  const linkGeo = geo(`link:${kind}`, () =>
    new BoxGeometry(pitch * 0.92, s.calibre * 0.9, s.calibre * 0.55)
  );
  const links = new InstancedMesh(linkGeo, steelMaterial(), Math.max(1, capacity));
  links.frustumCulled = false;
  group.add(links);
  const node = new Object3D();
  const hidden = new Matrix4().makeScale(0, 0, 0);
  const writeLinks = (n: number): void => {
    for (let i = 0; i < capacity; i++) {
      if (i >= n) {
        links.setMatrixAt(i, hidden);
        continue;
      }
      const p = at(i);
      node.position.set(p.x, p.y, 0);
      node.rotation.set(0, 0, Math.atan(p.slope));
      node.scale.setScalar(1);
      node.updateMatrix();
      links.setMatrixAt(i, node.matrix);
    }
    links.instanceMatrix.needsUpdate = true;
  };

  const both = (n: number): void => {
    write(n);
    writeLinks(n);
  };
  group.scale.setScalar(scale);
  return countable(group, kind, capacity, both, (span / 2) * scale, options.count ?? capacity);
}

/**
 * A quiver — arrows, bolts, ballista shafts, nocks up.
 *
 * The only container whose rounds stand vertically, and the only one where
 * the count is read at a glance from outside, which is why archers count them
 * and riflemen do not.
 */
export function createQuiver(kind: AmmoKind, options: ContainerOptions = {}): Countable {
  const s = AMMO[kind];
  const capacity = options.capacity ?? s.perContainer;
  const scale = options.scale ?? 1;
  const rng = new Rng(options.seed ?? 3);
  const group = new Group();
  group.name = `quiver-${kind}`;

  const radius = s.calibre * 3.4;
  const bodyH = s.length * 0.45;
  const body = new Mesh(
    geo(`quivbody:${kind}`, () => new CylinderGeometry(radius, radius * 0.86, bodyH, 12, 1, true)),
    createSurface('leather', { seed: options.seed ?? 3 })
  );
  body.position.y = bodyH / 2;
  body.castShadow = true;
  group.add(body);

  // Shafts splay outward slightly, and each gets its own small lean — a
  // bundle of parallel sticks reads as a bundle of sticks.
  const leans = Array.from({ length: capacity }, () => ({
    a: rng.range(0, Math.PI * 2),
    r: rng.range(0.25, 0.95),
    tilt: rng.range(0.02, 0.09),
  }));
  const write = stack(group, kind, capacity, (i, out) => {
    const l = leans[i];
    out.position.set(Math.cos(l.a) * radius * l.r * 0.7, 0, Math.sin(l.a) * radius * l.r * 0.7);
    // Built along +Z; stand it up, then lean it out from the quiver's axis.
    out.rotation.set(-Math.PI / 2 + l.tilt * Math.sin(l.a), l.tilt * Math.cos(l.a), 0);
  });

  group.scale.setScalar(scale);
  return countable(group, kind, capacity, write, radius * scale, options.count ?? capacity);
}

export interface RackOptions extends ContainerOptions {
  /** Rounds per row. Default: the square-ish arrangement. */
  perRow?: number;
}

/**
 * A ready rack — artillery shells stood on end, bombs on a trolley, torpedoes
 * in a cradle, round shot in a pyramid frame.
 *
 * The heavy end of the set, and the one a game actually walks past. Rounds
 * stand or lie according to what the real thing does: a 155 mm shell stands,
 * a torpedo does not, and the rule is the round's own aspect ratio rather
 * than a per-kind flag.
 */
export function createRack(kind: AmmoKind, options: RackOptions = {}): Countable {
  const s = AMMO[kind];
  const capacity = options.capacity ?? s.perContainer;
  const scale = options.scale ?? 1;
  const group = new Group();
  group.name = `rack-${kind}`;

  // Slender and short enough to stand on its base; otherwise it lies down.
  const stands = s.length / s.calibre < 7 && s.length < 1.2;
  const cell = stands ? s.calibre * 1.5 : s.calibre * 1.7;
  const perRow = options.perRow ?? Math.max(1, Math.ceil(Math.sqrt(capacity)));
  const rows = Math.ceil(capacity / perRow);
  const w = perRow * cell;
  const d = stands ? rows * cell : s.length * 1.05;

  const frame = new Mesh(
    geo(`rackframe:${kind}:${capacity}`, () => new BoxGeometry(w, s.calibre * 0.5, d)),
    createSurface('wood', { seed: options.seed ?? 5 })
  );
  frame.position.y = -s.calibre * 0.25;
  frame.receiveShadow = true;
  group.add(frame);

  const write = stack(group, kind, capacity, (i, out) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = (col - (perRow - 1) / 2) * cell;
    if (stands) {
      out.position.set(x, 0, (row - (rows - 1) / 2) * cell);
      out.rotation.x = -Math.PI / 2; // +Z round, stood upright
    } else {
      // Lying rounds stack in tiers, nested into the gaps of the tier below.
      const tier = row;
      const inset = tier % 2 === 1 ? cell / 2 : 0;
      out.position.set(x + inset, s.calibre / 2 + tier * s.calibre * 0.92, -s.length / 2);
    }
  });

  group.scale.setScalar(scale);
  return countable(
    group,
    kind,
    capacity,
    write,
    Math.max(w, d) * 0.5 * scale,
    options.count ?? capacity
  );
}

export interface AmmoBoxOptions extends ContainerOptions {
  /** Lid open, rounds visible. Default false. */
  open?: boolean;
}

/**
 * The stored state — a crate with its lid on, or off and full of rounds.
 *
 * Closed it is a box and costs almost nothing; open it is the same box with
 * its contents instanced inside. `open` is a build-time choice rather than a
 * method because a sealed crate should not pay for geometry nobody can see,
 * and a level has a hundred of them.
 */
export function createAmmoBox(kind: AmmoKind, options: AmmoBoxOptions = {}): Countable {
  const s = AMMO[kind];
  const capacity = options.capacity ?? s.perContainer * 2;
  const open = options.open ?? false;
  const scale = options.scale ?? 1;
  const group = new Group();
  group.name = `ammobox-${kind}`;

  const perRow = Math.max(1, Math.ceil(Math.sqrt(capacity)));
  const rows = Math.ceil(capacity / perRow);
  const inner = { x: perRow * s.calibre * 1.3, y: s.calibre * 1.4, z: s.length * 1.1 };
  const wall = Math.max(0.006, s.calibre * 0.18);
  const outer = { x: inner.x + wall * 2, y: inner.y * rows + wall * 2, z: inner.z + wall * 2 };

  const crate = createSurface('wood', { seed: options.seed ?? 7 });
  const shellMesh = new Mesh(
    geo(`boxshell:${kind}:${capacity}`, () => new BoxGeometry(outer.x, outer.y, outer.z)),
    crate
  );
  shellMesh.position.y = outer.y / 2;
  shellMesh.castShadow = true;
  shellMesh.receiveShadow = true;
  group.add(shellMesh);

  if (!open) {
    // Sealed: one box, no contents, and `setCount` is honest about it — the
    // rounds are in there, you just cannot see them.
    return {
      object: group,
      kind,
      capacity,
      count: capacity,
      setCount: () => capacity,
      consume: () => true,
      obstacleRadius: Math.max(outer.x, outer.z) * 0.5 * scale,
    };
  }

  // Open: hollow it by insetting the contents, and tip the lid back.
  const lid = new Mesh(
    geo(`boxlid:${kind}:${capacity}`, () => new BoxGeometry(outer.x, wall, outer.z)),
    crate
  );
  lid.position.set(0, outer.y, -outer.z / 2 - outer.z * 0.34);
  lid.rotation.x = -1.15;
  group.add(lid);

  const write = stack(group, kind, capacity, (i, out) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    out.position.set(
      (col - (perRow - 1) / 2) * s.calibre * 1.3,
      wall + s.calibre * 0.7 + row * inner.y,
      -s.length / 2
    );
  });

  group.scale.setScalar(scale);
  return countable(
    group,
    kind,
    capacity,
    write,
    Math.max(outer.x, outer.z) * 0.5 * scale,
    options.count ?? capacity
  );
}

export interface CasingOptions {
  seed?: number;
  /** How many to scatter. Default 24. */
  count?: number;
  /** Radius of the scatter, metres. Default 0.6. */
  spread?: number;
  scale?: number;
}

/**
 * The spent state — a litter of empty cases where somebody stood.
 *
 * A whole scatter rather than one case, because one spent case is invisible
 * and a hundred of them is a story: this is where the gunner was. Ejected
 * brass lands on its side, in a loose cone off to the shooter's right, which
 * is what the scatter is shaped like.
 *
 * Kinds with no case — a mortar bomb, an arrow, a grenade — have nothing to
 * eject, and this returns an empty prop for them rather than inventing litter.
 */
export function createCasing(kind: AmmoKind, options: CasingOptions = {}): Prop {
  const s = AMMO[kind];
  const group = new Group();
  group.name = `casings-${kind}`;
  if (s.case === 'none' || s.case === 'bagged') {
    return { object: group, obstacleRadius: 0 };
  }

  const count = options.count ?? 24;
  const spread = options.spread ?? 0.6;
  const scale = options.scale ?? 1;
  const rng = new Rng(options.seed ?? 11);
  const r = s.calibre / 2;
  const caseLen = s.length * (s.head === 'shot' ? 0.84 : 0.7);

  // The case only — a fired round has no bullet in it. Getting that wrong is
  // the most common mistake in a scattered-brass prop, and it reads instantly
  // to anyone who has seen a range floor.
  const empty = geo(`empty:${kind}`, () => new CylinderGeometry(r * 1.08, r * 1.14, caseLen, 8));
  const mesh = new InstancedMesh(empty, caseMaterial(s.case), count);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  const node = new Object3D();
  for (let i = 0; i < count; i++) {
    // Off to one side and forward, denser near the shooter.
    const a = rng.range(-0.9, 0.9);
    const d = spread * Math.sqrt(rng.range(0.02, 1));
    node.position.set(Math.sin(a) * d + spread * 0.35, r * 1.1, Math.cos(a) * d * 0.6);
    // Lying down, rolled to a random angle about its own axis.
    node.rotation.set(Math.PI / 2, rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2));
    node.scale.setScalar(1);
    node.updateMatrix();
    mesh.setMatrixAt(i, node.matrix);
  }
  group.add(mesh);
  group.scale.setScalar(scale);
  return { object: group, obstacleRadius: 0 };
}

/**
 * The right ready-container for a kind, without the caller knowing which.
 *
 * `AMMO[kind].container` already says whether a kind belts, magazines,
 * quivers, racks or boxes, so a level that just wants "some ready ammunition
 * for this weapon" should not have to switch on it. This is that switch,
 * written once.
 */
export function createReady(kind: AmmoKind, options: ContainerOptions = {}): Countable {
  switch (AMMO[kind].container) {
    case 'magazine':
      return createMagazine(kind, options);
    case 'belt':
      return createBelt(kind, options);
    case 'quiver':
      return createQuiver(kind, options);
    case 'rack':
      return createRack(kind, options);
    case 'box':
      return createAmmoBox(kind, { ...options, open: true });
  }
}
