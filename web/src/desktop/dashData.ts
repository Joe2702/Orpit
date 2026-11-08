// Numbers for the website's dashboard, worked out from the app's state.

import type { AppState } from '../types';
import { dayKey } from '../lib/format';

const DAY = 86_400_000;
const startOfDay = (ts: number) => new Date(ts).setHours(0, 0, 0, 0);

/** Hours slept each of the last `n` nights, oldest first; null where nothing was logged. */
export function sleepNights(state: AppState, n = 14, now = Date.now()): { day: number; hours: number | null }[] {
  const today = startOfDay(now);
  return Array.from({ length: n }, (_, i) => {
    const day = today - (n - 1 - i) * DAY;
    const night = state.nights.find((x) => startOfDay(x.ts) === day);
    return { day, hours: night ? night.hours : null };
  });
}

/** Workouts and minutes in each of the last `n` weeks (Monday to Sunday), oldest first. */
export function trainingWeeks(state: AppState, n = 8, now = Date.now()): { start: number; count: number; minutes: number }[] {
  const d = new Date(startOfDay(now));
  const monday = d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: n }, (_, i) => {
    const start = new Date(monday).setDate(new Date(monday).getDate() - (n - 1 - i) * 7);
    const end = new Date(start).setDate(new Date(start).getDate() + 7);
    const ws = state.workouts.filter((w) => w.ts >= start && w.ts < end);
    return { start, count: ws.length, minutes: ws.reduce((s, w) => s + (w.dur || 0), 0) };
  });
}

/**
 * Every day of the last `weeks` weeks as the share of that day's planned
 * habits that were done (0 to 1), or null when nothing was planned. Laid out
 * week by week, Monday first, the way a calendar heatmap reads.
 */
export function habitHeatmap(state: AppState, weeks = 26, now = Date.now()): { day: number; share: number | null; future: boolean }[][] {
  const today = startOfDay(now);
  const d = new Date(today);
  const thisMonday = d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const habits = state.habits.filter((h) => !h.archived);
  const byDay = new Map<string, Set<string>>();
  for (const c of state.checkins) {
    if (!byDay.has(c.day)) byDay.set(c.day, new Set());
    byDay.get(c.day)!.add(c.habitId);
  }
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, k) => {
      const base = new Date(thisMonday);
      base.setDate(base.getDate() - (weeks - 1 - w) * 7 + k);
      const day = base.getTime();
      if (day > today) return { day, share: null, future: true };
      const dow = base.getDay();
      const planned = habits.filter((h) => (/^[01]{7}$/.test(h.days) ? h.days : '1111111')[dow] === '1');
      if (!planned.length) return { day, share: null, future: false };
      const done = byDay.get(dayKey(day));
      const n = planned.filter((h) => done?.has(h.id)).length;
      return { day, share: n / planned.length, future: false };
    })
  );
}

/**
 * Days in a row, up to today, with every planned habit done. Today counts once
 * it's complete; until then the run is measured to yesterday, so an evening
 * not yet ticked off doesn't read as a broken run. Days with nothing planned
 * neither add to it nor break it.
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
