import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api, flushQueue, getToken, setToken, clearToken, ApiError } from './api';
import { OfflineQueuedError, cacheState, readCachedState, clearCache, pending as pendingOps, subscribe as subscribeOffline, isOnline } from './lib/offline';
import { setCurrency } from './lib/format';
import type { AppState, Range } from './types';

export type Screen =
  | 'welcome'
  | 'signin'
  | 'forgot'
  | 'reset'
  | 'home'
  | 'workouts'
  | 'habits'
  | 'sleep'
  | 'finances'
  | 'analytics'
  | 'settings'
  | 'counters'
  | 'achievements'
  | 'faddtx'
  | 'ftxns'
  | 'faccounts'
  | 'fcats'
  | 'fbudgets'
  | 'fgoals'
  | 'frecurring'
  | 'finsights'
  | 'feedbackInbox'
  | 'privacy'
  | 'insights'
  | 'search'
  | 'verify';

export type SheetKind =
  | 'chooser'
  | 'workout'
  | 'sleep'
  | 'expense'
  | 'habit'
  | 'edit'
  | 'wcats'
  | 'wcat'
  | 'profile'
  | 'counter'
  | 'countlog'
  | 'countpick'
  | 'account'
  | 'fcat'
  | 'budget'
  | 'goal'
  | 'recurring'
  | 'feedback'
  | 'habitcal'
  | 'catchup'
  | null;

interface StoreCtx {
  // session / data
  ready: boolean;
  booting: boolean;
  bootError: boolean;
  retryBoot: () => void;
  authed: boolean;
  state: AppState | null;
  // navigation
  screen: Screen;
  screenData: any;
  sheet: SheetKind;
  sheetData: any;
  range: Range;
  emptyMode: boolean;
  toast: string;
  authMode: 'signup' | 'signin';
  setAuthMode: (m: 'signup' | 'signin') => void;
  // setters
  go: (s: Screen, data?: any) => void;
  open: (s: SheetKind, data?: any) => void;
  closeSheet: () => void;
  setRange: (r: Range) => void;
  setEmptyMode: (b: boolean) => void;
  // Pass `undo` to offer an Undo action in the toast.
  showToast: (msg: string, undo?: () => void) => void;
  toastUndo?: () => void;
  runUndo: () => void;
  // auth
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  googleAuth: (credential: string) => Promise<void>;
  resetPassword: (resetToken: string, password: string) => Promise<void>;
  signOut: () => void;
  // data mutation: pass a function returning the new AppState from the API
  mutate: (fn: () => Promise<AppState>, toast?: string) => Promise<void>;
  // Optimistic mutation: apply a predicted state instantly, then reconcile with
  // the server. Rapid successive calls are ordered so a slow earlier response
  // can't clobber a newer one (fixes fast-tap flicker on habit check-offs and
  // makes theme/currency switches feel instant).
  mutateOpt: (
    optimistic: (s: AppState) => AppState,
    fn: () => Promise<AppState>,
    toast?: string
  ) => Promise<void>;
  applyState: (s: AppState) => void;
  // Achievement badges the user has "claimed" (revealed). Stored on the account
  // so reveals follow the user across devices and reinstalls.
  claimedBadges: string[];
  claimBadge: (id: string) => void;
  // Offline logging: how many writes are waiting, and whether we have a link.
  pendingCount: number;
  online: boolean;
  sync: () => Promise<void>;
  // Reusable confirmation dialog. Resolves true if the user confirms.
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  confirmState: (ConfirmOpts & { resolve: (v: boolean) => void }) | null;
  closeConfirm: (v: boolean) => void;
  // Password re-entry, for actions too destructive to take on a tap alone.
  askPassword: (opts: PasswordOpts) => Promise<string | null>;
  passwordState: (PasswordOpts & { resolve: (v: string | null) => void }) | null;
  closePassword: (v: string | null) => void;
  // Full-screen story report; offset 0 = current period, 1 = previous, …
  report: { kind: 'week' | 'month' | 'year'; offset: number } | null;
  openReport: (k: 'week' | 'month' | 'year', offset?: number) => void;
  closeReport: () => void;
  // fire device vibration when the user has haptics enabled (no-op otherwise)
  haptic: (pattern?: number | number[]) => void;
}

const CLAIMED_KEY = 'orbit_claimed_badges';

export interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

export interface PasswordOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
}

