import React, { useState } from 'react';
import { useStore } from './store';
import { api } from './api';
import { deviceTimezone } from './lib/push';
import { enableReminders } from './lib/notify';

const DISMISS_KEY = 'orbit_reminder_dismissed';

/** One-time prompt (after signup) to set the daily reminder time + enable pushes. */
export function ReminderOnboarding() {
  const { state, mutate, showToast } = useStore();
  const [dismissed, setDismissed] = useState<boolean>(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [time, setTime] = useState('21:00');
  const [busy, setBusy] = useState(false);

  if (!state || state.profile.reminderTime || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      await mutate(() => api.updateMe({ reminderTime: time, reminderTz: deviceTimezone(), reminders: true }));
      const status = await enableReminders(time);
      if (status === 'ok') showToast('Daily reminder is on 🌙');
      else if (status === 'denied') showToast('Allow notifications to get reminders');
      else showToast('Reminder time saved');
    } catch {
      showToast('Could not save — try again');
      setBusy(false);
      return;
    }
    // Once reminderTime is set, this component stops rendering itself.
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 97, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div onClick={dismiss} style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,14,.55)', animation: 'fadeIn .2s ease', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 24, padding: '26px 22px 20px', width: '100%', maxWidth: 340, boxShadow: '0 20px 60px rgba(8,9,14,.4)', animation: 'fadeUp .28s ease' }}>
        <div style={{ fontSize: 34, textAlign: 'center', marginBottom: 6 }}>🌙</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', textAlign: 'center', letterSpacing: '-.02em' }}>
          When should we check in?
        </div>
        <div style={{ fontSize: 14, color: 'var(--text2)', textAlign: 'center', marginTop: 8, lineHeight: 1.55 }}>
          Pick a time to log your day. Near the <b style={{ color: 'var(--text)' }}>end of the day</b> works best — it’s the perfect moment to reflect on everything that happened. It only takes about 2 minutes.
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '22px 0' }}>
          <input
            type="time"
            value={time}
            onChange={(e) => e.target.value && setTime(e.target.value)}
            style={{ fontSize: 30, fontWeight: 700, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 20px', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
          />
        </div>

        <div
          onClick={busy ? undefined : turnOn}
          className="press"
          style={{ background: 'var(--indigo)', color: '#fff', height: 52, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, boxShadow: 'var(--glow)' }}
        >
          {busy ? 'Setting up…' : 'Turn on daily reminder'}
        </div>
        <div onClick={dismiss} style={{ textAlign: 'center', fontSize: 14, color: 'var(--text2)', padding: '14px 8px 4px', cursor: 'pointer', fontWeight: 500 }}>
          Maybe later
        </div>
      </div>
    </div>
  );
}
