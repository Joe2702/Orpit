// The rules behind accountability partners, kept away from the database so they
// can be tested and so there is one place to look when asking "who can see
// what".
//
// Two ideas do most of the work here.
//
// The first is that **sharing is a ladder, per tracker, per direction**. Rung 0
// shares nothing. Each rung above adds exactly one thing: that you tracked it,
// then the numbers, then the right to comment on it. What I show you is
// unrelated to what you show me, and either of us can step down a rung at any
// moment and have it take effect on the next read.
//
// The second is that **nothing starts on**. A new partnership shares nothing at
// all until somebody deliberately turns something on. A default that leaked even
// "did they log a workout" to a stranger would be a decision made on the user's
// behalf about a person they have not met.

/** How much of one tracker one person shows their partner. */
export const SHARE = {
  /** Not shared. The partner is not told the tracker exists. */
  OFF: 0,
  /** Whether it was tracked, and the streak. No numbers. */
  DONE: 1,
  /** The figures too — the same summary the owner sees on their own card. */
  DETAIL: 2,
  /** …and the partner may leave comments on it. */
  COMMENT: 3,
} as const;

export type ShareLevel = 0 | 1 | 2 | 3;

export const SHARE_LEVELS: { level: ShareLevel; label: string; blurb: string }[] = [
  { level: 0, label: 'Private', blurb: 'Not shared at all' },
  { level: 1, label: 'Streak only', blurb: 'They see whether you tracked it — no numbers' },
  { level: 2, label: 'Full stats', blurb: 'They see your numbers for this tracker' },
  { level: 3, label: 'Stats + comments', blurb: 'They can also leave you notes on it' },
];

export const asLevel = (n: unknown): ShareLevel => {
  const v = Math.round(Number(n));
  return (v >= 0 && v <= 3 ? v : 0) as ShareLevel;
};

/** Trackers that can be shared. Ordered as they appear in the app. */
export const PARTNER_MODULES = ['habits', 'workouts', 'sleep', 'counters', 'finances'] as const;
export type PartnerModule = (typeof PARTNER_MODULES)[number];

export const isPartnerModule = (s: unknown): s is PartnerModule =>
  typeof s === 'string' && (PARTNER_MODULES as readonly string[]).includes(s);

// ---------------------------------------------------------------------------
// Age
//
// The gate is on a date of birth, never on a stored age: an age is correct for
// one year and silently wrong after that, and this one decides whether an adults
// -only feature is reachable. Deriving it means the feature opens by itself on
// the user's eighteenth birthday, which is the behaviour asked for and also the
// only version that cannot rot.

export const MIN_AGE = 18;

/**
 * Whole years between two dates, by the calendar.
 *
 * Not `days / 365.25`: someone born on 29 February is 18 on 1 March in a
 * non-leap year, and a divide-and-floor gets the birthday itself wrong roughly
 * one time in four.
 */
export function ageOn(dob: string | Date, on: Date = new Date()): number {
  const d = typeof dob === 'string' ? parseDob(dob) : dob;
  if (!d) return 0;
  let age = on.getFullYear() - d.getFullYear();
  const m = on.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < d.getDate())) age--;
  return Math.max(0, age);
}

/** `YYYY-MM-DD` → a local Date, or null if it is not a real date. */
export function parseDob(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').trim());
  if (!m) return null;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(y, mo - 1, da);
  // Rejects 31 February and friends: the Date constructor rolls those over
  // rather than failing, so the only way to catch one is to look at what came
  // back out.
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
  return d;
}

/**
 * Whether a date of birth is one a person could actually have.
 *
 * The upper bound is not fussiness: a mistyped year is the common case, and a
 * date in the future would otherwise read as an age of zero, which is a *pass*
 * for nothing and a fail for everything — confusing rather than safe.
 */
export function dobPlausible(s: string, now: Date = new Date()): boolean {
  const d = parseDob(s);
  if (!d) return false;
  if (d.getTime() > now.getTime()) return false;
  return ageOn(d, now) <= 120;
}

