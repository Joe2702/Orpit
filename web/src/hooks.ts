import { useMemo } from 'react';
import { useStore } from './store';
import { derive, deriveHabits } from './lib/derive';
import type { AppState } from './types';

/** Convenience hook: assumes an authenticated state exists (true on all app screens). */
export function useData() {
  const { state, range, rangeOffset } = useStore();
  const s = state as AppState;
  // Re-derive when the day changes, too: a screen left open past midnight
  // otherwise keeps calling yesterday "today".
  const day = new Date().toDateString();
  const d = useMemo(() => derive(s, range, rangeOffset), [s, range, rangeOffset, day]);
  const h = useMemo(() => deriveHabits(s, range, rangeOffset), [s, range, rangeOffset, day]);
  return { state: s, d, h };
}
