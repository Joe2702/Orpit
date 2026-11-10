import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { track, flushUsage, setUsageSharing } from './lib/usage';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { useStore } from './store';
import { api, API_BASE } from './api';

import { Home } from './screens/Home';
import { Workouts } from './screens/Workouts';
import { Habits } from './screens/Habits';
import { Sleep } from './screens/Sleep';
import { Finances } from './screens/Finances';
import { HomeEmpty, WorkoutsEmpty, HabitsEmpty, SleepEmpty, FinancesEmpty } from './screens/Empty';
import { SyncStatus } from './SyncStatus';

import { Chooser } from './sheets/Chooser';
import { MoneyWatcher } from './MoneyWatcher';
import { LockScreen } from './LockScreen';
import { lockSupported, lockEnabled, RELOCK_AFTER } from './lib/appLock';
import { WorkoutSheet } from './sheets/WorkoutSheet';
import { SleepSheet } from './sheets/SleepSheet';
import { ExpenseSheet } from './sheets/ExpenseSheet';
import { HabitSheet } from './sheets/HabitSheet';
import { EditSheet } from './sheets/EditSheet';
import { syncReminders, scheduleExtras, listenForNotificationActions, snoozeDaily, scheduleBriefs } from './lib/notify';
import { briefSchedule, hasBriefData } from './lib/brief';
import { OrbitMark } from './OrbitMark';
import { syncDue, syncHealth } from './lib/health';
import { accentFor, isHex } from './lib/color';
import { startLiquid } from './lib/liquid';
import { connectivity, subscribe as subscribeConnectivity } from './lib/offline';
import { listenForShortcuts, type ShortcutTarget } from './lib/shortcuts';
import { dayKey } from './lib/format';
import { updateWidget } from './lib/widget';
import { syncSms, removeDeclined, smsEnabled, ensureLiveSms, onSmsArrived, SMS_CHANGED } from './lib/smsSync';
import { isRTL, t, tn } from './i18n';

