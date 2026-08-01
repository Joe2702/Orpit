// Render the built app in a real browser at a phone viewport and report anything
// that spills outside it.
//
//   npm --prefix web run build
//   node tools/shot.mjs <width> <out.png> <textScale>
//
// Written after the Home screen's cards were found running off the right edge on
// a narrow phone: the layout is fixed-pixel throughout, so the only way to know
// it survives a small screen — or the in-app text size, which shrinks the layout
// viewport the same way — is to lay it out and measure.
// The store boots cache-first from localStorage, so seeding a token and a cached
// state is enough to reach the Home screen with no server running.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Playwright is a dev-only convenience, installed on demand rather than pinned
// as a dependency:  npm --prefix web i -D playwright --no-save
const require_ = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = require_('playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { state } from './mockstate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '../web/dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  let file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

const width = Number(process.argv[2] || 390);
const out = process.argv[3] || '/tmp/home.png';
const scale = Number(process.argv[4] || 1);
state.profile.textScale = scale;

await new Promise((r) => server.listen(5178, r));
// CHROME_PATH lets a sandbox point at a preinstalled browser; otherwise
// Playwright finds its own.
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);
const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') console.log('  console:', m.text().slice(0, 160)); });

await page.addInitScript((s) => {
  localStorage.setItem('orbit_token', 'mock');
  localStorage.setItem('orbit_state_cache', JSON.stringify(s));
}, state);
await page.goto('http://127.0.0.1:5178/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// Report anything wider than the viewport — the actual question being asked.
const overflow = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) {
      bad.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 20),
                 text: (el.textContent || '').trim().slice(0, 34),
                 left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
    }
  }
  return { vw, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 14) };
});
console.log(JSON.stringify(overflow, null, 1));

await page.screenshot({ path: out, fullPage: false });
await browser.close();
server.close();
console.log('shot →', out, 'at', width + 'px');
