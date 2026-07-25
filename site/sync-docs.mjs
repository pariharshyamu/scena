import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Mirror `docs/` into the site's static assets.
 *
 * The guide fetches `./docs/<page>.md` at runtime, so the markdown has to be
 * under `site/public/`. That mirror is gitignored and used to be kept by
 * hand, which means a new page could be written, committed, linked in the
 * sidebar and still 404 on the deployed site with nothing anywhere saying
 * so. One copy, wired into the build, instead.
 */
const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, 'public/docs');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(resolve(here, '../docs'), target, { recursive: true });
