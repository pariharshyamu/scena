# Villages, buildings & kits

Civilization comes in two flavors: **generated** (seeded hamlets that place themselves sensibly on terrain) and **authored** (ASCII maps that snap to a shared grid).

## createVillage

```js
const village = createVillage({
  seed: 30,
  center: { x: 0, z: 0 },
  radius: 9,
  houses: 5,
  surface: terrain.heightAt,
  mask: (x, z) => dryLand(x, z) && !road.contains(x, z),
  lampLights: 3,          // real PointLight budget
  tower: true, ruin: true,
  palette,
});
scene.add(village.group);
```

The layout: a well anchors the plaza, houses ring it facing inward, street lamps stand between them, crates sit by the doors, a watchtower guards the edge and a ruin crumbles beyond. Every site is checked for slope and your mask — steep or vetoed spots re-roll up to ten times, so villages settle onto sensible ground without you flattening anything.

The result carries the full gameplay handshake:

- `obstacles` — every building as a `{ center, radius }` circle for GAMA's `ObstacleAvoidance`
- `keepOut` — one clearing circle to hand to `scatter`, so the forest respects the village
- `lamps` — street lamps **and houses** (their windows), ready for `createDayCycle({ lamps })`: the whole village ignites together at dusk
- `props` — everything placed, for your own iteration

## Building props à la carte

`createHouse`, `createTower`, `createWell` and `createRuin` are ordinary props if you want to compose your own settlement — see [Props & palettes](./props.md). Houses have a buried stone foundation, so sloped ground never shows a gap under a wall.

Each house picks its **wall** (plaster, brick or ashlar) and **roof** (clay tile, wooden shingle or straw thatch) from its seed, so a street varies on its own; pass `wall` / `roof` to fix a style. Ruins come up **mossy** by default (green reclaiming the up-facing stone — pass `mossy: false` to keep them bare), and the well wears a little moss on its rim. All of it is the [surface system](./surfaces.md) doing the work — no textures.

## Kits: ASCII architecture

For interiors, forts and dungeons, draw the floor plan as text:

```js
const fort = assembleKit([
  '#########',
  '#...T...#',
  '#.......#',
  'D...S...#',
  '#...T...#',
  '#########',
], { palette, torchLights: 2 });
fort.group.position.set(30, terrain.heightAt(30, 26), 26);
scene.add(fort.group);
```

Each character is one **`KIT_UNIT`** (2 world units) cell — the shared snap dimension that makes pieces combinable:

| Char | Meaning |
|---|---|
| `#` | wall block (obstacle) |
| `.` | floor tile |
| `D` | doorway — floor + lintel overhead |
| `T` | standing torch — emissive flame, `PointLight` within the budget |
| `S` | recorded spawn point |
| space | void |

However large the map, walls and floors render as **two `InstancedMesh`es**. The result reports `obstacles` (one per wall cell), `spawns`, `torches`, `size`, and `floorAt(x, z)` — a walkability query for spawning and AI ("is this point inside the fort?").

Kits and villages compose: a village for the exterior, a kit for the keep on the hill, one obstacle list feeding the same agents.
