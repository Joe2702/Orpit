import express from 'express';
import cors from 'cors';
import compression from 'compression';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appendFileSync, existsSync } from 'node:fs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import webpush from 'web-push';

import type { PoolClient } from 'pg';
import { pool, query, one, tx } from './db.js';
import { signToken, requireAuth, type AuthedRequest } from './auth.js';
import { seedUser } from './seed.js';
import { buildState } from './state.js';
import { fetchRates } from './fx.js';
import { SCHEMA_SQL } from './schema.js';
import { deletionPages, legalPage, legalRouter, pickLang } from './legal.js';
import { partnerRouter, listReports } from './partner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
// Larger limit so small profile photos (data URLs) fit.
app.use(express.json({ limit: '2mb' }));
// Origins allowed to call the API. The web dev server plus the origins a
// Capacitor native shell serves the app from (iOS uses capacitor://localhost,
// Android uses http://localhost / https://localhost). Requests with no Origin
// header (e.g. curl, some native WebViews) are allowed through as well.
const allowedOrigins = [
  ...(process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
].map((o) => o.trim());
app.use(
  cors({
    origin: (origin, cb) =>
      cb(null, !origin || allowedOrigins.includes(origin)),
  })
);
// Every save answers with the whole account as JSON, which is mostly repeated
// keys and digits: gzip makes it several times smaller, which on mobile data
// is most of the time a save takes to come back.
app.use(compression());

// ---- Database readiness ----
// The schema runs on boot, but the server must NOT wait for it before it starts
// listening. On a free tier the Postgres sleeps too, so a slow or unreachable
// database used to abort startup, Render would restart, and it would fail the
// same way again — a crash loop where nothing ever answers and the app just
// says "waking up" forever. Now we listen immediately, migrate in the
// background with retries, and tell callers plainly while we wait.
let dbReady = false;
let dbError: string | null = null;

app.use('/api', (req, res, next) => {
  if (dbReady || req.path === '/health') return next();
  res.status(503).json({ error: 'Starting up — the database is still waking. Try again in a moment.' });
});

/**
 * Postgres classes 22 (data exception) and 23 (integrity violation) mean the
 * request itself was malformed — a non-numeric id landing in a bigint column,
 * NaN in a numeric one, a foreign key that doesn't exist. Those are the
 * client's fault and will fail identically every time.
 *
 * Reporting them as 500 was quietly serious: the offline queue treats 5xx as
 * "the server is having a moment" and retries forever, so one bad op blocked
 * every entry behind it indefinitely. As a 400 the client drops it and the
 * queue drains.
 */
const isClientDataError = (e: unknown): boolean =>
  typeof (e as { code?: string })?.code === 'string' && /^(22|23)/.test((e as { code: string }).code);

const wrap =
  (fn: (req: AuthedRequest, res: express.Response) => Promise<any>) =>
  (req: AuthedRequest, res: express.Response) =>
    fn(req, res).catch((e) => {
      console.error(e);
      if (isClientDataError(e)) return res.status(400).json({ error: 'That entry could not be saved' });
      res.status(500).json({ error: 'Server error' });
    });

/**
 * Idempotency for mutations replayed from the offline queue.
 *
 * A client that loses the response to a request cannot tell whether it applied,
 * so it replays on reconnect. Without this, a replayed "log workout" duplicates
 * the entry and a replayed habit toggle silently un-checks the day.
 *
 * The key is claimed *before* the handler runs, so two concurrent replays of the
 * same op can't both execute; if the handler then fails, the claim is released
 * so a genuine retry still works.
 */
async function idempotency(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const opId = req.headers['x-orbit-op-id'];
  if (!dbReady || typeof opId !== 'string' || !opId || opId.length > 64) return next();
  const uid = req.userId!;
  try {
    const claim = await pool.query(
      'INSERT INTO client_ops (op_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [opId, uid]
    );
    if (claim.rowCount === 0) {
      // Already applied — hand back current state so the client converges.
      return res.json(await buildState(uid));
    }
  } catch {
    return next(); // never let bookkeeping block a real write
  }
  // Release the claim if the write didn't actually succeed.
  const done = res.json.bind(res);
  res.json = (body: any) => {
    if (res.statusCode >= 400) {
      query('DELETE FROM client_ops WHERE op_id = $1 AND user_id = $2', [opId, uid]).catch(() => {});
    }
    return done(body);
  };
  next();
}

// One password policy, applied at signup, reset and change alike.
const MIN_PASSWORD = 8;
const PASSWORD_RULE = `Password must be at least ${MIN_PASSWORD} characters`;

const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// ---- Simple in-memory rate limiting ----
// Enough to stop password guessing and signup spam on a single instance.
const hits = new Map<string, { n: number; until: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.until < now) hits.delete(k);
}, 60_000).unref?.();

function rateLimit(bucket: string, max: number, windowMs: number) {
  return (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const cur = hits.get(key);
    if (!cur || cur.until < now) {
      hits.set(key, { n: 1, until: now + windowMs });
      return next();
    }
    cur.n++;
    if (cur.n > max) {
      const secs = Math.ceil((cur.until - now) / 1000);
      return res.status(429).json({ error: `Too many attempts. Try again in ${secs}s.` });
    }
    next();
  };
}

// ---- Web Push (daily reminders) ----
// Public key is safe to ship; only the private key must be a secret env var.
const VAPID_PUBLIC =
  process.env.VAPID_PUBLIC ||
  'BMIgmf32_561c9TFt8EHWPQ4z3sufBEYboGA7rs5xtqx5sp5EACgoIndkpaQi47Ws-fo-5RO7FZ1K_vEBB92YSg';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:youssif_mohammed@aucegypt.edu';
const pushReady = !!VAPID_PRIVATE;
if (pushReady) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

// Warm, rotating reminder copy — a different line each day.
const REMINDER_MESSAGES = [
  'How did today go? Take a moment to log it 🌙',
  'Time to reflect on your day — it only takes about 2 minutes ✨',
  "Before the day's over, jot down how it went 📝",
  'A quick check-in keeps your streak of growth going 🌱',
  "Two minutes now, a clearer picture later. Log today's day 💫",
  'Wind down and capture your day — you’ve got this 🌇',
  'Your future self will thank you. Log today in ~2 minutes 🙌',
];

// ---------------- Auth ----------------

app.post(
  '/api/auth/signup',
  rateLimit('signup', 10, 60 * 60 * 1000),
  wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim() || 'Alex Rivera';
    // Date of birth, taken at sign-up because it is the only moment everyone
    // passes through. Not required: refusing to create an account over it would
    // cost more real users than the one feature it gates is worth, and anyone
    // who skips it is simply not eligible until they add it.
    const dob = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.dob || '')) ? String(req.body.dob) : null;
    if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (password.length < MIN_PASSWORD)
      return res.status(400).json({ error: PASSWORD_RULE });

    const existing = await one('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: 'That email is already registered' });

    const hash = await bcrypt.hash(password, 10);
    const user = await tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO users (email, password_hash, name, onboarded, intro_done, dob)
         VALUES ($1,$2,$3,TRUE,FALSE,
                 CASE WHEN $4::date IS NOT NULL
                       AND $4::date <= CURRENT_DATE
                       AND $4::date >= CURRENT_DATE - INTERVAL '120 years'
                      THEN $4::date END)
         RETURNING id`,
        [email, hash, name, dob]
      );
      const id = rows[0].id as number;
      await seedUser(c, id);
      return id;
    });

    res.json({ token: signToken(user), state: await buildState(user) });
  })
);

app.post(
  '/api/auth/login',
  rateLimit('login', 10, 10 * 60 * 1000),
  wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const u = await one<{ id: number; password_hash: string | null; token_version: number }>(
      'SELECT id, password_hash, token_version FROM users WHERE email = $1',
      [email]
    );
    if (!u || !u.password_hash || !(await bcrypt.compare(password, u.password_hash)))
      return res.status(401).json({ error: 'Incorrect email or password' });
    res.json({ token: signToken(u.id, u.token_version ?? 0), state: await buildState(u.id) });
  })
);

// Sign in / sign up with a Google ID token (from Google Identity Services).
app.post(
  '/api/auth/google',
  wrap(async (req, res) => {
    const credential = String(req.body.credential || '');
    if (!credential) return res.status(400).json({ error: 'Missing Google credential' });
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'Google sign-in is not configured' });

    // Verify the ID token with Google and confirm it was issued for our app.
    let payload: any;
    try {
      const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
      payload = await r.json();
    } catch {
      return res.status(401).json({ error: 'Could not verify Google sign-in' });
    }
    const aud = payload.aud;
    const iss = payload.iss;
    if (aud !== clientId || !(iss === 'accounts.google.com' || iss === 'https://accounts.google.com')) {
      return res.status(401).json({ error: 'Invalid Google sign-in' });
    }
    const email = String(payload.email || '').trim().toLowerCase();
    const googleId = String(payload.sub || '');
    const name = String(payload.name || email.split('@')[0] || 'Friend');
    if (!email || !googleId) return res.status(401).json({ error: 'Invalid Google account' });

    // Find by google_id, else by email (link accounts), else create + seed.
    let user = await one<{ id: number }>('SELECT id FROM users WHERE google_id = $1', [googleId]);
    if (!user) {
      const byEmail = await one<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
      if (byEmail) {
        // Google already proved the address — nothing left for us to verify.
        await query('UPDATE users SET google_id = $1, email_verified = TRUE WHERE id = $2', [googleId, byEmail.id]);
        user = byEmail;
      } else {
        const id = await tx(async (c) => {
          const { rows } = await c.query(
            `INSERT INTO users (email, name, google_id, onboarded, intro_done, email_verified)
             VALUES ($1,$2,$3,TRUE,FALSE,TRUE) RETURNING id`,
            [email, name, googleId]
          );
          const uid = rows[0].id as number;
          await seedUser(c, uid);
          return uid;
        });
        user = { id };
      }
    }
    const tv = await one<{ token_version: number }>('SELECT token_version FROM users WHERE id = $1', [user.id]);
    res.json({ token: signToken(user.id, tv?.token_version ?? 0), state: await buildState(user.id) });
  })
);

// Epoch-millis helper, mirroring state.ts.
const TS = (col: string) => `(EXTRACT(EPOCH FROM ${col}) * 1000)::float8 AS ts`;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// Send transactional mail via Brevo (if configured). Returns false if not set up,
// so callers can degrade gracefully rather than fail the whole request.
async function sendMail(tag: string, to: string, subject: string, htmlContent: string): Promise<boolean> {
  // Tests read mail from a file instead of sending it.
  const outbox = process.env.MAIL_OUTBOX;
  if (outbox) {
    appendFileSync(outbox, JSON.stringify({ tag, to, subject, html: htmlContent }) + '\n');
    return true;
  }
  const key = process.env.BREVO_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) {
    console.log(`[${tag}] Brevo not configured — missing`, !key ? 'BREVO_API_KEY' : 'MAIL_FROM');
    return false;
  }
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: from, name: 'Orbit' },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.log(`[${tag}] Brevo rejected email (HTTP ${r.status}):`, body);
    } else {
      console.log(`[${tag}] Brevo accepted email for`, to);
    }
    return r.ok;
  } catch (e) {
    console.log(`[${tag}] Brevo request threw:`, e instanceof Error ? e.message : e);
    return false;
  }
}

const mailButton = (link: string, label: string, ar = false) =>
  `<p><a href="${link}" style="display:inline-block;background:#5c57c9;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600">${label}</a></p>
   <p style="color:#807a70;font-size:13px">${ar ? 'أو الصق هذا الرابط:' : 'Or paste this link:'} <span dir="ltr">${link}</span></p>`;

/** The app sends its language with each request, so its emails can match it. */
const wantsArabic = (req: express.Request) => req.get('x-orbit-lang') === 'ar';
const mailWrap = (ar: boolean, inner: string) =>
  `<div dir="${ar ? 'rtl' : 'ltr'}" style="font-family:sans-serif;font-size:15px;color:#211f1b">${inner}</div>`;

const sendResetEmail = (to: string, link: string, ar = false) =>
  ar
    ? sendMail(
        'reset',
        to,
        'إعادة تعيين كلمة مرور Orbit',
        mailWrap(
          true,
          `<p>اضغط الزر لتعيين كلمة مرور جديدة. ينتهي هذا الرابط خلال ساعة.</p>
      ${mailButton(link, 'إعادة تعيين كلمة المرور', true)}
      <p style="color:#807a70;font-size:13px">إن لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.</p>`
        )
      )
    : sendMail(
        'reset',
        to,
        'Reset your Orbit password',
        mailWrap(
          false,
          `<p>Tap the button to set a new password. This link expires in 1 hour.</p>
      ${mailButton(link, 'Reset password')}
      <p style="color:#807a70;font-size:13px">If you didn't request this, you can ignore this email.</p>`
        )
      );

// Request a reset link (always responds ok, so it can't be used to probe emails).
app.post(
  '/api/auth/request-reset',
  rateLimit('reset', 5, 60 * 60 * 1000),
  wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (emailOk(email)) {
      const u = await one<{ id: number; password_hash: string | null }>(
        'SELECT id, password_hash FROM users WHERE email = $1',
        [email]
      );
      // Only for accounts that actually have a password (not Google-only).
      if (!u) {
        console.log('[reset] no account found for', email);
      } else if (!u.password_hash) {
        console.log('[reset] account', email, 'has no password (Google-only) — no email sent');
      } else {
        const token = randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000);
        await query('DELETE FROM password_resets WHERE user_id = $1', [u.id]);
        await query(
          'INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1,$2,$3)',
          [sha256(token), u.id, expires]
        );
        const base = process.env.APP_URL || `https://${req.headers.host}`;
        await sendResetEmail(email, `${base}/reset?token=${token}`, wantsArabic(req));
      }
    } else {
      console.log('[reset] rejected malformed email:', JSON.stringify(req.body.email));
    }
    res.json({ ok: true });
  })
);

