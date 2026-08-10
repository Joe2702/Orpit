# Orbit — Privacy Policy

_Last updated: 26 July 2026_

Orbit is a personal life-tracking app. This policy explains, in plain language,
what the app stores, why, and what control you have over it.

**This is a plain-English policy written for a small, self-hosted app. If you
publish Orbit commercially, have a lawyer review it against the rules that apply
where your users live (GDPR, CCPA, and the Google Play / Apple App Store data
disclosure requirements).**

## Who runs Orbit

Orbit is operated by the app's developer. For any privacy question or request,
contact: **youssif_mohammed@aucegypt.edu**

## What we store

**Account information**
- Your email address and display name.
- A password, stored only as a one-way hash (we never see or store the original).
- If you sign in with Google, we store your Google account ID and the email and
  name Google provides. We do not receive your Google password.
- An optional profile photo, if you add one.

**The data you enter**
- Habits, check-ins, workouts, sleep entries, transactions, accounts, budgets,
  goals, recurring items, counters and their logs.
- Your preferences: theme, currency, reminder time, timezone and dashboard layout.

**Technical information**
- If the app hits an unexpected error, it sends the error message, a stack
  trace, the build number and your device's browser/OS string so the bug can be
  fixed. This is not used to track you.
- If you send feedback, we store your message alongside your name and email so
  we can reply.

**Bank messages (optional, Android only)**
- If you turn on Profile → Bank messages → Import from SMS, the app asks Android
  for permission to read your text messages, so that payment alerts from your
  bank become transactions without you typing them in.
- The app only looks at messages whose sender matches a known bank or wallet
  (for example NBE, CIB, InstaPay, Vodafone Cash). Personal messages are not
  read.
- **The text of your messages never leaves your phone and is never sent to our
  servers.** The app works out the amount, the merchant name and the date on the
  device, and stores only those — together with the last four digits of the card
  when the message mentions them, and a one-way hash of the message that is used
  solely to avoid importing the same payment twice.
- This is entirely optional. Every part of the app works without it, and you can
  turn it off at any time in Profile → Bank messages, or revoke the permission in
  Android's own settings.

**What we do NOT collect:** we do not use advertising or analytics SDKs, we do
not track your location, we do not read your contacts, photos, or any data from
other apps, and we do not build advertising profiles. We do not read, store or
transmit the content of your text messages.

## Why we store it

Only to make the app work: to sign you in, to save and sync your entries across
your devices, to show your statistics and reports, to send the daily reminder you
asked for, and to fix crashes and respond to your feedback.

## Notifications

Daily reminders are optional. On the app they are scheduled on your device, so
their content stays on the phone. If you enable reminders on the website
instead, your browser's push service is used to deliver them.

## Who we share it with

We do not sell your data and we do not share it with advertisers. It is stored
using ordinary infrastructure providers acting on our behalf:

- **Render** — application hosting
- **Neon** — the PostgreSQL database
- **Brevo** — sending password-reset and feedback emails
- **Google** — only if you choose "Sign in with Google"

## How long we keep it

Your data is kept while your account exists. When you delete your account, it is
removed from the live database immediately; residual copies may persist in
routine backups for a short period before being overwritten.

## Your choices

- **Export**: Profile → Data → Export data gives you everything as a JSON file.
- **Erase your entries**: Profile → Data → Reset all data.
- **Delete your account**: Profile → Delete my account. This permanently removes
  your account and all associated data.
- **Turn off reminders**: Profile → Preferences → Daily reminders.
- **Turn off bank message importing**: Profile → Bank messages → Import from SMS.
  Transactions already imported stay until you delete them.

## Security

Traffic between the app and the server is encrypted over HTTPS. Passwords are
hashed with bcrypt. Sign-in uses time-limited tokens. No system is perfectly
secure, so please use a strong, unique password.

## Children

Orbit is not directed at children under 13, and we do not knowingly collect
their data.

## Changes

If this policy changes materially, the date at the top will be updated. Your
continued use of Orbit after a change means you accept the updated policy.
