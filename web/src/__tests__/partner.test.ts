import { describe, it, expect } from 'vitest';
import {
  ageOn, parseDob, dobPlausible, isAdult, adultOn,
  compatible, pickPartner, canSee, canSeeStats, canComment, chatOpen,
  asLevel, type Candidate,
} from '../lib/partner';

// The rules that decide who sees what.
//
// Every case here is one where being wrong is not cosmetic: an under-age account
// reaching an adults-only feature, a stranger seeing a tracker that was switched
// off, or a chat opening because one side wanted one.

const D = (s: string) => new Date(s + 'T12:00:00');

describe('age', () => {
  it('counts by the calendar, not by dividing days', () => {
    expect(ageOn('2000-06-15', D('2018-06-14'))).toBe(17);
    expect(ageOn('2000-06-15', D('2018-06-15'))).toBe(18);
  });

  it('gets a 29 February birthday right in a year that has no 29 February', () => {
    // Turning 18 on 1 March is the convention; the day before, they are 17.
    expect(ageOn('2004-02-29', D('2022-02-28'))).toBe(17);
    expect(ageOn('2004-02-29', D('2022-03-01'))).toBe(18);
  });

  it('opens the gate on the birthday itself and not before', () => {
    expect(isAdult('2007-05-20', D('2025-05-19'))).toBe(false);
    expect(isAdult('2007-05-20', D('2025-05-20'))).toBe(true);
  });

  it('treats a missing date of birth as not eligible', () => {
    expect(isAdult(null)).toBe(false);
    expect(isAdult('')).toBe(false);
  });

  it('says which day the gate opens', () => {
    const d = adultOn('2010-03-04');
    expect(d?.getFullYear()).toBe(2028);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(4);
  });
});

describe('reading a date of birth', () => {
  it('rejects a date that does not exist', () => {
    // The Date constructor rolls 31 February over to 3 March rather than
    // failing, so this has to be caught by looking at what came back.
    expect(parseDob('2001-02-31')).toBeNull();
    expect(parseDob('2001-13-01')).toBeNull();
  });

  it('rejects anything that is not a plain date', () => {
    expect(parseDob('15/06/2000')).toBeNull();
    expect(parseDob('2000-6-1')).toBeNull();
    expect(parseDob('')).toBeNull();
  });

  it('refuses a date in the future rather than reading it as age zero', () => {
    expect(dobPlausible('2040-01-01', D('2026-01-01'))).toBe(false);
  });

  it('refuses an implausible year, which is usually a typo', () => {
    expect(dobPlausible('1080-01-01', D('2026-01-01'))).toBe(false);
    expect(dobPlausible('1996-01-01', D('2026-01-01'))).toBe(true);
  });
});

describe('who may be matched', () => {
  const adult = (id: string, gender: Candidate['gender'], want: Candidate['want']): Candidate =>
    ({ id, gender, want, dob: '1996-01-01' });
  const now = D('2026-01-01');

  it('needs both preferences satisfied, not just the searcher"s', () => {
    const me = adult('1', 'male', 'female');
    const okay = adult('2', 'female', 'male');
    const notOkay = adult('3', 'female', 'female');
    expect(compatible(me, okay, now)).toBe(true);
    expect(compatible(me, notOkay, now)).toBe(false);
  });

  it('lets "anyone" match anyone who also accepts them', () => {
    expect(compatible(adult('1', 'male', 'any'), adult('2', 'female', 'any'), now)).toBe(true);
  });

  it('treats an unstated gender as unknown, not as a wildcard', () => {
    const unknown = { id: '2', gender: null, want: 'any' as const, dob: '1996-01-01' };
    expect(compatible(adult('1', 'male', 'any'), unknown, now)).toBe(true);
    expect(compatible(adult('1', 'male', 'female'), unknown, now)).toBe(false);
  });

  it('refuses if either side is under 18, whoever is asking', () => {
    const minor = { id: '2', gender: 'female' as const, want: 'any' as const, dob: '2012-01-01' };
    expect(compatible(adult('1', 'male', 'any'), minor, now)).toBe(false);
    expect(compatible(minor, adult('1', 'male', 'any'), now)).toBe(false);
  });

  it('refuses to match somebody with themselves', () => {
    expect(compatible(adult('1', 'male', 'any'), adult('1', 'male', 'any'), now)).toBe(false);
  });
});

describe('choosing from the queue', () => {
  const now = D('2026-01-01');
  const c = (id: string, gender: Candidate['gender'], want: Candidate['want'], queuedAt: number) =>
    ({ id, gender, want, dob: '1996-01-01', queuedAt });

  it('serves the longest wait first', () => {
    const me = { id: 'me', gender: 'male' as const, want: 'any' as const, dob: '1996-01-01' };
    const got = pickPartner(me, [c('new', 'female', 'any', 500), c('old', 'female', 'any', 100)], new Set(), now);
    expect(got?.id).toBe('old');
  });

  it('never returns someone the user has walked away from', () => {
    const me = { id: 'me', gender: 'male' as const, want: 'any' as const, dob: '1996-01-01' };
    const got = pickPartner(me, [c('ex', 'female', 'any', 100)], new Set(['ex']), now);
    expect(got).toBeNull();
  });

  it('returns null rather than a bad match when nobody fits', () => {
    const me = { id: 'me', gender: 'male' as const, want: 'female' as const, dob: '1996-01-01' };
    expect(pickPartner(me, [c('a', 'male', 'any', 1)], new Set(), now)).toBeNull();
  });
});

describe('what a share level permits', () => {
  it('shares nothing at all at level 0', () => {
    expect(canSee(0)).toBe(false);
    expect(canSeeStats(0)).toBe(false);
    expect(canComment(0)).toBe(false);
  });

  it('shows the streak but withholds the numbers at level 1', () => {
    expect(canSee(1)).toBe(true);
    expect(canSeeStats(1)).toBe(false);
    expect(canComment(1)).toBe(false);
  });

  it('adds the numbers at level 2 but still no comments', () => {
    expect(canSeeStats(2)).toBe(true);
    expect(canComment(2)).toBe(false);
  });

  it('allows comments only at the top level', () => {
    expect(canComment(3)).toBe(true);
  });

  it('clamps anything unexpected down to private', () => {
    // A level arriving from the network decides what a stranger can read, so an
    // unreadable one has to fail closed.
    expect(asLevel(9)).toBe(0);
    expect(asLevel(-1)).toBe(0);
    expect(asLevel('3')).toBe(3);
    expect(asLevel(undefined)).toBe(0);
    expect(asLevel(null)).toBe(0);
  });
});

describe('chat', () => {
  it('opens only when both people have agreed', () => {
    expect(chatOpen(true, true)).toBe(true);
    expect(chatOpen(true, false)).toBe(false);
    expect(chatOpen(false, true)).toBe(false);
  });
});
