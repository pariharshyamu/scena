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

const browser = await chromium.launch({
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const benign = (t) => /favicon|404|Failed to load resource|WebGL.*deprecat|pointer-lock|Unrecognized feature/i.test(t);

const only = process.argv.slice(2);
const page0 = await browser.newPage();
await page0.goto(`${BASE}/playground.html`, { waitUntil: 'networkidle' });
const ids = await page0.evaluate(() =>
  [...document.querySelectorAll('select option')].map((o) => o.value)
);
await page0.close();
const list = only.length ? only : ids;
console.log(`${list.length} example(s)\n`);

const rows = [];
for (const id of list) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  // EVERY frame, not just the top one. The example runs inside an iframe, so a
  // listener on the page alone hears nothing at all when it throws.
  page.on('pageerror', (e) => !benign(String(e)) && errs.push(`page: ${e}`));
  page.on('console', (m) => {
    const t = m.text();
    if ((m.type() === 'error' || m.type() === 'warning') && !benign(t)) errs.push(`${m.type()}: ${t}`);
  });
  await page.goto(`${BASE}/playground.html?example=${id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);

  // SCREENSHOT THE CANVAS and measure the picture. Reading the framebuffer
  // back does not work: three.js leaves `preserveDrawingBuffer` off, so every
  // canvas answers pure black and a verifier built on it calls a working scene
  // blank — which is how the last one passed an empty frame in both directions.
  // An element screenshot forces a fresh compositor capture of the WebGL
  // canvas, and with preserveDrawingBuffer off SwiftShader sometimes hands
  // back a cleared buffer — a black frame for a scene that is rendering
  // perfectly well on the page. The page-level capture can lose the same
  // race. So a single blank capture is NOT a verdict: try the element, fall
  // back to a page screenshot clipped to the canvas box (pixels already
  // composited, no fresh readback), and give the whole sequence three goes
  // with a breath between them. Only an example that is blank every way,
  // every time, is blank.
  const looksBlank = (m) => m.flattest > 0.985 && m.stdev < 1.5;
  let pix = { ok: false };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await page.waitForTimeout(1500);
    try {
      const shot = await page
        .frameLocator('iframe')
        .locator('canvas')
        .screenshot({ timeout: 8000 });
      pix = { ok: true, ...measure(decodePng(shot)) };
    } catch (e) {
      pix = { ok: false, why: String(e).slice(0, 80) };
    }
    if (pix.ok && !looksBlank(pix)) break;
    try {
      const box = await page.frameLocator('iframe').locator('canvas').boundingBox();
      if (box && box.width > 8 && box.height > 8) {
        const whole = await page.screenshot({
          clip: { x: box.x, y: box.y, width: box.width, height: box.height },
          timeout: 8000,
        });
        const again = measure(decodePng(whole));
        if (!looksBlank(again)) pix = { ok: true, via: 'page-clip', ...again };
      }
    } catch { /* keep the element reading */ }
    if (pix.ok && !looksBlank(pix)) break;
  }
  const banner = await page.evaluate(() => {
    const el = document.querySelector('.error, [data-error], .runner-error');
    return el ? el.textContent.trim().slice(0, 160) : '';
  });
  // Empty = one colour over almost everything and nothing varying.
  const blank = !pix.ok || (pix.flattest > 0.985 && pix.stdev < 1.5);
  rows.push({ id, blank, errs: errs.length, banner, ...pix });
  const flag = blank ? 'BLANK' : errs.length ? 'errs ' : '  ok ';
  console.log(
    `${flag} ${id.padEnd(16)} distinct ${String(pix.distinct ?? 0).padStart(5)}` +
    ` flattest ${String(pix.flattest ?? 1).padStart(5)} stdev ${String(pix.stdev ?? 0).padStart(6)}` +
    ` mean ${String(pix.mean ?? 0).padStart(5)}` +
    (banner ? `  BANNER: ${banner}` : '') +
    (errs.length ? `\n        ${errs.slice(0, 3).join('\n        ')}` : '')
  );
  if (blank || errs.length) await page.screenshot({ path: `${OUT}/pg-${id}.png` });
  await page.close();
}

const bad = rows.filter((r) => r.blank || r.errs);
console.log(`\n${rows.length - bad.length}/${rows.length} render something.`);
if (bad.length) console.log('PROBLEMS:', bad.map((r) => r.id).join(', '));
await browser.close();
server.close();
process.exit(bad.length ? 1 : 0);
