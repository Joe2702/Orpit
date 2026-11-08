import React, { useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useData } from '../store';
import { useOpen } from '../forms/host';
import { enabled } from '@core/lib/modules';
import { fmtClock, hm, minutes } from '@core/lib/format';
import { t, tn, tData, date, num } from '../i18n';
import { Button, Empty } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { BarChart, RankBars, SleepSchedule } from '../charts/charts';
import { addDays, sleepNights, startOfDay, trainingWeeks } from '../lib/series';
import { ColorDot } from '../forms/forms';
import { PageTabs } from '../layout/Shell';

export function Fitness() {
  const s = useData();
  const open = useOpen();
  const on = (m: string) => enabled(s, m);
  const tabs = [on('workouts') && { to: '/fitness', label: t('Workouts'), end: true }, on('sleep') && { to: '/fitness/sleep', label: t('Sleep') }].filter(Boolean) as { to: string; label: string; end?: boolean }[];
  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="page-title">{t('Fitness')}</h1>
          <div className="page-sub">{t('Training and sleep, side by side.')}</div>
        </div>
        <Routes>
          <Route path="sleep" element={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'night' })}>{t('Log sleep')}</Button>} />
          <Route path="*" element={on('workouts') ? <Button kind="primary" icon="plus" onClick={() => open({ kind: 'workout' })}>{t('Log workout')}</Button> : null} />
        </Routes>
      </div>
      {tabs.length > 1 && <PageTabs tabs={tabs} />}
      <Routes>
        <Route path="sleep" element={<Sleep />} />
        <Route path="*" element={on('workouts') ? <Workouts /> : <Sleep />} />
      </Routes>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Workouts() {
  const s = useData();
  const open = useOpen();
  const [type, setType] = useState('all');
  const [shown, setShown] = useState(40);
  const now = Date.now();
  const day = new Date().toDateString();
  const weeks = useMemo(() => trainingWeeks(s, 12, now), [s, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const cat = (id: string | null) => s.wCats.find((c) => c.id === id);
  const since30 = addDays(startOfDay(now), -29);
  const since90 = addDays(startOfDay(now), -89);
  const m30 = s.workouts.filter((w) => w.ts >= since30);
  const byType = new Map<string, number>();
  s.workouts.filter((w) => w.ts >= since90).forEach((w) => byType.set(w.catId || '', (byType.get(w.catId || '') || 0) + w.dur));
  const types = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const avgWeek = weeks.slice(0, -1).reduce((a, w) => a + w.minutes, 0) / Math.max(1, weeks.length - 1);
  const list = [...s.workouts].filter((w) => type === 'all' || w.catId === type).sort((a, b) => b.ts - a.ts);
  const wk = weeks[weeks.length - 1];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 16, marginBottom: 16 }}>
        <Stat label={t('This week')} value={minutes(wk.minutes)} sub={tn(wk.count, '{n} workout', '{n} workouts')} />
        <Stat label={t('Last 30 days')} value={minutes(m30.reduce((a, w) => a + w.dur, 0))} sub={tn(m30.length, '{n} workout', '{n} workouts')} />
        <Stat label={t('Weekly average')} value={minutes(avgWeek)} sub={t('over the last 11 weeks')} />
        <Stat label={t('Most done')} value={types[0] ? tData(cat(types[0][0])?.name || t('Other')) : '—'} sub={types[0] ? t('{time} in 90 days', { time: minutes(types[0][1]) }) : undefined} />
      </div>
      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="card c8">
          <div className="card-head">
            <span className="card-title">{t('Minutes per week')}</span>
          </div>
          <div className="card-body">
            <BarChart height={240} data={weeks.map((w, i) => ({ label: i === weeks.length - 1 ? t('This week') : date(w.start, { month: 'short', day: 'numeric' }), value: w.minutes, title: t('Week of {date}', { date: date(w.start, { month: 'short', day: 'numeric' }) }), now: i === weeks.length - 1 }))} tipFmt={(v) => minutes(v || 0)} refLine={avgWeek ? { value: avgWeek, label: t('avg {time}', { time: minutes(avgWeek) }) } : undefined} />
          </div>
        </div>
        <div className="card c4">
          <div className="card-head">
            <span className="card-title">{t('By type, last 90 days')}</span>
            <span className="spacer" />
            <Button size="sm" kind="ghost" icon="plus" onClick={() => open({ kind: 'wcat' })}>
              {t('Type')}
            </Button>
          </div>
          <div className="card-body">
            {types.length ? (
              <RankBars
                fmt={minutes}
                rows={types.slice(0, 7).map(([id, m]) => ({
                  key: id,
                  label: (
                    <span className="row">
                      <ColorDot c={cat(id)?.color} />
                      {tData(cat(id)?.name || t('Other'))}
                    </span>
                  ),
                  value: m,
                  onClick: () => setType(id || 'all'),
                }))}
              />
            ) : (
              <div className="faint">{t('Nothing in the last 90 days.')}</div>
            )}
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
              {s.wCats.map((c) => (
                <button key={c.id} className="badge" style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'wcat', cat: c })} title={t('Edit')}>
                  <ColorDot c={c.color} size={6} />
                  {tData(c.name)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <span className="card-title">{t('All workouts')}</span>
          <span className="card-sub">{tn(list.length, '{n} workout', '{n} workouts')}</span>
          <span className="spacer" />
          <select className="select" style={{ width: 200, height: 30 }} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">{t('Every type')}</option>
            {s.wCats.map((c) => (
              <option key={c.id} value={c.id}>
                {tData(c.name)}
              </option>
            ))}
          </select>
        </div>
        {list.length === 0 ? (
          <Empty icon="fitness" title={t('No workouts yet')} action={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'workout' })}>{t('Log workout')}</Button>} />
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>{t('Date')}</th>
                <th>{t('Type')}</th>
                <th className="r">{t('Time')}</th>
                <th className="r">{t('Distance')}</th>
                <th className="r">{t('Calories')}</th>
                <th>{t('Intensity')}</th>
                <th>{t('Note')}</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, shown).map((w) => (
                <tr key={w.id} className="click" onClick={() => open({ kind: 'workout', workout: w })}>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    {date(w.ts, { weekday: 'short', month: 'short', day: 'numeric' })}
                    <span className="faint" style={{ marginInlineStart: 8 }}>{date(w.ts, { hour: 'numeric', minute: '2-digit' })}</span>
                  </td>
                  <td>
                    <span className="row">
                      <ColorDot c={cat(w.catId)?.color} />
                      <span style={{ fontWeight: 540 }}>{tData(cat(w.catId)?.name || w.name)}</span>
                      {w.source && <span className="badge">{w.source}</span>}
                    </span>
                  </td>
                  <td className="r">{minutes(w.dur)}</td>
                  <td className="r muted">{w.dist || '—'}</td>
                  <td className="r muted">{w.kcal ? num(w.kcal) : '—'}</td>
                  <td className="muted">{w.intensity ? tData(w.intensity) : '—'}</td>
                  <td className="muted truncate" style={{ maxWidth: 260 }}>{w.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {list.length > shown && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--line-soft)' }}>
            <Button size="sm" onClick={() => setShown(shown + 40)}>{t('Show more')}</Button>
          </div>
        )}
      </div>
    </>
  );
}

