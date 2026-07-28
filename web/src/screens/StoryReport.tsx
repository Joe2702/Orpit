import React, { useState } from 'react';
import { useStore } from '../store';
import { buildReport } from '../lib/report';

// A full-screen, tap-through "story" summary of the user's week or month.
export function StoryReport({ kind, onClose }: { kind: 'week' | 'month'; onClose: () => void }) {
  const { state } = useStore();
  const slides = buildReport(state!, kind);
  const [i, setI] = useState(0);
  const slide = slides[i];

  const next = () => (i < slides.length - 1 ? setI(i + 1) : onClose());
  const prev = () => setI(Math.max(0, i - 1));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: `linear-gradient(165deg, color-mix(in srgb,var(--${slide.color}) 90%, #000 10%), color-mix(in srgb,var(--${slide.color}) 55%, #05060a 45%))`,
        display: 'flex',
        flexDirection: 'column',
        color: '#fff',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Tap zones — left third goes back, the rest advances. */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 2 }}>
        <div onClick={prev} style={{ width: '33%', cursor: 'pointer' }} />
        <div onClick={next} style={{ flex: 1, cursor: 'pointer' }} />
      </div>

      {/* Progress + close (above the tap zones). */}
      <div style={{ position: 'relative', zIndex: 3 }}>
        <div style={{ display: 'flex', gap: 5, padding: '14px 16px 0' }}>
          {slides.map((_, idx) => (
            <div key={idx} style={{ flex: 1, height: 3.5, borderRadius: 999, background: 'rgba(255,255,255,.3)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 999, background: '#fff', width: idx <= i ? '100%' : '0%', transition: 'width .3s' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 14px 0' }}>
          <div onClick={onClose} className="press92" style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="20" height="20" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' }}><path d="M5 5l10 10M15 5L5 15" /></svg>
          </div>
        </div>
      </div>

      {/* Slide content (behind the tap zones — the whole area is tappable). */}
      <div key={i} style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 34px 40px', animation: 'fadeUp .4s ease' }}>
        <div style={{ fontSize: 66, marginBottom: 16 }}>{slide.emoji}</div>
        <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.85, letterSpacing: '.08em', textTransform: 'uppercase' }}>{slide.headline}</div>
        {slide.value && <div style={{ fontSize: 60, fontWeight: 800, letterSpacing: '-.03em', margin: '12px 0 8px', lineHeight: 1 }}>{slide.value}</div>}
        <div style={{ fontSize: 16, fontWeight: 500, opacity: 0.92, lineHeight: 1.5, marginTop: slide.value ? 0 : 14, maxWidth: 300 }}>{slide.caption}</div>
      </div>
    </div>
  );
}
