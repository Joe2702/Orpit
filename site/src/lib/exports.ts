// Spreadsheet downloads from the website. Each one asks the server for the full
// history (the app itself only holds the recent window). If that fails nothing
// is saved: a file that quietly stops a year back looks complete, and the
// person would never know what's missing.

import { api } from '../api';
import type { AppState, Txn } from '@core/types';
import { csvDate, downloadCsv, toCsv, type Cell } from './csv';
import { currentCurrency, dayKey, fmtClock } from '@core/lib/format';
import { t, tData } from '../i18n';

export type ExportKind = 'txns' | 'workouts' | 'sleep' | 'habits';

type Full = {
  txns?: Txn[];
  accounts?: { id: string; name: string }[];
  workouts?: { name: string; catId: string | null; dur: number; dist: string | null; kcal: number | null; intensity: string | null; note: string | null; ts: number }[];
  wCats?: { id: string; name: string }[];
  nights?: { hours: number; quality: number; bedH: number | null; wakeH: number | null; note: string | null; ts: number }[];
  habits?: { id: string; name: string }[];
  checkins?: { habitId: string; day: string }[];
};

async function everything(): Promise<Full> {
  const all = (await api.exportAll()) as Full;
  if (!all || !Array.isArray(all.txns)) throw new Error('Incomplete export');
  return all;
}

type Say = (text: string, opts?: { bad?: boolean; action?: { label: string; run: () => void } }) => void;

/**
 * Download a spreadsheet and say how many rows it has, or say that nothing was
 * saved and offer to try again.
 */
export async function saveCsv(kind: ExportKind, state: AppState, toast: Say, said = (n: number) => t('{n} rows saved', { n })): Promise<void> {
  try {
    toast(said(await exportCsv(kind, state)));
  } catch {
    toast(t('Couldn’t get your whole history, so nothing was saved. Check your connection and try again.'), {
      bad: true,
      action: { label: t('Try again'), run: () => void saveCsv(kind, state, toast, said) },
    });
  }
}

export function txnKind(x: Pick<Txn, 'toAccId' | 'adjust' | 'amount' | 'income'>): string {
  if (x.toAccId) return t('Transfer');
  if (x.adjust) return t('Balance correction');
  if (x.amount > 0) return x.income ? t('Income') : t('Refund');
  return t('Expense');
}

/** Rows for a set of transactions, as the table on the website shows them. */
export function txnRows(txns: Txn[], accounts: { id: string; name: string }[]): { header: string[]; rows: Cell[][] } {
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  return {
    header: [t('Date'), t('Description'), t('Category'), t('Account'), t('Amount'), t('Currency'), t('Type'), t('Note')],
    rows: [...txns]
      .sort((a, b) => b.ts - a.ts)
      .map((x) => [
        csvDate(x.ts),
        x.name,
        tData(x.cat),
        x.toAccId ? `${acc.get(x.accId || '') || ''} → ${acc.get(x.toAccId) || ''}` : acc.get(x.accId || '') || '',
        x.amount,
        currentCurrency(),
        txnKind(x),
        x.note || '',
      ]),
  };
}

const stamp = () => dayKey();

export async function exportCsv(kind: ExportKind, state: AppState): Promise<number> {
  const all = await everything();
  if (kind === 'txns') {
    const { header, rows } = txnRows(all.txns || [], all.accounts || state.accounts);
    downloadCsv(`orbit-transactions-${stamp()}.csv`, toCsv(header, rows));
    return rows.length;
  }
  if (kind === 'workouts') {
    const cats = new Map((all.wCats || state.wCats).map((c) => [c.id, c.name]));
    const rows = [...(all.workouts || [])]
      .sort((a, b) => b.ts - a.ts)
      .map((w) => [csvDate(w.ts), w.name, tData(cats.get(w.catId || '') || ''), w.dur, w.dist || '', w.kcal ?? '', w.intensity ? t(w.intensity) : '', w.note || '']);
    downloadCsv(
      `orbit-workouts-${stamp()}.csv`,
      toCsv([t('Date'), t('Workout'), t('Category'), t('Minutes'), t('Distance'), t('Calories'), t('Intensity'), t('Note')], rows)
    );
    return rows.length;
  }
  if (kind === 'sleep') {
    const rows = [...(all.nights || [])]
      .sort((a, b) => b.ts - a.ts)
      .map((n) => [dayKey(n.ts), n.hours, n.quality, n.bedH == null ? '' : fmtClock(n.bedH), n.wakeH == null ? '' : fmtClock(n.wakeH), n.note || '']);
    downloadCsv(`orbit-sleep-${stamp()}.csv`, toCsv([t('Night of'), t('Hours'), t('Quality (1–10)'), t('Bedtime'), t('Woke up'), t('Note')], rows));
    return rows.length;
  }
  const names = new Map((all.habits || state.habits).map((h) => [h.id, h.name]));
  const rows = [...(all.checkins || [])]
    .filter((c) => names.has(c.habitId))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .map((c) => [c.day, tData(names.get(c.habitId)!)]);
  downloadCsv(`orbit-habits-${stamp()}.csv`, toCsv([t('Day'), t('Habit done')], rows));
  return rows.length;
}
