// "Download everything", then "Bring back an export": the file has to rebuild
// the same account, with the same balances, and restoring it twice must not
// add anything twice.

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

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;
type Report = { added: number; skipped: number; failed: number };

const DAY = 86_400_000;
const now = Date.now();
const at = (daysAgo: number, h = 12) => new Date(Math.floor((now - daysAgo * DAY) / DAY) * DAY + h * 3_600_000);

/** An account with something in every part of Orpit, written straight to the database. */
async function fullAccount(): Promise<Client> {
  const c = await new Client(server.base).signup('Source');
  const uid = Number((await db.query('SELECT id FROM users WHERE email = $1', [c.email])).rows[0].id);
  const q = (sql: string, p: unknown[] = []) => db.query(sql, [uid, ...p]);
  const id = async (sql: string, p: unknown[] = []) => String((await q(sql, p)).rows[0].id);

  const cash = await id(`SELECT id FROM accounts WHERE user_id = $1 AND name = 'Cash'`);
  await q(`UPDATE accounts SET opening = 1200 WHERE user_id = $1 AND id = $2`, [cash]);
  const bank = await id(`INSERT INTO accounts (user_id, name, type, color, opening, sort) VALUES ($1,'CIB','Bank','blue',40000,1) RETURNING id`);
  const savings = await id(`INSERT INTO accounts (user_id, name, type, color, opening, sort) VALUES ($1,'Savings','Savings','teal',5000,2) RETURNING id`);
  await q(`INSERT INTO fcats (user_id, name, icon, color, kind, sort) VALUES ($1,'Pets','paw','coral','expense',20)`);

  const rent = await id(`INSERT INTO recurring (user_id, name, cat, acc_id, amount, freq, next_ts, income) VALUES ($1,'Rent','Housing',$2,-4000,'Monthly',$3,false) RETURNING id`, [bank, at(-10)]);
  await q(`INSERT INTO recurring (user_id, name, cat, acc_id, amount, freq, next_ts, income) VALUES ($1,'Salary','Salary',$2,9000,'Monthly',$3,true)`, [bank, at(-20)]);
  await q(`INSERT INTO goals (user_id, name, target, current, color, due_ts, acc_id) VALUES ($1,'Laptop',30000,5000,'indigo',$2,$3)`, [at(-90), savings]);
  await q(`INSERT INTO budgets (user_id, cat, limit_amt, rollover) VALUES ($1,'Food',3000,true)`);

  const t = (name: string, cat: string, amount: number, extra: Any, ts: Date) =>
    q(
      `INSERT INTO txns (user_id, name, cat, amount, income, acc_id, to_acc_id, adjust, note, review, recurring_id, ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [name, cat, amount, !!extra.income, extra.acc ?? null, extra.to ?? null, !!extra.adjust, extra.note ?? null, !!extra.review, extra.rec ?? null, ts]
    );
  await t('Groceries', 'Food', -300, { acc: cash }, at(5));
  await t('Salary', 'Salary', 9000, { acc: bank, income: true }, at(4));
  // Money back for a purchase: positive, but not income.
  await t('Refund', 'Shopping', 150, { acc: bank }, at(4, 15));
  await t('To savings', 'Transfer', -2000, { acc: bank, to: savings }, at(3));
  await t('Balance correction', 'Adjustment', 75, { acc: cash, adjust: true }, at(2));
  await t('Rent', 'Housing', -4000, { acc: bank, rec: rent, note: 'November' }, at(1));
  // Two real, different entries at the same moment for the same amount.
  await t('Coffee', 'Food', -50, { acc: cash, review: true }, at(0, 9));
  await t('Tea', 'Food', -50, { acc: cash }, at(0, 9));

  const stretch = await id(
    `INSERT INTO habits (user_id, name, color, target, days, why, cue, reminder_time, sort, created_at)
     VALUES ($1,'Stretch','teal','Daily','0111110','Back pain','After coffee','07:30',5,$2) RETURNING id`,
    [at(30)]
  );
  const steps = await id(`SELECT id FROM habits WHERE user_id = $1 AND auto = 'steps'`);
  await q(`UPDATE habits SET goal = 10000 WHERE id = $2 AND user_id = $1`, [steps]);
  const daily = await id(`SELECT id FROM habits WHERE user_id = $1 AND locked`);
  for (const [h, d] of [[stretch, 3], [stretch, 2], [daily, 1], [steps, 1]] as const) {
    await q(`INSERT INTO habit_checkins (habit_id, user_id, day) VALUES ($2,$1,$3)`, [h, at(d).toISOString().slice(0, 10)]);
  }
  await q(`INSERT INTO steps (user_id, day, count, source) VALUES ($1,$2,11000,'Samsung Health')`, [at(1).toISOString().slice(0, 10)]);

  const yoga = await id(`INSERT INTO workout_categories (user_id, name, color, sort) VALUES ($1,'Yoga','teal',9) RETURNING id`);
  await q(
    `INSERT INTO workouts (user_id, name, category_id, dur, intensity, note, sets, source, ext_id, ts) VALUES ($1,'Flow',$2,45,'Easy','Felt good',$3,'Fitbit','fit-1',$4)`,
    [yoga, JSON.stringify([{ name: 'Plank', reps: 3 }]), at(2, 7)]
  );
  await q(`INSERT INTO workout_templates (user_id, name, category_id, dur, intensity) VALUES ($1,'Morning flow',$2,30,'Easy')`, [yoga]);
  await q(`INSERT INTO nights (user_id, hours, quality, bed_h, wake_h, note, source, ext_id, ts) VALUES ($1,7.5,8,23.5,7,'Slept well','Fitbit','sleep-1',$2)`, [at(1, 7)]);

  const water = await id(`INSERT INTO counters (user_id, name, unit, color, icon, step) VALUES ($1,'Water','glasses','blue','drop',1) RETURNING id`);
  for (const h of [8, 12, 16]) await q(`INSERT INTO count_logs (user_id, counter_id, amount, ts) VALUES ($1,$2,1,$3)`, [water, at(0, h)]);
  const errands = await id(`INSERT INTO todo_lists (user_id, name, color, icon) VALUES ($1,'Errands','indigo','check') RETURNING id`);
  await q(`INSERT INTO todos (user_id, list_id, title, note, due, created_at) VALUES ($1,$2,'Post office','Parcel',$3,$4)`, [errands, at(-2).toISOString().slice(0, 10), at(6)]);
  await q(`INSERT INTO todos (user_id, list_id, title, done_at, created_at) VALUES ($1,$2,'Pay internet',$3,$4)`, [errands, at(1), at(7)]);

  await c.call('/api/state');
  return c;
}

/** An export with every id swapped for the name of what it points at, so two accounts can be compared. */
function comparable(e: Any) {
  const name = (rows: Any[], id: unknown) => rows.find((x) => x.id === id)?.name ?? null;
  const strip = ({ id: _id, ...rest }: Any) => rest;
  const sort = (rows: Any[]) => rows.map((x) => JSON.stringify(x)).sort();
  return {
    // When a habit was added: Orpit's own Daily Check-In and Steps are the new
    // account's; a restored habit keeps its date (checked separately).
    habits: sort(e.habits.map(({ createdAt: _c, ...x }: Any) => strip(x))),
    checkins: sort(e.checkins.map((x: Any) => ({ habit: name(e.habits, x.habitId), day: x.day }))),
    wCats: sort(e.wCats.map(strip)),
    workouts: sort(e.workouts.map((x: Any) => ({ ...strip(x), catId: name(e.wCats, x.catId) }))),
    nights: sort(e.nights.map(strip)),
    txns: sort(
      e.txns.map((x: Any) => ({
        ...strip(x),
        accId: name(e.accounts, x.accId),
        toAccId: name(e.accounts, x.toAccId),
        recurringId: name(e.recurring, x.recurringId),
      }))
    ),
    accounts: sort(e.accounts.map(strip)),
    fcats: sort(e.fcats.map(strip)),
    budgets: sort(e.budgets.map(strip)),
    goals: sort(e.goals.map((x: Any) => ({ ...strip(x), accId: name(e.accounts, x.accId) }))),
    recurring: sort(e.recurring.map((x: Any) => ({ ...strip(x), accId: name(e.accounts, x.accId) }))),
    counters: sort(e.counters.map(strip)),
    countLogs: sort(e.countLogs.map((x: Any) => ({ ...strip(x), counterId: name(e.counters, x.counterId) }))),
    todoLists: sort(e.todoLists.map(strip)),
    todos: sort(e.todos.map((x: Any) => ({ ...strip(x), listId: name(e.todoLists, x.listId) }))),
    wTemplates: sort(e.wTemplates.map((x: Any) => ({ ...strip(x), catId: name(e.wCats, x.catId) }))),
    steps: sort(e.steps),
  };
}

test('restoring a download into a new account gives back the same account', async () => {
  const a = await fullAccount();
  const file = await a.call<Any>('/api/export');
  assert.equal(file.version, 2);
  for (const k of ['budgets', 'goals', 'recurring', 'wTemplates', 'counters', 'countLogs', 'todoLists', 'todos', 'accounts']) {
    assert.ok(file[k].length > 0, `the download has ${k}`);
  }

  const b = await new Client(server.base).signup('Restored');
  const r = await b.call<Report>('/api/import', 'POST', { data: file });
  assert.equal(r.failed, 0);
  assert.ok(r.added > 20, `added ${r.added}`);

  const back = await b.call<Any>('/api/export');
  const want = comparable(file);
  const got = comparable(back);
  for (const k of Object.keys(want) as (keyof typeof want)[]) assert.deepEqual(got[k], want[k], k);

  // The same money in the same places: transfers still move it, the refund
  // isn't income, the correction is neither income nor spending.
  await b.call('/api/state');
  for (const acc of ['Cash', 'CIB', 'Savings']) assert.equal(b.balance(acc), a.balance(acc), acc);
  const income = (c: Client) => c.state.txns.filter((x) => x.income).map((x) => x.name).sort();
  assert.deepEqual(income(b), ['Salary']);
  const added = (e: Any) => e.habits.find((h: Any) => h.name === 'Stretch').createdAt;
  assert.equal(added(back), added(file));
});

test('restoring the same file again adds nothing', async () => {
  const a = await fullAccount();
  const file = await a.call<Any>('/api/export');
  const b = await new Client(server.base).signup();
  const first = await b.call<Report>('/api/import', 'POST', { data: file });
  const again = await b.call<Report>('/api/import', 'POST', { data: file });
  assert.equal(again.added, 0);
  assert.equal(again.failed, 0);
  assert.equal(again.skipped, first.added + first.skipped);
  // And into the account it came from: everything is already there.
  const self = await a.call<Report>('/api/import', 'POST', { data: file });
  assert.equal(self.added, 0);
});

test('a big file comes back whole, and broken entries are counted, not hidden', async () => {
  const b = await new Client(server.base).signup();
  const cash = b.account('Cash').id;
  const txns = Array.from({ length: 20_000 }, (_, i) => ({
    id: String(i), name: `Entry ${i}`, cat: 'Food', amount: -(i % 97) - 1, income: false, accId: cash, toAccId: null, adjust: false, ts: now - i * 60_000,
  }));
  const broken = [
    { id: 'x1', name: 'No date', cat: 'Food', amount: -5, accId: cash, ts: 'not a date' },
    { id: 'x2', name: 'Gone account', cat: 'Food', amount: -5, accId: '999999999', ts: now },
    { id: 'x3', name: 'No amount', cat: 'Food', ts: now },
  ];
  const r = await b.call<Report>('/api/import', 'POST', {
    data: { version: 2, accounts: [{ id: cash, name: 'Cash', type: 'Cash', color: 'emerald', opening: 0 }], txns: [...txns, ...broken] },
  });
  assert.equal(r.added, 20_000);
  assert.equal(r.failed, 3);
  const n = await db.query(`SELECT count(*)::int AS n FROM txns t JOIN users u ON u.id = t.user_id WHERE u.email = $1`, [b.email]);
  assert.equal(n.rows[0].n, 20_000);
});

test('files from before Orpit wrote income down still restore', async () => {
  const b = await new Client(server.base).signup();
  const r = await b.call<Report>('/api/import', 'POST', {
    data: {
      habits: [{ id: '1', name: 'Journal', color: 'teal', target: 'Daily', days: '1111111' }],
      checkins: [{ habitId: '1', day: '2026-01-05' }],
      txns: [
        { name: 'Pay', cat: 'Salary', amount: 500, ts: now - DAY },
        { name: 'Lunch', cat: 'Food', amount: -40, ts: now - DAY },
      ],
    },
  });
  assert.equal(r.failed, 0);
  assert.equal(r.added, 4);
  await b.call('/api/state');
  const pay = b.state.txns.find((x) => x.name === 'Pay')!;
  assert.equal(pay.income, true);
  assert.ok(b.state.checkins.some((x) => x.day === '2026-01-05'));
});

test('a file that isn’t an export is turned away', async () => {
  const b = await new Client(server.base).signup();
  await assert.rejects(b.call('/api/import', 'POST', { data: [1, 2, 3] }), /400/);
  await assert.rejects(b.call('/api/import', 'POST', {}), /400/);
});
