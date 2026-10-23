import React from 'react';
import { useStore } from '../store';

// The first screen anyone sees. Deliberately plain: the mark, the name set in
// the display serif, one sentence, two buttons. A gradient backdrop and a row
// of feature chips under a tagline is the stock layout of generated landing
// pages, and it made the app look like one.
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
        padding: '0 28px',
        color: '#f1f0ec',
        background: '#0c0c0d',
        animation: 'fadeIn .5s ease',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 48 }}>
        <svg width="52" height="52" viewBox="0 0 96 96" aria-hidden style={{ overflow: 'visible', marginBottom: 26 }}>
          <circle cx="48" cy="48" r="44" style={{ fill: 'none', stroke: 'rgba(241,240,236,.18)', strokeWidth: 2 }} />
          <ellipse cx="48" cy="48" rx="44" ry="17" transform="rotate(-28 48 48)" style={{ fill: 'none', stroke: 'rgba(241,240,236,.6)', strokeWidth: 2.4 }} />
          <circle cx="84" cy="30" r="5.5" style={{ fill: '#f1f0ec' }} />
          <circle cx="48" cy="48" r="12" style={{ fill: '#f1f0ec' }} />
        </svg>
        <div className="display" style={{ fontSize: 64, lineHeight: 0.95 }}>Orbit</div>
        <div style={{ fontSize: 18, lineHeight: 1.5, marginTop: 14, color: 'rgba(241,240,236,.72)', maxWidth: 300 }}>
          Habits, training, sleep and money, kept in one place.
        </div>
      </div>
      <div style={{ paddingBottom: 'max(30px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          onClick={() => open('signup')}
          className="press"
          role="button"
          style={{ background: '#f1f0ec', color: '#0c0c0d', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 650, cursor: 'pointer' }}
        >
          Create an account
        </div>
        <div
          onClick={() => open('signin')}
          role="button"
          style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'rgba(241,240,236,.75)', padding: 15, cursor: 'pointer' }}
        >
          I already have one
        </div>
      </div>
    </div>
  );
}
