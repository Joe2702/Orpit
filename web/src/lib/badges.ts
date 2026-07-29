import type { GlyphName } from './appIcons';
import type { AppState } from '../types';
import { dayKey } from './format';

export interface BadgeDef {
  id: string;
  name: string;
  desc: string; // the requirement, shown even while locked
  icon: GlyphName;
  color: string; // CSS token key
  metric: keyof Metrics;
  goal: number;
}

export interface Badge extends BadgeDef {
  value: number;
  unlocked: boolean;
  pct: number; // 0..100 progress toward goal
}

interface Metrics {
  workouts: number;
  nights: number;
  checkins: number;
  txns: number;
  counts: number;
  goals: number;
  goalsDone: number;
  entries: number;
  trackers: number;
  activeDays: number;
  avatar: number;
  memberDays: number;
}

function metrics(s: AppState): Metrics {
  const dayKeys = new Set<string>();
  const add = (ts: number) => dayKeys.add(dayKey(ts));
  s.workouts.forEach((w) => add(w.ts));
  s.nights.forEach((n) => add(n.ts));
  s.txns.forEach((t) => add(t.ts));
  s.countLogs.forEach((c) => add(c.ts));
  s.checkins.forEach((c) => dayKeys.add(c.day));

  const trackers =
    (s.workouts.length ? 1 : 0) +
    (s.nights.length ? 1 : 0) +
    (s.checkins.length ? 1 : 0) +
    (s.txns.length ? 1 : 0) +
    (s.countLogs.length ? 1 : 0);

  return {
    workouts: s.workouts.length,
    nights: s.nights.length,
    checkins: s.checkins.length,
    txns: s.txns.length,
    counts: s.countLogs.length,
    goals: s.goals.length,
    goalsDone: s.goals.filter((g) => g.target > 0 && g.current >= g.target).length,
    entries:
      s.workouts.length + s.nights.length + s.checkins.length + s.txns.length + s.countLogs.length,
    trackers,
    activeDays: dayKeys.size,
    avatar: s.profile.avatar ? 1 : 0,
    memberDays: Math.max(0, Math.floor((Date.now() - s.profile.createdAt) / 86400000)),
  };
}

export const BADGES: BadgeDef[] = [
  // Workouts
  { id: 'w1', name: 'First Rep', desc: 'Log your first workout', icon: 'dumbbell', color: 'coral', metric: 'workouts', goal: 1 },
  { id: 'w2', name: 'Warmed Up', desc: 'Log 10 workouts', icon: 'flame', color: 'coral', metric: 'workouts', goal: 10 },
  { id: 'w3', name: 'Committed', desc: 'Log 30 workouts', icon: 'shield', color: 'coral', metric: 'workouts', goal: 30 },
  { id: 'w4', name: 'Iron Will', desc: 'Log 75 workouts', icon: 'medal', color: 'coral', metric: 'workouts', goal: 75 },
  { id: 'w5', name: 'Powerhouse', desc: 'Log 150 workouts', icon: 'bolt', color: 'coral', metric: 'workouts', goal: 150 },
  // Sleep
  { id: 's1', name: 'Goodnight', desc: 'Log your first night', icon: 'moon', color: 'blue', metric: 'nights', goal: 1 },
  { id: 's2', name: 'Well Rested', desc: 'Log 7 nights', icon: 'bed', color: 'blue', metric: 'nights', goal: 7 },
  { id: 's3', name: 'Sleep Tracker', desc: 'Log 30 nights', icon: 'zen', color: 'blue', metric: 'nights', goal: 30 },
  { id: 's4', name: 'Dream Keeper', desc: 'Log 100 nights', icon: 'sparkle', color: 'blue', metric: 'nights', goal: 100 },
  // Habits
  { id: 'h1', name: 'First Check', desc: 'Complete a habit once', icon: 'check', color: 'teal', metric: 'checkins', goal: 1 },
  { id: 'h2', name: 'Consistent', desc: '25 habit check-ins', icon: 'sprout', color: 'teal', metric: 'checkins', goal: 25 },
  { id: 'h3', name: 'Habitual', desc: '100 habit check-ins', icon: 'tree', color: 'teal', metric: 'checkins', goal: 100 },
  { id: 'h4', name: 'Year of Growth', desc: '365 habit check-ins', icon: 'sun', color: 'teal', metric: 'checkins', goal: 365 },
  // Finance
  { id: 'f1', name: 'First Entry', desc: 'Log your first transaction', icon: 'coin', color: 'emerald', metric: 'txns', goal: 1 },
  { id: 'f2', name: 'Money Minder', desc: 'Log 25 transactions', icon: 'wallet', color: 'emerald', metric: 'txns', goal: 25 },
  { id: 'f3', name: 'Budget Boss', desc: 'Log 100 transactions', icon: 'chart', color: 'emerald', metric: 'txns', goal: 100 },
  { id: 'f4', name: 'Wealth Watcher', desc: 'Log 250 transactions', icon: 'gem', color: 'emerald', metric: 'txns', goal: 250 },
  // Counters
  { id: 'c1', name: 'Tally Starter', desc: 'Log a counter once', icon: 'tally', color: 'indigo', metric: 'counts', goal: 1 },
  { id: 'c2', name: 'Number Cruncher', desc: '50 counter logs', icon: 'calculator', color: 'indigo', metric: 'counts', goal: 50 },
  // Goals
  { id: 'g1', name: 'Dreamer', desc: 'Create a savings goal', icon: 'star', color: 'warning', metric: 'goals', goal: 1 },
  { id: 'g2', name: 'Achiever', desc: 'Complete a goal', icon: 'trophy', color: 'warning', metric: 'goalsDone', goal: 1 },
  // General / milestones
  { id: 'x1', name: 'Getting Started', desc: 'Log your very first entry', icon: 'rocket', color: 'indigo', metric: 'entries', goal: 1 },
  { id: 'x2', name: 'All-Rounder', desc: 'Use 3 different trackers', icon: 'target', color: 'indigo', metric: 'trackers', goal: 3 },
  { id: 'x3', name: 'Explorer', desc: 'Use all 5 trackers', icon: 'compass', color: 'indigo', metric: 'trackers', goal: 5 },
  { id: 'x4', name: 'Century', desc: '100 total entries', icon: 'trendUp', color: 'coral', metric: 'entries', goal: 100 },
  { id: 'x5', name: 'Devotee', desc: '500 total entries', icon: 'planet', color: 'indigo', metric: 'entries', goal: 500 },
  { id: 'x6', name: 'Regular', desc: 'Active on 30 different days', icon: 'calendar', color: 'teal', metric: 'activeDays', goal: 30 },
  { id: 'x7', name: 'Picture Perfect', desc: 'Add a profile photo', icon: 'camera', color: 'coral', metric: 'avatar', goal: 1 },
  { id: 'x8', name: 'Loyal', desc: '30 days with Orbit', icon: 'medal', color: 'warning', metric: 'memberDays', goal: 30 },
  { id: 'x9', name: 'Veteran', desc: '180 days with Orbit', icon: 'crown', color: 'warning', metric: 'memberDays', goal: 180 },
];

export function computeBadges(state: AppState): Badge[] {
  const m = metrics(state);
  return BADGES.map((b) => {
    const value = m[b.metric];
    const unlocked = value >= b.goal;
    return { ...b, value, unlocked, pct: Math.min(100, Math.round((value / b.goal) * 100)) };
  });
}
