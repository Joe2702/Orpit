import type { AppState, WorkoutSet } from './types';
import { enqueue, flush, isQueueable, newOpId, noteReachable, OfflineQueuedError, type QueuedOp } from './lib/offline';

// On the web the frontend is served by the same server as the API, so a
// relative path works. Inside a native (Capacitor) build the app runs from a
// local origin on the device, so it needs the absolute backend URL, supplied
// at build time via VITE_API_BASE (e.g. https://orbit.onrender.com).
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const TOKEN_KEY = 'orbit_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}, opId?: string): Promise<T> {
  const token = getToken();
  const method = (opts.method || 'GET').toUpperCase();
  // Loggable mutations carry a stable id so the server can recognise a replay.
  // It's generated up front, not at queue time, so an op whose *response* was
  // lost replays under the same key it originally used.
  const id = opId || (isQueueable(path, method) ? newOpId() : undefined);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(id ? { 'x-orbit-op-id': id } : {}),
        ...(opts.headers || {}),
      },
    });
  } catch (netErr) {
    // fetch only rejects on a network-level failure — exactly the case worth
    // deferring. Anything the server answered, even an error, is not queued.
    // This is also the most reliable connectivity signal there is.
    noteReachable(false);
    if (id && !opId) {
      enqueue({ id, path, method, body: typeof opts.body === 'string' ? opts.body : undefined, at: Date.now() });
      throw new OfflineQueuedError();
    }
    throw netErr;
  }

  noteReachable(true); // the server answered, whatever it said
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface AuthResp {
  token: string;
  state: AppState;
}

export interface HabitBody {
  name: string;
  color: string;
  target: string;
  days: string;
  why?: string | null;
  reminderTime?: string | null;
  paused?: boolean;
  archived?: boolean;
}

export interface ClientErrorItem {
  id: string;
  message: string;
  stack: string;
  build: string;
  platform: string;
  createdAt: number;
  email: string;
}

export interface FeedbackItem {
  id: string;
  kind: string;
  message: string;
  createdAt: number;
  name: string;
  email: string;
}

/**
 * Replay everything the offline queue is holding. Each op goes out under its
 * original id, so the server treats a second delivery of an already-applied
 * write as a no-op.
 */
export const flushQueue = () =>
  flush((op: QueuedOp) =>
    request<AppState>(op.path, { method: op.method, body: op.body }, op.id)
  );

