import { Capacitor, registerPlugin } from '@capacitor/core';
import { t } from '../i18n';

// App lock: asks for the phone's own fingerprint, face or screen-lock PIN when
// Orbit opens, and again when it comes back after a while away. A setting of
// this phone, not of the account: a second phone has its own lock.

interface OrbitLockPlugin {
  available(): Promise<{ available: boolean }>;
  unlock(o?: { reason?: string; title?: string }): Promise<{ ok: boolean; message?: string }>;
}

const OrbitLock = registerPlugin<OrbitLockPlugin>('OrbitLock');
const KEY = 'orbit_lock';

/** Away this long and it locks again. Long enough not to ask after a glance at another app. */
export const RELOCK_AFTER = 60_000;

export const lockSupported = (): boolean => Capacitor.isNativePlatform();

export function lockEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setLockEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* without storage there's nothing to remember it in */
  }
}

/** Whether the phone has a screen lock to ask for. Older builds without the plugin: no. */
export async function lockAvailable(): Promise<boolean> {
  if (!lockSupported()) return false;
  try {
    return (await OrbitLock.available()).available;
  } catch {
    return false;
  }
}

export async function unlock(reason?: string): Promise<boolean> {
  try {
    return (await OrbitLock.unlock({ reason: reason ?? t('Your money and habits are behind this.'), title: t('Unlock Orbit') })).ok;
  } catch {
    return false;
  }
}
