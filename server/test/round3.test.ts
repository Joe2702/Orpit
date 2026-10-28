// Sharing a bank message format, and the compressed state response.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, ADMIN, type Server } from './harness';
import { maskMessage } from '../../web/src/lib/smsParse';

let server: Server;
before(async () => {
  server = await startServer();
});
after(() => server?.stop());

test('a masked format is kept for the admin; an unmasked one is refused', async () => {
  const c = await new Client(server.base).signup();
  const raw = 'Dear Youssif, EGP 1,450.00 was deducted to Ahmed Ali on 21/10';
  const masked = maskMessage(raw);
  await assert.rejects(c.call('/api/sms-samples', 'POST', { sender: 'NewBank', text: raw, reason: 'no-verb' }), /400/);
  await c.call('/api/sms-samples', 'POST', { sender: 'NewBank', text: masked, reason: 'no-verb' });
  const r = await fetch(`${server.base}/api/admin/sms-samples`, { headers: { authorization: `Bearer ${c.token}`, 'x-admin-password': ADMIN } });
  const { items } = (await r.json()) as { items: { sender: string; text: string }[] };
  const mine = items.find((i) => i.sender === 'NewBank');
  assert.ok(mine);
  assert.equal(mine!.text, masked);
  assert.doesNotMatch(mine!.text, /Youssif|Ahmed|1,450/);
});

test('the state comes back compressed', async () => {
  const c = await new Client(server.base).signup();
  const r = await fetch(`${server.base}/api/state`, { headers: { authorization: `Bearer ${c.token}`, 'accept-encoding': 'gzip' } });
  assert.equal(r.headers.get('content-encoding'), 'gzip');
  assert.ok(((await r.json()) as { habits: unknown[] }).habits.length > 0);
});
