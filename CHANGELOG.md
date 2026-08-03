# Changelog

SCENA ships one prop family, one material tier or one environmental system per
minor version, each taken end to end: code, unit tests, a runnable example,
headless verification in Chromium that it actually renders, and docs.

There are a lot of versions. The format below is one line per release, taken
from that release's own commit message — those were written at the time and are
more accurate than a summary written now would be. The commit messages carry
the long form, including the bugs each release found.

`0.x` means minor versions may add and occasionally reshape API.

## Not on npm

Reconstructed by diffing this file against `npm view scena3d versions`, and
stated rather than papered over:

- **`0.2.0`, `0.5.0`–`0.8.0`, `0.10.0`–`0.13.0`** predate the first publish.
  The package went to the registry at `0.14.0`.
- **`0.101.0`** was committed but superseded by `0.102.0` before a publish, so
  `npm install scena3d@0.101.0` finds nothing.
- **`0.67.2` and `0.67.3`** are on the registry with no commit of their own —
  publish-only bumps during the `0.67.x` packaging work, so they have no entry
  below.

## Releases

## [0.109.0] — 2026-08-03

### Added

- **`plateStrength`, `mailStrength` and `createArmour`** — what it costs to
  push a hard point through a sheet of metal, from the metal's yield strength
  and a ruler. SCENA has never heard of an arrow.

### The obvious model is the wrong mechanism

Shearing a plug out — perimeter × thickness × shear strength — is what every
press-tool handbook uses for punching holes. Handed a 9 mm bodkin and 2 mm of
wrought iron it says **19.6 J**, and the measured figure is nearly ten times
that.

A sharp point does not shear a plug. It OPENS A HOLE, pushing metal aside
radially, and what that costs is the metal's INDENTATION pressure — which Tabor
measured in 1951 at about three times the yield stress, and which is also what
a hardness test measures.

    p = 3·σ_y            F = p·πd²/4            E = F·t

Both numbers are reported side by side. A model that is only ever right is a
model nobody has checked against the alternative.

### What it is wrong against

Alan Williams (*The Knight and the Blast Furnace*, 2003) put 2 mm plate at about
**175 J** and mail over padding at around **120 J**. This file's 2 mm comes out
at **76 J** in wrought iron and **153 J** in medium-carbon steel — under, which
it must be, because Williams's are system figures including dishing the plate
and the arrow bending. The gap is the energy that goes into BENDING the plate
rather than piercing it, which is the whole argument about arrows and armour.

### Mail is not what stops the arrow

One riveted ring takes **679 N** and **3.05 J**, against an arrow's hundred and
twenty. That is why mail was never worn alone: the padding under it does the
work, the padding is textile, and SCENA has no business knowing the fracture
toughness of linen. That number lives in ANIMA, and neither package imports the
other.

The areal density comes out at **10.8 kg/m²** from wire diameter and ring pitch
alone. Surviving riveted mail is 8-12.

### And a unit that deliberately does not match

`createBoard().strike()` takes NEWTONS; `createArmour().strike()` takes JOULES.
A board fails when its outer fibre reaches rupture stress, so what runs out is
force. A plate fails when a hole is open all the way through, so what runs out
is work. Making them match would be tidier and wrong.

## [0.108.0] — 2026-08-01

### Added

- **`boardStrength()` — what a board takes to break, derived from four
  published numbers and nothing else.** Modulus of rupture and Young's modulus
  from the Wood Handbook, the visual-grade strength ratio from ASTM D245, and
  the standard three-point bending relation. Five timbers.
- **It has been checked against the world.** Feld, McNair and Wilk measured a
  30 × 15 × 2.5 cm pine board at about **3.1 kN** in *Scientific American* in
  1979. Handed that board's dimensions and nothing else, this says **3.62 kN** —
  a 17% error with no fitting. Without the ASTM strength ratio it says 10.4 kN
  and looks entirely plausible while being three times wrong.
- **`stackStrength()`** — and two results the algebra gives that intuition does
  not. **Energy is LINEAR in thickness**, not cubic: the `d³` is in the
  stiffness and a stiffer beam fails sooner, so `U ∝ σ²bdL/E` and six glued
  boards take exactly the same energy as six spaced ones. The spacers are a
  **force** argument — 4.10 kN six times against 147.7 kN at once.
