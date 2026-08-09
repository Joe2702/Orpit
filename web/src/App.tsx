import React, { useState, useEffect, useRef } from 'react';
import { useStore } from './store';
import { api, API_BASE } from './api';

import { Welcome } from './screens/Welcome';
import { Signin } from './screens/Signin';
import { Forgot, Reset } from './screens/ForgotReset';
import { Home } from './screens/Home';
import { Workouts } from './screens/Workouts';
import { Habits } from './screens/Habits';
import { Sleep } from './screens/Sleep';
import { Finances } from './screens/Finances';
import { Analytics } from './screens/Analytics';
import { Settings } from './screens/Settings';
import { HomeEmpty, WorkoutsEmpty, HabitsEmpty, SleepEmpty, FinancesEmpty } from './screens/Empty';
import { Counters } from './screens/Counters';
import { Achievements } from './screens/Achievements';
import { FAddTx, FTxns, FBudgets, FGoals, FAccounts, FRecurring, FCats, FInsights } from './screens/FinanceScreens';
import { FeedbackInbox } from './screens/FeedbackInbox';
import { Privacy } from './screens/Privacy';
import { Insights } from './screens/Insights';
import { Search } from './screens/Search';
import { VerifyEmail } from './screens/VerifyEmail';
import { SyncStatus } from './SyncStatus';

import { Chooser } from './sheets/Chooser';
import { CounterSheet, CountLogSheet, CountPickSheet } from './sheets/CounterSheets';
import { MilestoneSheet } from './sheets/MilestoneSheet';
import { AccountSheet, FcatSheet, BudgetSheet, GoalSheet, RecurringSheet } from './sheets/FinanceSheets';
import { WorkoutSheet } from './sheets/WorkoutSheet';
import { SleepSheet } from './sheets/SleepSheet';
import { ExpenseSheet } from './sheets/ExpenseSheet';
import { HabitSheet } from './sheets/HabitSheet';
import { EditSheet } from './sheets/EditSheet';
import { WCatsSheet, WCatSheet } from './sheets/CategorySheets';
import { ProfileSheet } from './sheets/ProfileSheet';
import { FeedbackSheet } from './sheets/FeedbackSheet';
import { HabitCalendarSheet } from './sheets/HabitCalendarSheet';
import { CatchUpSheet } from './sheets/CatchUpSheet';
import { ReminderOnboarding } from './ReminderOnboarding';
import { StoryReport } from './screens/StoryReport';
import { Intro } from './screens/Intro';
import { syncReminders, scheduleExtras, listenForNotificationActions, snoozeDaily } from './lib/notify';
import { isOnline, subscribe as subscribeConnectivity } from './lib/offline';
import { listenForShortcuts, type ShortcutAction } from './lib/shortcuts';
import { dayKey } from './lib/format';
import { updateWidget } from './lib/widget';

const APP_SCREENS = ['home', 'workouts', 'habits', 'sleep', 'finances', 'analytics', 'settings', 'counters', 'achievements'];

function CurrentScreen() {
  const { screen, emptyMode } = useStore();
  switch (screen) {
    case 'welcome':
      return <Welcome />;
    case 'signin':
      return <Signin />;
    case 'forgot':
      return <Forgot />;
    case 'reset':
      return <Reset />;
    case 'verify':
      return <VerifyEmail />;
    case 'home':
      return emptyMode ? <HomeEmpty /> : <Home />;
    case 'workouts':
      return emptyMode ? <WorkoutsEmpty /> : <Workouts />;
    case 'habits':
      return emptyMode ? <HabitsEmpty /> : <Habits />;
    case 'sleep':
      return emptyMode ? <SleepEmpty /> : <Sleep />;
    case 'finances':
      return emptyMode ? <FinancesEmpty /> : <Finances />;
    case 'analytics':
      return <Analytics />;
    case 'settings':
      return <Settings />;
    case 'counters':
      return <Counters />;
    case 'achievements':
      return <Achievements />;
    case 'faddtx':
      return <FAddTx />;
    case 'ftxns':
      return <FTxns />;
    case 'faccounts':
      return <FAccounts />;
    case 'fcats':
      return <FCats />;
    case 'fbudgets':
      return <FBudgets />;
    case 'fgoals':
      return <FGoals />;
    case 'frecurring':
      return <FRecurring />;
    case 'finsights':
      return <FInsights />;
    case 'feedbackInbox':
      return <FeedbackInbox />;
    case 'privacy':
      return <Privacy />;
    case 'insights':
      return <Insights />;
    case 'search':
      return <Search />;
    default:
      return null;
  }
}

