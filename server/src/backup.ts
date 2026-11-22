import type pg from 'pg';
import { query, one } from './db.js';
import { STEP_GOAL } from './seed.js';

// "Download everything" and "Bring back an export".
//
// People are told to download their data before deleting their account, so
// the file has to hold everything needed to rebuild it, and restoring it has
// to give back the same account: the same balances, transfers between the
// same accounts, the same habits with their history. Restoring is additive
// and safe to repeat: whatever is already in the account stays, and an entry
// that is already there is not added twice.

export const BACKUP_VERSION = 2;

const TS = (col: string, as = 'ts') => `(EXTRACT(EPOCH FROM ${col}) * 1000)::float8 AS "${as}"`;

/** The whole account, with no window, for the export file. */
export async function readBackup(uid: number) {
  const [profile, habits, checkins, wCats, workouts, nights, txns, accounts, fcats, budgets, goals, recurring, counters, countLogs, todoLists, todos, wTemplates, assistantBriefs, steps] =
    await Promise.all([
      one('SELECT name, email, (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS "createdAt" FROM users WHERE id = $1', [uid]),
      query(
        `SELECT id::text, name, color, target, days, why, cue, reminder_time AS "reminderTime", paused, archived, locked, auto, goal, ${TS('created_at', 'createdAt')}
         FROM habits WHERE user_id = $1 ORDER BY sort, id`,
        [uid]
      ),
      query(`SELECT habit_id::text AS "habitId", to_char(day, 'YYYY-MM-DD') AS day FROM habit_checkins WHERE user_id = $1 ORDER BY day`, [uid]),
      query('SELECT id::text, name, color FROM workout_categories WHERE user_id = $1 ORDER BY sort, id', [uid]),
      query(
        `SELECT id::text, name, category_id::text AS "catId", dur, dist, kcal, intensity, note, sets, source, ext_id AS "extId", ${TS('ts')}
         FROM workouts WHERE user_id = $1 ORDER BY ts`,
        [uid]
      ),
      query(`SELECT id::text, hours, quality, bed_h AS "bedH", wake_h AS "wakeH", note, source, ext_id AS "extId", ${TS('ts')} FROM nights WHERE user_id = $1 ORDER BY ts`, [uid]),
      query(
        `SELECT id::text, name, cat, amount, income, acc_id::text AS "accId", to_acc_id::text AS "toAccId", adjust, note, review,
                recurring_id::text AS "recurringId", ${TS('ts')}
         FROM txns WHERE user_id = $1 ORDER BY ts`,
        [uid]
      ),
      query('SELECT id::text, name, type, color, opening FROM accounts WHERE user_id = $1 ORDER BY sort, id', [uid]),
      query('SELECT id::text, name, icon, color, kind FROM fcats WHERE user_id = $1 ORDER BY sort, id', [uid]),
      query('SELECT id::text, cat, limit_amt AS "limit", rollover FROM budgets WHERE user_id = $1 ORDER BY sort, id', [uid]),
      query(
        `SELECT id::text, name, target, current, color, acc_id::text AS "accId", (EXTRACT(EPOCH FROM due_ts) * 1000)::float8 AS "dueTs"
         FROM goals WHERE user_id = $1 ORDER BY sort, id`,
        [uid]
      ),
      query(
        `SELECT id::text, name, cat, acc_id::text AS "accId", amount, freq, income, (EXTRACT(EPOCH FROM next_ts) * 1000)::float8 AS "nextTs"
         FROM recurring WHERE user_id = $1 ORDER BY sort, id`,
        [uid]
      ),
      query('SELECT id::text, name, unit, color, icon, step FROM counters WHERE user_id = $1 ORDER BY sort, id', [uid]),
      query(`SELECT id::text, counter_id::text AS "counterId", amount, ${TS('ts')} FROM count_logs WHERE user_id = $1 ORDER BY ts`, [uid]),
      query('SELECT id::text, name, color, icon FROM todo_lists WHERE user_id = $1 ORDER BY sort, id', [uid]),
      query(
        `SELECT id::text, list_id::text AS "listId", title, note, to_char(due, 'YYYY-MM-DD') AS due,
                to_char(done_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "doneAt", ${TS('created_at')}
         FROM todos WHERE user_id = $1 ORDER BY list_id, sort, id`,
        [uid]
      ),
      query('SELECT id::text, name, category_id::text AS "catId", dur, intensity FROM workout_templates WHERE user_id = $1 ORDER BY sort, id', [uid]),
      query(`SELECT title, sections, ${TS('created_at')} FROM assistant_briefs WHERE user_id = $1 ORDER BY created_at`, [uid]),
      query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, count, source FROM steps WHERE user_id = $1 ORDER BY day`, [uid]),
    ]);
  return {
    version: BACKUP_VERSION,
    profile, habits, checkins, wCats, workouts, nights, txns, accounts, fcats, budgets, goals, recurring,
    counters, countLogs, todoLists, todos, wTemplates, assistantBriefs, steps,
    exportedAt: new Date().toISOString(),
  };
}

export interface RestoreReport {
  /** Entries put back. */
  added: number;
  /** Entries the account already had, so left as they were. */
  skipped: number;
  /** Entries the file had but that couldn't be read (a broken date, a link to something missing). */
  failed: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const list = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const str = (v: unknown, def = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : def);
const text = (v: unknown): string | null => {
  const s = str(v).trim();
  return s ? s : null;
};
const num = (v: unknown, def = 0): number => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : def);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const key = (s: unknown) => str(s).trim().toLowerCase();
/** A time from the file, or null when there isn't a usable one. */
const when = (v: unknown): Date | null => {
  if (v === null || v === undefined || v === '') return null;
  const d = typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v)) ? new Date(Number(v)) : new Date(String(v));
  const t = d.getTime();
  // Orpit's own dates fall well inside this; anything outside is a broken file.
  return Number.isFinite(t) && t > Date.UTC(1990, 0, 1) && t < Date.UTC(2200, 0, 1) ? d : null;
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Insert many rows in a few statements rather than one round trip each. */
async function insertMany(c: pg.PoolClient, table: string, cols: string[], rows: unknown[][], tail = 'ON CONFLICT DO NOTHING'): Promise<number> {
  let n = 0;
  const per = Math.max(1, Math.floor(20000 / cols.length));
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const params: unknown[] = [];
    const values = chunk.map((r) => `(${r.map((v) => (params.push(v), `$${params.length}`)).join(',')})`).join(',');
    const res = await c.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${values} ${tail}`, params);
    n += res.rowCount ?? 0;
  }
  return n;
}

