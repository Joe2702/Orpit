import React from 'react';
import { num, t, tData } from './i18n';

/**
 * The Steps habit in Home's list for today. Orpit ticks it itself, so instead
 * of a checkbox it shows how far along the day is: the circle fills as the
 * steps add up and turns into the tick when the goal is reached. Tapping opens
 * today's steps.
 */
export function StepsHabitRow({ done, total, goal, count, onOpen }: { done: boolean; total: number; goal: number; count: number; onOpen: () => void }) {
  const pct = Math.min(1, goal ? count / goal : 0);
  const S = 26;
  const W = 2.5;
  const R = (S - W) / 2;
  const C = 2 * Math.PI * R;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      aria-label={t('Steps: {n} of {goal}', { n: num(count), goal: num(goal) })}
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 16px', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }}
    >
      <div style={{ position: 'relative', width: S, height: S, flex: 'none' }}>
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden style={{ position: 'absolute', inset: 0 }}>
          <circle cx={S / 2} cy={S / 2} r={R} style={{ fill: done ? 'var(--indigo)' : 'none', stroke: done ? 'var(--indigo)' : 'var(--text3)', strokeWidth: done ? W : 1.5, opacity: done ? 1 : 0.6, transition: 'fill .25s' }} />
          {!done && pct > 0 && (
            <circle
              cx={S / 2}
              cy={S / 2}
              r={R}
              transform={`rotate(-90 ${S / 2} ${S / 2})`}
              style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: W, strokeLinecap: 'round', strokeDasharray: `${C * pct} ${C}`, transition: 'stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)' }}
            />
          )}
        </svg>
        {done && (
          <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden style={{ position: 'absolute', left: 6, top: 6, fill: 'none', stroke: 'var(--surface)', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M4 9l3.2 3.2L13.5 5.5" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: done ? 'var(--text3)' : 'var(--text)', transition: 'color .2s' }}>{tData('Steps')}</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t('{n} of {goal} steps', { n: num(count), goal: num(goal) })}
        </div>
        {/* How far along the goal, under the count: the bar most of the row is about. */}
        {!done && (
          <div style={{ height: 4, borderRadius: 999, background: 'var(--hairline)', marginTop: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct * 100}%`, borderRadius: 999, background: 'var(--indigo)', transition: 'width .6s cubic-bezier(.2,.8,.2,1)' }} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text3)', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{total}</div>
    </div>
  );
}

/** A pair of footprints. */
export function StepsIcon({ size = 20, color = 'var(--indigo)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ fill: color }}>
      <path d="M8.2 3c1.9 0 3.1 1.9 3 4.4-.1 2.2-1 4-1.2 5.3l-4.6.8C5 12 4.4 10.4 4.6 8 4.8 5.2 6.3 3 8.2 3zM5.7 15l4.5-.8c.3 2.1-.4 4-2.1 4.3-1.6.3-2.3-1.3-2.4-3.5zM15.8 6c1.9 0 3.4 2.2 3.6 5 .2 2.4-.4 4-.8 5.5l-4.6-.8c-.2-1.3-1.1-3.1-1.2-5.3-.1-2.5 1.1-4.4 3-4.4zM13.8 17.2l4.5.8c-.1 2.2-.8 3.8-2.4 3.5-1.7-.3-2.4-2.2-2.1-4.3z" />
    </svg>
  );
}