const Ctx = createContext<StoreCtx | null>(null);

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}

// If the user arrived via a password-reset email link (/reset?token=…), grab it.
const initialResetToken =
  typeof window !== 'undefined' && window.location.pathname === '/reset'
    ? new URLSearchParams(window.location.search).get('token')
    : null;

// Same for the email-confirmation link (/verify?token=…).
const initialVerifyToken =
  typeof window !== 'undefined' && window.location.pathname === '/verify'
    ? new URLSearchParams(window.location.search).get('token')
    : null;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<AppState | null>(null);
  const [screen, setScreen] = useState<Screen>(
    initialResetToken ? 'reset' : initialVerifyToken ? 'verify' : 'welcome'
  );
  const [screenData, setScreenData] = useState<any>(
    initialResetToken ? { token: initialResetToken } : initialVerifyToken ? { token: initialVerifyToken } : null
  );
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [sheetData, setSheetData] = useState<any>(null);
  const [range, setRangeState] = useState<Range>('Week');
  const [emptyMode, setEmptyMode] = useState(false);
  const [toast, setToast] = useState('');
  const [toastUndo, setToastUndo] = useState<(() => void) | undefined>(undefined);
  const toastUndoRef = useRef<(() => void) | undefined>(undefined);
  toastUndoRef.current = toastUndo;
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [booting, setBooting] = useState<boolean>(!initialResetToken && !initialVerifyToken && !!getToken());
  const [bootError, setBootError] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  // Latest committed state (for optimistic rollback) and a monotonic counter so
  // out-of-order server responses from rapid mutations don't overwrite newer UI.
  const stateRef = useRef<AppState | null>(null);
  const seqRef = useRef(0);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const authed = !!state;

  const showToast = useCallback((msg: string, undo?: () => void) => {
    setToast(msg);
    setToastUndo(() => undo);
    clearTimeout(toastTimer.current);
    // Undo toasts linger a little so there's time to hit them.
    toastTimer.current = setTimeout(
      () => {
        setToast('');
        setToastUndo(undefined);
      },
      undo ? 5000 : 2200
    );
  }, []);

  const runUndo = useCallback(() => {
    const fn = toastUndoRef.current;
    setToast('');
    setToastUndo(undefined);
    clearTimeout(toastTimer.current);
    fn?.();
  }, []);

  // Restore session on first load — and keep retrying while the (free) server
  // wakes up, instead of dropping a logged-in user back to the welcome screen.
  const restore = useCallback(async () => {
    // Password-reset link takes priority — show that screen, don't auto-load.
    if (initialResetToken) {
      setBooting(false);
      setReady(true);
      return;
    }
    const token = getToken();
    if (!token) {
      setBooting(false);
      setReady(true);
      return;
    }
    setBooting(true);
    setBootError(false);
    // No network at all: open straight from the cached state instead of
    // retrying for over a minute and then blaming the server.
    const cached = readCachedState();
    if (cached && !isOnline()) {
      setState(cached);
      setScreen('home');
      setBooting(false);
      setReady(true);
      return;
    }
    const delays = [800, 1500, 2500, 4000, 6000, 8000, 8000, 10000, 10000, 12000, 12000];
    for (let i = 0; i <= delays.length; i++) {
      try {
        const s = await api.getState();
        setState(s);
        cacheState(s);
        setScreen('home');
        setBooting(false);
        setReady(true);
        return;
      } catch (e) {
        // Only an explicit "bad token" logs the user out; everything else
        // (server waking up, network blip) is retried.
        if (e instanceof ApiError && e.status === 401) {
          clearToken();
          setBooting(false);
          setReady(true);
          return;
        }
        if (i < delays.length) await new Promise((r) => setTimeout(r, delays[i]));
      }
    }
    // Server still unreachable. A cached state beats a dead end: let the user
    // in and keep logging, and sync whenever the connection returns.
    const fallback = readCachedState();
    if (fallback) {
      setState(fallback);
      setScreen('home');
      setBooting(false);
      setReady(true);
      return;
    }
    setBootError(true);
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  const applyState = useCallback((s: AppState) => {
    setState(s);
    cacheState(s);
  }, []);

  const [report, setReport] = useState<{ kind: 'week' | 'month' | 'year'; offset: number } | null>(null);
  const openReport = useCallback((kind: 'week' | 'month' | 'year', offset = 0) => setReport({ kind, offset }), []);
  const closeReport = useCallback(() => setReport(null), []);

  const [confirmState, setConfirmState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    []
  );
  const [passwordState, setPasswordState] = useState<(PasswordOpts & { resolve: (v: string | null) => void }) | null>(null);
  const askPassword = useCallback(
    (opts: PasswordOpts) => new Promise<string | null>((resolve) => setPasswordState({ ...opts, resolve })),
    []
  );
  const closePassword = useCallback((v: string | null) => {
    setPasswordState((cur) => {
      cur?.resolve(v);
      return null;
    });
  }, []);

  const closeConfirm = useCallback((v: boolean) => {
    setConfirmState((cur) => {
      cur?.resolve(v);
      return null;
    });
  }, []);

  // Claimed badges live on the account. Reveal instantly, persist in the
  // background, and migrate anything claimed before this synced (localStorage).
  const claimedBadges = state?.profile.claimedBadges ?? [];
  const claimBadge = useCallback(
    (id: string) => {
      const cur = stateRef.current?.profile.claimedBadges ?? [];
      if (cur.includes(id)) return;
      const next = [...cur, id];
      setState((s) => (s ? { ...s, profile: { ...s.profile, claimedBadges: next } } : s));
      api.updateMe({ claimedBadges: next }).catch(() => {});
    },
    []
  );

  // One-time migration: fold any locally-claimed badges into the account.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current || !state) return;
    migratedRef.current = true;
    let local: string[] = [];
    try {
      local = JSON.parse(localStorage.getItem(CLAIMED_KEY) || '[]');
    } catch {
      /* ignore */
    }
    if (!Array.isArray(local) || !local.length) return;
    const merged = Array.from(new Set([...(state.profile.claimedBadges || []), ...local]));
    if (merged.length === (state.profile.claimedBadges || []).length) return;
    setState((s) => (s ? { ...s, profile: { ...s.profile, claimedBadges: merged } } : s));
    api.updateMe({ claimedBadges: merged }).catch(() => {});
    try {
      localStorage.removeItem(CLAIMED_KEY);
    } catch {
      /* ignore */
    }
  }, [state]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, state: s } = await api.login(email, password);
    setToken(token);
    setState(s);
    setScreen('home');
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    const { token, state: s } = await api.signup(email, password, name);
    setToken(token);
    setState(s);
    setScreen('home');
  }, []);

  const googleAuth = useCallback(async (credential: string) => {
    const { token, state: s } = await api.google(credential);
    setToken(token);
    setState(s);
    setScreen('home');
  }, []);

  const resetPassword = useCallback(async (resetToken: string, password: string) => {
    const { token, state: s } = await api.resetPassword(resetToken, password);
    setToken(token);
    setState(s);
    setScreen('home');
    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/');
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    // Never leave one account's cached data (or unsent writes) on a device
    // where someone else might sign in next.
    clearCache();
    setState(null);
    setSheet(null);
    setScreen('welcome');
    setEmptyMode(false);
    setRangeState('Week');
  }, []);

  // ---- Offline sync ----
  // `pendingCount` drives the status pill; `syncing` stops overlapping flushes.
  const [pendingCount, setPendingCount] = useState<number>(() => pendingOps());
  const [online, setOnline] = useState<boolean>(() => isOnline());
  const syncing = useRef(false);

  useEffect(() => subscribeOffline(() => setPendingCount(pendingOps())), []);

  const sync = useCallback(async () => {
    if (syncing.current || !getToken() || pendingOps() === 0) return;
    syncing.current = true;
    try {
      const r = await flushQueue();
      if (r.state) {
        setState(r.state);
        cacheState(r.state);
      }
      if (r.synced > 0) {
        showToast(r.failed ? `Synced ${r.synced} · ${r.failed} couldn't be saved` : `Synced ${r.synced} ${r.synced === 1 ? 'entry' : 'entries'}`);
      }
    } catch {
      /* still unreachable — the queue keeps everything for the next attempt */
    } finally {
      syncing.current = false;
      setPendingCount(pendingOps());
    }
  }, [showToast]);

  // Flush on every signal that the connection may be usable again.
  //
  // `online` alone isn't enough: it fires when a link is regained, not when it
  // starts working, and it often doesn't fire at all for a phone waking in your
  // pocket. Coming back to the app is the strongest hint there is — and the
  // interval below can't cover it, because WebView timers are throttled while
  // the app is backgrounded. Without the resume hook, reopening the app can sit
  // on a full queue for half a minute.
  useEffect(() => {
    const up = () => {
      setOnline(true);
      sync();
    };
    const down = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setOnline(isOnline());
        sync();
      }
    };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    document.addEventListener('visibilitychange', onVisible);

    // Native resume. The web `visibilitychange` above covers browsers; this
    // covers the Android app, where it is the reliable signal.
    let removeNative: (() => void) | undefined;
    import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            setOnline(isOnline());
            sync();
          }
        })
      )
      .then((h) => {
        removeNative = () => h.remove();
      })
      .catch(() => {
        /* not running natively — the web listeners are enough */
      });

    const iv = setInterval(() => isOnline() && sync(), 30_000);
    sync();
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      document.removeEventListener('visibilitychange', onVisible);
      removeNative?.();
      clearInterval(iv);
    };
  }, [sync]);

  const mutate = useCallback(
    async (fn: () => Promise<AppState>, toastMsg?: string) => {
      try {
        const s = await fn();
        setState(s);
        // Keep the offline cache current on every accepted write, or reopening
        // without a network would show a stale snapshot.
        cacheState(s);
        if (toastMsg) showToast(toastMsg);
      } catch (e) {
        // A queued op isn't a failure — it's a deferred success. There's no
        // optimistic state here, so say plainly that it will appear on sync.
        if (e instanceof OfflineQueuedError) {
          showToast('Saved offline — syncing when you reconnect');
          throw e;
        }
        showToast(e instanceof Error ? e.message : 'Something went wrong');
        throw e;
      }
    },
    [showToast]
  );

  const mutateOpt = useCallback(
    async (
      optimistic: (s: AppState) => AppState,
      fn: () => Promise<AppState>,
      toastMsg?: string
    ) => {
      const mySeq = ++seqRef.current;
      const prev = stateRef.current;
      // Apply the predicted state immediately for instant feedback.
      setState((cur) => (cur ? optimistic(cur) : cur));
      try {
        const s = await fn();
        // Reconcile with the server only if we're still the latest mutation.
        setState((cur) => (seqRef.current === mySeq ? s : cur));
        cacheState(s);
        if (toastMsg) showToast(toastMsg);
      } catch (e) {
        // Queued offline: the prediction is what the server will eventually
        // agree with, so keep it on screen and persist it. Rolling back here
        // would make a successful offline log look like it vanished.
        if (e instanceof OfflineQueuedError) {
          setState((cur) => {
            if (cur) cacheState(cur);
            return cur;
          });
          showToast(toastMsg ? `${toastMsg} · offline` : 'Saved offline');
          throw e;
        }
        // Roll back to the pre-mutation state, unless something newer supersedes.
        setState((cur) => (seqRef.current === mySeq ? prev : cur));
        showToast(e instanceof Error ? e.message : 'Something went wrong');
        throw e;
      }
    },
    [showToast]
  );

  const haptic = useCallback(
    (pattern: number | number[] = 12) => {
      if (state?.profile.haptics && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    },
    [state]
  );

  const go = useCallback((s: Screen, data: any = null) => {
    setScreenData(data);
    setScreen(s);
    setSheet(null);
  }, []);
  const open = useCallback((s: SheetKind, data: any = null) => {
    setSheetData(data);
    setSheet(s);
  }, []);
  const closeSheet = useCallback(() => setSheet(null), []);
  const setRange = useCallback((r: Range) => setRangeState(r), []);

  const value: StoreCtx = {
    ready,
    booting,
    bootError,
    retryBoot: restore,
    authed,
    state,
    screen,
    screenData,
    sheet,
    sheetData,
    range,
    emptyMode,
    toast,
    authMode,
    setAuthMode,
    go,
    open,
    closeSheet,
    setRange,
    setEmptyMode,
    showToast,
    toastUndo,
    runUndo,
    login,
    signup,
    googleAuth,
    resetPassword,
    signOut,
    mutate,
    mutateOpt,
    applyState,
    claimedBadges,
    claimBadge,
    confirm,
    pendingCount,
    online,
    sync,
    confirmState,
    askPassword,
    passwordState,
    closePassword,
    closeConfirm,
    report,
    openReport,
    closeReport,
    haptic,
  };

  // Keep the money formatter in sync with the user's chosen currency.
  setCurrency(state?.profile.currency);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
