import React from 'react';
import { useStore } from '../store';
import { CIcon } from '../lib/iconPaths';
import { cNum, counterTotals, relLabel } from '../lib/format';
import { BackButton } from '../ui';

export function Counters() {
  const { state, go, open, emptyMode } = useStore();
  const counters = state!.counters;
  const logs = state!.countLogs;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const logsMonth = logs.filter((l) => l.ts >= monthStart).length;
  const isEmpty = emptyMode || counters.length === 0;

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <BackButton onClick={() => go('home')} />
        <div style={{ flex: 1, fontSize: 24, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)' }}>Counters</div>
        <span style={{ width: 40, height: 40, borderRadius: 13, background: 'color-mix(in srgb,var(--indigo) 14%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg width="22" height="22" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M6 4l-1.2 12M11.4 4l-1.2 12M3.6 8h13M2.9 12h13" />
          </svg>
        </span>
      </div>

      {isEmpty ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '52px 16px', gap: 18 }}>
          <div style={{ width: 104, height: 104, borderRadius: '50%', border: '2px dashed color-mix(in srgb,var(--indigo) 38%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb,var(--indigo) 7%,transparent)' }}>
            <svg width="42" height="42" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M13 8l-2 26M25 8l-2 26M7 16h26M5 26h26" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>Count anything</div>
            <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 6, lineHeight: 1.55, maxWidth: 266 }}>
              Pull-ups, pages read, focus hours — create a counter and watch your monthly and yearly totals add up.
            </div>
          </div>
          <div onClick={() => open('counter')} className="press" style={ctaBtn}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' }}><path d="M10 4v11M4 9.5h11" /></svg>
            New counter
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: '16px 8px', marginBottom: 16 }}>
            {[
              [String(counters.length), 'Counters'],
              [String(logsMonth), 'Logs this month'],
              [String(logs.length), 'Total logs'],
            ].map(([v, l], i) => (
              <React.Fragment key={l}>
                {i > 0 && <div style={{ width: 1, background: 'var(--border)' }} />}
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>{v}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 3 }}>{l}</div>
                </div>
              </React.Fragment>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {counters.map((c) => {
              const col = `var(--${c.color})`;
              const t = counterTotals(logs, c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => open('counter', { id: c.id, name: c.name, unit: c.unit, color: c.color, icon: c.icon, step: c.step })}
                  className="press99"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 16, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 15 }}>
                    <span style={{ width: 44, height: 44, borderRadius: 13, flex: 'none', background: `color-mix(in srgb,${col} 14%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CIcon icon={c.icon} color={col} size={24} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{c.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
                        {c.unit} · {t.lastTs ? 'last ' + relLabel(t.lastTs).toLowerCase() : 'no logs yet'}
                      </div>
                    </div>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        open('countlog', { counterId: c.id, amount: c.step });
                      }}
                      className="press92"
                      style={{ width: 40, height: 40, borderRadius: 12, flex: 'none', background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 12px -6px rgba(40,36,28,.22)' }}
                    >
                      <svg width="20" height="20" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' }}><path d="M10 5v10M5 10h10" /></svg>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'stretch', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 8px' }}>
                    <TotCell value={cNum(t.all)} label="All time" color={col} />
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <TotCell value={cNum(t.year)} label="This year" />
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <TotCell value={cNum(t.month)} label="This month" />
                  </div>
                </div>
              );
            })}
          </div>

          <div onClick={() => open('counter')} className="press99" style={dashBtn}>
            <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M10 4v12M4 10h12" /></svg>
            New counter
          </div>
        </>
      )}
    </div>
  );
}

function TotCell({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

const ctaBtn: React.CSSProperties = {
  background: 'var(--indigo)',
  color: '#fff',
  height: 52,
  padding: '0 26px',
  borderRadius: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  boxShadow: '0 12px 20px -10px rgba(40,36,28,.22)',
};
const dashBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  height: 52,
  borderRadius: 16,
  border: '1.5px dashed color-mix(in srgb,var(--indigo) 40%,var(--border))',
  color: 'var(--indigo)',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  background: 'color-mix(in srgb,var(--indigo) 6%,transparent)',
};
