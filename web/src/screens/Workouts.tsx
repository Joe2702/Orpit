import React, { useState } from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { BarChart, Donut } from '../lib/charts';
import { minutes, relLabel } from '../lib/format';
import { Card, ChartCard, DetailHeader, RangeSeg, SectionLabel, Stat, StatRow, TrackerAction } from '../ui';
import { SwipeRow } from '../SwipeRow';
import { volume } from '../SetsEditor';
import { useEntryActions } from '../lib/entryActions';
import { UnsyncedDot } from '../UnsyncedDot';

export function Workouts() {
  const { state, open } = useStore();
  const { remove } = useEntryActions();
  const { d } = useData();
  const P = d.period;
  // Render a page at a time so hundreds of entries don't stall the screen.
  const [shown, setShown] = useState(50);
  const cat = (id: string | null) => (id ? d.catById[id] : undefined);
  // The list follows the period above it, so stepping back to March shows
  // March's sessions rather than the same recent ones under a March chart.
  const list = React.useMemo(
    () => state!.workouts.filter((w) => w.ts >= P.start && w.ts < P.end).sort((a, b) => b.ts - a.ts),
    [state, P.start, P.end]
  );

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <DetailHeader title="Workouts" />
      <TrackerAction label="Log workout" onClick={() => open('workout')} />
      <RangeSeg period={P} />

      {/* One row of figures. The total lives in the chart below, so it isn't
          repeated here; a streak shows only while there is one to protect. */}
      <StatRow>
        <Stat value={d.wCount} label={d.wCount === 1 ? 'Session' : 'Sessions'} />
        <Stat value={d.wAvg ? minutes(d.wAvg) : '—'} label="Avg session" />
        {d.wStreak >= 2 ? <Stat value={`${d.wStreak} days`} label="In a row" /> : <Stat value={d.wLongest ? minutes(d.wLongest) : '—'} label="Longest" />}
      </StatRow>

      <ChartCard title="Training time" value={d.wTotalMin ? minutes(d.wTotalMin) : '0 min'} note={P.caption}>
        <BarChart buckets={d.buckets} values={d.wMinBuckets} color="indigo" format={(v) => minutes(v)} />
      </ChartCard>

      {d.wTypeSegs.length > 0 && (
        <ChartCard title="By type" action={{ label: 'Manage', onClick: () => open('wcats') }}>
          {/* Wraps: with a large text size the legend drops under the ring
              instead of being squeezed to a sliver beside it. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 128, height: 128, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Donut segs={d.wTypeSegs} size={128} stroke={16} />
              <div style={{ position: 'absolute', textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)' }}>{d.wCount}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: -1 }}>sessions</div>
              </div>
            </div>
            <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {d.wTypeSegs.map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, flex: 'none', background: s.color }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      )}
      {d.wTypeSegs.length === 0 && d.wCount > 0 && (
        <div onClick={() => open('wcats')} className="pressRow" role="button" style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: '6px 0 14px', cursor: 'pointer' }}>
          Add workout types to see how your training splits up
        </div>
      )}

      <SectionLabel style={{ marginTop: 14 }}>{list.length ? `${P.title} · ${list.length} ${list.length === 1 ? 'session' : 'sessions'}` : P.title}</SectionLabel>
      {list.length === 0 && (
        <Card style={{ padding: '22px 18px', textAlign: 'center', fontSize: 14, color: 'var(--text2)' }}>No workouts {P.phrase}</Card>
      )}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden', display: list.length ? undefined : 'none' }}>
        {list.slice(0, shown).map((w) => {
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
            <SwipeRow
              key={w.id}
              onEdit={() => open('edit', { kind: 'workout', item: w })}
              onDelete={() => remove('workout', w)}
            >
              <div
                onClick={() => open('edit', { kind: 'workout', item: w })}
                className="pressRow"
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 'calc(11px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 13, height: 13, borderRadius: 4, background: `var(--${cc})` }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{w.name}</span>
                    <UnsyncedDot id={w.id} />
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{meta}</div>
                  {/* Strength sessions get their headline number: total volume. */}
                  {w.sets && w.sets.length > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: `var(--${cc})`, marginTop: 3 }}>
                      {w.sets.length} {w.sets.length === 1 ? 'set' : 'sets'}
                      {volume(w.sets) > 0 && ` · ${Math.round(volume(w.sets)).toLocaleString()} total volume`}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{minutes(w.dur)}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 1 }}>{relLabel(w.ts)}</div>
                </div>
              </div>
            </SwipeRow>
          );
        })}
      </div>
      {list.length > shown && (
        <div onClick={() => setShown(shown + 50)} className="press99" role="button" style={{ marginTop: 12, height: 48, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}>
          Show {Math.min(50, list.length - shown)} more
        </div>
      )}
    </div>
  );
}
