import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';

// A short, skippable first-run tour. Without it, a new user lands on an empty
// Home screen with no idea what the ➕ button or the tabs do.
const SLIDES = [
  {
    emoji: '🪐',
    title: 'Welcome to Orbit',
    body: 'One place for your habits, workouts, sleep and money — so you can see how they move together.',
    color: 'indigo',
  },
  {
    emoji: '➕',
    title: 'Log with one tap',
    body: 'The + button in the middle of the bar adds anything: a workout, a night of sleep, an expense or a habit.',
    color: 'blue',
  },
  {
    emoji: '✅',
    title: 'Check off your habits',
    body: 'Your habits for today sit on the Home screen. Tap the circle to complete one — that is the whole ritual.',
    color: 'teal',
  },
  {
    emoji: '📊',
    title: 'Watch it add up',
    body: 'Analytics turns your entries into trends, and every week and month becomes a short story report.',
    color: 'coral',
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
        background: `linear-gradient(165deg, color-mix(in srgb,var(--${slide.color}) 88%, #000 12%), color-mix(in srgb,var(--${slide.color}) 52%, #05060a 48%))`,
        display: 'flex',
        flexDirection: 'column',
        color: '#fff',
        padding: '0 30px',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 14 }}>
        <span onClick={finish} role="button" style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.85)', padding: 10, cursor: 'pointer' }}>
          Skip
        </span>
      </div>

      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', animation: 'fadeUp .35s ease' }}>
        <div style={{ fontSize: 68, marginBottom: 22 }} aria-hidden>{slide.emoji}</div>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 12 }}>{slide.title}</div>
        <div style={{ fontSize: 16, lineHeight: 1.6, opacity: 0.92, maxWidth: 320 }}>{slide.body}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 20 }}>
        {SLIDES.map((_, idx) => (
          <span
            key={idx}
            style={{ width: idx === i ? 22 : 7, height: 7, borderRadius: 999, background: idx === i ? '#fff' : 'rgba(255,255,255,.4)', transition: 'width .25s' }}
          />
        ))}
      </div>

      <div
        onClick={() => (last ? finish() : setI(i + 1))}
        className="press"
        role="button"
        style={{ background: '#fff', color: '#1a1b2e', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 26, boxShadow: '0 12px 26px -12px rgba(0,0,0,.5)' }}
      >
        {last ? "Let's go" : 'Next'}
      </div>
    </div>
  );
}
