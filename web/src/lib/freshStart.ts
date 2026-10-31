import type { AppState } from '../types';
import { derive, deriveHabits } from './derive';
import { hm } from './format';
import { monthLong, startOfWeek } from './period';
import { listJoin, num, t, tn } from '../i18n';

// The fresh-start card.
//
// People are measurably more likely to start on a goal right after a temporal
// landmark: the start of a week, a month, a year (Dai, Milkman & Riis, "The
// Fresh Start Effect", Management Science 2014). Those are the days to show
// someone how the last stretch went and invite them to set up the next one.
// Any other day the card would be noise, so it only exists on those days.

export interface FreshStart {
  /** Identifies the period, so dismissing it lasts until the next one. */
  key: string;
  kind: 'week' | 'month' | 'year';
  title: string;
  body: string;
  cta: string;
}

const year = (y: number) => num(y, { useGrouping: false });

export function freshStart(s: AppState, now: number = Date.now()): FreshStart | null {
  const d = new Date(now);
  const kind: FreshStart['kind'] | null =
    d.getMonth() === 0 && d.getDate() <= 7 ? 'year' : d.getDate() <= 3 ? 'month' : d.getDay() <= 1 ? 'week' : null;
  if (!kind) return null;

  const range = kind === 'week' ? 'Week' : kind === 'month' ? 'Month' : 'Year';
  const past = derive(s, range, 1, now);
  const habits = deriveHabits(s, range, 1, now);

  const parts: string[] = [];
  if (habits.rangeTotal > 0) parts.push(t('{n}% of your habits', { n: habits.rangePct }));
  if (past.wCount > 0) parts.push(tn(past.wCount, '{n} workout', '{n} workouts'));
  if (past.slNights > 0) parts.push(t('{time} of sleep a night', { time: hm(past.slAvg) }));
  // Nothing to look back on: a new account is better served by the
  // getting-started list than by a summary of an empty week.
  if (!parts.length) return null;

  const lastMonth = monthLong((d.getMonth() + 11) % 12);
  const when = kind === 'week' ? t('Last week') : kind === 'month' ? t('In {month}', { month: lastMonth }) : t('In {year}', { year: year(d.getFullYear() - 1) });
  const next = kind === 'week' ? t('this week') : kind === 'month' ? t('this month') : t('this year');
  const key =
    kind === 'week'
      ? `w-${new Date(startOfWeek(now)).toDateString()}`
      : kind === 'month'
      ? `m-${d.getFullYear()}-${d.getMonth()}`
      : `y-${d.getFullYear()}`;

  return {
    key,
    kind,
    title: kind === 'week' ? t('A fresh week') : kind === 'month' ? t('Welcome to {month}', { month: monthLong(d.getMonth()) }) : t('A new year'),
    body: t('{when}: {summary}. A good moment to choose one thing to do a little better {next}.', { when, summary: listJoin(parts), next }),
    cta: kind === 'week' ? t('Look back at last week') : kind === 'month' ? t('See your {month} report', { month: lastMonth }) : t('See {year} in review', { year: year(d.getFullYear() - 1) }),
  };
}
