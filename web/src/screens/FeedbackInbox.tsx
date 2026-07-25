import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api, ApiError, type FeedbackItem } from '../api';
import { BackButton } from '../ui';

const KIND_STYLE: Record<string, { label: string; color: string }> = {
  bug: { label: 'Bug', color: 'danger' },
  suggestion: { label: 'Suggestion', color: 'indigo' },
  complaint: { label: 'Complaint', color: 'coral' },
  other: { label: 'Other', color: 'blue' },
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function FeedbackInbox() {
  const { go } = useStore();
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .adminFeedback()
      .then((r) => alive && setItems(r.items))
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof ApiError && e.status === 403 ? "You don't have access to this." : 'Could not load feedback.');
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <BackButton onClick={() => go('settings')} />
        <div style={{ flex: 1, fontSize: 24, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)' }}>Feedback</div>
        {items && (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{items.length}</div>
        )}
      </div>

      {error && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text2)', fontSize: 14 }}>{error}</div>
      )}

      {!error && items === null && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text2)', fontSize: 14 }}>Loading…</div>
      )}

      {!error && items && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text2)', fontSize: 14 }}>
          No feedback yet. When your testers send some, it shows up here.
        </div>
      )}

      {!error && items && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((f) => {
            const k = KIND_STYLE[f.kind] || KIND_STYLE.other;
            return (
              <div
                key={f.id}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow)', padding: 16 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: `var(--${k.color})`,
                      background: `color-mix(in srgb,var(--${k.color}) 13%,transparent)`,
                      padding: '3px 9px',
                      borderRadius: 999,
                      textTransform: 'uppercase',
                      letterSpacing: '.04em',
                    }}
                  >
                    {k.label}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{timeAgo(f.createdAt)}</span>
                </div>
                <div style={{ fontSize: 14.5, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{f.message}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 10 }}>
                  {f.name} · {f.email}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
