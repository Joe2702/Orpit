import React, { useMemo } from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { enabled } from '../lib/modules';
import { dayKey, greeting, hm, money0, minutes, relLabel, todayStr } from '../lib/format';
import { dueNow, dueLabel } from '../lib/todos';
import { isSpend } from '../lib/money';
import { teaserLine } from '../lib/brief';
import { assistantUnread } from '../lib/assistant';
import { FinIcon, guessFinIcon } from '../lib/iconPaths';
import { date, t, tData, tn } from '../i18n';
import { useTodoActions } from '../TodoRow';
import { DIcon, type DeskIcon } from './nav';
import { habitHeatmap, perfectRun, sleepNights, trainingWeeks } from './dashData';

// Home, on the website: everything at a glance, and the day's ticking-off
// within one click. One colour throughout, the accent; how much of it says
// how much.

const span = (n: number): React.CSSProperties => ({ gridColumn: `span ${n}` });
const A = 'var(--indigo)';
const tint = (pct: number) => `color-mix(in srgb, ${A} ${pct}%, transparent)`;

function Tile({ label, value, sub, icon, onClick, children }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: DeskIcon; onClick?: () => void; children?: React.ReactNode }) {
  return (
    <div className="desk-card" role={onClick ? 'link' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', display: 'flex', gap: 14, alignItems: 'center', padding: '16px 18px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>
          <DIcon name={icon} size={15} style={{ color: 'var(--text3)' }} />
          {label}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)', marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Ring({ pct, size = 52 }: { pct: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} aria-hidden style={{ flex: 'none', transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface2)" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={A} strokeWidth={5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, pct))} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)' }} />
    </svg>
  );
}

