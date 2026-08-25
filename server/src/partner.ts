import express from 'express';
import { query, one, tx } from './db.js';
import { requireAuth, type AuthedRequest } from './auth.js';

// Accountability partners.
//
// The whole feature in one sentence: two adults are matched at random, and each
// decides — tracker by tracker, and changeable at any second — how much of their
// own tracking the other may see.
//
// The design rule that everything below follows is that **the partner is never
// sent state, only a view**. There is no endpoint here that hands over a slice
// of somebody's data for the client to filter; every response is assembled from
// the share levels first and contains only what those levels permit. A client
// that filters is a client that can be modified, and the person on the other end
// of this is a stranger.
//
// Three consequences worth stating, because they look like extra work until the
// first time they matter:
//
//   * Turning a tracker off takes effect on the next read, not on the next
//     sync. Nothing is cached on the partner's device.
//   * Under-18 accounts are refused by every route in this file, not by the UI
//     that hides the section. The gate is on a stored date of birth, so it opens
//     by itself on the user's birthday and cannot go stale.
//   * Ending a partnership blocks the pair from being matched again. "Find me
//     someone else" has to mean someone else.

export const partnerRouter = express.Router();

const wrap =
  (fn: (req: AuthedRequest, res: express.Response) => Promise<any>) =>
  (req: AuthedRequest, res: express.Response) =>
    fn(req, res).catch((e) => {
      console.error('[partner]', e);
      res.status(500).json({ error: 'Server error' });
    });

// ---------------------------------------------------------------------------
// Shared vocabulary. Mirrors web/src/lib/partner.ts, which is where the same
// rules are tested; the duplication is deliberate — the server may not trust
// anything the client computed.

const MIN_AGE = 18;
const MODULES = ['habits', 'workouts', 'sleep', 'counters', 'finances'] as const;
type Module = (typeof MODULES)[number];
const isModule = (s: unknown): s is Module => typeof s === 'string' && (MODULES as readonly string[]).includes(s);

const SEE = 1;
const STATS = 2;
const COMMENT = 3;

const asLevel = (n: unknown): number => {
  const v = Math.round(Number(n));
  return v >= 0 && v <= 3 ? v : 0;
};

const NOTE_MAX = 500;
/** Notes per person per partnership per hour. A brake on abuse, not on use. */
const NOTE_RATE = 60;

const REPORT_REASONS = ['harassment', 'sexual', 'spam', 'personal', 'underage', 'other'];

// ---------------------------------------------------------------------------
// Eligibility

interface Me {
  id: number;
  name: string;
  avatar: string | null;
  dob: string | null;
  gender: string | null;
  adult: boolean;
}

/**
 * Load the caller and work out, in the database, whether they are old enough.
 *
 * The comparison is `dob <= today - 18 years` in SQL rather than in JavaScript
 * so it uses one clock. A server in one timezone and a phone in another must not
 * be able to disagree about whether somebody is eighteen.
 */
async function loadMe(uid: number): Promise<Me | null> {
  const r = await one<any>(
    `SELECT id, name, avatar, to_char(dob,'YYYY-MM-DD') AS dob, gender,
            (dob IS NOT NULL AND dob <= (CURRENT_DATE - INTERVAL '${MIN_AGE} years')) AS adult
     FROM users WHERE id = $1`,
    [uid]
  );
  return r ? { ...r, adult: !!r.adult } : null;
}

/** Every route below this line is adults-only, and says so in the same words. */
const requireAdult = async (uid: number, res: express.Response): Promise<Me | null> => {
  const me = await loadMe(uid);
  if (!me) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  if (!me.adult) {
    res.status(403).json({
      error: me.dob
        ? 'Accountability partners are for members aged 18 and over'
        : 'Add your date of birth first',
    });
    return null;
  }
  return me;
};

// ---------------------------------------------------------------------------
// The live partnership

interface Pship {
  id: string;
  other: number;
  startedAt: number;
}

/**
 * The live partnership, or the most recent one if it ended lately.
 *
 * Used only by reporting. The common shape of an unpleasant experience is that
 * the person gets out first and reports afterwards — sometimes days afterwards,
 * once they have decided it is worth the trouble. A report window that closes
 * the instant somebody protects themselves would punish exactly the reaction the
 * feature should encourage.
 */
