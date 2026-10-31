import { isSpend, isIncome } from './money';
import type { GlyphName } from './appIcons';
import type { AppState } from '../types';
import { money0, minutes, dayKey } from './format';
import { addDays, period } from './period';
import { t, tn, yearStr } from '../i18n';

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
  const spent = txns.filter((t) => isSpend(t)).reduce((a, t) => a - t.amount, 0);
  const income = txns.filter((t) => isIncome(t)).reduce((a, t) => a + t.amount, 0);
  const net = income - spent;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
  // Top spending category.
  const catSpend = new Map<string, number>();
  txns.filter((t) => isSpend(t)).forEach((t) => catSpend.set(t.cat, (catSpend.get(t.cat) || 0) + -t.amount));
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
    headline: kind === 'week' ? (P.isCurrent ? t('Your week so far') : t('Your week')) : kind === 'year' ? t('{year} in review', { year: yearStr(start.getFullYear()) }) : P.isCurrent ? t('Your month so far') : t('Your month'),
    value: '',
    caption: range,
  });

  slides.push({
    key: 'workouts',
    color: 'coral',
    icon: 'dumbbell' as GlyphName,
    headline: t('Workouts'),
    value: String(workouts.length),
    caption: workouts.length ? `${t('{time} of training', { time: minutes(wMin) })} · ${tn(wActiveDays, '{n} active day', '{n} active days')}` : t('No workouts logged {label}', { label }),
  });
  if (deep && topWCat) {
    slides.push({ key: 'wcat', color: 'coral', icon: 'trophy' as GlyphName, headline: t('Top workout'), value: topWCat, caption: t('your most-logged category ({topWCatN}×)', { topWCatN }) });
  }

  slides.push({
    key: 'sleep',
    color: 'blue',
    icon: 'bed' as GlyphName,
    headline: t('Sleep'),
    value: nights.length ? fmtDur(slAvg) : '—',
    caption: nights.length ? tn(nights.length, 'a night, on average, across {n} night', 'a night, on average, across {n} nights') : t('No nights logged {label}', { label }),
  });
  if (deep && nights.length) {
    slides.push({ key: 'sleepbest', color: 'blue', icon: 'star' as GlyphName, headline: t('Best night'), value: fmtDur(slBest), caption: t('your longest sleep {label}', { label }) });
  }

  slides.push({
    key: 'habits',
    color: 'teal',
    icon: 'sprout' as GlyphName,
    headline: t('Habit check-ins'),
    value: String(habitChecks),
    caption: habitChecks ? t('completed {label}', { label }) : t('No check-ins {label} yet', { label }),
  });
  if (bestHabit) {
    slides.push({ key: 'besthabit', color: 'teal', icon: 'flame' as GlyphName, headline: t('Most consistent'), value: bestHabit, caption: `${bestHabitN}× ${label}` });
  }

  if (txns.length) {
    slides.push({ key: 'spent', color: 'emerald', icon: 'cash' as GlyphName, headline: t('Spent'), value: money0(spent), caption: t('across {n} expenses {label}', { n: txns.filter((t) => isSpend(t)).length, label }) });
    if (deep) {
      if (topCat) slides.push({ key: 'topcat', color: 'emerald', icon: 'receipt' as GlyphName, headline: t('Top category'), value: topCat, caption: t('{amount} spent here', { amount: money0(topCatV) }) });
      slides.push({ key: 'saved', color: 'emerald', icon: 'trendUp' as GlyphName, headline: t('Net saved'), value: (net < 0 ? '−' : '') + money0(net), caption: income > 0 ? t('{savingsRate}% of income kept', { savingsRate }) : t('income minus spending') });
    }
  }

  slides.push({
    key: 'outro',
    color: 'indigo',
    icon: 'sparkle' as GlyphName,
    headline: kind === 'week' ? t('Onto next week') : kind === 'year' ? t('Onto the next one') : t('Onto next month'),
    value: '',
    caption: t('See you next time.'),
  });

  return slides;
}