// Set a new password from a reset token, and log the user in.
app.post(
  '/api/auth/reset-password',
  rateLimit('reset-pw', 10, 60 * 60 * 1000),
  wrap(async (req, res) => {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    // Reset used to allow 6 while signup demanded 8 — a downgrade path around
    // our own policy. One constant now governs every entry point.
    if (password.length < MIN_PASSWORD) return res.status(400).json({ error: PASSWORD_RULE });
    const row = await one<{ user_id: number; expires_at: string }>(
      'SELECT user_id, expires_at FROM password_resets WHERE token_hash = $1',
      [sha256(token)]
    );
    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    }
    const hash = await bcrypt.hash(password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, row.user_id]);
    await query('DELETE FROM password_resets WHERE user_id = $1', [row.user_id]);
    res.json({ token: signToken(row.user_id), state: await buildState(row.user_id) });
  })
);

// Full, unwindowed history for "export my data".
//
// The state bundle is capped to a rolling window so routine requests stay
// small — but an export is the one place that must be complete. Users are told
// to export before deleting their account, so a silently truncated file here
// would be the worst possible data loss.
app.get(
  '/api/export',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const [profile, habits, checkins, wCats, workouts, nights, txns, accounts, fcats, counters, countLogs] =
      await Promise.all([
        one('SELECT name, email, (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS "createdAt" FROM users WHERE id = $1', [uid]),
        query('SELECT id::text, name, color, target, days, why, paused, archived FROM habits WHERE user_id = $1 ORDER BY sort, id', [uid]),
        query(`SELECT habit_id::text AS "habitId", to_char(day, 'YYYY-MM-DD') AS day FROM habit_checkins WHERE user_id = $1 ORDER BY day`, [uid]),
        query('SELECT id::text, name, color FROM workout_categories WHERE user_id = $1 ORDER BY sort, id', [uid]),
        query(`SELECT id::text, name, category_id::text AS "catId", dur, dist, kcal, intensity, note, sets, ${TS('ts')} FROM workouts WHERE user_id = $1 ORDER BY ts`, [uid]),
        query(`SELECT id::text, hours, quality, bed_h AS "bedH", wake_h AS "wakeH", note, ${TS('ts')} FROM nights WHERE user_id = $1 ORDER BY ts`, [uid]),
        query(`SELECT id::text, name, cat, amount, income, acc_id::text AS "accId", to_acc_id::text AS "toAccId", adjust, note, ${TS('ts')} FROM txns WHERE user_id = $1 ORDER BY ts`, [uid]),
        query('SELECT id::text, name, type, color, opening FROM accounts WHERE user_id = $1 ORDER BY sort, id', [uid]),
        query('SELECT id::text, name, icon, color, kind FROM fcats WHERE user_id = $1 ORDER BY sort, id', [uid]),
        query('SELECT id::text, name, unit, color, icon, step FROM counters WHERE user_id = $1 ORDER BY sort, id', [uid]),
        query(`SELECT id::text, counter_id::text AS "counterId", amount, ${TS('ts')} FROM count_logs WHERE user_id = $1 ORDER BY ts`, [uid]),
      ]);
    res.json({
      profile, habits, checkins, wCats, workouts, nights, txns, accounts, fcats, counters, countLogs,
      exportedAt: new Date().toISOString(),
    });
  })
);

// ---------------- Email verification ----------------
//
// Deliberately not a gate: an unverified account works exactly like a verified
// one. Verification exists so password reset can reach a real inbox, so the
// app nudges rather than blocks.

app.post(
  '/api/verify/send',
  requireAuth,
  rateLimit('verify-send', 5, 60 * 60 * 1000),
  wrap(async (req, res) => {
    const uid = req.userId!;
    const u = await one<{ email: string; email_verified: boolean }>(
      'SELECT email, email_verified FROM users WHERE id = $1',
      [uid]
    );
    if (!u) return res.status(404).json({ error: 'Not found' });
    if (u.email_verified) return res.json({ ok: true, already: true });

    const token = randomBytes(32).toString('hex');
    await query('DELETE FROM email_verifications WHERE user_id = $1', [uid]);
    await query(
      'INSERT INTO email_verifications (token, user_id, email, expires_at) VALUES ($1,$2,$3,$4)',
      [sha256(token), uid, u.email, new Date(Date.now() + 24 * 60 * 60 * 1000)]
    );
    const base = process.env.APP_URL || `https://${req.headers.host}`;
    const link = `${base}/verify?token=${token}`;
    const ar = wantsArabic(req);
    const sent = await sendMail(
      'verify',
      u.email,
      ar ? 'أكّد بريدك الإلكتروني في Orbit' : 'Confirm your email for Orbit',
      ar
        ? mailWrap(
            true,
            `<p>أكّد هذا العنوان لتتمكن من استعادة حسابك إن نسيت كلمة المرور.</p>
        ${mailButton(link, 'تأكيد البريد', true)}
        <p style="color:#807a70;font-size:13px">ينتهي هذا الرابط خلال 24 ساعة. إن لم تسجّل في Orbit، يمكنك تجاهل هذه الرسالة.</p>`
          )
        : mailWrap(
            false,
            `<p>Confirm this address so you can recover your account if you ever forget your password.</p>
        ${mailButton(link, 'Confirm email')}
        <p style="color:#807a70;font-size:13px">This link expires in 24 hours. If you didn't sign up for Orbit, you can ignore this email.</p>`
          )
    );
    if (!sent) return res.status(503).json({ error: "Email isn't set up on the server yet" });
    res.json({ ok: true });
  })
);

// Public: the link lands here straight from the inbox, with no session.
app.post(
  '/api/verify/confirm',
  rateLimit('verify-confirm', 20, 60 * 60 * 1000),
  wrap(async (req, res) => {
    const row = await one<{ user_id: number; email: string; expires_at: string }>(
      'SELECT user_id, email, expires_at FROM email_verifications WHERE token = $1',
      [sha256(String(req.body.token || ''))]
    );
    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'This link is invalid or has expired' });
    }
    // Only confirm the address the link was issued for — if the user changed
    // their email in the meantime, the old link must not verify the new one.
    await query('UPDATE users SET email_verified = TRUE WHERE id = $1 AND email = $2', [row.user_id, row.email]);
    await query('DELETE FROM email_verifications WHERE user_id = $1', [row.user_id]);
    res.json({ ok: true });
  })
);

// ---------------- State ----------------

app.get(
  '/api/state',
  requireAuth,
  wrap(async (req, res) => res.json(await buildState(req.userId!)))
);

app.patch(
  '/api/me',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const fields: Record<string, any> = {};
    if (typeof req.body.name === 'string') fields.name = req.body.name.trim();
    if (typeof req.body.email === 'string') {
      const e = req.body.email.trim().toLowerCase();
      if (e && !emailOk(e)) return res.status(400).json({ error: 'Enter a valid email' });
      fields.email = e;
      // A new address hasn't been proven yet — drop verified status and any
      // outstanding link, so an old token can't confirm the new address.
      fields.email_verified = false;
      await query('DELETE FROM email_verifications WHERE user_id = $1', [uid]);
    }
    if (['light', 'dark', 'system'].includes(req.body.theme)) fields.theme = req.body.theme;
    if (typeof req.body.reminders === 'boolean') fields.reminders = req.body.reminders;
    if (typeof req.body.haptics === 'boolean') fields.haptics = req.body.haptics;
    if (['USD', 'EGP', 'EUR', 'GBP', 'SAR'].includes(req.body.currency)) fields.currency = req.body.currency;
    // Profile photo: a data URL to set it, or null to remove it.
    if (req.body.avatar === null) fields.avatar = null;
    else if (typeof req.body.avatar === 'string' && req.body.avatar.startsWith('data:image/')) {
      fields.avatar = req.body.avatar;
    }
    // Dashboard layout (JSON string of per-screen block order).
    if (typeof req.body.layout === 'string') fields.layout = req.body.layout.slice(0, 4000);
    // Daily reminder time (HH:MM) + the device's timezone.
    if (req.body.reminderTime === null) fields.reminder_time = null;
    else if (typeof req.body.reminderTime === 'string' && /^\d{2}:\d{2}$/.test(req.body.reminderTime)) {
      fields.reminder_time = req.body.reminderTime;
    }
    if (typeof req.body.reminderTz === 'string' && req.body.reminderTz.length < 64) {
      fields.reminder_tz = req.body.reminderTz;
    }
    // Claimed achievement badges — synced so reveals follow the account.
    if (Array.isArray(req.body.claimedBadges)) {
      const ids = req.body.claimedBadges.filter((x: unknown) => typeof x === 'string').slice(0, 200);
      fields.claimed_badges = JSON.stringify(ids);
    }
    if (typeof req.body.introDone === 'boolean') fields.intro_done = req.body.introDone;
    if (Number.isFinite(Number(req.body.textScale))) {
      fields.text_scale = Math.min(1.4, Math.max(0.85, Number(req.body.textScale)));
    }
    if (typeof req.body.windDown === 'boolean') fields.wind_down = req.body.windDown;
    if (typeof req.body.shareUsage === 'boolean') {
      fields.share_usage = req.body.shareUsage;
      // Off means off, including what was counted before.
      if (!req.body.shareUsage) await query('DELETE FROM usage_counts WHERE user_id = $1', [uid]);
    }
    // Accent colour + which trackers to show.
    if (typeof req.body.accent === 'string' && req.body.accent.length < 20) fields.accent = req.body.accent;
    if (Array.isArray(req.body.modules)) {
      fields.modules = JSON.stringify(req.body.modules.filter((x: unknown) => typeof x === 'string').slice(0, 20));
    }

    const keys = Object.keys(fields);
    if (keys.length) {
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      try {
        await query(`UPDATE users SET ${sets} WHERE id = $1`, [uid, ...keys.map((k) => fields[k])]);
      } catch (e: any) {
        if (e.code === '23505') return res.status(409).json({ error: 'That email is taken' });
        throw e;
      }
    }
    res.json(await buildState(uid));
  })
);

// ---------------- Habits ----------------

app.post(
  '/api/habits',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const color = String(req.body.color || 'teal');
    const target = String(req.body.target || 'Daily');
    const days = /^[01]{7}$/.test(req.body.days) ? req.body.days : '1111111';
    const max = await one<{ m: number }>(
      'SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM habits WHERE user_id = $1',
      [uid]
    );
    const why = req.body.why ? String(req.body.why).slice(0, 300) : null;
    const cue = req.body.cue ? String(req.body.cue).trim().slice(0, 120) || null : null;
    const rt = /^\d{2}:\d{2}$/.test(req.body.reminderTime) ? req.body.reminderTime : null;
    await query(
      'INSERT INTO habits (user_id, name, color, target, days, sort, why, reminder_time, cue) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [uid, name, color, target, days, max!.m, why, rt, cue]
    );
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/habits/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const owned = await one<{ locked: boolean }>(
      'SELECT locked FROM habits WHERE id = $1 AND user_id = $2',
      [req.params.id, uid]
    );
    if (!owned) return res.status(404).json({ error: 'Habit not found' });
    if (owned.locked) return res.status(400).json({ error: 'This habit is permanent and can’t be edited' });
    const days = /^[01]{7}$/.test(req.body.days) ? req.body.days : '1111111';
    const why = req.body.why ? String(req.body.why).slice(0, 300) : null;
    const cue = req.body.cue ? String(req.body.cue).trim().slice(0, 120) || null : null;
    const rt = /^\d{2}:\d{2}$/.test(req.body.reminderTime) ? req.body.reminderTime : null;
    const paused = !!req.body.paused;
    const archived = !!req.body.archived;
    await query(
      `UPDATE habits SET name = $1, color = $2, target = $3, days = $4, why = $5,
              reminder_time = $6, paused = $7, archived = $8, cue = $9
       WHERE id = $10 AND user_id = $11`,
      [name, String(req.body.color || 'teal'), String(req.body.target || 'Daily'), days, why, rt, paused, archived, cue, req.params.id, uid]
    );
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/habits/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const owned = await one<{ locked: boolean }>(
      'SELECT locked FROM habits WHERE id = $1 AND user_id = $2',
      [req.params.id, uid]
    );
    if (owned?.locked) return res.status(400).json({ error: 'This habit is permanent and can’t be deleted' });
    await query('DELETE FROM habits WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    res.json(await buildState(uid));
  })
);

// Toggle a habit's completion for a given day (default: today).
app.post(
  '/api/habits/:id/toggle',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const owned = await one('SELECT id FROM habits WHERE id = $1 AND user_id = $2', [
      req.params.id,
      uid,
    ]);
    if (!owned) return res.status(404).json({ error: 'Habit not found' });
    const day = /^\d{4}-\d{2}-\d{2}$/.test(req.body.day)
      ? req.body.day
      : new Date().toISOString().slice(0, 10);
    const existing = await one(
      'SELECT 1 FROM habit_checkins WHERE habit_id = $1 AND day = $2',
      [req.params.id, day]
    );
    if (existing) {
      await query('DELETE FROM habit_checkins WHERE habit_id = $1 AND day = $2', [
        req.params.id,
        day,
      ]);
    } else {
      await query(
        'INSERT INTO habit_checkins (habit_id, user_id, day) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [req.params.id, uid, day]
      );
    }
    res.json(await buildState(uid));
  })
);

// Persist a new habit order (drag-to-sort).
app.patch(
  '/api/habits/order',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 200) : [];
    await tx(async (c) => {
      for (let i = 0; i < ids.length; i++) {
        await c.query('UPDATE habits SET sort = $1 WHERE id = $2 AND user_id = $3', [i, ids[i], uid]);
      }
    });
    res.json(await buildState(uid));
  })
);

// ---------------- Workout categories ----------------

