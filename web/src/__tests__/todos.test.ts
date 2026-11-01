import { describe, it, expect } from 'vitest';
import { dueNow, dueLabel, listCounts, openIn, doneIn } from '../lib/todos';
import { reconcile } from '../lib/layout';
import { isQueueable } from '../lib/offline';
import { withDefaults } from '../store';
import type { AppState, Todo } from '../types';

// Saturday 31 October 2026, mid-morning.
const NOW = new Date(2026, 9, 31, 10).getTime();
const todo = (id: string, listId: string, due: string | null, extra: Partial<Todo> = {}): Todo => ({
  id,
  listId,
  title: id,
  note: null,
  due,
  doneTs: null,
  sort: 0,
  ts: 0,
  ...extra,
});
const state = (todos: Todo[]) =>
  ({
    todoLists: [
      { id: 'uni', name: 'Uni', color: 'blue', icon: 'check' },
      { id: 'gym', name: 'Training', color: 'coral', icon: 'check' },
    ],
    todos,
  }) as unknown as AppState;

describe('to-do lists', () => {
  it('puts what’s due now first: late, oldest first, then today in list order', () => {
    const s = state([
      todo('gym-today', 'gym', '2026-10-31'),
      todo('uni-today', 'uni', '2026-10-31'),
      todo('late-1', 'gym', '2026-10-29'),
      todo('late-2', 'uni', '2026-10-30'),
      todo('tomorrow', 'uni', '2026-11-01'),
      todo('undated', 'uni', null),
      todo('done-late', 'uni', '2026-10-28', { doneTs: NOW - 1000 }),
      todo('orphan', 'gone', '2026-10-31'),
    ]);
    expect(dueNow(s, NOW).map((x) => x.id)).toEqual(['late-1', 'late-2', 'uni-today', 'gym-today']);
  });

  it('says when a task is due in words, and how urgent it is', () => {
    expect(dueLabel('2026-10-30', NOW)).toEqual({ kind: 'late', text: 'Yesterday' });
    expect(dueLabel('2026-10-20', NOW).kind).toBe('late');
    expect(dueLabel('2026-10-31', NOW)).toEqual({ kind: 'today', text: 'Today' });
    expect(dueLabel('2026-11-01', NOW)).toEqual({ kind: 'tomorrow', text: 'Tomorrow' });
    expect(dueLabel('2026-11-04', NOW)).toEqual({ kind: 'soon', text: 'Wednesday' });
    expect(dueLabel('2026-11-20', NOW)).toEqual({ kind: 'later', text: 'Nov 20' });
  });

  it('counts open, late and recently done per list, and keeps each list’s order', () => {
    const s = state([
      todo('b', 'uni', '2026-10-25', { sort: 2 }),
      todo('a', 'uni', null, { sort: 1 }),
      todo('c', 'uni', null, { doneTs: NOW - 5000 }),
      todo('d', 'uni', null, { doneTs: NOW - 1000 }),
      todo('e', 'gym', null),
    ]);
    expect(listCounts(s, 'uni', NOW)).toEqual({ open: 2, done: 2, late: 1 });
    expect(openIn(s, 'uni').map((x) => x.id)).toEqual(['a', 'b']);
    expect(doneIn(s, 'uni').map((x) => x.id)).toEqual(['d', 'c']);
  });
});

describe('fitting the to-do section in', () => {
  it('puts a new Home section after the one before it, not at the bottom', () => {
    expect(reconcile(['week', 'habits', 'milestones'], ['habits', 'todos', 'week', 'milestones'])).toEqual(['week', 'habits', 'todos', 'milestones']);
    expect(reconcile(undefined, ['habits', 'todos', 'week'])).toEqual(['habits', 'todos', 'week']);
    expect(reconcile(['week'], ['todos', 'week'])).toEqual(['todos', 'week']);
  });

  it('lets tasks wait offline, but not list setup or reordering', () => {
    expect(isQueueable('/todos', 'POST')).toBe(true);
    expect(isQueueable('/todos/42', 'PATCH')).toBe(true);
    expect(isQueueable('/todos/42', 'DELETE')).toBe(true);
    expect(isQueueable('/todos/42/done', 'POST')).toBe(true);
    expect(isQueueable('/todos/order', 'PATCH')).toBe(false);
    expect(isQueueable('/todos/tmp-abc/done', 'POST')).toBe(false);
    expect(isQueueable('/todo-lists', 'POST')).toBe(false);
  });

  it('gives a state from before to-do lists empty ones, so nothing reads undefined', () => {
    const old = { habits: [] } as unknown as AppState;
    expect(withDefaults(old)).toMatchObject({ todoLists: [], todos: [] });
    const now = state([]);
    expect(withDefaults(now)).toBe(now);
    expect(withDefaults(null)).toBeNull();
  });
});
