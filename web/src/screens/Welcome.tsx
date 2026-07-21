import React from 'react';
import { useStore } from '../store';

export function Welcome() {
  const { go, setAuthMode } = useStore();
  const open = (mode: 'signup' | 'signin') => {
    setAuthMode(mode);
    go('signin');
  };
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '0 28px', animation: 'fadeIn .5s ease' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
        <div style={{ position: 'relative', width: 104, height: 104, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'linear-gradient(155deg,#6A66CF,#524DBA)', boxShadow: '0 20px 44px -16px rgba(40,36,28,.40)' }} />
          <svg width="104" height="104" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <ellipse cx="52" cy="52" rx="46" ry="18" transform="rotate(-28 52 52)" style={{ fill: 'none', stroke: 'rgba(255,255,255,.5)', strokeWidth: 2 }} />
            <circle cx="90" cy="33" r="5" style={{ fill: '#fff' }} />
          </svg>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.2)', zIndex: 2 }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)' }}>Orbit</div>
          <div style={{ fontSize: 16, color: 'var(--text2)', marginTop: 10, lineHeight: 1.55, maxWidth: 250 }}>
            Tap to log, dive deep to learn. Your whole life, gently tracked.
          </div>
        </div>
      </div>
      <div style={{ paddingBottom: 42, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          onClick={() => open('signup')}
          className="press"
          style={{ background: 'var(--indigo)', color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, cursor: 'pointer', boxShadow: '0 8px 20px -10px rgba(40,36,28,.26)' }}
        >
          Get started
        </div>
        <div
          onClick={() => open('signin')}
          style={{ textAlign: 'center', fontSize: 14, fontWeight: 500, color: 'var(--text2)', padding: 14, cursor: 'pointer' }}
        >
          I already have an account
        </div>
      </div>
    </div>
  );
}
