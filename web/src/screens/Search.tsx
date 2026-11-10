import React, { useState } from 'react';
import { useStore } from '../store';
import { BackButton, SectionLabel } from '../ui';
import type { AppState } from '../types';
import { money, relLabel, hm } from '../lib/format';
import { t, tData, tn } from '../i18n';

type Store = ReturnType<typeof useStore>;
type Go = Store['go'];
type Open = Store['open'];

interface Hit {
  id: string;
  kind: 'workout' | 'sleep' | 'txn' | 'habit' | 'counter';
  title: string;
  sub: string;
  right: string;
  color: string;
  ts: number;
  open: () => void;
}

// One search box across everything — entries, habits and counters — so people
// can find "that gym session in March" without hunting through tabs.
function collect(s: AppState, ql: string, go: Go, open: Open): Hit[] {
  const hits: Hit[] = [];
  {
    const catName = (id: string | null) => s.wCats.find((c) => c.id === id)?.name || '';

    s.workouts.forEach((w) => {
      const hay = `${w.name} ${catName(w.catId)} ${w.note || ''} ${w.intensity || ''}`.toLowerCase();
      if (!hay.includes(ql)) return;
      hits.push({
        id: 'w' + w.id,
        kind: 'workout',
        title: tData(w.name),
        sub: `${relLabel(w.ts)}${w.note ? ` · ${w.note}` : ''}`,
        right: t('{n} min', { n: w.dur }),
        color: 'coral',
        ts: w.ts,
        open: () => open('edit', { kind: 'workout', item: w }),
      });
    });

    s.nights.forEach((n) => {
      const hay = `sleep night ${n.note || ''}`.toLowerCase();
      if (!hay.includes(ql)) return;
      hits.push({
        id: 'n' + n.id,
        kind: 'sleep',
        title: t('Sleep'),
        sub: `${relLabel(n.ts)}${n.note ? ` · ${n.note}` : ''}`,
        right: hm(n.hours),
        color: 'blue',
        ts: n.ts,
        open: () => open('edit', { kind: 'sleep', item: n }),
      });
    });

    s.txns.forEach((t) => {
      const hay = `${t.name} ${t.cat} ${t.note || ''}`.toLowerCase();
      if (!hay.includes(ql)) return;
      hits.push({
        id: 't' + t.id,
        kind: 'txn',
        title: t.name,
        sub: `${t.cat} · ${relLabel(t.ts)}`,
        right: money(t.amount),
        color: t.amount >= 0 ? 'emerald' : 'text2',
        ts: t.ts,
        open: () => go('faddtx', { edit: t }),
      });
    });

    s.habits
      .filter((h) => !h.archived)
      .forEach((h) => {
        const hay = `${h.name} ${h.why || ''}`.toLowerCase();
        if (!hay.includes(ql)) return;
        const count = s.checkins.filter((c) => c.habitId === h.id).length;
        hits.push({
          id: 'h' + h.id,
          kind: 'habit',
          title: h.name,
          sub: h.why || t('Habit'),
          right: tn(count, '{n} day', '{n} days'),
          color: h.color,
          ts: Number.MAX_SAFE_INTEGER, // habits sort to the top
          open: () => open('habitcal', { habitId: h.id }),
        });
      });

    s.counters.forEach((c) => {
      if (!`${c.name} ${c.unit}`.toLowerCase().includes(ql)) return;
      hits.push({
        id: 'c' + c.id,
        kind: 'counter',
        title: c.name,
        sub: t('Counter'),
        right: c.unit,
        color: c.color,
        ts: Number.MAX_SAFE_INTEGER - 1,
        open: () => go('counters'),
      });
    });
  }
  return hits;
}

const RECENT_KEY = 'orbit_recent_searches';
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
};
const writeRecent = (list: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private mode: recent searches just aren't kept */
  }
};

/**
 * Names worth searching for, from the user's own entries: the places they pay
 * most often, then their habits and workouts. Tapping one runs the search.
 */
function suggestions(s: AppState): string[] {
  const since = Date.now() - 60 * 86400000;
  const counts = new Map<string, { name: string; n: number }>();
  const bump = (name: string, by = 1) => {
    const k = name.trim().toLowerCase();
    if (k.length < 2) return;
    const e = counts.get(k) || { name: name.trim(), n: 0 };
    e.n += by;
    counts.set(k, e);
  };
  s.txns.forEach((x) => !x.toAccId && !x.adjust && x.ts >= since && x.name !== x.cat && bump(x.name));
  s.workouts.forEach((w) => w.ts >= since && bump(w.name));
  const places = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 4).map((e) => e.name);
  const habits = s.habits.filter((h) => !h.archived && !h.paused).map((h) => tData(h.name)).slice(0, 2);
  return [...new Set([...places, ...habits])].slice(0, 6);
}