function Sleep() {
  const s = useData();
  const open = useOpen();
  const [shown, setShown] = useState(30);
  const now = Date.now();
  const day = new Date().toDateString();
  const n30 = useMemo(() => sleepNights(s, 30, now), [s, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const a7 = avg(n30.slice(-7).map((n) => n.hours));
  const a30 = avg(n30.map((n) => n.hours));
  const q30 = avg(n30.map((n) => n.quality));
  // Bedtimes either side of midnight average as times, not as numbers.
  const bed = avg(n30.slice(-14).map((n) => (n.bedH == null ? null : n.bedH < 12 ? n.bedH + 24 : n.bedH)));
  const wake = avg(n30.slice(-14).map((n) => n.wakeH));
  const list = [...s.nights].sort((a, b) => b.ts - a.ts);
  if (!s.nights.length)
    return (
      <div className="card">
        <Empty icon="sleep" title={t('No nights logged yet')} action={<Button kind="primary" icon="plus" onClick={() => open({ kind: 'night' })}>{t('Log sleep')}</Button>}>
          {t('Log when you went to bed and woke up, or bring nights in from Health Connect on your phone.')}
        </Empty>
      </div>
    );
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 16, marginBottom: 16 }}>
        <Stat label={t('Last 7 nights')} value={a7 != null ? hm(a7) : '—'} sub={t('average a night')} />
        <Stat label={t('Last 30 nights')} value={a30 != null ? hm(a30) : '—'} sub={t('average a night')} />
        <Stat label={t('Sleep quality')} value={q30 != null ? `${num(Math.round(q30 * 10) / 10)} / 10` : '—'} sub={t('average, last 30 nights')} />
        <Stat label={t('Usual night')} value={bed != null && wake != null ? `${fmtClock(bed % 24)} – ${fmtClock(wake)}` : '—'} sub={t('last two weeks')} />
      </div>
      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="card c6">
          <div className="card-head">
            <span className="card-title">{t('Hours a night')}</span>
          </div>
          <div className="card-body">
            <BarChart height={240} minTop={9} data={n30.map((n, i) => ({ label: date(n.day, { day: 'numeric' }), value: n.hours, title: date(n.day, { weekday: 'short', month: 'short', day: 'numeric' }), now: i === n30.length - 1 }))} fmt={(v) => `${Math.round(v)}h`} tipFmt={(v) => (v == null ? t('Not logged') : hm(v))} refLine={a30 ? { value: a30, label: t('avg {time}', { time: hm(a30) }) } : undefined} />
          </div>
        </div>
        <div className="card c6">
          <div className="card-head">
            <span className="card-title">{t('Bed and wake times')}</span>
          </div>
          <div className="card-body">
            <SleepSchedule height={240} nights={n30} clock={fmtClock} />
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <span className="card-title">{t('Every night')}</span>
          <span className="card-sub">{tn(list.length, '{n} night', '{n} nights')}</span>
        </div>
        <table className="t">
          <thead>
            <tr>
              <th>{t('Morning of')}</th>
              <th>{t('Went to bed')}</th>
              <th>{t('Woke up')}</th>
              <th className="r">{t('Slept')}</th>
              <th className="r">{t('Quality')}</th>
              <th>{t('Note')}</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, shown).map((n) => (
              <tr key={n.id} className="click" onClick={() => open({ kind: 'night', night: n })}>
                <td className="num">
                  {date(n.ts, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {n.source && <span className="badge" style={{ marginInlineStart: 8 }}>{n.source}</span>}
                </td>
                <td className="muted num">{n.bedH != null ? fmtClock(n.bedH) : '—'}</td>
                <td className="muted num">{n.wakeH != null ? fmtClock(n.wakeH) : '—'}</td>
                <td className="r" style={{ fontWeight: 600 }}>{hm(n.hours)}</td>
                <td className="r">
                  <span className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <span className="bar" style={{ width: 60 }}>
                      <span style={{ width: `${(n.quality / 10) * 100}%` }} />
                    </span>
                    <span className="num" style={{ width: 20 }}>{num(n.quality)}</span>
                  </span>
                </td>
                <td className="muted truncate" style={{ maxWidth: 280 }}>{n.note || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length > shown && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--line-soft)' }}>
            <Button size="sm" onClick={() => setShown(shown + 30)}>{t('Show more')}</Button>
          </div>
        )}
      </div>
      <div className="faint row" style={{ marginTop: 12, fontSize: 12.5, gap: 6 }}>
        <Icon name="info" size={14} />
        {t('Nights from Health Connect come in through the phone app.')}
      </div>
    </>
  );
}
