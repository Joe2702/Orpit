import React, { useEffect, useMemo, useState } from 'react';
import type { AppState, Range } from '@core/types';
import { useData } from '../store';
import { enabled } from '@core/lib/modules';
import { period, type Bucket } from '@core/lib/period';
import { buildInsights } from '@core/lib/insights';
import { markAssistantRead } from '@core/lib/assistant';
import { Markdown } from '@core/lib/md';
import { dayKey, hm, minutes, money0, moneyShort } from '@core/lib/format';
import { isSpend } from '@core/lib/money';
import { t, date } from '../i18n';
import { Button, Delta, Seg } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { BarChart } from '../charts/charts';
import { addDays, change, counts, plannedOn, startOfDay } from '../lib/series';

// How a week, month or year went, against the one before; what Orbit noticed
// across everything; and Claude's brief when there is one.

interface Totals {
  habits: number | null;
  training: number;
  sleep: number | null;
  spent: number;
}

function measure(s: AppState, from: number, to: number): Totals {
  const live = s.habits.filter((h) => !h.archived && !h.paused);
  const done = new Set(s.checkins.map((c) => `${c.habitId}|${c.day}`));
  let planned = 0;
  let hit = 0;
  const end = Math.min(to, Date.now() + 1);
  for (let d = startOfDay(from); d < end; d = addDays(d, 1))
    for (const h of live)
      if (plannedOn(h, d)) {
        planned++;
        if (done.has(`${h.id}|${dayKey(d)}`)) hit++;
      }
  const nights = s.nights.filter((n) => n.ts >= from && n.ts < to);
  return {
    habits: planned ? hit / planned : null,
    training: s.workouts.filter((w) => w.ts >= from && w.ts < to).reduce((a, w) => a + w.dur, 0),
    sleep: nights.length ? nights.reduce((a, n) => a + n.hours, 0) / nights.length : null,
    spent: s.txns.filter((x) => x.ts >= from && x.ts < to && counts(x) && isSpend(x)).reduce((a, x) => a - x.amount, 0),
  };
}

export function Insights() {
  const s = useData();
  const on = (m: string) => enabled(s, m);
  const [range, setRange] = useState<Range>('Month');
  const [offset, setOffset] = useState(0);
  const P = useMemo(() => period(range, offset, { earliest: s.archive?.earliestTs ?? undefined }), [range, offset, s.archive?.earliestTs]);
  const prev = useMemo(() => period(range, offset + 1), [range, offset]);
  const cur = useMemo(() => measure(s, P.start, P.until), [s, P]);
  const before = useMemo(() => measure(s, prev.start, prev.until), [s, prev]);
  const per = useMemo(() => P.buckets.map((b: Bucket) => ({ b, m: b.future ? null : measure(s, b.start, b.end) })), [s, P]);
  const found = useMemo(() => buildInsights(s), [s]);
  const brief = s.assistantBrief;
  useEffect(() => {
    if (brief) markAssistantRead(brief);
  }, [brief]);

  const chart = (pick: (m: Totals) => number | null, fmt: (v: number) => string, tip: (v: number | null) => string, opts: { minTop?: number } = {}) => (
    <BarChart
      height={210}
      minTop={opts.minTop}
      fmt={fmt}
      tipFmt={tip}
      data={per.map(({ b, m }) => ({ label: b.label, value: m ? pick(m) : null, title: b.name, now: b.current, future: b.future }))}
    />
  );

  const cards: { key: string; title: string; value: string; delta: number | null; good?: boolean; body: React.ReactNode }[] = [];
  if (on('habits'))
    cards.push({ key: 'h', title: t('Habits done'), value: cur.habits == null ? '—' : `${Math.round(cur.habits * 100)}%`, delta: cur.habits != null && before.habits ? change(cur.habits, before.habits) : null, body: chart((m) => (m.habits == null ? null : Math.round(m.habits * 100)), (v) => `${Math.round(v)}%`, (v) => (v == null ? t('Nothing planned') : `${v}%`), { minTop: 100 }) });
  if (on('workouts')) cards.push({ key: 'w', title: t('Training'), value: minutes(cur.training), delta: change(cur.training, before.training), body: chart((m) => m.training, (v) => `${Math.round(v)}`, (v) => minutes(v || 0)) });
  if (on('sleep')) cards.push({ key: 's', title: t('Sleep a night'), value: cur.sleep == null ? '—' : hm(cur.sleep), delta: cur.sleep != null && before.sleep ? change(cur.sleep, before.sleep) : null, body: chart((m) => m.sleep, (v) => `${Math.round(v)}h`, (v) => (v == null ? t('Not logged') : hm(v)), { minTop: 8 }) });
  if (on('finances')) cards.push({ key: 'm', title: t('Spent'), value: money0(cur.spent), delta: change(cur.spent, before.spent), good: false, body: chart((m) => m.spent, moneyShort, (v) => money0(v || 0)) });

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="page-title">{t('Insights')}</h1>
          <div className="page-sub">
            {P.title} · {P.caption}
          </div>
        </div>
        <Seg<Range>
          value={range}
          onChange={(r) => (setRange(r), setOffset(0))}
          options={[
            ['Week', t('Week')],
            ['Month', t('Month')],
            ['Year', t('Year')],
          ]}
        />
        <div className="btn-group" style={{ gap: 4 }}>
          <Button icon="chevLeft" title={t('Earlier')} onClick={() => setOffset(offset + 1)} disabled={!P.hasPrev} className="flip" />
          <Button onClick={() => setOffset(0)} disabled={offset === 0}>
            {t('Now')}
          </Button>
          <Button icon="chevRight" className="flip" title={t('Later')} onClick={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0} />
        </div>
      </div>

      {brief && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <Icon name="sunrise" size={17} style={{ color: 'var(--accent)' }} />
            <span className="card-title">{brief.title}</span>
            <span className="card-sub">{t('From Claude · {when}', { when: date(brief.ts, { weekday: 'long', hour: 'numeric', minute: '2-digit' }) })}</span>
          </div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22 }}>
            {brief.sections.map((sec, i) => (
              <div key={i}>
                <div className="label" style={{ marginBottom: 6 }}>{sec.heading}</div>
                <Markdown text={sec.body} size={14} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid" style={{ marginBottom: 16 }}>
        {cards.map((c) => (
          <div key={c.key} className="card c6">
            <div className="card-head">
              <span className="card-title">{c.title}</span>
              <span className="spacer" />
              <span className="num" style={{ fontWeight: 650, fontSize: 15 }}>{c.value}</span>
              <Delta pct={c.delta} goodWhenUp={c.good !== false} />
            </div>
            <div className="card-body">{c.body}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">{t('What Orbit noticed')}</span>
          <span className="card-sub">{t('Patterns across everything you track')}</span>
        </div>
        {found.length === 0 ? (
          <div className="faint" style={{ padding: 18 }}>{t('Keep logging for a couple of weeks and patterns will show up here.')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
            {found.slice(0, 12).map((x) => (
              <div key={x.id} style={{ padding: '16px 18px', borderBottom: '1px solid var(--line-soft)', borderInlineEnd: '1px solid var(--line-soft)', display: 'flex', gap: 12 }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Icon name={x.kind === 'alert' ? 'alert' : x.kind === 'record' ? 'sparkle' : x.kind === 'link' ? 'insights' : 'clock'} size={15} />
                </span>
                <div>
                  <div style={{ fontWeight: 560, lineHeight: 1.45 }}>{x.title}</div>
                  <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>{x.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