- **`createBoard()`** — boards on two blocks whose spacing *is* the span the
  strength was computed from. `strike()` takes **newtons**, because force is
  what breaks a beam.
- Added to `npm run geometry`.

### The cross-library result

ANIMA derives a strike's kinetic energy from Dempster's segment masses and a
measured surface velocity, has never heard of this file, and puts a hammerfist
at **113 J** against a pine board's **1.9 J**.

**Energy is not what limits board breaking — it is out by a factor of sixty.**
Every strike ANIMA can measure carries 10× to 400× what a pine board needs. What
a person runs out of is force, in the first millimetre. Two libraries that do not
import each other, each deriving its own half in its own units, is what made that
checkable.

### 2026-07-30

- **0.105.0** — **Rail**, the one vehicle class that does not steer: a train's
  whole position is one number, and `track.at(d)` turns it into a place and a
  facing. `createTrack` (rails, instanced sleepers, ballast — **four draw calls
  for 737 m and 1,133 sleepers**), `createLocomotive` / `createCarriage` /
  `createWagon`, `createConsist` (bogie-chord placement, wheels rolled by
  distance not time), and `createStationPlatform`, which publishes `stopMark`
  and `doorMarks` so "the doors landed 40 cm past their markings" is a number —
  held to 10 cm on the straight. Three measurements changed the code:
  three.js's default `arcLengthDivisions` made "equally spaced" points **8.3%
  uneven** on a long line (now 0.00%); the platform's benches were one mesh
  each, costing a 390 m platform 15 draw calls; and `createSurface('grass')`
  did not exist. Also adds the **`grass` surface** — `createGrass` exists as a
  prop, so reaching for it as a surface is the obvious move, and `moss` is a
  grey-green cap for stone that gives a field the colour of a damp wall
- **0.104.1** — A documented claim, measured and found wrong. `docs/imports.md`
  blamed all **9.3 kB** of `scena3d/materials` on `SURFACE_PRESETS` being one
  unshakeable record, and proposed a value-taking `createSurface(WOOD)` as the
  fix. The table is **2.8 kB of the 9.3**; the shader and factory are the other
  ~6.5 and no import shape can shake them, so that fix would buy about a
  quarter of what it read like — at a cost of 58 new public exports. A second
  `npm run size` probe pins the split so the attribution stays honest. No API
  change
- **0.104.0** — `npm run geometry`: what a prop costs to DRAW, in exact
  integers — draw calls, GPU buffers and materials per prop, against committed
  ceilings. It found three props allocating materials they could share: a glass
  railing built one per bay (7 identical panes), a car one rubber per wheel and
  one lens per lamp (15 material instances → 10), and a stall one per loaf
  (18 → 10). The gate's own first run was **wrong about 20 of the 34** it
  reported, because `createSurface` keeps its parameters — including the
  weathering `uSurfSeed` — in a uniform bag on `userData` that the check could
  not see; the near-miss was collapsing a stall's three per-basket wood
  surfaces into one and stamping the baskets out identically. Adds `sharedBy`
  (internal) and a counter-invariant test that the baskets keep three distinct
  seeds
- **0.103.0** — Six sub-path entry points, and the build defect they exposed.
  `createCrate` cost **20 kB** gzipped from the published package and **11 kB**
  from the same code built from source. The barrel was not at fault — esbuild
  shakes `src/index.ts` perfectly, and importing through it costs exactly what
  importing `src/props/crate.ts` costs. `tsup src/index.ts` flattening 122
  modules into one file was: module boundaries are where a bundler's
  tree-shaking gets its granularity, and `--splitting` does nothing with a
  single entry point because there is nothing to split against. Building
  `scena3d/{core,materials,text,props,environment,scene}` alongside the root is
  what forced the split, so **the root import dropped to 11 kB for every
  consumer who changed nothing.** The entries are generated from the barrel by
  `scripts/entries.mjs` with `entries:check` in CI, five tests pin the
  partition (complete, non-overlapping, same bindings as the root), and
  `npm run size` holds seven realistic imports to committed ceilings. See
  [docs/imports.md](docs/imports.md) — including what this does *not* fix:
  `SURFACE_PRESETS` is one record of every kind, so any surface still costs
  9.3 kB.

