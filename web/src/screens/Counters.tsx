import React from 'react';
import { useStore } from '../store';
import { CIcon } from '../lib/iconPaths';
import { cNum, counterTotals, relLabel } from '../lib/format';
import { BackButton } from '../ui';
import { t } from '../i18n';

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
        <div className="display" style={{ flex: 1, minWidth: 0, fontSize: 32, lineHeight: 1.1, color: 'var(--text)' }}>{t('Counters')}</div>
        <span style={{ width: 40, height: 40, borderRadius: 'calc(13px * var(--sq))', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
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
            <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{t('Count anything')}</div>
            <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 6, lineHeight: 1.55, maxWidth: 266 }}>
              {t('Pull-ups, pages read, hours of focus. Make a counter and your monthly and yearly totals add up here.')}
            </div>
          </div>
          <div role="button" tabIndex={0} onClick={() => open('counter')} className="press" style={ctaBtn}>
            <svg width="19" height="19" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' }}><path d="M10 4v11M4 9.5h11" /></svg>
            {t('New counter')}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: '16px 8px', marginBottom: 16 }}>
            {[
              [String(counters.length), t('Counters')],
              [String(logsMonth), t('Logs this month')],
              [String(logs.length), t('Total logs')],
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
              const tx = counterTotals(logs, c.id);
              return (
                <div role="button" tabIndex={0}
                  key={c.id}
                  onClick={() => open('counter', { id: c.id, name: c.name, unit: c.unit, color: c.color, icon: c.icon, step: c.step })}
                  className="press99"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', boxShadow: 'var(--shadow)', padding: 16, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 15 }}>
                    <span style={{ width: 26, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CIcon icon={c.icon} color="var(--text2)" size={22} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{c.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
                        {c.unit} · {tx.lastTs ? t('last logged {when}', { when: relLabel(tx.lastTs) === t('Today') || relLabel(tx.lastTs) === t('Yesterday') ? relLabel(tx.lastTs).toLowerCase() : relLabel(tx.lastTs) }) : t('nothing logged yet')}
                      </div>
                    </div>
                    <div role="button" tabIndex={0} aria-label={t('Log {name}', { name: c.name })}
                      onClick={(e) => {
                        e.stopPropagation();
                        open('countlog', { counterId: c.id, amount: c.step });
                      }}
                      className="press92"
                      style={{ width: 40, height: 40, borderRadius: 'calc(12px * var(--sq))', flex: 'none', background: 'color-mix(in srgb,var(--indigo) 12%,var(--surface))', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 12px -6px rgba(40,36,28,.22)' }}
                    >
                      <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.4, strokeLinecap: 'round' }} aria-hidden><path d="M10 5v10M5 10h10" /></svg>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'stretch', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: '12px 8px' }}>
                    <TotCell value={cNum(tx.month)} label={t('This month')} />
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <TotCell value={cNum(tx.all)} label={t('All time')} />
                  </div>
                </div>
              );
            })}
          </div>

          <div role="button" tabIndex={0} onClick={() => open('counter')} className="press99" style={dashBtn}>
            <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M10 4v12M4 10h12" /></svg>
            {t('New counter')}
          </div>
        </>
      )}
    </div>
  );
}

function TotCell({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

const ctaBtn: React.CSSProperties = {
  background: 'var(--indigo)',
  color: '#fff',
  height: 52,
  padding: '0 26px',
  borderRadius: 'calc(16px * var(--sq))',
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
  borderRadius: 'calc(16px * var(--sq))',
  border: '1.5px dashed color-mix(in srgb,var(--indigo) 40%,var(--border))',
  color: 'var(--indigo)',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  background: 'color-mix(in srgb,var(--indigo) 6%,transparent)',
};
