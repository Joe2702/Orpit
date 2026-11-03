import React, { useState } from 'react';
import { useStore } from './store';
import { api } from './api';
import { deviceTimezone, pushSupported } from './lib/push';
import { enableReminders, isNative } from './lib/notify';
import { t } from './i18n';

const DISMISS_KEY = 'orbit_reminder_dismissed';

const dismissedBefore = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * An offer of a daily check-in reminder, as a card on Home rather than a
 * pop-up. It waits until someone has logged a few things (an offer to remind
 * you about an app you haven't used yet is noise), never covers the screen,
 * and asks the phone for permission only when "Turn on" is tapped.
 */
export function ReminderCard() {
  const { state, mutate, showToast, haptic } = useStore();
  const [dismissed, setDismissed] = useState(dismissedBefore);
  const [time, setTime] = useState('21:00');
  const [busy, setBusy] = useState(false);

  if (!state || state.profile.reminderTime || dismissed) return null;
  if (!isNative() && !pushSupported()) return null;
  const logged = state.checkins.length + state.txns.length + state.workouts.length + state.nights.length + (state.countLogs?.length ?? 0);
  if (logged < 3) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* it just shows again next time */
    }
    setDismissed(true);
  };

  const turnOn = async () => {
    haptic(10);
    setBusy(true);
    try {
      await mutate(() => api.updateMe({ reminderTime: time, reminderTz: deviceTimezone(), reminders: true }));
      const status = await enableReminders(time);
      if (status === 'ok') showToast(t('Daily reminder is on'));
      else if (status === 'denied') showToast(t('Allow notifications to get reminders'));
      else showToast(t('Reminder time saved'));
    } catch {
      showToast(t('Couldn’t save that. Try again.'));
      setBusy(false);
    }
    // Once reminderTime is set, this card stops rendering itself.
  };

  return (
    <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(20px * var(--sq))', padding: '15px 16px 14px', marginBottom: 22, animation: 'fadeUp .4s ease' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text)' }}>{t('Want a nudge to check in?')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 3, lineHeight: 1.45 }}>{t('One reminder a day, at a time you pick. The end of the day works best.')}</div>
        </div>
        <div tabIndex={0} onClick={dismiss} role="button" aria-label={t('Dismiss')} className="press92" style={{ width: 30, height: 30, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 99, color: 'var(--text3)', cursor: 'pointer', marginTop: -4, marginInlineEnd: -6 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }}>
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <input
          type="time"
          value={time}
          aria-label={t('Reminder time')}
          onChange={(e) => e.target.value && setTime(e.target.value)}
          style={{ height: 42, fontSize: 16, fontWeight: 650, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(12px * var(--sq))', padding: '0 12px', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
        />
        <div
          role="button"
          tabIndex={0}
          onClick={busy ? undefined : turnOn}
          className="press"
          style={{ flex: 1, height: 42, borderRadius: 'calc(12px * var(--sq))', background: 'var(--indigo)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
        >
          {busy ? t('Setting up…') : t('Turn on')}
        </div>
      </div>
    </div>
  );
}
