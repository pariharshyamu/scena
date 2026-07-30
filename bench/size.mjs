#!/usr/bin/env node
/**
 * What does importing this actually cost?
 *
 *   npm run size            check every probe against its budget
 *   npm run size -- --json  the numbers, for a script
 *
 * ## Budgets, not baselines
 *
 * The other gates in this trilogy compare against a recorded value and fail on
 * any movement. Bytes are not like that. They shift by a few dozen when
 * esbuild is upgraded, and a gate that fails on a dependency bump gets
 * disabled. So each probe has a CEILING it must stay under, and the report
 * prints the headroom — drift is visible without being fatal, and a real
 * regression blows through the ceiling.
 *
 * Headroom is deliberately tight, around 15-20%. The first draft of this file
 * had budgets so loose that four of the seven probes could have TRIPLED
 * without failing — `text` was allowed 12 kB to hold 2.1 kB. A budget nothing
 * can breach is decoration, and it is worse than no budget because it looks
 * like protection. If a probe legitimately needs more room, raise it in one
 * commit that says what joined its graph.
 *
 * ## Why these probes
 *
 * Each one is a thing somebody actually writes. `crate` is the single most
 * telling: it is a 1.8 kB module, and what it drags with it is the whole story
 * of whether the package is composed or a monolith.
 *
 * ## What this measured
 *
 * `createCrate` from the published bundle cost 20 kB gzipped while the same
 * import built from source cost 11 kB. The barrel was not the problem —
 * esbuild shakes `src/index.ts` perfectly. The problem was `tsup src/index.ts`
 * flattening 122 modules into ONE file, because module boundaries are where a
 * bundler's tree-shaking gets its granularity. `--splitting` does nothing with
 * a single entry point; there is nothing to split against. Building the six
 * sub-path entries alongside the root is what forced the split, and the root
 * import dropped to 11 kB for every consumer who changed nothing.
 *
 * The lesson worth keeping: a library's published shape is not its source
 * shape, and only measuring the published artifact tells you which one your
 * users get.
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '..', 'dist');
const asJson = process.argv.includes('--json');

/**
 * `budget` is gzipped kilobytes, the number a user's browser pays.
 *
 * `three` is external because it is a peer dependency: every consumer already
 * has it, and counting it would drown everything else.
 */
const PROBES = [
  {
    name: 'crate',
    budget: 13,
    note: 'one prop, root import — the canary',
    code: `import { createCrate } from '${DIST}/index.js'; console.log(createCrate);`,
  },
  {
    name: 'crate (sub-path)',
    budget: 13,
    note: 'same prop via scena3d/props — should match the root',
    code: `import { createCrate } from '${DIST}/props.js'; console.log(createCrate);`,
  },
  {
    name: 'core',
    budget: 2,
    note: 'Rng, noise, palettes, structural types',
    code: `import { Rng, collectObstacles, PALETTES } from '${DIST}/core.js'; console.log(Rng, collectObstacles, PALETTES);`,
  },
  {
    name: 'text',
    budget: 3,
    note: 'the embedded vector font',
    code: `import { buildTextGeometry } from '${DIST}/text.js'; console.log(buildTextGeometry);`,
  },
  {
    name: 'surface',
    budget: 11,
    note: 'the material tier alone — SURFACE_PRESETS is one record of every kind',
    code: `import { createSurface } from '${DIST}/materials.js'; console.log(createSurface);`,
  },
  {
    name: 'village',
    budget: 20,
    note: 'a realistic scene: house, tree, terrain, sky, scatter',
    code: `import { createHouse, createTree, createTerrain, createSky, scatter } from '${DIST}/index.js'; console.log(createHouse, createTree, createTerrain, createSky, scatter);`,
  },
  {
    name: 'everything',
    budget: 215,
    note: 'the whole library, for scale — nobody should import this',
    code: `export * from '${DIST}/index.js';`,
  },
];

/**
 * A probe that will not bundle is a FAILURE, not a crash.
 *
 * The first version let esbuild's rejection escape, so reverting the build to
 * a single entry point — deleting `dist/props.js` and the rest — produced a
 * stack trace about an unresolved path instead of "the sub-path entries are
 * missing". The gate's job includes saying which artifact is not there.
 */
async function measure(probe) {
  const common = { name: probe.name, budget: probe.budget, note: probe.note };
  let result;
  try {
    result = await build({
      stdin: {
        contents: probe.code,
        resolveDir: here,
        sourcefile: `${probe.name}.mjs`,
        loader: 'js',
      },
      bundle: true,
      format: 'esm',
      minify: true,
      write: false,
      external: ['three'],
      logLevel: 'silent',
    });
  } catch (error) {
    const first = error?.errors?.[0];
    return { ...common, failed: first?.text ?? String(error?.message ?? error) };
  }
  const bytes = result.outputFiles[0].contents;
  return { ...common, raw: bytes.length, gz: gzipSync(bytes, { level: 9 }).length };
}

const rows = [];
for (const probe of PROBES) rows.push(await measure(probe));

const broken = rows.filter((r) => r.failed);
const sized = rows.filter((r) => !r.failed);

if (asJson) {
  console.log(JSON.stringify({ probes: rows }, null, 2));
  process.exit(rows.some((r) => r.gz / 1024 > r.budget) ? 1 : 0);
}

console.log('\nImport cost, gzipped, `three` external. Budgets are ceilings.\n');
console.log(
  'probe'.padEnd(18) + 'raw'.padStart(8) + 'gz'.padStart(8) + 'budget'.padStart(8) + '  headroom'
);
console.log('-'.repeat(78));
const over = [];
for (const r of sized) {
  const kb = r.gz / 1024;
  const slack = r.budget - kb;
  if (slack < 0) over.push(r);
  console.log(
    r.name.padEnd(18) +
      `${(r.raw / 1024).toFixed(0)}k`.padStart(8) +
      `${kb.toFixed(1)}k`.padStart(8) +
      `${r.budget}k`.padStart(8) +
      `  ${slack >= 0 ? '+' : ''}${slack.toFixed(1)}k`.padEnd(9) +
      `  ${r.note}`
  );
}

console.log('');
// Both failure classes in one pass. Bailing on the unbundlable probes first
// hid the interesting half: reverting to a single-entry build BOTH removes the
// sub-paths AND makes the root import twice as expensive, and a gate that
// shows one of those makes you go looking for the other.
for (const r of over) {
  console.log(`  OVER  ${r.name}: ${(r.gz / 1024).toFixed(1)} kB gzipped, budget ${r.budget} kB`);
}
for (const r of broken) console.log(`  MISS  ${r.name}: ${r.failed}`);

if (over.length || broken.length) {
  if (over.length) {
    console.log(
      `\n${over.length} probe(s) over budget. Either the import got more expensive — find out ` +
        'what\njoined its graph — or the budget is genuinely wrong, in which case raise it\nin ' +
        'bench/size.mjs and say why in the commit.'
    );
  }
  if (broken.length) {
    console.log(
      `\n${broken.length} probe(s) would not bundle. The entry points come from the \`build\`\n` +
        'script in package.json; if one is gone, the published package lost a sub-path.'
    );
  }
  process.exit(1);
}
console.log(`size: ${rows.length} probes within budget ✓`);
