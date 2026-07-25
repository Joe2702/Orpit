import React, { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { nativeGoogleAvailable, nativeGoogleSignIn } from './lib/googleAuth';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/** "Continue with Google" — native sign-in inside the app, the official
 *  Google Identity button on the web. Renders nothing if no client ID is set. */
export function GoogleButton() {
  const { googleAuth, showToast } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const native = nativeGoogleAvailable();

  // Web only: render the official Google Identity Services button.
  useEffect(() => {
    if (native || !CLIENT_ID) return;
    let tries = 0;
    const init = () => {
      const g = (window as any).google;
      if (!g?.accounts?.id) {
        if (tries++ < 60) setTimeout(init, 100);
        return;
      }
      g.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (resp: any) => {
          try {
            await googleAuth(resp.credential);
          } catch (e) {
            showToast(e instanceof Error ? e.message : 'Google sign-in failed');
          }
        },
      });
      if (ref.current) {
        ref.current.innerHTML = '';
        g.accounts.id.renderButton(ref.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: 300,
        });
      }
    };
    init();
  }, [googleAuth, showToast, native]);

  if (!CLIENT_ID) return null;

  const signInNative = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const idToken = await nativeGoogleSignIn();
      await googleAuth(idToken);
    } catch (e) {
      // A user closing the sheet throws too — keep quiet on cancels.
      const msg = e instanceof Error ? e.message : 'Google sign-in failed';
      if (!/cancel|closed|dismiss/i.test(msg)) showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 14px', color: 'var(--text2)', fontSize: 12.5 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        or
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      {native ? (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            onClick={signInNative}
            className="press"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 11,
              width: 300,
              height: 48,
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 15,
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            <svg width="19" height="19" viewBox="0 0 18 18" aria-hidden>
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
              <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
            </svg>
            {busy ? 'Signing in…' : 'Continue with Google'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div ref={ref} />
        </div>
      )}
    </div>
  );
}
