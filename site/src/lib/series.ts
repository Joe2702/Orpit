// Series for the website's charts, worked out from the account's data. Weeks
// start on Sunday, as they do on the phone, so "this week" means the same
// seven days on both.

import type { AppState, Habit, Txn } from '@core/types';
import { dayKey } from '@core/lib/format';
import { isSpend, isIncome } from '@core/lib/money';

const DAY = 86_400_000;
export const startOfDay = (ts: number) => new Date(ts).setHours(0, 0, 0, 0);
export const addDays = (ts: number, n: number) => {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
};
export const startOfWeek = (ts: number) => {
  const d = new Date(startOfDay(ts));
  return d.setDate(d.getDate() - d.getDay());
};
export const startOfMonth = (ts: number, plus = 0) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + plus, 1).getTime();
};
/** A habit's days as a 7-letter mask, Sunday first; anything malformed means every day. */
export const mask = (h: Pick<Habit, 'days'>) => (/^[01]{7}$/.test(h.days) ? h.days : '1111111');
export const plannedOn = (h: Pick<Habit, 'days'>, ts: number) => mask(h)[new Date(ts).getDay()] === '1';

/** Spending that counts: no transfers, no balance corrections; refunds count back. */
export const counts = (t: Txn) => !t.toAccId && !t.adjust;

/** Hours slept each of the last `n` nights, oldest first; null where nothing was logged. */
export function sleepNights(state: AppState, n = 14, now = Date.now()) {
  const today = startOfDay(now);
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, -(n - 1 - i));
    const night = state.nights.find((x) => startOfDay(x.ts) === day);
    return { day, hours: night ? night.hours : null, bedH: night?.bedH ?? null, wakeH: night?.wakeH ?? null, quality: night?.quality ?? null };
  });
}

/** Workouts and minutes in each of the last `n` weeks, oldest first. */
export function trainingWeeks(state: AppState, n = 8, now = Date.now()) {
  const week = startOfWeek(now);
  return Array.from({ length: n }, (_, i) => {
    const start = addDays(week, -7 * (n - 1 - i));
    const end = addDays(start, 7);
    const ws = state.workouts.filter((w) => w.ts >= start && w.ts < end);
    return { start, count: ws.length, minutes: ws.reduce((s, w) => s + (w.dur || 0), 0) };
  });
}

/**
 * Every day of the last `weeks` weeks as the share of that day's planned
 * habits that were done (0 to 1), or null when nothing was planned. A column
 * per week, Sunday at the top. `only` narrows it to one habit.
 */
export function habitHeatmap(state: AppState, weeks = 26, now = Date.now(), only?: string) {
  const today = startOfDay(now);
  const first = addDays(startOfWeek(now), -7 * (weeks - 1));
  const habits = state.habits.filter((h) => !h.archived && (!only || h.id === only));
  const byDay = new Map<string, Set<string>>();
  for (const c of state.checkins) {
    if (!byDay.has(c.day)) byDay.set(c.day, new Set());
    byDay.get(c.day)!.add(c.habitId);
  }
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, k) => {
      const day = addDays(first, w * 7 + k);
      if (day > today) return { day, share: null, future: true };
      const planned = habits.filter((h) => plannedOn(h, day));
      if (!planned.length) return { day, share: null, future: false };
      const done = byDay.get(dayKey(day));
      return { day, share: planned.filter((h) => done?.has(h.id)).length / planned.length, future: false };
    })
  );
}

/**
 * Days in a row, up to today, with every planned habit done. Today counts once
 * it's complete; until then the run is measured to yesterday. Days with
 * nothing planned neither add to it nor break it.
 */
export function perfectRun(grid: { share: number | null; future: boolean }[][]): number {
  const days = grid.flat().filter((c) => !c.future);
  let i = days.length - 1;
  if (i >= 0 && days[i].share !== null && days[i].share! < 1) i--;
  let run = 0;
  for (; i >= 0; i--) {
    const s = days[i].share;
    if (s === null) continue;
    if (s < 1) break;
    run++;
  }
  return run;
}

/** Of the days a habit was planned in the last `days` days (today included), the share done. */
export function habitRate(state: AppState, h: Habit, days = 30, now = Date.now()): number | null {
  const done = new Set(state.checkins.filter((c) => c.habitId === h.id).map((c) => c.day));
  let planned = 0;
  let hit = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(startOfDay(now), -i);
    if (!plannedOn(h, d)) continue;
    planned++;
    if (done.has(dayKey(d))) hit++;
  }
  return planned ? hit / planned : null;
}

/** Spending on each of the last `n` days, oldest first. */
export function dailySpend(state: AppState, n = 30, now = Date.now()) {
  const first = addDays(startOfDay(now), -(n - 1));
  const out = Array.from({ length: n }, (_, i) => ({ day: addDays(first, i), amount: 0 }));
  for (const t of state.txns) {
    if (!counts(t) || !isSpend(t) || t.ts < first) continue;
    const i = Math.round((startOfDay(t.ts) - first) / DAY);
    if (i >= 0 && i < n) out[i].amount -= t.amount;
  }
  return out;
}

/** Money out and in for each of the last `n` months, oldest first. */
export function monthlyFlow(state: AppState, n = 6, now = Date.now()) {
  return Array.from({ length: n }, (_, i) => {
    const start = startOfMonth(now, -(n - 1 - i));
    const end = startOfMonth(start, 1);
    let spent = 0;
    let income = 0;
    for (const t of state.txns) {
      if (t.ts < start || t.ts >= end || !counts(t)) continue;
      if (isSpend(t)) spent -= t.amount;
      else if (isIncome(t)) income += t.amount;
    }
    return { start, spent, income };
  });
}

/** Spending by category between two moments, largest first. */
export function byCategory(state: AppState, from: number, to = Infinity) {
  const m = new Map<string, number>();
  for (const t of state.txns) {
    if (t.ts < from || t.ts >= to || !counts(t) || !isSpend(t)) continue;
    m.set(t.cat, (m.get(t.cat) || 0) - t.amount);
  }
  return [...m.entries()].map(([cat, amount]) => ({ cat, amount })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
}

/** Percentage change from `before` to `now`; null when there's nothing to compare with. */
export const change = (now: number, before: number): number | null => (before > 0 ? ((now - before) / before) * 100 : null);

/**
 * Planned days in a row a habit was done, back from today. Today counts once
 * ticked; until then the run is measured to yesterday.
 */
export function streakOf(state: AppState, h: Habit, now = Date.now()): number {
  const done = new Set(state.checkins.filter((c) => c.habitId === h.id).map((c) => c.day));
  const today = startOfDay(now);
  let run = 0;
  for (let i = done.has(dayKey(today)) ? 0 : 1; i < 800; i++) {
    const d = addDays(today, -i);
    if (!plannedOn(h, d)) continue;
    if (done.has(dayKey(d))) run++;
    else break;
  }
  return run;
}

/** The longest run of planned days done, ever (within the loaded history). */
export function bestStreakOf(state: AppState, h: Habit): number {
  const days = state.checkins.filter((c) => c.habitId === h.id).map((c) => c.day).sort();
  if (!days.length) return 0;
  const done = new Set(days);
  let best = 0;
  let run = 0;
  for (let d = new Date(`${days[0]}T12:00`).getTime(); d <= Date.now(); d = addDays(d, 1)) {
    if (!plannedOn(h, d)) continue;
    if (done.has(dayKey(d))) best = Math.max(best, ++run);
    else run = 0;
  }
  return best;
}
