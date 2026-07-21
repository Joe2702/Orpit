import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { chip } from '../ui';
import { IconTrash } from '../icons';
import { FinIcon } from '../lib/iconPaths';

const label = (t: string) => <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{t}</div>;
const input: React.CSSProperties = { width: '100%', height: 52, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 16, color: 'var(--text)', outline: 'none' };
const swatch = (c: string, active: boolean): React.CSSProperties => ({ width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', flex: 'none', background: `var(--${c})`, transition: 'all .15s', boxShadow: active ? `0 0 0 3px var(--surface),0 0 0 5px var(--${c})` : '0 0 0 0 transparent' });
const cta = (enabled: boolean, color: string): React.CSSProperties => ({ background: enabled ? `var(--${color})` : `color-mix(in srgb,var(--${color}) 40%,var(--surface))`, color: '#fff', height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: enabled ? 'pointer' : 'default', letterSpacing: '-.01em' });
const delBtn: React.CSSProperties = { height: 52, borderRadius: 16, border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginTop: 10 };
const Title = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 0 20px' }}>{children}</div>;

// ================= Account =================
export function AccountSheet() {
  const { state, sheetData, closeSheet, mutate, haptic, showToast } = useStore();
  const editId: string | null = sheetData?.id ?? null;
  const [name, setName] = useState(sheetData?.name ?? '');
  const [type, setType] = useState(sheetData?.type ?? 'Bank');
  const [color, setColor] = useState(sheetData?.color ?? 'blue');
  const [opening, setOpening] = useState(sheetData?.opening != null ? String(sheetData.opening) : '');
  const canSave = !!name.trim();

  const save = async () => {
    if (!canSave) return;
    haptic();
    const body = { name: name.trim(), type, color, opening: parseFloat(opening || '0') || 0 };
    await mutate(() => (editId ? api.editAccount(editId, body) : api.addAccount(body)), editId ? 'Account updated' : 'Account added');
    closeSheet();
  };
  const del = async () => {
    if (!editId) return;
    if (state!.accounts.length <= 1) { showToast('Keep at least one account'); return; }
    haptic();
    await mutate(() => api.deleteAccount(editId), 'Account deleted');
    closeSheet();
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <Title>{editId ? 'Edit account' : 'New account'}</Title>
      {label('Name')}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Bank" style={{ ...input, marginBottom: 20 }} />
      {label('Type')}
      <div style={{ display: 'flex', gap: 9, marginBottom: 20 }}>
        {['Cash', 'Bank', 'Savings'].map((t) => (<div key={t} onClick={() => setType(t)} style={{ ...chip(type === t, 'var(--blue)'), flex: 1, textAlign: 'center' }}>{t}</div>))}
      </div>
      {label('Opening balance')}
      <input value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^0-9.-]/g, ''))} inputMode="decimal" placeholder="0" style={{ ...input, marginBottom: 20 }} />
      {label('Color')}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, paddingLeft: 2 }}>
        {['emerald', 'blue', 'indigo', 'coral', 'teal'].map((c) => (<div key={c} onClick={() => setColor(c)} style={swatch(c, color === c)} />))}
      </div>
      <div onClick={save} style={cta(canSave, 'blue')}>{editId ? 'Save changes' : 'Add account'}</div>
      {editId && <div onClick={del} className="press99" style={delBtn}><IconTrash />Delete account</div>}
    </div>
  );
}

