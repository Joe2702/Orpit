# Turning on Google Sign-In

The app code for "Continue with Google" is done. It stays **hidden** until you
give it a Google **Web client ID**, so nothing breaks in the meantime. To switch
it on you create OAuth credentials in Google Cloud (~10 min) and plug the ID in
three places.

## The two facts you'll need

- **App package name:** `com.orbit.app`
- **Signing SHA-1 fingerprint:**
  `BB:D7:F6:2A:6A:8B:D2:B3:2B:7A:34:67:EF:7F:97:0F:B5:51:00:08`

(The SHA-1 is fixed now — every CI build signs with the checked-in `web/android/orbit.keystore`, so it won't change between builds. It's a testing key, not a Play Store release key.)

## 1) Create the OAuth credentials (Google Cloud Console)

1. Go to **console.cloud.google.com** → create a project (e.g. "Orbit"), or pick one.
2. **APIs & Services → OAuth consent screen** → choose **External** → fill app
   name, your email → **Save**. (While testing you can leave it in "Testing"
   mode and add your testers' Google emails under "Test users".)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID:**
   - **Application type: Web application** → name it "Orbit Web" → Create.
     **Copy this Client ID** (looks like `1234-abc.apps.googleusercontent.com`).
     This is the one you'll paste everywhere below — the **Web client ID**.
   - Create credentials **again → OAuth client ID → Application type: Android:**
     - **Package name:** `com.orbit.app`
     - **SHA-1 certificate fingerprint:** the SHA-1 above
     - Create. (You don't need to copy the Android client ID — registering it is
       what authorizes the app. The token audience stays the Web client ID.)

## 2) Tell the backend about it (Render)

In your Render service → **Environment** → add:

- `GOOGLE_CLIENT_ID` = the **Web client ID** from step 1.

Save (Render redeploys). This lets the server verify Google logins.

## 3) Build the app with it

The Google button only appears if the build knows the Web client ID. When you run
**Actions → Build Android APK → Run workflow**, there's now a second field:

- **Backend URL:** `https://orbit-x3z7.onrender.com`
- **Google Web OAuth client ID:** paste the **Web client ID** from step 1.

Run it, install the new APK, and "Continue with Google" will work.

> Prefer not to type it each time? Add a repo **Variable** named
> `VITE_GOOGLE_CLIENT_ID` (Settings → Secrets and variables → Actions →
> Variables) set to the Web client ID, and every build uses it automatically.

## Note on the workflow file

The build workflow gained that new "Google Web OAuth client ID" input. Because
the saved GitHub token can't write workflow files, update it once via the web
editor: **your repo → the file `.github/workflows/android.yml` → ✏️ edit →**
replace its contents with the current [`ci/android.yml`](ci/android.yml) → commit.
