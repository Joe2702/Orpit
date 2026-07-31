import { describe, it, expect, vi } from 'vitest';

// The Capacitor bug this pins down.
//
// A Capacitor plugin is a Proxy that answers *every* property access with a
// callable that forwards to native. Returning one from an `async` function
// makes the runtime treat it as a thenable: it reads `.then`, gets a function,
// calls it, and the bridge tries to invoke a native method named `then` —
//   "LocalNotifications.then()" is not implemented on android
// Every reminder in the app died on that line, silently, for two releases.
// This test recreates the Proxy so a future refactor can't reintroduce it.

const calls: string[] = [];
const fakePlugin = new Proxy(
  {},
  {
    get(_t, prop: string) {
      return (...args: unknown[]) => {
        calls.push(prop);
        if (prop === 'then') throw new Error(`"LocalNotifications.then()" is not implemented on android`);
        return Promise.resolve(args);
      };
    },
  }
);

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: fakePlugin }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('../lib/push', () => ({ enablePush: async () => 'ok', pushSupported: () => false }));
vi.mock('../api', () => ({ api: { pushUnsubscribeAll: async () => {}, pushTest: async () => ({ sent: true }) } }));

describe('reaching the notifications plugin', () => {
  it('never lets the plugin proxy be resolved as a promise', async () => {
    const { LN } = await import('../lib/notify');
    calls.length = 0;
    const { ln } = await LN();
    // The awaited value must not have been probed for `.then` on the way out.
    expect(calls).not.toContain('then');
    expect(ln).toBe(fakePlugin);
  });

  it('schedules a test notification instead of throwing', async () => {
    const { sendTestNotification } = await import('../lib/notify');
    calls.length = 0;
    // requestPermissions returns the proxy's echo, which has no `display`, so
    // the call reports 'denied' rather than 'error' — the point is that it got
    // far enough to talk to the plugin at all.
    const r = await sendTestNotification();
    expect(calls).toContain('requestPermissions');
    expect(r).not.toBe('error');
  });
});
