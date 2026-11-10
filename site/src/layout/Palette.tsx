import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, useData } from '../store';
import { useOpen } from '../forms/host';
import { api } from '../api';
import { enabled } from '@core/lib/modules';
import { dayKey, money } from '@core/lib/format';
import { t, tData, getLang, setLangPref, date } from '../i18n';
import { Kbd } from '../ui/kit';
import { Icon, type IconName } from '../ui/Icon';
import { exportCsv, type ExportKind } from '../lib/exports';
import { plannedOn } from '../lib/series';
import { visiblePlaces, switchToPhone, MOD } from './nav';

// One box for everything: go to a page, add something, tick off today's
// habits and tasks, find a payment, change a setting. Type to narrow, arrows
// to move, Enter to do it.

interface Item {
  id: string;
  group: string;
  label: string;
  /** Matched but never shown: English names in Arabic, other words people use. */
  alt?: string;
  icon: IconName;
  hint?: React.ReactNode;
  run: () => void | Promise<unknown>;
  stay?: boolean;
}

// What was searched for last, kept on this device. The phone app's search
// uses the same key, so on one browser the two share their history.
const RECENT_KEY = 'orbit_recent_searches';
function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}
function remember(term: string) {
  const v = term.trim();
  if (v.length < 2) return;
  try {
    const next = [v, ...readRecent().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode: nothing is kept */
  }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');

function score(it: Item, words: string[]): number {
  if (!words.length) return 1;
  const hay = norm(`${it.label} ${it.alt || ''} ${it.group}`);
  const label = norm(it.label);
  let sc = 0;
  for (const w of words) {
    if (!hay.includes(w)) return 0;
    sc += label.startsWith(w) ? 3 : label.includes(` ${w}`) ? 2 : 1;
  }
  return sc;
}

export function Palette({ initial, onClose, showHelp }: { initial: string; onClose: () => void; showHelp: () => void }) {
  const s = useData();
  const { mutate, toast, signOut, theme } = useStore();
  const open = useOpen();
  const nav = useNavigate();
  const [q, setQ] = useState(initial);
  const [at, setAt] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const on = (m: string) => enabled(s, m);
  const ar = getLang() === 'ar';
  useEffect(() => {
    input.current?.focus();
    const n = input.current?.value.length || 0;
    input.current?.setSelectionRange(n, n);
  }, []);
  const words = norm(q).split(/\s+/).filter(Boolean);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const G = { go: t('Go to'), add: t('Add or log'), habits: t('Today’s habits'), tasks: t('Tasks'), money: t('Transactions'), cmd: t('Commands') };
    for (const p of visiblePlaces(s))
      out.push({ id: `go${p.to}`, group: G.go, label: p.parent ? `${t(p.parent)} › ${t(p.label)}` : t(p.label), alt: ar ? p.label : undefined, icon: p.icon, hint: p.key ? <><Kbd>G</Kbd><Kbd>{p.key.toUpperCase()}</Kbd></> : undefined, run: () => nav(p.to) });
    if (on('todos'))
      for (const l of s.todoLists) out.push({ id: `list${l.id}`, group: G.go, label: `${t('Tasks')} › ${tData(l.name)}`, icon: 'list', run: () => nav(`/tasks/${l.id}`) });

    const add: [string, string, IconName, string, () => void][] = [
      ['txn', t('New transaction'), 'money', 'finances', () => open({ kind: 'txn' })],
      ['income', t('New income'), 'money', 'finances', () => open({ kind: 'txn', preset: { kind: 'income' } })],
      ['transfer', t('Move money between accounts'), 'transfer', 'finances', () => open({ kind: 'txn', preset: { kind: 'transfer' } })],
      ['workout', t('Log a workout'), 'fitness', 'workouts', () => open({ kind: 'workout' })],
      ['night', t('Log sleep'), 'sleep', 'sleep', () => open({ kind: 'night' })],
      ['task', t('New task'), 'tasks', 'todos', () => open({ kind: 'task' })],
      ['list', t('New task list'), 'list', 'todos', () => open({ kind: 'list' })],
      ['habit', t('New habit'), 'habits', 'habits', () => open({ kind: 'habit' })],
      ['counter', t('New counter'), 'counter', 'counters', () => open({ kind: 'counter' })],
      ['account', t('New account'), 'wallet', 'finances', () => open({ kind: 'account' })],
      ['budget', t('New budget'), 'pie', 'finances', () => open({ kind: 'budget' })],
      ['goal', t('New savings goal'), 'target', 'finances', () => open({ kind: 'goal' })],
      ['bill', t('New repeating payment'), 'repeat', 'finances', () => open({ kind: 'bill' })],
    ];
    for (const [id, label, icon, mod, run] of add) if (on(mod)) out.push({ id: `add${id}`, group: G.add, label, alt: 'new add create log', icon, run });
    if (on('counters'))
      for (const c of s.counters) out.push({ id: `cnt${c.id}`, group: G.add, label: t('Add to {name}', { name: tData(c.name) }), alt: 'counter', icon: 'counter', run: () => open({ kind: 'countlog', counter: c }) });

    if (on('habits')) {
      const today = dayKey();
      const done = new Set(s.checkins.filter((c) => c.day === today).map((c) => c.habitId));
      for (const h of s.habits) {
        if (h.archived || h.paused || !plannedOn(h, Date.now())) continue;
        const is = done.has(h.id);
        out.push({
          id: `hab${h.id}`,
          group: G.habits,
          label: is ? t('Untick “{name}”', { name: tData(h.name) }) : t('Tick off “{name}”', { name: tData(h.name) }),
          alt: 'habit done',
          icon: is ? 'habits' : 'check',
          stay: true,
          run: () =>
            mutate(
              (st) => {
                const has = st.checkins.some((c) => c.habitId === h.id && c.day === today);
                return { ...st, checkins: has ? st.checkins.filter((c) => !(c.habitId === h.id && c.day === today)) : [...st.checkins, { habitId: h.id, day: today }] };
              },
              () => api.toggleHabit(h.id, today)
            ),
        });
      }
    }
    if (on('todos')) {
      const open_ = s.todos.filter((x) => x.doneTs == null).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
      for (const x of open_.slice(0, words.length ? 300 : 6))
        out.push({
          id: `todo${x.id}`,
          group: G.tasks,
          label: t('Done: {title}', { title: x.title }),
          alt: x.title,
          icon: 'tasks',
          stay: true,
          hint: x.due ? <span className="faint" style={{ fontSize: 12 }}>{date(new Date(`${x.due}T12:00`), { month: 'short', day: 'numeric' })}</span> : undefined,
          run: () => mutate((st) => ({ ...st, todos: st.todos.map((y) => (y.id === x.id ? { ...y, doneTs: Date.now() } : y)) }), () => api.setTodoDone(x.id, true), t('Done')),
        });
    }

    out.push({ id: 'theme', group: G.cmd, label: theme === 'dark' ? t('Switch to the light theme') : t('Switch to the dark theme'), alt: 'theme dark light', icon: theme === 'dark' ? 'sun' : 'moon', run: () => mutate((st) => ({ ...st, profile: { ...st.profile, theme: theme === 'dark' ? 'light' : 'dark' } }), () => api.updateMe({ theme: theme === 'dark' ? 'light' : 'dark' })) });
    out.push({ id: 'lang', group: G.cmd, label: ar ? 'Switch to English' : 'التبديل إلى العربية', alt: 'language arabic english لغة', icon: 'globe', run: () => setLangPref(ar ? 'en' : 'ar') });
    const exp: [ExportKind, string, string][] = [
      ['txns', t('Download all transactions (CSV)'), 'finances'],
      ['workouts', t('Download all workouts (CSV)'), 'workouts'],
      ['sleep', t('Download all sleep (CSV)'), 'sleep'],
      ['habits', t('Download all habit check-ins (CSV)'), 'habits'],
    ];
    for (const [k, label, mod] of exp)
      if (on(mod))
        out.push({
          id: `exp${k}`,
          group: G.cmd,
          label,
          alt: 'export download csv excel spreadsheet',
          icon: 'download',
          run: async () => {
            const n = await exportCsv(k, s);
            toast(t('{n} rows saved', { n }));
          },
        });
    out.push({ id: 'help', group: G.cmd, label: t('Keyboard shortcuts'), alt: 'keys help', icon: 'keyboard', hint: <Kbd>?</Kbd>, run: showHelp });
    out.push({ id: 'phone', group: G.cmd, label: t('Use the phone layout'), alt: 'mobile', icon: 'phone', run: switchToPhone });
    out.push({ id: 'out', group: G.cmd, label: t('Sign out'), alt: 'logout', icon: 'logout', run: signOut });

    if (on('finances') && words.length && q.trim().length >= 2) {
      const hits = s.txns
        .filter((x) => {
          const hay = norm(`${x.name} ${x.cat} ${tData(x.cat)} ${x.note || ''} ${Math.abs(x.amount)}`);
          return words.every((w) => hay.includes(w));
        })
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 8);
      for (const x of hits)
        out.push({
          id: `txn${x.id}`,
          group: G.money,
          label: x.name,
          alt: `${x.cat} ${tData(x.cat)} ${x.note || ''} ${Math.abs(x.amount)}`,
          icon: 'money',
          hint: (
            <span className="faint num" style={{ fontSize: 12 }}>
              {date(x.ts, { month: 'short', day: 'numeric' })} · <b style={{ color: 'var(--text)' }}>{money(x.amount)}</b>
            </span>
          ),
          run: () => open({ kind: 'txn', txn: x }),
        });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, q, theme]);

  const shown = useMemo(() => {
    const groups: string[] = [];
    const by: Record<string, { it: Item; sc: number }[]> = {};
    for (const it of items) {
      const sc = it.id.startsWith('txn') ? 1 : score(it, words);
      if (!sc) continue;
      if (!by[it.group]) {
        by[it.group] = [];
        groups.push(it.group);
      }
      by[it.group].push({ it, sc });
    }
    if (words.length) groups.sort((a, b) => Math.max(...by[b].map((x) => x.sc)) - Math.max(...by[a].map((x) => x.sc)));
    return groups.flatMap((g) => by[g].sort((a, b) => b.sc - a.sc).slice(0, words.length ? 8 : 6).map((x) => x.it));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q]);

  // Before anything is typed, the last few searches come first: one click
  // runs one again.
  const recent = useMemo(() => readRecent(), []);
  const view: Item[] =
    words.length || !recent.length
      ? shown
      : [...recent.map((r, i): Item => ({ id: `recent${i}`, group: t('Recent searches'), label: r, icon: 'clock', run: () => setQ(r), stay: true })), ...shown];

  useEffect(() => setAt(0), [q]);
  useEffect(() => list.current?.querySelector('[data-on="1"]')?.scrollIntoView({ block: 'nearest' }), [at]);
  const run = (it?: Item) => {
    if (!it) return;
    // A search that led somewhere is worth offering again next time.
    if (!it.stay) remember(q);
    if (!it.stay) onClose();
    void it.run();
  };

  let last = '';
  return (
    <>
      <div className="scrim" onMouseDown={onClose} />
      <div
        className="palette"
        role="dialog"
        aria-modal
        aria-label={t('Search or jump to…')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setAt((i) => Math.min(view.length - 1, i + 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setAt((i) => Math.max(0, i - 1)));
          else if (e.key === 'Enter') (e.preventDefault(), run(view[at]));
          else if (e.key === 'Escape') (e.preventDefault(), onClose());
        }}
      >
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search pages, actions, habits, tasks and payments…')} aria-activedescendant={view[at] ? `pi-${view[at].id}` : undefined} />
          <Kbd>Esc</Kbd>
        </div>
        <div className="palette-list" ref={list} role="listbox">
          {view.length === 0 && <div className="empty" style={{ padding: 28 }}>{t('Nothing found for “{q}”', { q })}</div>}
          {view.map((it, i) => {
            const head = it.group !== last ? it.group : null;
            last = it.group;
            return (
              <React.Fragment key={it.id}>
                {head && <div className="menu-label" style={{ padding: '8px 8px 4px' }}>{head}</div>}
                <div id={`pi-${it.id}`} role="option" aria-selected={i === at} data-on={i === at ? '1' : '0'} className={`menu-item${i === at ? ' on' : ''}`} style={{ height: 38 }} onMouseMove={() => i !== at && setAt(i)} onClick={() => run(it)}>
                  <Icon name={it.icon} size={16} style={i === at ? { color: 'var(--accent)' } : undefined} />
                  <span className="truncate" style={{ flex: 1 }}>{it.label}</span>
                  {it.hint && <span className="row" style={{ gap: 4 }}>{it.hint}</span>}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="palette-foot">
          <span className="row" style={{ gap: 4 }}>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> {t('to move')}
          </span>
          <span className="row" style={{ gap: 4 }}>
            <Kbd>↵</Kbd> {t('to choose')}
          </span>
        </div>
      </div>
    </>
  );
}
