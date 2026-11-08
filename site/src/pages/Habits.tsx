import React, { useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import type { Counter, Habit } from '@core/types';
import { useStore, useData } from '../store';
import { useOpen } from '../forms/host';
import { api } from '../api';
import { enabled } from '@core/lib/modules';
import { daysLabel, dayKey } from '@core/lib/format';
import { t, tn, tData, date, num } from '../i18n';
import { Button, Check, Drawer, Empty, Menu } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { BarChart, Heatmap } from '../charts/charts';
import { addDays, bestStreakOf, habitHeatmap, habitRate, perfectRun, plannedOn, startOfDay, streakOf } from '../lib/series';
import { ColorDot } from '../forms/forms';
import { PageTabs } from '../layout/Shell';

// Habits on a big screen: every habit in one table with its last two weeks
// clickable, a year of check-ins above it, and the full story of any one habit
// in a side panel.

export function Habits() {
  const s = useData();
  const open = useOpen();
  const on = (m: string) => enabled(s, m);
  const tabs = [on('habits') && { to: '/habits', label: t('Habits'), end: true }, on('counters') && { to: '/habits/counters', label: t('Counters') }].filter(Boolean) as { to: string; label: string; end?: boolean }[];
  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="page-title">{t('Habits')}</h1>
          <div className="page-sub">{t('What you do most days, and how it’s going.')}</div>
        </div>
        <Routes>
          <Route path="counters" element={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'counter' })}>{t('New counter')}</Button>} />
          <Route path="*" element={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'habit' })}>{t('New habit')}</Button>} />
        </Routes>
      </div>
      {tabs.length > 1 && <PageTabs tabs={tabs} />}
      <Routes>
        <Route path="counters" element={<Counters />} />
        <Route path="*" element={on('habits') ? <HabitList /> : <Counters />} />
      </Routes>
    </div>
  );
}

function useToggle() {
  const { mutate } = useStore();
  return (habitId: string, dayTs: number) => {
    const key = dayKey(dayTs);
    mutate(
      (st) => {
        const has = st.checkins.some((c) => c.habitId === habitId && c.day === key);
        return { ...st, checkins: has ? st.checkins.filter((c) => !(c.habitId === habitId && c.day === key)) : [...st.checkins, { habitId, day: key }] };
      },
      () => api.toggleHabit(habitId, key)
    );
  };
}

