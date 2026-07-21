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
