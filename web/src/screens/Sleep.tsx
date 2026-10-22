import React, { useState } from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { BarChart, Legend, SleepClock, sleepColor } from '../lib/charts';
import { hm, fmtClock, relLabel } from '../lib/format';
import { Card, ChartCard, DetailHeader, RangeSeg, SectionLabel, Stat, StatRow, TrackerAction } from '../ui';
import { IconSleep } from '../icons';
import { SwipeRow } from '../SwipeRow';
import { useEntryActions } from '../lib/entryActions';
import { UnsyncedDot } from '../UnsyncedDot';

export function Sleep() {
  const { state, open } = useStore();
  const { remove } = useEntryActions();
  const { d } = useData();
  const P = d.period;
  // Render a page at a time so hundreds of nights don't stall the screen.
  const [shown, setShown] = useState(50);
  const list = React.useMemo(
    () => state!.nights.filter((n) => n.ts >= P.start && n.ts < P.end).sort((a, b) => b.ts - a.ts),
    [state, P.start, P.end]
  );
  const none = d.slNights === 0;

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <DetailHeader title="Sleep" iconColor="blue" icon={<IconSleep size={21} />} />
      <TrackerAction color="blue" label="Log sleep" onClick={() => open('sleep')} />
      <RangeSeg period={P} />

      <StatRow>
        <Stat value={none ? '—' : hm(d.slAvg)} label="Average night" size="lg" />
        <Stat value={none ? '—' : <>{d.slAvgQ.toFixed(1)}<span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text3)' }}> /10</span></>} label="Avg quality" size="lg" />
      </StatRow>
      <StatRow>
        <Stat value={fmtClock(d.avgBed)} label="Usual bedtime" size="sm" />
        <Stat value={fmtClock(d.avgWake)} label="Usual wake-up" size="sm" />
        <Stat value={d.slNights} label={d.slNights === 1 ? 'Night logged' : 'Nights logged'} size="sm" />
      </StatRow>

      {d.sleepByDay ? (
        <ChartCard title="When you slept" note={P.caption}>
          <SleepClock buckets={d.buckets} slots={d.sleepSlots} />
          <Legend items={[{ color: sleepColor(6), label: 'Under 7h' }, { color: sleepColor(8), label: '7–9h' }, { color: sleepColor(10), label: 'Over 9h' }]} />
        </ChartCard>
      ) : (
        <ChartCard title="Average night" value={none ? '—' : hm(d.slAvg)} note={P.caption}>
          <BarChart buckets={d.buckets} values={d.slSeries} color="blue" max={10} band={[7, 9]} format={(v) => hm(v)} />
          <Legend items={[{ color: 'color-mix(in srgb, var(--blue) 30%, transparent)', label: '7–9h, the healthy range' }]} />
        </ChartCard>
      )}

      <Card style={{ padding: '15px 16px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, background: `color-mix(in srgb,var(--${d.slConsistGood ? 'success' : d.bedDevMin == null ? 'blue' : 'warning'}) 13%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden style={{ fill: 'none', stroke: `var(--${d.slConsistGood ? 'success' : d.bedDevMin == null ? 'blue' : 'warning'})`, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d={d.slConsistGood ? 'M5 12l4 4 8-9' : d.bedDevMin == null ? 'M11 6v5l3 2' : 'M11 5v7M11 16v.5'} />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
            {d.bedDevMin == null ? 'Consistency' : d.slConsistGood ? 'Steady bedtime' : 'Bedtime moves around'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 }}>
            {d.bedDevMin == null
              ? 'Log three nights with bed and wake times to see how regular your sleep is'
              : d.slConsistGood
              ? `You usually go to bed within ${Math.round(d.bedDevMin)} min of ${fmtClock(d.avgBed)}`
              : `Your bedtime varies by about ${Math.round(d.bedDevMin)} min around ${fmtClock(d.avgBed)}`}
          </div>
        </div>
      </Card>

      <SectionLabel>{list.length ? `${P.title} · ${list.length} ${list.length === 1 ? 'night' : 'nights'}` : P.title}</SectionLabel>
      {list.length === 0 && (
        <Card style={{ padding: '22px 18px', textAlign: 'center', fontSize: 14, color: 'var(--text2)' }}>No nights logged {P.phrase}</Card>
      )}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden', display: list.length ? undefined : 'none' }}>
        {list.slice(0, shown).map((n) => (
          <SwipeRow key={n.id} onEdit={() => open('edit', { kind: 'sleep', item: n })} onDelete={() => remove('sleep', n)}>
            <div
              onClick={() => open('edit', { kind: 'sleep', item: n })}
              className="pressRow"
              style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
            >
              <span style={{ width: 38, height: 38, borderRadius: 11, flex: 'none', background: 'color-mix(in srgb,var(--blue) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconSleep c="var(--blue)" size={20} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{relLabel(n.ts)}</span>
                  <UnsyncedDot id={n.id} />
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>
                  {n.bedH != null && n.wakeH != null ? `${fmtClock(n.bedH)} → ${fmtClock(n.wakeH)} · ` : ''}Quality {n.quality}/10
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>{hm(n.hours)}</div>
            </div>
          </SwipeRow>
        ))}
      </div>
      {list.length > shown && (
        <div onClick={() => setShown(shown + 50)} className="press99" role="button" style={{ marginTop: 12, height: 48, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}>
          Show {Math.min(50, list.length - shown)} more
        </div>
      )}
    </div>
  );
}
