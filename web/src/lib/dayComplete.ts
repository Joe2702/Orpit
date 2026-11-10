import type { AppState } from '../types';
import { dayKey } from './format';
import { addDays, startOfDay } from './period';
import { tn, t, tData } from '../i18n';

// The line under "Today's list is done."
//
// Ticking the day's last habit is the high point of using the app, and the
// part people remember. "4 of 4" says what they did; this says something
// true about them: that they've done it every day this week, that a habit has
// turned into part of how their days go. Only ever something true, picked
// from their own record, and never a count of what they missed.

/** Repetitions after which a habit tends to run without effort (Lally et al., 2010). */
export const FORMED = 66;

const MILESTONES = new Set([7, 21, 30, 50, FORMED, 100, 150, 200, 250, 365, 500, 730, 1000]);
const isMilestone = (n: number) => MILESTONES.has(n) || (n > 100 && n % 100 === 0);

export type DayLine = { kind: 'milestone' | 'run' | 'formed' | 'kept'; text: string };

export function dayCompleteLine(state: AppState, now: number = Date.now()): DayLine {
  const today = dayKey(now);
  const active = state.habits.filter((h) => !h.archived && !h.paused);
  const done = new Map(active.map((h) => [h.id, new Set<string>()]));
  for (const c of state.checkins) done.get(c.habitId)?.add(c.day);
  const mask = (h: { days: string }) => (h.days && h.days.length === 7 ? h.days : '1111111');
  // A habit only counts from its first check-in: one added last week can't
  // have been missed the month before.
  const first = new Map(active.map((h) => [h.id, [...done.get(h.id)!].sort()[0] ?? today]));

  // Habits the person set themselves; the app's own (locked) one, like the
  // daily check-in, counts toward a full day but isn't what the line is about.
  const doneToday = active.filter((h) => !h.locked && done.get(h.id)!.has(today) && mask(h)[new Date(now).getDay()] === '1');

  // A round number reached today wins: it only happens once.
  const hit = doneToday
    .map((h) => ({ h, n: done.get(h.id)!.size }))
    .filter((x) => isMilestone(x.n))
    .sort((a, b) => b.n - a.n)[0];
  if (hit) {
    const name = tData(hit.h.name);
    return {
      kind: 'milestone',
      text:
        hit.n === FORMED
          ? t('{name}: 66 days. About when a habit starts to run itself.', { name })
          : tn(hit.n, '{name}: {n} day and counting.', '{name}: {n} days and counting.', { name }),
    };
  }

  // Days in a row, up to today, with every scheduled habit done. A day with
  // nothing scheduled neither breaks the run nor adds to it.
  let run = 0;
  for (let i = 0, d = startOfDay(now); i < 366; i++, d = addDays(d, -1)) {
    const key = dayKey(d);
    const due = active.filter((h) => mask(h)[new Date(d).getDay()] === '1' && first.get(h.id)! <= key);
    if (!due.length) continue;
    if (!due.every((h) => done.get(h.id)!.has(key))) break;
    run++;
  }

  const formed = doneToday
    .map((h) => ({ h, n: done.get(h.id)!.size }))
    .filter((x) => x.n >= FORMED)
    .sort((a, b) => b.n - a.n)[0];

  // When more than one line is true, take turns by the day, so a long-time
  // user doesn't read the same sentence every evening.
  const options: DayLine[] = [];
  if (run >= 2) options.push({ kind: 'run', text: tn(run, 'Every habit done, {n} day running.', 'Every habit done, {n} days running.') });
  if (formed)
    options.push({
      kind: 'formed',
      text: tn(formed.n, '{name} is second nature now, {n} day in.', '{name} is second nature now, {n} days in.', { name: tData(formed.h.name) }),
    });
  if (options.length) return options[Math.floor(startOfDay(now) / 86_400_000) % options.length];
  return { kind: 'kept', text: t('You did what you said you would.') };
}
