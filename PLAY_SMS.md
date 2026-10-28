# Getting the SMS permission through Google Play review

Orbit reads bank and wallet messages (`READ_SMS`) and is told when one arrives
(`RECEIVE_SMS`). Play treats both as restricted: an app may use them only for
an approved core purpose, declared in Play Console, and an undeclared or
unapproved app is rejected or removed. Personal money-management apps that
track spending from bank SMS fall under one of those purposes. This file is
everything the declaration asks for, written to match what the app actually
does.

Confirm the exact category names in Play Console when you fill the form: the
wording of the policy page changes from time to time, and the form is the
authority, not this file.

## 1. Before you submit

- [ ] The privacy policy is live at `https://orbit-x3z7.onrender.com/privacy`
      and its **Bank messages** section matches the build you upload
      (`PRIVACY.md`, served by the API).
- [ ] The build you upload is the one in the demo video. Reviewers compare them.
- [ ] Bank messages are **off** by default and only turned on from
      Profile → Bank messages, after the explanation screen. (They are.)
- [ ] The store listing mentions SMS tracking in the short description and the
      first lines of the full description (section 4). Play expects the
      declared purpose to be prominent.
- [ ] A test account for reviewers (email and password) in App content →
      App access, with a few imported payments already in it.
- [ ] Data safety form filled as in section 5.

## 2. Permissions Declaration Form

**Permissions:** `READ_SMS`, `RECEIVE_SMS`.

**Core functionality:** SMS-based money management (tracking income and
spending from bank and wallet transaction messages).

**Describe how the app uses the permission** (paste):

> Orbit is a personal finance and habit tracker. Its money tracking is built on
> the transaction alerts banks and mobile wallets send by SMS: when the user
> turns on "Import from SMS", Orbit reads messages from bank and wallet sender
> IDs (never from phone numbers), extracts the amount, merchant, date, account
> and reported balance on the device, and records them as transactions in the
> user's accounts, so their spending, budgets and account balances stay up to
> date without manual entry. RECEIVE_SMS is used so a payment appears as soon
> as the bank's message arrives instead of the next time the app is opened.
> One-time passcodes are ignored. The message text is never transmitted or
> stored on our servers; it stays on the device. The feature is off by default,
> is explained in a disclosure screen before the permission is requested, and
> can be turned off at any time. The app is fully usable without it.

**Why there's no alternative:** banks in our market (Egypt: CIB, NBE, Banque
Misr, QNB, and wallets such as Vodafone Cash and InstaPay) send transaction
alerts by SMS, and there is no open-banking API a consumer app can use to get
the same transactions. The SMS
Retriever and User Consent APIs are for one-time codes, not ongoing
transaction alerts.

## 3. Demo video (about 45 seconds, screen recording on a real phone)

1. Open Orbit → Profile → Bank messages → Import from SMS. Pause on the
   explanation screen so its text is readable.
2. Tap Continue → Android's permission prompt → Allow.
3. The first scan finishes: "N payments added". Open Finances: accounts per
   bank with "Bank said · just now".
4. From a second phone or a bank test, receive a transaction SMS while Orbit is
   open: the payment appears within a few seconds.
5. Close Orbit, receive another: the notification with the amount appears; tap
   it and the payment is in the list.
6. Open the entry → Show message: the source text, shown on the device only.
7. Profile → Bank messages → switch off.

Upload it unlisted to YouTube and paste the link into the form.

## 4. Store listing

**Short description (80 characters max):**
> Habits, workouts, sleep and money. Spending tracked from your bank SMS.

**Full description, first paragraph:**
> Orbit keeps your habits, training, sleep and money in one place. Turn on bank
> messages and Orbit tracks your spending automatically: every card payment,
> transfer and salary alert from your bank or wallet becomes a transaction in
> the right account, with the balance your bank reported. The messages are
> read on your phone and their text never leaves it.

Add one screenshot of Finances showing bank-linked accounts and one of the
review screen.

## 5. Data safety form

| Question | Answer |
| --- | --- |
| Does the app collect or share user data? | Collects; does not share. |
| **Messages → SMS or MMS** | Not collected. Read on the device only; the text is never transmitted. (Data processed only on the device doesn't count as collected.) |
| **Financial info → Purchase history** | Collected. Optional (only if the user turns on bank messages or enters transactions). Purpose: App functionality. |
| **Financial info → Other financial info** (account names, last four digits, balances) | Collected. Optional. App functionality. |
| Personal info → Name, Email | Collected. Required for an account. App functionality, Account management. |
| App activity / App info and performance → Crash logs | Collected. Optional. Analytics (crash fixing). |
| App activity → App interactions (feature usage counts) | Collected. Optional (Profile → Data → Share usage counts). Analytics. |
| Encrypted in transit | Yes (HTTPS). |
| Users can request deletion | Yes: Profile → Delete my account, and `https://orbit-x3z7.onrender.com/delete-account`. |

## 6. If the declaration is refused

Publishing is blocked while a declaration is unresolved, so have a plan:

- Appeal once, with a clearer video and the "no alternative" paragraph above.
- Ship the Play build **without** the two SMS permissions (a build flag that
  removes them from the manifest and hides the setting), and keep offering the
  full APK directly from the website for people who want automatic tracking.
- Longer term: a "share to Orbit" option (select a bank message → Share →
  Orbit) needs no SMS permission at all, and could stand in on the Play build.
