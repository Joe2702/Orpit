#!/usr/bin/env bash
# Creates Orbit's Play upload key and stores it as the four GitHub secrets the
# release build reads (see RELEASE.md). Run it once, on your own computer:
#
#   bash scripts/make-release-key.sh
#
# The key and its password go in ~/orbit-release-key (or the folder you pass).
# Back that folder up somewhere private. Never commit it.
set -euo pipefail

OUT="${1:-$HOME/orbit-release-key}"
REPO="Joe2702/Orpit"
mkdir -p "$OUT"
chmod 700 "$OUT"
KEY="$OUT/orbit-release.keystore"

if [ -e "$KEY" ]; then
  echo "A key already exists at $KEY. Use it, or move it away first: Play only accepts updates signed by the same upload key."
  exit 1
fi

# keytool comes with Java. Android Studio ships its own copy.
KEYTOOL="$(command -v keytool || true)"
for candidate in \
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool" \
  "$(/usr/libexec/java_home 2>/dev/null || true)/bin/keytool"; do
  if [ -z "$KEYTOOL" ] && [ -x "$candidate" ]; then KEYTOOL="$candidate"; fi
done
if [ -z "$KEYTOOL" ]; then
  echo "Java's keytool wasn't found. Install it with:  brew install openjdk   (or install Android Studio), then run this again."
  exit 1
fi

PASS="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | cut -c1-28)"
"$KEYTOOL" -genkeypair -keystore "$KEY" -alias orbit -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PASS" -keypass "$PASS" -dname "CN=Orbit, O=Orbit, C=EG" >/dev/null
printf 'Keystore: orbit-release.keystore\nAlias: orbit\nPassword (store and key): %s\n' "$PASS" > "$OUT/password.txt"
chmod 600 "$KEY" "$OUT/password.txt"
echo "Created $KEY"

B64="$(base64 < "$KEY" | tr -d '\n')"
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  printf '%s' "$B64" | gh secret set RELEASE_KEYSTORE_BASE64 -R "$REPO"
  printf '%s' "$PASS" | gh secret set RELEASE_KEYSTORE_PASSWORD -R "$REPO"
  printf 'orbit' | gh secret set RELEASE_KEY_ALIAS -R "$REPO"
  printf '%s' "$PASS" | gh secret set RELEASE_KEY_PASSWORD -R "$REPO"
  echo "Saved the four secrets to $REPO. The next Build Android APK run also produces the Play bundle."
else
  echo
  echo "Add these four secrets in GitHub: $REPO -> Settings -> Secrets and variables -> Actions -> New repository secret"
  echo "  RELEASE_KEYSTORE_BASE64   (copied to your clipboard now; paste it)"
  echo "  RELEASE_KEYSTORE_PASSWORD $PASS"
  echo "  RELEASE_KEY_ALIAS         orbit"
  echo "  RELEASE_KEY_PASSWORD      $PASS"
  if command -v pbcopy >/dev/null; then printf '%s' "$B64" | pbcopy; else echo "$B64" > "$OUT/keystore-base64.txt"; echo "(clipboard unavailable; it's in $OUT/keystore-base64.txt, delete that file afterwards)"; fi
fi
echo
echo "Back up $OUT (a password manager or encrypted drive). Don't put it in the repo."
