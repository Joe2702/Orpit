import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { Glyph } from '../lib/appIcons';

// A short, skippable first-run tour. Without it, a new user lands on an empty
// Home screen with no idea what the + button or the tabs do.
const SLIDES = [
  {
    icon: 'planet' as const,
    title: 'Welcome to Orbit',
    body: 'Your habits, training, sleep and money in one place, so you can see how each one affects the others.',
  },
  {
    icon: 'plus' as const,
    title: 'Log with one tap',
    body: 'The + in the bar at the bottom adds anything: a workout, a night’s sleep, a payment or a new habit.',
  },
  {
    icon: 'check' as const,
    title: 'Check off your habits',
    body: 'Today’s habits are on the Home screen. Tap one when it’s done. Add when and where you’ll do it, and you’re far more likely to.',
  },
  {
    icon: 'chart' as const,
    title: 'Watch it add up',
    body: 'Analytics turns your entries into trends, and each week and month gets a short report.',
  },
];

export function Intro() {
  const { state, applyState, haptic } = useStore();
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  const finish = () => {
    haptic();
    // Mark done locally straight away so the tour never flashes twice.
    if (state) applyState({ ...state, profile: { ...state.profile, introDone: true } });
    api.updateMe({ introDone: true }).catch(() => {});
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 110,
        background: '#0c0c0f',
        display: 'flex',
        flexDirection: 'column',
        color: '#f0f0f3',
        padding: '0 30px',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 14 }}>
        <span onClick={finish} role="button" style={{ fontSize: 14, fontWeight: 600, color: 'rgba(240,240,243,.7)', padding: 10, cursor: 'pointer' }}>
          Skip
        </span>
      </div>

      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', animation: 'fadeUp .35s ease' }}>
        <Glyph name={slide.icon} size={34} color="rgba(240,240,243,.6)" sw={1.6} />
        <div className="display" style={{ fontSize: 42, lineHeight: 1.05, margin: '20px 0 14px' }}>{slide.title}</div>
        <div style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(240,240,243,.78)', maxWidth: 320 }}>{slide.body}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 20 }}>
        {SLIDES.map((_, idx) => (
          <span
            key={idx}
            style={{ width: idx === i ? 22 : 7, height: 7, borderRadius: 999, background: idx === i ? '#f0f0f3' : 'rgba(255,255,255,.25)', transition: 'width .25s' }}
          />
        ))}
      </div>

      <div
        onClick={() => (last ? finish() : setI(i + 1))}
        className="press"
        role="button"
        style={{ background: '#f0f0f3', color: '#0c0c0f', height: 54, borderRadius: 'calc(16px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 26, boxShadow: '0 12px 26px -12px rgba(0,0,0,.5)' }}
      >
        {last ? 'Start' : 'Next'}
      </div>
    </div>
  );
}
