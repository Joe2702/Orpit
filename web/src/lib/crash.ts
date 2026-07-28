import { getToken } from '../api';

// Minimal built-in crash reporting. Any unhandled error or promise rejection is
// posted to our own server so it lands in the owner's inbox, instead of
// vanishing silently on a tester's phone. No third-party SDK, no tracking —
// only the error text, the build id and the platform string.

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const seen = new Set<string>();
let sent = 0;

function report(message: string, stack: string) {
  if (!message) return;
  // Don't spam: same error once per session, and cap the total per session.
  const key = message + stack.slice(0, 120);
  if (seen.has(key) || sent >= 10) return;
  seen.add(key);
  sent++;
  const token = getToken();
  try {
    fetch(`${API_BASE}/api/client-error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message,
        stack,
        build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '',
        platform: navigator.userAgent.slice(0, 120),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let reporting break the app */
  }
}

export function installCrashReporter() {
  window.addEventListener('error', (e) => {
    report(e.message || String(e.error || 'Unknown error'), e.error?.stack || '');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    report(r?.message || String(r || 'Unhandled promise rejection'), r?.stack || '');
  });
}

/** Report a caught error explicitly (e.g. from an error boundary). */
export function reportError(err: unknown) {
  const e = err as { message?: string; stack?: string };
  report(e?.message || String(err), e?.stack || '');
}
