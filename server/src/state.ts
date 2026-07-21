import { query, one } from './db.js';

const TS = (col: string) => `(EXTRACT(EPOCH FROM ${col}) * 1000)::float8 AS ts`;

/** Build the full client state bundle for a user. Raw data; the client derives metrics. */
export async function buildState(userId: number) {
  const profile = await one(
    `SELECT name, email, theme, reminders, haptics, onboarded,
            (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS "createdAt"
     FROM users WHERE id = $1`,
    [userId]
  );

  const habits = await query(
    `SELECT id::text, name, color, target FROM habits
     WHERE user_id = $1 ORDER BY sort, id`,
    [userId]
  );

  const checkins = await query(
    `SELECT habit_id::text AS "habitId", to_char(day, 'YYYY-MM-DD') AS day
     FROM habit_checkins WHERE user_id = $1`,
    [userId]
  );

  const wCats = await query(
    `SELECT id::text, name, color FROM workout_categories
     WHERE user_id = $1 ORDER BY sort, id`,
    [userId]
  );

  const workouts = await query(
    `SELECT id::text, name, category_id::text AS "catId", dur, dist, kcal, intensity,
            ${TS('ts')}
     FROM workouts WHERE user_id = $1 ORDER BY ts DESC`,
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
    `SELECT id::text, cat, limit_amt AS "limit" FROM budgets
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
    `SELECT id::text, name, cat, acc_id::text AS "accId", amount, freq,
            (EXTRACT(EPOCH FROM next_ts) * 1000)::float8 AS "nextTs"
     FROM recurring WHERE user_id = $1 ORDER BY next_ts, id`,
    [userId]
  );

  const counters = await query(
    `SELECT id::text, name, unit, color, icon, step FROM counters
     WHERE user_id = $1 ORDER BY sort, id`,
    [userId]
  );

  const countLogs = await query(
    `SELECT id::text, counter_id::text AS "counterId", amount, ${TS('ts')}
     FROM count_logs WHERE user_id = $1 ORDER BY ts DESC`,
    [userId]
  );

  const nights = await query(
    `SELECT id::text, hours, quality, bed_h AS "bedH", wake_h AS "wakeH",
            ${TS('ts')}
     FROM nights WHERE user_id = $1 ORDER BY ts DESC`,
    [userId]
  );

  const txns = await query(
    `SELECT id::text, name, cat, amount, income, acc_id::text AS "accId", note, ${TS('ts')}
     FROM txns WHERE user_id = $1 ORDER BY ts DESC`,
    [userId]
  );

  return {
    profile,
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
    countLogs,
  };
}
