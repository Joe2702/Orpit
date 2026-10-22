import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL || 'postgres://orbit:orbit@localhost:5432/orbit';

// Cloud Postgres (Neon, Render, etc.) requires SSL; local dev does not.
const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

/**
 * Required, not optional: without this the process dies.
 *
 * node-postgres emits 'error' on the pool when a connection sitting *idle* in
 * it is dropped by the server, and an unhandled 'error' event in Node throws
 * and takes the process with it. There is no request in flight to catch it —
 * nobody is awaiting anything, so no try/catch anywhere can help.
 *
 * This is the normal way a serverless Postgres behaves, not an edge case. It
 * suspends its compute when idle or out of quota and terminates whatever was
 * connected, which produced exactly this crash in testing:
 *
 *     error: terminating connection due to administrator command
 *     Emitted 'error' event on BoundPool instance
 *
 * The server is written to stay up and answer /api/health with the database
 * down, so that an outage is visible rather than looking like a hang. That
 * promise is worth nothing if the first dropped connection kills it, and a
 * host that restarts the process just turns the outage into a crash loop.
 *
 * A dead idle connection needs no action: the pool discards it and opens a
 * fresh one on the next query. Logging it and carrying on is the whole fix.
 */
pool.on('error', (err) => {
  console.error('[db] idle client error (connection dropped, pool will reconnect):', err.message);
});

export async function query<T = any>(text: string, params: any[] = []) {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function one<T = any>(text: string, params: any[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] as T | undefined;
}

/** Run a set of statements inside a single transaction. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
