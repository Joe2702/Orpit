// AUTO-GENERATED from schema.sql — the app runs this on startup to create tables.
export const SCHEMA_SQL = `
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
`;
