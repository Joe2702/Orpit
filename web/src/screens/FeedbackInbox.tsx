import React, { useState } from 'react';
import { useStore } from '../store';
import { api, ApiError, type AdminMetrics, type FeedbackItem, type ClientErrorItem } from '../api';
import { BackButton } from '../ui';
import { Glyph } from '../lib/appIcons';
import { t } from '../i18n';

const KIND_STYLE: Record<string, { label: string; color: string }> = {
  bug: { label: t('Bug'), color: 'danger' },
  suggestion: { label: t('Suggestion'), color: 'indigo' },
  complaint: { label: t('Complaint'), color: 'coral' },
  other: { label: t('Other'), color: 'blue' },
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
  const [errors, setErrors] = useState<ClientErrorItem[]>([]);
  const [tab, setTab] = useState<'feedback' | 'crashes' | 'usage' | 'formats'>('feedback');
  const [formats, setFormats] = useState<{ id: string; sender: string; text: string; reason: string; createdAt: string }[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = () => {
    if (!password || checking) return;
    setChecking(true);
    setError(null);
    api
      .adminFeedback(password)
      .then((r) => {
        setItems(r.items);
        setUnlocked(true);
        // Crash reports live behind the same password.
        api.adminErrors(password).then((e) => setErrors(e.items)).catch(() => {});
        api.adminMetrics(password).then(setMetrics).catch(() => {});
        api.adminSmsSamples(password).then((r) => setFormats(r.items)).catch(() => {});
      })
      .catch((e) =>
        setError(
          e instanceof ApiError && e.status === 403
            ? t('Wrong password.')
            : e instanceof ApiError && e.status === 503
            ? t('Not configured. Set ADMIN_PASSWORD on the server.')
            : t('Could not load feedback.')
        )
      )
      .finally(() => setChecking(false));
  };

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <BackButton onClick={() => go('settings')} />
        <div className="display" style={{ flex: 1, minWidth: 0, fontSize: 32, lineHeight: 1.1, color: 'var(--text)' }}>{t('Feedback')}</div>
        {unlocked && items && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{items.length}</div>}
      </div>

      {!unlocked ? (
        <div style={{ padding: '30px 4px' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <Glyph name="lock" size={38} color="var(--text2)" sw={1.6} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{t('Enter password')}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{t('This inbox is protected.')}</div>
          </div>
          <input
            type="password"
            inputMode="numeric"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={t('Password')}
            style={{ width: '100%', height: 52, borderRadius: 'calc(14px * var(--sq))', border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`, background: 'var(--bg)', padding: '0 16px', fontSize: 16, color: 'var(--text)', outline: 'none', marginBottom: 12 }}
          />
          {error && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12, textAlign: 'center' }}>{error}</div>}
          <div role="button" tabIndex={0}
            onClick={submit}
            className="press"
            style={{ background: password ? 'var(--indigo)' : 'color-mix(in srgb,var(--indigo) 40%,var(--surface))', color: 'var(--on-accent)', height: 52, borderRadius: 'calc(14px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, cursor: password ? 'pointer' : 'default' }}
          >
            {checking ? t('Checking…') : t('Unlock')}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: 3, marginBottom: 18 }}>
            {([['feedback', `Feedback (${items?.length ?? 0})`], ['crashes', `Crashes (${errors.length})`], ['usage', 'Usage'], ['formats', `Formats (${formats.length})`]] as const).map(([k, label]) => (
              <div tabIndex={0}
                key={k}
                onClick={() => setTab(k)}
                role="tab"
                aria-selected={tab === k}
                style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 'calc(11px * var(--sq))', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', ...(tab === k ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(20,21,26,.12)' } : { color: 'var(--text2)' }) }}
              >
                {label}
              </div>
            ))}
          </div>

          {tab === 'formats' ? (
            // Bank messages people couldn't get read, masked on their phones,
            // for teaching the reader new banks (web/src/lib/smsParse.ts).
            formats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text2)', fontSize: 14 }}>{t('No formats sent yet.')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {formats.map((f) => (
                  <div key={f.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: 16 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{f.sender}</span>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{f.reason === 'no-verb' ? t('direction unclear') : t('no amount found')}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{timeAgo(new Date(f.createdAt).getTime())}</span>
                    </div>
                    <div dir="auto" style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5, overflowWrap: 'anywhere', fontFamily: 'ui-monospace, monospace' }}>{f.text}</div>
                  </div>
                ))}
              </div>
            )
          ) : tab === 'usage' ? (
            <UsagePanel m={metrics} />
          ) : tab === 'crashes' ? (
            errors.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text2)', fontSize: 14 }}>
                {t('No crashes reported.')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {errors.map((e) => (
                  <div key={e.id} style={{ background: 'var(--surface)', border: '1px solid color-mix(in srgb,var(--danger) 25%,var(--border))', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', background: 'color-mix(in srgb,var(--danger) 13%,transparent)', padding: '3px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t('Crash')}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{timeAgo(e.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'break-word' }}>{e.message}</div>
                    {e.stack && (
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', background: 'var(--bg)', borderRadius: 'calc(10px * var(--sq))', padding: 10 }}>
                        {e.stack}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                      {t('{email} · build {n}', { email: e.email, n: e.build || '—' })}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : items && items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text2)', fontSize: 14 }}>
              {t('No feedback yet. When your testers send some, it shows up here.')}
            </div>
          ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items!.map((f) => {
            const k = KIND_STYLE[f.kind] || KIND_STYLE.other;
            return (
              <div
                key={f.id}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: 16 }}
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
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{timeAgo(new Date(f.createdAt).getTime())}</span>
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
        </>
      )}
    </div>
  );
}

const FEATURE: Record<string, string> = {
  open: 'Opened the app',
  habit_check: 'Checked a habit',
  workout_add: 'Logged a workout',
  sleep_add: 'Logged sleep',
  txn_add: 'Added a payment',
  sms_import: 'Bank messages imported',
  review_answer: 'Answered a review',
  week_review: 'Did the weekly review',
  bank_on: 'Turned on bank tracking',
  budget_alert: 'Got a budget alert',
  report_view: 'Opened a report',
  partner_open: 'Opened partner',
  brief_open: 'Read the morning brief',
};

/**
 * Whether people come back, and what they do when they do. Counts only, from
 * the usage table: no one's entries are visible here.
 */
function UsagePanel({ m }: { m: AdminMetrics | null }) {
  if (!m) return <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text2)', fontSize: 14 }}>{t('Loading…')}</div>;
  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: 16, marginBottom: 14 };
  const head = (t: string) => <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{t}</div>;
  const pct = (v: number | null) => (v == null ? '·' : `${v}%`);
  return (
    <>
      <div style={card}>
        {head('Active people')}
        <div style={{ display: 'flex', gap: 10 }}>
          {([['Today', m.active?.d1], ['7 days', m.active?.d7], ['30 days', m.active?.d30], ['Accounts', m.active?.users]] as const).map(([l, v]) => (
            <div key={l} style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v ?? 0}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={card}>
        {head('Coming back, by signup week')}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .8fr .8fr .8fr .8fr', rowGap: 8, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {['Week of', 'New', 'Day 1', 'Week 1', 'Day 30'].map((h) => (
            <div key={h} style={{ color: 'var(--text3)', fontWeight: 600 }}>{h}</div>
          ))}
          {m.cohorts.map((c) => (
            <React.Fragment key={c.week}>
              <div style={{ color: 'var(--text)' }}>{new Date(c.week + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              <div style={{ color: 'var(--text)' }}>{c.users}</div>
              <div style={{ color: 'var(--text)' }}>{pct(c.d1)}</div>
              <div style={{ color: 'var(--text)' }}>{pct(c.w1)}</div>
              <div style={{ color: 'var(--text)' }}>{pct(c.d30)}</div>
            </React.Fragment>
          ))}
        </div>
        {m.cohorts.length === 0 && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('No signups in the last 8 weeks.')}</div>}
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
          {t('Share of each week’s new people who opened the app again the next day, in their second week, and around day 30. Health and fitness apps typically keep 3–8% at day 30.')}
        </div>
      </div>
      <div style={card}>
        {head('Last 30 days')}
        {m.features.map((f) => (
          <div key={f.name} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '6px 0', borderTop: '1px solid var(--hairline)', fontSize: 13.5 }}>
            <span style={{ flex: 1, color: 'var(--text)' }}>{FEATURE[f.name] || f.name}</span>
            <span style={{ color: 'var(--text2)' }}>{f.users} {f.users === 1 ? 'person' : 'people'}</span>
            <span style={{ color: 'var(--text3)', minWidth: 52, textAlign: 'end' }}>{f.total.toLocaleString('en-US')}×</span>
          </div>
        ))}
      </div>
    </>
  );
}
