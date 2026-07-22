export type ColorKey = 'indigo' | 'coral' | 'teal' | 'blue' | 'emerald';

export interface Profile {
  name: string;
  email: string;
  theme: 'light' | 'dark';
  reminders: boolean;
  haptics: boolean;
  onboarded: boolean;
  currency: string;
  createdAt: number;
}

export interface Habit {
  id: string;
  name: string;
  color: string;
  target: string;
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
  ts: number;
}

export interface Night {
  id: string;
  hours: number;
  quality: number;
  bedH: number | null;
  wakeH: number | null;
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
  nextTs: number | null;
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
}

export type Range = 'Week' | 'Month' | 'Year' | 'All';
