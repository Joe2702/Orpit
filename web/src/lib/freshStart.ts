import type { AppState } from '../types';
import { derive, deriveHabits } from './derive';
import { hm } from './format';
import { startOfWeek } from './period';

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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function list(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function freshStart(s: AppState, now: number = Date.now()): FreshStart | null {
  const d = new Date(now);
  const kind: FreshStart['kind'] | null =
    d.getMonth() === 0 && d.getDate() <= 7 ? 'year' : d.getDate() <= 3 ? 'month' : d.getDay() <= 1 ? 'week' : null;
  if (!kind) return null;

  const range = kind === 'week' ? 'Week' : kind === 'month' ? 'Month' : 'Year';
  const past = derive(s, range, 1, now);
  const habits = deriveHabits(s, range, 1, now);

  const parts: string[] = [];
  if (habits.rangeTotal > 0) parts.push(`${habits.rangePct}% of your habits`);
  if (past.wCount > 0) parts.push(`${past.wCount} ${past.wCount === 1 ? 'workout' : 'workouts'}`);
  if (past.slNights > 0) parts.push(`${hm(past.slAvg)} of sleep a night`);
  // Nothing to look back on: a new account is better served by the
  // getting-started list than by a summary of an empty week.
  if (!parts.length) return null;

  const when = kind === 'week' ? 'Last week' : kind === 'month' ? `In ${MONTHS[(d.getMonth() + 11) % 12]}` : `In ${d.getFullYear() - 1}`;
  const next = kind === 'week' ? 'this week' : kind === 'month' ? 'this month' : 'this year';
  const key =
    kind === 'week'
      ? `w-${new Date(startOfWeek(now)).toDateString()}`
      : kind === 'month'
      ? `m-${d.getFullYear()}-${d.getMonth()}`
      : `y-${d.getFullYear()}`;

  return {
    key,
    kind,
    title: kind === 'week' ? 'A fresh week' : kind === 'month' ? `Welcome to ${MONTHS[d.getMonth()]}` : 'A new year',
    body: `${when}: ${list(parts)}. A good moment to choose one thing to do a little better ${next}.`,
    cta: kind === 'week' ? 'Look back at last week' : kind === 'month' ? `See your ${MONTHS[(d.getMonth() + 11) % 12]} report` : `See ${d.getFullYear() - 1} in review`,
  };
}
