import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// The GAMA handshake demo imports gama from a sibling clone
// (../gama next to this repo). `npm run dev` after cloning both.
export default defineConfig({
  resolve: {
    alias: [
      { find: 'gama3d/templates', replacement: resolve(here, '../../../gama/src/templates.ts') },
      { find: /^gama3d$/, replacement: resolve(here, '../../../gama/src/index.ts') },
      { find: /^scena3d$/, replacement: resolve(here, '../../src/index.ts') },
    ],
    dedupe: ['three'],
  },
  server: { fs: { allow: [resolve(here, '../../..')] } },
});
