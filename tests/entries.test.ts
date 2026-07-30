import { describe, expect, it } from 'vitest';
import * as root from '../src/index';
import * as core from '../src/core';
import * as materials from '../src/materials';
import * as text from '../src/text';
import * as props from '../src/props';
import * as environment from '../src/environment';
import * as scene from '../src/scene';

/**
 * The sub-path entry points are a promise: `scena3d/props` exports exactly the
 * props that `scena3d` exports, under the same names, and between them the six
 * entries cover the root completely.
 *
 * That promise is the kind nobody can keep by hand — add a prop, forget
 * `props.ts`, and the sub-path silently lacks it. So the files are generated
 * from the barrel by `scripts/entries.mjs` and `npm run entries:check` is in
 * CI. These tests check the *result* rather than the generator, because a
 * generator that runs and produces the wrong partition would pass its own
 * check happily.
 */
const ENTRIES = { core, materials, text, props, environment, scene };

/** Runtime values only. Type-only exports are erased and cannot be compared. */
const namesOf = (mod: object): string[] => Object.keys(mod).sort();

describe('sub-path entry points', () => {
  it('together export everything the root does', () => {
    const covered = new Set(Object.values(ENTRIES).flatMap(namesOf));
    const missing = namesOf(root).filter((name) => !covered.has(name));
    expect(missing).toEqual([]);
  });

  it('export nothing the root does not', () => {
    // A sub-path exporting an extra name would be a second, undocumented API
    // surface — reachable from `scena3d/props` and not from `scena3d`.
    const rootNames = new Set(namesOf(root));
    for (const [entry, mod] of Object.entries(ENTRIES)) {
      const extra = namesOf(mod).filter((name) => !rootNames.has(name));
      expect(extra, `scena3d/${entry} exports names the root does not`).toEqual([]);
    }
  });

  it('do not overlap, so one name has one home', () => {
    // Overlap is not a correctness bug, but it defeats the point: two entries
    // exporting `createSurface` means importing either drags the same code,
    // and the split stops meaning anything.
    const home = new Map<string, string>();
    const clashes: string[] = [];
    for (const [entry, mod] of Object.entries(ENTRIES)) {
      for (const name of namesOf(mod)) {
        const first = home.get(name);
        if (first) clashes.push(`${name}: ${first} and ${entry}`);
        else home.set(name, entry);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('are the same objects as the root exports, not copies', () => {
    // `export { x } from './a'` must re-export the binding. If a build step
    // ever duplicated a module, `instanceof` and shared caches would break
    // across the seam while every name still resolved.
    for (const [entry, mod] of Object.entries(ENTRIES)) {
      for (const name of namesOf(mod)) {
        expect(
          (mod as Record<string, unknown>)[name],
          `scena3d/${entry}.${name} is not the root's binding`
        ).toBe((root as Record<string, unknown>)[name]);
      }
    }
  });

  it('put the expensive material tier behind its own entry', () => {
    // The measured reason the split exists: one crate cost 20 kB gzipped from
    // the published bundle because `SURFACE_PRESETS` — one record covering
    // every surface kind — came with it. `createSurface` belongs to
    // `materials` and nothing else, so a props-only import can be reasoned
    // about.
    expect(namesOf(materials)).toContain('createSurface');
    expect(namesOf(materials)).toContain('SURFACE_PRESETS');
    expect(namesOf(props)).not.toContain('createSurface');
    expect(namesOf(props)).toContain('createCrate');
  });
});
