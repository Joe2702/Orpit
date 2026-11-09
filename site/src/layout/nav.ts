import type { AppState } from '@core/types';
import { enabled } from '@core/lib/modules';
import { tk } from '../i18n';
import type { IconName } from '../ui/Icon';

// Every page of the website, for the top bar, the command menu and the "g then
// a letter" shortcuts.

export interface Place {
  to: string;
  label: string;
  icon: IconName;
  /** Shown if any of these trackers is on. */
  mods?: string[];
  key?: string;
  /** In the top bar (the rest are tabs inside a page). */
  top?: boolean;
  parent?: string;
}

export const PLACES: Place[] = [
  { to: '/', label: tk('Overview'), icon: 'overview', key: 'o', top: true },
  { to: '/habits', label: tk('Habits'), icon: 'habits', mods: ['habits', 'counters'], key: 'h', top: true },
  { to: '/habits/counters', label: tk('Counters'), icon: 'counter', mods: ['counters'], key: 'c', parent: tk('Habits') },
  { to: '/fitness', label: tk('Fitness'), icon: 'fitness', mods: ['workouts', 'sleep'], key: 'f', top: true },
  { to: '/fitness/sleep', label: tk('Sleep'), icon: 'sleep', mods: ['sleep'], key: 'z', parent: tk('Fitness') },
  { to: '/money', label: tk('Money'), icon: 'money', mods: ['finances'], key: 'm', top: true },
  { to: '/money/transactions', label: tk('Transactions'), icon: 'list', mods: ['finances'], key: 'x', parent: tk('Money') },
  { to: '/money/accounts', label: tk('Accounts'), icon: 'wallet', mods: ['finances'], key: 'a', parent: tk('Money') },
  { to: '/money/budgets', label: tk('Budgets'), icon: 'pie', mods: ['finances'], key: 'b', parent: tk('Money') },
  { to: '/money/goals', label: tk('Goals'), icon: 'target', mods: ['finances'], parent: tk('Money') },
  { to: '/money/bills', label: tk('Bills & subscriptions'), icon: 'repeat', mods: ['finances'], parent: tk('Money') },
  { to: '/money/categories', label: tk('Categories'), icon: 'tag', mods: ['finances'], parent: tk('Money') },
  { to: '/tasks', label: tk('Tasks'), icon: 'tasks', mods: ['todos'], key: 't', top: true },
  { to: '/insights', label: tk('Insights'), icon: 'insights', key: 'i', top: true },
  { to: '/settings', label: tk('Settings'), icon: 'settings', key: 's' },
];

export const visiblePlaces = (s: AppState) => PLACES.filter((p) => !p.mods || p.mods.some((m) => enabled(s, m)));

/** Open the phone app's layout on this computer instead (the server reads the cookie). */
export function switchToPhone(): void {
  document.cookie = 'orbit_view=phone; path=/; max-age=31536000; samesite=lax';
  window.location.href = '/';
}

export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
