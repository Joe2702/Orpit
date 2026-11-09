import React, { createContext, useCallback, useContext, useState } from 'react';
import type { Account, Budget, Counter, FCat, Goal, Habit, Night, Recurring, Todo, TodoList, Txn, WCat, Workout } from '@core/types';
import { AccountForm, BillForm, BudgetForm, CounterForm, CountLogForm, FcatForm, GoalForm, HabitForm, ListForm, NightForm, TaskForm, TxnForm, WCatForm, WorkoutForm } from './forms';

// Any page, shortcut or the command menu can open any form: open('txn'),
// open('habit', habit). One is open at a time.

type Open =
  | { kind: 'txn'; txn?: Txn; preset?: { cat?: string; accId?: string | null; kind?: 'expense' | 'income' | 'refund' | 'transfer' } }
  | { kind: 'workout'; workout?: Workout }
  | { kind: 'night'; night?: Night }
  | { kind: 'wcat'; cat?: WCat }
  | { kind: 'habit'; habit?: Habit }
  | { kind: 'counter'; counter?: Counter }
  | { kind: 'countlog'; counter: Counter }
  | { kind: 'task'; task?: Todo; listId?: string }
  | { kind: 'list'; list?: TodoList }
  | { kind: 'account'; account?: Account }
  | { kind: 'budget'; budget?: Budget }
  | { kind: 'goal'; goal?: Goal }
  | { kind: 'bill'; bill?: Recurring }
  | { kind: 'fcat'; cat?: FCat };

const Ctx = createContext<(o: Open) => void>(() => {});
export const useOpen = () => useContext(Ctx);

export function FormHost({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const o = open;
  return (
    <Ctx.Provider value={setOpen}>
      {children}
      {o?.kind === 'txn' && <TxnForm key={o.txn?.id || 'new'} txn={o.txn} preset={o.preset} onClose={close} />}
      {o?.kind === 'workout' && <WorkoutForm workout={o.workout} onClose={close} />}
      {o?.kind === 'night' && <NightForm night={o.night} onClose={close} />}
      {o?.kind === 'wcat' && <WCatForm cat={o.cat} onClose={close} />}
      {o?.kind === 'habit' && <HabitForm habit={o.habit} onClose={close} />}
      {o?.kind === 'counter' && <CounterForm counter={o.counter} onClose={close} />}
      {o?.kind === 'countlog' && <CountLogForm counter={o.counter} onClose={close} />}
      {o?.kind === 'task' && <TaskForm task={o.task} listId={o.listId} onClose={close} />}
      {o?.kind === 'list' && <ListForm list={o.list} onClose={close} />}
      {o?.kind === 'account' && <AccountForm account={o.account} onClose={close} />}
      {o?.kind === 'budget' && <BudgetForm budget={o.budget} onClose={close} />}
      {o?.kind === 'goal' && <GoalForm goal={o.goal} onClose={close} />}
      {o?.kind === 'bill' && <BillForm bill={o.bill} onClose={close} />}
      {o?.kind === 'fcat' && <FcatForm cat={o.cat} onClose={close} />}
    </Ctx.Provider>
  );
}