function SheetBody() {
  const { sheet } = useStore();
  switch (sheet) {
    case 'chooser':
      return <Chooser />;
    case 'workout':
      return <WorkoutSheet />;
    case 'sleep':
      return <SleepSheet />;
    case 'expense':
      return <ExpenseSheet />;
    case 'habit':
      return <HabitSheet />;
    case 'edit':
      return <EditSheet />;
    case 'wcats':
      return <WCatsSheet />;
    case 'wcat':
      return <WCatSheet />;
    case 'profile':
      return <ProfileSheet />;
    case 'counter':
      return <CounterSheet />;
    case 'milestone':
      return <MilestoneSheet />;
    case 'countlog':
      return <CountLogSheet />;
    case 'countpick':
      return <CountPickSheet />;
    case 'account':
      return <AccountSheet />;
    case 'fcat':
      return <FcatSheet />;
    case 'budget':
      return <BudgetSheet />;
    case 'goal':
      return <GoalSheet />;
    case 'recurring':
      return <RecurringSheet />;
    case 'feedback':
      return <FeedbackSheet />;
    case 'habitcal':
      return <HabitCalendarSheet />;
    case 'catchup':
      return <CatchUpSheet />;
    default:
      return null;
  }
}

function StatusBar() {
  return (
    <div style={{ height: 54, flex: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 30px 9px', zIndex: 60 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '.01em' }}>9:41</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text)' }}>
        <svg width="18" height="12" style={{ display: 'block', fill: 'currentColor' }}>
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg width="17" height="12" style={{ display: 'block', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }}>
          <path d="M2 4.5a10 10 0 0 1 13 0" />
          <path d="M4.5 7.2a6 6 0 0 1 8 0" />
          <path d="M7 9.8a2.2 2.2 0 0 1 3 0" />
        </svg>
        <div style={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <div style={{ width: 22, height: 11.5, border: '1.4px solid currentColor', borderRadius: 3, padding: 1.4, opacity: 0.9 }}>
            <div style={{ width: '78%', height: '100%', background: 'currentColor', borderRadius: 1 }} />
          </div>
          <div style={{ width: 1.5, height: 4, background: 'currentColor', borderRadius: 2, opacity: 0.5 }} />
        </div>
      </div>
    </div>
  );
}

function TabBar() {
  const { screen, go, open } = useStore();

  // A floating rounded-pill nav: a solid light bar that hovers over the screen,
  // with the active destination marked by a pill behind its icon. Icons only.
  const item = (active: boolean, onClick: () => void, path: React.ReactNode, label: string) => (
    <div
      onClick={onClick}
      className="press92"
      role="tab"
      aria-label={label}
      aria-selected={active}
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 48 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 58,
          height: 44,
          borderRadius: 999,
          color: active ? 'var(--indigo)' : 'var(--text2)',
          background: active ? 'color-mix(in srgb,var(--indigo) 15%,transparent)' : 'transparent',
          transition: 'background .2s, color .2s',
        }}
      >
        <svg width="24" height="24" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: active ? 2.3 : 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
          {path}
        </svg>
      </div>
    </div>
  );

  return (
    // Absolutely positioned so the screen scrolls BEHIND it; the container
    // itself ignores taps (pointerEvents none) so the transparent sides don't
    // block content — only the pill is interactive.
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 16px 16px', zIndex: 40, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'relative',
          height: 64,
          pointerEvents: 'auto',
          // Frosted glass: translucent + backdrop blur, so text scrolling under
          // it shows through blurred rather than sitting on a solid bar.
          background: 'color-mix(in srgb, var(--surface) 68%, transparent)',
          backdropFilter: 'blur(20px) saturate(1.7)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.7)',
          border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
          borderRadius: 999,
          boxShadow: '0 12px 30px -10px rgba(8,9,14,.28)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
        }}
      >
        {item(screen === 'home', () => go('home'), <path d="M4 11l8-7 8 7M6 9.5V19h4.5v-5h3v5H18V9.5" />, 'Home')}
        {item(screen === 'analytics', () => go('analytics'), <path d="M4 20V11M10 20V5M16 20v-6M4 20h16" />, 'Analytics')}
        {/* Add — the primary create action; accented but flat within the bar. */}
        <div onClick={() => open('chooser')} className="press92" role="button" aria-label="Add an entry" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 48 }}>
          <div style={{ width: 46, height: 46, borderRadius: 15, background: 'linear-gradient(155deg,var(--blue),var(--indigo))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--glow)' }}>
            <svg width="24" height="24" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' }} aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          </div>
        </div>
        {item(
          screen === 'settings',
          () => go('settings'),
          <>
            <circle cx="12" cy="8" r="3.4" />
            <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
          </>,
          'Profile'
        )}
      </div>
    </div>
  );
}

