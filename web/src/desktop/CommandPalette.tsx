import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { enabled } from '../lib/modules';
import { dayKey, money, relLabel } from '../lib/format';
import { t, tData, getLang } from '../i18n';
import { useTodoActions } from '../TodoRow';
import { DIcon, Kbd, MOD_KEY, placesFor, type DeskIcon } from './nav';
import { exportCsv, type ExportKind } from './exports';
import { useSidebarCollapsed } from './DesktopShell';

// ⌘K: one box to go anywhere, log anything, tick off today's habits and
// tasks, find a payment, and run the website's commands. Type to narrow,
// arrows to move, Enter to do it.

interface Item {
  id: string;
  group: string;
  label: string;
  /** Also matched, never shown: the English name in Arabic, other words people use. */
  alt?: string;
  hint?: React.ReactNode;
  icon: DeskIcon;
  run: () => void | Promise<void>;
  /** Stays open after running (ticking several habits in a row). */
  stay?: boolean;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟ]/g, '') // Arabic vowel marks
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');

function score(item: Item, words: string[]): number {
  if (!words.length) return 1;
  const hay = norm(`${item.label} ${item.alt || ''}`);
  const label = norm(item.label);
  let sc = 0;
  for (const w of words) {
    const i = hay.indexOf(w);
    if (i < 0) return 0;
    sc += label.startsWith(w) ? 3 : label.includes(` ${w}`) ? 2 : 1;
  }
  return sc;
}

