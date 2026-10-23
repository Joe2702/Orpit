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
      <DetailHeader title="Sleep" />
      <TrackerAction label="Log sleep" onClick={() => open('sleep')} />
      <RangeSeg period={P} />

      <StatRow>
        <Stat value={none ? '—' : hm(d.slAvg)} label="Average night" />
        <Stat value={fmtClock(d.avgBed)} label="Usual bedtime" />
        <Stat value={fmtClock(d.avgWake)} label="Usual wake-up" />
      </StatRow>

      {d.sleepByDay ? (
        <ChartCard title="When you slept" note={none ? P.caption : `${P.caption} · quality ${d.slAvgQ.toFixed(1)}/10`}>
          <SleepClock buckets={d.buckets} slots={d.sleepSlots} />
          <Legend items={[{ color: sleepColor(8), label: '7 to 9 hours' }, { color: sleepColor(6), label: 'Shorter or longer' }]} />
        </ChartCard>
      ) : (
        <ChartCard title="Average night" value={none ? '—' : hm(d.slAvg)} note={P.caption}>
          <BarChart buckets={d.buckets} values={d.slSeries} color="indigo" max={10} band={[7, 9]} format={(v) => hm(v)} />
          <Legend items={[{ color: 'color-mix(in srgb, var(--indigo) 30%, transparent)', label: '7 to 9 hours, the healthy range' }]} />
        </ChartCard>
      )}

      <Card style={{ padding: '15px 16px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ width: 38, height: 38, borderRadius: 'calc(12px * var(--sq))', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
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
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden', display: list.length ? undefined : 'none' }}>
        {list.slice(0, shown).map((n) => (
          <SwipeRow key={n.id} onEdit={() => open('edit', { kind: 'sleep', item: n })} onDelete={() => remove('sleep', n)}>
            <div
              onClick={() => open('edit', { kind: 'sleep', item: n })}
              className="pressRow"
              style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
            >
              <span style={{ width: 38, height: 38, borderRadius: 'calc(11px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconSleep c="var(--indigo)" size={20} />
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
        <div onClick={() => setShown(shown + 50)} className="press99" role="button" style={{ marginTop: 12, height: 48, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}>
          Show {Math.min(50, list.length - shown)} more
        </div>
      )}
    </div>
  );
}
