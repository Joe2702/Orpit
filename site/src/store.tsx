import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AppState } from '@core/types';
import { dayKey, setCurrency } from '@core/lib/format';
import { accentFor, isHex } from '@core/lib/color';
import { api, ApiError, getToken, setToken, type Auth } from './api';
import { t } from './i18n';

// Everything the website knows, in one place: the account's data, whether
// someone is signed in, the theme, and the toasts and confirmations that
// float above every page.

type Status = 'loading' | 'in' | 'out' | 'error';
export type ThemePref = 'light' | 'dark' | 'system';

interface Toast {
  id: number;
  text: string;
  bad?: boolean;
  action?: { label: string; run: () => void };
}
interface ConfirmOpts {
  title: string;
  message?: string;
  confirm?: string;
  danger?: boolean;
}

interface Ctx {
  status: Status;
  state: AppState | null;
  retry: () => void;
  signedIn: (a: Auth) => void;
  signOut: () => void;
  /**
   * Show the change at once, send it, then show what the server says. If it
   * fails the page goes back to how it was and says why.
   */
  mutate: (optimistic: ((s: AppState) => AppState) | null, call: () => Promise<AppState>, done?: string) => Promise<boolean>;
  replace: (s: AppState) => void;
  toast: (text: string, opts?: { bad?: boolean; action?: Toast['action'] }) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  confirming: (ConfirmOpts & { resolve: (v: boolean) => void }) | null;
  theme: 'light' | 'dark';
}

const StoreCtx = createContext<Ctx | null>(null);

export const useStore = (): Ctx => {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
};
/** For pages behind sign-in, where the data is always there. */
export const useData = (): AppState => useStore().state as AppState;

// The colours a person can pick on the phone, for light and dark pages.
const PRESETS: Record<string, [string, string]> = {
  indigo: ['#4f46e5', '#8b93ff'],
  coral: ['#d9654e', '#ea8a76'],
  teal: ['#1f9d8c', '#4cc2b2'],
  blue: ['#3b72e0', '#6f9dff'],
  emerald: ['#23926a', '#4dbb8f'],
  purple: ['#7c55d6', '#ab92f5'],
  pink: ['#c9488a', '#e57fb4'],
  amber: ['#c98420', '#e5a94e'],
  cyan: ['#1a8fab', '#56bfd8'],
  rose: ['#cf4a5f', '#f07b8c'],
};
export const PRESET_NAMES = Object.keys(PRESETS);
export const presetHex = (name: string, theme: 'light' | 'dark') => (PRESETS[name] || PRESETS.indigo)[theme === 'dark' ? 1 : 0];

const THEME_KEY = 'orbit_site_theme';
const sysDark = () => typeof matchMedia !== 'undefined' && !matchMedia('(prefers-color-scheme: light)').matches;

