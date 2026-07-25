// The playground sandbox. Receives example source via postMessage, rewrites
// bare 'scena3d'/'gama3d'/'three' imports to the vendored ESM bundles, and
// runs it as a blob module. Each run gets a fresh iframe (the parent
// reloads us), so there is never stale state to clean up.

// The vendor bundles live at fixed filenames, so a browser that fetched them
// once will keep running the OLD library no matter how often the docs are
// redeployed — the page updates, its hashed assets update, and the library
// quietly does not. `vendor/build.json` carries a digest of the bundles
// themselves; hanging it off each URL keeps the cache when nothing changed
// and bypasses it the moment anything did.
let stamp = '';
const vendor = (path: string): string =>
  new URL(`./vendor/${path}${stamp ? `?v=${stamp}` : ''}`, location.href).href;

function report(type: 'runner-ok' | 'runner-error', message = ''): void {
  parent.postMessage({ type, message }, '*');
}

window.addEventListener('error', (e) => report('runner-error', String(e.message)));
window.addEventListener('unhandledrejection', (e) => report('runner-error', String(e.reason)));

window.addEventListener('message', async (event) => {
  if (event.data?.type !== 'run' || typeof event.data.code !== 'string') return;
  const scenaUrl = vendor('scena.js');
  const gamaUrl = vendor('gama/index.js');
  const templatesUrl = vendor('gama/templates.js');
  const threeUrl = vendor('three.module.js');
  const code = (event.data.code as string)
    .replace(/(from\s*)(['"])gama3d\/templates\2/g, `$1'${templatesUrl}'`)
    .replace(/(from\s*)(['"])gama3d\2/g, `$1'${gamaUrl}'`)
    .replace(/(from\s*)(['"])scena3d\2/g, `$1'${scenaUrl}'`)
    .replace(/(from\s*)(['"])three\2/g, `$1'${threeUrl}'`);
  try {
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    await import(/* @vite-ignore */ url);
    URL.revokeObjectURL(url);
    report('runner-ok');
  } catch (error) {
    report('runner-error', error instanceof Error ? (error.stack ?? error.message) : String(error));
  }
});

// Read the build stamp before announcing readiness, so the very first run
// already loads the right bundles. A miss is not fatal — it just means the
// URLs go unstamped, exactly as they did before.
void fetch(new URL('./vendor/build.json', location.href).href, { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => {
    if (data?.stamp) stamp = String(data.stamp);
  })
  .catch(() => undefined)
  .finally(() => parent.postMessage({ type: 'runner-ready' }, '*'));
