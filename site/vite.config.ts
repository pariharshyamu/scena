import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: resolve(here, 'index.html'),
        playground: resolve(here, 'playground.html'),
        guide: resolve(here, 'guide.html'),
        runner: resolve(here, 'runner.html'),
      },
    },
  },
});
