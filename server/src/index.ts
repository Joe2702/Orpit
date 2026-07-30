import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import webpush from 'web-push';

import { pool, query, one, tx } from './db.js';
import { signToken, requireAuth, type AuthedRequest } from './auth.js';
import { seedUser } from './seed.js';
import { buildState } from './state.js';
import { SCHEMA_SQL } from './schema.js';

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

const wrap =
  (fn: (req: AuthedRequest, res: express.Response) => Promise<any>) =>
  (req: AuthedRequest, res: express.Response) =>
    fn(req, res).catch((e) => {
      console.error(e);
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
    if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const existing = await one('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: 'That email is already registered' });

    const hash = await bcrypt.hash(password, 10);
    const user = await tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO users (email, password_hash, name, onboarded, intro_done) VALUES ($1,$2,$3,TRUE,FALSE) RETURNING id`,
        [email, hash, name]
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

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// Send transactional mail via Brevo (if configured). Returns false if not set up,
// so callers can degrade gracefully rather than fail the whole request.
async function sendMail(tag: string, to: string, subject: string, htmlContent: string): Promise<boolean> {
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

const mailButton = (link: string, label: string) =>
  `<p><a href="${link}" style="display:inline-block;background:#5c57c9;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600">${label}</a></p>
   <p style="color:#807a70;font-size:13px">Or paste this link: ${link}</p>`;

const sendResetEmail = (to: string, link: string) =>
  sendMail(
    'reset',
    to,
    'Reset your Orbit password',
    `<div style="font-family:sans-serif;font-size:15px;color:#211f1b">
      <p>Tap the button to set a new password. This link expires in 1 hour.</p>
      ${mailButton(link, 'Reset password')}
      <p style="color:#807a70;font-size:13px">If you didn't request this, you can ignore this email.</p>
    </div>`
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
        await sendResetEmail(email, `${base}/reset?token=${token}`);
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
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
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
    const sent = await sendMail(
      'verify',
      u.email,
      'Confirm your email for Orbit',
      `<div style="font-family:sans-serif;font-size:15px;color:#211f1b">
        <p>Confirm this address so you can recover your account if you ever forget your password.</p>
        ${mailButton(`${base}/verify?token=${token}`, 'Confirm email')}
        <p style="color:#807a70;font-size:13px">This link expires in 24 hours. If you didn't sign up for Orbit, you can ignore this email.</p>
      </div>`
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
    const rt = /^\d{2}:\d{2}$/.test(req.body.reminderTime) ? req.body.reminderTime : null;
    await query(
      'INSERT INTO habits (user_id, name, color, target, days, sort, why, reminder_time) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [uid, name, color, target, days, max!.m, why, rt]
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
    const rt = /^\d{2}:\d{2}$/.test(req.body.reminderTime) ? req.body.reminderTime : null;
    const paused = !!req.body.paused;
    const archived = !!req.body.archived;
    await query(
      `UPDATE habits SET name = $1, color = $2, target = $3, days = $4, why = $5,
              reminder_time = $6, paused = $7, archived = $8
       WHERE id = $9 AND user_id = $10`,
      [name, String(req.body.color || 'teal'), String(req.body.target || 'Daily'), days, why, rt, paused, archived, req.params.id, uid]
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

app.post(
  '/api/txns',
  requireAuth,
  idempotency,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const amt = Number(req.body.amount);
    if (!amt) return res.status(400).json({ error: 'Amount required' });
    const income = !!req.body.income;
    const cat = String(req.body.cat || 'Other');
    const ts = req.body.ts ? new Date(Number(req.body.ts)) : new Date();
    const row = await one<{ id: string }>(
      `INSERT INTO txns (user_id, name, cat, amount, income, acc_id, note, ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text`,
      [
        uid,
        String(req.body.name || cat),
        cat,
        income ? Math.abs(amt) : -Math.abs(amt),
        income,
        req.body.accId || null,
        req.body.note ? String(req.body.note) : null,
        ts,
      ]
    );
    if (row) await saveTxnPhoto(uid, row.id, req.body.photo);
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
    const income = !!req.body.income;
    const cat = String(req.body.cat || 'Other');
    const ts = req.body.ts ? new Date(Number(req.body.ts)) : new Date();
    await query(
      `UPDATE txns SET name=$1, cat=$2, amount=$3, income=$4, acc_id=$5, note=$6, ts=$7
       WHERE id=$8 AND user_id=$9`,
      [
        String(req.body.name || cat),
        cat,
        income ? Math.abs(amt) : -Math.abs(amt),
        income,
        req.body.accId || null,
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
    await query('DELETE FROM txns WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
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
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/accounts/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await tx(async (c) => {
      await c.query('UPDATE txns SET acc_id = NULL WHERE acc_id = $1 AND user_id = $2', [req.params.id, uid]);
      await c.query('UPDATE recurring SET acc_id = NULL WHERE acc_id = $1 AND user_id = $2', [req.params.id, uid]);
      await c.query('DELETE FROM accounts WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    });
    res.json(await buildState(uid));
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
      'INSERT INTO goals (user_id, name, target, current, color, due_ts, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [uid, name, Number(req.body.target) || 0, Number(req.body.current) || 0, String(req.body.color || 'indigo'), req.body.dueTs ? new Date(Number(req.body.dueTs)) : null, max!.m]
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
      'UPDATE goals SET name=$1, target=$2, current=$3, color=$4, due_ts=$5 WHERE id=$6 AND user_id=$7',
      [name, Number(req.body.target) || 0, Number(req.body.current) || 0, String(req.body.color || 'indigo'), req.body.dueTs ? new Date(Number(req.body.dueTs)) : null, req.params.id, uid]
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
    await query('INSERT INTO count_logs (user_id, counter_id, amount) VALUES ($1,$2,$3)', [
      uid,
      req.params.id,
      amt,
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
    if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
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

function adminOk(req: AuthedRequest): boolean {
  return !!ADMIN_PASSWORD && String(req.headers['x-admin-password'] || '') === ADMIN_PASSWORD;
}

// Recent client crash reports, newest first.
app.get(
  '/api/admin/errors',
  requireAuth,
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

app.get('/api/health', async (_req, res) => {
  // Touch the database too, so the keep-awake pinger keeps BOTH the server and
  // the (free, auto-sleeping) Postgres warm — otherwise the first action after
  // idle waits for the database to wake up. Also reports migration state, so a
  // stuck deploy can be diagnosed by opening this URL in a browser.
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true, schema: dbReady });
  } catch (e) {
    res.json({
      ok: true,
      db: false,
      schema: dbReady,
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
async function runRecurring() {
  if (!dbReady) return;
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
    }>(
      `SELECT id::text, user_id, name, cat, acc_id::text, amount, freq, income, next_ts
         FROM recurring
        WHERE next_ts IS NOT NULL AND next_ts <= now()`
    );
    for (const r of due) {
      let next = new Date(r.next_ts);
      let guard = 0;
      // Insert one transaction per missed period (bounded so a very old date
      // can't spin forever).
      while (next.getTime() <= Date.now() && guard++ < 60) {
        // Amounts are stored positive; sign them by kind, matching POST /api/txns.
        await query(
          `INSERT INTO txns (user_id, name, cat, amount, income, acc_id, note, ts)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            r.user_id,
            r.name,
            r.cat,
            r.income ? Math.abs(r.amount) : -Math.abs(r.amount),
            !!r.income,
            r.acc_id,
            'Recurring',
            next,
          ]
        );
        next = advance(next, r.freq);
      }
      await query('UPDATE recurring SET next_ts = $1 WHERE id = $2', [next, r.id]);
    }
  } catch (e) {
    console.error('[recurring]', e);
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
  setInterval(runRecurring, 60 * 60 * 1000);
}

start();
