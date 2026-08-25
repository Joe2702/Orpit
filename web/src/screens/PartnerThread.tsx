import React from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { BackButton } from '../ui';
import type { PartnerState, PartnerNote } from '../types';

// The conversation with an accountability partner.
//
// Comments about a tracker and free chat are the same thread, because they are
// the same conversation — "you missed two days" and "how's it going" arrive
// through one screen in the order they were said, with the tracker shown as a
// tag on the messages that have one. Splitting them into separate inboxes would
// make people check two places to find out whether anyone had spoken to them.
//
// Opening from a tracker card pre-addresses the box to that tracker; opening
// from the section header addresses it to the person. Either way the thread
// shown is the whole thread, so nothing is hidden behind a filter.

const MODULE_LABEL: Record<string, string> = {
  habits: 'Habits',
  workouts: 'Workouts',
  sleep: 'Sleep',
  counters: 'Counters',
  finances: 'Finances',
};

export function PartnerThread({ module }: { module: string | null }) {
  const { go, showToast } = useStore();
  const [st, setSt] = React.useState<PartnerState | null>(null);
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [to, setTo] = React.useState<string | null>(module ?? null);
  const endRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    try {
      setSt(await api.partner());
    } catch {
      /* the screen keeps whatever it had; the header still works */
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Mark read on arrival, so the badge on the previous screen clears when the
  // messages have actually been in front of someone.
  React.useEffect(() => {
    api.markPartnerSeen().catch(() => {});
  }, []);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [st?.partner?.notes.length]);

  const p = st?.partner;
  const notes = p?.notes ?? [];

  const canChat = !!p?.chat.open;
  const commentable = (p?.cards ?? []).filter((c) => c.level >= 3).map((c) => c.module);
  const addressable: (string | null)[] = [...(canChat ? [null] : []), ...commentable];
  const canSend = addressable.some((a) => a === to);

  const send = async () => {
    const body = text.trim();
    if (!body || !canSend) return;
    setSending(true);
    try {
      await api.sendPartnerNote({ module: to, body });
      setText('');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not send');
    }
    setSending(false);
  };

  return (
    <div style={{ padding: '6px 20px 20px', animation: 'fadeIn .35s ease', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0 18px' }}>
        <BackButton onClick={() => go('partner')} />
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>
          {p ? p.name.split(' ')[0] : 'Messages'}
        </div>
      </div>

      {notes.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '24px 18px', textAlign: 'center', color: 'var(--text2)', fontSize: 13.5, lineHeight: 1.6 }}>
          Nothing here yet. A short, specific note lands better than a general
          one &mdash; &ldquo;you&rsquo;ve missed two days of workouts&rdquo; beats &ldquo;keep going&rdquo;.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {notes.map((n) => (
            <Bubble key={n.id} n={n} mine={n.mine} />
          ))}
          <div ref={endRef} />
        </div>
      )}

      {/* Composer */}
      <div style={{ position: 'sticky', bottom: 0, paddingTop: 14, marginTop: 14 }}>
        {addressable.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.55 }}>
            You can&rsquo;t send anything yet. {p ? p.name.split(' ')[0] : 'Your partner'} needs to open a tracker for
            comments, or you both need to turn on free chat.
          </div>
        ) : (
          <>
            {/* Where this message is going. Shown always, not just when there is
                a choice: a note that silently attaches itself to a tracker the
                sender didn't mean is a small, confusing kind of wrong. */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
              {addressable.map((a) => {
                const on = a === to;
                return (
                  <div
                    key={a ?? 'chat'}
                    onClick={() => setTo(a)}
                    className="press99"
                    style={{
                      flex: 'none', fontSize: 12.5, fontWeight: 600, padding: '6px 11px', borderRadius: 999, cursor: 'pointer',
                      border: `1.5px solid ${on ? 'var(--indigo)' : 'var(--border)'}`,
                      color: on ? 'var(--indigo)' : 'var(--text2)',
                      background: on ? 'color-mix(in srgb,var(--indigo) 10%,transparent)' : 'var(--surface)',
                    }}
                  >
                    {a === null ? 'Chat' : MODULE_LABEL[a] || a}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end' }}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 500))}
                placeholder={to === null ? 'Message…' : `Note about ${(MODULE_LABEL[to] || to).toLowerCase()}…`}
                rows={1}
                style={{
                  flex: 1, minWidth: 0, minHeight: 48, maxHeight: 120, borderRadius: 16, border: '1px solid var(--border)',
                  background: 'var(--surface)', padding: '13px 15px', fontSize: 15, color: 'var(--text)', outline: 'none',
                  resize: 'none', fontFamily: 'inherit', lineHeight: 1.4,
                }}
              />
              <div
                onClick={text.trim() && !sending ? send : undefined}
                className={text.trim() ? 'press92' : undefined}
                role="button"
                aria-label="Send"
                style={{
                  width: 48, height: 48, borderRadius: 16, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: text.trim() ? 'pointer' : 'default',
                  background: text.trim() ? 'var(--indigo)' : 'color-mix(in srgb,var(--indigo) 35%,var(--surface))',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M3 10h13M11 5l5 5-5 5" />
                </svg>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Bubble({ n, mine }: { n: PartnerNote; mine: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '82%',
          background: mine ? 'var(--indigo)' : 'var(--surface)',
          border: mine ? 'none' : '1px solid var(--border)',
          color: mine ? '#fff' : 'var(--text)',
          borderRadius: 18,
          borderBottomRightRadius: mine ? 6 : 18,
          borderBottomLeftRadius: mine ? 18 : 6,
          padding: '10px 14px',
        }}
      >
        {n.module && (
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', opacity: mine ? 0.75 : 0.6, marginBottom: 3 }}>
            {MODULE_LABEL[n.module] || n.module}
          </div>
        )}
        <div style={{ fontSize: 14.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{n.body}</div>
        <div style={{ fontSize: 10.5, opacity: mine ? 0.7 : 0.55, marginTop: 4, textAlign: 'right' }}>
          {new Date(n.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
