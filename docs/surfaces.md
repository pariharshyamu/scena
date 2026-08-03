# Procedural surfaces

The reason low-poly SCENA props can look **richer than a downloaded GLTF at a fraction of the bytes**. A model from an asset store ships baked albedo, normal and roughness textures — often megabytes per prop, and every copy identical. `createSurface` generates that same detail in the shader from triplanar noise: weathered stone, wood grain, mottled plaster, straw thatch, ridged clay tile. Nothing is fetched, and every prop weathers uniquely.

```js
import { createSurface } from 'scena3d';

mesh.material = createSurface('stone', { color: 0x8a8f98 });
```

## Why it stays cheap and correct

It is a **plain `MeshStandardMaterial`** patched through `onBeforeCompile`, not a bespoke `ShaderMaterial`. That distinction is the whole point:

- Full PBR lighting, shadows, tone-mapping and **fog** keep working untouched.
- SCENA's day/night `emissiveIntensity` dimming still applies (a surface's emissive is black, so it never accidentally glows).
- **Triplanar** sampling means no UVs are needed — a `BoxGeometry` has none worth using — and because the noise is read in *world space*, a wall built from several abutting boxes reads as one continuous stone face with no seam.
- Every surface material injects identical shader source (the differences ride in uniforms), so a `customProgramCacheKey` groups them into **one GPU program** — eight presets, three programs, not a pipeline explosion. It also keeps them from colliding with a plain standard material that happens to share base parameters.
- It rides the `USE_INSTANCING` path, so `scatter`'s `InstancedMesh`es wear surfaces too — one shared material, and each instance still looks different because the noise is sampled at its own world position.

## What the shader adds

