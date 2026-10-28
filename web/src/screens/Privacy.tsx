import React from 'react';
import { useStore } from '../store';
import { BackButton } from '../ui';

// A short, readable summary of PRIVACY.md, available inside the app (the app
// stores require the policy to be reachable without leaving the product).
const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What Orbit stores',
    body: 'Your email and name, a hashed password (never the original), and the entries you create: habits, check-ins, workouts, sleep, transactions, budgets, goals and counters, plus your settings, like theme, currency and reminder time.',
  },
  {
    title: 'Bank messages (optional)',
    body: 'If you turn on Import from SMS, Orbit reads messages from banks and wallets on your phone, never from phone numbers, and ignores one-time passcodes. The text stays on your phone. Only what was read from it is saved to your account: the amount, shop, date, which bank, the last four digits of the card, and the balance the bank reported. Recent bank messages are kept on the phone so you can see where an entry came from. Turn it off any time in Profile.',
  },
  {
    title: 'Why',
    body: 'Only to run the app: to sign you in, save and sync your entries across devices, show your statistics and reports, and send the daily reminder if you turn it on.',
  },
  {
    title: 'What Orbit does NOT do',
    body: 'No advertising or analytics SDKs. No location tracking. No access to your contacts, photos or other apps. Your data is never sold or shared with advertisers.',
  },
  {
    title: 'Crash reports',
    body: "If the app hits an unexpected error, it sends the error text, the build number and your device's browser/OS string so the bug can be fixed. That's it. It isn't used to track you.",
  },
  {
    title: 'Who processes it',
    body: 'Ordinary infrastructure providers acting on our behalf: Render (hosting), Neon (database), Brevo (password-reset and feedback email), and Google, only if you choose Sign in with Google.',
  },
  {
    title: 'Your control',
    body: 'Export everything as JSON, erase all your entries, or permanently delete your account, all from the Profile screen. Deleting your account removes your data from the live database immediately.',
  },
  {
    title: 'Security',
    body: 'Traffic is encrypted over HTTPS, passwords are hashed with bcrypt, and sign-in uses time-limited tokens. Please still use a strong, unique password.',
  },
  {
    title: 'Questions',
    body: 'Contact youssif_mohammed@aucegypt.edu for any privacy question or request.',
  },
];

export function Privacy() {
  const { go } = useStore();
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <BackButton onClick={() => go('settings')} />
        <div className="display" style={{ flex: 1, minWidth: 0, fontSize: 32, lineHeight: 1.1, color: 'var(--text)' }}>Privacy</div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18, lineHeight: 1.5 }}>
        The short version of how Orbit handles your data.
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
        Last updated 28 October 2026
      </div>
    </div>
  );
}
