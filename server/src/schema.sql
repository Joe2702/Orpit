-- Orbit schema. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT 'Alex Rivera',
  theme         TEXT NOT NULL DEFAULT 'light',
  reminders     BOOLEAN NOT NULL DEFAULT TRUE,
  haptics       BOOLEAN NOT NULL DEFAULT TRUE,
  onboarded     BOOLEAN NOT NULL DEFAULT FALSE,
  currency      TEXT NOT NULL DEFAULT 'EGP',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EGP';
-- Google sign-in users have no password; password reset needs a tokens table.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
-- Optional profile photo, stored as a small data URL.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
-- Per-screen widget order (JSON), so the customized dashboard syncs across devices.
ALTER TABLE users ADD COLUMN IF NOT EXISTS layout TEXT;
-- Daily reminder: local time (HH:MM) + IANA timezone to fire it correctly.
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_time TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_tz TEXT;

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS habits (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'teal',
  target     TEXT NOT NULL DEFAULT 'Daily',
  sort       INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- locked = the permanent "Daily Check-In" habit (can't be edited/deleted).
ALTER TABLE habits ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;
-- days = 7-char mask, Sun..Sat, '1' = tracked that weekday.
ALTER TABLE habits ADD COLUMN IF NOT EXISTS days TEXT NOT NULL DEFAULT '1111111';

-- One row per habit per day it was completed. Powers streaks + heatmap from real data.
CREATE TABLE IF NOT EXISTS habit_checkins (
  habit_id BIGINT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      DATE NOT NULL,
  PRIMARY KEY (habit_id, day)
);
CREATE INDEX IF NOT EXISTS habit_checkins_user_day ON habit_checkins(user_id, day);

CREATE TABLE IF NOT EXISTS workout_categories (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'coral',
  sort       INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workouts (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES workout_categories(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  dur         INT NOT NULL DEFAULT 0,
  dist        TEXT,
  kcal        INT,
  intensity   TEXT,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workouts_user_ts ON workouts(user_id, ts);

CREATE TABLE IF NOT EXISTS nights (
  id      BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hours   DOUBLE PRECISION NOT NULL,
  quality INT NOT NULL,
  bed_h   DOUBLE PRECISION,
  wake_h  DOUBLE PRECISION,
  ts      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nights_user_ts ON nights(user_id, ts);

CREATE TABLE IF NOT EXISTS txns (
  id      BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  cat     TEXT NOT NULL,
  amount  DOUBLE PRECISION NOT NULL,
  income  BOOLEAN NOT NULL DEFAULT FALSE,
  acc_id  BIGINT,
  note    TEXT,
  ts      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS txns_user_ts ON txns(user_id, ts);
ALTER TABLE txns ADD COLUMN IF NOT EXISTS acc_id BIGINT;
ALTER TABLE txns ADD COLUMN IF NOT EXISTS note TEXT;
-- Transfers. A row with to_acc_id set moves money from acc_id to to_acc_id: it
-- changes two balances and is neither income nor spending. Modelled as one row
-- rather than a matched pair, so a half-deleted transfer cannot exist.
ALTER TABLE txns ADD COLUMN IF NOT EXISTS to_acc_id BIGINT;
-- Balance corrections. When the app's figure drifts from the bank's, the gap is
-- recorded as a dated row rather than by rewriting the opening balance: the
-- correction belongs to the day it was noticed, and history stays as it was.
-- It changes net worth (the money is real) but is neither income nor spending.
ALTER TABLE txns ADD COLUMN IF NOT EXISTS adjust BOOLEAN NOT NULL DEFAULT FALSE;
-- Where an entry came from. Set when it was read out of a bank SMS rather than
-- typed, so the app can mark it as unchecked and the user knows which figures
-- came from a machine reading a message.
--
-- `sms_key` is a hash of the message, and the unique index on it is what makes
-- importing safe to repeat: re-scanning the inbox, reinstalling the app, or
-- adding a second phone all re-offer the same messages, and every one of them
-- has to land on the row that already exists rather than beside it. Enforcing
-- that here rather than on the device is the point — a device only knows what
-- it has seen itself.
ALTER TABLE txns ADD COLUMN IF NOT EXISTS sms_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS txns_sms_key ON txns(user_id, sms_key) WHERE sms_key IS NOT NULL;

-- Imported payments the user threw away.
--
-- Deleting the transaction is not enough on its own: the message it came from
-- is still sitting in the phone's inbox, so a later re-scan would import it
-- again and the user would have to delete the same thing twice. Remembering the
-- key is what makes "delete" mean deleted.
CREATE TABLE IF NOT EXISTS sms_ignored (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sms_key TEXT NOT NULL,
  PRIMARY KEY (user_id, sms_key)
);

-- ===== v2: accounts, finance categories, budgets, goals, recurring, counters =====

CREATE TABLE IF NOT EXISTS accounts (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'Bank',
  color      TEXT NOT NULL DEFAULT 'blue',
  opening    DOUBLE PRECISION NOT NULL DEFAULT 0,
  sort       INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fcats (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT 'other',
  color      TEXT NOT NULL DEFAULT 'coral',
  kind       TEXT NOT NULL DEFAULT 'expense',
  sort       INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budgets (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cat        TEXT NOT NULL,
  limit_amt  DOUBLE PRECISION NOT NULL DEFAULT 0,
  sort       INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goals (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  target     DOUBLE PRECISION NOT NULL DEFAULT 0,
  current    DOUBLE PRECISION NOT NULL DEFAULT 0,
  color      TEXT NOT NULL DEFAULT 'indigo',
  due_ts     TIMESTAMPTZ,
  sort       INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recurring (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  cat        TEXT NOT NULL,
  acc_id     BIGINT,
  amount     DOUBLE PRECISION NOT NULL DEFAULT 0,
  freq       TEXT NOT NULL DEFAULT 'Monthly',
  next_ts    TIMESTAMPTZ,
  sort       INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS counters (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  unit       TEXT NOT NULL DEFAULT 'count',
  color      TEXT NOT NULL DEFAULT 'indigo',
  icon       TEXT NOT NULL DEFAULT 'tally',
  step       DOUBLE PRECISION NOT NULL DEFAULT 1,
  sort       INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS count_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counter_id BIGINT NOT NULL REFERENCES counters(id) ON DELETE CASCADE,
  amount     DOUBLE PRECISION NOT NULL DEFAULT 0,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS count_logs_user_ts ON count_logs(user_id, ts);

-- Web-push subscriptions (one per installed device). last_sent = the tz-local
-- date (YYYY-MM-DD) we last fired a reminder, so we never double-send in a day.
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint   TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sub        TEXT NOT NULL,
  last_sent  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs(user_id);

CREATE TABLE IF NOT EXISTS feedback (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'suggestion',
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Achievement badges the user has claimed (JSON array of ids), so the reveal
-- state follows the account across devices instead of living in localStorage.
ALTER TABLE users ADD COLUMN IF NOT EXISTS claimed_badges TEXT;
-- Whether the user finished the first-run intro. Defaults TRUE so existing
-- accounts aren't shown the tour; signup explicitly sets it FALSE.
ALTER TABLE users ADD COLUMN IF NOT EXISTS intro_done BOOLEAN NOT NULL DEFAULT TRUE;

-- Built-in crash reporting: unhandled client errors, so a tester's crash is
-- visible to the owner instead of disappearing on their phone.
CREATE TABLE IF NOT EXISTS client_errors (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  message    TEXT NOT NULL,
  stack      TEXT,
  build      TEXT,
  platform   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_errors_created ON client_errors(created_at DESC);

-- ===== v3: retention, insights, personalisation =====

-- Habits: pause (travel/illness) without losing the run, archive instead of
-- destroying history, a personal "why", and an optional per-habit reminder.
ALTER TABLE habits ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS why TEXT;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS reminder_time TEXT;

-- Free-text notes turn entries into a diary ("knee hurt", "kid woke me twice").
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE nights   ADD COLUMN IF NOT EXISTS note TEXT;

-- Recurring entries can be income (salary), not just expenses.
ALTER TABLE recurring ADD COLUMN IF NOT EXISTS income BOOLEAN NOT NULL DEFAULT FALSE;

-- Saved workout presets ("Push day · 45 min · Hard").
CREATE TABLE IF NOT EXISTS workout_templates (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category_id BIGINT REFERENCES workout_categories(id) ON DELETE CASCADE,
  dur         INT NOT NULL DEFAULT 30,
  intensity   TEXT,
  sort        INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Personalisation: accent colour and which trackers the user wants to see.
ALTER TABLE users ADD COLUMN IF NOT EXISTS accent TEXT NOT NULL DEFAULT 'indigo';
ALTER TABLE users ADD COLUMN IF NOT EXISTS modules TEXT;
-- Bumped to invalidate tokens on other devices ("sign out everywhere else").
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

-- ===== v3.1: quick wins =====
-- Unused budget can carry into next month.
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS rollover BOOLEAN NOT NULL DEFAULT FALSE;
-- In-app text size multiplier (0.9 / 1 / 1.1 / 1.2).
ALTER TABLE users ADD COLUMN IF NOT EXISTS text_scale REAL NOT NULL DEFAULT 1;
-- Optional "start winding down" nudge before the usual bedtime.
ALTER TABLE users ADD COLUMN IF NOT EXISTS wind_down BOOLEAN NOT NULL DEFAULT FALSE;

-- ===== v3.2: medium features =====
-- Strength logging. Sets live as JSONB on the workout rather than in their own
-- table: they're always read and written together with the workout, and nothing
-- ever queries across them.
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS sets JSONB;

-- Receipt photos, kept out of the workouts/txns rows and out of the state
-- bundle so a few hundred KB of image never rides along with every app open.
CREATE TABLE IF NOT EXISTS txn_photos (
  txn_id     BIGINT PRIMARY KEY REFERENCES txns(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS txn_photos_user ON txn_photos(user_id);

-- Email verification: a single-use token per request, expiring after a day.
CREATE TABLE IF NOT EXISTS email_verifications (
  token      TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verifications_user ON email_verifications(user_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- ===== v3.3: offline logging =====
-- Idempotency keys for queued offline mutations. A client that loses the
-- response to a request cannot know whether it applied, so it replays; this
-- table makes the replay a no-op instead of a duplicate entry (or, for a habit
-- toggle, a silent un-toggle). Rows are pruned after a week.
-- Keyed per user: a key is only ever meaningful to the account that minted it,
-- and a global primary key would let one account's id silently swallow
-- another's write.
CREATE TABLE IF NOT EXISTS client_ops (
  op_id      TEXT NOT NULL,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, op_id)
);
CREATE INDEX IF NOT EXISTS client_ops_created ON client_ops(created_at);

-- ===== v3: milestones ("2 months vegan", "since born") =====
-- A date you count forward from, rather than an entry you log. `since` is a
-- DATE, not a timestamp: nobody counts a relationship from 14:32, and a bare
-- date has no timezone to shift it across a boundary.
CREATE TABLE IF NOT EXISTS milestones (
  id      BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  since   DATE NOT NULL,
  color   TEXT NOT NULL DEFAULT 'indigo',
  icon    TEXT NOT NULL DEFAULT 'star',
  sort    INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS milestones_user ON milestones(user_id);
