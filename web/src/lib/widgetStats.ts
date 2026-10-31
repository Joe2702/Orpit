import { derive, deriveHabits } from './derive';
import { money, dayKey, minutes } from './format';
import type { AppState } from '../types';
import { t, tn } from '../i18n';

// What the home-screen analytics widgets show.
//
// The widget is a native RemoteViews tree: it cannot run JavaScript, call the
// API, or do arithmetic worth trusting. So everything is computed and *phrased*
// here, and the Java side only places strings into a layout. That keeps the
// copy, the rounding and the currency in one place — and, more importantly,
// makes the widget derive from `derive()`, the same function the screens use.
// A widget that quietly disagrees with the app is worse than no widget.

export interface WidgetPanel {
  /** Module name, shown small at the top. */
  title: string;
  /** The one number worth glancing at. */
  value: string;
  /** What that number is. */
  caption: string;
  /** Up to three supporting label/value pairs. */
  rows: [string, string][];
}

/**
 * Field separator for the encoded payload.
 *
 * ASCII unit separator: it cannot appear in a habit name, an account name or a
 * currency string, so no user-entered text can ever split a field in two.
 */
export const SEP = '\u001f';

/** Flatten a panel to the fixed-arity string the Java renderer splits. */
export function encodePanel(p: WidgetPanel): string {
  const cells: string[] = [p.title, p.value, p.caption];
  for (let i = 0; i < 3; i++) {
    const r = p.rows[i];
    cells.push(r ? r[0] : '', r ? r[1] : '');
  }
  return cells.join(SEP);
}

/** Whole hours and minutes, e.g. 7.7 → "7h 42m". */
export function hm(hours: number): string {
  if (!isFinite(hours) || hours <= 0) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 60 ? `${h + 1}h` : m ? `${h}h ${m}m` : `${h}h`;
}

/** A clock time from a fractional hour, e.g. 23.5 → "23:30". */
export function clock(hour: number | null): string {
  if (hour == null || !isFinite(hour)) return '—';
  const h = Math.floor(((hour % 24) + 24) % 24);
  const m = Math.round((hour - Math.floor(hour)) * 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Today's scheduled habits and how many are ticked off. */
function todayHabits(s: AppState, now: number): { done: number; due: number } {
  const today = dayKey(now);
  const dow = new Date(now).getDay();
  const due = s.habits.filter(
    (h) => !h.paused && !h.archived && (/^[01]{7}$/.test(h.days) ? h.days : '1111111')[dow] === '1'
  );
  const doneIds = new Set(s.checkins.filter((c) => c.day === today).map((c) => c.habitId));
  return { done: due.filter((h) => doneIds.has(h.id)).length, due: due.length };
}

/**
 * Build every panel in one pass.
 *
 * `derive` is not cheap, so it runs once here rather than once per widget —
 * this is called when the app goes to the background, and a phone being put
 * down is not the moment to do the same work five times.
 */
export function buildPanels(s: AppState, now: number = Date.now()): Record<string, WidgetPanel> {
  const d = derive(s, 'Week', 0, now);
  const h = deriveHabits(s, 'Week', 0, now);
  const tx = todayHabits(s, now);

  const habits: WidgetPanel = {
    title: t('Habits'),
    value: tx.due ? `${tx.done}/${tx.due}` : '—',
    caption: tx.due ? t('done today') : t('none scheduled today'),
    rows: [
      [t('This week'), `${h.habitPct}%`],
      [t('Longest streak'), h.longestStreak ? tn(h.longestStreak, '{n} day', '{n} days') : '—'],
    ],
  };

  const workouts: WidgetPanel = {
    title: t('Workouts'),
    value: String(d.homeWorkoutCount),
    caption: tn(d.homeWorkoutCount, 'session this week', 'sessions this week'),
    rows: [
      [t('Total time'), d.wTotalMin ? minutes(d.wTotalMin) : '—'],
      [t('Avg session'), d.wAvg ? minutes(d.wAvg) : '—'],
    ],
  };

  const sleep: WidgetPanel = {
    title: t('Sleep'),
    value: hm(d.slAvg),
    caption: t('average this week'),
    rows: [
      // Quality is scored out of 10 everywhere else; "/5" here made a good
      // night look perfect and an average one look great.
      [t('Quality'), d.slAvgQ ? `${d.slAvgQ.toFixed(1)}/10` : '—'],
      [t('Usual bedtime'), clock(d.avgBed)],
    ],
  };

  // Spending is a monthly idea, not a weekly one — a budget resets on the 1st,
  // and "spent this week" answers a question nobody asks about their money.
  const savedPct =
    d.incThisMonth > 0 ? Math.round(((d.incThisMonth - d.spentThisMonth) / d.incThisMonth) * 100) : null;
  const budgetPct =
    d.budgetTotal > 0 ? Math.round((d.budgetSpent / d.budgetTotal) * 100) : null;

  const finance: WidgetPanel = {
    title: t('Finances'),
    value: money(d.spentThisMonth),
    caption: t('spent this month'),
    rows: [
      [t('Income'), money(d.incThisMonth)],
      budgetPct != null
        ? ([t('Budget used'), `${budgetPct}%`] as [string, string])
        : ([t('Saved'), savedPct != null ? `${savedPct}%` : '—'] as [string, string]),
    ],
  };

  const summary: WidgetPanel = {
    title: t('Orbit'),
    value: tx.due ? `${tx.done}/${tx.due}` : '—',
    caption: tx.due ? t('habits done today') : t('no habits due today'),
    rows: [
      [t('Slept'), hm(d.slAvg)],
      [t('Workouts'), t('{n} this week', { n: d.homeWorkoutCount })],
      [t('Spent'), money(d.spentThisMonth)],
    ],
  };

  return { habits, workouts, sleep, finance, summary };
}

/** Preferences keys, matching the KEY constants in the Java providers. */
export const PANEL_KEYS: Record<string, string> = {
  habits: 'widget_habits',
  workouts: 'widget_workouts',
  sleep: 'widget_sleep',
  finance: 'widget_finance',
  summary: 'widget_summary_stats',
};