// Screens and sheets that aren't needed to open the app and log something load
// when first used, so a cold start parses less. A few seconds after launch the
// rest are fetched anyway (see warmLazyScreens), so they're instant when
// tapped and, on the website, cached for offline use like everything else.
const LOAD = {
  FinanceScreens: () => import('./screens/FinanceScreens'),
  Achievements: () => import('./screens/Achievements'),
  Analytics: () => import('./screens/Analytics'),
  Counters: () => import('./screens/Counters'),
  FeedbackInbox: () => import('./screens/FeedbackInbox'),
  ForgotReset: () => import('./screens/ForgotReset'),
  Insights: () => import('./screens/Insights'),
  Intro: () => import('./screens/Intro'),
  Partner: () => import('./screens/Partner'),
  PartnerThread: () => import('./screens/PartnerThread'),
  Privacy: () => import('./screens/Privacy'),
  Search: () => import('./screens/Search'),
  Settings: () => import('./screens/Settings'),
  Signin: () => import('./screens/Signin'),
  StoryReport: () => import('./screens/StoryReport'),
  VerifyEmail: () => import('./screens/VerifyEmail'),
  WeekReview: () => import('./screens/WeekReview'),
  Brief: () => import('./screens/Brief'),
  Welcome: () => import('./screens/Welcome'),
  CatchUpSheet: () => import('./sheets/CatchUpSheet'),
  CategorySheets: () => import('./sheets/CategorySheets'),
  CounterSheets: () => import('./sheets/CounterSheets'),
  FeedbackSheet: () => import('./sheets/FeedbackSheet'),
  FinanceSheets: () => import('./sheets/FinanceSheets'),
  HabitCalendarSheet: () => import('./sheets/HabitCalendarSheet'),
  MilestoneSheet: () => import('./sheets/MilestoneSheet'),
  TodoSheets: () => import('./sheets/TodoSheets'),
  HealthSheet: () => import('./sheets/HealthSheet'),
  AccentSheet: () => import('./sheets/AccentSheet'),
  AssistantSheet: () => import('./sheets/AssistantSheet'),
  CurrencySheet: () => import('./sheets/CurrencySheet'),
  Todos: () => import('./screens/Todos'),
  TodoList: () => import('./screens/TodoList'),
  PartnerReportSheet: () => import('./sheets/PartnerReportSheet'),
  ProfileSheet: () => import('./sheets/ProfileSheet'),
  SmsFoundSheet: () => import('./sheets/SmsFoundSheet'),
};
function warmLazyScreens(): void {
  Object.values(LOAD).forEach((load) => load().catch(() => {}));
}
const FAddTx = lazy(() => LOAD.FinanceScreens().then((m) => ({ default: m.FAddTx })));
const FTxns = lazy(() => LOAD.FinanceScreens().then((m) => ({ default: m.FTxns })));
const FBudgets = lazy(() => LOAD.FinanceScreens().then((m) => ({ default: m.FBudgets })));
const FGoals = lazy(() => LOAD.FinanceScreens().then((m) => ({ default: m.FGoals })));
const FAccounts = lazy(() => LOAD.FinanceScreens().then((m) => ({ default: m.FAccounts })));
const FRecurring = lazy(() => LOAD.FinanceScreens().then((m) => ({ default: m.FRecurring })));
const FCats = lazy(() => LOAD.FinanceScreens().then((m) => ({ default: m.FCats })));
const FInsights = lazy(() => LOAD.FinanceScreens().then((m) => ({ default: m.FInsights })));
const FReview = lazy(() => LOAD.FinanceScreens().then((m) => ({ default: m.FReview })));
const Welcome = lazy(() => LOAD.Welcome().then((m) => ({ default: m.Welcome })));
const Signin = lazy(() => LOAD.Signin().then((m) => ({ default: m.Signin })));
const Forgot = lazy(() => LOAD.ForgotReset().then((m) => ({ default: m.Forgot })));
const Reset = lazy(() => LOAD.ForgotReset().then((m) => ({ default: m.Reset })));
const Analytics = lazy(() => LOAD.Analytics().then((m) => ({ default: m.Analytics })));
const Settings = lazy(() => LOAD.Settings().then((m) => ({ default: m.Settings })));
const Counters = lazy(() => LOAD.Counters().then((m) => ({ default: m.Counters })));
const Achievements = lazy(() => LOAD.Achievements().then((m) => ({ default: m.Achievements })));
const FeedbackInbox = lazy(() => LOAD.FeedbackInbox().then((m) => ({ default: m.FeedbackInbox })));
const Privacy = lazy(() => LOAD.Privacy().then((m) => ({ default: m.Privacy })));
const Insights = lazy(() => LOAD.Insights().then((m) => ({ default: m.Insights })));
const Search = lazy(() => LOAD.Search().then((m) => ({ default: m.Search })));
const VerifyEmail = lazy(() => LOAD.VerifyEmail().then((m) => ({ default: m.VerifyEmail })));
const StoryReport = lazy(() => LOAD.StoryReport().then((m) => ({ default: m.StoryReport })));
const Intro = lazy(() => LOAD.Intro().then((m) => ({ default: m.Intro })));
const Partner = lazy(() => LOAD.Partner().then((m) => ({ default: m.Partner })));
const PartnerThread = lazy(() => LOAD.PartnerThread().then((m) => ({ default: m.PartnerThread })));
const WeekReview = lazy(() => LOAD.WeekReview().then((m) => ({ default: m.WeekReview })));
const Brief = lazy(() => LOAD.Brief().then((m) => ({ default: m.Brief })));
const CounterSheet = lazy(() => LOAD.CounterSheets().then((m) => ({ default: m.CounterSheet })));
const CountLogSheet = lazy(() => LOAD.CounterSheets().then((m) => ({ default: m.CountLogSheet })));
const CountPickSheet = lazy(() => LOAD.CounterSheets().then((m) => ({ default: m.CountPickSheet })));
const MilestoneSheet = lazy(() => LOAD.MilestoneSheet().then((m) => ({ default: m.MilestoneSheet })));
const TodoSheet = lazy(() => LOAD.TodoSheets().then((m) => ({ default: m.TodoSheet })));
const HealthSheet = lazy(() => LOAD.HealthSheet().then((m) => ({ default: m.HealthSheet })));
const AccentSheet = lazy(() => LOAD.AccentSheet().then((m) => ({ default: m.AccentSheet })));
const AssistantSheet = lazy(() => LOAD.AssistantSheet().then((m) => ({ default: m.AssistantSheet })));
const CurrencySheet = lazy(() => LOAD.CurrencySheet().then((m) => ({ default: m.CurrencySheet })));
const TodoListSheet = lazy(() => LOAD.TodoSheets().then((m) => ({ default: m.TodoListSheet })));
const Todos = lazy(() => LOAD.Todos().then((m) => ({ default: m.Todos })));
const TodoList = lazy(() => LOAD.TodoList().then((m) => ({ default: m.TodoList })));
const AccountSheet = lazy(() => LOAD.FinanceSheets().then((m) => ({ default: m.AccountSheet })));
const FcatSheet = lazy(() => LOAD.FinanceSheets().then((m) => ({ default: m.FcatSheet })));
const BudgetSheet = lazy(() => LOAD.FinanceSheets().then((m) => ({ default: m.BudgetSheet })));
const GoalSheet = lazy(() => LOAD.FinanceSheets().then((m) => ({ default: m.GoalSheet })));
const RecurringSheet = lazy(() => LOAD.FinanceSheets().then((m) => ({ default: m.RecurringSheet })));
const SmsFoundSheet = lazy(() => LOAD.SmsFoundSheet().then((m) => ({ default: m.SmsFoundSheet })));
const WCatsSheet = lazy(() => LOAD.CategorySheets().then((m) => ({ default: m.WCatsSheet })));
const WCatSheet = lazy(() => LOAD.CategorySheets().then((m) => ({ default: m.WCatSheet })));
const ProfileSheet = lazy(() => LOAD.ProfileSheet().then((m) => ({ default: m.ProfileSheet })));
const FeedbackSheet = lazy(() => LOAD.FeedbackSheet().then((m) => ({ default: m.FeedbackSheet })));
const HabitCalendarSheet = lazy(() => LOAD.HabitCalendarSheet().then((m) => ({ default: m.HabitCalendarSheet })));
const CatchUpSheet = lazy(() => LOAD.CatchUpSheet().then((m) => ({ default: m.CatchUpSheet })));
const PartnerReportSheet = lazy(() => LOAD.PartnerReportSheet().then((m) => ({ default: m.PartnerReportSheet })));


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
    case 'freview':
      return <FReview />;
    case 'weekreview':
      return <WeekReview />;
    case 'brief':
      return <Brief />;
    case 'todos':
      return <Todos />;
    case 'todolist':
      return <TodoList />;
    case 'feedbackInbox':
      return <FeedbackInbox />;
    case 'privacy':
      return <Privacy />;
    case 'insights':
      return <Insights />;
    case 'search':
      return <Search />;
    case 'partner':
      return <Partner />;
    case 'partnerThread':
      return <PartnerThreadScreen />;
    default:
      return null;
  }
}