app.post(
  '/api/categories',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const max = await one<{ m: number }>(
      'SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM workout_categories WHERE user_id = $1',
      [uid]
    );
    await query(
      'INSERT INTO workout_categories (user_id, name, color, sort) VALUES ($1,$2,$3,$4)',
      [uid, name, String(req.body.color || 'coral'), max!.m]
    );
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/categories/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    await query(
      'UPDATE workout_categories SET name = $1, color = $2 WHERE id = $3 AND user_id = $4',
      [name, String(req.body.color || 'coral'), req.params.id, uid]
    );
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/categories/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const cats = await query<{ id: string }>(
      'SELECT id::text FROM workout_categories WHERE user_id = $1 ORDER BY sort, id',
      [uid]
    );
    if (cats.length <= 1) return res.status(400).json({ error: 'Keep at least one category' });
    const fallback = cats.find((c) => c.id !== req.params.id)!.id;
    await tx(async (c) => {
      await c.query('UPDATE workouts SET category_id = $1 WHERE category_id = $2 AND user_id = $3', [
        fallback,
        req.params.id,
        uid,
      ]);
      await c.query('DELETE FROM workout_categories WHERE id = $1 AND user_id = $2', [
        req.params.id,
        uid,
      ]);
    });
    res.json(await buildState(uid));
  })
);

// ---------------- Workouts ----------------

/**
 * Normalise a strength-set list coming from the client. Sets are stored as
 * JSONB, so this is the only guard against junk reaching the column: cap the
 * count, coerce every field, and drop anything without an exercise name.
 */
function cleanSets(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = raw
    .slice(0, 100)
    .map((s: any) => ({
      ex: String(s?.ex ?? '').trim().slice(0, 60),
      reps: Math.max(0, Math.min(9999, Math.round(Number(s?.reps) || 0))),
      weight: s?.weight == null || s.weight === '' ? null : Math.max(0, Math.min(9999, Number(s.weight) || 0)),
    }))
    .filter((s) => s.ex);
  return out.length ? JSON.stringify(out) : null;
}

