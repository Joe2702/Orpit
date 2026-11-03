// Where each screen was opened from, so Back returns there.
//
// The tabs (Home, Analytics, Profile) are roots: going to one starts afresh.
// Going to the screen just below on the stack is a step back, not a new
// level, so a list's back arrow that names its parent can't pile up a loop.

export interface NavEntry {
  s: string;
  data: unknown;
}

export const ROOTS = ['home', 'analytics', 'settings'];

export function nextHistory(hist: NavEntry[], from: NavEntry, to: string): NavEntry[] {
  if (ROOTS.includes(to)) return [];
  if (to === from.s) return hist;
  const top = hist[hist.length - 1];
  if (top && top.s === to) return hist.slice(0, -1);
  return [...hist, from].slice(-20);
}