export const isAdult = (dob: string | null | undefined, now: Date = new Date()): boolean =>
  !!dob && ageOn(dob, now) >= MIN_AGE;

/** The day someone born on `dob` becomes eligible, for "unlocks on…" copy. */
export function adultOn(dob: string): Date | null {
  const d = parseDob(dob);
  if (!d) return null;
  return new Date(d.getFullYear() + MIN_AGE, d.getMonth(), d.getDate());
}

// ---------------------------------------------------------------------------
// Matching

export type Gender = 'male' | 'female' | 'other';
export type Want = 'male' | 'female' | 'any';

export const isGender = (s: unknown): s is Gender =>
  s === 'male' || s === 'female' || s === 'other';
export const isWant = (s: unknown): s is Want =>
  s === 'male' || s === 'female' || s === 'any';

export interface Candidate {
  id: string;
  gender: Gender | null;
  want: Want;
  dob: string | null;
}

/**
 * Whether two people may be matched.
 *
 * Both preferences have to be satisfied, not just the one doing the searching —
 * otherwise the first person to ask would always get their way and the person
 * waiting would get whatever turned up.
 *
 * Someone who has not said which gender they are can still be matched, but only
 * by a person happy with anyone. That is the honest reading of a blank field: it
 * is unknown, not a wildcard that satisfies every request.
 */
export function compatible(me: Candidate, them: Candidate, now: Date = new Date()): boolean {
  if (me.id === them.id) return false;
  if (!isAdult(me.dob, now) || !isAdult(them.dob, now)) return false;
  return wants(me.want, them.gender) && wants(them.want, me.gender);
}

const wants = (want: Want, gender: Gender | null): boolean =>
  want === 'any' ? true : gender === want;

/**
 * Pick who to pair with from the people waiting.
 *
 * Longest wait first. A matcher that picks the newest arrival can leave someone
 * whose preference is narrow waiting behind every later joiner forever.
 */
export function pickPartner(
  me: Candidate,
  waiting: (Candidate & { queuedAt: number })[],
  blocked: Set<string>,
  now: Date = new Date()
): (Candidate & { queuedAt: number }) | null {
  const ok = waiting
    .filter((w) => !blocked.has(w.id) && compatible(me, w, now))
    .sort((a, b) => a.queuedAt - b.queuedAt);
  return ok[0] || null;
}

// ---------------------------------------------------------------------------
// What a level permits
//
// Every read and write on the server asks one of these rather than comparing
// numbers inline, so a rung can never mean one thing in the code that renders a
// card and another in the code that accepts a comment.

/** May the partner see this tracker at all? */
export const canSee = (level: ShareLevel): boolean => level >= SHARE.DONE;
/** May the partner see the actual figures, or only whether it was tracked? */
export const canSeeStats = (level: ShareLevel): boolean => level >= SHARE.DETAIL;
/** May the partner leave a comment on this tracker? */
export const canComment = (level: ShareLevel): boolean => level >= SHARE.COMMENT;

/**
 * Chat is open only when both people have said yes.
 *
 * Unlike a tracker — which is mine to show or hide — a conversation needs two
 * people, so one switch cannot be enough to start one.
 */
export const chatOpen = (mine: boolean, theirs: boolean): boolean => mine && theirs;

/** Reasons offered when reporting. Free text is collected separately. */
export const REPORT_REASONS = [
  { key: 'harassment', label: 'Harassment or abuse' },
  { key: 'sexual', label: 'Sexual or inappropriate content' },
  { key: 'spam', label: 'Spam, scams or advertising' },
  { key: 'personal', label: 'Asking for personal or financial details' },
  { key: 'underage', label: 'I think they are under 18' },
  { key: 'other', label: 'Something else' },
] as const;

export const isReportReason = (s: unknown): boolean =>
  typeof s === 'string' && REPORT_REASONS.some((r) => r.key === s);
