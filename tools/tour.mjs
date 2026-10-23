// Walk every screen of the built app in a real browser and photograph it.
//
//   VITE_TOUR=1 npm --prefix web run build
//   node tools/tour.mjs <outDir> [width=390] [theme=dark] [only=comma,list]
//
// The API is answered in the browser from tools/richstate.mjs, so the tour
// needs no server or database and every screen renders with a full, believable
// history. For each stop it also reports anything that spills sideways and any
// text that has been clipped by its container — the two ways a layout quietly
// breaks on a narrow phone.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { state } from './richstate.mjs';

const require_ = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = require_('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '../web/dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
                '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

const outDir = process.argv[2] || '/tmp/tour';
const width = Number(process.argv[3] || 390);
const theme = process.argv[4] || 'dark';
const only = (process.argv[5] || '').split(',').filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });
state.profile.theme = theme;
state.profile.textScale = Number(process.env.TEXT_SCALE || 1);

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  let file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(5179, r));

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
page.on('console', (m) => m.type() === 'error' && console.log('  console:', m.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('  PAGE ERROR:', e.message.slice(0, 300)));

const partner = { eligible: true, dob: '2001-12-12', gender: 'm', want: 'any', queued: false, recent: null, partner: null };
// API_DOWN=1 makes every request fail at the socket, the way a sleeping or
// unreachable server looks from a phone that is itself online.
let apiDown = process.env.API_DOWN === '1';
await page.route('**/api/**', (route) => {
  if (apiDown) return route.abort('connectionrefused');
  const u = new URL(route.request().url());
  const p = u.pathname.replace(/^\/api/, '');
  const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
  if (p === '/health') return json({ ok: true, schema: true });
  if (p === '/state') return json(state);
  if (p.startsWith('/partner')) return json(partner);
  if (route.request().method() === 'GET') return json({});
  return json(state);
});
const signedOut = process.env.AUTH === '0';
if (!signedOut) await page.addInitScript((s) => {
  localStorage.setItem('orbit_token', 'tour');
  localStorage.setItem('orbit_state_cache', JSON.stringify(s));
  localStorage.setItem('orbit_reminder_onboarded', '1');
}, state);
await page.goto('http://127.0.0.1:5179/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const nav = (fn) => page.evaluate(fn);
const stops = process.env.API_DOWN === '1' ? [
  ['down-home', () => window.__orbit.go('home')],
  ['down-logged', () => window.__orbit.go('home')],
] : signedOut ? [
  ['welcome', () => window.__orbit.go('welcome')],
  ['signin', () => window.__orbit.go('signin')],
] : [
  ['home', () => window.__orbit.go('home')],
  ['analytics-week', () => { window.__orbit.go('analytics'); window.__orbit.setRange('Week'); }],
  ['analytics-month', () => window.__orbit.setRange('Month')],
  ['analytics-year', () => window.__orbit.setRange('Year')],
  ['analytics-all', () => window.__orbit.setRange('All')],
  ['workouts', () => { window.__orbit.setRange('Week'); window.__orbit.go('workouts'); }],
  ['workouts-year', () => window.__orbit.setRange('Year')],
  ['sleep', () => { window.__orbit.setRange('Week'); window.__orbit.go('sleep'); }],
  ['sleep-month', () => window.__orbit.setRange('Month')],
  ['habits', () => { window.__orbit.setRange('Week'); window.__orbit.go('habits'); }],
  ['finances', () => window.__orbit.go('finances')],
  ['finances-year', () => window.__orbit.setRange('Year')],
  ['ftxns', () => { window.__orbit.setRange('Week'); window.__orbit.go('ftxns'); }],
  ['fbudgets', () => window.__orbit.go('fbudgets')],
  ['faccounts', () => window.__orbit.go('faccounts')],
  ['fgoals', () => window.__orbit.go('fgoals')],
  ['frecurring', () => window.__orbit.go('frecurring')],
  ['finsights', () => window.__orbit.go('finsights')],
  ['counters', () => window.__orbit.go('counters')],
  ['insights', () => window.__orbit.go('insights')],
  ['achievements', () => window.__orbit.go('achievements')],
  ['partner', () => window.__orbit.go('partner')],
  ['settings', () => window.__orbit.go('settings')],
  ['search', () => window.__orbit.go('search')],
  ['sheet-chooser', () => { window.__orbit.go('home'); window.__orbit.open('chooser'); }],
  ['sheet-workout', () => window.__orbit.open('workout')],
  ['sheet-sleep', () => window.__orbit.open('sleep')],
  ['sheet-expense', () => window.__orbit.open('expense')],
  ['sheet-habit', () => window.__orbit.open('habit')],
  ['report-week', () => { window.__orbit.closeSheet(); window.__orbit.openReport('week', 0); }],
  ['report-month', () => window.__orbit.openReport('month', 0)],
  ['report-year', () => window.__orbit.openReport('year', 0)],
];

const audit = () =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const spill = [];
    const clipped = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if ((r.right > vw + 0.5 || r.left < -0.5) && cs.position !== 'fixed') {
        // Horizontal scrollers clip on purpose; only report what escapes them.
        let p = el.parentElement, scroller = false;
        while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scroller = true; break; } p = p.parentElement; }
        if (!scroller) spill.push(`${el.tagName} "${(el.textContent || '').trim().slice(0, 30)}" ${Math.round(r.left)}→${Math.round(r.right)}`);
      }
      // Leaf text whose content is wider than its box.
      if (el.children.length === 0 && (el.textContent || '').trim() && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        clipped.push(`"${(el.textContent || '').trim().slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}${cs.textOverflow === 'ellipsis' ? ' (ellipsis)' : ''}`);
      }
    }
    return { scrollW: document.documentElement.scrollWidth, vw, spill: spill.slice(0, 8), clipped: clipped.slice(0, 10) };
  });

