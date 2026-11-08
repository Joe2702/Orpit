import React from 'react';
import type { Screen } from '../store';
import type { AppState } from '../types';
import { enabled } from '../lib/modules';
import { tk } from '../i18n';

// Every place the website's sidebar, command palette and "g then a letter"
// shortcuts can take you. One list, so the three never disagree.

export type DeskIcon =
  | 'home' | 'analytics' | 'habits' | 'workouts' | 'sleep' | 'money' | 'todos' | 'counters'
  | 'txns' | 'budgets' | 'accounts' | 'goals' | 'bills' | 'finsights'
  | 'brief' | 'week' | 'insights' | 'trophy' | 'settings' | 'search' | 'plus' | 'sun' | 'moon'
  | 'download' | 'keyboard' | 'collapse' | 'check' | 'partner' | 'review' | 'logout';

export interface DeskPlace {
  screen: Screen;
  /** An English key, translated where it's shown. */
  label: string;
  icon: DeskIcon;
  /** The tracker it belongs to; hidden when the person turned that tracker off. */
  mod?: string;
  /** The letter after "g". */
  key?: string;
  group: 'main' | 'track' | 'money' | 'reflect';
}

export const PLACES: DeskPlace[] = [
  { screen: 'home', label: tk('Home'), icon: 'home', key: 'h', group: 'main' },
  { screen: 'analytics', label: tk('Analytics'), icon: 'analytics', key: 'a', group: 'main' },
  { screen: 'habits', label: tk('Habits'), icon: 'habits', mod: 'habits', key: 'd', group: 'track' },
  { screen: 'workouts', label: tk('Workouts'), icon: 'workouts', mod: 'workouts', key: 'w', group: 'track' },
  { screen: 'sleep', label: tk('Sleep'), icon: 'sleep', mod: 'sleep', key: 's', group: 'track' },
  { screen: 'todos', label: tk('To-dos'), icon: 'todos', mod: 'todos', key: 't', group: 'track' },
  { screen: 'counters', label: tk('Counters'), icon: 'counters', mod: 'counters', key: 'c', group: 'track' },
  { screen: 'finances', label: tk('Overview'), icon: 'money', mod: 'finances', key: 'm', group: 'money' },
  { screen: 'ftxns', label: tk('Transactions'), icon: 'txns', mod: 'finances', key: 'x', group: 'money' },
  { screen: 'fbudgets', label: tk('Budgets'), icon: 'budgets', mod: 'finances', group: 'money' },
  { screen: 'faccounts', label: tk('Accounts'), icon: 'accounts', mod: 'finances', group: 'money' },
  { screen: 'fgoals', label: tk('Goals'), icon: 'goals', mod: 'finances', group: 'money' },
  { screen: 'frecurring', label: tk('Bills & subscriptions'), icon: 'bills', mod: 'finances', group: 'money' },
  { screen: 'finsights', label: tk('Spending insights'), icon: 'finsights', mod: 'finances', group: 'money' },
  { screen: 'brief', label: tk('Morning brief'), icon: 'brief', key: 'b', group: 'reflect' },
  { screen: 'weekreview', label: tk('Week review'), icon: 'week', key: 'r', group: 'reflect' },
  { screen: 'insights', label: tk('Insights'), icon: 'insights', key: 'i', group: 'reflect' },
  { screen: 'achievements', label: tk('Achievements'), icon: 'trophy', group: 'reflect' },
  { screen: 'partner', label: tk('Partner'), icon: 'partner', group: 'reflect' },
  { screen: 'settings', label: tk('Profile & settings'), icon: 'settings', key: 'p', group: 'main' },
];

export const GROUP_LABEL: Record<DeskPlace['group'], string> = {
  main: '',
  track: tk('Track'),
  money: tk('Money'),
  reflect: tk('Reflect'),
};

export function placesFor(state: AppState): DeskPlace[] {
  return PLACES.filter((p) => !p.mod || enabled(state, p.mod));
}

/** Which sidebar entry a screen lives under: a list of tasks is under To-dos, an added payment under Money. */
export function sectionOf(screen: Screen): Screen {
  if (screen === 'todolist') return 'todos';
  if (screen === 'faddtx' || screen === 'fcats') return 'ftxns';
  if (screen === 'freview') return 'ftxns';
  if (screen === 'partnerThread') return 'partner';
  if (screen === 'search') return 'home';
  return screen;
}

const P: Record<DeskIcon, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  analytics: <path d="M5 19V11M10 19V6M15 19v-5M20 19V9" />,
  habits: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.6 12.2l2.3 2.3 4.6-4.9" />
    </>
  ),
  workouts: <path d="M6 9v6M9 7v10M15 7v10M18 9v6M9 12h6" />,
  sleep: <path d="M19.5 13.4A8 8 0 1 1 10.6 4.5a6.2 6.2 0 0 0 8.9 8.9Z" />,
  money: <path d="M12 4v16M15.8 7.2H10.2a2.8 2.8 0 0 0 0 5.6h3.6a2.8 2.8 0 0 1 0 5.6H8" />,
  todos: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </>
  ),
  counters: <path d="M9 4l-1.4 16M16.4 4 15 20M5 9h15M4 15h15" />,
  txns: <path d="M4 7h16M4 12h16M4 17h10" />,
  budgets: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v8l5.6 5.6" />
    </>
  ),
  accounts: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
      <path d="M3.5 10h17M7 14.5h3" />
    </>
  ),
  goals: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r=".6" />
    </>
  ),
  bills: <path d="M5.5 9.5a6.5 6.5 0 0 1 11.3-3.1M18 4v3.4h-3.4M18.5 14.5a6.5 6.5 0 0 1-11.3 3.1M6 20v-3.4h3.4" />,
  finsights: <path d="M4 18l5-6 4 3 7-9M15 6h5v5" />,
  brief: (
    <>
      <path d="M4 17h16M7 17a5 5 0 0 1 10 0" />
      <path d="M12 6.5V8.5M5.6 9.6l1.4 1.4M18.4 9.6 17 11" />
    </>
  ),
  week: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  insights: <path d="M12 3.5a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1V17h5v-.6c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3.5ZM10 20h4" />,
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v3.5M9 20h6M10 16.5h4" />,
  settings: (
    <>
      <circle cx="12" cy="9" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.4-4.4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 13.4A8 8 0 1 1 10.6 4.5a6.2 6.2 0 0 0 8.9 8.9Z" />,
  download: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
  keyboard: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M8 14h8" />
    </>
  ),
  collapse: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  partner: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <circle cx="16.5" cy="10" r="2.6" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M14 19a4.4 4.4 0 0 1 7-3.6" />
    </>
  ),
  review: <path d="M4 12.5l4.5 4.5L20 5.5M4 7h6" />,
  logout: <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />,
};

export function DIcon({ name, size = 19, sw = 1.85, style }: { name: DeskIcon; size?: number; sw?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ flex: 'none', fill: 'none', stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round', ...style }}
    >
      {P[name]}
    </svg>
  );
}

/** "⌘" on a Mac, "Ctrl" everywhere else. */
export const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';

export function Kbd({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <kbd className="desk-kbd" style={style}>{children}</kbd>;
}
