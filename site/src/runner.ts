// The playground sandbox. Receives example source via postMessage, rewrites
// bare 'scena3d'/'gama3d'/'three' imports to the vendored ESM bundles, and
// runs it as a blob module. Each run gets a fresh iframe (the parent
// reloads us), so there is never stale state to clean up.

const scenaUrl = new URL('./vendor/scena.js', location.href).href;
const gamaUrl = new URL('./vendor/gama/index.js', location.href).href;
const templatesUrl = new URL('./vendor/gama/templates.js', location.href).href;
const threeUrl = new URL('./vendor/three.module.js', location.href).href;

function report(type: 'runner-ok' | 'runner-error', message = ''): void {
  parent.postMessage({ type, message }, '*');
}

window.addEventListener('error', (e) => report('runner-error', String(e.message)));
window.addEventListener('unhandledrejection', (e) => report('runner-error', String(e.reason)));

window.addEventListener('message', async (event) => {
  if (event.data?.type !== 'run' || typeof event.data.code !== 'string') return;
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

parent.postMessage({ type: 'runner-ready' }, '*');
