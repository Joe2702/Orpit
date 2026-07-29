import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { api, getToken } from '../api';

// Landing page for the /verify?token=… link from the confirmation email.
//
// The confirm endpoint is public, so this works whether or not the link is
// opened on the device that's signed in. If there is a session, the state is
// reloaded on the way out so the "confirm your email" banner disappears.

export function VerifyEmail() {
  const { screenData, go, applyState } = useStore();
  const token: string | undefined = screenData?.token;
  const [status, setStatus] = useState<'working' | 'ok' | 'bad'>(token ? 'working' : 'bad');
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // a single-use token must not be spent twice
    api
      .confirmEmail(token)
      .then(() => setStatus('ok'))
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'That link could not be used');
        setStatus('bad');
      });
  }, [token]);

  const done = async () => {
    if (getToken()) {
      try {
        applyState(await api.getState());
        window.history.replaceState({}, '', '/');
        go('home');
        return;
      } catch {
        /* server asleep — fall through to a clean reload */
      }
    }
    window.location.href = '/';
  };

  const icon =
    status === 'ok' ? (
      <svg width="30" height="30" style={{ fill: 'none', stroke: 'var(--success)', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
        <path d="M6 15.5l6 6 12-13" />
      </svg>
    ) : status === 'bad' ? (
      <svg width="30" height="30" style={{ fill: 'none', stroke: 'var(--danger)', strokeWidth: 2.6, strokeLinecap: 'round' }}>
        <path d="M8 8l14 14M22 8L8 22" />
      </svg>
    ) : null;

  return (
    <div style={{ padding: '60px 24px', textAlign: 'center', animation: 'fadeIn .35s ease' }}>
      <div style={{ width: 66, height: 66, borderRadius: '50%', margin: '0 auto 22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: status === 'ok' ? 'color-mix(in srgb,var(--success) 14%,transparent)' : status === 'bad' ? 'color-mix(in srgb,var(--danger) 12%,transparent)' : 'var(--bg)' }}>
        {icon}
      </div>
      <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', marginBottom: 10 }}>
        {status === 'working' ? 'Confirming…' : status === 'ok' ? 'Email confirmed' : "That link didn't work"}
      </div>
      <div style={{ fontSize: 14.5, color: 'var(--text2)', lineHeight: 1.55, maxWidth: 300, margin: '0 auto 28px' }}>
        {status === 'working'
          ? 'One moment.'
          : status === 'ok'
          ? 'You can now reset your password by email if you ever need to.'
          : error || 'The link may have expired. Open Orbit and send yourself a fresh one.'}
      </div>
      {status !== 'working' && (
        <div onClick={done} className="press" role="button" style={{ display: 'inline-flex', alignItems: 'center', height: 52, padding: '0 30px', borderRadius: 16, background: 'var(--indigo)', color: '#fff', fontSize: 15.5, fontWeight: 700, cursor: 'pointer' }}>
          Open Orbit
        </div>
      )}
    </div>
  );
}
