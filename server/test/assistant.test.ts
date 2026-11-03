// A morning brief written by the person's assistant (Claude) and delivered
// into Orbit with a key they made in the app.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, type Server } from './harness';

let server: Server;
before(async () => {
  server = await startServer();
});
after(() => server?.stop());

const deliver = (key: string, body: unknown, header: 'x-orbit-key' | 'authorization' = 'x-orbit-key') =>
  fetch(`${server.base}/api/assistant/brief`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [header]: header === 'authorization' ? `Bearer ${key}` : key },
    body: JSON.stringify(body),
  });
type S = { assistantBrief: { title: string; sections: { heading: string; body: string }[]; ts: number } | null };
const brief = {
  title: 'Morning brief · Sunday 1 November',
  sections: [
    { heading: "Today's post", body: 'Advocacy reel.\n- Hook one\n- **Hook two**' },
    { heading: 'Markets yesterday', body: 'S&P 500 closed up 0.4%.' },
  ],
};

test('a key delivers a brief that shows up in the person’s state, and only theirs', async () => {
  const c = await new Client(server.base).signup();
  const other = await new Client(server.base).signup();
  assert.deepEqual(await c.call('/api/assistant/key'), { exists: false });
  const made = await c.call<{ key: string; createdAt: number }>('/api/assistant/key', 'POST');
  assert.match(made.key, /^orb_[0-9a-f]{48}$/);

  const r = await deliver(made.key, brief);
  assert.equal(r.status, 200);
  const s = (await c.call('/api/state')) as unknown as S;
  assert.equal(s.assistantBrief!.title, brief.title);
  assert.deepEqual(s.assistantBrief!.sections, brief.sections);
  assert.ok(Math.abs(s.assistantBrief!.ts - Date.now()) < 60_000);
  assert.equal(((await other.call('/api/state')) as unknown as S).assistantBrief, null);

  const info = await c.call<{ exists: boolean; lastUsedAt: number | null }>('/api/assistant/key');
  assert.equal(info.exists, true);
  assert.ok(info.lastUsedAt, 'the key shows when it was last used');
  // A bearer header works too.
  assert.equal((await deliver(made.key, brief, 'authorization')).status, 200);
});

test('wrong, old and revoked keys are refused, and so is an empty brief', async () => {
  const c = await new Client(server.base).signup();
  const first = (await c.call<{ key: string }>('/api/assistant/key', 'POST')).key;
  assert.equal((await deliver('nope', brief)).status, 401);
  assert.equal((await deliver(`orb_${'0'.repeat(48)}`, brief)).status, 401);
  assert.equal((await deliver(first, { sections: [{ heading: '', body: 'x' }] })).status, 400);

  // Making a new key retires the old one.
  const second = (await c.call<{ key: string }>('/api/assistant/key', 'POST')).key;
  assert.equal((await deliver(first, brief)).status, 401);
  assert.equal((await deliver(second, brief)).status, 200);
  await c.call('/api/assistant/key', 'DELETE');
  assert.equal((await deliver(second, brief)).status, 401);
});

test('only the newest fourteen are kept, and the newest is the one shown', async () => {
  const c = await new Client(server.base).signup();
  const key = (await c.call<{ key: string }>('/api/assistant/key', 'POST')).key;
  for (let i = 1; i <= 16; i++) {
    assert.equal((await deliver(key, { title: `Brief ${i}`, sections: brief.sections })).status, 200);
  }
  const s = (await c.call('/api/state')) as unknown as S;
  assert.equal(s.assistantBrief!.title, 'Brief 16');
  // The export has all fourteen, oldest first.
  const ex = await c.call<{ assistantBriefs: { title: string }[] }>('/api/export');
  assert.deepEqual(ex.assistantBriefs.map((b) => b.title), Array.from({ length: 14 }, (_, k) => `Brief ${k + 3}`));
});
