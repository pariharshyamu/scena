#!/usr/bin/env node
/**
 * Generate the sub-path entry points from the root barrel.
 *
 *   npm run entries          rewrite src/{core,materials,text,props,environment,scene}.ts
 *   npm run entries:check    fail if they are out of date
 *
 * ## Why generate them
 *
 * A sub-path entry is a promise that `scena3d/props` exports exactly the props
 * the root exports — the same names, the same types, no drift. Hand-maintaining
 * seven barrels against one is a guarantee nobody can keep: add a prop, forget
 * `props.ts`, and the sub-path silently lacks it while the root has it. So
 * these files are derived, and `--check` is wired into CI. A generated file
 * that drifts from its source is worse than no generated file.
 *
 * ## Why sub-paths at all — the measured reason
 *
 * Not the obvious one. `import { createCrate } from 'scena3d'` was already
 * tree-shaken by esbuild to the crate's true import graph *when built from
 * source* — 11 kB gzipped. From the PUBLISHED bundle it was 20 kB, because
 * `tsup src/index.ts` flattens 122 modules into one file and module boundaries
 * are where a bundler's shaking gets its granularity. `--splitting` does
 * nothing with a single entry: there is nothing to split against.
 *
 * Multiple entry points are what force the split. So the headline benefit is
 * not that you can write `scena3d/props` — it is that the ROOT import gets
 * cheaper for everyone who changes nothing, because the published package
 * finally has chunks instead of one monolith.
 *
 * The sub-paths are worth having anyway: an import that names `scena3d/props`
 * says what it depends on, and the split is then visible rather than incidental.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src');
const check = process.argv.includes('--check');

/**
 * Each entry, the source directories it covers, and its one-line identity.
 *
 * `scene` groups four directories on purpose: assembly is one idea, and
 * `scatter` alone is a single module nobody would import by name.
 */
const GROUPS = [
  {
    name: 'core',
    dirs: ['core'],
    title: 'core: randomness, palettes, structural types',
    why:
      'Seeded randomness, noise, palettes, and the structural types every other\n' +
      " * entry point speaks: `Obstacle`, `Prop`, `PropSlot`, `PropSurface`. This is\n" +
      " * the vocabulary the trilogy's handshake is written in, and it is tiny.",
  },
  {
    name: 'materials',
    dirs: ['materials'],
    title: 'materials: procedural surfaces and glass',
    why:
      'Procedural surfaces and glass. The expensive one: `SURFACE_PRESETS` is a\n' +
      ' * single record covering every kind, so asking for `createSurface` at all\n' +
      " * costs the whole table — a crate's material is 28x the size of the crate.",
  },
  {
    name: 'text',
    dirs: ['text'],
    title: 'text: lettering carved from an embedded font',
    why:
      'Stylised lettering carved from an embedded vector font. No textures, no\n' +
      ' * font files, no loaders — label any prop, in the browser or a Node test.',
  },
  {
    name: 'props',
    dirs: ['props'],
    title: 'props: the prop library',
    why:
      'The prop library: crates and houses through to fighter jets. Seventy-six\n' +
      ' * modules, and the largest single reason to import a subset rather than\n' +
      ' * everything.',
  },
  {
    name: 'environment',
    dirs: ['environment'],
    title: 'environment: sky, terrain, weather, ocean, light',
    why:
      'Sky, terrain, weather, ocean, wind, seasons, lighting and acoustics — the\n' +
      ' * things that surround props rather than being them.',
  },
  {
    name: 'scene',
    dirs: ['scene', 'kits', 'scatter', 'generators'],
    title: 'scene assembly: manifests, kits, scatter, generators',
    why:
      'Assembly: `buildScene` from a manifest, furnishing and kit helpers,\n' +
      ' * scattering, and the whole-settlement generators. The layer that puts props\n' +
      ' * and environment together.',
  },
];

/**
 * Split the barrel into whole export statements.
 *
 * Line-based rather than a parser, because these statements are multi-line and
 * prettier-formatted: accumulate from a line starting with `export` until one
 * ends with `';`. A statement that does not end that way is a syntax the
 * generator has not seen, and it is reported rather than silently dropped.
 */
function statements(source) {
  const out = [];
  let cur = [];
  for (const line of source.split('\n')) {
    if (!cur.length && !line.trimStart().startsWith('export')) continue;
    cur.push(line);
    if (/['"];\s*$/.test(line)) {
      out.push(cur.join('\n'));
      cur = [];
    }
  }
  if (cur.length) throw new Error(`unterminated export statement: ${cur[0]}`);
  return out;
}

const barrel = await readFile(join(SRC, 'index.ts'), 'utf8');
const all = statements(barrel);
const byDir = new Map();
const orphans = [];
for (const statement of all) {
  const match = /from '\.\/([a-zA-Z]+)\//.exec(statement);
  if (!match) {
    orphans.push(statement.split('\n')[0]);
    continue;
  }
  if (!byDir.has(match[1])) byDir.set(match[1], []);
  byDir.get(match[1]).push(statement);
}

if (orphans.length) {
  console.error(
    `entries: ${orphans.length} export(s) in the barrel do not come from a src/<dir>/ module,\n` +
      'so no sub-path can claim them. Move them into a directory or extend GROUPS:\n' +
      orphans.map((o) => `  ${o}`).join('\n')
  );
  process.exit(1);
}

// Every directory must belong to exactly one entry, or a sub-path silently
// omits part of the library.
const claimed = new Set(GROUPS.flatMap((g) => g.dirs));
const unclaimed = [...byDir.keys()].filter((d) => !claimed.has(d));
if (unclaimed.length) {
  console.error(
    `entries: src/${unclaimed.join(', src/')} is exported by the barrel but claimed by no ` +
      'entry point. Add it to GROUPS in scripts/entries.mjs.'
  );
  process.exit(1);
}

function render(group) {
  const body = [];
  for (const dir of group.dirs) {
    if (group.dirs.length > 1) body.push(`// ---- ${dir}`);
    body.push(...(byDir.get(dir) ?? []), '');
  }
  return (
    `// SCENA — ${group.title}\n` +
    '//\n' +
    "// A sub-path entry point. `import from 'scena3d'` still gives you everything;\n" +
    '// this exists so a bundler can see module boundaries, and so an import says\n' +
    '// what part of the library it depends on.\n' +
    '//\n' +
    '// GENERATED from src/index.ts by scripts/entries.mjs — every statement below\n' +
    "// is the root barrel's own, partitioned by source directory. `npm run\n" +
    '// entries:check` fails if this file and the barrel disagree.\n' +
    '\n' +
    body.join('\n')
  );
}

let stale = 0;
for (const group of GROUPS) {
  const path = join(SRC, `${group.name}.ts`);
  const wanted = render(group);
  const found = await readFile(path, 'utf8').catch(() => null);
  if (found === wanted) {
    if (!check) console.log(`  ok    src/${group.name}.ts`);
    continue;
  }
  if (check) {
    console.error(`  STALE src/${group.name}.ts${found === null ? ' (missing)' : ''}`);
    stale += 1;
    continue;
  }
  await writeFile(path, wanted);
  console.log(`  wrote src/${group.name}.ts  (${group.dirs.join(', ')})`);
}

if (check && stale) {
  console.error(`\nentries: ${stale} entry point(s) out of date — run \`npm run entries\`.`);
  process.exit(1);
}
console.log(
  check
    ? `entries: ${GROUPS.length} entry points current ✓`
    : `entries: ${GROUPS.length} entry points from ${all.length} barrel exports`
);
