import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { one } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export interface AuthedRequest extends Request {
  userId?: number;
}

/**
 * `ver` is the account's token version. "Sign out other devices" bumps it,
 * which makes every previously issued token stop validating.
 */
export function signToken(userId: number, ver = 0): string {
  return jwt.sign({ uid: userId, ver }, SECRET, { expiresIn: '30d' });
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  let payload: { uid: number; ver?: number };
  try {
    payload = jwt.verify(token, SECRET) as { uid: number; ver?: number };
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  try {
    // Reject tokens issued before the last "sign out everywhere else".
    const row = await one<{ token_version: number }>('SELECT token_version FROM users WHERE id = $1', [payload.uid]);
    if (!row) return res.status(401).json({ error: 'Invalid token' });
    if ((row.token_version ?? 0) !== (payload.ver ?? 0)) {
      return res.status(401).json({ error: 'Session ended on this device' });
    }
  } catch {
    // Database hiccup shouldn't log everyone out — fall through on the token alone.
  }
  req.userId = payload.uid;
  next();
}