async function reportablePship(uid: number): Promise<Pship | null> {
  const live = await livePship(uid);
  if (live) return live;
  const r = await one<any>(
    `SELECT id::text,
            CASE WHEN a_id = $1 THEN b_id ELSE a_id END AS other,
            (EXTRACT(EPOCH FROM started_at) * 1000)::float8 AS "startedAt"
     FROM partnerships
     WHERE (a_id = $1 OR b_id = $1) AND ended_at > now() - interval '30 days'
     ORDER BY ended_at DESC LIMIT 1`,
    [uid]
  );
  return r ? { id: r.id, other: Number(r.other), startedAt: r.startedAt } : null;
}

async function livePship(uid: number): Promise<Pship | null> {
  const r = await one<any>(
    `SELECT id::text,
            CASE WHEN a_id = $1 THEN b_id ELSE a_id END AS other,
            (EXTRACT(EPOCH FROM started_at) * 1000)::float8 AS "startedAt"
     FROM partnerships
     WHERE ended_at IS NULL AND (a_id = $1 OR b_id = $1)`,
    [uid]
  );
  return r ? { id: r.id, other: Number(r.other), startedAt: r.startedAt } : null;
}

const levelsFor = async (pshipId: string, userId: number): Promise<Record<string, number>> => {
  const rows = await query<{ module: string; level: number }>(
    'SELECT module, level FROM partner_shares WHERE pship_id = $1 AND user_id = $2',
    [pshipId, userId]
  );
  const out: Record<string, number> = {};
  for (const m of MODULES) out[m] = 0;
  for (const r of rows) if (isModule(r.module)) out[r.module] = asLevel(r.level);
  return out;
};

const sideOf = async (pshipId: string, userId: number) => {
  await query(
    'INSERT INTO partner_sides (pship_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [pshipId, userId]
  );
  return (await one<{ chat_ok: boolean; seen_at: string }>(
    'SELECT chat_ok, seen_at FROM partner_sides WHERE pship_id = $1 AND user_id = $2',
    [pshipId, userId]
  ))!;
};

// ---------------------------------------------------------------------------
// Building what the partner is allowed to see
//
// One function per tracker, each answering the same two questions: was it
// tracked lately, and — only when the level allows — what are the numbers. The
// figures are computed here rather than derived from a state bundle so that
// nothing beyond them ever crosses the wire.

interface Card {
  module: Module;
  level: number;
  /** Tracked today. */
  today: boolean;
  /** Last 7 days, oldest first — the dotted week strip on the card. */
  week: boolean[];
  /** Consecutive days up to today. */
  streak: number;
  /** Only present at level >= 2. */
  stats?: { label: string; value: string }[];
}

/** Days (as YYYY-MM-DD, local to the server) for the last 7, oldest first. */
const weekDays = (): string[] => {
  const out: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
};

const streakOf = (days: Set<string>): number => {
  let n = 0;
  const now = new Date();
  for (let i = 0; i < 400; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (days.has(key)) n++;
    else if (i > 0 || !days.has(key)) break;
  }
  return n;
};

