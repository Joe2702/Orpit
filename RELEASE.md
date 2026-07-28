# Shipping Orbit to the Google Play Store

The APK your testers install is signed with a **debug** key that lives in this
repo. That's fine for sharing with friends, but Google Play needs a **release**
key that only you control.

> ⚠️ **The most important rule:** once you publish an app with a release key, you
> can never change it. If you lose that key you cannot update your own app. Back
> it up somewhere safe (a password manager, an encrypted drive — not this repo).

## 1. Create your release key (one time)

On any computer with Java installed:

```bash
keytool -genkeypair -v \
  -keystore orbit-release.keystore \
  -alias orbit \
  -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a password (twice) and some name/organisation details. **Write the
password down** — you need it forever. You now have `orbit-release.keystore`.

## 2. Add it to GitHub as secrets

Turn the key file into text so it can be stored as a secret:

```bash
base64 -w0 orbit-release.keystore > keystore.txt   # macOS: base64 -i orbit-release.keystore -o keystore.txt
```

Then in your repo → **Settings → Secrets and variables → Actions → New repository
secret**, add four secrets:

| Secret name                 | Value                                    |
| --------------------------- | ---------------------------------------- |
| `RELEASE_KEYSTORE_BASE64`   | the entire contents of `keystore.txt`    |
| `RELEASE_KEYSTORE_PASSWORD` | the keystore password you chose          |
| `RELEASE_KEY_ALIAS`         | `orbit`                                  |
| `RELEASE_KEY_PASSWORD`      | the key password (same as above unless you set a different one) |

Delete `keystore.txt` afterwards. Keep `orbit-release.keystore` backed up
privately.

## 3. Build the release bundle

Run the **Build Android APK** workflow as usual. When the secrets exist, it also
produces a second artifact: **orbit-android-release-aab** containing
`app-release.aab` — the file Google Play accepts. (Without the secrets the step
is skipped, so nothing breaks in the meantime.)

## 4. Publish

1. Pay the one-time **$25** Google Play developer registration fee at
   [play.google.com/console](https://play.google.com/console).
2. Create the app, fill in the store listing (name, description, screenshots,
   icon).
3. **Data safety form** — declare what you collect. Use [`PRIVACY.md`](PRIVACY.md)
   as the source of truth: account info (email, name), the entries the user
   creates, and crash diagnostics; no ads, no tracking, no data sold.
4. Provide a **privacy policy URL**. The simplest option is to publish
   `PRIVACY.md` as a GitHub Pages site, or paste it anywhere public and link it.
5. Upload the `.aab` to an **Internal testing** track first — it reaches your
   testers within minutes and requires no review — then promote to Production
   when you're happy.

## Notes

- The **app id** is `com.orbit.app`. It cannot be changed after publishing.
- `versionCode` in `web/android/app/build.gradle` must increase with every
  upload. Bump it before each release build.
- If you also want **Google Sign-In** to work in the Play version, add the SHA-1
  of your *release* key (and Play's app-signing SHA-1, shown in the Play Console)
  as extra Android OAuth clients in Google Cloud — see [`GOOGLE_SIGNIN.md`](GOOGLE_SIGNIN.md).

## iOS, when you get there

An iOS release needs a Mac (or a cloud Mac runner), an **Apple Developer
Program** membership ($99/year), and distribution through TestFlight before the
App Store. The app code is already iOS-ready — see [`MOBILE.md`](MOBILE.md).