function PartnerThreadScreen() {
  const { screenData } = useStore();
  return <PartnerThread module={screenData?.module ?? null} />;
}

function PartnerReportBody() {
  const { sheetData } = useStore();
  return <PartnerReportSheet name={sheetData?.name || 'your partner'} reload={sheetData?.reload || (() => {})} />;
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
    case 'todo':
      return <TodoSheet />;
    case 'health':
      return <HealthSheet />;
    case 'accent':
      return <AccentSheet />;
    case 'assistant':
      return <AssistantSheet />;
    case 'currency':
      return <CurrencySheet />;
    case 'todolistEdit':
      return <TodoListSheet />;
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
    case 'partnerReport':
      return <PartnerReportBody />;
    case 'smsFound':
      return <SmsFoundSheet />;
    default:
      return null;
  }
}

function StatusBar() {
  return (
    <div style={{ height: 54, flex: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 32px 8px', zIndex: 60 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '.01em' }}>9:41</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
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

/**
 * The tab bar, in liquid glass: the three places in one floating capsule and
 * + in a bubble of its own. A glass droplet sits behind the current tab and
 * stretches as it slides to the next. Scrolling down folds the capsule into a
 * single bubble showing where you are, so more of the screen shows; scrolling
 * up, or tapping the bubble, opens it again.
 */
function TabBar({ scroller }: { scroller: React.RefObject<HTMLDivElement | null> }) {
  const { screen, go, open } = useStore();
  const slot = screen === 'home' ? 0 : screen === 'analytics' ? 1 : screen === 'settings' ? 2 : -1;
  // Folded, the bubble shows the current place (or Home, on a screen under it).
  const shownWhenFolded = slot < 0 ? 0 : slot;
  const [folded, setFolded] = useState(false);
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  const capsule = useRef<HTMLDivElement>(null);
  const shine = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<{ x: number; w: number } | null>(null);
  const [squish, setSquish] = useState(0);

  const place = React.useCallback(() => {
    const el = slot >= 0 ? tabRefs.current[slot] : null;
    setDrop(el ? { x: el.offsetLeft + 5, w: el.offsetWidth - 10 } : null);
  }, [slot]);
  React.useLayoutEffect(place, [place, folded]);
  useEffect(() => {
    const el = capsule.current;
    if (!el) return;
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [place]);
  // A new tab: the droplet squashes and stretches on its way over.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else setSquish((n) => n + 1);
    setFolded(false);
  }, [slot, screen]);

  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let lastY = sc.scrollTop;
    const onScroll = () => {
      const y = sc.scrollTop;
      if (y > 80 && y > lastY + 6) setFolded(true);
      else if (y < lastY - 6 || y < 24) setFolded(false);
      lastY = y;
      // The light along the rim moves as the page moves under it.
      shine.current?.style.setProperty('--mx', `${((((y * 0.35) % 160) + 160) % 160) - 30}%`);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, [scroller]);

  const spring = 'cubic-bezier(.3,1.2,.5,1)';
  const tab = (i: number, label: string, path: React.ReactNode, onClick: () => void) => {
    const active = slot === i;
    const shown = !folded || i === shownWhenFolded;
    return (
      <div
        key={i}
        ref={(el) => {
          tabRefs.current[i] = el;
        }}
        tabIndex={shown ? 0 : -1}
        onClick={onClick}
        className="press92"
        role="tab"
        aria-label={label}
        aria-selected={active}
        aria-hidden={!shown}
        style={{
          flex: shown ? '1 1 0%' : '0 0 0px',
          minWidth: 0,
          overflow: 'hidden',
          opacity: shown ? 1 : 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          cursor: 'pointer',
          color: active ? 'var(--indigo)' : 'var(--text)',
          textShadow: 'var(--glass-label-glow)',
          transition: `flex .45s ${spring}, opacity .25s, color .2s`,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" style={{ flex: 'none', fill: 'none', stroke: 'currentColor', strokeWidth: active ? 2.2 : 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
          {path}
        </svg>
        {!folded && <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, letterSpacing: '.01em', whiteSpace: 'nowrap' }}>{label}</span>}
      </div>
    );
  };

  return (
    // The row ignores taps (pointerEvents none) so the space between the
    // capsule and + doesn't block the screen; only the glass is interactive.
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 16px 16px', zIndex: 40, pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, height: 62 }}>
        <div
          ref={capsule}
          role="tablist"
          onClickCapture={(e) => {
            // Folded, the first tap opens the capsule rather than navigating.
            if (folded) {
              e.stopPropagation();
              setFolded(false);
            }
          }}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            shine.current?.style.setProperty('--mx', `${e.clientX - r.left}px`);
          }}
          // The shadow lives here: the glass itself is clipped to its shape.
          style={{ position: 'relative', pointerEvents: 'auto', borderRadius: 31, boxShadow: 'var(--glass-shadow)', flex: folded ? '0 0 62px' : '1 1 0%', minWidth: 62, transition: `flex .45s ${spring}` }}
        >
          {/* Glass layers are siblings, never nested: glass inside glass sees nothing behind. */}
          <div className="glass" data-lens="bar" style={{ position: 'absolute', inset: 0, borderRadius: 31 }} />
          <div
            aria-hidden
            className="glass-rim"
            data-lens="drop"
            style={{
              position: 'absolute',
              top: 5,
              bottom: 5,
              left: 0,
              width: drop?.w ?? 0,
              borderRadius: 999,
              transform: `translateX(${drop?.x ?? 0}px)`,
              opacity: folded || !drop ? 0 : 1,
              backdropFilter: 'blur(12px) saturate(190%)',
              WebkitBackdropFilter: 'blur(12px) saturate(190%)',
              transition: `transform .55s cubic-bezier(.3,1.35,.45,1), width .4s ${spring}, opacity .25s`,
              pointerEvents: 'none',
            }}
          >
            <div
              key={squish}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 'inherit',
                background: 'var(--glass-drop)',
                boxShadow: 'inset 0 0 10px var(--glass-drop-glow), 0 4px 14px -6px rgba(10,12,30,.4)',
                animation: squish ? 'squish .55s cubic-bezier(.3,1.2,.4,1)' : undefined,
              }}
            />
          </div>
          <div
            ref={shine}
            aria-hidden
            style={{ position: 'absolute', inset: 0, borderRadius: 31, pointerEvents: 'none', background: 'radial-gradient(110px 70px at var(--mx, 30%) 10%, var(--glass-shine), transparent 70%)' }}
          />
          <div style={{ position: 'relative', display: 'flex', height: '100%', borderRadius: 31, overflow: 'hidden' }}>
            {tab(0, t('Home'), <path d="M4 11l8-7 8 7M6 9.5V19h4.5v-5h3v5H18V9.5" />, () => go('home'))}
            {tab(1, t('Analytics'), <path d="M4 20V11M10 20V5M16 20v-6M4 20h16" />, () => go('analytics'))}
            {tab(
              2,
              t('Profile'),
              <>
                <circle cx="12" cy="8" r="3.4" />
                <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
              </>,
              () => go('settings')
            )}
          </div>
        </div>
        {/* Add: the primary action, in its own bubble. */}
        <div
          tabIndex={0}
          onClick={() => open('chooser')}
          className="press92"
          role="button"
          aria-label={t('Add an entry')}
          style={{ position: 'relative', pointerEvents: 'auto', width: 62, height: 62, flex: 'none', borderRadius: '50%', boxShadow: 'var(--glass-shadow)', marginInlineStart: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <div className="glass" data-lens="fab" aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: '50%' }} />
          <svg width="24" height="24" viewBox="0 0 24 24" style={{ position: 'relative', fill: 'none', stroke: 'var(--text)', strokeWidth: 2.3, strokeLinecap: 'round' }} aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
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
      <div onClick={() => closePassword(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,14,.38)', animation: 'fadeIn .2s ease', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
      <div className="glass-strong" data-lens="dialog" style={{ position: 'relative', borderRadius: 'calc(24px * var(--sq))', padding: '24px 24px 20px', width: '100%', maxWidth: 320, animation: 'fadeUp .25s ease' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em', textAlign: 'center' }}>{passwordState.title}</div>
        {passwordState.message && (
          <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5, textAlign: 'center' }}>{passwordState.message}</div>
        )}
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value && closePassword(value)}
          placeholder={t('Your password')}
          style={{ width: '100%', height: 50, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 15, color: 'var(--text)', outline: 'none', marginTop: 16 }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <div role="button" tabIndex={0} onClick={() => closePassword(null)} className="press" style={{ flex: 1, height: 48, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
            {t('Cancel')}
          </div>
          <div role="button" tabIndex={0}
            onClick={() => value && closePassword(value)}
            className="press"
            style={{ flex: 1, height: 48, borderRadius: 'calc(14px * var(--sq))', background: value ? 'var(--danger)' : 'color-mix(in srgb,var(--danger) 40%,var(--surface))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: '#fff', cursor: value ? 'pointer' : 'default' }}
          >
            {passwordState.confirmLabel || t('Confirm')}
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
  const [offline, setOffline] = useState(connectivity() === 'offline');
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    const off = subscribeConnectivity(() => setOffline(connectivity() === 'offline'));
    return () => {
      clearTimeout(t);
      off();
    };
  }, []);
  // The same near-black as the native launch screen and the welcome screen,
  // so opening the app is one continuous dark moment rather than three colours.
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f0f0f3',
        background: '#0c0c0f',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fadeUp .6s ease' }}>
        {/* The mark from the launcher icon, its sun going round while it loads. */}
        <OrbitMark size={96} spin={!error} style={{ marginBottom: 32 }} />

        <div className="display" style={{ fontSize: 40, lineHeight: 1 }}>{t('Orbit')}</div>

        {error ? (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,.85)', marginBottom: 16, maxWidth: 270, lineHeight: 1.5 }}>
              {!apiBase
                ? t('This build has no backend address, so it can never reach the server. It needs to be rebuilt with the backend URL.')
                : offline
                  ? t('You\'re offline. Orbit needs a connection the first time you open it on a device. After that it works without one.')
                  : t('Couldn\'t reach the server. It sleeps when unused, so the first open of the day can take up to a minute.')}
            </div>
            {/* Which backend this build actually points at. Without it, a build
                configured with the wrong URL — or none at all — is invisible and
                looks exactly like a server that won't wake up. */}
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginBottom: 16, maxWidth: 280, wordBreak: 'break-all', lineHeight: 1.45 }}>
              {apiBase || t('no backend URL configured')}
            </div>
            <div role="button" tabIndex={0} onClick={onRetry} className="press" style={{ display: 'inline-flex', background: '#f0f0f3', color: '#0c0c0f', height: 46, padding: '0 24px', borderRadius: 'calc(14px * var(--sq))', alignItems: 'center', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 24px -10px rgba(0,0,0,.4)' }}>{t('Try again')}</div>
          </div>
        ) : (
          <>
            <div style={{ width: 120, height: 3, borderRadius: 999, overflow: 'hidden', marginTop: 24, background: 'rgba(255,255,255,.2)' }}>
              <div style={{ width: '40%', height: '100%', borderRadius: 999, background: '#fff', animation: 'loadBar 1.3s ease-in-out infinite' }} />
            </div>
            {slow && (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', marginTop: 16, maxWidth: 250, textAlign: 'center', lineHeight: 1.5, animation: 'fadeIn .4s ease' }}>
                {offline
                  ? t('You\'re offline. Waiting for a connection.')
                  : t('Waking up the server. This can take about 30 seconds after a quiet spell.')}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function App() {
  const { ready, authed, state, screen, sheet, toast, toastUndo, runUndo, closeSheet, open, mutateOpt, booting, bootError, retryBoot, go, back, confirmState, closeConfirm, passwordState, report, closeReport, applyState, showToast } = useStore();
  // Dark until an account says otherwise: Orbit starts dark, and the
  // theme can be changed in Profile.
  const [localTheme, setLocalTheme] = useState<'light' | 'dark'>('dark');

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

  // The morning brief's notifications, written again whenever what they'd say
  // could have changed. Its own setting, independent of the evening reminder.
  const hasData = !!state && hasBriefData(state);
  const tasksKey = state ? state.todos.filter((x) => x.doneTs == null && x.due).map((x) => x.due).join(',') : '';
  useEffect(() => {
    if (authed && state) scheduleBriefs(briefSchedule(state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, habitsKey, billsKey, tasksKey, hasData, state?.profile.modules]);


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

  // The chosen accent replaces the app's primary colour everywhere by remapping
  // the --indigo token the UI already uses. A colour from the wheel is
  // adjusted per theme so it reads against the page (lib/color.ts); the older
  // preset names still map to their tokens.
  const accent = (authed && state ? state.profile.accent : 'indigo') || 'indigo';
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('.orbit').forEach((root) => {
      root.style.removeProperty('--on-accent');
      if (isHex(accent)) {
        const a = accentFor(accent, theme);
        root.style.setProperty('--indigo', a.accent);
        root.style.setProperty('--on-accent', a.onAccent);
      } else if (accent === 'indigo') root.style.removeProperty('--indigo');
      else root.style.setProperty('--indigo', `var(--${accent})`);
    });
  }, [accent, authed, theme]);

  // The status and navigation bar icons, matched to what's behind them. On
  // Android 15 and later the bars are transparent and the app draws under
  // them, so with nothing set, light theme showed white clock and battery
  // icons on a light background. The welcome and intro screens are dark
  // whatever the theme.
  const introShowing = authed && !!state && !state.profile.introDone;
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const darkBehind = theme === 'dark' || !authed || introShowing;
    SystemBars.setStyle({ style: darkBehind ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  }, [theme, authed, introShowing]);

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

  // ---- Bank messages ----
  // Read the phone's inbox on launch, on every return to the foreground, and
  // when a bank message arrives while the app is open. The inbox keeps the
  // messages, so a scan finds everything since the last one, including what
  // arrived while the phone was off; the native receiver only says when to
  // look. Does nothing at all unless the user turned it on.
  const smsState = React.useRef(state);
  smsState.current = state;
  // Turned on from onboarding or Finances, not only at launch: listen from then.
  const [smsOn, setSmsOn] = useState(smsEnabled());
  useEffect(() => {
    const on = () => setSmsOn(smsEnabled());
    window.addEventListener(SMS_CHANGED, on);
    return () => window.removeEventListener(SMS_CHANGED, on);
  }, []);
  useEffect(() => {
    if (!authed || !smsOn) return;
    const scan = () => {
      const cur = smsState.current;
      if (!cur) return;
      syncSms(cur, (items) => api.importSms(items), (base) => api.fx(base))
        .then(async (r) => {
          if (r.state) applyState(r.state);
          // Payments read from a message that says it was declined come out.
          const gone = await removeDeclined(r.state || cur, (id) => api.deleteTxn(id));
          if (gone.removed) applyState(gone.state);
          if (r.added > 0) track('sms_import');
          if (gone.removed) showToast(tn(gone.removed, 'Removed a declined payment: the bank said it didn’t go through', 'Removed {n} declined payments: the bank said they didn’t go through'));
          else if (r.added > 0) showToast(tn(r.added, '{n} payment added from your messages', '{n} payments added from your messages'));
        })
        .catch(() => {});
    };
    scan();
    ensureLiveSms();
    const onVisible = () => {
      if (document.visibilityState === 'visible') scan();
    };
    document.addEventListener('visibilitychange', onVisible);
    // The messaging app writes the message to the inbox just after the
    // broadcast that announced it, so give it a moment before reading.
    let t: ReturnType<typeof setTimeout> | undefined;
    const stop = onSmsArrived(() => {
      clearTimeout(t);
      t = setTimeout(scan, 2500);
    });
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      stop();
      clearTimeout(t);
    };
  }, [authed, smsOn, applyState, showToast]);

  // ---- App lock ----
  // Locked from the start when it's on, and again after a minute away. Short
  // trips (the unlock prompt itself, a permission dialog, a glance at a
  // message) don't count.
  const [locked, setLocked] = useState(() => lockSupported() && lockEnabled());
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (lockEnabled() && hiddenAt.current != null && Date.now() - hiddenAt.current > RELOCK_AFTER) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // ---- The rest of the app, fetched once the first screen is up ----
  useEffect(() => {
    const t = setTimeout(warmLazyScreens, 2500);
    return () => clearTimeout(t);
  }, []);

  // ---- Usage counts ----
  // An open each time the app comes to the front, and what's been counted sent
  // as it goes to the back (or a few seconds after launch). See lib/usage.
  const shareUsage = state?.profile.shareUsage !== false;
  useEffect(() => {
    setUsageSharing(shareUsage);
  }, [shareUsage]);
  useEffect(() => {
    if (!authed) return;
    const send = () => flushUsage((day, counts) => api.usage(day, counts as Record<string, number>));
    track('open');
    const first = setTimeout(send, 8000);
    const onVis = () => {
      if (document.visibilityState === 'visible') track('open');
      else send();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [authed]);

  // ---- Sleep and workouts from Health Connect ----
  // Quietly, when Orbit opens or comes back to the front, at most every 15
  // minutes. A failed sync says nothing: the next open tries again, and the
  // Fitbit screen in Profile shows when it last worked.
  const healthBusy = useRef(false);
  useEffect(() => {
    if (!authed) return;
    const run = () => {
      const cur = liveState.current;
      if (!cur || healthBusy.current || document.visibilityState !== 'visible' || !syncDue()) return;
      healthBusy.current = true;
      syncHealth(cur)
        .then((r) => {
          if (r && (r.nights || r.workouts)) {
            applyState(r.state);
            showToast(t('Imported {what}', { what: [r.nights ? tn(r.nights, 'one night', '{n} nights') : '', r.workouts ? tn(r.workouts, 'one workout', '{n} workouts') : ''].filter(Boolean).join(' · ') }));
          }
        })
        .catch(() => {})
        .finally(() => {
          healthBusy.current = false;
        });
    };
    const first = setTimeout(run, 2500);
    document.addEventListener('visibilitychange', run);
    return () => {
      clearTimeout(first);
      document.removeEventListener('visibilitychange', run);
    };
  }, [authed, applyState, showToast]);

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
      onOpen: (screen) => go(screen as Parameters<typeof go>[0]),
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
          t('Checked off')
        ).catch(() => {});
      },
    });
  }, [mutateOpt]);

  // ---- Home-screen shortcuts ----
  // A cold start arrives before the session is restored, so the action waits
  // for `ready` rather than firing at a screen that isn't mounted yet.
  const [shortcut, setShortcut] = useState<ShortcutTarget | null>(null);
  useEffect(() => listenForShortcuts(setShortcut), []);
  useEffect(() => {
    if (!shortcut || !ready || !authed) return;
    setShortcut(null);
    if (shortcut.kind === 'screen') {
      // Tapping an analytics widget lands on the screen it summarises.
      go(shortcut.screen);
      return;
    }
    if (shortcut.action === 'workout') open('workout');
    else if (shortcut.action === 'sleep') open('sleep');
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
    // The tabs run right to left in Arabic, so the next one is a swipe to the right.
    const next = TAB_ORDER[i + ((isRTL() ? dx > 0 : dx < 0) ? 1 : -1)];
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
  const nav = useRef({ screen, sheet, authed, report });
  nav.current = { screen, sheet, authed, report };

  // Liquid glass: every element marked data-lens gets its bent rim.
  useEffect(() => startLiquid(document.body), []);
  const rootScreens = ['home', 'welcome', 'signin'];

  useEffect(() => {
    // Seed one history entry so the first Back press is caught, not an instant exit.
    window.history.pushState({ orbit: true }, '');
    const onPop = () => {
      const { screen: sc, sheet: sh, report: rp } = nav.current;
      // A story report sits above everything: Back closes it first.
      if (rp) {
        closeReport();
        window.history.pushState({ orbit: true }, ''); // re-arm
        return;
      }
      if (sh) {
        closeSheet();
        window.history.pushState({ orbit: true }, ''); // re-arm
        return;
      }
      if (!rootScreens.includes(sc)) {
        back();
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
    padding: '8px 16px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all .2s',
    fontFamily: 'var(--font-ui)',
    border: 'none',
    ...(active ? { background: '#14151A', color: '#fff' } : { background: 'transparent', color: '#3a3b42' }),
  });

  const appInner = (
    <>
      {!mobile && (
        <div style={{ position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)', width: 118, height: 34, background: '#000', borderRadius: 'calc(20px * var(--sq))', zIndex: 80 }} />
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
          <div style={{ height: pull, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 13, fontWeight: 600 }}>
            {refreshing ? t('Refreshing…') : pull > 64 ? t('Release to refresh') : t('Pull to refresh')}
          </div>
        )}
        {/* Keyed on the screen so a tab change replays the slide-in from the
            side the swipe came from. */}
        {ready && <SyncStatus />}
        <div key={screen} style={slide ? { animation: `${slide === 'l' ? 'slideInR' : 'slideInL'} .26s cubic-bezier(.2,.8,.3,1)` } : undefined}>
          {ready ? (
            <Suspense fallback={null}>
              <CurrentScreen />
            </Suspense>
          ) : null}
        </div>
      </div>

      {/* Messages rise from the bottom, just above the tab bar where there is
          one, so Undo is where the thumb already is and nothing covers a
          page's title or back button. Taps go straight through to whatever is
          underneath (a Save button, say) except on Undo itself. With a sheet
          open the bottom is the sheet's, so they show at the top instead. */}
      {toast && (
        <div style={{ position: 'absolute', ...(sheet ? { top: mobile ? 'calc(env(safe-area-inset-top) + 14px)' : 66 } : { bottom: showTabs ? 92 : 24 }), pointerEvents: 'none', left: 0, right: 0, marginInline: 'auto', zIndex: 95, color: 'var(--text)', padding: '12px 20px', borderRadius: (toast || '').length > 40 ? 'calc(18px * var(--sq))' : 999, fontSize: 15, fontWeight: 600, lineHeight: 1.4, animation: 'fadeUp .3s ease', display: 'flex', alignItems: 'center', gap: 8, width: 'max-content', maxWidth: 'calc(100% - 32px)', whiteSpace: 'normal' }} className="glass-strong" data-lens="toast">
          <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
            <path d="M4 9.5l3.4 3.4L14 5" />
          </svg>
          {toast}
          {toastUndo && (
            <span tabIndex={0}
              onClick={runUndo}
              role="button"
              aria-label={t('Undo')}
              className="hit"
              style={{ pointerEvents: 'auto',marginInlineStart: 4, paddingInlineStart: 12, borderInlineStart: '1px solid var(--border)', fontWeight: 700, color: 'var(--indigo)', cursor: 'pointer' }}
            >
              {t('Undo')}
            </span>
          )}
        </div>
      )}

      {showTabs && <TabBar scroller={scrollRef} />}

      {sheet && (
        // The sheet floats clear of the edges, the way liquid-glass sheets do.
        <div style={{ position: 'absolute', inset: 0, zIndex: 90, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: mobile ? '0 8px calc(8px + env(safe-area-inset-bottom))' : '0 8px 8px' }}>
          <div onClick={closeSheet} style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,14,.38)', animation: 'fadeIn .25s ease', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
          <div className="glass-strong" data-lens="sheet" style={{ position: 'relative', borderRadius: 'calc(36px * var(--sq))', animation: 'sheetUp .34s cubic-bezier(.22,1,.36,1)', maxHeight: '92%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 2px', flex: 'none' }}>
              <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--border)' }} />
            </div>
            <div style={{ overflowY: 'auto', paddingBottom: 4, borderRadius: '0 0 calc(36px * var(--sq)) calc(36px * var(--sq))' }}>
              <Suspense fallback={null}>
                <SheetBody />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {exitPrompt && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 98, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <div onClick={cancelExit} style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,14,.38)', animation: 'fadeIn .2s ease', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
          <div className="glass-strong" data-lens="dialog" style={{ position: 'relative', borderRadius: 'calc(24px * var(--sq))', padding: '24px 24px 20px', width: '100%', maxWidth: 320, animation: 'fadeUp .25s ease', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em' }}>{t('Exit Orbit?')}</div>
            <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>{t('Are you sure you want to close the app?')}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
              <div role="button" tabIndex={0} onClick={cancelExit} className="press" style={{ flex: 1, height: 48, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                {t('Stay')}
              </div>
              <div role="button" tabIndex={0} onClick={confirmExit} className="press" style={{ flex: 1, height: 48, borderRadius: 'calc(14px * var(--sq))', background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                {t('Exit')}
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <div onClick={() => closeConfirm(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,14,.38)', animation: 'fadeIn .2s ease', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
          <div className="glass-strong" data-lens="dialog" style={{ position: 'relative', borderRadius: 'calc(24px * var(--sq))', padding: '24px 24px 20px', width: '100%', maxWidth: 320, animation: 'fadeUp .25s ease', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em' }}>{confirmState.title}</div>
            {confirmState.message && (
              <div dir="auto" style={{ fontSize: 15, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-line', overflowWrap: 'anywhere', maxHeight: '50vh', overflowY: 'auto' }}>{confirmState.message}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
              <div role="button" tabIndex={0} onClick={() => closeConfirm(false)} className="press" style={{ flex: 1, height: 48, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                {t('Cancel')}
              </div>
              <div role="button" tabIndex={0} onClick={() => closeConfirm(true)} className="press" style={{ flex: 1, height: 48, borderRadius: 'calc(14px * var(--sq))', background: confirmState.danger === false ? 'var(--indigo)' : 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                {confirmState.confirmLabel || t('Delete')}
              </div>
            </div>
          </div>
        </div>
      )}

      {passwordState && <PasswordPrompt />}

      {/* First run: explain the app before asking about reminders. */}
      {locked && authed && <LockScreen onUnlocked={() => setLocked(false)} />}
      {authed && state && !state.profile.introDone && (
        <Suspense fallback={null}>
          <Intro />
        </Suspense>
      )}
      {authed && state && <MoneyWatcher />}

      {report && state && (
        <Suspense fallback={null}>
          <StoryReport kind={report.kind} offset={report.offset} onClose={closeReport} />
        </Suspense>
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
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(8px)', borderRadius: 999, padding: 4, boxShadow: '0 2px 12px rgba(20,21,30,.12)' }}>
        <div role="button" tabIndex={0} aria-pressed={theme === 'light'} onClick={() => setTheme('light')} style={pill(theme === 'light')}>{t('Light')}</div>
        <div role="button" tabIndex={0} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} style={pill(theme === 'dark')}>{t('Dark')}</div>
        {/* Someone who chose the phone layout on a computer gets back to the desktop site here. */}
        <div role="button" tabIndex={0} onClick={openDesktopSite} onKeyDown={(e) => e.key === 'Enter' && openDesktopSite()} style={pill(false)}>{t('Desktop site')}</div>
      </div>

      <div style={{ width: 414, height: 868, background: '#08080a', borderRadius: 56, padding: 12, boxShadow: '0 60px 120px -30px rgba(15,16,24,.6), 0 0 0 2px rgba(255,255,255,.05) inset', flex: 'none' }}>
        <div className="orbit" data-theme={theme} style={{ position: 'relative', width: 390, height: 844, borderRadius: 44, overflow: 'hidden', background: 'var(--app-bg)', display: 'flex', flexDirection: 'column', color: 'var(--text)' }}>
          {appInner}
        </div>
      </div>

      <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, color: '#7c808a', letterSpacing: '.04em' }}>
        {t('orbit · tap anything, it\'s live')}
      </div>
    </div>
  );
}

/** The server sends computers the desktop site unless this cookie says otherwise. */
function openDesktopSite(): void {
  document.cookie = 'orbit_view=desktop; path=/; max-age=31536000; samesite=lax';
  window.location.href = '/';
}

function detectMobile(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari standalone flag
    (window.navigator as any).standalone === true;
  return standalone || window.innerWidth < 700;
}