function HabitList() {
  const s = useData();
  const open = useOpen();
  const { mutate } = useStore();
  const toggle = useToggle();
  const [detail, setDetail] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const now = Date.now();
  const day = new Date().toDateString();
  const today = startOfDay(now);
  const year = useMemo(() => habitHeatmap(s, 53, now), [s, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = s.habits.filter((h) => !h.archived);
  const archived = s.habits.filter((h) => h.archived);
  const checked = useMemo(() => new Set(s.checkins.map((c) => `${c.habitId}|${c.day}`)), [s.checkins]);
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));

  const flat = year.flat().filter((c) => !c.future && c.share !== null);
  const rate30 = flat.slice(-30);
  const avg30 = rate30.length ? rate30.reduce((a, c) => a + (c.share || 0), 0) / rate30.length : 0;
  const best = Math.max(0, ...live.map((h) => bestStreakOf(s, h)));
  const total30 = s.checkins.filter((c) => c.day >= dayKey(addDays(today, -29))).length;

  if (!live.length && !archived.length)
    return (
      <div className="card">
        <Empty icon="habits" title={t('No habits yet')} action={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'habit' })}>{t('New habit')}</Button>}>
          {t('Start with one small thing you want to do most days. You can tick it off here or on your phone.')}
        </Empty>
      </div>
    );

  const setFlag = (h: Habit, patch: Partial<Habit>, done: string) => {
    const body = { name: h.name, color: h.color, target: h.target, days: h.days, why: h.why, cue: h.cue ?? null, reminderTime: h.reminderTime, paused: h.paused, archived: h.archived, ...patch };
    mutate((st) => ({ ...st, habits: st.habits.map((x) => (x.id === h.id ? { ...x, ...patch } : x)) }), () => api.editHabit(h.id, body), done);
  };

  const row = (h: Habit) => {
    const rate = habitRate(s, h, 30, now);
    const streak = streakOf(s, h, now);
    return (
      <tr key={h.id} className="click" onClick={() => setDetail(h.id)} style={h.archived ? { opacity: 0.6 } : undefined}>
        <td>
          <span className="row" style={{ gap: 10 }}>
            <ColorDot c={h.color} size={9} />
            <span style={{ minWidth: 0 }}>
              <span className="truncate" style={{ display: 'block', fontWeight: 560, maxWidth: 280 }}>{tData(h.name)}</span>
              <span className="faint truncate" style={{ display: 'block', fontSize: 12, maxWidth: 280 }}>{h.cue || daysLabel(h.days)}</span>
            </span>
            {h.paused && <span className="badge">{t('Paused')}</span>}
          </span>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <span className="row" style={{ gap: 4 }}>
            {last14.map((d) => {
              const plan = plannedOn(h, d);
              const done = checked.has(`${h.id}|${dayKey(d)}`);
              return (
                <button
                  key={d}
                  title={`${date(d, { weekday: 'short', month: 'short', day: 'numeric' })}${plan ? '' : ` · ${t('not planned')}`}`}
                  aria-label={`${tData(h.name)} ${date(d, { weekday: 'long', month: 'long', day: 'numeric' })}`}
                  aria-pressed={done}
                  disabled={h.archived}
                  onClick={() => toggle(h.id, d)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    border: done ? 'none' : `1.5px ${plan ? 'solid' : 'dashed'} ${plan ? 'var(--line-2)' : 'var(--line)'}`,
                    background: done ? 'var(--accent)' : 'transparent',
                    cursor: 'pointer',
                    padding: 0,
                    outline: d === today ? '1.5px solid var(--text-3)' : undefined,
                    outlineOffset: 2,
                  }}
                />
              );
            })}
          </span>
        </td>
        <td style={{ width: 170 }}>
          {rate == null ? (
            <span className="faint">—</span>
          ) : (
            <span className="row" style={{ gap: 10 }}>
              <span className="bar" style={{ flex: 1 }}>
                <span style={{ width: `${rate * 100}%` }} />
              </span>
              <span className="num" style={{ width: 38, textAlign: 'end' }}>{Math.round(rate * 100)}%</span>
            </span>
          )}
        </td>
        <td className="r">{streak ? <span className="row" style={{ justifyContent: 'flex-end', gap: 5 }}><Icon name="flame" size={14} style={{ color: 'var(--accent)' }} />{num(streak)}</span> : <span className="faint">—</span>}</td>
        <td className="r" style={{ width: 52 }} onClick={(e) => e.stopPropagation()}>
          <Menu
            trigger={(tg) => <Button size="sm" kind="ghost" icon="more" title={t('More')} onClick={tg} />}
            items={[
              { label: t('Edit'), icon: 'edit', run: () => open({ kind: 'habit', habit: h }) },
              h.archived ? { label: t('Bring back'), icon: 'archive', run: () => setFlag(h, { archived: false }, t('Back on your list')) } : { label: h.paused ? t('Resume') : t('Pause'), icon: 'pause', run: () => setFlag(h, { paused: !h.paused }, h.paused ? t('Resumed') : t('Paused')) },
              !h.archived && { label: t('Archive'), icon: 'archive', run: () => setFlag(h, { archived: true }, t('Archived. Its history is kept.')) },
            ].filter(Boolean) as never}
          />
        </td>
      </tr>
    );
  };

  const habit = detail ? s.habits.find((h) => h.id === detail) : null;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 16, marginBottom: 16 }}>
        {[
          [t('Done, last 30 days'), `${Math.round(avg30 * 100)}%`, t('of what you planned')],
          [t('Perfect days in a row'), num(perfectRun(year)), t('every habit done')],
          [t('Best streak'), num(best), t('days, one habit')],
          [t('Check-ins, last 30 days'), num(total30), tn(live.length, 'across {n} habit', 'across {n} habits')],
        ].map(([l, v, sub]) => (
          <div key={l} className="card card-pad">
            <div className="stat-label">{l}</div>
            <div className="stat-value">{v}</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <span className="card-title">{t('Your year')}</span>
          <span className="card-sub">{t('Each square is a day: the darker, the more of that day’s habits you did')}</span>
        </div>
        <div className="card-body">
          <Heatmap weeks={year} title={(c) => (c.share === null ? t('Nothing planned') : t('{pct}% done', { pct: Math.round(c.share * 100) }))} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">{t('All habits')}</span>
          <span className="card-sub">{t('Click a square to tick that day off. Click a row for the details.')}</span>
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>{t('Habit')}</th>
                <th>{t('Last 14 days')}</th>
                <th>{t('Last 30 days')}</th>
                <th className="r">{t('Streak')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {live.map(row)}
              {showArchived && archived.map(row)}
            </tbody>
          </table>
        </div>
        {archived.length > 0 && (
          <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line-soft)' }}>
            <button className="link" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? t('Hide archived') : tn(archived.length, 'Show {n} archived habit', 'Show {n} archived habits')}
            </button>
          </div>
        )}
      </div>
      {habit && <HabitDetail habit={habit} onClose={() => setDetail(null)} />}
    </>
  );
}

