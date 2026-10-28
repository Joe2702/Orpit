import { useStore } from '../store';
import { money } from '../lib/format';
import { guessFinIcon, FinIcon } from '../lib/iconPaths';
import { isRefund } from '../lib/money';
import { UnsyncedDot } from '../UnsyncedDot';
import type { Txn } from '../types';

// The ledger row and the category lookup it uses, on their own so the Finances
// tab can show recent entries without loading every finance screen with it.

export function fcatByName(fcats: { name: string; icon: string; color: string }[], name: string) {
  return fcats.find((c) => c.name === name) || { ...guessFinIcon(name), name };
}

/**
 * One line of the ledger, the same everywhere it appears.
 *
 * A transfer shows both ends and a neutral colour: it is not a loss, and
 * painting it like an expense is the whole confusion transfers exist to remove.
 * A correction is real money but not an event you did, shown plainly with its
 * direction. A refund says so, so a plus sign on a shop's name isn't a puzzle.
 */
export function TxnRow({ t, onClick, last }: { t: Txn; onClick: () => void; last?: boolean }) {
  const { state } = useStore();
  const accById = Object.fromEntries(state!.accounts.map((a) => [a.id, a]));
  const fc = fcatByName(state!.fcats, t.cat);
  const xfer = !!t.toAccId;
  const adj = t.adjust;
  const refund = isRefund(t);
  const acc = accById[t.accId || '']?.name;
  const sub = xfer
    ? `${accById[t.accId || '']?.name || 'Account'} → ${accById[t.toAccId || '']?.name || 'Account'}`
    : adj
      ? `Balance correction${acc ? ` · ${acc}` : ''}`
      : [refund ? 'Refund' : null, t.cat, acc].filter(Boolean).join(' · ');
  return (
    <div role="button" tabIndex={0} onClick={onClick} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: last ? 'none' : '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}>
      <span style={{ position: 'relative', width: 38, height: 38, borderRadius: 'calc(11px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {xfer ? (
          <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-label="Transfer">
            <path d="M3 7h12M12 4l3 3-3 3M17 13H5M8 10l-3 3 3 3" />
          </svg>
        ) : adj ? (
          <svg width="20" height="20" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-label="Balance correction">
            <path d="M4 13.5a6 6 0 0 1 10-4.4M16 6.5a6 6 0 0 1-10 4.4" />
            <path d="M14 5v4h-4M6 15v-4h4" />
          </svg>
        ) : (
          <FinIcon icon={fc.icon} color="var(--text2)" size={20} />
        )}
        {/* Waiting for a look: the category was a guess. A dot, not a badge,
            so a list with a few of them still reads as a list. */}
        {t.review && (
          <span aria-label="Needs a look" style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: 'var(--indigo)', boxShadow: '0 0 0 2px var(--surface)' }} />
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
          <UnsyncedDot id={t.id} />
          {t.sms && (
            // Read out of a bank message rather than entered. Worth a tag: a
            // machine picked the name and the category, and the user should be
            // able to see at a glance which figures came from that.
            <span
              style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', color: 'var(--indigo)', background: 'color-mix(in srgb,var(--indigo) 14%,transparent)', borderRadius: 5, padding: '2px 5px', flex: 'none' }}
              aria-label="Imported from a bank message"
            >
              SMS
            </span>
          )}
          {t.photo && (
            <svg width="13" height="13" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 1.8, strokeLinejoin: 'round', flex: 'none' }} aria-label="Has a receipt">
              <path d="M1.5 4h2.2l1-1.4h3.6L9.3 4h2.2v7h-10z" />
              <circle cx="6.5" cy="7.4" r="2.1" />
            </svg>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flex: 'none', color: xfer || adj ? 'var(--text2)' : 'var(--text)' }}>
        {(xfer ? '' : t.amount >= 0 ? '+' : '−') + money(t.amount)}
      </div>
    </div>
  );
}
