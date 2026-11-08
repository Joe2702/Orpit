import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, useData } from '../store';
import { useOpen } from '../forms/host';
import { api } from '../api';
import { enabled } from '@core/lib/modules';
import { derive } from '@core/lib/derive';
import { dayKey, greeting, hm, minutes, money, money0, moneyShort, fmtClock } from '@core/lib/format';
import { dueNow, lastList } from '@core/lib/todos';
import { assistantUnread } from '@core/lib/assistant';
import { FinIcon, guessFinIcon } from '@core/lib/iconPaths';
import { isSpend } from '@core/lib/money';
import { t, tn, tData, date } from '../i18n';
import { Button, Check, Delta, Empty } from '../ui/kit';
import { Icon, type IconName } from '../ui/Icon';
import { BarChart, RankBars, SleepSchedule, Spark } from '../charts/charts';
import { addDays, byCategory, change, dailySpend, habitHeatmap, mask, perfectRun, sleepNights, startOfDay, startOfMonth, startOfWeek, streakOf, trainingWeeks } from '../lib/series';
import { ColorDot } from '../forms/forms';

export function Overview() {
  const s = useData();
  const { mutate } = useStore();
  const open = useOpen();
  const nav = useNavigate();
  const on = (m: string) => enabled(s, m);
  const now = Date.now();
  const day = new Date().toDateString();
  const d = useMemo(() => derive(s, 'Month', 0), [s, day]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Habits ----
  const today = startOfDay(now);
  const live = s.habits.filter((h) => !h.archived && !h.paused);
  const todayKey = dayKey();
  const doneToday = new Set(s.checkins.filter((c) => c.day === todayKey).map((c) => c.habitId));
  const planned = live.filter((h) => mask(h)[new Date().getDay()] === '1');
  const doneN = planned.filter((h) => doneToday.has(h.id)).length;
  const grid = useMemo(() => habitHeatmap(s, 3, now), [s, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = perfectRun(useMemo(() => habitHeatmap(s, 53, now), [s, day])); // eslint-disable-line react-hooks/exhaustive-deps
  const habitSpark = grid.flat().filter((c) => !c.future).slice(-14).map((c) => c.share ?? 0);

  // ---- Money ----
  const monthStart = startOfMonth(now);
  const lastStart = startOfMonth(now, -1);
  const dom = new Date().getDate();
  const sameDayLast = Math.min(addDays(lastStart, dom), monthStart);
  const spentLastSoFar = s.txns.filter((x) => x.ts >= lastStart && x.ts < sameDayLast && !x.toAccId && !x.adjust && isSpend(x)).reduce((a, x) => a - x.amount, 0);
  const spend30 = useMemo(() => dailySpend(s, 30, now), [s, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const avg30 = spend30.reduce((a, x) => a + x.amount, 0) / 30;
  let cum = 0;
  const monthCum = spend30.filter((x) => x.day >= monthStart).map((x) => (cum += x.amount));
  const cats = byCategory(s, monthStart).slice(0, 6);

  // ---- Sleep and training ----
  const nights = useMemo(() => sleepNights(s, 14, now), [s, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const sleep7 = avg(nights.slice(7).map((n) => n.hours));
  const sleepPrev = avg(nights.slice(0, 7).map((n) => n.hours));
  const weeks = useMemo(() => trainingWeeks(s, 8, now), [s, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const wk = weeks[weeks.length - 1];
  const prev4 = weeks.slice(3, 7).reduce((a, w) => a + w.minutes, 0) / 4;

  // ---- Tasks, bills, recent ----
  const tasks = dueNow(s, now).slice(0, 7);
  const [newTask, setNewTask] = useState('');
  const addTask = () => {
    const listId = lastList(s) || s.todoLists[0]?.id;
    if (!newTask.trim() || !listId) return;
    const title = newTask.trim();
    setNewTask('');
    mutate(null, () => api.addTodo({ listId, title, due: todayKey }), t('Task added'));
  };
  const bills = s.recurring
    .filter((r) => r.nextTs && r.nextTs < addDays(today, 15))
    .sort((a, b) => (a.nextTs || 0) - (b.nextTs || 0))
    .slice(0, 5);
  const recent = [...s.txns].sort((a, b) => b.ts - a.ts).slice(0, 7);
  const brief = assistantUnread(s.assistantBrief) ? s.assistantBrief : null;

  const toggle = (habitId: string, dayTs: number) => {
    const key = dayKey(dayTs);
    mutate(
      (st) => {
        const has = st.checkins.some((c) => c.habitId === habitId && c.day === key);
        return { ...st, checkins: has ? st.checkins.filter((c) => !(c.habitId === habitId && c.day === key)) : [...st.checkins, { habitId, day: key }] };
      },
      () => api.toggleHabit(habitId, key)
    );
  };
  const weekStart = startOfWeek(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const checked = new Set(s.checkins.map((c) => `${c.habitId}|${c.day}`));
  const weekPlanned = live.reduce((a, h) => a + days.filter((x) => mask(h)[new Date(x).getDay()] === '1').length, 0);
  const weekDone = live.reduce((a, h) => a + days.filter((x) => mask(h)[new Date(x).getDay()] === '1' && checked.has(`${h.id}|${dayKey(x)}`)).length, 0);

  const kpis: { key: string; icon: IconName; label: string; value: React.ReactNode; sub: React.ReactNode; spark?: number[]; to: string }[] = [];
  if (on('habits'))
    kpis.push({ key: 'h', icon: 'habits', label: t('Habits today'), value: planned.length ? t('{done} of {total}', { done: doneN, total: planned.length }) : '—', sub: run > 0 ? tn(run, '{n} perfect day in a row', '{n} perfect days in a row') : t('Nothing missed yet today'), spark: habitSpark, to: '/habits' });
  if (on('finances'))
    kpis.push({ key: 'm', icon: 'money', label: t('Spent this month'), value: money0(d.spentThisMonth), sub: <span className="row" style={{ gap: 6 }}><Delta pct={change(d.spentThisMonth, spentLastSoFar)} goodWhenUp={false} />{t('vs. this point last month')}</span>, spark: monthCum, to: '/money' });
  if (on('sleep'))
    kpis.push({ key: 's', icon: 'sleep', label: t('Sleep, last 7 nights'), value: sleep7 != null ? hm(sleep7) : '—', sub: sleep7 != null && sleepPrev != null ? <span className="row" style={{ gap: 6 }}><Delta pct={change(sleep7, sleepPrev)} />{t('vs. the week before')}</span> : t('Average a night'), spark: nights.map((n) => n.hours ?? 0), to: '/fitness/sleep' });
  if (on('workouts'))
    kpis.push({ key: 'w', icon: 'fitness', label: t('Training this week'), value: minutes(wk.minutes), sub: <span className="row" style={{ gap: 6 }}><Delta pct={change(wk.minutes, prev4)} />{t('vs. your 4-week average')}</span>, spark: weeks.map((w) => w.minutes), to: '/fitness' });

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="faint" style={{ fontSize: 13, fontWeight: 520 }}>{date(now, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 className="page-title" style={{ fontSize: 28, marginTop: 2 }}>
            {s.profile.name ? t('{greeting}, {name}', { greeting: greeting(), name: s.profile.name.split(' ')[0] }) : greeting()}
          </h1>
        </div>
        {d.safe && on('finances') && (
          <div className="card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name="wallet" size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div className="faint" style={{ fontSize: 12 }}>{t('Safe to spend today')}</div>
              <div className="num" style={{ fontWeight: 650, fontSize: 15 }}>
                {money0(Math.max(0, d.safe.perDay))} <span className="faint" style={{ fontWeight: 500, fontSize: 12.5 }}>· {tn(d.safe.daysLeft, '{n} day left', '{n} days left')}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {brief && (
        <div className="banner" style={{ marginBottom: 16, cursor: 'pointer' }} onClick={() => nav('/insights')}>
          <Icon name="sunrise" size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ flex: 1 }}>
            <b>{t('New from Claude')}:</b> {brief.title}
          </span>
          <span className="link">{t('Read it')}</span>
        </div>
      )}

      {kpis.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpis.length}, minmax(0, 1fr))`, gap: 16, marginBottom: 16 }}>
          {kpis.map((k) => (
            <div key={k.key} className="card card-pad" role="link" tabIndex={0} onClick={() => nav(k.to)} onKeyDown={(e) => e.key === 'Enter' && nav(k.to)} style={{ cursor: 'pointer' }}>
              <div className="stat-label">
                <Icon name={k.icon} size={15} style={{ color: 'var(--text-3)' }} />
                {k.label}
              </div>
              <div className="row" style={{ alignItems: 'flex-end', marginTop: 2 }}>
                <div className="stat-value truncate" style={{ flex: 1 }}>
                  {k.value}
                </div>
                {k.spark && <Spark values={k.spark} width={96} />}
              </div>
              <div className="faint" style={{ fontSize: 12.5, marginTop: 8 }}>
                {k.sub}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid">
        {on('habits') && (
          <div className="card c8">
            <div className="card-head">
              <span className="card-title">{t('This week')}</span>
              <span className="card-sub num">{t('{done} of {total} check-ins', { done: weekDone, total: weekPlanned })}</span>
              <span className="spacer" />
              <Button size="sm" kind="ghost" icon="plus" onClick={() => open({ kind: 'habit' })}>
                {t('Habit')}
              </Button>
            </div>
            {live.length === 0 ? (
              <Empty icon="habits" title={t('No habits yet')} action={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'habit' })}>{t('New habit')}</Button>}>
                {t('Start with one small thing you want to do most days.')}
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>{t('Habit')}</th>
                      {days.map((x) => (
                        <th key={x} style={{ textAlign: 'center', color: x === today ? 'var(--accent)' : undefined, width: 56 }}>
                          {date(x, { weekday: 'short' })}
                          <span style={{ display: 'block', fontWeight: 500, fontSize: 11 }}>{date(x, { day: 'numeric' })}</span>
                        </th>
                      ))}
                      <th className="r" style={{ width: 80 }}>{t('Streak')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {live.slice(0, 9).map((h) => {
                      const streak = streakOf(s, h, now);
                      return (
                        <tr key={h.id}>
                          <td>
                            <span className="row">
                              <ColorDot c={h.color} />
                              <span className="truncate" style={{ maxWidth: 260, fontWeight: 520 }}>{tData(h.name)}</span>
                            </span>
                          </td>
                          {days.map((x) => {
                            const plan = mask(h)[new Date(x).getDay()] === '1';
                            const done = checked.has(`${h.id}|${dayKey(x)}`);
                            const future = x > today;
                            return (
                              <td key={x} style={{ textAlign: 'center', background: x === today ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : undefined }}>
                                {future ? (
                                  <span className="dot" style={{ background: 'var(--line-2)', display: 'inline-block', width: 5, height: 5 }} />
                                ) : plan || done ? (
                                  <Check round on={done} onChange={() => toggle(h.id, x)} label={`${tData(h.name)}, ${date(x, { weekday: 'long' })}`} />
                                ) : (
                                  <span className="faint" title={t('Not planned')}>–</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="r">{streak > 0 ? <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}><Icon name="flame" size={13} style={{ color: 'var(--accent)' }} />{streak}</span> : <span className="faint">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {on('todos') && (
          <div className={`card ${on('habits') ? 'c4' : 'c12'}`} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-head">
              <span className="card-title">{t('Due now')}</span>
              <span className="spacer" />
              <button className="link" onClick={() => nav('/tasks')}>{t('All tasks')}</button>
            </div>
            <div style={{ flex: 1 }}>
              {tasks.length === 0 && <div className="faint" style={{ padding: '18px 18px 8px', fontSize: 13.5 }}>{t('Nothing due. A clear day.')}</div>}
              {tasks.map((x) => {
                const late = x.due && x.due < todayKey;
                return (
                  <div key={x.id} className="list-row hover-row click" onClick={() => open({ kind: 'task', task: x })}>
                    <Check round on={false} onChange={() => mutate((st) => ({ ...st, todos: st.todos.map((y) => (y.id === x.id ? { ...y, doneTs: Date.now() } : y)) }), () => api.setTodoDone(x.id, true), t('Done'))} label={x.title} />
                    <span className="truncate" style={{ flex: 1 }}>{x.title}</span>
                    {x.due && <span className="badge" style={late ? { color: 'var(--bad)' } : undefined}>{late ? t('Late') : t('Today')}</span>}
                  </div>
                );
              })}
            </div>
            {s.todoLists.length > 0 && (
              <form onSubmit={(e) => (e.preventDefault(), addTask())} style={{ padding: 12, borderTop: '1px solid var(--line-soft)' }}>
                <div className="input-wrap">
                  <Icon name="plus" size={15} />
                  <input className="input" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder={t('Add a task for today, press Enter')} />
                </div>
              </form>
            )}
          </div>
        )}

        {on('finances') && (
          <>
            <div className="card c8">
              <div className="card-head">
                <span className="card-title">{t('Spending, last 30 days')}</span>
                <span className="card-sub num">{t('{amount} a day on average', { amount: money0(avg30) })}</span>
                <span className="spacer" />
                <button className="link" onClick={() => nav('/money/transactions')}>{t('Transactions')}</button>
              </div>
              <div className="card-body">
                <BarChart
                  height={300}
                  data={spend30.map((x, i) => ({ label: date(x.day, { day: 'numeric' }), value: x.amount, title: date(x.day, { weekday: 'short', month: 'short', day: 'numeric' }), now: i === spend30.length - 1 }))}
                  fmt={moneyShort}
                  tipFmt={(v) => money0(v || 0)}
                  refLine={{ value: avg30, label: t('avg {amount}', { amount: moneyShort(avg30) }) }}
                />
              </div>
            </div>
            <div className="card c4">
              <div className="card-head">
                <span className="card-title">{t('Where it went this month')}</span>
              </div>
              <div className="card-body">
                {cats.length === 0 ? (
                  <div className="faint">{t('No spending logged this month.')}</div>
                ) : (
                  <RankBars
                    fmt={money0}
                    rows={cats.map((c) => {
                      const f = s.fcats.find((x) => x.name === c.cat) || guessFinIcon(c.cat);
                      return {
                        key: c.cat,
                        label: (
                          <span className="row" style={{ gap: 8 }}>
                            <FinIcon icon={f.icon} color="var(--text-3)" size={15} />
                            {tData(c.cat)}
                          </span>
                        ),
                        value: c.amount,
                        onClick: () => nav(`/money/transactions?cat=${encodeURIComponent(c.cat)}&when=month`),
                      };
                    })}
                  />
                )}
                {d.budgets.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-soft)', display: 'grid', gap: 10 }}>
                    {[...d.budgets]
                      .sort((a, b) => b.pct - a.pct)
                      .slice(0, 3)
                      .map((b) => (
                        <div key={b.id} style={{ cursor: 'pointer' }} onClick={() => nav('/money/budgets')}>
                          <div className="row" style={{ fontSize: 12.5 }}>
                            <span style={{ fontWeight: 560 }}>{tData(b.cat)}</span>
                            <span className="spacer" />
                            <span className="num" style={{ color: b.pct >= 100 ? 'var(--bad)' : 'var(--text-2)' }}>
                              {money0(b.spent)} / {money0(b.effLimit)}
                            </span>
                          </div>
                          <div className="bar" style={{ marginTop: 6 }}>
                            <span style={{ width: `${Math.min(100, b.pct)}%`, background: b.pct >= 100 ? 'var(--bad)' : b.pct >= 80 ? 'var(--warn)' : undefined }} />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {on('sleep') && (
          <div className={`card ${on('workouts') ? 'c6' : 'c12'}`}>
            <div className="card-head">
              <span className="card-title">{t('Bedtimes, last two weeks')}</span>
              <span className="card-sub">{t('Steady bars mean a steady schedule')}</span>
              <span className="spacer" />
              <Button size="sm" kind="ghost" icon="plus" onClick={() => open({ kind: 'night' })}>
                {t('Night')}
              </Button>
            </div>
            <div className="card-body">
              <SleepSchedule nights={nights} clock={fmtClock} />
            </div>
          </div>
        )}
        {on('workouts') && (
          <div className={`card ${on('sleep') ? 'c6' : 'c12'}`}>
            <div className="card-head">
              <span className="card-title">{t('Training, minutes per week')}</span>
              <span className="spacer" />
              <Button size="sm" kind="ghost" icon="plus" onClick={() => open({ kind: 'workout' })}>
                {t('Workout')}
              </Button>
            </div>
            <div className="card-body">
              <BarChart
                height={220}
                data={weeks.map((w, i) => ({ label: i === weeks.length - 1 ? t('This week') : date(w.start, { month: 'short', day: 'numeric' }), value: w.minutes, title: t('Week of {date}', { date: date(w.start, { month: 'short', day: 'numeric' }) }), now: i === weeks.length - 1 }))}
                tipFmt={(v) => minutes(v || 0)}
                refLine={prev4 ? { value: prev4, label: t('4-week avg') } : undefined}
              />
            </div>
          </div>
        )}

        {on('finances') && (
          <>
            <div className="card c8">
              <div className="card-head">
                <span className="card-title">{t('Recent transactions')}</span>
                <span className="spacer" />
                <Button size="sm" kind="ghost" icon="plus" onClick={() => open({ kind: 'txn' })}>
                  {t('Transaction')}
                </Button>
              </div>
              {recent.length === 0 ? (
                <Empty icon="money" title={t('Nothing logged yet')} />
              ) : (
                <table className="t">
                  <tbody>
                    {recent.map((x) => {
                      const f = s.fcats.find((c) => c.name === x.cat) || guessFinIcon(x.cat);
                      const plus = !x.toAccId && x.amount > 0;
                      return (
                        <tr key={x.id} className="click" onClick={() => open({ kind: 'txn', txn: x })}>
                          <td style={{ width: 40 }}>
                            <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--panel-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FinIcon icon={f.icon} color="var(--text-2)" size={15} />
                            </span>
                          </td>
                          <td>
                            <span className="row">
                              <span style={{ fontWeight: 560 }}>{x.name}</span>
                              {x.review && <span className="badge accent">{t('Check')}</span>}
                            </span>
                          </td>
                          <td className="muted">{x.toAccId ? t('Transfer') : tData(x.cat)}</td>
                          <td className="faint num">{date(x.ts, { month: 'short', day: 'numeric' })}</td>
                          <td className="r" style={{ fontWeight: 600, color: plus ? 'var(--good)' : undefined }}>
                            {plus ? '+' : x.toAccId ? '' : '−'}
                            {money(x.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card c4">
              <div className="card-head">
                <span className="card-title">{t('Coming up')}</span>
                <span className="spacer" />
                <button className="link" onClick={() => nav('/money/bills')}>{t('All bills')}</button>
              </div>
              {bills.length === 0 ? (
                <div className="faint" style={{ padding: 18, fontSize: 13.5 }}>{t('No bills in the next two weeks.')}</div>
              ) : (
                bills.map((b) => {
                  const days = Math.round((startOfDay(b.nextTs!) - today) / 86_400_000);
                  return (
                    <div key={b.id} className="list-row hover-row click" onClick={() => open({ kind: 'bill', bill: b })}>
                      <Icon name="repeat" size={15} style={{ color: 'var(--text-3)' }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="truncate" style={{ display: 'block', fontWeight: 540 }}>{tData(b.name)}</span>
                        <span className="faint" style={{ fontSize: 12 }}>{days <= 0 ? t('Due today') : tn(days, 'In {n} day', 'In {n} days')}</span>
                      </span>
                      <span className="num" style={{ fontWeight: 600, color: b.income ? 'var(--good)' : undefined }}>{money0(b.amount)}</span>
                    </div>
                  );
                })
              )}
              {on('counters') && s.counters.length > 0 && (
                <>
                  <div className="card-head" style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <span className="card-title">{t('Counters today')}</span>
                  </div>
                  {s.counters.slice(0, 4).map((c) => {
                    const v = s.countLogs.filter((l) => l.counterId === c.id && l.ts >= today).reduce((a, l) => a + l.amount, 0);
                    return (
                      <div key={c.id} className="list-row">
                        <ColorDot c={c.color} />
                        <span className="truncate" style={{ flex: 1 }}>{tData(c.name)}</span>
                        <span className="num" style={{ fontWeight: 600 }}>
                          {v} <span className="faint" style={{ fontWeight: 500, fontSize: 12 }}>{tData(c.unit)}</span>
                        </span>
                        <Button size="sm" onClick={() => mutate(null, () => api.logCounter(c.id, c.step, Date.now()))}>+{c.step}</Button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
