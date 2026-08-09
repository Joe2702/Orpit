import { Capacitor } from '@capacitor/core';
import { dayKey } from './format';
import { buildPanels, encodePanel, PANEL_KEYS } from './widgetStats';
import type { AppState } from '../types';

// Feeds the home-screen widget.
//
// The widget is a native view that can't call the API, so the web layer writes
// a short summary into shared storage and the widget reads it back. Keeping the
// summary as pre-formatted text — rather than raw numbers the widget would have
// to interpret — means the phrasing lives here with the rest of the copy, and
// the Java side stays a dumb renderer.

const KEY = 'widget_summary';

/** The line shown top-right on the widget: today's habit progress. */
export function summarise(s: AppState, now: number = Date.now()): string {
  const today = dayKey(now);
  const dow = new Date(now).getDay();
  const due = s.habits.filter(
    (h) => !h.paused && !h.archived && (/^[01]{7}$/.test(h.days) ? h.days : '1111111')[dow] === '1'
  );
  if (due.length === 0) return 'Tap to log';
  const doneIds = new Set(s.checkins.filter((c) => c.day === today).map((c) => c.habitId));
  const done = due.filter((h) => doneIds.has(h.id)).length;
  if (done === due.length) return `All ${due.length} done`;
  return `${done}/${due.length} habits`;
}

/**
 * Store the summary for the widget to pick up. Native only, and deliberately
 * silent: a widget that can't be updated must never disturb the app.
 */
export async function updateWidget(state: AppState | null): Promise<void> {
  if (!state || !Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: KEY, value: summarise(state) });
    // The analytics widgets. Each is a separate home-screen widget the user can
    // place independently, so all of them are written every time — whichever
    // ones exist will find their data, and the ones that don't cost a key.
    const panels = buildPanels(state);
    for (const [name, panel] of Object.entries(panels)) {
      const key = PANEL_KEYS[name];
      if (key) await Preferences.set({ key, value: encodePanel(panel) });
    }
  } catch {
    /* plugin missing or storage unavailable — the widget keeps its last value */
  }
}
