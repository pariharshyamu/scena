/**
 * Does every playground example actually DRAW something?
 *
 * This exists because the check it replaces did not answer that question. It
 * asked whether a canvas existed and whether `gl.getError()` was zero, and both
 * are true of a completely empty frame — so an example whose entire scene sat
 * behind the camera's far plane rendered nothing, reported nothing, and
 * shipped.
 *
 * Two things it does that the old one did not:
 *
 *   - listens for errors on EVERY frame. The example runs inside an iframe, and
 *     a listener on the top page hears nothing at all when it throws.
 *   - measures the picture from a SCREENSHOT. `gl.readPixels` cannot do it:
 *     three.js leaves `preserveDrawingBuffer` off, so the back buffer is gone
 *     by the time anybody asks and every canvas answers pure black. A verifier
 *     built on that calls a working scene blank, which is a worse failure than
 *     having no verifier.
 *
 * Usage:  node site/verify-playgrounds.mjs [id ...]
 */
import { inflateSync } from 'node:zlib';

/**
 * Minimal PNG reader — enough to measure a screenshot.
 *
 * `gl.readPixels` cannot do this job: three.js leaves `preserveDrawingBuffer`
 * off, so the back buffer is already gone by the time anybody asks and every
 * frame reads back pure black. A verifier that measures nothing and calls it
 * blank is worse than no verifier at all.
 */
function decodePng(buf) {
  let p = 8;
  let w = 0, h = 0, bitDepth = 8, colour = 6;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colour = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('only 8-bit PNGs');
  const channels = colour === 6 ? 4 : colour === 2 ? 3 : colour === 0 ? 1 : 0;
  if (!channels) throw new Error('unsupported colour type ' + colour);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    const row = raw.subarray(rp, rp + stride); rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, channels, data: out };
}