// ================= Finance category =================
export function FcatSheet() {
  const { state, sheetData, closeSheet, mutate, haptic, showToast } = useStore();
  const editId: string | null = sheetData?.id ?? null;
  const [name, setName] = useState(sheetData?.name ?? '');
  const [kind, setKind] = useState<'expense' | 'income'>(sheetData?.kind ?? 'expense');
  const [color, setColor] = useState(sheetData?.color ?? 'coral');
  const [icon, setIcon] = useState(sheetData?.icon ?? 'food');
  const canSave = !!name.trim();
  const ICONS = ['food', 'coffee', 'car', 'home', 'cash', 'bag', 'laptop', 'chart', 'gift', 'phone', 'heart', 'star', 'other'];

  const save = async () => {
    if (!canSave) return;
    haptic();
    const body = { name: name.trim(), icon, color, kind };
    await mutate(() => (editId ? api.editFcat(editId, body) : api.addFcat(body)), editId ? 'Category updated' : 'Category added');
    closeSheet();
  };
  const del = async () => {
    if (!editId) return;
    if (state!.fcats.length <= 1) { showToast('Keep at least one category'); return; }
    haptic();
    await mutate(() => api.deleteFcat(editId), 'Category deleted');
    closeSheet();
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <Title>{editId ? 'Edit category' : 'New category'}</Title>
      {label('Name')}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" style={{ ...input, marginBottom: 20 }} />
      {label('Type')}
      <div style={{ display: 'flex', gap: 9, marginBottom: 20 }}>
        {(['expense', 'income'] as const).map((k) => (<div key={k} onClick={() => setKind(k)} style={{ ...chip(kind === k, 'var(--coral)'), flex: 1, textAlign: 'center' }}>{k === 'income' ? 'Income' : 'Expense'}</div>))}
      </div>
      {label('Color')}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, paddingLeft: 2 }}>
        {['coral', 'blue', 'indigo', 'teal', 'emerald', 'warning'].map((c) => (<div key={c} onClick={() => setColor(c)} style={{ ...swatch(c, color === c), width: 36, height: 36 }} />))}
      </div>
      {label('Icon')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 9, marginBottom: 24 }}>
        {ICONS.map((ic) => (
          <div key={ic} onClick={() => setIcon(ic)} style={{ width: '100%', aspectRatio: '1', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s', border: `1px solid ${icon === ic ? `var(--${color})` : 'var(--border)'}`, background: icon === ic ? `color-mix(in srgb,var(--${color}) 12%,var(--surface))` : 'var(--surface)' }}>
            <FinIcon icon={ic} color={icon === ic ? `var(--${color})` : 'var(--text2)'} size={22} />
          </div>
        ))}
      </div>
      <div onClick={save} style={cta(canSave, color)}>{editId ? 'Save changes' : 'Add category'}</div>
      {editId && <div onClick={del} className="press99" style={delBtn}><IconTrash />Delete category</div>}
    </div>
  );
}

// ================= Budget =================
export function BudgetSheet() {
  const { state, sheetData, closeSheet, mutate, haptic, showToast } = useStore();
  const editId: string | null = sheetData?.id ?? null;
  const [cat, setCat] = useState(sheetData?.cat ?? state!.fcats.find((c) => c.kind === 'expense')?.name ?? 'Food');
  const [limit, setLimit] = useState(sheetData?.limit != null ? String(sheetData.limit) : '');
  const canSave = parseFloat(limit) > 0;

  const save = async () => {
    if (!canSave) { showToast('Enter a limit'); return; }
    haptic();
    const body = { cat, limit: parseFloat(limit) };
    await mutate(() => (editId ? api.editBudget(editId, body) : api.addBudget(body)), editId ? 'Budget updated' : 'Budget added');
    closeSheet();
  };
  const del = async () => { if (!editId) return; haptic(); await mutate(() => api.deleteBudget(editId), 'Budget deleted'); closeSheet(); };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <Title>{editId ? 'Edit budget' : 'New budget'}</Title>
      {label('Category')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 20 }}>
        {state!.fcats.filter((c) => c.kind === 'expense').map((c) => (<div key={c.id} onClick={() => setCat(c.name)} style={chip(cat === c.name, 'var(--emerald)')}>{c.name}</div>))}
      </div>
      {label('Monthly limit')}
      <input value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" style={{ ...input, marginBottom: 24 }} />
      <div onClick={save} style={cta(canSave, 'emerald')}>{editId ? 'Save changes' : 'Add budget'}</div>
      {editId && <div onClick={del} className="press99" style={delBtn}><IconTrash />Delete budget</div>}
    </div>
  );
}

