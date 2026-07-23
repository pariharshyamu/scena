import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// scena3d aliases to this repo's live source so the demo always runs against
// the working tree.
export default defineConfig({
  resolve: {
    alias: [{ find: /^scena3d$/, replacement: resolve(here, '../../src/index.ts') }],
    dedupe: ['three'],
  },
});
