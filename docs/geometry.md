# What a prop costs to draw

SCENA already gates bytes — [`npm run size`](imports.md) holds each import
under a ceiling. This is the other cost, the one a player pays sixty times a
second rather than once at load:

```
npm run geometry            check every prop against its budget
npm run geometry -- --why   name the redundant materials
npm run geometry -- --json  the numbers, for a script
```

```
  prop          draws  budget  used   geos   tris  budget   mats  anim  dup
  --------------------------------------------------------------------------
  crate            13      16   81%     13    156     200      2     0    0
  stall            43      52   83%     43    636     800     10     0    0
  bungalow         55      66   83%     55    712     900     19     0    2
  car              22      27   81%     20   1004    1250     10     0    0
```

| | |
|---|---|
| `draws` | meshes the renderer submits. An `InstancedMesh` counts **once**, however many instances it carries |
| `geos` | distinct `BufferGeometry` instances — GPU buffer allocations |
| `mats` | distinct `Material` instances the renderer has to bind |
| `anim` | of those, how many own animated state and so cannot be shared |
| `dup` | material objects identical to another one in the same prop |

These are integers, not timings. They do not move unless behaviour moves, so
they are compared exactly and there is nothing to argue with — no noise, no
rerun-until-it-passes.

## Redundant is not always waste

A material that owns animated state **cannot** be shared. SCENA's flowing
water and waving cloth each carry their own `uFlowTime` / `uWaveTime`, so a
fountain's eight spouts need eight materials; sharing one would lock them into
unison, which looks mechanical, and is precisely why they were built that way.

So a material carrying a `*Uniforms` key in `userData` is **exempt** — by that
rule, rather than by a hand-maintained list of exceptions that would rot. If
you build a prop whose material genuinely must not be shared, put its state
there and the gate will understand.

Two props composed into one — three `createModernWindow` calls inside a
bungalow — are also not waste. Each is independently owned, and sharing across
them would mean tinting one window tinted all three. Those carry a declared
`redundant: N` in the budget table with the reason written next to it.

Everything else is a material built inside a loop that did not need to be, and
the budget for it is zero.

## `sharedBy`

The fix, when the gate does fire:

```ts
const matte = sharedBy((color: number) =>
  new MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }));

for (const loaf of loaves) group.add(new Mesh(geometry, matte(loaf.color)));
```

Call it **inside the factory**, never at module scope. The cache has to live
for one prop; a module-level one would hand the same material to every crate in
the world, and the first game to tint one crate would tint all of them.

## What it found

- **A glass railing built one material per bay.** Seven identical panes, seven
  materials for the renderer to bind separately. One glass now glazes the run.
- **A car built one rubber per wheel and one lens per lamp.** Four tires from
  the same compound, two headlamps and two tail lamps: five materials that
  needed to be two. `createCar` went from 15 material instances to 10.
- **A stall built one material per loaf.** `matte(rng.pick(BREAD_COLORS))`
  inside the loop, drawing from a palette of four — 18 instances for 8 distinct
  materials.

## The bug in the gate itself

The first version read only the standard material fields, and reported 34
redundant materials. Twenty of those were false.

`createSurface` keeps its real parameters in a uniform bag on
`userData.scenaSurface`, and the **seed lands there** as `uSurfSeed` — a large
world-space offset that makes two same-coloured surfaces weather apart. Two
`wood` surfaces built with different seeds look identical to any check that
reads `color` and `roughness`, and visibly different on screen.

It nearly cost three market baskets their variety: the "fix" for that false
positive collapsed a stall's three per-basket wood surfaces into one, which
would have stamped them out identically. The gate now hashes every uniform bag
it finds, and `tests/shared-materials.test.ts` asserts the baskets still carry
three distinct `uSurfSeed` values — a counter-invariant, guarding the fix from
its own gate.

The lesson is not subtle and it is worth writing down: **a measurement that
disagrees with the code is a claim about the code, and it can be the
measurement that is wrong.** Check which before you change anything.

## What these numbers are not

**They are not a claim the current cost is right.** It is not. Most SCENA props
are a tree of individual boxes, one draw call each — a crate spends 13 draw
calls on 156 triangles, a bungalow 55. Merging same-material parts into one
`BufferGeometry` would collapse most of these by an order of magnitude.

That is its own piece of work. The `draws`, `geos` and `tris` budgets are
ceilings on today's cost, sized to stop a prop quietly doubling, and this gate
is what will show the merge landing when it does.
