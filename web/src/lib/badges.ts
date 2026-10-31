import type { GlyphName } from './appIcons';
import type { AppState } from '../types';
import { dayKey } from './format';
import { t } from '../i18n';

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

/** Exported so the window/archive arithmetic can be tested directly. */
export function metrics(s: AppState): Metrics {
  const dayKeys = new Set<string>();
  const add = (ts: number) => dayKeys.add(dayKey(ts));
  s.workouts.forEach((w) => add(w.ts));
  s.nights.forEach((n) => add(n.ts));
  s.txns.forEach((t) => add(t.ts));
  s.countLogs.forEach((c) => add(c.ts));
  s.checkins.forEach((c) => dayKeys.add(c.day));

  const trackers =
    (s.workouts.length + s.archive.workouts ? 1 : 0) +
    (s.nights.length + s.archive.nights ? 1 : 0) +
    (s.checkins.length + s.archive.checkins ? 1 : 0) +
    (s.txns.length + s.archive.txns ? 1 : 0) +
    (s.countLogs.length + s.archive.countLogs ? 1 : 0);

  // Every count is window + archive: a badge earned in year one must not
  // un-earn itself when those rows fall out of the state window.
  const a = s.archive;
  return {
    workouts: s.workouts.length + a.workouts,
    nights: s.nights.length + a.nights,
    checkins: s.checkins.length + a.checkins,
    txns: s.txns.length + a.txns,
    counts: s.countLogs.length + a.countLogs,
    goals: s.goals.length,
    goalsDone: s.goals.filter((g) => g.target > 0 && g.current >= g.target).length,
    entries:
      s.workouts.length + s.nights.length + s.checkins.length + s.txns.length + s.countLogs.length +
      a.workouts + a.nights + a.checkins + a.txns + a.countLogs,
    trackers,
    // The two day sets are disjoint — archive is strictly before the window.
    activeDays: dayKeys.size + a.activeDays,
    avatar: s.profile.avatar ? 1 : 0,
    memberDays: Math.max(0, Math.floor((Date.now() - s.profile.createdAt) / 86400000)),
  };
}

export const BADGES: BadgeDef[] = [
  // Workouts
  { id: 'w1', name: t('First Rep'), desc: t('Log your first workout'), icon: 'dumbbell', color: 'coral', metric: 'workouts', goal: 1 },
  { id: 'w2', name: t('Warmed Up'), desc: t('Log 10 workouts'), icon: 'flame', color: 'coral', metric: 'workouts', goal: 10 },
  { id: 'w3', name: t('Committed'), desc: t('Log 30 workouts'), icon: 'shield', color: 'coral', metric: 'workouts', goal: 30 },
  { id: 'w4', name: t('Iron Will'), desc: t('Log 75 workouts'), icon: 'medal', color: 'coral', metric: 'workouts', goal: 75 },
  { id: 'w5', name: t('Powerhouse'), desc: t('Log 150 workouts'), icon: 'bolt', color: 'coral', metric: 'workouts', goal: 150 },
  // Sleep
  { id: 's1', name: t('Goodnight'), desc: t('Log your first night'), icon: 'moon', color: 'blue', metric: 'nights', goal: 1 },
  { id: 's2', name: t('Well Rested'), desc: t('Log 7 nights'), icon: 'bed', color: 'blue', metric: 'nights', goal: 7 },
  { id: 's3', name: t('Sleep Tracker'), desc: t('Log 30 nights'), icon: 'zen', color: 'blue', metric: 'nights', goal: 30 },
  { id: 's4', name: t('Dream Keeper'), desc: t('Log 100 nights'), icon: 'sparkle', color: 'blue', metric: 'nights', goal: 100 },
  // Habits
  { id: 'h1', name: t('First Check'), desc: t('Complete a habit once'), icon: 'check', color: 'teal', metric: 'checkins', goal: 1 },
  { id: 'h2', name: t('Consistent'), desc: t('25 habit check-ins'), icon: 'sprout', color: 'teal', metric: 'checkins', goal: 25 },
  { id: 'h3', name: t('Habitual'), desc: t('100 habit check-ins'), icon: 'tree', color: 'teal', metric: 'checkins', goal: 100 },
  { id: 'h4', name: t('Year of Growth'), desc: t('365 habit check-ins'), icon: 'sun', color: 'teal', metric: 'checkins', goal: 365 },
  // Finance
  { id: 'f1', name: t('First Entry'), desc: t('Log your first transaction'), icon: 'coin', color: 'emerald', metric: 'txns', goal: 1 },
  { id: 'f2', name: t('Money Minder'), desc: t('Log 25 transactions'), icon: 'wallet', color: 'emerald', metric: 'txns', goal: 25 },
  { id: 'f3', name: t('Budget Boss'), desc: t('Log 100 transactions'), icon: 'chart', color: 'emerald', metric: 'txns', goal: 100 },
  { id: 'f4', name: t('Wealth Watcher'), desc: t('Log 250 transactions'), icon: 'gem', color: 'emerald', metric: 'txns', goal: 250 },
  // Counters
  { id: 'c1', name: t('Tally Starter'), desc: t('Log a counter once'), icon: 'tally', color: 'indigo', metric: 'counts', goal: 1 },
  { id: 'c2', name: t('Number Cruncher'), desc: t('50 counter logs'), icon: 'calculator', color: 'indigo', metric: 'counts', goal: 50 },
  // Goals
  { id: 'g1', name: t('Dreamer'), desc: t('Create a savings goal'), icon: 'star', color: 'warning', metric: 'goals', goal: 1 },
  { id: 'g2', name: t('Achiever'), desc: t('Complete a goal'), icon: 'trophy', color: 'warning', metric: 'goalsDone', goal: 1 },
  // General / milestones
  { id: 'x1', name: t('Getting Started'), desc: t('Log your very first entry'), icon: 'rocket', color: 'indigo', metric: 'entries', goal: 1 },
  { id: 'x2', name: t('All-Rounder'), desc: t('Use 3 different trackers'), icon: 'target', color: 'indigo', metric: 'trackers', goal: 3 },
  { id: 'x3', name: t('Explorer'), desc: t('Use all 5 trackers'), icon: 'compass', color: 'indigo', metric: 'trackers', goal: 5 },
  { id: 'x4', name: t('Century'), desc: t('100 total entries'), icon: 'trendUp', color: 'coral', metric: 'entries', goal: 100 },
  { id: 'x5', name: t('Devotee'), desc: t('500 total entries'), icon: 'planet', color: 'indigo', metric: 'entries', goal: 500 },
  { id: 'x6', name: t('Regular'), desc: t('Active on 30 different days'), icon: 'calendar', color: 'teal', metric: 'activeDays', goal: 30 },
  { id: 'x7', name: t('Picture Perfect'), desc: t('Add a profile photo'), icon: 'camera', color: 'coral', metric: 'avatar', goal: 1 },
  { id: 'x8', name: t('Loyal'), desc: t('30 days with Orbit'), icon: 'medal', color: 'warning', metric: 'memberDays', goal: 30 },
  { id: 'x9', name: t('Veteran'), desc: t('180 days with Orbit'), icon: 'crown', color: 'warning', metric: 'memberDays', goal: 180 },
];

export function computeBadges(state: AppState): Badge[] {
  const m = metrics(state);
  return BADGES.map((b) => {
    const value = m[b.metric];
    const unlocked = value >= b.goal;
    return { ...b, value, unlocked, pct: Math.min(100, Math.round((value / b.goal) * 100)) };
  });
}
