// Sleep and workouts read from Health Connect (where Fitbit saves them) and
// sent to the server as Orbit entries.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, type Server } from './harness';

let server: Server;
before(async () => {
  server = await startServer();
});
after(() => server?.stop());

const H = 3_600_000;
const D = 24 * H;
// Two mornings ago at 07:00 UTC, so nothing here is in the future.
const MORNING = Math.floor(Date.now() / D) * D - 2 * D + 7 * H;

type Imported = { imported: { nights: number; workouts: number; skipped: number } };
type S = {
  nights: { id: string; hours: number; quality: number; bedH: number | null; wakeH: number | null; source: string | null; ts: number }[];
  workouts: { id: string; name: string; catId: string | null; dur: number; dist: string | null; kcal: number | null; source: string | null; ts: number }[];
};
const night = (extId: string, ts: number, extra: Record<string, unknown> = {}) => ({ extId, source: 'Fitbit', hours: 7.4, quality: 8, bedH: 23.5, wakeH: 7, ts, ...extra });
const workout = (extId: string, ts: number, extra: Record<string, unknown> = {}) => ({ extId, source: 'Fitbit', name: 'Run', dur: 42, dist: '6.1 km', kcal: 410, ts, ...extra });

test('imported nights and workouts arrive once, however often the phone syncs', async () => {
  const c = await new Client(server.base).signup();
  const body = {
    nights: [night('hc-n1', MORNING), night('hc-n2', MORNING - D, { hours: 6.2, quality: 6 })],
    workouts: [workout('hc-w1', MORNING + 10 * H), workout('hc-w2', MORNING - D + 18 * H, { name: 'Strength training', dur: 55, dist: null, kcal: null })],
  };
  const first = await c.call<Imported>('/api/health/import', 'POST', body);
  assert.deepEqual(first.imported, { nights: 2, workouts: 2, skipped: 0 });
  const again = await c.call<Imported>('/api/health/import', 'POST', body);
  assert.deepEqual(again.imported, { nights: 0, workouts: 0, skipped: 0 });

  const s = (await c.call('/api/state')) as unknown as S;
  assert.equal(s.nights.length, 2);
  assert.equal(s.workouts.length, 2);
  const n = s.nights.find((x) => x.hours === 7.4)!;
  assert.equal(n.source, 'Fitbit');
  assert.equal(n.quality, 8);
  assert.equal(n.bedH, 23.5);
  assert.ok(Math.abs(n.ts - MORNING) < 1000);
  const run = s.workouts.find((x) => x.name === 'Run')!;
  assert.deepEqual([run.dur, run.dist, run.kcal, run.source], [42, '6.1 km', 410, 'Fitbit']);
});

test('what was logged by hand wins, and a deleted import stays deleted', async () => {
  const c = await new Client(server.base).signup();
  // Logged by hand: last night, and a gym session at 18:00.
  await c.call('/api/nights', 'POST', { hours: 7, quality: 9, bedH: 0, wakeH: 7, ts: MORNING + 30 * 60_000 });
  const cat = (c.state as unknown as { wCats: { id: string }[] }).wCats[0];
  await c.call('/api/workouts', 'POST', { catId: cat.id, dur: 60, ts: MORNING + 11 * H });

  const r = await c.call<Imported>('/api/health/import', 'POST', {
    nights: [night('hc-n1', MORNING), night('hc-n9', MORNING - D)],
    workouts: [workout('hc-w1', MORNING + 11 * H + 20 * 60_000), workout('hc-w9', MORNING + 4 * H)],
  });
  assert.deepEqual(r.imported, { nights: 1, workouts: 1, skipped: 2 });
  const s = r as unknown as S;
  assert.equal(s.nights.find((x) => Math.abs(x.ts - MORNING) < 2 * H)!.quality, 9, 'the hand-logged night is untouched');

  // Delete the imported night: the next sync leaves it out.
  const imported = s.nights.find((x) => x.source === 'Fitbit')!;
  await c.call(`/api/nights/${imported.id}`, 'DELETE');
  const later = await c.call<Imported>('/api/health/import', 'POST', { nights: [night('hc-n9', MORNING - D)], workouts: [] });
  assert.deepEqual(later.imported, { nights: 0, workouts: 0, skipped: 1 });
  assert.equal((later as unknown as S).nights.filter((x) => x.source === 'Fitbit').length, 0);
});

test('nonsense is skipped, and a category must be the person’s own', async () => {
  const a = await new Client(server.base).signup();
  const b = await new Client(server.base).signup();
  const theirs = (b.state as unknown as { wCats: { id: string }[] }).wCats[0].id;
  const r = await a.call<Imported>('/api/health/import', 'POST', {
    nights: [night('', MORNING), night('x1', MORNING, { quality: 14 }), night('x2', MORNING, { hours: 30 })],
    workouts: [workout('y1', MORNING, { dur: 0 }), workout('y2', MORNING, { name: '' }), workout('y3', MORNING + 5 * H, { catId: theirs })],
  });
  assert.deepEqual(r.imported, { nights: 0, workouts: 1, skipped: 5 });
  assert.equal((r as unknown as S).workouts[0].catId, null);
});
