import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

import { pool, query, one, tx } from './db.js';
import { signToken, requireAuth, type AuthedRequest } from './auth.js';
import { seedUser } from './seed.js';
import { buildState } from './state.js';
import { SCHEMA_SQL } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  })
);

const wrap =
  (fn: (req: AuthedRequest, res: express.Response) => Promise<any>) =>
  (req: AuthedRequest, res: express.Response) =>
    fn(req, res).catch((e) => {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    });

const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// ---------------- Auth ----------------

app.post(
  '/api/auth/signup',
  wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim() || 'Alex Rivera';
    if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await one('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: 'That email is already registered' });

    const hash = await bcrypt.hash(password, 10);
    const user = await tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO users (email, password_hash, name, onboarded) VALUES ($1,$2,$3,TRUE) RETURNING id`,
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
  wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const u = await one<{ id: number; password_hash: string | null }>(
      'SELECT id, password_hash FROM users WHERE email = $1',
      [email]
    );
    if (!u || !u.password_hash || !(await bcrypt.compare(password, u.password_hash)))
      return res.status(401).json({ error: 'Incorrect email or password' });
    res.json({ token: signToken(u.id), state: await buildState(u.id) });
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
        await query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, byEmail.id]);
        user = byEmail;
      } else {
        const id = await tx(async (c) => {
          const { rows } = await c.query(
            `INSERT INTO users (email, name, google_id, onboarded) VALUES ($1,$2,$3,TRUE) RETURNING id`,
            [email, name, googleId]
          );
          const uid = rows[0].id as number;
          await seedUser(c, uid);
          return uid;
        });
        user = { id };
      }
    }
    res.json({ token: signToken(user.id), state: await buildState(user.id) });
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
    }
    if (['light', 'dark'].includes(req.body.theme)) fields.theme = req.body.theme;
    if (typeof req.body.reminders === 'boolean') fields.reminders = req.body.reminders;
    if (typeof req.body.haptics === 'boolean') fields.haptics = req.body.haptics;
    if (['USD', 'EGP', 'EUR', 'GBP', 'SAR'].includes(req.body.currency)) fields.currency = req.body.currency;

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
    const max = await one<{ m: number }>(
      'SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM habits WHERE user_id = $1',
      [uid]
    );
    await query(
      'INSERT INTO habits (user_id, name, color, target, sort) VALUES ($1,$2,$3,$4,$5)',
      [uid, name, color, target, max!.m]
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
    await query(
      'UPDATE habits SET name = $1, color = $2, target = $3 WHERE id = $4 AND user_id = $5',
      [name, String(req.body.color || 'teal'), String(req.body.target || 'Daily'), req.params.id, uid]
    );
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/habits/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('DELETE FROM habits WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    res.json(await buildState(uid));
  })
);

// Toggle a habit's completion for a given day (default: today).
app.post(
  '/api/habits/:id/toggle',
  requireAuth,
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

app.post(
  '/api/workouts',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const cat = await one<{ id: string; name: string }>(
      'SELECT id::text, name FROM workout_categories WHERE id = $1 AND user_id = $2',
      [req.body.catId, uid]
    );
    if (!cat) return res.status(400).json({ error: 'Unknown category' });
    const name = String(req.body.name || '').trim() || cat.name;
    await query(
      `INSERT INTO workouts (user_id, category_id, name, dur, dist, kcal, intensity)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        uid,
        cat.id,
        name,
        Number(req.body.dur) || 0,
        req.body.dist ? String(req.body.dist) : null,
        req.body.kcal ? Number(req.body.kcal) : null,
        req.body.intensity ? String(req.body.intensity) : null,
      ]
    );
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/workouts/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query(
      `UPDATE workouts SET
         dur = $1,
         category_id = COALESCE($2, category_id),
         dist = $3, kcal = $4
       WHERE id = $5 AND user_id = $6`,
      [
        Number(req.body.dur) || 0,
        req.body.catId || null,
        req.body.dist ? String(req.body.dist) : null,
        req.body.kcal ? Number(req.body.kcal) : null,
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
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query(
      'INSERT INTO nights (user_id, hours, quality, bed_h, wake_h) VALUES ($1,$2,$3,$4,$5)',
      [
        uid,
        Number(req.body.hours) || 0,
        Number(req.body.quality) || 0,
        req.body.bedH != null ? Number(req.body.bedH) : null,
        req.body.wakeH != null ? Number(req.body.wakeH) : null,
      ]
    );
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/nights/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('DELETE FROM nights WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    res.json(await buildState(uid));
  })
);

// ---------------- Transactions ----------------

app.post(
  '/api/txns',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const amt = Number(req.body.amount);
    if (!amt) return res.status(400).json({ error: 'Amount required' });
    const income = !!req.body.income;
    const cat = String(req.body.cat || 'Other');
    const ts = req.body.ts ? new Date(Number(req.body.ts)) : new Date();
    await query(
      'INSERT INTO txns (user_id, name, cat, amount, income, acc_id, note, ts) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
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
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/txns/:id',
  requireAuth,
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
    res.json(await buildState(uid));
  })
);

app.delete(
  '/api/txns/:id',
  requireAuth,
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
    await query('INSERT INTO budgets (user_id, cat, limit_amt, sort) VALUES ($1,$2,$3,$4)', [
      uid,
      cat,
      Number(req.body.limit) || 0,
      max!.m,
    ]);
    res.json(await buildState(uid));
  })
);

app.patch(
  '/api/budgets/:id',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    await query('UPDATE budgets SET cat=$1, limit_amt=$2 WHERE id=$3 AND user_id=$4', [
      String(req.body.cat || '').trim(),
      Number(req.body.limit) || 0,
      req.params.id,
      uid,
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
      'INSERT INTO recurring (user_id, name, cat, acc_id, amount, freq, next_ts) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [uid, name, String(req.body.cat || 'Other'), req.body.accId || null, Number(req.body.amount) || 0, String(req.body.freq || 'Monthly'), req.body.nextTs ? new Date(Number(req.body.nextTs)) : new Date(Date.now() + 30 * 86400000)]
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
      'UPDATE recurring SET name=$1, cat=$2, acc_id=$3, amount=$4, freq=$5 WHERE id=$6 AND user_id=$7',
      [name, String(req.body.cat || 'Other'), req.body.accId || null, Number(req.body.amount) || 0, String(req.body.freq || 'Monthly'), req.params.id, uid]
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
  wrap(async (req, res) => {
    const uid = req.userId!;
    const amt = Number(req.body.amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'Add an amount' });
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

app.get('/api/health', (_req, res) => res.json({ ok: true }));

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

async function start() {
  // Create/upgrade tables on boot (idempotent) — no separate migrate step needed in the cloud.
  await pool.query(SCHEMA_SQL);
  app.listen(PORT, () => console.log(`Orbit API listening on port ${PORT}`));
}

start().catch((e) => {
  console.error('Startup failed. Is DATABASE_URL set and reachable?\n', e.message);
  process.exit(1);
});
