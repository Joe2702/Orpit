import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { CODES, POPULAR, currencyFlag, currencyName, currencySymbol, searchCurrencies } from '../lib/currencies';
import { getLang, t } from '../i18n';

/**
 * Every currency in circulation: the usual few up top as tiles, then the
 * rest A to Z (by name, in the reader's language), with a search that knows
 * codes, names in English and Arabic, and symbols.
 */
export function CurrencySheet() {
  const { state, mutateOpt, haptic, closeSheet, showToast } = useStore();
  const lang = getLang() === 'ar' ? 'ar' : 'en';
  const current = state!.profile.currency || 'EGP';
  const [q, setQ] = useState('');

  const all = useMemo(() => [...CODES].sort((a, b) => currencyName(a, lang).localeCompare(currencyName(b, lang), lang)), [lang]);
  const found = useMemo(() => (q.trim() ? searchCurrencies(q) : all), [q, all]);

  const choose = (code: string) => {
    haptic(12);
    if (code !== current) {
      mutateOpt((s) => ({ ...s, profile: { ...s.profile, currency: code } }), () => api.updateMe({ currency: code })).catch(() => {});
      showToast(t('Amounts now show in {name}', { name: currencyName(code, lang) }));
    }
    closeSheet();
  };

  const sym = (c: string) => currencySymbol(c, lang).trim();

  return (
    <div style={{ padding: '6px 0 30px', minHeight: '72vh' }}>
      <div style={{ padding: '0 20px' }}>
        <div className="display" style={{ fontSize: 30, lineHeight: 1.1, color: 'var(--text)', margin: '6px 2px 8px' }}>{t('Currency')}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5, margin: '0 2px 14px' }}>
          {t('Amounts across Orbit show in it. Payments in other currencies are converted at the day’s rate; changing it relabels what you’ve logged rather than converting it.')}
        </div>
      </div>

      {/* The search stays put while the list scrolls under it. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 2, padding: '8px 20px 10px', background: 'var(--glass-bg-strong)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div style={{ position: 'relative' }}>
          <svg width="17" height="17" aria-hidden style={{ position: 'absolute', insetInlineStart: 14, top: 16, fill: 'none', stroke: 'var(--text3)', strokeWidth: 2, strokeLinecap: 'round' }}>
            <circle cx="7.5" cy="7.5" r="5" />
            <path d="M11.5 11.5l3.5 3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Search 150+ currencies')}
            aria-label={t('Search currencies')}
            spellCheck={false}
            autoCorrect="off"
            style={{ width: '100%', height: 48, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', paddingInlineStart: 40, paddingInlineEnd: 14, fontSize: 15.5, color: 'var(--text)', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {!q.trim() && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '12px 2px 9px' }}>{t('Popular')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 20 }}>
              {POPULAR.map((c, k) => {
                const on = c === current;
                return (
                  <div
                    key={c}
                    role="button"
                    tabIndex={0}
                    aria-pressed={on}
                    aria-label={currencyName(c, lang)}
                    onClick={() => choose(c)}
                    className="press96"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 3,
                      padding: '11px 4px 9px',
                      borderRadius: 'calc(16px * var(--sq))',
                      cursor: 'pointer',
                      background: on ? 'var(--indigo)' : 'var(--surface)',
                      color: on ? 'var(--on-accent)' : 'var(--text)',
                      border: on ? '1px solid transparent' : '1px solid var(--border)',
                      boxShadow: on ? '0 8px 20px -10px var(--indigo)' : 'none',
                      animation: `storyRise .4s cubic-bezier(.2,.8,.2,1) ${k * 0.03}s both`,
                      transition: 'background .2s, color .2s',
                    }}
                  >
                    <span style={{ fontSize: 22, lineHeight: 1 }}>{currencyFlag(c)}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>{c}</span>
                    <span style={{ fontSize: 11.5, opacity: 0.7, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sym(c)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '0 2px 9px' }}>{t('All currencies')}</div>
          </>
        )}

        {found.length === 0 ? (
          <div style={{ textAlign: 'center', fontSize: 14.5, color: 'var(--text2)', padding: '36px 0' }}>{t('No currency matches “{q}”', { q: q.trim() })}</div>
        ) : (
          <div role="listbox" aria-label={t('All currencies')} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', overflow: 'hidden', marginTop: q.trim() ? 12 : 0 }}>
            {found.map((c, k) => {
              const on = c === current;
              return (
                <div
                  key={c}
                  role="option"
                  aria-selected={on}
                  tabIndex={0}
                  onClick={() => choose(c)}
                  onKeyDown={(e) => e.key === 'Enter' && choose(c)}
                  className="pressRow"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderTop: k ? '1px solid var(--hairline)' : 'none', cursor: 'pointer' }}
                >
                  <span aria-hidden style={{ fontSize: 24, lineHeight: 1, width: 30, textAlign: 'center', flex: 'none' }}>
                    {currencyFlag(c)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: on ? 700 : 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currencyName(c, lang)}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
                      <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{c}</span>
                      {sym(c) !== c && <span> · {sym(c)}</span>}
                    </div>
                  </div>
                  {on && (
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden style={{ flex: 'none', fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
