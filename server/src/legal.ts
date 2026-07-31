import { Router, type Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Public legal pages.
//
// Google Play requires two URLs that work for someone who has never installed
// the app and has no account: a privacy policy, and — for any app that lets you
// create an account — a page explaining how to delete it. Orbit's in-app privacy
// screen doesn't satisfy either, because it sits behind the sign-in wall.
//
// These are deliberately plain server-rendered HTML rather than SPA routes: a
// reviewer (or a crawler, or someone on a dying connection) must see the text
// without JavaScript running and without a round trip to the API.

const SUPPORT_EMAIL = 'youssif_mohammed@aucegypt.edu';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Orbit</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0 auto; padding: 40px 22px 80px; max-width: 680px;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
    color: #1c1b2e; background: #fbfbfe;
  }
  h1 { font-size: 30px; line-height: 1.2; letter-spacing: -.02em; margin: 0 0 6px; }
  h2 { font-size: 19px; letter-spacing: -.01em; margin: 34px 0 10px; }
  p, li { color: #35334d; }
  ul { padding-left: 22px; }
  li { margin: 5px 0; }
  a { color: #5a54b4; }
  .meta { color: #6b6885; font-size: 14px; margin: 0 0 28px; }
  .box { border: 1px solid #e3e1f0; background: #fff; border-radius: 14px; padding: 18px 20px; margin: 22px 0; }
  .foot { margin-top: 46px; padding-top: 20px; border-top: 1px solid #e3e1f0; font-size: 14px; color: #6b6885; }
  @media (prefers-color-scheme: dark) {
    body { color: #eceaf7; background: #14131f; }
    p, li { color: #c3c0d8; }
    a { color: #a9a3f0; }
    .meta, .foot { color: #8b88a6; }
    .box { background: #1c1b2b; border-color: #2c2a3f; }
    .foot { border-color: #2c2a3f; }
  }
</style>
</head>
<body>
${body}
<div class="foot">Orbit · <a href="/privacy">Privacy policy</a> · <a href="/delete-account">Delete your account</a> · <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></div>
</body>
</html>`;
}

/**
 * Render the subset of Markdown that PRIVACY.md actually uses. Keeping the
 * repo's document as the single source of truth matters more than generality
 * here — a policy that drifts from the one users were shown is worse than no
 * policy at all. Everything is escaped before any tag is introduced.
 */
function renderMarkdown(md: string): string {
  const inline = (s: string): string =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\s)_(.+?)_(?=\s|$|[.,])/g, '$1<em>$2</em>')
      .replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/(^|[\s(])((?:https?:\/\/|mailto:)[^\s)]+)/g, '$1<a href="$2">$2</a>');

  const out: string[] = [];
  let para: string[] = [];   // lines of the paragraph being accumulated
  let items: string[] = [];  // lines of the list item being accumulated
  let list: string[] = [];   // finished items of the current list

  // The document wraps at 80 columns, so a paragraph, a bullet and a bold
  // lead-in above a bullet list are all multi-line and none are separated by a
  // blank line. Tracking state per line is the only way to keep them apart;
  // splitting on blank lines merged whole sections into single paragraphs.
  const flushItem = () => {
    if (items.length) list.push(`<li>${inline(items.join(' '))}</li>`);
    items = [];
  };
  const flushList = () => {
    flushItem();
    if (list.length) out.push(`<ul>\n${list.join('\n')}\n</ul>`);
    list = [];
  };
  const flushPara = () => {
    if (para.length) {
      const text = para.join(' ');
      // The italic "_Last updated_" line is metadata, not prose.
      const cls = /^_.*_$/.test(text.trim()) ? ' class="meta"' : '';
      out.push(`<p${cls}>${inline(text)}</p>`);
    }
    para = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
  };

  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushAll();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = Math.min(heading[1].length, 2);
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line.trim())) {
      flushPara();
      flushItem();
      items.push(line.trim().replace(/^[-*]\s+/, ''));
      continue;
    }
    // Indented continuation of the bullet above, rather than a new paragraph.
    if (items.length && /^\s+\S/.test(raw)) {
      items.push(line.trim());
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushAll();
  return out.join('\n');
}

const PRIVACY_PATHS = [
  join(here, '../../PRIVACY.md'), // running from server/dist in production
  join(here, '../PRIVACY.md'),
  join(process.cwd(), 'PRIVACY.md'),
  join(process.cwd(), '../PRIVACY.md'),
];

function privacyHtml(): string {
  for (const p of PRIVACY_PATHS) {
    try {
      if (existsSync(p)) return renderMarkdown(readFileSync(p, 'utf8'));
    } catch {
      /* try the next location */
    }
  }
  // The policy must never 404 — an unreachable privacy URL fails Play review.
  return `<h1>Orbit — Privacy Policy</h1>
<p>Orbit stores only the account details you provide (email, name, password hash)
and the entries you create: habits, workouts, sleep, transactions, budgets, goals
and counters. It contains no advertising or analytics SDKs, does not track your
location, and does not read your contacts, photos, or data from other apps. Your
data is never sold or shared with advertisers.</p>
<p>You can export everything as JSON, erase your entries, or delete your account
entirely from Profile → Data. For any privacy request, contact
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>`;
}

const DELETE_BODY = `
<h1>Deleting your Orbit account</h1>
<p class="meta">Orbit · com.orbit.app</p>

<p>You can delete your Orbit account and everything in it at any time. No email,
no form, no waiting on a reply — it happens immediately, from inside the app.</p>

<h2>How to delete it</h2>
<div class="box">
  <ul>
    <li>Open Orbit and sign in.</li>
    <li>Go to <strong>Profile</strong> (the last tab).</li>
    <li>Scroll to <strong>Danger zone</strong> and tap <strong>Delete my account</strong>.</li>
    <li>Confirm, then enter your password. The account is deleted straight away
        and you are signed out.</li>
  </ul>
</div>
<p>If you signed in with Google and have no password set, the confirmation step
asks you to confirm through Google instead.</p>

<h2>What gets deleted</h2>
<p>Everything tied to the account, permanently:</p>
<ul>
  <li>Your account itself — email, name, password hash, Google account link and profile photo.</li>
  <li>Every entry you logged: habits and check-ins, workouts, sleep, transactions,
      accounts, budgets, goals, recurring items, counters and counter logs.</li>
  <li>Your settings, reminder schedule and notification subscriptions.</li>
</ul>

<h2>What is kept, and for how long</h2>
<ul>
  <li><strong>Routine database backups</strong> may contain residual copies for up
      to 30 days, after which they are overwritten. They are never used to restore
      a deleted account.</li>
  <li><strong>Feedback or support messages</strong> you chose to send are kept so
      the conversation makes sense. Ask and they will be removed too.</li>
</ul>
<p>Nothing is retained for advertising or profiling, because Orbit does neither.</p>

<h2>Want your data first?</h2>
<p>Deletion cannot be undone. Before you delete, you can download everything as a
JSON file: <strong>Profile → Data → Export data</strong>.</p>

<h2>Can't get into the app?</h2>
<p>If you can't sign in, email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
from the address on the account and the deletion will be carried out for you.</p>
`;

export const legalRouter = Router();

// Cached for a day: the content only changes when the app is redeployed, and a
// reviewer hitting a cold free-tier server shouldn't wait on a file read.
const serve = (title: string, body: () => string) => (_req: unknown, res: Response) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('html').send(page(title, body()));
};

legalRouter.get('/privacy', serve('Privacy Policy', privacyHtml));
legalRouter.get('/privacy-policy', serve('Privacy Policy', privacyHtml));
legalRouter.get('/delete-account', serve('Delete your account', () => DELETE_BODY));
legalRouter.get('/account-deletion', serve('Delete your account', () => DELETE_BODY));
