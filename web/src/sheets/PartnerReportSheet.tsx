import React from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { REPORT_REASONS } from '../lib/partner';

/**
 * Reporting an accountability partner.
 *
 * Two decisions worth naming.
 *
 * The reasons are a fixed list rather than a free-text box alone, because a
 * report that has to be read before it can be triaged is a report that waits.
 * The box is still there underneath for the detail only the reporter knows.
 *
 * Reporting always ends the partnership, and the sheet says so before the
 * button rather than asking afterwards. "You said this person harassed you —
 * would you also like to stop being partners?" is a question with one sensible
 * answer, and asking it makes someone say it twice.
 */
export function PartnerReportSheet({ name, reload }: { name: string; reload: () => void }) {
  const { closeSheet, showToast } = useStore();
  const [reason, setReason] = React.useState<string>('');
  const [detail, setDetail] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await api.reportPartner({ reason, detail: detail.trim() || undefined });
      closeSheet();
      showToast('Report sent. You are no longer partners.');
      reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not send that');
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '4px 20px 28px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 0 6px' }}>
        Report {name.split(' ')[0]}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 20 }}>
        This goes to Orbit for review, along with a copy of your messages. You will stop being partners straight away
        and will not be matched with each other again.
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>What happened?</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {REPORT_REASONS.map((r) => {
          const on = reason === r.key;
          return (
            <div
              key={r.key}
              onClick={() => setReason(r.key)}
              className="press99"
              role="button"
              style={{
                border: `1.5px solid ${on ? 'var(--danger)' : 'var(--border)'}`,
                background: on ? 'color-mix(in srgb,var(--danger) 9%,transparent)' : 'var(--bg)',
                color: on ? 'var(--danger)' : 'var(--text)',
                borderRadius: 13, padding: '13px 14px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {r.label}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>
        Anything else? (optional)
      </div>
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value.slice(0, 2000))}
        placeholder="What you'd like us to know"
        rows={4}
        style={{
          width: '100%', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)',
          padding: '13px 15px', fontSize: 15, color: 'var(--text)', outline: 'none', resize: 'none',
          fontFamily: 'inherit', lineHeight: 1.45, marginBottom: 22,
        }}
      />

      <div
        onClick={reason && !busy ? send : undefined}
        className={reason ? 'press99' : undefined}
        role="button"
        aria-disabled={!reason}
        style={{
          height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, color: '#fff', cursor: reason ? 'pointer' : 'default',
          background: reason ? 'var(--danger)' : 'color-mix(in srgb,var(--danger) 40%,var(--surface))',
        }}
      >
        {busy ? 'Sending…' : 'Send report and end partnership'}
      </div>
    </div>
  );
}
