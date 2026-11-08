import React, { useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import type { Todo } from '@core/types';
import { useStore, useData } from '../store';
import { useOpen } from '../forms/host';
import { api } from '../api';
import { dayKey } from '@core/lib/format';
import { t, tn, tData, date } from '../i18n';
import { Button, Check, Empty, Menu } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { ColorDot } from '../forms/forms';
import { addDays } from '../lib/series';

// To-do lists the desktop way: lists down the side, the tasks beside them, a
// box at the top to add one with a keystroke.

type View = 'today' | 'upcoming' | 'all';
const VIEWS: View[] = ['today', 'upcoming', 'all'];

export function Tasks() {
  const s = useData();
  const { mutate, confirm } = useStore();
  const open = useOpen();
  const nav = useNavigate();
  const { listId } = useParams();
  const today = dayKey();
  const openTodos = s.todos.filter((x) => x.doneTs == null);
  const dueToday = openTodos.filter((x) => x.due && x.due <= today);
  const view: View | null = listId && VIEWS.includes(listId as View) ? (listId as View) : !listId ? (dueToday.length || !s.todoLists.length ? 'today' : null) : null;
  const list = view ? null : s.todoLists.find((l) => l.id === (listId || s.todoLists[0]?.id)) || null;
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [showDone, setShowDone] = useState(false);

  const shown: Todo[] = (view === 'today' ? dueToday : view === 'upcoming' ? openTodos.filter((x) => x.due && x.due > today) : view === 'all' ? openTodos : openTodos.filter((x) => x.listId === list?.id)).sort(
    (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.sort - b.sort
  );
  const done = list ? s.todos.filter((x) => x.listId === list.id && x.doneTs != null).sort((a, b) => (b.doneTs || 0) - (a.doneTs || 0)) : [];
  const target = list?.id || s.todoLists[0]?.id;

  const add = () => {
    if (!title.trim() || !target) return;
    const body = { listId: target, title: title.trim(), due: due || (view === 'today' ? today : null) };
    setTitle('');
    setDue('');
    mutate(null, () => api.addTodo(body));
  };
  const setDone = (x: Todo, v: boolean) => mutate((st) => ({ ...st, todos: st.todos.map((y) => (y.id === x.id ? { ...y, doneTs: v ? Date.now() : null } : y)) }), () => api.setTodoDone(x.id, v));
  const listName = (id: string) => tData(s.todoLists.find((l) => l.id === id)?.name || '');
  const dueChip = (d: string | null) => {
    if (!d) return null;
    const late = d < today;
    const tomorrow = dayKey(addDays(Date.now(), 1));
    const label = d === today ? t('Today') : d === tomorrow ? t('Tomorrow') : date(new Date(`${d}T12:00`), { weekday: 'short', month: 'short', day: 'numeric' });
    return (
      <span className={`badge${late ? ' bad' : d === today ? ' accent' : ''}`}>
        <Icon name="calendar" size={11} />
        {late ? t('Late · {date}', { date: label }) : label}
      </span>
    );
  };

  const side = (to: string, icon: React.ReactNode, label: string, n: number) => (
    <NavLink key={to} to={to} className={({ isActive }) => (isActive || (to === `/tasks/${view}` && !listId && view) ? 'active' : '')}>
      {icon}
      <span className="truncate" style={{ flex: 1 }}>{label}</span>
      {n > 0 && <span className="faint num" style={{ fontSize: 12 }}>{n}</span>}
    </NavLink>
  );

  const title_ = view === 'today' ? t('Today') : view === 'upcoming' ? t('Upcoming') : view === 'all' ? t('All open tasks') : list ? tData(list.name) : t('Tasks');
  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="page-title">{t('Tasks')}</h1>
          <div className="page-sub">{tn(openTodos.length, '{n} open task across your lists', '{n} open tasks across your lists')}</div>
        </div>
        <Button icon="plus" onClick={() => open({ kind: 'list' })}>
          {t('New list')}
        </Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <nav className="settings-nav card" style={{ padding: 8, position: 'sticky', top: 80 }}>
          {side('/tasks/today', <Icon name="sunrise" size={16} />, t('Today'), dueToday.length)}
          {side('/tasks/upcoming', <Icon name="calendar" size={16} />, t('Upcoming'), openTodos.filter((x) => x.due && x.due > today).length)}
          {side('/tasks/all', <Icon name="list" size={16} />, t('All open'), openTodos.length)}
          <div className="menu-sep" style={{ margin: '8px 4px' }} />
          <div className="menu-label">{t('Lists')}</div>
          {s.todoLists.map((l) => side(`/tasks/${l.id}`, <ColorDot c={l.color} size={9} />, tData(l.name), openTodos.filter((x) => x.listId === l.id).length))}
          {s.todoLists.length === 0 && <div className="faint" style={{ padding: '6px 10px', fontSize: 13 }}>{t('No lists yet')}</div>}
        </nav>

        <div className="card">
          <div className="card-head">
            {list && <ColorDot c={list.color} size={10} />}
            <span className="card-title" style={{ fontSize: 15 }}>{title_}</span>
            <span className="card-sub">{shown.length}</span>
            <span className="spacer" />
            {list && (
              <Menu
                trigger={(tg) => <Button size="sm" kind="ghost" icon="more" title={t('List options')} onClick={tg} />}
                items={[
                  { label: t('Rename or recolour'), icon: 'edit', run: () => open({ kind: 'list', list }) },
                  done.length > 0 && { label: t('Clear completed'), icon: 'check', run: () => mutate((st) => ({ ...st, todos: st.todos.filter((x) => !(x.listId === list.id && x.doneTs != null)) }), () => api.clearDone(list.id), t('Cleared')) },
                  '-',
                  {
                    label: t('Delete list'),
                    icon: 'trash',
                    danger: true,
                    run: async () => {
                      if (await confirm({ title: t('Delete {what}?', { what: tData(list.name) }), message: t('Every task in it goes too.'), confirm: t('Delete'), danger: true })) {
                        nav('/tasks');
                        mutate(null, () => api.deleteList(list.id), t('Deleted'));
                      }
                    },
                  },
                ].filter(Boolean) as never}
              />
            )}
          </div>
          {target ? (
            <form onSubmit={(e) => (e.preventDefault(), add())} className="row" style={{ padding: '12px 18px', borderBottom: '1px solid var(--line-soft)', gap: 8 }}>
              <div className="input-wrap" style={{ flex: 1 }}>
                <Icon name="plus" size={15} />
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={list ? t('Add a task to {list}, press Enter', { list: tData(list.name) }) : t('Add a task, press Enter')} />
              </div>
              <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: 160 }} aria-label={t('Due')} />
              <Button kind="primary" type="submit" disabled={!title.trim()}>
                {t('Add')}
              </Button>
            </form>
          ) : (
            <Empty icon="tasks" title={t('Make your first list')} action={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'list' })}>{t('New list')}</Button>}>
              {t('Work, groceries, uni: lists keep tasks apart.')}
            </Empty>
          )}
          {target && shown.length === 0 && <div className="faint" style={{ padding: '26px 18px', textAlign: 'center' }}>{view === 'today' ? t('Nothing due today.') : t('Nothing here. Add one above.')}</div>}
          {shown.map((x) => (
            <div key={x.id} className="list-row hover-row" style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'task', task: x })}>
              <Check round on={false} onChange={() => setDone(x, true)} label={x.title} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="truncate" style={{ display: 'block' }}>{x.title}</span>
                {(x.note || !list) && (
                  <span className="faint truncate" style={{ display: 'block', fontSize: 12 }}>
                    {!list && listName(x.listId)}
                    {!list && x.note && ' · '}
                    {x.note}
                  </span>
                )}
              </span>
              {dueChip(x.due)}
              <span className="row-actions">
                <Button size="sm" kind="ghost" icon="trash" title={t('Delete')} onClick={(e) => (e.stopPropagation(), mutate((st) => ({ ...st, todos: st.todos.filter((y) => y.id !== x.id) }), () => api.deleteTodo(x.id), t('Task deleted')))} />
              </span>
            </div>
          ))}
          {done.length > 0 && (
            <>
              <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line-soft)' }}>
                <button className="link" onClick={() => setShowDone(!showDone)}>
                  {showDone ? t('Hide completed') : tn(done.length, 'Show {n} completed', 'Show {n} completed')}
                </button>
              </div>
              {showDone &&
                done.map((x) => (
                  <div key={x.id} className="list-row" style={{ opacity: 0.6 }}>
                    <Check round on onChange={() => setDone(x, false)} label={x.title} />
                    <span className="truncate" style={{ flex: 1, textDecoration: 'line-through' }}>{x.title}</span>
                    <span className="faint" style={{ fontSize: 12 }}>{date(x.doneTs!, { month: 'short', day: 'numeric' })}</span>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
