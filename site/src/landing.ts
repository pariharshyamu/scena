import { findExample } from './examples';

// The hero background is the real village example running in the same
// sandbox the playground uses — the site eats its own dog food.
const hero = document.getElementById('hero-demo') as HTMLIFrameElement;
const code = findExample('village').code;

window.addEventListener('message', (event) => {
  if (event.data?.type === 'runner-ready') {
    hero.contentWindow?.postMessage({ type: 'run', code }, '*');
  }
});
hero.src = 'runner.html';
