import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { IconTrash } from '../icons';
import { useTodoActions } from '../TodoRow';
import { dueChoices, lastList, rememberList, LIST_COLORS } from '../lib/todos';
import { t, tn } from '../i18n';

const label = (text: string) => <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>{text}</div>;
const input: React.CSSProperties = {
  width: '100%',
  minHeight: 52,
  borderRadius: 'calc(14px * var(--sq))',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  padding: '0 16px',
  fontSize: 15,
  color: 'var(--text)',
  outline: 'none',
};
const pill = (active: boolean, color = 'indigo'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 38,
  padding: '0 16px',
  borderRadius: 999,
  flex: 'none',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  border: `1px solid ${active ? `var(--${color})` : 'var(--border)'}`,
  background: active ? `color-mix(in srgb, var(--${color}) 14%, var(--surface))` : 'var(--surface)',
  color: active ? 'var(--text)' : 'var(--text2)',
});
const primary = (on: boolean): React.CSSProperties => ({
  background: on ? 'var(--indigo)' : 'color-mix(in srgb,var(--indigo) 40%,var(--surface))',
  color: 'var(--on-accent)',
  height: 54,
  borderRadius: 'calc(16px * var(--sq))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 15,
  fontWeight: 700,
  cursor: on ? 'pointer' : 'default',
});
const dangerBtn: React.CSSProperties = {
  height: 52,
  borderRadius: 'calc(16px * var(--sq))',
  border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--danger)',
  cursor: 'pointer',
  marginTop: 8,
};

