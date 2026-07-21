// Builds the assets the docs site's live playground needs:
// - vendor/scena.js: this library bundled as one ESM file (three external)
// - vendor/gama/*.js: the published gama3d dist, re-bundled with code
//   splitting so entries share chunks (instanceof stays coherent) and
//   'three/examples/jsm/*' imports are inlined
// - vendor/three.module.js: three's own ESM build, copied
// - docs/*.md: the guides, copied for client-side rendering
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'site', 'public');
mkdirSync(join(pub, 'vendor', 'gama'), { recursive: true });
mkdirSync(join(pub, 'docs'), { recursive: true });

await build({
  entryPoints: [join(root, 'src/index.ts')],
  bundle: true,
  format: 'esm',
  minify: true,
  outfile: join(pub, 'vendor', 'scena.js'),
  plugins: [
    {
      // Keep exactly 'three' external (the runner's import map provides it)
      // while still bundling any 'three/*' subpath imports.
      name: 'three-exact-external',
      setup(builder) {
        builder.onResolve({ filter: /^three$/ }, () => ({ path: 'three', external: true }));
      },
    },
  ],
});

// Bundle gama3d's two entries in ONE esbuild call with code splitting:
// shared chunks stay shared, and bare 'three/examples/jsm/*' imports get
// bundled in — only exactly 'three' stays external for the import map.
await build({
  entryPoints: [
    join(root, 'node_modules/gama3d/dist/index.js'),
    join(root, 'node_modules/gama3d/dist/templates.js'),
  ],
  bundle: true,
  splitting: true,
  format: 'esm',
  minify: true,
  outdir: join(pub, 'vendor', 'gama'),
  plugins: [
    {
      name: 'three-exact-external',
      setup(builder) {
        builder.onResolve({ filter: /^three$/ }, () => ({ path: 'three', external: true }));
      },
    },
  ],
});

copyFileSync(
  join(root, 'node_modules/three/build/three.module.js'),
  join(pub, 'vendor', 'three.module.js')
);

for (const file of readdirSync(join(root, 'docs'))) {
  copyFileSync(join(root, 'docs', file), join(pub, 'docs', file));
}

console.log('site vendor assets built');
