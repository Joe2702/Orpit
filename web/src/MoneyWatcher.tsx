import { useEffect } from 'react';
import { track } from './lib/usage';
import { useStore } from './store';
import { useData } from './hooks';
import { budgetAlerts } from './lib/budgetAlerts';
import { notifyNow } from './lib/notify';
import { shareMonthSummary } from './lib/smsSync';
import { moneySymbol } from './lib/format';

const SENT_KEY = 'orbit_budget_alerts';

function readSent(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(SENT_KEY) || '[]');
    return new Set(Array.isArray(v) ? v : []);
  } catch {
    return new Set();
  }
}

function saveSent(sent: Set<string>, month: string) {
  try {
    // Only this month's keys matter; older ones would only grow the list.
    localStorage.setItem(SENT_KEY, JSON.stringify([...sent].filter((k) => k.includes(`:${month}:`))));
  } catch {
    /* worst case an alert repeats once */
  }
}

/**
 * Renders nothing. Watches the month's money as entries arrive, from typing
 * or from the bank, and says something when a budget crosses a line: a toast
 * while the app is on screen, a notification when it isn't. Also keeps the
 * native side's month totals current, for the line under a payment alert.
 */
export function MoneyWatcher() {
  const { state, showToast } = useStore();
  const { d } = useData();

  useEffect(() => {
    const now = Date.now();
    const dt = new Date(now);
    const month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;

    shareMonthSummary({
      month,
      home: state?.profile.currency || 'EGP',
      symbol: moneySymbol(),
      spent: Math.round(d.spentThisMonth),
      budget: Math.round(d.budgets.reduce((s, b) => s + b.effLimit, 0)),
    });

    const sent = readSent();
    const alerts = budgetAlerts(d.budgets, now, sent);
    if (!alerts.length) return;
    const visible = document.visibilityState === 'visible';
    alerts.forEach((a, i) => {
      if (visible) setTimeout(() => showToast(`${a.title}. ${a.body}`), i * 5500);
      else notifyNow(4000 + (Math.abs([...a.key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 500), a.title, a.body, 'fbudgets');
      a.settles.forEach((k) => sent.add(k));
      track('budget_alert');
    });
    saveSent(sent, month);
  }, [d.budgets, d.spentThisMonth, state?.profile.currency, showToast]);

  return null;
}