/** Add a task, or change one: its words, its list, when it's due, a note. */
export function TodoSheet() {
  const { state, sheetData, closeSheet, open, mutateOpt, haptic } = useStore();
  const s = state!;
  const editing = s.todos.find((x) => x.id === sheetData?.id) || null;
  const { add, remove, pending } = useTodoActions();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [listId, setListId] = useState<string | null>(editing?.listId ?? sheetData?.listId ?? lastList(s));
  const [due, setDue] = useState<string | null>(editing?.due ?? null);
  const [note, setNote] = useState(editing?.note ?? '');
  const [picking, setPicking] = useState(false);
  const choices = useMemo(() => dueChoices(), []);
  const canSave = !!title.trim() && !!listId;

  if (!s.todoLists.length) {
    return (
      <div style={{ padding: '8px 20px 32px' }}>
        <div className="display" style={{ fontSize: 28, lineHeight: 1.1, color: 'var(--text)', margin: '8px 2px 8px' }}>{t('Make a list first')}</div>
        <div style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 20 }}>{t('Tasks live in lists, like Uni or Training. Make one, then add to it.')}</div>
        <div role="button" tabIndex={0} onClick={() => open('todolistEdit')} className="press99" style={primary(true)}>
          {t('New list')}
        </div>
      </div>
    );
  }

  const save = () => {
    if (!canSave) return;
    const body = { title: title.trim().slice(0, 200), listId: listId!, due, note: note.trim() || null };
    rememberList(body.listId);
    if (editing) {
      if (pending(editing)) return;
      haptic();
      mutateOpt(
        (st) => ({ ...st, todos: st.todos.map((x) => (x.id === editing.id ? { ...x, ...body, sort: body.listId !== x.listId ? 1e9 : x.sort } : x)) }),
        () => api.editTodo(editing.id, body),
        t('Task updated')
      ).catch(() => {});
    } else {
      add(body.listId, body.title, body.due, body.note);
    }
    closeSheet();
  };

  const dueKey = due ? choices.find((c) => c.due === due)?.key ?? 'pick' : 'none';

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '8px 0 16px' }}>{editing ? t('Edit task') : t('New task')}</div>

      <textarea
        value={title}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
        }}
        autoFocus={!editing}
        rows={2}
        maxLength={200}
        placeholder={t('What needs doing?')}
        aria-label={t('Task')}
        style={{ ...input, padding: '16px 16px', resize: 'none', fontWeight: 600, lineHeight: 1.4, marginBottom: 20, fontFamily: 'inherit' }}
      />

      {label(t('List'))}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 20 }}>
        {s.todoLists.map((l) => (
          <div key={l.id} role="button" tabIndex={0} aria-pressed={listId === l.id} onClick={() => setListId(l.id)} style={pill(listId === l.id, l.color)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${l.color})` }} />
            {l.name}
          </div>
        ))}
      </div>

      {label(t('Due'))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: picking || dueKey === 'pick' ? 8 : 20 }}>
        <div role="button" tabIndex={0} aria-pressed={dueKey === 'none'} onClick={() => { setDue(null); setPicking(false); }} style={pill(dueKey === 'none')}>
          {t('No date')}
        </div>
        {choices.map((c) => (
          <div key={c.key} role="button" tabIndex={0} aria-pressed={dueKey === c.key} onClick={() => { setDue(c.due); setPicking(false); }} style={pill(dueKey === c.key)}>
            {c.label}
          </div>
        ))}
        <div role="button" tabIndex={0} aria-pressed={dueKey === 'pick'} onClick={() => setPicking(true)} style={pill(dueKey === 'pick' || picking)}>
          {t('Pick a date')}
        </div>
      </div>
      {(picking || dueKey === 'pick') && (
        <input type="date" value={due ?? ''} onChange={(e) => setDue(e.target.value || null)} aria-label={t('Due')} style={{ ...input, fontWeight: 600, marginBottom: 20 }} />
      )}

      {label(t('Note'))}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder={t('Details, a link, anything')}
        style={{ ...input, padding: '12px 16px', resize: 'vertical', lineHeight: 1.45, marginBottom: 24, fontFamily: 'inherit' }}
      />

      <div role="button" tabIndex={0} onClick={save} className={canSave ? 'press99' : undefined} style={primary(canSave)}>
        {editing ? t('Save changes') : t('Add task')}
      </div>
      {editing && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            remove(editing);
            closeSheet();
          }}
          className="press99"
          style={dangerBtn}
        >
          <IconTrash />
          {t('Delete task')}
        </div>
      )}
    </div>
  );
}

/** Make a list, or rename, recolour or delete one. */
export function TodoListSheet() {
  const { state, sheetData, closeSheet, mutate, haptic, confirm, go } = useStore();
  const s = state!;
  const editing = s.todoLists.find((l) => l.id === sheetData?.id) || null;
  const [name, setName] = useState(editing?.name ?? '');
  const [color, setColor] = useState(editing?.color ?? LIST_COLORS[s.todoLists.length % LIST_COLORS.length]);
  const canSave = !!name.trim();
  const count = editing ? s.todos.filter((x) => x.listId === editing.id && x.doneTs == null).length : 0;

  const save = () => {
    if (!canSave) return;
    haptic();
    const body = { name: name.trim().slice(0, 40), color, icon: editing?.icon ?? 'check' };
    if (editing) {
      mutate(() => api.editTodoList(editing.id, body), t('List updated')).catch(() => {});
      closeSheet();
      return;
    }
    // Straight into the new list, ready for its first task.
    const before = new Set(s.todoLists.map((l) => l.id));
    let made: string | undefined;
    mutate(async () => {
      const st = await api.addTodoList(body);
      made = st.todoLists.find((l) => !before.has(l.id))?.id;
      return st;
    }, t('List added'))
      .then(() => made && go('todolist', { id: made }))
      .catch(() => {});
    closeSheet();
  };

  const del = async () => {
    if (!editing) return;
    const ok = await confirm({
      title: t('Delete {name}?', { name: editing.name }),
      message: count ? tn(count, 'Its one open task goes with it.', 'Its {n} open tasks go with it.') : undefined,
      confirmLabel: t('Delete'),
      danger: true,
    });
    if (!ok) return;
    haptic();
    closeSheet();
    go('todos');
    mutate(() => api.deleteTodoList(editing.id), t('List deleted')).catch(() => {});
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '8px 0 16px' }}>{editing ? t('Edit list') : t('New list')}</div>
      {label(t('Name'))}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        autoFocus={!editing}
        maxLength={40}
        placeholder={t('e.g. Uni, Work, Training')}
        style={{ ...input, marginBottom: 20 }}
      />
      {label(t('Colour'))}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24, paddingInlineStart: 2 }}>
        {LIST_COLORS.map((c) => (
          <div
            key={c}
            role="button"
            tabIndex={0}
            aria-label={c}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            style={{ width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', background: `var(--${c})`, transition: 'box-shadow .15s', boxShadow: color === c ? `0 0 0 3px var(--surface),0 0 0 5px var(--${c})` : 'none' }}
          />
        ))}
      </div>
      <div role="button" tabIndex={0} onClick={save} className={canSave ? 'press99' : undefined} style={primary(canSave)}>
        {editing ? t('Save changes') : t('Make list')}
      </div>
      {editing && (
        <div role="button" tabIndex={0} onClick={del} className="press99" style={dangerBtn}>
          <IconTrash />
          {t('Delete list')}
        </div>
      )}
    </div>
  );
}