// One search box across everything — entries, habits and counters — so people
// can find "that gym session in March" without hunting through tabs.
export function Search() {
  const { state, go, open, back } = useStore();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>(readRecent);
  const ql = q.trim().toLowerCase();

  const hits = ql.length >= 2 ? collect(state!, ql, go, open) : [];
  hits.sort((a, b) => b.ts - a.ts);
  const shown = hits.slice(0, 60);

  const remember = (term: string) => {
    const v = term.trim();
    if (v.length < 2) return;
    const next = [v, ...recent.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 5);
    setRecent(next);
    writeRecent(next);
  };
  const clearRecent = () => {
    setRecent([]);
    writeRecent([]);
  };

  // Before anything is typed: what you looked for last, names from your own
  // entries to search for, and the latest few entries themselves. A blank
  // screen with "type two letters" asked for effort and offered nothing.
  const latest = ql.length < 2
    ? collect(state!, '', go, open)
        .filter((h) => h.ts <= Date.now() && (h.kind === 'txn' || h.kind === 'workout' || h.kind === 'sleep'))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 5)
    : [];
  const ideas = ql.length < 2 ? suggestions(state!).filter((x) => !recent.some((r) => r.toLowerCase() === x.toLowerCase())) : [];

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <BackButton onClick={back} />
        <div className="display" style={{ flex: 1, minWidth: 0, fontSize: 32, lineHeight: 1.1, color: 'var(--text)' }}>{t('Search')}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: '0 14px', height: 50, marginBottom: 18 }}>
        <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }} aria-hidden>
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="M13 13l3 3" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && remember(q)}
          autoFocus
          enterKeyHint="search"
          placeholder={t('Workouts, notes, transactions, habits…')}
          aria-label={t('Search everything')}
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', fontSize: 15, color: 'var(--text)', outline: 'none' }}
        />
        {q && (
          <span tabIndex={0} onClick={() => setQ('')} role="button" aria-label={t('Clear')} className="hit" style={{ fontSize: 18, color: 'var(--text2)', cursor: 'pointer', padding: 4 }}>
            ×
          </span>
        )}
      </div>

      {ql.length < 2 ? (
        recent.length || ideas.length || latest.length ? (
          <>
            {recent.length > 0 && (
              <>
                <SectionLabel action={{ label: t('Clear'), onClick: clearRecent }}>{t('Recent searches')}</SectionLabel>
                <div style={{ ...listCard, marginBottom: 24 }}>
                  {recent.map((r, i) => (
                    <div key={r} role="button" tabIndex={0} onClick={() => setQ(r)} className="pressRow" style={{ ...rowS, borderBottom: i === recent.length - 1 ? 'none' : '1px solid var(--border)' }}>
                      <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden style={{ flex: 'none', fill: 'none', stroke: 'var(--text3)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                        <circle cx="9" cy="9" r="6.5" />
                        <path d="M9 5.5V9l2.5 1.5" />
                      </svg>
                      <span dir="auto" style={{ flex: 1, minWidth: 0, fontSize: 15, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {ideas.length > 0 && (
              <>
                <SectionLabel>{t('Quick searches')}</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                  {ideas.map((x) => (
                    <div key={x} role="button" tabIndex={0} onClick={() => setQ(x)} className="press96" dir="auto" style={{ display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 16px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 15, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {x}
                    </div>
                  ))}
                </div>
              </>
            )}
            {latest.length > 0 && (
              <>
                <SectionLabel>{t('Latest entries')}</SectionLabel>
                <HitList hits={latest} />
              </>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text2)', fontSize: 15, lineHeight: 1.6 }}>
            {t('Searches names, categories and your notes.')}
          </div>
        )
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text2)', fontSize: 15 }}>
          {t('Nothing matches “{q}”.', { q })}</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, paddingInlineStart: 2 }}>
            {tn(hits.length, '{n} result', '{n} results')}
          </div>
          <HitList hits={shown} onOpen={() => remember(q)} />
        </>
      )}
    </div>
  );
}

const listCard: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'calc(18px * var(--sq))', boxShadow: 'var(--shadow)', overflow: 'hidden' };
const rowS: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '12px 16px', cursor: 'pointer' };

function HitList({ hits, onOpen }: { hits: Hit[]; onOpen?: () => void }) {
  return (
    <div style={listCard}>
      {hits.map((hit, i) => (
        <div
          role="button"
          tabIndex={0}
          key={hit.id}
          onClick={() => {
            onOpen?.();
            hit.open();
          }}
          className="pressRow"
          style={{ ...rowS, borderBottom: i === hits.length - 1 ? 'none' : '1px solid var(--border)' }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: `var(--${hit.color})` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hit.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hit.sub}</div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{hit.right}</div>
        </div>
      ))}
    </div>
  );
}
