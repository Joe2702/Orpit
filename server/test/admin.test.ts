// The developer's numbers at /admin: accounts, people each day, sessions and
// new accounts, behind the admin password.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, ADMIN, type Server } from './harness';

let server: Server;
before(async () => {
  server = await startServer();
});
after(() => server?.stop());

type Day = { day: string; people: number; opens: number; signups: number };
type Metrics = { active: { d1: number; users: number }; daily: Day[] };
const today = () => new Date().toISOString().slice(0, 10);

test('the day-by-day numbers count people, sessions and new accounts, every day present', async () => {
  const a = await new Client(server.base).signup();
  const before = await a.call<Metrics>('/api/admin/metrics', 'GET', undefined).catch(() => null);
  assert.equal(before, null, 'no numbers without the admin password');

  const get = () =>
    fetch(`${server.base}/api/admin/metrics`, { headers: { authorization: `Bearer ${a.token}`, 'x-admin-password': ADMIN } }).then((r) => r.json() as Promise<Metrics>);
  const m0 = await get();
  // Two sessions today from one person, then one from another.
  await a.call('/api/usage', 'POST', { day: today(), counts: { open: 2 } });
  const b = await new Client(server.base).signup();
  await b.call('/api/usage', 'POST', { day: today(), counts: { open: 1 } });
  const m = await get();

  assert.equal(m.daily.length, 30);
  assert.equal(m.daily[29].day, today());
  const d0 = m0.daily[29];
  const d = m.daily[29];
  assert.equal(d.people - d0.people, 2);
  assert.equal(d.opens - d0.opens, 3);
  assert.equal(d.signups - d0.signups, 1);
  assert.ok(m.active.users >= 2);
  // Days with nothing in them are still there, as zeros.
  assert.ok(m.daily.every((x) => x.people >= 0 && x.opens >= 0 && x.signups >= 0));
});