From one triplanar fractal-noise field per fragment: fine albedo mottle, low-frequency **cavity ambient occlusion**, a cavity tint, roughness variation, and view-space **normal perturbation** (three's `perturbNormalArb`, driven by the noise height) for real surface relief. Wood-family presets add anisotropic **grain** rings around a configurable axis.

## Presets

| Preset | Use |
|---|---|
| `plaster` | lime-washed cottage walls — soft warm mottle, gentle relief |
| `stone` | weathered masonry — strong cavity AO, mossy tint, pitted relief |
| `wood` | structural timber — pronounced grain rings |
| `plank` | sawn boards — finer, straighter grain |
| `thatch` | straw roofing — busy fibrous streaking, deep shadow |
| `tile` | clay roof tiles — regular ridged rows |
| `metal` | aged iron — metallic, mild mottle |
| `dirt` | packed earth — broad soft patches |
| `sand` | dune / beach ground — fine grains, soft wind ripples |
| `gravel` | paths & riverbed — chunky faceted stones, strong relief |
| `mud` | wet churned ground — dark damp patches with a sheen |
| `sandstone` | warm desert stone — soft, faintly streaked |
| `granite` | speckled hard stone — mineral fleck, a hint of polish |
| `slate` | dark blue-grey plates — flagstone, roofing |
| `bark` | tree bark — deep vertical ridges |
| `leather` | hide & straps — soft mottled grain, gentle sheen |
| `canvas` | tents, sails, sacks — fine directional weave, matte |
| `parchment` | signs & scrolls — near-white with foxing stains |
| `terracotta` | unglazed clay — warm pots, urns, tiles |
| `bone` | ivory & ossuary — off-white with cavity staining |
| `rust` | corroded iron — patchy orange, part-metallic |
| `bronze` | bells & statues — warm dark metal, patina in cavities |
| `brass` | fittings & instruments — bright warm metal, shinier |
| `brick` | fired brick in running bond — pale mortar, per-brick variation |
| `cobblestone` | rounded setts — wide earthy joints, streets & yards |
| `ashlar` | large squared blocks — tight joints, castle walls |
| `floortile` | aligned square flags — dark grout, halls & plazas |
| `shingle` | overlapping wooden shingles — grain, deep shadow lines |
| `snow` | fresh snow over cold rock — white on the up-faces, stone on the sides |
| `moss` | moss creeping over a boulder — green growth on the tops |
| `lava` | cooling basalt — molten glow up through the cracks |
| `crystal` | glowing faceted mineral — lit from within |

Every preset also carries a **`baseColor`**, so `createSurface('sand')` looks like sand with no colour passed. A caller's `color` always wins:

```js
createSurface('bronze');                 // natural bronze
createSurface('bronze', { color: 0x9c8f74 }); // a greenish patinated bronze
```

Pass a preset name plus any overrides:

```js
createSurface('wood', {
  color: 0x8a6642,
  seed: 12,        // shift the noise field so equal colours weather apart
  bump: 0.2,       // relief strength
  roughness: 0.7,
  grainAxis: new Vector3(0, 1, 0),  // grain runs vertically (a post)
});
```

`SURFACE_PRESETS` exposes every preset's parameters if you want to read or tweak the defaults directly.

## Tiled masonry

The `brick`, `cobblestone`, `ashlar`, `floortile` and `shingle` presets add a **mortar grid** on top of the noise. It's the same shader — the grid is computed from a handful of extra uniforms, so tiled and untiled surfaces still share **one GPU program**.

The grid is drawn on the **dominant-axis face** of the geometry (so a `BoxGeometry` wall, floor and roof each get a clean 2D pattern) and it's laid out in **world space** — meaning several abutting boxes read as one continuous wall, with the courses lining up across the seams rather than restarting per box. Each cell darkens and recesses to the mortar colour (a real groove via normal perturbation), rows offset for running bond, and every brick/stone takes a small per-cell shift in brightness and roughness so no two look stamped from the same mould.

Because it's just parameters, you can tile *any* surface — turn sandstone into a block wall, or dial your own courses:

```js
createSurface('sandstone', {
  tile: 1,            // turn the grid on
  tileW: 0.6, tileH: 0.3,   // block size in metres
  mortar: 0.02,       // joint width
  bond: 1,            // 0 = aligned grid, 1 = running bond
  round: 0,           // 0 = flat blocks, 1 = domed cobbles
  mortarColor: 0x8a8578,
});
```

## Snow, moss & glow

Two more opt-in modifiers ride the same shader, both reusing noise it already sampled (so they cost almost nothing when off):

**Cap** — snow, moss or dust that settles on the **up-facing** faces. The mask comes from the world normal's `y`, with its edge broken up by the surface noise so it never draws a clean line, and it sits *over* everything else (it covers the mortar of a tiled roof too). `snow` and `moss` are the presets, but you can cap anything:

```js
createSurface('tile', { cap: 0.9, capColor: 0xf4f8fc, capUp: 0.2 }); // snow on a roof
createSurface('ashlar', { cap: 0.6, capColor: 0x40592a });           // a mossy wall
```

`capUp` controls how up-facing a face must be before the cap takes (low = down the shoulders too, high = only dead-level tops); `capRough` sets how matte the capped area reads.

**Glow** — emissive light drawn **straight into the radiance**, not via `material.emissive`. That's deliberate: the day/night cycle scales `emissiveIntensity`, so a normal emissive would dim at dusk — the glow ignores it and burns constant, like real lava. `glowThreshold` decides how much emits: low keeps it to the deep cracks (`lava`), high lights most of the surface (`crystal`).

```js
createSurface('stone', { glow: 2.5, glowColor: 0xff5a1e, glowThreshold: 0.3 }); // glowing cracks
```

Because glow lives outside `material.emissive`, every surface — including `lava` — still reports a **black emissive**, so nothing here trips the day-cycle's lamp handling.

## Modern & machined

Thirteen Tier-4 presets take the same shader into the present day — for bungalows, towers and everything `createRoom` builds when it grows up:

| Preset | Reads as |
|---|---|
| `concrete` | fair-faced grey with **shutter-panel joint lines** (the tiling grid, dialed way down) |
| `paint` | modern render — almost featureless on purpose; colour it anything |
| `marble` | near-white slab with dark warped **veins** (the grain machinery at very low frequency), glossy |
| `terrazzo` | a cement field packed with tiny per-cell chips, a share in the accent tint |
| `steel` | brushed stainless: fine directional streaks, cool, semi-gloss |
| `chrome` | near-mirror trim (stylized — the lighting rig does the selling) |
| `paintedMetal` | powder-coat for gates, frames and railings — colour from the palette |
| `corten` | the even architectural oxide bloom, calmer than `rust` |
| `teak` | oiled decking/furniture wood under a varnish sheen |
| `porcelain` | large-format floor **tile**: big slabs, hairline grout, offset courses |
| `glaze` | vitreous sanitaryware — one unbroken glossy skin, **no tiling**. Baths and basins |
| `mosaic` | tiny gridded tesserae with **accent-tint chips** — pools, feature walls |
| `parquet` | narrow varnished planks in alternating **±45° chevron bands** |
| `patternedTile` | cream cement tiles each stamped with a **ring-and-dot motif** in the tint |

Three small pattern controls power the new looks, and — like everything here — they're plain uniforms you can turn on for *any* kind: `tileTint` (fraction of cells painted solid tint — mosaic chips), `chevron` (shear alternate column bands ±45° — herringbone/chevron lays), and `motif` (a per-cell ring + dot painted in the tint — patterned cement tiles).

### Glass: createGlass

Architectural glass is its own material, not a preset — `createGlass()` returns a transparent `MeshStandardMaterial` with two tricks patched in: **fresnel opacity** (see-through face-on, mirror-like edge-on, exactly how glass reads in life) and a **built-in procedural sky reflection** sampled from the reflected view ray — an environment map's worth of glassiness with zero setup.

```js
const clear   = createGlass();                        // cool clear
const bronze  = createGlass({ tint: 0xc8a878 });      // bronze facade glass
const bath    = createGlass({ frosted: true });       // milky translucent
const window_ = createGlass({ nightGlow: true });     // ignites at dusk
```

`nightGlow` follows the house-window convention: the emissive sits at the intensity `createDayCycle` scans for, so listing the pane's building in the cycle's `lamps` makes the glass burn warm at night — the lit-window skyline, free. Try `?t=0.95` in the **Modern materials** playground.

## The industrial six

Six kinds and four new pieces of shader, all of them off by default and all of them costing a single compare when they are:

| | what it needed |
|---|---|
| `corrugatedIron` | ribs, plus a rust crust in the valleys |
| `asphalt` | hard-edged aggregate |
| `diamondPlate` | crossed ribs |
| `galvanised` | Voronoi cells — the zinc spangle |
| `copperPatina` | a crust that takes the metalness with it |
| `basalt` | Voronoi cells, laid out in plan |

### Ribs, in the face's own plane

`ribs` is a wave of parallel ridges — the reason a flat plane reads as a *roof* from fifty metres, and why corrugated iron is the most recognisable industrial material there is. `ribCross` lays a second set across the first and takes the **minimum**, so the two are high together only where they actually cross: a field of studs, which is tread plate.

Ribs are laid out in the **face's** plane, like the masonry grid, not along a world axis. That is not a stylistic choice — two world axes that differ in space collapse onto the same direction once projected onto a wall, which turns a crossed tread plate straight back into plain stripes. `ribTurn` rotates them 90° on the face.

### Aggregate has edges

Everything else in this shader runs on smooth fbm, which reads as mottling. Asphalt is **stones in tar**, and stones have edges — so `speck` comes from cell noise, hard-stepped, and that is the whole difference between a road and a mud flat.

### Cells: one function, two orders of magnitude

`cells` is a warped Voronoi returning a per-cell hash and the distance to the nearest seam (the F2−F1 distance, so the seam doesn't care how big the cells are). The columnar jointing of basalt and the zinc spangle on galvanised steel are that one function at very different scales.

`cellPlan: 1` lays the cells out **in plan and extrudes them vertically**, whatever the face is pointing at — because columnar jointing is crazy paving seen from above, pulled up into columns. Project it per-face instead and a cliff gets blotches rather than columns.

One tuning note learned the hard way: real zinc spangle is millimetres across, but a crystal too small to resolve is not a crystal — it is per-pixel noise, and on a metal that is a sparkling mess. The preset uses grains you can actually see.

### Crust is not a tint

`crust` grows in the cavities and on the up-facing side: verdigris, a rust bloom, lichen. Where it takes hold it **zeroes the metalness**, because a mineral scab does not reflect like the metal it grew on. That is the difference between patina and green paint, and it is why a green copper roof is matte where the copper beside it is not.

> Metals need an environment map to reflect. `galvanised`, `diamondPlate` and `copperPatina` are deliberately kept off full metalness so they still read under a plain directional light — a scene with no IBL renders a mirror as black.


## Metal needs something to reflect

A metal has **no diffuse colour**. Everything you see on it is a reflection — so a metal in a scene with nothing to reflect renders black. That is not the material being broken; it is the material being right about a world with no sky in it.

`createSky` draws a beautiful gradient dome, and it does not help at all: a dome is *geometry*, and three cannot reflect geometry. Reflection needs an environment map.

```js
const rig = createLightingRig('day');
scene.add(createSky({ palette }).mesh, rig.group);
applyEnvironment(scene, { palette, sun: rig.sun });   // now chrome is chrome
```

`applyEnvironment` paints the **same gradient the sky is drawing** into a tiny equirectangular `DataTexture` — sky above, ground bounce below, and the sun burned in where the lighting rig actually put it. Nothing is fetched and nothing is loaded, which is the same bet the rest of the library makes; three PMREM-filters it on first use, so rough surfaces get a blurred version and polished ones a sharp one.

Three details that matter more than they sound:

- **The ground half is not decoration.** A sky-only hemisphere leaves the underside of everything metal a black hole. Light bounces; it does not stop at the horizon.
- **The sun has to be in the right place.** A sky with no sun gives polished metal an even sheen and no highlight, which reads as plastic — and a highlight in the *wrong* place is worse than none, because it disagrees with every shadow in the scene. Pass the rig's own light and they agree by construction.
- **An environment is ambient light with a direction**, so it does the job the rig's flat `AmbientLight` is standing in for. Leave both at full strength and the scene washes out. Either drop `intensity`, or dial the rig's ambient back — the example does the latter, in both halves, so the only difference between them is the one line.

It affects every PBR material in the scene, not just the metals, and that is the point: `applyEnvironment` is what the whole catalogue was quietly missing. `chrome`, `steel`, `brass`, `galvanised`, `diamondPlate`, `copperPatina`, `brushedMetal` and `nacre` all read properly with it and are all compromised without it — which is why the presets ship at conservative metalness, so they still look like something under a bare directional light.

`refresh()` re-paints it when the sun moves or the palette changes (a day cycle wants this); `dispose()` takes it off the scene.

### When only some things should reflect

`scene.environment` **cannot be opted out of by a single material**. three overwrites `material.envMapIntensity` with `scene.environmentIntensity` for every material that has no `envMap` of its own, so setting it to zero on one material does nothing at all. Use `createEnvironmentMap` and hand the texture out yourself:

```js
const map = createEnvironmentMap({ palette, sun: rig.sun });
chrome.envMap = map;      // this one reflects
plaster.envMap = null;    // this one does not
```


## The physical tier

Six surfaces defined by a light response `MeshStandardMaterial` has no term for. These are the only kinds in the catalogue that build a **`MeshPhysicalMaterial`** — the other 52 keep the cheap material they have always had, and a test walks all of them to prove it.

| | the term | why nothing else gets you there |
|---|---|---|
| `velvet` | `sheen` | dark head-on and bright at every grazing edge — the rim *is* the material |
| `silk` | `anisotropy` | a stretched highlight instead of a round one |
| `brushedMetal` | `anisotropy` | the linisher went one way, and the streak is all that separates it from plain steel |
| `nacre` | `iridescence` | thin-film interference: the hue depends on the film's thickness and your angle |
| `ice` | `transmission` | light goes *through* |
| `gemstone` | `dispersion` | a different index of refraction per wavelength: white light in, colour out |

```js
createSurface('velvet', { color: 0x243b6b });   // that is all
```

Everything else still applies: they are seeded, they weather, and rain still soaks them.

### Why a stone is cut

Glass and diamond are both transparent. The difference you can see across a room is **dispersion**: a real transparent solid bends every wavelength by a slightly different amount, so a beam of white light comes out of it separated. Facets exist to make that happen more often.

three refracts red, green and blue separately over `ior ± (ior − 1) × 0.025 × dispersion` — note the IOR is in there twice, so the same `dispersion` setting on a window's 1.5 throws a fraction of the colour it does on a gem-grade 2.2. `gemstone` ships at `ior: 2.2, dispersion: 14` — a shade past physical, so the fringe reads at a glance rather than only under a zoom.

Two things make it read, and both are on the caller as much as the preset:

- **Facets.** `gemstone` sets `flat: true` and no bump at all, so a low-poly solid — `OctahedronGeometry` is literally the shape — shades as a cut stone. Give it a smooth sphere and the same material is a marble.
- **Something hard-edged behind it.** Dispersion *separates* colours; a smooth sky gradient has nothing to separate. Put a bright edge behind the stone and the rainbow appears along it.

It is view-dependent, so a still gem hides what a turning one shows.

### What it costs

A physical material is a bigger shader, and **`transmission` makes three render the scene a second time** into a buffer. That is why `createGlass` fakes its glass rather than transmitting it, and why only `ice` and `gemstone` switch transmission on — a tier that enabled it for a fabric would be a performance bug wearing a material's clothes. `dispersion` costs more again: it samples that buffer once per colour channel instead of once, and it is only switched on where it is the entire point. Use these on **objects**, not on facades.

Two programs, not fifty-eight: every standard surface compiles to one, every physical surface to the other.

### The honest limits

Both of these are three's, not scena's, and they are worth knowing before you reach for the tier:

- **Anisotropy follows the geometry's UVs.** A mesh with no UV attribute will not show a streak at all, and a box shows it per-face.
- **Iridescence and metals want an environment map.** Iridescence is strongest over a metallic F0 — but a metal with no environment to reflect renders as dead grey, which is exactly what happened the first time `nacre` was tuned at `metalness: 0.6`. It ships at 0.2 over a pale pearl with a thick film instead, so the highlight is visibly coloured under nothing but a directional light. Give the scene an envMap and it will sing properly.

One more thing a render taught: **fine noise plus bump is specular aliasing on curved geometry.** The industrial six were shot on flat boxes and got away with a `scale` of 40; the same values on a sphere are pixel confetti. The physical presets all run coarse noise and almost no bump, and let the physical term carry the character.


## Wear: rain on everything

`wet` is a **state, not a kind**. Every one of the presets above can be rained on, and the catalogue does not grow by one entry to make it happen:

```js
createSurface('cobblestone', { wet: 0.9 });   // just rained
```

Water behaves the same way on all of them, and it does three things — because darkening alone is the cheap version that reads as "somebody multiplied the colour":

- **the albedo darkens**, because water fills the pores: light gets in, scatters, and comes back out with less of it. So the darkening scales with how *porous* the surface is — a wet flagstone is nearly black, wet glaze is just glaze, and metal, which has no subsurface to wet, does not darken at all;
- **the roughness collapses** to a film, which is a mirror whatever is underneath it;
- **the relief flattens**, because standing water fills the micro-bumps: the puddle is smooth even where the stone is not.

### Water fills from the bottom

The part that makes it read as weather rather than as a tint: wetness is a **level**, not a multiplier. Every point on the surface has a height — its own low-frequency noise band, with the mortar joints counted as the lowest ground there is — and it is wet when the level is above it.

So a light shower puts dark, glossy water in the joints and the hollows and leaves the faces dry; a downpour sheets the whole wall. One scalar, and the in-between states are the interesting ones.

The level is lower on a vertical face than a horizontal one, because rain falls down — a sill soaks while the wall beneath it is merely damp. `wetCling` sets how much: 0 wets only the tops, 1 wets a wall as fast as a floor, and the default is 0.55. Sealed, shedding surfaces want less; things that wick (plaster, concrete, canvas) want more.

### Driven by the rain

```js
const rain = createPrecipitation({ type: 'rain', wind });
scene.add(rain.object);
rain.soak(scene, { max: 0.95, rate: 0.3, dry: 0.06 });
```

`soak` is rain's counterpart to snow's `accumulate`: it finds every surface material under `target` and drives its wetness from how hard it is actually raining. Ease off to a drizzle and the surfaces settle at the drizzle's level, not at zero.

**Drying is deliberately much slower than wetting** — a fifth of the rate by default. A wall soaks in a minute and takes an hour to come back, and a street that goes dry the instant the rain stops reads as a bug rather than as weather.


## Adopted by the props

`createHouse`, `createTower`, `createWell`, `createRuin`, `createRock` and `createCrate` are built on surfaces out of the box — plastered walls, tiled roofs, stone foundations, planked doors, grained crates. Their emissive windows are left as ordinary materials so the day-night cycle still lights them at dusk. Try the **Procedural surfaces** playground example to see the whole preset palette beside the props that use them.