export const api = {
  signup: (email: string, password: string, name: string) =>
    request<AuthResp>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<AuthResp>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  google: (credential: string) =>
    request<AuthResp>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    }),
  requestReset: (email: string) =>
    request<{ ok: boolean }>('/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<AuthResp>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  getState: () => request<AppState>('/state'),
  /**
   * Complete history, not the windowed state bundle. Used only by "export my
   * data" — the one place that must never be truncated, since users are told to
   * export before deleting their account.
   */
  exportAll: () => request<Record<string, unknown>>('/export'),

  updateMe: (
    patch: Partial<
      Pick<
        AppState['profile'],
        | 'name'
        | 'email'
        | 'theme'
        | 'reminders'
        | 'haptics'
        | 'currency'
        | 'avatar'
        | 'layout'
        | 'reminderTime'
        | 'reminderTz'
        | 'claimedBadges'
        | 'introDone'
        | 'accent'
        | 'modules'
        | 'textScale'
        | 'windDown'
      >
    >
  ) => request<AppState>('/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  pushKey: () => request<{ key: string }>('/push/key'),
  pushSubscribe: (sub: unknown) =>
    request<{ ok: boolean }>('/push/subscribe', { method: 'POST', body: JSON.stringify({ sub }) }),
  pushTest: () => request<{ ok: boolean; sent: number }>('/push/test', { method: 'POST' }),
  pushUnsubscribeAll: () => request<{ ok: boolean }>('/push/unsubscribe-all', { method: 'POST' }),
  adminFeedback: (password: string) =>
    request<{ items: FeedbackItem[] }>('/admin/feedback', { headers: { 'x-admin-password': password } }),

  addHabit: (b: HabitBody) => request<AppState>('/habits', { method: 'POST', body: JSON.stringify(b) }),
  editHabit: (id: string, b: HabitBody) =>
    request<AppState>(`/habits/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  sendFeedback: (kind: string, message: string) =>
    request<{ ok: boolean }>('/feedback', { method: 'POST', body: JSON.stringify({ kind, message }) }),
  deleteHabit: (id: string) => request<AppState>(`/habits/${id}`, { method: 'DELETE' }),
  reorderHabits: (ids: string[]) =>
    request<AppState>('/habits/order', { method: 'PATCH', body: JSON.stringify({ ids }) }),
  /**
   * `day` is required, and deliberately so. It used to be optional; the one
   * call site that omitted it fell through to the server's UTC clock, which
   * filed check-ins under the wrong date east of UTC after midnight and under
   * the *sync* date for anything queued offline. Making it mandatory means the
   * compiler catches the next omission.
   */
  toggleHabit: (id: string, day: string) =>
    request<AppState>(`/habits/${id}/toggle`, { method: 'POST', body: JSON.stringify({ day }) }),

  addCategory: (b: { name: string; color: string }) =>
    request<AppState>('/categories', { method: 'POST', body: JSON.stringify(b) }),
  editCategory: (id: string, b: { name: string; color: string }) =>
    request<AppState>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteCategory: (id: string) => request<AppState>(`/categories/${id}`, { method: 'DELETE' }),

  addWorkout: (b: {
    catId: string;
    dur: number;
    dist?: string | null;
    kcal?: number | null;
    intensity?: string | null;
    note?: string | null;
    sets?: WorkoutSet[] | null;
    ts?: number;
  }) => request<AppState>('/workouts', { method: 'POST', body: JSON.stringify(b) }),
  editWorkout: (
    id: string,
    // Omit `sets` entirely to leave an existing set list untouched.
    b: { dur: number; catId: string; dist?: string | null; kcal?: number | null; sets?: WorkoutSet[] | null }
  ) => request<AppState>(`/workouts/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteWorkout: (id: string) => request<AppState>(`/workouts/${id}`, { method: 'DELETE' }),

  addNight: (b: { hours: number; quality: number; bedH: number | null; wakeH: number | null; note?: string | null; ts?: number }) =>
    request<AppState>('/nights', { method: 'POST', body: JSON.stringify(b) }),
  deleteNight: (id: string) => request<AppState>(`/nights/${id}`, { method: 'DELETE' }),

  addTxn: (b: {
    name?: string;
    cat: string;
    amount: number;
    income: boolean;
    accId?: string | null;
    /** Set to make this a transfer into that account. */
    toAccId?: string | null;
    note?: string | null;
    // A data URL attaches a receipt; null clears one; omit to leave it alone.
    photo?: string | null;
    ts?: number;
  }) => request<AppState>('/txns', { method: 'POST', body: JSON.stringify(b) }),
  editTxn: (
    id: string,
    b: { name?: string; cat: string; amount: number; income: boolean; accId?: string | null; toAccId?: string | null; note?: string | null; photo?: string | null; ts?: number }
  ) => request<AppState>(`/txns/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteTxn: (id: string) => request<AppState>(`/txns/${id}`, { method: 'DELETE' }),
  /** Fetch a receipt on demand — images are never part of the state bundle. */
  txnPhoto: (id: string) => request<{ photo: string }>(`/txns/${id}/photo`),
  setTxnPhoto: (id: string, photo: string | null) =>
    request<AppState>(`/txns/${id}/photo`, { method: 'PUT', body: JSON.stringify({ photo }) }),

  sendVerifyEmail: () => request<{ ok: boolean; already?: boolean }>('/verify/send', { method: 'POST' }),
  confirmEmail: (token: string) =>
    request<{ ok: boolean }>('/verify/confirm', { method: 'POST', body: JSON.stringify({ token }) }),

  addAccount: (b: { name: string; type: string; color: string; opening: number }) =>
    request<AppState>('/accounts', { method: 'POST', body: JSON.stringify(b) }),
  editAccount: (id: string, b: { name: string; type: string; color: string; opening: number }) =>
    request<AppState>(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteAccount: (id: string) => request<AppState>(`/accounts/${id}`, { method: 'DELETE' }),

  addFcat: (b: { name: string; icon: string; color: string; kind: string }) =>
    request<AppState>('/fcats', { method: 'POST', body: JSON.stringify(b) }),
  editFcat: (id: string, b: { name: string; icon: string; color: string; kind: string }) =>
    request<AppState>(`/fcats/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteFcat: (id: string) => request<AppState>(`/fcats/${id}`, { method: 'DELETE' }),

  addBudget: (b: { cat: string; limit: number; rollover?: boolean }) =>
    request<AppState>('/budgets', { method: 'POST', body: JSON.stringify(b) }),
  editBudget: (id: string, b: { cat: string; limit: number; rollover?: boolean }) =>
    request<AppState>(`/budgets/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteBudget: (id: string) => request<AppState>(`/budgets/${id}`, { method: 'DELETE' }),

  addGoal: (b: { name: string; target: number; current: number; color: string; dueTs: number | null }) =>
    request<AppState>('/goals', { method: 'POST', body: JSON.stringify(b) }),
  editGoal: (id: string, b: { name: string; target: number; current: number; color: string; dueTs: number | null }) =>
    request<AppState>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteGoal: (id: string) => request<AppState>(`/goals/${id}`, { method: 'DELETE' }),

  addRecurring: (b: { name: string; cat: string; accId: string | null; amount: number; freq: string; income?: boolean; nextTs?: number | null }) =>
    request<AppState>('/recurring', { method: 'POST', body: JSON.stringify(b) }),
  editRecurring: (id: string, b: { name: string; cat: string; accId: string | null; amount: number; freq: string; income?: boolean }) =>
    request<AppState>(`/recurring/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteRecurring: (id: string) => request<AppState>(`/recurring/${id}`, { method: 'DELETE' }),

  addCounter: (b: { name: string; unit: string; color: string; icon: string; step: number }) =>
    request<AppState>('/counters', { method: 'POST', body: JSON.stringify(b) }),
  editCounter: (id: string, b: { name: string; unit: string; color: string; icon: string; step: number }) =>
    request<AppState>(`/counters/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteCounter: (id: string) => request<AppState>(`/counters/${id}`, { method: 'DELETE' }),
  // `ts` is required for the same reason as toggleHabit's `day`: without it the
  // server stamps its own clock, so anything logged offline lands on the day it
  // synced rather than the day it happened.
  logCounter: (id: string, amount: number, ts: number) =>
    request<AppState>(`/counters/${id}/log`, { method: 'POST', body: JSON.stringify({ amount, ts }) }),

  reset: () => request<AppState>('/reset', { method: 'POST' }),
  // Workout presets
  addTemplate: (b: { name: string; catId: string | null; dur: number; intensity: string | null }) =>
    request<AppState>('/wtemplates', { method: 'POST', body: JSON.stringify(b) }),
  deleteTemplate: (id: string) => request<AppState>(`/wtemplates/${id}`, { method: 'DELETE' }),
  // Account security
  changePassword: (current: string, next: string) =>
    request<{ ok: boolean }>('/me/password', { method: 'POST', body: JSON.stringify({ current, next }) }),
  signOutOthers: () => request<{ token: string }>('/me/signout-others', { method: 'POST' }),
  // Restore a previously exported file (additive — never deletes)
  importData: (data: unknown) =>
    request<{ added: number; state: AppState }>('/import', { method: 'POST', body: JSON.stringify({ data }) }),
  // Deletes the whole user account (not a finance account — see deleteAccount).
  deleteMyAccount: (password: string) =>
    request<{ ok: boolean }>('/me', { method: 'DELETE', body: JSON.stringify({ password }) }),
  adminErrors: (password: string) =>
    request<{ items: ClientErrorItem[] }>('/admin/errors', { headers: { 'x-admin-password': password } }),
};
