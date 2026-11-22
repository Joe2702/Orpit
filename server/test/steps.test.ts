// Steps from the phone's health app, and the Steps habit they tick.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startServer, Client, type Server } from './harness';

let server: Server;
before(async () => {
  server = await startServer();
});
after(() => server?.stop());

type H = { id: string; name: string; auto: string | null; goal: number | null; since: string; days: string; locked: boolean };
type S = { habits: H[]; checkins: { habitId: string; day: string }[]; steps: { day: string; count: number; source: string | null }[] };
const st = (c: Client) => c.state as unknown as S;
const stepsHabit = (c: Client) => st(c).habits.find((h) => h.auto === 'steps');
const ticked = (c: Client) => st(c).checkins.filter((x) => x.habitId === stepsHabit(c)?.id).map((x) => x.day).sort();
// The server dates a habit by its own clock (UTC); the tests use the same days.
const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test('a new account has a Steps habit right after Daily Check-In, with a goal', async () => {
  const c = await new Client(server.base).signup();
  const h = stepsHabit(c)!;
  assert.ok(h, 'Steps habit exists');
  assert.equal(h.name, 'Steps');
  assert.equal(h.goal, 8000);
  assert.equal(h.locked, false);
  assert.equal(h.since, day());
  assert.deepEqual(st(c).habits.slice(0, 2).map((x) => x.name), ['Daily Check-In', 'Steps']);
  assert.deepEqual(st(c).steps, []);
});

test('reaching the goal ticks the habit once; taking it back sticks; days before the habit never tick', async () => {
  const c = await new Client(server.base).signup();
  const h = stepsHabit(c)!;

  // Morning: under the goal, nothing ticked. Yesterday (before the habit
  // existed) was well over it, and still isn't ticked.
  let r = (await c.call('/api/steps', 'POST', { days: [{ day: day(-1), count: 12000, source: 'Samsung Health' }, { day: day(), count: 3100 }] })) as { ticked: string[] };
  assert.deepEqual(r.ticked, []);
  assert.deepEqual(ticked(c), []);
  assert.deepEqual(st(c).steps.map((s) => [s.day, s.count, s.source]), [[day(-1), 12000, 'Samsung Health'], [day(), 3100, null]]);

  // Evening: over the goal, ticked.
  r = (await c.call('/api/steps', 'POST', { days: [{ day: day(), count: 8450, source: 'Google Fit' }] })) as { ticked: string[] };
  assert.deepEqual(r.ticked, [day()]);
  assert.deepEqual(ticked(c), [day()]);
  assert.equal(st(c).steps.find((s) => s.day === day())!.count, 8450);

  // They untick it by hand: the next sync, still over the goal, leaves it be.
  await c.call(`/api/habits/${h.id}/toggle`, 'POST', { day: day() });
  await c.call('/api/steps', 'POST', { days: [{ day: day(), count: 9100 }] });
  assert.deepEqual(ticked(c), []);
});

test('the background check gets a short answer', async () => {
  const c = await new Client(server.base).signup();
  const r = (await c.call('/api/steps?lean=1', 'POST', { days: [{ day: day(), count: 9000 }] })) as { ok: boolean; ticked: string[]; habits?: unknown };
  assert.equal(r.ok, true);
  assert.deepEqual(r.ticked, [day()]);
  assert.equal(r.habits, undefined);
});

test('changing the goal applies at once, and only the Steps habit takes one', async () => {
  const c = await new Client(server.base).signup();
  const h = stepsHabit(c)!;
  await c.call('/api/steps', 'POST', { days: [{ day: day(), count: 6200 }] });
  assert.deepEqual(ticked(c), []);
  await c.call(`/api/habits/${h.id}`, 'PATCH', { name: 'Steps', color: 'emerald', target: 'Daily', days: '1111111', goal: 6000 });
  assert.equal(stepsHabit(c)!.goal, 6000);
  assert.deepEqual(ticked(c), [day()]);

  // Pausing (no goal sent) keeps it; nonsense goals fall back to the default;
  // other habits never get one.
  await c.call(`/api/habits/${h.id}`, 'PATCH', { name: 'Steps', days: '1111111', paused: true });
  assert.equal(stepsHabit(c)!.goal, 6000);
  await c.call(`/api/habits/${h.id}`, 'PATCH', { name: 'Steps', days: '1111111', goal: 5 });
  assert.equal(stepsHabit(c)!.goal, 8000);
  const walk = st(c).habits.find((x) => x.name === 'Walk')!;
  await c.call(`/api/habits/${walk.id}`, 'PATCH', { name: 'Walk', days: '1111111', goal: 9000 });
  assert.equal(st(c).habits.find((x) => x.name === 'Walk')!.goal, null);
});

