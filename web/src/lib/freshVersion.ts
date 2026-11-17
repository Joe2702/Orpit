// Picking up a new version in a tab that was open before it went out.
//
// Both apps load each screen's code on demand, from files whose names change
// with every deploy. A tab opened before a deploy still runs the old version,
// so the first time it opens a screen it hasn't loaded yet, it asks for a file
// that's no longer there. Left alone that's a blank page; the cure is to load
// the new version, which is a reload. Once: if the reload doesn't help (the
// server is down, say), the error screen shows instead of a reload loop.

const KEY = 'orpit_reloaded_for_update';
const WINDOW = 60_000;

/** True for the errors a browser gives when a screen's code file can't be loaded. */
export function isStaleFileError(err: unknown): boolean {
  const msg = String((err as { message?: unknown } | null)?.message ?? err ?? '');
  return /dynamically imported module|Importing a module script failed|Failed to load module script|Unable to preload CSS|ChunkLoadError|Loading (CSS )?chunk \S+ failed/i.test(msg);
}

/**
 * Reload into the new version, at most once a minute. Returns false (and does
 * nothing) when it already tried, when the device is offline (a reload would
 * only lose the page), or when it can't keep count.
 */
export function reloadForUpdate(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeSession(), reload = () => window.location.reload(), online = typeof navigator === 'undefined' || navigator.onLine !== false, now = Date.now()): boolean {
  if (!storage || !online) return false;
  try {
    const last = Number(storage.getItem(KEY) || 0);
    if (now - last < WINDOW) return false;
    storage.setItem(KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

let leaving = false;

/**
 * Head for the new version. True when this page is reloading (it may already
 * be on its way), so the caller just waits; false means show the error.
 */
export function loadNewVersion(): boolean {
  if (!leaving) leaving = reloadForUpdate();
  return leaving;
}

/** Wrap a screen's loader: a missing code file means a new version is out, so reload into it. */
export function loadFresh<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch((err) => {
      // Never settles: the page is about to be replaced, so the loading state stays up.
      if (isStaleFileError(err) && loadNewVersion()) return new Promise<T>(() => {});
      throw err;
    });
}

/**
 * Vite's own signal that a code or style file failed to load. The error still
 * goes on to whoever asked for the file (preventing it would hand them an
 * empty module instead), and they find the reload already under way.
 */
export function installUpdateReload() {
  window.addEventListener('vite:preloadError', () => {
    loadNewVersion();
  });
}
