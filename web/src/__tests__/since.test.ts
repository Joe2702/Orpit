import { describe, it, expect } from 'vitest';
import { elapsed, formatElapsed, shortElapsed, nextMilestone } from '../lib/since';

// Counting calendar time.
//
// The failure mode here is quiet and slow: `days / 365` looks right for a year
// and is a day out after four. Somebody counting since their child was born
// will notice long before the code does, so the awkward cases are pinned here.

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).getTime();

describe('elapsed', () => {
  it('counts whole years', () => {
    expect(elapsed(at(2020, 8, 5), at(2025, 8, 5))).toMatchObject({ years: 5, months: 0, days: 0 });
  });

  it('counts a full date the way people say it', () => {
    expect(elapsed(at(2021, 3, 3), at(2024, 8, 5))).toMatchObject({ years: 3, months: 5, days: 2 });
  });

  it('handles the end of a long month landing in a short one', () => {
    // 31 January plus a month is 28 February, not 3 March. Adding two months
    // overshoots, so the answer is one month and one day.
    expect(elapsed(at(2021, 1, 31), at(2021, 3, 1))).toMatchObject({ years: 0, months: 1, days: 1 });
    expect(elapsed(at(2021, 1, 31), at(2021, 2, 28))).toMatchObject({ years: 0, months: 0, days: 28 });
  });

  it('gets 29 February right, and the years that lack one', () => {
    expect(elapsed(at(2020, 2, 29), at(2021, 2, 28))).toMatchObject({ years: 0, months: 11, days: 30 });
    expect(elapsed(at(2020, 2, 29), at(2024, 2, 29))).toMatchObject({ years: 4, months: 0, days: 0 });
  });

  it('counts every day, not years times 365', () => {
    // Four years spanning a leap day is 1461 days. A naive 365-a-year is out by one.
    expect(elapsed(at(2020, 1, 1), at(2024, 1, 1)).totalDays).toBe(1461);
  });

  it('ignores the time of day on both ends', () => {
    const morning = new Date(2020, 0, 1, 6, 0).getTime();
    const night = new Date(2021, 0, 1, 23, 30).getTime();
    expect(elapsed(morning, night)).toMatchObject({ years: 1, months: 0, days: 0 });
  });

  it('does not go negative for a date in the future', () => {
    // A typo shouldn't produce "-3 months".
    expect(elapsed(at(2030, 1, 1), at(2024, 1, 1))).toEqual({ years: 0, months: 0, days: 0, totalDays: 0 });
  });

  it('is zero on the day itself', () => {
    expect(elapsed(at(2024, 5, 5), at(2024, 5, 5))).toEqual({ years: 0, months: 0, days: 0, totalDays: 0 });
  });

  it('survives a daylight-saving change without losing a day', () => {
    // Two local midnights either side of a clock change are 23 or 25 hours
    // apart; counting in milliseconds drops or gains a day here.
    const before = new Date(2024, 2, 30, 0, 0).getTime(); // 30 Mar
    const after = new Date(2024, 3, 2, 0, 0).getTime(); // 2 Apr
    expect(elapsed(before, after).totalDays).toBe(3);
  });
});

describe('wording', () => {
  it('drops the parts that are zero', () => {
    expect(formatElapsed({ years: 0, months: 2, days: 0, totalDays: 60 })).toBe('2 months');
    expect(formatElapsed({ years: 5, months: 0, days: 0, totalDays: 1826 })).toBe('5 years');
  });

  it('joins the parts the way a sentence does', () => {
    expect(formatElapsed({ years: 3, months: 5, days: 2, totalDays: 1250 })).toBe('3 years, 5 months and 2 days');
    expect(formatElapsed({ years: 2, months: 0, days: 4, totalDays: 734 })).toBe('2 years and 4 days');
  });

  it('says something on day zero rather than nothing', () => {
    expect(formatElapsed({ years: 0, months: 0, days: 0, totalDays: 0 })).toBe('Today');
  });

  it('gets singulars right', () => {
    expect(formatElapsed({ years: 1, months: 1, days: 1, totalDays: 397 })).toBe('1 year, 1 month and 1 day');
  });

  it('has a compact form that always shows something', () => {
    expect(shortElapsed({ years: 3, months: 5, days: 2, totalDays: 1250 })).toBe('3y 5m 2d');
    expect(shortElapsed({ years: 0, months: 0, days: 0, totalDays: 0 })).toBe('0d');
  });
});

describe('the next round number', () => {
  it('looks ahead to one worth noticing', () => {
    expect(nextMilestone({ years: 0, months: 3, days: 0, totalDays: 92 })).toEqual({ label: '100 days', daysAway: 8 });
  });

  it('stops rather than inventing one past the end of the list', () => {
    expect(nextMilestone({ years: 30, months: 0, days: 0, totalDays: 20000 })).toBeNull();
  });
});