function HabitDetail({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const s = useData();
  const open = useOpen();
  const now = Date.now();
  const weeks = habitHeatmap(s, 26, now, habit.id);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth() - (5 - i), 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() - (4 - i), 1).getTime();
    let planned = 0;
    let done = 0;
    const set = new Set(s.checkins.filter((c) => c.habitId === habit.id).map((c) => c.day));
    for (let x = start; x < Math.min(end, now + 1); x = addDays(x, 1)) {
      if (!plannedOn(habit, x)) continue;
      planned++;
      if (set.has(dayKey(x))) done++;
    }
    return { start, rate: planned ? Math.round((done / planned) * 100) : null };
  });
  const total = s.checkins.filter((c) => c.habitId === habit.id).length;
  const stats: [string, string][] = [
    [t('Current streak'), num(streakOf(s, habit, now))],
    [t('Best streak'), num(bestStreakOf(s, habit))],
    [t('Last 30 days'), habitRate(s, habit, 30, now) == null ? '—' : `${Math.round(habitRate(s, habit, 30, now)! * 100)}%`],
    [t('Times done'), num(total)],
  ];
  return (
    <Drawer
      wide
      title={
        <span className="row">
          <ColorDot c={habit.color} size={10} />
          {tData(habit.name)}
        </span>
      }
      sub={daysLabel(habit.days)}
      onClose={onClose}
      actions={
        <Button size="sm" icon="edit" onClick={() => (onClose(), open({ kind: 'habit', habit }))}>
          {t('Edit')}
        </Button>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 22 }}>
        {stats.map(([l, v]) => (
          <div key={l} className="card" style={{ padding: '12px 14px', background: 'var(--bg-2)' }}>
            <div className="faint" style={{ fontSize: 12 }}>{l}</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 650, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
      {(habit.cue || habit.why) && (
        <div style={{ display: 'grid', gap: 12, marginBottom: 22 }}>
          {habit.cue && (
            <div>
              <div className="label">{t('When and where')}</div>
              <div style={{ marginTop: 4 }}>{habit.cue}</div>
            </div>
          )}
          {habit.why && (
            <div>
              <div className="label">{t('Why it matters to you')}</div>
              <div style={{ marginTop: 4 }}>{habit.why}</div>
            </div>
          )}
        </div>
      )}
      <div className="label" style={{ marginBottom: 8 }}>{t('The last six months')}</div>
      <Heatmap weeks={weeks} title={(c) => (c.share === null ? t('Not planned') : c.share ? t('Done') : t('Missed'))} />
      <div className="label" style={{ margin: '22px 0 8px' }}>{t('Done, month by month')}</div>
      <BarChart height={180} minTop={100} fmt={(v) => `${Math.round(v)}%`} tipFmt={(v) => (v == null ? '—' : `${v}%`)} data={months.map((m, i) => ({ label: date(m.start, { month: 'short' }), value: m.rate, title: date(m.start, { month: 'long', year: 'numeric' }), now: i === 5 }))} />
    </Drawer>
  );
}

function Counters() {
  const s = useData();
  const open = useOpen();
  const { mutate } = useStore();
  const [detail, setDetail] = useState<Counter | null>(null);
  const now = Date.now();
  const today = startOfDay(now);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  if (!s.counters.length)
    return (
      <div className="card">
        <Empty icon="counter" title={t('No counters yet')} action={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'counter' })}>{t('New counter')}</Button>}>
          {t('Counters add things up: pages read, push-ups, glasses of water.')}
        </Empty>
      </div>
    );
  const sum = (id: string, from: number) => s.countLogs.filter((l) => l.counterId === id && l.ts >= from).reduce((a, l) => a + l.amount, 0);
  return (
    <>
      <div className="card">
        <table className="t">
          <thead>
            <tr>
              <th>{t('Counter')}</th>
              <th className="r">{t('Today')}</th>
              <th className="r">{t('This month')}</th>
              <th className="r">{t('All time')}</th>
              <th style={{ width: 200 }} />
            </tr>
          </thead>
          <tbody>
            {s.counters.map((c) => (
              <tr key={c.id} className="click" onClick={() => setDetail(c)}>
                <td>
                  <span className="row" style={{ gap: 10 }}>
                    <ColorDot c={c.color} size={9} />
                    <span style={{ fontWeight: 560 }}>{tData(c.name)}</span>
                    {c.unit && <span className="faint">{tData(c.unit)}</span>}
                  </span>
                </td>
                <td className="r" style={{ fontWeight: 650 }}>{num(sum(c.id, today))}</td>
                <td className="r">{num(sum(c.id, monthStart))}</td>
                <td className="r muted">{num(sum(c.id, 0) + 0)}</td>
                <td className="r" onClick={(e) => e.stopPropagation()}>
                  <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <Button size="sm" onClick={() => mutate(null, () => api.logCounter(c.id, c.step, Date.now()), t('Added {n}', { n: c.step }))}>
                      +{num(c.step)}
                    </Button>
                    <Button size="sm" kind="ghost" onClick={() => open({ kind: 'countlog', counter: c })}>
                      {t('Other amount')}
                    </Button>
                    <Button size="sm" kind="ghost" icon="edit" title={t('Edit')} onClick={() => open({ kind: 'counter', counter: c })} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <Drawer title={tData(detail.name)} sub={detail.unit ? tData(detail.unit) : undefined} onClose={() => setDetail(null)} wide>
          <div className="label" style={{ marginBottom: 8 }}>{t('Last 30 days')}</div>
          <BarChart
            height={220}
            data={Array.from({ length: 30 }, (_, i) => {
              const d0 = addDays(today, i - 29);
              return { label: date(d0, { day: 'numeric' }), value: s.countLogs.filter((l) => l.counterId === detail.id && l.ts >= d0 && l.ts < addDays(d0, 1)).reduce((a, l) => a + l.amount, 0), title: date(d0, { weekday: 'short', month: 'short', day: 'numeric' }), now: i === 29 };
            })}
          />
          <div className="label" style={{ margin: '22px 0 8px' }}>{t('Latest entries')}</div>
          <div className="card">
            {s.countLogs
              .filter((l) => l.counterId === detail.id)
              .sort((a, b) => b.ts - a.ts)
              .slice(0, 12)
              .map((l) => (
                <div key={l.id} className="list-row">
                  <span className="muted" style={{ flex: 1 }}>{date(l.ts, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  <b className="num">{l.amount > 0 ? '+' : ''}{num(l.amount)}</b>
                </div>
              ))}
          </div>
        </Drawer>
      )}
    </>
  );
}
