// Goals that follow an account, and the usage counts behind the retention
// numbers: what's stored, what's refused, and that turning counts off deletes
// them.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, ADMIN, type Server } from './harness';

let server: Server;
before(async () => {
  server = await startServer();
});
after(() => server?.stop());
const user = () => new Client(server.base).signup();

test('a goal can follow one of your accounts, and only yours', async () => {
  const a = await user();
  const b = await user();
  await a.call('/api/accounts', 'POST', { name: 'Savings', type: 'Savings', color: 'emerald', opening: 5000 });
  const savings = a.account('Savings');
  await a.call('/api/goals', 'POST', { name: 'Trip', target: 20000, current: 0, color: 'indigo', dueTs: null, accId: savings.id });
  assert.equal(a.state.goals[0].accId, savings.id);

  // Someone else's account id is not accepted.
  await b.call('/api/goals', 'POST', { name: 'Car', target: 1000, current: 0, color: 'indigo', dueTs: null, accId: savings.id });
  assert.equal(b.state.goals[0].accId, null);

  // Deleting the account leaves the goal, unlinked.
  await a.call('/api/accounts', 'POST', { name: 'Spare', type: 'Bank', color: 'blue', opening: 0 });
  await a.call(`/api/accounts/${savings.id}`, 'DELETE');
  assert.equal(a.state.goals[0].accId, null);
});

test('usage counts keep only known names, add up, and go when turned off', async () => {
  const c = await user();
  const day = new Date().toISOString().slice(0, 10);
  await c.call('/api/usage', 'POST', { day, counts: { open: 2, habit_check: 3, bogus_name: 9 } });
  await c.call('/api/usage', 'POST', { day, counts: { open: 1 } });

  const metrics = async () => {
    const r = await fetch(`${server.base}/api/admin/metrics`, { headers: { authorization: `Bearer ${c.token}`, 'x-admin-password': ADMIN } });
    assert.equal(r.status, 200);
    return (await r.json()) as { active: { d1: number }; features: { name: string; users: number; total: number }[] };
  };
  const m = await metrics();
  assert.ok(m.active.d1 >= 1);
  assert.ok(m.features.some((f) => f.name === 'habit_check'));
  assert.ok(!m.features.some((f) => f.name === 'bogus_name'), 'unknown names are dropped');

  // A wrong admin password gets nothing.
  const denied = await fetch(`${server.base}/api/admin/metrics`, { headers: { authorization: `Bearer ${c.token}`, 'x-admin-password': 'nope' } });
  assert.equal(denied.status, 403);

  // Off: what was counted goes, and nothing new is kept.
  await c.call('/api/me', 'PATCH', { shareUsage: false });
  assert.equal(c.state.profile.shareUsage, false);
  await c.call('/api/usage', 'POST', { day, counts: { open: 5 } });
  const after = await metrics();
  const mine = after.features.find((f) => f.name === 'habit_check');
  assert.ok(!mine || mine.total < 3, "this user's counts were deleted");
});
