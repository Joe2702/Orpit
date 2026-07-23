import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { parseClock } from '../lib/format';

// Local YYYY-MM-DD (not UTC) for the date input's default.
function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function SleepSheet() {
  const { closeSheet, mutate, haptic } = useStore();
  const [quality, setQuality] = useState(8);
  const [bed, setBed] = useState('23:00');
  const [wake, setWake] = useState('06:45');
  const [day, setDay] = useState(todayISO());

  // Duration is derived from bedtime → wake-up.
  const hours = (() => {
    let h = parseClock(wake) - parseClock(bed);
    if (h <= 0) h += 24;
    return h;
  })();
  const durLabel = `${Math.floor(hours)}h ${String(Math.round((hours % 1) * 60)).padStart(2, '0')}m`;

  const save = async () => {
    haptic();
    // Timestamp the night at the wake-up moment on the chosen morning.
    const ts = new Date(`${day}T${wake || '08:00'}`).getTime();
    await mutate(
      () => api.addNight({ hours, quality, bedH: parseClock(bed), wakeH: parseClock(wake), ts }),
      'Sleep logged'
    );
    closeSheet();
  };

  const timeCard = (
    labelText: string,
    tint: string,
    icon: React.ReactNode,
    value: string,
    setValue: (v: string) => void
  ) => (
    <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 18, padding: '14px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <span style={{ width: 28, height: 28, borderRadius: 9, flex: 'none', background: `color-mix(in srgb,var(--${tint}) 15%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>{labelText}</span>
      </div>
      <input type="time" value={value} onChange={(e) => setValue(e.target.value)} style={{ width: '100%', border: 'none', background: 'none', fontSize: 25, fontWeight: 700, color: 'var(--text)', outline: 'none', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em', padding: 0 }} />
    </div>
  );

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 20px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>Log sleep</div>
        <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
          <svg width="15" height="15" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <rect x="2" y="3" width="11" height="10" rx="2" />
            <path d="M2 6h11M5 1.5v3M10 1.5v3" />
          </svg>
          {day === todayISO() ? 'Today' : new Date(`${day}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          <input
            type="date"
            value={day}
            max={todayISO()}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', border: 'none', cursor: 'pointer' }}
          />
        </label>
      </div>

      <div style={{ textAlign: 'center', margin: '2px 0 22px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text2)', marginBottom: 4 }}>Time asleep</div>
        <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{durLabel}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, marginBottom: 26 }}>
        {timeCard('Bedtime', 'indigo', (
          <svg width="16" height="16" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M14 9.3A5.6 5.6 0 1 1 6.7 2a4.4 4.4 0 0 0 7.3 7.3Z" /></svg>
        ), bed, setBed)}
        {timeCard('Wake-up', 'warning', (
          <svg width="16" height="16" style={{ fill: 'none', stroke: 'var(--warning)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}><circle cx="8" cy="8" r="3.2" /><path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" /></svg>
        ), wake, setWake)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Quality</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{quality} / 10</span>
      </div>
      <input type="range" min={1} max={10} step={1} value={quality} onChange={(e) => setQuality(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--blue)', height: 6, marginBottom: 6, cursor: 'pointer' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text2)', marginBottom: 26 }}>
        <span>Poor</span>
        <span>Excellent</span>
      </div>

      <div onClick={save} className="press" style={{ background: 'var(--blue)', color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, cursor: 'pointer', boxShadow: '0 12px 20px -10px rgba(40,36,28,.22)' }}>Save sleep</div>
    </div>
  );
}