app.post(
  '/api/workouts',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const cat = await one<{ id: string; name: string }>(
      'SELECT id::text, name FROM workout_categories WHERE id = $1 AND user_id = $2',
      [req.body.catId, uid]
    );
    if (!cat) return res.status(400).json({ error: 'Unknown category' });
    const name = String(req.body.name || '').trim() || cat.name;
    // Optional explicit timestamp lets the user log a workout for a past day.
    const ts =
      req.body.ts != null && Number.isFinite(Number(req.body.ts))
        ? new Date(Number(req.body.ts))
        : new Date();
    await query(
      `INSERT INTO workouts (user_id, category_id, name, dur, dist, kcal, intensity, ts, note, sets)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        uid,
        cat.id,
        name,
        Number(req.body.dur) || 0,
        req.body.dist ? String(req.body.dist) : null,
        req.body.kcal ? Number(req.body.kcal) : null,
        req.body.intensity ? String(req.body.intensity) : null,
        ts,
        req.body.note ? String(req.body.note).slice(0, 500) : null,
        cleanSets(req.body.sets),
      ]
    );
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/workouts/:id',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query(
      // `sets` is only touched when the client sends the key at all, so edits
      // that don't involve strength logging can't wipe an existing set list.
      `UPDATE workouts SET
         dur = $1,
         category_id = COALESCE($2, category_id),
         dist = $3, kcal = $4,
         sets = CASE WHEN $5::boolean THEN $6::jsonb ELSE sets END
       WHERE id = $7 AND user_id = $8`,
      [
        Number(req.body.dur) || 0,
        req.body.catId || null,
        req.body.dist ? String(req.body.dist) : null,
        req.body.kcal ? Number(req.body.kcal) : null,
        Object.prototype.hasOwnProperty.call(req.body, 'sets'),
        cleanSets(req.body.sets),
        req.params.id,
        uid,
      ]
    );
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/workouts/:id',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('DELETE FROM workouts WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    res.json(await buildState(uid));
  })
);

// ---------------- Nights ----------------

app.post(
  '/api/nights',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    // Optional explicit timestamp lets the user log a night for a past day.
    const ts =
      req.body.ts != null && Number.isFinite(Number(req.body.ts))
        ? new Date(Number(req.body.ts))
        : new Date();
    await query(
      'INSERT INTO nights (user_id, hours, quality, bed_h, wake_h, ts, note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        uid,
        Number(req.body.hours) || 0,
        Number(req.body.quality) || 0,
        req.body.bedH != null ? Number(req.body.bedH) : null,
        req.body.wakeH != null ? Number(req.body.wakeH) : null,
        ts,
        req.body.note ? String(req.body.note).slice(0, 500) : null,
      ]
    );
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/nights/:id',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('DELETE FROM nights WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    res.json(await buildState(uid));
  })
);

// ---------------- Transactions ----------------

// Receipts are stored as base64 data URLs. The client already downscales and
// re-encodes to JPEG before upload; this is the backstop so one oversized image
// can't bloat a shared free-tier database.
const MAX_PHOTO_BYTES = 400_000;
function cleanPhoto(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('data:image/')) return null;
  if (raw.length > MAX_PHOTO_BYTES) return null;
  return raw;
}

/** Attach, replace or clear a transaction's receipt. `undefined` leaves it alone. */
async function saveTxnPhoto(uid: number, txnId: string | number, raw: unknown): Promise<void> {
  if (raw === undefined) return;
  if (raw === null || raw === '') {
    await query('DELETE FROM txn_photos WHERE txn_id = $1 AND user_id = $2', [txnId, uid]);
    return;
  }
  const data = cleanPhoto(raw);
  if (!data) return;
  await query(
    `INSERT INTO txn_photos (txn_id, user_id, data) VALUES ($1,$2,$3)
     ON CONFLICT (txn_id) DO UPDATE SET data = EXCLUDED.data, created_at = now()`,
    [txnId, uid, data]
  );
}

// Fetched on demand when the user actually opens a receipt, so images never
// ride along with the state bundle.
app.get(
  '/api/txns/:id/photo',
  requireAuth,
  wrap(async (req, res) => {
    const row = await one<{ data: string }>(
      'SELECT data FROM txn_photos WHERE txn_id = $1 AND user_id = $2',
      [req.params.id, req.userId!]
    );
    if (!row) return res.status(404).json({ error: 'No receipt' });
    res.json({ photo: row.data });
  })
);

app.put(
  '/api/txns/:id/photo',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const owns = await one('SELECT id FROM txns WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    if (!owns) return res.status(404).json({ error: 'Not found' });
    if (req.body.photo && !cleanPhoto(req.body.photo)) {
      return res.status(413).json({ error: 'That image is too large — try a smaller photo' });
    }
    await saveTxnPhoto(uid, req.params.id, req.body.photo ?? null);
    res.json(await buildState(uid));
  })
);

/**
 * Validate a transfer's destination account.
 *
 * A transfer is a row carrying `to_acc_id`. It must name two different accounts
 * that both belong to this user, or the balances it produces are meaningless —
 * and a destination pointing at someone else's account would be worse than
 * meaningless. Returns the id to store, or throws for the caller to 400 on.
 */
async function transferTarget(uid: number, body: Record<string, unknown>): Promise<string | null> {
  const to = body.toAccId ? String(body.toAccId) : null;
  if (!to) return null;
  const from = body.accId ? String(body.accId) : null;
  if (!from) throw new Error('A transfer needs an account to move money from');
  if (from === to) throw new Error('Pick two different accounts');
  const own = await query<{ id: string }>(
    'SELECT id::text FROM accounts WHERE user_id = $1 AND id = ANY($2::bigint[])',
    [uid, [from, to]]
  );
  if (own.length !== 2) throw new Error('Account not found');
  return to;
}

app.post(
  '/api/txns',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const amt = Number(req.body.amount);
    if (!amt) return res.status(400).json({ error: 'Amount required' });
    let toAccId: string | null;
    try {
      toAccId = await transferTarget(uid, req.body);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
    // A transfer is never income: it always leaves the source account, and the
    // destination side is derived from the sign when balances are computed.
    // A balance correction keeps the sign it was sent with — it can go either
    // way, and which way is the whole content of the entry.
    const adjust = !toAccId && !!req.body.adjust;
    const income = !toAccId && !adjust && !!req.body.income;
    // Money back for a purchase: positive, but not income.
    const refund = !toAccId && !adjust && !income && !!req.body.refund;
    const cat = toAccId ? 'Transfer' : adjust ? 'Adjustment' : String(req.body.cat || 'Other');
    const ts = req.body.ts ? new Date(Number(req.body.ts)) : new Date();
    const row = await one<{ id: string }>(
      `INSERT INTO txns (user_id, name, cat, amount, income, acc_id, to_acc_id, adjust, note, ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text`,
      [
        uid,
        String(req.body.name || cat),
        cat,
        adjust ? amt : income || refund ? Math.abs(amt) : -Math.abs(amt),
        income,
        req.body.accId || null,
        toAccId,
        adjust,
        req.body.note ? String(req.body.note) : null,
        ts,
      ]
    );
    if (row) await saveTxnPhoto(uid, row.id, req.body.photo);
    res.json(await buildState(uid));
  })
);

// Payments read out of the phone's bank messages.
//
// A batch, because the device catches up on everything since it last looked and
// sending twenty separate requests over a patchy connection is twenty chances
// to half-fail.
//
// The message text is not sent and is not stored. What arrives is what the
// device read out of it (an amount, a name, a date, which bank and card) and a
// hash of the message, which is the only thing that makes a repeat
// recognisable.
//
// The device has already done the reading: categories, currency, which
// messages are the same payment, which pairs are a transfer between the user's
// own accounts. This end does what needs the database: finds or creates the
// account each message belongs to, keeps each account's last reported balance,
// and writes the entries.
//
// Every entry is keyed on (user_id, sms_key). That is the duplicate story, and
// it belongs here rather than on the device: a phone only knows the messages it
// has read itself, so two phones on one account would each import the same
// payment. A key that already exists is rewritten only while the entry is still
// as the import left it (txns.auto), which is how a better reader can fix
// entries an older one got wrong without undoing anything the user changed.

// Categories an import may create when the user has nothing that fits. Mirrors
// CREATABLE in web/src/lib/merchants.ts.
const SMS_CATEGORIES: Record<string, { icon: string; color: string; kind: 'expense' | 'income' }> = {
  Groceries: { icon: 'cart', color: 'emerald', kind: 'expense' },
  'Eating out': { icon: 'food', color: 'coral', kind: 'expense' },
  Coffee: { icon: 'coffee', color: 'amber', kind: 'expense' },
  Fuel: { icon: 'car', color: 'blue', kind: 'expense' },
  Bills: { icon: 'bolt', color: 'amber', kind: 'expense' },
  Subscriptions: { icon: 'repeat', color: 'purple', kind: 'expense' },
  Fitness: { icon: 'heart', color: 'rose', kind: 'expense' },
  Travel: { icon: 'star', color: 'teal', kind: 'expense' },
  Education: { icon: 'laptop', color: 'cyan', kind: 'expense' },
  Cash: { icon: 'cash', color: 'emerald', kind: 'expense' },
  Transfers: { icon: 'repeat', color: 'blue', kind: 'expense' },
  Fees: { icon: 'other', color: 'text2', kind: 'expense' },
  Income: { icon: 'cash', color: 'emerald', kind: 'income' },
};

const ACCOUNT_TYPES = ['Bank', 'Credit card', 'Wallet', 'Cash'];
const ACCOUNT_COLOR: Record<string, string> = { Bank: 'blue', 'Credit card': 'indigo', Wallet: 'rose', Cash: 'emerald' };

interface SmsLinkIn {
  sender: string;
  card: string;
  label: string;
  type: string;
}

function readLink(v: unknown): SmsLinkIn | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const sender = String(o.sender || '').trim().slice(0, 40);
  if (!sender) return null;
  const card = o.card ? String(o.card).replace(/\D/g, '').slice(-4) : '';
  const label = String(o.label || sender).trim().slice(0, 60) || sender;
  const type = ACCOUNT_TYPES.includes(String(o.type)) ? String(o.type) : 'Bank';
  return { sender, card, label, type };
}

/**
 * The account a bank message belongs to, created the first time a sender is
 * seen. The first two steps mirror accountForLink in web/src/lib/ledger.ts.
 */
async function accountForSms(c: PoolClient, uid: number, l: SmsLinkIn, seen: Map<string, string>): Promise<string> {
  const k = `${l.sender.toLowerCase()}|${l.card}`;
  const known = seen.get(k);
  if (known) return known;

  // 1. This sender and card has been seen before.
  let id: string | undefined = (
    await c.query<{ id: string }>(
      'SELECT acc_id::text AS id FROM account_links WHERE user_id = $1 AND lower(sender) = lower($2) AND card = $3',
      [uid, l.sender, l.card]
    )
  ).rows[0]?.id;

  // 2. A new card or account number from a bank the user has one account
  //    with. A debit card and the account behind it are the same money.
  if (!id && l.type !== 'Credit card') {
    const r = await c.query<{ id: string }>(
      `SELECT DISTINCT a.id::text AS id FROM account_links k JOIN accounts a ON a.id = k.acc_id
       WHERE k.user_id = $1 AND lower(k.sender) = lower($2) AND a.type <> 'Credit card'`,
      [uid, l.sender]
    );
    if (r.rows.length === 1) id = r.rows[0].id;
  }

  // 3. An account the user made by hand for this bank before turning
  //    tracking on: "CIB", "CIB current". Cash is never one of them; a
  //    "Vodafone Cash" wallet is not the money in someone's pocket.
  if (!id) {
    const r = await c.query<{ id: string; name: string; type: string }>(
      `SELECT a.id::text AS id, a.name, a.type FROM accounts a
       WHERE a.user_id = $1 AND a.type <> 'Cash'
         AND NOT EXISTS (SELECT 1 FROM account_links k WHERE k.acc_id = a.id)
         AND position(lower($2) in lower(a.name)) > 0
       ORDER BY a.sort, a.id`,
      [uid, l.sender]
    );
    const fit = r.rows.filter((a) => (a.type === 'Credit card') === (l.type === 'Credit card'));
    const best = (l.card && fit.find((a) => a.name.includes(l.card))) || fit[0];
    if (best) id = best.id;
  }

  // 4. A bank the user hasn't told the app about: open an account for it.
  //    It starts at zero and takes its balance from the first message that
  //    reports one.
  if (!id) {
    const max = await c.query<{ m: number }>('SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM accounts WHERE user_id = $1', [uid]);
    id = (
      await c.query<{ id: string }>(
        'INSERT INTO accounts (user_id, name, type, color, opening, sort) VALUES ($1,$2,$3,$4,0,$5) RETURNING id::text AS id',
        [uid, l.label, l.type, ACCOUNT_COLOR[l.type] || 'blue', max.rows[0].m]
      )
    ).rows[0].id;
  }

  await c.query('INSERT INTO account_links (user_id, acc_id, sender, card) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [
    uid,
    id,
    l.sender,
    l.card,
  ]);
  seen.set(k, id);
  return id;
}

/** Keep an account's reported balance, unless a newer one is already held. */
async function anchorBalance(c: PoolClient, uid: number, accId: string, balance: unknown, ts: Date) {
  const b = Number(balance);
  if (balance == null || !isFinite(b) || Math.abs(b) > 1e11) return;
  await c.query(
    `UPDATE accounts SET sms_balance = $1, sms_balance_ts = $2
     WHERE id = $3 AND user_id = $4 AND (sms_balance_ts IS NULL OR sms_balance_ts <= $2)`,
    [b, ts, accId, uid]
  );
}

/**
 * A message that must never become an entry of its own: another copy of a
 * payment already recorded, or the other half of a transfer. If an earlier
 * import wrote it as an entry, that entry goes, unless the user has made it
 * their own.
 */
async function ignoreSms(c: PoolClient, uid: number, key: string) {
  if (!key) return;
  await c.query('INSERT INTO sms_ignored (user_id, sms_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, key]);
  await c.query('DELETE FROM txns WHERE user_id = $1 AND sms_key = $2 AND auto', [uid, key]);
}

interface SmsEntry {
  name: string;
  cat: string;
  amount: number;
  income: boolean;
  accId: string | null;
  toAccId: string | null;
  note: string | null;
  ts: Date;
  key: string;
  review: boolean;
  /** A hand-typed entry this may be the same payment as. */
  dupOf?: string | null;
  /** The other message of a possible transfer between the user's accounts. */
  pairKey?: string | null;
}

async function writeSms(c: PoolClient, uid: number, e: SmsEntry) {
  await c.query(
    `INSERT INTO txns (user_id, name, cat, amount, income, acc_id, to_acc_id, note, ts, sms_key, review, auto, dup_of, pair_key)
     SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,$13
     WHERE NOT EXISTS (SELECT 1 FROM sms_ignored WHERE user_id = $1 AND sms_key = $10)
     ON CONFLICT (user_id, sms_key) WHERE sms_key IS NOT NULL DO UPDATE SET
       name = EXCLUDED.name, cat = EXCLUDED.cat, amount = EXCLUDED.amount, income = EXCLUDED.income,
       acc_id = EXCLUDED.acc_id, to_acc_id = EXCLUDED.to_acc_id, note = EXCLUDED.note, ts = EXCLUDED.ts,
       review = EXCLUDED.review, dup_of = EXCLUDED.dup_of, pair_key = EXCLUDED.pair_key
     WHERE txns.auto`,
    [uid, e.name, e.cat, e.amount, e.income, e.accId, e.toAccId, e.note, e.ts, e.key, e.review, e.dupOf ?? null, e.pairKey ?? null]
  );
  // An entry the user already edited keeps their wording, but one an older
  // import left without an account can still be given the right one.
  if (e.accId) {
    await c.query('UPDATE txns SET acc_id = $1 WHERE user_id = $2 AND sms_key = $3 AND acc_id IS NULL AND NOT auto', [e.accId, uid, e.key]);
  }
}

app.post(
  '/api/txns/sms',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 300) : [];
    // Not "now": a first import walks back through old messages, and dating
    // them today would pile a year of spending onto one afternoon.
    const soon = Date.now() + 86400000;
    const str = (v: unknown, n: number) => (v == null ? '' : String(v).trim().slice(0, n));
    const keyOf = (v: unknown) => str(v, 80);

    await tx(async (c) => {
      const seen = new Map<string, string>();

      // Categories first, so every entry below lands in one that exists.
      const have = new Set(
        (await c.query<{ n: string }>('SELECT lower(name) AS n FROM fcats WHERE user_id = $1', [uid])).rows.map((r) => r.n)
      );
      const ensureCat = async (cat: string) => {
        const spec = SMS_CATEGORIES[cat];
        if (!spec || have.has(cat.toLowerCase())) return;
        await c.query(
          `INSERT INTO fcats (user_id, name, icon, color, kind, sort)
           SELECT $1,$2,$3,$4,$5, COALESCE(MAX(sort), -1) + 1 FROM fcats WHERE user_id = $1`,
          [uid, cat, spec.icon, spec.color, spec.kind]
        );
        have.add(cat.toLowerCase());
      };
      for (const it of items) {
        await ensureCat(str(it?.cat, 60));
        if (Number(it?.fee) > 0) await ensureCat(str(it?.feeCat, 60) || 'Fees');
      }

      for (const it of items) {
        const key = keyOf(it?.key);
        if (!key) continue;
        const amt = Math.abs(Number(it.amount));
        if (!isFinite(amt) || amt <= 0 || amt > 1e9) continue;
        const t = Number(it.ts);
        if (!isFinite(t) || t <= 0 || t > soon) continue;
        const ts = new Date(t);
        const link = readLink(it.link);
        const accId = link ? await accountForSms(c, uid, link, seen) : null;
        if (accId) await anchorBalance(c, uid, accId, it.balance, ts);

        const also: string[] = Array.isArray(it.alsoKeys) ? it.alsoKeys.slice(0, 10).map(keyOf).filter(Boolean) : [];
        // A copy the user already edited stands for the payment; this one is the repeat.
        const kept = also.length
          ? await c.query('SELECT 1 FROM txns WHERE user_id = $1 AND sms_key = ANY($2::text[]) AND NOT auto LIMIT 1', [uid, also])
          : { rowCount: 0 };
        if (kept.rowCount) {
          await ignoreSms(c, uid, key);
          for (const k of also) await c.query('INSERT INTO sms_ignored (user_id, sms_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, k]);
          continue;
        }
        for (const k of also) await ignoreSms(c, uid, k);

        // Already recorded from another message.
        if (it.dupOf) {
          await ignoreSms(c, uid, key);
          continue;
        }

        const name = str(it.name, 120) || 'Bank';
        const note = str(it.note, 200) || null;
        const review = !!it.review;
        const fee = Math.abs(Number(it.fee)) || 0;
        const feeCat = str(it.feeCat, 60) || 'Fees';

        // Where the money went, when it stayed the user's own.
        const from: string | null = accId;
        let to: string | null = null;
        let toBalance: unknown = null;
        let pairedAt: Date | null = null;
        const toLink = readLink(it.toLink);
        if (toLink) {
          to = await accountForSms(c, uid, toLink, seen);
          toBalance = it.toBalance;
        } else if (it.toAccId) {
          const own = await c.query<{ id: string }>('SELECT id::text AS id FROM accounts WHERE id = $1 AND user_id = $2', [
            String(it.toAccId),
            uid,
          ]);
          to = own.rows[0]?.id || null;
        } else if (it.pairOf) {
          // The other half arrived in an earlier batch. If it is still as
          // imported, the two become one transfer; otherwise the user has
          // already said what it was, and this one is filed as read.
          const other = await c.query<{ id: string; acc: string; key: string | null; amount: number; ts: Date }>(
            `SELECT id::text AS id, acc_id::text AS acc, sms_key AS key, amount, ts FROM txns
             WHERE id = $1 AND user_id = $2 AND auto AND to_acc_id IS NULL AND acc_id IS NOT NULL`,
            [String(it.pairOf), uid]
          );
          const o = other.rows[0];
          if (o && accId && o.acc !== accId) {
            // Dated at the earlier half. Each side's reported balance already
            // includes the move, and an entry dated at or before a reported
            // balance is not added to it again.
            const when = o.ts < ts ? o.ts : ts;
            if (it.income) {
              // The money-out half is already an entry: it becomes the
              // transfer, keyed by its own message, and this one is the echo.
              // Its amount included any fee; the fee is spending of its own.
              const fee = Math.round((Math.abs(Number(o.amount)) - amt) * 100) / 100;
              await c.query(
                `UPDATE txns SET name = 'Transfer', cat = 'Transfer', amount = $1, income = FALSE, to_acc_id = $2,
                        ts = $3, review = FALSE
                 WHERE id = $4 AND user_id = $5`,
                [-amt, accId, when, o.id, uid]
              );
              if (o.key && fee > 0 && fee < amt * 0.05) {
                await ensureCat(feeCat);
                await writeSms(c, uid, {
                  name: 'Transfer fee',
                  cat: feeCat,
                  amount: -fee,
                  income: false,
                  accId: o.acc,
                  toAccId: null,
                  note: null,
                  ts: when,
                  key: `${o.key}:fee`.slice(0, 90),
                  review: false,
                });
              }
              await ignoreSms(c, uid, key);
              continue;
            }
            // This is the money-out half: it becomes the transfer, and the
            // money-in entry already recorded goes.
            to = o.acc;
            pairedAt = when;
            await c.query('DELETE FROM txns WHERE id = $1 AND user_id = $2', [o.id, uid]);
            if (o.key) await c.query('INSERT INTO sms_ignored (user_id, sms_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, o.key]);
          }
        }
        if (to && to === from) {
          // Both ends are one account (a debit card paying into the account
          // behind it): nothing moved.
          await ignoreSms(c, uid, key);
          continue;
        }
        if (toLink && to) {
          // Each half's balance is anchored at its own message's time, and the
          // transfer is dated at the earlier of the two, so both reported
          // balances already include it and neither adds it again.
          const tt = Number(it.toTs);
          const inAt = isFinite(tt) && tt > 0 && tt <= soon ? new Date(tt) : ts;
          if (toBalance != null) await anchorBalance(c, uid, to, toBalance, inAt);
          pairedAt = inAt < ts ? inAt : ts;
        }

        if (to) {
          await writeSms(c, uid, {
            name: it.toAccId && !toLink ? name : 'Transfer',
            cat: 'Transfer',
            amount: -amt,
            income: false,
            accId: from,
            toAccId: to,
            note,
            ts: pairedAt || ts,
            key,
            review: false,
          });
          if (fee > 0) {
            await writeSms(c, uid, {
              name: it.toAccId && !toLink ? 'ATM fee' : 'Transfer fee',
              cat: feeCat,
              amount: -fee,
              income: false,
              accId: from,
              toAccId: null,
              note: null,
              ts: pairedAt || ts,
              key: `${key}:fee`.slice(0, 90),
              review: false,
            });
          }
          continue;
        }

        // A refund is money back for spending: positive, but not income, so it
        // lowers the month's spending instead of inflating its earnings.
        const income = !!it.income && !it.refund;
        // Only a hand-typed entry of this user's can be the one it may repeat.
        const typed = /^\d+$/.test(String(it.maybeSameAs || ''))
          ? await c.query('SELECT 1 FROM txns WHERE id = $1 AND user_id = $2 AND sms_key IS NULL', [String(it.maybeSameAs), uid])
          : { rowCount: 0 };
        await writeSms(c, uid, {
          name,
          cat: str(it.cat, 60) || (income ? 'Income' : 'Other'),
          amount: income || it.refund ? amt : -amt,
          income,
          accId,
          toAccId: null,
          note,
          ts,
          key,
          review: review || !!typed.rowCount,
          dupOf: typed.rowCount ? String(it.maybeSameAs) : null,
          pairKey: keyOf(it.pairKey) || null,
        });
      }
    });

    // A bill or salary waiting for its bank message may have just got it.
    await runRecurring(uid);

    // A plain state, like every other write. The count of what was actually
    // new is worked out on the device by diffing ids: this response also
    // travels through the offline queue, which replays a failed op later and
    // applies whatever comes back as the app state, so it cannot be a
    // different shape from every other one.
    res.json(await buildState(uid));
  })
);

// "Is this the payment you typed in?" Same: the bank's version stays (it has
// the shop, the account and the minute) and takes what the user gave theirs, a
// category, a note, a receipt; the typed one goes. Different: both stay, and
// the question isn't asked again.
app.post(
  '/api/txns/:id/same',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const id = String(req.params.id);
    const row = await one<{ dup: string | null; note: string | null }>(
      'SELECT dup_of::text AS dup, note FROM txns WHERE id = $1 AND user_id = $2',
      [id, uid]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    await tx(async (c) => {
      if (req.body.same && row.dup) {
        const typed = (
          await c.query<{ cat: string; note: string | null; recurring: string | null }>(
            `SELECT cat, note, recurring_id::text AS recurring FROM txns
             WHERE id = $1 AND user_id = $2 AND sms_key IS NULL`,
            [row.dup, uid]
          )
        ).rows[0];
        if (typed) {
          await c.query(
            `UPDATE txns SET cat = CASE WHEN $1 IN ('Other', '') THEN cat ELSE $1 END,
                    note = COALESCE(note, $2), recurring_id = COALESCE(recurring_id, $3::bigint)
             WHERE id = $4 AND user_id = $5`,
            [typed.cat, typed.note, typed.recurring, id, uid]
          );
          // A receipt photo moves to the entry that stays, if it has none.
          await c.query(
            `UPDATE txn_photos SET txn_id = $1 WHERE txn_id = $2
               AND NOT EXISTS (SELECT 1 FROM txn_photos WHERE txn_id = $1)`,
            [id, row.dup]
          );
          await c.query('DELETE FROM txns WHERE id = $1 AND user_id = $2', [row.dup, uid]);
        }
      }
      await c.query('UPDATE txns SET dup_of = NULL, review = FALSE, auto = FALSE WHERE id = $1 AND user_id = $2', [id, uid]);
    });
    res.json(await buildState(uid));
  })
);

// "Yes, that was me moving my own money." Two imported entries, money out of
// one account and the same amount into another, become one transfer: the
// money-out entry turns into it, keyed by its own message, and the money-in
// entry goes. A difference between the two amounts is the fee.
app.post(
  '/api/txns/:id/pair',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const ids = [String(req.params.id), String(req.body.with || '')];
    const rows = await query<{ id: string; acc: string | null; amount: number; ts: Date; key: string | null }>(
      `SELECT id::text, acc_id::text AS acc, amount, ts, sms_key AS key FROM txns
       WHERE user_id = $1 AND id = ANY($2::bigint[]) AND to_acc_id IS NULL AND NOT adjust`,
      [uid, ids.filter((x) => /^\d+$/.test(x))]
    );
    const out = rows.find((r) => r.amount < 0);
    const into = rows.find((r) => r.amount > 0);
    if (rows.length !== 2 || !out || !into || !out.acc || !into.acc || out.acc === into.acc) {
      return res.status(400).json({ error: 'Those two can’t be one transfer' });
    }
    const amt = Math.abs(Number(into.amount));
    const fee = Math.round((Math.abs(Number(out.amount)) - amt) * 100) / 100;
    const when = out.ts < into.ts ? out.ts : into.ts;
    await tx(async (c) => {
      await c.query(
        `UPDATE txns SET name = 'Transfer', cat = 'Transfer', amount = $1, income = FALSE, to_acc_id = $2, ts = $3,
                review = FALSE, auto = FALSE, pair_key = NULL, dup_of = NULL
         WHERE id = $4 AND user_id = $5`,
        [-amt, into.acc, when, out.id, uid]
      );
      if (fee > 0 && fee < amt * 0.05) {
        await c.query(
          `INSERT INTO fcats (user_id, name, icon, color, kind, sort)
           SELECT $1, 'Fees', 'other', 'text2', 'expense', COALESCE(MAX(sort), -1) + 1 FROM fcats WHERE user_id = $1
           HAVING NOT EXISTS (SELECT 1 FROM fcats WHERE user_id = $1 AND lower(name) = 'fees')`,
          [uid]
        );
        await c.query(
          `INSERT INTO txns (user_id, name, cat, amount, income, acc_id, ts, sms_key)
           VALUES ($1, 'Transfer fee', 'Fees', $2, FALSE, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [uid, -fee, out.acc, when, out.key ? `${out.key}:fee`.slice(0, 90) : null]
        );
      }
      await c.query('DELETE FROM txns WHERE id = $1 AND user_id = $2', [into.id, uid]);
      if (into.key) await c.query('INSERT INTO sms_ignored (user_id, sms_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, into.key]);
    });
    res.json(await buildState(uid));
  })
);

