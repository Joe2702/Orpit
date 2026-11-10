import { useState } from 'react';
import { useStore } from './store';
import { api } from './api';
import { deviceTimezone, pushSupported } from './lib/push';
import { enableReminders, isNative } from './lib/notify';
import { t } from './i18n';
import { SlideButton, SlideDismiss, SlideIcon, type Slide } from './ForYou';

const DISMISS_KEY = 'orbit_reminder_dismissed';

const dismissedBefore = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * An offer of a daily check-in reminder, as a card in Home's "For you" rather
 * than a pop-up. It waits until someone has logged a few things (an offer to
 * remind you about an app you haven't used yet is noise), never covers the
 * screen, and asks the phone for permission only when "Turn on" is tapped.
 */
export function useReminderSlide(): Slide | null {
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
    // Once reminderTime is set, this card stops showing.
  };

  return {
    key: 'reminder',
    icon: SlideIcon.bell,
    title: t('Want a nudge to check in?'),
    text: t('One reminder a day, at a time you pick. The end of the day works best.'),
    end: <SlideDismiss onClick={dismiss} />,
    below: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="time"
          value={time}
          aria-label={t('Reminder time')}
          onChange={(e) => e.target.value && setTime(e.target.value)}
          style={{ height: 44, flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(12px * var(--sq))', padding: '0 12px', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
        />
        <SlideButton onClick={turnOn} busy={busy}>
          {busy ? t('Setting up…') : t('Turn on')}
        </SlideButton>
      </div>
    ),
  };
}