async function cardFor(module: Module, userId: number, level: number): Promise<Card | null> {
  if (level < SEE) return null;
  const week = weekDays();
  const since = week[0];
  let active = new Set<string>();
  let stats: { label: string; value: string }[] = [];

  if (module === 'habits') {
    const rows = await query<{ day: string }>(
      `SELECT DISTINCT to_char(day,'YYYY-MM-DD') AS day FROM habit_checkins
       WHERE user_id = $1 AND day >= (CURRENT_DATE - INTERVAL '400 days')`,
      [userId]
    );
    active = new Set(rows.map((r) => r.day));
    if (level >= STATS) {
      const t = await one<{ total: number; done: number }>(
        `SELECT (SELECT count(*) FROM habits WHERE user_id = $1 AND NOT archived AND NOT paused)::int AS total,
                (SELECT count(*) FROM habit_checkins WHERE user_id = $1 AND day = CURRENT_DATE)::int AS done`,
        [userId]
      );
      stats = [
        { label: 'Done today', value: `${t?.done ?? 0} of ${t?.total ?? 0}` },
        { label: 'This week', value: `${(await countSince('habit_checkins', 'day', userId, since)) || 0} check-ins` },
      ];
    }
  } else if (module === 'workouts' || module === 'sleep' || module === 'counters') {
    const table = module === 'workouts' ? 'workouts' : module === 'sleep' ? 'nights' : 'count_logs';
    const rows = await query<{ day: string }>(
      `SELECT DISTINCT to_char(ts,'YYYY-MM-DD') AS day FROM ${table}
       WHERE user_id = $1 AND ts >= now() - interval '400 days'`,
      [userId]
    );
    active = new Set(rows.map((r) => r.day));
    if (level >= STATS) {
      if (module === 'workouts') {
        const t = await one<{ n: number; mins: number }>(
          `SELECT count(*)::int AS n, COALESCE(sum(dur),0)::int AS mins FROM workouts
           WHERE user_id = $1 AND ts >= now() - interval '7 days'`,
          [userId]
        );
        stats = [
          { label: 'This week', value: `${t?.n ?? 0} sessions` },
          { label: 'Time', value: `${Math.round((t?.mins ?? 0) / 60)}h ${(t?.mins ?? 0) % 60}m` },
        ];
      } else if (module === 'sleep') {
        const t = await one<{ avg: number; q: number }>(
          `SELECT COALESCE(avg(hours),0)::float8 AS avg, COALESCE(avg(quality),0)::float8 AS q
           FROM nights WHERE user_id = $1 AND ts >= now() - interval '7 days'`,
          [userId]
        );
        const h = t?.avg ?? 0;
        stats = [
          { label: 'Average', value: `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m` },
          { label: 'Quality', value: `${(t?.q ?? 0).toFixed(1)} / 10` },
        ];
      } else {
        const t = await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM count_logs WHERE user_id = $1 AND ts >= now() - interval '7 days'`,
          [userId]
        );
        stats = [{ label: 'This week', value: `${t?.n ?? 0} logs` }];
      }
    }
  } else {
    // Finances. Deliberately narrower than the others even at full detail:
    // whether somebody kept up with logging, and what they spent over the week.
    // Balances, net worth and account names are never included at any level —
    // an accountability partner is there to notice a habit slipping, and no
    // level of this feature is a reason for a stranger to learn what somebody
    // is worth.
    const rows = await query<{ day: string }>(
      `SELECT DISTINCT to_char(ts,'YYYY-MM-DD') AS day FROM txns
       WHERE user_id = $1 AND ts >= now() - interval '400 days'`,
      [userId]
    );
    active = new Set(rows.map((r) => r.day));
    if (level >= STATS) {
      const t = await one<{ spent: number; n: number }>(
        `SELECT COALESCE(-sum(amount) FILTER (WHERE amount < 0 AND to_acc_id IS NULL AND NOT adjust), 0)::float8 AS spent,
                count(*)::int AS n
         FROM txns WHERE user_id = $1 AND ts >= now() - interval '7 days'`,
        [userId]
      );
      const cur = await one<{ currency: string }>('SELECT currency FROM users WHERE id = $1', [userId]);
      stats = [
        { label: 'Spent this week', value: `${Math.round(t?.spent ?? 0).toLocaleString()} ${cur?.currency || ''}`.trim() },
        { label: 'Entries', value: String(t?.n ?? 0) },
      ];
    }
  }

  return {
    module,
    level,
    today: active.has(week[6]),
    week: week.map((d) => active.has(d)),
    streak: streakOf(active),
    ...(level >= STATS ? { stats } : {}),
  };
}

async function countSince(table: string, col: string, userId: number, since: string): Promise<number> {
  const r = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1 AND ${col} >= $2`,
    [userId, since]
  );
  return r?.n ?? 0;
}

// ---------------------------------------------------------------------------
// GET /api/partner — everything the section needs, in one call.

partnerRouter.get(
  '/api/partner',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const me = await loadMe(uid);
    if (!me) return res.status(404).json({ error: 'Not found' });

    const prefs =
      (await one<{ want: string; queued_at: string | null }>(
        'SELECT want, queued_at FROM partner_prefs WHERE user_id = $1',
        [uid]
      )) || { want: 'any', queued_at: null };

    const base = {
      eligible: me.adult,
      dob: me.dob,
      gender: me.gender,
      want: prefs.want,
      queued: !!prefs.queued_at,
    };

    if (!me.adult) return res.json({ ...base, partner: null });

    const p = await livePship(uid);
    if (!p) {
      // No live partner, but reporting stays open for a while after one ends —
      // so the screen needs to be able to offer it. Only the name travels.
      const past = await reportablePship(uid);
      const who = past ? await one<{ name: string }>('SELECT name FROM users WHERE id = $1', [past.other]) : null;
      return res.json({ ...base, partner: null, recent: who ? { name: who.name } : null });
    }

    const them = await one<{ name: string; avatar: string | null }>(
      'SELECT name, avatar FROM users WHERE id = $1',
      [p.other]
    );
    // A partner whose account is gone leaves a dangling row until someone acts
    // on it; treat it as no partner rather than rendering a blank person.
    if (!them) return res.json({ ...base, partner: null });

    const theirLevels = await levelsFor(p.id, p.other);
    const myLevels = await levelsFor(p.id, uid);
    const mySide = await sideOf(p.id, uid);
    const theirSide = await sideOf(p.id, p.other);

    const cards: Card[] = [];
    for (const m of MODULES) {
      const c = await cardFor(m, p.other, theirLevels[m]);
      if (c) cards.push(c);
    }

    const open = mySide.chat_ok && theirSide.chat_ok;
    const notes = await query<any>(
      // `mine` rather than an author id the client has to match against
      // something: the viewer's own id is not otherwise part of this payload,
      // and a screen that has to infer who wrote a message will eventually
      // infer it wrongly.
      `SELECT id::text, module, body, (author_id = $2) AS mine,
              (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS ts
       FROM partner_notes WHERE pship_id = $1
       ORDER BY created_at DESC LIMIT 200`,
      [p.id, uid]
    );
    const unread = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM partner_notes
       WHERE pship_id = $1 AND author_id <> $2 AND created_at > $3`,
      [p.id, uid, mySide.seen_at]
    );

    res.json({
      ...base,
      partner: {
        pshipId: p.id,
        name: them.name,
        avatar: them.avatar,
        since: p.startedAt,
        cards,
        // What I show them, so the settings screen can render without a
        // second request.
        myLevels,
        chat: { mine: mySide.chat_ok, theirs: theirSide.chat_ok, open },
        // Chat messages are withheld entirely unless both sides still agree:
        // withdrawing consent has to close the window, not just the door.
        notes: notes.filter((n: any) => (n.module ? true : open)).reverse(),
        unread: unread?.n ?? 0,
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Identity: date of birth and gender.

partnerRouter.patch(
  '/api/partner/me',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const fields: string[] = [];
    const vals: any[] = [];

    if (typeof req.body.dob === 'string' && req.body.dob) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.dob)) {
        return res.status(400).json({ error: 'Enter your date of birth' });
      }
      const cur = await one<{ dob: string | null }>('SELECT dob FROM users WHERE id = $1', [uid]);
      // Set once. Letting it be edited freely would turn the age gate into a
      // formality — anybody refused could simply try a different year. Changing
      // a genuine mistake is a support request, which is the right amount of
      // friction for the one field that decides eligibility.
      if (cur?.dob) return res.status(400).json({ error: 'Your date of birth is already set' });
      const ok = await one<{ ok: boolean }>(
        `SELECT ($1::date <= CURRENT_DATE AND $1::date >= CURRENT_DATE - INTERVAL '120 years') AS ok`,
        [req.body.dob]
      );
      if (!ok?.ok) return res.status(400).json({ error: 'That date does not look right' });
      fields.push(`dob = $${fields.length + 1}::date`);
      vals.push(req.body.dob);
    }

    if (['male', 'female', 'other'].includes(req.body.gender)) {
      fields.push(`gender = $${fields.length + 1}`);
      vals.push(req.body.gender);
    } else if (req.body.gender === null) {
      fields.push(`gender = NULL`);
    }

    if (fields.length) {
      await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${vals.length + 1}`, [...vals, uid]);
    }
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Matching

partnerRouter.post(
  '/api/partner/find',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const me = await requireAdult(uid, res);
    if (!me) return;

    if (await livePship(uid)) {
      return res.status(400).json({ error: 'You already have a partner' });
    }

    const want = ['male', 'female', 'any'].includes(req.body?.want) ? req.body.want : 'any';
    await query(
      `INSERT INTO partner_prefs (user_id, want) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET want = EXCLUDED.want`,
      [uid, want]
    );

    // The match itself runs in one transaction, and the candidate row is taken
    // with FOR UPDATE SKIP LOCKED. Two people searching at the same instant
    // would otherwise both read the same waiting person as available and both
    // try to pair with them; one would win the unique index and the other would
    // fail with a database error instead of simply looking again.
    const matched = await tx(async (c) => {
      const cand = await c.query(
        `SELECT p.user_id AS id
           FROM partner_prefs p
           JOIN users u ON u.id = p.user_id
          WHERE p.queued_at IS NOT NULL
            -- The searcher's own age, again. requireAdult already refused
            -- anyone under 18 before this runs, and this repeats it inside the
            -- one statement that creates a pairing. Two layers is the right
            -- number for the rule that decides whether a minor can be handed a
            -- stranger: a future caller that forgets the guard finds no rows
            -- rather than a partner.
            AND EXISTS (SELECT 1 FROM users me
                         WHERE me.id = $1 AND me.dob IS NOT NULL
                           AND me.dob <= CURRENT_DATE - INTERVAL '${MIN_AGE} years')
            AND p.user_id <> $1
            AND u.dob IS NOT NULL
            AND u.dob <= CURRENT_DATE - INTERVAL '${MIN_AGE} years'
            -- my preference about them
            AND ($2 = 'any' OR u.gender = $2)
            -- their preference about me
            AND (p.want = 'any' OR p.want = $3)
            -- never re-match a pair either of them walked away from
            AND NOT EXISTS (SELECT 1 FROM partner_blocks b
                             WHERE (b.user_id = $1 AND b.other_id = p.user_id)
                                OR (b.user_id = p.user_id AND b.other_id = $1))
            -- and never someone already partnered
            AND NOT EXISTS (SELECT 1 FROM partnerships s
                             WHERE s.ended_at IS NULL
                               AND (s.a_id = p.user_id OR s.b_id = p.user_id))
          ORDER BY p.queued_at
          LIMIT 1
          FOR UPDATE OF p SKIP LOCKED`,
        [uid, want, me.gender]
      );
      const other = cand.rows[0]?.id as number | undefined;
      if (!other) {
        await c.query('UPDATE partner_prefs SET queued_at = now() WHERE user_id = $1', [uid]);
        return null;
      }
      const [a, b] = uid < other ? [uid, other] : [other, uid];
      const ins = await c.query(
        'INSERT INTO partnerships (a_id, b_id) VALUES ($1,$2) RETURNING id::text',
        [a, b]
      );
      await c.query('UPDATE partner_prefs SET queued_at = NULL WHERE user_id = ANY($1::bigint[])', [[uid, other]]);
      const pid = ins.rows[0].id;
      await c.query(
        'INSERT INTO partner_sides (pship_id, user_id) VALUES ($1,$2), ($1,$3) ON CONFLICT DO NOTHING',
        [pid, uid, other]
      );
      return pid;
    });

    res.json({ matched: !!matched, queued: !matched });
  })
);

