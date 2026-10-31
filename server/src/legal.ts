import { Router, type Request, type Response } from 'express';
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

export type Lang = 'en' | 'ar';

/** ?lang=ar or ?lang=en wins; otherwise the browser's own language decides. */
export function pickLang(req: Request): Lang {
  const q = String(req.query.lang || '');
  if (q === 'ar' || q === 'en') return q;
  return /^ar\b/i.test(String(req.headers['accept-language'] || '')) ? 'ar' : 'en';
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page(title: string, body: string, lang: Lang = 'en'): string {
  const ar = lang === 'ar';
  const q = ar ? '?lang=ar' : '';
  return `<!doctype html>
<html lang="${lang}" dir="${ar ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Orbit</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0 auto; padding: 40px 22px 80px; max-width: 680px;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Arabic", Tahoma, system-ui, sans-serif;
    color: #1c1b2e; background: #fbfbfe;
  }
  h1 { font-size: 30px; line-height: 1.2; letter-spacing: -.02em; margin: 0 0 6px; }
  h2 { font-size: 19px; letter-spacing: -.01em; margin: 34px 0 10px; }
  p, li { color: #35334d; }
  ul { padding-inline-start: 22px; }
  .lang { float: inline-end; font-size: 14px; }
  form { display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0 4px; }
  input[type=email] { flex: 1 1 220px; font: inherit; padding: 11px 14px; border-radius: 12px; border: 1px solid #cfcce3; background: transparent; color: inherit; direction: ltr; }
  button { font: inherit; font-weight: 600; padding: 11px 18px; border-radius: 12px; border: 0; background: #5a54b4; color: #fff; cursor: pointer; }
  button.danger { background: #c4413a; }
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
<a class="lang" href="?lang=${ar ? 'en' : 'ar'}" lang="${ar ? 'en' : 'ar'}">${ar ? 'English' : 'العربية'}</a>
${body}
<div class="foot">Orbit · <a href="/privacy${q}">${ar ? 'سياسة الخصوصية' : 'Privacy policy'}</a> · <a href="/delete-account${q}">${ar ? 'حذف حسابك' : 'Delete your account'}</a> · <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></div>
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

const privacyPaths = (file: string) => [
  join(here, '../..', file), // running from server/dist in production
  join(here, '..', file),
  join(process.cwd(), file),
  join(process.cwd(), '..', file),
];

function privacyHtml(lang: Lang = 'en'): string {
  for (const p of [...(lang === 'ar' ? privacyPaths('PRIVACY.ar.md') : []), ...privacyPaths('PRIVACY.md')]) {
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

const DELETE_EN = `
<h1>Deleting your Orbit account</h1>
<p class="meta">Orbit · com.orbit.app</p>

<p>You can delete your Orbit account and everything in it at any time, from the
app or from this page.</p>

<h2>From the app</h2>
<div class="box">
  <ul>
    <li>Open Orbit and sign in.</li>
    <li>Go to <strong>Profile</strong> (the last tab).</li>
    <li>Scroll to the end and tap <strong>Delete my account</strong>.</li>
    <li>Confirm, then enter your password. The account is deleted straight away
        and you are signed out.</li>
  </ul>
</div>

<h2>Without the app</h2>
<p>Enter the email address of the account. We'll send a link to it; open the link
and confirm, and the account is deleted. The link works for one hour.</p>
<div class="box">
  <form method="post" action="/delete-account/request">
    <input type="email" name="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email">
    <button type="submit">Send me the link</button>
  </form>
</div>

<h2>What gets deleted</h2>
<p>Everything tied to the account, permanently:</p>
<ul>
  <li>Your account itself: email, name, password hash, Google account link and profile photo.</li>
  <li>Every entry you logged: habits and check-ins, workouts, sleep, transactions,
      accounts, budgets, goals, recurring items, counters and counter logs.</li>
  <li>Your settings, reminder schedule, notification subscriptions and partner connections.</li>
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
JSON file in the app: <strong>Profile → Data → Export data</strong>.</p>

<h2>No longer have access to that email?</h2>
<p>Write to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> and we'll help you
prove the account is yours.</p>
`;

const DELETE_AR = `
<h1>حذف حسابك في Orbit</h1>
<p class="meta">Orbit · com.orbit.app</p>

<p>يمكنك حذف حسابك في Orbit وكل ما فيه في أي وقت، من التطبيق أو من هذه الصفحة.</p>

<h2>من التطبيق</h2>
<div class="box">
  <ul>
    <li>افتح Orbit وسجّل الدخول.</li>
    <li>اذهب إلى <strong>حسابي</strong> (آخر تبويب).</li>
    <li>انزل إلى النهاية واضغط <strong>حذف حسابي</strong>.</li>
    <li>أكّد، ثم أدخل كلمة المرور. يُحذف الحساب فورًا ويُسجَّل خروجك.</li>
  </ul>
</div>

<h2>بدون التطبيق</h2>
<p>أدخل البريد الإلكتروني للحساب. سنرسل إليه رابطًا؛ افتحه وأكّد، فيُحذف الحساب.
الرابط صالح لمدة ساعة.</p>
<div class="box">
  <form method="post" action="/delete-account/request?lang=ar">
    <input type="email" name="email" required placeholder="you@example.com" autocomplete="email" aria-label="البريد الإلكتروني">
    <button type="submit">أرسل لي الرابط</button>
  </form>
</div>

<h2>ما الذي يُحذف</h2>
<p>كل ما يرتبط بالحساب، نهائيًا:</p>
<ul>
  <li>الحساب نفسه: البريد والاسم وكلمة المرور المشفّرة وربط حساب Google والصورة الشخصية.</li>
  <li>كل ما سجّلته: العادات والإنجازات والتمارين والنوم والمعاملات والحسابات
      والميزانيات والأهداف والعناصر المتكررة والعدّادات وتسجيلاتها.</li>
  <li>إعداداتك وجدول التذكيرات واشتراكات الإشعارات وروابط الشراكة.</li>
</ul>

<h2>ما الذي يبقى، ولمدة كم</h2>
<ul>
  <li><strong>النسخ الاحتياطية الدورية</strong> قد تحتوي على نسخ متبقية حتى 30 يومًا،
      ثم يُكتب فوقها. ولا تُستخدم أبدًا لاستعادة حساب محذوف.</li>
  <li><strong>الملاحظات أو رسائل الدعم</strong> التي اخترت إرسالها تبقى ليظل سياق
      المحادثة مفهومًا. اطلب حذفها وستُحذف أيضًا.</li>
</ul>
<p>لا يُحتفظ بشيء لأغراض الإعلانات أو التنميط، لأن Orbit لا يفعل أيًا منهما.</p>

<h2>تريد بياناتك أولًا؟</h2>
<p>لا يمكن التراجع عن الحذف. قبل الحذف يمكنك تنزيل كل شيء في ملف JSON من التطبيق:
<strong>حسابي ← البيانات ← تصدير البيانات</strong>.</p>

<h2>لم يعد لديك وصول إلى ذلك البريد؟</h2>
<p>راسل <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> وسنساعدك على إثبات أن
الحساب لك.</p>
`;

/** The pages along the way of a deletion requested from the web. */
export function deletionPages(lang: Lang) {
  const ar = lang === 'ar';
  const q = ar ? '?lang=ar' : '';
  return {
    sent: ar
      ? `<h1>تحقق من بريدك</h1><p>إن كان هناك حساب في Orbit بهذا البريد، فقد أرسلنا إليه رابطًا لحذفه. الرابط صالح لمدة ساعة.</p><p>لم يصلك شيء؟ تحقق من مجلد الرسائل غير المرغوبة، أو <a href="/delete-account${q}">حاول مرة أخرى</a>.</p>`
      : `<h1>Check your email</h1><p>If there's an Orbit account with that address, we've sent it a link to delete it. The link works for one hour.</p><p>Nothing arrived? Look in your spam folder, or <a href="/delete-account${q}">try again</a>.</p>`,
    confirm: (email: string, token: string) =>
      ar
        ? `<h1>حذف هذا الحساب؟</h1><p>سيُحذف حساب Orbit المرتبط بـ <strong dir="ltr">${esc(email)}</strong> وكل ما فيه نهائيًا. لا يمكن التراجع عن ذلك.</p>
<form method="post" action="/delete-account/confirm?lang=ar"><input type="hidden" name="token" value="${esc(token)}"><button class="danger" type="submit">حذف الحساب نهائيًا</button></form>`
        : `<h1>Delete this account?</h1><p>The Orbit account for <strong>${esc(email)}</strong> and everything in it will be deleted permanently. This can't be undone.</p>
<form method="post" action="/delete-account/confirm"><input type="hidden" name="token" value="${esc(token)}"><button class="danger" type="submit">Delete the account permanently</button></form>`,
    invalid: ar
      ? `<h1>انتهت صلاحية هذا الرابط</h1><p>الرابط صالح لمدة ساعة ولمرة واحدة. <a href="/delete-account${q}">اطلب رابطًا جديدًا</a>.</p>`
      : `<h1>This link has expired</h1><p>Links work once, for one hour. <a href="/delete-account${q}">Ask for a new one</a>.</p>`,
    done: ar
      ? `<h1>تم حذف حسابك</h1><p>أُزيل حسابك في Orbit وكل ما فيه. يمكنك إزالة التطبيق من هاتفك أيضًا.</p>`
      : `<h1>Your account has been deleted</h1><p>Your Orbit account and everything in it are gone. You can remove the app from your phone too.</p>`,
  };
}

/** A full page in the reader's language, for routes outside this router. */
export const legalPage = (lang: Lang, title: string, body: string): string => page(title, body, lang);

export const legalRouter = Router();

// Cached for a day: the content only changes when the app is redeployed, and a
// reviewer hitting a cold free-tier server shouldn't wait on a file read.
const serve = (title: [string, string], body: (lang: Lang) => string) => (req: Request, res: Response) => {
  const lang = pickLang(req);
  res.set('Cache-Control', 'public, max-age=86400');
  res.set('Vary', 'Accept-Language');
  res.type('html').send(page(lang === 'ar' ? title[1] : title[0], body(lang), lang));
};

const privacy = serve(['Privacy Policy', 'سياسة الخصوصية'], privacyHtml);
const deletion = serve(['Delete your account', 'حذف حسابك'], (lang) => (lang === 'ar' ? DELETE_AR : DELETE_EN));
legalRouter.get('/privacy', privacy);
legalRouter.get('/privacy-policy', privacy);
legalRouter.get('/delete-account', deletion);
legalRouter.get('/account-deletion', deletion);
