# Signposts & stylised text

Every world eventually needs to *say* something — a town name over the road, a shop sign, an arrow to the market. `createSign` gives you signage with **real, legible lettering**, and `buildTextGeometry` is that same lettering exposed on its own, to carve a name onto any prop you like.

```js
import { createSign } from 'scena3d';

scene.add(createSign({ kind: 'post', text: 'HAVENBROOK' }).object);
```

## Text without textures, fonts or loaders

The obvious way to put words in three.js is `TextGeometry` + `FontLoader` (a JSON typeface to fetch and parse) or a `CanvasTexture` (a DOM, so nothing renders in a headless test or a worker). SCENA takes neither.

Instead it ships a compact **single-stroke vector font** — each glyph is a handful of polylines on a fixed grid — and thickens every stroke into a **solid, constant-width mitred ribbon** (the way a bold typeface is drawn), extruded to shallow relief and merged into **one draw call** per string. Butt ends are extended half a stroke so crossing strokes weld into solid joints. It is pure geometry built from three's own math, so a sign reads identically in a browser, a headless capture and a Node test — no assets to ship, nothing to fetch, no DOM required.

Proportional advances are baked into the font, so spacing falls out for free; lowercase maps onto the capitals (medieval signage is caps anyway) and unknown characters simply advance the pen instead of throwing.

## The four signs

| `kind` | What it is |
|---|---|
| `post` | a framed board on twin posts, painted panel behind the lettering, **both faces** — a town or district sign |
| `hanging` | a shop sign on a wrought bracket that **sways gently on its hooks**, self-animated from the render loop like the banners |
| `fingerpost` | a cluster of **pointed arms** with a painted stripe, each naming a place and pointing the way — pass `directions: [{ text, angle }]` |
| `milestone` | a weathered stone marker, the name painted on a **band sized to the text** |

```js
// A crossroads fingerpost.
createSign({
  kind: 'fingerpost',
  directions: [
    { text: 'MARKET', angle: 0.2 },
    { text: 'HARBOUR', angle: 2.3 },
    { text: 'THE MILL', angle: 4.1 },
  ],
});
```

The board of a `post` or `hanging` sign **sizes itself to the text** (measured with `measureText`), so a long name gets a long board. Every sign sets its bright lettering on a **dark painted panel** — that contrast, not the letters alone, is what makes a sign readable across a street. The paint carries a touch of emissive so it stays readable at dusk, kept below the day/night cycle's lamp threshold so a sign never glows like a lamp. Pass `inkColor` / `panelColor` to restyle the paintwork.

Like every SCENA prop, `createSign` returns `{ object, obstacleRadius }`, so it drops straight into `scatter`, a village, or GAMA's obstacle set.

## Lettering on anything

`buildTextGeometry` is the carving on its own — hand it to any material and place it where you like:

```js
import { buildTextGeometry } from 'scena3d';
import { Mesh, MeshStandardMaterial } from 'three';

const { geometry, width } = buildTextGeometry('WELCOME', { size: 0.9, align: 'center' });
const label = new Mesh(geometry, new MeshStandardMaterial({ color: 0x8a6a3a, flatShading: true }));
```

Options: `size` (cap height in metres), `weight` (stroke thickness), `depth` (relief), `tracking` (letter spacing), `align` (`left` / `center` / `right`) and `baseline`. It returns the merged `geometry` plus the measured `width` and `height`, so you can centre a board around it or lay out several labels in a row. `measureText` gives you that width without building anything.
