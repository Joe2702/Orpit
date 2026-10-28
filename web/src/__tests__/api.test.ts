import { describe, it, expect, beforeEach, vi } from 'vitest';

// A minimal localStorage so the modules under test run unmodified in node.
const mem: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in mem ? mem[k] : null),
  setItem: (k: string, v: string) => void (mem[k] = v),
  removeItem: (k: string) => void delete mem[k],
};

import { api, probeServer, ApiError } from '../api';
import { connectivity, clearQueue, noteDevice, noteReachable, OfflineQueuedError, pending } from '../lib/offline';

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

beforeEach(() => {
  clearQueue();
  noteDevice(true);
  noteReachable(true);
});

describe('requests while Orbit is waking up', () => {
  it('queues a log on a 503 instead of losing it', async () => {
    // The readiness gate answers 503 while the database wakes. The request
    // never reached the handler, so the entry is as safe to defer as with no
    // signal — rolling it back with "try again" was the old behaviour.
    globalThis.fetch = respond(503, { error: 'Starting up — the database is still waking. Try again in a moment.' }) as any;
    await expect(api.addNight({} as any)).rejects.toBeInstanceOf(OfflineQueuedError);
    expect(pending()).toBe(1);
    expect(connectivity()).toBe('unreachable');
  });

  it("never shows the server's own words for a 5xx", async () => {
    globalThis.fetch = respond(503, { error: 'Starting up — the database is still waking. Try again in a moment.' }) as any;
    const err = await api.getState().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).not.toMatch(/database/i);
  });

  it("keeps the server's words for a 4xx, which are written for people", async () => {
    globalThis.fetch = respond(400, { error: 'That password is incorrect' }) as any;
    const err = await api.login('a@b.c', 'x').catch((e) => e);
    expect(err.message).toBe('That password is incorrect');
    expect(connectivity()).toBe('online');
  });

  it('replaces "Failed to fetch" with something a person would say', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as any;
    const err = await api.getState().catch((e) => e);
    expect(err.message).not.toMatch(/fetch/i);
    expect(err.message).toMatch(/reach Orbit/);
  });
});

describe('probeServer', () => {
  it('brings the app back online once the server answers — the old deadlock', async () => {
    // Before: one failed request marked the app offline, and the retry timer
    // only ran while online, so nothing ever cleared it.
    noteReachable(false);
    expect(connectivity()).toBe('unreachable');
    globalThis.fetch = respond(200, { ok: true, schema: true }) as any;
    expect(await probeServer()).toBe(true);
    expect(connectivity()).toBe('online');
  });

  it('stays unreachable while the database is still waking', async () => {
    globalThis.fetch = respond(200, { ok: true, schema: false }) as any;
    expect(await probeServer()).toBe(false);
    expect(connectivity()).toBe('unreachable');
  });

  it('asks the endpoint that never touches the database', async () => {
    const f = respond(200, { ok: true, schema: true });
    globalThis.fetch = f as any;
    await probeServer();
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toMatch(/\/api\/health$/);
  });
});
