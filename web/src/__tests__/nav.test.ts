import { describe, it, expect } from 'vitest';
import { nextHistory, type NavEntry } from '../lib/nav';

// Walk a path of screens the way go() does, returning the stack at the end.
const walk = (path: string[]) => {
  let hist: NavEntry[] = [];
  let cur: NavEntry = { s: path[0], data: null };
  for (const s of path.slice(1)) {
    hist = nextHistory(hist, cur, s);
    cur = { s, data: null };
  }
  return hist.map((h) => h.s);
};

describe('going back', () => {
  it('returns to Analytics after opening a tracker from it', () => {
    expect(walk(['home', 'analytics', 'finances'])).toEqual(['analytics']);
  });

  it('steps back rather than looping when a back arrow names the parent', () => {
    expect(walk(['analytics', 'finances', 'ftxns', 'finances'])).toEqual(['analytics']);
    expect(walk(['home', 'todos', 'todolist', 'todos'])).toEqual(['home']);
  });

  it('starts afresh at a tab', () => {
    expect(walk(['home', 'workouts', 'analytics'])).toEqual([]);
    expect(walk(['home', 'todos', 'todolist', 'settings', 'partner'])).toEqual(['settings']);
  });
});
