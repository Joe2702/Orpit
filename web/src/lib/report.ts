import type { AppState } from '../types';
import { money } from './format';

export interface ReportSlide {
  key: string;
  color: string; // CSS token key
  emoji: string;
  headline: string;
  value: string; // big stat ('' for intro/outro)
  caption: string;
}

const D = 86400000;

// Build a set of "story" slides summarising the user's last week or month.
// Monthly goes deeper (top category, best habit, savings rate, …).
export function buildReport(s: AppState, kind: 'week' | 'month'): ReportSlide[] {
  const days = kind === 'week' ? 7 : 30;
  const now = Date.now();
  const start = now - days * D;
  const inWin = (ts: number) => ts >= start && ts <= now;

  const winDays = new Set<string>();
  for (let i = 0; i < days; i++) winDays.add(new Date(now - i * D).toISOString().slice(0, 10));

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

  const txns = s.txns.filter((t) => inWin(t.ts));
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

  const label = kind === 'week' ? 'this week' : 'this month';
  const slides: ReportSlide[] = [];

  slides.push({
    key: 'intro',
    color: 'indigo',
    emoji: kind === 'week' ? '🗓️' : '🌙',
    headline: kind === 'week' ? 'Your week' : 'Your month',
    value: '',
    caption: `A look back at your last ${days} days on Orbit`,
  });

  slides.push({
    key: 'workouts',
    color: 'coral',
    emoji: '💪',
    headline: 'Workouts',
    value: String(workouts.length),
    caption: workouts.length ? `${wMin} minutes moved · ${wActiveDays} active days` : `No workouts logged ${label}`,
  });
  if (kind === 'month' && topWCat) {
    slides.push({ key: 'wcat', color: 'coral', emoji: '🏆', headline: 'Top workout', value: topWCat, caption: `your most-logged category (${topWCatN}×)` });
  }

  slides.push({
    key: 'sleep',
    color: 'blue',
    emoji: '😴',
    headline: 'Sleep',
    value: nights.length ? fmtDur(slAvg) : '—',
    caption: nights.length ? `nightly average across ${nights.length} nights` : `No nights logged ${label}`,
  });
  if (kind === 'month' && nights.length) {
    slides.push({ key: 'sleepbest', color: 'blue', emoji: '🌟', headline: 'Best night', value: fmtDur(slBest), caption: 'your longest sleep this month' });
  }

  slides.push({
    key: 'habits',
    color: 'teal',
    emoji: '🌱',
    headline: 'Habit check-ins',
    value: String(habitChecks),
    caption: habitChecks ? `completed ${label}` : `No check-ins ${label} yet`,
  });
  if (bestHabit) {
    slides.push({ key: 'besthabit', color: 'teal', emoji: '🔥', headline: 'Most consistent', value: bestHabit, caption: `${bestHabitN}× ${label}` });
  }

  if (txns.length) {
    slides.push({ key: 'spent', color: 'emerald', emoji: '💸', headline: 'Spent', value: money(spent), caption: `across ${txns.filter((t) => t.amount < 0).length} expenses ${label}` });
    if (kind === 'month') {
      if (topCat) slides.push({ key: 'topcat', color: 'emerald', emoji: '🧾', headline: 'Top category', value: topCat, caption: `${money(topCatV)} spent here` });
      slides.push({ key: 'saved', color: 'emerald', emoji: '📈', headline: 'Net saved', value: money(net), caption: income > 0 ? `${savingsRate}% savings rate` : 'income vs. spending' });
    }
  }

  slides.push({
    key: 'outro',
    color: 'indigo',
    emoji: '✨',
    headline: kind === 'week' ? 'Onto next week' : 'Onto next month',
    value: '',
    caption: 'Keep tracking — every entry paints the bigger picture.',
  });

  return slides;
}
