import { Capacitor } from '@capacitor/core';
import { enablePush as enableWebPush, pushSupported } from './push';
import { api } from '../api';

// Unified reminder/notification layer.
//
// On the web we use the existing VAPID web-push + service worker (server sends
// the daily reminder). Inside the native app that machinery doesn't run, so we
// schedule a real on-device daily notification with @capacitor/local-notifications
// instead — which also works offline and doesn't depend on the server.

const REMINDER_ID = 1001; // stable id for the repeating daily reminder
const TEST_ID = 1002;

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

async function LN() {
  const mod = await import('@capacitor/local-notifications');
  return mod.LocalNotifications;
}

function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = (time || '21:00').split(':').map((n) => parseInt(n, 10));
  return { hour: isNaN(h) ? 21 : h, minute: isNaN(m) ? 0 : m };
}

async function scheduleDaily(time: string): Promise<void> {
  const ln = await LN();
  const { hour, minute } = parseTime(time);
  // Replace any existing schedule so changing the time doesn't stack reminders.
  await ln.cancel({ notifications: [{ id: REMINDER_ID }] }).catch(() => {});
  await ln.schedule({
    notifications: [
      {
        id: REMINDER_ID,
        title: 'Orbit',
        body: 'How did today go? Take a moment to log it 🌙',
        schedule: { on: { hour, minute }, allowWhileIdle: true },
      },
    ],
  });
}

/**
 * Turn reminders on: ask permission and (native) schedule the daily notification,
 * or (web) subscribe to push. Returns a status the UI can message on.
 */
export async function enableReminders(time: string): Promise<'ok' | 'denied' | 'unsupported' | 'error'> {
  if (isNative()) {
    try {
      const ln = await LN();
      const perm = await ln.requestPermissions();
      if (perm.display !== 'granted') return 'denied';
      await scheduleDaily(time);
      return 'ok';
    } catch {
      return 'error';
    }
  }
  if (!pushSupported()) return 'unsupported';
  return enableWebPush();
}

/** Reschedule the native daily reminder when the user changes the time. */
export async function updateReminderTime(time: string): Promise<void> {
  if (!isNative()) return;
  try {
    await scheduleDaily(time);
  } catch {
    /* ignore — the server still holds the source-of-truth time */
  }
}

/** Turn the native daily reminder off. */
export async function disableReminders(): Promise<void> {
  if (!isNative()) return;
  try {
    const ln = await LN();
    await ln.cancel({ notifications: [{ id: REMINDER_ID }] });
  } catch {
    /* ignore */
  }
}

/**
 * Fire a test notification. Native: a real local notification a moment from now.
 * Web: fall back to the server push test. Returns what happened so the caller
 * can show the right toast.
 */
export async function sendTestNotification(): Promise<'sent' | 'denied' | 'error' | 'none'> {
  if (isNative()) {
    try {
      const ln = await LN();
      const perm = await ln.requestPermissions();
      if (perm.display !== 'granted') return 'denied';
      await ln.schedule({
        notifications: [
          {
            id: TEST_ID,
            title: 'Orbit',
            body: 'Test notification 🎉 Your reminders are working.',
            schedule: { at: new Date(Date.now() + 1500) },
          },
        ],
      });
      return 'sent';
    } catch {
      return 'error';
    }
  }
  try {
    const r = await api.pushTest();
    return r.sent ? 'sent' : 'none';
  } catch {
    return 'error';
  }
}
