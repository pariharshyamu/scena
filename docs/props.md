# Props & palettes

Every prop generator returns the same shape:

```js
interface Prop {
  object: Group;          // the visual, origin at ground level
  obstacleRadius: number; // steering footprint (0 = walk-through)
}
```

All are seeded (same seed → identical prop), flat-shaded low-poly, and themed by the palette you pass. Position the `object`, and when you need steering data call `collectObstacles(props)` to get world-space `{ center, radius }` circles.

## The prop catalogue

| Generator | Notes |
|---|---|
| `createTree({ seed, species, height })` | six species — see [Tree species](#tree-species) |
| `createRock({ seed, size })` | welded-jitter icosahedron, flattened base |
| `createBush({ seed })` | low foliage clumps |
| `createGrassTuft({ seed })` | crossed blades; `obstacleRadius` 0 (walk-through) |
| `createCrate({ seed, size, weathering })` | panel box with edge framing |
| `createFence({ seed, length, postSpacing })` | posts + crooked rails along local +x |
| `createLamp({ seed, light })` | glowing bulb; `light: true` adds a real `PointLight` |
| `createHouse({ seed, width, depth })` | walls, gabled roof, chimney, **emissive windows** |
| `createTower({ seed, height })` | wooden watchtower with platform and roof |
| `createWell({ seed })` | stone ring, posts, roof, bucket |
| `createRuin({ seed, size })` | crumbling walls with seeded gaps, tumbled blocks |
| `createStall({ seed, goods })` | market stall: striped awning, counter, stocked by trade — `'produce'` / `'pottery'` / `'bakery'` / `'textiles'` |
| `createStatue({ seed, figure, material })` | pedestal + figure: `'obelisk'` / `'figure'` / `'orb'` / `'bust'` / `'beast'`, in `'stone'` or `'bronze'` |
| `createBanner({ seed, style, pattern })` | waving cloth on a pole: `'flag'` / `'banner'` / `'pennant'`, heraldic device baked in; **self-animating** (no update call needed) |
| `createBrazier({ seed, light })` | metal fire-bowl on legs: shader flame, embers, glowing coals, flickering `PointLight`; **self-animating** |
| `createCampfire({ seed, light })` | stone ring + charred logs, shader flame, embers, flickering `PointLight`; **self-animating** |
| `createBunting({ seed, span, flags })` | festive pennants on a catenary cord between two poles, fluttering on the flag cloth-wave; **self-animating** |
| `createFountain({ seed, figure })` | tiered stone basin with animated `createWater` pools, a spouting centre statue and falling water; **self-animating** |
| `createCart({ seed, style, cargo })` | spoked-wheel `'cart'` (with shafts) or `'wagon'`, loaded with `'crates'`/`'barrels'`/`'sacks'`/`'hay'` |
| `createTable({ seed, style })` | `'round'` pedestal / long `'trestle'` / small `'desk'` |
| `createSeat({ seed, style })` | slat-back `'chair'` / long `'bench'` / three-legged `'stool'` |
| `createBed({ seed, size })` | post bed with quilt & pillow: `'single'` / `'double'` / stacked `'bunk'` |
| `createShelf({ seed, stock })` | tall shelf lined with seeded `'books'` / `'pottery'` / `'food'` / `'empty'` |
| `createChest({ seed, open })` | banded storage chest; `open` tilts the lid |
| `createCandle({ seed, style, light })` | `'single'` / standing `'candelabra'` / hanging `'chandelier'`; flickering glow free, `light: true` adds the real `PointLight` |
| `createRug({ seed, shape })` | woven `'round'` / `'square'` / `'runner'`; walk-through (`obstacleRadius` 0) |
| `createForge({ seed, light })` | smith's coal forge + anvil on a stump + quench barrel; coals glow & flicker, **self-animating** |
| `createOven({ seed })` | baker's stone dome oven, ember-lit mouth, peel leaning on it; **self-animating** |
| `createLoom({ seed })` | weaver's upright loom: warp threads, palette-dyed cloth on the frame |
| `createCounter({ seed })` | taverner's bar: paneled base, foot rail, mugs & jug on top |
| `createRailing({ seed, style, length })` | modern railing run: vertical `'bars'` / horizontal `'cable'` / frameless `'glass'` / laser-cut `'panel'` |
| `createModernWindow({ seed, style, mullions })` | framed glazing, `'fixed'` grid or `'sliding'` leaves; exposes its `pane` for the day cycle |
| `createGate({ seed, style, open, sliding })` | driveway gate between concrete pillars: `'slat'` / `'bars'` / `'panel'`; `setOpen(0..1)` swings or slides it |
| `createCladding({ seed, style })` | facade accent: teak `'slats'`, angled `'louvers'`, or a `'stone'` feature panel |
| `createPergola({ seed })` | teak posts, doubled beams, rafter slats; walk-through |
| `createPlanter({ seed, length })` | corten trough with low greenery |
| `createTreadmill({ seed, speed })` | gym treadmill with a genuinely **marching belt**; `setSpeed` drives it, a `run` slot stands the runner on the deck |
| `createGuitar({ seed, color })` | acoustic guitar sized to ANIMA's `GRIPS.guitar` — play it (strum loop) or lean it as décor |
| `createToilet({ seed })` / `createSink` / `createBathtub` | the ceramic bathroom set; toilet has a `sit` slot, the tub a `soak` slot (the sleep pose, reclined) |

## Vehicles

`createCar`, `createBike`, `createTractor` and `createTruck` are props with **running gear**: `vehicle.update(dt, { speed, steer })` spins every wheel radius-correctly, yaws the front wheels, twirls the steering wheel, cranks the bike's pedals and leans it into turns. GAMA output plugs straight in — speed from `agent.velocity.length()`, steer from the heading change. Each publishes GRIPS-conformant `slots` (`driver`/`passenger` with the `drive`/`sit` poses; the bike's `rider` uses `cycle`), so an ANIMA character drops into the seat and their hands land on the wheel by construction. See the **vehicles** example for the running gear lapping a court.

