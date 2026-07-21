import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { Candles } from '../lib/charts';
import { hm, fmtClock, relLabel } from '../lib/format';
import { DetailHeader, RangeSeg, SectionLabel, rangeWord } from '../ui';
import { IconSleep } from '../icons';

export function Sleep() {
  const { state, open, range } = useStore();
  const { d } = useData();

  const miniStat = (val: React.ReactNode, label: string) => (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow)', padding: '14px 16px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>{val}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 3 }}>{label}</div>
    </div>
  );

  const candleLabels = d.slCandleLabels;
  const labelEvery = Math.max(1, Math.ceil(candleLabels.length / 6));

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <DetailHeader title="Sleep" iconColor="blue" icon={<IconSleep size={22} />} />
      <RangeSeg />

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Avg duration</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>
            {Math.floor(d.slAvg)}<span style={{ fontSize: 18, fontWeight: 600 }}>h</span>{' '}
            {String(Math.round((d.slAvg % 1) * 60)).padStart(2, '0')}<span style={{ fontSize: 18, fontWeight: 600 }}>m</span>
          </div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Avg quality</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>
            {d.slAvgQ.toFixed(1)}<span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text2)' }}> / 10</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        {miniStat(fmtClock(d.avgBed), 'Avg bedtime')}
        {miniStat(fmtClock(d.avgWake), 'Avg wake-up')}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text2)' }}>Hours slept</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{rangeWord(range)}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ position: 'relative', width: 24, height: 140, flex: 'none', fontSize: 10, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ position: 'absolute', top: -5, right: 0 }}>12h</span>
            <span style={{ position: 'absolute', top: 'calc(26.6% - 6px)', right: 0 }}>9h</span>
            <span style={{ position: 'absolute', top: 'calc(42.9% - 6px)', right: 0 }}>7h</span>
            <span style={{ position: 'absolute', bottom: -5, right: 0 }}>0</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 140 }}>
              <Candles items={d.sleepCandles} w={300} h={140} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text2)' }}>
              {candleLabels.map((l, i, arr) => (
                <span key={i}>{arr.length <= 8 || i === 0 || i === arr.length - 1 || i % labelEvery === 0 ? l : ''}</span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text2)' }}>
          {[
            ['var(--danger)', 'Under 7h'],
            ['var(--success)', '7–9h'],
            ['var(--coral)', 'Over 9h'],
          ].map(([c, label]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c, flex: 'none' }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: '16px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: `color-mix(in srgb,var(--${d.slConsistGood ? 'success' : 'warning'}) 14%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg width="22" height="22" style={{ fill: 'none', stroke: d.slConsistGood ? 'var(--success)' : 'var(--warning)', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d={d.slConsistGood ? 'M5 12l4 4 10-10' : 'M11 4.5v8.5M11 17v.5'} />
          </svg>
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
            {d.bedDevMin == null ? 'Building your picture' : d.slConsistGood ? 'Consistent schedule' : 'Irregular bedtime'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
            {d.bedDevMin == null
              ? 'Log a few nights to see your consistency'
              : `Bedtime within ±${Math.round(d.bedDevMin)} min of ${fmtClock(d.avgBed)}`}
          </div>
        </div>
      </div>

      <SectionLabel>Recent nights</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {[...state!.nights].sort((a, b) => b.ts - a.ts).map((n) => (
          <div
            key={n.id}
            onClick={() => open('edit', { kind: 'sleep', item: n })}
            className="pressRow"
            style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
          >
            <span style={{ width: 38, height: 38, borderRadius: 11, flex: 'none', background: 'color-mix(in srgb,var(--blue) 13%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconSleep c="var(--blue)" size={20} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{relLabel(n.ts)}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--blue)', marginTop: 2 }}>Quality {n.quality}/10</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>{hm(n.hours)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
