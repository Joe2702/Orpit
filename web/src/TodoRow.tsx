import React from 'react';
import { useStore } from './store';
import { api } from './api';
import { dueLabel } from './lib/todos';
import type { Todo } from './types';
import { t } from './i18n';

/**
 * Ticking a task off and deleting one, the same everywhere a task appears:
 * the list itself, Home, the brief. Both show at once and save behind.
 */
export function useTodoActions() {
  const { state, mutate, mutateOpt, haptic, showToast } = useStore();

  // A task added with no signal has no real id until it syncs; acting on it
  // before then would be sent to an id the server never had.
  const pending = (x: Todo) => {
    if (!x.id.startsWith('tmp-')) return false;
    showToast(t('Still saving that task. Try again in a moment.'));
    return true;
  };

  const toggle = (x: Todo) => {
    if (pending(x)) return;
    const done = x.doneTs == null;
    const left = state!.todos.filter((y) => y.listId === x.listId && y.doneTs == null && y.id !== x.id).length;
    // The last one in a list gets the longer buzz: that's the moment worth marking.
    haptic(done ? (left === 0 ? [14, 70, 28] : 14) : 8);
    const list = state!.todoLists.find((l) => l.id === x.listId);
    mutateOpt(
      (s) => ({ ...s, todos: s.todos.map((y) => (y.id === x.id ? { ...y, doneTs: done ? Date.now() : null } : y)) }),
      () => api.setTodoDone(x.id, done),
      done && left === 0 && list ? t('Everything on {list} is done', { list: list.name }) : undefined
    ).catch(() => {});
  };

  const remove = (x: Todo) => {
    if (pending(x)) return;
    haptic();
    mutateOpt((s) => ({ ...s, todos: s.todos.filter((y) => y.id !== x.id) }), () => api.deleteTodo(x.id))
      .then(() =>
        showToast(t('Task deleted'), () =>
          mutate(() => api.addTodo({ listId: x.listId, title: x.title, note: x.note, due: x.due }), t('Restored')).catch(() => {})
        )
      )
      .catch(() => {});
  };

  /** Add a task now; it shows straight away and saves behind. */
  const add = (listId: string, title: string, due: string | null = null, note: string | null = null) => {
    const tmp: Todo = { id: `tmp-${Date.now().toString(36)}`, listId, title, note, due, doneTs: null, sort: 1e9, ts: Date.now() };
    haptic(10);
    return mutateOpt((s) => ({ ...s, todos: [...s.todos, tmp] }), () => api.addTodo({ listId, title, due, note })).catch(() => {});
  };

  return { toggle, remove, add, pending };
}

/** One task: a tick box, the title, and when it's due. Tapping the words opens it. */
export function TodoRow({
  x,
  color = 'indigo',
  list,
  onOpen,
  border = true,
}: {
  x: Todo;
  color?: string;
  /** Shown under the title when the row is outside its own list. */
  list?: { name: string; color: string };
  onOpen?: () => void;
  border?: boolean;
}) {
  const { toggle } = useTodoActions();
  const done = x.doneTs != null;
  const due = x.due && !done ? dueLabel(x.due) : null;
  const dueColor = due?.kind === 'late' ? 'var(--danger)' : due?.kind === 'today' ? 'var(--indigo)' : 'var(--text2)';
  const meta: React.ReactNode[] = [];
  if (list)
    meta.push(
      <span key="l" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--${list.color})`, flex: 'none' }} />
        {list.name}
      </span>
    );
  if (due) meta.push(<span key="d" style={{ color: dueColor, fontWeight: due.kind === 'late' || due.kind === 'today' ? 600 : 400 }}>{due.kind === 'late' ? t('Late · {when}', { when: due.text }) : due.text}</span>);
  if (x.note) meta.push(<span key="n" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{x.note.split('\n')[0]}</span>);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: border ? '1px solid var(--hairline)' : 'none', background: 'var(--surface)' }}>
      <div
        role="checkbox"
        aria-checked={done}
        aria-label={x.title}
        tabIndex={0}
        onClick={() => toggle(x)}
        className="press92"
        style={{ width: 52, alignSelf: 'stretch', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: `1.5px solid ${done ? `var(--${color})` : 'var(--text3)'}`,
            background: done ? `var(--${color})` : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background .2s, border-color .2s',
          }}
        >
          {done && (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ fill: 'none', stroke: 'var(--on-accent)', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M2.5 6.2l2.3 2.3 4.7-5" />
            </svg>
          )}
        </span>
      </div>
      <div
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen}
        style={{ flex: 1, minWidth: 0, padding: '12px 0', paddingInlineEnd: 16, cursor: onOpen ? 'pointer' : 'default' }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 550,
            color: done ? 'var(--text3)' : 'var(--text)',
            textDecoration: done ? 'line-through' : 'none',
            lineHeight: 1.35,
            overflowWrap: 'anywhere',
          }}
        >
          {x.title}
        </div>
        {meta.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text2)', marginTop: 2, minWidth: 0 }}>
            {meta.map((m, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span aria-hidden>·</span>}
                {m}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
