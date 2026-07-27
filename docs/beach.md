# The beach — the swash & the fifth field

A beach is an edge, not a place. Dry sand is terrain and the sea already ships; what makes a beach *read* is the strip between them — the **swash**, the tongue of water that runs up the sand and drains back, and the memory it leaves.

```js
import { createBeach, createOcean } from 'scena3d';

const beach = createBeach({ seed: 7, width: 60,
  water: (x, z, t) => ocean.heightAt(x, z, t) });   // the swash runs on the real swell
const ocean = createOcean({ shore: beach.heightAt }); // the sea fades over the real sand
game.onUpdate((t) => { ocean.update(t.delta); beach.update(t.delta); });
```

## `wetAt` — the fifth spatial field

After `depthAt`, `heatAt`, `chillAt` and `smokeAt`: **`wetAt(x, z)` → 0..1**, how wet the sand is at a world point. Under the water it is 1; where a tongue has just drained it is 1 and *drying* — linearly over `dryTime` (default 30 s) — and the sand shader reads the same record: wet sand darkens, and the freshest band (wetness > ~0.75) goes near-mirror, which is the sheen that makes a beach photograph like a beach.

The swash itself is simulated per shore segment (48 of them): the water height is sampled at the line, run-up momentum carries the tongue past the static intersection (about 1.6×), the backwash bares extra sand below the still-water line, and the edge *chases* its target because even an inch of water has inertia. Each retreat strands a **foam scrap** at its high point that pops away over a few seconds.

## One water, two directions

The beach does not own the sea — it asks it. `water(x, z, time)` is structurally `Ocean.heightAt`; hand the ocean's in and the swash runs on the real swell, while the ocean takes `beach.heightAt` as its `shore`. One coastline, agreed from both sides, no imports either way. Pass no `water` and a seeded built-in swell drives it — progressive along the shore (tongues run diagonally, as they do) and modulated into **sets**, because waves arrive in families.

## The sand remembers

```js
beach.stamp(x, z);        // a footprint — IF the sand is wet
loco.onFootstep(() => beach.stamp(foot.x, foot.z));   // ANIMA writes its path
```

Only wet sand takes a print (`wetAt > 0.15` — stamping dry dune simply returns `false`), open water takes none, and **the next tongue that crosses a print wipes it**. Characters write their path along the beach and the sea edits it.

`wrackLine()` reports the session's high-water mark, one world point per segment — where the tide leaves its shells and kelp, and where the beachcombing scatter of the next release will put them.

## The contract

- All queries — `heightAt`, `wetAt`, `reachAt`, `stamp`, `wrackLine` — are **world-space** and ride the prop's transform (tested with a quarter-turn plus translation).
- `heightAt` is the berm profile: dune (default 1.6 m) → foreshore at 1-in-12 → on under the sea. Hand it to anything that wants the ground: the ocean's `shore`, a walker's feet.
- `obstacleRadius` is 0 — a beach is a floor.
- Deterministic: same seed, same sea, same sand, to the wetness sample.

See the **beach** playground: golden hour, the two-way ocean handshake, and a beachcomber walking the wet band — prints appearing behind them and the tongues wiping them out.
