import React, { useState } from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { money, signMoney, fmtDate, relLabel, moneySymbol } from '../lib/format';
import { FinIcon } from '../lib/iconPaths';
import { Ring } from '../lib/charts';
import { BackButton, chip } from '../ui';
import { IconTrash } from '../icons';
import type { Txn } from '../types';

function Header({ title, action }: { title: string; action?: React.ReactNode }) {
  const { go } = useStore();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <BackButton onClick={() => go('finances')} />
      <div style={{ flex: 1, fontSize: 22, fontWeight: 700, letterSpacing: '-.025em', color: 'var(--text)' }}>{title}</div>
      {action}
    </div>
  );
}

function fcatByName(fcats: { name: string; icon: string; color: string }[], name: string) {
  return fcats.find((c) => c.name === name) || { icon: name === 'Salary' || name === 'Freelance' || name === 'Investment' ? 'cash' : 'other', color: 'text2', name };
}

function AddBtn({ color, onClick }: { color: string; onClick: () => void }) {
  return (
    <div onClick={onClick} className="press92" style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none', background: `var(--${color})` }}>
      <svg width="20" height="20" style={{ fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round' }}><path d="M10 4v12M4 10h12" /></svg>
    </div>
  );
}

// ================= Add / edit transaction (full screen) =================
export function FAddTx() {
  const { state, screenData, go, mutate, haptic } = useStore();
  const edit: Txn | undefined = screenData?.edit;
  const fcats = state!.fcats;
  const accounts = state!.accounts;
  const [kind, setKind] = useState<'expense' | 'income'>(edit ? (edit.amount >= 0 ? 'income' : 'expense') : 'expense');
  const [amount, setAmount] = useState<string>(edit ? String(Math.abs(edit.amount)) : '');
  const [exCat, setExCat] = useState<string>(edit && edit.amount < 0 ? edit.cat : fcats.find((c) => c.kind === 'expense')?.name || 'Food');
  const [incCat, setIncCat] = useState<string>(edit && edit.amount >= 0 ? edit.cat : fcats.find((c) => c.kind === 'income')?.name || 'Salary');
  const [accId, setAccId] = useState<string>(edit?.accId || accounts[0]?.id || '');
  const [date, setDate] = useState<string>(edit ? new Date(edit.ts).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState<string>(edit?.note || '');

  const income = kind === 'income';
  const cat = income ? incCat : exCat;

  const press = (k: string) => {
    if (k === 'del') { setAmount((a) => a.slice(0, -1)); return; }
    setAmount((v) => {
      if (k === '.' && v.includes('.')) return v;
      if (v.replace('.', '').length >= 7) return v;
      if (v.includes('.') && v.split('.')[1].length >= 2) return v;
      return v + k;
    });
  };

  const save = async () => {
    const amt = parseFloat(amount || '0');
    if (!amt || amt <= 0) return;
    haptic();
    const ts = new Date(date + 'T12:00:00').getTime();
    const body = { name: cat, cat, amount: amt, income, accId, note: note.trim() || null, ts };
    await mutate(() => (edit ? api.editTxn(edit.id, body) : api.addTxn(body)), edit ? 'Transaction updated' : 'Transaction saved');
    go('ftxns');
  };
  const del = async () => {
    if (!edit) return;
    haptic();
    await mutate(() => api.deleteTxn(edit.id), 'Transaction deleted');
    go('ftxns');
  };

  const tab = (active: boolean, color: string): React.CSSProperties => ({ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all .2s', ...(active ? { background: 'var(--surface)', color, boxShadow: '0 1px 3px rgba(20,21,26,.12)' } : { color: 'var(--text2)' }) });
  const catList = fcats.filter((c) => c.kind === kind);

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title={edit ? 'Edit transaction' : 'Add transaction'} />
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 3, marginBottom: 20 }}>
        <div onClick={() => setKind('expense')} style={tab(!income, 'var(--text)')}>Expense</div>
        <div onClick={() => setKind('income')} style={tab(income, 'var(--emerald)')}>Income</div>
      </div>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: 'var(--text2)', verticalAlign: 'top', lineHeight: 1.7 }}>{moneySymbol().trim()}</span>
        <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-.03em', color: income ? 'var(--emerald)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{amount === '' ? '0' : amount}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 22 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
          <div key={k} onClick={() => press(k)} style={{ height: 50, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', background: 'var(--bg)' }}>
            {k === 'del' ? <svg width="24" height="24" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M9 5h10v14H9l-6-7 6-7ZM13 9.5l4 5M17 9.5l-4 5" /></svg> : k}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 12 }}>Category</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 9, marginBottom: 22 }}>
        {catList.map((c) => {
          const active = cat === c.name;
          return (
            <div key={c.id} onClick={() => (income ? setIncCat(c.name) : setExCat(c.name))} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', borderRadius: 16, cursor: 'pointer', transition: 'all .15s', border: `1px solid ${active ? `var(--${c.color})` : 'var(--border)'}`, background: active ? `var(--${c.color})` : 'var(--surface)' }}>
              <FinIcon icon={c.icon} color={active ? '#fff' : `var(--${c.color})`} size={22} />
              <span style={{ fontSize: 12, fontWeight: 600, color: active ? '#fff' : 'var(--text)' }}>{c.name}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Account</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 22 }}>
        {accounts.map((a) => (
          <div key={a.id} onClick={() => setAccId(a.id)} style={chip(accId === a.id, `var(--${a.color})`)}>{a.name}</div>
        ))}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Date</div>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%', height: 50, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 14px', fontSize: 15, fontWeight: 600, color: 'var(--text)', outline: 'none', marginBottom: 22 }} />
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Note</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" style={{ width: '100%', height: 50, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 15, color: 'var(--text)', outline: 'none', marginBottom: 22 }} />
      <div onClick={save} className="press99" style={{ background: 'var(--indigo)', color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 12px 22px -12px rgba(40,36,28,.28)' }}>Save transaction</div>
      {edit && (
        <div onClick={del} className="press99" style={{ height: 52, borderRadius: 16, border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginTop: 10 }}>
          <IconTrash />Delete transaction
        </div>
      )}
    </div>
  );
}

// ================= Transactions list (grouped, search, filter) =================
export function FTxns() {
  const { state, go } = useStore();
  const fcats = state!.fcats;
  const accById = Object.fromEntries(state!.accounts.map((a) => [a.id, a]));
  const [q, setQ] = useState('');
  const [fcat, setFcat] = useState('All');
  const [facc, setFacc] = useState('All');

  const list = [...state!.txns]
    .sort((a, b) => b.ts - a.ts)
    .filter((t) => {
      const ql = q.toLowerCase();
      if (ql && !(t.name.toLowerCase().includes(ql) || t.cat.toLowerCase().includes(ql))) return false;
      if (fcat !== 'All' && t.cat !== fcat) return false;
      if (facc !== 'All' && accById[t.accId || '']?.name !== facc) return false;
      return true;
    });
  const groups: { label: string; items: Txn[] }[] = [];
  const byDay: Record<string, Txn[]> = {};
  list.forEach((t) => {
    const k = String(new Date(t.ts).setHours(0, 0, 0, 0));
    if (!byDay[k]) { byDay[k] = []; groups.push({ label: relLabel(t.ts), items: byDay[k] }); }
    byDay[k].push(t);
  });

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Transactions" action={<AddBtn color="indigo" onClick={() => go('faddtx')} />} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '0 14px', height: 48, marginBottom: 14 }}>
        <svg width="18" height="18" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none' }}><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l3 3" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions" style={{ flex: 1, border: 'none', background: 'none', fontSize: 15, color: 'var(--text)', outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 9, paddingBottom: 2 }}>
        {['All', ...fcats.map((c) => c.name)].map((c) => (
          <div key={c} onClick={() => setFcat(c)} style={{ ...chip(fcat === c, 'var(--emerald)'), flex: 'none' }}>{c}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 20, paddingBottom: 2 }}>
        {['All', ...state!.accounts.map((a) => a.name)].map((a) => (
          <div key={a} onClick={() => setFacc(a)} style={{ ...chip(facc === a, 'var(--blue)'), flex: 'none' }}>{a}</div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {groups.map((g, gi) => (
          <div key={gi}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 9, paddingLeft: 2 }}>{g.label}</div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
              {g.items.map((t) => {
                const fc = fcatByName(fcats, t.cat);
                return (
                  <div key={t.id} onClick={() => go('faddtx', { edit: t })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <span style={{ width: 38, height: 38, borderRadius: 11, flex: 'none', background: `color-mix(in srgb,var(--${fc.color}) 13%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FinIcon icon={fc.icon} color={`var(--${fc.color})`} size={20} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{t.cat} · {accById[t.accId || '']?.name || '—'}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flex: 'none', color: t.amount >= 0 ? 'var(--emerald)' : 'var(--text)' }}>{(t.amount >= 0 ? '+ ' : '− ') + money(t.amount)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================= Budgets =================
export function FBudgets() {
  const { open } = useStore();
  const { d } = useData();
  const { state } = useStore();
  const totalPct = d.budgetTotal > 0 ? Math.min(100, Math.round((d.budgetSpent / d.budgetTotal) * 100)) : 0;
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Budgets" action={<AddBtn color="emerald" onClick={() => open('budget', { cat: state!.fcats.find((c) => c.kind === 'expense')?.name || 'Food' })} />} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text2)' }}>This month</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{money(d.budgetSpent)} of {money(d.budgetTotal)}</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--bg)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, background: 'var(--emerald)', width: `${totalPct}%` }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {d.budgets.map((b) => {
          const fc = fcatByName(state!.fcats, b.cat);
          return (
            <div key={b.id} onClick={() => open('budget', { id: b.id, cat: b.cat, limit: b.limit })} className="press99" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow)', padding: '15px 16px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                <span style={{ width: 34, height: 34, borderRadius: 10, flex: 'none', background: `color-mix(in srgb,var(--${fc.color}) 13%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FinIcon icon={fc.icon} color={`var(--${fc.color})`} size={18} /></span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{b.cat}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(b.spent)} / {money(b.limit)}</span>
              </div>
              <div style={{ height: 9, borderRadius: 999, background: 'var(--bg)', overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', borderRadius: 999, width: `${Math.min(100, b.pct)}%`, background: b.color, transition: 'width .4s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>{b.pct}% used</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: b.remaining >= 0 ? 'var(--text2)' : 'var(--danger)' }}>{b.remaining >= 0 ? money(b.remaining) + ' left' : money(-b.remaining) + ' over'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================= Goals =================
export function FGoals() {
  const { open } = useStore();
  const { d } = useData();
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Savings goals" action={<AddBtn color="indigo" onClick={() => open('goal')} />} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {d.goals.map((g) => (
          <div key={g.id} onClick={() => open('goal', { id: g.id, name: g.name, target: g.target, current: g.current, color: g.color, dueTs: g.dueTs })} className="press99" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: '17px 18px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{ position: 'relative', width: 52, height: 52, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ring pct={g.pct} colorKey={g.color} size={52} stroke={6} />
                <div style={{ position: 'absolute', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{g.pct}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{g.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>{g.dueTs ? 'Target ' + fmtDate(g.dueTs) : ''}</div>
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(g.current)}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>of {money(g.target)}</div>
              </div>
            </div>
            <div style={{ height: 9, borderRadius: 999, background: 'var(--bg)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 999, width: `${g.pct}%`, background: `var(--${g.color})`, transition: 'width .4s' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================= Accounts =================
export function FAccounts() {
  const { open } = useStore();
  const { d } = useData();
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Accounts" action={<AddBtn color="coral" onClick={() => open('account')} />} />
      <div style={{ background: 'var(--indigo)', borderRadius: 22, padding: '20px 22px', marginBottom: 16, boxShadow: '0 10px 26px -14px rgba(40,36,28,.30)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.85)' }}>Net worth</div>
        <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-.03em', color: '#fff', marginTop: 3 }}>{money(d.netWorth)}</div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {d.accounts.map((a) => (
          <div key={a.id} onClick={() => open('account', { id: a.id, name: a.name, type: a.type, color: a.color, opening: a.opening })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <span style={{ width: 44, height: 44, borderRadius: 13, flex: 'none', background: `color-mix(in srgb,var(--${a.color}) 14%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 20 20" style={{ fill: 'none', stroke: `var(--${a.color})`, strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M3 6h14v9H3zM3 9.5h14M6 12.5h3" /></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{a.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{a.type}</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(a.balance)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================= Recurring =================
export function FRecurring() {
  const { state, open } = useStore();
  const { d } = useData();
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Recurring" action={<AddBtn color="teal" onClick={() => open('recurring')} />} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: '16px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>Monthly total</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(d.recurringMonthly)}</span>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {d.recurring.map((r) => {
          const fc = fcatByName(state!.fcats, r.cat);
          return (
            <div key={r.id} onClick={() => open('recurring', { id: r.id, name: r.name, cat: r.cat, amount: r.amount, freq: r.freq, accId: r.accId })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, flex: 'none', background: `color-mix(in srgb,var(--${fc.color}) 13%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FinIcon icon={fc.icon} color={`var(--${fc.color})`} size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{r.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{r.freq} · {money(r.amount)} · {r.nextTs ? 'Next ' + fmtDate(r.nextTs) : ''}</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(r.amount)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================= Categories management =================
export function FCats() {
  const { state, open } = useStore();
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Categories" action={<AddBtn color="coral" onClick={() => open('fcat')} />} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {state!.fcats.map((c) => (
          <div key={c.id} onClick={() => open('fcat', { id: c.id, name: c.name, icon: c.icon, color: c.color, kind: c.kind })} className="pressRow" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, flex: 'none', background: `color-mix(in srgb,var(--${c.color}) 13%,transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FinIcon icon={c.icon} color={`var(--${c.color})`} size={20} /></span>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{c.name}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>{c.kind === 'income' ? 'Income' : 'Expense'}</span>
            <svg width="16" height="16" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.7 }}><path d="M11 3l2.5 2.5L6 13l-3 .8.8-3L11 3Z" /></svg>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================= Insights =================
export function FInsights() {
  const { d } = useData();
  const sd = d.spentThisMonth - d.spentPrevMonth;
  const pctd = d.spentPrevMonth > 0 ? Math.round((sd / d.spentPrevMonth) * 100) : 0;
  const netNow = d.incThisMonth - d.spentThisMonth;
  const overB = d.budgets.filter((b) => b.pct >= 100);
  const cards: { text: string; good: boolean | null }[] = [
    { text: sd <= 0 ? `You spent ${money(-sd)} less than last month${d.spentPrevMonth > 0 ? ' (' + Math.abs(pctd) + '% down)' : ''}.` : `You spent ${money(sd)} more than last month${d.spentPrevMonth > 0 ? ' (' + pctd + '% up)' : ''}.`, good: sd <= 0 },
    { text: netNow >= 0 ? `You're net positive by ${money(netNow)} this month.` : `You're spending ${money(-netNow)} more than you earn this month.`, good: netNow >= 0 },
  ];
  if (d.topCatArr.length) cards.push({ text: `${d.topCatArr[0].cat} is your biggest expense at ${money(d.topCatArr[0].val)}.`, good: null });
  if (overB.length) cards.push({ text: `${overB.length} budget${overB.length > 1 ? 's are' : ' is'} over the limit: ${overB.map((b) => b.cat).join(', ')}.`, good: false });
  else if (d.budgets.length) cards.push({ text: `All ${d.budgets.length} budgets are on track this month.`, good: true });

  const mx = Math.max(d.spentPrevMonth, d.spentThisMonth, 1);

  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <Header title="Insights" />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text2)', marginBottom: 16 }}>Spending vs last month</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', height: 120 }}>
          {([['Last', d.spentPrevMonth, 'var(--border)'], ['This', d.spentThisMonth, 'var(--emerald)']] as const).map(([lab, val, col]) => (
            <div key={lab} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{money(val)}</div>
              <div style={{ width: '100%', maxWidth: 64, height: (val / mx) * 84, minHeight: 4, borderRadius: '10px 10px 0 0', background: col }} />
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{lab} month</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow)', padding: '15px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>Income this month</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--emerald)', marginTop: 3 }}>{money(d.incThisMonth)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>was {money(d.incPrevMonth)}</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow)', padding: '15px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>Spent this month</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>{money(d.spentThisMonth)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>was {money(d.spentPrevMonth)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow)', padding: '15px 16px', display: 'flex', gap: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', marginTop: 7, background: c.good === true ? 'var(--emerald)' : c.good === false ? 'var(--danger)' : 'var(--text2)' }} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text)', lineHeight: 1.5 }}>{c.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