export function CommandPalette({ onClose, theme, setTheme, showHelp }: { onClose: () => void; theme: 'light' | 'dark'; setTheme: (t: 'light' | 'dark') => void; showHelp: () => void }) {
  const { state, go, open, mutateOpt, showToast } = useStore();
  const todo = useTodoActions();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const s = state!;
  const on = (m: string) => enabled(s, m);
  const ar = getLang() === 'ar';
  useEffect(() => input.current?.focus(), []);

  const words = norm(q).split(/\s+/).filter(Boolean);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    // ---- Places ----
    for (const p of placesFor(s)) {
      out.push({ id: `go-${p.screen}`, group: t('Go to'), label: t(p.label), alt: ar ? p.label : undefined, icon: p.icon, hint: p.key ? <><Kbd>G</Kbd> <Kbd>{p.key.toUpperCase()}</Kbd></> : undefined, run: () => go(p.screen) });
    }
    for (const l of s.todoLists) {
      if (!on('todos')) break;
      out.push({ id: `list-${l.id}`, group: t('Go to'), label: tData(l.name), alt: 'list to-do tasks', icon: 'todos', run: () => go('todolist', { id: l.id }) });
    }
    // ---- Logging ----
    const log: [string, string, DeskIcon, string, () => void][] = [
      ['money', t('Add an expense or income'), 'money', 'finances', () => go('faddtx')],
      ['workout', t('Log a workout'), 'workouts', 'workouts', () => open('workout')],
      ['sleep', t('Log last night’s sleep'), 'sleep', 'sleep', () => open('sleep')],
      ['task', t('Add a task'), 'todos', 'todos', () => open('todo')],
      ['habit', t('Start a new habit'), 'habits', 'habits', () => open('habit')],
      ['counter', t('Add to a counter'), 'counters', 'counters', () => open('countpick')],
    ];
    for (const [id, label, icon, mod, run] of log) if (on(mod)) out.push({ id: `log-${id}`, group: t('Log'), label, alt: `new add ${id}`, icon, run });

    // ---- Today's habits: tick from here ----
    if (on('habits')) {
      const today = dayKey();
      const dow = new Date().getDay();
      const done = new Set(s.checkins.filter((c) => c.day === today).map((c) => c.habitId));
      for (const h of s.habits) {
        if (h.archived || h.paused || (/^[01]{7}$/.test(h.days) ? h.days : '1111111')[dow] !== '1') continue;
        const is = done.has(h.id);
        out.push({
          id: `habit-${h.id}`,
          group: t("Today's habits"),
          label: is ? t('Untick “{name}”', { name: tData(h.name) }) : t('Tick off “{name}”', { name: tData(h.name) }),
          alt: 'habit done check',
          icon: is ? 'habits' : 'check',
          stay: true,
          run: () => {
            mutateOpt(
              (st) => {
                const has = st.checkins.some((c) => c.habitId === h.id && c.day === today);
                return { ...st, checkins: has ? st.checkins.filter((c) => !(c.habitId === h.id && c.day === today)) : [...st.checkins, { habitId: h.id, day: today }] };
              },
              () => api.toggleHabit(h.id, today)
            ).catch(() => {});
          },
        });
      }
    }
    // ---- Open tasks ----
    if (on('todos')) {
      const open_ = s.todos.filter((x) => x.doneTs == null).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
      for (const x of open_.slice(0, words.length ? 200 : 6)) {
        const list = s.todoLists.find((l) => l.id === x.listId);
        out.push({ id: `task-${x.id}`, group: t('Tasks'), label: t('Done: {title}', { title: x.title }), alt: `${x.title} task`, hint: list ? <span style={{ color: 'var(--text3)', fontSize: 12 }}>{tData(list.name)}</span> : undefined, icon: 'todos', stay: true, run: () => todo.toggle(x) });
      }
    }
    // ---- Commands ----
    const exp: [ExportKind, string, string][] = [
      ['txns', t('Export all transactions (CSV)'), 'finances'],
      ['workouts', t('Export all workouts (CSV)'), 'workouts'],
      ['sleep', t('Export all sleep (CSV)'), 'sleep'],
      ['habits', t('Export all habit check-ins (CSV)'), 'habits'],
    ];
    out.push({ id: 'theme', group: t('Commands'), label: theme === 'dark' ? t('Switch to the light theme') : t('Switch to the dark theme'), alt: 'theme dark light mode', icon: theme === 'dark' ? 'sun' : 'moon', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') });
    for (const [k, label, mod] of exp)
      if (on(mod))
        out.push({
          id: `export-${k}`,
          group: t('Commands'),
          label,
          alt: 'export download csv spreadsheet excel',
          icon: 'download',
          run: async () => {
            showToast(t('Preparing your spreadsheet…'));
            const n = await exportCsv(k, s);
            showToast(t('{n} rows saved', { n }));
          },
        });
    if (s.txns.some((x) => x.review)) out.push({ id: 'review', group: t('Commands'), label: t('Check imported payments'), alt: 'review bank sms', icon: 'review', run: () => go('freview') });
    out.push({ id: 'sidebar', group: t('Commands'), label: collapsed ? t('Expand sidebar') : t('Collapse sidebar'), alt: 'sidebar', icon: 'collapse', hint: <Kbd>[</Kbd>, run: () => setCollapsed(!collapsed) });
    out.push({ id: 'keys', group: t('Commands'), label: t('Keyboard shortcuts'), alt: 'help keys', icon: 'keyboard', hint: <Kbd>?</Kbd>, run: showHelp });

    // ---- Payments, once there's something to look for ----
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
          id: `txn-${x.id}`,
          group: t('Transactions'),
          label: x.name,
          alt: `${x.cat} ${tData(x.cat)} ${x.note || ''} ${Math.abs(x.amount)}`,
          hint: (
            <span style={{ fontSize: 12.5, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
              {relLabel(x.ts)} · <span style={{ color: 'var(--text)', fontWeight: 600 }}>{money(x.amount)}</span>
            </span>
          ),
          icon: 'txns',
          run: () => go('faddtx', { edit: x }),
        });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, q, theme, collapsed]);

  // Matches, best first within each group; groups keep their order.
  const shown = useMemo(() => {
    const groups: string[] = [];
    const by: Record<string, { item: Item; sc: number }[]> = {};
    for (const item of items) {
      const sc = score(item, words);
      if (!sc && !item.id.startsWith('txn-')) continue;
      if (!by[item.group]) {
        by[item.group] = [];
        groups.push(item.group);
      }
      by[item.group].push({ item, sc });
    }
    const flat: Item[] = [];
    // Typing: the best-matching group leads.
    if (words.length) groups.sort((a, b) => Math.max(...by[b].map((x) => x.sc)) - Math.max(...by[a].map((x) => x.sc)));
    for (const g of groups) flat.push(...by[g].sort((a, b) => b.sc - a.sc).slice(0, words.length ? 8 : 7).map((x) => x.item));
    return flat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q]);

  useEffect(() => setAt(0), [q]);
  useEffect(() => {
    list.current?.querySelector('[data-on="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const run = (item: Item | undefined) => {
    if (!item) return;
    void item.run();
    if (!item.stay) onClose();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAt((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAt((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(shown[at]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';
  return (
    <div className="desk-modal-wrap" style={{ zIndex: 100 }} onKeyDown={onKey}>
      <div className="desk-scrim" onClick={onClose} />
      <div className="desk-palette glass-strong" data-lens="dialog" role="dialog" aria-modal aria-label={t('Search or jump to…')}>
        <div className="desk-palette-input">
          <DIcon name="search" size={20} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search or jump to…')} aria-label={t('Search or jump to…')} aria-controls="desk-palette-list" aria-activedescendant={shown[at] ? `pal-${shown[at].id}` : undefined} />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={list} id="desk-palette-list" role="listbox" className="desk-palette-list">
          {shown.length === 0 && <div style={{ padding: '26px 12px', textAlign: 'center', fontSize: 14, color: 'var(--text3)' }}>{t('Nothing found for “{q}”', { q })}</div>}
          {shown.map((item, i) => {
            const head = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <React.Fragment key={item.id}>
                {head && <div className="desk-palette-group">{head}</div>}
                <div id={`pal-${item.id}`} role="option" aria-selected={i === at} data-on={i === at ? '1' : '0'} className={`desk-palette-item${i === at ? ' on' : ''}`} onMouseMove={() => i !== at && setAt(i)} onClick={() => run(item)}>
                  <DIcon name={item.icon} size={18} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  {item.hint && <span style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 'none' }}>{item.hint}</span>}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="desk-palette-foot">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> {t('to move')}
          </span>
          <span>
            <Kbd>↵</Kbd> {t('to choose')}
          </span>
          <span style={{ marginInlineStart: 'auto' }}>
            <Kbd>{MOD_KEY} K</Kbd> {t('anywhere')}
          </span>
        </div>
      </div>
    </div>
  );
}