/**
 * Put an export back into the account [uid], inside the caller's transaction.
 * Every id in the file is the old account's, so each one is mapped to the row
 * it became here (or the matching row that was already here) before anything
 * that points at it is written.
 */
export async function restoreBackup(c: pg.PoolClient, uid: number, d: Row): Promise<RestoreReport> {
  const r: RestoreReport = { added: 0, skipped: 0, failed: 0 };
  const sortFrom = async (table: string) => Number((await c.query(`SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM ${table} WHERE user_id = $1`, [uid])).rows[0].m);

  // ---- Accounts first: transactions, goals and bills point at them ----
  const accMap = new Map<string, string>();
  {
    const have = await c.query(
      `SELECT a.id::text, a.name, a.opening,
              EXISTS (SELECT 1 FROM txns t WHERE t.user_id = a.user_id AND (t.acc_id = a.id OR t.to_acc_id = a.id)) AS used
       FROM accounts a WHERE a.user_id = $1`,
      [uid]
    );
    const byName = new Map(have.rows.map((a) => [key(a.name), a]));
    let sort = await sortFrom('accounts');
    for (const a of list(d.accounts)) {
      const name = text(a.name);
      if (!name) {
        r.failed++;
        continue;
      }
      const opening = num(a.opening);
      const found = byName.get(key(name));
      if (found) {
        accMap.set(str(a.id), found.id);
        // A new account starts with Orpit's own empty "Cash" and "Bank". If the
        // one here has never been used, the backup's opening balance is the
        // right one; one that's been used keeps its own.
        if (!found.used && num(found.opening) === 0 && opening !== 0) {
          await c.query('UPDATE accounts SET opening = $1 WHERE id = $2 AND user_id = $3', [opening, found.id, uid]);
        }
        r.skipped++;
        continue;
      }
      const row = await c.query(
        'INSERT INTO accounts (user_id, name, type, color, opening, sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text',
        [uid, name, str(a.type, 'Bank'), str(a.color, 'blue'), opening, sort++]
      );
      accMap.set(str(a.id), row.rows[0].id);
      byName.set(key(name), { id: row.rows[0].id, opening, used: true });
      r.added++;
    }
  }
  const acc = (id: unknown) => (id === null || id === undefined || id === '' ? null : accMap.get(str(id)) ?? undefined);

  // ---- Finance categories (transactions name them, so only presence matters) ----
  {
    const have = new Set((await c.query('SELECT name, kind FROM fcats WHERE user_id = $1', [uid])).rows.map((f) => `${key(f.name)}|${f.kind}`));
    let sort = await sortFrom('fcats');
    for (const f of list(d.fcats)) {
      const name = text(f.name);
      const kind = str(f.kind, 'expense');
      if (!name) {
        r.failed++;
        continue;
      }
      if (have.has(`${key(name)}|${kind}`)) {
        r.skipped++;
        continue;
      }
      await c.query('INSERT INTO fcats (user_id, name, icon, color, kind, sort) VALUES ($1,$2,$3,$4,$5,$6)', [uid, name, str(f.icon, 'other'), str(f.color, 'coral'), kind, sort++]);
      have.add(`${key(name)}|${kind}`);
      r.added++;
    }
  }

  // ---- Habits, matched by name; the locked check-in and Steps by what they are ----
  const habitMap = new Map<string, string>();
  {
    const have = (await c.query('SELECT id::text, name, locked, auto FROM habits WHERE user_id = $1', [uid])).rows;
    const byName = new Map(have.map((h) => [key(h.name), h.id as string]));
    const locked = have.find((h) => h.locked)?.id as string | undefined;
    let steps = have.find((h) => h.auto === 'steps')?.id as string | undefined;
    let sort = await sortFrom('habits');
    for (const h of list(d.habits)) {
      const name = text(h.name);
      if (!name) {
        r.failed++;
        continue;
      }
      const auto = h.auto === 'steps' ? 'steps' : null;
      const same = h.locked && locked ? locked : auto && steps ? steps : byName.get(key(name));
      if (same) {
        habitMap.set(str(h.id), same);
        // The Steps habit a new account starts with has Orpit's default goal;
        // the person's own goal comes back with their file.
        if (auto && same === steps && numOrNull(h.goal) !== null) {
          await c.query('UPDATE habits SET goal = $1 WHERE id = $2 AND user_id = $3 AND goal = $4', [Math.round(num(h.goal)), same, uid, STEP_GOAL]);
        }
        r.skipped++;
        continue;
      }
      const goal = auto ? Math.round(num(h.goal, STEP_GOAL)) : null;
      const row = await c.query(
        `INSERT INTO habits (user_id, name, color, target, days, why, cue, reminder_time, paused, archived, sort, auto, goal, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14, now())) RETURNING id::text`,
        [
          uid, name, str(h.color, 'teal'), str(h.target, 'Daily'), /^[01]{7}$/.test(h.days) ? h.days : '1111111',
          text(h.why), text(h.cue), /^\d{2}:\d{2}$/.test(h.reminderTime) ? h.reminderTime : null, !!h.paused, !!h.archived,
          sort++, auto, goal, when(h.createdAt),
        ]
      );
      habitMap.set(str(h.id), row.rows[0].id);
      byName.set(key(name), row.rows[0].id);
      if (auto) steps = row.rows[0].id;
      r.added++;
    }
  }

  // ---- Workout types, counters, task lists: matched by name ----
  const byNameInto = async (rows: Row[], table: string, insert: (x: Row, name: string, sort: number) => Promise<string>) => {
    const map = new Map<string, string>();
    const have = new Map((await c.query(`SELECT id::text, name FROM ${table} WHERE user_id = $1`, [uid])).rows.map((x) => [key(x.name), x.id as string]));
    let sort = await sortFrom(table);
    for (const x of rows) {
      const name = text(x.name);
      if (!name) {
        r.failed++;
        continue;
      }
      const found = have.get(key(name));
      if (found) {
        map.set(str(x.id), found);
        r.skipped++;
        continue;
      }
      const id = await insert(x, name, sort++);
      map.set(str(x.id), id);
      have.set(key(name), id);
      r.added++;
    }
    return map;
  };
  const catMap = await byNameInto(list(d.wCats), 'workout_categories', async (x, name, sort) =>
    (await c.query('INSERT INTO workout_categories (user_id, name, color, sort) VALUES ($1,$2,$3,$4) RETURNING id::text', [uid, name, str(x.color, 'coral'), sort])).rows[0].id
  );
  const counterMap = await byNameInto(list(d.counters), 'counters', async (x, name, sort) =>
    (
      await c.query('INSERT INTO counters (user_id, name, unit, color, icon, step, sort) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text', [
        uid, name, str(x.unit, 'count'), str(x.color, 'indigo'), str(x.icon, 'tally'), num(x.step, 1) || 1, sort,
      ])
    ).rows[0].id
  );
  const listMap = await byNameInto(list(d.todoLists), 'todo_lists', async (x, name, sort) =>
    (await c.query('INSERT INTO todo_lists (user_id, name, color, icon, sort) VALUES ($1,$2,$3,$4,$5) RETURNING id::text', [uid, name, str(x.color, 'indigo'), str(x.icon, 'check'), sort])).rows[0].id
  );
  await byNameInto(list(d.wTemplates), 'workout_templates', async (x, name, sort) =>
    (
      await c.query('INSERT INTO workout_templates (user_id, name, category_id, dur, intensity, sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text', [
        uid, name, catMap.get(str(x.catId)) ?? null, Math.round(num(x.dur, 30)), text(x.intensity), sort,
      ])
    ).rows[0].id
  );

  // ---- Bills and income that repeat ----
  const recurringMap = new Map<string, string>();
  {
    const have = new Map(
      (await c.query('SELECT id::text, name, amount, freq, income FROM recurring WHERE user_id = $1', [uid])).rows.map((x) => [`${key(x.name)}|${num(x.amount)}|${x.freq}|${!!x.income}`, x.id as string])
    );
    let sort = await sortFrom('recurring');
    for (const x of list(d.recurring)) {
      const name = text(x.name);
      if (!name) {
        r.failed++;
        continue;
      }
      const k = `${key(name)}|${num(x.amount)}|${str(x.freq, 'Monthly')}|${!!x.income}`;
      const found = have.get(k);
      if (found) {
        recurringMap.set(str(x.id), found);
        r.skipped++;
        continue;
      }
      const a = acc(x.accId);
      const row = await c.query(
        'INSERT INTO recurring (user_id, name, cat, acc_id, amount, freq, next_ts, income, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text',
        [uid, name, str(x.cat, 'Other'), a ?? null, num(x.amount), str(x.freq, 'Monthly'), when(x.nextTs), !!x.income, sort++]
      );
      recurringMap.set(str(x.id), row.rows[0].id);
      have.set(k, row.rows[0].id);
      r.added++;
    }
  }

  // ---- Savings goals and budgets ----
  {
    const have = new Set((await c.query('SELECT name FROM goals WHERE user_id = $1', [uid])).rows.map((x) => key(x.name)));
    let sort = await sortFrom('goals');
    for (const x of list(d.goals)) {
      const name = text(x.name);
      if (!name) {
        r.failed++;
        continue;
      }
      if (have.has(key(name))) {
        r.skipped++;
        continue;
      }
      await c.query('INSERT INTO goals (user_id, name, target, current, color, due_ts, acc_id, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
        uid, name, num(x.target), num(x.current), str(x.color, 'indigo'), when(x.dueTs), acc(x.accId) ?? null, sort++,
      ]);
      have.add(key(name));
      r.added++;
    }
  }
  {
    const have = new Set((await c.query('SELECT cat FROM budgets WHERE user_id = $1', [uid])).rows.map((x) => key(x.cat)));
    let sort = await sortFrom('budgets');
    for (const x of list(d.budgets)) {
      const cat = text(x.cat);
      if (!cat) {
        r.failed++;
        continue;
      }
      if (have.has(key(cat))) {
        r.skipped++;
        continue;
      }
      await c.query('INSERT INTO budgets (user_id, cat, limit_amt, rollover, sort) VALUES ($1,$2,$3,$4,$5)', [uid, cat, num(x.limit), !!x.rollover, sort++]);
      have.add(key(cat));
      r.added++;
    }
  }

  // ---- The long lists: everything checked against what's here, then written in batches ----
  // Each entry is told apart by everything that makes it that entry, so two
  // real ones that happen to share a time aren't mistaken for one.
  const batch = async (
    rows: Row[],
    existingSql: string,
    keyOfExisting: (x: Row) => string,
    build: (x: Row) => { key: string; values: unknown[] } | null,
    table: string,
    cols: string[]
  ) => {
    const seen = new Set((await c.query(existingSql, [uid])).rows.map(keyOfExisting));
    const out: unknown[][] = [];
    for (const x of rows) {
      const b = build(x);
      if (!b) {
        r.failed++;
        continue;
      }
      if (seen.has(b.key)) {
        r.skipped++;
        continue;
      }
      seen.add(b.key);
      out.push(b.values);
    }
    const n = await insertMany(c, table, cols, out);
    r.added += n;
    r.skipped += out.length - n; // lost to a unique index: already here after all
  };
  // Whole milliseconds, cut the way a JavaScript date cuts them.
  const ms = (v: unknown) => Math.trunc(Number(v));

  await batch(
    list(d.checkins),
    `SELECT habit_id::text AS h, to_char(day, 'YYYY-MM-DD') AS day FROM habit_checkins WHERE user_id = $1`,
    (x) => `${x.h}|${x.day}`,
    (x) => {
      const h = habitMap.get(str(x.habitId));
      return h && DAY.test(x.day) ? { key: `${h}|${x.day}`, values: [h, uid, x.day] } : null;
    },
    'habit_checkins',
    ['habit_id', 'user_id', 'day']
  );

  await batch(
    list(d.workouts),
    `SELECT ${TS('ts')}, name, dur FROM workouts WHERE user_id = $1`,
    (x) => `${ms(x.ts)}|${key(x.name)}|${num(x.dur)}`,
    (x) => {
      const ts = when(x.ts);
      if (!ts) return null;
      const name = text(x.name) ?? 'Workout';
      const sets = Array.isArray(x.sets) ? JSON.stringify(x.sets) : null;
      return {
        key: `${ts.getTime()}|${key(name)}|${Math.round(num(x.dur))}`,
        values: [uid, name, catMap.get(str(x.catId)) ?? null, Math.round(num(x.dur)), text(x.dist), numOrNull(x.kcal) === null ? null : Math.round(num(x.kcal)), text(x.intensity), text(x.note), sets, text(x.source), text(x.extId), ts],
      };
    },
    'workouts',
    ['user_id', 'name', 'category_id', 'dur', 'dist', 'kcal', 'intensity', 'note', 'sets', 'source', 'ext_id', 'ts']
  );

  await batch(
    list(d.nights),
    `SELECT ${TS('ts')}, hours FROM nights WHERE user_id = $1`,
    (x) => `${ms(x.ts)}|${num(x.hours)}`,
    (x) => {
      const ts = when(x.ts);
      const hours = numOrNull(x.hours);
      if (!ts || hours === null) return null;
      return {
        key: `${ts.getTime()}|${hours}`,
        values: [uid, hours, Math.round(num(x.quality, 7)), numOrNull(x.bedH), numOrNull(x.wakeH), text(x.note), text(x.source), text(x.extId), ts],
      };
    },
    'nights',
    ['user_id', 'hours', 'quality', 'bed_h', 'wake_h', 'note', 'source', 'ext_id', 'ts']
  );

  await batch(
    list(d.txns),
    `SELECT ${TS('ts')}, name, amount, income, acc_id::text AS a, to_acc_id::text AS b FROM txns WHERE user_id = $1`,
    (x) => `${ms(x.ts)}|${key(x.name)}|${num(x.amount)}|${!!x.income}|${x.a ?? ''}|${x.b ?? ''}`,
    (x) => {
      const ts = when(x.ts);
      const amount = numOrNull(x.amount);
      if (!ts || amount === null) return null;
      const from = acc(x.accId);
      const to = acc(x.toAccId);
      // A transfer or an entry whose account isn't in the file can't be put
      // back as it was: as an untied entry it would count as spending.
      if (from === undefined || to === undefined) return null;
      const transfer = !!to;
      const adjust = !transfer && !!x.adjust;
      // Files from before Orpit wrote `income` down: a positive amount was income.
      const income = !transfer && !adjust && (typeof x.income === 'boolean' ? x.income : amount > 0);
      const name = text(x.name) ?? 'Entry';
      return {
        key: `${ts.getTime()}|${key(name)}|${amount}|${income}|${from ?? ''}|${to ?? ''}`,
        values: [
          uid, name, transfer ? 'Transfer' : adjust ? 'Adjustment' : str(x.cat, 'Other'), amount, income, from, to, adjust,
          text(x.note), !!x.review, recurringMap.get(str(x.recurringId)) ?? null, ts,
        ],
      };
    },
    'txns',
    ['user_id', 'name', 'cat', 'amount', 'income', 'acc_id', 'to_acc_id', 'adjust', 'note', 'review', 'recurring_id', 'ts']
  );

  await batch(
    list(d.countLogs),
    `SELECT counter_id::text AS c, amount, ${TS('ts')} FROM count_logs WHERE user_id = $1`,
    (x) => `${x.c}|${ms(x.ts)}|${num(x.amount)}`,
    (x) => {
      const counter = counterMap.get(str(x.counterId));
      const ts = when(x.ts);
      if (!counter || !ts) return null;
      return { key: `${counter}|${ts.getTime()}|${num(x.amount)}`, values: [uid, counter, num(x.amount), ts] };
    },
    'count_logs',
    ['user_id', 'counter_id', 'amount', 'ts']
  );

  await batch(
    list(d.todos),
    `SELECT list_id::text AS l, title, ${TS('created_at')} FROM todos WHERE user_id = $1`,
    (x) => `${x.l}|${key(x.title)}|${ms(x.ts)}`,
    (x) => {
      const l = listMap.get(str(x.listId));
      const title = text(x.title);
      if (!l || !title) return null;
      const created = when(x.ts) ?? new Date();
      return {
        key: `${l}|${key(title)}|${created.getTime()}`,
        values: [uid, l, title, text(x.note), DAY.test(x.due) ? x.due : null, when(x.doneAt), created],
      };
    },
    'todos',
    ['user_id', 'list_id', 'title', 'note', 'due', 'done_at', 'created_at']
  );

  await batch(
    list(d.steps),
    `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM steps WHERE user_id = $1`,
    (x) => x.day,
    (x) => {
      const count = numOrNull(x.count);
      return DAY.test(x.day) && count !== null && count >= 0 ? { key: x.day, values: [uid, x.day, Math.round(count), text(x.source)] } : null;
    },
    'steps',
    ['user_id', 'day', 'count', 'source']
  );

  return r;
}
