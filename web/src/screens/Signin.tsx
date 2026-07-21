import React, { useState } from 'react';
import { useStore } from '../store';
import { BackButton } from '../ui';

export function Signin() {
  const { go, authMode, setAuthMode, login, signup } = useStore();
  const signUp = authMode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      if (signUp) await signup(email.trim(), password, name.trim());
      else await login(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 52,
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    padding: '0 16px',
    fontSize: 16,
    color: 'var(--text)',
    outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    color: 'var(--text2)',
    marginBottom: 8,
  };

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '6px 28px 36px', animation: 'fadeUp .4s ease' }}>
      <BackButton onClick={() => go('welcome')} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)' }}>
          {signUp ? 'Create your account' : 'Welcome back'}
        </div>
        <div style={{ fontSize: 15, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>
          {signUp ? 'Start tracking in seconds.' : 'Sign in to pick up where you left off.'}
        </div>

        {signUp && (
          <div style={{ marginTop: 30 }}>
            <div style={labelStyle}>Name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              style={inputStyle}
            />
          </div>
        )}

        <div style={{ marginTop: signUp ? 16 : 30 }}>
          <div style={labelStyle}>Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={labelStyle}>Password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={signUp ? 'At least 6 characters' : 'Your password'}
            style={inputStyle}
          />
        </div>

        {error && (
          <div style={{ marginTop: 14, fontSize: 13.5, fontWeight: 500, color: 'var(--danger)' }}>{error}</div>
        )}

        <div
          onClick={busy ? undefined : submit}
          className="press"
          style={{
            background: 'var(--indigo)',
            color: '#fff',
            height: 54,
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
            marginTop: 18,
            opacity: busy ? 0.7 : 1,
            boxShadow: '0 8px 20px -10px rgba(40,36,28,.26)',
          }}
        >
          {busy ? 'Please wait…' : signUp ? 'Create account' : 'Continue'}
        </div>
      </div>
      <div
        onClick={() => {
          setAuthMode(signUp ? 'signin' : 'signup');
          setError('');
        }}
        style={{ textAlign: 'center', fontSize: 14, color: 'var(--text2)', padding: 8, cursor: 'pointer' }}
      >
        {signUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </div>
    </div>
  );
}