/** Vertical bars along a baseline: one series, so no legend; each bar names itself on hover. */
function Bars({ items, height = 132, avg }: { items: { v: number | null; tip: string; label?: string; now?: boolean }[]; height?: number; avg?: { v: number; label: string } }) {
  const max = Math.max(1, ...items.map((x) => x.v || 0), avg?.v || 0) * 1.08;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative', height, display: 'flex', alignItems: 'flex-end', gap: 6, borderBottom: '1px solid var(--border)' }}>
        {avg && avg.v > 0 && (
          <div aria-hidden style={{ position: 'absolute', insetInline: 0, bottom: `${(avg.v / max) * 100}%`, borderTop: '1px dashed color-mix(in srgb, var(--text) 22%, transparent)', pointerEvents: 'none' }}>
            <span style={{ position: 'absolute', insetInlineEnd: 0, bottom: 3, fontSize: 11, fontWeight: 600, color: 'var(--text3)', background: 'var(--surface)', paddingInlineStart: 6 }}>{avg.label}</span>
          </div>
        )}
        {items.map((x, i) => (
          <div key={i} className="desk-tip" data-tip={x.tip} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', cursor: 'default' }}>
            {x.v ? (
              <div style={{ width: '100%', maxWidth: 30, height: `${Math.max(3, (x.v / max) * 100)}%`, borderRadius: '4px 4px 0 0', background: x.now ? A : tint(62), transition: 'height .5s cubic-bezier(.2,.8,.2,1)' }} />
            ) : (
              <div style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--text3)', opacity: 0.5, marginBottom: 4 }} />
            )}
          </div>
        ))}
      </div>
      {items.some((x) => x.label) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
          {items.map((x, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: x.now ? 'var(--text)' : 'var(--text3)', fontWeight: x.now ? 650 : 500, whiteSpace: 'nowrap' }}>
              {x.label || ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.6px solid ${on ? A : 'var(--text3)'}`, background: on ? A : 'transparent', transition: 'background .2s, border-color .2s' }}>
      {on && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ fill: 'none', stroke: 'var(--on-accent)', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M2.5 6.2l2.3 2.3 4.7-5" />
        </svg>
      )}
    </span>
  );
}

const empty = (text: string, cta?: { label: string; onClick: () => void }) => (
  <div style={{ padding: '18px 0 6px', fontSize: 13.5, color: 'var(--text3)', lineHeight: 1.5 }}>
    {text}
    {cta && (
      <>
        {' '}
        <button className="desk-link" onClick={cta.onClick}>{cta.label}</button>
      </>
    )}
  </div>
);

export function Dashboard() {
  const { state, d, h } = useData();
  const { go, open, mutateOpt, haptic } = useStore();
  const todo = useTodoActions();
  const on = (m: string) => enabled(state, m);
  const now = Date.now();
  const day = new Date().toDateString();

  // ---- Today ----
  const dow = new Date().getDay();
  const todays = h.habits.filter((hb) => !hb.paused && (/^[01]{7}$/.test(hb.days) ? hb.days : '1111111')[dow] === '1');
  const doneN = todays.filter((x) => x.done).length;
  const toggleHabit = (id: string) => {
    const key = dayKey();
    haptic(12);
    mutateOpt(
      (s) => {
        const has = s.checkins.some((c) => c.habitId === id && c.day === key);
        return { ...s, checkins: has ? s.checkins.filter((c) => !(c.habitId === id && c.day === key)) : [...s.checkins, { habitId: id, day: key }] };
      },
      () => api.toggleHabit(id, key)
    ).catch(() => {});
  };
  const tasks = useMemo(() => dueNow(state, now).slice(0, 7), [state, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const listName = (id: string) => state.todoLists.find((l) => l.id === id)?.name || '';

  // ---- Series ----
  const grid = useMemo(() => habitHeatmap(state, 53), [state, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = perfectRun(grid);
  const nights = useMemo(() => sleepNights(state, 14), [state, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const weeks = useMemo(() => trainingWeeks(state, 8), [state, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const logged = nights.filter((n) => n.hours != null) as { day: number; hours: number }[];
  const sleepAvg = logged.length ? logged.reduce((s, n) => s + n.hours, 0) / logged.length : 0;
  const lastNight = [...state.nights].sort((a, b) => b.ts - a.ts)[0];
  const thisWeek = weeks[weeks.length - 1];

  // ---- Money ----
  const cats = Object.entries(d.catMonthSpent as Record<string, number>)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const topCats = cats.slice(0, 6);
  const catMax = topCats[0]?.[1] || 1;
  const fcat = (name: string) => state.fcats.find((c) => c.name === name) || { ...guessFinIcon(name), name };
  const recent = [...state.txns].sort((a, b) => b.ts - a.ts).slice(0, 8);
  const vsLast = d.spentPrevMonth > 0 ? Math.round(((d.spentThisMonth - d.spentPrevMonth) / d.spentPrevMonth) * 100) : null;
  const budgets = [...d.budgets].sort((a, b) => b.pct - a.pct).slice(0, 4);

  // ---- Brief and counters ----
  const claude = assistantUnread(state.assistantBrief) ? state.assistantBrief : null;
  const teaser = teaserLine(state, now);
  const counters = state.counters.slice(0, 6);
  const countToday = (id: string) => {
    const start = new Date().setHours(0, 0, 0, 0);
    return state.countLogs.filter((l) => l.counterId === id && l.ts >= start).reduce((s, l) => s + l.amount, 0);
  };

  const quick: { label: string; icon: DeskIcon; mod: string; run: () => void }[] = [
    { label: t('Expense'), icon: 'money', mod: 'finances', run: () => go('faddtx') },
    { label: t('Workout'), icon: 'workouts', mod: 'workouts', run: () => open('workout') },
    { label: t('Sleep'), icon: 'sleep', mod: 'sleep', run: () => open('sleep') },
    { label: t('Task'), icon: 'todos', mod: 'todos', run: () => open('todo') },
    { label: t('Habit'), icon: 'habits', mod: 'habits', run: () => open('habit') },
  ];

  const heatColor = (c: { share: number | null; future: boolean }) =>
    c.future ? 'transparent' : c.share === null ? 'var(--surface2)' : c.share === 0 ? tint(9) : c.share < 0.34 ? tint(28) : c.share < 0.67 ? tint(48) : c.share < 1 ? tint(72) : A;
  const months: { col: number; label: string }[] = [];
  grid.forEach((wk, i) => {
    const first = new Date(wk[0].day);
    const prev = i ? new Date(grid[i - 1][0].day) : null;
    if (!prev || prev.getMonth() !== first.getMonth()) months.push({ col: i, label: date(first, { month: 'short' }) });
  });

  return (
    <div style={{ paddingTop: 6 }}>
      {/* Greeting, and one click to log anything. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 14, color: 'var(--text2)', fontWeight: 550 }}>{todayStr()}</div>
          <div className="display" style={{ fontSize: 46, lineHeight: 1.05, color: 'var(--text)', marginTop: 6 }}>
            {state.profile.name ? t('{greeting}, {name}', { greeting: greeting(), name: state.profile.name.split(' ')[0] }) : greeting()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {quick
            .filter((q) => on(q.mod))
            .map((q) => (
              <div key={q.label} className="desk-chip" role="button" tabIndex={0} onClick={q.run} onKeyDown={(e) => e.key === 'Enter' && q.run()}>
                <DIcon name="plus" size={15} sw={2.3} />
                {q.label}
              </div>
            ))}
        </div>
      </div>

      <div className="desk-grid">
        {/* ---- Headline numbers ---- */}
        {on('habits') && (
          <div style={span(3)}>
            <Tile label={t('Habits today')} icon="habits" value={todays.length ? t('{done} of {total}', { done: doneN, total: todays.length }) : '—'} sub={run > 0 ? tn(run, '{n} perfect day in a row', '{n} perfect days in a row') : t('Tick them off below')} onClick={() => go('habits')}>
              {todays.length > 0 && <Ring pct={doneN / todays.length} />}
            </Tile>
          </div>
        )}
        {on('finances') && (
          <div style={span(3)}>
            <Tile
              label={t('Spent this month')}
              icon="money"
              value={money0(d.spentThisMonth)}
              sub={d.safe && d.safe.perDay > 0 ? t('{amount} a day left to spend', { amount: money0(d.safe.perDay) }) : vsLast != null ? (vsLast <= 0 ? t('{n}% less than last month', { n: Math.abs(vsLast) }) : t('{n}% more than last month', { n: vsLast })) : undefined}
              onClick={() => go('finances')}
            />
          </div>
        )}
        {on('sleep') && (
          <div style={span(3)}>
            <Tile label={t('Last night')} icon="sleep" value={lastNight && now - lastNight.ts < 2 * 86_400_000 ? hm(lastNight.hours) : '—'} sub={sleepAvg ? t('Average {time} over two weeks', { time: hm(sleepAvg) }) : t('Nothing logged yet')} onClick={() => go('sleep')} />
          </div>
        )}
        {on('workouts') && (
          <div style={span(3)}>
            <Tile label={t('Training this week')} icon="workouts" value={tn(thisWeek.count, '{n} workout', '{n} workouts')} sub={thisWeek.minutes ? minutes(thisWeek.minutes) : t('Nothing yet this week')} onClick={() => go('workouts')} />
          </div>
        )}

        {/* ---- Today: habits and tasks ---- */}
        {(on('habits') || on('todos')) && (
          <div className="desk-card" style={span(5)}>
            {on('habits') && (
              <>
                <div className="desk-card-title">
                  {t("Today's habits")}
                  <button className="desk-link" onClick={() => go('habits')}>{t('All habits')}</button>
                </div>
                {todays.length === 0 && empty(t('Nothing planned for today.'), { label: t('Add a habit'), onClick: () => open('habit') })}
                {todays.map((hb) => (
                  <div key={hb.id} className="desk-row" role="checkbox" aria-checked={hb.done} tabIndex={0} onClick={() => toggleHabit(hb.id)} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), toggleHabit(hb.id))}>
                    <Check on={hb.done} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 550, color: hb.done ? 'var(--text2)' : 'var(--text)', textDecoration: hb.done ? 'line-through' : 'none', textDecorationColor: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tData(hb.name)}</span>
                    {hb.streak > 1 && <span style={{ fontSize: 12, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{tn(hb.streak, '{n} day', '{n} days')}</span>}
                  </div>
                ))}
              </>
            )}
            {on('todos') && (
              <div style={{ marginTop: on('habits') ? 22 : 0 }}>
                <div className="desk-card-title">
                  {t('Due now')}
                  <button className="desk-link" onClick={() => go('todos')}>{t('All tasks')}</button>
                </div>
                {tasks.length === 0 && empty(t('Nothing due. A clear day.'), { label: t('Add a task'), onClick: () => open('todo') })}
                {tasks.map((x) => {
                  const due = x.due ? dueLabel(x.due, now) : null;
                  return (
                    <div key={x.id} className="desk-row" onClick={() => open('todo', { id: x.id })}>
                      <span role="checkbox" aria-checked={x.doneTs != null} aria-label={x.title} tabIndex={0} onClick={(e) => (e.stopPropagation(), todo.toggle(x))} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), e.stopPropagation(), todo.toggle(x))}>
                        <Check on={x.doneTs != null} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 550, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.title}</span>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{tData(listName(x.listId))}</span>
                      </span>
                      {due && <span style={{ fontSize: 12, fontWeight: 600, color: due.kind === 'late' ? 'var(--danger)' : 'var(--text2)', whiteSpace: 'nowrap' }}>{due.text}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---- Money this month ---- */}
        {on('finances') && (
          <div className="desk-card" style={span(on('habits') || on('todos') ? 7 : 12)}>
            <div className="desk-card-title">
              {t('Where the money went this month')}
              <button className="desk-link" onClick={() => go('ftxns')}>{t('All transactions')}</button>
            </div>
            {topCats.length === 0 && empty(t('No spending logged this month.'), { label: t('Add an expense'), onClick: () => go('faddtx') })}
            <div style={{ display: 'grid', gap: 10 }}>
              {topCats.map(([cat, amt]) => {
                const c = fcat(cat);
                return (
                  <div key={cat} className="desk-row desk-tip" data-tip={t('{pct}% of the month', { pct: Math.round((amt / Math.max(1, d.spentThisMonth)) * 100) })} onClick={() => go('ftxns', { cat })} style={{ padding: '6px 10px' }}>
                    <span style={{ width: 28, display: 'flex', justifyContent: 'center', flex: 'none' }}>
                      <FinIcon icon={c.icon} color="var(--text2)" size={18} />
                    </span>
                    <span style={{ width: 130, flex: 'none', fontSize: 13.5, fontWeight: 550, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tData(cat)}</span>
                    <span style={{ flex: 1, height: 10, borderRadius: 5, background: 'var(--surface2)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${(amt / catMax) * 100}%`, background: A, borderRadius: 5, transition: 'width .6s cubic-bezier(.2,.8,.2,1)' }} />
                    </span>
                    <span style={{ width: 92, flex: 'none', textAlign: 'end', fontSize: 13.5, fontWeight: 650, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money0(amt)}</span>
                  </div>
                );
              })}
            </div>
            {budgets.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, budgets.length)}, minmax(0,1fr))`, gap: 12, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--hairline)' }}>
                {budgets.map((b) => {
                  const over = b.pct >= 100;
                  return (
                    <div key={b.cat} role="link" tabIndex={0} onClick={() => go('fbudgets')} style={{ cursor: 'pointer', minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tData(b.cat)}</span>
                        <span style={{ color: over ? 'var(--danger)' : 'var(--text3)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{b.pct}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--surface2)', marginTop: 7, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, b.pct)}%`, background: over ? 'var(--danger)' : b.pct >= 80 ? 'var(--warning)' : A, borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 5 }}>{over ? t('{amount} over', { amount: money0(b.spent - b.effLimit) }) : t('{amount} left', { amount: money0(b.remaining) })}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---- A year of habits ---- */}
        {on('habits') && state.habits.length > 0 && (
          <div className="desk-card" style={span(12)}>
            <div className="desk-card-title">
              {t('Your year in habits')}
              <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text3)' }}>{t('Each square is a day: the darker, the more of that day’s habits you did')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px' }}>
              <div />
              <div style={{ position: 'relative', height: 14 }}>
                {months.map((m) => (
                  <span key={m.col} style={{ position: 'absolute', insetInlineStart: `${(m.col / grid.length) * 100}%`, fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{m.label}</span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gap: 3, fontSize: 10.5, color: 'var(--text3)' }}>
                {[1, 3, 5].map((k) => (
                  <span key={k} style={{ gridRow: k + 1, lineHeight: 1, alignSelf: 'center' }}>{date(new Date(2026, 0, 5 + k), { weekday: 'short' })}</span>
                ))}
              </div>
              <div role="img" aria-label={t('Your year in habits')} style={{ display: 'grid', gridTemplateColumns: `repeat(${grid.length}, minmax(0, 1fr))`, gap: 3 }}>
                {grid.map((wk, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gap: 3 }}>
                    {wk.map((c) => (
                      <div
                        key={c.day}
                        className="desk-tip"
                        data-tip={c.future ? undefined : `${date(c.day, { weekday: 'short', month: 'short', day: 'numeric' })} · ${c.share === null ? t('nothing planned') : t('{pct}% done', { pct: Math.round(c.share * 100) })}`}
                        style={{ aspectRatio: '1', borderRadius: 3, background: heatColor(c), outline: c.day === new Date(now).setHours(0, 0, 0, 0) ? '1.5px solid var(--text2)' : undefined, outlineOffset: 1 }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginTop: 12, fontSize: 11.5, color: 'var(--text3)' }}>
              {t('None')}
              {[9, 28, 48, 72, 100].map((p) => (
                <span key={p} style={{ width: 11, height: 11, borderRadius: 3, background: p === 100 ? A : tint(p) }} />
              ))}
              {t('All done')}
            </div>
          </div>
        )}

        {/* ---- Sleep and training ---- */}
        {on('sleep') && (
          <div className="desk-card" style={span(on('workouts') ? 6 : 12)}>
            <div className="desk-card-title">
              {t('Sleep, the last two weeks')}
              <button className="desk-link" onClick={() => go('sleep')}>{t('Open')}</button>
            </div>
            <Bars
              items={nights.map((n, i) => ({
                v: n.hours,
                tip: `${date(n.day, { weekday: 'short', month: 'short', day: 'numeric' })} · ${n.hours == null ? t('not logged') : hm(n.hours)}`,
                label: i % 2 === 1 || i === nights.length - 1 ? date(n.day, { day: 'numeric' }) : '',
                now: i === nights.length - 1,
              }))}
              avg={sleepAvg ? { v: sleepAvg, label: t('avg {time}', { time: hm(sleepAvg) }) } : undefined}
            />
          </div>
        )}
        {on('workouts') && (
          <div className="desk-card" style={span(on('sleep') ? 6 : 12)}>
            <div className="desk-card-title">
              {t('Training, minutes per week')}
              <button className="desk-link" onClick={() => go('workouts')}>{t('Open')}</button>
            </div>
            <Bars
              items={weeks.map((w, i) => ({
                v: w.minutes,
                tip: `${t('Week of {date}', { date: date(w.start, { month: 'short', day: 'numeric' }) })} · ${tn(w.count, '{n} workout', '{n} workouts')}, ${minutes(w.minutes)}`,
                label: i === weeks.length - 1 ? t('This week') : date(w.start, { month: 'short', day: 'numeric' }),
                now: i === weeks.length - 1,
              }))}
            />
          </div>
        )}

        {/* ---- Recent money ---- */}
        {on('finances') && (
          <div className="desk-card" style={span(counters.length && on('counters') ? 7 : 12)}>
            <div className="desk-card-title">
              {t('Recent transactions')}
              <button className="desk-link" onClick={() => go('ftxns')}>{t('See all')}</button>
            </div>
            {recent.length === 0 && empty(t('Nothing logged yet.'), { label: t('Add an expense'), onClick: () => go('faddtx') })}
            {recent.map((x) => {
              const c = fcat(x.cat);
              const spend = isSpend(x) && !x.toAccId && !x.adjust;
              return (
                <div key={x.id} className="desk-row" onClick={() => go('faddtx', { edit: x })}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                    <FinIcon icon={c.icon} color="var(--text2)" size={17} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
                      {tData(x.cat)} · {relLabel(x.ts)}
                    </span>
                  </span>
                  {x.review && <span className="desk-count" title={t('Needs a look')}>{t('Check')}</span>}
                  <span style={{ fontSize: 14, fontWeight: 650, color: spend ? 'var(--text)' : 'var(--success)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {spend ? '−' : x.amount > 0 ? '+' : ''}
                    {money0(x.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ---- Counters and the brief ---- */}
        {((on('counters') && counters.length > 0) || !on('finances')) && (
          <div style={{ ...span(on('finances') ? 5 : 12), display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="desk-card" role="link" tabIndex={0} onClick={() => go('brief')} style={{ cursor: 'pointer', background: `linear-gradient(140deg, ${tint(16)}, var(--surface) 70%)` }}>
              <div className="desk-card-title" style={{ marginBottom: 8 }}>
                <DIcon name="brief" size={18} style={{ color: A }} />
                {claude ? claude.title : t('Morning brief')}
                {claude && <span className="desk-dot" />}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.55 }}>{claude ? t('A new brief from Claude is waiting.') : teaser || t('Your day in one page: what’s due, what’s planned, and how the month is going.')}</div>
            </div>
            {on('counters') && counters.length > 0 && (
              <div className="desk-card" style={{ flex: 1 }}>
                <div className="desk-card-title">
                  {t('Counters today')}
                  <button className="desk-link" onClick={() => go('counters')}>{t('Open')}</button>
                </div>
                {counters.map((c) => (
                  <div key={c.id} className="desk-row" style={{ cursor: 'default' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tData(c.name)}</span>
                    <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {countToday(c.id)} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)' }}>{tData(c.unit)}</span>
                    </span>
                    <button className="desk-btn" style={{ height: 30, padding: '0 10px' }} onClick={() => open('countlog', { counterId: c.id, amount: c.step })} aria-label={t('Add to {name}', { name: tData(c.name) })}>
                      +{c.step}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
