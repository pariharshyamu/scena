import type { Material } from 'three';

/**
 * Build a material once per distinct key, not once per part.
 *
 * A prop that decorates a shelf with eight loaves, or glazes a balcony with
 * seven identical panes, naturally writes the material construction inside the
 * loop. Every iteration then allocates a `MeshStandardMaterial` that is
 * byte-identical to the last one — the renderer binds each separately, they
 * cannot be batched, and changing one afterwards changes exactly one pane.
 *
 * `npm run geometry` counts them: a bungalow shipped 25 material instances for
 * 13 distinct materials, and a stall 18 for 8.
 *
 * ```ts
 * const matte = sharedBy((color: number) =>
 *   new MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }));
 * for (const loaf of loaves) meshes.push(new Mesh(geo, matte(loaf.color)));
 * ```
 *
 * ## Call it inside the factory, never at module scope
 *
 * The cache has to live for one prop, so build it where the prop is built. A
 * module-level cache would hand the same material to every crate in the world,
 * and the first game to tint one crate would tint all of them — the sharing
 * would stop being an optimisation and become a surprise.
 *
 * ## And not for anything animated
 *
 * A material that owns a time uniform must not be shared, or every copy moves
 * in unison. Those carry their state as `userData.*Uniforms`, which is both
 * how they stay unshared and how the gate knows to exempt them.
 */
export function sharedBy<K, M extends Material>(make: (key: K) => M): (key: K) => M {
  const cache = new Map<K, M>();
  return (key: K): M => {
    let material = cache.get(key);
    if (!material) {
      material = make(key);
      cache.set(key, material);
    }
    return material;
  };
}