/**
 * Password re-entry for irreversible actions. A masked field rather than
 * `window.prompt`, which shows the typed password in clear text and renders as
 * a raw system dialog inside the app.
 */
function PasswordPrompt() {
  const { passwordState, closePassword } = useStore();
  const [value, setValue] = useState('');
  if (!passwordState) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <div onClick={() => closePassword(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,14,.5)', animation: 'fadeIn .2s ease', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 24, padding: '26px 22px 20px', width: '100%', maxWidth: 320, boxShadow: '0 20px 60px rgba(8,9,14,.35)', animation: 'fadeUp .25s ease' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em', textAlign: 'center' }}>{passwordState.title}</div>
        {passwordState.message && (
          <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5, textAlign: 'center' }}>{passwordState.message}</div>
        )}
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value && closePassword(value)}
          placeholder="Your password"
          style={{ width: '100%', height: 50, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 16, color: 'var(--text)', outline: 'none', marginTop: 18 }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <div onClick={() => closePassword(null)} className="press" style={{ flex: 1, height: 48, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
            Cancel
          </div>
          <div
            onClick={() => value && closePassword(value)}
            className="press"
            style={{ flex: 1, height: 48, borderRadius: 14, background: value ? 'var(--danger)' : 'color-mix(in srgb,var(--danger) 40%,var(--surface))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: '#fff', cursor: value ? 'pointer' : 'default' }}
          >
            {passwordState.confirmLabel || 'Confirm'}
          </div>
        </div>
      </div>
    </div>
  );
}

function Splash({ error, onRetry }: { theme: 'light' | 'dark'; error: boolean; onRetry: () => void }) {
  const apiBase = API_BASE;
  // After a few seconds, explain the wait instead of spinning silently — the
  // free host sleeps, and a blank splash reads as "the app is broken".
  const [slow, setSlow] = useState(false);
  // ...but only blame the server when the phone actually has a connection.
  // Telling someone in airplane mode to wait for a server to wake up is a lie
  // they can't act on, and it's the message they'd stare at the longest.
  const [offline, setOffline] = useState(!isOnline());
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    const off = subscribeConnectivity(() => setOffline(!isOnline()));
    return () => {
      clearTimeout(t);
      off();
    };
  }, []);
  // Always brand-indigo so it flows seamlessly out of the app's launch icon —
  // no cheap color mismatch before the animation appears.
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        background: 'radial-gradient(125% 85% at 50% 32%, #605ac9 0%, #4a45a6 46%, #3b3789 100%)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fadeUp .6s ease' }}>
        {/* Orbit mark: soft glow, a breathing pale planet, one dot circling the ring. */}
        <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 30 }}>
          <div style={{ position: 'absolute', width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.35), transparent 66%)', animation: 'glowPulse 3.2s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', width: 132, height: 132, animation: 'orbitSpin 3.6s linear infinite' }}>
            <svg width="132" height="132" style={{ overflow: 'visible' }}>
              <ellipse cx="66" cy="66" rx="58" ry="23" transform="rotate(-26 66 66)" style={{ fill: 'none', stroke: 'rgba(255,255,255,.5)', strokeWidth: 2 }} />
              <circle cx="115" cy="41" r="6.5" style={{ fill: '#fff', filter: 'drop-shadow(0 0 7px rgba(255,255,255,.9))' }} />
            </svg>
          </div>
          <div style={{ width: 62, height: 62, borderRadius: '50%', background: 'linear-gradient(155deg,#ffffff,#dcd9f5)', boxShadow: '0 16px 40px -10px rgba(0,0,0,.4), inset 0 -6px 14px rgba(90,84,180,.35)', animation: 'breathe 3.2s ease-in-out infinite' }} />
        </div>

        <div style={{ fontSize: 33, fontWeight: 700, letterSpacing: '-.04em' }}>Orbit</div>

        {error ? (
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,.85)', marginBottom: 14, maxWidth: 270, lineHeight: 1.5 }}>
              {!apiBase
                ? 'This build has no backend address, so it can never reach the server. It needs to be rebuilt with the backend URL.'
                : offline
                  ? "You're offline. Orbit needs a connection the first time you open it on a device — after that it works without one."
                  : "Couldn't reach the server. It sleeps when unused, so the first open of the day can take up to a minute."}
            </div>
            {/* Which backend this build actually points at. Without it, a build
                configured with the wrong URL — or none at all — is invisible and
                looks exactly like a server that won't wake up. */}
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)', marginBottom: 16, maxWidth: 280, wordBreak: 'break-all', lineHeight: 1.45 }}>
              {apiBase || 'no backend URL configured'}
            </div>
            <div onClick={onRetry} className="press" style={{ display: 'inline-flex', background: '#fff', color: '#4a45a6', height: 46, padding: '0 26px', borderRadius: 14, alignItems: 'center', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 24px -10px rgba(0,0,0,.4)' }}>Try again</div>
          </div>
        ) : (
          <>
            <div style={{ width: 120, height: 3, borderRadius: 999, overflow: 'hidden', marginTop: 26, background: 'rgba(255,255,255,.2)' }}>
              <div style={{ width: '40%', height: '100%', borderRadius: 999, background: '#fff', animation: 'loadBar 1.3s ease-in-out infinite' }} />
            </div>
            {slow && (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', marginTop: 16, maxWidth: 250, textAlign: 'center', lineHeight: 1.5, animation: 'fadeIn .4s ease' }}>
                {offline
                  ? "You're offline — waiting for a connection."
                  : 'Waking up the server — this can take ~30 seconds after a quiet spell.'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function App() {
  const { ready, authed, state, screen, sheet, toast, toastUndo, runUndo, closeSheet, open, mutateOpt, booting, bootError, retryBoot, go, confirmState, closeConfirm, passwordState, report, closeReport, applyState } = useStore();
  const [localTheme, setLocalTheme] = useState<'light' | 'dark'>('light');

  // Track the phone's own light/dark setting so "System" can follow it live.
  const [sysDark, setSysDark] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSysDark(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  // On the native app, make sure the daily reminder is actually scheduled on
  // this device whenever the account has reminders enabled.
  const remOn = authed && state ? !!state.profile.reminders : false;
  const remTime = authed && state ? state.profile.reminderTime || '21:00' : '21:00';
  // How many of today's scheduled habits are still unchecked — the reminder
  // text is built from this so it isn't the same sentence every day.
  const remainingToday = React.useMemo(() => {
    if (!state) return -1;
    const today = dayKey();
    const dow = new Date().getDay();
    const due = state.habits.filter((h) => (/^[01]{7}$/.test(h.days) ? h.days : '1111111')[dow] === '1');
    const done = new Set(state.checkins.filter((c) => c.day === today).map((c) => c.habitId));
    return due.filter((h) => !done.has(h.id)).length;
  }, [state]);
  useEffect(() => {
    if (remOn) syncReminders(true, remTime, remainingToday);
  }, [remOn, remTime, remainingToday]);

  // Per-habit reminders and "bill due tomorrow" nudges.
  const habitsKey = state ? state.habits.map((h) => `${h.id}:${h.reminderTime}:${h.paused}:${h.archived}`).join(',') : '';
  const billsKey = state ? state.recurring.map((r) => `${r.id}:${r.nextTs}:${r.income}`).join(',') : '';
  useEffect(() => {
    if (remOn && state) {
      // Usual bedtime from the last 14 logged nights.
      const recent = state.nights.filter((n) => n.bedH != null).slice(0, 14);
      const bedHour = recent.length
        ? recent.reduce((a, n) => a + (n.bedH! < 12 ? n.bedH! + 24 : n.bedH!), 0) / recent.length
        : null;
      scheduleExtras(state.habits, state.recurring, { on: !!state.profile.windDown, bedHour });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remOn, habitsKey, billsKey, state?.profile.windDown]);

  // The chosen accent replaces the app's primary colour everywhere by remapping
  // the --indigo token the UI already uses.
  const accent = (authed && state ? state.profile.accent : 'indigo') || 'indigo';
  useEffect(() => {
    const root = document.querySelector('.orbit') as HTMLElement | null;
    if (!root) return;
    if (accent === 'indigo') root.style.removeProperty('--indigo');
    else root.style.setProperty('--indigo', `var(--${accent})`);
  }, [accent, authed]);

  // Text size: the UI uses fixed pixel sizes, so scale the whole app with
  // `zoom` (supported in the Android WebView and Chrome) rather than rewriting
  // every size. Layout stays proportional.
  const textScale = (authed && state ? state.profile.textScale : 1) || 1;
  useEffect(() => {
    const root = document.querySelector('.orbit') as HTMLElement | null;
    if (!root) return;
    root.style.setProperty('zoom', String(textScale));
  }, [textScale, authed]);

  const rawTheme = authed && state ? state.profile.theme : localTheme;
  const theme: 'light' | 'dark' = rawTheme === 'system' ? (sysDark ? 'dark' : 'light') : rawTheme;

  const setTheme = (t: 'light' | 'dark') => {
    if (authed)
      mutateOpt((s) => ({ ...s, profile: { ...s.profile, theme: t } }), () => api.updateMe({ theme: t }));
    else setLocalTheme(t);
  };

  // On a phone (or installed as a PWA) fill the whole screen like a native app.
  // On a desktop, keep the pretty phone-mockup showcase.
  const [mobile, setMobile] = useState<boolean>(() => detectMobile());
  useEffect(() => {
    const on = () => setMobile(detectMobile());
    window.addEventListener('resize', on);
    const mm = window.matchMedia('(display-mode: standalone)');
    mm.addEventListener?.('change', on);
    return () => {
      window.removeEventListener('resize', on);
      mm.removeEventListener?.('change', on);
    };
  }, []);

  const showTabs = APP_SCREENS.includes(screen);

  // ---- Pull to refresh ----
  // Only engages at the very top of the list, so it never fights normal scrolling.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pullStart = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onPullStart = (e: React.TouchEvent) => {
    if ((scrollRef.current?.scrollTop ?? 1) <= 0) pullStart.current = e.touches[0].clientY;
    else pullStart.current = null;
  };
  const onPullMove = (e: React.TouchEvent) => {
    if (pullStart.current == null || refreshing) return;
    const dy = e.touches[0].clientY - pullStart.current;
    if (dy > 0) setPull(Math.min(90, dy * 0.5));
  };
  const onPullEnd = async () => {
    const shouldRefresh = pull > 64 && !refreshing && authed;
    pullStart.current = null;
    if (!shouldRefresh) {
      setPull(0);
      return;
    }
    setRefreshing(true);
    setPull(48);
    try {
      applyState(await api.getState());
    } catch {
      /* offline or asleep — keep what we have */
    }
    setRefreshing(false);
    setPull(0);
  };

  // Keep the home-screen widget's summary current. Writing on every state
  // change is cheap (one small string) and means the value is already correct
  // when the activity refreshes the widget on its way to the background.
  useEffect(() => {
    updateWidget(state);
  }, [state]);

  // ---- Reminder action buttons ----
  // "Done" on a habit reminder checks that habit off for today; "Snooze" pushes
  // the nightly nudge out an hour. Both arrive through a listener rather than
  // React state, so `stateRef` is used to read the latest check-ins without
  // making the effect depend on every state change.
  const liveState = useRef(state);
  liveState.current = state;
  useEffect(() => {
    return listenForNotificationActions({
      onSnooze: () => snoozeDaily(),
      onDone: (habitId) => {
        const cur = liveState.current;
        if (!cur) return;
        const today = dayKey();
        // Toggle flips, so check first — acting on an already-checked habit
        // would silently un-check it, the exact opposite of "Done".
        if (cur.checkins.some((c) => c.habitId === habitId && c.day === today)) return;
        if (!cur.habits.some((h) => h.id === habitId)) return; // deleted since
        mutateOpt(
          (st) => ({ ...st, checkins: [...st.checkins, { habitId, day: today }] }),
          () => api.toggleHabit(habitId, today),
          'Checked off'
        ).catch(() => {});
      },
    });
  }, [mutateOpt]);

  // ---- Home-screen shortcuts ----
  // A cold start arrives before the session is restored, so the action waits
  // for `ready` rather than firing at a screen that isn't mounted yet.
  const [shortcut, setShortcut] = useState<ShortcutAction | null>(null);
  useEffect(() => listenForShortcuts(setShortcut), []);
  useEffect(() => {
    if (!shortcut || !ready || !authed) return;
    setShortcut(null);
    if (shortcut === 'workout') open('workout');
    else if (shortcut === 'sleep') open('sleep');
    else go('faddtx'); // expenses use the full add-transaction screen
  }, [shortcut, ready, authed, open, go]);

  // ---- Swipe between the main tabs ----
  // Only on the three top-level destinations, and only for a clearly horizontal
  // flick: `touch-action: pan-y` on swipeable rows means a row swipe never
  // reaches here, and a vertical scroll fails the axis test.
  const TAB_ORDER = ['home', 'analytics', 'settings'] as const;
  const swipe = useRef<{ x: number; y: number; axis: '' | 'x' | 'y' } | null>(null);
  const [slide, setSlide] = useState<'l' | 'r' | null>(null);

  const onSwipeStart = (e: React.TouchEvent) => {
    swipe.current = showTabs && e.touches.length === 1
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: '' }
      : null;
  };
  const onSwipeMove = (e: React.TouchEvent) => {
    const s = swipe.current;
    if (!s || s.axis) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
    // Lock to whichever axis moved first, and require the horizontal one to be
    // decisively horizontal so a diagonal scroll doesn't change tabs.
    s.axis = Math.abs(dx) > Math.abs(dy) * 1.6 ? 'x' : 'y';
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.axis !== 'x') return;
    const dx = (e.changedTouches[0]?.clientX ?? s.x) - s.x;
    if (Math.abs(dx) < 60) return;
    const i = TAB_ORDER.indexOf(screen as (typeof TAB_ORDER)[number]);
    if (i < 0) return;
    const next = TAB_ORDER[i + (dx < 0 ? 1 : -1)];
    if (!next) return;
    setSlide(dx < 0 ? 'l' : 'r');
    go(next);
  };
  // Clear the direction hint once the incoming screen has animated in.
  useEffect(() => {
    if (!slide) return;
    const t = setTimeout(() => setSlide(null), 300);
    return () => clearTimeout(t);
  }, [slide]);

  // ---- Android hardware "Back" button handling ----
  // Back should navigate inside the app; only at the top level does it ask
  // "exit Orbit?" — like a real installed app, instead of instantly closing.
  const [exitPrompt, setExitPrompt] = useState(false);
  const nav = useRef({ screen, sheet, authed });
  nav.current = { screen, sheet, authed };
  const rootScreens = ['home', 'welcome', 'signin'];

  useEffect(() => {
    // Seed one history entry so the first Back press is caught, not an instant exit.
    window.history.pushState({ orbit: true }, '');
    const onPop = () => {
      const { screen: sc, sheet: sh } = nav.current;
      if (sh) {
        closeSheet();
        window.history.pushState({ orbit: true }, ''); // re-arm
        return;
      }
      if (!rootScreens.includes(sc)) {
        go('home');
        window.history.pushState({ orbit: true }, ''); // re-arm
        return;
      }
      // At the top level: ask before leaving. Don't re-arm yet — the choice decides.
      setExitPrompt(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelExit = () => {
    setExitPrompt(false);
    window.history.pushState({ orbit: true }, ''); // re-arm so Back keeps being caught
  };
  const confirmExit = () => {
    setExitPrompt(false);
    window.history.back(); // no sentinel armed → this leaves the app
  };

  // While restoring a session (esp. waking the free server), show a branded
  // splash instead of a blank page or the login screen.
  if (booting) {
    return <Splash theme={theme} error={bootError} onRetry={retryBoot} />;
  }

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '7px 17px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all .2s',
    fontFamily: "'Geist',sans-serif",
    border: 'none',
    ...(active ? { background: '#14151A', color: '#fff' } : { background: 'transparent', color: '#3a3b42' }),
  });

  const appInner = (
    <>
      {!mobile && (
        <div style={{ position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)', width: 118, height: 34, background: '#000', borderRadius: 20, zIndex: 80 }} />
      )}

      {!mobile && <StatusBar />}

      <div
        ref={scrollRef}
        onTouchStart={(e) => { onPullStart(e); onSwipeStart(e); }}
        onTouchMove={(e) => { onPullMove(e); onSwipeMove(e); }}
        onTouchEnd={(e) => { onPullEnd(); onSwipeEnd(e); }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', position: 'relative', WebkitOverflowScrolling: 'touch', paddingBottom: showTabs ? 84 : 0 }}
      >
        {pull > 0 && (
          <div style={{ height: pull, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600 }}>
            {refreshing ? 'Refreshing…' : pull > 64 ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        )}
        {/* Keyed on the screen so a tab change replays the slide-in from the
            side the swipe came from. */}
        {ready && <SyncStatus />}
        <div key={screen} style={slide ? { animation: `${slide === 'l' ? 'slideInR' : 'slideInL'} .26s cubic-bezier(.2,.8,.3,1)` } : undefined}>
          {ready ? <CurrentScreen /> : null}
        </div>
      </div>

      {toast && (
        <div style={{ position: 'absolute', top: mobile ? 'calc(env(safe-area-inset-top) + 14px)' : 66, left: '50%', transform: 'translateX(-50%)', zIndex: 95, background: 'var(--text)', color: 'var(--bg)', padding: '11px 20px', borderRadius: 999, fontSize: 14, fontWeight: 600, boxShadow: '0 12px 32px rgba(8,9,14,.28)', animation: 'fadeUp .3s ease', display: 'flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap' }}>
          <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--success)', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
            <path d="M4 9.5l3.4 3.4L14 5" />
          </svg>
          {toast}
          {toastUndo && (
            <span
              onClick={runUndo}
              role="button"
              aria-label="Undo"
              style={{ marginLeft: 4, paddingLeft: 12, borderLeft: '1px solid color-mix(in srgb,var(--bg) 35%,transparent)', fontWeight: 700, color: 'var(--warning)', cursor: 'pointer' }}
            >
              Undo
            </span>
          )}
        </div>
      )}

      {showTabs && <TabBar />}

      {sheet && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 90, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={closeSheet} style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,14,.5)', animation: 'fadeIn .25s ease', backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: '30px 30px 0 0', animation: 'sheetUp .34s cubic-bezier(.22,1,.36,1)', maxHeight: '92%', display: 'flex', flexDirection: 'column', boxShadow: '0 -10px 40px rgba(8,9,14,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px', flex: 'none' }}>
              <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--border)' }} />
            </div>
            <div style={{ overflowY: 'auto', paddingBottom: mobile ? 'env(safe-area-inset-bottom)' : 0 }}>
              <SheetBody />
            </div>
          </div>
        </div>
      )}

      {exitPrompt && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 98, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <div onClick={cancelExit} style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,14,.5)', animation: 'fadeIn .2s ease', backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 24, padding: '26px 22px 20px', width: '100%', maxWidth: 320, boxShadow: '0 20px 60px rgba(8,9,14,.35)', animation: 'fadeUp .25s ease', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em' }}>Exit Orbit?</div>
            <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>Are you sure you want to close the app?</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <div onClick={cancelExit} className="press" style={{ flex: 1, height: 48, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                Stay
              </div>
              <div onClick={confirmExit} className="press" style={{ flex: 1, height: 48, borderRadius: 14, background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                Exit
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <div onClick={() => closeConfirm(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,14,.5)', animation: 'fadeIn .2s ease', backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 24, padding: '26px 22px 20px', width: '100%', maxWidth: 320, boxShadow: '0 20px 60px rgba(8,9,14,.35)', animation: 'fadeUp .25s ease', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em' }}>{confirmState.title}</div>
            {confirmState.message && (
              <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>{confirmState.message}</div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <div onClick={() => closeConfirm(false)} className="press" style={{ flex: 1, height: 48, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                Cancel
              </div>
              <div onClick={() => closeConfirm(true)} className="press" style={{ flex: 1, height: 48, borderRadius: 14, background: confirmState.danger === false ? 'var(--indigo)' : 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                {confirmState.confirmLabel || 'Delete'}
              </div>
            </div>
          </div>
        </div>
      )}

      {passwordState && <PasswordPrompt />}

      {/* First run: explain the app before asking about reminders. */}
      {authed && state && !state.profile.introDone && <Intro />}
      {authed && state?.profile.introDone && <ReminderOnboarding />}

      {report && state && <StoryReport kind={report.kind} offset={report.offset} onClose={closeReport} />}
    </>
  );

  // Phone / installed PWA: fill the whole screen, no mockup frame.
  if (mobile) {
    return (
      <div
        className="orbit"
        data-theme={theme}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--app-bg)',
          color: 'var(--text)',
          display: 'flex',
          flexDirection: 'column',
          overscrollBehavior: 'none',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {appInner}
      </div>
    );
  }

  // Desktop: pretty phone-mockup showcase.
  return (
    <div className="stage">
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(8px)', borderRadius: 999, padding: 5, boxShadow: '0 2px 12px rgba(20,21,30,.12)' }}>
        <div onClick={() => setTheme('light')} style={pill(theme === 'light')}>Light</div>
        <div onClick={() => setTheme('dark')} style={pill(theme === 'dark')}>Dark</div>
      </div>

      <div style={{ width: 414, height: 868, background: '#08080a', borderRadius: 56, padding: 12, boxShadow: '0 60px 120px -30px rgba(15,16,24,.6), 0 0 0 2px rgba(255,255,255,.05) inset', flex: 'none' }}>
        <div className="orbit" data-theme={theme} style={{ position: 'relative', width: 390, height: 844, borderRadius: 44, overflow: 'hidden', background: 'var(--app-bg)', display: 'flex', flexDirection: 'column', color: 'var(--text)' }}>
          {appInner}
        </div>
      </div>

      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: '#7c808a', letterSpacing: '.04em' }}>
        orbit — tap anything, it's live
      </div>
    </div>
  );
}

function detectMobile(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari standalone flag
    (window.navigator as any).standalone === true;
  return standalone || window.innerWidth < 700;
}
