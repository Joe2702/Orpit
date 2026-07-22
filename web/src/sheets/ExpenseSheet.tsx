import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { chip } from '../ui';
import { moneySymbol } from '../lib/format';

const EXPENSE_CATS = ['Food', 'Transport', 'Housing', 'Fun', 'Health', 'Other'];
const INCOME_CATS = ['Salary', 'Freelance', 'Investment', 'Gift', 'Refund', 'Other'];

export function ExpenseSheet() {
  const { state, closeSheet, mutate, haptic } = useStore();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [exCat, setExCat] = useState('Food');
  const [incCat, setIncCat] = useState('Salary');

  const income = kind === 'income';
  const cat = income ? incCat : exCat;

  const press = (k: string) => {
    if (k === 'del') {
      setAmount((a) => a.slice(0, -1));
      return;
    }
    setAmount((v) => {
      if (k === '.' && v.includes('.')) return v;
      if (v.replace('.', '').length >= 7) return v;
      if (v.includes('.') && v.split('.')[1].length >= 2) return v;
      return v + k;
    });
  };

  const save = async () => {
    const amt = parseFloat(amount || '0');
    if (!amt) return;
    haptic();
    await mutate(
      () => api.addTxn({ name: cat, cat, amount: amt, income, accId: state!.accounts[0]?.id ?? null }),
      income ? 'Income logged' : 'Expense logged'
    );
    closeSheet();
  };

  const tab = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1,
    textAlign: 'center',
    padding: '9px 0',
    borderRadius: 11,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all .2s',
    ...(active
      ? { background: 'var(--surface)', color, boxShadow: '0 1px 3px rgba(20,21,26,.12)' }
      : { color: 'var(--text2)' }),
  });

  return (
    <div style={{ padding: '4px 20px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 18px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>Log transaction</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Today</div>
      </div>

      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 3, marginBottom: 18 }}>
        <div onClick={() => setKind('expense')} style={tab(!income, 'var(--text)')}>Expense</div>
        <div onClick={() => setKind('income')} style={tab(income, 'var(--emerald)')}>Income</div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: 'var(--text2)', verticalAlign: 'top', lineHeight: 1.6 }}>{moneySymbol().trim()}</span>
        <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-.03em', color: income ? 'var(--emerald)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
          {amount === '' ? '0' : amount}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, justifyContent: 'center', marginBottom: 18 }}>
        {(income ? INCOME_CATS : EXPENSE_CATS).map((c) => (
          <div key={c} onClick={() => (income ? setIncCat(c) : setExCat(c))} style={chip(cat === c, 'var(--emerald)')}>
            {c}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 18 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
          <div key={k} onClick={() => press(k)} style={{ height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', background: 'var(--bg)' }}>
            {k === 'del' ? (
              <svg width="24" height="24" style={{ fill: 'none', stroke: 'var(--text)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="M9 5h10v14H9l-6-7 6-7ZM13 9.5l4 5M17 9.5l-4 5" />
              </svg>
            ) : (
              k
            )}
          </div>
        ))}
      </div>

      <div onClick={save} className="press" style={{ background: 'var(--emerald)', color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, cursor: 'pointer', boxShadow: '0 12px 20px -10px rgba(40,36,28,.22)' }}>
        Save
      </div>
    </div>
  );
}
