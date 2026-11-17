import { t, tk } from '../i18n';

// The server answers in English; both apps show its words in the reader's
// language. Every message it can send a person is listed here so the Arabic
// dictionary has to keep up with it (the i18n test reads these tk() calls).
// Anything not listed still shows, in English, rather than nothing.

tk('Server error');
tk('Not found');
tk('Enter your date of birth');
tk('Your date of birth is already set');
tk('That date does not look right');
tk('You already have a partner');
tk('No partner');
tk('Unknown tracker');
tk('Write something first');
tk('Your partner has not opened that tracker for comments');
tk('Chat is not open yet — you both need to turn it on');
tk('That is a lot of messages at once. Try again shortly.');
tk('No partner to report');
tk('Session ended on this device');
tk('Starting up — the database is still waking. Try again in a moment.');
tk('That entry could not be saved');
tk('Enter a valid email');
tk('That email is already registered');
tk('Incorrect email or password');
tk('Missing Google credential');
tk('Google sign-in is not configured');
tk('Could not verify Google sign-in');
tk('Invalid Google sign-in');
tk('Invalid Google account');
tk('This reset link is invalid or has expired');
tk("Email isn't set up on the server yet");
tk('This link is invalid or has expired');
tk('That email is taken');
tk('Name required');
tk('Habit not found');
tk('This habit is permanent and can’t be edited');
tk('This habit is permanent and can’t be deleted');
tk('Keep at least one category');
tk('Unknown category');
tk('No receipt');
tk('That image is too large — try a smaller photo');
tk('Amount required');
tk('Those two can’t be one transfer');
tk('Category required');
tk('Pick another account');
tk('Account not found');
tk('Currency required');
tk('Rates unavailable');
tk('Pick a date');
tk('Name the list');
tk('That’s as many lists as Orpit keeps');
tk('Write the task');
tk('List not found');
tk('Clear some finished tasks first');
tk('Task not found');
tk('Add an amount');
tk('Counter not found');
tk('Enter your password to confirm');
tk('That password is incorrect');
tk('Current password is incorrect');
tk('That file does not look like an Orpit export');
tk('Push not configured on the server yet');
tk('No device is subscribed yet');
tk('Write a message first');
tk('Nothing to send');
tk('Wrong password');
tk('Inbox not configured on the server');

/** A server error message, in the reader's language. */
export function serverError(msg: string): string {
  let m = /^Too many attempts\. Try again in (\d+)s\.$/.exec(msg);
  if (m) return t('Too many attempts. Try again in {n}s.', { n: Number(m[1]) });
  m = /^(New password|Password) must be at least (\d+) characters$/.exec(msg);
  if (m)
    return m[1] === 'Password'
      ? t('Password must be at least {n} characters', { n: Number(m[2]) })
      : t('New password must be at least {n} characters', { n: Number(m[2]) });
  // A sign-in that's no longer valid: say what to do, not what broke.
  if (msg === 'Invalid token' || msg === 'Missing token') return t('Please sign in again');
  return t(msg);
}
