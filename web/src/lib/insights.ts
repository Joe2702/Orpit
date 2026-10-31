import { isSpend } from './money';
import type { GlyphName } from './appIcons';
import type { AppState } from '../types';
import { dayKey, fmtDate, money, hm } from './format';
import { dayName } from './period';
import { t } from '../i18n';

// Cross-tracker insights — the thing no single-purpose tracker can do.
// Every insight is derived from data the user already logged, and each one
// states how confident it is by only appearing once there's enough evidence.

export interface Insight {
  id: string;
  icon: GlyphName;
  color: string; // CSS token key
  title: string; // the finding, in one sentence
  detail: string; // what it's based on
  kind: 'link' | 'pattern' | 'record' | 'alert';
}

const D = 86400000;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round(((a - b) / b) * 100));

/** Group a list of timestamped items into local day buckets. */
function byDay<T extends { ts: number }>(items: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  items.forEach((it) => {
    const k = dayKey(it.ts);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(it);
  });
  return m;
}

export function buildInsights(s: AppState): Insight[] {
  const out: Insight[] = [];
  const now = Date.now();

  const workoutDays = byDay(s.workouts);
  const nightsByDay = byDay(s.nights);
  // Transfers are money moving between the user's own accounts, so they are
  // neither spending nor income. Left in, a payday sweep into savings reads as
  // the biggest spending day of the month and every correlation below inherits
  // the lie.
  const spendTxns = s.txns.filter((t) => !t.toAccId && !t.adjust);
  const txnsByDay = byDay(spendTxns);

  // ---- 1. Workouts ↔ sleep ----
  // Compare sleep on nights following a training day vs. a rest day.
  {
    const trained: number[] = [];
    const rested: number[] = [];
    s.nights.forEach((n) => {
      // The night belongs to the day that preceded the wake-up.
      const prevDay = dayKey(n.ts - D);
      (workoutDays.has(prevDay) ? trained : rested).push(n.hours);
    });
    if (trained.length >= 3 && rested.length >= 3) {
      const diffMin = Math.round((avg(trained) - avg(rested)) * 60);
      if (Math.abs(diffMin) >= 15) {
        out.push({
          id: 'sleep-workout',
          icon: (diffMin > 0 ? 'bed' : 'bolt') as GlyphName,
          color: 'blue',
          kind: 'link',
          title:
            diffMin > 0
              ? t('You sleep {diffMin} min more on days you train.', { diffMin })
              : t('You sleep {v} min less on days you train.', { v: Math.abs(diffMin) }),
          detail: t('{n} nights after training vs {n2} rest nights.', { n: trained.length, n2: rested.length }),
        });
      }
    }
  }

  // ---- 2. Sleep ↔ spending ----
  // Do short nights cost money the next day?
  {
    const afterShort: number[] = [];
    const afterNormal: number[] = [];
    s.nights.forEach((n) => {
      const nextDay = dayKey(n.ts);
      const spend = (txnsByDay.get(nextDay) || []).filter((t) => isSpend(t)).reduce((a, t) => a - t.amount, 0);
      (n.hours < 6 ? afterShort : afterNormal).push(spend);
    });
    if (afterShort.length >= 3 && afterNormal.length >= 3) {
      const a = avg(afterShort);
      const b = avg(afterNormal);
      const change = pct(a, b);
      if (b > 0 && Math.abs(change) >= 25) {
        out.push({
          id: 'spend-sleep',
          icon: (change > 0 ? 'cash' : 'zen') as GlyphName,
          color: 'emerald',
          kind: 'link',
          title:
            change > 0
              ? t('You spend {change}% more after a short night.', { change })
              : t('You spend {v}% less after a short night.', { v: Math.abs(change) }),
          detail: t('{amount} vs {amount2} per day, across {n} short nights.', { amount: money(a), amount2: money(b), n: afterShort.length }),
        });
      }
    }
  }

  // ---- 3. Workouts ↔ habit completion ----
  {
    const checkinDays = new Map<string, number>();
    s.checkins.forEach((c) => checkinDays.set(c.day, (checkinDays.get(c.day) || 0) + 1));
    const withW: number[] = [];
    const without: number[] = [];
    // Only look at days the user was actually active in the app.
    const allDays = new Set<string>([...checkinDays.keys(), ...workoutDays.keys()]);
    allDays.forEach((d) => {
      const n = checkinDays.get(d) || 0;
      (workoutDays.has(d) ? withW : without).push(n);
    });
    if (withW.length >= 4 && without.length >= 4) {
      const change = pct(avg(withW), avg(without));
      if (Math.abs(change) >= 20) {
        out.push({
          id: 'habits-workout',
          icon: 'link' as GlyphName,
          color: 'teal',
          kind: 'link',
          title:
            change > 0
              ? t('You complete {change}% more habits on days you train.', { change })
              : t('Your habits dip {v}% on days you train.', { v: Math.abs(change) }),
          detail: t('Across {n} training days and {n2} others.', { n: withW.length, n2: without.length }),
        });
      }
    }
  }

  // ---- 4. Best and worst weekday for habits ----
  {
    const done = new Array(7).fill(0);
    const sched = new Array(7).fill(0);
    const active = s.habits.filter((h) => !h.archived);
    const doneSet = new Set(s.checkins.map((c) => c.habitId + '|' + c.day));
    // Look back 8 weeks.
    for (let i = 0; i < 56; i++) {
      const t = now - i * D;
      const dow = new Date(t).getDay();
      const ds = dayKey(t);
      active.forEach((h) => {
        const mask = /^[01]{7}$/.test(h.days) ? h.days : '1111111';
        if (mask[dow] !== '1') return;
        sched[dow]++;
        if (doneSet.has(h.id + '|' + ds)) done[dow]++;
      });
    }
    const rates = done.map((d, i) => (sched[i] >= 3 ? d / sched[i] : -1));
    const valid = rates.map((r, i) => ({ r, i })).filter((x) => x.r >= 0);
    if (valid.length >= 4) {
      const best = valid.reduce((a, b) => (b.r > a.r ? b : a));
      const worst = valid.reduce((a, b) => (b.r < a.r ? b : a));
      if (best.r - worst.r >= 0.25) {
        out.push({
          id: 'weekday',
          icon: 'calendar' as GlyphName,
          color: 'indigo',
          kind: 'pattern',
          title: t('{day}s are your weak spot.', { day: dayName(worst.i) }),
          detail: t('{n}% done on {day}s vs {n2}% on {day2}s.', { n: Math.round(best.r * 100), day: dayName(best.i), n2: Math.round(worst.r * 100), day2: dayName(worst.i) }),
        });
      }
    }
  }

  // ---- 5. Spending anomaly this week ----
  {
    const weekStart = now - 7 * D;
    const cat = new Map<string, number>();
    const prior = new Map<string, number[]>();
    spendTxns
      .filter((t) => isSpend(t))
      .forEach((t) => {
        if (t.ts >= weekStart) cat.set(t.cat, (cat.get(t.cat) || 0) + -t.amount);
        else if (t.ts >= now - 35 * D) {
          const wk = Math.floor((now - t.ts) / (7 * D));
          const arr = prior.get(t.cat) || [];
          arr[wk] = (arr[wk] || 0) + -t.amount;
          prior.set(t.cat, arr);
        }
      });
    cat.forEach((thisWeek, c) => {
      const hist = (prior.get(c) || []).filter((x) => x > 0);
      if (hist.length < 2) return;
      const base = avg(hist);
      if (base > 0 && thisWeek >= base * 2 && thisWeek - base > 50) {
        out.push({
          id: 'anomaly-' + c,
          icon: 'alert' as GlyphName,
          color: 'warning',
          kind: 'alert',
          title: t('{c} is {v}× your usual over the last 7 days.', { c, v: (thisWeek / base).toFixed(1) }),
          detail: t('{amount} vs a typical {amount2}.', { amount: money(thisWeek), amount2: money(base) }),
        });
      }
    });
  }

  // ---- 6. Personal records ----
  {
    if (s.workouts.length >= 3) {
      const longest = s.workouts.reduce((a, b) => (b.dur > a.dur ? b : a));
      out.push({
        id: 'pr-workout',
        icon: 'trophy' as GlyphName,
        color: 'coral',
        kind: 'record',
        title: t('Longest session: {dur} min.', { dur: longest.dur }),
        detail: `${longest.name} · ${fmtDate(longest.ts)}`,
      });
    }
    if (s.nights.length >= 3) {
      const best = s.nights.reduce((a, b) => (b.hours > a.hours ? b : a));
      out.push({
        id: 'pr-sleep',
        icon: 'moon' as GlyphName,
        color: 'blue',
        kind: 'record',
        title: t('Best night: {time}.', { time: hm(best.hours) }),
        detail: fmtDate(best.ts),
      });
    }
    // Best habit week in the last 12.
    if (s.checkins.length >= 10) {
      let bestWeek = 0;
      for (let w = 0; w < 12; w++) {
        const start = now - (w + 1) * 7 * D;
        const end = now - w * 7 * D;
        const n = s.checkins.filter((c) => {
          const t = new Date(c.day + 'T12:00:00').getTime();
          return t >= start && t < end;
        }).length;
        if (n > bestWeek) bestWeek = n;
      }
      if (bestWeek > 0) {
        out.push({
          id: 'pr-habits',
          icon: 'sprout' as GlyphName,
          color: 'teal',
          kind: 'record',
          title: t('Best habit week: {bestWeek} check-ins.', { bestWeek }),
          detail: t('Your highest weekly total in the last 12 weeks.'),
        });
      }
    }
  }

  // ---- 7. Sleep debt (last 7 nights vs an 8h target) ----
  {
    const recent = s.nights.filter((n) => n.ts >= now - 7 * D);
    if (recent.length >= 4) {
      const debt = recent.length * 8 - recent.reduce((a, n) => a + n.hours, 0);
      if (debt >= 2) {
        out.push({
          id: 'sleep-debt',
          icon: 'bed' as GlyphName,
          color: 'danger',
          kind: 'alert',
          title: t('You\'re {time} short on sleep over the last 7 days.', { time: hm(debt) }),
          detail: t('Against 8h a night across {n} logged nights.', { n: recent.length }),
        });
      } else if (debt <= -2) {
        out.push({
          id: 'sleep-surplus',
          icon: 'sparkle' as GlyphName,
          color: 'success',
          kind: 'pattern',
          title: t('You\'re {time} ahead on sleep over the last 7 days.', { time: hm(-debt) }),
          detail: t('Against 8h a night across {n} logged nights.', { n: recent.length }),
        });
      }
    }
  }


  // ---- 8. Keystone habit ----
  // Which single habit, on the days you do it, coincides with getting more of
  // everything else done. The most useful thing a cross-tracker app can tell
  // you, because it identifies where one unit of willpower buys the most.
  {
    const live = s.habits.filter((h) => !h.archived && !h.paused && !h.locked);
    if (live.length >= 2) {
      const byHabitDay = new Map<string, Set<string>>();
      s.checkins.forEach((c) => {
        if (!byHabitDay.has(c.habitId)) byHabitDay.set(c.habitId, new Set());
        byHabitDay.get(c.habitId)!.add(c.day);
      });
      // "Everything else" = other habits done, workouts logged, counters logged.
      const otherScore = (day: string, exceptId: string) =>
        s.checkins.filter((c) => c.day === day && c.habitId !== exceptId).length +
        (workoutDays.get(day)?.length || 0) +
        (byDay(s.countLogs).get(day)?.length || 0);

      const allDays = new Set<string>([
        ...s.checkins.map((c) => c.day),
        ...Array.from(workoutDays.keys()),
      ]);

      let best: { name: string; on: number; off: number; days: number } | null = null;
      live.forEach((h) => {
        const on = byHabitDay.get(h.id) || new Set<string>();
        if (on.size < 5) return; // too little evidence to claim a pattern
        const offDays = Array.from(allDays).filter((d) => !on.has(d));
        if (offDays.length < 5) return;
        const onAvg = avg(Array.from(on).map((d) => otherScore(d, h.id)));
        const offAvg = avg(offDays.map((d) => otherScore(d, h.id)));
        if (offAvg <= 0) return;
        if (!best || onAvg / offAvg > best.on / best.off) {
          best = { name: h.name, on: onAvg, off: offAvg, days: on.size };
        }
      });
      const b = best as { name: string; on: number; off: number; days: number } | null;
      if (b && b.on / b.off >= 1.4) {
        out.push({
          id: 'keystone',
          icon: 'link' as GlyphName,
          color: 'indigo',
          kind: 'link',
          title: t('"{name}" is your keystone habit.', { name: b.name }),
          detail: t('On days you do it you get {v}× more done elsewhere, across {days} days.', { v: (b.on / b.off).toFixed(1), days: b.days }),
        });
      }
    }
  }

  // ---- 9. Bedtime consistency ↔ sleep quality ----
  // Not "sleep more" but "sleep at the same time", which is the advice people
  // rarely get from a tracker and can act on tonight.
  {
    const withBed = s.nights.filter((n) => n.bedH != null && n.quality > 0).slice(0, 60);
    if (withBed.length >= 10) {
      // Treat bedtimes before noon as after-midnight, so 23:30 and 00:30 sit
      // next to each other rather than 24 hours apart.
      const norm = (h: number) => (h < 12 ? h + 24 : h);
      const median = [...withBed.map((n) => norm(n.bedH!))].sort((a, b) => a - b)[Math.floor(withBed.length / 2)];
      const steady = withBed.filter((n) => Math.abs(norm(n.bedH!) - median) <= 0.5);
      const erratic = withBed.filter((n) => Math.abs(norm(n.bedH!) - median) > 1.5);
      if (steady.length >= 4 && erratic.length >= 4) {
        const qs = avg(steady.map((n) => n.quality));
        const qe = avg(erratic.map((n) => n.quality));
        if (qs - qe >= 0.8) {
          out.push({
            id: 'bedtime-consistency',
            icon: 'moon' as GlyphName,
            color: 'blue',
            kind: 'link',
            title: t('A steady bedtime is worth {v} points of sleep quality.', { v: (qs - qe).toFixed(1) }),
            detail: t('{v}/10 on your usual schedule vs {v2}/10 when it drifts over an hour.', { v: qs.toFixed(1), v2: qe.toFixed(1) }),
          });
        }
      }
    }
  }

  // ---- 10. Momentum: the last 30 days against the 30 before ----
  // Rolling blocks of equal length, so the comparison is fair on any day of the
  // month — and worded that way, since "this month" now means the calendar
  // month everywhere else in the app.
  // The question every tracker exists to answer — am I actually improving? —
  // stated once, for whichever tracker moved most.
  {
    const m0 = now - 30 * D;
    const m1 = now - 60 * D;
    const inRange = <T extends { ts: number }>(xs: T[], a: number, b: number) => xs.filter((x) => x.ts >= a && x.ts < b);

    type Move = { label: string; delta: number; better: boolean; detail: string };
    const moves: Move[] = [];

    const wNow = inRange(s.workouts, m0, now).length;
    const wPrev = inRange(s.workouts, m1, m0).length;
    if (wPrev >= 3) moves.push({ label: t('Training'), delta: pct(wNow, wPrev), better: wNow >= wPrev, detail: t('{wNow} sessions vs {wPrev} in the 30 days before.', { wNow, wPrev }) });

    const sNow = avg(inRange(s.nights, m0, now).map((n) => n.hours));
    const sPrev = avg(inRange(s.nights, m1, m0).map((n) => n.hours));
    if (sPrev > 0 && inRange(s.nights, m1, m0).length >= 5)
      moves.push({ label: t('Sleep'), delta: pct(sNow, sPrev), better: sNow >= sPrev, detail: t('{time} a night vs {time2}.', { time: hm(sNow), time2: hm(sPrev) }) });

    const spNow = inRange(spendTxns, m0, now).filter((t) => isSpend(t)).reduce((a, t) => a - t.amount, 0);
    const spPrev = inRange(spendTxns, m1, m0).filter((t) => isSpend(t)).reduce((a, t) => a - t.amount, 0);
    if (spPrev > 0) moves.push({ label: t('Spending'), delta: pct(spNow, spPrev), better: spNow <= spPrev, detail: t('{amount} vs {amount2}.', { amount: money(spNow), amount2: money(spPrev) }) });

    const biggest = moves.filter((m) => Math.abs(m.delta) >= 15).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    if (biggest) {
      out.push({
        id: 'momentum',
        icon: biggest.better ? 'trendUp' : 'alert',
        color: biggest.better ? 'success' : 'warning',
        kind: 'pattern',
        title: biggest.delta > 0 ? t('{label} is up {n}% over the last 30 days.', { label: biggest.label, n: Math.abs(biggest.delta) }) : t('{label} is down {n}% over the last 30 days.', { label: biggest.label, n: Math.abs(biggest.delta) }),
        detail: biggest.detail,
      });
    }
  }

  // Alerts and links first — they're the most actionable.
  const order = { alert: 0, link: 1, pattern: 2, record: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}

/** Rough "is there enough data yet" check, for the empty state. */
export function insightsReady(s: AppState): boolean {
  return s.workouts.length + s.nights.length + s.txns.length + s.checkins.length >= 12;
}
