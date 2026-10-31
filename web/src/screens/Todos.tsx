import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { BackButton, SectionLabel } from '../ui';
import { Reorderable } from '../Reorderable';
import { TodoRow } from '../TodoRow';
import { dueNow, listCounts, openIn } from '../lib/todos';
import { t, tk, tn } from '../i18n';

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' };
const chevron = (
  <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden style={{ flex: 'none', fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
    <path className="flip-rtl" d="M7 4l5 5-5 5" />
  </svg>
);

// Starting points for someone with no lists yet.
const SUGGESTED = [
  { name: tk('Uni'), color: 'blue' },
  { name: tk('Work'), color: 'indigo' },
  { name: tk('Training'), color: 'coral' },
  { name: tk('House'), color: 'teal' },
  { name: tk('Shopping'), color: 'amber' },
];

/**
 * Every list, and what's due today across all of them. A list per part of
 * life ("Uni", "Training") keeps each one short enough to finish.
 */
export function Todos() {
  const { state, go, open, mutate, haptic } = useStore();
  const s = state!;
  const due = useMemo(() => dueNow(s), [s]);
  const lists = s.todoLists;
  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const totalOpen = s.todos.filter((x) => x.doneTs == null).length;
  const [adding, setAdding] = useState<string | null>(null);

  const quickList = (name: string, color: string) => {
    if (adding) return;
    setAdding(name);
    haptic();
    mutate(() => api.addTodoList({ name: t(name), color, icon: 'check' }), t('List added'))
      .catch(() => {})
      .finally(() => setAdding(null));
  };

  const row = (l: (typeof lists)[number]) => {
    const c = listCounts(s, l.id);
    const next = openIn(s, l.id)[0];
    return (
      <div role="button" tabIndex={0} onClick={() => go('todolist', { id: l.id })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', cursor: 'pointer', ...card, marginBottom: 10 }}>
        <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 'calc(12px * var(--sq))', background: `color-mix(in srgb, var(--${l.color}) 16%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: `var(--${l.color})`, fontWeight: 750, fontSize: 16 }}>
          {Array.from(l.name.trim())[0]?.toUpperCase() || '•'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 650, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.open === 0
              ? c.done
                ? t('All done')
                : t('Nothing yet')
              : next
                ? t('Next: {task}', { task: next.title })
                : ''}
          </div>
        </div>
        <div style={{ textAlign: 'end', flex: 'none' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: c.open ? 'var(--text)' : 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{c.open}</div>
          {c.late > 0 && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--danger)' }}>{tn(c.late, '{n} late', '{n} late')}</div>}
        </div>
        {chevron}
      </div>
    );
  };

  return (
    <div style={{ padding: '6px 20px 32px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <BackButton onClick={() => go('home')} />
        <div className="display" style={{ flex: 1, fontSize: 34, lineHeight: 1.1, color: 'var(--text)' }}>{t('To-do')}</div>
        {lists.length > 0 && (
          <div role="button" tabIndex={0} aria-label={t('Add a task')} onClick={() => open('todo')} className="press96" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
            <svg width="18" height="18" aria-hidden style={{ fill: 'none', stroke: 'var(--on-accent)', strokeWidth: 2.4, strokeLinecap: 'round' }}><path d="M9 3.5v11M3.5 9h11" /></svg>
          </div>
        )}
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text2)', margin: '0 2px 22px' }}>
        {lists.length ? tn(totalOpen, 'One thing to do across your lists', '{n} things to do across your lists') : t('A list for each part of your life.')}
      </div>

      {due.length > 0 && (
        <>
          <SectionLabel>{t('Due today')}</SectionLabel>
          <div style={{ ...card, marginBottom: 24 }}>
            {due.map((x, i) => {
              const l = listById.get(x.listId)!;
              return <TodoRow key={x.id} x={x} color={l.color} list={{ name: l.name, color: l.color }} onOpen={() => open('todo', { id: x.id })} border={i < due.length - 1} />;
            })}
          </div>
        </>
      )}

      {lists.length > 0 ? (
        <>
          <SectionLabel>{t('Lists')}</SectionLabel>
          {/* Press and hold a list to move it. */}
          <Reorderable
            items={lists.map((l) => ({ id: l.id, node: row(l) }))}
            onReorder={(ids) =>
              mutate(() => api.orderTodoLists(ids)).catch(() => {})
            }
          />
          <div role="button" tabIndex={0} onClick={() => open('todolistEdit')} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', cursor: 'pointer', borderRadius: 'calc(20px * var(--sq))', border: '1.5px dashed var(--border)' }}>
            <span style={{ width: 38, height: 38, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" aria-hidden style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M9 4v10M4 9h10" /></svg>
            </span>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--indigo)' }}>{t('New list')}</div>
          </div>
          {lists.length > 1 && <div style={{ fontSize: 12.5, color: 'var(--text3)', textAlign: 'center', marginTop: 14 }}>{t('Press and hold a list to move it.')}</div>}
        </>
      ) : (
        <div style={{ ...card, padding: '22px 18px' }}>
          <div style={{ fontSize: 16, fontWeight: 650, color: 'var(--text)' }}>{t('Start with a list')}</div>
          <div style={{ fontSize: 13.5, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>{t('One for each part of your life keeps every list short enough to finish. Tap one to make it, or name your own.')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {SUGGESTED.map((x) => (
              <div
                key={x.name}
                role="button"
                tabIndex={0}
                onClick={() => quickList(x.name, x.color)}
                className="press96"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', opacity: adding === x.name ? 0.5 : 1 }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${x.color})` }} />
                {t(x.name)}
              </div>
            ))}
            <div role="button" tabIndex={0} onClick={() => open('todolistEdit')} className="press96" style={{ display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 14px', borderRadius: 999, background: 'var(--indigo)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 650, cursor: 'pointer' }}>
              {t('Name your own')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