/** Does this image contain a picture, or one flat colour? */
function measure(png) {
  const { w, h, channels, data } = png;
  const counts = new Map();
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * channels;
      const r = data[i], g = data[i + 1] ?? r, b = data[i + 2] ?? r;
      const key = `${r >> 3},${g >> 3},${b >> 3}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += lum; sum2 += lum * lum; n++;
    }
  }
  const top = [...counts.values()].sort((a, b) => b - a)[0] ?? n;
  return {
    distinct: counts.size,
    flattest: Number((top / n).toFixed(3)),
    stdev: Number(Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2)).toFixed(2)),
    mean: Number((sum / n).toFixed(1)),
  };
}

/**
 * Playwright is not a dependency of this package — it is a big download and
 * only this script wants it. Take it from wherever it is: a local install, a
 * global one, or a path in the environment.
 */
const pw = await (async () => {
  const tries = [process.env.PLAYWRIGHT, 'playwright', 'playwright-core',
    '/opt/node22/lib/node_modules/playwright/index.mjs'].filter(Boolean);
  for (const t of tries) {
    try { return await import(t); } catch { /* next */ }
  }
  throw new Error(`no playwright found; tried ${tries.join(', ')}`);
})();
const { chromium } = pw;
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(fileURLToPath(import.meta.url), '..');
const ROOT = join(here, 'dist');
const OUT = process.env.SHOT_DIR ?? join(here, '..', '.playground-shots');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.md': 'text/markdown', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  const raw = decodeURIComponent(req.url.split('?')[0]);
  const path = raw === '/' ? '/index.html' : raw;
  try {
    const b = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404).end('no'); }
});
// Port 0: let the OS pick a free one, so two of these can run at once and
// neither has to know about the other.
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const BASE = `http://localhost:${PORT}`;

await mkdir(OUT, { recursive: true });

const launch = () =>
  chromium.launch({
    ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
let browser = await launch();
// "AudioContext was not allowed to start" is Chrome's autoplay policy doing
// its job on a page nobody has clicked — for a prop with a radio in it, that
// warning IS the correct headless behaviour, not a defect.
const benign = (t) => /favicon|404|Failed to load resource|WebGL.*deprecat|pointer-lock|Unrecognized feature|AudioContext was not allowed to start/i.test(t);

const only = process.argv.slice(2);
const page0 = await browser.newPage();
await page0.goto(`${BASE}/playground.html`, { waitUntil: 'networkidle' });
const ids = await page0.evaluate(() =>
  [...document.querySelectorAll('select option')].map((o) => o.value)
);
await page0.close();
// Explicit ids must EXIST: the playground falls back to example #1 for
// unknown ids, so a typo'd id would happily verify the wrong page under
// the right name. That happened; hence this.
for (const id of only) {
  if (!ids.includes(id)) {
    console.error(`unknown example id: ${id}`);
    process.exit(2);
  }
}
const list = only.length ? only : ids;
console.log(`${list.length} example(s)\n`);

// A FRESH BROWSER EVERY FEW EXAMPLES.
//
// This is a hygiene measure, not a fix. It was added under a wrong diagnosis
// — the heaviest example passed FIRST in a 25-example sweep (distinct 443)
// and came back blank LAST in the same 25 (distinct 0), which looked like
// GPU state accumulating in the browser process. It was not. Captures were
// timing out, and they timed out more often late in a sweep because the
// machine was busier and a software-rendered frame took longer. See
// SHOT_TIMEOUT below for the real cause.
//
// Recycling stays because a long sweep in one browser process does drift
// slower, and a fresh one costs about a second. It is no longer load-bearing.
const RECYCLE_EVERY = 10;

const rows = [];
let done = 0;
for (const id of list) {
  if (done > 0 && done % RECYCLE_EVERY === 0) {
    await browser.close();
    browser = await launch();
  }
  done++;
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errs = [];
  // EVERY frame, not just the top one. The example runs inside an iframe, so a
  // listener on the page alone hears nothing at all when it throws.
  page.on('pageerror', (e) => !benign(String(e)) && errs.push(`page: ${e}`));
  page.on('console', (m) => {
    const t = m.text();
    if ((m.type() === 'error' || m.type() === 'warning') && !benign(t)) errs.push(`${m.type()}: ${t}`);
  });
  await page.goto(`${BASE}/playground.html?example=${id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);

  // SCREENSHOT THE CANVAS and measure the picture. Reading the framebuffer
  // back does not work: three.js leaves `preserveDrawingBuffer` off, so every
  // canvas answers pure black and a verifier built on it calls a working scene
  // blank — which is how the last one passed an empty frame in both directions.
  const looksBlank = (m) => m.flattest > 0.985 && m.stdev < 1.5;

  // GIVE A CAPTURE THE TIME A FRAME ACTUALLY TAKES.
  //
  // A screenshot of a WebGL canvas has to wait for a frame, and under
  // SwiftShader — a software rasteriser — a heavy scene renders at seconds
  // per frame, not frames per second. `physical` is the worst of them:
  // transmission, thick-film interference and a PMREM chain at 756×799
  // measure at ~5 s a frame, so every capture route takes 10–12 s. Against
  // an 8 s timeout every one of them threw.
  //
  // And a thrown capture printed as `distinct 0 / flattest 1 / stdev 0` —
  // the DEFAULTS for a row with no measurement — which reads exactly like a
  // blank frame and is nothing of the sort. That misreading cost real time:
  // captures failed more often late in a sweep, when the machine was busier
  // and frame times were longer, and "fails by position, not by content"
  // looked like GPU state accumulating across examples. It was frame time
  // crossing a timeout. Hence the generous budget here, and hence `why` on
  // every failed row — an unprinted exception is indistinguishable from an
  // empty picture.
  const SHOT_TIMEOUT = 45000;
  const shootClip = async () => {
    const box = await page.frameLocator('iframe').locator('canvas').boundingBox();
    if (!box || box.width < 8 || box.height < 8) throw new Error('no canvas box');
    return page.screenshot({ clip: box, timeout: SHOT_TIMEOUT });
  };
  const shootElement = () =>
    page.frameLocator('iframe').locator('canvas').screenshot({ timeout: SHOT_TIMEOUT });

  let pix = { ok: false };
  // Every path's failure is kept. Letting a later error overwrite an earlier
  // one hides which capture actually broke, and a diagnosis built on the last
  // error in a fallback chain is a diagnosis of the backstop.
  const failures = [];
  for (let attempt = 0; attempt < 3 && !(pix.ok && !looksBlank(pix)); attempt++) {
    if (attempt) await page.waitForTimeout(1500);
    for (const [via, shoot] of [['page-clip', shootClip], ['element', shootElement]]) {
      try {
        const shot = await shoot();
        const m = measure(decodePng(shot));
        if (!pix.ok || looksBlank(pix)) pix = { ok: true, via, ...m };
        if (!looksBlank(m)) break;
      } catch (e) {
        failures.push(`${via}: ${String(e).split('\n')[0].slice(0, 80)}`);
      }
    }
  }
  if (!pix.ok && failures.length) pix.why = failures.join(' | ');
  // A caught runner error draws no scene, but whatever the example mounted
  // before throwing can vary enough pixels to pass the blank check — GAMA's
  // juice example shipped a draft that way. The banner is part of the
  // verdict, not decoration.
  const banner = await page.evaluate(() => {
    const el = document.querySelector('.pg-error, #error, .error, [data-error], .runner-error');
    return el ? el.textContent.trim().slice(0, 160) : '';
  });
  // Empty = one colour over almost everything and nothing varying.
  const blank = !pix.ok || (pix.flattest > 0.985 && pix.stdev < 1.5);
  rows.push({ id, blank, errs: errs.length, banner, ...pix });
  const flag = blank ? 'BLANK' : banner ? 'ERROR' : errs.length ? 'errs ' : '  ok ';
  console.log(
    `${flag} ${id.padEnd(16)} distinct ${String(pix.distinct ?? 0).padStart(5)}` +
    ` flattest ${String(pix.flattest ?? 1).padStart(5)} stdev ${String(pix.stdev ?? 0).padStart(6)}` +
    ` mean ${String(pix.mean ?? 0).padStart(5)}` +
    (pix.why ? `  WHY: ${pix.why}` : '') +
    (banner ? `  BANNER: ${banner}` : '') +
    (errs.length ? `\n        ${errs.slice(0, 3).join('\n        ')}` : '')
  );
  if (blank || banner || errs.length) await page.screenshot({ path: `${OUT}/pg-${id}.png` });
  await page.close();
  await context.close();
}

const bad = rows.filter((r) => r.blank || r.banner || r.errs);
console.log(`\n${rows.length - bad.length}/${rows.length} render something.`);
if (bad.length) console.log('PROBLEMS:', bad.map((r) => r.id).join(', '));
await browser.close();
server.close();
process.exit(bad.length ? 1 : 0);
