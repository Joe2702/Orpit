import React from 'react';
import { useStore } from '../store';

// The first screen anyone sees. It continues the launch splash — same brand
// gradient, same mark — so opening the app reads as one motion rather than a
// splash followed by a different, plainer page.
const TRACKERS: { label: string; d: string }[] = [
  { label: 'Habits', d: 'M5 10.5l3 3 7-7' },
  { label: 'Training', d: 'M3 8v4M5.5 6v8M14.5 6v8M17 8v4M5.5 10h9' },
  { label: 'Sleep', d: 'M15 11.6A6 6 0 1 1 8.4 5a4.7 4.7 0 0 0 6.6 6.6Z' },
  { label: 'Money', d: 'M10 4v12M13 6.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.3 0 3.2 6.2 1.8 6.2 5 0 1.4-1.4 2.4-3.2 2.4-1.4 0-2.6-.6-3.2-1.6' },
];

export function Welcome() {
  const { go, setAuthMode } = useStore();
  const open = (mode: 'signup' | 'signin') => {
    setAuthMode(mode);
    go('signin');
  };
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 26px',
        color: '#fff',
        background: 'radial-gradient(125% 85% at 50% 30%, #605ac9 0%, #4a45a6 46%, #2f2c73 100%)',
        animation: 'fadeIn .5s ease',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <div style={{ position: 'relative', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'breathe 6s ease-in-out infinite' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.22)' }} />
          <svg width="96" height="96" aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <ellipse cx="48" cy="48" rx="44" ry="17" transform="rotate(-28 48 48)" style={{ fill: 'none', stroke: 'rgba(255,255,255,.55)', strokeWidth: 1.8 }} />
            <circle cx="84" cy="30" r="4.5" style={{ fill: '#fff' }} />
          </svg>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,.25)', zIndex: 2 }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-.04em' }}>Orbit</div>
          <div style={{ fontSize: 17, lineHeight: 1.5, marginTop: 10, color: 'rgba(255,255,255,.78)', maxWidth: 290 }}>
            Your habits, training, sleep and money — in one calm place.
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 320 }}>
          {TRACKERS.map((t) => (
            <span
              key={t.label}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px 7px 9px', borderRadius: 999, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.16)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.92)' }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden style={{ fill: 'none', stroke: '#fff', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d={t.d} />
              </svg>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      <div style={{ paddingBottom: 'max(34px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          onClick={() => open('signup')}
          className="press"
          role="button"
          style={{ background: '#fff', color: '#3f3a9e', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 14px 30px -14px rgba(0,0,0,.5)' }}
        >
          Get started
        </div>
        <div
          onClick={() => open('signin')}
          role="button"
          style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,.85)', padding: 15, cursor: 'pointer' }}
        >
          I already have an account
        </div>
      </div>
    </div>
  );
}
