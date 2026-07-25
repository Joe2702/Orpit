import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { Ring, Heat } from '../lib/charts';
import { DetailHeader, RangeSeg, SectionLabel, rangeWord } from '../ui';
import { daysLabel } from '../lib/format';
import { IconPencil } from '../icons';

export function Habits() {
  const { open, range } = useStore();
  const { d, h } = useData();

  const legendSwatch = (pct: string) => (
    <span style={{ width: 11, height: 11, borderRadius: 3, background: pct }} />
  );

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <DetailHeader
        title="Habits"
        iconColor="teal"
        icon={
          <svg width="22" height="22" style={{ fill: 'none', stroke: 'var(--teal)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12l2.5 2.5L16 9" />
          </svg>
        }
      />
      <RangeSeg />

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 20, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ position: 'relative', width: 124, height: 124, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ring pct={h.rangePct} colorKey="teal" size={124} stroke={13} />
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.02em' }}>
              {h.rangePct}<span style={{ fontSize: 18 }}>%</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: -2 }}>complete</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45 }}>You're on track</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
            {h.rangeDone} of {h.rangeTotal} habit check-ins {rangeWord(range)}. Keep it up!
          </div>
        </div>
      </div>

      <SectionLabel style={{ margin: '6px 0 12px' }}>Your habits</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {h.habits.map((hb) => {
          const col = `var(--${hb.color})`;
          return (
            <div
              key={hb.id}
              onClick={() => !hb.locked && open('habit', { id: hb.id, name: hb.name, color: hb.color, target: hb.target, days: hb.days })}
              className={hb.locked ? undefined : 'press99'}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow)', padding: '15px 16px', cursor: hb.locked ? 'default' : 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', flex: 'none', background: col }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{hb.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{daysLabel(hb.days)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, padding: '4px 9px', borderRadius: 999, flex: 'none', background: `color-mix(in srgb,${col} 13%,transparent)`, color: col }}>
                  {hb.total}<span style={{ opacity: 0.55, fontWeight: 600, marginLeft: 2 }}>days</span>
                </div>
                {hb.locked ? (
                  <svg width="15" height="15" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <rect x="3" y="6.5" width="9" height="6.5" rx="1.5" />
                    <path d="M5 6.5V5a2.5 2.5 0 0 1 5 0v1.5" />
                  </svg>
                ) : (
                  <IconPencil />
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {hb.weekSlots.map((on, i) => (
                  <span
                    key={i}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      flex: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: on ? col : 'transparent',
                      border: `1.5px solid ${on ? col : 'var(--border)'}`,
                    }}
                  >
                    {!!on && (
                      <svg width="12" height="12" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                        <path d="M3 6.5l2 2 4-4.5" />
                      </svg>
                    )}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <SectionLabel>Activity · last 12 weeks</SectionLabel>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 18, marginBottom: 16 }}>
        <div style={{ overflow: 'hidden' }}>
          <Heat grid={d.activityGrid} colorKey="teal" cell={13} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 14, fontSize: 11, color: 'var(--text2)' }}>
          <span>Less</span>
          {legendSwatch('color-mix(in srgb,var(--text2) 12%,transparent)')}
          {legendSwatch('color-mix(in srgb,var(--teal) 40%,transparent)')}
          {legendSwatch('color-mix(in srgb,var(--teal) 70%,transparent)')}
          {legendSwatch('var(--teal)')}
          <span>More</span>
        </div>
      </div>

      <div
        onClick={() => open('habit')}
        className="press99"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16, border: '1.5px dashed color-mix(in srgb,var(--teal) 40%,var(--border))', color: 'var(--teal)', fontSize: 15, fontWeight: 600, cursor: 'pointer', background: 'color-mix(in srgb,var(--teal) 6%,transparent)' }}
      >
        <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--teal)', strokeWidth: 2.2, strokeLinecap: 'round' }}>
          <path d="M10 4v12M4 10h12" />
        </svg>
        Add a habit
      </div>
    </div>
  );
}
