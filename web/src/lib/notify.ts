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
const WEEKLY_ID = 1003; // Sunday evening "your week is ready" nudge
const REST_ID = 1005; // rest-between-sets countdown

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

async function LN() {
  const mod = await import('@capacitor/local-notifications');
  return mod.LocalNotifications;
}

const CHANNEL_ID = 'orbit-reminders';

// Android 8+ requires a notification channel; create it up front (no-op on iOS).
async function ensureChannel(ln: Awaited<ReturnType<typeof LN>>): Promise<void> {
  try {
    await ln.createChannel({
      id: CHANNEL_ID,
      name: 'Reminders',
      description: 'Daily check-in reminders',
      importance: 5,
      visibility: 1,
    });
  } catch {
    /* not supported on this platform */
  }
}

function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = (time || '21:00').split(':').map((n) => parseInt(n, 10));
  return { hour: isNaN(h) ? 21 : h, minute: isNaN(m) ? 0 : m };
}

/**
 * Reminder copy tailored to where the user actually is today, instead of the
 * same sentence forever. `remaining` is how many scheduled habits are still
 * unchecked; -1 means "unknown".
 */
function reminderBody(remaining: number): string {
  if (remaining < 0) return 'How did today go? Take a moment to log it 🌙';
  if (remaining === 0) return "Everything's checked off today — log the rest of your day? ✨";
  if (remaining === 1) return 'Just one habit left today — finish strong 🌱';
  if (remaining <= 3) return `${remaining} habits left today — a couple of taps 💫`;
  return `${remaining} habits waiting. Two minutes now, a clearer picture later 🙌`;
}

async function scheduleDaily(time: string, remaining = -1): Promise<void> {
  const ln = await LN();
  await ensureChannel(ln);
  const { hour, minute } = parseTime(time);
  // Replace any existing schedule so changing the time doesn't stack reminders.
  await ln.cancel({ notifications: [{ id: REMINDER_ID }] }).catch(() => {});
  await ln.schedule({
    notifications: [
      {
        id: REMINDER_ID,
        title: 'Orbit',
        body: reminderBody(remaining),
        schedule: { on: { hour, minute }, allowWhileIdle: true },
        channelId: CHANNEL_ID,
      },
    ],
  });
}

/**
 * A weekly nudge on Sunday evening pointing at the story report — the ritual
 * that brings people back after the novelty of daily logging fades.
 */
async function scheduleWeekly(): Promise<void> {
  const ln = await LN();
  await ensureChannel(ln);
  await ln.cancel({ notifications: [{ id: WEEKLY_ID }] }).catch(() => {});
  await ln.schedule({
    notifications: [
      {
        id: WEEKLY_ID,
        title: 'Your week on Orbit',
        body: 'Your weekly report is ready — see how the week went 🗓️',
        // weekday 1 = Sunday in the plugin's schedule format.
        schedule: { on: { weekday: 1, hour: 19, minute: 0 }, allowWhileIdle: true },
        channelId: CHANNEL_ID,
      },
    ],
  });
}

// Per-habit and bill reminders use their own id ranges so they never collide
// with the daily (1001) / test (1002) / weekly (1003) notifications.
const HABIT_BASE = 2000;
const BILL_BASE = 3000;
const WINDDOWN_ID = 1004;
const stableId = (base: number, key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return base + (h % 500);
};

/**
 * Schedule a reminder for each habit that has its own time, and one the day
 * before each recurring bill is due.
 */
