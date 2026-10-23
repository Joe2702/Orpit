// Demo build only (VITE_DEMO=1).
//
// A web preview of a branch can't sign in to the real server: the server only
// answers the app's own origins. So the demo carries a believable fourteen
// months of someone's data and a small stand-in for the server that lives in
// the page and answers the app's requests. Logging, checking off, editing and
// deleting all work; a reload starts the demo over. Nothing leaves the page.

// @ts-expect-error plain-JS demo data shared with the screenshot tour
import { state as seed } from '../../tools/richstate.mjs';
import type { AppState } from './types';

let db: AppState = JSON.parse(JSON.stringify(seed));
let nextId = 1;
const newId = () => `demo${nextId++}`;

// URL segment → the state list it edits.
const LISTS: Record<string, keyof AppState> = {
  workouts: 'workouts',
  nights: 'nights',
  txns: 'txns',
  habits: 'habits',
  counters: 'counters',
  milestones: 'milestones',
  accounts: 'accounts',
  budgets: 'budgets',
  goals: 'goals',
  recurring: 'recurring',
  fcats: 'fcats',
  categories: 'wCats',
  wtemplates: 'wTemplates',
};

const PARTNER = { eligible: true, dob: '2001-12-12', gender: null, want: 'any', queued: false, recent: null, partner: null };

function shapeTxn(b: any) {
  const amt = Math.abs(Number(b.amount) || 0);
  const toAccId = b.toAccId || null;
  const adjust = !toAccId && !!b.adjust;
  const income = !toAccId && !adjust && !!b.income;
  return {
    name: String(b.name || b.cat || 'Payment'),
    cat: toAccId ? 'Transfer' : adjust ? 'Adjustment' : String(b.cat || 'Other'),
    amount: adjust ? Number(b.amount) || 0 : income ? amt : -amt,
    income,
    accId: b.accId || null,
    toAccId,
    adjust,
    note: b.note ?? null,
    photo: false,
  };
}

function handle(method: string, path: string, body: any): { status: number; json: unknown } {
  const ok = (json: unknown = db) => ({ status: 200, json });
  const parts = path.split('/').filter(Boolean); // e.g. ['habits', '3', 'toggle']

  if (path === '/health') return ok({ ok: true, schema: true });
  if (path === '/state' || path === '/export') return ok();
  if (path.startsWith('/partner')) return ok(PARTNER);
  if (path.startsWith('/auth/')) return ok({ token: 'demo', state: db });
  if (path.startsWith('/push/')) return ok({ ok: true, sent: 0, key: '' });

  if (path === '/me' && method === 'PATCH') {
    db = { ...db, profile: { ...db.profile, ...body } };
    return ok();
  }
  if (path === '/habits/order' && method === 'PATCH') {
    const ids: string[] = body.ids || [];
    db = { ...db, habits: [...db.habits].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)) };
    return ok();
  }
  if (parts[0] === 'habits' && parts[2] === 'toggle') {
    const day = String(body.day);
    const has = db.checkins.some((c) => c.habitId === parts[1] && c.day === day);
    db = {
      ...db,
      checkins: has ? db.checkins.filter((c) => !(c.habitId === parts[1] && c.day === day)) : [...db.checkins, { habitId: parts[1], day }],
    };
    return ok();
  }
  if (parts[0] === 'counters' && parts[2] === 'log') {
    db = { ...db, countLogs: [...db.countLogs, { id: newId(), counterId: parts[1], amount: Number(body.amount) || 0, ts: body.ts ? Number(body.ts) : Date.now() }] };
    return ok();
  }

  const key = LISTS[parts[0]];
  if (key) {
    const list = (db[key] as unknown as { id: string }[]) || [];
    const shape = (b: any) => (key === 'txns' ? shapeTxn(b) : b);
    if (method === 'POST' && parts.length === 1) {
      const row = { locked: false, paused: false, archived: false, ...shape(body), id: newId(), ts: body.ts ? Number(body.ts) : Date.now() };
      db = { ...db, [key]: [...list, row] };
      return ok();
    }
    if (method === 'PATCH' && parts[1]) {
      db = { ...db, [key]: list.map((r) => (r.id === parts[1] ? { ...r, ...shape(body), id: r.id } : r)) };
      return ok();
    }
    if (method === 'DELETE' && parts[1]) {
      db = { ...db, [key]: list.filter((r) => r.id !== parts[1]) };
      if (key === 'habits') db = { ...db, checkins: db.checkins.filter((c) => c.habitId !== parts[1]) };
      if (key === 'counters') db = { ...db, countLogs: db.countLogs.filter((l) => l.counterId !== parts[1]) };
      return ok();
    }
  }
  // Anything else (feedback, imports, password changes) succeeds and changes
  // nothing, which is all a demo needs from it.
  return ok();
}

export function installDemo(): void {
  try {
    localStorage.setItem('orbit_token', 'demo');
    localStorage.setItem('orbit_reminder_onboarded', '1');
    localStorage.removeItem('orbit_state_cache');
    localStorage.removeItem('orbit_offline_queue');
  } catch {
    /* storage blocked: the app still boots, it just asks to sign in */
  }

  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const at = url.indexOf('/api/');
    if (at < 0) return real(input, init);
    const path = url.slice(at + 4).split('?')[0];
    const method = (init?.method || 'GET').toUpperCase();
    let body: any = {};
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    } catch {
      body = {};
    }
    // A short, real-feeling delay, so loading states show the way they would.
    await new Promise((r) => setTimeout(r, 120));
    const res = handle(method, path, body);
    return new Response(JSON.stringify(res.json), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  };

  // Say plainly that this is a demo, once, and get out of the way.
  const tag = document.createElement('div');
  tag.textContent = 'Demo account · changes reset when you reload';
  tag.setAttribute('role', 'status');
  Object.assign(tag.style, {
    position: 'fixed',
    left: '50%',
    top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
    transform: 'translateX(-50%)',
    zIndex: '1000',
    padding: '7px 13px',
    borderRadius: '999px',
    background: 'rgba(19,19,23,.88)',
    color: '#f0f0f3',
    font: '600 12.5px/1.2 system-ui, sans-serif',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    transition: 'opacity .4s',
  } as CSSStyleDeclaration);
  document.body.appendChild(tag);
  setTimeout(() => (tag.style.opacity = '0'), 5000);
  setTimeout(() => tag.remove(), 5600);
}
