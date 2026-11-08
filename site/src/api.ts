// The website talks to the same server as the phone app, with the same sign-in
// token, so someone already signed in on this browser stays signed in.

import type { AppState, WorkoutSet } from '@core/types';
import { getLang } from './i18n';

const TOKEN = 'orbit_token';
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN);
  } catch {
    return null;
  }
};
export const setToken = (v: string | null) => {
  try {
    if (v) localStorage.setItem(TOKEN, v);
    else localStorage.removeItem(TOKEN);
  } catch {
    /* private window */
  }
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T = AppState>(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Orbit-Lang': getLang(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `HTTP ${res.status}`);
  return data as T;
}

export interface Auth {
  token: string;
  state: AppState;
}
type Id = string;
export type HabitBody = { name: string; color: string; target: string; days: string; why?: string | null; cue?: string | null; reminderTime?: string | null; paused?: boolean; archived?: boolean };
export type TxnBody = { name: string; cat: string; amount: number; income: boolean; refund?: boolean; accId?: string | null; toAccId?: string | null; adjust?: boolean; note?: string | null; ts?: number };

export const api = {
  // Session
  login: (email: string, password: string) => req<Auth>('/auth/login', 'POST', { email, password }),
  signup: (email: string, password: string, name: string) => req<Auth>('/auth/signup', 'POST', { email, password, name }),
  google: (credential: string) => req<Auth>('/auth/google', 'POST', { credential }),
  requestReset: (email: string) => req<{ ok: boolean }>('/auth/request-reset', 'POST', { email }),
  resetPassword: (token: string, password: string) => req<Auth>('/auth/reset-password', 'POST', { token, password }),
  confirmEmail: (token: string) => req<{ ok: boolean }>('/verify/confirm', 'POST', { token }),
  sendVerify: () => req<{ ok: boolean; already?: boolean }>('/verify/send', 'POST'),
  state: () => req('/state'),
  exportAll: () => req<Record<string, unknown>>('/export'),
  importData: (data: unknown) => req<{ added: number; state: AppState }>('/import', 'POST', { data }),

  // Profile
  updateMe: (patch: Partial<AppState['profile']>) => req('/me', 'PATCH', patch),
  changePassword: (current: string, next: string) => req<{ ok: boolean }>('/me/password', 'POST', { current, next }),
  signOutOthers: () => req<{ token: string }>('/me/signout-others', 'POST'),
  deleteMe: (password: string) => req<{ ok: boolean }>('/me', 'DELETE', { password }),

  // Habits
  addHabit: (b: HabitBody) => req('/habits', 'POST', b),
  editHabit: (id: Id, b: HabitBody) => req(`/habits/${id}`, 'PATCH', b),
  deleteHabit: (id: Id) => req(`/habits/${id}`, 'DELETE'),
  orderHabits: (ids: Id[]) => req('/habits/order', 'PATCH', { ids }),
  toggleHabit: (id: Id, day: string) => req(`/habits/${id}/toggle`, 'POST', { day }),

  // Training and sleep
  addWorkout: (b: { catId: string; dur: number; dist?: string | null; kcal?: number | null; intensity?: string | null; note?: string | null; sets?: WorkoutSet[] | null; ts?: number }) => req('/workouts', 'POST', b),
  editWorkout: (id: Id, b: { catId: string; dur: number; dist?: string | null; kcal?: number | null; sets?: WorkoutSet[] | null; ts?: number }) => req(`/workouts/${id}`, 'PATCH', b),
  deleteWorkout: (id: Id) => req(`/workouts/${id}`, 'DELETE'),
  addWCat: (b: { name: string; color: string }) => req('/categories', 'POST', b),
  editWCat: (id: Id, b: { name: string; color: string }) => req(`/categories/${id}`, 'PATCH', b),
  deleteWCat: (id: Id) => req(`/categories/${id}`, 'DELETE'),
  addNight: (b: { hours: number; quality: number; bedH: number | null; wakeH: number | null; note?: string | null; ts?: number }) => req('/nights', 'POST', b),
  deleteNight: (id: Id) => req(`/nights/${id}`, 'DELETE'),

  // Money
  addTxn: (b: TxnBody) => req('/txns', 'POST', b),
  editTxn: (id: Id, b: TxnBody) => req(`/txns/${id}`, 'PATCH', b),
  deleteTxn: (id: Id) => req(`/txns/${id}`, 'DELETE'),
  deleteTxns: (ids: Id[]) => req('/txns/delete', 'POST', { ids }),
  markReviewed: (ids: Id[]) => req('/txns/reviewed', 'POST', { ids }),
  recategorise: (ids: Id[], cat: string) => req('/txns/recat', 'POST', { ids, cat }),
  answerSame: (id: Id, same: boolean) => req(`/txns/${id}/same`, 'POST', { same }),
  addAccount: (b: { name: string; type: string; color: string; opening: number }) => req('/accounts', 'POST', b),
  editAccount: (id: Id, b: { name: string; type: string; color: string; opening: number; balanceNow?: number }) => req(`/accounts/${id}`, 'PATCH', b),
  deleteAccount: (id: Id) => req(`/accounts/${id}`, 'DELETE'),
  addFcat: (b: { name: string; icon: string; color: string; kind: string }) => req('/fcats', 'POST', b),
  editFcat: (id: Id, b: { name: string; icon: string; color: string; kind: string }) => req(`/fcats/${id}`, 'PATCH', b),
  deleteFcat: (id: Id) => req(`/fcats/${id}`, 'DELETE'),
  addBudget: (b: { cat: string; limit: number; rollover?: boolean }) => req('/budgets', 'POST', b),
  editBudget: (id: Id, b: { cat: string; limit: number; rollover?: boolean }) => req(`/budgets/${id}`, 'PATCH', b),
  deleteBudget: (id: Id) => req(`/budgets/${id}`, 'DELETE'),
  addGoal: (b: { name: string; target: number; current: number; color: string; dueTs: number | null; accId?: string | null }) => req('/goals', 'POST', b),
  editGoal: (id: Id, b: { name: string; target: number; current: number; color: string; dueTs: number | null; accId?: string | null }) => req(`/goals/${id}`, 'PATCH', b),
  deleteGoal: (id: Id) => req(`/goals/${id}`, 'DELETE'),
  addBill: (b: { name: string; cat: string; accId: string | null; amount: number; freq: string; income?: boolean; nextTs?: number | null }) => req('/recurring', 'POST', b),
  editBill: (id: Id, b: { name: string; cat: string; accId: string | null; amount: number; freq: string; income?: boolean }) => req(`/recurring/${id}`, 'PATCH', b),
  deleteBill: (id: Id) => req(`/recurring/${id}`, 'DELETE'),

  // Counters
  addCounter: (b: { name: string; unit: string; color: string; icon: string; step: number }) => req('/counters', 'POST', b),
  editCounter: (id: Id, b: { name: string; unit: string; color: string; icon: string; step: number }) => req(`/counters/${id}`, 'PATCH', b),
  deleteCounter: (id: Id) => req(`/counters/${id}`, 'DELETE'),
  logCounter: (id: Id, amount: number, ts: number) => req(`/counters/${id}/log`, 'POST', { amount, ts }),

  // Tasks
  addList: (b: { name: string; color: string; icon: string }) => req('/todo-lists', 'POST', b),
  editList: (id: Id, b: { name: string; color: string; icon: string }) => req(`/todo-lists/${id}`, 'PATCH', b),
  deleteList: (id: Id) => req(`/todo-lists/${id}`, 'DELETE'),
  clearDone: (listId: Id) => req(`/todo-lists/${listId}/done`, 'DELETE'),
  addTodo: (b: { listId: string; title: string; note?: string | null; due?: string | null }) => req('/todos', 'POST', b),
  editTodo: (id: Id, b: { title?: string; note?: string | null; due?: string | null; listId?: string }) => req(`/todos/${id}`, 'PATCH', b),
  setTodoDone: (id: Id, done: boolean) => req(`/todos/${id}/done`, 'POST', { done }),
  deleteTodo: (id: Id) => req(`/todos/${id}`, 'DELETE'),
};
