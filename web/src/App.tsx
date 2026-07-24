import React, { useState, useEffect, useRef } from 'react';
import { useStore } from './store';
import { api } from './api';

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
import { FAddTx, FTxns, FBudgets, FGoals, FAccounts, FRecurring, FCats, FInsights } from './screens/FinanceScreens';

import { Chooser } from './sheets/Chooser';
import { CounterSheet, CountLogSheet, CountPickSheet } from './sheets/CounterSheets';
import { AccountSheet, FcatSheet, BudgetSheet, GoalSheet, RecurringSheet } from './sheets/FinanceSheets';
import { WorkoutSheet } from './sheets/WorkoutSheet';
import { SleepSheet } from './sheets/SleepSheet';
import { ExpenseSheet } from './sheets/ExpenseSheet';
import { HabitSheet } from './sheets/HabitSheet';
import { EditSheet } from './sheets/EditSheet';
import { WCatsSheet, WCatSheet } from './sheets/CategorySheets';
import { ProfileSheet } from './sheets/ProfileSheet';

const APP_SCREENS = ['home', 'workouts', 'habits', 'sleep', 'finances', 'analytics', 'settings', 'counters'];

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
  const tab = (s: string): React.CSSProperties => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
    color: screen === s ? 'var(--indigo)' : 'var(--text2)',
  });
  return (
    <div style={{ flex: 'none', position: 'relative', height: 84, background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', padding: '11px 0 0', boxShadow: '0 -6px 24px rgba(20,21,26,.05)', zIndex: 30 }}>
      <div onClick={() => go('home')} style={tab('home')}>
        <svg width="24" height="24" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M4 11l8-7 8 7M6 9.5V19h4.5v-5h3v5H18V9.5" />
        </svg>
        <span style={{ fontSize: 10.5, fontWeight: 600 }}>Home</span>
      </div>
      <div onClick={() => go('analytics')} style={tab('analytics')}>
        <svg width="24" height="24" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M4 20V11M10 20V5M16 20v-6M4 20h16" />
        </svg>
        <span style={{ fontSize: 10.5, fontWeight: 600 }}>Analytics</span>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <div onClick={() => open('chooser')} className="press" style={{ position: 'absolute', top: -25, left: '50%', transform: 'translateX(-50%)', width: 60, height: 60, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px -8px rgba(40,36,28,.32)', cursor: 'pointer', border: '4px solid var(--surface)' }}>
          <svg width="26" height="26" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' }}><path d="M13 6v14M6 13h14" /></svg>
        </div>
      </div>
      <div onClick={() => go('settings')} style={tab('settings')}>
        <svg width="24" height="24" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <circle cx="12" cy="8" r="3.4" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
        </svg>
        <span style={{ fontSize: 10.5, fontWeight: 600 }}>Profile</span>
      </div>
    </div>
  );
}

function Splash({ error, onRetry }: { theme: 'light' | 'dark'; error: boolean; onRetry: () => void }) {
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
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,.8)', marginBottom: 16, maxWidth: 240 }}>Taking a moment to wake up. Thanks for your patience.</div>
            <div onClick={onRetry} className="press" style={{ display: 'inline-flex', background: '#fff', color: '#4a45a6', height: 46, padding: '0 26px', borderRadius: 14, alignItems: 'center', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 24px -10px rgba(0,0,0,.4)' }}>Try again</div>
          </div>
        ) : (
          <div style={{ width: 120, height: 3, borderRadius: 999, overflow: 'hidden', marginTop: 26, background: 'rgba(255,255,255,.2)' }}>
            <div style={{ width: '40%', height: '100%', borderRadius: 999, background: '#fff', animation: 'loadBar 1.3s ease-in-out infinite' }} />
          </div>
        )}
      </div>
    </div>
  );
}

export function App() {
  const { ready, authed, state, screen, sheet, toast, closeSheet, mutate, booting, bootError, retryBoot, go } = useStore();
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

  const rawTheme = authed && state ? state.profile.theme : localTheme;
  const theme: 'light' | 'dark' = rawTheme === 'system' ? (sysDark ? 'dark' : 'light') : rawTheme;

  const setTheme = (t: 'light' | 'dark') => {
    if (authed) mutate(() => api.updateMe({ theme: t }));
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

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', position: 'relative', WebkitOverflowScrolling: 'touch' }}>
        {ready ? <CurrentScreen /> : null}
      </div>

      {toast && (
        <div style={{ position: 'absolute', top: mobile ? 'calc(env(safe-area-inset-top) + 14px)' : 66, left: '50%', transform: 'translateX(-50%)', zIndex: 95, background: 'var(--text)', color: 'var(--bg)', padding: '11px 20px', borderRadius: 999, fontSize: 14, fontWeight: 600, boxShadow: '0 12px 32px rgba(8,9,14,.28)', animation: 'fadeUp .3s ease', display: 'flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap' }}>
          <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--success)', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M4 9.5l3.4 3.4L14 5" />
          </svg>
          {toast}
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
          background: 'var(--bg)',
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
        <div className="orbit" data-theme={theme} style={{ position: 'relative', width: 390, height: 844, borderRadius: 44, overflow: 'hidden', background: 'var(--bg)', display: 'flex', flexDirection: 'column', color: 'var(--text)' }}>
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
