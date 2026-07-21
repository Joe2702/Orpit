import React from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { Ring, Heat } from '../lib/charts';
import { DetailHeader, RangeSeg, SectionLabel, rangeWord } from '../ui';
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
          <Ring pct={h.habitPct} colorKey="teal" size={124} stroke={13} />
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.02em' }}>
              {h.habitPct}<span style={{ fontSize: 18 }}>%</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: -2 }}>complete</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45 }}>You're on track</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
            {h.totalDots} of {h.maxDots} habit check-ins {rangeWord(range)}. Keep it up!
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
              onClick={() => open('habit', { id: hb.id, name: hb.name, color: hb.color, target: hb.target })}
              className="press99"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow)', padding: '15px 16px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', flex: 'none', background: col }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{hb.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{hb.target}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, padding: '4px 9px', borderRadius: 999, flex: 'none', background: `color-mix(in srgb,${col} 13%,transparent)`, color: col }}>
                  {hb.streak}<span style={{ opacity: 0.55, fontWeight: 600, marginLeft: 1 }}>d</span>
                </div>
                <IconPencil />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {hb.week.map((on, i) => (
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
