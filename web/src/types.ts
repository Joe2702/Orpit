export type ColorKey = 'indigo' | 'coral' | 'teal' | 'blue' | 'emerald';

export interface Profile {
  name: string;
  email: string;
  theme: 'light' | 'dark' | 'system';
  reminders: boolean;
  haptics: boolean;
  onboarded: boolean;
  currency: string;
  avatar: string | null;
  layout: string | null;
  reminderTime: string | null;
  reminderTz: string | null;
  // Achievement badges already revealed, synced with the account.
  claimedBadges: string[];
  // Accent colour token and which trackers the user wants visible (null = all).
  accent: string;
  modules: string[] | null;
  // In-app text size multiplier and the optional wind-down nudge.
  textScale: number;
  windDown: boolean;
  // Confirmed via an emailed link. Never gates anything — it only makes
  // password recovery reliable, so the app nudges instead of blocking.
  emailVerified: boolean;
  // Whether the first-run intro has been completed.
  introDone: boolean;
  createdAt: number;
}

export interface Habit {
  id: string;
  name: string;
  color: string;
  target: string;
  locked: boolean;
  days: string; // 7-char mask, Sun..Sat, '1' = tracked
  paused: boolean; // temporarily off (travel/illness) without losing history
  archived: boolean; // hidden from the app but its check-ins are kept
  why: string | null; // the user's own motivation, shown when slipping
  reminderTime: string | null; // optional per-habit reminder (HH:MM)
}

export interface Checkin {
  habitId: string;
  day: string; // YYYY-MM-DD
}

export interface WCat {
  id: string;
  name: string;
  color: string;
}

/** One logged set: an exercise, how many reps, and optionally the weight used. */
export interface WorkoutSet {
  ex: string;
  reps: number;
  weight: number | null;
}

export interface Workout {
  id: string;
  name: string;
  catId: string | null;
  dur: number;
  dist: string | null;
  kcal: number | null;
  intensity: string | null;
  note: string | null;
  // Strength logging. null for cardio and anything logged without sets.
  sets: WorkoutSet[] | null;
  ts: number;
}

export interface Night {
  id: string;
  hours: number;
  quality: number;
  bedH: number | null;
  wakeH: number | null;
  note: string | null;
  ts: number;
}

export interface Txn {
  id: string;
  name: string;
  cat: string;
  amount: number;
  income: boolean;
  accId: string | null;
  /**
   * Set only on a transfer: the account the money lands in. `accId` is the one
   * it leaves. A transfer changes two balances and is neither income nor
   * spending, so every total has to skip it — counting one as an expense is
   * what makes a two-account ledger read as a spending spree.
   */
  toAccId: string | null;
  /**
   * A balance correction, not a real-world event. It changes what the account
   * holds — the money is genuinely there or genuinely gone — so it counts
   * toward net worth, but it is neither income nor spending and must stay out
   * of every budget, category total and insight.
   */
  adjust: boolean;
  note: string | null;
  // Whether a receipt exists. The image itself is fetched on demand so it
  // never rides along with every app open.
  photo: boolean;
  ts: number;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  color: string;
  opening: number;
}

export interface FCat {
  id: string;
  name: string;
  icon: string;
  color: string;
  kind: 'expense' | 'income';
}

export interface Budget {
  id: string;
  cat: string;
  limit: number;
  // Unused budget carries into next month.
  rollover: boolean;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  color: string;
  dueTs: number | null;
}

export interface Recurring {
  id: string;
  name: string;
  cat: string;
  accId: string | null;
  amount: number;
  freq: 'Weekly' | 'Monthly' | 'Yearly';
  income: boolean;
  nextTs: number | null;
}

export interface WTemplate {
  id: string;
  name: string;
  catId: string | null;
  dur: number;
  intensity: string | null;
}

export interface Counter {
  id: string;
  name: string;
  unit: string;
  color: string;
  icon: string;
  step: number;
}

export interface CountLog {
  id: string;
  counterId: string;
  amount: number;
  ts: number;
}

export interface AppState {
  profile: Profile;
  habits: Habit[];
  checkins: Checkin[];
  wCats: WCat[];
  workouts: Workout[];
  nights: Night[];
  txns: Txn[];
  accounts: Account[];
  fcats: FCat[];
  budgets: Budget[];
  goals: Goal[];
  recurring: Recurring[];
  counters: Counter[];
  countLogs: CountLog[];
  wTemplates: WTemplate[];
  /**
   * Totals for history older than the state window. The raw rows aren't sent —
   * one habit tap would otherwise re-download years of entries — but every
   * all-time number (badge counts, days tracked, account balances) still has to
   * be exact, so those are folded in here.
   */
  archive: Archive;
}

export interface Archive {
  workouts: number;
  nights: number;
  txns: number;
  countLogs: number;
  checkins: number;
  /** Signed sum of pre-window transactions, for the net-worth baseline. */
  txnSum: number;
  /** Distinct days with any activity before the window. Disjoint from the window. */
  activeDays: number;
  /** Earliest entry of any kind, or null if the account has none. */
  earliestTs: number | null;
  /** Pre-window balance change per account id, so balances stay right. */
  accSums: Record<string, number>;
  windowDays: number;
}

export type Range = 'Week' | 'Month' | 'Year' | 'All';
