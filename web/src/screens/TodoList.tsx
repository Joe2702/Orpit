import React, { useRef, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { BackButton } from '../ui';
import { SwipeRow } from '../SwipeRow';
import { TodoRow, useTodoActions } from '../TodoRow';
import { doneIn, listCounts, openIn, rememberList } from '../lib/todos';
import { t, tn } from '../i18n';

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' };

/**
 * One list. Typing at the top and pressing Enter adds a task and keeps the
 * box ready for the next, so a brain-dump takes seconds. Ticked tasks drop
 * into "Done", out of the way but there to undo.
 */
export function TodoList() {
  const { state, screenData, go, open, confirm, mutate, haptic } = useStore();
  const s = state!;
  const list = s.todoLists.find((l) => l.id === screenData?.id);
  const { add, remove } = useTodoActions();
  const [text, setText] = useState('');
  const [showDone, setShowDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!list) {
    // Deleted, here or on another device.
    return (
      <div style={{ padding: '8px 20px' }}>
        <BackButton onClick={() => go('todos')} />
        <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 24 }}>{t('This list no longer exists.')}</div>
      </div>
    );
  }

  const openTasks = openIn(s, list.id);
  const done = doneIn(s, list.id);
  const c = listCounts(s, list.id);

  const submit = () => {
    const title = text.trim();
    if (!title) return;
    add(list.id, title.slice(0, 200));
    rememberList(list.id);
    setText('');
    inputRef.current?.focus();
  };

  const clearDone = async () => {
    if (!(await confirm({ title: tn(done.length, 'Clear one finished task?', 'Clear {n} finished tasks?'), confirmLabel: t('Clear'), danger: true }))) return;
    haptic();
    mutate(() => api.clearDoneTodos(list.id), t('Cleared')).catch(() => {});
  };

  return (
    <div style={{ padding: '8px 20px 32px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <BackButton onClick={() => go('todos')} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: `var(--${list.color})`, flex: 'none' }} />
        <div className="display" style={{ flex: 1, minWidth: 0, fontSize: 34, lineHeight: 1.1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.name}</div>
        <div role="button" tabIndex={0} aria-label={t('Edit list')} onClick={() => open('todolistEdit', { id: list.id })} className="press96" style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden style={{ fill: 'var(--text)' }}>
            <circle cx="3" cy="8" r="1.6" />
            <circle cx="8" cy="8" r="1.6" />
            <circle cx="13" cy="8" r="1.6" />
          </svg>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', margin: '0 2px 16px' }}>
        {c.open ? tn(c.open, 'One to do', '{n} to do') : t('Nothing left to do')}
        {c.done ? ' · ' + tn(c.done, 'one done', '{n} done') : ''}
      </div>

      {/* Quick add: Enter adds and keeps the box open for the next one. */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        <span style={{ width: 52, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" aria-hidden style={{ fill: 'none', stroke: `var(--${list.color})`, strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M9 3.5v11M3.5 9h11" /></svg>
        </span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          enterKeyHint="done"
          placeholder={t('Add a task')}
          maxLength={200}
          aria-label={t('Add a task')}
          style={{ flex: 1, minWidth: 0, height: 52, border: 'none', background: 'transparent', fontSize: 15, color: 'var(--text)', outline: 'none' }}
        />
        {text.trim() && (
          <div role="button" tabIndex={0} onClick={submit} className="press96" style={{ height: 34, padding: '0 16px', marginInlineEnd: 8, borderRadius: 999, background: 'var(--indigo)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            {t('Add')}
          </div>
        )}
      </div>

      {openTasks.length > 0 ? (
        <div style={{ ...card, marginBottom: 20 }}>
          {openTasks.map((x, i) => (
            <SwipeRow key={x.id} onEdit={() => open('todo', { id: x.id })} onDelete={() => remove(x)}>
              <TodoRow x={x} color={list.color} onOpen={() => open('todo', { id: x.id })} border={i < openTasks.length - 1} />
            </SwipeRow>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '24px 20px 32px', color: 'var(--text2)', fontSize: 15, lineHeight: 1.5 }}>
          {done.length ? t('All done. Nicely handled.') : t('Nothing here yet. Add the first task above.')}
        </div>
      )}

      {done.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', margin: '0 2px 8px' }}>
            <div role="button" tabIndex={0} aria-expanded={showDone} onClick={() => setShowDone((v) => !v)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
              {tn(done.length, 'Done · {n}', 'Done · {n}')}
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', transform: showDone ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                <path d="M2.5 4.5L6 8l3.5-3.5" />
              </svg>
            </div>
            {showDone && (
              <span role="button" tabIndex={0} onClick={clearDone} style={{ fontSize: 13, fontWeight: 600, color: 'var(--indigo)', cursor: 'pointer' }}>
                {t('Clear done')}
              </span>
            )}
          </div>
          {showDone && (
            <div style={card}>
              {done.map((x, i) => (
                <SwipeRow key={x.id} onDelete={() => remove(x)}>
                  <TodoRow x={x} color={list.color} onOpen={() => open('todo', { id: x.id })} border={i < done.length - 1} />
                </SwipeRow>
              ))}
            </div>
          )}
          {showDone && <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', marginTop: 8 }}>{t('Finished tasks stay here for 30 days.')}</div>}
        </>
      )}
    </div>
  );
}
