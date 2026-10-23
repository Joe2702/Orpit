import type { GlyphName } from './appIcons';
import type { AppState } from '../types';
import { money0, minutes, dayKey } from './format';
import { addDays, period } from './period';

export interface ReportSlide {
  key: string;
  color: string; // CSS token key
  icon: GlyphName;
  headline: string;
  value: string; // big stat ('' for intro/outro)
  caption: string;
}

// Build a set of "story" slides summarising the user's last week or month.
// Monthly goes deeper (top category, best habit, savings rate, …).
export function buildReport(s: AppState, kind: 'week' | 'month' | 'year', offset = 0): ReportSlide[] {
  // The same calendar periods as every chart in the app (lib/period.ts):
  // Sunday-to-Saturday weeks, real months, January-to-December years. This
  // report used to start its weeks on Monday while the habit screen started
  // them on Sunday, so the two disagreed about what "this week" held.
  const P = period(kind === 'week' ? 'Week' : kind === 'month' ? 'Month' : 'Year', offset);
  const start = new Date(P.start);
  const startMs = P.start;
  const endMs = Math.min(P.end, Date.now() + 1);
  const inWin = (ts: number) => ts >= startMs && ts < endMs;

  const winDays = new Set<string>();
  for (let t = startMs; t < endMs; t = addDays(t, 1)) winDays.add(dayKey(t));
  const periodLabel = P.phrase;
  // A year gets the full deep-dive treatment, like a month.
  const deep = kind !== 'week';

  const workouts = s.workouts.filter((w) => inWin(w.ts));
  const wMin = workouts.reduce((a, w) => a + (w.dur || 0), 0);
  const wActiveDays = new Set(workouts.map((w) => new Date(w.ts).setHours(0, 0, 0, 0))).size;

  const nights = s.nights.filter((n) => inWin(n.ts));
  const slAvg = nights.length ? nights.reduce((a, n) => a + n.hours, 0) / nights.length : 0;
  const slBest = nights.length ? Math.max(...nights.map((n) => n.hours)) : 0;
  const fmtDur = (h: number) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;

  const habitChecks = s.checkins.filter((c) => winDays.has(c.day)).length;
  // Best habit = most check-ins in window.
  const perHabit = new Map<string, number>();
  s.checkins.filter((c) => winDays.has(c.day)).forEach((c) => perHabit.set(c.habitId, (perHabit.get(c.habitId) || 0) + 1));
  let bestHabit = '';
  let bestHabitN = 0;
  perHabit.forEach((n, id) => {
    if (n > bestHabitN) {
      bestHabitN = n;
      bestHabit = s.habits.find((h) => h.id === id)?.name || '';
    }
  });

  // Transfers between your own accounts are not spending and not income; a
  // week's report that counts them describes a week that didn't happen.
  const txns = s.txns.filter((t) => inWin(t.ts) && !t.toAccId && !t.adjust);
  const spent = txns.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);
  const income = txns.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const net = income - spent;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
  // Top spending category.
  const catSpend = new Map<string, number>();
  txns.filter((t) => t.amount < 0).forEach((t) => catSpend.set(t.cat, (catSpend.get(t.cat) || 0) + -t.amount));
  let topCat = '';
  let topCatV = 0;
  catSpend.forEach((v, c) => {
    if (v > topCatV) {
      topCatV = v;
      topCat = c;
    }
  });

  // Most frequent workout category.
  const catCount = new Map<string, number>();
  workouts.forEach((w) => w.catId && catCount.set(w.catId, (catCount.get(w.catId) || 0) + 1));
  let topWCat = '';
  let topWCatN = 0;
  catCount.forEach((n, id) => {
    if (n > topWCatN) {
      topWCatN = n;
      topWCat = s.wCats.find((c) => c.id === id)?.name || '';
    }
  });

  const label = periodLabel;
  const slides: ReportSlide[] = [];

  const range = P.caption;
  slides.push({
    key: 'intro',
    color: 'indigo',
    icon: (kind === 'week' ? 'calendar' : kind === 'year' ? 'sparkle' : 'moon') as GlyphName,
    headline: kind === 'week' ? (P.isCurrent ? 'Your week so far' : 'Your week') : kind === 'year' ? `${start.getFullYear()} in review` : P.isCurrent ? 'Your month so far' : 'Your month',
    value: '',
    caption: range,
  });

  slides.push({
    key: 'workouts',
    color: 'coral',
    icon: 'dumbbell' as GlyphName,
    headline: 'Workouts',
    value: String(workouts.length),
    caption: workouts.length ? `${minutes(wMin)} of training · ${wActiveDays} active ${wActiveDays === 1 ? 'day' : 'days'}` : `No workouts logged ${label}`,
  });
  if (deep && topWCat) {
    slides.push({ key: 'wcat', color: 'coral', icon: 'trophy' as GlyphName, headline: 'Top workout', value: topWCat, caption: `your most-logged category (${topWCatN}×)` });
  }

  slides.push({
    key: 'sleep',
    color: 'blue',
    icon: 'bed' as GlyphName,
    headline: 'Sleep',
    value: nights.length ? fmtDur(slAvg) : '—',
    caption: nights.length ? `a night, on average, across ${nights.length} ${nights.length === 1 ? 'night' : 'nights'}` : `No nights logged ${label}`,
  });
  if (deep && nights.length) {
    slides.push({ key: 'sleepbest', color: 'blue', icon: 'star' as GlyphName, headline: 'Best night', value: fmtDur(slBest), caption: `your longest sleep ${label}` });
  }

  slides.push({
    key: 'habits',
    color: 'teal',
    icon: 'sprout' as GlyphName,
    headline: 'Habit check-ins',
    value: String(habitChecks),
    caption: habitChecks ? `completed ${label}` : `No check-ins ${label} yet`,
  });
  if (bestHabit) {
    slides.push({ key: 'besthabit', color: 'teal', icon: 'flame' as GlyphName, headline: 'Most consistent', value: bestHabit, caption: `${bestHabitN}× ${label}` });
  }

  if (txns.length) {
    slides.push({ key: 'spent', color: 'emerald', icon: 'cash' as GlyphName, headline: 'Spent', value: money0(spent), caption: `across ${txns.filter((t) => t.amount < 0).length} expenses ${label}` });
    if (deep) {
      if (topCat) slides.push({ key: 'topcat', color: 'emerald', icon: 'receipt' as GlyphName, headline: 'Top category', value: topCat, caption: `${money0(topCatV)} spent here` });
      slides.push({ key: 'saved', color: 'emerald', icon: 'trendUp' as GlyphName, headline: 'Net saved', value: (net < 0 ? '−' : '') + money0(net), caption: income > 0 ? `${savingsRate}% of income kept` : 'income minus spending' });
    }
  }

  slides.push({
    key: 'outro',
    color: 'indigo',
    icon: 'sparkle' as GlyphName,
    headline: kind === 'week' ? 'Onto next week' : kind === 'year' ? 'Onto the next one' : 'Onto next month',
    value: '',
    caption: 'See you next time.',
  });

  return slides;
}
