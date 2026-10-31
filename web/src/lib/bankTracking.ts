import { useStore } from '../store';
import { track } from './usage';
import { api } from '../api';
import { enableSms, syncSms, smsSupported, SMS_DISCLOSURE } from './smsSync';
import { t } from '../i18n';

// Turning on bank tracking, from wherever it's offered: onboarding, an empty
// Finances screen, Settings. One flow, so the disclosure, the permission and
// the first scan always happen in the same order, and the first scan ends on
// what it found rather than on a toast that's gone in two seconds.

/** What the first scan turned up, for the sheet that shows it. */
export interface BankFound {
  added: number;
  accounts: string[];
  review: number;
}

export function useStartBankTracking() {
  const { state, confirm, applyState, open, showToast } = useStore();

  /**
   * @param disclosed true when the screen calling this already showed, in full,
   * what reading messages means (the onboarding slide does); otherwise the
   * standard disclosure is shown first.
   */
  return async (disclosed = false): Promise<boolean> => {
    if (!smsSupported() || !state) return false;
    if (!disclosed && !(await confirm(SMS_DISCLOSURE))) return false;
    const st = await enableSms();
    if (!st.available) {
      showToast(t('This phone does not receive SMS'));
      return false;
    }
    if (!st.granted) {
      showToast(t('Orbit needs permission to read your bank messages'));
      return false;
    }
    track('bank_on');
    showToast(t('Looking through your bank messages…'));
    const r = await syncSms(state, (items) => api.importSms(items), (base) => api.fx(base));
    const next = r.state || state;
    if (r.state) applyState(r.state);
    const found: BankFound = {
      added: r.added,
      accounts: next.accounts.filter((a) => (a.smsLinks || []).length).map((a) => a.name),
      review: next.txns.filter((t) => t.review).length,
    };
    open('smsFound', found);
    return true;
  };
}
