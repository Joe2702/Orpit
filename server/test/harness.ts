// A real server against a real database, for the tests in this folder.
//
// The money logic lives in SQL and in the order things happen across requests:
// which account a message lands in, what a rescan rewrites, when a recurring
// bill counts as paid. Mocking the database would test the mock. So each run
// starts the actual server on a spare port against TEST_DATABASE_URL (a
// throwaway Postgres: CI starts one as a service) and talks to it over HTTP,
// like the app does.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyseSms, type SmsMessage } from '../../web/src/lib/smsParse';
import { buildRows, accountBalance, type Fx } from '../../web/src/lib/ledger';
import type { AppState } from '../../web/src/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The test server's admin password, for the admin endpoints. */
export const ADMIN = 'test-admin';

export interface Mail {
  tag: string;
  to: string;
  subject: string;
  html: string;
}

export interface Server {
  base: string;
  stop: () => void;
  /** Every email the server "sent", oldest first. */
  outbox: () => Mail[];
}

export async function startServer(): Promise<Server> {
  const db = process.env.TEST_DATABASE_URL;
  if (!db) throw new Error('Set TEST_DATABASE_URL to a throwaway Postgres database to run the server tests.');
  const port = 4800 + Math.floor(Math.random() * 900);
  const outboxFile = join(mkdtempSync(join(tmpdir(), 'orbit-mail-')), 'outbox.jsonl');
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: db, JWT_SECRET: 'test-secret', PORT: String(port), ADMIN_PASSWORD: ADMIN, MAIL_OUTBOX: outboxFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout?.on('data', (b) => (log += b));
  child.stderr?.on('data', (b) => (log += b));
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  // The schema is applied after the server starts listening; /api/health
  // says when it's done.
  for (;;) {
    try {
      const r = await fetch(`${base}/api/health`);
      const j = (await r.json()) as { schema?: boolean };
      if (r.ok && j.schema) break;
    } catch {
      /* not up yet */
    }
    if (child.exitCode != null || Date.now() > deadline) {
      child.kill();
      throw new Error(`Server did not start:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const outbox = () =>
    existsSync(outboxFile)
      ? readFileSync(outboxFile, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l) as Mail)
      : [];
  return { base, stop: () => child.kill(), outbox };
}

export class Client {
  token = '';
  email = '';
  state!: AppState;
  constructor(private base: string) {}

  async call<T = AppState>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const r = await fetch(this.base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j)}`);
    if (j && typeof j === 'object' && 'txns' in j) this.state = j as AppState;
    return j as T;
  }

  /** A fresh account, so tests never see each other's data. */
  async signup(name = 'Test User'): Promise<this> {
    const email = `t${Date.now()}${Math.random().toString(36).slice(2, 8)}@test.dev`;
    const r = await this.call<{ token: string; state: AppState }>('/api/auth/signup', 'POST', { email, password: 'long-enough-password', name });
    this.token = r.token;
    this.email = email;
    this.state = r.state;
    return this;
  }

  /** What the phone does: read the messages, build rows against the current state, send them. */
  async importSms(messages: { sender: string; body: string; ts: number }[], fx: Record<string, Fx> = {}): Promise<AppState> {
    const items = messages.map((m, i) => {
      const a = analyseSms({ ...m, id: String(i) } as SmsMessage, 'EGP');
      if (!a.ok) throw new Error(`Test message not read (${a.reason}): ${m.body}`);
      return { p: a.parsed, sender: m.sender };
    });
    const rows = buildRows(items, { home: 'EGP', state: this.state, fx });
    return this.call('/api/txns/sms', 'POST', { items: rows });
  }

  account(name: string) {
    const a = this.state.accounts.find((x) => x.name === name);
    if (!a) throw new Error(`No account "${name}" in ${this.state.accounts.map((x) => x.name).join(', ')}`);
    return a;
  }

  balance(name: string): number {
    const a = this.account(name);
    return accountBalance(a, this.state.txns, this.state.archive?.accSums?.[a.id] || 0);
  }
}
