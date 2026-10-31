import { money0 } from './format';
import { Capacitor } from '@capacitor/core';
import type { LocalNotificationsPlugin } from '@capacitor/local-notifications';
import { enablePush as enableWebPush, pushSupported } from './push';
import { api } from '../api';
import { date, t, tn } from '../i18n';

// Unified reminder/notification layer.
//
// On the web we use the existing VAPID web-push + service worker (server sends
// the daily reminder). Inside the native app that machinery doesn't run, so we
// schedule a real on-device daily notification with @capacitor/local-notifications
// instead — which also works offline and doesn't depend on the server.

const REMINDER_ID = 1001; // stable id for the repeating daily reminder
const TEST_ID = 1002;
const WEEKLY_ID = 1003; // Sunday evening "your week is ready" nudge

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

// Never return the plugin object bare from an async function.
//
// Capacitor hands back a Proxy that answers *any* property with a callable that
// forwards to native. `await`ing a promise that resolves to it makes JS probe
// for `.then` — the Proxy happily supplies one, the runtime calls it, and the
// bridge tries to invoke a native method literally named `then`:
//
//   "LocalNotifications.then()" is not implemented on android
//
// which is exactly what every reminder path was dying on. Wrapping it in a
// plain object hides it from Promise resolution.
export async function LN(): Promise<{ ln: LocalNotificationsPlugin }> {
  const mod = await import('@capacitor/local-notifications');
  return { ln: mod.LocalNotifications };
}

const CHANNEL_ID = 'orbit-reminders';

// Action buttons attached to reminders. Tapping one still opens the app — the
// handler is JavaScript, so there is no truly silent path — but it lands on the
// exact thing you meant to do instead of the Home screen.
export const HABIT_ACTIONS = 'orbit-habit';   // a named habit → "Done"
export const DAILY_ACTIONS = 'orbit-daily';   // the nightly nudge → "Snooze 1 hour"
export const SNOOZE_ID = 1006;

let actionsRegistered = false;
async function ensureActionTypes(ln: LocalNotificationsPlugin): Promise<void> {
  if (actionsRegistered) return;
  try {
    await ln.registerActionTypes({
      types: [
        { id: HABIT_ACTIONS, actions: [{ id: 'done', title: t('Done') }] },
        { id: DAILY_ACTIONS, actions: [{ id: 'snooze', title: t('Snooze 1 hour') }] },
      ],
    });
    actionsRegistered = true;
  } catch {
    /* older platform without action support — the notification still works */
  }
}

