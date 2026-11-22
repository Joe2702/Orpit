// Bulk actions on the website's transaction table do every entry selected.
// They used to stop quietly at 1,000 (checked) or 2,000 (re-filed, deleted)
// while the app said it had done them all.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { startServer, Client, type Server } from './harness';

let server: Server;
let db: pg.Pool;
before(async () => {
  server = await startServer();
  db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
});
after(async () => {
  server?.stop();
  await db?.end();
});

const N = 2_600;

async function withEntries() {
  const c = await new Client(server.base).signup();
  const ids = await db.query<{ id: string }>(
    `INSERT INTO txns (user_id, name, cat, amount, income, review, ts)
     SELECT u.id, 'Entry ' || g, 'Food', -10, false, true, now() - g * interval '1 minute'
     FROM users u, generate_series(1, $2) g WHERE u.email = $1 RETURNING id::text`,
    [c.email, N]
  );
  const count = async (where: string) =>
    Number((await db.query(`SELECT count(*)::int AS n FROM txns t JOIN users u ON u.id = t.user_id WHERE u.email = $1 AND ${where}`, [c.email])).rows[0].n);
  return { c, ids: ids.rows.map((r) => r.id), count };
}

test('checking, re-filing and deleting thousands of entries does all of them', async () => {
  const { c, ids, count } = await withEntries();
  await c.call('/api/txns/reviewed', 'POST', { ids });
  assert.equal(await count('review'), 0);
  await c.call('/api/txns/recat', 'POST', { ids, cat: 'Groceries' });
  assert.equal(await count(`cat = 'Groceries'`), N);
  await c.call('/api/txns/delete', 'POST', { ids });
  assert.equal(await count('true'), 0);
});

test('a bulk action never reaches someone else’s entries', async () => {
  const mine = await withEntries();
  const other = await new Client(server.base).signup();
  await other.call('/api/txns/delete', 'POST', { ids: mine.ids });
  assert.equal(await mine.count('true'), N);
});