// Mark imported entries as looked at.
app.post(
  '/api/txns/reviewed',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 1000).map(String) : [];
    if (ids.length) {
      await query('UPDATE txns SET review = FALSE WHERE user_id = $1 AND id = ANY($2::bigint[])', [uid, ids]);
    }
    res.json(await buildState(uid));
  })
);

// One category for several entries at once: "everything from this shop is
// Groceries". The device picks the entries; this only applies the change.
app.post(
  '/api/txns/recat',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 2000).map(String) : [];
    const cat = String(req.body.cat || '').trim().slice(0, 60);
    if (!cat) return res.status(400).json({ error: 'Category required' });
    if (ids.length) {
      await query(
        `UPDATE txns SET cat = $1, review = FALSE, auto = FALSE
         WHERE user_id = $2 AND id = ANY($3::bigint[]) AND to_acc_id IS NULL AND NOT adjust`,
        [cat, uid, ids]
      );
    }
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/txns/:id',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const amt = Number(req.body.amount);
    if (!amt) return res.status(400).json({ error: 'Amount required' });
    let toAccId: string | null;
    try {
      toAccId = await transferTarget(uid, req.body);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
    const income = !toAccId && !!req.body.income;
    // Money back for a purchase stays positive without counting as income.
    const refund = !toAccId && !income && !!req.body.refund;
    const cat = toAccId ? 'Transfer' : String(req.body.cat || 'Other');
    const ts = req.body.ts ? new Date(Number(req.body.ts)) : new Date();
    await query(
      // Edited by hand: no longer a guess to review, and no later import may
      // overwrite it.
      `UPDATE txns SET name=$1, cat=$2, amount=$3, income=$4, acc_id=$5, to_acc_id=$6, note=$7, ts=$8,
              review=FALSE, auto=FALSE
       WHERE id=$9 AND user_id=$10`,
      [
        String(req.body.name || cat),
        cat,
        income || refund ? Math.abs(amt) : -Math.abs(amt),
        income,
        req.body.accId || null,
        toAccId,
        req.body.note ? String(req.body.note) : null,
        ts,
        req.params.id,
        uid,
      ]
    );
    await saveTxnPhoto(uid, req.params.id, req.body.photo);
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/txns/:id',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const gone = await one<{ k: string | null }>(
      'DELETE FROM txns WHERE id = $1 AND user_id = $2 RETURNING sms_key AS k',
      [req.params.id, uid]
    );
    // An imported payment that gets deleted must stay deleted: the message it
    // came from is still in the phone's inbox and a later re-scan would find it
    // again. See the sms_ignored table.
    if (gone?.k) {
      await query('INSERT INTO sms_ignored (user_id, sms_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, gone.k]);
    }
    res.json(await buildState(uid));
  })
);

// ---------------- Accounts ----------------

app.post(
  '/api/accounts',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const max = await one<{ m: number }>(
      'SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM accounts WHERE user_id = $1',
      [uid]
    );
    await query(
      'INSERT INTO accounts (user_id, name, type, color, opening, sort) VALUES ($1,$2,$3,$4,$5,$6)',
      [uid, name, String(req.body.type || 'Bank'), String(req.body.color || 'blue'), Number(req.body.opening) || 0, max!.m]
    );
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/accounts/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    await query(
      'UPDATE accounts SET name=$1, type=$2, color=$3, opening=$4 WHERE id=$5 AND user_id=$6',
      [name, String(req.body.type || 'Bank'), String(req.body.color || 'blue'), Number(req.body.opening) || 0, req.params.id, uid]
    );
    // "It's 12,400 right now": the same kind of fact a bank message reports,
    // so it is kept the same way, and whatever is logged afterwards adds to it.
    if (req.body.balanceNow != null && isFinite(Number(req.body.balanceNow))) {
      await query('UPDATE accounts SET sms_balance = $1, sms_balance_ts = now() WHERE id = $2 AND user_id = $3', [
        Number(req.body.balanceNow),
        req.params.id,
        uid,
      ]);
    }
    res.json(await buildState(uid));
  })
);

// Stop filing a sender's messages here. The next one from it finds or opens
// another account.
app.post(
  '/api/accounts/:id/unlink',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('DELETE FROM account_links WHERE user_id = $1 AND acc_id = $2 AND lower(sender) = lower($3) AND card = $4', [
      uid,
      req.params.id,
      String(req.body.sender || ''),
      req.body.card ? String(req.body.card) : '',
    ]);
    res.json(await buildState(uid));
  })
);

// Two accounts that are really one: the debit card the app met before the
// account behind it, or a bank account made by hand before tracking began.
// Everything moves into the second, including where future messages go.
app.post(
  '/api/accounts/:id/merge',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const from = String(req.params.id);
    const into = String(req.body.into || '');
    if (!into || into === from) return res.status(400).json({ error: 'Pick another account' });
    const both = await query<{ id: string; opening: number; b: number | null; bts: Date | null }>(
      `SELECT id::text AS id, opening, sms_balance AS b, sms_balance_ts AS bts FROM accounts
       WHERE user_id = $1 AND id = ANY($2::bigint[])`,
      [uid, [from, into]]
    );
    if (both.length !== 2) return res.status(404).json({ error: 'Account not found' });
    const src = both.find((a) => a.id === from)!;
    const dst = both.find((a) => a.id === into)!;
    // Both reported a balance: they were one bank account seen through two
    // numbers, and the newer report is the truth. Only one: that one.
    const anchor = !src.bts ? dst : !dst.bts ? src : src.bts > dst.bts ? src : dst;
    await tx(async (c) => {
      // A transfer between the two is a move from an account to itself.
      await c.query(
        'DELETE FROM txns WHERE user_id = $1 AND ((acc_id = $2 AND to_acc_id = $3) OR (acc_id = $3 AND to_acc_id = $2))',
        [uid, from, into]
      );
      await c.query('UPDATE txns SET acc_id = $3 WHERE user_id = $1 AND acc_id = $2', [uid, from, into]);
      await c.query('UPDATE txns SET to_acc_id = $3 WHERE user_id = $1 AND to_acc_id = $2', [uid, from, into]);
      await c.query('UPDATE recurring SET acc_id = $3 WHERE user_id = $1 AND acc_id = $2', [uid, from, into]);
      await c.query('UPDATE goals SET acc_id = $3 WHERE user_id = $1 AND acc_id = $2', [uid, from, into]);
      await c.query('UPDATE account_links SET acc_id = $3 WHERE user_id = $1 AND acc_id = $2', [uid, from, into]);
      await c.query('UPDATE accounts SET opening = $1, sms_balance = $2, sms_balance_ts = $3 WHERE id = $4 AND user_id = $5', [
        (Number(src.opening) || 0) + (Number(dst.opening) || 0),
        anchor.b,
        anchor.bts,
        into,
        uid,
      ]);
      await c.query('DELETE FROM accounts WHERE id = $1 AND user_id = $2', [from, uid]);
    });
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/accounts/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await tx(async (c) => {
      // A transfer names both ends. With one of them gone the row describes a
      // move to or from nowhere, and keeping it would be worse than dropping it:
      // clearing the destination turns it into an ordinary expense, silently
      // inflating spending for a month the user may already have reviewed.
      // Ordinary transactions keep their history and merely lose the link.
      await c.query(
        'DELETE FROM txns WHERE user_id = $1 AND to_acc_id IS NOT NULL AND (acc_id = $2 OR to_acc_id = $2)',
        [uid, req.params.id]
      );
      await c.query('UPDATE txns SET acc_id = NULL WHERE acc_id = $1 AND user_id = $2', [req.params.id, uid]);
      await c.query('UPDATE recurring SET acc_id = NULL WHERE acc_id = $1 AND user_id = $2', [req.params.id, uid]);
      await c.query('UPDATE goals SET acc_id = NULL WHERE acc_id = $1 AND user_id = $2', [req.params.id, uid]);
      await c.query('DELETE FROM accounts WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    });
    res.json(await buildState(uid));
  })
);

// ---------------- Exchange rates ----------------

// What a foreign-currency payment is worth in the user's own currency. A card
// used abroad or a dollar subscription arrives in dollars; a ledger kept in
// pounds that adds 30 where 1,450 belongs is wrong by the whole exchange rate.
// Fetched from a free daily feed (fx.ts) and held for half a day: entries
// need the day's rate, not the minute's.
const fxCache = new Map<string, { at: number; rates: Record<string, number> }>();
const FX_TTL = 12 * 3600_000;

app.get(
  '/api/fx',
  requireAuth,
  wrap(async (req, res) => {
    const base = String(req.query.base || 'EGP').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (base.length !== 3) return res.status(400).json({ error: 'Currency required' });
    const hit = fxCache.get(base);
    if (hit && Date.now() - hit.at < FX_TTL) return res.json({ base, rates: hit.rates, at: hit.at });
    const rates = await fetchRates(base);
    if (rates) {
      fxCache.set(base, { at: Date.now(), rates });
      return res.json({ base, rates, at: Date.now() });
    }
    // A stale rate beats none; no rate at all, and the device falls back to
    // its own rough table and flags the entries for a look.
    if (hit) return res.json({ base, rates: hit.rates, at: hit.at });
    res.status(503).json({ error: 'Rates unavailable' });
  })
);

// ---------------- Finance categories ----------------

app.post(
  '/api/fcats',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const max = await one<{ m: number }>(
      'SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM fcats WHERE user_id = $1',
      [uid]
    );
    await query(
      'INSERT INTO fcats (user_id, name, icon, color, kind, sort) VALUES ($1,$2,$3,$4,$5,$6)',
      [uid, name, String(req.body.icon || 'other'), String(req.body.color || 'coral'), req.body.kind === 'income' ? 'income' : 'expense', max!.m]
    );
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/fcats/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    await query(
      'UPDATE fcats SET name=$1, icon=$2, color=$3, kind=$4 WHERE id=$5 AND user_id=$6',
      [name, String(req.body.icon || 'other'), String(req.body.color || 'coral'), req.body.kind === 'income' ? 'income' : 'expense', req.params.id, uid]
    );
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/fcats/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('DELETE FROM fcats WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    res.json(await buildState(uid));
  })
);

// ---------------- Budgets ----------------

app.post(
  '/api/budgets',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const cat = String(req.body.cat || '').trim();
    if (!cat) return res.status(400).json({ error: 'Category required' });
    const max = await one<{ m: number }>(
      'SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM budgets WHERE user_id = $1',
      [uid]
    );
    await query('INSERT INTO budgets (user_id, cat, limit_amt, sort, rollover) VALUES ($1,$2,$3,$4,$5)', [
      uid,
      cat,
      Number(req.body.limit) || 0,
      max!.m,
      !!req.body.rollover,
    ]);
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/budgets/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('UPDATE budgets SET cat=$1, limit_amt=$2, rollover=$5 WHERE id=$3 AND user_id=$4', [
      String(req.body.cat || '').trim(),
      Number(req.body.limit) || 0,
      req.params.id,
      uid,
      !!req.body.rollover,
    ]);
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/budgets/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('DELETE FROM budgets WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    res.json(await buildState(uid));
  })
);