function applyLook(pref: ThemePref, accent: string): 'light' | 'dark' {
  const theme = pref === 'system' ? (sysDark() ? 'dark' : 'light') : pref;
  const root = document.documentElement;
  root.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* fine */
  }
  const base = isHex(accent) ? accent : presetHex(accent || 'indigo', theme);
  const a = accentFor(base, theme);
  root.style.setProperty('--accent', a.accent);
  root.style.setProperty('--accent-ink', a.onAccent);
  return theme;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>(getToken() ? 'loading' : 'out');
  const [state, setState] = useState<AppState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirming, setConfirming] = useState<Ctx['confirming']>(null);
  const [sysTick, setSysTick] = useState(0);
  const seq = useRef(0);
  // Saves in flight, and whether any of them overlapped. Each answer is the
  // whole account as the server had it at that moment, so when two saves
  // cross, neither answer can be trusted to hold both changes: once the last
  // one is back, the account is fetched again (see settle below).
  const inFlight = useRef(0);
  const crossed = useRef(false);
  const live = useRef<AppState | null>(null);
  live.current = state;

  const toast = useCallback((text: string, opts: { bad?: boolean; action?: Toast['action'] } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur.slice(-2), { id, text, ...opts }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), opts.action ? 6500 : 3800);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((cur) => cur.filter((x) => x.id !== id)), []);

  const load = useCallback(async () => {
    if (!getToken()) {
      setStatus('out');
      return;
    }
    setStatus((s) => (s === 'in' ? s : 'loading'));
    try {
      const s = await api.state();
      setState(s);
      setStatus('in');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setToken(null);
        setState(null);
        setStatus('out');
      } else setStatus((s) => (s === 'in' ? s : 'error'));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // A visit, for the active-people numbers (see /admin): one when Orpit opens,
  // and one when someone comes back to the tab after half an hour away. The
  // server drops it for anyone who has turned usage counts off.
  useEffect(() => {
    if (status !== 'in') return;
    const count = () => api.countOpen(dayKey()).catch(() => {});
    void count();
    let hiddenAt = 0;
    const on = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30 * 60_000) void count();
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [status]);

  // Come back to the tab after a while: fetch what the phone logged meanwhile.
  useEffect(() => {
    let hiddenAt = 0;
    const on = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30_000 && getToken()) load();
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [load]);

  const pref: ThemePref = (state?.profile.theme as ThemePref) || ((): ThemePref => {
    try {
      return (localStorage.getItem(THEME_KEY) as ThemePref) || 'dark';
    } catch {
      return 'dark';
    }
  })();
  const accent = state?.profile.accent || 'indigo';
  const theme = useMemo(() => applyLook(pref, accent), [pref, accent, sysTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const on = () => setSysTick((n) => n + 1);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  useEffect(() => {
    if (state) setCurrency(state.profile.currency);
  }, [state?.profile.currency]); // eslint-disable-line react-hooks/exhaustive-deps

  const settle = useCallback(() => {
    inFlight.current--;
    if (inFlight.current > 0 || !crossed.current) return;
    crossed.current = false;
    const at = seq.current;
    api
      .state()
      .then((s) => {
        // A save started meanwhile has its own answer coming.
        if (seq.current === at && s && Array.isArray(s.txns)) setState(s);
      })
      .catch(() => {});
  }, []);

  const mutate = useCallback<Ctx['mutate']>(
    async (optimistic, call, done) => {
      const mine = ++seq.current;
      const before = live.current;
      if (++inFlight.current > 1) crossed.current = true;
      if (optimistic) setState((cur) => (cur ? optimistic(cur) : cur));
      try {
        const next = await call();
        if (seq.current === mine && next && Array.isArray((next as AppState).txns)) setState(next);
        if (done) toast(done);
        settle();
        return true;
      } catch (e) {
        // Alone, undo what was shown. Crossed with another save, the state
        // before this one may already be out of date: the fetch once they're
        // all back puts the screen right instead.
        if (seq.current === mine && optimistic && !crossed.current) setState(before);
        settle();
        const msg = e instanceof ApiError && e.status === 0 ? t('You’re offline. Nothing was saved.') : e instanceof Error ? e.message : t('That didn’t save.');
        toast(msg, { bad: true });
        if (e instanceof ApiError && e.status === 401) {
          setToken(null);
          setStatus('out');
        }
        return false;
      }
    },
    [toast, settle]
  );

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirming({ ...o, resolve })), []);

  const value: Ctx = {
    status,
    state,
    retry: load,
    signedIn: (a) => {
      setToken(a.token);
      setState(a.state);
      setStatus('in');
    },
    signOut: () => {
      setToken(null);
      setState(null);
      setStatus('out');
    },
    mutate,
    replace: setState,
    toast,
    toasts,
    dismiss,
    confirm,
    confirming: confirming && {
      ...confirming,
      resolve: (v: boolean) => {
        confirming.resolve(v);
        setConfirming(null);
      },
    },
    theme,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
