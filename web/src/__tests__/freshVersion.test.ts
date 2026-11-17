import { describe, expect, it } from 'vitest';
import { isStaleFileError, reloadForUpdate } from '../lib/freshVersion';

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('a tab left open across an update', () => {
  it('recognises every browser’s “that file is gone” error', () => {
    for (const msg of [
      'Failed to fetch dynamically imported module: https://orpitapp.com/d/Habits-DsgCMTQD.js', // Chrome
      'error loading dynamically imported module: https://orpitapp.com/d/Money-x.js', // Firefox
      'Importing a module script failed.', // Safari
      'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
      'Unable to preload CSS for /d/Money-x.css',
    ])
      expect(isStaleFileError(new Error(msg)), msg).toBe(true);
  });

  it('leaves real bugs alone', () => {
    for (const e of [new TypeError("Cannot read properties of undefined (reading 'map')"), new Error('Network error'), null, undefined, 'x'])
      expect(isStaleFileError(e)).toBe(false);
  });

  it('reloads once, not in a loop', () => {
    const s = store();
    let reloads = 0;
    const reload = () => void reloads++;
    expect(reloadForUpdate(s, reload, true, 1_000_000)).toBe(true);
    expect(reloadForUpdate(s, reload, true, 1_000_000 + 5_000)).toBe(false); // the reload didn't help: show the error
    expect(reloads).toBe(1);
    expect(reloadForUpdate(s, reload, true, 1_000_000 + 120_000)).toBe(true); // a later update is a new chance
    expect(reloads).toBe(2);
  });

  it('never reloads offline or without a way to count', () => {
    let reloads = 0;
    expect(reloadForUpdate(store(), () => void reloads++, false)).toBe(false);
    expect(reloadForUpdate(null, () => void reloads++, true)).toBe(false);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    expect(reloadForUpdate(broken, () => void reloads++, true)).toBe(false);
    expect(reloads).toBe(0);
  });
});
