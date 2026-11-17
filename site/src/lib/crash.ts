// The website's crash reports go to the same inbox as the phone app's: only
// the error text, the build and the browser string, never anything the person
// typed. A few per visit at most, and never the same one twice.

import { getToken } from '../api';

const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const seen = new Set<string>();
let sent = 0;

function report(message: string, stack: string) {
  if (!message) return;
  const key = message + stack.slice(0, 120);
  if (seen.has(key) || sent >= 10) return;
  seen.add(key);
  sent++;
  const token = getToken();
  try {
    fetch(`${BASE}/api/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        message,
        stack,
        build: `site-${__BUILD_ID__}`,
        platform: navigator.userAgent.slice(0, 120),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* reporting must never break the page */
  }
}

export function installCrashReporter() {
  window.addEventListener('error', (e) => {
    // A script or image that failed to load fires this too, with no message.
    if (!e.message && !e.error) return;
    report(e.message || String(e.error), e.error?.stack || '');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    report(r?.message || String(r || 'Unhandled promise rejection'), r?.stack || '');
  });
}

export function reportError(err: unknown) {
  const e = err as { message?: string; stack?: string } | null;
  report(e?.message || String(err), e?.stack || '');
}
