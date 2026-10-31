# Launching Orbit on Google Play: the checklist

Everything from "no developer account" to "live in the store", in order. Each
step says where its details are. Two steps wait on Google and nothing makes
them faster, so they come first:

- **Identity verification** of a new developer account takes from a few hours
  to a few days.
- A new personal account must run a **closed test with at least 12 testers
  opted in for 14 days in a row** before it can even ask for production.

Realistically that means three weeks from today, most of it waiting.

---

## Week 1: set up

### 1. Open the developer account (start today)
- [ ] Sign up at [play.google.com/console](https://play.google.com/console) as a
      **personal** account. Pay the one-time **$25**.
- [ ] Verify your identity with the ID Play asks for, and verify the phone and
      email. Play shows the developer name publicly in the store.

### 2. Merge PR #37
Render redeploys the server from `main`. Then check that these open in a
browser, signed out:
- [ ] https://orbit-x3z7.onrender.com/privacy (and `?lang=ar`)
- [ ] https://orbit-x3z7.onrender.com/delete-account (and `?lang=ar`)
- [ ] Ask for a deletion of a throwaway account there and make sure the email
      arrives. It's sent the same way as password resets, through Brevo, so if
      resets work this does too.

### 3. Make the release key (once, on your Mac)
```bash
./scripts/make-release-key.sh
```
It creates the key in `~/orbit-release-key/` and puts the four secrets on
GitHub for you. **Back that folder up** (password manager or encrypted USB) and
never put it in the repo. Details: [`RELEASE.md`](RELEASE.md).

### 4. Build the bundle
- [ ] GitHub → Actions → **Build Android APK** → Run workflow, version name
      `1.0.0`. When it finishes, download **orbit-android-release-aab**. The
      `app-release.aab` inside is what Play takes.

### 5. Create the app in Play Console
- [ ] **Create app**: name `Orbit: Habits, Money & Sleep`, default language
      English (United States), **App**, **Free**, accept the declarations.
- [ ] The package name comes from the first upload: `com.orbit.app`. It can
      never change.

### 6. Store listing
- [ ] Paste the text and upload the images from [`store/listing.md`](store/listing.md)
      (English, then the Arabic translation).

### 7. App content (Policy → App content)

| Item | Answer |
| --- | --- |
| Privacy policy | `https://orbit-x3z7.onrender.com/privacy` |
| App access | "All or some functionality is restricted". Add a reviewer login (see step 8). |
| Ads | No, the app contains no ads. |
| Content rating | Take the questionnaire. Category: *Utility / Productivity*. Users can interact with each other: **yes** (partner chat; there is reporting). No violence, gambling, location sharing or purchases. |
| Target audience | **18 and over** only. The partner feature is 18+, and an adults-only audience keeps the app out of the Families programme. |
| News app | No |
| Health apps | Pick the fitness / activity tracking and sleep tracking categories if listed. Orbit is not a medical device and makes no medical claims. |
| Financial features | Orbit only tracks money: it holds none, moves none, lends nothing and trades nothing. If the form has a budgeting or money-management option, pick it; otherwise "my app doesn't provide financial features". |
| Data safety | Row by row from [`PLAY_SMS.md` §5](PLAY_SMS.md#5-data-safety-form). Deletion URL: `https://orbit-x3z7.onrender.com/delete-account` |
| Government app | No |
| Sensitive permissions: SMS | The Permissions Declaration Form and the demo video: [`PLAY_SMS.md` §2–3](PLAY_SMS.md). |
| Exact alarms | Orbit asks for `SCHEDULE_EXACT_ALARM` (the one the person grants), not `USE_EXACT_ALARM`, so no declaration is needed. If asked: reminders at a time the person chose. |

### 8. A login for Google's reviewers
- [ ] Sign up in the app with an email you control (for example
      `orbit.review@…`) and a password. Use email and password, not Google
      Sign-In: reviewers can't use your Google account.
- [ ] Add a week of real-looking data: a few habits checked off, two workouts,
      some nights of sleep, and bank messages turned on so there are imported
      payments to see.
- [ ] Put the email, the password and one line of instructions in App access:
      *"Bank-message tracking: Profile → Bank messages. The account already
      has imported payments under Finances."*

### 9. Internal testing (the same day, no review wait)
- [ ] Testing → **Internal testing** → create a release → upload the `.aab`,
      paste the release notes. Add yourself as a tester and install Orbit
      **from the Play Store link**.
- [ ] **Google Sign-In will fail on this build until you do this:** Play
      re-signs the app with its own key. Copy the *App signing key* SHA-1 from
      Setup → App signing and add it as another Android OAuth client in Google
      Cloud ([`GOOGLE_SIGNIN.md`](GOOGLE_SIGNIN.md)). Then sign in again.
- [ ] Check the things a reviewer will try: sign up, bank messages, a reminder,
      delete account.

---

## Weeks 2–3: the closed test

### 10. Closed testing with 12+ people for 14 days
- [ ] Testing → **Closed testing** → create a track, upload the same `.aab`,
      countries: Egypt (and anywhere your testers are).
- [ ] Add 12 or more testers' Google account emails (a list, or a Google Group).
      Send them the opt-in link. **Each one has to accept the invite and install
      the app.** Aim for 15 or more, because some never do.
- [ ] Keep them using it. Play looks at whether testers actually opened the app,
      and asks what you learned from them. Ship at least one update during the
      test (a fix from their feedback is ideal). What testers send from the in-app
      feedback box, and any crashes, show up in the app's feedback inbox
      (opened with your `ADMIN_PASSWORD`).
- [ ] The 14 days count from when the 12th tester opted in, and they must stay
      opted in the whole time.

### 11. Before asking for production
- [ ] **Move the server off Render's free plan** (Starter, about $7 a month).
      Free servers sleep after 15 minutes. A reviewer who waits 50 seconds for
      the first screen is a likely rejection, and real users would see the
      same wait.
- [ ] Re-read [`PRIVACY.md`](PRIVACY.md) against the build you're submitting.

### 12. Production
- [ ] Dashboard → **Apply for production**. Answer the questions about the test
      honestly. Approval usually takes a few days.
- [ ] Then Production → create a release with the latest `.aab`. Start with a
      **staged rollout** (20%), watch the feedback inbox and the Play crash
      reports for a couple of days, then go to 100%.
- [ ] The SMS declaration is reviewed with the first production release. If it's
      refused, [`PLAY_SMS.md` §6](PLAY_SMS.md#6-if-the-declaration-is-refused)
      has the way back.

---

## Every update after that

1. Actions → **Build Android APK** → Run workflow with a higher version name
   (`1.0.1`). The version code goes up by itself.
2. Upload the new `app-release.aab` to the track you're releasing on, with
   release notes in English and Arabic.
3. Never re-run an *older* workflow run to make a release: it would give Play a
   lower version code, which Play rejects.
