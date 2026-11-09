import React, { useMemo, useState } from 'react';
import type { Account, AppState, Budget, Counter, FCat, Goal, Habit, Night, Recurring, Todo, TodoList, Txn, WCat, Workout } from '@core/types';
import { daysLabel, dayKey, fmtClock, money } from '@core/lib/format';
import { accountBalance } from '@core/lib/ledger';
import { FIN_ICONS, FinIcon } from '@core/lib/iconPaths';
import { api, type TxnBody } from '../api';
import { useStore, useData } from '../store';
import { t, tData, date } from '../i18n';
import { Button, Dialog, Drawer, Field, FormFoot, Seg, Swatches, Switch, paint } from '../ui/kit';
import { Icon } from '../ui/Icon';

// One form for each kind of thing, used from every page and the command menu.
// Each saves through the store, which shows the change at once and rolls it
// back with a message if the server says no.

export const toLocalInput = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (s: string) => (s ? new Date(s).getTime() : Date.now());
const hhmm = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
const fromHHMM = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
};
const positive = (s: string) => {
  const n = parseFloat(String(s).replace(/,/g, ''));
  return isFinite(n) && n > 0 ? n : null;
};

function useSave() {
  const { mutate } = useStore();
  const [busy, setBusy] = useState(false);
  const run = async (call: () => Promise<AppState>, done: string, close: () => void, optimistic: ((s: AppState) => AppState) | null = null) => {
    if (busy) return;
    setBusy(true);
    const ok = await mutate(optimistic, call, done);
    setBusy(false);
    if (ok) close();
  };
  return { busy, run };
}

function useRemove() {
  const { mutate, confirm } = useStore();
  return async (what: string, call: () => Promise<AppState>, close: () => void, optimistic?: (s: AppState) => AppState, message?: string) => {
    const ok = await confirm({ title: t('Delete {what}?', { what }), message: message || t('This can’t be undone.'), confirm: t('Delete'), danger: true });
    if (!ok) return;
    close();
    await mutate(optimistic || null, call, t('Deleted'));
  };
}

const DeleteBtn = ({ onClick }: { onClick: () => void }) => (
  <Button kind="danger" icon="trash" onClick={onClick}>
    {t('Delete')}
  </Button>
);

/* ---------------- Transactions ---------------- */

type TxKind = 'expense' | 'income' | 'refund' | 'transfer';
const kindOf = (x?: Txn): TxKind => (!x ? 'expense' : x.toAccId ? 'transfer' : x.amount > 0 ? (x.income ? 'income' : 'refund') : 'expense');

