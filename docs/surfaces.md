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
| `metal` | aged iron/bronze — metallic, mild mottle |
| `dirt` | packed earth — broad soft patches |

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

## Adopted by the props

`createHouse`, `createTower`, `createWell`, `createRuin`, `createRock` and `createCrate` are built on surfaces out of the box — plastered walls, tiled roofs, stone foundations, planked doors, grained crates. Their emissive windows are left as ordinary materials so the day-night cycle still lights them at dusk. Try the **Procedural surfaces** playground example to see all eight presets beside the props that use them.
