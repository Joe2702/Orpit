import React, { useRef, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { accentFor, hexToHsv, hsvToHex, isHex, type Hsv } from '../lib/color';
import { t } from '../i18n';

const SIZE = 248;
// Orbit's own indigo, for "back to the original".
const DEFAULT = '#3d4ed8';
// The old preset names, as colours, so a choice made before the wheel opens on it.
const PRESET: Record<string, string> = { indigo: '#3d4ed8', text: '#3a3a44', blue: '#3b72e0', teal: '#1f9d8c', emerald: '#23926a', rose: '#cf4a5f' };

/**
 * Any colour in the world for the accent: hue and strength from the wheel,
 * brightness from the slider, or a hex code typed in. The app takes it on
 * when a finger lifts, so dragging doesn't save fifty colours on the way.
 */
export function AccentSheet() {
  const { state, mutateOpt, haptic } = useStore();
  const saved = state!.profile.accent || 'indigo';
  const start = isHex(saved) ? saved : PRESET[saved] || DEFAULT;
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(start));
  const [typed, setTyped] = useState(start);
  const wheel = useRef<HTMLDivElement>(null);
  const hex = hsvToHex(hsv);
  const theme = (document.querySelector('.orbit')?.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  const shown = accentFor(hex, theme);

  const save = (c: string) => {
    haptic(10);
    mutateOpt((s) => ({ ...s, profile: { ...s.profile, accent: c } }), () => api.updateMe({ accent: c })).catch(() => {});
  };

  const pick = (e: React.PointerEvent) => {
    const r = wheel.current!.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    // Clockwise from the top, the same way the conic gradient runs.
    const h = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(x, y) / (r.width / 2));
    const next = { h, s, v: hsv.v || 1 };
    setHsv(next);
    setTyped(hsvToHex(next));
  };

  const thumb = {
    x: SIZE / 2 + Math.sin((hsv.h * Math.PI) / 180) * hsv.s * (SIZE / 2),
    y: SIZE / 2 - Math.cos((hsv.h * Math.PI) / 180) * hsv.s * (SIZE / 2),
  };
  const full = hsvToHex({ ...hsv, v: 1 });

  return (
    <div style={{ padding: '6px 20px 30px' }}>
      <div className="display" style={{ fontSize: 30, lineHeight: 1.1, color: 'var(--text)', margin: '6px 2px 18px' }}>{t('Accent colour')}</div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
        <div
          ref={wheel}
          role="slider"
          aria-label={t('Colour')}
          aria-valuetext={hex}
          tabIndex={0}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            pick(e);
          }}
          onPointerMove={(e) => e.buttons && pick(e)}
          onPointerUp={() => save(hsvToHex(hsv))}
          style={{
            position: 'relative',
            width: SIZE,
            height: SIZE,
            borderRadius: '50%',
            touchAction: 'none',
            cursor: 'crosshair',
            background: 'radial-gradient(circle closest-side, #fff, rgba(255,255,255,0)), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
            boxShadow: '0 10px 30px -14px rgba(0,0,0,.45), inset 0 0 0 1px rgba(0,0,0,.06)',
          }}
        >
          {/* Brightness darkens the whole wheel, so what you see is what you get. */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#000', opacity: 1 - hsv.v, pointerEvents: 'none' }} />
          <div
            style={{
              position: 'absolute',
              left: thumb.x - 15,
              top: thumb.y - 15,
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: hex,
              border: '3px solid #fff',
              boxShadow: '0 2px 10px rgba(0,0,0,.35)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '0 2px 8px' }}>{t('Brightness')}</div>
      <input
        type="range"
        min={0.25}
        max={1}
        step={0.01}
        value={hsv.v}
        aria-label={t('Brightness')}
        onChange={(e) => {
          const next = { ...hsv, v: Number(e.target.value) };
          setHsv(next);
          setTyped(hsvToHex(next));
        }}
        onPointerUp={() => save(hsvToHex(hsv))}
        onKeyUp={() => save(hsvToHex(hsv))}
        style={{ width: '100%', height: 28, appearance: 'none', WebkitAppearance: 'none', borderRadius: 999, background: `linear-gradient(to right, #3a3a3a, ${full})`, outline: 'none', marginBottom: 20, direction: 'ltr' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, height: 52, borderRadius: 'calc(16px * var(--sq))', background: shown.accent, color: shown.onAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>
          {t('Looks like this')}
        </div>
        <input
          value={typed}
          onChange={(e) => {
            const v = e.target.value.trim();
            setTyped(v);
            const h = v.startsWith('#') ? v : `#${v}`;
            if (isHex(h)) {
              setHsv(hexToHsv(h));
              save(h.toLowerCase());
            }
          }}
          maxLength={7}
          aria-label={t('Hex code')}
          spellCheck={false}
          style={{ width: 112, height: 52, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 12px', fontSize: 16, fontWeight: 600, color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-mono)', direction: 'ltr', textAlign: 'center' }}
        />
      </div>
      {shown.accent.toLowerCase() !== hex.toLowerCase() && (
        <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, margin: '0 2px 12px' }}>{t('Adjusted a little in this theme so text on it stays easy to read.')}</div>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          setHsv(hexToHsv(DEFAULT));
          setTyped(DEFAULT);
          save('indigo');
        }}
        style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--text2)', padding: 8, cursor: 'pointer' }}
      >
        {t('Back to Orbit’s indigo')}
      </div>
    </div>
  );
}