partnerRouter.post(
  '/api/partner/cancel',
  requireAuth,
  wrap(async (req, res) => {
    await query('UPDATE partner_prefs SET queued_at = NULL WHERE user_id = $1', [req.userId!]);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Share settings. The one thing here that must be instant.

partnerRouter.patch(
  '/api/partner/share',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const me = await requireAdult(uid, res);
    if (!me) return;
    const p = await livePship(uid);
    if (!p) return res.status(404).json({ error: 'No partner' });

    const mod = req.body?.module;
    if (mod === 'chat') {
      await query(
        `INSERT INTO partner_sides (pship_id, user_id, chat_ok) VALUES ($1,$2,$3)
         ON CONFLICT (pship_id, user_id) DO UPDATE SET chat_ok = EXCLUDED.chat_ok`,
        [p.id, uid, !!req.body.on]
      );
      return res.json({ ok: true });
    }
    if (!isModule(mod)) return res.status(400).json({ error: 'Unknown tracker' });

    await query(
      `INSERT INTO partner_shares (pship_id, user_id, module, level) VALUES ($1,$2,$3,$4)
       ON CONFLICT (pship_id, user_id, module) DO UPDATE SET level = EXCLUDED.level`,
      [p.id, uid, mod, asLevel(req.body.level)]
    );
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Notes and chat

partnerRouter.post(
  '/api/partner/note',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const me = await requireAdult(uid, res);
    if (!me) return;
    const p = await livePship(uid);
    if (!p) return res.status(404).json({ error: 'No partner' });

    const body = String(req.body?.body || '').trim().slice(0, NOTE_MAX);
    if (!body) return res.status(400).json({ error: 'Write something first' });

    const mod = req.body?.module ?? null;
    if (mod !== null) {
      if (!isModule(mod)) return res.status(400).json({ error: 'Unknown tracker' });
      // Commenting on somebody's tracker requires *their* permission, not mine.
      // This is the check that makes level 3 mean anything.
      const theirs = await levelsFor(p.id, p.other);
      if (theirs[mod] < COMMENT) {
        return res.status(403).json({ error: 'Your partner has not opened that tracker for comments' });
      }
    } else {
      const mine = await sideOf(p.id, uid);
      const theirs = await sideOf(p.id, p.other);
      if (!mine.chat_ok || !theirs.chat_ok) {
        return res.status(403).json({ error: 'Chat is not open yet — you both need to turn it on' });
      }
    }

    const recent = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM partner_notes
       WHERE pship_id = $1 AND author_id = $2 AND created_at > now() - interval '1 hour'`,
      [p.id, uid]
    );
    if ((recent?.n ?? 0) >= NOTE_RATE) {
      return res.status(429).json({ error: 'That is a lot of messages at once. Try again shortly.' });
    }

    await query(
      'INSERT INTO partner_notes (pship_id, author_id, module, body) VALUES ($1,$2,$3,$4)',
      [p.id, uid, mod, body]
    );
    res.json({ ok: true });
  })
);

partnerRouter.post(
  '/api/partner/seen',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const p = await livePship(uid);
    if (!p) return res.json({ ok: true });
    await query(
      `INSERT INTO partner_sides (pship_id, user_id, seen_at) VALUES ($1,$2,now())
       ON CONFLICT (pship_id, user_id) DO UPDATE SET seen_at = now()`,
      [p.id, uid]
    );
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Ending it, and reporting

/** End the live partnership and make sure the pair is never matched again. */
async function endPship(p: Pship, uid: number): Promise<void> {
  await tx(async (c) => {
    await c.query('UPDATE partnerships SET ended_at = now(), ended_by = $2 WHERE id = $1 AND ended_at IS NULL', [p.id, uid]);
    // Both directions. The person who was left has not asked for anything, but
    // being handed back to someone who walked away from them is not a match.
    await c.query(
      `INSERT INTO partner_blocks (user_id, other_id) VALUES ($1,$2), ($2,$1)
       ON CONFLICT DO NOTHING`,
      [uid, p.other]
    );
  });
}

partnerRouter.post(
  '/api/partner/end',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const p = await livePship(uid);
    if (!p) return res.status(404).json({ error: 'No partner' });
    await endPship(p, uid);
    res.json({ ok: true });
  })
);

partnerRouter.post(
  '/api/partner/report',
  requireAuth,
  wrap(async (req, res) => {
    const uid = req.userId!;
    const p = await reportablePship(uid);
    if (!p) return res.status(404).json({ error: 'No partner to report' });

    const reason = REPORT_REASONS.includes(String(req.body?.reason)) ? String(req.body.reason) : 'other';
    const detail = String(req.body?.detail || '').trim().slice(0, 2000) || null;

    // Take the conversation now. The account being reported can be deleted, and
    // a report with nothing to look at cannot be acted on.
    const notes = await query<{ authorId: string; module: string | null; body: string; ts: string }>(
      `SELECT author_id::text AS "authorId", module, body, to_char(created_at,'YYYY-MM-DD HH24:MI') AS ts
       FROM partner_notes WHERE pship_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [p.id]
    );
    const transcript = notes
      .reverse()
      .map((n) => `[${n.ts}] ${n.authorId === String(uid) ? 'reporter' : 'accused'}${n.module ? ` (${n.module})` : ''}: ${n.body}`)
      .join('\n')
      .slice(0, 20000);

    await query(
      'INSERT INTO partner_reports (pship_id, reporter_id, accused_id, reason, detail, transcript) VALUES ($1,$2,$3,$4,$5,$6)',
      [p.id, uid, p.other, reason, detail, transcript]
    );
    // Reporting always ends the pairing. Being asked "do you also want to stop
    // being partners?" after saying somebody harassed you is a question with
    // one sensible answer, so it is not asked.
    await endPship(p, uid);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Admin: the reports queue. Guarded by the same password as the feedback inbox,
// which is checked by the caller in index.ts before this is reached.

export async function listReports(): Promise<any[]> {
  return query(
    `SELECT r.id::text, r.reason, r.detail, r.transcript, r.handled,
            (EXTRACT(EPOCH FROM r.created_at) * 1000)::float8 AS ts,
            rep.email AS "reporterEmail", rep.name AS "reporterName",
            acc.id::text AS "accusedId", acc.email AS "accusedEmail", acc.name AS "accusedName"
     FROM partner_reports r
     LEFT JOIN users rep ON rep.id = r.reporter_id
     LEFT JOIN users acc ON acc.id = r.accused_id
     ORDER BY r.handled, r.created_at DESC LIMIT 200`
  );
}
