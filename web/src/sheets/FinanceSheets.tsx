import React, { useState } from 'react';
import { useStore } from '../store';
import { useData } from '../hooks';
import { api } from '../api';
import { ago, money } from '../lib/format';
import { round2 } from '../lib/accounts';
import { chip } from '../ui';
import { IconTrash } from '../icons';
import { FinIcon } from '../lib/iconPaths';
import { t, tData } from '../i18n';

const label = (text: string) => <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{text}</div>;
const input: React.CSSProperties = { width: '100%', height: 52, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 16, color: 'var(--text)', outline: 'none' };
const swatch = (c: string, active: boolean): React.CSSProperties => ({ width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', flex: 'none', background: `var(--${c})`, transition: 'all .15s', boxShadow: active ? `0 0 0 3px var(--surface),0 0 0 5px var(--${c})` : '0 0 0 0 transparent' });
const cta = (enabled: boolean): React.CSSProperties => ({ background: enabled ? 'var(--indigo)' : 'color-mix(in srgb,var(--indigo) 40%,var(--surface))', color: 'var(--on-accent)', height: 54, borderRadius: 'calc(16px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, cursor: enabled ? 'pointer' : 'default', letterSpacing: '-.01em' });
const delBtn: React.CSSProperties = { height: 52, borderRadius: 'calc(16px * var(--sq))', border: '1px solid color-mix(in srgb,var(--danger) 35%,var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer', marginTop: 10 };
/** A number for a text input: no currency symbol, no trailing zeros. */
const trim = (n: number): string => String(round2(n));

const Title = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)', margin: '6px 0 20px' }}>{children}</div>;

// ================= Account =================
export function AccountSheet() {
  const { state, sheetData, closeSheet, mutate, haptic, showToast, confirm } = useStore();
  const { d } = useData();
  const editId: string | null = sheetData?.id ?? null;
  const current = editId ? d.accounts.find((a) => a.id === editId) : undefined;
  const links = current?.smsLinks || [];
  const [name, setName] = useState(sheetData?.name ?? '');
  const [type, setType] = useState(sheetData?.type ?? 'Bank');
  const [color, setColor] = useState(sheetData?.color ?? 'blue');

  // The field asks for the balance today, not the balance the account started
  // with. Nobody knows what their savings held the day they opened it, but
  // everyone can read today's figure off their banking app — and when the two
  // drift apart, today's is the one people want to correct.
  //
  // The correction is recorded as a dated entry, not by rewriting the opening
  // balance. Rewriting it moved money silently and, worse, retroactively: every
  // point on the net-worth chart shifted, so last month showed a balance the
  // user never had. An entry belongs to the day the gap was noticed, leaves
  // history alone, and can be seen and undone like anything else.
  const openingNow = sheetData?.opening ?? 0;
  const balanceNow = editId ? (d.accounts.find((a) => a.id === editId)?.balance ?? openingNow) : 0;
  const [balance, setBalance] = useState(editId ? trim(balanceNow) : '');
  const typed = parseFloat(balance || '0') || 0;
  const diff = editId ? round2(typed - balanceNow) : 0;
  const canSave = !!name.trim();

  const save = async () => {
    if (!canSave) return;
    haptic();
    if (!editId) {
      // A new account has no history, so today's balance is the opening one.
      const body = { name: name.trim(), type, color, opening: typed };
      mutate(() => api.addAccount(body), t('Account added')).catch(() => {});
      closeSheet();
      return;
    }
    // The opening balance is never touched on an edit.
    const body = { name: name.trim(), type, color, opening: openingNow };
    mutate(() => api.editAccount(editId, body), diff ? undefined : t('Account updated')).catch(() => {});
    if (diff) {
      mutate(
        () =>
          api.addTxn({
            name: 'Balance correction',
            cat: 'Adjustment',
            amount: diff, // signed: the direction is the whole content
            income: false,
            adjust: true,
            accId: editId,
          }),
        t('Balance corrected by {amount}', { amount: money(Math.abs(diff)) })
      ).catch(() => {});
    }
    closeSheet();
  };
  const others = editId ? state!.accounts.filter((a) => a.id !== editId) : [];
  const merge = async (into: string, intoName: string) => {
    if (!editId) return;
    const ok = await confirm({
      title: t('Merge into {intoName}?', { intoName }),
      message: t("Everything in {name} moves to {into}: its entries, its balance and the bank messages that fill it. Transfers between the two disappear, since they'd be one account.", { name: name || t('this account'), into: intoName }),
      confirmLabel: t('Merge'),
    });
    if (!ok) return;
    haptic();
    mutate(() => api.mergeAccount(editId, into), t('Merged into {intoName}', { intoName })).catch(() => {});
    closeSheet();
  };
  const unlink = (l: { sender: string; card: string | null }) => {
    if (!editId) return;
    haptic();
    mutate(() => api.unlinkAccount(editId, l), t('{sender} unlinked', { sender: `${l.sender}${l.card ? ` ••${l.card}` : ''}` })).catch(() => {});
  };
  const del = async () => {
    if (!editId) return;
    if (state!.accounts.length <= 1) { showToast(t('Keep at least one account')); return; }
    haptic();
    mutate(() => api.deleteAccount(editId), t('Account deleted')).catch(() => {});
    closeSheet();
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <Title>{editId ? t('Edit account') : t('New account')}</Title>
      {label(t('Name'))}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Main Bank')} style={{ ...input, marginBottom: 20 }} />
      {label(t('Type'))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 20 }}>
        {['Cash', 'Bank', 'Savings', 'Wallet', 'Credit card'].map((ty) => (<div role="button" tabIndex={0} aria-pressed={type === ty} key={ty} onClick={() => setType(ty)} style={{ ...chip(type === ty, 'var(--indigo)'), textAlign: 'center' }}>{tData(ty)}</div>))}
      </div>
      {label(editId ? t('Current balance') : t('Starting balance'))}
      <input value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^0-9.-]/g, ''))} inputMode="decimal" placeholder="0" style={input} />
      {/* Say what will happen before it happens, and name the amount: an entry
          appearing in the list is only reassuring if it was announced. */}
      <div style={{ fontSize: 12.5, color: diff ? 'var(--indigo)' : 'var(--text2)', lineHeight: 1.5, margin: '8px 2px 20px' }}>
        {!editId
          ? t('What\'s in this account right now.')
          : diff === 0
            ? t('What\'s in this account right now. Change it to match your bank and Orbit records the difference.')
            : t('Adds a {v}{amount} correction dated today, so you can see what changed. It won\'t count as spending or income.', { v: diff > 0 ? '+' : '−', amount: money(Math.abs(diff)) })}
        {editId && current?.smsBalanceTs != null && diff === 0 && (
          <> {' ' + t('Your bank last reported {amount}, {date}.', { amount: money(current.smsBalance || 0), date: ago(current.smsBalanceTs) })}</>
        )}
      </div>

      {links.length > 0 && (
        <>
          {label(t('Filled in from your bank messages'))}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', overflow: 'hidden', marginBottom: 20 }}>
            {links.map((l, i) => (
              <div key={`${l.sender}-${l.card}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>
                  {l.sender}
                  {l.card ? <span style={{ color: 'var(--text2)' }}> · ••{l.card}</span> : null}
                </span>
                <span tabIndex={0} onClick={() => unlink(l)} role="button" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', padding: '4px 0' }}>{t('Unlink')}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* The importer opens an account per bank, card or wallet it meets. When
          two of those are really one (a debit card and the account behind it,
          or a bank account made by hand before tracking), merging is the fix. */}
      {editId && others.length > 0 && (
        <>
          {label(t('Same money as another account?'))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {others.map((o) => (
              <div role="button" tabIndex={0} key={o.id} onClick={() => merge(o.id, o.name)} className="press99" style={chip(false, 'var(--indigo)')}>
                {t('Merge into {name}', { name: o.name })}
              </div>
            ))}
          </div>
        </>
      )}
      {label(t('Color'))}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, paddingInlineStart: 2 }}>
        {['emerald', 'blue', 'indigo', 'coral', 'teal'].map((c) => (<div role="button" tabIndex={0} aria-pressed={color === c} aria-label={c} key={c} onClick={() => setColor(c)} style={swatch(c, color === c)} />))}
      </div>
      <div role="button" tabIndex={0} onClick={save} style={cta(canSave)}>{editId ? t('Save changes') : t('Add account')}</div>
      {editId && <div role="button" tabIndex={0} onClick={del} className="press99" style={delBtn}><IconTrash />{t('Delete account')}</div>}
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
  const ICONS = ['food', 'coffee', 'cart', 'car', 'home', 'bolt', 'cash', 'bag', 'laptop', 'chart', 'gift', 'phone', 'heart', 'repeat', 'star', 'other'];

  const save = async () => {
    if (!canSave) return;
    haptic();
    const body = { name: name.trim(), icon, color, kind };
    mutate(() => (editId ? api.editFcat(editId, body) : api.addFcat(body)), editId ? t('Category updated') : t('Category added')).catch(() => {});
    closeSheet();
  };
  const del = async () => {
    if (!editId) return;
    if (state!.fcats.length <= 1) { showToast(t('Keep at least one category')); return; }
    haptic();
    mutate(() => api.deleteFcat(editId), t('Category deleted')).catch(() => {});
    closeSheet();
  };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <Title>{editId ? t('Edit category') : t('New category')}</Title>
      {label(t('Name'))}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Groceries')} style={{ ...input, marginBottom: 20 }} />
      {label(t('Type'))}
      <div style={{ display: 'flex', gap: 9, marginBottom: 20 }}>
        {(['expense', 'income'] as const).map((k) => (<div role="button" tabIndex={0} aria-pressed={kind === k} key={k} onClick={() => setKind(k)} style={{ ...chip(kind === k, 'var(--indigo)'), flex: 1, textAlign: 'center' }}>{k === 'income' ? t('Income') : t('Expense')}</div>))}
      </div>
      {label(t('Color'))}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, paddingInlineStart: 2 }}>
        {['coral', 'blue', 'indigo', 'teal', 'emerald', 'warning'].map((c) => (<div role="button" tabIndex={0} aria-pressed={color === c} aria-label={c} key={c} onClick={() => setColor(c)} style={{ ...swatch(c, color === c), width: 36, height: 36 }} />))}
      </div>
      {label(t('Icon'))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 9, marginBottom: 24 }}>
        {ICONS.map((ic) => (
          <div role="button" tabIndex={0} aria-label={ic} aria-pressed={icon === ic} key={ic} onClick={() => setIcon(ic)} style={{ width: '100%', aspectRatio: '1', borderRadius: 'calc(14px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s', border: `1px solid ${icon === ic ? `var(--${color})` : 'var(--border)'}`, background: icon === ic ? `color-mix(in srgb,var(--${color}) 12%,var(--surface))` : 'var(--surface)' }}>
            <FinIcon icon={ic} color={icon === ic ? `var(--${color})` : 'var(--text2)'} size={22} />
          </div>
        ))}
      </div>
      <div role="button" tabIndex={0} onClick={save} style={cta(canSave)}>{editId ? t('Save changes') : t('Add category')}</div>
      {editId && <div role="button" tabIndex={0} onClick={del} className="press99" style={delBtn}><IconTrash />{t('Delete category')}</div>}
    </div>
  );
}

// ================= Budget =================
export function BudgetSheet() {
  const { state, sheetData, closeSheet, mutate, haptic, showToast } = useStore();
  const editId: string | null = sheetData?.id ?? null;
  const [cat, setCat] = useState(sheetData?.cat ?? state!.fcats.find((c) => c.kind === 'expense')?.name ?? 'Food');
  const [limit, setLimit] = useState(sheetData?.limit != null ? String(sheetData.limit) : '');
  const [rollover, setRollover] = useState<boolean>(!!sheetData?.rollover);
  const canSave = parseFloat(limit) > 0;

  const save = async () => {
    if (!canSave) { showToast(t('Set a monthly limit first')); return; }
    haptic();
    const body = { cat, limit: parseFloat(limit), rollover };
    mutate(() => (editId ? api.editBudget(editId, body) : api.addBudget(body)), editId ? t('Budget updated') : t('Budget added')).catch(() => {});
    closeSheet();
  };
  const del = async () => { if (!editId) return; haptic(); mutate(() => api.deleteBudget(editId), t('Budget deleted')).catch(() => {}); closeSheet(); };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <Title>{editId ? t('Edit budget') : t('New budget')}</Title>
      {label(t('Category'))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 20 }}>
        {state!.fcats.filter((c) => c.kind === 'expense').map((c) => (<div role="button" tabIndex={0} aria-pressed={cat === c.name} key={c.id} onClick={() => setCat(c.name)} style={chip(cat === c.name, 'var(--indigo)')}>{tData(c.name)}</div>))}
      </div>
      {label(t('Monthly limit'))}
      <input value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" style={{ ...input, marginBottom: 18 }} />

      {/* Rollover: a good month shouldn't be wasted — carry whatever was left
          into next month's limit instead of resetting to zero. */}
      <div tabIndex={0}
        onClick={() => { haptic(); setRollover(!rollover); }}
        className="press99"
        role="switch"
        aria-checked={rollover}
        style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: '14px 16px', marginBottom: 24, cursor: 'pointer' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Roll over what\'s left')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2, lineHeight: 1.45 }}>
            {t('Unspent money from last month is added to this month\'s limit.')}
          </div>
        </div>
        <span style={{ width: 46, height: 28, borderRadius: 999, flex: 'none', position: 'relative', transition: 'background .18s', background: rollover ? 'var(--indigo)' : 'color-mix(in srgb,var(--text2) 28%,transparent)' }}>
          <span style={{ position: 'absolute', top: 3, insetInlineStart: rollover ? 21 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'inset-inline-start .18s', boxShadow: '0 1px 3px rgba(20,21,26,.25)' }} />
        </span>
      </div>

      <div role="button" tabIndex={0} onClick={save} style={cta(canSave)}>{editId ? t('Save changes') : t('Add budget')}</div>
      {editId && <div role="button" tabIndex={0} onClick={del} className="press99" style={delBtn}><IconTrash />{t('Delete budget')}</div>}
    </div>
  );
}

// ================= Goal =================
export function GoalSheet() {
  const { state, sheetData, closeSheet, mutate, haptic, showToast } = useStore();
  const editId: string | null = sheetData?.id ?? null;
  // Following an account: saving into it is progress, with nothing to update.
  const [accId, setAccId] = useState<string | null>(sheetData?.accId ?? null);
  const [name, setName] = useState(sheetData?.name ?? '');
  const [target, setTarget] = useState(sheetData?.target != null ? String(sheetData.target) : '');
  const [current, setCurrent] = useState(sheetData?.current != null ? String(sheetData.current) : '');
  const [color, setColor] = useState(sheetData?.color ?? 'indigo');
  const defaultDue = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const [due, setDue] = useState(sheetData?.dueTs ? new Date(sheetData.dueTs).toISOString().slice(0, 10) : defaultDue);
  const canSave = !!name.trim() && parseFloat(target) > 0;

  const save = async () => {
    if (!canSave) { showToast(t('Add a name and a target')); return; }
    haptic();
    const body = { name: name.trim(), target: parseFloat(target), current: parseFloat(current || '0') || 0, color, dueTs: due ? new Date(due).getTime() : null, accId };
    mutate(() => (editId ? api.editGoal(editId, body) : api.addGoal(body)), editId ? t('Goal updated') : t('Goal added')).catch(() => {});
    closeSheet();
  };
  const del = async () => { if (!editId) return; haptic(); mutate(() => api.deleteGoal(editId), t('Goal deleted')).catch(() => {}); closeSheet(); };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <Title>{editId ? t('Edit goal') : t('New goal')}</Title>
      {label(t('Name'))}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Japan Trip')} style={{ ...input, marginBottom: 20 }} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>{label(t('Target'))}<input value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" style={input} /></div>
        {!accId && <div style={{ flex: 1 }}>{label(t('Saved so far'))}<input value={current} onChange={(e) => setCurrent(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" style={input} /></div>}
      </div>
      {label(t('Saved in'))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {[{ id: null as string | null, name: t('I’ll update it') }, ...state!.accounts.filter((a) => a.type !== 'Credit card').map((a) => ({ id: a.id as string | null, name: a.name }))].map((o) => (
          <div role="button" tabIndex={0} aria-pressed={accId === o.id} key={o.id ?? 'none'} onClick={() => setAccId(o.id)} className="press99" style={chip(accId === o.id, 'var(--indigo)')}>
            {o.name}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, margin: '0 2px 20px' }}>
        {accId ? t('Progress follows this account’s balance, so it moves as you save.') : t('You type in how much you’ve saved.')}
      </div>
      {label(t('Target date'))}
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...input, marginBottom: 20, fontWeight: 600 }} />
      {label(t('Color'))}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, paddingInlineStart: 2 }}>
        {['indigo', 'coral', 'teal', 'blue', 'emerald'].map((c) => (<div role="button" tabIndex={0} aria-pressed={color === c} aria-label={c} key={c} onClick={() => setColor(c)} style={swatch(c, color === c)} />))}
      </div>
      <div role="button" tabIndex={0} onClick={save} style={cta(canSave)}>{editId ? t('Save changes') : t('Add goal')}</div>
      {editId && <div role="button" tabIndex={0} onClick={del} className="press99" style={delBtn}><IconTrash />{t('Delete goal')}</div>}
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
  const [income, setIncome] = useState<boolean>(!!sheetData?.income);
  const canSave = !!name.trim() && parseFloat(amount) > 0;

  const save = async () => {
    if (!canSave) { showToast(t('Add a name and an amount')); return; }
    haptic();
    const body = { name: name.trim(), cat, amount: parseFloat(amount), freq, accId, income };
    mutate(() => (editId ? api.editRecurring(editId, body) : api.addRecurring(body)), editId ? t('Recurring updated') : t('Recurring added')).catch(() => {});
    closeSheet();
  };
  const del = async () => { if (!editId) return; haptic(); mutate(() => api.deleteRecurring(editId), t('Recurring deleted')).catch(() => {}); closeSheet(); };

  return (
    <div style={{ padding: '4px 20px 32px' }}>
      <Title>{editId ? t('Edit recurring') : t('New recurring')}</Title>
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'calc(14px * var(--sq))', padding: 3, marginBottom: 18 }}>
        {([[false, t('Expense')], [true, t('Income')]] as const).map(([v, lbl]) => (
          <div role="button" tabIndex={0}
            key={lbl}
            onClick={() => setIncome(v)}
            style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 'calc(11px * var(--sq))', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all .2s', ...(income === v ? { background: 'var(--surface)', color: v ? 'var(--indigo)' : 'var(--text)', boxShadow: '0 1px 3px rgba(20,21,26,.12)' } : { color: 'var(--text2)' }) }}
          >
            {lbl}
          </div>
        ))}
      </div>
      {label(t('Name'))}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Netflix')} style={{ ...input, marginBottom: 20 }} />
      {label(t('Amount'))}
      <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" style={{ ...input, marginBottom: 20 }} />
      {label(t('Frequency'))}
      <div style={{ display: 'flex', gap: 9, marginBottom: 20 }}>
        {(['Weekly', 'Monthly', 'Yearly'] as const).map((f) => (<div role="button" tabIndex={0} aria-pressed={freq === f} key={f} onClick={() => setFreq(f)} style={{ ...chip(freq === f, 'var(--indigo)'), flex: 1, textAlign: 'center' }}>{tData(f)}</div>))}
      </div>
      {label(t('Category'))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 20 }}>
        {state!.fcats.filter((c) => c.kind === 'expense').map((c) => (<div role="button" tabIndex={0} aria-pressed={cat === c.name} key={c.id} onClick={() => setCat(c.name)} style={chip(cat === c.name, 'var(--indigo)')}>{tData(c.name)}</div>))}
      </div>
      {label(t('Account'))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 24 }}>
        {state!.accounts.map((a) => (<div role="button" tabIndex={0} aria-pressed={accId === a.id} key={a.id} onClick={() => setAccId(a.id)} style={chip(accId === a.id, `var(--${a.color})`)}>{tData(a.name)}</div>))}
      </div>
      <div role="button" tabIndex={0} onClick={save} style={cta(canSave)}>{editId ? t('Save changes') : t('Add recurring')}</div>
      {editId && <div role="button" tabIndex={0} onClick={del} className="press99" style={delBtn}><IconTrash />{t('Delete recurring')}</div>}
    </div>
  );
}
