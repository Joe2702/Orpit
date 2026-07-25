import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';

const KINDS: [string, string][] = [
  ['suggestion', 'Suggestion'],
  ['bug', 'Bug'],
  ['complaint', 'Complaint'],
  ['other', 'Other'],
];

export function FeedbackSheet() {
  const { closeSheet, showToast, haptic } = useStore();
  const [kind, setKind] = useState('suggestion');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const canSend = !!message.trim() && !busy;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    haptic();
    try {
      await api.sendFeedback(kind, message.trim());
      showToast('Thanks — feedback sent 💙');
      closeSheet();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not send');
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 0 6px' }}>Send feedback</div>
      <div style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.5 }}>
        Ideas, bugs, or anything on your mind — it goes straight to the team.
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Type</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
        {KINDS.map(([val, label]) => {
          const active = kind === val;
          return (
            <div
              key={val}
              onClick={() => setKind(val)}
              style={{
                padding: '9px 15px',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                border: `1.5px solid ${active ? 'var(--indigo)' : 'var(--border)'}`,
                background: active ? 'color-mix(in srgb,var(--indigo) 14%,transparent)' : 'var(--surface)',
                color: active ? 'var(--indigo)' : 'var(--text2)',
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Message</div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Tell us what's on your mind…"
        rows={5}
        style={{ width: '100%', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)', padding: '13px 15px', fontSize: 15, color: 'var(--text)', outline: 'none', resize: 'none', marginBottom: 22, lineHeight: 1.5 }}
      />

      <div
        onClick={send}
        className="press"
        style={{ background: canSend ? 'var(--indigo)' : 'color-mix(in srgb,var(--indigo) 40%,var(--surface))', color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: canSend ? 'pointer' : 'default' }}
      >
        {busy ? 'Sending…' : 'Send feedback'}
      </div>
    </div>
  );
}