// ================= Goal =================
export function GoalSheet() {
  const { sheetData, closeSheet, mutate, haptic, showToast } = useStore();
  const editId: string | null = sheetData?.id ?? null;
  const [name, setName] = useState(sheetData?.name ?? '');
  const [target, setTarget] = useState(sheetData?.target != null ? String(sheetData.target) : '');
  const [current, setCurrent] = useState(sheetData?.current != null ? String(sheetData.current) : '');
  const [color, setColor] = useState(sheetData?.color ?? 'indigo');
  const defaultDue = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const [due, setDue] = useState(sheetData?.dueTs ? new Date(sheetData.dueTs).toISOString().slice(0, 10) : defaultDue);
  const canSave = !!name.trim() && parseFloat(target) > 0;

  const save = async () => {
    if (!canSave) { showToast('Name and target required'); return; }
    haptic();
    const body = { name: name.trim(), target: parseFloat(target), current: parseFloat(current || '0') || 0, color, dueTs: due ? new Date(due).getTime() : null };
    await mutate(() => (editId ? api.editGoal(editId, body) : api.addGoal(body)), editId ? 'Goal updated' : 'Goal added');
    closeSheet();
  };
  const del = async () => { if (!editId) return; haptic(); await mutate(() => api.deleteGoal(editId), 'Goal deleted'); closeSheet(); };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <Title>{editId ? 'Edit goal' : 'New goal'}</Title>
      {label('Name')}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Japan Trip" style={{ ...input, marginBottom: 20 }} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>{label('Target')}<input value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" style={input} /></div>
        <div style={{ flex: 1 }}>{label('Saved so far')}<input value={current} onChange={(e) => setCurrent(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" style={input} /></div>
      </div>
      {label('Target date')}
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...input, marginBottom: 20, fontWeight: 600 }} />
      {label('Color')}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, paddingLeft: 2 }}>
        {['indigo', 'coral', 'teal', 'blue', 'emerald'].map((c) => (<div key={c} onClick={() => setColor(c)} style={swatch(c, color === c)} />))}
      </div>
      <div onClick={save} style={cta(canSave, 'indigo')}>{editId ? 'Save changes' : 'Add goal'}</div>
      {editId && <div onClick={del} className="press99" style={delBtn}><IconTrash />Delete goal</div>}
    </div>
  );
}

// ================= Recurring =================
export function RecurringSheet() {
  const { state, sheetData, closeSheet, mutate, haptic, showToast } = useStore();
  const editId: string | null = sheetData?.id ?? null;
  const [name, setName] = useState(sheetData?.name ?? '');
  const [cat, setCat] = useState(sheetData?.cat ?? 'Housing');
  const [amount, setAmount] = useState(sheetData?.amount != null ? String(sheetData.amount) : '');
  const [freq, setFreq] = useState<'Weekly' | 'Monthly' | 'Yearly'>(sheetData?.freq ?? 'Monthly');
  const [accId, setAccId] = useState(sheetData?.accId ?? state!.accounts[0]?.id ?? '');
  const canSave = !!name.trim() && parseFloat(amount) > 0;

  const save = async () => {
    if (!canSave) { showToast('Name and amount required'); return; }
    haptic();
    const body = { name: name.trim(), cat, amount: parseFloat(amount), freq, accId };
    await mutate(() => (editId ? api.editRecurring(editId, body) : api.addRecurring(body)), editId ? 'Recurring updated' : 'Recurring added');
    closeSheet();
  };
  const del = async () => { if (!editId) return; haptic(); await mutate(() => api.deleteRecurring(editId), 'Recurring deleted'); closeSheet(); };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <Title>{editId ? 'Edit recurring' : 'New recurring'}</Title>
      {label('Name')}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Netflix" style={{ ...input, marginBottom: 20 }} />
      {label('Amount')}
      <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" style={{ ...input, marginBottom: 20 }} />
      {label('Frequency')}
      <div style={{ display: 'flex', gap: 9, marginBottom: 20 }}>
        {(['Weekly', 'Monthly', 'Yearly'] as const).map((f) => (<div key={f} onClick={() => setFreq(f)} style={{ ...chip(freq === f, 'var(--teal)'), flex: 1, textAlign: 'center' }}>{f}</div>))}
      </div>
      {label('Category')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 20 }}>
        {state!.fcats.filter((c) => c.kind === 'expense').map((c) => (<div key={c.id} onClick={() => setCat(c.name)} style={chip(cat === c.name, 'var(--teal)')}>{c.name}</div>))}
      </div>
      {label('Account')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 24 }}>
        {state!.accounts.map((a) => (<div key={a.id} onClick={() => setAccId(a.id)} style={chip(accId === a.id, `var(--${a.color})`)}>{a.name}</div>))}
      </div>
      <div onClick={save} style={cta(canSave, 'teal')}>{editId ? 'Save changes' : 'Add recurring'}</div>
      {editId && <div onClick={del} className="press99" style={delBtn}><IconTrash />Delete recurring</div>}
    </div>
  );
}
