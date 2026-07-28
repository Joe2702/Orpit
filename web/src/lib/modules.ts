import type { AppState } from '../types';

// Which trackers the user chose to see. `null` (the default) means everything.
export function enabled(s: AppState, key: string): boolean {
  const m = s.profile.modules;
  return !m || m.includes(key);
}
