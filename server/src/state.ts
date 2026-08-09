import { query, one } from './db.js';

const TS = (col: string) => `(EXTRACT(EPOCH FROM ${col}) * 1000)::float8 AS ts`;

// How much raw history the client actually receives.
//
// Every mutation returns the whole bundle, so an unbounded payload meant one
// habit tap re-downloading a user's entire life — fine at fifty entries, a
// megabyte on mobile data after a couple of years. 400 days covers everything
// the UI draws from raw rows (the Year range, the 12-week grid, the 6-month
// net-worth line) with headroom; anything older is folded into the `archive`
// totals below, which is all the remaining features need.
const WINDOW_DAYS = 400;
const CUTOFF = `now() - interval '${WINDOW_DAYS} days'`;

/** Build the full client state bundle for a user. Raw data; the client derives metrics. */
export async function buildState(userId: number) {
  const profile = await one(
    `SELECT name, email, theme, reminders, haptics, onboarded, currency, avatar, layout,
            reminder_time AS "reminderTime", reminder_tz AS "reminderTz",
            claimed_badges AS "claimedBadgesRaw", intro_done AS "introDone",
            accent, modules AS "modulesRaw", text_scale AS "textScale", wind_down AS "windDown",
            email_verified AS "emailVerified",
            (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS "createdAt"
     FROM users WHERE id = $1`,
    [userId]
  );
  // claimed_badges is stored as a JSON string; hand the client a real array.
  if (profile) {
    const p = profile as any;
    let claimed: string[] = [];
    try {
      const parsed = JSON.parse(p.claimedBadgesRaw || '[]');
      if (Array.isArray(parsed)) claimed = parsed.filter((x: unknown) => typeof x === 'string');
    } catch {
      /* corrupt value → treat as none claimed */
    }
    p.claimedBadges = claimed;
    delete p.claimedBadgesRaw;
  }

  const habits = await query(
    `SELECT id::text, name, color, target, locked, days, paused, archived, why,
            reminder_time AS "reminderTime"
     FROM habits WHERE user_id = $1 ORDER BY locked DESC, sort, id`,
    [userId]
  );

  const checkins = await query(
    `SELECT habit_id::text AS "habitId", to_char(day, 'YYYY-MM-DD') AS day
     FROM habit_checkins WHERE user_id = $1 AND day > (now() - interval '400 days')::date`,
    [userId]
  );

  const wCats = await query(
    `SELECT id::text, name, color FROM workout_categories
     WHERE user_id = $1 ORDER BY sort, id`,
    [userId]
  );

  const workouts = await query(
    `SELECT id::text, name, category_id::text AS "catId", dur, dist, kcal, intensity, note, sets,
            ${TS('ts')}
     FROM workouts WHERE user_id = $1 AND ts > now() - interval '400 days' ORDER BY ts DESC`,
    [userId]
  );

  const accounts = await query(
    `SELECT id::text, name, type, color, opening FROM accounts
     WHERE user_id = $1 ORDER BY sort, id`,
    [userId]
  );

  const fcats = await query(
    `SELECT id::text, name, icon, color, kind FROM fcats
     WHERE user_id = $1 ORDER BY sort, id`,
    [userId]
  );

  const budgets = await query(
    `SELECT id::text, cat, limit_amt AS "limit", rollover FROM budgets
     WHERE user_id = $1 ORDER BY sort, id`,
    [userId]
  );

  const goals = await query(
    `SELECT id::text, name, target, current, color,
            (EXTRACT(EPOCH FROM due_ts) * 1000)::float8 AS "dueTs"
     FROM goals WHERE user_id = $1 ORDER BY sort, id`,
    [userId]
  );

  const recurring = await query(
    `SELECT id::text, name, cat, acc_id::text AS "accId", amount, freq, income,
            (EXTRACT(EPOCH FROM next_ts) * 1000)::float8 AS "nextTs"
     FROM recurring WHERE user_id = $1 ORDER BY next_ts, id`,
    [userId]
  );

  const counters = await query(
    `SELECT id::text, name, unit, color, icon, step FROM counters
     WHERE user_id = $1 ORDER BY sort, id`,
    [userId]
  );

  const steps = await query(
    // The window is the same 400 days as everything else; a step chart older
    // than that is not worth the payload.
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, steps FROM steps
     WHERE user_id = $1 AND day > (now() - interval '400 days')::date ORDER BY day`,
    [userId]
  );

  const milestones = await query(
    // to_char, not the raw DATE: the driver would hand back a JS Date at UTC
    // midnight, which is the previous day for anyone west of Greenwich.
    `SELECT id::text, name, to_char(since, 'YYYY-MM-DD') AS since, color, icon FROM milestones
     WHERE user_id = $1 ORDER BY sort, id`,
    [userId]
  );

  const countLogs = await query(
    `SELECT id::text, counter_id::text AS "counterId", amount, ${TS('ts')}
     FROM count_logs WHERE user_id = $1 AND ts > now() - interval '400 days' ORDER BY ts DESC`,
    [userId]
  );

  const nights = await query(
    `SELECT id::text, hours, quality, bed_h AS "bedH", wake_h AS "wakeH", note,
            ${TS('ts')}
     FROM nights WHERE user_id = $1 AND ts > now() - interval '400 days' ORDER BY ts DESC`,
    [userId]
  );

  const txns = await query(
    // The receipt image itself stays behind GET /api/txns/:id/photo — the state
    // bundle only carries whether one exists, so it stays small.
    `SELECT t.id::text, t.name, t.cat, t.amount, t.income, t.acc_id::text AS "accId",
            t.to_acc_id::text AS "toAccId", t.adjust, t.note,
            (p.txn_id IS NOT NULL) AS photo, ${TS('t.ts')}
     FROM txns t LEFT JOIN txn_photos p ON p.txn_id = t.id
     WHERE t.user_id = $1 AND t.ts > now() - interval '400 days' ORDER BY t.ts DESC`,
    [userId]
  );

  const wTemplates = await query(
    `SELECT id::text, name, category_id::text AS "catId", dur, intensity
     FROM workout_templates WHERE user_id = $1 ORDER BY sort, id`,
    [userId]
  );


  // Everything older than the window, folded into totals. Badge counts, "days
  // tracked" and account balances must stay exact for a user's whole history,
  // so the numbers survive even though the rows don't travel.
  const archiveRow = await one<Record<string, any>>(
    `SELECT
       (SELECT count(*) FROM workouts   WHERE user_id = $1 AND ts <= now() - interval '400 days')::int AS workouts,
       (SELECT count(*) FROM nights     WHERE user_id = $1 AND ts <= now() - interval '400 days')::int AS nights,
       (SELECT count(*) FROM txns       WHERE user_id = $1 AND ts <= now() - interval '400 days')::int AS txns,
       (SELECT count(*) FROM count_logs WHERE user_id = $1 AND ts <= now() - interval '400 days')::int AS "countLogs",
       (SELECT count(*) FROM habit_checkins WHERE user_id = $1 AND day <= (now() - interval '400 days')::date)::int AS checkins,
       (SELECT coalesce(sum(amount), 0) FROM txns
         WHERE user_id = $1 AND ts <= now() - interval '400 days' AND to_acc_id IS NULL)::float8 AS "txnSum",
       (SELECT count(DISTINCT d) FROM (
          SELECT date(ts) AS d FROM workouts   WHERE user_id = $1 AND ts <= now() - interval '400 days'
          UNION SELECT date(ts) FROM nights     WHERE user_id = $1 AND ts <= now() - interval '400 days'
          UNION SELECT date(ts) FROM txns       WHERE user_id = $1 AND ts <= now() - interval '400 days'
          UNION SELECT date(ts) FROM count_logs WHERE user_id = $1 AND ts <= now() - interval '400 days'
          UNION SELECT day      FROM habit_checkins WHERE user_id = $1 AND day <= (now() - interval '400 days')::date
       ) x)::int AS "activeDays",
       (SELECT min(t) FROM (
          SELECT min(ts) AS t FROM workouts   WHERE user_id = $1
          UNION SELECT min(ts) FROM nights     WHERE user_id = $1
          UNION SELECT min(ts) FROM txns       WHERE user_id = $1
          UNION SELECT min(ts) FROM count_logs WHERE user_id = $1
       ) y) AS "earliestRaw"`,
    [userId]
  );

  // Pre-window spend per account, so balances and net worth stay correct
  // without shipping years of transactions.
  const accSumRows = await query<{ accId: string | null; total: number }>(
    // A transfer moves money out of one account and into another, so it appears
    // on both sides of this union. Summing only acc_id would leave the
    // destination account permanently short once the rows aged out of the
    // window — the balance would look right for 400 days and then quietly drop.
    `SELECT "accId", sum(total)::float8 AS total FROM (
       SELECT acc_id::text AS "accId", sum(amount)::float8 AS total
         FROM txns WHERE user_id = $1 AND ts <= now() - interval '400 days'
         GROUP BY acc_id
       UNION ALL
       SELECT to_acc_id::text AS "accId", sum(abs(amount))::float8 AS total
         FROM txns WHERE user_id = $1 AND ts <= now() - interval '400 days'
           AND to_acc_id IS NOT NULL
         GROUP BY to_acc_id
     ) s GROUP BY "accId"`,
    [userId]
  );

  const archive = {
    workouts: archiveRow?.workouts ?? 0,
    nights: archiveRow?.nights ?? 0,
    txns: archiveRow?.txns ?? 0,
    countLogs: archiveRow?.countLogs ?? 0,
    checkins: archiveRow?.checkins ?? 0,
    txnSum: archiveRow?.txnSum ?? 0,
    activeDays: archiveRow?.activeDays ?? 0,
    earliestTs: archiveRow?.earliestRaw ? new Date(archiveRow.earliestRaw).getTime() : null,
    accSums: Object.fromEntries(accSumRows.map((r) => [r.accId ?? '', r.total])) as Record<string, number>,
    windowDays: WINDOW_DAYS,
  };

  // modules is a JSON string of the trackers the user chose to see.
  if (profile) {
    const p = profile as any;
    let mods: string[] | null = null;
    try {
      const parsed = JSON.parse(p.modulesRaw || 'null');
      if (Array.isArray(parsed)) mods = parsed.filter((x: unknown) => typeof x === 'string');
    } catch {
      /* corrupt value → show everything */
    }
    p.modules = mods;
    delete p.modulesRaw;
  }

  return {
    profile,
    wTemplates,
    habits,
    checkins,
    wCats,
    workouts,
    nights,
    txns,
    accounts,
    fcats,
    budgets,
    goals,
    recurring,
    counters,
    milestones,
    steps,
    countLogs,
    archive,
  };
}
