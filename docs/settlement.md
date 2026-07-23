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

## Interiors: createRoom

`createRoom` is `assembleKit` gone indoors — the same grid, the same map characters, and the same `Kit`-shaped gameplay data (`obstacles`, `spawns`, `floorAt`), plus everything a room needs to feel like a room: plastered walls over floorboards (or flagstones, `floor: 'stone'`), a beamed ceiling, and three new cell types:

| Char | Meaning |
|---|---|
| `W` | **window** — wall with a real opening (sill, jambs, header, glowing daylight pane), recorded in `windows` with the direction it faces |
| `H` | **hearth** — wall cell replaced by a burning stone fireplace: mantel, sooty firebox, live flame, glowing coals and a flickering `PointLight` (budgeted by `hearthLight`) |
| `~` | floor + a woven **rug** |

```js
const cottage = createRoom([
  '##H####',
  '#.....#',
  'W..~..W',
  '#.....#',
  '##WDW##',
], { seed: 11, palette });
scene.add(cottage.group);
```

The architecture is still a handful of `InstancedMesh`es however big the plan; hearths are already burning (the same self-animating flame as `createCampfire`); and `room.setActive(false)` hides the whole interior *and* its real lights in one call — the cheap culling switch for stepping outdoors.

### Daylight: createInteriorLight

Indoors, light is the mood. `createInteriorLight(room)` adds a palette-tinted hemisphere fill (cool sky from above, warm wood bounce from below) and — the showpiece — a **volumetric-looking light shaft through every sun-facing window**: angled by the sun's elevation and azimuth, landing in a soft pool on the floor, with dust motes drifting through it. The window panes brighten toward noon and go dark at night.

```js
const light = createInteriorLight(cottage, { cycle });  // follow the day cycle
game.onUpdate(() => light.update());                    // dawn: east shafts; dusk: west
```

Bind a [`createDayCycle`](./environment.md) via `cycle` and the sun swings east to west through the day, shafts dying at dusk exactly as the hearth's flicker takes over; or aim it by hand with `setSun({ elevation, azimuth })`. None of it costs real lights — shafts, pools and dust are a few additive quads, so the only `PointLight`s in a room remain the ones the room budgeted (hearth, torches).

The light rig attaches itself to `room.group` (shafts are room-local), so `setActive(false)` hides it too.
