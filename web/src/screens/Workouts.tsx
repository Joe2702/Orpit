import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { Bars, Donut } from '../lib/charts';
import { relLabel } from '../lib/format';
import { DetailHeader, RangeSeg, SectionLabel, rangeWord } from '../ui';
import { IconWorkout } from '../icons';

export function Workouts() {
  const { state, open, range } = useStore();
  const { d } = useData();
  const cat = (id: string | null) => (id ? d.catById[id] : undefined);

  const tri = (a: React.ReactNode, b: React.ReactNode, c: React.ReactNode) => (
    <div style={{ display: 'flex' }}>
      {a}
      <div style={{ width: 1, background: 'var(--border)' }} />
      {b}
      <div style={{ width: 1, background: 'var(--border)' }} />
      {c}
    </div>
  );
  const stat = (val: React.ReactNode, label: string, color = 'var(--text)', big = true) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: big ? 30 : 22, fontWeight: 700, letterSpacing: '-.02em', color }}>{val}</div>
      <div style={{ fontSize: big ? 12 : 11.5, color: 'var(--text2)', marginTop: 3 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <DetailHeader title="Workouts" iconColor="coral" icon={<IconWorkout size={22} />} />
      <RangeSeg />

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: '18px 8px', marginBottom: 14 }}>
        {tri(stat(d.wCount, 'Workouts'), stat(d.wTotalMin, 'Minutes'), stat(d.wStreak, 'Day streak', 'var(--coral)'))}
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: '16px 8px', marginBottom: 14 }}>
        {tri(
          stat(d.wAvg + 'm', 'Avg session', 'var(--text)', false),
          stat(d.wLongest + 'm', 'Longest', 'var(--text)', false),
          stat(d.wActiveDays, 'Active days', 'var(--text)', false)
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text2)' }}>Minutes</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{rangeWord(range)}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ position: 'relative', width: 30, height: 120, flex: 'none', fontSize: 10, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ position: 'absolute', top: -5, right: 0 }}>{d.wYMax}m</span>
            <span style={{ position: 'absolute', top: 'calc(50% - 6px)', right: 0 }}>{Math.round(d.wYMax / 2)}m</span>
            <span style={{ position: 'absolute', bottom: -5, right: 0 }}>0</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 120 }}>
              <Bars values={d.wMinSeries} colorKey="coral" w={300} h={120} gap={9} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
              {d.xLabels.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 18, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text2)' }}>Category split</span>
          <span onClick={() => open('wcats')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--coral)', cursor: 'pointer' }}>Manage</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', width: 146, height: 146, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Donut segs={d.wTypeSegs} size={146} stroke={24} />
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>{d.wCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: -2 }}>sessions</div>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11 }}>
            {d.wTypeSegs.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, flex: 'none', background: s.color }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{s.label}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SectionLabel>Recent</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {[...state!.workouts].sort((a, b) => b.ts - a.ts).map((w) => {
          const c = cat(w.catId);
          const cc = c?.color || 'coral';
          const meta =
            (c?.name || 'Workout') +
            ' · ' +
            (w.dist
              ? w.dist + (w.kcal ? ' · ' + w.kcal + ' kcal' : '')
              : w.kcal
              ? w.kcal + ' kcal'
              : w.intensity
              ? w.intensity + ' intensity'
              : w.dur + ' min');
          return (
            <div
              key={w.id}
              onClick={() => open('edit', { kind: 'workout', item: w })}
              className="pressRow"
              style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
            >
              <span style={{ width: 38, height: 38, borderRadius: 11, flex: 'none', background: `color-mix(in srgb,var(--${cc}) 14%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 13, height: 13, borderRadius: 4, background: `var(--${cc})` }} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{w.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{meta}</div>
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{w.dur}m</div>
                <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 1 }}>{relLabel(w.ts)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