// ---------------- Goals ----------------

app.post(
  '/api/goals',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const max = await one<{ m: number }>(
      'SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM goals WHERE user_id = $1',
      [uid]
    );
    await query(
      `INSERT INTO goals (user_id, name, target, current, color, due_ts, sort, acc_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT id FROM accounts WHERE id = $8 AND user_id = $1))`,
      [uid, name, Number(req.body.target) || 0, Number(req.body.current) || 0, String(req.body.color || 'indigo'), req.body.dueTs ? new Date(Number(req.body.dueTs)) : null, max!.m, /^\d+$/.test(String(req.body.accId || '')) ? String(req.body.accId) : null]
    );
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/goals/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    await query(
      `UPDATE goals SET name=$1, target=$2, current=$3, color=$4, due_ts=$5,
              acc_id=(SELECT id FROM accounts WHERE id = $8 AND user_id = $7)
       WHERE id=$6 AND user_id=$7`,
      [name, Number(req.body.target) || 0, Number(req.body.current) || 0, String(req.body.color || 'indigo'), req.body.dueTs ? new Date(Number(req.body.dueTs)) : null, req.params.id, uid, /^\d+$/.test(String(req.body.accId || '')) ? String(req.body.accId) : null]
    );
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/goals/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('DELETE FROM goals WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    res.json(await buildState(uid));
  })
);

// ---------------- Recurring ----------------

app.post(
  '/api/recurring',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    await query(
      'INSERT INTO recurring (user_id, name, cat, acc_id, amount, freq, next_ts, income) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [uid, name, String(req.body.cat || 'Other'), req.body.accId || null, Number(req.body.amount) || 0, String(req.body.freq || 'Monthly'), req.body.nextTs ? new Date(Number(req.body.nextTs)) : new Date(Date.now() + 30 * 86400000), !!req.body.income]
    );
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/recurring/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    await query(
      'UPDATE recurring SET name=$1, cat=$2, acc_id=$3, amount=$4, freq=$5, income=$8 WHERE id=$6 AND user_id=$7',
      [name, String(req.body.cat || 'Other'), req.body.accId || null, Number(req.body.amount) || 0, String(req.body.freq || 'Monthly'), req.params.id, uid, !!req.body.income]
    );
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/recurring/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('DELETE FROM recurring WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    res.json(await buildState(uid));
  })
);

// ---------------- Counters ----------------

// ---------------- Milestones ----------------
// A date counted forward from. Stored as a bare DATE, and validated as one:
// anything else reaching a DATE column is a 400 rather than a crash.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

app.post(
  '/api/milestones',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const since = String(req.body.since || '');
    if (!DATE_ONLY.test(since)) return res.status(400).json({ error: 'Pick a date' });
    const max = await one<{ m: number }>(
      'SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM milestones WHERE user_id = $1',
      [uid]
    );
    await query(
      'INSERT INTO milestones (user_id, name, since, color, icon, sort) VALUES ($1,$2,$3,$4,$5,$6)',
      [uid, name.slice(0, 60), since, String(req.body.color || 'indigo'), String(req.body.icon || 'star'), max!.m]
    );
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/milestones/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const since = String(req.body.since || '');
    if (!DATE_ONLY.test(since)) return res.status(400).json({ error: 'Pick a date' });
    await query(
      'UPDATE milestones SET name=$1, since=$2, color=$3, icon=$4 WHERE id=$5 AND user_id=$6',
      [name.slice(0, 60), since, String(req.body.color || 'indigo'), String(req.body.icon || 'star'), req.params.id, uid]
    );
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/milestones/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('DELETE FROM milestones WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    res.json(await buildState(uid));
  })
);

app.post(
  '/api/counters',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const max = await one<{ m: number }>(
      'SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM counters WHERE user_id = $1',
      [uid]
    );
    await query(
      'INSERT INTO counters (user_id, name, unit, color, icon, step, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [uid, name, String(req.body.unit || 'count'), String(req.body.color || 'indigo'), String(req.body.icon || 'tally'), Number(req.body.step) || 1, max!.m]
    );
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/counters/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    await query(
      'UPDATE counters SET name=$1, unit=$2, color=$3, icon=$4, step=$5 WHERE id=$6 AND user_id=$7',
      [name, String(req.body.unit || 'count'), String(req.body.color || 'indigo'), String(req.body.icon || 'tally'), Number(req.body.step) || 1, req.params.id, uid]
    );
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/counters/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('DELETE FROM counters WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    res.json(await buildState(uid));
  })
);

// Log an amount against a counter.
app.post(
  '/api/counters/:id/log',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const amt = Number(req.body.amount);
    // Negative amounts are allowed so a user can correct an over-count.
    if (!Number.isFinite(amt) || amt === 0) return res.status(400).json({ error: 'Add an amount' });
    const owned = await one('SELECT id FROM counters WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    if (!owned) return res.status(404).json({ error: 'Counter not found' });
    // Honour the client's timestamp when it sends one: an entry replayed from
    // the offline queue must keep the day it was logged, not the day it synced.
    const ts = req.body.ts != null && Number.isFinite(Number(req.body.ts)) ? new Date(Number(req.body.ts)) : new Date();
    await query('INSERT INTO count_logs (user_id, counter_id, amount, ts) VALUES ($1,$2,$3,$4)', [
      uid,
      req.params.id,
      amt,
      ts,
    ]);
    res.json(await buildState(uid));
  })
);

// ---------------- Reset ----------------

app.post(
  '/api/reset',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await tx(async (c) => {
      // Children cascade from habits/categories/counters; clear leaf tables explicitly too.
      await c.query('DELETE FROM habits WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM workout_categories WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM workouts WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM nights WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM txns WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM sms_ignored WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM milestones WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM habit_checkins WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM count_logs WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM counters WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM recurring WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM budgets WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM goals WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM fcats WHERE user_id = $1', [uid]);
      await c.query('DELETE FROM accounts WHERE user_id = $1', [uid]);
      await seedUser(c, uid);
    });
    res.json(await buildState(uid));
  })
);

// Permanently delete the account and everything in it. Required by the app
// stores, and the honest counterpart to "your data is yours".
app.delete(
  '/api/me',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    // Re-authenticate before an irreversible, total delete: a stolen unlocked
    // phone shouldn't be able to wipe the account in two taps.
    const u = await one<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = $1', [uid]);
    if (!u) return res.status(404).json({ error: 'Not found' });
    if (u.password_hash) {
      const password = String(req.body?.password || '');
      if (!password) return res.status(400).json({ error: 'Enter your password to confirm' });
      if (!(await bcrypt.compare(password, u.password_hash))) {
        return res.status(401).json({ error: 'That password is incorrect' });
      }
    }
    // Google-only accounts have no password to check; the signed-in session is
    // the only proof available, so the typed confirmation in the UI stands in.

    // Every table references users(id) ON DELETE CASCADE, so one delete is enough.
    await query('DELETE FROM users WHERE id = $1', [uid]);
    res.json({ ok: true });
  })
);

// Change the password from inside the app (without the email round-trip).
app.post(
  '/api/me/password',
  requireAuth,
  rateLimit('change-pw', 10, 60 * 60 * 1000),
  wrap(async (req, res) => {
    const uid = req.userId!;
    const current = String(req.body.current || '');
    const next = String(req.body.next || '');
    if (next.length < MIN_PASSWORD) return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD} characters` });
    const u = await one<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = $1', [uid]);
    // Google-only accounts have no password yet — let them set one.
    if (u?.password_hash && !(await bcrypt.compare(current, u.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(next, 10), uid]);
    res.json({ ok: true });
  })
);

// Invalidate every other device's token by bumping the account's token version.
app.post(
  '/api/me/signout-others',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const row = await one<{ token_version: number }>(
      'UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version',
      [uid]
    );
    // Hand back a fresh token so THIS device stays signed in.
    res.json({ token: signToken(uid, row?.token_version ?? 0) });
  })
);

// ---------------- Workout templates ----------------

app.post(
  '/api/wtemplates',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const max = await one<{ m: number }>(
      'SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM workout_templates WHERE user_id = $1',
      [uid]
    );
    await query(
      'INSERT INTO workout_templates (user_id, name, category_id, dur, intensity, sort) VALUES ($1,$2,$3,$4,$5,$6)',
      [uid, name, req.body.catId || null, Number(req.body.dur) || 30, req.body.intensity ? String(req.body.intensity) : null, max!.m]
    );
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/wtemplates/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('DELETE FROM workout_templates WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    res.json(await buildState(uid));
  })
);

// ---------------- Import ----------------
// Restore entries from a previously exported JSON file. Additive by design: it
// never deletes what's already there, so an import can't destroy live data.
app.post(
  '/api/import',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const d = req.body?.data;
    if (!d || typeof d !== 'object') return res.status(400).json({ error: 'That file does not look like an Orbit export' });

    const num = (v: unknown, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
    const str = (v: unknown, def = '') => (typeof v === 'string' ? v : def);
    let added = 0;

    await tx(async (c) => {
      // Habits (matched by name — re-importing the same file won't duplicate).
      if (Array.isArray(d.habits)) {
        for (const h of d.habits.slice(0, 200)) {
          const name = str(h?.name).trim();
          if (!name) continue;
          const exists = await c.query('SELECT id FROM habits WHERE user_id = $1 AND name = $2', [uid, name]);
          if (exists.rows.length) continue;
          await c.query(
            'INSERT INTO habits (user_id, name, color, target, days) VALUES ($1,$2,$3,$4,$5)',
            [uid, name, str(h?.color, 'teal'), str(h?.target, 'Daily'), /^[01]{7}$/.test(h?.days) ? h.days : '1111111']
          );
          added++;
        }
      }
      // Check-ins, matched back to habits by name.
      if (Array.isArray(d.checkins) && Array.isArray(d.habits)) {
        const byId = new Map<string, string>();
        for (const h of d.habits) if (h?.id && h?.name) byId.set(String(h.id), String(h.name));
        for (const ci of d.checkins.slice(0, 5000)) {
          const hname = byId.get(String(ci?.habitId));
          if (!hname || !/^\d{4}-\d{2}-\d{2}$/.test(ci?.day)) continue;
          const row = await c.query('SELECT id FROM habits WHERE user_id = $1 AND name = $2', [uid, hname]);
          if (!row.rows.length) continue;
          await c.query(
            'INSERT INTO habit_checkins (habit_id, user_id, day) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
            [row.rows[0].id, uid, ci.day]
          );
          added++;
        }
      }
      // Workouts / nights / transactions — skipped when the same timestamp exists.
      if (Array.isArray(d.workouts)) {
        for (const w of d.workouts.slice(0, 2000)) {
          const ts = new Date(num(w?.ts, Date.now()));
          const dup = await c.query('SELECT id FROM workouts WHERE user_id = $1 AND ts = $2', [uid, ts]);
          if (dup.rows.length) continue;
          await c.query(
            'INSERT INTO workouts (user_id, name, dur, dist, kcal, intensity, ts) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [uid, str(w?.name, 'Workout'), num(w?.dur), w?.dist ? String(w.dist) : null, w?.kcal ? num(w.kcal) : null, w?.intensity ? String(w.intensity) : null, ts]
          );
          added++;
        }
      }
      if (Array.isArray(d.nights)) {
        for (const n of d.nights.slice(0, 2000)) {
          const ts = new Date(num(n?.ts, Date.now()));
          const dup = await c.query('SELECT id FROM nights WHERE user_id = $1 AND ts = $2', [uid, ts]);
          if (dup.rows.length) continue;
          await c.query(
            'INSERT INTO nights (user_id, hours, quality, bed_h, wake_h, ts) VALUES ($1,$2,$3,$4,$5,$6)',
            [uid, num(n?.hours), num(n?.quality, 7), n?.bedH != null ? num(n.bedH) : null, n?.wakeH != null ? num(n.wakeH) : null, ts]
          );
          added++;
        }
      }
      if (Array.isArray(d.txns)) {
        for (const t of d.txns.slice(0, 5000)) {
          const ts = new Date(num(t?.ts, Date.now()));
          const amt = num(t?.amount);
          const dup = await c.query('SELECT id FROM txns WHERE user_id = $1 AND ts = $2 AND amount = $3', [uid, ts, amt]);
          if (dup.rows.length) continue;
          await c.query(
            'INSERT INTO txns (user_id, name, cat, amount, income, note, ts) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [uid, str(t?.name, 'Entry'), str(t?.cat, 'Other'), amt, amt > 0, t?.note ? String(t.note) : null, ts]
          );
          added++;
        }
      }
    });

    res.json({ added, state: await buildState(uid) });
  })
);

// ---------------- Client error reports ----------------
// A tiny built-in crash reporter: the app posts unhandled errors here so they
// show up in the feedback inbox instead of vanishing on a tester's phone.
app.post(
  '/api/client-error',
  wrap(async (req, res) => {
    const message = String(req.body.message || '').slice(0, 500);
    if (!message) return res.json({ ok: true });
    const stack = String(req.body.stack || '').slice(0, 2000);
    const build = String(req.body.build || '').slice(0, 40);
    const platform = String(req.body.platform || '').slice(0, 120);
    // Attach the user when the request happens to carry a valid token.
    let uid: number | null = null;
    try {
      const hdr = req.headers.authorization || '';
      if (hdr.startsWith('Bearer ')) {
        const jwt = (await import('jsonwebtoken')).default;
        const payload = jwt.verify(hdr.slice(7), process.env.JWT_SECRET || 'dev-secret-change-me') as { uid: number };
        uid = payload.uid;
      }
    } catch {
      /* anonymous report */
    }
    await query(
      'INSERT INTO client_errors (user_id, message, stack, build, platform) VALUES ($1,$2,$3,$4,$5)',
      [uid, message, stack, build, platform]
    );
    res.json({ ok: true });
  })
);

// ---------------- Push notifications ----------------

// The browser needs the public key to create a subscription.
app.get('/api/push/key', (_req, res) => res.json({ key: VAPID_PUBLIC }));

app.post(
  '/api/push/subscribe',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const sub = req.body.sub;
    if (!sub || typeof sub.endpoint !== 'string') return res.status(400).json({ error: 'Bad subscription' });
    await query(
      `INSERT INTO push_subs (endpoint, user_id, sub) VALUES ($1,$2,$3)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, sub = EXCLUDED.sub, last_sent = NULL`,
      [sub.endpoint, uid, JSON.stringify(sub)]
    );
    res.json({ ok: true });
  })
);

// Drop every web-push subscription for this user. The native app calls this
// when it schedules on-device reminders, so the server's push scheduler and the
// local notification can't both fire and double-notify.
app.post(
  '/api/push/unsubscribe-all',
  requireAuth,
  wrap(async (req, res) => {
    await query('DELETE FROM push_subs WHERE user_id = $1', [req.userId!]);
    res.json({ ok: true });
  })
);

// Fire a one-off notification so the user can confirm it works.
app.post(
  '/api/push/test',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    if (!pushReady) return res.status(400).json({ error: 'Push not configured on the server yet' });
    const subs = await query<{ endpoint: string; sub: string }>(
      'SELECT endpoint, sub FROM push_subs WHERE user_id = $1',
      [uid]
    );
    if (!subs.length) return res.status(400).json({ error: 'No device is subscribed yet' });
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          JSON.parse(s.sub),
          JSON.stringify({ title: 'Orbit', body: 'Reminders are on 🎉 This is a test.', url: '/' })
        );
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await query('DELETE FROM push_subs WHERE endpoint = $1', [s.endpoint]);
        }
      }
    }
    res.json({ ok: true, sent });
  })
);

// ---------------- Feedback ----------------

app.post(
  '/api/feedback',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const kind = ['suggestion', 'bug', 'complaint', 'other'].includes(req.body.kind)
      ? req.body.kind
      : 'suggestion';
    const message = String(req.body.message || '').trim().slice(0, 4000);
    if (!message) return res.status(400).json({ error: 'Write a message first' });
    await query('INSERT INTO feedback (user_id, kind, message) VALUES ($1,$2,$3)', [uid, kind, message]);
    // Email it to the app owner too, reusing the password-reset mail setup.
    const to = process.env.MAIL_FROM;
    const key = process.env.BREVO_API_KEY;
    if (to && key) {
      const u = await one<{ email: string; name: string }>(
        'SELECT email, name FROM users WHERE id = $1',
        [uid]
      );
      fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: to, name: 'Orbit' },
          to: [{ email: to }],
          replyTo: u?.email ? { email: u.email } : undefined,
          subject: `Orbit ${kind} from ${u?.name || 'a user'}`,
          textContent: `From: ${u?.name || 'user'} <${u?.email || 'unknown'}>\nType: ${kind}\n\n${message}`,
        }),
      }).catch(() => {});
    }
    res.json({ ok: true });
  })
);

// ---- Password-protected owner inbox ----
// The password MUST come from the ADMIN_PASSWORD env var. There is deliberately
// no fallback: this repo is public, so a hardcoded default would be no
// protection at all. If it isn't set, the endpoints stay closed.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (!ADMIN_PASSWORD) {
  console.warn('[admin] ADMIN_PASSWORD is not set — the feedback/error inbox is disabled.');
}

// ---------------- Bank message formats ----------------
//
// The phone masks the text before sending (web/src/lib/smsParse maskMessage)
// and shows the user exactly what goes. This end refuses anything that still
// has a digit in it, in case an older or altered build didn't mask.
app.post(
  '/api/sms-samples',
  requireAuth,
  rateLimit('sms-sample', 30, 60 * 60 * 1000),
  wrap(async (req, res) => {
    const text = String(req.body.text || '').slice(0, 600);
    const sender = String(req.body.sender || '').trim().slice(0, 40);
    if (!text.trim() || !sender) return res.status(400).json({ error: 'Nothing to send' });
    if (/[0-8\u0660-\u0668\u06F0-\u06F8]/.test(text)) return res.status(400).json({ error: 'Numbers must be masked' });
    await query('INSERT INTO sms_samples (user_id, sender, text, reason) VALUES ($1,$2,$3,$4)', [
      req.userId!,
      sender,
      text,
      String(req.body.reason || '').slice(0, 20),
    ]);
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/sms-samples',
  requireAuth,
  rateLimit('admin', 20, 15 * 60 * 1000),
  wrap(async (req, res) => {
    if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Inbox not configured on the server' });
    if (!adminOk(req)) return res.status(403).json({ error: 'Wrong password' });
    const items = await query(
      `SELECT id::text, sender, text, reason, created_at AS "createdAt" FROM sms_samples ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ items });
  })
);

