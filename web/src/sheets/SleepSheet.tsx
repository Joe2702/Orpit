import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { parseClock } from '../lib/format';
import { SleepDial, fmtClock } from '../SleepDial';
import { t } from '../i18n';

// Local YYYY-MM-DD (not UTC) for the date input's default.
function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function SleepSheet() {
  const { closeSheet, mutateOpt, haptic } = useStore();
  const [quality, setQuality] = useState(7);
  // Fractional hours rather than "HH:MM" strings: the dial works in angles, and
  // round-tripping through text on every drag frame is both slower and lossier.
  const [bedH, setBedH] = useState(23);
  const [wakeH, setWakeH] = useState(6.75);
  const bed = fmtClock(bedH);
  const wake = fmtClock(wakeH);
  const [day, setDay] = useState(todayISO());
  const [note, setNote] = useState('');

  // Duration is derived from bedtime → wake-up.
  const hours = ((wakeH - bedH) % 24 + 24) % 24;
  const durLabel = `${Math.floor(hours)}h ${String(Math.round((hours % 1) * 60)).padStart(2, '0')}m`;

  const save = () => {
    haptic();
    // Timestamp the night at the wake-up moment on the chosen morning.
    const ts = new Date(`${day}T${wake || '08:00'}`).getTime();
    const tempId = 'tmp_' + Date.now();
    mutateOpt(
      (s) => ({ ...s, nights: [...s.nights, { id: tempId, hours, quality, bedH, wakeH, note: note.trim() || null, ts }] }),
      () => api.addNight({ hours, quality, bedH, wakeH, note: note.trim() || null, ts }),
      t('Sleep logged')
    ).catch(() => {});
    closeSheet();
  };

  const timeCard = (
    labelText: string,
    tint: string,
    icon: React.ReactNode,
    value: string,
    setValue: (v: string) => void
  ) => (
    // minWidth 0: a time input has a wide intrinsic size, and without it the
    // second card was pushed past the edge of the sheet on a 390px phone.
    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', padding: '14px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <span style={{ width: 28, height: 28, borderRadius: 'calc(9px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>{labelText}</span>
      </div>
      <input type="time" value={value} onChange={(e) => setValue(e.target.value)} style={{ width: '100%', minWidth: 0, border: 'none', background: 'none', fontSize: 22, fontWeight: 700, color: 'var(--text)', outline: 'none', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', padding: 0 }} />
    </div>
  );

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 20px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>{t('Log sleep')}</div>
        <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
          <svg width="15" height="15" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <rect x="2" y="3" width="11" height="10" rx="2" />
            <path d="M2 6h11M5 1.5v3M10 1.5v3" />
          </svg>
          {day === todayISO() ? t('Today') : new Date(`${day}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          <input
            type="date"
            value={day}
            max={todayISO()}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', border: 'none', cursor: 'pointer' }}
          />
        </label>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 2 }}>{t('Time asleep')}</div>
        <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{durLabel}</span>
      </div>

      <SleepDial bed={bedH} wake={wakeH} onChange={(b, w) => { setBedH(b); setWakeH(w); }} haptic={haptic} />

      {/* The exact times, under the dial. Dragging is for the shape of the
          night; these are for reading it back, and for typing an exact time
          when you already know it. */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, margin: '18px 0 26px' }}>
        {timeCard(t('Bedtime'), 'indigo', (
          <svg width="16" height="16" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M14 9.3A5.6 5.6 0 1 1 6.7 2a4.4 4.4 0 0 0 7.3 7.3Z" /></svg>
        ), bed, (v) => setBedH(parseClock(v)))}
        {timeCard(t('Wake-up'), 'warning', (
          <svg width="16" height="16" style={{ fill: 'none', stroke: 'var(--warning)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}><circle cx="8" cy="8" r="3.2" /><path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" /></svg>
        ), wake, (v) => setWakeH(parseClock(v)))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{t('Quality')}</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--indigo)', fontVariantNumeric: 'tabular-nums' }}>{quality} / 10</span>
      </div>
      <input type="range" min={1} max={10} step={1} value={quality} onChange={(e) => setQuality(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--indigo)', height: 6, marginBottom: 6, cursor: 'pointer' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text2)', marginBottom: 26 }}>
        <span>{t('Poor')}</span>
        <span>{t('Excellent')}</span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{t('Note (optional)')}</div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('e.g. woke up twice')}
        maxLength={200}
        style={{ width: '100%', height: 50, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 15, color: 'var(--text)', outline: 'none', marginBottom: 24 }}
      />

      <div role="button" tabIndex={0} onClick={save} className="press" style={{ background: 'var(--indigo)', color: 'var(--on-accent)', height: 54, borderRadius: 'calc(16px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, cursor: 'pointer', boxShadow: '0 12px 20px -10px rgba(40,36,28,.22)' }}>{t('Save sleep')}</div>
    </div>
  );
}
