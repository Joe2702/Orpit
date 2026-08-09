// Home-screen shortcuts: long-press the app icon to jump straight into logging.
//
// Android fires an explicit VIEW intent at MainActivity carrying an orbit://
// URL (see android/app/src/main/res/xml/shortcuts.xml). Capacitor surfaces it
// two different ways depending on whether the app was already running, and
// both have to be handled:
//   - cold start  → App.getLaunchUrl()
//   - already open → the appUrlOpen event
//
// A cold start also races the session restore, so the action is held until the
// app is actually ready rather than fired at a screen that doesn't exist yet.

export type ShortcutAction = 'workout' | 'sleep' | 'expense';

/** Screens an analytics widget can send you to when tapped. */
export type ShortcutScreen = 'habits' | 'workouts' | 'sleep' | 'finances';

/** Where a deep link wants to go: log something, or open a screen. */
export type ShortcutTarget =
  | { kind: 'log'; action: ShortcutAction }
  | { kind: 'screen'; screen: ShortcutScreen };

/** `orbit://log/workout` → 'workout'. Anything unrecognised is ignored. */
export function parseShortcut(url: string | null | undefined): ShortcutAction | null {
  if (!url) return null;
  const m = /^orbit:\/\/log\/(workout|sleep|expense)\b/i.exec(url.trim());
  return m ? (m[1].toLowerCase() as ShortcutAction) : null;
}

/**
 * `orbit://open/finances` → 'finances'. Bare `orbit://open` has no screen: it
 * means "just open the app", which is what a summary widget wants.
 */
export function parseScreen(url: string | null | undefined): ShortcutScreen | null {
  if (!url) return null;
  const m = /^orbit:\/\/open\/(habits|workouts|sleep|finances)\b/i.exec(url.trim());
  return m ? (m[1].toLowerCase() as ShortcutScreen) : null;
}

/** Both link shapes, in the order they are tried. */
export function parseTarget(url: string | null | undefined): ShortcutTarget | null {
  const action = parseShortcut(url);
  if (action) return { kind: 'log', action };
  const screen = parseScreen(url);
  return screen ? { kind: 'screen', screen } : null;
}

/**
 * Watch for shortcut launches. `onAction` may be called immediately (cold
 * start) or much later (app resumed via a shortcut). Returns a cleanup fn.
 */
export function listenForShortcuts(onAction: (t: ShortcutTarget) => void): () => void {
  let cancelled = false;
  let remove: (() => void) | undefined;

  import('@capacitor/app')
    .then(async ({ App }) => {
      if (cancelled) return;
      // Already-running case.
      const handle = await App.addListener('appUrlOpen', ({ url }) => {
        const t = parseTarget(url);
        if (t) onAction(t);
      });
      remove = () => handle.remove();
      // Cold-start case.
      const launch = await App.getLaunchUrl();
      const t = parseTarget(launch?.url);
      if (t && !cancelled) onAction(t);
    })
    .catch(() => {
      /* not running natively — there are no home-screen shortcuts on the web */
    });

  return () => {
    cancelled = true;
    remove?.();
  };
}
