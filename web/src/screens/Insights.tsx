import React from 'react';
import { useStore } from '../store';
import { BackButton } from '../ui';
import { buildInsights, insightsReady } from '../lib/insights';
import { Glyph } from '../lib/appIcons';

const KIND_LABEL: Record<string, string> = {
  alert: 'Worth noticing',
  link: 'Connection',
  pattern: 'Pattern',
  record: 'Personal best',
};

export function Insights() {
  const { go, state } = useStore();
  const insights = buildInsights(state!);
  const ready = insightsReady(state!);

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <BackButton onClick={() => go('analytics')} />
        <div style={{ flex: 1, fontSize: 24, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)' }}>Insights</div>
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.5, paddingLeft: 2 }}>
        What your habits, training, sleep and spending look like <i>together</i>.
      </div>

      {!ready || insights.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <Glyph name="search" size={40} color="var(--text2)" sw={1.6} />
        </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            {ready ? 'Nothing stands out yet' : 'Still gathering data'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
            {ready
              ? "Your numbers look steady — no strong patterns to report. Keep logging and check back."
              : 'Log for about a week and Orbit will start connecting the dots — like how training affects your sleep, or how sleep affects your spending.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {insights.map((it) => (
            <div
              key={it.id}
              style={{
                background: `color-mix(in srgb,var(--${it.color}) 9%,var(--surface))`,
                border: `1px solid color-mix(in srgb,var(--${it.color}) 26%,var(--border))`,
                borderRadius: 20,
                boxShadow: 'var(--shadow)',
                padding: '16px 18px',
                display: 'flex',
                gap: 14,
              }}
            >
              <span style={{ flex: 'none', width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb,var(--${it.color}) 14%,transparent)` }}>
                <Glyph name={it.icon} size={21} color={`var(--${it.color})`} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: `var(--${it.color})`, marginBottom: 5 }}>
                  {KIND_LABEL[it.kind]}
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{it.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 5, lineHeight: 1.5 }}>{it.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--text2)', textAlign: 'center', marginTop: 22, lineHeight: 1.6, opacity: 0.8 }}>
        These are observations from your own data, not medical or financial advice.
        Patterns need enough entries before they appear.
      </div>
    </div>
  );
}
