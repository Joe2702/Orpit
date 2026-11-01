// The morning brief Claude writes and delivers with the person's key: whether
// it's been read on this phone, and whether this phone has set a key up.

import type { AssistantBrief } from '../types';

const READ = 'orbit_assistant_read';
const SET_UP = 'orbit_assistant_on';

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const put = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* without storage the brief just shows as new again */
  }
};

/** A brief that came in after the last one read here. */
export const assistantUnread = (b: AssistantBrief | null | undefined): b is AssistantBrief => !!b && b.ts > Number(get(READ) || 0);
export const markAssistantRead = (b: AssistantBrief | null | undefined) => b && put(READ, String(b.ts));

/** Remembered so the brief can say "not here yet" rather than nothing. */
export const assistantSetUp = () => get(SET_UP) === '1';
export const setAssistantSetUp = (on: boolean) => put(SET_UP, on ? '1' : null);
