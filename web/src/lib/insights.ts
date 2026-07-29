import type { GlyphName } from './appIcons';
import type { AppState } from '../types';
import { dayKey, money, hm } from './format';

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
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  const txnsByDay = byDay(s.txns);

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
              ? `You sleep ${diffMin} min more on days you train.`
              : `You sleep ${Math.abs(diffMin)} min less on days you train.`,
          detail: `${trained.length} nights after training vs ${rested.length} rest nights.`,
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
      const spend = (txnsByDay.get(nextDay) || []).filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);
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
              ? `You spend ${change}% more after a short night.`
              : `You spend ${Math.abs(change)}% less after a short night.`,
          detail: `${money(a)} vs ${money(b)} per day, across ${afterShort.length} short nights.`,
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
              ? `You complete ${change}% more habits on days you train.`
              : `Your habits dip ${Math.abs(change)}% on days you train.`,
          detail: `Across ${withW.length} training days and ${without.length} others.`,
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
          title: `${WD[worst.i]}s are your weak spot.`,
          detail: `${Math.round(best.r * 100)}% done on ${WD[best.i]}s vs ${Math.round(worst.r * 100)}% on ${WD[worst.i]}s.`,
        });
      }
    }
  }

  // ---- 5. Spending anomaly this week ----
  {
    const weekStart = now - 7 * D;
    const cat = new Map<string, number>();
    const prior = new Map<string, number[]>();
    s.txns
      .filter((t) => t.amount < 0)
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
          title: `${c} is ${(thisWeek / base).toFixed(1)}× your usual this week.`,
          detail: `${money(thisWeek)} vs a typical ${money(base)}.`,
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
        title: `Longest session: ${longest.dur} min.`,
        detail: `${longest.name} · ${new Date(longest.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      });
    }
    if (s.nights.length >= 3) {
      const best = s.nights.reduce((a, b) => (b.hours > a.hours ? b : a));
      out.push({
        id: 'pr-sleep',
        icon: 'moon' as GlyphName,
        color: 'blue',
        kind: 'record',
        title: `Best night: ${hm(best.hours)}.`,
        detail: new Date(best.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
          title: `Best habit week: ${bestWeek} check-ins.`,
          detail: 'Your highest weekly total in the last 12 weeks.',
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
          title: `You're ${hm(debt)} short on sleep this week.`,
          detail: `Against 8h a night across ${recent.length} logged nights.`,
        });
      } else if (debt <= -2) {
        out.push({
          id: 'sleep-surplus',
          icon: 'sparkle' as GlyphName,
          color: 'success',
          kind: 'pattern',
          title: `You're ${hm(-debt)} ahead on sleep this week.`,
          detail: `Against 8h a night across ${recent.length} logged nights.`,
        });
      }
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
