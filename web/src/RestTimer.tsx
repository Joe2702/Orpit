import React, { useEffect, useRef } from 'react';
import { useRest, addRest, stopRest } from './lib/restTimer';
import { useStore } from './store';

// The rest countdown, floating above the tab bar so it stays visible while the
// user moves around the app between sets. Rendered once at the app root rather
// than inside a sheet — closing the log sheet must not kill a running rest.

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function RestTimer({ raised }: { raised: boolean }) {
  const { remaining, total } = useRest();
  const { haptic } = useStore();
  const buzzed = useRef(false);

  // Buzz once when it hits zero — the notification covers the backgrounded
  // case, this covers having the app open.
  useEffect(() => {
    if (remaining === 0 && !buzzed.current) {
      buzzed.current = true;
      haptic();
    }
    if (remaining && remaining > 0) buzzed.current = false;
  }, [remaining, haptic]);

  if (remaining == null) return null;
  const done = remaining === 0;
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;

  return (
    <div style={{ position: 'absolute', left: 16, right: 16, bottom: raised ? 92 : 20, zIndex: 45, animation: 'fadeUp .25s ease' }}>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 18,
          padding: '13px 15px',
          display: 'flex',
          alignItems: 'center',
          gap: 13,
          background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
          backdropFilter: 'blur(18px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.6)',
          border: `1px solid ${done ? 'var(--coral)' : 'color-mix(in srgb, var(--border) 80%, transparent)'}`,
          boxShadow: '0 14px 32px -12px rgba(8,9,14,.32)',
        }}
      >
        {/* Draining progress bar behind the content. */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'color-mix(in srgb,var(--coral) 12%,transparent)', transition: 'width .5s linear' }} aria-hidden />

        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: done ? 'var(--coral)' : 'var(--text2)' }}>
            {done ? 'Rest over' : 'Rest'}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>
            {done ? 'Next set 💪' : mmss(remaining)}
          </div>
        </div>

        {!done && (
          <div onClick={() => addRest(30)} className="press92" role="button" style={{ position: 'relative', flex: 'none', height: 38, padding: '0 13px', borderRadius: 999, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
            +30s
          </div>
        )}
        <div onClick={stopRest} className="press92" role="button" aria-label="Dismiss rest timer" style={{ position: 'relative', flex: 'none', width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: done ? 'var(--coral)' : 'transparent' }}>
          <svg width="16" height="16" style={{ fill: 'none', stroke: done ? '#fff' : 'var(--text2)', strokeWidth: 2.3, strokeLinecap: 'round' }}>
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </div>
      </div>
    </div>
  );
}
