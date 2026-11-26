import { derive, deriveHabits } from './derive';
import { dayKey, minutes, money } from './format';
import { addDays, startOfDay } from './period';
import { stepsHabit, stepsOn, STEP_GOAL } from './steps';
import type { AppState } from '../types';
import { date, getDigits, isRTL, locale, num, t, tData, tn } from '../i18n';

// What the home-screen widgets show.
//
// A widget is a native view: it can't run this code, call the server or be
// trusted with arithmetic. So everything is worked out and worded here, from
// the same functions the screens use, and written as one JSON for the widgets
// to read (see widget.ts, and Widgets.java on the Android side). A widget that
// disagrees with the app is worse than no widget.
//
// Two things the widget does work out for itself, because they change while
// the app is closed: which habits are due today (it has each habit's days, so
// a new day shows the new day's habits, none of them ticked yet), and today's
// steps (the background step check updates them between visits).

export interface WidgetHabit {
  name: string;
  /** Sun..Sat, '1' where the habit is due. */
  days: string;
  /** Ticked on `day`. */
  done: boolean;
}

export interface WidgetData {
  v: 2;
  /** The phone's date when this was written; anything "today" is only true on it. */
  day: string;
  /** For formatting numbers the widget fills in itself (Java language tag). */
  locale: string;
  digits: 'latn' | 'arab';
  rtl: boolean;
  /** Words in fixed places. `{done}`, `{due}`, `{n}` are filled in by the widget. */
  t: Record<string, string>;
  habits: { list: WidgetHabit[]; week: string; streak: string };
  /** Null when there's no Steps habit. */
  steps: { count: number; goal: number; goalText: string } | null;
  sleep: { last: string | null; quality: string | null; avg: string; series: number[]; labels: string[] };
  training: { total: string; sessions: string; series: number[]; labels: string[] };
  money: { spent: string; budgetPct: number | null; budgetText: string | null; safe: string | null };
}

/** Whole hours and minutes, e.g. 7.7 → "7h 42m". */
export function hm(hours: number): string {
  if (!isFinite(hours) || hours <= 0) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 60 ? t('{h}h', { h: num(h + 1) }) : m ? t('{h}h {m}m', { h: num(h), m: num(m) }) : t('{h}h', { h: num(h) });
}

/** The last seven days, oldest first, ending today: their start and a one-letter name. */
function week(now: number): { start: number; label: string }[] {
  const today = startOfDay(now);
  return Array.from({ length: 7 }, (_, i) => {
    const start = addDays(today, i - 6);
    return { start, label: date(start, { weekday: 'narrow' }) };
  });
}

export function buildWidgetData(s: AppState, now: number = Date.now()): WidgetData {
  const today = dayKey(now);
  const d = derive(s, 'Week', 0, now);
  const h = deriveHabits(s, 'Week', 0, now);
  const days = week(now);

  // ---- Habits: every live one with its days, so the widget can pick today's ----
  const doneToday = new Set(s.checkins.filter((c) => c.day === today).map((c) => c.habitId));
  const list = s.habits
    .filter((x) => !x.paused && !x.archived)
    .slice(0, 16)
    .map((x) => ({ name: tData(x.name), days: /^[01]{7}$/.test(x.days) ? x.days : '1111111', done: doneToday.has(x.id) }));

  // ---- Steps ----
  const sh = stepsHabit(s);
  const goal = sh?.goal || STEP_GOAL;
  const steps = sh ? { count: stepsOn(s, today)?.count ?? 0, goal, goalText: t('of {goal}', { goal: num(goal) }) } : null;

  // ---- Sleep: each of the last seven mornings, and last night if it's logged ----
  const nightOn = (start: number) => s.nights.filter((n) => n.ts >= start && n.ts < addDays(start, 1)).sort((a, b) => b.ts - a.ts)[0];
  const lastNight = nightOn(days[6].start) || nightOn(days[5].start);
  const sleep = {
    last: lastNight ? hm(lastNight.hours) : null,
    quality: lastNight ? t('{n}/10 quality', { n: num(lastNight.quality) }) : null,
    avg: d.slAvg ? t('{time} on average', { time: hm(d.slAvg) }) : t('No nights this week'),
    series: days.map((x) => Math.round((nightOn(x.start)?.hours ?? 0) * 10) / 10),
    labels: days.map((x) => x.label),
  };

  // ---- Training: minutes on each of the last seven days ----
  const trained = days.map((x) => s.workouts.filter((w) => w.ts >= x.start && w.ts < addDays(x.start, 1)).reduce((a, w) => a + (w.dur || 0), 0));
  const training = {
    total: d.wTotalMin ? minutes(d.wTotalMin) : minutes(0),
    sessions: tn(d.homeWorkoutCount, '{n} session this week', '{n} sessions this week'),
    series: trained,
    labels: days.map((x) => x.label),
  };

  // ---- Money: this month, against the budget ----
  const limit = d.budgets.reduce((a: number, b: { effLimit: number }) => a + b.effLimit, 0);
  const budgetPct = limit > 0 ? Math.round((d.budgetSpent / limit) * 100) : null;
  const moneyPart = {
    spent: money(d.spentThisMonth),
    budgetPct,
    budgetText: budgetPct != null ? t('{pct}% of your budget', { pct: num(budgetPct) }) : null,
    safe: d.safe && d.safe.perDay > 0 ? t('{amount} a day left to spend', { amount: money(d.safe.perDay) }) : null,
  };

  return {
    v: 2,
    day: today,
    locale: locale(),
    digits: getDigits(),
    rtl: isRTL(),
    t: {
      app: 'Orpit',
      today: t('Today'),
      habits: t('Habits'),
      habitsShort: t('habits'),
      steps: t('Steps'),
      sleep: t('Sleep'),
      lastNight: t('last night'),
      training: t('Training'),
      thisWeek: t('this week'),
      money: t('Money'),
      spent: t('spent this month'),
      doneOf: t('{done} of {due} done'),
      allDone: t('All done for today'),
      noneDue: t('Nothing due today'),
      toGo: t('{n} to go'),
      reached: t('Goal reached'),
      noSleep: t('No night logged'),
      log: t('Log'),
      habit: t('Habit'),
      workout: t('Workout'),
      expense: t('Expense'),
      stale: t('Open Orpit to update'),
    },
    habits: { list, week: t('{pct}% this week', { pct: num(h.habitPct) }), streak: h.longestStreak ? tn(h.longestStreak, 'Best run: {n} day', 'Best run: {n} days') : '' },
    steps,
    sleep,
    training,
    money: moneyPart,
  };
}