**Watercraft** ride the sea for real: `createBoat` (open motorboat, helm + passenger slots) and `createShip` (coastal ship — deckhouse, bridge, funnel, railed deck, a `drive`-posed helm) bind water with `craft.float(ocean.heightAt)`, then `update(dt)` samples bow/stern/beam and bobs, pitches and heels the hull on the Gerstner swell under it. See the **ocean** example — both craft ride the same waves the shader draws.

## Interaction slots

Props a character can *use* publish **`slots`** — `{ kind, anchor, pose, loop? }`, structurally identical to ANIMA's `InteractionSlot`, so they drop straight into `new Interaction(rig, loco).use(prop.slots[0])` with no cross-imports. Anchors are children of the prop (position the prop, the slot follows), at floor level, `+z` facing, pitched flat for lying poses. Today's slot carriers: **seats** (`sit` — benches seat two), **beds** (`sleep` — doubles and bunks sleep two), the **treadmill** (`run`: snap to the deck and drive `Locomotion` with `treadmill.speed`), the **toilet** (`sit`) and the **bathtub** (`soak`). Build your own with `createSlot(...)`.

The modern set (railing through planter) is themed by the [Tier-4 surfaces](surfaces.md#modern-machined) — brushed steel, powder-coat, teak, corten, concrete and `createGlass`. Window panes default to `nightGlow`, so a building listed in the day cycle's `lamps` lights its glazing at dusk; gate pillar lamps follow the same budget rule as street lamps.

The last seven are the **cottage furniture set** — meant for a [`createRoom` interior](settlement.md#interiors-createroom), though nothing stops a market square from having a bench. Candles follow the lamp rule (glow is free, real lights are a budget) and their flames flicker on their own; a chandelier's origin is its ceiling hook, so position it at ceiling height and it hangs.

Two prop behaviors worth knowing:

- **Lights are a budget.** Lamps and torches only create real `PointLight`s when asked (`light: true`, `torchLights: n`) — glowing emissive bulbs are free, real lights are not.
- **Houses plug into the day cycle.** Window materials are emissive at the intensity `createDayCycle` scans for, so passing a house in the cycle's `lamps` list makes its windows ignite at dusk. No extra API.

## Manipulables

Interaction slots let a character *use* a prop; **manipulables** let a prop *react*. `createDoor`, `createDrawer`, `createLever`, `createValve`, `createHatch` and `createPortcullis` carry a **state** you actuate, and animate a joint in response — swing, slide, throw, spin, hinge, rise:

```ts
const door = createDoor();               // a framed swing door (double: for a gateway)
door.toggle();                           // flip open ↔ closed
door.onChange = (open) => chime(open);   // fires when the target flips
game.onUpdate((t) => door.update(t.delta));  // eases the joint toward the target
```

`state` is the live eased position (0 = closed/rest, 1 = open/actuated); `open` is the boolean target; `set(0.5 | true | false)` drives it to a partial or full target. The shape is **structurally identical to GAMA's `Mechanism`**, so GAMA's `Interactable` (walk-up + press to operate, or an automatic door), `Trigger` (pressure plates) and `linkMechanism` (a lever that raises a portcullis) drive them with no cross-imports. The work stations — lever, valve, drawer, hatch — publish an `operate` slot (ANIMA's floor-level anchor) so a character stands at them; doors and portcullises are pass-through. Pair with ANIMA's `Gesture` + `createReachClip` so the hand and the mechanism move together. See the **manipulables** example: a keeper throws a lever, the linked portcullis rises, an automatic door opens on approach, and a chest is opened.

## Carryables

Manipulables react in place; **carryables** get picked up and hauled. `createCrate`, `createBarrel`, `createBasket`, `createSack` and `createLantern` return a `Carryable` — a `Prop` plus a `carry` style and a hold-point `grip` — structurally identical to ANIMA's `Holdable`, so they drop into `new Carry(rig, loco).pickUp(createBarrel())` with no cross-imports:

```ts
const carry = new Carry(rig, loco);
carry.pickUp(createCrate());   // hoisted to the chest, carried while walking
carry.putDown({ at: cart });   // set it down — or hand to GAMA's throwObject
```

Four **carry styles** map a thing to a pose: `crate` (hugged to the chest — crates, barrels), `tray` (out at the belly), `shoulder` (hoisted up — sacks), and `side` (hanging from one hand — baskets, lanterns; the free arm keeps swinging). Origins sit at the base so carryables also **place on the ground** like any prop; `grip` offsets the *hold point* into the body so the hands land right — the GRIPS idea again, no runtime IK. The lantern's glass is emissive (free glow; add a real light with the lamp budget). See the **carryables** example — a porter loads a crate onto a cart and hands off a sack.

## Work stations

Stations built to be *worked over time*, producing something. `createChoppingBlock`, `createOreVein`, `createCookpot` and `createSawhorse` are `WorkStation`s: a `work` slot, a held **tool**, a particle burst (chips / sparks+dust / steam / sawdust), a `progress` (0→1) and an `onYield` that fires once per cycle. Drive it each frame:

```ts
const block = createChoppingBlock();
attach(rig, 'handRight', block.tool);                            // ANIMA holds the axe
const swing = loco.overlay(createLoopClip(rig, block.action));   // the chop, layered over idle
block.onYield = () => stock.add('wood');                         // GAMA counts the logs
game.onUpdate((t) => block.update(t.delta, working));            // effects + progress + yield
```

`action` is the ANIMA loop the worker plays — `chop`, `mine`, `saw`, `stir` — layered over the **idle** stance so the loop owns the arms (don't fight it with a held pose). `update(dt, working)` only advances (and throws its burst, and yields) while `working`, so `progress` and the effects gate on the worker actually being there. Wire `onYield` into GAMA's `Stockpile` and a HUD to close the gathering loop. See the **work stations** example — one worker chops, mines, saws and stirs a full round.

## Gatherings

Work stations serve one worker. **Gatherings** serve several people at once — `createDiningTable`, `createPicnicTable`, `createLongBench`, `createGameTable` and `createCampCircle` return a `Gathering`: a `Prop` plus **`seats`** (its slots, in a stable order) and a **`focus`** (what the occupants attend to).

```ts
const table = createDiningTable({ seats: 6, style: 'round' });
const seating = new Occupancy(table.seats);       // GAMA decides who sits where
agent.moveTo(seat.approach ?? seat.anchor);       // walk to the spot BESIDE it
interaction.use(seat);                            // ANIMA stages the sit
gaze.target = table.focus;                        // …and the group has a centre
```

Three details carry more weight here than the geometry does:

- **`focus` is what makes a group a group.** Point every sitter's gaze at it — or hand it to ANIMA's `Conversation` — and a row of adjacent bodies becomes company. Without it they are strangers who happen to be near one another. It is the shared dish, the board, the fire, or (for a bench) the view.
- **Every seat has an `approach`.** A slot's `approach` anchor stands a pace off the seat, on the side that is *open*: behind a dining chair (the table blocks the front), in front of a park bench (the backrest blocks the rear). Characters walk *there*, then turn and lower — nobody materialises into a chair. `addApproach(slot, parent, distance, from)` adds one to slots of your own; get the side wrong and characters walk through the furniture to reach their seats.
- **Nothing is square.** Every chair is nudged off its ideal angle and pushed back a different amount, and the seat slot inherits that crookedness, so the sitters land crooked too. One seeded radian of it does more for a dining room than another thousand triangles — real chairs are never quite where they were left.

`createGameTable` takes `game: 'chess' | 'cards' | 'dice'` and always seats exactly two, facing each other across the board (the chess set is laid out mid-game, with losses). `createCampCircle` rings a fire pit with felled logs — gappy and uneven, because a ring of seats never closes — and its `focus` is already aimed where the flames go, so a `createCampfire` at the origin completes it. See the **gatherings** example.

## Tree species

`createTree` builds thirteen seeded species, each with its own silhouette, colour, wind response and steering footprint — all from the same low-poly primitives, so a mixed wood still batches cheaply.

| `species` | Silhouette | In the wind | `obstacleRadius` |
|---|---|---|---|
| `pine` | stacked cones | medium | 0.5 |
| `oak` | blob canopy on a forked trunk | medium | 0.6 |
| `cypress` | tall narrow flame, deep green | barely moves (stiff) | 0.35 |
| `birch` | slender, high crown, pale banded bark | light & whippy | 0.32 |
| `cedar` | broad flat horizontal tiers | stiff | 0.75 |
| `maple` | full rounded dome | medium | 0.65 |
| `sakura` | wide blossom umbrella | springy | 0.7 |
| `palm` | curved bare stem, drooping fronds | whippy fronds | 0.4 |
| `willow` | rounded crown, veil of swaying strands | very whippy | 0.7 |
| `sequoia` | colossal buttressed redwood + high conical crown | near-rigid | height × 0.06 |
| `banyan` | vast crown on a curtain of aerial prop-roots | stiff | height × 0.3 |
| `baobab` | fat bottle trunk, sparse high crown | stiff | height × 0.16 |
| `acacia` | thin trunk, broad flat umbrella | medium | 0.5 |

The four **giants** (`sequoia`, `banyan`, `baobab`, `acacia`) are big and few — a sequoia stands `22–32` units tall and towers over an ordinary wood — so their **`obstacleRadius` scales with height**, giving agent steering an honest footprint. Place them sparingly. For a *dense* stand of them, pair each with a [billboard impostor](scatter.md#billboard-impostors-for-giant-forests) via `treeLOD` — full geometry up close, a single camera-facing quad at range — so thousands of giants stay a few draw calls.

```js
import { createTree, TREE_SPECIES, PALETTES } from 'scena3d';

const avenue = createTree({ species: 'cypress', seed: 7 });     // for a formal row
const blaze  = createTree({ species: 'maple', palette: PALETTES.autumn }); // goes orange
const bloom  = createTree({ species: 'sakura', season: 'spring' });        // pink blossom
```

### Seasons

`season` dresses a **sakura**: `'spring'` blossoms pink, `'summer'` leafs green, `'autumn'` turns warm, and `'winter'` strips it bare to its branches. (Other species accept `season` and currently ignore it — the hook is there to grow.)

For falling **blossom or leaves**, the [precipitation](precipitation.md) system has a `'petal'` type — fluttering, spinning, blossom-pink points that reuse the whole GPU particle path. Drop one over a grove and the cherries shed:

```js
import { createPrecipitation } from 'scena3d';
scene.add(createPrecipitation({ type: 'petal', wind }).object);   // or tint it autumn-orange for leaf-fall
```

### Biomes

`treeBiome(name, options)` returns a **weighted species mix** ready to drop into `scatter({ items })`, so a whole wood takes on a character in one word:

```js
import { scatter, treeBiome } from 'scena3d';
scatter({ items: treeBiome('tropical', { palette }), area, density: 0.02 });
```

| `TreeBiome` | Mix |
|---|---|
| `temperate` | oak, pine, birch, maple |
| `boreal` | pine, cedar, birch |
| `mediterranean` | cypress, oak, pine |
| `tropical` | palm, banyan |
| `savanna` | acacia, baobab |
| `redwood` | sequoia towering over pine & cedar |
| `grove` | sakura |
| `wetland` | willow, birch |

`TREE_BIOMES` is the raw table (each biome's `{ species, weight }[]`), and `TREE_SPECIES` lists every species — either is a good base for a custom mix or a picker.

Three things make the species system safe to adopt:

- **Existing forests are untouched.** With no `species`, `createTree` still returns the familiar seeded pine/oak mix — new species are strictly opt-in. (The old `style` option is kept as an alias.)
- **Palettes still theme them.** Each species tints *from* the palette — a `cypress` is a deep version of the palette's green, a `maple` under `PALETTES.autumn` blazes orange — so a whole wood restyles by swapping one palette.
- **They mix in `scatter` and steer in GAMA.** Pass several species as `items` and a wood grows varied in one call; each carries its own `obstacleRadius`, so a narrow cypress and a broad cedar present honest footprints to agent steering.

`TREE_SPECIES` is the list of all species — handy for scattering the full set or building a picker. Only the canopy sways in the [wind](wind.md); the trunk stays planted, and a `cypress` holds nearly still while a `birch` whips — that's the per-species stiffness at work.

## Palettes

```js
import { PALETTES } from 'scena3d';
PALETTES.meadow   // greens, blue sky, terracotta roofs
PALETTES.autumn   // oranges, hazy warm light
PALETTES.dusk     // desaturated purples, sodium lamp glow
PALETTES.winter   // snow grass bands, pale sky
```

A `Palette` covers foliage, trunk, rock, wood, metal, lamp glow, grass/cliff/peak terrain bands, sky, fog, water, sand, path, wall and roof colors. Every generator takes `palette`; build a whole scene with one palette and it looks like a matched set. Define your own by satisfying the interface — the type is exported.

Seeding tip: inside `scatter` items you receive a forked `Rng`; use `rng.int(1, 1e9)` as the child seed so variants differ but stay deterministic.

## Ladders & tack

Two props that exist to be *met* by an ANIMA character.

**`createLadder`** publishes `bottom`, `top` and `rungSpacing` — structurally ANIMA's `Climbable`, so it drops into `new Climb(rig, loco).start(ladder)` with no cross-import. `rungSpacing` is the contract that matters: ANIMA drives the body up by exactly that much per half-cycle of the climb loop, so hands land on rungs instead of sliding past them. Three styles: `wooden` (slightly crooked rungs), `steel` (round rails on wall brackets) and `rope` (sagging, uneven).

**`createSaddle`** and **`createBridle`** are built to the fixtures `createQuadruped` already carries:

```js
const horse = createQuadruped({ coat: 'bay' });          // ANIMA
horse.saddle.add(createSaddle({ horseHeight: horse.height }).object);
horse.bones.Head.add(createBridle({ horseHeight: horse.height }).object);
```

The stirrups hang where the rider's foot goes and the reins run forward to the bit — so ANIMA's ride pose (heels down, hands forward) and the tack meet by construction rather than by fiddling. `english`, `western` (with the horn) and a `bareback` pad.

## Screens & electronics

An interior at night used to be black, because every light source in the kit was a fire. Screens fix that, and they are the thing that makes a room read as *now* rather than as a period set.

```ts
const tv = createTelevision({ diagonal: 1.4, mount: 'stand', mode: 'video' });
scene.add(tv.object);
const glow = createScreenLight(tv.screen);
game.onUpdate((t) => { tv.screen.update(t.delta); glow.update(); });
```

`createMonitor`, `createTelevision`, `createLaptop` (with a hinged `open` lid), `createSmartDisplay`, and `createTablet` — which is a `Carryable` that happens to have a screen, so pick-up, carry, put-down and hand-off already work on it with nothing added.

### The content is drawn, not fetched

`createScreenPanel(width, height, { mode })` builds the material. Nine modes — `off`, `standby`, `home`, `feed`, `video`, `map`, `chart`, `call`, `keypad` — drawn procedurally in the fragment shader from the panel's UVs, the same way `createSurface` draws brick.

Deliberately **not text**. A phone is a few pixels across at conversational distance; what you need is the *impression* of an interface — rows, tiles, a route line, a scrubbing bar — not readable content. Real glyphs would cost thousands of triangles for something illegible.

Content is written into emissive radiance rather than `material.emissive`, so the day/night cycle cannot dim a screen. A monitor at midnight is as bright as one at noon, which is the whole reason anyone notices screens at night. And `off` is not black: it is a dark mirror.

### Why the light is a spotlight

`createScreenLight` returns a **`SpotLight`**, wide and fully soft, aimed along the panel normal. This is not a detail.

A screen emits from its front face only. A `PointLight` — which is what this had first — radiates in every direction, so it lights the wall the television is standing against 1.4 m away five times harder than the person watching it 3.2 m away. The render came out as a bright halo behind the set with the viewer sitting in shadow: exactly backwards, and invisible to every numeric check, because the light *was* on and *was* the right colour.

Emission scales with panel **area**, not diagonal — a 55" set puts out roughly twenty times a tablet, where a diagonal-based figure makes it about twice.

Lights stay a budget, as everywhere else here: this is opt-in per panel. A room of monitors should light one or two faces and let the rest carry on their emissive alone.

### A television, not a blue lamp

`panel.glow` publishes the colour and level of what is being drawn *right now*, so a light that copies it flickers in time with the picture's own cuts.

The shot list is deliberately uneven — cuts run 0.55–4 s, because a fixed cut length reads as a strobe and the room lighting gives it away long before the picture does. The CPU pushes each shot's colour and level into the shader as uniforms rather than letting the shader pick its own, so the light and the picture cannot drift apart: they are the same event.

### Phones and watches

`createPhone` is portrait — about 19.5:9 the tall way, because a 16:9 landscape panel scaled down reads as a tiny television. `createSmartwatch` is the smallest thing the system draws, and a useful proof that one content shader covers a 55" set and a 40 mm watch face.

A phone is a `Carryable` with a `Screen`. Pick-up, carry, put-down and hand-off already work on it: handing someone your phone to show them a photo needs no new verb, it is `handTo`.

## Terminals

The first props here that a character cannot simply walk up to and use: somebody may already be at it. So besides the usual slot, `createTerminal` publishes a **line** — an anchor at the head of the queue, with the queue running back along its local -z.

```ts
const atm = createTerminal({ style: 'atm' });
const at = atm.line.localToWorld(new Vector3(0, 0, -queue.distanceOf(person)));
```

That pairing is the whole handshake: SCENA says where the line is, GAMA's `Queue` says who is where along it, neither imports the other. `atm`, `kiosk` and `vending`, each with a `Screen` (an ATM defaults to the keypad mode) and a stocked-by-seed cabinet in the vending case.

One thing worth stealing: the casing is **light grey**. It started near-black, which looked fine as a colour swatch and rendered outdoors as a featureless black slab — none of the hood, shelf or slots that say "cash machine" survived. Public machines are pale precisely so they read at a glance from across a concourse.

## Fixtures and desk sets

`createFixture` builds the small wall things: `switch`, `thermostat`, `doorbell`, `camera`, `sensor`. They are 5–12 cm across, so almost no budget goes on shape — what reads is the **indicator**, one lit pip whose colour says what the device thinks is happening. Every fixture publishes `setIndicator(colour, strength)`, and that is the whole prop at any honest camera distance.

The origin is at the wall face with the device facing +z, so placement is a position and a height. Ones you touch (switch, thermostat, doorbell) carry a slot; a ceiling camera does not, because you do not walk up and press it.

`createDeskSet` is a keyboard, mouse and mug — what a character actually puts their hands on, which the monitors and laptops did not give them. It publishes a `keyboard` anchor at the home row so ANIMA's desk poses aim at something real. The keyboard is never quite square to the desk, because nobody's is.

## Wall art

Every room in this kit used to have bare walls, and in every screenshot that was the loudest thing wrong with it: furniture, characters and lighting all read, and then the background was a flat sheet of colour that no inhabited room has ever had.

| Generator | Notes |
|---|---|
| `createPainting({ width, style, frame, age, seed })` | a picture with a moulding; proportion and subject are seeded, so a wall is not a grid of squares |
| `createFramedPhoto({ size, standing, seed })` | small, glazed, matted; `standing` moves the origin to the **base** so it sits on a shelf rather than half inside one |
| `createMirror({ width, height, frame })` | a painted reflection — see below |
| `createWallClock({ diameter, time, rate })` | the only piece here that moves; `update(dt)` runs the hands |
| `createTapestry({ width, height, rod })` | hanging cloth with a sagging drop; the **rod** is the origin, so it hangs below it |

### The picture is drawn, not fetched

`createPicture` is `createScreenPanel`'s twin: procedural content in the fragment shader from the panel's own UVs, nothing loaded, every picture unique. Styles are `landscape`, `portrait`, `stillLife`, `abstract`, `geometric`, `photo` and `mirror`.

The one structural difference matters more than everything else. A screen writes into **emissive radiance** — it is a light source, and the day cycle must not dim it. A picture writes into **base colour**. It has no light of its own, so it dims with the room exactly as the plaster does. A picture that keeps glowing at midnight is the loudest possible tell that a wall has been decorated with screenshots.

Content is not representational in any detail. What reads at the size a picture actually occupies on screen is **value structure** — where the light is, where the dark mass is, what the subject's silhouette does. Paint that correctly and the eye supplies a landscape.

Two things learned the hard way, both only visible in a render:

- **A disc on a blob is a snowman.** Both the portrait and the photo first drew a figure as a circle sitting on a soft dome, and at every size and in every palette that reads as a snowman. Shoulders have to *widen as they fall* and then stop — a spread that keeps growing is a pyramid, which is no better. `picBust` is shared by both for exactly this reason.
- **Everything has to sit on a real value ladder.** The first portrait had ground, clothes, hair and face all inside one narrow band of value; the result was a ring of near-identical greys where a head should be. Every unit test passed.

### Mirrors are painted

A real mirror is a second render pass each, which is an absurd price for set dressing, and a metal surface with no environment map renders black. `PictureStyle.mirror` paints a pale gradient with a skewed bright patch where a window would land and a dark mass low down where the floor is. It reads correctly at any distance you would actually film a room from.

## Hanging things up

Prop generators say what a thing *is*. `hangOn` says where it *goes*, and for decoration that is the larger half of the problem: the difference between a decorated room and an undecorated one is a few meshes, but the difference between a decorated room and a showroom is entirely placement.

```ts
hangOn(room.walls[0], painting, { height: 1.55, seed: 3 });
hangGallery(room.walls[1], [a, b, c, d, e], { seed: 7 });
```

`createRoom` now publishes `walls` — clear interior runs, **merged**, so five wall cells in a line become one 6 m wall rather than five 1.2 m panels, because "halfway along the north wall" is the question anyone actually has. A window or a hearth splits a run, since you cannot hang a picture over either. Each wall carries an anchor oriented **+z into the room, +x along the run, +y up from the floor**, so anything with that shape works — `createWallAnchor` builds one for a wall you made yourself.

Two defaults are doing most of the work:

- **Nothing hangs level.** `tilt` defaults to about a degree of *roll*, and that single value is most of the difference between a prop on a wall and a picture in a room. It is roll and not yaw or pitch because a picture hangs from one point and swings in its own plane; tilting in any other axis drives a corner into the plaster. Set `tilt: 0` for things actually screwed on, like a clock.
- **A wall of pictures is not a row of pictures.** `hangGallery` hangs a group off a **spine** — an invisible horizontal line that pieces touch with their centre, their top edge or their bottom edge — with uneven gaps. It returns what it actually placed; overflow is left off rather than crammed in or silently overlapped.

## Dressing surfaces

`hangOn` deals with walls. `dress` deals with everything horizontal — tabletops, shelf boards, the lid of a chest — and it is the same argument: a room with pictures up and bare tables is still a show home.

```ts
dress(table.surfaces[0], [mug, bowl, candle, book], { seed: 3 });
```

Props publish `surfaces` the way they publish `slots`: an anchor sitting **on** the surface with +y up, +x along its width and +z along its depth. `createTable`, `createShelf` and `createChest` carry them, and `createPropSurface` builds one for anything you made yourself. Two of those are opinionated on purpose — a stocked shelf only offers the boards that are not already full of books, and an **open** chest offers nothing at all, because its lid is not a surface when it is standing vertically.

Four properties are the whole of the placer, and the naive version fails on every one of them:

- **Tall things go behind.** Otherwise a candlestick lands in front of a bowl and hides it.
- **Things cluster.** Positions are drawn around a seeded centre of gravity, off-centre on purpose, so one part of the surface is busy and another is clear. An even spread is a display of merchandise.
- **Nothing is square.** Small random yaw. Nobody sets a mug down aligned to the table.
- **Nothing overlaps, and nothing floats.** Placement is checked against what is already down, using the *turned* extent of each footprint; and whatever a prop's own origin convention, its lowest point ends up at surface level.

Things it will not do: cram in what does not fit (the overflow is left unparented and simply missing from the return), or stack.

### Four things learned by looking at the render

- **The first version laid everything out in a line.** Aiming each item at a depth computed from its height puts everything of similar height at the same z — and a set of tabletop props are all of similar height. The height-vs-depth correlation test passed comfortably; the absolute spread was nil. Depth is now a *bias* applied to a full-range sample, and there is a test on the span.
- **A phone set down as authored stands on its short edge like a domino.** Props are modelled in the orientation they are *used* in, which for a phone is upright in a hand. `dress` works out which way up a thing comes to rest from its shape — a **slab** lies down, a candle does not, and a photo frame's strut thickens it past the threshold so it keeps standing. `rest` overrides it.
- **Random sampling cannot find a narrow gap.** Once two wide items are down, a shallow surface is effectively one-dimensional: nothing can pass a 48 cm basket within the depth of a 90 cm table. A phone with obvious room in the corner was missing it on all 24 attempts. There is now a shuffled coarse-grid sweep as a fallback, which took a demo table from 4 items placed to 10.
- **Loosening to a uniform draw when attempts fail defeats clustering entirely** — because a tight cluster is exactly what fails often enough to trigger the fallback, so `cluster: 1` spread things out *more* than `cluster: 0`. The sampling window now widens gradually around the focus instead.

## Vessels

The kit is otherwise made of boxes, and it shows: a room built from `BoxGeometry` has no curves in it anywhere, which reads as a *style* right up until you put a bowl of fruit on the table and discover there is no bowl.

A **surface of revolution** fixes that with almost no code. `createVessel` samples a seeded radius profile up the height and spins it, and the same twenty lines produce all of `vase`, `urn`, `bottle`, `jug`, `goblet`, `bowl`, `pot` and `candlestick` — shapes that would each be a separate hand-modelled prop otherwise. The style is nothing but the list of control points.

```ts
const jug = createVessel({ style: 'jug', seed: 4 });
```

Two things that are not optional:

- **The profile has to come back down the inside.** Stop at the rim and the lathe caps it flat, and a vase is an egg — fine at fifty metres, obviously wrong the moment anything is set beside it. The whole of a bowl is the hole in it. There is a test that fires a ray down the axis and checks where it lands.
- **The wall must never invert.** Catmull-Rom overshoots, and a negative radius turns the vessel inside out while the lathe builds it perfectly happily. The sampler clamps.

Heights vary per seed, because a shelf of identical vases is exactly the repetition this whole track exists to avoid.

## Clutter

Every carryable in this kit is a *carryable*: a basket is 48 cm across, so three of them is a full table, and a tabletop dressed from that set says nothing except "somebody left the shopping out". The missing layer was 5–25 cm.

| Generator | Notes |
|---|---|
| `createBooks({ style, count, seed })` | `stack` (graded, askew), `row`, `leaning`, `open` (face down, splayed) |
| `createPapers({ count, size, seed })` | a pile where no two sheets line up, with one clear of it |
| `createFolded({ width, color, seed })` | folded cloth: offset layers, never square |
| `createTrinket({ size, seed })` | small lidded box |
| `createFruitBowl({ count, seed })` | the one piece that composes both tracks — a lathe bowl with fruit in it |
| `createClutter({ theme, count, seed })` | a mixed set, ready to hand to `dress` |

`createClutter` draws from its theme pool **without replacement until it runs out**, so a set of six is six different things rather than the same vase six times — which is what picking at random gives you, and which is exactly as obviously generated as an even spread. Themes are `domestic`, `kitchen`, `study` and `workshop`.

```ts
dress(shelf.surfaces[0], createClutter({ theme: 'study', count: 7, seed: 2 }));
```

Everything here is deliberately cheap — a book is one box, a stack is five. At the size these occupy on screen that is already more detail than survives, and the budget belongs to having *more different things* rather than better ones.

One recurring trap worth naming, because it caught three props in a row: **a tilted box has to be lifted by its rotated half-extent, not its height.** A leaning book positioned at `h·cos(θ)/2` leaves its low corner `w·sin(θ)/2` under the shelf, and a book sunk into the wood is more obviously wrong than one that never leaned. The same arithmetic applies to the splayed leaves of an open book.

## Houseplants

One trap, and it is the only one that matters: **plants read by silhouette, not by colour.** Six species that are all "green ball on a stalk" in six different greens is one plant, six times, and no amount of leaf detail rescues it. So `createPlant`'s species differ *structurally*:

| Species | Silhouette |
|---|---|
| `snake` | tall stiff blades fanning up |
| `trailing` | a low crown with strands over the rim and down |
| `fern` | a dense low mound of arcing fronds |
| `cactus` | a bare column with a pad or two, and no leaves at all |
| `ficus` | a thin visible trunk under a loose canopy |
| `succulent` | a flat rosette, barely above the soil |

There is a test that measures slenderness and mass distribution for every pair and fails if two species are within tolerance of each other on both.

The pot is a `createVessel` lathe — a houseplant standing in a box would undo the whole vessel track. And a **trailing plant gets a tall pot**, deliberately: the species is defined by strands hanging down, and a plant with nothing to hang down past is a small bush. That single ratio is the difference between six silhouettes and five.

`drop` controls how far foliage may hang below the soil. Potted, it defaults to the pot's own height — otherwise the strands go through the pot and out under the shelf, and every placement helper then lifts the whole plant to clear them and floats the pot in mid-air. `createWindowBox` and `createHangingPlant` set it themselves, because the host knows how deep it is.

## Curtains, cushions and throws

Curtains are the best value in the whole decoration set and cost almost nothing, because the hard part was built in 0.9: `clothWave` has driven the flags, banners and bunting ever since. A curtain is that same material **stood on its end** — fixed along the top edge, free at the hem — and a curtain stirring in a draught is one of the very few things that makes an interior read as alive rather than as a photograph of one.

```ts
const curtains = createCurtains({ width: 1.2, drop: 1.6, seed: 3 });
game.onUpdate((t) => curtains.update(t.delta));
```

Two details that are load-bearing:

- **`sag` is zero.** Sag pulls toward the free edge, which for a curtain is straight down; adding gravity to gravity stretches the hem into a spike.
- **The cloth is wider than the gap it covers,** and pleats are baked into the geometry for the wave to ride on. A panel cut to the exact opening is a bedsheet nailed to the wall, however well it moves.

`createCushion` is a box with its corner vertices pulled in and its face centres pushed out — a box is a brick. It needs an **even** segment count, because with three there is no centre vertex to plump and you get a box with slightly rounded corners. `createThrow` lies flat, folds over an edge and hangs down the front with an uneven hem, because a throw with a straight edge is a tablecloth.

Neither uses the `canvas` surface. That shader's grain is scaled for a tent, and on a 40 cm cushion it reads as sandstone.

## Paper and notices

One hard rule: **no letterforms.** There is no font here, and fake glyphs are the single most recognisable tell in a procedural scene — at any distance where you could tell they were letters, you can tell they are the wrong ones. What goes on these is type at the density type has when you see it across a room: ruled bands with ragged right edges, heavy blocks where a headline sits, nothing glyph-shaped. (`createSign` is the exception and earns it: a signpost is read deliberately and has a real vector font behind it.)

Two new `PictureStyle`s carry it — `poster` (a flat colour field, a heavy band, headline bars) and `notice` (white paper, a rule, ruled body copy, a stamp off in one corner) — and both skip the canvas weave and varnish, because paper is not oil.

| Generator | Notes |
|---|---|
| `createPoster({ style, taped, seed })` | a bare sheet on the wall; tape is crooked, pins are not |
| `createPinboard({ count, seed })` | cork board with **overlapping** notices, photos and flyers |
| `createWhiteboard({ fill, seed })` | strokes, a boxed diagram, an arrow, a pen tray — and a blank patch |
| `createStickyNotes({ count, seed })` | a cluster, never an even scatter |

The **overlap** is the whole pinboard. A board of neatly spaced non-touching notes is a spreadsheet; a real one has a photo half over a flyer with a corner of a receipt under both, everything at a different angle, and the notes stacked in z so the ones on top really are.

## Water in motion

The porcelain in a bathroom is trivial: a basin is a lathe and a tub is a box with a hole in it. What makes any of it read is **water behaving**. `materials/waterFlow.ts` is the shared layer, extracted the same way `clothWave` was — the fountain had falling water and a jet since 0.9, and every tap, shower and cascade wants both.

It also **fixed** what was there. The fountain's falling water was eight *static* translucent cylinders. At rest that reads as glass rods, and no amount of tinting helps, because the thing that says water is not the colour — it is that the surface travels downward and comes apart as it goes.

| Generator | Notes |
|---|---|
| `createStream({ height, radius, flow })` | a tap, a spout, a weir. Origin at the **lip** |
| `createSpray({ height, radius, spread })` | a shower's cone, with mist where it lands |
| `createFill({ radius \| width, depth })` | the water *inside* a container; `setLevel`, `fillBy`, `disturb` |
| `createSteam({ radius, height })` | the only particles in the set |

Everything takes its flow or level **from outside**, so `createValve` (already a `Manipulable` with an eased `state`) or GAMA's `Automation` drives it with no library importing another.

### What makes it read as water

- **Falling water accelerates**, so the column narrows and the pattern *stretches* rather than scrolling. Constant-rate scrolling gives a barber's pole.
- **It breaks up with distance fallen** — a sheet near the lip, separate ropes further down. `breakUp` is *how far down* that starts, so a thin tap stream wants a **low** value and a thick weir a high one. I had this inverted at first, which gave tap water holding as a sheet all the way to the basin while a weir shattered at the lip.
- **The body is transparent and the lit edges are not.** A uniformly pale tube is a rod whatever it is tinted; the contrast along the length is the whole effect.
- **A closed tap draws nothing at all** — not "fully transparent", which still costs a draw and still sorts against everything behind it.
- **A fill is agitated while filling and settles when it stops.** A still disc of blue is a disc of blue; the decay is the difference.
- **Steam builds slowly and clears slower.** A room that fogs the instant the tap opens is a smoke machine, and the asymmetry is why a bathroom stays fogged afterwards.

Two practical traps. `createFill`'s radius must match the container's **interior at the level the water reaches**, not its widest point — a bowl flares, so a disc cut to the rim pokes out through the sides as a blue band around the outside. And **point sprites have no upper size bound**: a splash viewed from 60 cm becomes a screenful of glowing beach balls, so droplets carry a `maxPixels` cap.

## Basins, taps and ewers

The era here is a **gameplay** axis, not a styling one, and that is the whole reason it is worth having:

| Era | Controls | The loop |
|---|---|---|
| `medieval` | none — `taps` is **empty** | water arrives in a vessel, `pour()` it in, throw it out |
| `victorian` | two crossheads and a plug | hot and cold arrived separately; mixing was your problem |
| `modern` | one mixer lever and a drain | water on demand |

The same three meshes with different textures would be a re-skin. These differ in what the player *does*, which is why one of them has no taps at all and a laver quietly refuses `setDrain` — pretending it had a plug would let a medieval scene empty itself.

```ts
const basin = createBasin({ era: 'victorian' });
basin.taps[0].toggle();
game.onUpdate((t) => basin.update(t.delta));
```

The whole **tap → stream → level** loop is wired inside the prop, so the caller only operates the taps. It still composes outward: `Tap` is structurally a `Manipulable`, exactly like a door or a valve, so GAMA's `Automation` or any interaction system drives one without knowing what a basin is. `createEwer` is a `Carryable`, so the medieval half is a carry loop that ANIMA already supports with no adapter.

One detail that is easy to skip and shouldn't be: **the knurled pillar knob has ribs**. A smooth cylinder rotating about its own axis is pixel-identical to a stationary one, which makes the entire control invisible.

## Washing (ANIMA)

`Washing` is the pose that makes a basin usable, and it is genuinely not `DeskWork`. At a desk the forearms come forward at elbow height and the head stays near level, because the screen is at eye height. At a basin the hands go **down and together** into a bowl below the elbows and the head really drops — you are looking at your hands.

Both of those came out backwards on the first attempt, and the fix was to **sweep the rig and measure** rather than reason about it:

- **Arm `Z` controls how far apart the hands are**, not how far forward: 1.05 gives a 69 cm gap, 1.45 gives 42 cm.
- **Less forearm bend drops the hand below the elbow**, not more: 0.8 puts it 11 cm under, 1.4 puts it 5 cm over.

The first version used the widest, highest combination of both and produced a pose that failed six tests at once.

## Showers, tubs and hot tubs

The state machine is the point. A shower does not produce hot water the instant you open it, and **that pause is most of what makes one feel plumbed rather than switched** — so `Shower` runs `off → warming → running → cooling`, deliberately the same shape as GAMA's `Device`, and a device graph drives one with nothing importing anything.

Two things fall out of that shape and both matter on screen:

- **Water arrives at once; heat does not.** The spray is at full flow a frame after you open it while `steam.density` is still zero. A shower whose steam appears with the water is a special effect.
- **The steam outlives the water.** A room that clears the instant the tap shuts is an extractor fan.

```ts
const shower = createShower({ style: 'enclosure', warmUp: 3.5 });
shower.onState = (s) => console.log(s);   // 'warming' … 'running'
shower.setRunning(true);
game.onUpdate((t) => shower.update(t.delta));
```

| Generator | Notes |
|---|---|
| `createShower({ style })` | `enclosure` (frosted glass + tray), `overBath` (rail + stirring curtain), `open` (wet room) |
| `createTub({ style })` | `clawfoot`, `modern`, `sunken`, `hip`. `hip` has **no taps** — you fill it from a ewer |
| `createJacuzzi({ seats })` | a `Gathering`: seats round a rim with a shared focus |

A hot tub is a `Gathering` because that is what one *is* socially, which means GAMA's `Occupancy` fills it and ANIMA's `Conversation` runs in it with nothing new written. Its jets agitate the surface for as long as they run, through the same `uFillStir` the taps use — a surface that settles while the jets are on is the giveaway.

### The lesson this track actually taught

Every defect in it was **a solid where a hole belonged**, and not one of them moved a number:

- The clawfoot tub was a shell with a *smaller box inside it* for the hollow. The second box is invisible — it is hidden by the shell it sits in — so the tub rendered as a plain white block with taps on top. It is four **walls** around an inner floor now.
- The sunken tub's deck was a slab across the whole footprint. That is a **lid**: it caps the very well it is meant to surround.
- The hot tub's body was a default `CylinderGeometry`, which is **capped**, so the water, the jets and every seat rendered underneath a disc of shell material. Its liner was an open cylinder with the normals pointing *outward* — a mesh sitting inside the body with every face turned away from the only camera that could ever see it.

Twenty-five numeric tests passed through all three. The test that catches the whole family is one line of geometry: **cast a ray straight down and check the first mesh it meets is the water.** It is in `tests/bathing.test.ts` and it runs over every style.

Sanitaryware also got its own surface, `glaze`. It is emphatically not `porcelain` — that preset is large-format porcelain **floor tile**, grout and all, and a bath shell built from it comes out looking like a tiled box rather than one fired piece.
