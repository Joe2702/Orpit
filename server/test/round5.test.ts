// The public pages a Play reviewer opens, and deleting an account from the web
// by someone who no longer has the app.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, type Server } from './harness';

let server: Server;
before(async () => {
  server = await startServer();
});
after(() => server?.stop());

const form = (path: string, fields: Record<string, string>) =>
  fetch(server.base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
const linkIn = (html: string) => {
  const m = /href="[^"]*\/delete-account\/confirm\?token=([0-9a-f]{64})/.exec(html);
  assert.ok(m, 'the email carries a confirm link');
  return m![1];
};

test('privacy and deletion pages work without an account, in English and Arabic', async () => {
  const en = await (await fetch(`${server.base}/privacy`)).text();
  assert.match(en, /Privacy Policy/);
  assert.match(en, /<html lang="en" dir="ltr">/);
  const ar = await (await fetch(`${server.base}/privacy?lang=ar`)).text();
  assert.match(ar, /<html lang="ar" dir="rtl">/);
  assert.match(ar, /سياسة الخصوصية/);
  const byHeader = await (await fetch(`${server.base}/delete-account`, { headers: { 'accept-language': 'ar-EG,ar;q=0.9' } })).text();
  assert.match(byHeader, /حذف حسابك في Orbit/);
  const del = await (await fetch(`${server.base}/delete-account`)).text();
  assert.match(del, /action="\/delete-account\/request"/);
});

test('an account is deleted only after its owner confirms from the emailed link', async () => {
  const c = await new Client(server.base).signup();
  const page = await (await form('/delete-account/request', { email: c.email.toUpperCase() })).text();
  assert.match(page, /Check your email/);
  const mail = server.outbox().filter((m) => m.to === c.email && m.tag === 'delete').at(-1);
  assert.ok(mail, 'a deletion email was sent to the account');
  const token = linkIn(mail!.html);

  // Opening the link only asks; mail scanners open links.
  const ask = await (await fetch(`${server.base}/delete-account/confirm?token=${token}`)).text();
  assert.match(ask, new RegExp(c.email.replace(/\./g, '\\.')));
  await c.call('/api/state');

  const done = await form('/delete-account/confirm', { token });
  assert.equal(done.status, 200);
  assert.match(await done.text(), /has been deleted/);
  await assert.rejects(c.call('/api/state'), /40[14]/);

  // Each link works once.
  const again = await form('/delete-account/confirm', { token });
  assert.equal(again.status, 400);
});

test('an unknown email gets the same answer and no email', async () => {
  const before = server.outbox().length;
  const page = await (await form('/delete-account/request', { email: 'nobody-here@test.dev' })).text();
  assert.match(page, /Check your email/);
  assert.equal(server.outbox().length, before);
  const bad = await form('/delete-account/confirm', { token: 'f'.repeat(64) });
  assert.equal(bad.status, 400);
});

test('asked in Arabic, the email and pages are in Arabic', async () => {
  const c = await new Client(server.base).signup();
  const page = await (await form('/delete-account/request?lang=ar', { email: c.email })).text();
  assert.match(page, /تحقق من بريدك/);
  const mail = server.outbox().filter((m) => m.to === c.email).at(-1)!;
  assert.match(mail.subject, /حذف حسابك/);
  assert.match(mail.html, /dir="rtl"/);
  assert.match(mail.html, /lang=ar/);
});

test('a password-reset email follows the app language', async () => {
  const c = await new Client(server.base).signup();
  await fetch(`${server.base}/api/auth/request-reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-orbit-lang': 'ar' },
    body: JSON.stringify({ email: c.email }),
  });
  const mail = server.outbox().filter((m) => m.to === c.email && m.tag === 'reset').at(-1);
  assert.ok(mail);
  assert.match(mail!.subject, /إعادة تعيين/);
});