### 2026-07-30

- **0.102.1** — CI on every push, this changelog, and `playwright` as a
  devDependency so `verify:playgrounds` runs on a fresh clone

### 2026-07-28

- **0.102.0** — The fighter jet: elevons, burner, and the empty rail
- **0.101.0** — The helicopter: night shift at the heliport  *(not published)*
- **0.100.0** — Aviation: the vehicle kit grows wings
- **0.99.0** — Light shafts: god rays for the out-of-doors
- **0.98.0** — The sky's drama: lightning & fireworks
- **0.97.0** — Luminous props & the light budget: spending scarcity
- **0.96.0** — Destructibles & the scoreboard: the bails fly
- **0.95.0** — Hazards & the pressure plate: phase C closes
- **0.94.0** — Pickups & markers: the furniture of a game loop
- **0.93.0** — Game feel: the world reacts, and the world remembers
- **0.92.0** — Three r185, and the reason a stone is cut
- **0.91.0** — applyEnvironment: give metal something to reflect

### 2026-07-27

- **0.90.0** — The physical tier
- **0.89.0** — The industrial six, and four new pieces of shader
- **0.88.0** — Wear: water, and it fills from the bottom
- **0.87.0** — The cricket ground, measured the way the laws measure it
- **0.86.0** — Clarity: water you can see the bottom through
- **0.85.0** — The shelf and the ripples
- **0.84.0** — The surf zone: breakers and the swash
- **0.83.0** — The beach kit: Miami
- **0.82.0** — The lagoon, cloth palms & the postcard
- **0.81.0** — The beach: the swash & the fifth field
- **0.80.0** — The singing bowl — the breath pulse
- **0.79.0** — The shala — a place to practice

### 2026-07-26

- **0.78.0** — Channel toggling: next/prev/onStation + a readable dial
- **0.77.0** — Track AR — the booth: web radio in a big woofer, and DJ tiles
- **0.76.0** — Track AQ — the PA: the first prop that reaches the ear
- **0.75.0** — Track W — plumbing: the first thing that is somebody else's fault
- **0.74.1** — Fix blank playground examples: the camera's far plane — scena3d 0.74.1
- **0.74.0** — The lit coast: a light is a fact about the observer — scena3d 0.74.0
- **0.73.0** — Small craft: the stability that walks, and the boat that comes back
- **0.72.0** — Working gear: a load that pulls back — scena3d 0.72.0
- **0.71.0** — Add the sea state — the sea remembers and the wind does not
- **0.70.0** — Add stabilisers, and make motion a field
- **0.69.1** — Put the ships back in the water: sinkage is a target, not a shove
- **0.69.0** — Add the hold — where you put it, and the fact that it can move
- **0.68.0** — Add the steam plant — a store, and the one control that gives you less
- **0.67.4** — Fix the oar's sweep, and derive the seat and the inboard from the handle
- **0.67.1** — Ease the oar's swing, so a body can follow the handle
- **0.67.0** — Add oars — a duty cycle, and the first thing that needs a crew
- **0.66.0** — Add mooring, fenders and the gangway — two frames that have to agree

### 2026-07-25

- **0.65.0** — Add sail rigs — why you cannot go where you are pointing
- **0.64.0** — Add vessels you can stand on — the deck as ground that moves
- **0.63.0** — Add smoke, and getting rid of it
- **0.62.0** — Add ingredients — the things the kitchen is for
- **0.61.0** — Add dressers, racks and rails — storage that shows
- **0.60.0** — Add the sink, and the washing-up
- **0.59.0** — Add cold storage, larder to freezer
- **0.58.0** — Add prep stations — two hands, two jobs
- **0.57.0** — Add cookware with contents that cook
- **0.56.0** — Add cooking heat, hearth to induction
- **0.55.0** — Add swimming pools
- **0.54.0** — Add showers, tubs and hot tubs
- **0.53.0** — Basins, taps and ewers across three eras
- **0.52.0** — Water in motion — the layer the bathroom set needs
- **0.51.0** — Plants, soft furnishing and paper
- **0.50.0** — Vessels and clutter — the layer between props and nothing
- **0.49.0** — Dress — putting things down the way a person would
- **0.48.0** — Wall art, and somewhere to hang it
- **0.47.0** — Smart fixtures and a desk set
- **0.46.0** — Terminals — the first props you have to queue for
- **0.45.0** — Phones and watches
- **0.44.0** — Screens — the light a modern room is actually lit by

