import { useMemo } from 'react';
import { useStore } from './store';
import { derive, deriveHabits } from './lib/derive';
import type { AppState } from './types';

/** Convenience hook: assumes an authenticated state exists (true on all app screens). */
export function useData() {
  const { state, range } = useStore();
  const s = state as AppState;
  const d = useMemo(() => derive(s, range), [s, range]);
  const h = useMemo(() => deriveHabits(s), [s]);
  return { state: s, d, h };
}
