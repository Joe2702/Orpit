import { Capacitor } from '@capacitor/core';
import { buildWidgetData } from './widgetData';
import type { AppState } from '../types';

// Feeds the home-screen widgets.
//
// A widget is a native view that can't call the server, so the app writes what
// they show into shared storage (the Capacitor Preferences file) as one JSON,
// and the widgets read it back. The phone redraws them when Orpit goes to the
// background (MainActivity.onPause), every half hour, and when the background
// step check has a new count.

/** Read by Widgets.java; keep the two in step. */
export const WIDGET_KEY = 'widget_v2';

/**
 * Store the widgets' data. Native only, and deliberately silent: a widget
 * that can't be updated must never disturb the app.
 */
export async function updateWidget(state: AppState | null): Promise<void> {
  if (!state || !Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: WIDGET_KEY, value: JSON.stringify(buildWidgetData(state)) });
  } catch {
    /* plugin missing or storage unavailable — the widgets keep their last data */
  }
}
