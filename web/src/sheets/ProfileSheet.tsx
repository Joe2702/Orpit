import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { avatarInitial } from '../ui';

export function ProfileSheet() {
  const { state, closeSheet, mutate, haptic } = useStore();
  const [name, setName] = useState(state!.profile.name);
  const [email, setEmail] = useState(state!.profile.email);
  const canSave = !!name.trim();

  const save = async () => {
    if (!canSave) return;
    haptic();
    await mutate(() => api.updateMe({ name: name.trim(), email: email.trim() }), 'Profile updated');
    closeSheet();
  };

  const input: React.CSSProperties = {
    width: '100%',
    height: 52,
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    padding: '0 16px',
    fontSize: 15,
    color: 'var(--text)',
    outline: 'none',
    marginBottom: 18,
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 0 20px' }}>Edit profile</div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
        <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 30 }}>
          {avatarInitial(name)}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Name</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={input} />
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Email</div>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ ...input, marginBottom: 24 }} />
      <div
        onClick={save}
        style={{ background: canSave ? 'var(--indigo)' : 'color-mix(in srgb,var(--indigo) 40%,var(--surface))', color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: canSave ? 'pointer' : 'default', letterSpacing: '-.01em' }}
      >
        Save profile
      </div>
    </div>
  );
}
