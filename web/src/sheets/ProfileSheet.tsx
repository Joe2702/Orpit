import React, { useRef, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { Avatar } from '../ui';

// Shrink whatever the user picks down to a small square so it stores/loads fast.
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Image not supported'));
        // Cover-crop to a centered square.
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ProfileSheet() {
  const { state, closeSheet, mutate, showToast, haptic } = useStore();
  const [name, setName] = useState(state!.profile.name);
  const [email, setEmail] = useState(state!.profile.email);
  const [avatar, setAvatar] = useState<string | null>(state!.profile.avatar);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canSave = !!name.trim();

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    try {
      setBusy(true);
      const data = await fileToAvatar(file);
      setAvatar(data);
      haptic();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not use that image');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!canSave) return;
    haptic();
    await mutate(
      () => api.updateMe({ name: name.trim(), email: email.trim(), avatar }),
      'Profile updated'
    );
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

      <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{ display: 'none' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ position: 'relative' }} onClick={() => !busy && fileRef.current?.click()}>
          <Avatar name={name} src={avatar} size={84} />
          <div style={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: '50%', background: 'var(--indigo)', border: '3px solid var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="15" height="15" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M2 5.5h2.2l1-1.5h3.6l1 1.5H13v6.5H2Z" />
              <circle cx="7.5" cy="8.3" r="2.1" />
            </svg>
          </div>
        </div>
        <div
          onClick={() => !busy && fileRef.current?.click()}
          style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--indigo)', marginTop: 12, cursor: 'pointer' }}
        >
          {busy ? 'Processing…' : avatar ? 'Change photo' : 'Add a photo'}
        </div>
        {avatar && !busy && (
          <div onClick={() => setAvatar(null)} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginTop: 6, cursor: 'pointer' }}>
            Remove photo
          </div>
        )}
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
