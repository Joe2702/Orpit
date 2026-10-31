import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { BackButton } from '../ui';
import { t } from '../i18n';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 52,
  borderRadius: 'calc(14px * var(--sq))',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  padding: '0 16px',
  fontSize: 16,
  color: 'var(--text)',
  outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  color: 'var(--text2)',
  marginBottom: 8,
};
const cta = (busy: boolean): React.CSSProperties => ({
  background: 'var(--indigo)',
  color: '#fff',
  height: 54,
  borderRadius: 'calc(16px * var(--sq))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
  fontWeight: 600,
  cursor: busy ? 'default' : 'pointer',
  marginTop: 18,
  opacity: busy ? 0.7 : 1,
  boxShadow: '0 8px 20px -10px rgba(40,36,28,.26)',
});

export function Forgot() {
  const { go } = useStore();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await api.requestReset(email.trim());
    } catch {
      /* always show the same message */
    }
    setBusy(false);
    setSent(true);
  };

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '6px 28px 36px', animation: 'fadeUp .4s ease' }}>
      <BackButton onClick={() => go('signin')} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)' }}>{t('Reset password')}</div>
        {sent ? (
          <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 12, lineHeight: 1.6 }}>
            {t('If an account exists for') + ' '}<b style={{ color: 'var(--text)' }}>{email.trim()}</b>{t(', a reset link is on its way. Check your inbox (and spam). The link works for 1 hour.')}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>
              {t('Enter your email and we\'ll send you a link to set a new password.')}
            </div>
            <div style={{ marginTop: 30 }}>
              <div style={labelStyle}>{t('Email')}</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder={t('you@example.com')}
                style={inputStyle}
              />
            </div>
            <div role="button" tabIndex={0} onClick={busy ? undefined : submit} className="press" style={cta(busy)}>
              {busy ? t('Sending…') : t('Send reset link')}
            </div>
          </>
        )}
      </div>
      <div role="button" tabIndex={0} onClick={() => go('signin')} style={{ textAlign: 'center', fontSize: 14, color: 'var(--text2)', padding: 8, cursor: 'pointer' }}>
        {t('Back to sign in')}
      </div>
    </div>
  );
}

export function Reset() {
  const { screenData, go, resetPassword } = useStore();
  const token: string | undefined = screenData?.token;
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (password.length < 6) {
      setError(t('Password must be at least 6 characters'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      await resetPassword(token!, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not reset password'));
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '6px 28px 36px', animation: 'fadeUp .4s ease' }}>
      <BackButton onClick={() => go('signin')} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)' }}>{t('Set a new password')}</div>
        {!token ? (
          <div style={{ fontSize: 15, color: 'var(--danger)', marginTop: 12 }}>{t('This reset link is invalid. Request a new one.')}</div>
        ) : (
          <>
            <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>{t('Choose a new password for your account.')}</div>
            <div style={{ marginTop: 30 }}>
              <div style={labelStyle}>{t('New password')}</div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder={t('At least 6 characters')}
                  style={{ ...inputStyle, paddingInlineEnd: 48 }}
                />
                <div role="button" tabIndex={0} onClick={() => setShowPw((s) => !s)} style={{ position: 'absolute', insetInlineEnd: 6, top: 0, height: 52, width: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <svg width="22" height="22" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    {showPw ? (
                      <path d="M3 3l16 16M9.5 5.2A6.8 6.8 0 0 1 11 5c5 0 8 6 8 6a13 13 0 0 1-2.2 2.8M6.2 6.2A13 13 0 0 0 3 11s3 6 8 6a6.8 6.8 0 0 0 3.3-.8M9.5 9.5a2.2 2.2 0 0 0 3 3" />
                    ) : (
                      <>
                        <path d="M3 11s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z" />
                        <circle cx="11" cy="11" r="2.4" />
                      </>
                    )}
                  </svg>
                </div>
              </div>
            </div>
            {error && <div style={{ marginTop: 14, fontSize: 13.5, fontWeight: 500, color: 'var(--danger)' }}>{error}</div>}
            <div role="button" tabIndex={0} onClick={busy ? undefined : submit} className="press" style={cta(busy)}>
              {busy ? t('Saving…') : t('Save new password')}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