// ---------------- Usage counts ----------------
//
// Which features get used, as counts per day. The names are fixed here, so
// nothing else can be smuggled in under one.
const USAGE_NAMES = new Set([
  'open',
  'habit_check',
  'workout_add',
  'sleep_add',
  'txn_add',
  'sms_import',
  'review_answer',
  'week_review',
  'bank_on',
  'budget_alert',
  'report_view',
  'partner_open',
]);

app.post(
  '/api/usage',
  requireAuth,
  rateLimit('usage', 60, 60 * 60 * 1000),
  wrap(async (req, res) => {
    const uid = req.userId!;
    const ok = await one<{ share: boolean }>('SELECT share_usage AS share FROM users WHERE id = $1', [uid]);
    if (!ok?.share) return res.json({ ok: true });
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.day)) ? String(req.body.day) : null;
    const counts = req.body.counts && typeof req.body.counts === 'object' ? req.body.counts : {};
    if (day) {
      for (const [name, v] of Object.entries(counts)) {
        const n = Math.min(500, Math.max(0, Math.floor(Number(v)) || 0));
        if (!n || !USAGE_NAMES.has(name)) continue;
        await query(
          `INSERT INTO usage_counts (user_id, day, name, n) VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id, day, name) DO UPDATE SET n = LEAST(usage_counts.n + EXCLUDED.n, 5000)`,
          [uid, day, name, n]
        );
      }
    }
    res.json({ ok: true });
  })
);

function adminOk(req: AuthedRequest): boolean {
  if (!ADMIN_PASSWORD) return false;
  const given = String(req.headers['x-admin-password'] || '');
  // Constant-time compare so the response time can't leak how much of the
  // password is right. Lengths must match first — timingSafeEqual throws
  // otherwise — which is fine, length isn't the secret.
  const a = Buffer.from(given);
  const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Abuse reports from accountability partners, unhandled first. Same gate as the
// rest of the inbox: a report names two accounts, so it is not readable by an
// ordinary signed-in user.
app.get(
  '/api/admin/partner-reports',
  requireAuth,
  rateLimit('admin', 20, 15 * 60 * 1000),
  wrap(async (req, res) => {
    if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Inbox not configured on the server' });
    if (!adminOk(req)) return res.status(403).json({ error: 'Wrong password' });
    res.json({ reports: await listReports() });
  })
);

app.post(
  '/api/admin/partner-reports/:id/handled',
  requireAuth,
  rateLimit('admin', 60, 15 * 60 * 1000),
  wrap(async (req, res) => {
    if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Inbox not configured on the server' });
    if (!adminOk(req)) return res.status(403).json({ error: 'Wrong password' });
    await query('UPDATE partner_reports SET handled = TRUE WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  })
);

// Whether people come back, and what they use. Counts only.
//   active: distinct users who opened the app in the last 1, 7 and 30 days;
//   cohorts: for each of the last 8 signup weeks, the share of those users
//     seen again on their day 1, in their week 1 (days 7-13) and around day 30
//     (days 28-34), counted only once that much time has passed;
//   features: over the last 30 days, how many people used each and how often.
app.get(
  '/api/admin/metrics',
  requireAuth,
  rateLimit('admin', 20, 15 * 60 * 1000),
  wrap(async (req, res) => {
    if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Inbox not configured on the server' });
    if (!adminOk(req)) return res.status(403).json({ error: 'Wrong password' });
    const active = await one<{ d1: number; d7: number; d30: number; users: number }>(
      `SELECT
         (SELECT count(DISTINCT user_id) FROM usage_counts WHERE name = 'open' AND day >= CURRENT_DATE)::int AS d1,
         (SELECT count(DISTINCT user_id) FROM usage_counts WHERE name = 'open' AND day > CURRENT_DATE - 7)::int AS d7,
         (SELECT count(DISTINCT user_id) FROM usage_counts WHERE name = 'open' AND day > CURRENT_DATE - 30)::int AS d30,
         (SELECT count(*) FROM users)::int AS users`
    );
    const cohorts = await query<{ week: string; users: number; d1: number | null; w1: number | null; d30: number | null }>(
      `WITH c AS (
         SELECT id, created_at::date AS joined, date_trunc('week', created_at)::date AS week
         FROM users WHERE created_at > now() - interval '8 weeks'
       ), seen AS (
         SELECT c.id, c.week, c.joined, u.day FROM c JOIN usage_counts u ON u.user_id = c.id AND u.name = 'open'
       )
       SELECT to_char(c.week, 'YYYY-MM-DD') AS week, count(DISTINCT c.id)::int AS users,
         CASE WHEN max(c.joined) + 1 < CURRENT_DATE THEN
           round(100.0 * count(DISTINCT s1.id) / count(DISTINCT c.id)) END::int AS d1,
         CASE WHEN max(c.joined) + 13 < CURRENT_DATE THEN
           round(100.0 * count(DISTINCT s7.id) / count(DISTINCT c.id)) END::int AS w1,
         CASE WHEN max(c.joined) + 34 < CURRENT_DATE THEN
           round(100.0 * count(DISTINCT s30.id) / count(DISTINCT c.id)) END::int AS d30
       FROM c
       LEFT JOIN seen s1 ON s1.id = c.id AND s1.day = c.joined + 1
       LEFT JOIN seen s7 ON s7.id = c.id AND s7.day BETWEEN c.joined + 7 AND c.joined + 13
       LEFT JOIN seen s30 ON s30.id = c.id AND s30.day BETWEEN c.joined + 28 AND c.joined + 34
       GROUP BY c.week ORDER BY c.week DESC`
    );
    const features = await query<{ name: string; users: number; total: number }>(
      `SELECT name, count(DISTINCT user_id)::int AS users, sum(n)::int AS total
       FROM usage_counts WHERE day > CURRENT_DATE - 30 GROUP BY name ORDER BY users DESC, total DESC`
    );
    res.json({ active, cohorts, features });
  })
);

// Recent client crash reports, newest first.
app.get(
  '/api/admin/errors',
  requireAuth,
  rateLimit('admin', 20, 15 * 60 * 1000),
  wrap(async (req, res) => {
    if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Inbox not configured on the server' });
    if (!adminOk(req)) return res.status(403).json({ error: 'Wrong password' });
    const rows = await query<{
      id: string;
      message: string;
      stack: string | null;
      build: string | null;
      platform: string | null;
      created_at: string;
      email: string | null;
    }>(
      `SELECT e.id, e.message, e.stack, e.build, e.platform, e.created_at, u.email
         FROM client_errors e LEFT JOIN users u ON u.id = e.user_id
        ORDER BY e.created_at DESC
        LIMIT 200`
    );
    res.json({
      items: rows.map((r) => ({
        id: String(r.id),
        message: r.message,
        stack: r.stack || '',
        build: r.build || '',
        platform: r.platform || '',
        createdAt: new Date(r.created_at).getTime(),
        email: r.email || 'anonymous',
      })),
    });
  })
);

app.get(
  '/api/admin/feedback',
  requireAuth,
  rateLimit('admin', 20, 15 * 60 * 1000),
  wrap(async (req, res) => {
    if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Inbox not configured on the server' });
    if (!adminOk(req)) return res.status(403).json({ error: 'Wrong password' });
    const rows = await query<{
      id: string;
      kind: string;
      message: string;
      created_at: string;
      name: string;
      email: string;
    }>(
      `SELECT f.id, f.kind, f.message, f.created_at, u.name, u.email
         FROM feedback f JOIN users u ON u.id = f.user_id
        ORDER BY f.created_at DESC
        LIMIT 500`
    );
    res.json({
      items: rows.map((r) => ({
        id: String(r.id),
        kind: r.kind,
        message: r.message,
        createdAt: new Date(r.created_at).getTime(),
        name: r.name,
        email: r.email,
      })),
    });
  })
);

/**
 * Liveness, and — only when asked — a database check.
 *
 * This endpoint used to run `SELECT 1` on every call so that an uptime pinger
 * would keep the Postgres warm as well as the web service. That was a mistake,
 * and an expensive one: a managed Postgres on a metered plan bills for the time
 * its compute is awake, so a ping every few minutes holds the database open
 * around the clock and burns a monthly allowance in days. It did exactly that
 * here, and the whole app went down with a quota error until the allowance
 * reset.
 *
 * So the default answer touches nothing. A pinger aimed at this URL now keeps
 * the *web service* warm — which is what it was wanted for — and lets the
 * database sleep, which is what the database's own pricing wants. The first
 * request after idle pays a second or two to wake Postgres, and that is a far
 * better trade than paying for 24 hours of compute to avoid it.
 *
 * `?db=1` still does the real check, for diagnosing a stuck deploy by hand.
 * `schema` and any boot error are reported either way: both are already known
 * from the migration loop and cost nothing to read.
 */
app.get('/api/health', async (req, res) => {
  const base = { ok: true, schema: dbReady, ...(dbError ? { error: dbError } : {}) };
  if (req.query.db !== '1') return res.json(base);
  try {
    await pool.query('SELECT 1');
    res.json({ ...base, db: true });
  } catch (e) {
    res.json({
      ...base,
      db: false,
      error: dbError || (e instanceof Error ? e.message : 'database unreachable'),
    });
  }
});

// Digital Asset Links — lets the installed Android app (TWA/APK) verify it owns
// this site, so it opens full-screen with no browser address bar.
app.get('/.well-known/assetlinks.json', (_req, res) => {
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.onrender.orbit_x3z7.twa',
        sha256_cert_fingerprints: [
          'D8:9F:A8:C8:A6:86:AD:8F:B4:4B:41:E9:D6:C4:E0:38:E2:B1:37:99:38:36:F6:ED:41:3F:49:20:8D:40:D8:76',
        ],
      },
    },
  ]);
});

