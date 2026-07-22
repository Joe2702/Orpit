import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api, getToken, setToken, clearToken, ApiError } from './api';
import { setCurrency } from './lib/format';
import type { AppState, Range } from './types';

export type Screen =
  | 'welcome'
  | 'signin'
  | 'home'
  | 'workouts'
  | 'habits'
  | 'sleep'
  | 'finances'
  | 'analytics'
  | 'settings'
  | 'counters'
  | 'faddtx'
  | 'ftxns'
  | 'faccounts'
  | 'fcats'
  | 'fbudgets'
  | 'fgoals'
  | 'frecurring'
  | 'finsights';

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
  showToast: (msg: string) => void;
  // auth
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => void;
  // data mutation: pass a function returning the new AppState from the API
  mutate: (fn: () => Promise<AppState>, toast?: string) => Promise<void>;
  applyState: (s: AppState) => void;
  // fire device vibration when the user has haptics enabled (no-op otherwise)
  haptic: (pattern?: number | number[]) => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<AppState | null>(null);
  const [screen, setScreen] = useState<Screen>('welcome');
  const [screenData, setScreenData] = useState<any>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [sheetData, setSheetData] = useState<any>(null);
  const [range, setRangeState] = useState<Range>('Week');
  const [emptyMode, setEmptyMode] = useState(false);
  const [toast, setToast] = useState('');
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [booting, setBooting] = useState<boolean>(!!getToken());
  const [bootError, setBootError] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const authed = !!state;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  // Restore session on first load — and keep retrying while the (free) server
  // wakes up, instead of dropping a logged-in user back to the welcome screen.
  const restore = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setBooting(false);
      setReady(true);
      return;
    }
    setBooting(true);
    setBootError(false);
    const delays = [800, 1500, 2500, 4000, 6000, 8000, 8000, 10000, 10000, 12000, 12000];
    for (let i = 0; i <= delays.length; i++) {
      try {
        const s = await api.getState();
        setState(s);
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
    // Server still unreachable after many tries — offer a manual retry.
    setBootError(true);
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  const applyState = useCallback((s: AppState) => setState(s), []);

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

  const signOut = useCallback(() => {
    clearToken();
    setState(null);
    setSheet(null);
    setScreen('welcome');
    setEmptyMode(false);
    setRangeState('Week');
  }, []);

  const mutate = useCallback(
    async (fn: () => Promise<AppState>, toastMsg?: string) => {
      try {
        const s = await fn();
        setState(s);
        if (toastMsg) showToast(toastMsg);
      } catch (e) {
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
    login,
    signup,
    signOut,
    mutate,
    applyState,
    haptic,
  };

  // Keep the money formatter in sync with the user's chosen currency.
  setCurrency(state?.profile.currency);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