export async function scheduleExtras(
  habits: { id: string; name: string; reminderTime: string | null; paused: boolean; archived: boolean }[],
  bills: { id: string; name: string; nextTs: number | null; income: boolean }[],
  windDown?: { on: boolean; bedHour: number | null }
): Promise<void> {
  if (!isNative()) return;
  try {
    const ln = await LN();
    await ensureChannel(ln);
    const wanted = habits.filter((h) => h.reminderTime && !h.paused && !h.archived);
    // Clear the whole range first so removed reminders actually disappear.
    const pending = await ln.getPending();
    const stale = pending.notifications
      .filter((n) => n.id >= HABIT_BASE && n.id < BILL_BASE + 500)
      .map((n) => ({ id: n.id }));
    if (stale.length) await ln.cancel({ notifications: stale });

    const notifications: Parameters<typeof ln.schedule>[0]['notifications'] = [];
    wanted.forEach((h) => {
      const { hour, minute } = parseTime(h.reminderTime!);
      notifications.push({
        id: stableId(HABIT_BASE, h.id),
        title: h.name,
        body: 'Time for this one — tap to check it off 🌱',
        schedule: { on: { hour, minute }, allowWhileIdle: true },
        channelId: CHANNEL_ID,
      });
    });
    // Bills: a heads-up the day before, at 10:00.
    bills
      .filter((b) => !b.income && b.nextTs && b.nextTs > Date.now())
      .slice(0, 20)
      .forEach((b) => {
        const at = new Date(b.nextTs! - 86400000);
        at.setHours(10, 0, 0, 0);
        if (at.getTime() <= Date.now()) return;
        notifications.push({
          id: stableId(BILL_BASE, b.id),
          title: 'Upcoming bill',
          body: `${b.name} is due tomorrow.`,
          schedule: { at, allowWhileIdle: true },
          channelId: CHANNEL_ID,
        });
      });
    // Wind-down: 30 minutes before the user's usual bedtime.
    await ln.cancel({ notifications: [{ id: WINDDOWN_ID }] }).catch(() => {});
    if (windDown?.on && windDown.bedHour != null) {
      const t = (windDown.bedHour - 0.5 + 24) % 24;
      notifications.push({
        id: WINDDOWN_ID,
        title: 'Time to wind down',
        body: 'Bed in about 30 minutes — start slowing things down 🌙',
        schedule: { on: { hour: Math.floor(t), minute: Math.round((t % 1) * 60) }, allowWhileIdle: true },
        channelId: CHANNEL_ID,
      });
    }
    if (notifications.length) await ln.schedule({ notifications });
  } catch {
    /* reminders are best-effort — never break the app over them */
  }
}

/**
 * Ring when the rest between sets is up. The countdown itself is wall-clock, so
 * this only exists to get the user's attention when the phone is in a pocket —
 * the timer stays correct either way.
 */
export async function scheduleRestAlarm(at: Date): Promise<void> {
  if (!isNative()) return;
  try {
    const ln = await LN();
    const perm = await ln.checkPermissions();
    if (perm.display !== 'granted') return; // don't prompt mid-workout
    await ensureChannel(ln);
    await ln.cancel({ notifications: [{ id: REST_ID }] }).catch(() => {});
    if (at.getTime() <= Date.now()) return;
    await ln.schedule({
      notifications: [
        { id: REST_ID, title: 'Rest over', body: 'Next set 💪', schedule: { at, allowWhileIdle: true }, channelId: CHANNEL_ID },
      ],
    });
  } catch {
    /* best-effort */
  }
}

export async function cancelRestAlarm(): Promise<void> {
  if (!isNative()) return;
  try {
    const ln = await LN();
    await ln.cancel({ notifications: [{ id: REST_ID }] });
  } catch {
    /* ignore */
  }
}

/**
 * Called on app launch: if the account has reminders on, make sure the daily
 * notification is actually scheduled on THIS device (permissions were granted
 * on the web or a prior install, so it may never have been set here).
 */
export async function syncReminders(enabled: boolean, time: string, remaining = -1): Promise<void> {
  if (!isNative()) return;
  try {
    if (!enabled) {
      await disableReminders();
      return;
    }
    const ln = await LN();
    let perm = await ln.checkPermissions();
    if (perm.display !== 'granted') perm = await ln.requestPermissions();
    if (perm.display !== 'granted') return;
    await scheduleDaily(time, remaining);
    await scheduleWeekly();
    api.pushUnsubscribeAll().catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * Turn reminders on: ask permission and (native) schedule the daily notification,
 * or (web) subscribe to push. Returns a status the UI can message on.
 */
export async function enableReminders(time: string, remaining = -1): Promise<'ok' | 'denied' | 'unsupported' | 'error'> {
  if (isNative()) {
    try {
      const ln = await LN();
      const perm = await ln.requestPermissions();
      if (perm.display !== 'granted') return 'denied';
      await scheduleDaily(time, remaining);
      await scheduleWeekly();
      // The device now handles reminders itself — drop any server-side web-push
      // subscription so the two can't both fire and double-notify.
      api.pushUnsubscribeAll().catch(() => {});
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
    await ln.cancel({ notifications: [{ id: REMINDER_ID }, { id: WEEKLY_ID }] });
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
      await ensureChannel(ln);
      await ln.schedule({
        notifications: [
          {
            id: TEST_ID,
            title: 'Orbit',
            body: 'Test notification 🎉 Your reminders are working.',
            schedule: { at: new Date(Date.now() + 1500) },
            channelId: CHANNEL_ID,
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
