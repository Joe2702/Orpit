import React, { useState } from 'react';
import { useStore } from './store';
import { api } from './api';

import { Welcome } from './screens/Welcome';
import { Signin } from './screens/Signin';
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
          <path d="M4 7h7M17 7h3M4 12h3M13 12h7M4 17h9M19 17h1" />
          <circle cx="14" cy="7" r="2.2" />
          <circle cx="10" cy="12" r="2.2" />
          <circle cx="16" cy="17" r="2.2" />
        </svg>
        <span style={{ fontSize: 10.5, fontWeight: 600 }}>Settings</span>
      </div>
    </div>
  );
}

export function App() {
  const { ready, authed, state, screen, sheet, toast, closeSheet, mutate } = useStore();
  const [localTheme, setLocalTheme] = useState<'light' | 'dark'>('light');
  const theme = authed && state ? state.profile.theme : localTheme;

  const setTheme = (t: 'light' | 'dark') => {
    if (authed) mutate(() => api.updateMe({ theme: t }));
    else setLocalTheme(t);
  };

  const showTabs = APP_SCREENS.includes(screen);

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

  return (
    <div className="stage">
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(8px)', borderRadius: 999, padding: 5, boxShadow: '0 2px 12px rgba(20,21,30,.12)' }}>
        <div onClick={() => setTheme('light')} style={pill(theme === 'light')}>Light</div>
        <div onClick={() => setTheme('dark')} style={pill(theme === 'dark')}>Dark</div>
      </div>

      <div style={{ width: 414, height: 868, background: '#08080a', borderRadius: 56, padding: 12, boxShadow: '0 60px 120px -30px rgba(15,16,24,.6), 0 0 0 2px rgba(255,255,255,.05) inset', flex: 'none' }}>
        <div className="orbit" data-theme={theme} style={{ position: 'relative', width: 390, height: 844, borderRadius: 44, overflow: 'hidden', background: 'var(--bg)', display: 'flex', flexDirection: 'column', color: 'var(--text)' }}>
          <div style={{ position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)', width: 118, height: 34, background: '#000', borderRadius: 20, zIndex: 80 }} />

          <StatusBar />

          <div style={{ flex: 1, overflowY: 'auto', position: 'relative', WebkitOverflowScrolling: 'touch' }}>
            {ready ? <CurrentScreen /> : null}
          </div>

          {toast && (
            <div style={{ position: 'absolute', top: 66, left: '50%', transform: 'translateX(-50%)', zIndex: 95, background: 'var(--text)', color: 'var(--bg)', padding: '11px 20px', borderRadius: 999, fontSize: 14, fontWeight: 600, boxShadow: '0 12px 32px rgba(8,9,14,.28)', animation: 'fadeUp .3s ease', display: 'flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap' }}>
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
                <div style={{ overflowY: 'auto' }}>
                  <SheetBody />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: '#7c808a', letterSpacing: '.04em' }}>
        orbit — tap anything, it's live
      </div>
    </div>
  );
}
