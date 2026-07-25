# Orbit as a real native app (Capacitor)

Orbit's web frontend (`web/`) is wrapped with [Capacitor](https://capacitorjs.com)
so it installs and runs like a normal phone app — no browser, no URL bar, its
own icon, and it can be submitted to the Google Play Store and Apple App Store.

The app's screens are the same React code as the website; Capacitor just packages
them inside a native shell and lets them call your existing backend.

## How the app finds the backend

On the website the frontend and API are served from the same address, so the code
calls the API with relative paths (`/api/...`). Inside a native app that code runs
from a local address **on the phone**, so it needs the backend's full URL.

That URL is baked in at build time from the `VITE_API_BASE` environment variable
(e.g. `https://orbit.onrender.com`). It's empty for the normal website build, so
nothing about the website changes.

The backend already allows the native app to connect (CORS now permits the
Capacitor origins `capacitor://localhost` and `http://localhost`).

## Getting an installable Android app (no tools on your computer)

Because your computer can't install Android Studio, the app is built in the cloud
by GitHub Actions.

**One-time setup — add the workflow via GitHub's website** (the saved access token
can't push workflow files, but the web editor can):

1. On GitHub, open your repo → **Actions** tab → **New workflow** →
   **set up a workflow yourself**.
2. Name the file `android.yml`, delete the sample contents, and paste in the
   contents of [`ci/android.yml`](ci/android.yml) from this repo.
3. **Commit** it (this creates `.github/workflows/android.yml`).

Then, to build the app:

1. Go to the repo → **Actions** tab → **Build Android APK** → **Run workflow**.
3. Enter your backend URL (e.g. `https://orbit.onrender.com`) and run it.
4. When it finishes (~5–8 min), open the run and download the **orbit-android-apk**
   artifact. Inside is `app-debug.apk`.
5. Send that APK to your Android phone, open it, and allow "install from unknown
   sources." Orbit installs like any app.

> Tip: set the backend URL once as a repo **Variable** named `VITE_API_BASE`
> (Settings → Secrets and variables → Actions → Variables) and every push to
> `main` that touches `web/` will rebuild the APK automatically.

The APK from CI is a **debug** build — perfect for installing on your own phones
and sharing with testers. For the **Google Play Store** you'll need a signed
**release** build (an `.aab`); that's a small addition to the workflow plus a
one-time signing key — say the word and I'll add it.

## Building locally (only if you ever get a dev machine)

```bash
cd web
npm install
VITE_API_BASE=https://your-backend npm run build
npx cap sync android
npx cap open android      # opens Android Studio to run/build
```

## iOS / Apple App Store

The same React app can become a real iOS app, but Apple requires the build to run
on a Mac (Xcode) and an Apple Developer account ($99/year). When you're ready:

```bash
cd web
npm install @capacitor/ios
npx cap add ios
```

…then build/submit from Xcode (or a cloud Mac CI). The web code and backend stay
exactly the same.

## Two known native gotchas (not blockers)

These use browser-only web APIs that behave differently inside a native shell.
Email/password login and every feature of the app work; these two need a native
adapter, which I can add next:

- **Google Sign-In** — the current button uses Google's web SDK, which Google
  blocks inside app WebViews. Fix: the `@codetrix-studio/capacitor-google-auth`
  plugin (native Google sign-in). Email/password login is unaffected.
- **Daily reminder notifications** — these use web push + a service worker, which
  don't run in a native app. Fix: `@capacitor/local-notifications` (and/or
  `@capacitor/push-notifications` with Firebase Cloud Messaging) to schedule the
  same reminders natively.