test('a day the habit is not planned for is not ticked', async () => {
  const c = await new Client(server.base).signup();
  const h = stepsHabit(c)!;
  const dow = new Date(`${day()}T12:00:00Z`).getUTCDay();
  const mask = '1111111'.split('').map((x, i) => (i === dow ? '0' : x)).join('');
  await c.call(`/api/habits/${h.id}`, 'PATCH', { name: 'Steps', days: mask, goal: 8000 });
  await c.call('/api/steps', 'POST', { days: [{ day: day(), count: 15000 }] });
  assert.deepEqual(ticked(c), []);
});

test('the Steps habit can be removed and added back, and there is only ever one', async () => {
  const c = await new Client(server.base).signup();
  await c.call(`/api/habits/${stepsHabit(c)!.id}`, 'DELETE');
  assert.equal(stepsHabit(c), undefined);
  await c.call('/api/habits', 'POST', { auto: 'steps', goal: 10000 });
  await c.call('/api/habits', 'POST', { auto: 'steps', goal: 6000 });
  const all = st(c).habits.filter((h) => h.auto === 'steps');
  assert.equal(all.length, 1);
  assert.equal(all[0].goal, 10000);
  assert.equal(all[0].name, 'Steps');
});

test('bad input is ignored, not stored', async () => {
  const c = await new Client(server.base).signup();
  await c.call('/api/steps', 'POST', {
    days: [{ day: 'today', count: 10 }, { day: day(), count: -5 }, { day: day(), count: 'lots' }, { day: day(), count: 999_999 }, null],
  });
  assert.deepEqual(st(c).steps, []);
});

test('existing accounts get the Steps habit once, and a removed one stays removed', async () => {
  const a = await new Client(server.base).signup();
  const b = await new Client(server.base).signup();
  await a.call(`/api/habits/${stepsHabit(a)!.id}`, 'DELETE');
  await b.call(`/api/habits/${stepsHabit(b)!.id}`, 'DELETE');
  // `a` is an account from before Steps existed; `b` removed theirs.
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await db.query('UPDATE users SET steps_habit_added = FALSE WHERE email = $1', [a.email]);
  await db.end();

  // Starting the server is when existing accounts are brought up to date.
  const again = await startServer();
  try {
    const a2 = Object.assign(new Client(again.base), { token: a.token });
    const b2 = Object.assign(new Client(again.base), { token: b.token });
    await a2.call('/api/state');
    await b2.call('/api/state');
    assert.ok(stepsHabit(a2), 'added once for the older account');
    assert.equal(stepsHabit(b2), undefined, 'not brought back after removing it');
  } finally {
    again.stop();
  }
});

test('a database with the older steps table is brought up to date, and its counts kept', async () => {
  // Production had a steps table from an earlier Orpit: the day's total in a
  // column called "steps", with no source or updated_at. The new code read
  // "count" from it, and every account failed to load.
  const c = await new Client(server.base).signup();
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    await db.query('ALTER TABLE steps RENAME COLUMN count TO steps');
    await db.query('ALTER TABLE steps DROP COLUMN source, DROP COLUMN updated_at');
    await db.query(`INSERT INTO steps (user_id, day, steps) SELECT id, $2, 6400 FROM users WHERE email = $1`, [c.email, day(-1)]);
  } finally {
    await db.end();
  }

  // The server brings the table up to date when it starts.
  const again = await startServer();
  try {
    const c2 = Object.assign(new Client(again.base), { token: c.token });
    await c2.call('/api/state');
    assert.deepEqual(st(c2).steps.map((s) => [s.day, s.count, s.source]), [[day(-1), 6400, null]]);
    await c2.call('/api/steps', 'POST', { days: [{ day: day(), count: 4200, source: 'Samsung Health' }] });
    assert.equal(st(c2).steps.find((s) => s.day === day())!.source, 'Samsung Health');
  } finally {
    again.stop();
  }
});
