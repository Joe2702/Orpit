import React, { useState } from 'react';
import { useStore } from '../store';
import { BackButton } from '../ui';
import { money, relLabel, hm } from '../lib/format';

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
export function Search() {
  const { state, go, open } = useStore();
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();

  const hits: Hit[] = [];
  if (ql.length >= 2) {
    const s = state!;
    const catName = (id: string | null) => s.wCats.find((c) => c.id === id)?.name || '';

    s.workouts.forEach((w) => {
      const hay = `${w.name} ${catName(w.catId)} ${w.note || ''} ${w.intensity || ''}`.toLowerCase();
      if (!hay.includes(ql)) return;
      hits.push({
        id: 'w' + w.id,
        kind: 'workout',
        title: w.name,
        sub: `${relLabel(w.ts)}${w.note ? ` · ${w.note}` : ''}`,
        right: `${w.dur}m`,
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
        title: 'Sleep',
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
          sub: h.why || 'Habit',
          right: `${count} days`,
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
        sub: 'Counter',
        right: c.unit,
        color: c.color,
        ts: Number.MAX_SAFE_INTEGER - 1,
        open: () => go('counters'),
      });
    });
  }

  hits.sort((a, b) => b.ts - a.ts);
  const shown = hits.slice(0, 60);

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <BackButton onClick={() => go('home')} />
        <div style={{ flex: 1, fontSize: 24, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)' }}>Search</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '0 14px', height: 50, marginBottom: 18 }}>
        <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }} aria-hidden>
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="M13 13l3 3" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          placeholder="Workouts, notes, transactions, habits…"
          aria-label="Search everything"
          style={{ flex: 1, border: 'none', background: 'none', fontSize: 15.5, color: 'var(--text)', outline: 'none' }}
        />
        {q && (
          <span onClick={() => setQ('')} role="button" aria-label="Clear" style={{ fontSize: 18, color: 'var(--text2)', cursor: 'pointer', padding: 4 }}>
            ×
          </span>
        )}
      </div>

      {ql.length < 2 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 }}>
          Type at least two letters.<br />
          Searches names, categories and your notes.
        </div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text2)', fontSize: 14 }}>
          Nothing matches “{q}”.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 10, paddingLeft: 2 }}>
            {hits.length} result{hits.length === 1 ? '' : 's'}
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
            {shown.map((hit, i) => (
              <div
                key={hit.id}
                onClick={hit.open}
                className="pressRow"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderBottom: i === shown.length - 1 ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', flex: 'none', background: `var(--${hit.color})` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hit.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hit.sub}</div>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', flex: 'none' }}>{hit.right}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
