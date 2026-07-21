import type { AppState } from './types';

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

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
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
  getState: () => request<AppState>('/state'),

  updateMe: (patch: Partial<Pick<AppState['profile'], 'name' | 'email' | 'theme' | 'reminders' | 'haptics'>>) =>
    request<AppState>('/me', { method: 'PATCH', body: JSON.stringify(patch) }),

  addHabit: (b: { name: string; color: string; target: string }) =>
    request<AppState>('/habits', { method: 'POST', body: JSON.stringify(b) }),
  editHabit: (id: string, b: { name: string; color: string; target: string }) =>
    request<AppState>(`/habits/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteHabit: (id: string) => request<AppState>(`/habits/${id}`, { method: 'DELETE' }),
  toggleHabit: (id: string, day?: string) =>
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
  }) => request<AppState>('/workouts', { method: 'POST', body: JSON.stringify(b) }),
  editWorkout: (
    id: string,
    b: { dur: number; catId: string; dist?: string | null; kcal?: number | null }
  ) => request<AppState>(`/workouts/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteWorkout: (id: string) => request<AppState>(`/workouts/${id}`, { method: 'DELETE' }),

  addNight: (b: { hours: number; quality: number; bedH: number | null; wakeH: number | null }) =>
    request<AppState>('/nights', { method: 'POST', body: JSON.stringify(b) }),
  deleteNight: (id: string) => request<AppState>(`/nights/${id}`, { method: 'DELETE' }),

  addTxn: (b: {
    name?: string;
    cat: string;
    amount: number;
    income: boolean;
    accId?: string | null;
    note?: string | null;
    ts?: number;
  }) => request<AppState>('/txns', { method: 'POST', body: JSON.stringify(b) }),
  editTxn: (
    id: string,
    b: { name?: string; cat: string; amount: number; income: boolean; accId?: string | null; note?: string | null; ts?: number }
  ) => request<AppState>(`/txns/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteTxn: (id: string) => request<AppState>(`/txns/${id}`, { method: 'DELETE' }),

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

  addBudget: (b: { cat: string; limit: number }) =>
    request<AppState>('/budgets', { method: 'POST', body: JSON.stringify(b) }),
  editBudget: (id: string, b: { cat: string; limit: number }) =>
    request<AppState>(`/budgets/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteBudget: (id: string) => request<AppState>(`/budgets/${id}`, { method: 'DELETE' }),

  addGoal: (b: { name: string; target: number; current: number; color: string; dueTs: number | null }) =>
    request<AppState>('/goals', { method: 'POST', body: JSON.stringify(b) }),
  editGoal: (id: string, b: { name: string; target: number; current: number; color: string; dueTs: number | null }) =>
    request<AppState>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteGoal: (id: string) => request<AppState>(`/goals/${id}`, { method: 'DELETE' }),

  addRecurring: (b: { name: string; cat: string; accId: string | null; amount: number; freq: string; nextTs?: number | null }) =>
    request<AppState>('/recurring', { method: 'POST', body: JSON.stringify(b) }),
  editRecurring: (id: string, b: { name: string; cat: string; accId: string | null; amount: number; freq: string }) =>
    request<AppState>(`/recurring/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteRecurring: (id: string) => request<AppState>(`/recurring/${id}`, { method: 'DELETE' }),

  addCounter: (b: { name: string; unit: string; color: string; icon: string; step: number }) =>
    request<AppState>('/counters', { method: 'POST', body: JSON.stringify(b) }),
  editCounter: (id: string, b: { name: string; unit: string; color: string; icon: string; step: number }) =>
    request<AppState>(`/counters/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteCounter: (id: string) => request<AppState>(`/counters/${id}`, { method: 'DELETE' }),
  logCounter: (id: string, amount: number) =>
    request<AppState>(`/counters/${id}/log`, { method: 'POST', body: JSON.stringify({ amount }) }),

  reset: () => request<AppState>('/reset', { method: 'POST' }),
};