for (const [name, fn] of stops) {
  if (only.length && !only.includes(name)) continue;
  await nav(fn);
  if (name === 'down-home') {
    // Log a night while the server is unreachable: it should queue, not fail.
    await page.evaluate(() => window.__orbit.open('sleep'));
    await page.waitForTimeout(400);
    await page.getByText('Save', { exact: false }).last().click().catch(() => {});
    await page.waitForTimeout(800);
  }
  if (name === 'down-logged') {
    // The server comes back; the app should notice by itself and drain.
    apiDown = false;
    await page.waitForTimeout(9000);
  }
  await page.waitForTimeout(650);
  await page.evaluate(() => document.querySelector('[data-scroll], main, .orbit')?.scrollTo?.(0, 0));
  const a = await audit();
  const flags = [];
  if (a.scrollW > a.vw) flags.push(`page scrolls sideways (${a.scrollW}>${a.vw})`);
  if (a.spill.length) flags.push('spill: ' + a.spill.join(' | '));
  if (a.clipped.length) flags.push('clipped: ' + a.clipped.join(' | '));
  console.log(`${name.padEnd(16)} ${flags.length ? flags.join('\n                 ') : 'ok'}`);
  // The app scrolls inside its own container, so a "full page" shot is just
  // the viewport. Grow the viewport to the content instead, then put it back.
  // Sheets and reports are overlays on the viewport; stretching it would lay
  // them out on a 3,000px-tall phone.
  const overlay = /^(sheet|report)-/.test(name);
  const tall = overlay ? 0 : await page.evaluate(() => {
    let h = 0;
    for (const el of document.querySelectorAll('*')) {
      const o = getComputedStyle(el).overflowY;
      if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 4) h = Math.max(h, el.scrollHeight - el.clientHeight);
    }
    return h;
  });
  if (tall) await page.setViewportSize({ width, height: Math.min(844 + tall, 7000) });
  await page.waitForTimeout(tall ? 250 : 0);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  if (tall) await page.setViewportSize({ width, height: 844 });
}

await browser.close();
server.close();