/** Push the nightly reminder out by an hour, once. */
export async function snoozeDaily(): Promise<void> {
  if (!isNative()) return;
  try {
    const { ln } = await LN();
    await ensureChannel(ln);
    await ln.cancel({ notifications: [{ id: SNOOZE_ID }] }).catch(() => {});
    await ln.schedule({
      notifications: [
        {
          id: SNOOZE_ID,
          title: t('Orbit'),
          body: t('How did today go?'),
          schedule: { at: new Date(Date.now() + 60 * 60 * 1000), allowWhileIdle: true },
          channelId: CHANNEL_ID,
        },
      ],
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Listen for taps on a reminder's action button. `onDone` receives the habit id
 * carried in the notification's `extra`; `onSnooze` has no payload.
 */
export function listenForNotificationActions(handlers: {
  onDone: (habitId: string) => void;
  onSnooze: () => void;
  /** A plain tap on a notification that belongs to a screen. */
  onOpen?: (screen: string) => void;
}): () => void {
  if (!isNative()) return () => {};
  let cancelled = false;
  let remove: (() => void) | undefined;
  LN()
    .then(async ({ ln }) => {
      if (cancelled) return;
      const h = await ln.addListener('localNotificationActionPerformed', (e) => {
        if (e.actionId === 'snooze') {
          handlers.onSnooze();
          return;
        }
        if (e.actionId === 'done') {
          const id = (e.notification?.extra as { habitId?: string } | undefined)?.habitId;
          if (id) handlers.onDone(id);
          return;
        }
        const screen = (e.notification?.extra as { screen?: string } | undefined)?.screen;
        if (e.actionId === 'tap' && screen) handlers.onOpen?.(screen);
      });
      remove = () => h.remove();
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    remove?.();
  };
}

// Android 8+ requires a notification channel; create it up front (no-op on iOS).
async function ensureChannel(ln: LocalNotificationsPlugin): Promise<void> {
  try {
    await ln.createChannel({
      id: CHANNEL_ID,
      name: t('Reminders'),
      description: t('Daily check-in reminders'),
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
  if (remaining < 0) return t('How did today go? Take a moment to log it.');
  if (remaining === 0) return t("Everything's checked off. Anything else to log today?");
  if (remaining <= 3) return tn(remaining, 'One habit left today.', '{n} habits left today.');
  return tn(remaining, '{n} habit waiting. Two minutes now, a clearer picture later.', '{n} habits waiting. Two minutes now, a clearer picture later.');
}

async function scheduleDaily(time: string, remaining = -1): Promise<void> {
  const { ln } = await LN();
  await ensureChannel(ln);
  await ensureActionTypes(ln);
  const { hour, minute } = parseTime(time);
  // Replace any existing schedule so changing the time doesn't stack reminders.
  await ln.cancel({ notifications: [{ id: REMINDER_ID }] }).catch(() => {});
  await ln.schedule({
    notifications: [
      {
        id: REMINDER_ID,
        title: t('Orbit'),
        body: reminderBody(remaining),
        schedule: { on: { hour, minute }, allowWhileIdle: true },
        channelId: CHANNEL_ID,
        actionTypeId: DAILY_ACTIONS,
      },
    ],
  });
}

/**
 * A weekly nudge on Sunday evening pointing at the story report — the ritual
 * that brings people back after the novelty of daily logging fades.
 */
async function scheduleWeekly(): Promise<void> {
  const { ln } = await LN();
  await ensureChannel(ln);
  await ln.cancel({ notifications: [{ id: WEEKLY_ID }] }).catch(() => {});
  await ln.schedule({
    notifications: [
      {
        id: WEEKLY_ID,
        title: t('Your week on Orbit'),
        body: t('A minute to look back, and one thing to aim for next week.'),
        extra: { screen: 'weekreview' },
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
  bills: { id: string; name: string; nextTs: number | null; income: boolean; amount?: number }[],
  windDown?: { on: boolean; bedHour: number | null }
): Promise<void> {
  if (!isNative()) return;
  try {
    const { ln } = await LN();
    await ensureChannel(ln);
    await ensureActionTypes(ln);
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
        body: t('Tap to check it off.'),
        schedule: { on: { hour, minute }, allowWhileIdle: true },
        channelId: CHANNEL_ID,
        actionTypeId: HABIT_ACTIONS,
        // Which habit this is for, so "Done" is unambiguous when it fires.
        extra: { habitId: h.id },
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
          title: t('Upcoming bill'),
          body: b.amount ? t('{name}, {amount}, is due tomorrow.', { name: b.name, amount: money0(b.amount) }) : t('{name} is due tomorrow.', { name: b.name }),
          extra: { screen: 'frecurring' },
          schedule: { at, allowWhileIdle: true },
          channelId: CHANNEL_ID,
        });
      });
    // Wind-down: 30 minutes before the user's usual bedtime.
    await ln.cancel({ notifications: [{ id: WINDDOWN_ID }] }).catch(() => {});
    if (windDown?.on && windDown.bedHour != null) {
      const tx = (windDown.bedHour - 0.5 + 24) % 24;
      notifications.push({
        id: WINDDOWN_ID,
        title: t('Time to wind down'),
        body: t('Bed in about 30 minutes. Time to start winding down.'),
        schedule: { on: { hour: Math.floor(tx), minute: Math.round((tx % 1) * 60) }, allowWhileIdle: true },
        channelId: CHANNEL_ID,
      });
    }
    if (notifications.length) await ln.schedule({ notifications });
  } catch {
    /* reminders are best-effort — never break the app over them */
  }
}

// The morning brief: one notification per morning for the next two weeks,
// each with its own line (that day's habits, a bill due that day). Written
// ahead because a scheduled notification can't change its words when it
// fires; every time Orbit opens they're written again from the latest data.
// Someone who doesn't open Orbit for two weeks stops getting them, which is
// the right point to stop.
const BRIEF_BASE = 4000;
const BRIEF_SPAN = 100;

export async function scheduleBriefs(mornings: { at: Date; body: string }[]): Promise<void> {
  if (!isNative()) return;
  try {
    const { ln } = await LN();
    // Never asks here: that happens when someone turns the brief on.
    if ((await ln.checkPermissions()).display !== 'granted') return;
    await ensureChannel(ln);
    const pending = await ln.getPending();
    const stale = pending.notifications.filter((n) => n.id >= BRIEF_BASE && n.id < BRIEF_BASE + BRIEF_SPAN).map((n) => ({ id: n.id }));
    if (stale.length) await ln.cancel({ notifications: stale });
    if (!mornings.length) return;
    await ln.schedule({
      notifications: mornings.slice(0, BRIEF_SPAN).map((m, i) => ({
        id: BRIEF_BASE + i,
        title: t('Your morning brief'),
        body: m.body,
        extra: { screen: 'brief' },
        schedule: { at: m.at, allowWhileIdle: true },
        channelId: CHANNEL_ID,
      })),
    });
  } catch {
    /* best-effort, like every reminder */
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
    const { ln } = await LN();
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
 * Permission to show notifications at all, asked for on its own. Payment
 * alerts from bank messages need it even for someone who never wanted habit
 * reminders, and on Android 13+ a notification posted without it is dropped
 * without a word. Returns whether notifications can be shown.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { ln } = await LN();
    let perm = await ln.checkPermissions();
    if (perm.display !== 'granted') perm = await ln.requestPermissions();
    return perm.display === 'granted';
  } catch {
    return false;
  }
}

/** A notification right now, for something that just happened (a budget crossed). */
export async function notifyNow(id: number, title: string, body: string, screen?: string): Promise<void> {
  if (!isNative()) return;
  try {
    const { ln } = await LN();
    if ((await ln.checkPermissions()).display !== 'granted') return;
    await ensureChannel(ln);
    await ln.schedule({
      notifications: [{ id, title, body, schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true }, channelId: CHANNEL_ID, ...(screen ? { extra: { screen } } : {}) }],
    });
  } catch {
    /* best-effort */
  }
}

/** Whether notifications can be shown now, without asking. */
export async function notificationsAllowed(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { ln } = await LN();
    return (await ln.checkPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Turn reminders on: ask permission and (native) schedule the daily notification,
 * or (web) subscribe to push. Returns a status the UI can message on.
 */
export async function enableReminders(time: string, remaining = -1): Promise<'ok' | 'denied' | 'unsupported' | 'error'> {
  if (isNative()) {
    try {
      const { ln } = await LN();
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
    const { ln } = await LN();
    await ln.cancel({ notifications: [{ id: REMINDER_ID }, { id: WEEKLY_ID }] });
  } catch {
    /* ignore */
  }
}

export interface NotifyDiagnostics {
  native: boolean;
  /** OS-level permission to post notifications (Android 13+ asks for this). */
  permission: 'granted' | 'denied' | 'prompt' | 'unknown';
  /** Whether notifications are enabled for the app in system settings. */
  enabled: boolean | null;
  /** Exact alarms allowed. When false, reminders can be deferred by Doze. */
  exact: boolean | null;
  /** How many reminders are actually scheduled right now. */
  scheduled: number;
  /** When the next one is due, if the platform tells us. */
  nextAt: string | null;
}

/**
 * Report what the OS actually thinks, rather than what the app assumes.
 *
 * "Notifications don't fire" has at least four distinct causes — permission
 * never granted, notifications disabled in system settings, nothing actually
 * scheduled, or exact alarms blocked so the OS defers them. They're
 * indistinguishable from inside the app unless you ask, so Settings shows this
 * and the user can see which one it is instead of guessing.
 */
export async function diagnose(): Promise<NotifyDiagnostics> {
  const out: NotifyDiagnostics = {
    native: isNative(),
    permission: 'unknown',
    enabled: null,
    exact: null,
    scheduled: 0,
    nextAt: null,
  };
  if (!isNative()) return out;
  try {
    const { ln } = await LN();
    try {
      const p = await ln.checkPermissions();
      out.permission = (p.display as NotifyDiagnostics['permission']) || 'unknown';
    } catch {
      /* leave unknown */
    }
    try {
      out.enabled = (await ln.areEnabled()).value;
    } catch {
      /* older platform */
    }
    try {
      out.exact = (await ln.checkExactNotificationSetting()).exact_alarm === 'granted';
    } catch {
      /* not supported before Android 12 — treat as unknown */
    }
    try {
      const pend = await ln.getPending();
      out.scheduled = pend.notifications.length;
      const times = pend.notifications
        .map((n) => (n.schedule?.at ? new Date(n.schedule.at).getTime() : 0))
        .filter((t) => t > 0)
        .sort((a, b) => a - b);
      if (times.length) out.nextAt = date(times[0], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    } catch {
      /* ignore */
    }
  } catch {
    /* plugin unavailable */
  }
  return out;
}

/** Open the system screen where the user can allow exact alarms. */
export async function requestExactAlarms(): Promise<void> {
  if (!isNative()) return;
  try {
    const { ln } = await LN();
    await ln.changeExactNotificationSetting();
  } catch {
    /* not supported on this platform */
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
      const { ln } = await LN();
      const perm = await ln.requestPermissions();
      if (perm.display !== 'granted') return 'denied';
      await ensureChannel(ln);
      await ln.schedule({
        notifications: [
          {
            id: TEST_ID,
            title: t('Orbit'),
            body: t('Test notification. Your reminders are working.'),
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