### 2026-07-24

- **0.43.0** — Ladders and tack — things a character meets
- **0.42.0** — Gatherings — several people to one prop
- **0.41.1** — Cookpot: move the stir slot closer so the ladle reaches into the pot
- **0.41.0** — Work stations: rhythmic action props that produce a resource
- **0.40.1** — Fix carryable hold point: push front-hug props forward so they clear the body
- **0.40.0** — Carryables: props a character picks up and carries
- **0.39.0** — Manipulables: stateful props that animate when operated
- **0.38.0** — Watercraft: boats and ships that ride the sea
- **0.37.0** — Vehicles: car, bike, tractor, truck with live running gear
- **0.36.0** — Stations + interaction slots: treadmill, guitar, bathroom

### 2026-07-23

- **0.35.0** — createHighrise: instanced towers + the night skyline
- **0.34.0** — createBungalow + the urban palette
- **0.33.0** — Modern components: railings, glazing, gates, cladding, pergola
- **0.32.0** — Modern surfaces + architectural glass
- **0.31.1** — Step the hearth marker back off the hearthstone
- **0.31.0** — furnishRoom: role-based interiors + trade utilities
- **0.30.0** — Furniture: the cottage set
- **0.29.0** — Interiors: createRoom shell + createInteriorLight daylight
- **0.28.0** — Add billboard impostors + treeLOD for dense giant forests
- **0.27.0** — Add createSeasons — a cross-fading season controller for foliage
- **0.26.0** — Tree species (tier 3): sequoia, banyan, baobab, acacia + biomes
- **0.25.0** — Tree species (tier 2): sakura, palm, willow + season & petal-fall
- **0.24.0** — Tree species (tier 1): cypress, birch, cedar, maple + species registry
- **0.23.0** — Add underwater bubble columns + water colour grading
- **0.22.0** — Wire storm surge: weather.storminess → ocean.storm
- **0.21.0** — Add createWeather: cross-fading weather controller
- **0.20.0** — Add underwater: god rays + caustics (createGodRays, createCaustics)
- **0.19.0** — Add createHerd: quadruped fauna (deer & sheep) grazing over terrain
- **0.18.0** — Fauna flocks — boids of birds & fish
- **0.17.0** — Gerstner-wave sea — swell, foam, shore & buoyancy
- **0.16.0** — Rain & snow — GPU precipitation that settles
- **0.15.0** — WindField & wind-driven flora — a world that breathes
- **0.14.1** — Highp world-space noise — stop the surface swimming on mobile
- **0.14.0** — Wire the new surfaces into buildings — varied houses, mossy ruins
- **0.13.0** — Snow/moss cap + emissive glow — lava, crystal, winter roofs  *(not published)*
- **0.12.0** — Masonry tiling — brick, cobblestone, ashlar, floor tile, shingle  *(not published)*
- **0.11.0** — Tier-1 surface palette — 15 new presets + per-preset baseColor  *(not published)*
- **0.10.0** — Stylised signposts & carved lettering  *(not published)*

### 2026-07-22

- **0.9.0** — Bunting, fountains & carts — a village fair
- **0.8.0** — Braziers & campfires — flickering firelight and a live flame  *(not published)*
- **0.7.0** — Waving flags, banners & pennants — real cloth on a pole  *(not published)*
- **0.6.0** — Market stalls & statues — two lifelike prop families  *(not published)*
- **0.5.0** — Procedural surfaces — low-poly props that out-look GLTF  *(not published)*

### 2026-07-21

- **0.4.0** — V0.4.0 'The Blueprint': scene manifests, kits, markers, scatter LOD
- **0.3.0** — V0.3.0 'The Settlement': buildings, ruins and a village generator
- **0.2.0** — V0.2.0 'The Living World': day-night cycle, water, wind, paths, grass  *(not published)*
- **0.1.0** — SCENA v0.1.0: seeded procedural worlds for three.js, GAMA-aware
