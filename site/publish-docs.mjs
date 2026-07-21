// Publishes the built docs site (site/dist) as the root of the `docs`
// branch, without touching the working tree or current branch.
// Usage: npm run site:publish   (Pages: deploy from branch `docs`, folder /)
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'site', 'dist');
const run = (cmd, env = {}) =>
  execSync(cmd, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' }).trim();

writeFileSync(join(dist, '.nojekyll'), '');

const indexFile = join(tmpdir(), `scena-docs-index-${Date.now()}`);
const env = { GIT_INDEX_FILE: indexFile };
run('git read-tree --empty', env);
run(`git --work-tree=${JSON.stringify(dist)} add -A`, env);
const tree = run('git write-tree', env);
const source = run('git rev-parse --short HEAD');
const commit = run(`git commit-tree -m "Deploy SCENA docs site (built from ${source})" ${tree}`, env);
run(`git push origin ${commit}:refs/heads/docs --force`);
console.log(`docs branch updated → ${commit}`);
