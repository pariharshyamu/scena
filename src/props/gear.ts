import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { Rng } from '../core/random';
import { DEFAULT_PALETTE, type Palette } from '../core/palette';
import { createSurface } from '../materials/surface';
import { createSlot, addApproach, type Prop, type PropSlot } from '../core/types';

/**
 * Working gear — and the first load in this library that **pulls back.**
 *
 * Every other force in the boat arc acts through her centreline. A sail's
 * drive, an oar's thrust, a screw's push: all of them push her along the way
 * she is pointing, and none of them can put her on her beam ends. A working
 * load does not. It acts at a point on her deck, at the end of a wire, and the
 * further outboard and the higher that point is, the more of your own engine
 * goes into laying her over instead of moving her.
 *
 * `object` stands on her WORKING DECK: y = 0 is the planking, not the
 * waterline. Hang it off the deck it belongs to —
 * `gear.object.position.y = deck.y` — the same way a funnel is hung. Left at
 * the hull's own origin every gallows, hook and boom is a freeboard too low,
 * which is to say inside her, and the load and the wire are under the sea.
 *
 * ```ts
 * const gear = createGear({ kind: 'tow', beam: ship.beam, length: ship.length });
 * const deck = ship.decks.find((d) => d.name === 'waist')!;
 * gear.object.position.y = deck.y;
 * ship.object.add(gear.object);
 *
 * gear.shoot();
 * game.onUpdate((t) => {
 *   gear.setWay(plant.way);
 *   gear.setAngle(towAngle);         // …and this is the one that kills you
 *   gear.update(t.delta);
 *   hold.heel('gear', gear.moment);  // straight into the same arithmetic
 *   ship.update(t.delta, { speed: plant.way - gear.drag, loading: hold.loading });
 * });
 * ```
 *
 * ## The wire comes abeam and the boat is gone
 *
 * A tug tows from a hook near her own centre of turning, as low as she can get
 * it, and she is still lost if the line comes across her. It is called
 * **girting**: the tow's weight comes on the quarter, the pull is behind her
 * pivot so her rudder cannot bring her back, and she goes over. Every tug ever
 * built has a way of letting the wire go *instantly*, and that is the only
 * reason there is a `slip()` on this object.
 *
 * ```ts
 * gear.girting;   // true, and you have seconds
 * gear.slip();    // a tow hook lets go NOW. A derrick cannot let go at all.
 * ```
 *
 * ## How fast you can get rid of it is not a modern invention
 *
 * | kind | the load | how it kills you | letting go |
 * | --- | --- | --- | --- |
 * | `pots` | a string of pots on the rail | weight outboard, hauled by hand | drop it |
 * | `trawl` | a net towed astern | it comes fast on the bottom | knock out the block |
 * | `tow` | another vessel | it comes abeam — girting | INSTANT, by design |
 * | `derrick` | a weight in the air | it acts at the boom head the instant it lifts | you cannot |
 *
 * The axis is **how fast you can be rid of it**, and it is not monotone with
 * era: the most capable gear here is the one with no way out. A derrick's load
 * has to be put down somewhere, and putting it down takes as long as it takes.
 */
export type GearKind = 'pots' | 'trawl' | 'tow' | 'derrick';

export const GEAR_KINDS: GearKind[] = ['pots', 'trawl', 'tow', 'derrick'];

/** rest / transitioning-toward / at-target / drifting-back, on the gear. */
export type GearState = 'stowed' | 'shooting' | 'working' | 'fast';

export interface Gear extends Prop {
  kind: GearKind;
  /** Put it over the side. */
  shoot(): void;
  /** Get it back aboard. */
  haul(): void;
  /**
   * LET GO.
   *
   * The one verb on this object that exists because of a way of dying. A tow
   * hook does it in an instant; a trawl takes a few seconds to knock the block
   * out; a derrick cannot do it at all and `slip` is a no-op — the load has to
   * be **lowered**, and that no-op is the era axis.
   */
  slip(): void;
  /** 0 all inboard, 1 all the way out. It travels. */
  readonly out: number;
  readonly state: GearState;
  onState?: (state: GearState) => void;