export function TxnForm({ txn, preset, onClose }: { txn?: Txn; preset?: { cat?: string; accId?: string | null; kind?: TxKind }; onClose: () => void }) {
  const s = useData();
  const { mutate } = useStore();
  const remove = useRemove();
  const { busy, run } = useSave();
  const [kind, setKind] = useState<TxKind>(txn ? kindOf(txn) : preset?.kind || 'expense');
  const [amount, setAmount] = useState(txn ? String(Math.abs(txn.amount)) : '');
  const [name, setName] = useState(txn?.name || '');
  const expenseCats = s.fcats.filter((c) => c.kind !== 'income');
  const incomeCats = s.fcats.filter((c) => c.kind === 'income');
  const cats = kind === 'income' ? incomeCats : expenseCats;
  const [cat, setCat] = useState(txn?.cat || preset?.cat || (cats[0]?.name ?? 'Other'));
  const [accId, setAccId] = useState<string>(txn?.accId ?? preset?.accId ?? s.accounts[0]?.id ?? '');
  const [toAccId, setToAccId] = useState<string>(txn?.toAccId ?? s.accounts.find((a) => a.id !== (txn?.accId ?? s.accounts[0]?.id))?.id ?? '');
  const [when, setWhen] = useState(toLocalInput(txn?.ts ?? Date.now()));
  const [note, setNote] = useState(txn?.note || '');
  const [err, setErr] = useState('');
  const catNames = useMemo(() => {
    const names = cats.map((c) => c.name);
    if (txn?.cat && !names.includes(txn.cat) && kind !== 'transfer') names.unshift(txn.cat);
    return names;
  }, [cats, txn, kind]);
  const dup = txn?.dupOf ? s.txns.find((x) => x.id === txn.dupOf) : undefined;

  const save = () => {
    const a = positive(amount);
    if (!a) return setErr(t('Enter an amount above zero.'));
    if (kind === 'transfer' && (!accId || !toAccId || accId === toAccId)) return setErr(t('Pick two different accounts.'));
    const body: TxnBody = {
      name: name.trim() || (kind === 'transfer' ? t('Transfer') : tData(cat)),
      cat: kind === 'transfer' ? 'Transfer' : cat,
      amount: txn?.adjust ? (txn.amount < 0 ? -a : a) : a,
      income: kind === 'income',
      refund: kind === 'refund',
      accId: accId || null,
      toAccId: kind === 'transfer' ? toAccId : null,
      adjust: txn?.adjust || false,
      note: note.trim() || null,
      ts: fromLocalInput(when),
    };
    if (txn)
      run(() => api.editTxn(txn.id, body), t('Saved'), onClose, (st) => ({
        ...st,
        txns: st.txns.map((x) => (x.id === txn.id ? { ...x, ...body, amount: kind === 'expense' ? -a : txn.adjust ? body.amount : a, review: false } as Txn : x)),
      }));
    else run(() => api.addTxn(body), kind === 'income' ? t('Income added') : t('Expense added'), onClose);
  };

  const title = txn ? t('Edit transaction') : t('New transaction');
  return (
    <Drawer
      title={title}
      sub={txn ? `${date(txn.ts, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${txn.sms ? ` · ${t('Read from a bank message')}` : ''}` : undefined}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        style={{ display: 'grid', gap: 16 }}
      >
        {txn?.review && (
          <div className="banner">
            <Icon name="eye" size={16} />
            <span style={{ flex: 1 }}>{dup ? t('This may be the same payment as “{name}” you typed in.', { name: dup.name }) : t('Imported from a bank message. Check the category and amount.')}</span>
            {dup ? (
              <>
                <Button size="sm" onClick={() => (onClose(), mutate(null, () => api.answerSame(txn.id, true), t('Merged into one')))}>
                  {t('Same')}
                </Button>
                <Button size="sm" onClick={() => (onClose(), mutate(null, () => api.answerSame(txn.id, false), t('Kept both')))}>
                  {t('Different')}
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => (onClose(), mutate((st) => ({ ...st, txns: st.txns.map((x) => (x.id === txn.id ? { ...x, review: false } : x)) }), () => api.markReviewed([txn.id]), t('Marked as checked')))}>
                {t('Looks right')}
              </Button>
            )}
          </div>
        )}
        {!txn?.adjust && (
          <Seg<TxKind>
            full
            value={kind}
            onChange={(k) => {
              setKind(k);
              const list = k === 'income' ? incomeCats : expenseCats;
              if (k !== 'transfer' && !list.some((c) => c.name === cat)) setCat(list[0]?.name ?? 'Other');
            }}
            options={[
              ['expense', t('Expense')],
              ['income', t('Income')],
              ['refund', t('Refund')],
              ['transfer', t('Transfer')],
            ]}
          />
        )}
        {txn?.adjust && <div className="banner">{t('A balance correction: it changes what the account holds, but isn’t spending or income.')}</div>}
        <Field label={t('Amount')}>
          <input className="input lg num" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value), setErr(''))} placeholder="0.00" autoFocus />
        </Field>
        <Field label={kind === 'transfer' ? t('Description (optional)') : t('Description')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'income' ? t('Salary, a client, a gift…') : t('Where or what')} />
        </Field>
        <div className="form-grid">
          {kind !== 'transfer' && (
            <Field label={t('Category')}>
              <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
                {catNames.map((c) => (
                  <option key={c} value={c}>
                    {tData(c)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={kind === 'transfer' ? t('From') : t('Account')}>
            <select className="select" value={accId} onChange={(e) => setAccId(e.target.value)}>
              {kind !== 'transfer' && <option value="">{t('No account')}</option>}
              {s.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {tData(a.name)}
                </option>
              ))}
            </select>
          </Field>
          {kind === 'transfer' && (
            <Field label={t('To')}>
              <select className="select" value={toAccId} onChange={(e) => setToAccId(e.target.value)}>
                {s.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {tData(a.name)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={t('Date and time')} full={kind === 'transfer'}>
            <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        </div>
        <Field label={t('Note')}>
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Anything worth remembering')} />
        </Field>
        {err && <div style={{ color: 'var(--bad)', fontSize: 13 }}>{err}</div>}
        <div className="row" style={{ marginTop: 4 }}>
          {txn && <DeleteBtn onClick={() => remove(t('this transaction'), () => api.deleteTxn(txn.id), onClose, (st) => ({ ...st, txns: st.txns.filter((x) => x.id !== txn.id) }))} />}
          <span className="spacer" />
          <Button kind="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button kind="primary" type="submit" disabled={busy}>
            {txn ? t('Save') : t('Add')}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

/* ---------------- Workouts and sleep ---------------- */

// Data names, translated by the phone app's data dictionary.
const INTENSITY = ['Easy', 'Moderate', 'Hard'];

export function WorkoutForm({ workout, onClose }: { workout?: Workout; onClose: () => void }) {
  const s = useData();
  const { busy, run } = useSave();
  const remove = useRemove();
  const [catId, setCatId] = useState(workout?.catId || s.wCats[0]?.id || '');
  const [dur, setDur] = useState(String(workout?.dur ?? 45));
  const [when, setWhen] = useState(toLocalInput(workout?.ts ?? Date.now()));
  const [dist, setDist] = useState(workout?.dist || '');
  const [kcal, setKcal] = useState(workout?.kcal != null ? String(workout.kcal) : '');
  const [intensity, setIntensity] = useState(workout?.intensity || 'Moderate');
  const [note, setNote] = useState(workout?.note || '');
  const save = () => {
    const d = positive(dur);
    if (!catId || !d) return;
    const base = { catId, dur: Math.round(d), dist: dist.trim() || null, kcal: kcal ? Math.round(Number(kcal)) || null : null, ts: fromLocalInput(when) };
    if (workout) run(() => api.editWorkout(workout.id, { ...base, sets: workout.sets }), t('Saved'), onClose);
    else run(() => api.addWorkout({ ...base, intensity, note: note.trim() || null }), t('Workout logged'), onClose);
  };
  return (
    <Dialog
      title={workout ? t('Edit workout') : t('Log a workout')}
      onClose={onClose}
      onSubmit={save}
      footer={<FormFoot onCancel={onClose} busy={busy} saveLabel={workout ? t('Save') : t('Log workout')} left={workout && <DeleteBtn onClick={() => remove(t('this workout'), () => api.deleteWorkout(workout.id), onClose, (st) => ({ ...st, workouts: st.workouts.filter((x) => x.id !== workout.id) }))} />} />}
    >
      {s.wCats.length === 0 ? (
        <div className="muted">{t('Add a workout type first, in Fitness.')}</div>
      ) : (
        <div className="form-grid">
          <Field label={t('Type')}>
            <select className="select" value={catId} onChange={(e) => setCatId(e.target.value)}>
              {s.wCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {tData(c.name)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Minutes')}>
            <input className="input num" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} />
          </Field>
          <Field label={t('When')} full>
            <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label={t('Distance')} hint={t('Optional, e.g. 5 km')}>
            <input className="input" value={dist} onChange={(e) => setDist(e.target.value)} />
          </Field>
          <Field label={t('Calories')} hint={t('Optional')}>
            <input className="input num" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
          </Field>
          {!workout && (
            <>
              <Field label={t('Intensity')} full>
                <Seg full value={intensity} onChange={setIntensity} options={INTENSITY.map((x) => [x, tData(x)] as [string, string])} />
              </Field>
              <Field label={t('Note')} full>
                <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

export function NightForm({ night, onClose }: { night?: Night; onClose: () => void }) {
  const { busy, run } = useSave();
  const remove = useRemove();
  const [day, setDay] = useState(dayKey(night?.ts ?? Date.now()));
  const [bed, setBed] = useState(hhmm(night?.bedH ?? 23));
  const [wake, setWake] = useState(hhmm(night?.wakeH ?? 7));
  const [quality, setQuality] = useState(night?.quality ?? 7);
  const [note, setNote] = useState(night?.note || '');
  const bedH = fromHHMM(bed);
  const wakeH = fromHHMM(wake);
  const hours = (((wakeH - bedH) % 24) + 24) % 24;
  const save = () => {
    const ts = new Date(`${day}T${wake || '07:00'}`).getTime();
    const body = { hours: Math.round(hours * 100) / 100, quality, bedH, wakeH, note: note.trim() || null, ts };
    // Nights can't be edited in place on the server: replace it.
    if (night) run(async () => (await api.deleteNight(night.id), api.addNight(body)), t('Saved'), onClose);
    else run(() => api.addNight(body), t('Sleep logged'), onClose);
  };
  return (
    <Dialog
      title={night ? t('Edit night') : t('Log sleep')}
      onClose={onClose}
      onSubmit={save}
      footer={<FormFoot onCancel={onClose} busy={busy} saveLabel={night ? t('Save') : t('Log sleep')} left={night && <DeleteBtn onClick={() => remove(t('this night'), () => api.deleteNight(night.id), onClose, (st) => ({ ...st, nights: st.nights.filter((x) => x.id !== night.id) }))} />} />}
    >
      <div className="form-grid">
        <Field label={t('The morning you woke up')} full>
          <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label={t('Went to bed')}>
          <input className="input" type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
        </Field>
        <Field label={t('Woke up')}>
          <input className="input" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
        </Field>
        <div className="full card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-2)' }}>
          <Icon name="sleep" size={18} style={{ color: 'var(--accent)' }} />
          <span className="muted">{t('Time asleep')}</span>
          <span className="spacer" />
          <b className="num" style={{ fontSize: 16 }}>{t('{h}h {m}m', { h: Math.floor(hours), m: String(Math.round((hours % 1) * 60)).padStart(2, '0') })}</b>
        </div>
        <Field label={t('How well did you sleep? {q} / 10', { q: quality })} full>
          <input type="range" min={1} max={10} value={quality} onChange={(e) => setQuality(Number(e.target.value))} style={{ accentColor: 'var(--accent)', width: '100%' }} />
        </Field>
        <Field label={t('Note')} full>
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export function WCatForm({ cat, onClose }: { cat?: WCat; onClose: () => void }) {
  const { busy, run } = useSave();
  const remove = useRemove();
  const [name, setName] = useState(cat?.name || '');
  const [color, setColor] = useState(cat?.color || 'indigo');
  const save = () => name.trim() && run(() => (cat ? api.editWCat(cat.id, { name: name.trim(), color }) : api.addWCat({ name: name.trim(), color })), t('Saved'), onClose);
  return (
    <Dialog
      title={cat ? t('Edit workout type') : t('New workout type')}
      onClose={onClose}
      onSubmit={save}
      footer={<FormFoot onCancel={onClose} busy={busy} left={cat && <DeleteBtn onClick={() => remove(tData(cat.name), () => api.deleteWCat(cat.id), onClose)} />} />}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label={t('Name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Running, Gym, Football…')} />
        </Field>
        <Field label={t('Colour')}>
          <Swatches value={color} onChange={setColor} />
        </Field>
      </div>
    </Dialog>
  );
}

/* ---------------- Habits and counters ---------------- */

export function HabitForm({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const { busy, run } = useSave();
  const remove = useRemove();
  const [name, setName] = useState(habit?.name || '');
  const [days, setDays] = useState(habit?.days && /^[01]{7}$/.test(habit.days) ? habit.days : '1111111');
  const [color, setColor] = useState(habit?.color || 'indigo');
  const [cue, setCue] = useState(habit?.cue || '');
  const [why, setWhy] = useState(habit?.why || '');
  const [paused, setPaused] = useState(!!habit?.paused);
  const flip = (i: number) => {
    const next = days.split('');
    next[i] = next[i] === '1' ? '0' : '1';
    if (next.includes('1')) setDays(next.join(''));
  };
  const save = () => {
    if (!name.trim()) return;
    const body = { name: name.trim(), color, target: daysLabel(days), days, cue: cue.trim() || null, why: why.trim() || null, reminderTime: habit?.reminderTime ?? null, paused, archived: habit?.archived ?? false };
    if (habit) run(() => api.editHabit(habit.id, body), t('Saved'), onClose, (st) => ({ ...st, habits: st.habits.map((h) => (h.id === habit.id ? { ...h, ...body } : h)) }));
    else run(() => api.addHabit(body), t('Habit added'), onClose);
  };
  return (
    <Dialog
      title={habit ? t('Edit habit') : t('New habit')}
      onClose={onClose}
      onSubmit={save}
      wide
      footer={<FormFoot onCancel={onClose} busy={busy} left={habit && <DeleteBtn onClick={() => remove(tData(habit.name), () => api.deleteHabit(habit.id), onClose, undefined, t('Its history goes too. To keep the history, archive it instead.'))} />} />}
    >
      <div className="form-grid">
        <Field label={t('Habit')} full>
          <input className="input lg" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Read 20 pages, Walk after lunch…')} />
        </Field>
        <Field label={t('Which days')} full hint={daysLabel(days)}>
          <div className="row" style={{ gap: 6 }}>
            {Array.from({ length: 7 }, (_, i) => (
              <button key={i} type="button" className={`btn sm${days[i] === '1' ? ' primary' : ''}`} style={{ width: 52 }} onClick={() => flip(i)} aria-pressed={days[i] === '1'}>
                {date(new Date(2026, 0, 4 + i), { weekday: 'short' })}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('When and where')} hint={t('“After my morning coffee, at the kitchen table.” A plan makes it likelier to happen.')}>
          <input className="input" value={cue} onChange={(e) => setCue(e.target.value)} />
        </Field>
        <Field label={t('Why it matters to you')} hint={t('Shown when you slip, as a reminder.')}>
          <input className="input" value={why} onChange={(e) => setWhy(e.target.value)} />
        </Field>
        <Field label={t('Colour')}>
          <Swatches value={color} onChange={setColor} />
        </Field>
        {habit && (
          <Field label={t('Paused')} hint={t('For travel or illness: it stops counting without losing your history.')}>
            <Switch on={paused} onChange={setPaused} label={t('Paused')} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

export function CounterForm({ counter, onClose }: { counter?: Counter; onClose: () => void }) {
  const { busy, run } = useSave();
  const remove = useRemove();
  const [name, setName] = useState(counter?.name || '');
  const [unit, setUnit] = useState(counter?.unit || '');
  const [step, setStep] = useState(String(counter?.step ?? 1));
  const [color, setColor] = useState(counter?.color || 'indigo');
  const save = () => {
    const st = positive(step);
    if (!name.trim() || !st) return;
    const body = { name: name.trim(), unit: unit.trim(), color, icon: counter?.icon || 'tally', step: st };
    run(() => (counter ? api.editCounter(counter.id, body) : api.addCounter(body)), t('Saved'), onClose);
  };
  return (
    <Dialog
      title={counter ? t('Edit counter') : t('New counter')}
      onClose={onClose}
      onSubmit={save}
      footer={<FormFoot onCancel={onClose} busy={busy} left={counter && <DeleteBtn onClick={() => remove(tData(counter.name), () => api.deleteCounter(counter.id), onClose)} />} />}
    >
      <div className="form-grid">
        <Field label={t('Name')} full>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Pages read, Glasses of water…')} />
        </Field>
        <Field label={t('Unit')}>
          <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t('pages')} />
        </Field>
        <Field label={t('Adds per click')}>
          <input className="input num" inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} />
        </Field>
        <Field label={t('Colour')} full>
          <Swatches value={color} onChange={setColor} />
        </Field>
      </div>
    </Dialog>
  );
}

export function CountLogForm({ counter, onClose }: { counter: Counter; onClose: () => void }) {
  const { busy, run } = useSave();
  const [amount, setAmount] = useState(String(counter.step));
  const [when, setWhen] = useState(toLocalInput(Date.now()));
  const save = () => {
    const a = parseFloat(amount);
    if (!isFinite(a) || a === 0) return;
    run(() => api.logCounter(counter.id, a, fromLocalInput(when)), t('Added to {name}', { name: tData(counter.name) }), onClose);
  };
  return (
    <Dialog title={t('Add to {name}', { name: tData(counter.name) })} onClose={onClose} onSubmit={save} footer={<FormFoot onCancel={onClose} busy={busy} saveLabel={t('Add')} />}>
      <div className="form-grid">
        <Field label={counter.unit ? `${t('Amount')} (${tData(counter.unit)})` : t('Amount')} hint={t('A negative number takes some off.')}>
          <input className="input lg num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('When')}>
          <input className="input lg" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/* ---------------- Tasks ---------------- */

export function TaskForm({ task, listId, onClose }: { task?: Todo; listId?: string; onClose: () => void }) {
  const s = useData();
  const { busy, run } = useSave();
  const remove = useRemove();
  const [title, setTitle] = useState(task?.title || '');
  const [list, setList] = useState(task?.listId || listId || s.todoLists[0]?.id || '');
  const [due, setDue] = useState(task?.due || '');
  const [note, setNote] = useState(task?.note || '');
  const save = () => {
    if (!title.trim() || !list) return;
    const body = { title: title.trim(), listId: list, due: due || null, note: note.trim() || null };
    if (task) run(() => api.editTodo(task.id, body), t('Saved'), onClose, (st) => ({ ...st, todos: st.todos.map((x) => (x.id === task.id ? { ...x, ...body } : x)) }));
    else run(() => api.addTodo(body), t('Task added'), onClose);
  };
  return (
    <Dialog
      title={task ? t('Edit task') : t('New task')}
      onClose={onClose}
      onSubmit={save}
      footer={<FormFoot onCancel={onClose} busy={busy} left={task && <DeleteBtn onClick={() => remove(t('this task'), () => api.deleteTodo(task.id), onClose, (st) => ({ ...st, todos: st.todos.filter((x) => x.id !== task.id) }))} />} />}
    >
      {s.todoLists.length === 0 ? (
        <div className="muted">{t('Make a list first, in Tasks.')}</div>
      ) : (
        <div className="form-grid">
          <Field label={t('Task')} full>
            <input className="input lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('What needs doing?')} />
          </Field>
          <Field label={t('List')}>
            <select className="select" value={list} onChange={(e) => setList(e.target.value)}>
              {s.todoLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {tData(l.name)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Due')}>
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label={t('Note')} full>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

export function ListForm({ list, onClose }: { list?: TodoList; onClose: () => void }) {
  const { busy, run } = useSave();
  const remove = useRemove();
  const [name, setName] = useState(list?.name || '');
  const [color, setColor] = useState(list?.color || 'indigo');
  const save = () => name.trim() && run(() => (list ? api.editList(list.id, { name: name.trim(), color, icon: list.icon }) : api.addList({ name: name.trim(), color, icon: 'list' })), t('Saved'), onClose);
  return (
    <Dialog
      title={list ? t('Edit list') : t('New list')}
      onClose={onClose}
      onSubmit={save}
      footer={<FormFoot onCancel={onClose} busy={busy} left={list && <DeleteBtn onClick={() => remove(tData(list.name), () => api.deleteList(list.id), onClose, undefined, t('Every task in it goes too.'))} />} />}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label={t('Name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Work, Groceries, Uni…')} />
        </Field>
        <Field label={t('Colour')}>
          <Swatches value={color} onChange={setColor} />
        </Field>
      </div>
    </Dialog>
  );
}

/* ---------------- Money: accounts, budgets, goals, bills, categories ---------------- */

const ACCOUNT_TYPES = ['Bank', 'Cash', 'Savings', 'Wallet', 'Credit card'];

export function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const s = useData();
  const { busy, run } = useSave();
  const remove = useRemove();
  const balance = account ? accountBalance(account, s.txns, s.archive?.accSums?.[account.id] || 0) : 0;
  const [name, setName] = useState(account?.name || '');
  const [type, setType] = useState(account?.type || 'Bank');
  const [color, setColor] = useState(account?.color || 'indigo');
  const [amount, setAmount] = useState(String(account ? Math.round(balance * 100) / 100 : ''));
  const save = () => {
    const v = parseFloat(amount.replace(/,/g, '')) || 0;
    if (!name.trim()) return;
    if (account) run(() => api.editAccount(account.id, { name: name.trim(), type, color, opening: account.opening, ...(Math.abs(v - balance) > 0.004 ? { balanceNow: v } : {}) }), t('Saved'), onClose);
    else run(() => api.addAccount({ name: name.trim(), type, color, opening: v }), t('Account added'), onClose);
  };
  return (
    <Dialog
      title={account ? t('Edit account') : t('New account')}
      onClose={onClose}
      onSubmit={save}
      footer={<FormFoot onCancel={onClose} busy={busy} left={account && <DeleteBtn onClick={() => remove(tData(account.name), () => api.deleteAccount(account.id), onClose, undefined, t('Its transactions stay, without an account.'))} />} />}
    >
      <div className="form-grid">
        <Field label={t('Name')} full>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('CIB, Cash, Vodafone Cash…')} />
        </Field>
        <Field label={t('Type')}>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {ACCOUNT_TYPES.map((x) => (
              <option key={x} value={x}>
                {tData(x)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={account ? t('Balance now') : t('Starting balance')} hint={account ? t('Change it to match your bank; the difference is recorded as a correction.') : undefined}>
          <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('Colour')} full>
          <Swatches value={color} onChange={setColor} />
        </Field>
      </div>
    </Dialog>
  );
}

export function BudgetForm({ budget, onClose }: { budget?: Budget; onClose: () => void }) {
  const s = useData();
  const { busy, run } = useSave();
  const remove = useRemove();
  const free = s.fcats.filter((c) => c.kind !== 'income' && (c.name === budget?.cat || !s.budgets.some((b) => b.cat === c.name)));
  const [cat, setCat] = useState(budget?.cat || free[0]?.name || '');
  const [limit, setLimit] = useState(budget ? String(budget.limit) : '');
  const [rollover, setRollover] = useState(!!budget?.rollover);
  const save = () => {
    const l = positive(limit);
    if (!cat || !l) return;
    run(() => (budget ? api.editBudget(budget.id, { cat, limit: l, rollover }) : api.addBudget({ cat, limit: l, rollover })), t('Saved'), onClose);
  };
  return (
    <Dialog
      title={budget ? t('Edit budget') : t('New budget')}
      onClose={onClose}
      onSubmit={save}
      footer={<FormFoot onCancel={onClose} busy={busy} left={budget && <DeleteBtn onClick={() => remove(t('the {cat} budget', { cat: tData(budget.cat) }), () => api.deleteBudget(budget.id), onClose)} />} />}
    >
      <div className="form-grid">
        <Field label={t('Category')}>
          <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
            {free.map((c) => (
              <option key={c.id} value={c.name}>
                {tData(c.name)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Monthly limit')}>
          <input className="input num" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <Field label={t('Carry over what’s left')} full hint={t('Unspent money adds to next month’s limit.')}>
          <Switch on={rollover} onChange={setRollover} label={t('Carry over what’s left')} />
        </Field>
      </div>
    </Dialog>
  );
}

export function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const s = useData();
  const { busy, run } = useSave();
  const remove = useRemove();
  const [name, setName] = useState(goal?.name || '');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [current, setCurrent] = useState(goal ? String(goal.current) : '0');
  const [accId, setAccId] = useState(goal?.accId || '');
  const [due, setDue] = useState(goal?.dueTs ? dayKey(goal.dueTs) : '');
  const [color, setColor] = useState(goal?.color || 'indigo');
  const save = () => {
    const tg = positive(target);
    if (!name.trim() || !tg) return;
    const body = { name: name.trim(), target: tg, current: parseFloat(current) || 0, color, dueTs: due ? new Date(`${due}T12:00`).getTime() : null, accId: accId || null };
    run(() => (goal ? api.editGoal(goal.id, body) : api.addGoal(body)), t('Saved'), onClose);
  };
  return (
    <Dialog
      title={goal ? t('Edit goal') : t('New goal')}
      onClose={onClose}
      onSubmit={save}
      footer={<FormFoot onCancel={onClose} busy={busy} left={goal && <DeleteBtn onClick={() => remove(tData(goal.name), () => api.deleteGoal(goal.id), onClose)} />} />}
    >
      <div className="form-grid">
        <Field label={t('Saving for')} full>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('A laptop, a trip, an emergency fund…')} />
        </Field>
        <Field label={t('Target')}>
          <input className="input num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label={t('Follows an account')} hint={t('Its balance becomes the amount saved.')}>
          <select className="select" value={accId} onChange={(e) => setAccId(e.target.value)}>
            <option value="">{t('No, I’ll update it myself')}</option>
            {s.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {tData(a.name)}
              </option>
            ))}
          </select>
        </Field>
        {!accId && (
          <Field label={t('Saved so far')}>
            <input className="input num" inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        )}
        <Field label={t('By when')} hint={t('Optional')}>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label={t('Colour')} full>
          <Swatches value={color} onChange={setColor} />
        </Field>
      </div>
    </Dialog>
  );
}

const FREQS = ['Weekly', 'Monthly', 'Yearly'];

export function BillForm({ bill, onClose }: { bill?: Recurring; onClose: () => void }) {
  const s = useData();
  const { busy, run } = useSave();
  const remove = useRemove();
  const [income, setIncome] = useState(!!bill?.income);
  const cats = s.fcats.filter((c) => (income ? c.kind === 'income' : c.kind !== 'income'));
  const [name, setName] = useState(bill?.name || '');
  const [amount, setAmount] = useState(bill ? String(Math.abs(bill.amount)) : '');
  const [cat, setCat] = useState(bill?.cat || cats[0]?.name || 'Other');
  const [accId, setAccId] = useState(bill?.accId || '');
  const [freq, setFreq] = useState<string>(bill?.freq || 'Monthly');
  const [next, setNext] = useState(bill?.nextTs ? dayKey(bill.nextTs) : dayKey(Date.now()));
  const save = () => {
    const a = positive(amount);
    if (!name.trim() || !a) return;
    const body = { name: name.trim(), cat, accId: accId || null, amount: a, freq, income };
    run(() => (bill ? api.editBill(bill.id, body) : api.addBill({ ...body, nextTs: new Date(`${next}T09:00`).getTime() })), t('Saved'), onClose);
  };
  return (
    <Dialog
      title={bill ? t('Edit repeating payment') : t('New repeating payment')}
      onClose={onClose}
      onSubmit={save}
      footer={<FormFoot onCancel={onClose} busy={busy} left={bill && <DeleteBtn onClick={() => remove(tData(bill.name), () => api.deleteBill(bill.id), onClose)} />} />}
    >
      <div className="form-grid">
        <Field label={t('It’s')} full>
          <Seg
            full
            value={income ? 'in' : 'out'}
            onChange={(v) => {
              setIncome(v === 'in');
              const list = s.fcats.filter((c) => (v === 'in' ? c.kind === 'income' : c.kind !== 'income'));
              setCat(list[0]?.name || 'Other');
            }}
            options={[
              ['out', t('A bill or subscription')],
              ['in', t('Money coming in')],
            ]}
          />
        </Field>
        <Field label={t('Name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={income ? tData('Salary') : t('Rent, Netflix, Gym…')} />
        </Field>
        <Field label={t('Amount')}>
          <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('How often')}>
          <select className="select" value={freq} onChange={(e) => setFreq(e.target.value)}>
            {FREQS.map((f) => (
              <option key={f} value={f}>
                {tData(f)}
              </option>
            ))}
          </select>
        </Field>
        {!bill && (
          <Field label={t('Next one')}>
            <input className="input" type="date" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
        )}
        <Field label={t('Category')}>
          <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
            {[...new Set([cat, ...cats.map((c) => c.name)])].map((c) => (
              <option key={c} value={c}>
                {tData(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Account')}>
          <select className="select" value={accId} onChange={(e) => setAccId(e.target.value)}>
            <option value="">{t('No account')}</option>
            {s.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {tData(a.name)}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Dialog>
  );
}

export function FcatForm({ cat, onClose }: { cat?: FCat; onClose: () => void }) {
  const { busy, run } = useSave();
  const remove = useRemove();
  const [name, setName] = useState(cat?.name || '');
  const [kind, setKind] = useState<'expense' | 'income'>(cat?.kind || 'expense');
  const [icon, setIcon] = useState(cat?.icon || 'other');
  const [color, setColor] = useState(cat?.color || 'indigo');
  const save = () => name.trim() && run(() => (cat ? api.editFcat(cat.id, { name: name.trim(), icon, color, kind }) : api.addFcat({ name: name.trim(), icon, color, kind })), t('Saved'), onClose);
  return (
    <Dialog
      title={cat ? t('Edit category') : t('New category')}
      onClose={onClose}
      onSubmit={save}
      footer={<FormFoot onCancel={onClose} busy={busy} left={cat && <DeleteBtn onClick={() => remove(tData(cat.name), () => api.deleteFcat(cat.id), onClose, undefined, t('Transactions in it keep the name.'))} />} />}
    >
      <div className="form-grid">
        <Field label={t('Name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('For')}>
          <Seg
            full
            value={kind}
            onChange={setKind}
            options={[
              ['expense', t('Spending')],
              ['income', t('Income')],
            ]}
          />
        </Field>
        <Field label={t('Icon')} full>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {FIN_ICONS.map((ic) => (
              <button key={ic} type="button" className={`btn icon${icon === ic ? ' primary' : ''}`} onClick={() => setIcon(ic)} aria-pressed={icon === ic} aria-label={ic}>
                <FinIcon icon={ic} color="currentColor" size={17} />
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('Colour')} full>
          <Swatches value={color} onChange={setColor} />
        </Field>
      </div>
    </Dialog>
  );
}

/** A small round mark in an item's own colour. */
export const ColorDot = ({ c, size = 8 }: { c?: string | null; size?: number }) => <span className="dot" style={{ background: paint(c), width: size, height: size }} />;
export { money, fmtClock };
