import type { AppState, Todo } from '../types';
import { dayKey } from './format';
import { addDays } from './period';
import { date, t } from '../i18n';

// To-do lists: what's open, what's due, and how to say when.
//
// A task's `due` is a bare date, compared as text against today's local date
// ("2026-11-02" < "2026-11-03" sorts the way days do), so no timezone can move
// a deadline by a day.

export const isOpen = (x: Todo): boolean => x.doneTs == null;
const byOrder = (a: Todo, b: Todo) => a.sort - b.sort || a.ts - b.ts;

/** A list's open tasks, in the order the person put them. */
export function openIn(state: AppState, listId: string): Todo[] {
  return state.todos.filter((x) => x.listId === listId && isOpen(x)).sort(byOrder);
}

/** A list's finished tasks, most recent first. */
export function doneIn(state: AppState, listId: string): Todo[] {
  return state.todos.filter((x) => x.listId === listId && !isOpen(x)).sort((a, b) => (b.doneTs || 0) - (a.doneTs || 0));
}

/**
 * Open tasks due today or already late, across every list: the late ones
 * first, oldest first, then today's in each list's own order.
 */
export function dueNow(state: AppState, now: number = Date.now()): Todo[] {
  const today = dayKey(now);
  const listRank = new Map(state.todoLists.map((l, i) => [l.id, i]));
  return state.todos
    .filter((x) => isOpen(x) && x.due != null && x.due <= today && listRank.has(x.listId))
    .sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : (listRank.get(a.listId)! - listRank.get(b.listId)!) || byOrder(a, b)));
}

export type DueKind = 'late' | 'today' | 'tomorrow' | 'soon' | 'later';

/** How to say a due date, and how urgent it is. */
export function dueLabel(due: string, now: number = Date.now()): { kind: DueKind; text: string } {
  const today = dayKey(now);
  // Noon, so the day can't slip either way through a timezone.
  const at = new Date(`${due}T12:00:00`).getTime();
  if (due < today) {
    const text = due === dayKey(addDays(now, -1)) ? t('Yesterday') : date(at, { month: 'short', day: 'numeric' });
    return { kind: 'late', text };
  }
  if (due === today) return { kind: 'today', text: t('Today') };
  if (due === dayKey(addDays(now, 1))) return { kind: 'tomorrow', text: t('Tomorrow') };
  if (due <= dayKey(addDays(now, 6))) return { kind: 'soon', text: date(at, { weekday: 'long' }) };
  return { kind: 'later', text: date(at, { month: 'short', day: 'numeric' }) };
}

/** The quick choices a task's date offers, as dates. */
export function dueChoices(now: number = Date.now()): { key: string; label: string; due: string }[] {
  return [
    { key: 'today', label: t('Today'), due: dayKey(now) },
    { key: 'tomorrow', label: t('Tomorrow'), due: dayKey(addDays(now, 1)) },
    { key: 'week', label: t('In a week'), due: dayKey(addDays(now, 7)) },
  ];
}

/** Counts for a list's row: what's left and what's been done lately. */
export function listCounts(state: AppState, listId: string, now: number = Date.now()): { open: number; done: number; late: number } {
  const today = dayKey(now);
  let open = 0;
  let done = 0;
  let late = 0;
  for (const x of state.todos) {
    if (x.listId !== listId) continue;
    if (isOpen(x)) {
      open++;
      if (x.due && x.due < today) late++;
    } else done++;
  }
  return { open, done, late };
}

// The list a new task goes to when none is chosen: the last one used.
const LAST_KEY = 'orbit_last_list';
export function lastList(state: AppState): string | null {
  let id: string | null = null;
  try {
    id = localStorage.getItem(LAST_KEY);
  } catch {
    /* fall through */
  }
  return state.todoLists.some((l) => l.id === id) ? id : state.todoLists[0]?.id ?? null;
}
export function rememberList(id: string): void {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* the first list is a fine default */
  }
}

/** Colours a list can take. */
export const LIST_COLORS = ['indigo', 'teal', 'coral', 'blue', 'emerald', 'amber', 'purple', 'pink'];
