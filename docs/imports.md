# What an import costs

```ts
import { createCrate } from 'scena3d';          // 11 kB gzipped
import { createCrate } from 'scena3d/props';    // 11 kB gzipped — the same
```

Both are fine. The root import is not a penalty, and the sub-paths exist for
reasons that are not what you would guess.

## The seven entry points

| | |
|---|---|
| `scena3d` | everything. Unchanged, and still the right default |
| `scena3d/core` | `Rng`, noise, `PALETTES`, and the structural types — `Obstacle`, `Prop`, `PropSlot`, `PropSurface`. 1.2 kB |
| `scena3d/materials` | `createSurface`, `SURFACE_PRESETS`, `createGlass`. 9.3 kB |
| `scena3d/text` | lettering from the embedded vector font. 2.1 kB |
| `scena3d/props` | the prop library — 76 modules |
| `scena3d/environment` | sky, terrain, weather, ocean, wind, seasons, light, acoustics |
| `scena3d/scene` | `buildScene`, kits, scatter, settlement generators |

They are **generated** from the root barrel by `scripts/entries.mjs`, and
`npm run entries:check` runs in CI. A sub-path that silently lacked a prop the
root exports would be worse than no sub-path at all, and hand-maintaining seven
barrels against one is a promise nobody keeps.

## The real reason they exist

Not "so you can import less" — the root already tree-shakes. This was measured
rather than assumed, and the assumption was wrong.

`createCrate` cost **20 kB** gzipped from the published package and **11 kB**
from the same code built from source. Importing via `src/index.ts` gave the
same 11 kB as importing `src/props/crate.ts` directly, so the barrel was not
the problem: esbuild shakes it perfectly.

The problem was the build. `tsup src/index.ts` flattens 122 modules into one
file, and **module boundaries are where a bundler's tree-shaking gets its
granularity**. Once they are gone, declarations that were separately droppable
end up sharing scopes and survive together. `--splitting` does not help with a
single entry point: there is nothing to split against.

Building the six sub-path entries alongside the root is what forces the split.
The published package now has chunks, and **the root import dropped from 20 kB
to 11 kB for every consumer who changed nothing.** The sub-paths are the
mechanism; the cheaper root import is the benefit.

A library's published shape is not its source shape. Only measuring the
artifact your users install tells you which one they get.

## Keeping it

`npm run size` bundles a handful of realistic imports with esbuild, `three`
external, and checks each against a committed ceiling:

```
probe                  raw      gz  budget  headroom
crate                  36k   11.1k     13k  +1.9k    one prop, root import — the canary
crate (sub-path)       36k   11.1k     13k  +1.9k    same prop via scena3d/props
core                    2k    1.2k      2k  +0.8k    Rng, noise, palettes, types
text                    5k    2.1k      3k  +0.9k    the embedded vector font
surface                32k    9.3k     11k  +1.7k    the material tier alone
village                53k   17.1k     20k  +2.9k    house, tree, terrain, sky, scatter
everything            576k  199.9k    215k  +15.1k   the whole library, for scale
```

Ceilings rather than exact baselines, because bytes move by a few dozen when
esbuild is upgraded and a gate that fails on a dependency bump gets switched
off. Headroom is 15–20% on purpose: the first draft of these budgets was so
loose that four of the seven probes could have **tripled** without failing, and
a budget nothing can breach is worse than no budget because it looks like
protection.

Reverting the build to a single entry point produces the full diagnosis, which
is what a gate is for:

```
  OVER  crate: 19.5 kB gzipped, budget 13 kB
  OVER  village: 24.9 kB gzipped, budget 20 kB
  MISS  crate (sub-path): Could not resolve dist/props.js
  MISS  core: Could not resolve dist/core.js
```

## What this does not fix

**`scena3d/materials` is still 9.3 kB for any surface at all.** Two probes in
`npm run size` say where it goes, and the answer is not the one this section
used to give:

```
  surface           9.3 kB   the material tier: shader + factory + every preset
  surface presets   2.8 kB   the table alone — asking for ONE preset drags all 58
```

`SURFACE_PRESETS` really is unshakeable: it is a single record covering every
kind, a bundler cannot tree-shake properties out of one object literal, and
`createSurface('wood')` resolves its kind at runtime, so every preset has to be
reachable. Importing `SURFACE_PRESETS.wood` costs the same 2.8 kB as importing
the whole table, which the second probe pins.

But that is **2.8 kB of 9.3**. The other ~6.5 is the surface shader and the
factory around it, and no import shape can shake those — every surface needs
the same GLSL. This section previously blamed the whole 9.3 kB on the preset
table and proposed a value-taking form (`createSurface(WOOD)`) as the fix. That
form would work, and it would take a one-surface import from 9.3 kB to about
6.7 — roughly a quarter, not the near-elimination the old wording implied. At
58 presets that is 58 new public exports for 2.6 kB, and the trade is a good
deal worse than it read.

Measured before writing, which is the only reason the number is right: the
floor was found by cutting the preset table down to a single entry in a scratch
copy of the source and re-bundling. There is no committed probe for it, because
a probe running against `dist/` cannot remove a table from the source — the
first attempt imported `createSurface` and one preset together, read 9.3 kB,
and was the `surface` probe under another name.

So the real target is the shader, not the table, and that is a larger and
riskier change: splitting the GLSL into chunks a preset opts into, so a `wood`
surface stops carrying the masonry tiling, the snow cap and the emissive glow
it never uses. Not in this release either — but now it is the right thing that
is missing, rather than the wrong one.
