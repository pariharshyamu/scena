# The lagoon, cloth palms & the postcard

The beach the postcard is actually of: a big, calm, **swimmable** basin of turquoise water — the sheltered pool behind the reef — with the open ocean out on the horizon where it belongs. Not surf at your feet: a distant blue band.

```js
import { createLagoon, createPalm, createBananaTree } from 'scena3d';

const lagoon = createLagoon({ seed: 7, radius: 9.5, fish: 14 });
scene.add(lagoon.object);
game.onUpdate((t) => lagoon.update(t.delta));
```

## The lagoon

Three honest layers:

- **the bowl** — pale wet sand, visible through the water, because clear water IS its bottom. Deepest a little off-centre, the way real pools are, with a wading shelf at the rim. The outline is a seeded radial wobble — never a circle, never the same pool twice.
- **the surface** — vertex-coloured from pale at the rim to turquoise over the deep, translucent, breathing with two slow crossing ripples centimetres tall.
- **the fish** — small, colourful and busy: each on a seeded elliptical circuit of its own, wiggling as it goes, following the sand up over the shelf and never beaching (clamped between just-under-the-surface and just-above-the-bottom, tested for thirty simulated seconds).

A **sand apron** — a low berm around the rim — seats the pool into any ground plane with no coplanar seam. (The first build z-fought a flat ground into mottled patches; the apron is the screenshot-found fix, now part of the prop.)

### Swimmers drop straight in

The lagoon is structurally ANIMA's `WaterBody` — `surfaceY`, `depthAt(x, z)`, `disturb()` — so a `Swimming` character needs no adapter: hand them the lagoon and they swim. `depthAt` is world-space and rides the prop's transform.

## The cloth trees

A palm frond is, mechanically, a **flag pinned at the stem** — fixed at one edge, free at the fly, rippling in the air, drooping under its own weight. So the tropical trees borrow the banner machinery wholesale: every leaf is a tapered plane driven by the shared cloth-wave shader, each with a seeded phase of its own so no two leaves flutter in step. Rigid leaves read as plastic; fabric reads as alive.

- **`createPalm`** — a coconut palm: a trunk that *curves* into its seeded lean (a straight palm reads as a lamp post), a fountain crown — upper fronds reaching, lower ones hanging — and coconuts at the throat.
- **`createBananaTree`** — a banana plant: green pseudostem, huge paddle leaves arching up and over, each leaf built as **three cloth strips side by side** — banana leaves split along their veins, and the strips fluttering out of phase with each other *is* that split. About half of them (seeded, or `fruiting`) hang a bunch.

Both are `update(dt)`-driven: the cloth clock advances, and the whole crown breathes a little on top of the flutter.

## The postcard

See the **beach** playground: the lagoon front and centre, dunes holding it, cloth palms leaning over the water, bananas in the lee, a small fishing boat (`createSmallCraft`) hauled up on her bilge, and the ocean pushed out beyond the dunes — sized and placed so no crest can ever poke up through the beach. The GAMA camera frames it **front on**: pool in the foreground, greenery behind, the sea on the horizon.
