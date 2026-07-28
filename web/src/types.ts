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

export interface Workout {
  id: string;
  name: string;
  catId: string | null;
  dur: number;
  dist: string | null;
  kcal: number | null;
  intensity: string | null;
  note: string | null;
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
  note: string | null;
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
}

export type Range = 'Week' | 'Month' | 'Year' | 'All';
