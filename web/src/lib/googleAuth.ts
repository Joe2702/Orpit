import { Capacitor } from '@capacitor/core';

// The Web OAuth client ID (…apps.googleusercontent.com). Used as the token
// audience on every platform; on Android it's the "serverClientId" that makes
// Google mint an ID token our backend can verify.
const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

let initialized = false;

/** True when we should use the native Google flow (real app + a client ID set). */
export function nativeGoogleAvailable(): boolean {
  return Capacitor.isNativePlatform() && !!WEB_CLIENT_ID;
}

/**
 * Run the native Google sign-in sheet and return the ID token to hand to
 * POST /auth/google (same endpoint the web flow uses).
 */
export async function nativeGoogleSignIn(): Promise<string> {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  if (!initialized) {
    await SocialLogin.initialize({ google: { webClientId: WEB_CLIENT_ID } });
    initialized = true;
  }
  // Basic sign-in only — no custom `scopes`. The plugin already requests
  // email/profile/openid; passing extra scopes would require native
  // MainActivity changes. The returned idToken carries the email + name.
  const res = await SocialLogin.login({ provider: 'google', options: {} });
  const idToken = (res.result as { idToken?: string | null } | undefined)?.idToken;
  if (!idToken) throw new Error('Google did not return a token');
  return idToken;
}