  /** Her way through the water, m/s. The load pulls back harder the harder
   *  you drive her. */
  setWay(speed: number): void;
  readonly way: number;
  /** Where the wire lies, radians from dead astern. Positive to starboard. */
  setAngle(radians: number): void;
  readonly angle: number;
  /** For a derrick: how far outboard the boom head is swung, m. */
  setOutreach(metres: number): void;
  readonly outreach: number;
  /** For a derrick: the weight on the hook, tonnes. */
  setLoad(tonnes: number): void;

  /** Tension in the wire, tonnes. */
  readonly strain: number;
  /** What she can pull before the wire is simply dragging her backwards. */
  readonly bollardPull: number;
  /** HEELING MOMENT, tonne·metres, positive to starboard. Hand it straight to
   *  `Hold.heel`. */
  readonly moment: number;
  /** Speed the gear is costing her, m/s. */
  readonly drag: number;
  /** Where the wire leaves her, in vessel metres. THE lever arm, and the
   *  whole design of a tug is about getting it low and near her middle. */
  readonly lead: Object3D;

  /**
   * THE OTHER END PULLS. A tow sheers, a net snags a wreck, a load swings off
   * a barge in a swell — and for a few seconds the wire carries several times
   * anything she could put on it herself.
   *
   * Nothing else in this module can capsize a properly built boat. This can,
   * and it is the reason a tow hook opens.
   */
  snatch(tonnes: number): void;
  /** What the other end is adding, tonnes. Decays over a few seconds. */
  readonly surge: number;

  /** She is being pulled over by her own gear. */
  readonly girting: boolean;
  /** The load has come fast — foul of the bottom, or a tow that will not
   *  come. Strain goes to everything she has and stays there. */
  readonly fast: boolean;
  comeFast(): void;
  clear(): void;

  station: PropSlot;
  slots: PropSlot[];
  update(dt: number): void;
}

