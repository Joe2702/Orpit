import React, { useEffect, useRef } from 'react';
import { useStore } from './store';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/** "Continue with Google" — only renders when a Google client ID is configured. */
export function GoogleButton() {
  const { googleAuth, showToast } = useStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
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
  }, [googleAuth, showToast]);

  if (!CLIENT_ID) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 14px', color: 'var(--text2)', fontSize: 12.5 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        or
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div ref={ref} />
      </div>
    </div>
  );
}