// ---------------- Public legal pages ----------------
app.use(partnerRouter);

// Ahead of the SPA, so /privacy and /delete-account are real documents a Play
// reviewer can read with no account, no sign-in and no JavaScript. Play requires
// both to be reachable that way; the in-app privacy screen sits behind auth and
// does not qualify.
app.use(legalRouter);

// ---------------- Deleting an account without the app ----------------
// Play wants a way to delete an account that works for someone who has already
// uninstalled the app. Proving the account is theirs works like a password
// reset: a link sent to its email. The link opens a page with a button rather
// than deleting on arrival, because mail scanners follow links.
const formBody = express.urlencoded({ extended: false, limit: '4kb' });
const DELETION_TTL = 60 * 60 * 1000;

const sendDeletionEmail = (to: string, link: string, ar: boolean) =>
  sendMail(
    'delete',
    to,
    ar ? 'تأكيد حذف حسابك في Orbit' : 'Confirm deleting your Orbit account',
    mailWrap(
      ar,
      ar
        ? `<p>طلب أحدهم حذف حساب Orbit المرتبط بهذا البريد. إن كنت أنت، اضغط الزر وأكّد. ينتهي الرابط خلال ساعة.</p>
      ${mailButton(link, 'تأكيد حذف الحساب', true)}
      <p style="color:#807a70;font-size:13px">إن لم تطلب ذلك، تجاهل هذه الرسالة وسيبقى حسابك كما هو.</p>`
        : `<p>Someone asked to delete the Orbit account for this address. If it was you, tap the button and confirm. The link expires in 1 hour.</p>
      ${mailButton(link, 'Delete my account')}
      <p style="color:#807a70;font-size:13px">If you didn't ask for this, ignore this email and your account stays as it is.</p>`
    )
  );

/** The user a deletion link belongs to, while it's still valid. */
async function deletionFor(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return one<{ user_id: number; email: string }>(
    `SELECT d.user_id, u.email FROM deletion_requests d JOIN users u ON u.id = d.user_id
     WHERE d.token_hash = $1 AND d.expires_at > now()`,
    [sha256(token)]
  );
}

const deletionTitle = (lang: 'en' | 'ar') => (lang === 'ar' ? 'حذف حسابك' : 'Delete your account');

app.post(
  '/delete-account/request',
  rateLimit('delete-request', 5, 60 * 60 * 1000),
  formBody,
  wrap(async (req, res) => {
    const lang = pickLang(req);
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (emailOk(email)) {
      const u = await one<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
      if (u) {
        const token = randomBytes(32).toString('hex');
        await query('DELETE FROM deletion_requests WHERE user_id = $1', [u.id]);
        await query('INSERT INTO deletion_requests (token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [
          sha256(token),
          u.id,
          new Date(Date.now() + DELETION_TTL),
        ]);
        const base = process.env.APP_URL || `https://${req.headers.host}`;
        await sendDeletionEmail(email, `${base}/delete-account/confirm?token=${token}${lang === 'ar' ? '&lang=ar' : ''}`, lang === 'ar');
      }
    }
    // The same answer either way, so the page can't be used to find out who has an account.
    res.type('html').send(legalPage(lang, deletionTitle(lang), deletionPages(lang).sent));
  })
);

app.get(
  '/delete-account/confirm',
  rateLimit('delete-confirm', 30, 60 * 60 * 1000),
  wrap(async (req, res) => {
    const lang = pickLang(req);
    const token = String(req.query.token || '');
    const row = await deletionFor(token);
    res.set('Cache-Control', 'no-store');
    res
      .type('html')
      .send(legalPage(lang, deletionTitle(lang), row ? deletionPages(lang).confirm(row.email, token) : deletionPages(lang).invalid));
  })
);

app.post(
  '/delete-account/confirm',
  rateLimit('delete-confirm', 30, 60 * 60 * 1000),
  formBody,
  wrap(async (req, res) => {
    const lang = pickLang(req);
    const row = await deletionFor(String(req.body?.token || ''));
    if (!row) return res.status(400).type('html').send(legalPage(lang, deletionTitle(lang), deletionPages(lang).invalid));
    // Every table references users(id) ON DELETE CASCADE, the request included.
    await query('DELETE FROM users WHERE id = $1', [row.user_id]);
    console.log('[delete] account deleted from the web');
    res.set('Cache-Control', 'no-store');
    res.type('html').send(legalPage(lang, deletionTitle(lang), deletionPages(lang).done));
  })
);

// ---------------- Serve the built frontend (production) ----------------
// The compiled server lives at server/dist; the web build is at web/dist.
const webDist = join(__dirname, '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  // Any non-API route returns the SPA shell.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(webDist, 'index.html'));
  });
}

const PORT = Number(process.env.PORT) || 4000;

// Every minute, fire due daily reminders (each at the user's local time).
async function runReminders() {
  if (!pushReady || !dbReady) return;
  try {
    const rows = await query<{
      reminder_time: string;
      reminder_tz: string | null;
      endpoint: string;
      sub: string;
      last_sent: string | null;
    }>(
      `SELECT u.reminder_time, u.reminder_tz, p.endpoint, p.sub, p.last_sent
       FROM users u JOIN push_subs p ON p.user_id = u.id
       WHERE u.reminders = TRUE AND u.reminder_time IS NOT NULL`
    );
    if (!rows.length) return;
    const now = new Date();
    for (const r of rows) {
      const tz = r.reminder_tz || 'UTC';
      let localHM: string;
      let localDay: string;
      try {
        localHM = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
        localDay = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
      } catch {
        continue; // bad timezone string
      }
      if (localHM !== r.reminder_time) continue;
      if (r.last_sent === localDay) continue;
      const body = REMINDER_MESSAGES[dayOfYear(now) % REMINDER_MESSAGES.length];
      try {
        await webpush.sendNotification(JSON.parse(r.sub), JSON.stringify({ title: 'Orbit', body, url: '/' }));
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await query('DELETE FROM push_subs WHERE endpoint = $1', [r.endpoint]);
          continue;
        }
      }
      await query('UPDATE push_subs SET last_sent = $1 WHERE endpoint = $2', [localDay, r.endpoint]);
    }
  } catch (e) {
    console.error('[reminders]', e);
  }
}
function dayOfYear(d: Date): number {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
}

/** Advance a recurring entry's due date by one period. */
function advance(from: Date, freq: string): Date {
  const d = new Date(from);
  if (freq === 'Weekly') d.setDate(d.getDate() + 7);
  else if (freq === 'Yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1); // Monthly (default)
  return d;
}

/**
 * Turn due recurring entries into real transactions. Runs periodically; catches
 * up if the server was asleep (loops until the next date is in the future).
 */
const DAY_MS = 86400000;
/** How far either side of its due date a bank payment can pay a recurring item. */
const RECURRING_WINDOW = 5 * DAY_MS;

/**
 * A payment already in the ledger that is this occurrence of a recurring item:
 * same direction, an amount within 10%, within five days of the due date, and
 * either the same name (as letters and digits) or the same category. Never one
 * that already paid something else.
 */
async function recurringMatch(r: { id: string; user_id: number; name: string; cat: string; amount: number; income: boolean }, due: Date) {
  const amt = Math.abs(Number(r.amount)) || 0;
  return one<{ id: string }>(
    `SELECT id::text FROM txns
      WHERE user_id = $1 AND to_acc_id IS NULL AND NOT adjust AND recurring_id IS NULL
        AND income = $2 AND abs(amount) BETWEEN $3 * 0.9 AND $3 * 1.1
        AND ts BETWEEN $4 AND $5
        AND (cat = $6
             OR position(regexp_replace(lower($7), '[^[:alnum:]]', '', 'g') in regexp_replace(lower(name), '[^[:alnum:]]', '', 'g')) > 0
             OR position(regexp_replace(lower(name), '[^[:alnum:]]', '', 'g') in regexp_replace(lower($7), '[^[:alnum:]]', '', 'g')) > 0)
      ORDER BY abs(extract(epoch FROM ts - $8::timestamptz)) LIMIT 1`,
    [r.user_id, !!r.income, amt, new Date(due.getTime() - RECURRING_WINDOW), new Date(due.getTime() + RECURRING_WINDOW), r.cat, r.name, due]
  );
}

/**
 * Recurring items are expected payments, not entries of their own.
 *
 * Before bank messages, the schedule was the only way a salary or the rent got
 * into the ledger, so it wrote an entry on the due date. Now the bank's own
 * message usually brings it in, and writing it as well counted it twice. So:
 * when a payment that matches is already there (from the bank or typed in),
 * the occurrence is marked paid by it. When none is, a user whose money is
 * tracked from bank messages gets a few days' grace for the message to
 * arrive; only then, or straight away for cash and untracked accounts, is the
 * entry written from the schedule.
 */
let recurringBusy = false;
async function runRecurring(onlyUser?: number) {
  // Runs hourly, at boot, and after an import; never twice at once, or two
  // runs could both write the same occurrence.
  if (!dbReady || recurringBusy) return;
  recurringBusy = true;
  try {
    const due = await query<{
      id: string;
      user_id: number;
      name: string;
      cat: string;
      acc_id: string | null;
      amount: number;
      freq: string;
      income: boolean;
      next_ts: string;
      tracked: boolean;
    }>(
      `SELECT r.id::text, r.user_id, r.name, r.cat, r.acc_id::text, r.amount, r.freq, r.income, r.next_ts,
              (EXISTS (SELECT 1 FROM account_links k WHERE k.user_id = r.user_id)
               AND COALESCE((SELECT a.type FROM accounts a WHERE a.id = r.acc_id), 'Bank') <> 'Cash') AS tracked
         FROM recurring r
        WHERE r.next_ts IS NOT NULL AND r.next_ts <= now() AND ($1::bigint IS NULL OR r.user_id = $1)`,
      [onlyUser ?? null]
    );
    for (const r of due) {
      let next = new Date(r.next_ts);
      let guard = 0;
      // One occurrence at a time, oldest first (bounded so a very old date
      // can't spin forever). Stops at the first one still waiting for its
      // bank message, so the schedule never runs ahead of what's settled.
      while (next.getTime() <= Date.now() && guard++ < 60) {
        const paid = await recurringMatch(r, next);
        if (paid) {
          await query('UPDATE txns SET recurring_id = $1 WHERE id = $2', [r.id, paid.id]);
        } else if (r.tracked && Date.now() < next.getTime() + RECURRING_WINDOW) {
          break;
        } else {
          // Amounts are stored positive; sign them by kind, matching POST /api/txns.
          await query(
            `INSERT INTO txns (user_id, name, cat, amount, income, acc_id, note, ts, recurring_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              r.user_id,
              r.name,
              r.cat,
              r.income ? Math.abs(r.amount) : -Math.abs(r.amount),
              !!r.income,
              r.acc_id,
              'Recurring',
              next,
              r.id,
            ]
          );
        }
        next = advance(next, r.freq);
      }
      if (next.getTime() !== new Date(r.next_ts).getTime()) {
        await query('UPDATE recurring SET next_ts = $1 WHERE id = $2', [next, r.id]);
      }
    }
  } catch (e) {
    console.error('[recurring]', e);
  } finally {
    recurringBusy = false;
  }
}

/**
 * Create/upgrade tables (idempotent) — no separate migrate step in the cloud.
 * Retries with backoff instead of exiting: a sleeping or briefly unreachable
 * database is a normal condition on a free tier, not a fatal one.
 */
async function migrate(attempt = 1): Promise<void> {
  try {
    await pool.query(SCHEMA_SQL);
    // Ensure every existing account has the permanent "Daily Check-In" habit.
    await pool.query(
      `INSERT INTO habits (user_id, name, color, target, days, locked, sort)
       SELECT u.id, 'Daily Check-In', 'indigo', 'Daily', '1111111', TRUE, -1 FROM users u
       WHERE NOT EXISTS (SELECT 1 FROM habits h WHERE h.user_id = u.id AND h.locked = TRUE)`
    );
    dbReady = true;
    dbError = null;
    console.log('[boot] schema ready — serving requests');
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
    const wait = Math.min(30_000, 2_000 * attempt);
    console.error(
      `[boot] schema attempt ${attempt} failed: ${dbError}\n` +
        `[boot] retrying in ${wait / 1000}s. Is DATABASE_URL set and reachable?`
    );
    setTimeout(() => migrate(attempt + 1), wait).unref?.();
  }
}

function start() {
  // Listen first, always. Even with the database down the health endpoint
  // answers, so the problem is visible instead of looking like a hang.
  app.listen(PORT, () => console.log(`Orbit API listening on port ${PORT}`));
  console.log(pushReady ? 'Daily reminders: ON' : 'Daily reminders: OFF (set VAPID_PRIVATE to enable)');
  migrate();
  setInterval(runReminders, 60 * 1000);
  // Prune spent idempotency keys — they only need to outlive a device that has
  // been offline for a while.
  const pruneOps = () =>
    query("DELETE FROM client_ops WHERE created_at < now() - interval '7 days'").catch(() => {});
  setInterval(() => dbReady && pruneOps(), 6 * 60 * 60 * 1000);
  // Post due recurring transactions on boot, then hourly.
  runRecurring();
  setInterval(() => runRecurring(), 60 * 60 * 1000);
}

start();
