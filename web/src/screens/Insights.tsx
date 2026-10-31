import React from 'react';
import { useStore } from '../store';
import { BackButton } from '../ui';
import { buildInsights, insightsReady } from '../lib/insights';
import { Glyph } from '../lib/appIcons';
import { t, tk } from '../i18n';

const KIND_LABEL: Record<string, string> = {
  alert: tk('Worth noticing'),
  link: tk('Connection'),
  pattern: tk('Pattern'),
  record: tk('Personal best'),
};

export function Insights() {
  const { go, state } = useStore();
  const insights = buildInsights(state!);
  const ready = insightsReady(state!);

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <BackButton onClick={() => go('analytics')} />
        <div className="display" style={{ flex: 1, minWidth: 0, fontSize: 32, lineHeight: 1.1, color: 'var(--text)' }}>{t('Insights')}</div>
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.5, paddingInlineStart: 2 }}>
        {t('What your habits, training, sleep and spending look like') + ' '}<i>{t('together')}</i>.
      </div>

      {!ready || insights.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <Glyph name="search" size={40} color="var(--text2)" sw={1.6} />
        </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            {ready ? t('Nothing stands out yet') : t('Still gathering data')}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
            {ready
              ? t('Your numbers look steady, with no strong patterns yet. Keep logging and check back.')
              : t('Log for about a week and Orbit will start finding links, like how training affects your sleep, or sleep your spending.')}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {insights.map((it) => (
            <div
              key={it.id}
              style={{
                // Neutral cards, colour only in the icon and label: a column of
                // tinted cards, each a different hue, read as a wall of alerts.
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'calc(20px * var(--sq))',
                boxShadow: 'var(--shadow)',
                padding: '16px 18px',
                display: 'flex',
                gap: 14,
              }}
            >
              <span style={{ flex: 'none', width: 38, height: 38, borderRadius: 'calc(11px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface2)' }}>
                <Glyph name={it.icon} size={21} color="var(--text2)" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: it.kind === 'alert' ? 'var(--danger)' : 'var(--text2)', marginBottom: 4 }}>
                  {t(KIND_LABEL[it.kind])}
                </div>
                <div style={{ fontSize: 16, fontWeight: 650, color: 'var(--text)', lineHeight: 1.35, letterSpacing: '-.01em' }}>{it.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 5, lineHeight: 1.5 }}>{it.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--text2)', textAlign: 'center', marginTop: 22, lineHeight: 1.6, opacity: 0.8 }}>
        {t('These are observations from your own data, not medical or financial advice. Patterns need enough entries before they appear.')}
      </div>
    </div>
  );
}
