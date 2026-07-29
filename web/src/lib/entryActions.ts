import { useStore } from '../store';
import { api } from '../api';
import type { Workout, Night, Txn, AppState } from '../types';

export type EntryKind = 'workout' | 'sleep' | 'txn';
export type Entry = Workout | Night | Txn;

/**
 * Delete + duplicate for the three timestamped entry types, in one place.
 *
 * Both the edit sheet and swipe-to-delete need identical behaviour — optimistic
 * removal, then an undo that rebuilds the entry from the snapshot we still hold.
 * Keeping it here means the two paths can't drift apart.
 */
export function useEntryActions() {
  const { mutate, mutateOpt, haptic, showToast } = useStore();

  const restore = (kind: EntryKind, item: Entry, toast = 'Restored') => {
    if (kind === 'workout') {
      const x = item as Workout;
      mutate(() => api.addWorkout({ catId: x.catId || '', dur: x.dur, dist: x.dist, kcal: x.kcal, intensity: x.intensity, note: x.note, sets: x.sets, ts: x.ts }), toast).catch(() => {});
    } else if (kind === 'sleep') {
      const x = item as Night;
      mutate(() => api.addNight({ hours: x.hours, quality: x.quality, bedH: x.bedH, wakeH: x.wakeH, note: x.note, ts: x.ts }), toast).catch(() => {});
    } else {
      const x = item as Txn;
      // The receipt image isn't carried: it lives server-side and is dropped
      // with the row, so an undo restores the transaction without its photo.
      mutate(() => api.addTxn({ name: x.name, cat: x.cat, amount: Math.abs(x.amount), income: x.income, accId: x.accId, note: x.note, ts: x.ts }), toast).catch(() => {});
    }
  };

  /** Re-log the same entry dated now. */
  const duplicate = (kind: EntryKind, item: Entry) => {
    haptic();
    restore(kind, { ...(item as Workout & Night & Txn), ts: Date.now() } as Entry, 'Duplicated to today');
  };

  /**
   * Remove the entry immediately and offer an undo. No confirm dialog: the
   * undo *is* the safety net, and a modal after a deliberate swipe is noise.
   */
  const remove = (kind: EntryKind, item: Entry) => {
    const id = (item as { id: string }).id;
    if (id.startsWith('tmp_')) {
      showToast('Still saving — try again in a moment');
      return;
    }
    haptic();
    const fn = kind === 'workout' ? () => api.deleteWorkout(id) : kind === 'sleep' ? () => api.deleteNight(id) : () => api.deleteTxn(id);
    const optimistic = (s: AppState): AppState =>
      kind === 'workout'
        ? { ...s, workouts: s.workouts.filter((x) => x.id !== id) }
        : kind === 'sleep'
        ? { ...s, nights: s.nights.filter((x) => x.id !== id) }
        : { ...s, txns: s.txns.filter((x) => x.id !== id) };

    mutateOpt(optimistic, fn)
      .then(() => showToast('Entry deleted', () => restore(kind, item)))
      .catch(() => {});
  };

  return { remove, duplicate, restore };
}
