import React from 'react';
import { useStore } from '../store';
import { BackButton } from '../ui';
import { t } from '../i18n';

// A short, readable summary of PRIVACY.md, available inside the app (the app
// stores require the policy to be reachable without leaving the product).
const SECTIONS: { title: string; body: string }[] = [
  {
    title: t('What Orbit stores'),
    body: t('Your email and name, a hashed password (never the original), and the entries you create: habits, check-ins, workouts, sleep, transactions, budgets, goals and counters, plus your settings, like theme, currency and reminder time.'),
  },
  {
    title: t('Bank messages (optional)'),
    body: t('If you turn on Import from SMS, Orbit reads messages from banks and wallets on your phone, never from phone numbers, and ignores one-time passcodes. The text stays on your phone. Only what was read from it is saved to your account: the amount, shop, date, which bank, the last four digits of the card, and the balance the bank reported. Recent bank messages are kept on the phone so you can see where an entry came from. Turn it off any time in Profile.'),
  },
  {
    title: t('Why'),
    body: t('Only to run the app: to sign you in, save and sync your entries across devices, show your statistics and reports, and send the daily reminder if you turn it on.'),
  },
  {
    title: t('What Orbit does NOT do'),
    body: t('No advertising or third-party analytics SDKs. No location tracking. No access to your contacts, photos or other apps. Your data is never sold or shared with advertisers.'),
  },
  {
    title: t('Crash reports'),
    body: t('If the app hits an unexpected error, it sends the error text, the build number and your device\'s browser/OS string so the bug can be fixed. That\'s it. It isn\'t used to track you.'),
  },
  {
    title: t('Usage counts'),
    body: t('How many times a day features are used, like "opened the app" or "checked a habit", so we can see whether Orbit helps people keep going. Never what you entered. Turn it off in Profile → Data, which also deletes what was counted.'),
  },
  {
    title: t('Who processes it'),
    body: t('Ordinary infrastructure providers acting on our behalf: Render (hosting), Neon (database), Brevo (password-reset and feedback email), and Google, only if you choose Sign in with Google.'),
  },
  {
    title: t('Your control'),
    body: t('Export everything as JSON, erase all your entries, or permanently delete your account, all from the Profile screen. Deleting your account removes your data from the live database immediately.'),
  },
  {
    title: t('Security'),
    body: t('Traffic is encrypted over HTTPS, passwords are hashed with bcrypt, and sign-in uses time-limited tokens. Please still use a strong, unique password.'),
  },
  {
    title: t('Questions'),
    body: t('Contact youssif_mohammed@aucegypt.edu for any privacy question or request.'),
  },
];

export function Privacy() {
  const { go } = useStore();
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <BackButton onClick={() => go('settings')} />
        <div className="display" style={{ flex: 1, minWidth: 0, fontSize: 32, lineHeight: 1.1, color: 'var(--text)' }}>{t('Privacy')}</div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18, lineHeight: 1.5 }}>
        {t('The short version of how Orbit handles your data.')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SECTIONS.map((s) => (
          <div key={s.title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{s.title}</div>
            <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.6 }}>{s.body}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', marginTop: 20, lineHeight: 1.5 }}>
        {t('Last updated 28 October 2026')}
      </div>
    </div>
  );
}