export interface GearOptions {
  kind?: GearKind;
  /** Her beam, m — the lead points are placed off it. */
  beam?: number;
  /** Her length, m. */
  length?: number;
  /** Height of her working deck above the water, m. */
  freeboard?: number;
  /** What she can pull, tonnes. Sizes everything else. */
  bollardPull?: number;
  /** Start with it over the side. */
  shot?: boolean;
  seed?: number;
  palette?: Palette;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Scratch, so placing a wire every frame allocates nothing. */
const worldQ = new Quaternion();
const tmpUp = new Vector3();
const tmpDir = new Vector3();
const tmpA = new Vector3();
const tmpB = new Vector3();

interface KindSpec {
  beam: number;
  length: number;
  freeboard: number;
  bollardPull: number;
  /** Seconds to get it over the side. */
  shootFor: number;
  /** Seconds to get it back. */
  haulFor: number;
  /** Seconds to let go. `Infinity` where there is no way to. */
  slipFor: number;
  /**
   * Does the load hang, or does it tow?
   *
   * A hanging load heels her through how far OUTBOARD it is; a towed one
   * heels her through how far ABOVE the water the lead is and how far round
   * the wire has come. They are different sums and getting them the same way
   * round is the difference between a boat that capsizes when you swing the
   * derrick and one that capsizes when you open the throttle.
   */
  hangs: boolean;
  /** Working load at rest, tonnes — a string of pots, or a tow's own drag. */
  base: number;
  /** How much the strain grows with the square of her way, t per (m/s)². */
  byWay: number;
  /** How far astern the gear streams, m, as a multiple of her length. */
  scope: number;
  /**
   * Lead point, as fractions of beam / length / freeboard.
   *
   * `leadY` is measured from the WORKING DECK, because that is where the
   * ironwork is bolted. Its height above the SEA — which is what the heeling
   * arm wants — is that plus her freeboard.
   */
  leadX: number;
  leadZ: number;
  leadY: number;
  /**
   * How deep her grip on the water is, m.
   *
   * A towed load does not heel her about the deck. The wire pulls one way at
   * the lead and the water holds the hull the other way, low down — and the
   * couple is between those two, not between the wire and the planking. Left
   * out, a tug girted right abeam heels about half as far as she really does.
   */
  resist: number;
}

const KINDS: Record<GearKind, KindSpec> = {
  pots: {
    beam: 4.2, length: 11, freeboard: 1.1, bollardPull: 1.2,
    shootFor: 30, haulFor: 90, slipFor: 1, hangs: true,
    base: 0.35, byWay: 0.02, scope: 0.4,
    // OVER THE RAIL, because that is where a man can reach. It is also the
    // worst place on the boat to put a weight, and there is nowhere else.
    leadX: 0.5, leadZ: 0.05, leadY: 1.0, resist: 0.45,
  },
  trawl: {
    beam: 7.4, length: 24, freeboard: 2.2, bollardPull: 9,
    shootFor: 120, haulFor: 300, slipFor: 8, hangs: false,
    base: 0.8, byWay: 0.9, scope: 3.5,
    // The gallows on the quarter: outboard, aft, and high enough to shoot the
    // net over. Every one of those is a lever arm.
    leadX: 0.44, leadZ: -0.36, leadY: 1.0, resist: 1.5,
  },
  tow: {
    beam: 9, length: 26, freeboard: 2.6, bollardPull: 40,
    shootFor: 60, haulFor: 180, slipFor: 0.4, hangs: false,
    base: 2.0, byWay: 1.6, scope: 6,
    // AS LOW AND AS NEAR HER MIDDLE AS IT WILL GO. A towing hook is placed
    // where it is entirely to make this number small, and she can still be
    // girted, which tells you how big the number would otherwise be.
    leadX: 0, leadZ: -0.12, leadY: 0.55, resist: 1.7,
  },
  derrick: {
    beam: 11, length: 34, freeboard: 3.0, bollardPull: 6,
    shootFor: 45, haulFor: 45, slipFor: Infinity, hangs: true,
    base: 0, byWay: 0.05, scope: 0,
    // The boom HEAD, which is high and can be swung right outboard — and a
    // weight on it acts there the instant it leaves the deck.
    leadX: 0.55, leadZ: 0.2, leadY: 2.6, resist: 2.2,
  },
};

export function createGear(options: GearOptions = {}): Gear {
  const kind = options.kind ?? 'trawl';
  const base = KINDS[kind];
  const spec: KindSpec = {
    ...base,
    beam: options.beam ?? base.beam,
    length: options.length ?? base.length,
    freeboard: options.freeboard ?? base.freeboard,
    bollardPull: options.bollardPull ?? base.bollardPull,
  };
  const seed = options.seed ?? 1;
  const rng = new Rng(seed);
  const palette = options.palette ?? DEFAULT_PALETTE;

  const group = new Group();
  group.name = `gear:${kind}`;

  const steel = createSurface('steel', { color: 0x4e5359, seed });
  const timber = createSurface('plank', { color: palette.wood, seed: seed + 1 });
  const rope = new MeshStandardMaterial({ color: 0x2b2b28, roughness: 0.95 });
  const buoyMat = new MeshStandardMaterial({
    color: 0xe0561f,
    emissive: 0x2a0c03,
    roughness: 0.6,
    flatShading: true,
  });

  const leadX = spec.leadX * spec.beam;
  const leadY = spec.leadY * spec.freeboard;
  const leadZ = spec.leadZ * spec.length;

  const lead = new Object3D();
  lead.name = 'gear:lead';
  lead.position.set(leadX, leadY, leadZ);
  group.add(lead);

  // ── geometry ─────────────────────────────────────────────────────────

  if (kind === 'trawl') {
    for (const side of [-1, 1]) {
      const gallows = new Group();
      gallows.position.set(side * leadX, 0, leadZ);
      group.add(gallows);
      for (const dz of [-0.5, 0.5]) {
        const leg = new Mesh(new CylinderGeometry(0.09, 0.11, leadY, 8), steel);
        leg.position.set(0, leadY / 2, dz);
        gallows.add(leg);
      }
      const head = new Mesh(new BoxGeometry(0.2, 0.16, 1.3), steel);
      head.position.y = leadY;
      gallows.add(head);
      const block = new Mesh(new CylinderGeometry(0.2, 0.2, 0.14, 10), steel);
      block.rotation.x = Math.PI / 2;
      block.position.y = leadY - 0.2;
      gallows.add(block);
    }
    const drum = new Mesh(new CylinderGeometry(0.7, 0.7, spec.beam * 0.6, 14), steel);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0, spec.freeboard * 0.5, leadZ + spec.length * 0.22);
    group.add(drum);
  } else if (kind === 'tow') {
    const post = new Mesh(new CylinderGeometry(0.34, 0.4, leadY, 12), steel);
    post.position.set(0, leadY / 2, leadZ);
    group.add(post);
    const hook = new Mesh(new BoxGeometry(0.5, 0.34, 0.34), steel);
    hook.position.set(0, leadY, leadZ);
    group.add(hook);
    // The BOW of the winch drum, forward of the hook.
    const drum = new Mesh(new CylinderGeometry(0.6, 0.6, spec.beam * 0.5, 14), steel);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0, spec.freeboard * 0.5, leadZ + spec.length * 0.2);
    group.add(drum);
    // …and the hoop that keeps the wire from sweeping the deck. It is what
    // makes girting a thing that takes a while rather than a thing that
    // happens the first time she sheers.
    const horns = new Mesh(new BoxGeometry(spec.beam * 0.8, 0.14, 0.14), steel);
    horns.position.set(0, leadY * 0.85, leadZ - 1.2);
    group.add(horns);
  } else if (kind === 'pots') {
    const davit = new Mesh(new CylinderGeometry(0.07, 0.08, leadY * 1.5, 8), steel);
    davit.position.set(leadX * 0.9, leadY * 0.75, leadZ);
    davit.rotation.z = -0.28;
    group.add(davit);
    const hauler = new Mesh(new CylinderGeometry(0.22, 0.22, 0.2, 12), steel);
    hauler.rotation.x = Math.PI / 2;
    hauler.position.set(leadX * 0.72, leadY * 0.55, leadZ);
    group.add(hauler);
    for (let i = 0; i < 5; i++) {
      const pot = new Mesh(new BoxGeometry(0.66, 0.42, 0.9), timber);
      pot.position.set(
        -spec.beam * 0.16 + (i % 2) * 0.75,
        0.22 + Math.floor(i / 2) * 0.44,
        leadZ - 1.6 - Math.floor(i / 2) * 0.2
      );
      pot.rotation.y = (rng.next() - 0.5) * 0.2;
      group.add(pot);
    }
  } else {
    // A derrick: a mast, a boom that swings, and a runner down to the hook.
    const mast = new Mesh(new CylinderGeometry(0.24, 0.3, leadY * 1.35, 10), steel);
    mast.position.set(0, (leadY * 1.35) / 2, leadZ);
    group.add(mast);
  }

  /** The boom, for a derrick — it swings, and where its head is IS the sum. */
  const boomY = leadY * 0.55;
  const boom = new Object3D();
  boom.name = 'gear:boom';
  boom.position.set(0, boomY, leadZ);
  if (kind === 'derrick') {
    const spar = new Mesh(new BoxGeometry(spec.beam * 0.9, 0.22, 0.22), steel);
    spar.position.x = spec.beam * 0.45;
    boom.add(spar);
    group.add(boom);
  }

  /**
   * THE WIRE. One segment, from the lead to wherever the load is.
   *
   * It is the whole read: a still frame of a working boat tells you nothing
   * unless you can see where her gear is pulling from, and the angle of that
   * wire against her heel is the entire module in one picture.
   */
  // Thick enough to EXIST. A five-centimetre wire is the honest diameter and
  // it is a sub-pixel line at any range that fits the boat in the frame, so
  // the one thing the whole module is about is invisible in every picture of
  // it. Scaled off her beam, so it stays a wire rather than a hawser.
  const wireR = Math.max(0.06, spec.beam * 0.02);
  const wire = new Mesh(new CylinderGeometry(wireR, wireR, 1, 6), rope);
  wire.name = 'gear:wire';
  group.add(wire);

  const buoyR = Math.max(0.3, spec.beam * 0.075);
  const buoy = new Mesh(new CylinderGeometry(buoyR, buoyR, buoyR * 1.8, 10), buoyMat);
  buoy.name = 'gear:load';
  group.add(buoy);

  const station = addApproach(
    createSlot('gear', 'work', group, leadX * 0.55, 0, leadZ + 1.2, Math.PI),
    group,
    0.8,
    'front'
  );

  // ── the model ────────────────────────────────────────────────────────

  let out = options.shot ? 1 : 0;
  let ordered = out > 0.5;
  let way = 0;
  let angle = 0;
  let outreach = kind === 'derrick' ? spec.beam * 0.3 : 0;
  let load = kind === 'derrick' ? 2 : 0;
  let fast = false;
  let slipping = 0;
  let surge = 0;
  let state: GearState = out > 0.5 ? 'working' : 'stowed';

  const ownStrain = (): number => {
    if (out <= 0.01) return 0;
    if (kind === 'derrick') return load;
    if (fast) {
      // COME FAST. Everything she has goes into the wire and stays there, and
      // it does not care how fast she is going, because she is not going.
      return spec.bollardPull * out;
    }
    // Towing, the strain grows with the square of her way — which is why it is
    // a thing you control with the throttle and not with the winch. But it
    // SATURATES at her bollard pull, because a boat cannot pull harder than
    // she can pull. Written as a bare square she out-pulls herself at working
    // speed, and then coming fast — which gives all of it — makes the strain
    // go DOWN, and the one event this module exists to be about becomes a
    // relief.
    const want = spec.base + spec.byWay * way * way;
    return spec.bollardPull * (1 - Math.exp(-want / spec.bollardPull)) * out;
  };

  /**
   * What is on the wire. Her own pull, plus whatever the OTHER end is doing.
   *
   * The distinction matters more than anything else here. Her own gear at its
   * absolute worst gives her a heel she can live with — that is what her beam
   * is for. What kills a tug is the tow: twenty thousand tonnes with way on it
   * sheers, and the wire takes several times her bollard pull for four
   * seconds. She has no stability answer to that and was never given one. She
   * was given a hook that opens.
   */
  const strainOf = (): number => (out <= 0.01 ? 0 : ownStrain() + surge);

  const momentOf = (): number => {
    const s = strainOf();
    if (s <= 0) return 0;
    if (spec.hangs) {
      // A HANGING LOAD acts where it hangs from — and for a derrick that is
      // the boom head, the instant the weight leaves the deck. The dangerous
      // moment of a lift is the pick-up, not the swing.
      const arm = kind === 'derrick' ? outreach : leadX;
      return s * arm;
    }
    // A TOWED LOAD heels her through the athwartships part of the pull. Dead
    // astern it does nothing whatever; abeam it does all of it — which is
    // girting.
    //
    // The arm is the whole distance from the wire to the water's grip on her:
    // the lead above the deck, the deck above the sea, and her hold on the
    // water below it. The wire pulls one way up here and the hull is held the
    // other way down there, and the couple is between those two — not between
    // the wire and the planking it is bolted to.
    return s * Math.sin(angle) * (leadY + spec.freeboard + spec.resist);
  };

  const place = (): void => {
    // Where the load is, and where the wire leaves her, in her own frame. Deck
    // is y = 0; the water is a freeboard below it.
    const at = new Vector3();
    const from = new Vector3(leadX, leadY, leadZ);

    /**
     * WHICH WAY IS UP, in her frame.
     *
     * Everything here is a child of the hull, so it rolls when she rolls — and
     * a hundred and fifty metres of wire rolled forty-five degrees puts its far
     * end a hundred metres under the sea. She carries her own net around the
     * sky, and the picture of a girted tug has no wire in it at all.
     *
     * A towed load is in the water and stays in the water. A hanging one hangs
     * plumb, which is precisely why a heeled ship's derrick load swings out
     * over her side. Both of those are the WORLD vertical, not hers.
     *
     * The parent chain is a frame stale here — this runs inside `update`,
     * before whatever carries her has set her attitude for the tick — and one
     * frame of lag on a wire is not a thing anybody can see.
     */
    group.getWorldQuaternion(worldQ);
    const up = tmpUp.set(0, 1, 0).applyQuaternion(worldQ.clone().invert());

    /**
     * How far the lead actually is above her flotation plane, right now.
     *
     * Not the height it would be if she were sitting up straight: a hook 3.3 m
     * up on an upright tug is 2.3 m up on one lying at forty-five degrees, and
     * dropping the load by the upright figure buries it a metre under. Her own
     * origin IS her waterline, and it rides the wave with her, so the
     * difference between the two in world y is the whole answer and it follows
     * the sea for free.
     */
    let aboveWater = leadY + spec.freeboard;
    if (group.parent) {
      lead.getWorldPosition(tmpA);
      group.parent.getWorldPosition(tmpB);
      aboveWater = Math.max(0, tmpA.y - tmpB.y);
    }
    // Standing on its own with nothing to be mounted on, there is no hull to
    // ask, so it falls back to the documented convention: the deck is a
    // freeboard above the sea.

    if (kind === 'derrick') {
      // The boom SLEWS. It stows fore-and-aft and swings outboard, and
      // `outreach` is how far outboard its head has got — so the angle comes
      // out of a cosine, not a sine. Taken as `asin(outreach / L)` the head
      // travels aft instead of over the side, and the arm the whole module
      // turns on is the one distance the picture does not show.
      const L = Math.max(0.1, spec.beam * 0.9);
      const phi = Math.acos(clamp01(outreach / L));
      boom.rotation.y = phi;
      const headZ = leadZ - Math.sqrt(Math.max(0, L * L - outreach * outreach));
      from.set(outreach, boomY, headZ);
      // Straight down from the head, and DOWN is the world's down.
      at.copy(from).addScaledVector(up, -Math.max(0.2, boomY - 0.9) * (1 - out) - 0.9);
    } else {
      const run = spec.scope * spec.length * out;
      // The wire lies along the water, so its direction is squared off against
      // the world horizon rather than against her deck.
      const along = tmpDir
        .set(Math.sin(angle), 0, -Math.cos(angle))
        .projectOnPlane(up)
        .normalize();
      at.set(leadX, leadY, leadZ)
        .addScaledVector(along, run)
        // …and down to the surface, however she is lying.
        .addScaledVector(up, -aboveWater * clamp01(out * 3));
    }
    buoy.position.copy(at);
    buoy.visible = out > 0.02;

    // …and the wire between them. A cylinder built along +y, so it is aimed by
    // pointing its own axis at the far end rather than by three Eulers nobody
    // can check.
    const span = at.clone().sub(from);
    const len = Math.max(0.01, span.length());
    wire.visible = out > 0.02;
    wire.scale.set(1, len, 1);
    wire.position.copy(from).addScaledVector(span, 0.5);
    wire.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), span.normalize());
    // Bar-taut when she is pulling and slack when she is not: the one thing
    // everybody on a working deck watches.
    const taut = clamp01(strainOf() / Math.max(0.01, spec.bollardPull));
    (wire.material as MeshStandardMaterial).color.setRGB(
      0.17 + taut * 0.5,
      0.17 + taut * 0.06,
      0.16
    );
  };
  place();

  const api: Gear = {
    object: group,
    obstacleRadius: 0,
    kind,
    lead,
    station,
    slots: [station],
    bollardPull: spec.bollardPull,

    shoot() {
      ordered = true;
    },
    haul() {
      ordered = false;
    },
    slip() {
      // A DERRICK CANNOT LET GO. The load has to be put down somewhere and
      // that takes as long as it takes — which is the era axis, and it is the
      // most capable gear here that has no way out.
      if (!Number.isFinite(spec.slipFor)) return;
      slipping = spec.slipFor;
      fast = false;
    },
    get out() {
      return out;
    },
    get state() {
      return state;
    },
    setWay(speed: number) {
      way = Math.abs(Number.isFinite(speed) ? speed : 0);
    },
    get way() {
      return way;
    },
    setAngle(radians: number) {
      const r = Number.isFinite(radians) ? radians : 0;
      angle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, r));
    },
    get angle() {
      return angle;
    },
    setOutreach(metres: number) {
      outreach = Math.max(0, Math.min(spec.beam * 0.9, Number.isFinite(metres) ? metres : 0));
    },
    get outreach() {
      return outreach;
    },
    setLoad(tonnes: number) {
      load = Math.max(0, Number.isFinite(tonnes) ? tonnes : 0);
    },
    get strain() {
      return strainOf();
    },
    get moment() {
      return momentOf();
    },
    get drag() {
      // What the gear takes out of her. A towed net is most of her power; a
      // string of pots is nothing much; a derrick is not in the water at all.
      if (out <= 0.01 || spec.hangs) return 0;
      return Math.min(way, (strainOf() / Math.max(0.01, spec.bollardPull)) * way * 0.55);
    },
    snatch(tonnes: number) {
      const t = Number.isFinite(tonnes) ? Math.abs(tonnes) : 0;
      // The worst of two snatches is a snatch, not the sum of two.
      surge = Math.max(surge, t);
    },
    get surge() {
      return out <= 0.01 ? 0 : surge;
    },
    get girting() {
      // The wire is across her, there is real weight on it, and she cannot
      // steer out of it because the pull is behind her pivot.
      return (
        !spec.hangs &&
        out > 0.5 &&
        Math.abs(Math.sin(angle)) > 0.62 &&
        strainOf() > spec.bollardPull * 0.3
      );
    },
    get fast() {
      return fast;
    },
    comeFast() {
      if (spec.hangs || out < 0.5) return;
      fast = true;
    },
    clear() {
      fast = false;
    },

    update(dt: number) {
      if (!(dt > 0)) return;

      // A snatch is over in seconds. That is the whole problem with it: by the
      // time anybody has decided what to do, it has already either capsized
      // her or not.
      surge *= Math.exp(-dt / 2.5);
      if (surge < 1e-3) surge = 0;

      if (slipping > 0) {
        slipping -= dt;
        if (slipping <= 0) {
          // Gone. All of it, at once, and the strain with it.
          slipping = 0;
          out = 0;
          ordered = false;
          fast = false;
          surge = 0;
        }
      } else {
        const per = ordered ? spec.shootFor : spec.haulFor;
        const want = ordered ? 1 : 0;
        const step = dt / Math.max(0.01, per);
        const err = want - out;
        out += Math.abs(err) <= step ? err : Math.sign(err) * step;
        // Something foul of the bottom does not come up. Hauling against a
        // fast net is how a boat is pulled down by her own winch.
        if (fast && !ordered) out = Math.max(out, 0.55);
      }
      place();

      const next: GearState = fast
        ? 'fast'
        : out <= 0.02
          ? 'stowed'
          : Math.abs(out - (ordered ? 1 : 0)) > 0.02
            ? 'shooting'
            : 'working';
      if (next !== state) {
        state = next;
        api.onState?.(state);
      }
    },
  };
  return api;
}

/**
 * The list a heeling moment gives a vessel, radians — for a boat with no hold
 * to hand it to.
 *
 * `asin(M / (Δ · GM))`, and it returns the angle of vanishing stability if the
 * moment is more than she can answer, because past that there is no
 * equilibrium at all. The same sum `createHold` does, published for the small
 * craft that do not carry a cargo model around with them.
 */
export function listFor(
  moment: number,
  displacement: number,
  gm: number,
  vanishing = 0.7
): number {
  if (gm <= 0.02 || displacement <= 0) return Math.sign(moment) * vanishing;
  const arg = moment / (displacement * gm);
  const limit = Math.sin(vanishing);
  return Math.abs(arg) >= limit ? Math.sign(arg) * vanishing : Math.asin(arg);
}
