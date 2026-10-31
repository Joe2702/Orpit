import React from 'react';
import { useStore } from '../store';
import type { BankFound } from '../lib/bankTracking';
import { t, tn } from '../i18n';

/**
 * What the first look through the inbox found. The moment bank tracking pays
 * off is seeing three months of spending appear without typing any of it; a
 * toast would let that pass unnoticed.
 */
export function SmsFoundSheet() {
  const { sheetData, closeSheet, go } = useStore();
  const f: BankFound = sheetData || { added: 0, accounts: [], review: 0 };
  const nothing = f.added === 0;

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <div className="display" style={{ fontSize: 34, lineHeight: 1.1, color: 'var(--text)', margin: '6px 0 8px' }}>
        {nothing ? t('All set') : tn(f.added, '{n} payment found', '{n} payments found')}
      </div>
      <div style={{ fontSize: 14.5, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 20 }}>
        {nothing
          ? t('No bank messages from the last 90 days yet. New payments will appear here as your bank sends them.')
          : t('From the last 90 days of your bank messages, sorted into accounts and categories. New ones will come in as they arrive.')}
      </div>

      {f.accounts.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'calc(16px * var(--sq))', overflow: 'hidden', marginBottom: 14 }}>
          {f.accounts.map((name, i) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--indigo)', flex: 'none' }} />
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{name}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text3)' }}>{t('balance from your bank')}</span>
            </div>
          ))}
        </div>
      )}

      {f.review > 0 && (
        <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 20 }}>
          {tn(f.review, 'One needs a quick look: Orbit wasn’t sure what it was.', '{n} need a quick look: Orbit wasn’t sure what they were.')}
        </div>
      )}

      <div tabIndex={0}
        onClick={() => {
          closeSheet();
          go(f.review > 0 ? 'freview' : 'finances');
        }}
        className="press"
        role="button"
        style={{ background: 'var(--indigo)', color: 'var(--on-accent)', height: 54, borderRadius: 'calc(16px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
      >
        {f.review > 0 ? t('Take a look') : t('See my money')}
      </div>
    </div>
  );
}
