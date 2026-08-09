import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import { api } from './api';
import { dayKey } from './lib/format';
import { formatSteps, approxKm } from './lib/steps';
import { enableSteps, stepsStatus, stepsSupported, syncSteps } from './lib/stepsSync';
import { Spark } from './lib/charts';

/**
 * Steps, counted by the phone rather than logged by hand.
 *
 * It sits with the counters because that is where anyone would look for it, but
 * it has no add button: a counter that fills itself and also accepts manual
 * entries would double-count, and there is no honest way to reconcile the two.
 *
 * Off-device, or on a phone with no step sensor, the card doesn't appear at all
 * rather than showing a permanent zero.
 */
export function StepsCard() {
  const { state, applyState } = useStore();
  const [status, setStatus] = useState<{ available: boolean; granted: boolean } | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let alive = true;
    stepsStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  const days = state?.steps ?? [];
  const today = days.find((d) => d.day === dayKey())?.steps ?? 0;

  // Last seven days, zero-filled: gaps in the series would make the sparkline
  // join across missing days and imply a walk that never happened.
  const week: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const key = dayKey(Date.now() - i * 86400000);
    week.push(days.find((d) => d.day === key)?.steps ?? 0);
  }
  const weekTotal = week.reduce((a, b) => a + b, 0);

  // Nothing to offer on a browser, or on a device without the sensor.
  if (!stepsSupported() || (status && !status.available)) return null;

  const ask = async () => {
    setAsking(true);
    try {
      const s = await enableSteps();
      setStatus(s);
      if (s.granted) {
        await syncSteps(today, (day, n) => api.putSteps(day, n).then(applyState));
      }
    } finally {
      setAsking(false);
    }
  };

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    boxShadow: 'var(--shadow)',
    padding: '15px 16px',
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{ width: 24, height: 24, borderRadius: 8, background: 'color-mix(in srgb,var(--teal) 14%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <svg width="14" height="14" style={{ fill: 'none', stroke: 'var(--teal)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden>
          <path d="M5 12.5c-1.4 0-2.2-1-2-2.4.2-1.3 1-2 1-3.3C4 5 4.8 3.5 6.2 3.5S8.3 4.8 8.3 6.4c0 1.8-1 2.5-1.4 4-.2 1.2-.6 2.1-1.9 2.1Z" />
          <path d="M11.6 9.4c1.2 0 1.9-.9 1.7-2.1-.2-1.1-.9-1.7-.9-2.8 0-1.5-.7-2.8-1.9-2.8s-1.8 1.1-1.8 2.5c0 1.5.9 2.1 1.2 3.4.2 1 .5 1.8 1.7 1.8Z" />
        </svg>
      </span>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>Steps · today</span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)' }}>Automatic</span>
    </div>
  );

  if (status && !status.granted) {
    return (
      <div style={card}>
        {header}
        <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 12 }}>
          Orbit can read the step count your phone already keeps, so you never log it.
          Nothing leaves the device except the daily total.
        </div>
        <div
          onClick={asking ? undefined : ask}
          className={asking ? undefined : 'press99'}
          role="button"
          style={{ height: 46, borderRadius: 14, background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14.5, fontWeight: 700, cursor: asking ? 'default' : 'pointer', opacity: asking ? 0.6 : 1 }}
        >
          {asking ? 'Asking…' : 'Count my steps'}
        </div>
      </div>
    );
  }

  return (
    <div style={card}>
      {header}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
          {formatSteps(today)}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>≈ {approxKm(today)} km</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>
        {formatSteps(weekTotal)} this week
      </div>
      <div style={{ height: 40, marginTop: 8 }}>
        <Spark values={week.some((v) => v > 0) ? week : [0, 0]} colorKey="teal" />
      </div>
    </div>
  );
}
